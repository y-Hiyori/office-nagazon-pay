// src/pages/game/lib/device.ts
const DEVICE_ID_KEY = "nagazon_device_id_v1";

function randHex(len: number) {
  const bytes = new Uint8Array(Math.ceil(len / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 16) return existing;

    const id = `d_${randHex(32)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    // localStorageが使えない環境の保険（毎回変わるけど落ちない）
    return `d_${randHex(32)}`;
  }
}