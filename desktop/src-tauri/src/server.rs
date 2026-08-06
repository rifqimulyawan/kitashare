use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Html,
    routing::get,
    Router,
};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::broadcast;
use futures_util::{StreamExt, SinkExt};

#[derive(Clone, serde::Serialize)]
pub struct ChatMessage {
    pub user: String,
    pub text: String,
    pub timestamp: u64,
}

pub struct ServerState {
    pub frame_tx: broadcast::Sender<Arc<Vec<u8>>>,
    pub chat_tx: broadcast::Sender<String>,
    pub client_count: Arc<AtomicUsize>,
    pub chat_messages: Arc<Mutex<Vec<ChatMessage>>>,
    pub width: usize,
    pub height: usize,
    pub fps: u32,
}

pub static VIEWER_HTML: &str = include_str!("../resources/viewer/index.html");

pub async fn start_server(port: u16, state: Arc<ServerState>) -> Result<tokio::task::JoinHandle<()>, String> {
    let app = Router::new()
        .route("/", get(viewer_handler))
        .route("/ws", get(ws_handler))
        .route("/api/info", get(info_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .map_err(|e| format!("Failed to bind port {}: {}", port, e))?;

    let handle = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("Server error: {}", e);
        }
    });

    Ok(handle)
}

async fn viewer_handler() -> Html<&'static str> {
    Html(VIEWER_HTML)
}

async fn info_handler(State(state): State<Arc<ServerState>>) -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "width": state.width,
        "height": state.height,
        "fps": state.fps,
        "clients": state.client_count.load(Ordering::Relaxed),
    }))
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<ServerState>>,
) -> axum::response::Response {
    ws.on_upgrade(move |socket| handle_ws_connection(socket, state))
}

async fn handle_ws_connection(socket: WebSocket, state: Arc<ServerState>) {
    state.client_count.fetch_add(1, Ordering::Relaxed);

    let (mut sender, mut receiver) = socket.split();
    let mut frame_rx = state.frame_tx.subscribe();
    let mut chat_rx = state.chat_tx.subscribe();

    // Send initial info
    {
        let info = serde_json::json!({
            "type": "info",
            "width": state.width,
            "height": state.height,
            "fps": state.fps
        });
        if let Ok(text) = serde_json::to_string(&info) {
            let _ = sender.send(Message::Text(text)).await;
        }
    }

    // Send recent chat history
    {
        let history_json = {
            let messages = state.chat_messages.lock();
            if messages.is_empty() {
                None
            } else {
                let recent: Vec<&ChatMessage> = messages.iter().rev().take(50).collect();
                let history = serde_json::json!({
                    "type": "chat_history",
                    "messages": recent.iter().rev().cloned().collect::<Vec<_>>()
                });
                serde_json::to_string(&history).ok()
            }
        };
        if let Some(text) = history_json {
            let _ = sender.send(Message::Text(text)).await;
        }
    }

    // Combined sender task: forwards both frames and chat to this client
    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                result = frame_rx.recv() => {
                    match result {
                        Ok(frame) => {
                            let mut buf = Vec::with_capacity(frame.len() + 4);
                            buf.push(0x01); // Type: video frame
                            let len = frame.len() as u32;
                            buf.push((len >> 16) as u8);
                            buf.push((len >> 8) as u8);
                            buf.push(len as u8);
                            buf.extend_from_slice(&frame);

                            if sender.send(Message::Binary(buf)).await.is_err() {
                                break;
                            }
                        }
                        Err(broadcast::error::RecvError::Closed) => break,
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    }
                }
                result = chat_rx.recv() => {
                    match result {
                        Ok(text) => {
                            if sender.send(Message::Text(text)).await.is_err() {
                                break;
                            }
                        }
                        Err(broadcast::error::RecvError::Closed) => break,
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    }
                }
            }
        }
    });

    // Message receiving task (chat from this client)
    let chat_messages = state.chat_messages.clone();
    let chat_tx = state.chat_tx.clone();
    let client_count = state.client_count.clone();

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                        let msg_type = parsed.get("type").and_then(|t| t.as_str()).unwrap_or("");

                        if msg_type == "chat" {
                            let user = parsed
                                .get("user")
                                .and_then(|u| u.as_str())
                                .unwrap_or("Guest")
                                .to_string();
                            let text = parsed
                                .get("text")
                                .and_then(|t| t.as_str())
                                .unwrap_or("")
                                .to_string();

                            if text.trim().is_empty() || text.len() > 1000 {
                                continue;
                            }

                            let chat_msg = ChatMessage {
                                user: user.clone(),
                                text: text.clone(),
                                timestamp: std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_secs(),
                            };

                            {
                                let mut messages = chat_messages.lock();
                                messages.push(chat_msg.clone());
                                if messages.len() > 200 {
                                    let drain_to = messages.len() - 200;
                                    messages.drain(0..drain_to);
                                }
                            }

                            let broadcast = serde_json::json!({
                                "type": "chat",
                                "user": chat_msg.user,
                                "text": chat_msg.text,
                                "timestamp": chat_msg.timestamp
                            });
                            if let Ok(broadcast_str) = serde_json::to_string(&broadcast) {
                                let _ = chat_tx.send(broadcast_str);
                            }
                        }
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => {
            recv_task.abort();
        }
        _ = &mut recv_task => {
            send_task.abort();
        }
    }

    client_count.fetch_sub(1, Ordering::Relaxed);
}
