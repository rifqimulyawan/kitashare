use crate::capture::ScreenCapture;
use crate::server::{self, ServerState};
use local_ip_address::local_ip;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{Emitter, State};
use tokio::sync::broadcast;

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
    pub local_ip: String,
    pub display_index: usize,
    pub quality: u8,
    pub fps: u32,
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
            local_ip: ip,
            display_index: 0,
            quality: 75,
            fps: 30,
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
    let server_state = Arc::new(ServerState {
        frame_tx: frame_tx.clone(),
        chat_tx: chat_tx.clone(),
        raise_hand_tx: raise_hand_tx.clone(),
        client_count: state.client_count.clone(),
        chat_messages: Arc::new(parking_lot::Mutex::new(Vec::new())),
        width,
        height,
        fps: target_fps,
        host_name: host_name.unwrap_or_default(),
        host_avatar: host_avatar.unwrap_or_default(),
        host_bio: host_bio.unwrap_or_default(),
        shared_files: Arc::new(parking_lot::Mutex::new(Vec::new())),
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
    })
}

#[tauri::command]
pub fn stop_sharing(state: State<ShareState>) -> Result<(), String> {
    state.is_sharing.store(false, Ordering::Relaxed);

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

    *state.server_state.lock() = None;
    *state.active_port.lock() = None;
    state.client_count.store(0, Ordering::Relaxed);

    Ok(())
}

#[tauri::command]
pub fn get_session_info(state: State<ShareState>) -> Result<SessionInfo, String> {
    let is_sharing = state.is_sharing.load(Ordering::Relaxed);
    let clients = state.client_count.load(Ordering::Relaxed);
    let ip = state.local_ip.clone();
    let port = state.active_port.lock().unwrap_or(state.server_port);

    let (width, height, fps) = if let Some(ss) = state.server_state.lock().as_ref() {
        (ss.width, ss.height, ss.fps)
    } else {
        (0, 0, 0)
    };

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

#[tauri::command]
pub fn share_files(state: State<ShareState>, files: Vec<String>) -> Result<Vec<SharedFileInfo>, String> {
    let server_state = state.server_state.lock().clone()
        .ok_or("Not sharing")?;
    let mut shared = server_state.shared_files.lock();
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
    Ok(result)
}

#[tauri::command]
pub fn clear_files(state: State<ShareState>) -> Result<(), String> {
    let server_state = state.server_state.lock().clone()
        .ok_or("Not sharing")?;
    server_state.shared_files.lock().clear();
    Ok(())
}

#[tauri::command]
pub fn remove_file(state: State<ShareState>, file_id: usize) -> Result<(), String> {
    let server_state = state.server_state.lock().clone()
        .ok_or("Not sharing")?;
    server_state.shared_files.lock().retain(|f| f.id != file_id);
    Ok(())
}
