/**
 * OCI用 server.cjs（NAGAZON Pay / PayPay + Supabase）
 * - /api/health
 * - /api/create-paypay-order
 * - /api/confirm-paypay-payment
 * - /api/paypay-status
 * - /api/send-admin-order-email
 * - /api/send-buyer-order-email
 * - /api/send-contact-email
 * - /api/cancel-paypay-order       （未払い注文の取消）
 * - /api/admin-cancel-order        （支払済み注文のキャンセル＋PayPay返金）
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

function paypayQRCodeDelete(codeId) {
  return new Promise((resolve) => {
    try {
      PAYPAY.QRCodeDelete([codeId], (response) => resolve(response || null));
    } catch (e) {
      resolve({ error: String(e?.message || e) });
    }
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

function paypayRefund(payload) {
  return new Promise((resolve, reject) => {
    try {
      PAYPAY.PaymentRefund(payload, (response) => {
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
    } catch (e) {
      return reject(e);
    }
  });
}

function paypayGetRefundDetails(merchantRefundId) {
  return new Promise((resolve, reject) => {
    try {
      PAYPAY.GetRefundDetails([merchantRefundId], (response) => {
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
    } catch (e) {
      return reject(e);
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
    let total = toIntYen(req.body?.total);
    const userId = String(req.body?.userId || "").trim();

    let subtotal = toIntYen(req.body?.subtotal);
    let discountYen = toIntYen(req.body?.discountYen);
    const coupon = (req.body?.coupon ?? null) ? String(req.body.coupon) : null;

    const buyerEmail = (req.body?.buyerEmail ?? null) ? String(req.body.buyerEmail) : null;
    const buyerName = (req.body?.buyerName ?? null) ? String(req.body.buyerName) : null;
    const buyerPhone = (req.body?.phone ?? null) ? String(req.body.phone) : null;
    const buyerPostal = (req.body?.postalCode ?? null) ? String(req.body.postalCode) : null;
    const buyerAddress = (req.body?.address ?? null) ? String(req.body.address) : null;
    const buyerBuilding = (req.body?.building ?? null) ? String(req.body.building) : null;
    const fulfillmentType = String(req.body?.fulfillmentType || "").trim() === "shipping" ? "shipping" : "pickup";

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const pointsUsed = toIntYen(req.body?.pointsUsed);

    // 決済時点の価格をサーバー側で再計算（会員価格対応・ログイン時のみ会員価格）
    const pidList = items.map((it) => Number(it.productId)).filter((v) => Number.isFinite(v));
    const priceMap = new Map();
    if (pidList.length) {
      const { data: prods, error: pErr } = await sb
        .from("products")
        .select("id,price,member_price,earn_points")
        .in("id", pidList);
      if (pErr) console.error("products fetch error:", pErr);
      for (const pr of prods || []) {
        const base = Number(pr.price ?? 0);
        const mem = Number(pr.member_price ?? 0);
        const isMember = !!userId && Number.isFinite(mem) && mem > 0;
        priceMap.set(Number(pr.id), {
          price: isMember ? mem : base,
          earn: Math.max(0, Math.floor(Number(pr.earn_points || 0))),
        });
      }
    }

    // 注文価格を商品ごとに確定（該当商品は実効価格、それ以外はクライアント値を尊重）
    let subtotalSum = 0;
    const pricedItems = items.map((it) => {
      const pid = Number(it.productId);
      const e = priceMap.get(pid);
      const price = e ? e.price : toIntYen(it.price);
      const qty = Math.max(1, Math.floor(Number(it.quantity || 1)));
      subtotalSum += price * qty;
      return { ...it, productId: pid, price, quantity: qty };
    });

    subtotal = subtotalSum;
    discountYen = Math.min(toIntYen(req.body?.discountYen), subtotal);
    total = Math.max(subtotal - discountYen - pointsUsed, 0);

    // ゲスト（アカウント未登録）も許可：userId は任意。orders.user_id は null になる
    if (total <= 0) return res.status(400).json({ ok: false, status: "TOTAL_MUST_BE_POSITIVE" });

    const token = (globalThis.crypto && globalThis.crypto.randomUUID)
      ? globalThis.crypto.randomUUID()
      : randomUUID();

    const merchantPaymentId = makeMerchantPaymentId();

    // 1) orders 作成（pending）
    const { data: orderRow, error: orderErr } = await sb
      .from("orders")
      .insert({
        user_id: userId || null,
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
        phone: buyerPhone,
        postal_code: buyerPostal,
        address: buyerAddress,
        building: buyerBuilding,
        fulfillment_type: fulfillmentType,
        shipping_status: fulfillmentType === "shipping" ? "preparing" : null,
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
      const payload = pricedItems.map((it) => ({
        order_id: orderId,
        product_id: Number(it.productId),
        product_name: String(it.name || ""),
        price: it.price,
        quantity: it.quantity,
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
    const redirectUrl = `${appBase}/paypay-return?orderId=${encodeURIComponent(orderId)}`;

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
      codeId: body?.data?.codeId || null,
      expiryDate: body?.data?.expiryDate || null,
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

    let orderId = String(req.body?.orderId || "").trim();
    const token = String(req.body?.token || "").trim();
    const qMpid = String(req.body?.merchantPaymentId || "").trim();

    // 注文の特定：orderId+token がある場合はそれで、無ければ merchantPaymentId で解決（PayPay戻り時はこちら）
    let order;
    if (orderId) {
      const { data: o, error: oErr } = await sb
        .from("orders")
        .select("id,status,user_id,paypay_merchant_payment_id,paypay_return_token,points_used")
        .eq("id", orderId)
        .single();
      if (oErr || !o) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });
      if (token && String(o.paypay_return_token || "") !== token) {
        return res.status(403).json({ ok: false, status: "BAD_TOKEN" });
      }
      order = o;
    } else if (qMpid) {
      const { data: o, error: oErr } = await sb
        .from("orders")
        .select("id,status,user_id,paypay_merchant_payment_id,paypay_return_token,points_used")
        .eq("paypay_merchant_payment_id", qMpid)
        .maybeSingle();
      if (oErr || !o) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });
      order = o;
    } else {
      return res.status(400).json({ ok: false, status: "MISSING" });
    }
    orderId = order.id;

    const st = String(order.status || "").toLowerCase();
    if (st === "paid") {
      return res.json({ ok: true, paid: true, status: "paid", orderDbId: order.id });
    }

    const mpid = String(order.paypay_merchant_payment_id || "");
    if (!mpid) return res.status(400).json({ ok: false, status: "NO_MPID" });

    const body = await paypayGetDetails(mpid);
    const paypayStatus = extractPayPayStatus(body);

    if (paypayStatus === "COMPLETED") {
      await finalizePaidOrder(sb, order);
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
// ============================================================================
// PayPay 決済完了の自動確定
// ブラウザが戻り画面に帰れなくても、VPSが裏でPayPayの状態を監視して支払い完了を
// 検知したら paid反映・在庫減算・ポイント付与・購入者メールを自動実行する
// ============================================================================
async function finalizePaidOrder(sb, order) {
  if (order && String(order.status || "").toLowerCase() === "paid") return order.id;
  const orderId = order.id;

  // ✅ 二重確定防止：pending/created → finalizing にできた1回だけが確定処理を行う
  //    （戻り画面のポーリングと裏のスイープが重なっても在庫を二重に減らさない）
  const { data: claimed, error: claimErr } = await sb
    .from("orders")
    .update({ status: "finalizing" })
    .eq("id", orderId)
    .in("status", ["pending", "created"])
    .select("id");
  if (claimErr) {
    console.error("[FINALIZE_LOCK_ERR]", claimErr.message);
    return orderId;
  }
  if (!claimed || claimed.length === 0) {
    console.log("[FINALIZE_SKIP] already finalizing/paid:", orderId);
    return orderId;
  }

  // ---- 確定処理（在庫・ロットを先に、paid 反映は最後） ----
  let paidOk = false;
  try {
    // 在庫減算（ロット消費より前。ロット減算時に在庫が同期されるため）
    try {
      const { data: oi } = await sb.from("order_items").select("product_id,quantity").eq("order_id", orderId);
      for (const it of oi || []) {
        await sb.rpc("decrement_stock", { p_product_id: Number(it.product_id), p_qty: Number(it.quantity) });
      }
    } catch (eStock) {
      console.error("[STOCK_DEDUCT_ERR]", eStock && eStock.message);
    }

    // 入荷ロット消費（トリガでも走るが冪等）
    try {
      await sb.rpc("consume_lots_for_order", { p_order_id: orderId });
    } catch (eLot) {
      console.error("[LOT_CONSUME_ERR]", eLot && eLot.message);
    }

    // paid 反映（在庫・ロット処理のあとに確定）
    await sb.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", orderId);
    paidOk = true;
  } catch (eFinalize) {
    console.error("[FINALIZE_ERR]", eFinalize && eFinalize.message);
    await sb.from("orders").update({ status: "pending" }).eq("id", orderId).then(
      () => {},
      () => {}
    );
  }
  if (!paidOk) return orderId;

  // ポイント使用（ポイント購入済み注文）
  if (Number(order.points_used || 0) > 0) {
    try {
      const rU = await sb.rpc("points_use_for_order", { p_order_id: orderId, p_points: Number(order.points_used) });
      if (rU.error) console.error("[POINTS_USE_ERR]", rU.error.message);
    } catch (ePt) {
      console.error("[POINTS_USE_ERR]", ePt && ePt.message);
    }
  }

  // アカウント購入のみ：付与ポイントを財布へ反映（一度だけ）
  if (order.user_id) {
    try {
      const rA = await sb.rpc("points_award_for_order", { p_order_id: orderId });
      if (rA.error) console.error("[POINTS_AWARD_ERR]", rA.error.message);
    } catch (eA) {
      console.error("[POINTS_AWARD_ERR]", eA && eA.message);
    }
  } else {
    console.log("[POINTS_AWARD_SKIP] guest order - no points awarded");
  }

  // 購入者宛完了メール（Vercel の /api/send-buyer-order-email を直接呼ぶ。二重送信は Vercel 側で防止）
  try {
    const mailBase = (process.env.FRONTEND_ORIGIN || "").replace(/\/$/, "");
    if (mailBase) {
      await fetch(`${mailBase}/api/send-buyer-order-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, token: String(order.paypay_return_token || "") }),
      }).catch((e) => console.error("[BUYER_MAIL_ERROR]", e && e.message));
    } else {
      console.error("[BUYER_MAIL_SKIP] FRONTEND_ORIGIN unset in VPS .env");
    }
  } catch (eMail) {
    console.error("[MAIL_FINALIZE_ERR]", eMail && eMail.message);
  }

  return orderId;
}

let sweepRunning = false;
async function sweepPendingOrders() {
  if (sweepRunning) return;
  if (!process.env.PAYPAY_API_KEY || !process.env.PAYPAY_API_SECRET || !process.env.PAYPAY_MERCHANT_ID) return;
  sweepRunning = true;
  try {
    configurePayPay();
    const sb = supabaseAdmin();
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: pend, error } = await sb
      .from("orders")
      .select("id,status,user_id,points_used,paypay_merchant_payment_id,paypay_return_token,created_at")
      .eq("status", "pending")
      .gte("created_at", since)
      .limit(20);
    if (error) {
      console.error("[SWEEP_ERR]", error.message);
      return;
    }
    for (const o of pend || []) {
      const mpid = String(o.paypay_merchant_payment_id || "");
      if (!mpid) continue;
      try {
        const body = await paypayGetDetails(mpid);
        if (extractPayPayStatus(body) !== "COMPLETED") continue;
        console.log("[SWEEP] order paid detected:", o.id);
        await finalizePaidOrder(sb, o);
      } catch (eI) {
        console.error("[SWEEP_ITEM_ERR]", o.id, eI && eI.message);
      }
    }
  } catch (e) {
    console.error("[SWEEP_FATAL]", e && e.message);
  } finally {
    sweepRunning = false;
  }
}


// =====================
// admin-cancel-order（管理者：支払済み注文のキャンセル＋PayPay返金）
// body: { orderId, accessToken, reason, revokeEarnedPoints }
//   ・発送済みの注文はキャンセル不可
//   ・PayPay決済（total>0）は返金APIを実行してから canceled にする
//   ・0円購入（クーポン/ポイント）は返金なしで canceled にする
//   ・在庫/ロット・クーポン・ポイントの戻しはDB関数 apply_order_cancel が行う
// =====================
app.post("/api/admin-cancel-order", async (req, res) => {
  try {
    const missing = envMissing(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    if (missing.length) return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });

    const sb = supabaseAdmin();

    const orderId = String(req.body?.orderId || "").trim();
    const accessToken = String(req.body?.accessToken || "").trim();
    const reason = String(req.body?.reason || "").trim();
    const revokeEarnedPoints = req.body?.revokeEarnedPoints !== false;

    if (!orderId || !accessToken) {
      return res.status(400).json({ ok: false, status: "MISSING" });
    }

    // 管理者チェック
    const { data: authData, error: authErr } = await sb.auth.getUser(accessToken);
    if (authErr || !authData?.user) {
      return res.status(401).json({ ok: false, status: "UNAUTHORIZED" });
    }

    const { data: me, error: meErr } = await sb
      .from("profiles")
      .select("is_admin")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (meErr || !me?.is_admin) {
      return res.status(403).json({ ok: false, status: "NOT_ADMIN" });
    }

    const { data: order, error: orderErr } = await sb
      .from("orders")
      .select(
        "id,status,total,payment_method,paypay_merchant_payment_id,fulfillment_type,shipping_status,refund_id,refund_amount,points_used,points_earned,points_awarded_at"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });
    }

    const st = String(order.status || "").toLowerCase();
    if (st === "canceled") {
      return res.json({
        ok: true,
        already: true,
        status: "canceled",
        refundId: order.refund_id || null,
        refundAmount: Number(order.refund_amount || 0),
      });
    }
    if (st !== "paid") {
      return res.status(409).json({ ok: false, status: "NOT_PAID", orderStatus: order.status });
    }
    if (
      String(order.fulfillment_type || "pickup") === "shipping" &&
      String(order.shipping_status || "preparing") === "shipped"
    ) {
      return res.status(409).json({ ok: false, status: "ALREADY_SHIPPED" });
    }

    const total = toIntYen(order.total);
    let refundId = order.refund_id ? String(order.refund_id) : null;
    let refundAmount = Number(order.refund_amount || 0);

    if (total > 0) {
      const mpid = String(order.paypay_merchant_payment_id || "");
      if (!mpid) {
        return res.status(409).json({ ok: false, status: "REFUND_UNAVAILABLE" });
      }

      const missingPayPay = envMissing(["PAYPAY_API_KEY", "PAYPAY_API_SECRET", "PAYPAY_MERCHANT_ID"]);
      if (missingPayPay.length) {
        return res.status(500).json({ ok: false, status: "ENV_MISSING", missing: missingPayPay });
      }
      configurePayPay();

      // すでに返金済み（返金ID・金額が記録済み）ならPayPayは再実行しない
      if (!(refundAmount > 0)) {
        const merchantRefundId = `nzrefund-${orderId}`;

        // 二重実行防止（返金処理中フラグを立てる）
        if (!refundId) {
          const { data: claimed } = await sb
            .from("orders")
            .update({ refund_id: merchantRefundId, refund_started_at: new Date().toISOString() })
            .eq("id", orderId)
            .eq("status", "paid")
            .is("refund_id", null)
            .select("id");
          if (!claimed || claimed.length === 0) {
            return res.status(409).json({ ok: false, status: "CANCEL_IN_PROGRESS" });
          }
          refundId = merchantRefundId;
        }

        const clearClaim = async () => {
          await sb
            .from("orders")
            .update({ refund_id: null, refund_started_at: null })
            .eq("id", orderId)
            .eq("status", "paid")
            .is("refund_amount", null)
            .then(() => {}, () => {});
        };

        try {
          const detail = await paypayGetDetails(mpid);
          if (extractPayPayStatus(detail) !== "COMPLETED") {
            await clearClaim();
            return res.status(409).json({ ok: false, status: "NOT_COMPLETED" });
          }

          const data = detail?.data;
          const paymentId =
            (data && data.paymentId) ||
            (Array.isArray(data) && data[0] && data[0].paymentId) ||
            "";
          if (!paymentId) {
            await clearClaim();
            return res.status(502).json({ ok: false, status: "NO_PAYMENT_ID" });
          }

          let refundBody;
          try {
            refundBody = await paypayRefund({
              merchantRefundId,
              paymentId,
              amount: { amount: total, currency: "JPY" },
              reason: "注文キャンセル",
            });
          } catch (eRefund) {
            // タイムアウト等で実は返金済みの可能性を確認する
            try {
              const check = await paypayGetRefundDetails(merchantRefundId);
              refundBody = check;
            } catch (_eCheck) {
              await clearClaim();
              console.error("[ADMIN_CANCEL_REFUND_ERR]", orderId, eRefund?.message || eRefund);
              return res.status(502).json({
                ok: false,
                status: "REFUND_FAILED",
                message: String(eRefund?.message || eRefund),
              });
            }
          }

          refundId =
            (refundBody?.data && (refundBody.data.refundId || refundBody.data.merchantRefundId)) ||
            merchantRefundId;
          refundAmount = total;

          // 返金成功を記録（この後のDB反映に失敗しても再返金しないため）
          await sb
            .from("orders")
            .update({ refund_id: refundId, refund_amount: refundAmount })
            .eq("id", orderId)
            .eq("status", "paid");
        } catch (eDetail) {
          await clearClaim();
          console.error("[ADMIN_CANCEL_DETAIL_ERR]", orderId, eDetail?.message || eDetail);
          return res.status(502).json({
            ok: false,
            status: "PAYPAY_DETAIL_FAILED",
            message: String(eDetail?.message || eDetail),
          });
        }
      }
    }

    // 在庫・クーポン・ポイントを戻して canceled にする
    const { data: applied, error: applyErr } = await sb.rpc("apply_order_cancel", {
      p_order_id: orderId,
      p_admin_id: authData.user.id,
      p_reason: reason || null,
      p_refund_id: refundId,
      p_refund_amount: refundAmount,
      p_revoke_earned: revokeEarnedPoints,
    });

    if (applyErr) {
      console.error("[ADMIN_CANCEL_APPLY_ERR]", orderId, applyErr.message);
      return res.status(500).json({
        ok: false,
        status: "DB_APPLY_FAILED",
        message: applyErr.message,
        refundId,
        refundAmount,
      });
    }
    if (!applied?.ok) {
      return res.status(409).json({ ok: false, status: "APPLY_REJECTED", result: applied, refundId, refundAmount });
    }

    return res.json({
      ok: true,
      status: "canceled",
      refundId,
      refundAmount,
      pointsUsed: Number(order.points_used || 0),
      pointsEarned: revokeEarnedPoints ? Number(order.points_earned || 0) : 0,
      result: applied,
    });
  } catch (e) {
    console.error("admin-cancel-order fatal:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
});

// =====================
// cancel-paypay-order（PayPayで支払わずに戻った注文を取り消す）
// body: { orderId, token, codeId? }
//   ・PayPay側で支払い済み(COMPLETED)なら取り消さずに確定処理を行う
//   ・在庫は「支払い確定時」にしか減らしていないので、戻す処理は不要
// =====================
app.post("/api/cancel-paypay-order", async (req, res) => {
  try {
    const missing = envMissing(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PAYPAY_API_KEY", "PAYPAY_API_SECRET", "PAYPAY_MERCHANT_ID"]);
    if (missing.length) return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });

    configurePayPay();
    const sb = supabaseAdmin();

    const orderId = String(req.body?.orderId || "").trim();
    const token = String(req.body?.token || "").trim();
    const codeId = String(req.body?.codeId || "").trim();
    if (!orderId || !token) return res.status(400).json({ ok: false, status: "MISSING" });

    const { data: order, error } = await sb
      .from("orders")
      .select("id,status,user_id,points_used,paypay_merchant_payment_id,paypay_return_token")
      .eq("id", orderId)
      .maybeSingle();
    if (error || !order) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });
    if (String(order.paypay_return_token || "") !== token) return res.status(403).json({ ok: false, status: "BAD_TOKEN" });

    const st = String(order.status || "").toLowerCase();
    if (st === "paid") return res.json({ ok: true, status: "paid", paid: true });
    if (st === "canceled" || st === "failed") return res.json({ ok: true, status: st, canceled: true });

    // 念のため PayPay 側を確認（支払い済みなら取り消さない）
    const mpid = String(order.paypay_merchant_payment_id || "");
    if (mpid) {
      try {
        const body = await paypayGetDetails(mpid);
        if (extractPayPayStatus(body) === "COMPLETED") {
          await finalizePaidOrder(sb, order);
          return res.json({ ok: true, status: "paid", paid: true });
        }
      } catch (eChk) {
        console.error("[CANCEL_CHECK_ERR]", eChk && eChk.message);
      }
    }

    // QRコード（支払い用URL）を無効化して、以後支払えないようにする
    if (codeId) {
      const r = await paypayQRCodeDelete(codeId);
      console.log("[CANCEL] QRCodeDelete", orderId, JSON.stringify(r?.BODY?.resultInfo || r?.error || null));
    }

    const { data: upd } = await sb
      .from("orders")
      .update({ status: "canceled" })
      .eq("id", orderId)
      .in("status", ["pending", "created"])
      .select("id");

    if (!upd || upd.length === 0) {
      const { data: again } = await sb.from("orders").select("status").eq("id", orderId).maybeSingle();
      const st2 = String(again?.status || "").toLowerCase();
      return res.json({ ok: true, status: st2, paid: st2 === "paid", canceled: st2 === "canceled" });
    }
    console.log("[CANCEL] order canceled by user:", orderId);
    return res.json({ ok: true, status: "canceled", canceled: true });
  } catch (e) {
    console.error("cancel-paypay-order fatal:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
});

// =====================
// order-status（決済状況確認・PurchaseComplete.tsx から呼ばれる）
// =====================
app.get("/api/order-status", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const orderId = String(req.query.orderId || "");
    const token = String(req.query.token || "");

    if (!orderId || !token) {
      return res.status(400).json({ ok: false, status: "MISSING", need: ["orderId", "token"] });
    }

    const sb = supabaseAdmin();

    const { data: order, error } = await sb
      .from("orders")
      .select("id,status,paid_at,paypay_return_token,payment_method,total,fulfillment_type,shipping_status")
      .eq("id", orderId)
      .single();

    if (error || !order) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });

    if (String(order.paypay_return_token || "") !== token) {
      return res.status(403).json({ ok: false, status: "BAD_TOKEN" });
    }

    return res.status(200).json({
      ok: true,
      orderId: order.id,
      status: order.status,
      paidAt: order.paid_at,
      paymentMethod: order.payment_method,
      total: order.total,
      fulfillment_type: order.fulfillment_type || "pickup",
      shipping_status: order.shipping_status || null,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, status: "NOT_FOUND" }));

// =====================
// start
// =====================
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[OCI] server started: http://0.0.0.0:${PORT}`);
});

// ---- PayPay 決済完了の自動確定バックグラウンド ----
setTimeout(sweepPendingOrders, 5000);
setInterval(sweepPendingOrders, 15000);
console.log("[SWEEP] background finalizer started");
