use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::password_hash::rand_core::OsRng as PasswordOsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const PRIVACY_FILE: &str = "privacy.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PrivacyConfig {
    #[serde(default)]
    pub password_hash: String,
    #[serde(default)]
    pub key_salt_b64: String,
    #[serde(default)]
    pub security_question: String,
    #[serde(default)]
    pub security_answer_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyStatus {
    pub password_set: bool,
    pub private_items: i64,
    pub security_question_set: bool,
    pub security_question: Option<String>,
}

pub fn load_privacy_config(app: &AppHandle) -> Result<PrivacyConfig, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(PRIVACY_FILE);

    if !path.exists() {
        return Ok(PrivacyConfig::default());
    }

    let raw = std::fs::read_to_string(&path).map_err(|e| format!("Read privacy config failed: {}", e))?;
    let cfg = serde_json::from_str::<PrivacyConfig>(&raw)
        .map_err(|e| format!("Parse privacy config failed: {}", e))?;
    Ok(cfg)
}

pub fn save_privacy_config(app: &AppHandle, cfg: &PrivacyConfig) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(PRIVACY_FILE);

    let raw = serde_json::to_string(cfg).map_err(|e| format!("Serialize privacy config failed: {}", e))?;
    std::fs::write(&path, raw).map_err(|e| format!("Write privacy config failed: {}", e))
}

pub fn has_password(cfg: &PrivacyConfig) -> bool {
    !cfg.password_hash.is_empty() && !cfg.key_salt_b64.is_empty()
}

pub fn has_security_question(cfg: &PrivacyConfig) -> bool {
    !cfg.security_question.trim().is_empty() && !cfg.security_answer_hash.is_empty()
}

pub fn verify_password(cfg: &PrivacyConfig, password: &str) -> Result<(), String> {
    if !has_password(cfg) {
        return Err("请先在设置中配置隐私密码".to_string());
    }
    let parsed = PasswordHash::new(&cfg.password_hash)
        .map_err(|e| format!("Invalid password hash config: {}", e))?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .map_err(|_| "隐私密码错误".to_string())
}

fn normalize_security_answer(answer: &str) -> String {
    answer.trim().to_lowercase()
}

pub fn set_password(
    cfg: &mut PrivacyConfig,
    current_password: Option<&str>,
    new_password: &str,
    security_question: &str,
    security_answer: &str,
) -> Result<(), String> {
    let next = new_password.trim();
    if next.len() < 6 {
        return Err("隐私密码至少 6 位".to_string());
    }
    let next_question = security_question.trim();
    if next_question.is_empty() {
        return Err("安全问题不能为空".to_string());
    }
    let normalized_answer = normalize_security_answer(security_answer);
    if normalized_answer.len() < 2 {
        return Err("安全问题答案至少 2 位".to_string());
    }

    if has_password(cfg) {
        let current = current_password.ok_or_else(|| "请输入当前隐私密码".to_string())?;
        verify_password(cfg, current)?;
    }

    let salt = SaltString::generate(&mut PasswordOsRng);
    let password_hash = Argon2::default()
        .hash_password(next.as_bytes(), &salt)
        .map_err(|e| format!("Hash password failed: {}", e))?
        .to_string();
    let answer_salt = SaltString::generate(&mut PasswordOsRng);
    let security_answer_hash = Argon2::default()
        .hash_password(normalized_answer.as_bytes(), &answer_salt)
        .map_err(|e| format!("Hash security answer failed: {}", e))?
        .to_string();

    let mut key_salt = [0u8; 16];
    OsRng.fill_bytes(&mut key_salt);

    cfg.password_hash = password_hash;
    cfg.key_salt_b64 = B64.encode(key_salt);
    cfg.security_question = next_question.to_string();
    cfg.security_answer_hash = security_answer_hash;
    Ok(())
}

fn derive_key(cfg: &PrivacyConfig) -> Result<[u8; 32], String> {
    if !has_password(cfg) {
        return Err("请先在设置中配置隐私密码".to_string());
    }
    let salt = B64
        .decode(&cfg.key_salt_b64)
        .map_err(|e| format!("Decode key salt failed: {}", e))?;

    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(cfg.password_hash.as_bytes(), &salt, &mut key)
        .map_err(|e| format!("Derive encryption key failed: {}", e))?;
    Ok(key)
}

pub fn encrypt_content(cfg: &PrivacyConfig, plain: &str) -> Result<String, String> {
    let key = derive_key(cfg)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Create cipher failed: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let encrypted = cipher
        .encrypt(nonce, plain.as_bytes())
        .map_err(|e| format!("Encrypt content failed: {}", e))?;

    Ok(format!(
        "v1:{}:{}",
        B64.encode(nonce_bytes),
        B64.encode(encrypted)
    ))
}

pub fn decrypt_content(cfg: &PrivacyConfig, password: &str, encrypted_payload: &str) -> Result<String, String> {
    verify_password(cfg, password)?;

    let mut parts = encrypted_payload.splitn(3, ':');
    let version = parts.next().unwrap_or_default();
    if version != "v1" {
        return Err("Unsupported encrypted payload version".to_string());
    }
    let nonce_b64 = parts.next().unwrap_or_default();
    let ciphertext_b64 = parts.next().unwrap_or_default();
    if nonce_b64.is_empty() || ciphertext_b64.is_empty() {
        return Err("Invalid encrypted payload format".to_string());
    }

    let key = derive_key(cfg)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Create cipher failed: {}", e))?;

    let nonce = B64
        .decode(nonce_b64)
        .map_err(|e| format!("Decode nonce failed: {}", e))?;
    if nonce.len() != 12 {
        return Err("Invalid nonce length".to_string());
    }
    let ciphertext = B64
        .decode(ciphertext_b64)
        .map_err(|e| format!("Decode ciphertext failed: {}", e))?;

    let plain = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "解密失败，密码可能错误或数据已损坏".to_string())?;

    String::from_utf8(plain).map_err(|e| format!("Decode plain text failed: {}", e))
}
