// api/send-contact-email.js
export default async function handler(req, res) {
  // CORS（必要なら Origin を絞ってもOK）
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const {
      contact_name,
      contact_email,
      contact_subject,
      contact_message,
      contact_order_id,
      hp, // honeypot（フォームに隠し項目で入れてるやつ）
    } = req.body ?? {};

    // スパム対策：honeypot が埋まってたら弾く
    if (hp) return res.status(200).json({ ok: true });

    // バリデーション（最低限）
    if (
      !contact_name ||
      !contact_email ||
      !contact_subject ||
      !contact_message
    ) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const msg = String(contact_message);
    if (msg.trim().length < 10) {
      return res.status(400).json({ error: "message_too_short" });
    }

    const serviceId = process.env.EMAILJS_SERVICE_ID;
    // ✅ ここがB：CONTACTが無ければ TEMPLATE_ID を使う
    const templateId =
      process.env.EMAILJS_CONTACT_TEMPLATE_ID ?? process.env.EMAILJS_TEMPLATE_ID;
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
        contact_name,
        contact_email,
        contact_subject,
        contact_message: msg,
        contact_order_id: contact_order_id || "（未入力）",
      },
    };

    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) {
      return res
        .status(r.status)
        .json({ error: "emailjs_failed", detail: text });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error" });
  }
}