// api/send-user-notice.js
// 管理者が会員（1人または複数）を選んでお知らせを送る。
//   - アプリ内のお知らせ（user_notices / user_notice_recipients）を作成
//   - send_email=true なら EmailJS の購入完了テンプレ（nagazon_order_notice）でメールも送る
// POST body: { accessToken, title, body, linkUrl, userIds: string[], sendEmail: boolean }
import { createClient } from "@supabase/supabase-js";
import { appBaseUrl, buildUserNoticeEmail, sendEmailJS } from "./_email.js";

const MAX_RECIPIENTS = 300;
const MAX_EMAILS = 30; // EmailJS は1秒1通ペースで送るため、1回の送信はここまで
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  try {
    const need = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    const missing = need.filter((k) => !process.env[k]);
    if (missing.length) return res.status(500).json({ ok: false, status: "ENV_MISSING", missing });

    const { accessToken, title, body, linkUrl, userIds, sendEmail } = req.body || {};
    const t = String(title || "").trim();
    const b = String(body || "").trim();
    const l = String(linkUrl || "").trim();
    const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(String).filter(Boolean))];

    if (!accessToken) return res.status(401).json({ ok: false, status: "UNAUTHORIZED" });
    if (!t) return res.status(400).json({ ok: false, status: "NO_TITLE" });
    if (t.length > 100 || b.length > 4000 || l.length > 500) {
      return res.status(400).json({ ok: false, status: "TOO_LONG" });
    }
    if (l && !/^(https?:\/\/|\/)/.test(l)) return res.status(400).json({ ok: false, status: "BAD_LINK" });
    if (!ids.length) return res.status(400).json({ ok: false, status: "NO_RECIPIENTS" });
    if (ids.length > MAX_RECIPIENTS) return res.status(400).json({ ok: false, status: "TOO_MANY" });
    if (sendEmail && ids.length > MAX_EMAILS) {
      return res.status(400).json({ ok: false, status: "TOO_MANY_EMAILS", max: MAX_EMAILS });
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 管理者か確認
    const { data: authData, error: authErr } = await sb.auth.getUser(String(accessToken));
    if (authErr || !authData?.user) return res.status(401).json({ ok: false, status: "UNAUTHORIZED" });
    const { data: me } = await sb.from("profiles_view").select("is_admin").eq("id", authData.user.id).maybeSingle();
    if (!me?.is_admin) return res.status(403).json({ ok: false, status: "NOT_ADMIN" });

    // 宛先（存在する会員だけ）
    const { data: profs, error: profErr } = await sb.from("profiles_view").select("id,name,email").in("id", ids);
    if (profErr) throw profErr;
    const targets = profs || [];
    if (!targets.length) return res.status(400).json({ ok: false, status: "NO_RECIPIENTS" });

    // お知らせ作成
    const { data: notice, error: nErr } = await sb
      .from("user_notices")
      .insert({ title: t, body: b || null, link_url: l || null, send_email: !!sendEmail, created_by: authData.user.id })
      .select("id,title,body,link_url")
      .single();
    if (nErr) throw nErr;

    const { error: rErr } = await sb
      .from("user_notice_recipients")
      .insert(targets.map((p) => ({ notice_id: notice.id, user_id: p.id })));
    if (rErr) {
      await sb.from("user_notices").delete().eq("id", notice.id);
      throw rErr;
    }

    let emailed = 0;
    let failed = 0;
    let skipped = 0;

    if (sendEmail) {
      const inboxUrl = `${appBaseUrl()}/inbox`;
      for (let i = 0; i < targets.length; i++) {
        const p = targets[i];
        let to = String(p.email || "").trim();
        if (!to) {
          const { data: u } = await sb.auth.admin.getUserById(p.id);
          to = String(u?.user?.email || "").trim();
        }
        if (!to) {
          skipped++;
          await sb.from("user_notice_recipients").update({ email_error: "NO_EMAIL" })
            .eq("notice_id", notice.id).eq("user_id", p.id);
          continue;
        }

        if (i > 0) await sleep(1100);

        const name = String(p.name || "").trim();
        const mail = buildUserNoticeEmail({ notice, name, inboxUrl });
        let r;
        try {
          r = await sendEmailJS(process.env.EMAILJS_TEMPLATE_ID, {
            to_email: to,
            subject: mail.subject,
            html: mail.html,
            buyer_name: name || "お客様",
            order_id: `お知らせ：${t}`,
            items_text: [b, l].filter(Boolean).join("\n\n") || t,
            total_text: "-",
          });
        } catch (e) {
          r = { ok: false, detail: String(e?.message || e) };
        }

        if (r.ok) {
          emailed++;
          await sb.from("user_notice_recipients").update({ emailed_at: new Date().toISOString(), email_error: null })
            .eq("notice_id", notice.id).eq("user_id", p.id);
        } else {
          failed++;
          console.error("USER_NOTICE_EMAIL_FAILED:", p.id, r.status, r.detail);
          await sb.from("user_notice_recipients").update({ email_error: String(r.detail || "FAILED").slice(0, 300) })
            .eq("notice_id", notice.id).eq("user_id", p.id);
        }
      }
    }

    return res.json({ ok: true, noticeId: notice.id, recipients: targets.length, emailed, failed, skipped });
  } catch (e) {
    console.error("SEND_USER_NOTICE_ERROR:", e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
}
