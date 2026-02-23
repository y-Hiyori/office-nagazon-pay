// supabase/functions/guest-name/index.ts
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

type Body = {
  name?: unknown;
  device_id?: unknown;
};

type RegistryRow = {
  name: string;
  device_hash: string;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function getClient() {
  const supabaseUrl =
    Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("PROJECT_URL / SERVICE_ROLE_KEY is missing");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeName(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  const cleaned = s.replace(/\s+/g, " ");
  if (!cleaned) return "";
  // ルール：1〜12文字（必要なら調整）
  return cleaned.slice(0, 12);
}

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

    const body = (await req.json().catch(() => ({}))) as Body;

    const name = safeName(body.name);
    const deviceId =
      typeof body.device_id === "string" ? body.device_id.trim() : "";

    if (!name) return json({ ok: false, error: "name is empty" }, 200);
    if (!deviceId) return json({ ok: false, error: "device_id missing" }, 200);

    const salt = Deno.env.get("IP_HASH_SALT") ?? "change-me";
    const deviceHash = await sha256Hex(`${deviceId}|${salt}`);

    const supabase = getClient();

    // ① この name が他端末に取られてないか確認（全体一意）
    const { data: nameOwner, error: nameOwnerErr } = await supabase
      .from("guest_name_registry")
      .select("name, device_hash")
      .eq("name", name)
      .maybeSingle<RegistryRow>();

    if (nameOwnerErr) throw nameOwnerErr;

    if (nameOwner?.name && nameOwner.device_hash !== deviceHash) {
      return json({ ok: true, available: false, reason: "taken" }, 200);
    }

    // ② 端末の現在名（変更前）を取る
    const { data: current, error: currentErr } = await supabase
      .from("guest_name_registry")
      .select("name, device_hash")
      .eq("device_hash", deviceHash)
      .maybeSingle<RegistryRow>();

    if (currentErr) throw currentErr;

    // ③ 同端末が別名を持っていた場合、古い名前行を削除（UNIQUE(name)対策）
    // ※ current があるなら、この device_hash の行が1つあるはず
    // ただし name を変えるなら、upsert前に明示削除して安全にする
    if (current?.name && current.name !== name) {
      const { error: delErr } = await supabase
        .from("guest_name_registry")
        .delete()
        .eq("device_hash", deviceHash);

      if (delErr) throw delErr;
    }

    // ④ device_hash をキーに upsert（同端末は上書き）
    const { error: upErr } = await supabase
      .from("guest_name_registry")
      .upsert(
        { name, device_hash: deviceHash },
        { onConflict: "device_hash" },
      );

    if (upErr) throw upErr;

    return json(
      {
        ok: true,
        available: true,
        reserved: true,
        name,
      },
      200,
    );
  } catch (e: unknown) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      200,
    );
  }
});