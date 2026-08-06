import { invoke } from "@tauri-apps/api/core";

export interface SessionInfo {
  isSharing: boolean;
  url: string;
  wsUrl: string;
  localIp: string;
  port: number;
  clients: number;
  width: number;
  height: number;
  fps: number;
}

export interface DisplayInfo {
  index: number;
  width: number;
  height: number;
}

export async function startSharing(
  displayIndex?: number,
  quality?: number,
  fps?: number,
  port?: number
): Promise<SessionInfo> {
  return invoke<SessionInfo>("start_sharing", {
    displayIndex: displayIndex ?? null,
    quality: quality ?? null,
    fps: fps ?? null,
    port: port ?? null,
  });
}

export async function stopSharing(): Promise<void> {
  return invoke("stop_sharing");
}

export async function getSessionInfo(): Promise<SessionInfo> {
  return invoke<SessionInfo>("get_session_info");
}

export async function getLocalIp(): Promise<string> {
  return invoke<string>("get_local_ip");
}

export async function getAvailableDisplays(): Promise<DisplayInfo[]> {
  return invoke<DisplayInfo[]>("get_available_displays");
}
