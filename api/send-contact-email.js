// api/send-contact-email.js
import { buildAdminEmail, esc, sendEmailJS } from "./_email.js";

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

    // EmailJSへ送信（お問い合わせ = 管理者宛てテンプレ）
    const name = String(contact_name).trim();
    const email = String(contact_email).trim();
    const subject = String(contact_subject).trim();
    const message = String(contact_message).trim();
    const orderId = String(contact_order_id || "").trim();

    const mail = buildAdminEmail({
      subject: `【お問い合わせ】${subject}`,
      eyebrow: "お問い合わせ",
      title: subject,
      lead: "お問い合わせフォームから新しいメッセージが届きました。",
      rows: [
        ["お名前", esc(name)],
        ["メールアドレス", `<a href="mailto:${esc(email)}" style="color:#1e6fd9;">${esc(email)}</a>`],
        ["注文番号", esc(orderId || "（未入力）")],
      ],
      messageTitle: "お問い合わせ内容",
      messageText: message,
    });

    const r = await sendEmailJS(process.env.EMAILJS_CONTACT_TEMPLATE_ID, {
      subject: mail.subject,
      html: mail.html,
      contact_name: name,
      contact_email: email,
      contact_subject: subject,
      contact_message: message,
      contact_order_id: orderId || "（未入力）",
    });

    if (!r.ok) {
      return res.status(500).json({ ok: false, status: "EMAILJS_FAILED", detail: r.detail });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("SEND_CONTACT_EMAIL_ERROR:", e);
    return res.status(500).json({ ok: false, status: "SERVER_ERROR", message: String(e?.message || e) });
  }
}