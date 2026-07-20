use super::{ClipboardItem, InterceptResult, Interceptor};

pub struct AutoTagger;

impl Interceptor for AutoTagger {
    fn name(&self) -> &'static str {
        "auto_tagger"
    }

    fn intercept(&self, item: &mut ClipboardItem) -> InterceptResult {
        match item.content_type.as_str() {
            "text" => item.add_tag("Text"),
            "image" => item.add_tag("Image"),
            "file" => item.add_tag("File"),
            _ => {}
        }

        InterceptResult::Continue
    }
}
