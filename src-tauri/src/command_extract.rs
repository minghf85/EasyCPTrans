use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashSet;

static SHELL_OPERATORS: Lazy<Regex> = Lazy::new(|| Regex::new(r"[|<>;]&]|\$\(|`").unwrap());

static ENV_ASSIGNMENT: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\s*[A-Za-z_][A-Za-z0-9_]*\s*=").unwrap());

static LEADING_PROMPT: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(?:\$|#|>|%)\s+").unwrap());

static MULTISPACE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());

const COMMON_COMMANDS: &[&str] = &[
    "git", "npm", "yarn", "pnpm", "npx", "bun", "deno", "node", "cargo", "rustc", "go",
    "python", "python3", "pip", "pip3", "pytest", "docker", "kubectl", "helm", "terraform",
    "ansible", "vagrant", "make", "cmake", "gcc", "g++", "clang", "javac", "java", "mvn",
    "gradle", "dotnet", "ruby", "gem", "rake", "rails", "bundle", "php", "composer", "laravel",
    "ssh", "scp", "rsync", "curl", "wget", "ping", "traceroute", "netstat", "ipconfig",
    "ifconfig", "nslookup", "dig", "ls", "cd", "cat", "less", "more", "grep", "find", "awk",
    "sed", "sort", "uniq", "head", "tail", "tar", "zip", "unzip", "chmod", "chown", "ps",
    "top", "htop", "kill", "pkill", "systemctl", "service", "crontab", "echo", "printf",
    "touch", "mkdir", "rmdir", "rm", "cp", "mv", "export", "source", "alias", "unset", "set",
    "env", "path",
];

fn looks_like_command(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.len() < 3 || trimmed.len() > 800 {
        return false;
    }

    let without_prompt = LEADING_PROMPT.replace(trimmed, "").into_owned();
    if without_prompt.is_empty() {
        return false;
    }

    let first_token = without_prompt
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim_end_matches(':')
        .to_ascii_lowercase();

    if COMMON_COMMANDS.contains(&first_token.as_str()) {
        return true;
    }

    if SHELL_OPERATORS.is_match(&without_prompt) {
        return true;
    }

    if ENV_ASSIGNMENT.is_match(&without_prompt) {
        return true;
    }

    false
}

fn normalize_command(value: &str) -> String {
    let trimmed = value.trim();
    let without_prompt = LEADING_PROMPT.replace(trimmed, "").into_owned();
    MULTISPACE
        .replace_all(without_prompt.trim(), " ")
        .into_owned()
}

pub fn extract_commands(text: &str, _source_app: Option<&str>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();

    for line in text.lines() {
        if !looks_like_command(line) {
            continue;
        }
        let normalized = normalize_command(line);
        if normalized.len() < 3 {
            continue;
        }
        if seen.insert(normalized.clone()) {
            out.push(normalized);
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_common_commands() {
        let text = "git status\nnpm install\ndocker ps\n$ ls -la";
        let cmds = extract_commands(text, None);
        assert_eq!(cmds.len(), 4);
        assert!(cmds.iter().any(|c| c.contains("git status")));
        assert!(cmds.iter().any(|c| c.contains("ls -la")));
    }

    #[test]
    fn detects_pipes_and_env() {
        let text = "cat file.txt | grep foo\nexport PATH=/usr/bin\n";
        let cmds = extract_commands(text, None);
        assert_eq!(cmds.len(), 2);
    }

    #[test]
    fn ignores_plain_text() {
        let text = "hello world\nthis is just a sentence\n";
        let cmds = extract_commands(text, None);
        assert!(cmds.is_empty());
    }
}
