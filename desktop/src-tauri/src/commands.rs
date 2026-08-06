use crate::capture::ScreenCapture;
use crate::server::{self, ServerState};
use local_ip_address::local_ip;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::State;
use tokio::sync::broadcast;

pub struct ShareState {
    pub server_port: u16,
    pub active_port: parking_lot::Mutex<Option<u16>>,
    pub is_sharing: Arc<AtomicBool>,
    pub client_count: Arc<AtomicUsize>,
    pub capture_thread: Mutex<Option<thread::JoinHandle<()>>>,
    pub server_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
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
    state: State<ShareState>,
    display_index: Option<usize>,
    quality: Option<u8>,
    fps: Option<u32>,
    port: Option<u16>,
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

    // Create server state
    let server_state = Arc::new(ServerState {
        frame_tx: frame_tx.clone(),
        chat_tx: chat_tx.clone(),
        client_count: state.client_count.clone(),
        chat_messages: Arc::new(parking_lot::Mutex::new(Vec::new())),
        width,
        height,
        fps: target_fps,
    });

    // Start HTTP + WebSocket server in background
    let server_state_clone = server_state.clone();
    let server_handle = tauri::async_runtime::block_on(async {
        server::start_server(server_port, server_state_clone).await
    })?;

    // Save active port
    *state.active_port.lock() = Some(server_port);

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
