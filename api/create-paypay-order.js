// api/create-paypay-order.js
import PAYPAY from "@paypayopa/paypayopa-sdk-node";

// PayPay のキーを環境変数から読む（Vercel の Env）
PAYPAY.Configure({
  clientId: process.env.PAYPAY_API_KEY,
  clientSecret: process.env.PAYPAY_API_SECRET,
  merchantId: process.env.PAYPAY_MERCHANT_ID,
  productionMode: false, // ← sandbox 環境
});

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const { total } = req.body || {};
    const amount = Number(total) || 0;

    if (!amount || amount <= 0) {
      res.status(400).json({ error: "INVALID_AMOUNT" });
      return;
    }

    const merchantPaymentId = `nagazon-${Date.now()}`;

    const payload = {
      merchantPaymentId,
      amount: {
        amount,
        currency: "JPY",
      },
      codeType: "ORDER_QR",
      orderDescription: "NAGAZON テスト注文",
      isAuthorization: false,
      redirectUrl: "https://paypay.ne.jp/",
      redirectType: "WEB_LINK",
    };

    const body = await new Promise((resolve, reject) => {
      PAYPAY.QRCodeCreate(payload, (response) => {
        if (!response || !response.BODY) {
          reject(new Error("PayPay response has no BODY"));
          return;
        }
        resolve(response.BODY);
      });
    });

    const { resultInfo, data } = body;

    if (!resultInfo || resultInfo.code !== "SUCCESS") {
      console.error("PayPay error:", resultInfo);
      res.status(400).json({ error: "PAYPAY_ERROR", resultInfo });
      return;
    }

    res.status(200).json({
      redirectUrl: data.url,          // ブラウザで開ける QR ページ
      deeplink: data.deeplink,        // paypay:// のアプリ用リンク
      merchantPaymentId: data.merchantPaymentId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
}