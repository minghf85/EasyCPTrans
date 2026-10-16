use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub mod auto_tag;
pub mod regex_extract;
pub mod security;
pub mod tag_rules;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub content_type: String,
    pub content: String,
    #[serde(default)]
    pub source_app: Option<String>,
    #[serde(default)]
    pub metadata: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub tags: Vec<String>,
}

impl ClipboardItem {
    #[allow(dead_code)]
    pub fn new(content_type: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            content_type: content_type.into(),
            content: content.into(),
            source_app: None,
            metadata: HashMap::new(),
            tags: Vec::new(),
        }
    }

    pub fn add_tag(&mut self, tag: impl Into<String>) {
        let tag = tag.into();
        if !self.tags.iter().any(|t| t == &tag) {
            self.tags.push(tag);
        }
    }
}

pub enum InterceptResult {
    Continue,
    Stop(String),
}

pub trait Interceptor: Send + Sync {
    fn name(&self) -> &'static str;
    fn intercept(&self, item: &mut ClipboardItem) -> InterceptResult;
}

pub struct Pipeline {
    interceptors: Vec<Box<dyn Interceptor>>,
}

pub enum PipelineOutcome {
    Accepted(ClipboardItem),
    Dropped {
        interceptor: &'static str,
        reason: String,
    },
}

impl Pipeline {
    pub fn new() -> Self {
        Self {
            interceptors: Vec::new(),
        }
    }

    pub fn with(mut self, interceptor: Box<dyn Interceptor>) -> Self {
        self.interceptors.push(interceptor);
        self
    }

    pub fn run(&self, mut item: ClipboardItem) -> PipelineOutcome {
        for interceptor in &self.interceptors {
            match interceptor.intercept(&mut item) {
                InterceptResult::Continue => {}
                InterceptResult::Stop(reason) => {
                    return PipelineOutcome::Dropped {
                        interceptor: interceptor.name(),
                        reason,
                    };
                }
            }
        }
        PipelineOutcome::Accepted(item)
    }
}

impl Default for Pipeline {
    fn default() -> Self {
        Self::new()
            .with(Box::new(security::SecurityFilter::default()))
            .with(Box::new(auto_tag::AutoTagger))
            .with(Box::new(regex_extract::RegexExtractor))
    }
}

impl Pipeline {
    /// The default chain plus the config's user-defined regex tags. Rules run
    /// last so they can build on the tags and metadata the earlier stages added.
    pub fn with_tag_rules(rules: Vec<tag_rules::TagRule>) -> Self {
        let pipeline = Self::default();
        if rules.is_empty() {
            return pipeline;
        }
        pipeline.with(Box::new(tag_rules::TagRuleExtractor::new(rules)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    /// Records that it ran, so the tests can assert on stage order.
    struct Recorder {
        name: &'static str,
        log: Arc<Mutex<Vec<String>>>,
    }

    impl Interceptor for Recorder {
        fn name(&self) -> &'static str {
            self.name
        }

        fn intercept(&self, _item: &mut ClipboardItem) -> InterceptResult {
            self.log.lock().unwrap().push(self.name.to_string());
            InterceptResult::Continue
        }
    }

    struct Stopper;

    impl Interceptor for Stopper {
        fn name(&self) -> &'static str {
            "stopper"
        }

        fn intercept(&self, _item: &mut ClipboardItem) -> InterceptResult {
            InterceptResult::Stop("nope".into())
        }
    }

    fn expect_accepted(outcome: PipelineOutcome) -> ClipboardItem {
        match outcome {
            PipelineOutcome::Accepted(item) => item,
            PipelineOutcome::Dropped { interceptor, reason } => {
                panic!("expected Accepted, got Dropped by {interceptor}: {reason}")
            }
        }
    }

    #[test]
    fn empty_pipeline_passes_the_item_through_unchanged() {
        let mut item = ClipboardItem::new("text", "hello");
        item.tags.push("Existing".into());

        let out = expect_accepted(Pipeline::new().run(item));

        assert_eq!(out.content, "hello");
        assert_eq!(out.tags, vec!["Existing".to_string()]);
        assert!(out.metadata.is_empty());
    }

    #[test]
    fn stages_run_in_insertion_order() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let pipeline = Pipeline::new()
            .with(Box::new(Recorder { name: "first", log: log.clone() }))
            .with(Box::new(Recorder { name: "second", log: log.clone() }))
            .with(Box::new(Recorder { name: "third", log: log.clone() }));

        expect_accepted(pipeline.run(ClipboardItem::new("text", "hello")));

        assert_eq!(*log.lock().unwrap(), vec!["first", "second", "third"]);
    }

    #[test]
    fn a_stop_short_circuits_the_remaining_stages() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let pipeline = Pipeline::new()
            .with(Box::new(Recorder { name: "first", log: log.clone() }))
            .with(Box::new(Stopper))
            .with(Box::new(Recorder { name: "third", log: log.clone() }));

        match pipeline.run(ClipboardItem::new("text", "hello")) {
            PipelineOutcome::Dropped { interceptor, reason } => {
                assert_eq!(interceptor, "stopper");
                assert_eq!(reason, "nope");
            }
            PipelineOutcome::Accepted(_) => panic!("expected the pipeline to drop the item"),
        }

        assert_eq!(*log.lock().unwrap(), vec!["first"]);
    }

    #[test]
    fn add_tag_does_not_duplicate() {
        let mut item = ClipboardItem::new("text", "hello");
        item.add_tag("Text");
        item.add_tag("Text");

        assert_eq!(item.tags, vec!["Text".to_string()]);
    }

    #[test]
    fn the_default_chain_tags_and_enriches_a_text_item() {
        let item = ClipboardItem::new("text", "mail me at dev@example.com or see https://example.com");

        let out = expect_accepted(Pipeline::default().run(item));

        assert!(out.tags.contains(&"Text".to_string()));
        assert_eq!(out.metadata.get("emails").unwrap(), &vec!["dev@example.com".to_string()]);
        assert_eq!(out.metadata.get("urls").unwrap(), &vec!["https://example.com".to_string()]);
    }

    #[test]
    fn the_default_chain_drops_content_from_a_password_manager() {
        let mut item = ClipboardItem::new("text", "hunter2");
        item.source_app = Some("Vault - 1Password".into());

        match Pipeline::default().run(item) {
            PipelineOutcome::Dropped { interceptor, .. } => assert_eq!(interceptor, "security_filter"),
            PipelineOutcome::Accepted(_) => panic!("expected the item to be blocked"),
        }
    }

    #[test]
    fn with_tag_rules_without_rules_still_runs_the_default_chain() {
        let out = expect_accepted(
            Pipeline::with_tag_rules(Vec::new()).run(ClipboardItem::new("text", "hello")),
        );

        assert!(out.tags.contains(&"Text".to_string()));
    }

    #[test]
    fn with_tag_rules_appends_the_rules_last() {
        let rule = tag_rules::TagRule {
            name: "Order".into(),
            regex: regex::Regex::new(r"A-\d+").unwrap(),
            extract: true,
        };

        let out = expect_accepted(
            Pipeline::with_tag_rules(vec![rule]).run(ClipboardItem::new("text", "ref A-42")),
        );

        assert!(out.tags.contains(&"Text".to_string()));
        assert!(out.tags.contains(&"Order".to_string()));
        assert_eq!(out.metadata.get("tagMatch:Order").unwrap(), &vec!["A-42".to_string()]);
    }
}
