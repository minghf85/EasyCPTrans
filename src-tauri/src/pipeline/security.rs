use super::{ClipboardItem, InterceptResult, Interceptor};

pub struct SecurityFilter {
    blocked_apps: Vec<String>,
}

impl Default for SecurityFilter {
    fn default() -> Self {
        Self {
            blocked_apps: vec![
                "1Password".into(),
                "Bitwarden".into(),
                "KeePass".into(),
                "KeePassXC".into(),
                "LastPass".into(),
                "Dashlane".into(),
                "Enpass".into(),
            ],
        }
    }
}

impl Interceptor for SecurityFilter {
    fn name(&self) -> &'static str {
        "security_filter"
    }

    fn intercept(&self, item: &mut ClipboardItem) -> InterceptResult {
        if let Some(app) = &item.source_app {
            for blocked in &self.blocked_apps {
                if app.to_ascii_lowercase().contains(&blocked.to_ascii_lowercase()) {
                    return InterceptResult::Stop(format!("source app blocked: {}", blocked));
                }
            }
        }
        InterceptResult::Continue
    }
}
