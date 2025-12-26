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
      "EMAILJS_TEMPLATE_ID",
    ];
    const missing = need.filter((k) => !process.env[k]);
    if (missing.length) {
      return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });
    }

    const { orderId, token } = req.body || {};
    if (!orderId || !token) return res.status(400).json({ ok: false, status: "MISSING" });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // orders 取得（user_id必須）
    const { data: order, error: orderErr } = await sb
      .from("orders")
      .select(
        "id,user_id,status,total,discount_amount,coupon_code,created_at,paypay_return_token,email,name,buyer_email_sent_at"
      )
      .eq("id", orderId)
      .single();

    if (orderErr || !order) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });
    if (order.paypay_return_token !== token) return res.status(403).json({ ok: false, status: "BAD_TOKEN" });

    if (order.buyer_email_sent_at) return res.json({ ok: true, status: "ALREADY_SENT" });

    // 宛先メールの確定：orders.email → profiles.email → auth.users.email（最終手段）
    let toEmail = order.email || "";
    let buyerName = order.name || "";

    if ((!toEmail || !buyerName) && order.user_id) {
      const { data: prof } = await sb
        .from("profiles")
        .select("email,name")
        .eq("id", order.user_id)
        .maybeSingle();

      if (!toEmail) toEmail = prof?.email || "";
      if (!buyerName) buyerName = prof?.name || "";
    }

    // ★ここが決定打：profiles でも取れない場合、Auth本体から取る
    if (!toEmail && order.user_id) {
      const { data: authData, error: authErr } = await sb.auth.admin.getUserById(order.user_id);
      if (!authErr) {
        toEmail = authData?.user?.email || "";
      }
    }

    if (!toEmail) return res.status(500).json({ ok: false, status: "NO_BUYER_EMAIL" });

    // items
    const { data: items } = await sb
      .from("order_items")
      .select("product_name,price,quantity")
      .eq("order_id", orderId);

    const itemsText = (items || [])
      .map((it) => `${it.product_name} ×${it.quantity}（単価: ${Number(it.price).toLocaleString("ja-JP")}円）`)
      .join("\n");

    const totalYen = Number(order.total || 0);
    const disc = Number(order.discount_amount || 0);
    const coupon = order.coupon_code || "";
    const totalText =
      disc > 0
        ? `${totalYen.toLocaleString("ja-JP")}円（クーポン:${coupon || "-"} -${disc.toLocaleString("ja-JP")}円）`
        : `${totalYen.toLocaleString("ja-JP")}円`;

    // EmailJS送信
    const payload = {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email: toEmail,
        buyer_name: buyerName || "お客様",
        order_id: order.id,
        items_text: itemsText || "（明細なし）",
        total_text: totalText,
      },
    };

    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) return res.status(500).json({ ok: false, status: "EMAILJS_FAILED", detail: text });

    // 送信済み記録 & email/nameキャッシュ
    await sb
      .from("orders")
      .update({
        email: order.email || toEmail,
        name: order.name || buyerName,
        buyer_email_sent_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    return res.json({ ok: true, status: "SENT" });
  } catch (e) {
    console.error("SEND_BUYER_EMAIL_ERROR:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
}