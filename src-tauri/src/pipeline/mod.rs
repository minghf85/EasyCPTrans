use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub mod auto_tag;
pub mod regex_extract;
pub mod security;

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
    Dropped { interceptor: &'static str, reason: String },
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
            .with(Box::new(regex_extract::RegexExtractor))
            .with(Box::new(auto_tag::AutoTagger))
    }
}
