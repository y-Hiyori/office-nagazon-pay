// api/send-admin-order-email.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { orderId, buyerName, itemsText, totalText, to_email } = req.body ?? {};
    if (!orderId || !buyerName || !itemsText || !totalText || !to_email) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_TEMPLATE_ID; // ← これを客用にする
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY;

    if (!serviceId || !templateId || !publicKey) {
      return res.status(500).json({ error: "emailjs_env_missing" });
    }

    const payload = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      ...(privateKey ? { accessToken: privateKey } : {}),
      template_params: {
        to_email,          // ✅ 購入者のメールへ
        order_id: orderId,
        buyer_name: buyerName,
        items_text: itemsText,
        total_text: totalText,
      },
    };

    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: "emailjs_failed", detail: text });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error" });
  }
}