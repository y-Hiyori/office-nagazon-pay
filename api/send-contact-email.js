// api/send-contact-email.js

const ALLOWED_ORIGINS = new Set([
  "https://office-nagazon-pay.vercel.app",
  // 独自ドメイン使うならここにも追加
]);

const MAX_LEN = {
  name: 60,
  email: 120,
  subject: 120,
  message: 2000,
  orderId: 120,
};

// 簡易レート制限（ベストエフォート：サーバレスなので完璧ではない）
const rateMap = new Map(); // key: ip, value: { count, resetAt }
function rateLimit(ip) {
  const now = Date.now();
  const windowMs = 60_000; // 1分
  const limit = 10; // 1分10回まで

  const cur = rateMap.get(ip);
  if (!cur || now > cur.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || "";
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    // 直叩き curl でも動くように（必要なら * を外してOK）
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    // IP
    const xff = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() || "unknown";

    if (!rateLimit(ip)) {
      return res.status(429).json({ error: "too_many_requests" });
    }

    const contact_name = safeStr(req.body?.contact_name);
    const contact_email = safeStr(req.body?.contact_email).toLowerCase();
    const contact_subject = safeStr(req.body?.contact_subject);
    const contact_message = safeStr(req.body?.contact_message);
    const contact_order_id = safeStr(req.body?.contact_order_id || "（未入力）");

    // honeypot（bot対策）
    const hp = safeStr(req.body?.hp);
    if (hp) {
      return res.status(200).json({ ok: true }); // botは成功に見せて静かに捨てる
    }

    // バリデーション
    if (!contact_name || !contact_email || !contact_subject || !contact_message) {
      return res.status(400).json({ error: "missing_fields" });
    }
    if (!isEmail(contact_email)) {
      return res.status(400).json({ error: "invalid_email" });
    }
    if (contact_message.length < 10) {
      return res.status(400).json({ error: "message_too_short" });
    }

    // 長さ制限
    if (contact_name.length > MAX_LEN.name) return res.status(400).json({ error: "name_too_long" });
    if (contact_email.length > MAX_LEN.email) return res.status(400).json({ error: "email_too_long" });
    if (contact_subject.length > MAX_LEN.subject) return res.status(400).json({ error: "subject_too_long" });
    if (contact_message.length > MAX_LEN.message) return res.status(400).json({ error: "message_too_long" });
    if (contact_order_id.length > MAX_LEN.orderId) return res.status(400).json({ error: "order_id_too_long" });

    // Env（Vercelの環境変数に入れる）
    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_CONTACT_TEMPLATE_ID; // ★問い合わせ用テンプレ
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY; // EmailJSのPrivate key(Access Token)

    if (!serviceId || !templateId || !publicKey || !privateKey) {
      return res.status(500).json({ error: "emailjs_env_missing" });
    }

    // 送信先は「テンプレ側」or ここで固定（テンプレ推奨）
    const payload = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        contact_name,
        contact_email,
        contact_subject,
        contact_message,
        contact_order_id,
        // ここで ip も渡せる（テンプレに項目作るなら）
        contact_ip: ip,
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