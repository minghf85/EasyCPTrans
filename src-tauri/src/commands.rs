use crate::db::{compute_hash, AppState};
use crate::pipeline::{ClipboardItem, Pipeline, PipelineOutcome};
use crate::privacy::{
    decrypt_content, encrypt_content, has_password, has_security_question, load_privacy_config,
    save_privacy_config, set_password, PrivacyStatus,
};
use base64::Engine;
use serde::{Deserialize, Deserializer, Serialize};
use sqlx::Row;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, State};

const PRIVATE_TAG: &str = "Private";
const PINNED_TAG: &str = "Pinned";
static ECDICT_CSV_CACHE: once_cell::sync::Lazy<
    std::sync::Mutex<HashMap<PathBuf, HashMap<String, DictionaryEntry>>>,
> = once_cell::sync::Lazy::new(|| std::sync::Mutex::new(HashMap::new()));

fn is_privacy_tag(tag: &str) -> bool {
    let normalized = tag.trim().to_lowercase();
    normalized == "privacy" || normalized == "private"
}

fn remove_privacy_tags(tags: Vec<String>) -> Vec<String> {
    tags.into_iter().filter(|t| !is_privacy_tag(t)).collect()
}

fn normalize_functional_tags(tags: Vec<String>) -> Vec<String> {
    tags.into_iter()
        .map(|tag| {
            let normalized = tag.trim();
            if normalized.eq_ignore_ascii_case("text") {
                "Text".to_string()
            } else if normalized.eq_ignore_ascii_case("image") {
                "Image".to_string()
            } else if normalized.eq_ignore_ascii_case("file") {
                "File".to_string()
            } else if normalized.eq_ignore_ascii_case("word") {
                "Word".to_string()
            } else if is_privacy_tag(normalized) {
                PRIVATE_TAG.to_string()
            } else if normalized.eq_ignore_ascii_case("pinned") {
                PINNED_TAG.to_string()
            } else {
                normalized.to_string()
            }
        })
        .filter(|tag| !tag.is_empty())
        .collect()
}

fn normalize_device_name(value: &str) -> String {
    let cleaned = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned.is_empty() {
        default_device_name()
    } else {
        cleaned
    }
}

fn device_tag_name(device_name: &str) -> String {
    normalize_device_name(device_name)
}

fn attach_device_identity(
    metadata: &mut HashMap<String, Vec<String>>,
    tags: &mut Vec<String>,
    device_name: &str,
) {
    let normalized = normalize_device_name(device_name);
    let device_tag = device_tag_name(&normalized);
    metadata.insert("deviceName".to_string(), vec![normalized]);
    metadata.insert("deviceTag".to_string(), vec![device_tag.clone()]);
    *tags = merge_unique_tags(normalize_functional_tags(tags.clone()), vec![device_tag]);
}

fn parse_tags(raw: Option<String>) -> Vec<String> {
    raw.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn parse_metadata(raw: Option<String>) -> HashMap<String, Vec<String>> {
    raw.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn merge_unique_tags(existing: Vec<String>, incoming: Vec<String>) -> Vec<String> {
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    for tag in existing.into_iter().chain(incoming.into_iter()) {
        let cleaned = tag.trim();
        if cleaned.is_empty() {
            continue;
        }
        let key = cleaned.to_lowercase();
        if seen.insert(key) {
            result.push(cleaned.to_string());
        }
    }
    result
}

fn data_url_byte_len(value: &str) -> Option<usize> {
    let encoded = value.split_once(',')?.1.trim();
    if encoded.is_empty() {
        return Some(0);
    }
    let padding = if encoded.ends_with("==") {
        2
    } else if encoded.ends_with('=') {
        1
    } else {
        0
    };
    Some((encoded.len() * 3 / 4).saturating_sub(padding))
}

fn enrich_size_metadata(
    content_type: &str,
    content: &str,
    metadata: &mut HashMap<String, Vec<String>>,
) {
    if content_type == "file" {
        let sizes = content
            .lines()
            .map(|path| {
                std::fs::metadata(path.trim())
                    .map(|item| item.len())
                    .unwrap_or(0)
            })
            .collect::<Vec<_>>();
        if sizes.is_empty() {
            return;
        }
        let total = sizes.iter().sum::<u64>();
        let current_total = metadata
            .get("totalSize")
            .and_then(|values| values.first())
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);
        if current_total == 0 {
            metadata.insert(
                "sizes".to_string(),
                sizes.iter().map(|size| size.to_string()).collect(),
            );
            metadata.insert("totalSize".to_string(), vec![total.to_string()]);
        }
    } else if content_type == "image" {
        let current_size = metadata
            .get("size")
            .and_then(|values| values.first())
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(0);
        if current_size == 0 {
            if let Some(size) = data_url_byte_len(content) {
                metadata.insert("size".to_string(), vec![size.to_string()]);
            }
        }
    }
}

const DEFAULT_TAG_COLOR: &str = "#0f6cbd";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ManagedTagConfig {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub common: bool,
    #[serde(default = "default_tag_color")]
    pub color: String,
    #[serde(default)]
    pub system: bool,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ManagedTagConfigInput {
    Name(String),
    Full(ManagedTagConfig),
}

fn normalize_managed_tags(items: Vec<ManagedTagConfigInput>) -> Vec<ManagedTagConfig> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for item in items {
        let tag = match item {
            ManagedTagConfigInput::Name(name) => ManagedTagConfig {
                id: None,
                name,
                common: false,
                color: default_tag_color(),
                system: false,
            },
            ManagedTagConfigInput::Full(tag) => tag,
        };
        let cleaned = tag.name.trim();
        if cleaned.is_empty() {
            continue;
        }
        let key = tag.id.clone().unwrap_or_else(|| cleaned.to_lowercase());
        if seen.insert(key) {
            normalized.push(ManagedTagConfig {
                id: tag.id,
                name: cleaned.to_string(),
                common: tag.common,
                color: normalize_tag_color(&tag.color),
                system: tag.system,
            });
        }
    }
    normalized
}

fn default_tag_color() -> String {
    DEFAULT_TAG_COLOR.to_string()
}

fn normalize_tag_color(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.starts_with('#') && (trimmed.len() == 7 || trimmed.len() == 4) {
        return trimmed.to_string();
    }
    default_tag_color()
}

fn deserialize_managed_tags<'de, D>(deserializer: D) -> Result<Vec<ManagedTagConfig>, D::Error>
where
    D: Deserializer<'de>,
{
    let raw = Vec::<ManagedTagConfigInput>::deserialize(deserializer)?;
    Ok(normalize_managed_tags(raw))
}

fn normalize_app_config(mut config: AppConfig) -> AppConfig {
    if config
        .quick_paste_prefix
        .trim()
        .eq_ignore_ascii_case("Super+Shift")
    {
        config.quick_paste_prefix = default_quick_paste_prefix();
    }
    config
}

pub(crate) fn read_app_config<R: tauri::Runtime>(app: &AppHandle<R>) -> AppConfig {
    let conf_path = app.path().app_data_dir().unwrap().join("config.json");
    if let Ok(data) = std::fs::read_to_string(&conf_path) {
        if let Ok(conf) = serde_json::from_str::<AppConfig>(&data) {
            return normalize_app_config(conf);
        }
    }
    normalize_app_config(AppConfig {
        cache_path: "".to_string(),
        shortcut: "CommandOrControl+Shift+V".to_string(),
        plain_paste_shortcut: default_plain_paste_shortcut(),
        queue_step_shortcut: default_queue_step_shortcut(),
        quick_paste_prefix: default_quick_paste_prefix(),
        stack_shortcut_prefix: default_stack_shortcut_prefix(),
        word_translate_shortcut: default_word_translate_shortcut(),
        item_tag_shortcut: default_item_tag_shortcut(),
        item_private_shortcut: default_item_private_shortcut(),
        item_pin_shortcut: default_item_pin_shortcut(),
        item_delete_shortcut: default_item_delete_shortcut(),
        ecdict_path: String::new(),
        auto_paste: true,
        keep_window_open: false,
        always_on_top: false,
        page_size: 50,
        history_limit: 5000,
        webdav_url: "".to_string(),
        webdav_username: "".to_string(),
        webdav_password: "".to_string(),
        webdav_sync_enabled: false,
        device_name: default_device_name(),
        managed_tags: Vec::new(),
        window_width: None,
        window_height: None,
        window_x: None,
        window_y: None,
    })
}

async fn emit_changed<R: tauri::Runtime>(app: &AppHandle<R>) {
    let _ = app.emit("clipboard-changed", ());
}

fn normalize_word_query(value: &str) -> Option<String> {
    let normalized = value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();
    if normalized.is_empty() || normalized.len() > 80 || normalized.lines().count() > 1 {
        return None;
    }
    if !normalized
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, ' ' | '-' | '\'' | '.'))
    {
        return None;
    }
    Some(normalized)
}

fn log_text_preview(value: &str) -> String {
    let normalized = value.replace('\r', "\\r").replace('\n', "\\n");
    let mut preview = normalized.chars().take(120).collect::<String>();
    if normalized.chars().count() > 120 {
        preview.push_str("...");
    }
    format!("len={}, preview=\"{}\"", value.len(), preview)
}

fn strip_word(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase()
}

fn default_ecdict_candidates<R: tauri::Runtime>(
    app: &AppHandle<R>,
    configured: &str,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let configured = configured.trim();
    if !configured.is_empty() {
        candidates.push(PathBuf::from(configured));
    }
    if let Ok(app_data) = app.path().app_data_dir() {
        candidates.push(app_data.join("dictionaries").join("ecdict.sqlite"));
        candidates.push(app_data.join("dictionaries").join("ecdict.db"));
        candidates.push(app_data.join("dictionaries").join("stardict.sqlite"));
        candidates.push(app_data.join("dictionaries").join("stardict.db"));
        candidates.push(app_data.join("dictionaries").join("stardict.db"));
        candidates.push(app_data.join("dictionaries").join("ecdict.csv"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("ECDICT").join("ecdict.db"));
        candidates.push(cwd.join("ECDICT").join("stardict").join("stardict.db"));
        candidates.push(cwd.join("ECDICT").join("stardict.db"));
        candidates.push(cwd.join("ECDICT").join("ecdict.csv"));
    }
    candidates
}

fn split_csv_line(line: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '"' {
            if in_quotes && chars.peek() == Some(&'"') {
                current.push('"');
                let _ = chars.next();
            } else {
                in_quotes = !in_quotes;
            }
        } else if ch == ',' && !in_quotes {
            result.push(current);
            current = String::new();
        } else {
            current.push(ch);
        }
    }
    result.push(current);
    result
}

#[derive(Debug, Clone)]
struct DictionaryEntry {
    word: String,
    phonetic: String,
    definition: String,
    translation: String,
    pos: String,
    collins: i64,
    oxford: i64,
    tags: String,
    bnc: i64,
    frq: i64,
    exchange: String,
    detail: String,
    audio: String,
}

impl DictionaryEntry {
    fn formatted(&self, query: &str) -> String {
        let mut parts = vec![format!("# {}", self.word)];
        if !self.phonetic.trim().is_empty() {
            parts.push(format!("\n🔊 /{}/", self.phonetic.trim()));
        }

        let mut badges = Vec::new();
        if self.collins > 0 {
            badges.push(format!("Collins {}★", self.collins));
        }
        if self.oxford > 0 {
            badges.push("Oxford 3000".to_string());
        }
        let normalized_tags = format_tags(&self.tags);
        if !normalized_tags.is_empty() {
            badges.push(normalized_tags);
        }
        if !badges.is_empty() {
            parts.push(format!("\n🏷 {}", badges.join(" · ")));
        }

        if !self.translation.trim().is_empty() {
            parts.push(format!(
                "\n## 中文释义\n{}",
                format_multiline_list(self.translation.trim())
            ));
        }
        if !self.definition.trim().is_empty() {
            parts.push(format!(
                "\n## English Definition\n{}",
                format_multiline_list(self.definition.trim())
            ));
        }

        if !self.pos.trim().is_empty() {
            parts.push(format!("\n## 词性分布\n{}", format_pos(&self.pos)));
        }

        let exchange = format_exchange(&self.exchange);
        if !exchange.is_empty() {
            parts.push(format!("\n## 词形变化\n{}", exchange));
        }

        let mut corpus = Vec::new();
        if self.bnc > 0 {
            corpus.push(format!("BNC rank: {}", self.bnc));
        }
        if self.frq > 0 {
            corpus.push(format!("COCA/FRQ rank: {}", self.frq));
        }
        if !corpus.is_empty() {
            parts.push(format!("\n## 语料词频\n{}", corpus.join("\n")));
        }

        if !self.detail.trim().is_empty() {
            parts.push(format!("\n## 扩展信息\n{}", self.detail.trim()));
        }
        if !self.audio.trim().is_empty() {
            parts.push(format!("\n## 音频\n{}", self.audio.trim()));
        }

        if self.pos.trim().is_empty()
            && self.tags.trim().is_empty()
            && self.exchange.trim().is_empty()
            && self.bnc <= 0
            && self.frq <= 0
        {
            let mut meta = Vec::new();
            meta.push("No extra ECDICT metadata available.".to_string());
            parts.push(format!("\n[meta]\n{}", meta.join("\n")));
        }

        parts.push(format!("\n---\nsource: ECDICT\nquery: {}", query));
        parts.join("\n")
    }
}

fn format_multiline_list(value: &str) -> String {
    value
        .replace("\\n", "\n")
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| format!("- {}", line))
        .collect::<Vec<_>>()
        .join("\n")
}

fn format_tags(value: &str) -> String {
    value
        .split_whitespace()
        .map(|tag| match tag {
            "zk" => "中考",
            "gk" => "高考",
            "cet4" => "CET-4",
            "cet6" => "CET-6",
            "ky" => "考研",
            "toefl" => "TOEFL",
            "ielts" => "IELTS",
            "gre" => "GRE",
            "tem4" => "TEM-4",
            "tem8" => "TEM-8",
            "sat" => "SAT",
            "bec" => "BEC",
            other => other,
        })
        .collect::<Vec<_>>()
        .join(" · ")
}

fn format_pos(value: &str) -> String {
    value
        .split('/')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut pieces = part.splitn(2, ':');
            let key = pieces.next().unwrap_or_default();
            let ratio = pieces.next().unwrap_or_default();
            let label = match key {
                "n" => "noun",
                "v" => "verb",
                "a" | "j" => "adjective",
                "r" => "adverb",
                "i" => "preposition",
                "c" => "conjunction",
                "u" => "interjection",
                "m" => "numeral",
                "q" => "quantifier",
                "p" => "pronoun",
                "d" => "determiner",
                other => other,
            };
            if ratio.is_empty() {
                format!("- {}", label)
            } else {
                format!("- {}: {}%", label, ratio)
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn format_exchange(value: &str) -> String {
    value
        .split('/')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .filter_map(|part| {
            let mut pieces = part.splitn(2, ':');
            let key = pieces.next()?.trim();
            let word = pieces.next()?.trim();
            if word.is_empty() {
                return None;
            }
            let label = match key {
                "p" => "past tense",
                "d" => "past participle",
                "i" => "present participle",
                "3" => "third-person singular",
                "r" => "comparative",
                "t" => "superlative",
                "s" => "plural",
                "0" => "lemma",
                "1" => "lemma variant",
                other => other,
            };
            Some(format!("- {}: {}", label, word))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn dictionary_entry_from_columns(columns: &[String]) -> Option<DictionaryEntry> {
    Some(DictionaryEntry {
        word: columns.first()?.trim().to_string(),
        phonetic: columns.get(1).cloned().unwrap_or_default(),
        definition: columns.get(2).cloned().unwrap_or_default(),
        translation: columns.get(3).cloned().unwrap_or_default(),
        pos: columns.get(4).cloned().unwrap_or_default(),
        collins: csv_field(columns, 5).parse::<i64>().unwrap_or(0),
        oxford: csv_field(columns, 6).parse::<i64>().unwrap_or(0),
        tags: columns.get(7).cloned().unwrap_or_default(),
        bnc: csv_field(columns, 8).parse::<i64>().unwrap_or(0),
        frq: csv_field(columns, 9).parse::<i64>().unwrap_or(0),
        exchange: columns.get(10).cloned().unwrap_or_default(),
        detail: columns.get(11).cloned().unwrap_or_default(),
        audio: columns.get(12).cloned().unwrap_or_default(),
    })
}

async fn lookup_ecdict_sqlite(path: &Path, query: &str) -> Result<Option<DictionaryEntry>, String> {
    println!(
        "[EasyCPTrans] ECDICT sqlite lookup start: path={}, query={}",
        path.display(),
        query
    );
    let started = std::time::Instant::now();
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(path)
        .read_only(true);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|err| err.to_string())?;
    let normalized = query.to_ascii_lowercase();
    let stripped = strip_word(query);
    let row = sqlx::query(
        "SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange, detail, audio
         FROM stardict
         WHERE lower(word) = ?1 OR sw = ?2
         ORDER BY CASE WHEN lower(word) = ?1 THEN 0 ELSE 1 END
         LIMIT 1",
    )
    .bind(&normalized)
    .bind(&stripped)
    .fetch_optional(&pool)
    .await
    .map_err(|err| err.to_string())?;

    let entry = row.map(|row| DictionaryEntry {
        word: row.try_get("word").unwrap_or_default(),
        phonetic: row.try_get("phonetic").unwrap_or_default(),
        definition: row.try_get("definition").unwrap_or_default(),
        translation: row.try_get("translation").unwrap_or_default(),
        pos: row.try_get("pos").unwrap_or_default(),
        collins: row.try_get("collins").unwrap_or_default(),
        oxford: row.try_get("oxford").unwrap_or_default(),
        tags: row.try_get("tag").unwrap_or_default(),
        bnc: row.try_get("bnc").unwrap_or_default(),
        frq: row.try_get("frq").unwrap_or_default(),
        exchange: row.try_get("exchange").unwrap_or_default(),
        detail: row.try_get("detail").unwrap_or_default(),
        audio: row.try_get("audio").unwrap_or_default(),
    });
    println!(
        "[EasyCPTrans] ECDICT sqlite lookup finish: path={}, query={}, hit={}, elapsed_ms={}",
        path.display(),
        query,
        entry
            .as_ref()
            .map(|entry| entry.word.as_str())
            .unwrap_or("<none>"),
        started.elapsed().as_millis()
    );
    Ok(entry)
}

fn lookup_ecdict_csv(path: &Path, query: &str) -> Result<Option<DictionaryEntry>, String> {
    println!(
        "[EasyCPTrans] ECDICT csv lookup start: path={}, query={}",
        path.display(),
        query
    );
    let started = std::time::Instant::now();
    if let Ok(mut cache) = ECDICT_CSV_CACHE.lock() {
        if !cache.contains_key(path) {
            println!(
                "[EasyCPTrans] ECDICT csv cache loading: path={}",
                path.display()
            );
            let data = std::fs::read_to_string(path).map_err(|err| err.to_string())?;
            let mut entries = HashMap::new();
            for (index, line) in data.lines().enumerate() {
                if index == 0 {
                    continue;
                }
                let columns = split_csv_line(line);
                let Some(entry) = dictionary_entry_from_columns(&columns) else {
                    continue;
                };
                entries.insert(entry.word.to_ascii_lowercase(), entry.clone());
                entries.entry(strip_word(&entry.word)).or_insert(entry);
            }
            cache.insert(path.to_path_buf(), entries);
        }
        if let Some(entries) = cache.get(path) {
            let normalized = query.trim().to_ascii_lowercase();
            let stripped = strip_word(query);
            let entry = entries
                .get(&normalized)
                .or_else(|| entries.get(&stripped))
                .cloned();
            println!(
                "[EasyCPTrans] ECDICT csv lookup finish: path={}, query={}, hit={}, elapsed_ms={}",
                path.display(),
                query,
                entry
                    .as_ref()
                    .map(|entry| entry.word.as_str())
                    .unwrap_or("<none>"),
                started.elapsed().as_millis()
            );
            return Ok(entry);
        }
    }

    let data = std::fs::read_to_string(path).map_err(|err| err.to_string())?;
    let normalized = query.trim().to_ascii_lowercase();
    let stripped = strip_word(query);
    let mut stripped_match = None;
    for (index, line) in data.lines().enumerate() {
        if index == 0 {
            continue;
        }
        let columns = split_csv_line(line);
        let Some(entry) = dictionary_entry_from_columns(&columns) else {
            continue;
        };
        let word = entry.word.to_ascii_lowercase();
        if word == normalized {
            println!(
                "[EasyCPTrans] ECDICT csv lookup finish: path={}, query={}, hit={}, elapsed_ms={}",
                path.display(),
                query,
                entry.word,
                started.elapsed().as_millis()
            );
            return Ok(Some(entry));
        }
        if stripped_match.is_none() && strip_word(&entry.word) == stripped {
            stripped_match = Some(entry);
        }
    }
    println!(
        "[EasyCPTrans] ECDICT csv lookup finish: path={}, query={}, hit={}, elapsed_ms={}",
        path.display(),
        query,
        stripped_match
            .as_ref()
            .map(|entry| entry.word.as_str())
            .unwrap_or("<none>"),
        started.elapsed().as_millis()
    );
    Ok(stripped_match)
}

fn csv_field<'a>(columns: &'a [String], index: usize) -> &'a str {
    columns.get(index).map(|value| value.as_str()).unwrap_or("")
}

#[tauri::command]
pub async fn convert_ecdict_csv_to_sqlite(
    csv_path: String,
    db_path: String,
) -> Result<u64, String> {
    let csv_path = PathBuf::from(csv_path);
    let db_path = PathBuf::from(db_path);
    if !csv_path.exists() {
        return Err(format!("CSV not found: {}", csv_path.display()));
    }
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|err| err.to_string())?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS stardict (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL,
            sw TEXT,
            phonetic TEXT,
            definition TEXT,
            translation TEXT,
            pos TEXT,
            collins INTEGER DEFAULT 0,
            oxford INTEGER DEFAULT 0,
            tag TEXT,
            bnc INTEGER DEFAULT 0,
            frq INTEGER DEFAULT 0,
            exchange TEXT,
            detail TEXT,
            audio TEXT
        )",
    )
    .execute(&pool)
    .await
    .map_err(|err| err.to_string())?;
    sqlx::query("DELETE FROM stardict")
        .execute(&pool)
        .await
        .map_err(|err| err.to_string())?;

    let mut tx = pool.begin().await.map_err(|err| err.to_string())?;
    let mut count = 0_u64;
    let reader =
        std::io::BufReader::new(std::fs::File::open(&csv_path).map_err(|err| err.to_string())?);
    for (index, line) in std::io::BufRead::lines(reader).enumerate() {
        let line = line.map_err(|err| err.to_string())?;
        if index == 0 || line.trim().is_empty() {
            continue;
        }
        let columns = split_csv_line(&line);
        let word = csv_field(&columns, 0).trim();
        if word.is_empty() {
            continue;
        }
        sqlx::query(
            "INSERT INTO stardict
                (word, sw, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange, detail, audio)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        )
        .bind(word)
        .bind(strip_word(word))
        .bind(csv_field(&columns, 1))
        .bind(csv_field(&columns, 2))
        .bind(csv_field(&columns, 3))
        .bind(csv_field(&columns, 4))
        .bind(csv_field(&columns, 5).parse::<i64>().unwrap_or(0))
        .bind(csv_field(&columns, 6).parse::<i64>().unwrap_or(0))
        .bind(csv_field(&columns, 7))
        .bind(csv_field(&columns, 8).parse::<i64>().unwrap_or(0))
        .bind(csv_field(&columns, 9).parse::<i64>().unwrap_or(0))
        .bind(csv_field(&columns, 10))
        .bind(csv_field(&columns, 11))
        .bind(csv_field(&columns, 12))
        .execute(&mut *tx)
        .await
        .map_err(|err| err.to_string())?;
        count += 1;
    }
    tx.commit().await.map_err(|err| err.to_string())?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_stardict_word ON stardict(word)")
        .execute(&pool)
        .await
        .map_err(|err| err.to_string())?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_stardict_sw ON stardict(sw)")
        .execute(&pool)
        .await
        .map_err(|err| err.to_string())?;
    Ok(count)
}

async fn lookup_ecdict<R: tauri::Runtime>(
    app: &AppHandle<R>,
    query: &str,
) -> Result<Option<DictionaryEntry>, String> {
    let config = read_app_config(app);
    println!(
        "[EasyCPTrans] ECDICT lookup config: configured_path=\"{}\"",
        config.ecdict_path
    );
    let mut last_error = None;
    let candidates = default_ecdict_candidates(app, &config.ecdict_path);
    for path in candidates {
        println!(
            "[EasyCPTrans] ECDICT candidate: path={}, exists={}",
            path.display(),
            path.exists()
        );
        if !path.exists() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let result = if ext == "csv" {
            lookup_ecdict_csv(&path, query)
        } else {
            lookup_ecdict_sqlite(&path, query).await
        };
        match result {
            Ok(Some(entry)) => return Ok(Some(entry)),
            Ok(None) => {
                println!(
                    "[EasyCPTrans] ECDICT candidate miss: path={}, query={}",
                    path.display(),
                    query
                );
            }
            Err(err) => {
                println!(
                    "[EasyCPTrans] ECDICT candidate error: path={}, error={}",
                    path.display(),
                    err
                );
                last_error = Some(format!("{}: {}", path.display(), err));
            }
        }
    }
    if let Some(err) = last_error {
        return Err(err);
    }
    Ok(None)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestPayload {
    pub content_type: String,
    pub content: String,
    #[serde(default)]
    pub source_app: Option<String>,
    #[serde(default)]
    pub metadata: HashMap<String, Vec<String>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IngestResult {
    pub accepted: bool,
    pub item_id: Option<i64>,
    pub deduped: bool,
    pub tags: Vec<String>,
    pub metadata: HashMap<String, Vec<String>>,
    pub dropped_by: Option<String>,
    pub reason: Option<String>,
}

#[tauri::command]
pub async fn ingest_clipboard(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: IngestPayload,
) -> Result<IngestResult, String> {
    println!(
        "[EasyCPTrans] Ingest start: type={}, content={}, metadata_keys={:?}, source_app={:?}",
        payload.content_type,
        log_text_preview(&payload.content),
        payload.metadata.keys().collect::<Vec<_>>(),
        payload.source_app
    );
    let mut metadata = payload.metadata;
    if let Some(app_name) = payload.source_app {
        if !app_name.is_empty() {
            metadata.insert("sourceApp".to_string(), vec![app_name]);
        }
    }
    let app_config = read_app_config(&app);
    let device_name = normalize_device_name(&app_config.device_name);

    let raw = ClipboardItem {
        content_type: payload.content_type,
        content: payload.content,
        source_app: None,
        metadata,
        tags: Vec::new(),
    };
    let mut processed = match Pipeline::default().run(raw) {
        PipelineOutcome::Accepted(item) => item,
        PipelineOutcome::Dropped {
            interceptor,
            reason,
        } => {
            println!(
                "[EasyCPTrans] Ingest dropped by pipeline: interceptor={}, reason={}",
                interceptor, reason
            );
            return Ok(IngestResult {
                accepted: false,
                item_id: None,
                deduped: false,
                tags: Vec::new(),
                metadata: HashMap::new(),
                dropped_by: Some(interceptor.to_string()),
                reason: Some(reason),
            });
        }
    };
    attach_device_identity(&mut processed.metadata, &mut processed.tags, &device_name);
    println!(
        "[EasyCPTrans] Ingest pipeline accepted: type={}, content={}, tags={:?}, metadata_keys={:?}",
        processed.content_type,
        log_text_preview(&processed.content),
        processed.tags,
        processed.metadata.keys().collect::<Vec<_>>()
    );

    let pool = &state.pool;
    let hash = compute_hash(&processed.content_type, &processed.content);
    println!(
        "[EasyCPTrans] Ingest hash computed: type={}, hash={}",
        processed.content_type, hash
    );

    let existing = sqlx::query(
        "SELECT id, tags FROM clipboard_items WHERE content_hash = ?1 AND (is_private IS NULL OR is_private = 0) LIMIT 1",
    )
    .bind(&hash)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(ref row) = existing {
        let existing_tags = parse_tags(row.try_get("tags").ok());
        processed.tags = merge_unique_tags(existing_tags, processed.tags.clone());
    }

    let metadata_json = serde_json::to_string(&processed.metadata).unwrap_or_else(|_| "{}".into());
    let tags_json = serde_json::to_string(&processed.tags).unwrap_or_else(|_| "[]".into());

    let (item_id, deduped) = if let Some(row) = existing {
        let id: i64 = row.get("id");
        println!("[EasyCPTrans] Ingest dedupe update: existing_id={}", id);
        sqlx::query(
            "UPDATE clipboard_items
             SET last_used_at = CURRENT_TIMESTAMP,
                 use_count    = use_count + 1,
                 metadata     = COALESCE(NULLIF(metadata, ''), ?1),
                 tags         = ?2
             WHERE id = ?3",
        )
        .bind(&metadata_json)
        .bind(&tags_json)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        (id, true)
    } else {
        let (preview, storage) = if processed.content_type == "text" {
            (Some(processed.content.as_str()), None)
        } else {
            (None, Some(processed.content.as_str()))
        };
        let new_id = sqlx::query(
            "INSERT INTO clipboard_items
                (content_type, content_hash, preview_text, storage_path, tags, metadata, use_count, last_used_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, CURRENT_TIMESTAMP)",
        )
        .bind(&processed.content_type)
        .bind(&hash)
        .bind(preview)
        .bind(storage)
        .bind(&tags_json)
        .bind(&metadata_json)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?
        .last_insert_rowid();
        println!(
            "[EasyCPTrans] Ingest inserted new item: id={}, type={}",
            new_id, processed.content_type
        );
        (new_id, false)
    };

    emit_changed(&app).await;
    println!(
        "[EasyCPTrans] Ingest finish: accepted=true, id={}, deduped={}",
        item_id, deduped
    );

    Ok(IngestResult {
        accepted: true,
        item_id: Some(item_id),
        deduped,
        tags: processed.tags,
        metadata: processed.metadata,
        dropped_by: None,
        reason: None,
    })
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: i64,
    pub content_type: String,
    pub content: String,
    pub created_at: Option<String>,
    pub last_used_at: Option<String>,
    pub use_count: i64,
    pub pinned: bool,
    pub is_private: bool,
    pub tags: Vec<String>,
    pub metadata: HashMap<String, Vec<String>>,
}

#[tauri::command]
pub async fn load_history(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<HistoryItem>, String> {
    let limit = limit.unwrap_or(5000).clamp(1, 10000);
    let rows = sqlx::query(
        "SELECT id, content_type, preview_text, storage_path, created_at, last_used_at,
                use_count, is_pinned, is_private, tags, metadata
         FROM clipboard_items
         ORDER BY is_pinned DESC, last_used_at DESC, id DESC
         LIMIT ?1",
    )
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let items = rows
        .into_iter()
        .map(|row| {
            let content_type: String = row.get("content_type");
            let preview: Option<String> = row.try_get("preview_text").ok();
            let storage: Option<String> = row.try_get("storage_path").ok();
            let is_private = row.try_get::<i64, _>("is_private").unwrap_or(0) != 0;
            let mut tags = normalize_functional_tags(parse_tags(row.try_get("tags").ok()));
            let type_tag = match content_type.as_str() {
                "text" => Some("Text".to_string()),
                "image" => Some("Image".to_string()),
                "file" => Some("File".to_string()),
                _ => None,
            };
            if let Some(tag) = type_tag {
                tags = merge_unique_tags(tags, vec![tag]);
            }
            if !is_private {
                tags = remove_privacy_tags(tags);
            }
            if row.try_get::<i64, _>("is_pinned").unwrap_or(0) != 0 {
                tags = merge_unique_tags(tags, vec![PINNED_TAG.to_string()]);
            }

            let content = if is_private {
                match content_type.as_str() {
                    "image" => "".to_string(),
                    "file" => "[宸插姞瀵嗘枃浠禲".to_string(),
                    _ => "[宸插姞瀵嗘枃鏈琞".to_string(),
                }
            } else if content_type == "text" {
                preview.unwrap_or_default()
            } else {
                storage.unwrap_or_default()
            };

            let mut metadata = parse_metadata(row.try_get("metadata").ok());
            if is_private {
                metadata.retain(|key, _| key == "deviceName" || key == "deviceTag");
            }
            if !is_private {
                enrich_size_metadata(&content_type, &content, &mut metadata);
            }

            HistoryItem {
                id: row.get("id"),
                content_type,
                content,
                created_at: row.try_get("created_at").ok(),
                last_used_at: row.try_get("last_used_at").ok(),
                use_count: row.try_get("use_count").unwrap_or(0),
                pinned: row.try_get::<i64, _>("is_pinned").unwrap_or(0) != 0,
                is_private,
                tags,
                metadata,
            }
        })
        .collect();
    Ok(items)
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TextItemDetail {
    pub id: i64,
    pub content: String,
}

#[tauri::command]
pub async fn get_text_item(state: State<'_, AppState>, id: i64) -> Result<TextItemDetail, String> {
    let row = sqlx::query(
        "SELECT id, preview_text, is_private
         FROM clipboard_items
         WHERE id = ?1 AND content_type = 'text'
         LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("text item {} not found", id))?;

    if row.try_get::<i64, _>("is_private").unwrap_or(0) != 0 {
        return Err("璇ユ潯鐩凡鍔犲瘑锛岃鍏堥€氳繃闅愮瀵嗙爜瑙ｉ攣".to_string());
    }

    Ok(TextItemDetail {
        id: row.get("id"),
        content: row.try_get("preview_text").unwrap_or_default(),
    })
}

#[tauri::command]
pub async fn get_privacy_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<PrivacyStatus, String> {
    let cfg = load_privacy_config(&app)?;
    let private_items: i64 =
        sqlx::query_scalar("SELECT COUNT(1) FROM clipboard_items WHERE is_private = 1")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);

    Ok(PrivacyStatus {
        password_set: has_password(&cfg),
        private_items,
        security_question_set: has_security_question(&cfg),
        security_question: if has_security_question(&cfg) {
            Some(cfg.security_question.clone())
        } else {
            None
        },
    })
}

#[tauri::command]
pub async fn set_privacy_password(
    app: AppHandle,
    state: State<'_, AppState>,
    current_password: Option<String>,
    new_password: String,
    security_question: String,
    security_answer: String,
) -> Result<(), String> {
    let old_cfg = load_privacy_config(&app)?;
    let mut new_cfg = old_cfg.clone();
    let private_rows = sqlx::query(
        "SELECT id, encrypted_content
         FROM clipboard_items
         WHERE is_private = 1
           AND encrypted_content IS NOT NULL
           AND encrypted_content <> ''",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    let need_reencrypt = has_password(&old_cfg) && !private_rows.is_empty();

    set_password(
        &mut new_cfg,
        current_password.as_deref(),
        &new_password,
        &security_question,
        &security_answer,
    )?;

    if !need_reencrypt {
        return save_privacy_config(&app, &new_cfg);
    }

    let current = current_password
        .as_deref()
        .ok_or_else(|| "Current privacy password is required.".to_string())?;

    let mut tx = state.pool.begin().await.map_err(|e| e.to_string())?;
    for row in private_rows {
        let id: i64 = row.get("id");
        let encrypted: String = row
            .try_get("encrypted_content")
            .map_err(|e| e.to_string())?;

        let plain = decrypt_content(&old_cfg, current, &encrypted)?;
        let reencrypted = encrypt_content(&new_cfg, &plain)?;

        sqlx::query(
            "UPDATE clipboard_items
             SET encrypted_content = ?1
             WHERE id = ?2 AND is_private = 1",
        )
        .bind(&reencrypted)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    save_privacy_config(&app, &new_cfg)?;

    if let Err(e) = tx.commit().await {
        let _ = save_privacy_config(&app, &old_cfg);
        return Err(format!(
            "Update privacy password failed, config rolled back: {}",
            e
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn protect_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    let cfg = load_privacy_config(&app)?;
    if !has_password(&cfg) || !has_security_question(&cfg) {
        return Err(
            "Configure privacy password and security question before enabling privacy.".to_string(),
        );
    }

    let row = sqlx::query(
        "SELECT content_type, preview_text, storage_path, tags, metadata, is_private
         FROM clipboard_items
         WHERE id = ?1
         LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("item {} not found", id))?;

    if row.try_get::<i64, _>("is_private").unwrap_or(0) != 0 {
        return Ok(());
    }

    let content_type: String = row.get("content_type");
    let plain = if content_type == "text" {
        row.try_get::<Option<String>, _>("preview_text")
            .ok()
            .flatten()
            .unwrap_or_default()
    } else {
        row.try_get::<Option<String>, _>("storage_path")
            .ok()
            .flatten()
            .unwrap_or_default()
    };

    if plain.is_empty() {
        return Err("Item content is empty and cannot be encrypted.".to_string());
    }

    let encrypted = encrypt_content(&cfg, &plain)?;
    let mut tags = normalize_functional_tags(parse_tags(row.try_get("tags").ok()));
    tags = merge_unique_tags(tags, vec![PRIVATE_TAG.to_string()]);
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".into());
    let existing_metadata = parse_metadata(row.try_get("metadata").ok());
    let kept_metadata = ["deviceName", "deviceTag"]
        .into_iter()
        .filter_map(|key| {
            existing_metadata
                .get(key)
                .map(|value| (key.to_string(), value.clone()))
        })
        .collect::<HashMap<_, _>>();
    let metadata_json = serde_json::to_string(&kept_metadata).unwrap_or_else(|_| "{}".into());

    sqlx::query(
        "UPDATE clipboard_items
         SET encrypted_content = ?1,
             is_private = 1,
             content_hash = NULL,
             preview_text = NULL,
             storage_path = NULL,
             metadata = ?3,
             tags = ?2
         WHERE id = ?4",
    )
    .bind(&encrypted)
    .bind(&tags_json)
    .bind(&metadata_json)
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    emit_changed(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn unprotect_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    password: String,
) -> Result<(), String> {
    let cfg = load_privacy_config(&app)?;

    let row = sqlx::query(
        "SELECT content_type, encrypted_content, tags, is_private
         FROM clipboard_items
         WHERE id = ?1
         LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("item {} not found", id))?;

    if row.try_get::<i64, _>("is_private").unwrap_or(0) == 0 {
        return Ok(());
    }

    let encrypted = row
        .try_get::<Option<String>, _>("encrypted_content")
        .ok()
        .flatten()
        .ok_or_else(|| "Private data is corrupted: missing ciphertext.".to_string())?;

    let plain = decrypt_content(&cfg, &password, &encrypted)?;
    let content_type: String = row.get("content_type");
    let hash = compute_hash(&content_type, &plain);

    let tags = remove_privacy_tags(normalize_functional_tags(parse_tags(
        row.try_get("tags").ok(),
    )));
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".into());

    let (preview, storage) = if content_type == "text" {
        (Some(plain.as_str()), None)
    } else {
        (None, Some(plain.as_str()))
    };

    sqlx::query(
        "UPDATE clipboard_items
         SET encrypted_content = NULL,
             is_private = 0,
             content_hash = ?1,
             preview_text = ?2,
             storage_path = ?3,
             tags = ?4
         WHERE id = ?5",
    )
    .bind(&hash)
    .bind(preview)
    .bind(storage)
    .bind(&tags_json)
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    emit_changed(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn toggle_pin(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    let row = sqlx::query("SELECT is_pinned, tags FROM clipboard_items WHERE id = ?1 LIMIT 1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("item {} not found", id))?;
    let next_pinned = row.get::<i64, _>("is_pinned") == 0;
    let mut tags = normalize_functional_tags(parse_tags(row.try_get("tags").ok()));
    tags.retain(|tag| !tag.eq_ignore_ascii_case(PINNED_TAG));
    if next_pinned {
        tags.push(PINNED_TAG.to_string());
    }
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".into());

    sqlx::query(
        "UPDATE clipboard_items
         SET is_pinned = ?1,
             tags = ?2,
             last_used_at = CURRENT_TIMESTAMP
         WHERE id = ?3",
    )
    .bind(if next_pinned { 1 } else { 0 })
    .bind(tags_json)
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    emit_changed(&app).await;
    Ok(next_pinned)
}

#[tauri::command]
pub async fn delete_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    sqlx::query("DELETE FROM clipboard_items WHERE id = ?1")
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    emit_changed(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn set_tags(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    tags: Vec<String>,
) -> Result<Vec<String>, String> {
    let row = sqlx::query(
        "SELECT content_type, tags, metadata, is_private, is_pinned
         FROM clipboard_items
         WHERE id = ?1
         LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("item {} not found", id))?;

    let content_type: String = row.get("content_type");
    let is_private = row.try_get::<i64, _>("is_private").unwrap_or(0) != 0;
    let is_pinned = row.try_get::<i64, _>("is_pinned").unwrap_or(0) != 0;
    let metadata = parse_metadata(row.try_get("metadata").ok());

    let is_device_tag = |tag: &str| {
        metadata
            .get("deviceName")
            .map(|values| values.iter().any(|device| device.eq_ignore_ascii_case(tag)))
            .unwrap_or(false)
    };
    let is_functional_tag = |tag: &str| {
        tag.eq_ignore_ascii_case("Text")
            || tag.eq_ignore_ascii_case("Image")
            || tag.eq_ignore_ascii_case("File")
            || tag.eq_ignore_ascii_case("Word")
            || tag.eq_ignore_ascii_case(PRIVATE_TAG)
            || tag.eq_ignore_ascii_case(PINNED_TAG)
            || is_device_tag(tag)
    };

    let mut user_tags = normalize_functional_tags(tags);
    user_tags.retain(|tag| !is_functional_tag(tag));

    let current_functional_tags = normalize_functional_tags(parse_tags(row.try_get("tags").ok()))
        .into_iter()
        .filter(|tag| is_functional_tag(tag))
        .collect::<Vec<_>>();
    let type_tag = match content_type.as_str() {
        "text" => Some("Text".to_string()),
        "image" => Some("Image".to_string()),
        "file" => Some("File".to_string()),
        _ => None,
    };
    let required_tags = [
        type_tag,
        is_private.then(|| PRIVATE_TAG.to_string()),
        is_pinned.then(|| PINNED_TAG.to_string()),
        metadata
            .get("deviceName")
            .and_then(|values| values.first().cloned()),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>();
    let cleaned = merge_unique_tags(
        merge_unique_tags(user_tags, current_functional_tags),
        required_tags,
    );
    let json = serde_json::to_string(&cleaned).unwrap_or_else(|_| "[]".into());

    sqlx::query("UPDATE clipboard_items SET tags = ?1 WHERE id = ?2")
        .bind(&json)
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    emit_changed(&app).await;
    Ok(cleaned)
}

#[tauri::command]
pub async fn mark_used(app: AppHandle, state: State<'_, AppState>, id: i64) -> Result<(), String> {
    sqlx::query(
        "UPDATE clipboard_items
         SET use_count = use_count + 1,
             last_used_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
    )
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    emit_changed(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn update_text_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    content: String,
) -> Result<(), String> {
    let normalized = content.trim().to_string();
    if normalized.is_empty() {
        return Err("content cannot be empty".to_string());
    }

    let hash = compute_hash("text", &normalized);
    let metadata = serde_json::to_string(&HashMap::from([(
        "length".to_string(),
        vec![normalized.len().to_string()],
    )]))
    .unwrap_or_else(|_| "{}".into());
    let affected = sqlx::query(
        "UPDATE clipboard_items
         SET content_type = 'text',
             content_hash = ?1,
             preview_text = ?2,
             storage_path = NULL,
             encrypted_content = NULL,
             is_private = 0,
             metadata = ?3,
             last_used_at = CURRENT_TIMESTAMP
         WHERE id = ?4 AND (is_private IS NULL OR is_private = 0)",
    )
    .bind(&hash)
    .bind(&normalized)
    .bind(&metadata)
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .rows_affected();

    if affected == 0 {
        return Err(format!("item {} not found or is private", id));
    }

    emit_changed(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn create_stack_text_item(
    app: AppHandle,
    state: State<'_, AppState>,
    content: String,
) -> Result<i64, String> {
    let normalized = content.trim().to_string();
    if normalized.is_empty() {
        return Err("content cannot be empty".to_string());
    }

    let hash = compute_hash(
        "text",
        &format!(
            "stack:{}:{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default(),
            normalized
        ),
    );
    let mut metadata_map =
        HashMap::from([("length".to_string(), vec![normalized.len().to_string()])]);
    let mut tags = vec!["Text".to_string()];
    let app_config = read_app_config(&app);
    attach_device_identity(&mut metadata_map, &mut tags, &app_config.device_name);
    let metadata = serde_json::to_string(&metadata_map).unwrap_or_else(|_| "{}".into());
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".into());
    let id = sqlx::query(
        "INSERT INTO clipboard_items
            (content_type, content_hash, preview_text, storage_path, tags, metadata, use_count, last_used_at)
         VALUES ('text', ?1, ?2, NULL, ?3, ?4, 1, CURRENT_TIMESTAMP)",
    )
    .bind(&hash)
    .bind(&normalized)
    .bind(&tags_json)
    .bind(&metadata)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .last_insert_rowid();

    emit_changed(&app).await;
    Ok(id)
}

pub async fn create_translation_item(
    app: &AppHandle<impl tauri::Runtime>,
    state: &AppState,
    query: &str,
) -> Result<i64, String> {
    let pending_content = format!("正在翻译 \"{}\"", query);
    let mut metadata_map = HashMap::from([
        ("translationStatus".to_string(), vec!["pending".to_string()]),
        ("wordQuery".to_string(), vec![query.to_string()]),
        ("dictionary".to_string(), vec!["ECDICT".to_string()]),
        (
            "length".to_string(),
            vec![pending_content.len().to_string()],
        ),
    ]);
    let mut tags = vec!["Text".to_string(), "Word".to_string()];
    let app_config = read_app_config(app);
    attach_device_identity(&mut metadata_map, &mut tags, &app_config.device_name);
    let metadata = serde_json::to_string(&metadata_map).unwrap_or_else(|_| "{}".into());
    let tags = serde_json::to_string(&tags).unwrap_or_else(|_| "[\"Word\"]".into());
    let hash = compute_hash(
        "text",
        &format!(
            "word:{}:{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default(),
            query
        ),
    );
    let id = sqlx::query(
        "INSERT INTO clipboard_items
            (content_type, content_hash, preview_text, storage_path, tags, metadata, use_count, last_used_at)
         VALUES ('text', ?1, ?2, NULL, ?3, ?4, 1, CURRENT_TIMESTAMP)",
    )
    .bind(&hash)
    .bind(&pending_content)
    .bind(&tags)
    .bind(&metadata)
    .execute(&state.pool)
    .await
    .map_err(|err| err.to_string())?
    .last_insert_rowid();

    emit_changed(app).await;
    Ok(id)
}

pub async fn update_translation_item(
    app: &AppHandle<impl tauri::Runtime>,
    state: &AppState,
    id: i64,
    query: &str,
    content: &str,
    status: &str,
) -> Result<(), String> {
    let metadata = serde_json::to_string(&HashMap::from([
        ("translationStatus".to_string(), vec![status.to_string()]),
        ("wordQuery".to_string(), vec![query.to_string()]),
        ("dictionary".to_string(), vec!["ECDICT".to_string()]),
        ("length".to_string(), vec![content.len().to_string()]),
    ]))
    .unwrap_or_else(|_| "{}".into());
    let hash = compute_hash("text", content);
    sqlx::query(
        "UPDATE clipboard_items
         SET content_hash = ?1,
             preview_text = ?2,
             metadata = ?3,
             last_used_at = CURRENT_TIMESTAMP
         WHERE id = ?4 AND (is_private IS NULL OR is_private = 0)",
    )
    .bind(hash)
    .bind(content)
    .bind(metadata)
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(|err| err.to_string())?;
    emit_changed(app).await;
    Ok(())
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranslationStateEvent {
    active: bool,
    query: String,
    item_id: i64,
}

pub async fn translate_selected_text_impl<R: tauri::Runtime>(
    app: AppHandle<R>,
) -> Result<(), String> {
    println!("[EasyCPTrans] Translate selection start");
    let started = std::time::Instant::now();
    let before = tauri_plugin_clipboard_x::read_text()
        .await
        .unwrap_or_default();
    println!(
        "[EasyCPTrans] Translate clipboard before copy: {}",
        log_text_preview(&before)
    );
    std::thread::sleep(std::time::Duration::from_millis(60));
    crate::simulate_copy_impl();
    println!("[EasyCPTrans] Translate simulated Ctrl+C");
    let mut selected = before.clone();
    for attempt in 0..12 {
        std::thread::sleep(std::time::Duration::from_millis(45));
        let current = tauri_plugin_clipboard_x::read_text()
            .await
            .unwrap_or_default();
        println!(
            "[EasyCPTrans] Translate copy poll: attempt={}, changed={}, valid={}, {}",
            attempt + 1,
            current != before,
            normalize_word_query(&current).is_some(),
            log_text_preview(&current)
        );
        if current.trim().is_empty() {
            continue;
        }
        selected = current;
        if selected != before || normalize_word_query(&selected).is_some() {
            break;
        }
    }
    let query = normalize_word_query(&selected)
        .ok_or_else(|| "Only words or short phrases are supported.".to_string())?;
    println!(
        "[EasyCPTrans] Translate normalized query: query=\"{}\", selected={}",
        query,
        log_text_preview(&selected)
    );
    let state = app.state::<AppState>();
    let _ = app.emit(
        "eacptrans://translation-state",
        TranslationStateEvent {
            active: true,
            query: query.clone(),
            item_id: 0,
        },
    );
    let item_id = create_translation_item(&app, &state, &query).await?;
    println!(
        "[EasyCPTrans] Translate pending item created: id={}, query=\"{}\"",
        item_id, query
    );
    let _ = crate::show_main_window_near_cursor(&app);
    println!("[EasyCPTrans] Translate panel requested near cursor");

    let result = lookup_ecdict(&app, &query).await;
    let (content, status, should_write_clipboard) = match result {
        Ok(Some(entry)) => {
            println!(
                "[EasyCPTrans] Translate lookup hit: query=\"{}\", word=\"{}\", translation_len={}, definition_len={}",
                query,
                entry.word,
                entry.translation.len(),
                entry.definition.len()
            );
            (entry.formatted(&query), "done", true)
        }
        Ok(None) => {
            println!("[EasyCPTrans] Translate lookup miss: query=\"{}\"", query);
            (
                format!("No ECDICT result for: {}", query),
                "notFound",
                false,
            )
        }
        Err(err) => {
            println!(
                "[EasyCPTrans] Translate lookup error: query=\"{}\", error={}",
                query, err
            );
            (
                format!("ECDICT lookup failed for: {}\n\n{}", query, err),
                "error",
                false,
            )
        }
    };
    println!(
        "[EasyCPTrans] Translate content prepared: status={}, write_clipboard={}, {}",
        status,
        should_write_clipboard,
        log_text_preview(&content)
    );

    update_translation_item(&app, &state, item_id, &query, &content, status).await?;
    println!(
        "[EasyCPTrans] Translate item updated: id={}, status={}",
        item_id, status
    );
    if should_write_clipboard {
        tauri_plugin_clipboard_x::write_text(content)
            .await
            .map_err(|err| err.to_string())?;
        println!(
            "[EasyCPTrans] Translate clipboard updated with result: id={}",
            item_id
        );
    }
    let _ = app.emit(
        "eacptrans://translation-state",
        TranslationStateEvent {
            active: false,
            query,
            item_id,
        },
    );
    println!(
        "[EasyCPTrans] Translate selection finish: id={}, status={}, elapsed_ms={}",
        item_id,
        status,
        started.elapsed().as_millis()
    );
    Ok(())
}

#[tauri::command]
pub async fn translate_selected_text(app: AppHandle) -> Result<(), String> {
    translate_selected_text_impl(app).await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub path: String,
    pub size: u64,
}

#[tauri::command]
pub async fn read_clipboard_files() -> Result<Vec<FileMetadata>, String> {
    #[cfg(target_os = "windows")]
    {
        use clipboard_win::{formats, get_clipboard};
        if let Ok(files) = get_clipboard::<Vec<String>, _>(formats::FileList) {
            let res = files
                .into_iter()
                .map(|path| {
                    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    FileMetadata { path, size }
                })
                .collect();
            return Ok(res);
        }
    }
    Err("No files".to_string())
}

#[tauri::command]
pub async fn get_active_window() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
        unsafe {
            let hwnd = GetForegroundWindow();
            if !hwnd.is_invalid() {
                let mut buf = [0u16; 512];
                let len = GetWindowTextW(hwnd, &mut buf);
                if len > 0 {
                    return Ok(String::from_utf16_lossy(&buf[..len as usize]));
                }
            }
        }
    }
    Err("Not supported".to_string())
}

#[tauri::command]
pub async fn is_paste_shortcut_down() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            GetAsyncKeyState, VIRTUAL_KEY, VK_CONTROL, VK_LCONTROL, VK_RCONTROL, VK_V,
        };

        let is_down =
            |key: VIRTUAL_KEY| unsafe { (GetAsyncKeyState(key.0 as i32) as u16 & 0x8000) != 0 };
        return Ok(
            (is_down(VK_CONTROL) || is_down(VK_LCONTROL) || is_down(VK_RCONTROL)) && is_down(VK_V),
        );
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
pub async fn save_temp_image(app: AppHandle, data_url: String) -> Result<String, String> {
    let (header, encoded) = data_url
        .split_once(',')
        .map(|(header, value)| (header, value))
        .ok_or_else(|| "invalid data url".to_string())?;
    let extension = if header.contains("image/jpeg") {
        "jpg"
    } else if header.contains("image/gif") {
        "gif"
    } else if header.contains("image/bmp") {
        "bmp"
    } else if header.contains("image/webp") {
        "webp"
    } else {
        "png"
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| e.to_string())?;

    let temp_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("temp");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let filename = format!(
        "clipboard-{}.{}",
        chrono::Utc::now().timestamp_millis(),
        extension
    );
    let image_path = temp_dir.join(filename);
    let partial_path = image_path.with_extension(format!("{}.part", extension));
    std::fs::write(&partial_path, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&partial_path, &image_path).map_err(|e| e.to_string())?;

    Ok(image_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn read_image_as_data_url(path: String) -> Result<String, String> {
    let image_path = std::path::PathBuf::from(path);
    let mut last_error = String::new();
    let mut bytes = Vec::new();
    for attempt in 0..6 {
        match std::fs::read(&image_path) {
            Ok(value) if !value.is_empty() => {
                bytes = value;
                break;
            }
            Ok(_) => {
                last_error = "image file is empty".to_string();
            }
            Err(err) => {
                last_error = err.to_string();
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(35 * (attempt + 1)));
    }
    if bytes.is_empty() {
        return Err(last_error);
    }
    let mime = match image_path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("bmp") => "image/bmp",
        Some("webp") => "image/webp",
        _ => "image/png",
    };
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{};base64,{}", mime, encoded))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub cache_path: String,
    pub shortcut: String,
    #[serde(default = "default_plain_paste_shortcut")]
    pub plain_paste_shortcut: String,
    #[serde(default = "default_queue_step_shortcut")]
    pub queue_step_shortcut: String,
    #[serde(default = "default_quick_paste_prefix")]
    pub quick_paste_prefix: String,
    #[serde(default = "default_stack_shortcut_prefix")]
    pub stack_shortcut_prefix: String,
    #[serde(default = "default_word_translate_shortcut")]
    pub word_translate_shortcut: String,
    #[serde(default = "default_item_tag_shortcut")]
    pub item_tag_shortcut: String,
    #[serde(default = "default_item_private_shortcut")]
    pub item_private_shortcut: String,
    #[serde(default = "default_item_pin_shortcut")]
    pub item_pin_shortcut: String,
    #[serde(default = "default_item_delete_shortcut")]
    pub item_delete_shortcut: String,
    #[serde(default)]
    pub ecdict_path: String,
    #[serde(default = "default_auto_paste")]
    pub auto_paste: bool,
    #[serde(default = "default_keep_window_open")]
    pub keep_window_open: bool,
    #[serde(default = "default_bool_false")]
    pub always_on_top: bool,
    #[serde(default = "default_page_size")]
    pub page_size: u32,
    #[serde(default = "default_history_limit")]
    pub history_limit: u32,
    #[serde(default)]
    pub webdav_url: String,
    #[serde(default)]
    pub webdav_username: String,
    #[serde(default)]
    pub webdav_password: String,
    #[serde(default = "default_bool_false")]
    pub webdav_sync_enabled: bool,
    #[serde(default = "default_device_name")]
    pub device_name: String,
    #[serde(default, deserialize_with = "deserialize_managed_tags")]
    pub managed_tags: Vec<ManagedTagConfig>,
    #[serde(default)]
    pub window_width: Option<f64>,
    #[serde(default)]
    pub window_height: Option<f64>,
    #[serde(default)]
    pub window_x: Option<f64>,
    #[serde(default)]
    pub window_y: Option<f64>,
}

fn default_auto_paste() -> bool {
    true
}
fn default_plain_paste_shortcut() -> String {
    "Super+Alt+V".to_string()
}
fn default_queue_step_shortcut() -> String {
    "CommandOrControl+Alt+V".to_string()
}
fn default_quick_paste_prefix() -> String {
    "CommandOrControl+Shift".to_string()
}
fn default_stack_shortcut_prefix() -> String {
    "CommandOrControl+Alt".to_string()
}
fn default_word_translate_shortcut() -> String {
    "Alt+C".to_string()
}
fn default_item_tag_shortcut() -> String {
    "T".to_string()
}
fn default_item_private_shortcut() -> String {
    "M".to_string()
}
fn default_item_pin_shortcut() -> String {
    "P".to_string()
}
fn default_item_delete_shortcut() -> String {
    "Delete".to_string()
}
fn default_keep_window_open() -> bool {
    false
}
fn default_bool_false() -> bool {
    false
}
fn default_page_size() -> u32 {
    50
}
fn default_history_limit() -> u32 {
    5000
}
fn default_device_name() -> String {
    "This Device".to_string()
}

async fn sync_device_identity_rename<R: tauri::Runtime>(
    app: &AppHandle<R>,
    old_device_name: &str,
    new_device_name: &str,
    fill_missing: bool,
) -> Result<(), String> {
    let old_name = normalize_device_name(old_device_name);
    let new_name = normalize_device_name(new_device_name);
    let renaming = old_name != new_name;
    let old_tag = device_tag_name(&old_name);
    let new_tag = device_tag_name(&new_name);
    let state = app.state::<AppState>();
    let rows = sqlx::query("SELECT id, tags, metadata FROM clipboard_items")
        .fetch_all(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut changed_count = 0usize;
    for row in rows {
        let id: i64 = row.get("id");
        let mut tags = normalize_functional_tags(parse_tags(row.try_get("tags").ok()));
        let mut metadata = parse_metadata(row.try_get("metadata").ok());
        let has_device_metadata =
            metadata.contains_key("deviceName") || metadata.contains_key("deviceTag");
        let metadata_matches = renaming
            && metadata
                .get("deviceName")
                .map(|values| {
                    values
                        .iter()
                        .any(|value| normalize_device_name(value) == old_name)
                })
                .unwrap_or(false);
        let tag_matches = renaming && tags.iter().any(|tag| tag.eq_ignore_ascii_case(&old_tag));
        let missing_device_identity = fill_missing && !has_device_metadata;

        if !metadata_matches && !tag_matches && !missing_device_identity {
            continue;
        }

        if renaming {
            tags.retain(|tag| {
                !tag.eq_ignore_ascii_case(&old_tag)
                    && !tag.eq_ignore_ascii_case(&format!("Device{}", old_name))
            });
        }
        tags = merge_unique_tags(tags, vec![new_tag.clone()]);
        metadata.insert("deviceName".to_string(), vec![new_name.clone()]);
        metadata.insert("deviceTag".to_string(), vec![new_tag.clone()]);

        let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".into());
        let metadata_json = serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".into());
        sqlx::query("UPDATE clipboard_items SET tags = ?1, metadata = ?2 WHERE id = ?3")
            .bind(tags_json)
            .bind(metadata_json)
            .bind(id)
            .execute(&state.pool)
            .await
            .map_err(|e| e.to_string())?;
        changed_count += 1;
    }

    if changed_count > 0 {
        println!(
            "[EasyCPTrans] Device identity synced: old={}, new={}, updated_items={}",
            old_tag, new_tag, changed_count
        );
        emit_changed(app).await;
    }

    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigResponse {
    pub cache_path: String,
    pub shortcut: String,
    pub plain_paste_shortcut: String,
    pub queue_step_shortcut: String,
    pub quick_paste_prefix: String,
    pub stack_shortcut_prefix: String,
    pub word_translate_shortcut: String,
    pub item_tag_shortcut: String,
    pub item_private_shortcut: String,
    pub item_pin_shortcut: String,
    pub item_delete_shortcut: String,
    pub ecdict_path: String,
    pub default_dir: String,
    pub effective_dir: String,
    pub auto_paste: bool,
    pub keep_window_open: bool,
    pub always_on_top: bool,
    pub page_size: u32,
    pub history_limit: u32,
    pub webdav_url: String,
    pub webdav_username: String,
    pub webdav_password: String,
    pub webdav_sync_enabled: bool,
    pub device_name: String,
    pub managed_tags: Vec<ManagedTagConfig>,
    pub window_width: Option<f64>,
    pub window_height: Option<f64>,
    pub window_x: Option<f64>,
    pub window_y: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PartialAppConfig {
    pub cache_path: Option<String>,
    pub shortcut: Option<String>,
    pub plain_paste_shortcut: Option<String>,
    pub queue_step_shortcut: Option<String>,
    pub quick_paste_prefix: Option<String>,
    pub stack_shortcut_prefix: Option<String>,
    pub word_translate_shortcut: Option<String>,
    pub item_tag_shortcut: Option<String>,
    pub item_private_shortcut: Option<String>,
    pub item_pin_shortcut: Option<String>,
    pub item_delete_shortcut: Option<String>,
    pub ecdict_path: Option<String>,
    pub auto_paste: Option<bool>,
    pub keep_window_open: Option<bool>,
    pub always_on_top: Option<bool>,
    pub page_size: Option<u32>,
    pub history_limit: Option<u32>,
    pub webdav_url: Option<String>,
    pub webdav_username: Option<String>,
    pub webdav_password: Option<String>,
    pub webdav_sync_enabled: Option<bool>,
    pub device_name: Option<String>,
    pub managed_tags: Option<Vec<ManagedTagConfig>>,
    pub window_width: Option<f64>,
    pub window_height: Option<f64>,
    pub window_x: Option<f64>,
    pub window_y: Option<f64>,
}

#[tauri::command]
pub async fn get_config(app: AppHandle) -> Result<ConfigResponse, String> {
    let app_data = app.path().app_data_dir().unwrap();
    let conf = read_app_config(&app);

    let default_dir = app_data.to_string_lossy().to_string();
    let effective_dir = if conf.cache_path.is_empty() {
        default_dir.clone()
    } else {
        conf.cache_path.clone()
    };

    Ok(ConfigResponse {
        cache_path: conf.cache_path,
        shortcut: conf.shortcut,
        plain_paste_shortcut: conf.plain_paste_shortcut,
        queue_step_shortcut: conf.queue_step_shortcut,
        quick_paste_prefix: conf.quick_paste_prefix,
        stack_shortcut_prefix: conf.stack_shortcut_prefix,
        word_translate_shortcut: conf.word_translate_shortcut,
        item_tag_shortcut: conf.item_tag_shortcut,
        item_private_shortcut: conf.item_private_shortcut,
        item_pin_shortcut: conf.item_pin_shortcut,
        item_delete_shortcut: conf.item_delete_shortcut,
        ecdict_path: conf.ecdict_path,
        default_dir,
        effective_dir,
        auto_paste: conf.auto_paste,
        keep_window_open: conf.keep_window_open,
        always_on_top: conf.always_on_top,
        page_size: conf.page_size,
        history_limit: conf.history_limit,
        webdav_url: conf.webdav_url,
        webdav_username: conf.webdav_username,
        webdav_password: conf.webdav_password,
        webdav_sync_enabled: conf.webdav_sync_enabled,
        device_name: conf.device_name,
        managed_tags: conf.managed_tags,
        window_width: conf.window_width,
        window_height: conf.window_height,
        window_x: conf.window_x,
        window_y: conf.window_y,
    })
}

#[tauri::command]
pub async fn set_config(app: AppHandle, config: PartialAppConfig) -> Result<(), String> {
    let conf_path = app.path().app_data_dir().unwrap().join("config.json");
    let mut merged = read_app_config(&app);
    let old_device_name = merged.device_name.clone();

    if let Some(value) = config.cache_path {
        merged.cache_path = value;
    }
    if let Some(value) = config.shortcut {
        merged.shortcut = value;
    }
    if let Some(value) = config.plain_paste_shortcut {
        merged.plain_paste_shortcut = value;
    }
    if let Some(value) = config.queue_step_shortcut {
        merged.queue_step_shortcut = value;
    }
    if let Some(value) = config.quick_paste_prefix {
        merged.quick_paste_prefix = value;
    }
    if let Some(value) = config.stack_shortcut_prefix {
        merged.stack_shortcut_prefix = value;
    }
    if let Some(value) = config.word_translate_shortcut {
        merged.word_translate_shortcut = value;
    }
    if let Some(value) = config.item_tag_shortcut {
        merged.item_tag_shortcut = value;
    }
    if let Some(value) = config.item_private_shortcut {
        merged.item_private_shortcut = value;
    }
    if let Some(value) = config.item_pin_shortcut {
        merged.item_pin_shortcut = value;
    }
    if let Some(value) = config.item_delete_shortcut {
        merged.item_delete_shortcut = value;
    }
    if let Some(value) = config.ecdict_path {
        merged.ecdict_path = value;
    }
    if let Some(value) = config.auto_paste {
        merged.auto_paste = value;
    }
    if let Some(value) = config.keep_window_open {
        merged.keep_window_open = value;
    }
    if let Some(value) = config.always_on_top {
        merged.always_on_top = value;
    }
    if let Some(value) = config.page_size {
        merged.page_size = value;
    }
    if let Some(value) = config.history_limit {
        merged.history_limit = value;
    }
    if let Some(value) = config.webdav_url {
        merged.webdav_url = value;
    }
    if let Some(value) = config.webdav_username {
        merged.webdav_username = value;
    }
    if let Some(value) = config.webdav_password {
        merged.webdav_password = value;
    }
    if let Some(value) = config.webdav_sync_enabled {
        merged.webdav_sync_enabled = value;
    }
    if let Some(value) = config.device_name {
        merged.device_name = normalize_device_name(&value);
    }
    if let Some(value) = config.managed_tags {
        merged.managed_tags =
            normalize_managed_tags(value.into_iter().map(ManagedTagConfigInput::Full).collect());
    }
    if let Some(value) = config.window_width {
        merged.window_width = Some(value);
    }
    if let Some(value) = config.window_height {
        merged.window_height = Some(value);
    }
    if let Some(value) = config.window_x {
        merged.window_x = Some(value);
    }
    if let Some(value) = config.window_y {
        merged.window_y = Some(value);
    }

    let data = serde_json::to_string(&merged).map_err(|e| e.to_string())?;
    std::fs::write(&conf_path, data).map_err(|e| e.to_string())?;
    sync_device_identity_rename(&app, &old_device_name, &merged.device_name, true).await?;
    Ok(())
}

#[tauri::command]
pub async fn rename_device_tag(app: AppHandle, from: String, to: String) -> Result<(), String> {
    let cleaned_from = normalize_device_name(&from);
    let cleaned_to = normalize_device_name(&to);
    if cleaned_from == cleaned_to {
        return Ok(());
    }

    let state = app.state::<AppState>();
    let rows = sqlx::query("SELECT metadata, tags FROM clipboard_items")
        .fetch_all(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    for row in rows {
        let metadata = parse_metadata(row.try_get("metadata").ok());
        let tags = parse_tags(row.try_get("tags").ok());
        let has_source = metadata
            .get("deviceName")
            .map(|values| {
                values
                    .iter()
                    .any(|value| normalize_device_name(value).eq_ignore_ascii_case(&cleaned_from))
            })
            .unwrap_or(false)
            || tags
                .iter()
                .any(|tag| normalize_device_name(tag).eq_ignore_ascii_case(&cleaned_from));
        let conflicts = metadata
            .get("deviceName")
            .map(|values| {
                values
                    .iter()
                    .any(|value| normalize_device_name(value).eq_ignore_ascii_case(&cleaned_to))
            })
            .unwrap_or(false)
            || tags
                .iter()
                .any(|tag| normalize_device_name(tag).eq_ignore_ascii_case(&cleaned_to));
        if conflicts && !has_source {
            return Err(format!("Device name \"{}\" already exists.", cleaned_to));
        }
    }

    let mut merged = read_app_config(&app);
    let should_update_config = merged
        .device_name
        .trim()
        .eq_ignore_ascii_case(&cleaned_from);

    sync_device_identity_rename(&app, &cleaned_from, &cleaned_to, false).await?;

    if should_update_config {
        merged.device_name = cleaned_to.clone();
        let conf_path = app.path().app_data_dir().unwrap().join("config.json");
        let data = serde_json::to_string(&merged).map_err(|e| e.to_string())?;
        std::fs::write(&conf_path, data).map_err(|e| e.to_string())?;
    }

    Ok(())
}
