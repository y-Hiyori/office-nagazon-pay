import PAYPAY from "@paypayopa/paypayopa-sdk-node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  try {
    // ✅ まずENVチェック（無いなら落とさずJSONで返す）
    const missing = [];
    if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!process.env.PAYPAY_API_KEY) missing.push("PAYPAY_API_KEY");
    if (!process.env.PAYPAY_API_SECRET) missing.push("PAYPAY_API_SECRET");
    if (!process.env.PAYPAY_MERCHANT_ID) missing.push("PAYPAY_MERCHANT_ID");

    if (missing.length) {
      return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });
    }

    // ✅ ここで初期化（起動時クラッシュを防ぐ）
    PAYPAY.Configure({
      clientId: process.env.PAYPAY_API_KEY,
      clientSecret: process.env.PAYPAY_API_SECRET,
      merchantId: process.env.PAYPAY_MERCHANT_ID,
      productionMode: false,
    });

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { orderId, token } = req.body || {};
    if (!orderId || !token) return res.status(400).json({ ok: false, status: "MISSING" });

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, paypay_merchant_payment_id, paypay_return_token")
      .eq("id", orderId)
      .single();

    if (oErr || !order) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });
    if (order.paypay_return_token !== token) return res.status(403).json({ ok: false, status: "BAD_TOKEN" });

    if (order.status === "paid") {
      return res.status(200).json({ ok: true, paid: true, status: "paid", orderDbId: order.id });
    }

    const merchantPaymentId = order.paypay_merchant_payment_id;
    if (!merchantPaymentId) return res.status(400).json({ ok: false, status: "NO_MPID" });

    const body = await new Promise((resolve, reject) => {
      PAYPAY.GetCodePaymentDetails(merchantPaymentId, (response) => {
        if (!response || !response.BODY) return reject(new Error("NO_BODY"));
        resolve(response.BODY);
      });
    });

    const paypayStatus = body?.data?.status || "UNKNOWN";

    if (paypayStatus === "COMPLETED") {
      await supabaseAdmin.from("orders")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", orderId);

      return res.status(200).json({ ok: true, paid: true, status: "paid", paypayStatus, orderDbId: order.id });
    }

    return res.status(200).json({ ok: true, paid: false, status: "PENDING", paypayStatus, orderDbId: order.id });
  } catch (e) {
    console.error(e);
    // ✅ 500でも必ずJSON返す（フロントで原因が見える）
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
}