// src/pages/game/lib/guestName.ts

const DEVICE_ID_KEY = "nagazon_device_id_v1";
const GUEST_NAME_KEY = "nagazon_guest_name_v1";

function randId(len = 32) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export function getOrCreateDeviceId(): string {
  try {
    const cur = (localStorage.getItem(DEVICE_ID_KEY) ?? "").trim();
    if (cur) return cur;
    const id = `dev_${randId(36)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    // localStorage不可でも最低限動かす（ただし端末固定できない）
    return `dev_mem_${randId(36)}`;
  }
}

export function getSavedGuestName(): string | null {
  try {
    const v = (localStorage.getItem(GUEST_NAME_KEY) ?? "").trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

export function setSavedGuestName(name: string): void {
  try {
    localStorage.setItem(GUEST_NAME_KEY, name);
  } catch {
    // noop
  }
}

export function clearSavedGuestName(): void {
  try {
    localStorage.removeItem(GUEST_NAME_KEY);
  } catch {
    // noop
  }
}

export function normalizeGuestName(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  const cleaned = s.replace(/\s+/g, " ").trim();
  // ルール：1〜12文字（guest-name関数と合わせる）
  if (!cleaned) return "";
  return cleaned.slice(0, 12);
}