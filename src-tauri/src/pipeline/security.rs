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
                if app
                    .to_ascii_lowercase()
                    .contains(&blocked.to_ascii_lowercase())
                {
                    return InterceptResult::Stop(format!("source app blocked: {}", blocked));
                }
            }
        }
        InterceptResult::Continue
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(source_app: Option<&str>) -> InterceptResult {
        let mut item = ClipboardItem::new("text", "hunter2");
        item.source_app = source_app.map(|app| app.to_string());
        SecurityFilter::default().intercept(&mut item)
    }

    fn is_blocked(source_app: &str) -> bool {
        matches!(run(Some(source_app)), InterceptResult::Stop(_))
    }

    #[test]
    fn blocks_the_password_managers_on_the_list() {
        // The guard is the first thing a secret has to get past, so the match
        // must not depend on the exact window title or casing.
        assert!(is_blocked("1Password"));
        assert!(is_blocked("vault - 1PASSWORD"));
        assert!(is_blocked("KeePassXC"));
        assert!(is_blocked("Bitwarden — Unlock"));
    }

    #[test]
    fn allows_an_ordinary_source_app() {
        assert!(!is_blocked("notes.txt - Notepad"));
        assert!(!is_blocked("Google Chrome"));
    }

    #[test]
    fn allows_an_item_with_no_source_app() {
        assert!(matches!(run(None), InterceptResult::Continue));
    }
}
