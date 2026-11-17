// api/auth-email-hook.js
// Supabase Auth の「Send Email Hook」。
// メール認証・パスワード再設定などのメールを Supabase 標準メールの代わりに
// EmailJS の「購入完了テンプレ」（EMAILJS_TEMPLATE_ID）を使い回して送る。新規テンプレは不要。
//
// - Supabase からの呼び出しかどうかは Standard Webhooks の署名で確認する。
// - 署名の鍵は SEND_EMAIL_HOOK_SECRET（"v1,whsec_..."）。未設定の時は
//   SUPABASE_SERVICE_ROLE_KEY から決まった手順で作った鍵を使う（Supabase 側にも同じ値を設定）。
import crypto from "node:crypto";
import {
  appBaseUrl,
  button,
  codeBox,
  esc,
  layout,
  linkFallback,
  noteBox,
  paragraph,
  sendEmailJS,
} from "./_email.js";

function hookSecretBytes() {
  const raw = String(process.env.SEND_EMAIL_HOOK_SECRET || "").trim();
  if (raw) return Buffer.from(raw.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!key) return null;
  return crypto.createHash("sha256").update(`nagazonpay-auth-email-hook:${key}`).digest();
}

function verifySignature(rawBody, headers, secret) {
  const id = String(headers.get("webhook-id") || "");
  const ts = String(headers.get("webhook-timestamp") || "");
  const sigHeader = String(headers.get("webhook-signature") || "");
  if (!id || !ts || !sigHeader) return false;

  // 5分以上ずれた要求は受け付けない（使い回し防止）
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${id}.${ts}.${rawBody}`)
    .digest();

  return sigHeader.split(" ").some((part) => {
    const [ver, sig] = part.split(",");
    if (ver !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

function verifyUrl(tokenHash, type, redirectTo) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const params = new URLSearchParams({
    token: tokenHash,
    type,
    redirect_to: redirectTo || appBaseUrl(),
  });
  return `${base}/auth/v1/verify?${params.toString()}`;
}

// 1通ぶんの内容を作る。戻り値: { to, subject, title, eyebrow, lead[], url, cta, code, notes[] }
function buildMessages(user, d) {
  const type = String(d.email_action_type || "");
  const email = String(user.email || "");
  const newEmail = String(user.new_email || "");
  const redirect = d.redirect_to || "";
  const ignore = "このメールにお心当たりがない場合は、何もせずに破棄してください。";

  switch (type) {
    case "signup":
      return [
        {
          to: email,
          subject: "【NAGAZON PAY】メールアドレスの確認をお願いします",
          eyebrow: "アカウント登録",
          title: "メールアドレスの確認",
          lead: [
            "NAGAZON PAY にご登録いただき、ありがとうございます。",
            "下のボタンを押すと、メールアドレスの確認が完了し、アカウントをご利用いただけます。",
          ],
          url: verifyUrl(d.token_hash, "signup", redirect),
          cta: "メールアドレスを確認する",
          notes: ["このリンクの有効期限は1時間です。", ignore],
        },
      ];

    case "recovery":
      return [
        {
          to: email,
          subject: "【NAGAZON PAY】パスワード再設定のご案内",
          eyebrow: "パスワード再設定",
          title: "パスワードの再設定",
          lead: [
            "パスワード再設定のお申し込みを受け付けました。",
            "下のボタンを押して、新しいパスワードを設定してください。",
          ],
          url: verifyUrl(d.token_hash, "recovery", redirect),
          cta: "新しいパスワードを設定する",
          notes: [
            "このリンクの有効期限は1時間です。",
            "お心当たりがない場合は、何もせずに破棄してください。パスワードは変更されません。",
          ],
        },
      ];

    case "magiclink":
      return [
        {
          to: email,
          subject: "【NAGAZON PAY】ログイン用リンクのお知らせ",
          eyebrow: "ログイン",
          title: "ログイン用リンク",
          lead: ["下のボタンを押すと、NAGAZON PAY にログインできます。"],
          url: verifyUrl(d.token_hash, "magiclink", redirect),
          cta: "ログインする",
          notes: ["このリンクの有効期限は1時間で、1回だけ使えます。", ignore],
        },
      ];

    case "invite":
      return [
        {
          to: email,
          subject: "【NAGAZON PAY】アカウントへのご招待",
          eyebrow: "ご招待",
          title: "NAGAZON PAY へのご招待",
          lead: ["NAGAZON PAY のアカウントに招待されました。下のボタンから登録を完了してください。"],
          url: verifyUrl(d.token_hash, "invite", redirect),
          cta: "登録を完了する",
          notes: [ignore],
        },
      ];

    case "email_change": {
      const make = (to, hash, isCurrent) => ({
        to,
        subject: "【NAGAZON PAY】メールアドレス変更の確認をお願いします",
        eyebrow: "メールアドレス変更",
        title: "メールアドレス変更の確認",
        lead: [
          `メールアドレスを ${newEmail || "新しいアドレス"} に変更するお申し込みを受け付けました。`,
          isCurrent
            ? "ご本人による変更であれば、下のボタンを押して確認してください。"
            : "下のボタンを押すと、このメールアドレスの確認が完了します。",
        ],
        url: verifyUrl(hash, "email_change", redirect),
        cta: "変更を確認する",
        notes: [
          "このリンクの有効期限は1時間です。",
          "お心当たりがない場合は、何もせずに破棄してください。メールアドレスは変更されません。",
        ],
      });
      // ※ Supabase の仕様で名前が逆：token_hash_new が「現在のアドレス」用、token_hash が「新しいアドレス」用
      const out = [];
      if (d.token_hash_new && email) out.push(make(email, d.token_hash_new, true));
      if (d.token_hash && (newEmail || email)) out.push(make(newEmail || email, d.token_hash, false));
      return out;
    }

    case "reauthentication":
      return [
        {
          to: email,
          subject: "【NAGAZON PAY】確認コードのお知らせ",
          eyebrow: "ご本人確認",
          title: "確認コード",
          lead: ["下の確認コードを画面に入力してください。"],
          code: String(d.token || ""),
          notes: ["このコードの有効期限は1時間です。", ignore],
        },
      ];

    case "password_changed_notification":
      return [
        {
          to: email,
          subject: "【NAGAZON PAY】パスワードが変更されました",
          eyebrow: "お知らせ",
          title: "パスワードが変更されました",
          lead: ["お使いのアカウントのパスワードが変更されました。"],
          notes: ["お心当たりがない場合は、すぐにパスワードを再設定し、お問い合わせください。"],
        },
      ];

    case "email_changed_notification":
      return [
        {
          to: String(d.old_email || email),
          subject: "【NAGAZON PAY】メールアドレスが変更されました",
          eyebrow: "お知らせ",
          title: "メールアドレスが変更されました",
          lead: ["お使いのアカウントのメールアドレスが変更されました。"],
          notes: ["お心当たりがない場合は、お問い合わせください。"],
        },
      ];

    default:
      return [];
  }
}

function renderHtml(m, name) {
  const greet = name ? paragraph(`${esc(name)} 様`) : "";
  const lead = m.lead.map((t) => paragraph(esc(t))).join("");
  const action = m.url ? `${button(m.cta, m.url)}${linkFallback(m.url)}` : "";
  const code = m.code ? codeBox(m.code) : "";
  const notes = m.notes?.length ? noteBox(m.notes.map((n) => esc(n)).join("<br>"), "warn") : "";

  return layout({
    preheader: m.lead[0],
    eyebrow: m.eyebrow,
    title: m.title,
    bodyHtml: `${greet}${lead}${code}${action}${notes}`,
  });
}

const fail = (status, message) =>
  Response.json({ error: { http_code: status, message } }, { status });

// 署名は「届いたままの本文」で確認する必要があるため、Web標準の形（request.text()）で受け取る
export async function POST(request) {
  try {
    const secret = hookSecretBytes();
    if (!secret) return fail(500, "hook secret is not configured");

    const raw = await request.text();
    if (!verifySignature(raw, request.headers, secret)) return fail(401, "invalid signature");

    const { user, email_data: d } = JSON.parse(raw || "{}");
    if (!user || !d) return fail(400, "bad payload");

    const name = String(user.user_metadata?.name || "").trim();
    const messages = buildMessages(user, d).filter((m) => m.to);

    for (const m of messages) {
      // 旧レイアウトのテンプレートでも読めるよう、従来の変数にも文章を入れる
      const plain = [...m.lead, "", m.url || m.code || "", "", ...(m.notes || [])]
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const r = await sendEmailJS(process.env.EMAILJS_TEMPLATE_ID, {
        to_email: m.to,
        subject: m.subject,
        html: renderHtml(m, name),
        buyer_name: name || "お客様",
        order_id: m.title,
        items_text: plain,
        total_text: "-",
      });

      if (!r.ok) {
        console.error("AUTH_EMAIL_FAILED:", d.email_action_type, r.status, r.detail);
        return fail(500, "メールの送信に失敗しました。時間をおいてもう一度お試しください。");
      }
    }

    return Response.json({});
  } catch (e) {
    console.error("AUTH_EMAIL_HOOK_ERROR:", e);
    return fail(500, "メールの送信に失敗しました。");
  }
}
