import PAYPAY from "@paypayopa/paypayopa-sdk-node";
import { createClient } from "@supabase/supabase-js";

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  try {
    const { orderId, token } = req.body || {};
    if (!orderId || !token) return res.status(400).json({ ok: false, status: "MISSING" });

    // 1) 注文取得（token照合）
    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, paypay_merchant_payment_id, paypay_return_token")
      .eq("id", orderId)
      .single();

    if (oErr || !order) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });
    if (order.paypay_return_token !== token) return res.status(403).json({ ok: false, status: "BAD_TOKEN" });

    // 2) すでに確定済みならOK
    if (order.status === "paid") return res.status(200).json({ ok: true, status: "ALREADY_PAID" });

    const merchantPaymentId = order.paypay_merchant_payment_id;
    if (!merchantPaymentId) return res.status(400).json({ ok: false, status: "NO_MPID" });

    // 3) PayPay照会
    const body = await new Promise((resolve, reject) => {
      PAYPAY.GetCodePaymentDetails([merchantPaymentId], (response) => {
        if (!response || !response.BODY) return reject(new Error("NO_BODY"));
        resolve(response.BODY);
      });
    });

    const status = body?.data?.status || "UNKNOWN";
    if (status !== "COMPLETED") return res.status(200).json({ ok: false, status });

    // 4) paidに更新（ここで確定）
    await supabaseAdmin
      .from("orders")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", orderId);

    return res.status(200).json({ ok: true, status: "COMPLETED" });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ ok: false, status: "ERROR" });
  }
}