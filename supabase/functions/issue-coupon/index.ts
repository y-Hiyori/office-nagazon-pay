// supabase/functions/issue-coupon/index.ts
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

type Body = {
  score?: unknown;
  difficulty?: unknown;
  device_id?: unknown; // 任意（フロントで送る推奨）
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

type IssuanceExistingRow = {
  token: string | null;
  reward_id: string | null;
  used: boolean | null;
  used_confirmed_at: string | null;
  issued_at: string | null;
  ip_hash: string | null; // 端末ハッシュを保存（列名はip_hashのまま）
  coupon_rewards: RewardRow | null;
};

type IssueOkIssued = {
  ok: true;
  issued: true;
  token: string;
  reward: RewardRow;
  redeem_url: string;
  expires_at: string | null;
  reused?: boolean;
};

type IssueOkNotIssued = {
  ok: true;
  issued: false;
  reason: "no_reward" | "already_issued" | "missing_env";
};

type IssueNg = { ok: false; error: string };

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
  const supabaseUrl =
    Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return null;

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

function randToken(len = 44) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function pickOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) return origin;

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // ignore
    }
  }

  const envOrigin = Deno.env.get("FRONTEND_ORIGIN");
  if (envOrigin) return envOrigin;

  return "";
}

function isIsoDate(s: string | null | undefined) {
  if (!s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function isActiveAndInRange(r: RewardRow, now = new Date()) {
  if (r.is_active === false) return false;

  if (r.valid_from && isIsoDate(r.valid_from)) {
    const vf = new Date(r.valid_from);
    if (now < vf) return false;
  }
  if (r.valid_to && isIsoDate(r.valid_to)) {
    const vt = new Date(r.valid_to);
    if (now > vt) return false;
  }
  return true;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isRewardRow(v: unknown): v is RewardRow {
  return isRecord(v) && typeof v.id === "string";
}

function isExistingRow(v: unknown): v is IssuanceExistingRow {
  if (!isRecord(v)) return false;
  const token = v.token;
  const cr = (v as Record<string, unknown>)["coupon_rewards"];
  if (!(typeof token === "string" || token === null || token === undefined))
    return false;
  if (cr !== null && cr !== undefined && !isRewardRow(cr)) return false;
  return true;
}

/**
 * ✅ device_id が無くても動くためのフォールバック
 * - 端末IDがあるならそれを最優先
 * - 無いなら (x-forwarded-for / cf-connecting-ip) + user-agent を材料にする
 */
async function computeDeviceHash(req: Request, body: Body): Promise<string> {
  const salt = Deno.env.get("IP_HASH_SALT") ?? "change-me";

  const deviceId =
    typeof body.device_id === "string" ? body.device_id.trim() : "";

  const ua = req.headers.get("user-agent") ?? "";
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const cfi = req.headers.get("cf-connecting-ip") ?? "";

  const basis = deviceId
    ? `device:${deviceId}`
    : `fallback:${(cfi || xff || "").split(",")[0].trim()}|ua:${ua}`;

  return await sha256Hex(`${basis}|${salt}`);
}

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

    const body: Body = (await req.json().catch(() => ({}))) as Body;

    const scoreRaw = body?.score;
    const score =
      typeof scoreRaw === "number"
        ? Math.max(0, Math.floor(scoreRaw))
        : typeof scoreRaw === "string"
          ? Math.max(0, Math.floor(Number(scoreRaw)))
          : 0;

    const supabase = getClient();
    if (!supabase) {
      const res: IssueOkNotIssued = { ok: true, issued: false, reason: "missing_env" };
      return json(res, 200);
    }

    // threshold <= score の中で一番高い報酬
    const { data: rewards, error: rewErr } = await supabase
      .from("coupon_rewards")
      .select(
        "id, store_name, store_info, product_name, score_threshold, coupon_title, description, valid_from, valid_to, is_active"
      )
      .lte("score_threshold", score)
      .order("score_threshold", { ascending: false })
      .limit(10);

    if (rewErr) throw rewErr;

    const now = new Date();
    const reward =
      (rewards ?? []).find((r: RewardRow) => isActiveAndInRange(r, now)) ?? null;

    if (!reward) {
      const res: IssueOkNotIssued = { ok: true, issued: false, reason: "no_reward" };
      return json(res, 200);
    }

    // ✅ 端末ハッシュ（列は ip_hash を流用）
    const ipHash = await computeDeviceHash(req, body);

    // 既に同じ端末で発行済みなら、そのtokenを返す
    const { data: existingRaw, error: exErr } = await supabase
      .from("coupon_issuances")
      .select(
        "token, reward_id, used, used_confirmed_at, issued_at, ip_hash, coupon_rewards(id, store_name, store_info, product_name, score_threshold, coupon_title, description, valid_from, valid_to, is_active)"
      )
      .eq("ip_hash", ipHash)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (exErr) throw exErr;

    const existing: IssuanceExistingRow | null =
      existingRaw && isExistingRow(existingRaw) ? (existingRaw as IssuanceExistingRow) : null;

    if (existing?.token) {
      const token = String(existing.token);
      const rewardForView = existing.coupon_rewards ?? reward;

      const origin = pickOrigin(req);
      const redeemUrl = origin
        ? `${origin}/game/coupon-redeem?token=${encodeURIComponent(token)}`
        : `/game/coupon-redeem?token=${encodeURIComponent(token)}`;

      const res: IssueOkIssued = {
        ok: true,
        issued: true,
        token,
        reward: rewardForView,
        redeem_url: redeemUrl,
        expires_at: rewardForView?.valid_to ?? null,
        reused: true,
      };
      return json(res, 200);
    }

    // 新規発行
    const token = randToken(44);
    const issuedAt = new Date().toISOString();

    const { error: insErr } = await supabase.from("coupon_issuances").insert({
      token,
      reward_id: reward.id,
      issued_at: issuedAt,
      used: false,
      used_at: null,
      used_confirmed_at: null,
      ip_hash: ipHash,
    });

    if (insErr) throw insErr;

    const origin = pickOrigin(req);
    const redeemUrl = origin
      ? `${origin}/game/coupon-redeem?token=${encodeURIComponent(token)}`
      : `/game/coupon-redeem?token=${encodeURIComponent(token)}`;

    const res: IssueOkIssued = {
      ok: true,
      issued: true,
      token,
      reward,
      redeem_url: redeemUrl,
      expires_at: reward.valid_to ?? null,
    };
    return json(res, 200);
  } catch (e) {
    const res: IssueNg = { ok: false, error: errToString(e) };
    return json(res, 200);
  }
});