// api/paypay-status.js
import { ensurePayPayConfigured, getPayPayStatus } from "./_lib/paypay.js";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, status: "METHOD_NOT_ALLOWED" });

  try {
    if (!ensurePayPayConfigured(res)) return;

    const { merchantPaymentId } = req.body || {};
    if (!merchantPaymentId) {
      return res.status(400).json({ ok: false, status: "MISSING_MERCHANT_PAYMENT_ID" });
    }

    const r = await getPayPayStatus(String(merchantPaymentId));
    if (!r.ok) return res.status(400).json(r);

    return res.status(200).json({
      ok: true,
      status: r.paypayStatus, // ← フロント側がこのキー名を期待してるならこれでOK
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
}