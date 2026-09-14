// api/send-admin-shipping-email.js
// 発送商品の注文が決済完了したとき、お問い合わせ用テンプレ（EMAILJS_CONTACT_TEMPLATE_ID）を
// そのまま再利用して管理者宛てに購入者情報（配送先）を送る。新規テンプレは不要。
//   body: { orderId, token }
//   - token は orders.paypay_return_token と照合（購入者メールと同じ方式）
//   - paid かつ fulfillment_type='shipping' の時だけ送信
//   - admin_email_sent_at で二重送信を防止
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
      "EMAILJS_CONTACT_TEMPLATE_ID",
    ];
    const missing = need.filter((k) => !process.env[k]);
    if (missing.length) return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });

    const { orderId, token } = req.body || {};
    if (!orderId || !token) return res.status(400).json({ ok: false, status: "MISSING" });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: order, error: orderErr } = await sb
      .from("orders")
      .select(
        "id,user_id,status,total,subtotal,discount_amount,coupon_code,email,name,phone,postal_code,address,building,fulfillment_type,paypay_return_token,admin_email_sent_at"
      )
      .eq("id", orderId)
      .single();

    if (orderErr || !order) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });
    if (String(order.paypay_return_token || "") !== String(token)) {
      return res.status(403).json({ ok: false, status: "BAD_TOKEN" });
    }

    const st = String(order.status || "").toLowerCase();
    if (st !== "paid") return res.status(409).json({ ok: false, status: "NOT_PAID" });

    // 発送注文のみ対象（受け取り注文には送らない）
    if (String(order.fulfillment_type || "pickup") !== "shipping") {
      return res.json({ ok: true, status: "NOT_SHIPPING" });
    }

    // 二重送信防止
    if (order.admin_email_sent_at) return res.json({ ok: true, status: "ALREADY_SENT" });

    // 商品明細
    const { data: items } = await sb
      .from("order_items")
      .select("product_name,price,quantity")
      .eq("order_id", orderId);

    const itemsText = (items || [])
      .map(
        (it) =>
          `${it.product_name} ×${it.quantity}（単価: ${Number(it.price).toLocaleString("ja-JP")}円）`
      )
      .join("\n");

    const totalYen = Number(order.total || 0);
    const disc = Number(order.discount_amount || 0);
    const coupon = order.coupon_code || "";
    const totalText =
      disc > 0
        ? `${totalYen.toLocaleString("ja-JP")}円（クーポン:${coupon || "-"} -${disc.toLocaleString("ja-JP")}円）`
        : `${totalYen.toLocaleString("ja-JP")}円`;

    const name = (order.name || "").trim();
    const email = (order.email || "").trim();
    const postal = (order.postal_code || "").trim().replace(/^(\d{3})(\d{4})$/, "〒$1-$2");
    const addr = (order.address || "").trim();
    const building = (order.building || "").trim();
    const phone = (order.phone || "").trim();

    // ✅ お問い合わせテンプレのパラメータに詰め替える（新規テンプレ不要）
    const message = [
      "以下の発送商品のご注文がありました。",
      "",
      "■ 購入商品",
      itemsText || "（明細なし）",
      "",
      "■ 支払合計",
      totalText || "0円",
      "",
      "■ 購入者",
      `氏名: ${name || "（未入力）"}`,
      `メール: ${email || "（未入力）"}`,
      `電話: ${phone || "（未入力）"}`,
      "",
      "■ 配送先",
      `${postal || "（未入力）"}`,
      `${addr || "（未入力）"}${building ? " " + building : ""}`,
    ].join("\n");

    const payload = {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_CONTACT_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: {
        contact_name: String(name || "（氏名不明）"),
        contact_email: String(email || "（メール不明）"),
        contact_subject: `【発送商品ご注文】NAGAZON 注文番号 ${order.id}`,
        contact_message: message,
        contact_order_id: String(order.id),
      },
    };

    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) return res.status(500).json({ ok: false, status: "EMAILJS_FAILED", detail: text });

    await sb
      .from("orders")
      .update({ admin_email_sent_at: new Date().toISOString() })
      .eq("id", orderId);

    return res.json({ ok: true, status: "SENT" });
  } catch (e) {
    console.error("SEND_ADMIN_SHIPPING_EMAIL_ERROR:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
}
