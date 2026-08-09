use crate::capture::ScreenCapture;
use crate::server::{self, ServerState};
use hmac::{Hmac, Mac};
use local_ip_address::local_ip;
use parking_lot::Mutex;
use sha2::Sha256;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{Emitter, Manager, State};
use tokio::sync::broadcast;
use uuid::Uuid;

fn blocking_client(timeout_secs: u64) -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .unwrap_or_else(|_| reqwest::blocking::Client::new())
}

fn async_client(timeout_secs: u64) -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn blocking_post_json(url: &str, body: &str, token: &str, timeout_secs: u64) -> Result<(String, u16), String> {
    let client = blocking_client(timeout_secs);
    let mut req = client.post(url).header("Content-Type", "application/json").body(body.to_string());
    if !token.is_empty() {
        req = req.header("X-Publisher-Token", token);
    }
    match req.send() {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let body = resp.text().unwrap_or_default();
            Ok((body, status))
        }
        Err(e) => Err(format!("Transport error: {}", e)),
    }
}

fn blocking_post_bytes(url: &str, data: &[u8], token: &str, timeout_secs: u64) -> Result<(String, u16), String> {
    let client = blocking_client(timeout_secs);
    let mut req = client.post(url).header("Content-Type", "application/octet-stream").body(data.to_vec());
    if !token.is_empty() {
        req = req.header("X-Publisher-Token", token);
    }
    match req.send() {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let body = resp.text().unwrap_or_default();
            Ok((body, status))
        }
        Err(e) => Err(format!("Transport error: {}", e)),
    }
}

pub struct ShareState {
    pub server_port: u16,
    pub active_port: parking_lot::Mutex<Option<u16>>,
    pub is_sharing: Arc<AtomicBool>,
    pub client_count: Arc<AtomicUsize>,
    pub capture_thread: Mutex<Option<thread::JoinHandle<()>>>,
    pub server_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
    pub raise_hand_handle: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    pub chat_listener_handle: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    pub server_state: Mutex<Option<Arc<ServerState>>>,
    pub shared_files: Arc<parking_lot::Mutex<Vec<server::SharedFile>>>,
    pub local_ip: String,
    pub display_index: usize,
    pub quality: u8,
    pub fps: u32,
    pub internet_session_id: Mutex<Option<String>>,
    pub internet_relay_url: Mutex<Option<String>>,
    pub internet_handle: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    pub internet_host_name: Mutex<String>,
    pub internet_publisher_token: Mutex<String>,
}

impl Default for ShareState {
    fn default() -> Self {
        let ip = local_ip()
            .map(|ip| ip.to_string())
            .unwrap_or_else(|_| "127.0.0.1".to_string());

        Self {
            server_port: 8080,
            active_port: parking_lot::Mutex::new(None),
            is_sharing: Arc::new(AtomicBool::new(false)),
            client_count: Arc::new(AtomicUsize::new(0)),
            capture_thread: Mutex::new(None),
            server_handle: Mutex::new(None),
            raise_hand_handle: Mutex::new(None),
            chat_listener_handle: Mutex::new(None),
            server_state: Mutex::new(None),
            shared_files: Arc::new(parking_lot::Mutex::new(Vec::new())),
            local_ip: ip,
            display_index: 0,
            quality: 75,
            fps: 30,
            internet_session_id: Mutex::new(None),
            internet_relay_url: Mutex::new(None),
            internet_handle: Mutex::new(None),
            internet_host_name: Mutex::new(String::new()),
            internet_publisher_token: Mutex::new(String::new()),
        }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub is_sharing: bool,
    pub url: String,
    pub ws_url: String,
    pub local_ip: String,
    pub port: u16,
    pub clients: usize,
    pub width: usize,
    pub height: usize,
    pub fps: u32,
    pub internet_url: Option<String>,
}

#[derive(serde::Serialize)]
pub struct DisplayInfo {
    pub index: usize,
    pub width: usize,
    pub height: usize,
}

#[tauri::command]
pub fn start_sharing(
    app: tauri::AppHandle,
    state: State<ShareState>,
    display_index: Option<usize>,
    quality: Option<u8>,
    fps: Option<u32>,
    port: Option<u16>,
    host_name: Option<String>,
    host_avatar: Option<String>,
    host_bio: Option<String>,
) -> Result<SessionInfo, String> {
    if state.is_sharing.load(Ordering::Relaxed) {
        return Err("Already sharing".to_string());
    }

    let display_idx = display_index.unwrap_or(state.display_index);
    let jpeg_quality = quality.unwrap_or(state.quality);
    let target_fps = fps.unwrap_or(state.fps);
    let server_port = port.unwrap_or(state.server_port);

    // Initialize screen capture
    let capture = ScreenCapture::new(display_idx)?;
    let (width, height) = capture.dimensions();

    // Create broadcast channels
    let (frame_tx, _) = broadcast::channel::<Arc<Vec<u8>>>(8);
    let (chat_tx, _) = broadcast::channel::<String>(64);
    let (raise_hand_tx, _) = broadcast::channel::<String>(64);

    // Create server state
    let shared_files = state.shared_files.clone();
    let server_state = Arc::new(ServerState {
        frame_tx: frame_tx.clone(),
        chat_tx: chat_tx.clone(),
        raise_hand_tx: raise_hand_tx.clone(),
        client_count: state.client_count.clone(),
        chat_messages: Arc::new(parking_lot::Mutex::new(Vec::new())),
        width,
        height,
        fps: target_fps,
        host_name: Mutex::new(host_name.unwrap_or_default()),
        host_avatar: Mutex::new(host_avatar.unwrap_or_default()),
        host_bio: Mutex::new(host_bio.unwrap_or_default()),
        shared_files,
    });

    // Start HTTP + WebSocket server in background
    let server_state_clone = server_state.clone();
    let server_handle = tauri::async_runtime::block_on(async {
        server::start_server(server_port, server_state_clone).await
    })?;

    // Save active port
    *state.active_port.lock() = Some(server_port);

    // Spawn raise hand listener that emits Tauri events
    let mut raise_hand_rx = raise_hand_tx.subscribe();
    let app_clone = app.clone();
    let raise_hand_handle = tauri::async_runtime::spawn(async move {
        loop {
            match raise_hand_rx.recv().await {
                Ok(text) => {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                        let user = parsed
                            .get("user")
                            .and_then(|u| u.as_str())
                            .unwrap_or("Guest")
                            .to_string();
                        let timestamp = parsed
                            .get("timestamp")
                            .and_then(|t| t.as_u64())
                            .unwrap_or(0);
                        let _ = app_clone.emit("raise_hand", serde_json::json!({
                            "user": user,
                            "timestamp": timestamp
                        }));
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            }
        }
    });

    // Spawn chat listener that emits Tauri events for incoming chat messages
    let mut chat_rx = chat_tx.subscribe();
    let app_clone2 = app.clone();
    let chat_listener_handle = tauri::async_runtime::spawn(async move {
        loop {
            match chat_rx.recv().await {
                Ok(text) => {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                        let msg_type = parsed.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        if msg_type != "chat" { continue; }
                        // Skip host's own messages (already added locally in UI)
                        let client_id = parsed.get("clientId").and_then(|c| c.as_str()).unwrap_or("");
                        if client_id == "__host__" { continue; }
                        let user = parsed
                            .get("user")
                            .and_then(|u| u.as_str())
                            .unwrap_or("Guest")
                            .to_string();
                        let text_msg = parsed
                            .get("text")
                            .and_then(|t| t.as_str())
                            .unwrap_or("")
                            .to_string();
                        let timestamp = parsed
                            .get("timestamp")
                            .and_then(|t| t.as_u64())
                            .unwrap_or(0);
                        let subtype = parsed
                            .get("subtype")
                            .and_then(|s| s.as_str())
                            .unwrap_or("")
                            .to_string();
                        let _ = app_clone2.emit("chat_message", serde_json::json!({
                            "user": user,
                            "text": text_msg,
                            "timestamp": timestamp,
                            "subtype": subtype
                        }));
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            }
        }
    });

    // Start capture thread
    let is_sharing = state.is_sharing.clone();
    let frame_sender = frame_tx.clone();

    let capture_handle = thread::spawn(move || {
        let frame_interval = std::time::Duration::from_millis(1000 / target_fps as u64);
        let mut capture = capture;

        is_sharing.store(true, Ordering::Relaxed);

        while is_sharing.load(Ordering::Relaxed) {
            let start = std::time::Instant::now();

            match capture.capture_frame(jpeg_quality) {
                Ok(frame_data) => {
                    let _ = frame_sender.send(Arc::new(frame_data));
                }
                Err(e) => {
                    eprintln!("Capture error: {}", e);
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            }

            let elapsed = start.elapsed();
            if elapsed < frame_interval {
                std::thread::sleep(frame_interval - elapsed);
            }
        }
    });

    // Update state
    *state.capture_thread.lock() = Some(capture_handle);
    *state.server_handle.lock() = Some(server_handle);
    *state.raise_hand_handle.lock() = Some(raise_hand_handle);
    *state.chat_listener_handle.lock() = Some(chat_listener_handle);
    *state.server_state.lock() = Some(server_state);
    state.is_sharing.store(true, Ordering::Relaxed);

    let ip = state.local_ip.clone();
    let internet_url = state.internet_relay_url.lock().clone();
    Ok(SessionInfo {
        is_sharing: true,
        url: format!("http://{}:{}", ip, server_port),
        ws_url: format!("ws://{}:{}/ws", ip, server_port),
        local_ip: ip,
        port: server_port,
        clients: 0,
        width,
        height,
        fps: target_fps,
        internet_url,
    })
}

#[tauri::command]
pub fn stop_sharing(state: State<ShareState>) -> Result<(), String> {
    state.is_sharing.store(false, Ordering::Relaxed);

    // Notify all viewers that stream is ending
    if let Some(ss) = state.server_state.lock().as_ref() {
        let end_msg = serde_json::json!({"type": "stream_ended"});
        if let Ok(end_str) = serde_json::to_string(&end_msg) {
            let _ = ss.chat_tx.send(end_str);
        }
    }

    // Stop capture thread
    if let Some(handle) = state.capture_thread.lock().take() {
        let _ = handle.join();
    }

    // Abort server task
    if let Some(handle) = state.server_handle.lock().take() {
        handle.abort();
    }

    // Abort raise hand listener task
    if let Some(handle) = state.raise_hand_handle.lock().take() {
        handle.abort();
    }

    // Abort chat listener task
    if let Some(handle) = state.chat_listener_handle.lock().take() {
        handle.abort();
    }

    // Abort internet relay task if any
    if let Some(handle) = state.internet_handle.lock().take() {
        handle.abort();
    }

    // Notify relay server that session is stopped
    if let (Some(session_id), Some(relay_url)) = (
        state.internet_session_id.lock().as_ref(),
        state.internet_relay_url.lock().as_ref(),
    ) {
        let url = format!("{}/api/publish/{}/stop", relay_url, session_id);
        let _ = blocking_post_json(&url, "", "", 5);
    }

    *state.internet_session_id.lock() = None;
    *state.internet_relay_url.lock() = None;
    *state.internet_publisher_token.lock() = String::new();

    *state.server_state.lock() = None;
    *state.active_port.lock() = None;
    state.shared_files.lock().clear();
    state.client_count.store(0, Ordering::Relaxed);

    Ok(())
}

#[tauri::command]
pub fn get_session_info(state: State<ShareState>) -> Result<SessionInfo, String> {
    let is_sharing = state.is_sharing.load(Ordering::Relaxed);
    let ip = state.local_ip.clone();
    let port = state.active_port.lock().unwrap_or(state.server_port);

    let (width, height, fps) = if let Some(ss) = state.server_state.lock().as_ref() {
        (ss.width, ss.height, ss.fps)
    } else {
        let sid = state.internet_session_id.lock().clone();
        let relay = state.internet_relay_url.lock().clone();
        if let (Some(sid), Some(relay_url)) = (sid, relay) {
            // Fetch viewer count from relay server
            let info_url = format!("{}/api/info/{}", relay_url, sid);
            match blocking_client(10)
                .get(&info_url)
                .send() {
                Ok(resp) => {
                    if let Ok(json) = resp.json::<serde_json::Value>() {
                        let w = json.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                        let h = json.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                        let f = json.get("fps").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                        return Ok(SessionInfo {
                            is_sharing,
                            url: String::new(),
                            ws_url: String::new(),
                            local_ip: ip,
                            port: 0,
                            clients: json.get("clients").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
                            width: w,
                            height: h,
                            fps: f,
                            internet_url: Some(relay_url),
                        });
                    }
                }
                _ => {}
            }
        }
        (0, 0, 0)
    };

    let clients = state.client_count.load(Ordering::Relaxed);

    Ok(SessionInfo {
        is_sharing,
        url: format!("http://{}:{}", ip, port),
        ws_url: format!("ws://{}:{}/ws", ip, port),
        local_ip: ip,
        port,
        clients,
        width,
        height,
        fps,
        internet_url: state.internet_relay_url.lock().clone(),
    })
}

#[tauri::command]
pub fn get_local_ip(state: State<ShareState>) -> Result<String, String> {
    Ok(state.local_ip.clone())
}

#[tauri::command]
pub fn get_available_displays() -> Result<Vec<DisplayInfo>, String> {
    let displays = ScreenCapture::list_displays()?;
    Ok(displays
        .into_iter()
        .map(|(index, width, height)| DisplayInfo {
            index,
            width,
            height,
        })
        .collect())
}

#[derive(serde::Serialize)]
pub struct SharedFileInfo {
    pub id: usize,
    pub name: String,
    pub size: u64,
}

fn sync_files_to_relay(state: &ShareState) {
    let relay_url = state.internet_relay_url.lock().clone();
    let session_id = state.internet_session_id.lock().clone();
    let publisher_token = state.internet_publisher_token.lock().clone();
    if let (Some(relay_url), Some(session_id)) = (relay_url, session_id) {
        let files: Vec<serde_json::Value> = state.shared_files.lock().iter().map(|f| {
            serde_json::json!({ "id": f.id, "name": f.name, "size": f.size })
        }).collect();
        let files_json = serde_json::json!({ "files": files }).to_string();
        let url = format!("{}/api/publish/{}/files", relay_url, session_id);
        eprintln!("[Internet] Syncing {} files to relay", files.len());
        match blocking_post_json(&url, &files_json, &publisher_token, 5) {
            Ok((_, status)) => eprintln!("[Internet] Files sync OK: {}", status),
            Err(e) => eprintln!("[Internet] Files sync error: {}", e),
        }

        // Upload file contents to relay
        let shared = state.shared_files.lock();
        for f in shared.iter() {
            let upload_url = format!("{}/api/publish/{}/files/{}", relay_url, session_id, f.id);
            match std::fs::read(&f.path) {
                Ok(data) => {
                    eprintln!("[Internet] Uploading file '{}' ({} bytes) to relay", f.name, data.len());
                    match blocking_post_bytes(&upload_url, &data, &publisher_token, 30) {
                        Ok(_) => eprintln!("[Internet] File '{}' uploaded OK", f.name),
                        Err(e) => eprintln!("[Internet] File '{}' upload error: {}", f.name, e),
                    }
                }
                Err(e) => eprintln!("[Internet] Failed to read file '{}': {}", f.name, e),
            }
        }
    }
}

#[tauri::command]
pub fn share_files(state: State<ShareState>, files: Vec<String>) -> Result<Vec<SharedFileInfo>, String> {
    if !state.is_sharing.load(Ordering::Relaxed) {
        return Err("Not sharing".to_string());
    }
    let mut shared = state.shared_files.lock();
    let mut next_id = shared.iter().map(|f| f.id).max().unwrap_or(0) + 1;
    let mut result = Vec::new();
    for path in files {
        let path_obj = std::path::Path::new(&path);
        if !path_obj.exists() {
            continue;
        }
        let name = path_obj.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        let size = std::fs::metadata(&path)
            .map(|m| m.len())
            .unwrap_or(0);
        let file = server::SharedFile {
            id: next_id,
            name: name.clone(),
            size,
            path: path.clone(),
        };
        result.push(SharedFileInfo { id: next_id, name, size });
        shared.push(file);
        next_id += 1;
    }
    drop(shared);
    sync_files_to_relay(&state);
    Ok(result)
}

#[tauri::command]
pub fn clear_files(state: State<ShareState>) -> Result<(), String> {
    if !state.is_sharing.load(Ordering::Relaxed) {
        return Err("Not sharing".to_string());
    }
    state.shared_files.lock().clear();
    sync_files_to_relay(&state);
    Ok(())
}

#[tauri::command]
pub fn remove_file(state: State<ShareState>, file_id: usize) -> Result<(), String> {
    if !state.is_sharing.load(Ordering::Relaxed) {
        return Err("Not sharing".to_string());
    }
    state.shared_files.lock().retain(|f| f.id != file_id);
    sync_files_to_relay(&state);
    Ok(())
}

#[tauri::command]
pub fn start_internet_sharing(
    app: tauri::AppHandle,
    state: State<ShareState>,
    relay_url: String,
    display_index: Option<usize>,
    quality: Option<u8>,
    fps: Option<u32>,
    host_name: Option<String>,
    host_avatar: Option<String>,
    host_bio: Option<String>,
) -> Result<SessionInfo, String> {
    if state.is_sharing.load(Ordering::Relaxed) {
        return Err("Already sharing".to_string());
    }

    let display_idx = display_index.unwrap_or(state.display_index);
    let jpeg_quality = quality.unwrap_or(state.quality);
    let target_fps = fps.unwrap_or(state.fps);

    // Initialize screen capture
    let capture = ScreenCapture::new(display_idx)?;
    let (width, height) = capture.dimensions();

    // Generate session ID
    let session_id = Uuid::new_v4().to_string();

    // Generate publisher token (HMAC-SHA256)
    let relay_secret = std::env::var("KITASHARE_RELAY_SECRET").unwrap_or_default();
    let relay_secret = if relay_secret.is_empty() {
        // Try reading from relay-secret.txt — check multiple locations
        let mut found_secret = String::new();

        // 1. Try Tauri resource directory (release build bundles it here)
        if let Ok(resource_dir) = app.path().resource_dir() {
            let path = resource_dir.join("relay-secret.txt");
            if let Ok(content) = std::fs::read_to_string(&path) {
                found_secret = content.trim().to_string();
            }
        }

        // 2. Try next to the executable (dev mode or flat deployment)
        if found_secret.is_empty() {
            if let Some(exe_dir) = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.join("relay-secret.txt")))
            {
                if let Ok(content) = std::fs::read_to_string(&exe_dir) {
                    found_secret = content.trim().to_string();
                }
            }
        }

        // 3. Try current working directory (dev mode)
        if found_secret.is_empty() {
            if let Ok(content) = std::fs::read_to_string("relay-secret.txt") {
                found_secret = content.trim().to_string();
            }
        }

        found_secret
    } else {
        relay_secret
    };
    let publisher_token = if relay_secret.is_empty() {
        String::new()
    } else {
        type HmacSha256 = Hmac<Sha256>;
        let mut mac = HmacSha256::new_from_slice(relay_secret.as_bytes())
            .map_err(|e| format!("HMAC error: {}", e))?;
        mac.update(session_id.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    };

    let start_url = format!("{}/api/publish/{}/start", relay_url, session_id);
    let host_name_for_state = host_name.clone().unwrap_or_default();
    let start_body = serde_json::json!({
        "width": width,
        "height": height,
        "fps": target_fps,
        "hostName": host_name.unwrap_or_default(),
        "hostAvatar": host_avatar.unwrap_or_default(),
        "hostBio": host_bio.unwrap_or_default(),
    });

    eprintln!("[Internet] Start URL: {}", start_url);
    eprintln!("[Internet] Publisher token: {} (len={})", publisher_token, publisher_token.len());
    eprintln!("[Internet] Relay secret: {} (len={})", relay_secret, relay_secret.len());

    let body_str = serde_json::to_string(&start_body).unwrap_or_default();
    let mut resp = None;
    for attempt in 1..=3 {
        let result = blocking_post_json(&start_url, &body_str, &publisher_token, 15);

        match result {
            Ok((body, status)) => {
                if status == 503 {
                    eprintln!("[Internet] Got 503 on attempt {}, retrying in 2s...", attempt);
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    continue;
                }
                resp = Some((body, status));
                break;
            }
            Err(e) => {
                eprintln!("[Internet] Transport error on attempt {}: {}", attempt, e);
                std::thread::sleep(std::time::Duration::from_secs(2));
            }
        }
    }

    let (resp_body, status_code) = resp.unwrap_or((String::new(), 0));
    eprintln!("[Internet] Final status: {}", status_code);
    if status_code < 200 || status_code >= 300 {
        eprintln!("[Internet] Error body: {}", resp_body);
        return Err(format!("Relay server error: {}", status_code));
    }

    // Save internet state
    let viewer_url = format!("{}/view/{}", relay_url, session_id);
    *state.internet_session_id.lock() = Some(session_id.clone());
    *state.internet_relay_url.lock() = Some(relay_url.clone());
    *state.internet_host_name.lock() = host_name_for_state;
    *state.internet_publisher_token.lock() = publisher_token.clone();

    // Start capture + relay thread
    let is_sharing = state.is_sharing.clone();
    let relay_url_clone = relay_url.clone();
    let session_id_clone = session_id.clone();
    let token_clone = publisher_token.clone();
    let app_clone = app.clone();

    let capture_handle = thread::spawn(move || {
        let frame_interval = std::time::Duration::from_millis(1000 / target_fps as u64);
        let mut capture = capture;

        is_sharing.store(true, Ordering::Relaxed);

        while is_sharing.load(Ordering::Relaxed) {
            let start = std::time::Instant::now();

            match capture.capture_frame(jpeg_quality) {
                Ok(frame_data) => {
                    let frame_url = format!(
                        "{}/api/publish/{}/frame",
                        relay_url_clone, session_id_clone
                    );
                    let _ = blocking_post_bytes(&frame_url, &frame_data, &token_clone, 5);
                }
                Err(e) => {
                    eprintln!("Capture error: {}", e);
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            }

            let elapsed = start.elapsed();
            if elapsed < frame_interval {
                std::thread::sleep(frame_interval - elapsed);
            }
        }

        // Notify relay that session ended
        let stop_url = format!(
            "{}/api/publish/{}/stop",
            relay_url_clone, session_id_clone
        );
        let _ = blocking_post_json(&stop_url, "", &token_clone, 5);

        let _ = app_clone.emit("sharing_stopped", ());
    });

    *state.capture_thread.lock() = Some(capture_handle);
    state.is_sharing.store(true, Ordering::Relaxed);

    // Spawn background polling for chat messages from relay server
    let poll_relay_url = relay_url.clone();
    let poll_session_id = session_id.clone();
    let poll_is_sharing = state.is_sharing.clone();
    let poll_app = app.clone();
    let poll_host_name = state.internet_host_name.lock().clone();
    let internet_poll_handle = tauri::async_runtime::spawn(async move {
        let client = async_client(10);
        let mut last_timestamp: u64 = 0;
        loop {
            if !poll_is_sharing.load(Ordering::Relaxed) { break; }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            if !poll_is_sharing.load(Ordering::Relaxed) { break; }
            let chat_url = format!(
                "{}/api/chat/{}?since={}",
                poll_relay_url, poll_session_id, last_timestamp
            );
            match client.get(&chat_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(data) = resp.json::<serde_json::Value>().await {
                        if let Some(messages) = data.get("messages").and_then(|m| m.as_array()) {
                            for msg in messages {
                                let ts = msg.get("timestamp").and_then(|t| t.as_u64()).unwrap_or(0);
                                if ts > last_timestamp { last_timestamp = ts; }
                                let user = msg.get("user").and_then(|u| u.as_str()).unwrap_or("Guest").to_string();
                                let text = msg.get("text").and_then(|t| t.as_str()).unwrap_or("").to_string();
                                let subtype = msg.get("subtype").and_then(|s| s.as_str()).unwrap_or("").to_string();
                                // Skip host's own messages to prevent duplicates
                                if user == poll_host_name || (poll_host_name.is_empty() && user == "Host") {
                                    continue;
                                }
                                if subtype == "raise_hand" {
                                    let _ = poll_app.emit("raise_hand", serde_json::json!({
                                        "user": user,
                                        "timestamp": ts
                                    }));
                                }
                                let _ = poll_app.emit("chat_message", serde_json::json!({
                                    "user": user,
                                    "text": text,
                                    "timestamp": ts,
                                    "subtype": subtype
                                }));
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    });
    *state.internet_handle.lock() = Some(internet_poll_handle);

    let ip = state.local_ip.clone();
    Ok(SessionInfo {
        is_sharing: true,
        url: viewer_url.clone(),
        ws_url: String::new(),
        local_ip: ip,
        port: 0,
        clients: 0,
        width,
        height,
        fps: target_fps,
        internet_url: Some(viewer_url),
    })
}

#[tauri::command]
pub fn get_internet_relay_url(state: State<ShareState>) -> Result<Option<String>, String> {
    Ok(state.internet_relay_url.lock().clone())
}

#[tauri::command]
pub fn update_internet_profile(
    state: State<ShareState>,
    host_name: Option<String>,
    host_avatar: Option<String>,
    host_bio: Option<String>,
) -> Result<(), String> {
    let relay_url = state.internet_relay_url.lock().clone();
    let session_id = state.internet_session_id.lock().clone();
    let (Some(relay_url), Some(session_id)) = (relay_url, session_id) else {
        return Err("Not internet sharing".to_string());
    };

    let name = host_name.unwrap_or_default();
    let avatar = host_avatar.unwrap_or_default();
    let bio = host_bio.unwrap_or_default();
    *state.internet_host_name.lock() = name.clone();

    let info_url = format!("{}/api/publish/{}/info", relay_url, session_id);
    let body = serde_json::json!({
        "hostName": name,
        "hostAvatar": avatar,
        "hostBio": bio,
    });
    let body_str = body.to_string();
    tauri::async_runtime::spawn(async move {
        let _ = async_client(5).post(&info_url)
            .header("Content-Type", "application/json")
            .body(body_str)
            .send().await;
    });
    Ok(())
}

#[tauri::command]
pub fn update_host_profile(
    state: State<ShareState>,
    host_name: Option<String>,
    host_avatar: Option<String>,
    host_bio: Option<String>,
) -> Result<(), String> {
    let server_state = state.server_state.lock();
    if let Some(ss) = server_state.as_ref() {
        if let Some(name) = host_name {
            *ss.host_name.lock() = name;
        }
        if let Some(avatar) = host_avatar {
            *ss.host_avatar.lock() = avatar;
        }
        if let Some(bio) = host_bio {
            *ss.host_bio.lock() = bio;
        }
        return Ok(());
    }
    Err("Not sharing".to_string())
}

#[tauri::command]
pub fn send_chat(state: State<ShareState>, text: String, subtype: Option<String>) -> Result<(), String> {
    let subtype_str = subtype.unwrap_or_default();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Try LAN sharing first
    let server_state = state.server_state.lock();
    if let Some(ss) = server_state.as_ref() {
        let hn = ss.host_name.lock().clone();
        let host_name = if hn.is_empty() { "Host".to_string() } else { hn };
        let chat_msg = serde_json::json!({
            "type": "chat",
            "user": host_name,
            "text": text,
            "timestamp": timestamp,
            "subtype": subtype_str,
            "clientId": "__host__"
        });
        if let Ok(broadcast_str) = serde_json::to_string(&chat_msg) {
            let _ = ss.chat_tx.send(broadcast_str);
        }
        return Ok(());
    }
    drop(server_state);

    // Try internet sharing — send to relay server
    let relay_url = state.internet_relay_url.lock().clone();
    let session_id = state.internet_session_id.lock().clone();
    if let (Some(relay_url), Some(session_id)) = (relay_url, session_id) {
        let chat_url = format!("{}/api/chat/{}", relay_url, session_id);
        let host_name = state.internet_host_name.lock().clone();
        let host_name = if host_name.is_empty() { "Host".to_string() } else { host_name };
        let body = serde_json::json!({
            "user": host_name,
            "text": text,
            "subtype": subtype_str
        });
        // Spawn async task to send chat to relay
        let chat_url_clone = chat_url.clone();
        let body_str = body.to_string();
        tauri::async_runtime::spawn(async move {
            let _ = async_client(5).post(&chat_url_clone)
                .header("Content-Type", "application/json")
                .body(body_str)
                .send().await;
        });
        return Ok(());
    }

    Err("Not sharing".to_string())
}
