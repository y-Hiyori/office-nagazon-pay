// api/send-buyer-order-email.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  try {
    const need = [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "EMAILJS_SERVICE_ID",
      "EMAILJS_PUBLIC_KEY",
      "EMAILJS_PRIVATE_KEY",
      "EMAILJS_TEMPLATE_ID", // 購入者テンプレ（nagazon_order_notice）
    ];
    const missing = need.filter((k) => !process.env[k]);
    if (missing.length) {
      return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });
    }

    const { orderId, token } = req.body || {};
    if (!orderId || !token) {
      return res.status(400).json({ ok: false, status: "MISSING" });
    }

    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 注文取得 + token検証 + 二重送信防止
    const { data: order, error: getErr } = await sb
      .from("orders")
      .select("id,total,subtotal,discount_amount,coupon_code,created_at,paypay_return_token,email,name,buyer_email_sent_at")
      .eq("id", orderId)
      .single();

    if (getErr || !order) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });
    if (order.paypay_return_token !== token) return res.status(403).json({ ok: false, status: "BAD_TOKEN" });

    if (order.buyer_email_sent_at) {
      return res.json({ ok: true, status: "ALREADY_SENT" });
    }

    const toEmail = order.email;
    if (!toEmail) return res.status(500).json({ ok: false, status: "NO_BUYER_EMAIL" });

    // 注文明細
    const { data: items } = await sb
      .from("order_items")
      .select("product_name,price,quantity")
      .eq("order_id", orderId);

    const itemsText = (items || [])
      .map((it) => {
        const name = it.product_name ?? "";
        const qty = Number(it.quantity ?? 0);
        const price = Number(it.price ?? 0).toLocaleString("ja-JP");
        return `${name} ×${qty}（${price}円）`;
      })
      .join("\n");

    // 合計表示（テンプレの「total_text」用）
    const totalYen = Number(order.total ?? 0).toLocaleString("ja-JP");
    const disc = Number(order.discount_amount ?? 0);
    const coupon = order.coupon_code ? `クーポン:${order.coupon_code} ` : "";
    const totalText =
      disc > 0
        ? `${totalYen}円（${coupon}-${disc.toLocaleString("ja-JP")}円）`
        : `${totalYen}円`;

    const payload = {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email: toEmail,
        buyer_name: order.name || "",
        order_id: order.id,
        items_text: itemsText,
        total_text: totalText,
      },
    };

    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const detail = await r.text();
    if (!r.ok) return res.status(500).json({ ok: false, status: "EMAILJS_FAILED", detail });

    await sb
      .from("orders")
      .update({ buyer_email_sent_at: new Date().toISOString() })
      .eq("id", orderId);

    return res.json({ ok: true, status: "SENT" });
  } catch (e) {
    console.error("SEND_BUYER_EMAIL_ERROR:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
}