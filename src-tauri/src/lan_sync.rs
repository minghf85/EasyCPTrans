use crate::commands::{read_app_config, AppConfig};
use crate::db::AppState;
use crate::sync::{upsert_remote_item, SyncItem};
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use base64::Engine as _;
use chrono::Utc;
use hmac::{Hmac, Mac};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use rand::distributions::Alphanumeric;
use rand::{thread_rng, Rng};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use sqlx::Row;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::TcpListener;
use tokio::sync::watch;

const LAN_SALT: &[u8] = b"easycptrans-lan-v1";
const SERVICE_TYPE: &str = "_easycptrans._tcp.local.";
const AUTH_WINDOW_SECONDS: i64 = 300;
const MAX_SYNC_ITEMS: usize = 10_000;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerInfo {
    pub name: String,
    pub host: String,
    pub addresses: Vec<String>,
    pub port: u16,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanSyncStatus {
    pub enabled: bool,
    pub listening: bool,
    pub port: u16,
    pub pairing_code_set: bool,
    pub peers: Vec<PeerInfo>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanSyncResult {
    pub peers_found: usize,
    pub pushed: usize,
    pub pulled: usize,
    pub errors: Vec<String>,
}

#[derive(Clone, Default)]
struct Inner {
    enabled: bool,
    pairing_code_set: bool,
    device_name: String,
    port: u16,
    shutdown_tx: Option<watch::Sender<bool>>,
    mdns: Option<ServiceDaemon>,
    registered_fullname: Option<String>,
    peers: Vec<PeerInfo>,
}

#[derive(Clone)]
pub struct LanSyncState {
    inner: Arc<Mutex<Inner>>,
}

impl LanSyncState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner::default())),
        }
    }

    fn with_inner<T>(&self, f: impl FnOnce(&mut Inner) -> T) -> T {
        let mut guard = self.inner.lock().unwrap();
        f(&mut *guard)
    }

    fn clone_inner(&self) -> Inner {
        self.with_inner(|inner| inner.clone())
    }

    fn peers(&self) -> Vec<PeerInfo> {
        self.with_inner(|inner| inner.peers.clone())
    }
}

impl Default for LanSyncState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone)]
struct ServerState {
    app: AppHandle,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncRequest {
    device_name: String,
    timestamp: i64,
    auth: String,
    nonce: String,
    ciphertext: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncResponse {
    nonce: String,
    ciphertext: String,
}

fn derive_key(pairing_code: &str) -> Result<[u8; 32], String> {
    let params = Params::new(65536, 3, 1, Some(32)).map_err(|e| format!("Argon2 params: {}", e))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out = [0u8; 32];
    argon2
        .hash_password_into(pairing_code.as_bytes(), LAN_SALT, &mut out)
        .map_err(|e| format!("Argon2 hash failed: {}", e))?;
    Ok(out)
}

fn auth_token(key: &[u8; 32], device_name: &str, timestamp: i64) -> String {
    let mut mac = <HmacSha256 as Mac>::new_from_slice(key).expect("HMAC key length valid");
    mac.update(format!("{}:{}", device_name, timestamp).as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

fn encrypt_payload(key: &[u8; 32], plaintext: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("AES key init: {}", e))?;
    let nonce_bytes: [u8; 12] = thread_rng().gen();
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plaintext)
        .map_err(|e| format!("AES encrypt: {}", e))?;
    Ok((nonce_bytes.to_vec(), ciphertext))
}

fn decrypt_payload(key: &[u8; 32], nonce: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("AES key init: {}", e))?;
    if nonce.len() != 12 {
        return Err("Invalid nonce length".to_string());
    }
    cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|e| format!("AES decrypt: {}", e))
}

fn verify_request(key: &[u8; 32], req: &SyncRequest) -> Result<(), String> {
    let now = Utc::now().timestamp();
    if (now - req.timestamp).abs() > AUTH_WINDOW_SECONDS {
        return Err("Request timestamp is too old. Check that both devices have correct time.".to_string());
    }
    let expected = auth_token(key, &req.device_name, req.timestamp);
    if !constant_time_eq(&expected, &req.auth) {
        return Err("Authentication failed. Pairing codes may not match.".to_string());
    }
    Ok(())
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn pairing_code_or_generate(config: &AppConfig) -> String {
    let trimmed = config.lan_sync_pairing_code.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    generate_pairing_code()
}

pub fn generate_pairing_code() -> String {
    let mut rng = thread_rng();
    (0..6)
        .map(|_| {
            let ch: char = rng.sample(Alphanumeric).into();
            ch.to_ascii_uppercase()
        })
        .collect()
}

fn sanitize_hostname(value: &str) -> String {
    let mut out = String::new();
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' {
            out.push(ch);
        } else if ch == ' ' || ch == '_' || ch == '.' {
            out.push('-');
        }
    }
    if out.is_empty() {
        out.push_str("device");
    }
    out
}

async fn load_local_sync_items(pool: &sqlx::SqlitePool) -> Result<Vec<SyncItem>, String> {
    let rows = sqlx::query(
        "SELECT content_hash, content_type, preview_text, storage_path, tags, is_pinned,
                created_at, last_used_at, use_count
         FROM clipboard_items
         WHERE content_hash IS NOT NULL AND content_hash <> ''
           AND (is_private IS NULL OR is_private = 0)
         ORDER BY last_used_at DESC
         LIMIT ?1",
    )
    .bind(MAX_SYNC_ITEMS as i64)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Load local items failed: {}", e))?;

    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let content_type: String = row.get("content_type");
        let preview_text: Option<String> = row.try_get("preview_text").ok();
        let storage_path: Option<String> = row.try_get("storage_path").ok();
        let raw_content = if content_type == "text" {
            preview_text.clone()
        } else {
            storage_path.clone()
        };
        let tags_raw: Option<String> = row.try_get("tags").ok();
        let tags = crate::sync::parse_tags(tags_raw);
        items.push(SyncItem {
            content_hash: row.get("content_hash"),
            content_type,
            preview_text,
            tags,
            is_pinned: row.try_get::<i64, _>("is_pinned").unwrap_or(0) != 0,
            raw_content,
            created_at: row.try_get("created_at").ok(),
            last_used_at: row.try_get("last_used_at").ok(),
            use_count: row.try_get::<i64, _>("use_count").unwrap_or(0),
        });
    }
    Ok(items)
}

async fn upsert_items(
    app: &AppHandle,
    items: Vec<SyncItem>,
) -> Result<(usize, usize), String> {
    let pool = app.state::<AppState>().pool.clone();
    let mut inserted = 0usize;
    let mut merged = 0usize;
    for item in items {
        match upsert_remote_item(&pool, &item).await {
            Ok(true) => inserted += 1,
            Ok(false) => merged += 1,
            Err(err) => eprintln!("[EasyCPTrans] LAN sync upsert item failed: {}", err),
        }
    }
    if inserted > 0 || merged > 0 {
        let _ = app.emit("clipboard-changed", ());
    }
    Ok((inserted, merged))
}

async fn handle_sync(
    State(state): State<Arc<ServerState>>,
    Json(req): Json<SyncRequest>,
) -> Result<Json<SyncResponse>, StatusCode> {
    let config = read_app_config(&state.app);
    let pairing_code = config.lan_sync_pairing_code.trim();
    if pairing_code.is_empty() {
        return Err(StatusCode::FORBIDDEN);
    }
    let key = derive_key(pairing_code).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if let Err(err) = verify_request(&key, &req) {
        eprintln!("[EasyCPTrans] LAN sync auth failed: {}", err);
        return Err(StatusCode::FORBIDDEN);
    }

    let nonce = base64::engine::general_purpose::STANDARD
        .decode(&req.nonce)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(&req.ciphertext)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let plaintext = decrypt_payload(&key, &nonce, &ciphertext).map_err(|_| StatusCode::BAD_REQUEST)?;
    let remote_items: Vec<SyncItem> =
        serde_json::from_slice(&plaintext).map_err(|_| StatusCode::BAD_REQUEST)?;

    let (inserted, merged) = upsert_items(&state.app, remote_items)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    println!(
        "[EasyCPTrans] LAN sync received {} items from {}, inserted: {}, merged: {}",
        plaintext.len(),
        req.device_name,
        inserted,
        merged
    );

    let local_items = load_local_sync_items(&state.app.state::<AppState>().pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let response_json = serde_json::to_vec(&local_items).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let (resp_nonce, resp_ciphertext) =
        encrypt_payload(&key, &response_json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SyncResponse {
        nonce: base64::engine::general_purpose::STANDARD.encode(&resp_nonce),
        ciphertext: base64::engine::general_purpose::STANDARD.encode(&resp_ciphertext),
    }))
}

fn build_router(app: AppHandle) -> Router {
    let state = Arc::new(ServerState { app });
    Router::new()
        .route("/api/lan/sync", post(handle_sync))
        .with_state(state)
}

async fn start_http_server(
    app: AppHandle,
    port: u16,
) -> Result<(u16, watch::Sender<bool>), String> {
    let bind_addr: SocketAddr = if port == 0 {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), 0)
    } else {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), port)
    };
    let listener = TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| format!("Bind LAN sync server to {} failed: {}", bind_addr, e))?;
    let actual_port = listener
        .local_addr()
        .map_err(|e| format!("Read local address failed: {}", e))?
        .port();

    let router = build_router(app);
    let (tx, mut rx) = watch::channel(false);
    let server = axum::serve(listener, router).with_graceful_shutdown(async move {
        let _ = rx.changed().await;
    });

    tauri::async_runtime::spawn(async move {
        if let Err(err) = server.await {
            eprintln!("[EasyCPTrans] LAN sync server error: {}", err);
        }
    });

    Ok((actual_port, tx))
}

fn create_mdns_daemon() -> Result<ServiceDaemon, String> {
    ServiceDaemon::new().map_err(|e| format!("Create mDNS daemon failed: {}", e))
}

fn local_ipv4_addresses() -> Vec<IpAddr> {
    match local_ip_address::list_afinet_netifas() {
        Ok(ifaces) => ifaces
            .into_iter()
            .filter_map(|(_, ip)| match ip {
                IpAddr::V4(v4) if !v4.is_loopback() => Some(IpAddr::V4(v4)),
                _ => None,
            })
            .collect(),
        Err(_) => Vec::new(),
    }
}

fn register_mdns_service(
    daemon: &ServiceDaemon,
    device_name: &str,
    port: u16,
) -> Result<String, String> {
    let addresses = {
        let mut addrs = local_ipv4_addresses();
        if addrs.is_empty() {
            addrs.push(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)));
        }
        addrs
    };
    let instance = sanitize_hostname(device_name);
    let hostname = format!("{}-{}.local.", sanitize_hostname("easycptrans"), instance);
    let fullname = format!("{}.{}", instance, SERVICE_TYPE);
    let properties = [("device", device_name), ("v", "1")];
    let service_info = ServiceInfo::new(
        SERVICE_TYPE,
        &instance,
        &hostname,
        addresses.as_slice(),
        port,
        &properties[..],
    )
    .map_err(|e| format!("Build mDNS service info failed: {}", e))?;
    daemon
        .register(service_info)
        .map_err(|e| format!("Register mDNS service failed: {}", e))?;
    Ok(fullname)
}

fn unregister_mdns_service(daemon: &ServiceDaemon, fullname: &str) {
    let _ = daemon.unregister(fullname);
}

async fn run_mdns_browser(
    app: AppHandle,
    daemon: ServiceDaemon,
    own_fullname: String,
    state: Arc<Mutex<Inner>>,
) {
    let receiver = match daemon.browse(SERVICE_TYPE) {
        Ok(rx) => rx,
        Err(err) => {
            eprintln!("[EasyCPTrans] mDNS browse failed: {}", err);
            return;
        }
    };

    loop {
        match receiver.recv_async().await {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let fullname = info.get_fullname().to_string();
                if fullname == own_fullname {
                    continue;
                }
                let name = info.get_property_val_str("device")
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| info.get_hostname().to_string());
                let host = info.get_hostname().to_string();
                let addresses: Vec<String> = info
                    .get_addresses()
                    .iter()
                    .map(|ip| ip.to_string())
                    .collect();
                let port = info.get_port();
                let peer = PeerInfo {
                    name,
                    host,
                    addresses,
                    port,
                };
                {
                    let mut inner = state.lock().unwrap();
                    inner.peers.retain(|p| p.host != peer.host || p.port != peer.port);
                    inner.peers.push(peer.clone());
                    inner.peers.sort_by(|a, b| a.name.cmp(&b.name));
                }
                let peers: Vec<PeerInfo> = {
                    let inner = state.lock().unwrap();
                    inner.peers.clone()
                };
                let _ = app.emit("lan-peers-updated", peers);
                println!(
                    "[EasyCPTrans] LAN peer discovered: {} @ {}:{}",
                    peer.name, peer.host, peer.port
                );
            }
            Ok(ServiceEvent::ServiceRemoved(fullname, _)) => {
                {
                    let mut inner = state.lock().unwrap();
                    inner.peers.retain(|p| format!("{}.{}", p.name, SERVICE_TYPE) != fullname);
                }
                let peers: Vec<PeerInfo> = {
                    let inner = state.lock().unwrap();
                    inner.peers.clone()
                };
                let _ = app.emit("lan-peers-updated", peers);
                println!("[EasyCPTrans] LAN peer removed: {}", fullname);
            }
            Ok(_) => {}
            Err(err) => {
                eprintln!("[EasyCPTrans] mDNS browse receiver error: {}", err);
                break;
            }
        }
    }
}

pub async fn start_lan_sync(app: AppHandle) -> Result<(), String> {
    let config = read_app_config(&app);
    if !config.lan_sync_enabled {
        return Ok(());
    }

    let pairing_code = pairing_code_or_generate(&config);
    let device_name = config.device_name.clone();
    let desired_port = config.lan_sync_port;

    let state = app.state::<LanSyncState>().inner.clone();
    {
        let inner = state.lock().unwrap();
        if inner.listening() {
            return Ok(());
        }
    }

    stop_lan_sync(&app).await;

    let (port, shutdown_tx) = start_http_server(app.clone(), desired_port).await?;
    let daemon = create_mdns_daemon()?;
    let fullname = register_mdns_service(&daemon, &device_name, port)?;

    {
        let mut inner = state.lock().unwrap();
        inner.enabled = true;
        inner.pairing_code_set = !pairing_code.is_empty();
        inner.device_name = device_name.clone();
        inner.port = port;
        inner.shutdown_tx = Some(shutdown_tx);
        inner.mdns = Some(daemon.clone());
        inner.registered_fullname = Some(fullname.clone());
    }

    if config.lan_sync_pairing_code.trim().is_empty() {
        let _ = crate::commands::set_config(
            app.clone(),
            crate::commands::PartialAppConfig {
                lan_sync_pairing_code: Some(pairing_code.clone()),
                ..Default::default()
            },
        )
        .await;
    }

    tauri::async_runtime::spawn(run_mdns_browser(
        app.clone(),
        daemon,
        fullname,
        state.clone(),
    ));

    println!(
        "[EasyCPTrans] LAN sync started on port {} with device '{}'",
        port, device_name
    );
    Ok(())
}

pub async fn stop_lan_sync(app: &AppHandle) {
    let state = app.state::<LanSyncState>().inner.clone();
    let mut inner = state.lock().unwrap();
    if let Some(tx) = inner.shutdown_tx.take() {
        let _ = tx.send(true);
    }
    if let (Some(daemon), Some(fullname)) = (inner.mdns.take(), inner.registered_fullname.take()) {
        unregister_mdns_service(&daemon, &fullname);
    }
    inner.enabled = false;
    inner.pairing_code_set = false;
    inner.port = 0;
    inner.peers.clear();
}

pub fn initialize_lan_sync(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(err) = start_lan_sync(app).await {
            eprintln!("[EasyCPTrans] Initialize LAN sync failed: {}", err);
        }
    });
}

impl Inner {
    fn listening(&self) -> bool {
        self.shutdown_tx.is_some()
    }
}

#[tauri::command]
pub async fn lan_sync_status(app: AppHandle) -> Result<LanSyncStatus, String> {
    let inner = app.state::<LanSyncState>().clone_inner();
    Ok(LanSyncStatus {
        enabled: inner.enabled,
        listening: inner.listening(),
        port: inner.port,
        pairing_code_set: inner.pairing_code_set,
        peers: inner.peers,
    })
}

#[tauri::command]
pub async fn set_lan_sync_enabled(
    app: AppHandle,
    enabled: bool,
    pairing_code: Option<String>,
    port: Option<u16>,
) -> Result<(), String> {
    let mut config = read_app_config(&app);
    let code = pairing_code
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| config.lan_sync_pairing_code.clone());
    let code = if enabled && code.is_empty() {
        generate_pairing_code()
    } else {
        code
    };

    config.lan_sync_enabled = enabled;
    config.lan_sync_pairing_code = code.clone();
    if let Some(p) = port {
        config.lan_sync_port = p;
    }

    crate::commands::set_config(
        app.clone(),
        crate::commands::PartialAppConfig {
            lan_sync_enabled: Some(enabled),
            lan_sync_pairing_code: Some(code),
            lan_sync_port: Some(config.lan_sync_port),
            ..Default::default()
        },
    )
    .await?;

    if enabled {
        start_lan_sync(app).await?;
    } else {
        stop_lan_sync(&app).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn trigger_lan_sync(app: AppHandle) -> Result<LanSyncResult, String> {
    let peers = app.state::<LanSyncState>().peers();
    if peers.is_empty() {
        return Ok(LanSyncResult {
            peers_found: 0,
            pushed: 0,
            pulled: 0,
            errors: vec!["No LAN peers discovered. Make sure both devices are on the same network and LAN sync is enabled.".to_string()],
        });
    }

    let config = read_app_config(&app);
    let pairing_code = config.lan_sync_pairing_code.trim();
    if pairing_code.is_empty() {
        return Err("LAN sync pairing code is not set.".to_string());
    }
    let key = derive_key(pairing_code)?;
    let local_items = load_local_sync_items(&app.state::<AppState>().pool).await?;
    let local_json = serde_json::to_vec(&local_items).map_err(|e| e.to_string())?;
    let (nonce, ciphertext) = encrypt_payload(&key, &local_json)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let timestamp = Utc::now().timestamp();
    let device_name = config.device_name.clone();
    let token = auth_token(&key, &device_name, timestamp);

    let mut pushed = 0usize;
    let mut pulled = 0usize;
    let mut errors = Vec::new();

    for peer in peers {
        let addr = peer
            .addresses
            .iter()
            .find(|ip| ip.parse::<Ipv4Addr>().is_ok())
            .cloned()
            .unwrap_or_else(|| peer.host.clone());
        let url = format!("http://{}:{}/api/lan/sync", addr, peer.port);
        let body = SyncRequest {
            device_name: device_name.clone(),
            timestamp,
            auth: token.clone(),
            nonce: base64::engine::general_purpose::STANDARD.encode(&nonce),
            ciphertext: base64::engine::general_purpose::STANDARD.encode(&ciphertext),
        };

        match client.post(&url).json(&body).send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<SyncResponse>().await {
                    Ok(response) => {
                        match base64::engine::general_purpose::STANDARD.decode(&response.nonce) {
                            Ok(resp_nonce) => {
                                match base64::engine::general_purpose::STANDARD.decode(&response.ciphertext) {
                                    Ok(resp_ct) => match decrypt_payload(&key, &resp_nonce, &resp_ct) {
                                        Ok(resp_plain) => match serde_json::from_slice::<Vec<SyncItem>>(&resp_plain) {
                                            Ok(remote_items) => {
                                                let (inserted, merged) = upsert_items(&app, remote_items).await?;
                                                pushed += local_items.len();
                                                pulled += inserted + merged;
                                            }
                                            Err(e) => errors.push(format!("{} parse response failed: {}", peer.name, e)),
                                        },
                                        Err(e) => errors.push(format!("{} decrypt failed: {}", peer.name, e)),
                                    },
                                    Err(e) => errors.push(format!("{} decode ciphertext failed: {}", peer.name, e)),
                                }
                            }
                            Err(e) => errors.push(format!("{} decode nonce failed: {}", peer.name, e)),
                        }
                    }
                    Err(e) => errors.push(format!("{} read response failed: {}", peer.name, e)),
                }
            }
            Ok(resp) => {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                errors.push(format!("{} returned {}: {}", peer.name, status, text));
            }
            Err(e) => errors.push(format!("{} unreachable: {}", peer.name, e)),
        }
    }

    Ok(LanSyncResult {
        peers_found: app.state::<LanSyncState>().peers().len(),
        pushed,
        pulled,
        errors,
    })
}

#[tauri::command]
pub async fn generate_lan_pairing_code_command() -> String {
    generate_pairing_code()
}
