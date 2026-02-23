// supabase/functions/coupon-issued/index.ts
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

type Body = {
  reward_id?: unknown;
  device_id?: unknown;
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
  const serviceRoleKey =
    Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

    const body = (await req.json().catch(() => ({}))) as Body;

    const rewardId = safeStr(body.reward_id);
    const deviceId = safeStr(body.device_id);

    if (!rewardId) return json({ ok: false, error: "reward_id missing" }, 200);
    if (!deviceId) return json({ ok: false, error: "device_id missing" }, 200);

    const salt = Deno.env.get("IP_HASH_SALT") ?? "change-me";
    const deviceHash = await sha256Hex(`${deviceId}|${salt}`);

    const supabase = getClient();

    const { data, error } = await supabase
      .from("coupon_issuances")
      .select("token, used_confirmed_at, issued_at")
      .eq("ip_hash", deviceHash)
      .eq("reward_id", rewardId)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data?.token) return json({ ok: true, found: false }, 200);

    return json(
      {
        ok: true,
        found: true,
        token: String(data.token),
        used_confirmed_at: data.used_confirmed_at ?? null,
        issued_at: data.issued_at ?? null,
      },
      200
    );
  } catch (e: unknown) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});