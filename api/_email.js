// api/_email.js
// メール共通処理：デザイン（HTML）の組み立てと EmailJS 送信。
//
// EmailJS のテンプレートは増やさず、既存の2つを使い回す。
//   - 購入完了テンプレ（EMAILJS_TEMPLATE_ID）        … お客様宛て（To = {{to_email}}）
//   - お問い合わせテンプレ（EMAILJS_CONTACT_TEMPLATE_ID）… 管理者宛て
//
// デザインはこのファイルで作った HTML を {{{html}}}、件名を {{subject}} として渡す。
// テンプレート側が旧レイアウトのままでも届くよう、従来の変数
// （buyer_name / order_id / items_text / total_text など）も必ず一緒に渡す。

const BRAND = "NAGAZON PAY";
const COLOR = {
  accent: "#8b1e3f",
  accentSoft: "#f7ecef",
  blue: "#1e6fd9",
  text: "#1d1d1f",
  sub: "#6e6e73",
  muted: "#a1a1a6",
  line: "#e8e8ed",
  bg: "#f5f5f7",
  panel: "#fafafa",
};
const FONT =
  "'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

export function appBaseUrl() {
  return String(
    process.env.APP_BASE_URL || process.env.FRONTEND_ORIGIN || "https://office-nagazon-pay.vercel.app"
  ).replace(/\/$/, "");
}

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 改行を <br> にした安全なHTML
export function nl2br(value) {
  return esc(value).replace(/\r?\n/g, "<br>");
}

export function yen(value) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

export function formatJstDateTime(value) {
  const d = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ---------- 部品 ---------- */

export function paragraph(html, opts = {}) {
  const color = opts.color || COLOR.text;
  const size = opts.size || 15;
  const mt = opts.marginTop ?? 0;
  return `<p style="margin:${mt}px 0 16px;font-size:${size}px;line-height:1.8;color:${color};">${html}</p>`;
}

export function button(label, url) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 8px;">
  <tr>
    <td align="center" bgcolor="${COLOR.accent}" style="border-radius:10px;">
      <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:15px 36px;font-family:${FONT};font-size:16px;font-weight:bold;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

// ボタンが押せない時のためのURL表示
export function linkFallback(url) {
  return `
<p style="margin:20px 0 6px;font-size:12px;line-height:1.7;color:${COLOR.sub};">ボタンが押せない場合は、下のURLをブラウザに貼り付けて開いてください。</p>
<p style="margin:0 0 16px;font-size:12px;line-height:1.6;word-break:break-all;"><a href="${esc(url)}" target="_blank" style="color:${COLOR.blue};">${esc(url)}</a></p>`;
}

// 「項目名：内容」の一覧。rows = [[label, valueHtml], ...]（valueHtml はエスケープ済みを渡す）
export function infoTable(rows) {
  const body = rows
    .filter((r) => r && r[1] != null && r[1] !== "")
    .map(
      ([label, valueHtml], i) => `
  <tr>
    <td valign="top" width="34%" style="padding:11px 14px;font-size:13px;line-height:1.6;color:${COLOR.sub};${i ? `border-top:1px solid ${COLOR.line};` : ""}">${esc(label)}</td>
    <td valign="top" style="padding:11px 14px;font-size:14px;line-height:1.6;color:${COLOR.text};word-break:break-word;${i ? `border-top:1px solid ${COLOR.line};` : ""}">${valueHtml}</td>
  </tr>`
    )
    .join("");
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:${COLOR.panel};border:1px solid ${COLOR.line};border-radius:10px;border-collapse:separate;">${body}
</table>`;
}

export function sectionTitle(text) {
  return `<p style="margin:28px 0 10px;padding-left:10px;border-left:4px solid ${COLOR.accent};font-size:15px;font-weight:bold;line-height:1.4;color:${COLOR.text};">${esc(text)}</p>`;
}

export function noteBox(html, tone = "info") {
  const bg = tone === "warn" ? "#fff7e6" : "#eef4fd";
  const border = tone === "warn" ? "#f5d48a" : "#c9dcf7";
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:${bg};border:1px solid ${border};border-radius:10px;border-collapse:separate;">
  <tr><td style="padding:14px 16px;font-size:13px;line-height:1.8;color:${COLOR.text};">${html}</td></tr>
</table>`;
}

// 認証コードなどの大きな表示
export function codeBox(code) {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:${COLOR.accentSoft};border-radius:10px;">
  <tr><td align="center" style="padding:20px 12px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:30px;font-weight:bold;letter-spacing:6px;color:${COLOR.accent};">${esc(code)}</td></tr>
</table>`;
}

/* ---------- 全体レイアウト ---------- */

// opts: { preheader, eyebrow, title, bodyHtml, footerNote }
export function layout(opts) {
  const base = appBaseUrl();
  const preheader = opts.preheader || "";
  const eyebrow = opts.eyebrow
    ? `<p style="margin:0 0 8px;font-size:12px;font-weight:bold;letter-spacing:1.5px;color:${COLOR.accent};">${esc(opts.eyebrow)}</p>`
    : "";
  const footerNote =
    opts.footerNote ||
    "このメールは送信専用のアドレスからお送りしています。ご返信いただいてもお答えできません。";

  return `
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.bg}" style="background:${COLOR.bg};margin:0;padding:0;width:100%;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${FONT};">
        <tr>
          <td bgcolor="${COLOR.accent}" style="background:${COLOR.accent};border-radius:14px 14px 0 0;padding:20px 28px;">
            <a href="${esc(base)}" target="_blank" style="font-family:${FONT};font-size:19px;font-weight:bold;letter-spacing:2px;color:#ffffff;text-decoration:none;">${BRAND}</a>
          </td>
        </tr>
        <tr>
          <td bgcolor="#ffffff" style="background:#ffffff;padding:32px 28px 28px;border-left:1px solid ${COLOR.line};border-right:1px solid ${COLOR.line};">
            ${eyebrow}
            <h1 style="margin:0 0 20px;font-family:${FONT};font-size:22px;line-height:1.5;font-weight:bold;color:${COLOR.text};">${esc(opts.title)}</h1>
            ${opts.bodyHtml}
          </td>
        </tr>
        <tr>
          <td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${COLOR.line};border-top:1px solid ${COLOR.line};border-radius:0 0 14px 14px;padding:20px 28px 24px;">
            <p style="margin:0 0 10px;font-size:12px;line-height:1.8;color:${COLOR.sub};">${esc(footerNote)}</p>
            <p style="margin:0 0 10px;font-size:12px;line-height:1.8;color:${COLOR.sub};">お困りの時は <a href="${esc(base)}/contact" target="_blank" style="color:${COLOR.blue};">お問い合わせフォーム</a> からご連絡ください。</p>
            <p style="margin:0;font-size:12px;line-height:1.8;color:${COLOR.muted};">${BRAND} ／ 株式会社NAGAZON<br><a href="${esc(base)}" target="_blank" style="color:${COLOR.muted};">${esc(base.replace(/^https?:\/\//, ""))}</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

/* ---------- 購入完了メール ---------- */

// order: orders の行 / items: order_items の行
export function buildOrderEmail({ order, items, buyerName }) {
  const base = appBaseUrl();
  const list = items || [];
  const isShipping = String(order.fulfillment_type || "pickup") === "shipping";

  const itemsSubtotal = list.reduce(
    (s, it) => s + Number(it.price || 0) * Number(it.quantity || 0),
    0
  );
  const subtotal = Number(order.subtotal ?? 0) > 0 ? Number(order.subtotal) : itemsSubtotal;
  const discount = Math.max(0, Number(order.discount_amount || 0));
  const pointsUsed = Math.max(0, Number(order.points_used || 0));
  const total = Number(order.total || 0);
  const pointsEarned = Math.max(0, Number(order.points_earned || 0));

  const itemRows = list.length
    ? list
        .map((it) => {
          const qty = Number(it.quantity || 0);
          const price = Number(it.price || 0);
          const sale = it.is_sale
            ? ` <span style="display:inline-block;margin-left:4px;padding:1px 6px;border-radius:4px;background:${COLOR.accentSoft};color:${COLOR.accent};font-size:11px;font-weight:bold;">SALE</span>`
            : "";
          return `
  <tr>
    <td valign="top" style="padding:12px 0;border-top:1px solid ${COLOR.line};font-size:14px;line-height:1.6;color:${COLOR.text};word-break:break-word;">
      ${esc(it.product_name)}${sale}
      <div style="font-size:12px;color:${COLOR.sub};">${yen(price)} × ${qty}個</div>
    </td>
    <td valign="top" align="right" width="88" style="padding:12px 0;border-top:1px solid ${COLOR.line};font-size:14px;line-height:1.6;color:${COLOR.text};white-space:nowrap;">${yen(price * qty)}</td>
  </tr>`;
        })
        .join("")
    : `
  <tr><td colspan="2" style="padding:12px 0;border-top:1px solid ${COLOR.line};font-size:14px;color:${COLOR.sub};">（明細なし）</td></tr>`;

  const sumRow = (label, value, strong = false) => `
  <tr>
    <td style="padding:${strong ? "12px 0 0" : "4px 0"};font-size:${strong ? 15 : 13}px;${strong ? "font-weight:bold;" : ""}color:${strong ? COLOR.text : COLOR.sub};${strong ? `border-top:2px solid ${COLOR.text};` : ""}">${esc(label)}</td>
    <td align="right" style="padding:${strong ? "12px 0 0" : "4px 0"};font-size:${strong ? 22 : 13}px;${strong ? "font-weight:bold;" : ""}color:${strong ? COLOR.accent : COLOR.sub};white-space:nowrap;${strong ? `border-top:2px solid ${COLOR.text};` : ""}">${value}</td>
  </tr>`;

  const sums = [
    discount > 0 || pointsUsed > 0 ? sumRow("小計", yen(subtotal)) : "",
    discount > 0
      ? sumRow(`クーポン割引${order.coupon_code ? `（${order.coupon_code}）` : ""}`, `−${yen(discount)}`)
      : "",
    pointsUsed > 0 ? sumRow("ポイント利用", `−${yen(pointsUsed)}`) : "",
    sumRow("お支払い合計（税込）", yen(total), true),
  ].join("");

  const payment =
    total <= 0 ? "お支払いなし（0円）" : order.payment_method === "paypay" ? "PayPay" : "";

  const info = infoTable([
    ["注文番号", `<span style="font-family:Menlo,Consolas,monospace;font-size:12px;">${esc(order.id)}</span>`],
    ["ご注文日時", esc(formatJstDateTime(order.paid_at || order.created_at))],
    ["お受け取り方法", isShipping ? "発送（配送でお届け）" : "その場で受け取り"],
    ["お支払い方法", esc(payment)],
    pointsEarned > 0 ? ["獲得ポイント", `${pointsEarned.toLocaleString("ja-JP")} pt`] : null,
  ]);

  const next = isShipping
    ? noteBox(
        "<b>このあとの流れ</b><br>発送の準備ができしだい、ご入力いただいた配送先へお送りします。お届けまで少しお待ちください。"
      )
    : noteBox("<b>このあとの流れ</b><br>お支払いは完了しています。商品をお受け取りください。");

  const cta = order.user_id
    ? button("注文内容を確認する", `${base}/orders/${order.id}`)
    : "";

  const bodyHtml = `
${paragraph(`${esc(buyerName || "お客様")} 様`)}
${paragraph("このたびはご購入いただき、ありがとうございます。<br>下記の内容でご注文を承りました。")}
${info}
${sectionTitle("ご注文の商品")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px;">${itemRows}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;border-top:1px solid ${COLOR.line};padding-top:8px;">${sums}
</table>
${next}
${cta}
${paragraph("内容にお心当たりがない場合や、ご不明な点がある場合は、注文番号を添えてお問い合わせください。", { color: COLOR.sub, size: 13, marginTop: 20 })}`;

  return {
    subject: `【${BRAND}】ご購入ありがとうございます（合計 ${yen(total)}）`,
    html: layout({
      preheader: `ご注文を承りました。お支払い合計 ${yen(total)}`,
      eyebrow: "ご注文完了",
      title: "ご購入ありがとうございます",
      bodyHtml,
    }),
  };
}

/* ---------- 管理者宛てメール（お問い合わせ・発送注文・見守り） ---------- */

// rows = [[label, valueHtml]], messageText = 本文（プレーンテキスト）
export function buildAdminEmail({ subject, eyebrow, title, lead, rows, messageTitle, messageText, actionLabel, actionUrl }) {
  const message = messageText
    ? `${sectionTitle(messageTitle || "内容")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border:1px solid ${COLOR.line};border-radius:10px;border-collapse:separate;">
  <tr><td style="padding:16px;font-size:14px;line-height:1.9;color:${COLOR.text};word-break:break-word;">${nl2br(messageText)}</td></tr>
</table>`
    : "";

  const bodyHtml = `
${lead ? paragraph(esc(lead)) : ""}
${rows && rows.length ? infoTable(rows) : ""}
${message}
${actionUrl ? button(actionLabel || "管理画面を開く", actionUrl) : ""}`;

  return {
    subject,
    html: layout({
      preheader: lead || title,
      eyebrow,
      title,
      bodyHtml,
      footerNote: "このメールは NAGAZON PAY から管理者宛てに自動送信しています。",
    }),
  };
}

/* ---------- 送信 ---------- */

// EmailJS で送信。templateParams には subject / html と、旧レイアウト用の変数を両方入れる。
export async function sendEmailJS(templateId, templateParams, opts = {}) {
  const need = ["EMAILJS_SERVICE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY"];
  const missing = need.filter((k) => !process.env[k]);
  if (!templateId) missing.push("EMAILJS_TEMPLATE_ID");
  if (missing.length) return { ok: false, status: 500, detail: `ENV_MISSING:${missing.join(",")}` };

  const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: templateParams,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs || 8000),
  });
  const text = await r.text().catch(() => "");
  return { ok: r.ok, status: r.status, detail: text.slice(0, 300) };
}
