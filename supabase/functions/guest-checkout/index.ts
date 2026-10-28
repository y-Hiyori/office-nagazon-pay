// supabase/functions/guest-checkout/index.ts
// 0円購入（クーポン／ポイント／無料商品）を service role で完結させる
//  ・ゲスト：RLS のため注文作成不可 → この関数が注文作成・在庫減算・paid反映まで行う
//  ・会員  ：同じ関数で user_id を紐付け、ポイント使用／付与まで行う
//  ・価格はすべてサーバー側で products から再計算（クライアントの金額は信用しない）
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

async function getUserFromRequest(req: Request, sb: ReturnType<typeof getClient>) {
  const header = req.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error) return null;
    return data?.user ?? null;
  } catch {
    return null;
  }
}

function yen(v: unknown): number {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function isSaleLive(p: Record<string, unknown>, nowMs: number): boolean {
  if (p.sale_active === false) return false;
  const starts = p.sale_starts_at ? Date.parse(String(p.sale_starts_at)) : NaN;
  if (Number.isFinite(starts) && nowMs < starts) return false;
  const ends = p.sale_ends_at ? Date.parse(String(p.sale_ends_at)) : NaN;
  if (Number.isFinite(ends) && nowMs > ends) return false;
  return true;
}

type ProductRow = {
  id: number;
  name: string | null;
  price: number | null;
  member_price: number | null;
  sale_price: number | null;
  sale_qty: number | null;
  sale_remaining: number | null;
  sale_mode: string | null;
  sale_active: boolean | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  stock: number | null;
  is_visible: boolean | null;
  max_per_order: number | null;
};

type CartItem = {
  productId: number;
  name: string;
  quantity: number;
};

type Priced = {
  productId: number;
  name: string;
  quantity: number;
  normalPrice: number;
  salePrice: number | null;
  saleUnits: number;
  normalQty: number;
  saleMode: string | null;
  lineTotal: number;
};

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

    const sb = getClient();
    const authUser = await getUserFromRequest(req, sb);
    const userId = authUser?.id ?? null;

    const body = (await req.json().catch(() => ({}))) as {
      token?: unknown;
      coupon?: unknown;
      fulfillmentType?: unknown;
      buyer?: Record<string, unknown>;
      items?: Record<string, unknown>[];
    };

    const token = typeof body.token === "string" ? body.token.trim() : "";
    const coupon = body.coupon ? String(body.coupon).trim().toUpperCase() : "";
    const buyer = body.buyer || {};
    const rawItems = Array.isArray(body.items) ? body.items : [];

    const bName = String(buyer.name || "").trim();
    const bEmail = String(buyer.email || "").trim();
    const bPhone = String(buyer.phone || "").trim();
    const bPostal = String(buyer.postalCode || "").trim().replace(/[-－\s]/g, "");
    const bAddress = String(buyer.address || "").trim();
    const bBuilding = String(buyer.building || "").trim();

    const fulfillmentType =
      String(body.fulfillmentType || "").toLowerCase() === "shipping" ? "shipping" : "pickup";

    if (!token) return json({ ok: false, error: "token is required" });
    if (!bName || !bEmail) {
      return json({ ok: false, error: "buyer info is incomplete" });
    }
    if (rawItems.length === 0) return json({ ok: false, error: "items is empty" });

    const items: CartItem[] = rawItems
      .map((it) => ({
        productId: num((it as Record<string, unknown>).productId),
        name: String((it as Record<string, unknown>).name || ""),
        quantity: Math.max(1, Math.floor(Number((it as Record<string, unknown>).quantity || 0))),
      }))
      .filter((it) => Number.isFinite(it.productId) && it.productId > 0);

    if (items.length === 0) return json({ ok: false, error: "items is empty" });

    // ---------- 1) 商品価格・セールをサーバー側で確定 ----------
    const ids = Array.from(new Set(items.map((it) => it.productId)));
    const { data: prodRows, error: pErr } = await sb
      .from("products")
      .select(
        "id,name,price,member_price,sale_price,sale_qty,sale_remaining,sale_mode,sale_active,sale_starts_at,sale_ends_at,stock,is_visible,max_per_order"
      )
      .in("id", ids);

    if (pErr) throw pErr;

    const prodMap = new Map<number, ProductRow>();
    for (const p of (prodRows ?? []) as unknown as ProductRow[]) {
      prodMap.set(Number(p.id), p);
    }

    const nowMs = Date.now();
    const priced: Priced[] = [];
    let subtotal = 0;

    for (const it of items) {
      const p = prodMap.get(it.productId);
      if (!p || p.is_visible === false) {
        return json({ ok: false, error: "product not found" });
      }

      const qty = Math.max(1, Math.floor(it.quantity));
      const maxPer = Math.max(0, num(p.max_per_order));
      if (maxPer > 0 && qty > maxPer) {
        return json({ ok: false, error: "max per order exceeded" });
      }
      if (num(p.stock) < qty) {
        return json({ ok: false, error: "stock insufficient" });
      }

      // 会員は会員価格、ゲストは通常価格
      const member = Number(p.member_price ?? 0);
      const normalPrice = userId && member > 0 ? member : num(p.price);

      const mode = p.sale_mode === "per_order" ? "per_order" : "total";
      const saleLive = p.sale_price != null && isSaleLive(p as unknown as Record<string, unknown>, nowMs);
      const salePrice = saleLive ? num(p.sale_price) : null;
      const saleLimit = saleLive
        ? mode === "per_order"
          ? Math.max(0, num(p.sale_qty))
          : Math.max(0, num(p.sale_remaining))
        : 0;
      const saleUnits = salePrice != null ? Math.min(qty, saleLimit) : 0;
      const normalQty = qty - saleUnits;
      const lineTotal = saleUnits * (salePrice ?? 0) + normalQty * normalPrice;

      subtotal += lineTotal;
      priced.push({
        productId: it.productId,
        name: String(p.name ?? it.name ?? ""),
        quantity: qty,
        normalPrice,
        salePrice: saleUnits > 0 ? salePrice : null,
        saleUnits,
        normalQty,
        saleMode: saleUnits > 0 ? mode : null,
        lineTotal,
      });
    }

    // ---------- 2) クーポン（サーバー側で再計算） ----------
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
      if (c.usage_limit != null && Number(c.used_count || 0) >= Number(c.usage_limit)) {
        return json({ ok: false, error: "coupon limit reached" });
      }

      // 対象者（会員／ゲスト）
      const aud = String(c.audience || "all");
      if (aud === "member" && !userId) return json({ ok: false, error: "coupon is members only" });
      if (aud === "guest" && userId) return json({ ok: false, error: "coupon is guests only" });

      // 1人あたり上限（会員は user_id、全員メールでも判定）
      if (c.per_user_limit != null && Number(c.per_user_limit) > 0) {
        const limit = Number(c.per_user_limit);
        if (userId) {
          const { count } = await sb
            .from("coupon_redemptions")
            .select("id", { count: "exact", head: true })
            .eq("code", coupon)
            .eq("user_id", userId);
          if (Number(count || 0) >= limit) {
            return json({ ok: false, error: "coupon per user limit reached" });
          }
        }
        const { count: emailCount } = await sb
          .from("coupon_redemptions")
          .select("id", { count: "exact", head: true })
          .eq("code", coupon)
          .ilike("email", bEmail);
        if (Number(emailCount || 0) >= limit) {
          return json({ ok: false, error: "coupon per user limit reached" });
        }
      }

      // 最低小計は「注文全体の小計」で判定
      if (c.min_subtotal != null && subtotal < Number(c.min_subtotal)) {
        return json({ ok: false, error: "min subtotal not met" });
      }

      // 対象商品が決まっている場合は、その商品の小計にだけ適用
      let base = subtotal;
      if (String(c.target_scope || "all") === "products") {
        const { data: tgt } = await sb
          .from("coupon_products")
          .select("product_id")
          .eq("code", coupon);
        const targetIds = new Set((tgt || []).map((t: { product_id: number }) => Number(t.product_id)));
        base = priced
          .filter((it) => targetIds.has(it.productId))
          .reduce((sum, it) => sum + it.lineTotal, 0);
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

    // ---------- 3) ポイント（0円にするために必要な分だけ使用） ----------
    let pointsUsed = 0;
    const remainder = Math.max(0, subtotal - discount);
    if (remainder > 0) {
      if (!userId) {
        return json({ ok: false, error: "order cannot be 0yen with this discount" });
      }
      const { data: w } = await sb
        .from("points_wallet")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();
      const balance = Math.max(0, num(w?.balance));
      if (balance < remainder) {
        return json({ ok: false, error: "insufficient points" });
      }
      pointsUsed = remainder;
    }

    // ---------- 4) 注文作成（pending → 明細・在庫・ロット → paid） ----------
    const orderId = crypto.randomUUID();

    const { error: oErr } = await sb.from("orders").insert({
      id: orderId,
      user_id: userId,
      total: 0,
      payment_method: pointsUsed > 0 ? "points" : "coupon",
      subtotal,
      discount_amount: discount,
      coupon_code: coupon || null,
      points_used: pointsUsed,
      status: "pending",
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

    const baseRows = priced.flatMap((it) => {
      const base = {
        order_id: orderId,
        product_id: it.productId,
        product_name: it.name,
      };
      const rows: Record<string, unknown>[] = [];
      if (it.saleUnits > 0 && it.salePrice != null) {
        rows.push({
          ...base,
          price: it.salePrice,
          quantity: it.saleUnits,
          is_sale: true,
          original_price: it.normalPrice,
          sale_mode: it.saleMode,
        });
      }
      if (it.normalQty > 0 || rows.length === 0) {
        rows.push({
          ...base,
          price: it.normalPrice,
          quantity: it.normalQty > 0 ? it.normalQty : it.quantity,
          is_sale: false,
          original_price: null,
          sale_mode: null,
        });
      }
      return rows;
    });

    let { error: iErr } = await sb.from("order_items").insert(baseRows);
    if (iErr) {
      // v26 未適用の環境向けフォールバック
      const plain = priced.map((it) => ({
        order_id: orderId,
        product_id: it.productId,
        product_name: it.name,
        price: it.normalPrice,
        quantity: it.quantity,
      }));
      const retry = await sb.from("order_items").insert(plain);
      iErr = retry.error;
    }
    if (iErr) {
      await sb.from("orders").delete().eq("id", orderId);
      return json({ ok: false, error: "order_items insert failed", detail: iErr.message });
    }

    // 在庫減算（商品ごとに合算。在庫不足なら注文ごと取り消し）
    for (const it of priced) {
      const { error: sErr } = await sb.rpc("decrement_stock", {
        p_product_id: it.productId,
        p_qty: it.quantity,
      });
      if (sErr) {
        await sb.from("order_items").delete().eq("order_id", orderId);
        await sb.from("orders").delete().eq("id", orderId);
        return json({ ok: false, error: "stock insufficient", detail: sErr.message });
      }
    }

    // 入荷ロットも消費（在庫とロットを一致させる）
    try {
      const { error: lotErr } = await sb.rpc("consume_lots_for_order", { p_order_id: orderId });
      if (lotErr) console.error("consume_lots_for_order failed:", lotErr);
    } catch (eLot) {
      console.error("consume_lots_for_order exception:", eLot);
    }

    // paid 反映（明細・在庫・ロット処理のあとに確定）
    const { error: paidErr } = await sb
      .from("orders")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", orderId);
    if (paidErr) console.error("zero yen order paid update failed:", paidErr);

    // ポイント使用（会員のみ・0円になる必要分）
    if (pointsUsed > 0) {
      const { error: useErr } = await sb.rpc("points_use_for_order", {
        p_order_id: orderId,
        p_points: pointsUsed,
      });
      if (useErr) console.error("points_use_for_order failed:", useErr);
    }

    // 付与ポイント（会員のみ）
    if (userId) {
      const { error: awardErr } = await sb.rpc("points_award_for_order", { p_order_id: orderId });
      if (awardErr) console.error("points_award_for_order failed:", awardErr);
    }

    // クーポン使用回数（注文ID単位で冪等。ordersトリガでも実行される）
    if (coupon) {
      try {
        const { error: cRedeemErr } = await sb.rpc("coupon_redeem_for_order", { p_order_id: orderId });
        if (cRedeemErr) console.error("coupon_redeem_for_order failed:", cRedeemErr);
      } catch (eCoupon) {
        console.error("coupon_redeem_for_order exception:", eCoupon);
      }
    }

    return json({ ok: true, orderId, token, subtotal, discount, pointsUsed, total: 0 });
  } catch (e: unknown) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
