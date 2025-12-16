import PAYPAY from "@paypayopa/paypayopa-sdk-node";

PAYPAY.Configure({
  clientId: process.env.PAYPAY_API_KEY,
  clientSecret: process.env.PAYPAY_API_SECRET,
  merchantId: process.env.PAYPAY_MERCHANT_ID,
  productionMode: false, // sandbox
});

export default async function handler(req, res) {
  // CORS（今はテストなら * でもOK。本番はドメイン固定推奨）
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { merchantPaymentId } = req.body || {};
    if (!merchantPaymentId) return res.status(400).json({ error: "MISSING_ID" });

    const body = await new Promise((resolve, reject) => {
      PAYPAY.GetCodePaymentDetails([merchantPaymentId], (response) => {
        if (!response || !response.BODY) {
          reject(new Error("PayPay response has no BODY"));
          return;
        }
        resolve(response.BODY);
      });
    });

    const { resultInfo, data } = body;

    // 取れない/エラー → “支払い完了してない扱い”で返す
    if (!resultInfo || resultInfo.code !== "SUCCESS") {
      return res.status(200).json({
        paid: false,
        status: "UNKNOWN",
        resultInfo,
      });
    }

    const status = data?.status || "UNKNOWN"; // COMPLETED じゃなければ未完了扱い
    return res.status(200).json({
      paid: status === "COMPLETED",
      status,
    });
  } catch (e) {
    console.error(e);
    return res.status(200).json({
      paid: false,
      status: "NOT_FOUND",
    });
  }
}