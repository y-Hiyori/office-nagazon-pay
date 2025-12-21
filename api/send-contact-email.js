// api/send-contact-email.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      contact_name,
      contact_email,
      contact_subject,
      contact_message,
      contact_order_id,
      hp, // honeypot
    } = req.body ?? {};

    // honeypot（スパム対策）
    if (hp) return res.status(200).json({ ok: true });

    const name = String(contact_name ?? "").trim();
    const email = String(contact_email ?? "").trim();
    const subject = String(contact_subject ?? "").trim();
    const message = String(contact_message ?? "").trim();
    const orderId = String(contact_order_id ?? "").trim() || "（未入力）";

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: "missing_fields" });
    }
    if (message.length < 10) {
      return res.status(400).json({ error: "message_too_short" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "invalid_email" });
    }

    const serviceId = process.env.EMAILJS_SERVICE_ID;
    // ★ ここは「お問い合わせ専用テンプレ」を最優先にする
    const templateId =
      process.env.EMAILJS_CONTACT_TEMPLATE_ID ||
      process.env.VITE_EMAILJS_CONTACT_TEMPLATE_ID; // 念のため
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
        // ✅ 宛先はテンプレ側(To Email固定)に任せる
        // ✅ 返信先はテンプレの Reply-To が {{contact_email}} ならこれでOK
        contact_name: name,
        contact_email: email,
        contact_subject: subject,
        contact_message: message,
        contact_order_id: orderId,

        // もしテンプレで reply_to を使ってるなら両方入れとくと安全
        reply_to: email,
      },
    };

    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) {
      return res.status(422).json({ error: "emailjs_failed", detail: text });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error" });
  }
}