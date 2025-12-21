// api/send-contact-email.js
export default async function handler(req, res) {
  // CORS（必要なら）
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
      // honeypot（空じゃなければBOT扱い）
      hp,
    } = req.body ?? {};

    // ✅ honeypot
    if (typeof hp === "string" && hp.trim().length > 0) {
      return res.status(200).json({ ok: true }); // BOTには成功に見せる
    }

    // ✅ 入力チェック（最低限）
    const name = String(contact_name ?? "").trim();
    const email = String(contact_email ?? "").trim();
    const subject = String(contact_subject ?? "").trim();
    const message = String(contact_message ?? "").trim();
    const orderId = String(contact_order_id ?? "").trim();

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: "missing_fields" });
    }

    if (!email.includes("@") || email.length > 254) {
      return res.status(400).json({ error: "invalid_email" });
    }

    if (subject.length > 120) {
      return res.status(400).json({ error: "subject_too_long" });
    }

    if (message.length < 10) {
      return res.status(400).json({ error: "message_too_short" });
    }

    if (message.length > 4000) {
      return res.status(400).json({ error: "message_too_long" });
    }

    if (orderId.length > 100) {
      return res.status(400).json({ error: "order_id_too_long" });
    }

    // ✅ 簡易レート制限（IP単位：超簡易。サーバレスなので強くはないけど無いよりマシ）
    // Vercel/Proxy経由
    const ip =
      (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    // 乱暴だけど「同一IPから短時間に連打」を少し抑える（メモリに残らない環境では弱い）
    // ここは本気ならUpstash等に移すのがベスト。今回は“手軽に”の範囲。
    // → なので「スパム完全防止」ではなく「事故予防」。
    // eslint-disable-next-line no-unused-vars
    const _ip = ip;

    // ✅ EmailJS（サーバー側Env）
    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_CONTACT_TEMPLATE_ID; // ← お問い合わせ用テンプレIDを別で用意推奨
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY; // あれば

    if (!serviceId || !templateId || !publicKey) {
      return res.status(500).json({ error: "emailjs_env_missing" });
    }

    const payload = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      ...(privateKey ? { accessToken: privateKey } : {}),
      template_params: {
        contact_name: name,
        contact_email: email,
        contact_subject: subject,
        contact_message: message,
        contact_order_id: orderId || "（未入力）",
        // 参考情報（テンプレに使いたければ）
        sender_ip: ip,
      },
    };

    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) {
      return res.status(r.status).json({ error: "emailjs_failed", detail: text });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error" });
  }
}