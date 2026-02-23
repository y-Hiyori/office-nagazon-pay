// src/pages/game/lib/guestNameApi.ts
import { supabase } from "../../../lib/supabase";
import { getOrCreateDeviceId } from "./device";

const GUEST_NAME_KEY = "nagazon_guest_name_v1";

export type GuestNameStatus =
  | { ok: true; hasName: true; name: string }
  | { ok: true; hasName: false }
  | { ok: false; error: string };

export function getSavedGuestName(): string | null {
  try {
    const v = (localStorage.getItem(GUEST_NAME_KEY) ?? "").trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

export function setSavedGuestName(name: string) {
  try {
    localStorage.setItem(GUEST_NAME_KEY, name.trim());
  } catch {
    // noop
  }
}

export function clearSavedGuestName() {
  try {
    localStorage.removeItem(GUEST_NAME_KEY);
  } catch {
    // noop
  }
}

function sanitizeName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  return s.slice(0, 12);
}

export async function ensureGuestName(): Promise<GuestNameStatus> {
  const saved = getSavedGuestName();
  if (saved) return { ok: true, hasName: true, name: saved };
  return { ok: true, hasName: false };
}

export async function reserveGuestName(rawName: string): Promise<
  | { ok: true; available: true; name: string }
  | { ok: true; available: false; reason: "taken" }
  | { ok: false; error: string }
> {
  try {
    const name = sanitizeName(rawName);
    if (!name) return { ok: false, error: "名前を入力してください" };

    const device_id = getOrCreateDeviceId();

    const { data, error } = await supabase.functions.invoke("guest-name", {
      body: { name, device_id },
    });

    if (error) return { ok: false, error: error.message };

    const obj = data as any;
    if (obj?.ok !== true) return { ok: false, error: obj?.error ?? "unknown" };

    if (obj.available === false) {
      return { ok: true, available: false, reason: "taken" };
    }

    setSavedGuestName(name);
    return { ok: true, available: true, name };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}