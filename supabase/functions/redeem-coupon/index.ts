// supabase/functions/redeem-coupon/index.ts
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

type RedeemBody = {
  token?: unknown;
  confirm?: unknown;
};

type RewardRow = {
  id: string;
  store_name: string | null;
  store_info: string | null;
  product_name: string | null;
  score_threshold: number | null;
  coupon_title: string | null;
  description: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean | null;
};

type IssuanceRow = {
  id: string;
  used: boolean | null;
  used_at: string | null;
  used_confirmed_at: string | null;
  used_ip_hash?: string | null;
  reward_id: string;
  token: string;
  issued_at: string | null;
  coupon_rewards: RewardRow | null;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
  });
}

function getClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY is missing");
  }

  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function getIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip.trim();
  return "unknown";
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function errToString(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isRewardRow(v: unknown): v is RewardRow {
  return isRecord(v) && typeof v.id === "string";
}

function isIssuanceRow(v: unknown): v is IssuanceRow {
  if (!isRecord(v)) return false;
  if (typeof v.id !== "string") return false;
  if (typeof v.reward_id !== "string") return false;
  if (typeof v.token !== "string") return false;

  const cr = (v as Record<string, unknown>)["coupon_rewards"];
  if (cr !== null && cr !== undefined && !isRewardRow(cr)) return false;

  return true;
}

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

    const body: RedeemBody = (await req.json().catch(() => ({}))) as RedeemBody;
    const token = body?.token;
    const confirm = body?.confirm;

    if (typeof token !== "string" || token.trim().length < 10) {
      return json({ ok: false, error: "token is required" }, 400);
    }

    const supabase = getClient();

    const { data, error } = await supabase
      .from("coupon_issuances")
      .select("id, used, used_at, used_confirmed_at, reward_id, token, issued_at, coupon_rewards(*)")
      .eq("token", token.trim())
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return json({ ok: true, found: false });
    }

    if (!isIssuanceRow(data)) {
      return json({ ok: false, error: "unexpected data shape" }, 500);
    }

    const reward = data.coupon_rewards;

    if (data.used) {
      return json({
        ok: true,
        found: true,
        used: true,
        used_at: data.used_at,
        used_confirmed_at: data.used_confirmed_at ?? null,
        reward,
      });
    }

    if (confirm !== true) {
      return json({
        ok: true,
        found: true,
        used: false,
        used_at: data.used_at,
        used_confirmed_at: data.used_confirmed_at ?? null,
        reward,
      });
    }

    const ip = getIp(req);
    const salt = Deno.env.get("IP_HASH_SALT") ?? "change-me";
    const usedIpHash = await sha256Hex(`${ip}|${salt}`);
    const now = new Date().toISOString();

    const { error: updErr } = await supabase
      .from("coupon_issuances")
      .update({
        used: true,
        used_at: now,
        used_confirmed_at: now,
        used_ip_hash: usedIpHash,
      })
      .eq("id", data.id)
      .eq("used", false);

    if (updErr) throw updErr;

    return json({
      ok: true,
      found: true,
      used: true,
      used_at: now,
      used_confirmed_at: now,
      reward,
    });
  } catch (e) {
    return json({ ok: false, error: errToString(e) }, 500);
  }
});