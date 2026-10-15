use super::{ClipboardItem, InterceptResult, Interceptor};
use crate::command_extract::extract_commands;

pub struct CommandExtractor;

impl Interceptor for CommandExtractor {
    fn name(&self) -> &'static str {
        "command_extractor"
    }

    fn intercept(&self, item: &mut ClipboardItem) -> InterceptResult {
        if item.content_type != "text" {
            return InterceptResult::Continue;
        }

        let commands = extract_commands(&item.content, item.source_app.as_deref());
        if !commands.is_empty() {
            item.metadata.insert("commands".into(), commands);
            item.add_tag("Command");
        }

        InterceptResult::Continue
    }
}
