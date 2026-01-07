/**
 * OCI用 server.cjs（NAGAZON Pay / PayPay + Supabase）
 * - /api/health
 * - /api/create-paypay-order
 * - /api/confirm-paypay-payment
 * - /api/paypay-status
 * - /api/send-admin-order-email
 * - /api/send-buyer-order-email
 * - /api/send-contact-email
 *
 * 必須ENV（最低限）
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - PAYPAY_API_KEY
 *  - PAYPAY_API_SECRET
 *  - PAYPAY_MERCHANT_ID
 *
 * 推奨ENV
 *  - APP_BASE_URL            例: https://office-nagazon-pay.vercel.app
 *  - PAYPAY_PRODUCTION_MODE  "true" で本番（未設定/falseはsandbox）
 *
 * EmailJS（メール系を使う場合）
 *  - EMAILJS_SERVICE_ID
 *  - EMAILJS_PUBLIC_KEY
 *  - EMAILJS_PRIVATE_KEY
 *  - EMAILJS_TEMPLATE_ID                 （購入者向けテンプレ）
 *  - EMAILJS_ADMIN_TEMPLATE_ID (任意)    （管理者向けテンプレ。無ければTEMPLATE_IDを使う）
 *  - EMAILJS_CONTACT_TEMPLATE_ID         （お問い合わせテンプレ）
 */

"use strict";

const express = require("express");
const cors = require("cors");
const { randomUUID } = require("crypto");

const PAYPAY = require("@paypayopa/paypayopa-sdk-node");
const { createClient } = require("@supabase/supabase-js");

// Node 18+ は fetch が標準。無い環境だけ node-fetch を使う
async function safeFetch(...args) {
  if (typeof fetch === "function") return fetch(...args);
  // eslint-disable-next-line global-require
  const nodeFetch = require("node-fetch");
  return nodeFetch(...args);
}

const app = express();

// behind proxy（Vercel rewrite 経由など）
app.set("trust proxy", true);

// JSON
app.use(express.json({ limit: "1mb" }));

// CORS（基本は全部許可。必要なら ALLOW_ORIGIN を設定して絞る）
const allowOrigin = process.env.ALLOW_ORIGIN || "*";
app.use(
  cors({
    origin: allowOrigin,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// OPTIONS（プレフライト）
app.options("*", (_req, res) => res.status(200).end());

function envMissing(keys) {
  return keys.filter((k) => !process.env[k]);
}

function getAppBaseUrl(req) {
  const env = (process.env.APP_BASE_URL || "").trim();
  if (env) return env.replace(/\/$/, "");

  // envが無い場合はリクエストから推測（念のため）
  const xfHost = (req.headers["x-forwarded-host"] || "").toString();
  const host = xfHost || (req.headers.host || "").toString();
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  if (!host) return "https://example.com";
  return `${proto}://${host}`.replace(/\/$/, "");
}

function configurePayPay() {
  const productionMode = String(process.env.PAYPAY_PRODUCTION_MODE || "").toLowerCase() === "true";

  // SDKはグローバル設定なので毎回安全にセット（起動時クラッシュ回避）
  PAYPAY.Configure({
    clientId: process.env.PAYPAY_API_KEY,
    clientSecret: process.env.PAYPAY_API_SECRET,
    merchantId: process.env.PAYPAY_MERCHANT_ID,
    productionMode,
  });

  return { productionMode };
}

function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function toIntYen(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function makeMerchantPaymentId() {
  // PayPayのmerchantPaymentIdはユニークでOK
  const rand = Math.random().toString(16).slice(2);
  return `nagazon-${Date.now()}-${rand}`;
}

function paypayQRCodeCreate(payload) {
  return new Promise((resolve, reject) => {
    PAYPAY.QRCodeCreate(payload, (response) => {
      try {
        const body = response && response.BODY;
        if (!body) return reject(new Error("NO_PAYPAY_BODY"));

        const ri = body.resultInfo;
        if (!ri || ri.code !== "SUCCESS") {
          const msg = ri ? `${ri.code}:${ri.message || ""}` : "PAYPAY_ERROR";
          const e = new Error(msg);
          e.detail = body;
          return reject(e);
        }
        return resolve(body);
      } catch (e) {
        return reject(e);
      }
    });
  });
}

function paypayGetDetails(merchantPaymentId) {
  return new Promise((resolve, reject) => {
    // SDKの実装揺れ対策：配列でまず呼ぶ
    try {
      PAYPAY.GetCodePaymentDetails([merchantPaymentId], (response) => {
        const body = response && response.BODY;
        if (!body) return reject(new Error("NO_PAYPAY_BODY"));

        const ri = body.resultInfo;
        if (!ri || ri.code !== "SUCCESS") {
          const msg = ri ? `${ri.code}:${ri.message || ""}` : "PAYPAY_ERROR";
          const e = new Error(msg);
          e.detail = body;
          return reject(e);
        }
        return resolve(body);
      });
    } catch (e1) {
      // 念のため：単体引数でも試す
      try {
        PAYPAY.GetCodePaymentDetails(merchantPaymentId, (response) => {
          const body = response && response.BODY;
          if (!body) return reject(new Error("NO_PAYPAY_BODY"));

          const ri = body.resultInfo;
          if (!ri || ri.code !== "SUCCESS") {
            const msg = ri ? `${ri.code}:${ri.message || ""}` : "PAYPAY_ERROR";
            const e = new Error(msg);
            e.detail = body;
            return reject(e);
          }
          return resolve(body);
        });
      } catch (e2) {
        return reject(e2);
      }
    }
  });
}

function extractPayPayStatus(body) {
  const d = body && body.data;
  // dataがオブジェクト/配列どっちでも耐える
  return (
    (d && d.status) ||
    (Array.isArray(d) && d[0] && d[0].status) ||
    "UNKNOWN"
  );
}

// =====================
// health
// =====================
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
  });
});

// =====================
// create-paypay-order
// フロント（Checkout.tsx）から呼ばれる
// =====================
app.post("/api/create-paypay-order", async (req, res) => {
  try {
    const missing = envMissing([
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "PAYPAY_API_KEY",
      "PAYPAY_API_SECRET",
      "PAYPAY_MERCHANT_ID",
    ]);
    if (missing.length) {
      return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });
    }

    configurePayPay();
    const sb = supabaseAdmin();

    // body（Checkout.tsx から来る想定）
    const total = toIntYen(req.body?.total);
    const userId = String(req.body?.userId || "").trim();

    const subtotal = toIntYen(req.body?.subtotal);
    const discountYen = toIntYen(req.body?.discountYen);
    const coupon = (req.body?.coupon ?? null) ? String(req.body.coupon) : null;

    const buyerEmail = (req.body?.buyerEmail ?? null) ? String(req.body.buyerEmail) : null;
    const buyerName = (req.body?.buyerName ?? null) ? String(req.body.buyerName) : null;

    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!userId) return res.status(400).json({ ok: false, status: "MISSING_USERID" });
    if (total <= 0) return res.status(400).json({ ok: false, status: "TOTAL_MUST_BE_POSITIVE" });

    const token = (globalThis.crypto && globalThis.crypto.randomUUID)
      ? globalThis.crypto.randomUUID()
      : randomUUID();

    const merchantPaymentId = makeMerchantPaymentId();

    // 1) orders 作成（pending）
    const { data: orderRow, error: orderErr } = await sb
      .from("orders")
      .insert({
        user_id: userId,
        total: total,
        payment_method: "paypay",
        status: "pending",
        subtotal: subtotal || null,
        discount_amount: discountYen || 0,
        coupon_code: coupon,
        paypay_return_token: token,
        paypay_merchant_payment_id: merchantPaymentId,
        email: buyerEmail,
        name: buyerName,
      })
      .select("id")
      .single();

    if (orderErr || !orderRow) {
      console.error("orders insert error:", orderErr);
      return res.status(500).json({ ok: false, status: "ORDER_INSERT_FAILED", message: orderErr?.message });
    }

    const orderId = orderRow.id;

    // 2) order_items（あれば）
    if (items.length) {
      const payload = items.map((it) => ({
        order_id: orderId,
        product_id: Number(it.productId),
        product_name: String(it.name || ""),
        price: toIntYen(it.price),
        quantity: Math.max(1, Math.floor(Number(it.quantity || 1))),
      }));

      const { error: itemsErr } = await sb.from("order_items").insert(payload);
      if (itemsErr) {
        console.error("order_items insert error:", itemsErr);
        // 注文だけ残るのが嫌なら消す（ここでは消す）
        await sb.from("orders").delete().eq("id", orderId);
        return res.status(500).json({ ok: false, status: "ORDER_ITEMS_INSERT_FAILED", message: itemsErr.message });
      }
    }

    // 3) PayPay QR作成
    const appBase = getAppBaseUrl(req);
    const redirectUrl = `${appBase}/paypay-return`;

    const paypayPayload = {
      merchantPaymentId,
      amount: { amount: total, currency: "JPY" },
      codeType: "ORDER_QR",
      orderDescription: `NAGAZON ご注文（${total.toLocaleString("ja-JP")}円）`,
      isAuthorization: false,
      redirectUrl,
      redirectType: "WEB_LINK",
      userAgent: String(req.headers["user-agent"] || ""),
    };

    let body;
    try {
      body = await paypayQRCodeCreate(paypayPayload);
    } catch (e) {
      console.error("PayPay QRCodeCreate error:", e?.message || e, e?.detail || "");
      // 注文をfailedに
      await sb.from("orders").update({ status: "failed" }).eq("id", orderId);
      return res.status(500).json({
        ok: false,
        status: "PAYPAY_CREATE_FAILED",
        message: String(e?.message || e),
      });
    }

    const paypayUrl = body?.data?.url || body?.data?.deeplink || null;

    if (!paypayUrl) {
      console.error("PayPay response missing url:", body);
      await sb.from("orders").update({ status: "failed" }).eq("id", orderId);
      return res.status(500).json({ ok: false, status: "PAYPAY_URL_MISSING" });
    }

    return res.json({
      ok: true,
      redirectUrl: paypayUrl,
      orderId,
      token,
      merchantPaymentId,
    });
  } catch (e) {
    console.error("create-paypay-order fatal:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
});

// =====================
// confirm-paypay-payment
// PayPayReturn.tsx から { orderId, token } で叩く
// =====================
app.post("/api/confirm-paypay-payment", async (req, res) => {
  try {
    const missing = envMissing([
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "PAYPAY_API_KEY",
      "PAYPAY_API_SECRET",
      "PAYPAY_MERCHANT_ID",
    ]);
    if (missing.length) {
      return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });
    }

    configurePayPay();
    const sb = supabaseAdmin();

    const orderId = String(req.body?.orderId || "").trim();
    const token = String(req.body?.token || "").trim();
    if (!orderId || !token) return res.status(400).json({ ok: false, status: "MISSING" });

    const { data: order, error: oErr } = await sb
      .from("orders")
      .select("id,status,paypay_merchant_payment_id,paypay_return_token")
      .eq("id", orderId)
      .single();

    if (oErr || !order) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });
    if (String(order.paypay_return_token || "") !== token) {
      return res.status(403).json({ ok: false, status: "BAD_TOKEN" });
    }

    const st = String(order.status || "").toLowerCase();
    if (st === "paid") {
      return res.json({ ok: true, paid: true, status: "paid", orderDbId: order.id });
    }

    const mpid = String(order.paypay_merchant_payment_id || "");
    if (!mpid) return res.status(400).json({ ok: false, status: "NO_MPID" });

    const body = await paypayGetDetails(mpid);
    const paypayStatus = extractPayPayStatus(body);

    if (paypayStatus === "COMPLETED") {
      await sb
        .from("orders")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", orderId);

      return res.json({
        ok: true,
        paid: true,
        status: "paid",
        paypayStatus,
        orderDbId: order.id,
      });
    }

    // まだ待ち
    return res.json({
      ok: true,
      paid: false,
      status: "PENDING",
      paypayStatus,
      orderDbId: order.id,
    });
  } catch (e) {
    console.error("confirm-paypay-payment fatal:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
});

// =====================
// paypay-status（単純ステータス確認）
// body: { merchantPaymentId }
// =====================
app.post("/api/paypay-status", async (req, res) => {
  try {
    const missing = envMissing(["PAYPAY_API_KEY", "PAYPAY_API_SECRET", "PAYPAY_MERCHANT_ID"]);
    if (missing.length) return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });

    configurePayPay();

    const merchantPaymentId = String(req.body?.merchantPaymentId || "").trim();
    if (!merchantPaymentId) return res.status(400).json({ ok: false, status: "MISSING_MERCHANT_PAYMENT_ID" });

    const body = await paypayGetDetails(merchantPaymentId);
    const status = extractPayPayStatus(body);

    return res.json({ ok: true, status });
  } catch (e) {
    console.error("paypay-status fatal:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
});

// =====================
// send-admin-order-email
// （dist側や過去コードで呼ばれてたやつ用）
// body: { orderId, buyerName, itemsText, totalText, to_email }
// =====================
app.post("/api/send-admin-order-email", async (req, res) => {
  try {
    const need = ["EMAILJS_SERVICE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY"];
    const missing = envMissing(need);
    if (missing.length) return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });

    const {
      orderId = "",
      buyerName = "",
      itemsText = "",
      totalText = "",
      to_email = "",
    } = req.body || {};

    const toEmail = String(to_email || "").trim();
    if (!toEmail) return res.status(400).json({ ok: false, status: "MISSING_TO_EMAIL" });

    const templateId =
      (process.env.EMAILJS_ADMIN_TEMPLATE_ID || "").trim() ||
      (process.env.EMAILJS_TEMPLATE_ID || "").trim();

    if (!templateId) {
      return res.status(500).json({ ok: false, status: "ENV_MISSING", missing: ["EMAILJS_TEMPLATE_ID"] });
    }

    const payload = {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email: toEmail,
        buyer_name: String(buyerName || "お客様").trim(),
        order_id: String(orderId || "").trim(),
        items_text: String(itemsText || "（明細なし）"),
        total_text: String(totalText || ""),
      },
    };

    const r = await safeFetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) return res.status(500).json({ ok: false, status: "EMAILJS_FAILED", detail: text });

    return res.json({ ok: true, status: "SENT" });
  } catch (e) {
    console.error("send-admin-order-email fatal:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
});

// =====================
// send-buyer-order-email（PurchaseComplete.tsx から呼ばれる）
// body: { orderId, token }
// =====================
app.post("/api/send-buyer-order-email", async (req, res) => {
  try {
    const need = [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "EMAILJS_SERVICE_ID",
      "EMAILJS_PUBLIC_KEY",
      "EMAILJS_PRIVATE_KEY",
      "EMAILJS_TEMPLATE_ID",
    ];
    const missing = envMissing(need);
    if (missing.length) {
      return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });
    }

    const { orderId, token } = req.body || {};
    if (!orderId || !token) return res.status(400).json({ ok: false, status: "MISSING" });

    const sb = supabaseAdmin();

    const { data: order, error: orderErr } = await sb
      .from("orders")
      .select(
        "id,user_id,status,total,discount_amount,coupon_code,created_at,paypay_return_token,email,name,buyer_email_sent_at"
      )
      .eq("id", orderId)
      .single();

    if (orderErr || !order) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });
    if (String(order.paypay_return_token || "") !== String(token)) {
      return res.status(403).json({ ok: false, status: "BAD_TOKEN" });
    }

    // paid の時だけ送る
    const st = String(order.status || "").toLowerCase();
    if (st !== "paid") return res.status(409).json({ ok: false, status: "NOT_PAID" });

    // 二重送信防止
    if (order.buyer_email_sent_at) return res.json({ ok: true, status: "ALREADY_SENT" });

    let toEmail = (order.email || "").trim();
    let buyerName = (order.name || "").trim();

    // profiles から補完
    if ((!toEmail || !buyerName) && order.user_id) {
      const { data: prof } = await sb
        .from("profiles")
        .select("email,name")
        .eq("id", order.user_id)
        .maybeSingle();

      if (!toEmail) toEmail = (prof?.email || "").trim();
      if (!buyerName) buyerName = (prof?.name || "").trim();
    }

    // auth.users から最終補完（service role 必須）
    if (!toEmail && order.user_id) {
      const { data: authData, error: authErr } = await sb.auth.admin.getUserById(order.user_id);
      if (!authErr) toEmail = (authData?.user?.email || "").trim();
    }

    if (!toEmail) return res.status(500).json({ ok: false, status: "NO_BUYER_EMAIL" });

    const { data: items } = await sb
      .from("order_items")
      .select("product_name,price,quantity")
      .eq("order_id", orderId);

    const itemsText = (items || [])
      .map((it) => `${it.product_name} ×${it.quantity}（単価: ${Number(it.price).toLocaleString("ja-JP")}円）`)
      .join("\n");

    const totalYen = Number(order.total || 0);
    const disc = Number(order.discount_amount || 0);
    const coupon = order.coupon_code || "";
    const totalText =
      disc > 0
        ? `${totalYen.toLocaleString("ja-JP")}円（クーポン:${coupon || "-"} -${disc.toLocaleString("ja-JP")}円）`
        : `${totalYen.toLocaleString("ja-JP")}円`;

    const payload = {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email: toEmail,
        buyer_name: buyerName || "お客様",
        order_id: order.id,
        items_text: itemsText || "（明細なし）",
        total_text: totalText,
      },
    };

    const r = await safeFetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) return res.status(500).json({ ok: false, status: "EMAILJS_FAILED", detail: text });

    // 送信済み記録
    await sb
      .from("orders")
      .update({
        email: order.email || toEmail,
        name: order.name || buyerName,
        buyer_email_sent_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    return res.json({ ok: true, status: "SENT" });
  } catch (e) {
    console.error("send-buyer-order-email fatal:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
});

// =====================
// send-contact-email（お問い合わせ）
// =====================
app.post("/api/send-contact-email", async (req, res) => {
  try {
    const { contact_name, contact_email, contact_subject, contact_message, contact_order_id, hp } = req.body || {};

    // honeypot（ボット対策）：入ってたら成功扱いで捨てる
    if (hp && String(hp).trim() !== "") {
      return res.json({ ok: true, status: "SPAM_IGNORED" });
    }

    if (!contact_name || !contact_email || !contact_subject || !contact_message) {
      return res.status(400).json({ ok: false, status: "MISSING" });
    }

    const need = ["EMAILJS_SERVICE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY", "EMAILJS_CONTACT_TEMPLATE_ID"];
    const missing = envMissing(need);
    if (missing.length) return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });

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

    const r = await safeFetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) return res.status(500).json({ ok: false, status: "EMAILJS_FAILED", detail: text });

    return res.json({ ok: true });
  } catch (e) {
    console.error("send-contact-email fatal:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
});

// =====================
// 404
// =====================
app.use((_req, res) => res.status(404).json({ ok: false, status: "NOT_FOUND" }));

// =====================
// start
// =====================
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[OCI] server started: http://0.0.0.0:${PORT}`);
});
