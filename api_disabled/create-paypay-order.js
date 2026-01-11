// api/confirm-paypay-payment.js
import PAYPAY from "@paypayopa/paypayopa-sdk-node";
import { createClient } from "@supabase/supabase-js";

let configured = false;

function ensureConfigured() {
  if (configured) return;

  PAYPAY.Configure({
    clientId: process.env.PAYPAY_API_KEY,
    clientSecret: process.env.PAYPAY_API_SECRET,
    merchantId: process.env.PAYPAY_MERCHANT_ID,
    productionMode: String(process.env.PAYPAY_PRODUCTION_MODE || "false") === "true", // 省略可
  });

  configured = true;
}

function getPayPayStatusFromBody(body) {
  // body.data が {status:"COMPLETED"} の場合も、[{status:"COMPLETED"}] の場合も耐える
  const d = body?.data;
  return (
    d?.status ??
    (Array.isArray(d) ? d?.[0]?.status : undefined) ??
    "UNKNOWN"
  );
}

function paypayGetCodePaymentDetails(merchantPaymentId) {
  return new Promise((resolve, reject) => {
    // ✅ 配列で統一（1件でも配列）
    PAYPAY.GetCodePaymentDetails([merchantPaymentId], (response) => {
      if (!response || !response.BODY) return reject(new Error("NO_BODY"));
      resolve(response.BODY);
    });
  });
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, status: "METHOD_NOT_ALLOWED" });

  try {
    // ENVチェック
    const missing = [];
    if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!process.env.PAYPAY_API_KEY) missing.push("PAYPAY_API_KEY");
    if (!process.env.PAYPAY_API_SECRET) missing.push("PAYPAY_API_SECRET");
    if (!process.env.PAYPAY_MERCHANT_ID) missing.push("PAYPAY_MERCHANT_ID");

    if (missing.length) {
      return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });
    }

    ensureConfigured();

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { orderId, token } = req.body || {};
    if (!orderId || !token) {
      return res.status(400).json({ ok: false, status: "MISSING", message: "orderId/token is required" });
    }

    // ✅ points_used も読んでおく（ポイント確定に使う）
    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, paypay_merchant_payment_id, paypay_return_token, points_used")
      .eq("id", orderId)
      .single();

    if (oErr || !order) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });
    if (order.paypay_return_token !== token) return res.status(403).json({ ok: false, status: "BAD_TOKEN" });

    // すでに支払い済みなら冪等で返す
    if (order.status === "paid") {
      return res.status(200).json({
        ok: true,
        paid: true,
        status: "paid",
        paypayStatus: "COMPLETED",
        orderDbId: order.id,
      });
    }

    const merchantPaymentId = order.paypay_merchant_payment_id;
    if (!merchantPaymentId) {
      return res.status(400).json({ ok: false, status: "NO_MPID" });
    }

    const body = await paypayGetCodePaymentDetails(merchantPaymentId);
    const paypayStatus = getPayPayStatusFromBody(body);

    // 未完了
    if (paypayStatus !== "COMPLETED") {
      return res.status(200).json({
        ok: true,
        paid: false,
        status: "PENDING",
        paypayStatus,
        orderDbId: order.id,
      });
    }

    // ✅ COMPLETED：まず paid にする（ここは必須）
    const { error: upErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", orderId);

    if (upErr) {
      console.error("orders update error:", upErr);
      return res.status(500).json({ ok: false, status: "ORDER_UPDATE_FAILED", message: upErr.message });
    }

    // ✅ ポイント確定（points_use_for_order が二重計上しない設計だと安全）
    const pointsUsed = Number(order.points_used || 0);
    if (pointsUsed > 0) {
      const { error: pErr } = await supabaseAdmin.rpc("points_use_for_order", {
        p_order_id: orderId,
        p_points: pointsUsed,
      });

      if (pErr) {
        // ここで失敗すると「支払いは完了したのにポイントが未確定」になるので、
        // JSONで理由が見えるように返す（必要なら再実行できる）
        console.error("points_use_for_order error:", pErr);
        return res.status(200).json({
          ok: true,
          paid: true,
          status: "paid",
          paypayStatus,
          orderDbId: order.id,
          points: { ok: false, error: pErr.message },
        });
      }
    }

    return res.status(200).json({
      ok: true,
      paid: true,
      status: "paid",
      paypayStatus,
      orderDbId: order.id,
      points: { ok: true, used: pointsUsed },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      status: "ERROR",
      message: String(e?.message || e),
    });
  }
}