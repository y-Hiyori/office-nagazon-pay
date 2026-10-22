// api/_guard.js
// 見守り（Nagazon Guard）共通処理：通知・時刻・管理者クライアント
import { createClient } from "@supabase/supabase-js";

export function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function appBaseUrl() {
  return String(process.env.APP_BASE_URL || process.env.FRONTEND_ORIGIN || "").replace(/\/$/, "");
}

export function adminGuardUrl() {
  const base = appBaseUrl();
  return base ? `${base}/admin-guard` : "";
}

export function normalizeTime(value) {
  const d = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  // 端末の時計が大きくズレている場合はサーバー時刻を使う
  if (Math.abs(Date.now() - d.getTime()) > 3 * 24 * 60 * 60 * 1000) {
    return new Date().toISOString();
  }
  return d.toISOString();
}

export function formatJst(value) {
  const d = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function jstTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value || "00";
  const minute = parts.find((p) => p.type === "minute")?.value || "00";
  return { hour: Number(hour), minute: Number(minute) };
}

export function isWithinStoreHours(settings, date = new Date()) {
  const { hour, minute } = jstTimeParts(date);
  const nowMin = hour * 60 + minute;

  const parse = (s) => {
    const [h, m] = String(s || "00:00").split(":");
    return Number(h) * 60 + Number(m);
  };

  const open = parse(settings?.store_open);
  const close = parse(settings?.store_close);
  if (open === close) return true;
  if (open < close) return nowMin >= open && nowMin <= close;
  return nowMin >= open || nowMin <= close;
}

function isLegacyTeamsWebhook(url) {
  return /webhook\.office\.com/i.test(String(url || ""));
}

function buildTeamsFacts(event, order, imageUrl, url) {
  const kindLabel = {
    motion: "棚まわりの動き",
    pickup: "受け取り",
    heartbeat: "通信確認",
    test: "テスト通知",
    manual: "手動記録",
    tamper: "端末・設置の異常",
    offline: "端末オフライン",
  };
  const deviceLabel = event.device_id === "camera" ? "証拠カメラ" : "店頭ハブ";

  return [
    { name: "時刻", value: formatJst(event.occurred_at || event.received_at) },
    { name: "種類", value: kindLabel[event.kind] || event.kind || "-" },
    { name: "端末", value: deviceLabel },
    {
      name: "判定",
      value:
        event.kind === "test"
          ? "テスト（通知経路の確認）"
          : event.status === "suspicious"
            ? "不審（支払いと照合できません）"
            : event.status === "ok"
              ? "正常（照合済み）"
              : event.status || "-",
    },
    {
      name: "注文",
      value: order ? `${String(order.id).slice(0, 8)}…（受け取り済みに更新）` : "該当なし",
    },
    { name: "メモ", value: event.note || "-" },
  ].concat(url ? [{ name: "管理画面", value: url }] : []);
}

function buildAdaptiveCard(event, order, imageUrl, url) {
  const facts = buildTeamsFacts(event, order, imageUrl, "").map((f) => ({
    title: f.name,
    value: String(f.value),
  }));

  const body = [
    {
      type: "TextBlock",
      size: "Large",
      weight: "Bolder",
      color: event.kind === "test" ? "Good" : "Attention",
      text: event.kind === "test" ? "NAGAZON Guard：テスト通知" : "NAGAZON Guard：不審な動き",
      wrap: true,
    },
    { type: "FactSet", facts },
  ];

  if (imageUrl) {
    body.push({ type: "Image", url: imageUrl, altText: "証拠画像", size: "Large" });
  }

  body.push({
    type: "TextBlock",
    text: "管理画面で内容を確認し、「問題なし」「要確認」「解決済み」を選んでください。",
    wrap: true,
    spacing: "Medium",
  });

  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    body,
  };

  if (url) {
    card.actions = [{ type: "Action.OpenUrl", title: "管理画面を開く", url }];
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: card,
      },
    ],
  };
}

function buildMessageCard(event, order, imageUrl, url) {
  const facts = buildTeamsFacts(event, order, imageUrl, "").map((f) => ({
    name: f.name,
    value: String(f.value),
  }));

  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: event.kind === "test" ? "2E7D32" : "C62828",
    summary: event.kind === "test" ? "NAGAZON Guard テスト通知" : "NAGAZON Guard 不審な動き",
    sections: [
      {
        activityTitle:
          event.kind === "test" ? "NAGAZON Guard：テスト通知" : "NAGAZON Guard：不審な動き",
        activitySubtitle: formatJst(event.occurred_at || event.received_at),
        facts,
        text: event.note || "",
        ...(imageUrl ? { images: [{ image: imageUrl, title: "証拠画像" }] } : {}),
      },
    ],
    potentialAction: url
      ? [
          {
            "@type": "OpenUri",
            name: "管理画面を開く",
            targets: [{ os: "default", uri: url }],
          },
        ]
      : [],
  };
}

async function postTeams(webhookUrl, payload) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(6000),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, detail: text.slice(0, 300) };
}

export async function sendTeams(webhookUrl, event, order, imageUrl) {
  if (!webhookUrl) return { ok: false, skipped: true, reason: "NO_WEBHOOK" };

  const url = adminGuardUrl();
  const adaptive = buildAdaptiveCard(event, order, imageUrl, url);
  const messageCard = buildMessageCard(event, order, imageUrl, url);

  const first = isLegacyTeamsWebhook(webhookUrl) ? messageCard : adaptive;
  const second = isLegacyTeamsWebhook(webhookUrl) ? adaptive : messageCard;

  const r1 = await postTeams(webhookUrl, first);
  if (r1.ok) return { ok: true, detail: r1.detail };

  const r2 = await postTeams(webhookUrl, second);
  if (r2.ok) return { ok: true, detail: r2.detail };

  return { ok: false, detail: `first=${r1.status} ${r1.detail} / second=${r2.status} ${r2.detail}` };
}

export async function sendAlertEmail(settings, event, order, imageUrl) {
  const required = ["EMAILJS_SERVICE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY"];
  const missing = required.filter((k) => !process.env[k]);

  const guardTemplate = process.env.EMAILJS_GUARD_TEMPLATE_ID || "";
  const buyerTemplate = process.env.EMAILJS_TEMPLATE_ID || "";
  const contactTemplate = process.env.EMAILJS_CONTACT_TEMPLATE_ID || "";
  const templateId = guardTemplate || buyerTemplate || contactTemplate;
  if (!templateId) missing.push("EMAILJS_GUARD_TEMPLATE_ID or EMAILJS_TEMPLATE_ID");
  if (missing.length) return { ok: false, skipped: true, reason: `ENV_MISSING:${missing.join(",")}` };

  const toRaw = settings?.alert_email || process.env.GUARD_ALERT_EMAIL || "";
  const recipients = String(toRaw)
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!recipients.length) return { ok: false, skipped: true, reason: "NO_ALERT_EMAIL" };

  const deviceLabel = event.device_id === "camera" ? "証拠カメラ" : "店頭ハブ";
  const kindLabel =
    event.kind === "test"
      ? "テスト通知"
      : event.kind === "motion"
        ? "棚まわりの動き"
        : event.kind === "pickup"
          ? "受け取り"
          : event.kind || "-";

  const lines = [
    "NAGAZON Guard が不審な動きを検知しました。",
    "",
    `時刻: ${formatJst(event.occurred_at || event.received_at)}`,
    `端末: ${deviceLabel}`,
    `種類: ${kindLabel}`,
    `判定: ${event.status === "suspicious" ? "不審（支払いと照合できません）" : event.status}`,
    `注文: ${order ? `${order.id}（受け取り済みに更新）` : "該当なし"}`,
    `メモ: ${event.note || "-"}`,
  ];
  if (imageUrl) lines.push("", `証拠画像: ${imageUrl}`);
  const guardUrl = adminGuardUrl();
  if (guardUrl) lines.push("", `管理画面: ${guardUrl}`);

  const message = lines.join("\n");
  const subject = "【NAGAZON Guard】不審な動きを検知しました";
  const orderId = order?.id || event.order_id || event.id || "-";
  const occurred = formatJst(event.occurred_at || event.received_at);

  let sent = 0;
  let failed = 0;
  const details = [];

  for (const to of recipients) {
    const template_params = guardTemplate
      ? {
          to_email: to,
          subject,
          message,
          image_url: imageUrl || "",
          event_id: event.id || "",
          occurred_at: occurred,
        }
      : {
          // 既存の購入者テンプレート（To = {{to_email}}）を再利用するフォールバック。
          // 件名は注文メール風になるため、専用テンプレートを作る場合は
          // EMAILJS_GUARD_TEMPLATE_ID を設定してください。
          to_email: to,
          buyer_name: "NAGAZON Guard",
          order_id: `GUARD-${String(orderId).slice(0, 8)}`,
          items_text: message,
          total_text: "管理画面を確認してください",
        };

    try {
      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: process.env.EMAILJS_SERVICE_ID,
          template_id: templateId,
          user_id: process.env.EMAILJS_PUBLIC_KEY,
          accessToken: process.env.EMAILJS_PRIVATE_KEY,
          template_params,
        }),
        signal: AbortSignal.timeout(6000),
      });
      const text = await res.text().catch(() => "");
      if (res.ok) {
        sent++;
      } else {
        failed++;
        details.push(`${to}: ${res.status} ${text.slice(0, 120)}`);
      }
    } catch (e) {
      failed++;
      details.push(`${to}: ${String(e?.message || e).slice(0, 120)}`);
    }
  }

  return {
    ok: failed === 0,
    sent,
    failed,
    total: recipients.length,
    status: failed === 0 ? 200 : 500,
    detail: `${sent}/${recipients.length} sent${details.length ? ` / ${details.join(" | ")}` : ""}`,
    template: guardTemplate ? "guard" : buyerTemplate ? "buyer" : "contact",
  };
}

export async function notifyGuard(sb, settings, event, order, imagePath) {
  let imageUrl = "";
  if (imagePath) {
    try {
      const { data } = await sb.storage
        .from("guard-evidence")
        .createSignedUrl(imagePath, 60 * 60 * 24 * 7);
      imageUrl = data?.signedUrl || "";
    } catch (e) {
      console.error("createSignedUrl failed:", e);
    }
  }

  const teams = await sendTeams(settings?.teams_webhook_url, event, order, imageUrl).catch((e) => ({
    ok: false,
    detail: String(e?.message || e),
  }));

  let email = { ok: false, skipped: true, reason: "TEAMS_SENT" };
  if (!teams.ok) {
    email = await sendAlertEmail(settings, event, order, imageUrl).catch((e) => ({
      ok: false,
      detail: String(e?.message || e),
    }));
  }

  return { teams, email, imageUrl };
}
