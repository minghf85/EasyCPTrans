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
