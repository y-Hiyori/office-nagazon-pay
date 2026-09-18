// supabase/functions/guest-checkout/index.ts
// ゲスト（アカウント未登録）の「0円購入（クーポン適用）」を service role で完結させる
// 匿名ユーザーは RLS で orders / order_items に書き込めないため、この関数が注文作成・在庫減算・paid反映を担う
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
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
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("PROJECT_URL / SERVICE_ROLE_KEY is missing");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function yen(v: unknown): number {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

    const sb = getClient();

    const body = (await req.json().catch(() => ({}))) as {
      token?: unknown;
      total?: unknown;
      subtotal?: unknown;
      discountYen?: unknown;
      coupon?: unknown;
      fulfillmentType?: unknown;
      buyer?: Record<string, unknown>;
      items?: Record<string, unknown>[];
    };

    const token = typeof body.token === "string" ? body.token.trim() : "";
    const total = yen(body.total);
    const subtotal = yen(body.subtotal);
    const discountYen = yen(body.discountYen);
    const coupon = body.coupon ? String(body.coupon).trim().toUpperCase() : "";
    const buyer = body.buyer || {};
    const items = Array.isArray(body.items) ? body.items : [];

    const bName = String(buyer.name || "").trim();
    const bEmail = String(buyer.email || "").trim();
    const bPhone = String(buyer.phone || "").trim();
    const bPostal = String(buyer.postalCode || "").trim().replace(/[-－\s]/g, "");
    const bAddress = String(buyer.address || "").trim();
    const bBuilding = String(buyer.building || "").trim();

    const fulfillmentType =
      String(body.fulfillmentType || "").toLowerCase() === "shipping" ? "shipping" : "pickup";

    if (!token) return json({ ok: false, error: "token is required" });
    // 購入者情報は本名・メールのみ必須（電話・住所は任意項目）
    if (!bName || !bEmail) {
      return json({ ok: false, error: "buyer info is incomplete" });
    }
    if (items.length === 0) return json({ ok: false, error: "items is empty" });
    // この関数は0円注文専用（PayPayルートは server.cjs 側で処理）
    if (total !== 0) return json({ ok: false, error: "only 0yen orders are allowed here" });
    if (subtotal < 0) return json({ ok: false, error: "subtotal must be non-negative" });

    // クーポンの厳密な再チェック（0円になる根拠をサーバー側でも検証）
    let discount = 0;
    if (coupon) {
      const nowIso = new Date().toISOString();
      const { data: c, error: cErr } = await sb
        .from("coupons")
        .select(
          "code, discount_type, discount_value, max_discount_yen, min_subtotal, is_active, starts_at, ends_at, usage_limit, used_count, audience, per_user_limit, target_scope"
        )
        .eq("code", coupon)
        .maybeSingle();

      if (cErr) throw cErr;
      if (!c) return json({ ok: false, error: "coupon not found" });
      if (!c.is_active) return json({ ok: false, error: "coupon is inactive" });
      if (c.starts_at && nowIso < c.starts_at) return json({ ok: false, error: "coupon not started" });
      if (c.ends_at && nowIso > c.ends_at) return json({ ok: false, error: "coupon expired" });
      if (c.min_subtotal != null && subtotal < Number(c.min_subtotal)) {
        return json({ ok: false, error: "min subtotal not met" });
      }
      if (c.usage_limit != null && Number(c.used_count || 0) >= Number(c.usage_limit)) {
        return json({ ok: false, error: "coupon limit reached" });
      }

      // ✅ v33：対象者（ゲスト専用／会員専用）のチェック。ゲスト注文なので member は不可
      const aud = String(c.audience || "all");
      if (aud === "member") return json({ ok: false, error: "coupon is members only" });

      // ✅ v33：1人あたりの使用回数上限（メールで判定）
      if (c.per_user_limit != null && Number(c.per_user_limit) > 0) {
        const { count } = await sb
          .from("coupon_redemptions")
          .select("id", { count: "exact", head: true })
          .eq("code", coupon)
          .ilike("email", bEmail);
        if (Number(count || 0) >= Number(c.per_user_limit)) {
          return json({ ok: false, error: "coupon per user limit reached" });
        }
      }

      // ✅ v33：対象商品が決まっている場合は、その商品の小計にだけ適用する
      let base = subtotal;
      if (String(c.target_scope || "all") === "products") {
        const { data: tgt } = await sb
          .from("coupon_products")
          .select("product_id")
          .eq("code", coupon);
        const ids = new Set((tgt || []).map((t: any) => Number(t.product_id)));
        base = items
          .filter((it) => ids.has(Number(it.productId)))
          .reduce((s, it) => s + yen(it.price) * Math.max(0, Math.floor(Number(it.quantity || 0))), 0);
        if (base <= 0) return json({ ok: false, error: "coupon target items not in cart" });
      }

      const v = yen(c.discount_value);
      discount =
        String(c.discount_type || "yen") === "percent"
          ? Math.floor((base * v) / 100)
          : v;
      if (c.max_discount_yen != null) discount = Math.min(discount, yen(c.max_discount_yen));
      discount = Math.min(discount, base);
    }
    // 0円になる根拠は①割引でちょうど0円 or ②商品自体が無料（subtotal=0・クーポン不要）
    if (subtotal - discount !== 0) {
      return json({ ok: false, error: "order cannot be 0yen with this discount" });
    }

    const orderId = crypto.randomUUID();

    // ① orders 作成（user_id = NULL でゲスト注文、即 paid）
    const { error: oErr } = await sb.from("orders").insert({
      id: orderId,
      user_id: null,
      total: 0,
      payment_method: "coupon",
      subtotal,
      discount_amount: discount,
      coupon_code: coupon || null,
      points_used: 0,
      status: "paid",
      paid_at: new Date().toISOString(),
      paypay_return_token: token,
      email: bEmail,
      name: bName,
      phone: bPhone,
      postal_code: bPostal,
      address: bAddress,
      building: bBuilding || null,
      fulfillment_type: fulfillmentType,
      shipping_status: fulfillmentType === "shipping" ? "preparing" : null,
    });
    if (oErr) return json({ ok: false, error: "order insert failed", detail: oErr.message });

    // ② order_items
    const itemPayload = items.map((it) => ({
      order_id: orderId,
      product_id: Number(it.productId),
      product_name: String(it.name || ""),
      price: yen(it.price),
      quantity: Math.max(1, Math.floor(Number(it.quantity || 0))),
    }));
    const { error: iErr } = await sb.from("order_items").insert(itemPayload);
    if (iErr) {
      await sb.from("orders").delete().eq("id", orderId);
      return json({ ok: false, error: "order_items insert failed", detail: iErr.message });
    }

    // ③ 在庫減算（在庫不足の場合は注文ごと取り消し）
    for (const it of itemPayload) {
      const { error: sErr } = await sb.rpc("decrement_stock", {
        p_product_id: it.product_id,
        p_qty: it.quantity,
      });
      if (sErr) {
        await sb.from("order_items").delete().eq("order_id", orderId);
        await sb.from("orders").delete().eq("id", orderId);
        return json({ ok: false, error: "stock insufficient", detail: sErr.message });
      }
    }

    // ✅ v36：入荷ロットも消費（ゲスト購入でも在庫とロットを一致させる）
    try {
      const { error: lotErr } = await sb.rpc("consume_lots_for_order", { p_order_id: orderId });
      if (lotErr) console.error("consume_lots_for_order failed:", lotErr);
    } catch (eLot) {
      console.error("consume_lots_for_order exception:", eLot);
    }

    return json({ ok: true, orderId, token });
  } catch (e: unknown) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
