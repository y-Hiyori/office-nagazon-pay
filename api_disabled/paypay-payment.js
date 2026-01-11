// api_disabled/get-paypay-payment.js
import { ensurePayPayConfigured, getPayPayStatus } from "../api/_lib/paypay.js";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, status: "METHOD_NOT_ALLOWED" });

  try {
    if (!ensurePayPayConfigured(res)) return;

    const merchantPaymentId = String(req.query.merchantPaymentId || "");
    if (!merchantPaymentId) {
      return res.status(400).json({ ok: false, status: "MISSING_MERCHANT_PAYMENT_ID" });
    }

    const r = await getPayPayStatus(merchantPaymentId);
    if (!r.ok) return res.status(400).json(r);

    return res.status(200).json({
      ok: true,
      status: r.paypayStatus,
      data: r.body?.data ?? null,
      resultInfo: r.body?.resultInfo ?? null,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
}