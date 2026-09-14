// api/update-shipping-status.js
// 管理者が注文の発送ステータスを切り替える（発送準備中 ⇔ 発送完了）
//   POST body: { orderId, token, accessToken, action }
//   - token      : orders.paypay_return_token と照合（既存APIと同じ方式）
//   - accessToken: 管理者ユーザーのセッショントークン（profiles.is_admin を確認）
//   - action     : "shipped"（発送完了） | "preparing"（発送準備中に戻す）
//   - 発送完了時は購入者へ発送完了メールを送る（EMAILJS_SHIPPED_TEMPLATE_ID 未設定ならスキップ）
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  try {
    const need = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    const missing = need.filter((k) => !process.env[k]);
    if (missing.length) return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });

    const { orderId, token, accessToken, action } = req.body || {};
    if (!orderId || !token || !accessToken) {
      return res.status(400).json({ ok: false, status: "MISSING" });
    }
    if (action !== "shipped" && action !== "preparing") {
      return res.status(400).json({ ok: false, status: "BAD_ACTION" });
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // ✅ 管理者かどうかを確認（フロントの表示ガードだけでは不十分なのでサーバー側でも検証）
    const { data: authData, error: authErr } = await sb.auth.getUser(String(accessToken));
    if (authErr || !authData?.user) return res.status(401).json({ ok: false, status: "UNAUTHORIZED" });

    const { data: me, error: meErr } = await sb
      .from("profiles")
      .select("is_admin")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (meErr || !me?.is_admin) return res.status(403).json({ ok: false, status: "NOT_ADMIN" });

    // ✅ 注文の確認
    const { data: order, error: orderErr } = await sb
      .from("orders")
      .select("id,status,fulfillment_type,paypay_return_token,shipping_status,email,name,user_id,shipped_email_sent_at")
      .eq("id", String(orderId))
      .single();

    if (orderErr || !order) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });
    if (String(order.paypay_return_token || "") !== String(token)) {
      return res.status(403).json({ ok: false, status: "BAD_TOKEN" });
    }
    if (String(order.status || "").toLowerCase() !== "paid") {
      return res.status(409).json({ ok: false, status: "NOT_PAID" });
    }
    if (String(order.fulfillment_type || "pickup") !== "shipping") {
      return res.status(409).json({ ok: false, status: "NOT_SHIPPING" });
    }

    if (action === "preparing") {
      await sb
        .from("orders")
        .update({ shipping_status: "preparing", shipped_email_sent_at: null })
        .eq("id", order.id);
      return res.json({ ok: true, shippingStatus: "preparing" });
    }

    // ===== 発送完了 =====
    await sb
      .from("orders")
      .update({ shipping_status: "shipped", shipped_email_sent_at: new Date().toISOString() })
      .eq("id", order.id);

    // ✅ 購入者へ発送完了メール（テンプレ未設定の環境ではスキップしてステータスだけ更新）
    let mailStatus = "SKIPPED_NO_TEMPLATE";
    const needMail = [
      "EMAILJS_SERVICE_ID",
      "EMAILJS_PUBLIC_KEY",
      "EMAILJS_PRIVATE_KEY",
      "EMAILJS_SHIPPED_TEMPLATE_ID",
    ];
    const missMail = needMail.filter((k) => !process.env[k]);

    if (missMail.length === 0) {
      try {
        let toEmail = (order.email || "").trim();
        let buyerName = (order.name || "").trim();

        if ((!toEmail || !buyerName) && order.user_id) {
          const { data: prof } = await sb
            .from("profiles")
            .select("email,name")
            .eq("id", order.user_id)
            .maybeSingle();
          if (!toEmail) toEmail = (prof?.email || "").trim();
          if (!buyerName) buyerName = (prof?.name || "").trim();
        }
        if (!toEmail && order.user_id) {
          const { data: authData2, error: authErr2 } = await sb.auth.admin.getUserById(order.user_id);
          if (!authErr2) toEmail = authData2?.user?.email || "";
        }

        if (toEmail) {
          const payload = {
            service_id: process.env.EMAILJS_SERVICE_ID,
            template_id: process.env.EMAILJS_SHIPPED_TEMPLATE_ID,
            user_id: process.env.EMAILJS_PUBLIC_KEY,
            accessToken: process.env.EMAILJS_PRIVATE_KEY,
            template_params: {
              to_email: toEmail,
              buyer_name: buyerName || "お客様",
              order_id: order.id,
            },
          };

          const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const text = await r.text();
          if (r.ok) {
            mailStatus = "SENT";
            await sb
              .from("orders")
              .update({ email: order.email || toEmail, name: order.name || buyerName })
              .eq("id", order.id);
          } else {
            console.error("SHIPPED_EMAIL_FAILED:", r.status, text);
            mailStatus = "EMAILJS_FAILED";
          }
        } else {
          mailStatus = "NO_BUYER_EMAIL";
        }
      } catch (eMail) {
        console.error("SHIPPED_EMAIL_ERROR:", eMail?.message || eMail);
        mailStatus = "ERROR";
      }
    }

    return res.json({ ok: true, shippingStatus: "shipped", email: mailStatus });
  } catch (e) {
    console.error("UPDATE_SHIPPING_STATUS_ERROR:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
}
