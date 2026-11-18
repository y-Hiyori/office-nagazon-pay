// src/pages/AdminUserNotice.tsx
// 会員を1人または複数選んでお知らせを送る（アプリ内 ＋ メール）
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AdminHeader from "../components/AdminHeader";
import Loading from "../components/Loading";
import { supabase } from "../lib/supabase";
import { appDialog } from "../lib/appDialog";
import "./AdminUserNotice.css";

type Profile = { id: string; name: string | null; email: string | null; is_admin: boolean | null };
type Sent = {
  id: string;
  title: string;
  created_at: string;
  send_email: boolean;
  user_notice_recipients: { user_id: string; read_at: string | null; emailed_at: string | null; email_error: string | null }[];
};

const MAX_EMAILS = 30;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function AdminUserNotice() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => {
    const pre = params.get("to");
    return new Set(pre ? pre.split(",").filter(Boolean) : []);
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<Sent[]>([]);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("user_notices")
      .select("id,title,created_at,send_email,user_notice_recipients(user_id,read_at,emailed_at,email_error)")
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory((data ?? []) as Sent[]);
  };

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("profiles_view")
        .select("id,name,email,is_admin,created_at")
        .order("created_at", { ascending: false });
      setProfiles((data ?? []) as Profile[]);
      await loadHistory();
      setLoading(false);
    };
    load();
  }, []);

  const nameOf = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p.name || p.email || "(名前なし)"]));
    return (id: string) => m.get(id) || "(退会済み)";
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => `${p.name ?? ""} ${p.email ?? ""}`.toLowerCase().includes(q));
  }, [profiles, query]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllFiltered = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((p) => next.delete(p.id));
      else filtered.forEach((p) => next.add(p.id));
      return next;
    });

  const count = selected.size;
  const tooManyEmails = sendEmail && count > MAX_EMAILS;

  const send = async () => {
    const t = title.trim();
    const l = linkUrl.trim();
    if (!t) return appDialog.alert({ message: "タイトルを入力してください。" });
    if (count === 0) return appDialog.alert({ message: "送る相手を1人以上選んでください。" });
    if (l && !/^(https?:\/\/|\/)/.test(l)) {
      return appDialog.alert({ message: "リンクは https:// か / から始めてください。" });
    }
    if (tooManyEmails) {
      return appDialog.alert({
        message: `メールを送れるのは1回${MAX_EMAILS}人までです。人数を減らすか、「メールでも知らせる」を外してください。`,
      });
    }

    const ok = await appDialog.confirm({
      title: "お知らせを送信しますか？",
      message:
        `${count}人に「${t}」を送ります。` +
        (sendEmail ? `\nメールも送ります（EmailJSの送信数を${count}通使います）。` : "\nアプリ内のお知らせのみです。"),
      okText: "送信する",
    });
    if (!ok) return;

    setSending(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/send-user-notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: s.session?.access_token,
          title: t,
          body: body.trim(),
          linkUrl: l,
          userIds: [...selected],
          sendEmail,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        await appDialog.alert({
          title: "送信できませんでした",
          message: `時間をおいてもう一度お試しください。（${json?.status || res.status}）`,
        });
        return;
      }

      const lines = [`${json.recipients}人のアプリにお知らせを届けました。`];
      if (sendEmail) {
        lines.push(`メール：送信 ${json.emailed}通`);
        if (json.failed) lines.push(`メール：失敗 ${json.failed}通`);
        if (json.skipped) lines.push(`メールアドレスなし ${json.skipped}人`);
      }
      await appDialog.alert({ title: "送信しました", message: lines.join("\n") });
      setTitle("");
      setBody("");
      setLinkUrl("");
      setSelected(new Set());
      await loadHistory();
    } finally {
      setSending(false);
    }
  };

  const removeNotice = async (n: Sent) => {
    const ok = await appDialog.confirm({
      message: `「${n.title}」を削除しますか？\nお客様のアプリからも消えます（送ったメールは消えません）。`,
      okText: "削除する",
    });
    if (!ok) return;
    const { error } = await supabase.from("user_notices").delete().eq("id", n.id);
    if (error) return appDialog.alert({ message: "削除できませんでした。" });
    setHistory((prev) => prev.filter((h) => h.id !== n.id));
  };

  return (
    <>
      <AdminHeader />
      <div className="aun-page" style={{ paddingTop: 80 }}>
        <div className="aun-head">
          <h2 className="aun-title">会員へお知らせを送る</h2>
          <button className="aun-mini" type="button" onClick={() => navigate("/admin-notices")}>
            ホームのお知らせ
          </button>
        </div>

        {loading ? (
          <Loading />
        ) : (
          <div className="aun-grid">
            {/* 宛先 */}
            <section className="aun-card">
              <div className="aun-card-head">
                <h3>1. 送る相手を選ぶ</h3>
                <span className={`aun-count ${count ? "on" : ""}`}>{count}人選択中</span>
              </div>
              <input
                className="aun-input"
                placeholder="名前・メールで検索"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="aun-bulk">
                <button type="button" className="aun-mini" onClick={toggleAllFiltered} disabled={!filtered.length}>
                  {allFilteredSelected ? "表示中を選択解除" : `表示中の${filtered.length}人を全員選択`}
                </button>
                {count > 0 ? (
                  <button type="button" className="aun-mini" onClick={() => setSelected(new Set())}>
                    選択をクリア
                  </button>
                ) : null}
              </div>
              <ul className="aun-users">
                {filtered.map((p) => {
                  const on = selected.has(p.id);
                  return (
                    <li key={p.id}>
                      <label className={`aun-user ${on ? "is-on" : ""}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
                        <span className="aun-user-text">
                          <span className="aun-user-name">
                            {p.name || "(名前なし)"}
                            {p.is_admin ? <span className="aun-tag">管理者</span> : null}
                          </span>
                          <span className="aun-user-mail">{p.email || "メール未登録"}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
                {filtered.length === 0 ? <li className="aun-none">該当する会員がいません</li> : null}
              </ul>
            </section>

            {/* 内容 */}
            <section className="aun-card">
              <div className="aun-card-head">
                <h3>2. 内容を書く</h3>
              </div>
              <label className="aun-label">タイトル（必須・100文字まで）</label>
              <input
                className="aun-input"
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：ご注文の商品が入荷しました"
              />
              <label className="aun-label">本文（任意）</label>
              <textarea
                className="aun-input aun-textarea"
                value={body}
                maxLength={4000}
                rows={6}
                onChange={(e) => setBody(e.target.value)}
                placeholder="お客様に伝えたい内容（改行できます）"
              />
              <label className="aun-label">リンク（任意）</label>
              <input
                className="aun-input"
                value={linkUrl}
                maxLength={500}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="/products/26 や https://..."
              />

              <label className="aun-check">
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                <span>
                  メールでも知らせる
                  <small>購入完了メールと同じテンプレートで送ります（1回{MAX_EMAILS}人まで）</small>
                </span>
              </label>
              {tooManyEmails ? (
                <div className="aun-warn">メールは1回{MAX_EMAILS}人までです。人数を減らすか、チェックを外してください。</div>
              ) : null}

              <button className="aun-send" type="button" onClick={send} disabled={sending || !count || !title.trim()}>
                {sending ? (
                  <>
                    <span className="btn-spinner" />
                    送信中…{sendEmail ? `（${count}通で約${Math.ceil(count * 1.2)}秒）` : ""}
                  </>
                ) : (
                  `${count}人に送信する`
                )}
              </button>
            </section>
          </div>
        )}

        {!loading && history.length > 0 ? (
          <section className="aun-card aun-history">
            <div className="aun-card-head">
              <h3>送信履歴（最新20件）</h3>
            </div>
            <ul>
              {history.map((h) => {
                const rs = h.user_notice_recipients || [];
                const read = rs.filter((r) => r.read_at).length;
                const mailed = rs.filter((r) => r.emailed_at).length;
                const failed = rs.filter((r) => r.email_error).length;
                return (
                  <li key={h.id} className="aun-hrow">
                    <div className="aun-htext">
                      <div className="aun-htitle">{h.title}</div>
                      <div className="aun-hmeta">
                        {fmt(h.created_at)} ／ {rs.length}人 ／ 既読 {read}
                        {h.send_email ? ` ／ メール ${mailed}通${failed ? `（失敗${failed}）` : ""}` : " ／ アプリのみ"}
                      </div>
                      <div className="aun-hto">
                        {rs.slice(0, 6).map((r) => nameOf(r.user_id)).join("、")}
                        {rs.length > 6 ? ` ほか${rs.length - 6}人` : ""}
                      </div>
                    </div>
                    <button type="button" className="aun-mini danger" onClick={() => removeNotice(h)}>
                      削除
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
