// api_disabled/get-paypay-payment.js
import PAYPAY from "@paypayopa/paypayopa-sdk-node";

PAYPAY.Configure({
  clientId: process.env.PAYPAY_API_KEY,
  clientSecret: process.env.PAYPAY_API_SECRET,
  merchantId: process.env.PAYPAY_MERCHANT_ID,
  productionMode: false, // sandbox
});

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const merchantPaymentId = String(req.query.merchantPaymentId || "");

    if (!merchantPaymentId) {
      return res.status(400).json({ error: "MISSING_MERCHANT_PAYMENT_ID" });
    }

    // PayPay SDK：支払い詳細取得
    const response = await PAYPAY.GetCodePaymentDetails([merchantPaymentId]);
    const body = response?.BODY;

    if (!body?.resultInfo || body.resultInfo.code !== "SUCCESS") {
      return res.status(400).json({ error: "PAYPAY_ERROR", resultInfo: body?.resultInfo });
    }

    const status = body?.data?.status; // 例: "COMPLETED" など
    return res.status(200).json({ status, data: body.data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}