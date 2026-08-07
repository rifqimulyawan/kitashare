import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

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
  port?: number,
  hostName?: string,
  hostAvatar?: string,
  hostBio?: string,
): Promise<SessionInfo> {
  return invoke<SessionInfo>("start_sharing", {
    displayIndex: displayIndex ?? null,
    quality: quality ?? null,
    fps: fps ?? null,
    port: port ?? null,
    hostName: hostName ?? null,
    hostAvatar: hostAvatar ?? null,
    hostBio: hostBio ?? null,
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

export async function onRaiseHand(
  callback: (payload: { user: string; timestamp: number }) => void
): Promise<UnlistenFn> {
  return listen<{ user: string; timestamp: number }>("raise_hand", (event) => {
    callback(event.payload);
  });
}

export async function onChatMessage(
  callback: (payload: { user: string; text: string; timestamp: number; subtype: string }) => void
): Promise<UnlistenFn> {
  return listen<{ user: string; text: string; timestamp: number; subtype: string }>("chat_message", (event) => {
    callback(event.payload);
  });
}

export interface SharedFileInfo {
  id: number;
  name: string;
  size: number;
}

export async function shareFiles(files: string[]): Promise<SharedFileInfo[]> {
  return invoke<SharedFileInfo[]>("share_files", { files });
}

export async function clearFiles(): Promise<void> {
  return invoke("clear_files");
}

export async function removeFile(fileId: number): Promise<void> {
  return invoke("remove_file", { fileId });
}

export async function openFileDialog(): Promise<string[]> {
  const result = await open({
    multiple: true,
    title: "Select files to share",
  });
  if (!result) return [];
  if (Array.isArray(result)) return result as string[];
  return [result as string];
}
