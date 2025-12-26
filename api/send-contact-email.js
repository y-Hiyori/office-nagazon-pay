// api/send-contact-email.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  try {
    const need = ["EMAILJS_SERVICE_ID","EMAILJS_PUBLIC_KEY","EMAILJS_PRIVATE_KEY","EMAILJS_CONTACT_TEMPLATE_ID"];
    const missing = need.filter((k) => !process.env[k]);
    if (missing.length) return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });

    const { name, email, message } = req.body || {};
    if (!name || !email || !message) return res.status(400).json({ ok: false, status: "MISSING" });

    const payload = {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_CONTACT_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: { name, email, message },
    };

    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) return res.status(500).json({ ok: false, status: "EMAILJS_FAILED", detail: text });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
}