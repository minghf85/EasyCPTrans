use super::{ClipboardItem, InterceptResult, Interceptor};
use once_cell::sync::Lazy;
use regex::Regex;

static EMAIL: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b").unwrap());

static URL: Lazy<Regex> = Lazy::new(|| Regex::new(r"https?://[^\s<>\)\]'`]+").unwrap());

static PHONE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?:\+?\d{1,3}[\s\-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s\-]?\d{3,4}[\s\-]?\d{3,5}")
        .unwrap()
});

pub struct RegexExtractor;

fn collect(re: &Regex, hay: &str) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for m in re.find_iter(hay) {
        let s = m.as_str().to_string();
        if seen.insert(s.clone()) {
            out.push(s);
        }
    }
    out
}

impl Interceptor for RegexExtractor {
    fn name(&self) -> &'static str {
        "regex_extractor"
    }

    fn intercept(&self, item: &mut ClipboardItem) -> InterceptResult {
        if item.content_type != "text" {
            return InterceptResult::Continue;
        }

        let emails = collect(&EMAIL, &item.content);
        if !emails.is_empty() {
            item.metadata.insert("emails".into(), emails);
        }

        let urls = collect(&URL, &item.content);
        if !urls.is_empty() {
            item.metadata.insert("urls".into(), urls);
        }

        let phones: Vec<String> = collect(&PHONE, &item.content)
            .into_iter()
            .filter(|s| s.chars().filter(|c| c.is_ascii_digit()).count() >= 7)
            .collect();
        if !phones.is_empty() {
            item.metadata.insert("phones".into(), phones);
        }

        InterceptResult::Continue
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn extract(content_type: &str, content: &str) -> ClipboardItem {
        let mut item = ClipboardItem::new(content_type, content);
        RegexExtractor.intercept(&mut item);
        item
    }

    #[test]
    fn collects_emails_once_each_in_first_seen_order() {
        let item = extract(
            "text",
            "write to dev@example.com, then ops@example.com, then dev@example.com again",
        );

        assert_eq!(
            item.metadata.get("emails").unwrap(),
            &vec!["dev@example.com".to_string(), "ops@example.com".to_string()]
        );
    }

    #[test]
    fn collects_urls() {
        let item = extract("text", "see https://example.com/a and http://b.test/x");

        assert_eq!(
            item.metadata.get("urls").unwrap(),
            &vec!["https://example.com/a".to_string(), "http://b.test/x".to_string()]
        );
    }

    #[test]
    fn collects_a_formatted_phone_number() {
        let item = extract("text", "reach me on 010-12345678 tomorrow");

        assert_eq!(
            item.metadata.get("phones").unwrap(),
            &vec!["010-12345678".to_string()]
        );
    }

    #[test]
    fn short_digit_runs_are_not_phone_numbers() {
        assert!(!extract("text", "order 12345 shipped").metadata.contains_key("phones"));
    }

    #[test]
    fn writes_no_key_when_nothing_was_found() {
        let item = extract("text", "just an ordinary sentence");

        assert!(item.metadata.is_empty());
    }

    #[test]
    fn leaves_non_text_content_alone() {
        // Image payloads are data URLs and file payloads are paths; running the
        // text patterns over them would only produce noise.
        let image = extract("image", "data:image/png;base64,aHR0cHM6Ly9leGFtcGxlLmNvbQ==");

        assert!(image.metadata.is_empty());
    }
}
