//! User-defined regex tags.
//!
//! Each rule pairs a tag name with a pattern. When an incoming item's content
//! matches, the tag is awarded automatically; when the rule also asks for
//! extraction, every distinct match is recorded on the item so the card can
//! present them as a stack the user can drag out into separate cards.

use super::{ClipboardItem, InterceptResult, Interceptor};
use regex::Regex;

/// A compiled rule. Patterns that fail to compile are dropped before reaching
/// here — see `tag_rules_from_config` in `commands.rs`.
pub struct TagRule {
    pub name: String,
    pub regex: Regex,
    pub extract: bool,
}

/// Metadata key holding a rule's extracted matches: `tagMatch:<tag name>`.
pub const MATCH_KEY_PREFIX: &str = "tagMatch:";
/// Metadata key holding the match count before truncation:
/// `tagMatchTotal:<tag name>`.
pub const MATCH_TOTAL_KEY_PREFIX: &str = "tagMatchTotal:";

/// Cap on stored matches per rule, so a pathological pattern cannot bloat a row.
/// The true count is still reported through [`MATCH_TOTAL_KEY_PREFIX`].
pub const MAX_STORED_MATCHES: usize = 100;

pub struct TagRuleExtractor {
    rules: Vec<TagRule>,
}

impl TagRuleExtractor {
    pub fn new(rules: Vec<TagRule>) -> Self {
        Self { rules }
    }
}

/// The text a rule scans for this item, or `None` when there is none to scan.
///
/// A file item is scanned through its newline-joined path list, which makes a
/// pattern like `\.pdf$` tag a bundle of PDFs. An image has no text of its own —
/// only what OCR produced, if it has run — so that is what a rule sees; an image
/// that has not been recognized yet is skipped rather than faked with its data
/// URL.
pub fn scan_source(item: &ClipboardItem) -> Option<String> {
    let source = match item.content_type.as_str() {
        "text" | "file" => item.content.clone(),
        "image" => item
            .metadata
            .get("ocrText")
            .and_then(|values| values.first())
            .cloned()
            .unwrap_or_default(),
        _ => return None,
    };

    if source.is_empty() {
        return None;
    }
    Some(source)
}

/// Every distinct match of one rule, in first-seen order, plus the count before
/// the cap. Shared with the editor's live preview so what it shows is exactly
/// what the pipeline would store.
pub fn collect_matches(regex: &Regex, source: &str) -> (Vec<String>, usize) {
    let mut matches: Vec<String> = Vec::new();
    for found in regex.find_iter(source) {
        let value = found.as_str().trim();
        if value.is_empty() {
            continue;
        }
        if !matches.iter().any(|existing| existing == value) {
            matches.push(value.to_string());
        }
    }

    let total = matches.len();
    matches.truncate(MAX_STORED_MATCHES);
    (matches, total)
}

/// Applies every rule to `item`, adding tags and recording matches.
pub fn apply_tag_rules(item: &mut ClipboardItem, rules: &[TagRule]) {
    if rules.is_empty() {
        return;
    }

    let Some(source) = scan_source(item) else {
        return;
    };

    for rule in rules {
        let (matches, total) = collect_matches(&rule.regex, &source);
        if matches.is_empty() {
            continue;
        }

        item.add_tag(rule.name.clone());

        if rule.extract {
            item.metadata
                .insert(format!("{MATCH_KEY_PREFIX}{}", rule.name), matches);
            item.metadata.insert(
                format!("{MATCH_TOTAL_KEY_PREFIX}{}", rule.name),
                vec![total.to_string()],
            );
        }
    }
}

impl Interceptor for TagRuleExtractor {
    fn name(&self) -> &'static str {
        "tag_rule_extractor"
    }

    fn intercept(&self, item: &mut ClipboardItem) -> InterceptResult {
        apply_tag_rules(item, &self.rules);
        InterceptResult::Continue
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn rule(name: &str, pattern: &str, extract: bool) -> TagRule {
        TagRule {
            name: name.to_string(),
            regex: Regex::new(pattern).unwrap(),
            extract,
        }
    }

    fn item(content_type: &str, content: &str) -> ClipboardItem {
        ClipboardItem {
            content_type: content_type.to_string(),
            content: content.to_string(),
            source_app: None,
            metadata: HashMap::new(),
            tags: Vec::new(),
        }
    }

    #[test]
    fn tags_only_matching_items() {
        let rules = vec![rule("Link", r"https?://\S+", false)];

        let mut matching = item("text", "see https://example.com/a for details");
        apply_tag_rules(&mut matching, &rules);
        assert_eq!(matching.tags, vec!["Link"]);

        let mut plain = item("text", "no links here");
        apply_tag_rules(&mut plain, &rules);
        assert!(plain.tags.is_empty());
    }

    #[test]
    fn records_distinct_matches_in_first_seen_order() {
        let rules = vec![rule("Link", r"https?://\S+", true)];
        let mut target = item(
            "text",
            "https://b.example https://a.example https://b.example",
        );
        apply_tag_rules(&mut target, &rules);

        assert_eq!(
            target.metadata.get("tagMatch:Link").unwrap(),
            &vec![
                "https://b.example".to_string(),
                "https://a.example".to_string()
            ]
        );
    }

    #[test]
    fn extraction_is_skipped_when_the_rule_does_not_ask_for_it() {
        let rules = vec![rule("Link", r"https?://\S+", false)];
        let mut target = item("text", "https://example.com");
        apply_tag_rules(&mut target, &rules);

        assert_eq!(target.tags, vec!["Link"]);
        assert!(target.metadata.is_empty());
    }

    #[test]
    fn truncates_matches_but_reports_the_true_total() {
        let rules = vec![rule("Token", r"tok\d+", true)];
        let content = (0..150)
            .map(|index| format!("tok{index}"))
            .collect::<Vec<_>>()
            .join(" ");

        let mut target = item("text", &content);
        apply_tag_rules(&mut target, &rules);

        assert_eq!(
            target.metadata.get("tagMatch:Token").unwrap().len(),
            MAX_STORED_MATCHES
        );
        assert_eq!(
            target.metadata.get("tagMatchTotal:Token").unwrap(),
            &vec!["150".to_string()]
        );
    }

    #[test]
    fn file_items_are_scanned_through_their_path_list() {
        let rules = vec![rule("Doc", r"\.pdf\b", false)];
        let mut target = item("file", "C:\\a\\one.pdf\nC:\\b\\two.txt\nC:\\c\\three.pdf");
        apply_tag_rules(&mut target, &rules);

        assert_eq!(target.tags, vec!["Doc"]);
    }

    #[test]
    fn an_image_without_ocr_is_left_alone() {
        // The data URL is not text, and pretending it were would tag every image
        // whose base64 happened to contain a pattern.
        let rules = vec![rule("Link", r"https?://\S+", false)];
        let mut target = item("image", "data:image/png;base64,https://example.com");
        apply_tag_rules(&mut target, &rules);

        assert!(target.tags.is_empty());
    }

    #[test]
    fn an_image_is_scanned_through_its_ocr_text() {
        let rules = vec![rule("Order", r"A-\d+", true)];
        let mut target = item("image", "data:image/png;base64,AAAA");
        target
            .metadata
            .insert("ocrText".to_string(), vec!["invoice A-42".to_string()]);

        apply_tag_rules(&mut target, &rules);

        assert!(target.tags.contains(&"Order".to_string()));
        assert_eq!(
            target.metadata.get("tagMatch:Order").unwrap(),
            &vec!["A-42".to_string()]
        );
    }

    #[test]
    fn an_empty_ocr_result_is_not_scanned() {
        let rules = vec![rule("Order", r"A-\d+", false)];
        let mut target = item("image", "data:image/png;base64,AAAA");
        target
            .metadata
            .insert("ocrText".to_string(), vec![String::new()]);

        apply_tag_rules(&mut target, &rules);

        assert!(target.tags.is_empty());
    }

    #[test]
    fn no_rules_is_a_no_op() {
        let mut target = item("text", "https://example.com");
        apply_tag_rules(&mut target, &[]);
        assert!(target.tags.is_empty());
        assert!(target.metadata.is_empty());
    }
}
