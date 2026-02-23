import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

type Body = {
  score?: unknown;
  difficulty?: unknown;
  device_id?: unknown;
  display_name?: unknown;
  reward_id?: unknown; // ✅ 追加
  user_id?: unknown; // 任意（ログイン時に入れる用：今はnullでもOK）
  is_guest?: unknown; // 任意
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

type IssueOkIssued = {
  ok: true;
  issued: true;
  token: string;
  redeem_url: string;
  expires_at: string | null;
  reward: RewardRow;
};

type IssueOkNotIssued = {
  ok: true;
  issued: false;
  reason: "no_reward" | "already_issued" | "not_eligible" | "invalid_reward";
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

function clampScore(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

function safeName(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "Guest";
  return s.slice(0, 20);
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

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

    const body = (await req.json().catch(() => ({}))) as Body;

    const score = clampScore(body.score);
    const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
    if (!deviceId) return json({ ok: false, error: "device_id missing" } satisfies IssueNg, 200);

    const displayName = safeName(body.display_name);
    const userId = typeof body.user_id === "string" ? body.user_id.trim() : null;
    const isGuest = typeof body.is_guest === "boolean" ? body.is_guest : userId ? false : true;

    const salt = Deno.env.get("IP_HASH_SALT") ?? "change-me";
    const deviceHash = await sha256Hex(`${deviceId}|${salt}`);

    const rewardId =
      typeof body.reward_id === "string" ? body.reward_id.trim() : "";

    const supabase = getClient();
    const now = new Date();

    // ✅ 0) reward_id 指定がある場合：その報酬を取る
    let targetReward: RewardRow | null = null;

    if (rewardId) {
      const { data, error } = await supabase
        .from("coupon_rewards")
        .select("id, store_name, store_info, product_name, score_threshold, coupon_title, description, valid_from, valid_to, is_active")
        .eq("id", rewardId)
        .maybeSingle<RewardRow>();

      if (error) throw error;
      if (!data) {
        return json({ ok: true, issued: false, reason: "invalid_reward" } satisfies IssueOkNotIssued, 200);
      }
      if (!isActiveAndInRange(data, now)) {
        return json({ ok: true, issued: false, reason: "no_reward" } satisfies IssueOkNotIssued, 200);
      }
      if (typeof data.score_threshold === "number" && score < data.score_threshold) {
        return json({ ok: true, issued: false, reason: "not_eligible" } satisfies IssueOkNotIssued, 200);
      }
      targetReward = data;
    } else {
      // ✅ 1) スコア条件を満たす候補を高い順で取る
      const { data: rewards, error: rewErr } = await supabase
        .from("coupon_rewards")
        .select("id, store_name, store_info, product_name, score_threshold, coupon_title, description, valid_from, valid_to, is_active")
        .lte("score_threshold", score)
        .order("score_threshold", { ascending: false })
        .limit(100);

      if (rewErr) throw rewErr;

      const candidates = (rewards ?? []).filter((r: RewardRow) => isActiveAndInRange(r, now));
      if (candidates.length === 0) {
        return json({ ok: true, issued: false, reason: "no_reward" } satisfies IssueOkNotIssued, 200);
      }

      // ✅ 2) 端末がすでに持ってる reward_id 一覧
      const { data: issuedRows, error: issuedErr } = await supabase
        .from("coupon_issuances")
        .select("reward_id")
        .eq("ip_hash", deviceHash);

      if (issuedErr) throw issuedErr;

      const issuedSet = new Set<string>(
        (issuedRows ?? [])
          .map((x: { reward_id?: unknown }) => (typeof x.reward_id === "string" ? x.reward_id : ""))
          .filter(Boolean),
      );

      // ✅ 3) 未発行の中で一番高い reward を選ぶ
      targetReward = candidates.find((r) => !issuedSet.has(String(r.id))) ?? null;
      if (!targetReward) {
        return json({ ok: true, issued: false, reason: "already_issued" } satisfies IssueOkNotIssued, 200);
      }
    }

    // ✅ 4) “種類ごとに端末1回” 最終チェック（reward_id指定でも必須）
    const { data: already, error: alErr } = await supabase
      .from("coupon_issuances")
      .select("token")
      .eq("ip_hash", deviceHash)
      .eq("reward_id", targetReward.id)
      .limit(1);

    if (alErr) throw alErr;

    if ((already ?? []).length > 0) {
      return json({ ok: true, issued: false, reason: "already_issued" } satisfies IssueOkNotIssued, 200);
    }

    // ✅ 5) 発行
    const token = randToken(44);
    const issuedAt = new Date().toISOString();

    const { error: insErr } = await supabase.from("coupon_issuances").insert({
      token,
      reward_id: targetReward.id,
      issued_at: issuedAt,
      used: false,
      used_at: null,
      used_confirmed_at: null,

      ip_hash: deviceHash,     // 端末ハッシュ（列名はip_hashのまま）
      user_name: displayName,  // 使用者名（ゲスト名/ログイン名）
      is_guest: isGuest,
      user_id: userId,
    });

    if (insErr) throw insErr;

    const origin = pickOrigin(req);
    const redeemUrl = origin
      ? `${origin}/game/coupon?token=${encodeURIComponent(token)}`
      : `/game/coupon?token=${encodeURIComponent(token)}`;

    return json(
      {
        ok: true,
        issued: true,
        token,
        redeem_url: redeemUrl,
        expires_at: targetReward.valid_to ?? null,
        reward: targetReward,
      } satisfies IssueOkIssued,
      200,
    );
  } catch (e: unknown) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e) } satisfies IssueNg,
      200,
    );
  }
});