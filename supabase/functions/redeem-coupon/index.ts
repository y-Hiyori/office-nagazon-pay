// supabase/functions/redeem-coupon/index.ts
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function getClient() {
  const supabaseUrl = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("PROJECT_URL / SERVICE_ROLE_KEY is missing");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizePw(v: unknown): string {
  // 前後空白除去 + 全角/半角などを統一
  return safeStr(v).trim().normalize("NFKC");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type IssuanceRow = {
  token: string;
  reward_id: string | null;
  used: boolean | null;
  used_at: string | null;
  used_confirmed_at: string | null;
  user_name: string | null;
};

type RewardRow = {
  id: string;
  store_name: string | null;
  store_info: string | null;
  product_name: string | null;
  coupon_title: string | null;
  description: string | null;
  valid_from: string | null;
  valid_to: string | null;
  redeem_password_hash: string | null;
};

type RewardView = Omit<RewardRow, "id" | "redeem_password_hash">;

function toRewardView(r: RewardRow): RewardView {
  return {
    store_name: r.store_name ?? null,
    store_info: r.store_info ?? null,
    product_name: r.product_name ?? null,
    coupon_title: r.coupon_title ?? null,
    description: r.description ?? null,
    valid_from: r.valid_from ?? null,
    valid_to: r.valid_to ?? null,
  };
}

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = safeStr(body.action).trim() || "confirm";
    const token = safeStr(body.token).trim();

    if (!token) return json({ ok: false, error: "token missing" }, 200);

    const supabase = getClient();

    // ① issuance 取得
    const { data: issuance, error: issErr } = await supabase
      .from("coupon_issuances")
      .select("token, reward_id, used, used_at, used_confirmed_at, user_name")
      .eq("token", token)
      .maybeSingle<IssuanceRow>();

    if (issErr) throw issErr;
    if (!issuance) return json({ ok: true, found: false }, 200);

    // ② reward 取得（reward_id が無いなら reward は null）
    let rewardRow: RewardRow | null = null;
    if (issuance.reward_id) {
      const { data: r, error: rErr } = await supabase
        .from("coupon_rewards")
        .select(
          "id, store_name, store_info, product_name, coupon_title, description, valid_from, valid_to, redeem_password_hash",
        )
        .eq("id", issuance.reward_id)
        .maybeSingle<RewardRow>();

      if (rErr) throw rErr;
      rewardRow = r ?? null;
    }

    const reward: RewardView | null = rewardRow ? toRewardView(rewardRow) : null;

    // status
    if (action === "status") {
      return json(
        {
          ok: true,
          found: true,
          used: !!issuance.used,
          used_at: issuance.used_at ?? null,
          used_confirmed_at: issuance.used_confirmed_at ?? null,
          user_name: issuance.user_name ?? null,
          reward,
        },
        200,
      );
    }

    // confirm：報酬にパスワードが設定されている時だけチェック
    const requiredHash = (rewardRow?.redeem_password_hash ?? "").trim();
    if (requiredHash) {
      const pw = normalizePw(body.password);
      if (!pw) return json({ ok: false, error: "password invalid" }, 200);

      const pwHash = await sha256Hex(pw);
      if (pwHash !== requiredHash) {
        return json({ ok: false, error: "password invalid" }, 200);
      }
    }

    // 既に確定済みならそのまま返す
    if (issuance.used_confirmed_at) {
      return json(
        {
          ok: true,
          found: true,
          confirmed: true,
          already: true,
          reward,
          user_name: issuance.user_name ?? null,
        },
        200,
      );
    }

    // 確定更新
    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("coupon_issuances")
      .update({ used: true, used_confirmed_at: now, used_at: now })
      .eq("token", token);

    if (updErr) throw updErr;

    return json(
      {
        ok: true,
        found: true,
        confirmed: true,
        reward,
        user_name: issuance.user_name ?? null,
      },
      200,
    );
  } catch (e: unknown) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});