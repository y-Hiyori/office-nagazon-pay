// api/send-contact-email.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, status: "METHOD_NOT_ALLOWED" });

  try {
    const {
      contact_name,
      contact_email,
      contact_subject,
      contact_message,
      contact_order_id,
      hp,
    } = req.body || {};

    // honeypot（ボット対策）: 何か入ってたら“成功扱いで捨てる”
    if (hp && String(hp).trim() !== "") {
      return res.json({ ok: true, status: "SPAM_IGNORED" });
    }

    if (!contact_name || !contact_email || !contact_subject || !contact_message) {
      return res.status(400).json({ ok: false, status: "MISSING" });
    }

    // Envチェック（あなたのVercelスクショに合わせる）
    const need = [
      "EMAILJS_SERVICE_ID",
      "EMAILJS_PUBLIC_KEY",
      "EMAILJS_PRIVATE_KEY",
      "EMAILJS_CONTACT_TEMPLATE_ID",
    ];
    const missingEnv = need.filter((k) => !process.env[k]);
    if (missingEnv.length) {
      return res.status(500).json({ ok: false, status: "ENV_MISSING", missing: missingEnv });
    }

    // EmailJSへ送信（お問い合わせ = 管理者宛てテンプレ想定）
    const payload = {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_CONTACT_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: {
        contact_name: String(contact_name).trim(),
        contact_email: String(contact_email).trim(),
        contact_subject: String(contact_subject).trim(),
        contact_message: String(contact_message).trim(),
        contact_order_id: String(contact_order_id || "（未入力）").trim(),
      },
    };

    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) {
      return res.status(500).json({ ok: false, status: "EMAILJS_FAILED", detail: text });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("SEND_CONTACT_EMAIL_ERROR:", e);
    return res.status(500).json({ ok: false, status: "SERVER_ERROR", message: String(e?.message || e) });
  }
}