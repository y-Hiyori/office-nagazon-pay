// api/create-paypay-order.js
import PAYPAY from "@paypayopa/paypayopa-sdk-node";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

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
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    // ✅ Chrome側(Checkout)でログインできてる時に userId を渡す
    const { total, userId } = req.body || {};
    const amount = Number(total) || 0;

    if (!userId) return res.status(400).json({ error: "MISSING_USER" });
    if (!amount || amount <= 0) return res.status(400).json({ error: "INVALID_AMOUNT" });

    // ① PayPayの取引ID + 戻り用tokenを生成
    const merchantPaymentId = `nagazon-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const token = crypto.randomBytes(16).toString("hex");

    // ② 先に orders を pending で作成（Amazon方式）
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        total: amount,
        payment_method: "paypay",
        status: "pending",
        paypay_merchant_payment_id: merchantPaymentId,
        paypay_return_token: token,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      console.error("order insert error:", orderErr);
      return res.status(500).json({ error: "ORDER_CREATE_FAILED" });
    }

    // ③ 戻りURLに orderId/token を付ける（Safariに飛んでも特定できる）
    const returnUrl = `https://office-nagazon-pay.vercel.app/paypay-return?orderId=${order.id}&token=${token}`;

    // ④ PayPay QR 作成
    const payload = {
      merchantPaymentId,
      amount: { amount, currency: "JPY" },
      codeType: "ORDER_QR",
      orderDescription: `NAGAZON 注文 #${order.id}`,
      isAuthorization: false,
      redirectUrl: returnUrl,
      redirectType: "WEB_LINK",
    };

    const body = await new Promise((resolve, reject) => {
      PAYPAY.QRCodeCreate(payload, (response) => {
        if (!response || !response.BODY) return reject(new Error("PayPay response has no BODY"));
        resolve(response.BODY);
      });
    });

    const { resultInfo, data } = body;
    if (!resultInfo || resultInfo.code !== "SUCCESS") {
      console.error("PayPay error:", resultInfo);

      // 失敗したら pending注文をキャンセル扱いにする（任意だけどおすすめ）
      await supabaseAdmin.from("orders").update({ status: "canceled" }).eq("id", order.id);

      return res.status(400).json({ error: "PAYPAY_ERROR", resultInfo });
    }

    return res.status(200).json({
      redirectUrl: data.url,
      deeplink: data.deeplink,
      merchantPaymentId: data.merchantPaymentId,
      orderId: order.id,
      token,
      returnUrl,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}