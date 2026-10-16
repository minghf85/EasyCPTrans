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

#[cfg(test)]
mod tests {
    use super::*;

    fn tag_for(content_type: &str) -> Vec<String> {
        let mut item = ClipboardItem::new(content_type, "payload");
        AutoTagger.intercept(&mut item);
        item.tags
    }

    #[test]
    fn tags_each_known_content_type() {
        assert_eq!(tag_for("text"), vec!["Text".to_string()]);
        assert_eq!(tag_for("image"), vec!["Image".to_string()]);
        assert_eq!(tag_for("file"), vec!["File".to_string()]);
    }

    #[test]
    fn leaves_an_unknown_content_type_untagged() {
        assert!(tag_for("video").is_empty());
    }

    #[test]
    fn keeps_the_tags_already_on_the_item() {
        let mut item = ClipboardItem::new("text", "payload");
        item.add_tag("Work");

        AutoTagger.intercept(&mut item);
        AutoTagger.intercept(&mut item);

        assert_eq!(item.tags, vec!["Work".to_string(), "Text".to_string()]);
    }
}
