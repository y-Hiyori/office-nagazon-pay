// api/update-shipping-status.js
// 管理者が注文の発送ステータスを切り替える（発送準備中 ⇔ 発送完了）
// 発送完了メールは管理者が手動で送る運用のため、ここではメールを送信しない。
//   POST body: { orderId, token, accessToken, action }
//   - token      : orders.paypay_return_token と照合（既存APIと同じ方式）
//   - accessToken: 管理者ユーザーのセッショントークン（profiles.is_admin を確認）
//   - action     : "shipped"（発送完了） | "preparing"（発送準備中に戻す）
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
      .select("id,status,fulfillment_type,paypay_return_token")
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

    const shippingStatus = action === "shipped" ? "shipped" : "preparing";
    await sb
      .from("orders")
      .update({ shipping_status: shippingStatus })
      .eq("id", order.id);

    return res.json({ ok: true, shippingStatus });
  } catch (e) {
    console.error("UPDATE_SHIPPING_STATUS_ERROR:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
}
