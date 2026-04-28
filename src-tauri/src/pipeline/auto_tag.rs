use super::{ClipboardItem, InterceptResult, Interceptor};
use once_cell::sync::Lazy;
use regex::Regex;

static CODE_HINTS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?m)(^\s*(fn|def|function|class|impl|let|const|var|import|from|public|private|use|pub)\s|=>|::\w|^\s*#include|\b(if|else|for|while|return|switch)\s*\(|;\s*$)",
    )
    .unwrap()
});

static COLOR_HEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$").unwrap());

static JSON_LIKE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"^\s*[\{\[][\s\S]*[\}\]]\s*$"#).unwrap());

pub struct AutoTagger;

impl Interceptor for AutoTagger {
    fn name(&self) -> &'static str {
        "auto_tagger"
    }

    fn intercept(&self, item: &mut ClipboardItem) -> InterceptResult {
        if item.content_type != "text" {
            if item.content_type == "image" {
                item.add_tag("Image");
            }
            return InterceptResult::Continue;
        }

        // 先读后写，避免 &mut/& 借用冲突
        let has_urls = item.metadata.contains_key("urls");
        let has_emails = item.metadata.contains_key("emails");
        let has_phones = item.metadata.contains_key("phones");

        let trimmed = item.content.trim();
        let is_color = COLOR_HEX.is_match(trimmed);
        let is_json = JSON_LIKE.is_match(trimmed)
            && serde_json::from_str::<serde_json::Value>(trimmed).is_ok();
        let is_code = CODE_HINTS.is_match(&item.content);

        if has_urls {
            item.add_tag("URL");
        }
        if has_emails {
            item.add_tag("Email");
        }
        if has_phones {
            item.add_tag("Phone");
        }
        if is_color {
            item.add_tag("Color");
        }
        if is_json {
            item.add_tag("JSON");
        }
        if is_code {
            item.add_tag("Code");
        }

        InterceptResult::Continue
    }
}
