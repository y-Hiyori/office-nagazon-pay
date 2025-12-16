// api/paypay-status.js
import PAYPAY from "@paypayopa/paypayopa-sdk-node";

PAYPAY.Configure({
  clientId: process.env.PAYPAY_API_KEY,
  clientSecret: process.env.PAYPAY_API_SECRET,
  merchantId: process.env.PAYPAY_MERCHANT_ID,
  productionMode: false, // sandbox
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { merchantPaymentId } = req.body || {};
    if (!merchantPaymentId) {
      return res.status(400).json({ error: "MISSING_MERCHANT_PAYMENT_ID" });
    }

    const body = await new Promise((resolve, reject) => {
      // SDKの例に合わせて配列で渡す（1件）
      PAYPAY.GetCodePaymentDetails([merchantPaymentId], (response) => {
        if (!response || !response.BODY) {
          reject(new Error("PayPay response has no BODY"));
          return;
        }
        resolve(response.BODY);
      });
    });

    const { resultInfo, data } = body;

    if (!resultInfo || resultInfo.code !== "SUCCESS") {
      return res.status(400).json({ error: "PAYPAY_ERROR", resultInfo });
    }

    // data の形が環境で違っても耐える
    const status =
      data?.status ??
      (Array.isArray(data) ? data?.[0]?.status : undefined) ??
      null;

    return res.status(200).json({ status });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}