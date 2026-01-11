// api/confirm-paypay-payment.js
import PAYPAY from "@paypayopa/paypayopa-sdk-node";
import { createClient } from "@supabase/supabase-js";

function envCheck() {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.PAYPAY_API_KEY) missing.push("PAYPAY_API_KEY");
  if (!process.env.PAYPAY_API_SECRET) missing.push("PAYPAY_API_SECRET");
  if (!process.env.PAYPAY_MERCHANT_ID) missing.push("PAYPAY_MERCHANT_ID");
  return missing;
}

function configurePayPay() {
  PAYPAY.Configure({
    clientId: process.env.PAYPAY_API_KEY,
    clientSecret: process.env.PAYPAY_API_SECRET,
    merchantId: process.env.PAYPAY_MERCHANT_ID,
    productionMode: false, // sandbox
  });
}

async function getPayPayDetails(merchantPaymentId) {
  // SDKの呼び方が揺れるので両対応
  const tryCb = (arg) =>
    new Promise((resolve, reject) => {
      PAYPAY.GetCodePaymentDetails(arg, (response) => {
        if (!response || !response.BODY) return reject(new Error("NO_BODY"));
        resolve(response.BODY);
      });
    });

  try {
    return await tryCb([merchantPaymentId]);
  } catch {
    return await tryCb(merchantPaymentId);
  }
}

function normalizePayPayStatus(body) {
  return (
    body?.data?.status ??
    (Array.isArray(body?.data) ? body?.data?.[0]?.status : undefined) ??
    "UNKNOWN"
  );
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, status: "METHOD_NOT_ALLOWED" });

  try {
    // ✅ ENV
    const missing = envCheck();
    if (missing.length) return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });

    configurePayPay();

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { orderId, token, merchantPaymentId: merchantPaymentIdFromClient } = req.body || {};
    if (!orderId || !token) {
      return res.status(400).json({
        ok: false,
        status: "MISSING",
        need: ["orderId", "token"],
      });
    }

    // ✅ 注文取得（points_used も必要）
    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select(
        "id,status,points_used,paypay_merchant_payment_id,paypay_return_token,email,name"
      )
      .eq("id", orderId)
      .single();

    if (oErr || !order) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });

    // ✅ token照合（超重要）
    if (String(order.paypay_return_token || "") !== String(token)) {
      return res.status(403).json({ ok: false, status: "BAD_TOKEN" });
    }

    // ✅ merchantPaymentId はDB優先（フロントから来たら照合だけする）
    const merchantPaymentId = String(order.paypay_merchant_payment_id || "");
    if (!merchantPaymentId) {
      return res.status(400).json({ ok: false, status: "NO_MPID_IN_ORDER" });
    }
    if (
      merchantPaymentIdFromClient &&
      String(merchantPaymentIdFromClient) !== merchantPaymentId
    ) {
      return res.status(403).json({ ok: false, status: "BAD_MERCHANT_PAYMENT_ID" });
    }

    // ✅ すでに完了済み
    if (String(order.status || "").toLowerCase() === "paid") {
      return res.status(200).json({
        ok: true,
        paid: true,
        finalized: true,
        status: "paid",
        paypayStatus: "COMPLETED",
        orderId: order.id,
      });
    }

    // ✅ PayPay照会
    const body = await getPayPayDetails(merchantPaymentId);
    const paypayStatus = normalizePayPayStatus(body);

    // 未完了はそのまま返す（PurchaseCompleteは「確認するだけ」にできる）
    if (String(paypayStatus).toUpperCase() !== "COMPLETED") {
      return res.status(200).json({
        ok: true,
        paid: false,
        finalized: false,
        status: "PENDING",
        paypayStatus,
        orderId: order.id,
      });
    }

    // ========= ここから「確定処理」 =========
    const current = String(order.status || "").toLowerCase();

    // ✅ 同時実行ガード：pending/created だけ finalizing にできる
    if (current !== "finalizing") {
      const { data: locked, error: lockErr } = await supabaseAdmin
        .from("orders")
        .update({ status: "finalizing" })
        .eq("id", orderId)
        .in("status", ["pending", "created"])
        .select("id,status")
        .maybeSingle();

      if (lockErr) {
        return res.status(500).json({ ok: false, status: "LOCK_FAILED", message: lockErr.message });
      }

      // 0件更新（誰かが先にfinalizing/paidにした等）
      if (!locked) {
        const { data: again } = await supabaseAdmin
          .from("orders")
          .select("id,status")
          .eq("id", orderId)
          .maybeSingle();

        const st = String(again?.status || "UNKNOWN").toLowerCase();
        return res.status(200).json({
          ok: true,
          paid: st === "paid",
          finalized: st === "paid",
          status: again?.status ?? "UNKNOWN",
          paypayStatus,
          orderId,
        });
      }
    }

    // ✅ order_items取得（在庫減算用）
    const { data: items, error: iErr } = await supabaseAdmin
      .from("order_items")
      .select("product_id,quantity,product_name")
      .eq("order_id", orderId);

    if (iErr || !items || items.length === 0) {
      await supabaseAdmin.from("orders").update({ status: "pending" }).eq("id", orderId);
      return res.status(400).json({ ok: false, status: "ORDER_ITEMS_NOT_FOUND" });
    }

    // ✅ 商品ごとに数量合計
    const qtyMap = new Map();
    for (const it of items) {
      const pid = Number(it.product_id);
      const q = Number(it.quantity || 0);
      if (!Number.isFinite(pid) || q <= 0) continue;
      qtyMap.set(pid, (qtyMap.get(pid) || 0) + q);
    }

    // ✅ ポイント確定（points_used > 0 の時だけ）
    const pointsUsed = Number(order.points_used || 0);
    if (pointsUsed > 0) {
      const { error: pErr } = await supabaseAdmin.rpc("points_use_for_order", {
        p_order_id: orderId,
        p_points: pointsUsed,
      });
      if (pErr) {
        await supabaseAdmin.from("orders").update({ status: "pending" }).eq("id", orderId);
        return res.status(400).json({ ok: false, status: "POINTS_USE_FAILED", message: pErr.message });
      }
    }

    // ✅ 在庫減算
    for (const [pid, qty] of qtyMap.entries()) {
      const { error: sErr } = await supabaseAdmin.rpc("decrement_stock", {
        p_product_id: Number(pid),
        p_qty: Number(qty),
      });
      if (sErr) {
        await supabaseAdmin.from("orders").update({ status: "pending" }).eq("id", orderId);
        return res.status(400).json({ ok: false, status: "STOCK_DECREMENT_FAILED", message: sErr.message });
      }
    }

    // ✅ paid 反映（最後に）
    const paidAt = new Date().toISOString();
    const { error: paidErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "paid", paid_at: paidAt })
      .eq("id", orderId);

    if (paidErr) {
      await supabaseAdmin.from("orders").update({ status: "pending" }).eq("id", orderId);
      return res.status(500).json({ ok: false, status: "PAID_UPDATE_FAILED", message: paidErr.message });
    }

    // ✅ メール送信（失敗しても決済は成功扱い）
    try {
      const host = req.headers.host;
      const proto = (req.headers["x-forwarded-proto"] || "https").toString();
      const origin = `${proto}://${host}`;

      await fetch(`${origin}/api/send-buyer-order-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, token }),
      }).catch(() => {});

      await fetch(`${origin}/api/send-admin-order-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, token }),
      }).catch(() => {});
    } catch {}

    return res.status(200).json({
      ok: true,
      paid: true,
      finalized: true,
      status: "paid",
      paypayStatus,
      orderId,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
}