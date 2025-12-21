// api/send-contact-email.js
export default async function handler(req, res) {
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
      hp,
    } = req.body ?? {};

    // honeypot（スパム対策）
    if (hp) return res.status(200).json({ ok: true });

    if (!contact_name || !contact_email || !contact_subject || !contact_message) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const msg = String(contact_message ?? "");
    if (msg.trim().length < 10) {
      return res.status(400).json({ error: "message_too_short" });
    }

    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId =
      process.env.EMAILJS_CONTACT_TEMPLATE_ID ?? process.env.EMAILJS_TEMPLATE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY;

    // ★ 管理者宛先（これが無いと recipients empty になる）
    const toEmail = process.env.CONTACT_TO_EMAIL;

    if (!serviceId || !templateId || !publicKey || !toEmail) {
      return res.status(500).json({ error: "emailjs_env_missing" });
    }

    const payload = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      ...(privateKey ? { accessToken: privateKey } : {}),
      template_params: {
        to_email: toEmail,                 // ✅ 宛先（管理者）
        reply_to: contact_email,           // ✅ 返信先（ユーザー）
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
    if (!r.ok) return res.status(422).json({ error: "emailjs_failed", detail: text });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error" });
  }
}