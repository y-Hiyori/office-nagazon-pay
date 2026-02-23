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
  return safeStr(v).trim().normalize("NFKC");
}

type IssuanceRow = {
  token: string;
  reward_id: string | null;
  used: boolean | null;
  used_at: string | null;
  used_confirmed_at: string | null;
  user_name: string | null;
};

type RewardView = {
  store_name: string | null;
  store_info: string | null;
  product_name: string | null;
  coupon_title: string | null;
  description: string | null;
  valid_from: string | null;
  valid_to: string | null;
};

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
      .maybeSingle();

    if (issErr) throw issErr;
    if (!issuance) return json({ ok: true, found: false }, 200);

    const row = issuance as IssuanceRow;

    // ② reward 取得（reward_id があれば）
    let reward: RewardView | null = null;
    if (row.reward_id) {
      const { data: r, error: rErr } = await supabase
        .from("coupon_rewards")
        .select("store_name, store_info, product_name, coupon_title, description, valid_from, valid_to")
        .eq("id", row.reward_id)
        .maybeSingle();

      if (rErr) throw rErr;
      reward = (r ?? null) as RewardView | null;
    }

    // status
    if (action === "status") {
      return json(
        {
          ok: true,
          found: true,
          used: !!row.used,
          used_at: row.used_at ?? null,
          used_confirmed_at: row.used_confirmed_at ?? null,
          user_name: row.user_name ?? null,
          reward,
        },
        200,
      );
    }

    // confirm：パスワードが設定されてる時だけ要求
    const requiredRaw = Deno.env.get("REDEEM_PASSWORD") ?? "";
    const required = requiredRaw.trim().normalize("NFKC");

    if (required.length > 0) {
      const pw = normalizePw(body.password);
      if (!pw || pw !== required) {
        return json({ ok: false, error: "password invalid" }, 200);
      }
    }

    const already = !!row.used_confirmed_at;
    if (already) {
      return json(
        {
          ok: true,
          found: true,
          confirmed: true,
          already: true,
          reward,
          user_name: row.user_name ?? null,
        },
        200,
      );
    }

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
        user_name: row.user_name ?? null,
      },
      200,
    );
  } catch (e: unknown) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});