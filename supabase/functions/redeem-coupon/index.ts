// supabase/functions/redeem-coupon/index.ts
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

type Body = {
  token?: unknown;
  confirm?: unknown;
  password?: unknown;
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
  redeem_password_hash: string | null;
};

type IssuanceJoinRow = {
  token: string;
  used: boolean | null;
  used_at: string | null;
  used_confirmed_at: string | null;
  reward_id: string | null;
  coupon_rewards: RewardRow | null;
};

type OkFound = {
  ok: true;
  found: true;
  used: boolean;
  used_at: string | null;
  used_confirmed_at: string | null;
  reward: RewardRow | null;
};

type OkNotFound = { ok: true; found: false };

type Ng = { ok: false; error: string };

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: OkFound | OkNotFound | Ng, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
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

function getClient() {
  const supabaseUrl = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("PROJECT_URL / SERVICE_ROLE_KEY is missing");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isRewardRow(v: unknown): v is RewardRow {
  if (!isRecord(v)) return false;
  return typeof v.id === "string";
}

function isIssuanceJoinRow(v: unknown): v is IssuanceJoinRow {
  if (!isRecord(v)) return false;
  if (typeof v.token !== "string") return false;

  const cr = (v as Record<string, unknown>)["coupon_rewards"];
  if (cr !== null && cr !== undefined && !isRewardRow(cr)) return false;

  return true;
}

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

    const body: Body = (await req.json().catch(() => ({}))) as Body;

    const token = typeof body.token === "string" ? body.token.trim() : "";
    const confirm = body.confirm === true;

    if (!token || token.length < 10) return json({ ok: false, error: "token invalid" }, 200);

    const supabase = getClient();

    const { data: raw, error } = await supabase
      .from("coupon_issuances")
      .select(
        "token, used, used_at, used_confirmed_at, reward_id, coupon_rewards(id, store_name, store_info, product_name, score_threshold, coupon_title, description, valid_from, valid_to, is_active, redeem_password_hash)"
      )
      .eq("token", token)
      .maybeSingle();

    if (error) throw error;

    if (!raw) return json({ ok: true, found: false }, 200);

    if (!isIssuanceJoinRow(raw)) {
      return json({ ok: false, error: "response shape mismatch" }, 200);
    }

    const used = Boolean(raw.used);
    const used_at = raw.used_at ?? null;
    const used_confirmed_at = raw.used_confirmed_at ?? null;
    const reward = raw.coupon_rewards ?? null;

    // ✅ 状態確認だけ
    if (!confirm) {
      return json(
        {
          ok: true,
          found: true,
          used,
          used_at,
          used_confirmed_at,
          reward,
        },
        200
      );
    }

    // ✅ confirm=true はパスワード必須
    const pw = typeof body.password === "string" ? body.password.trim() : "";
    if (pw.length < 4) return json({ ok: false, error: "password required" }, 200);

    const storedHash = reward?.redeem_password_hash ?? null;
    if (!storedHash) return json({ ok: false, error: "password not set for this coupon" }, 200);

    const inputHash = await sha256Hex(pw);
    if (inputHash !== storedHash) return json({ ok: false, error: "password mismatch" }, 200);

    // すでに確定済み
    if (used || used_confirmed_at) {
      return json(
        {
          ok: true,
          found: true,
          used: true,
          used_at,
          used_confirmed_at,
          reward,
        },
        200
      );
    }

    // ✅ 確定（used_confirmed_at を入れる）
    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("coupon_issuances")
      .update({ used: true, used_at: now, used_confirmed_at: now })
      .eq("token", token);

    if (updErr) throw updErr;

    return json(
      {
        ok: true,
        found: true,
        used: true,
        used_at: now,
        used_confirmed_at: now,
        reward,
      },
      200
    );
  } catch (e) {
    return json({ ok: false, error: errToString(e) }, 200);
  }
});