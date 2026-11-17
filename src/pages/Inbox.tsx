// src/pages/Inbox.tsx
// お知らせ：自分宛てのお知らせ ＋ みんなへのお知らせ（ホームと同じ）
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import Loading from "../components/Loading";
import { useUser } from "../context/UserContext";
import { supabase } from "../lib/supabase";
import "./Inbox.css";

type Personal = {
  id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  created_at: string;
  read_at: string | null;
};

type Public = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function Inbox() {
  const navigate = useNavigate();
  const { userId, ready, refreshUnread } = useUser();
  const [tab, setTab] = useState<"personal" | "public">("personal");
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [pub, setPub] = useState<Public[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const load = async () => {
      setLoading(true);
      const pubReq = supabase
        .from("home_notices")
        .select("id,title,body,created_at")
        .eq("is_visible", true)
        .order("created_at", { ascending: false })
        .limit(30);

      const perReq = userId
        ? supabase
            .from("user_notice_recipients")
            .select("read_at, user_notices(id,title,body,link_url,created_at)")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(100)
        : null;

      const [pubRes, perRes] = await Promise.all([pubReq, perReq]);
      setPub((pubRes.data ?? []) as Public[]);

      const list: Personal[] = ((perRes?.data ?? []) as any[])
        .filter((r) => r.user_notices)
        .map((r) => ({ ...r.user_notices, read_at: r.read_at }));
      setPersonal(list);
      if (!userId) setTab("public");
      setLoading(false);
    };
    load();
  }, [ready, userId]);

  const unread = personal.filter((p) => !p.read_at).length;

  const openPersonal = async (n: Personal) => {
    setOpenId((cur) => (cur === n.id ? null : n.id));
    if (!n.read_at) {
      setPersonal((prev) => prev.map((p) => (p.id === n.id ? { ...p, read_at: new Date().toISOString() } : p)));
      await supabase.rpc("mark_user_notice_read", { p_notice_id: n.id });
      refreshUnread();
    }
  };

  const markAll = async () => {
    const now = new Date().toISOString();
    setPersonal((prev) => prev.map((p) => ({ ...p, read_at: p.read_at ?? now })));
    await supabase.rpc("mark_user_notice_read", { p_notice_id: null });
    refreshUnread();
  };

  const openLink = (url: string) => {
    if (url.startsWith("/")) navigate(url);
    else window.open(url, "_blank", "noopener");
  };

  return (
    <div className="inbox-page">
      <SiteHeader />
      <main className="inbox-main">
        <div className="inbox-shell">
          <h2 className="inbox-title">お知らせ</h2>

          <div className="inbox-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "personal"}
              className={`inbox-tab ${tab === "personal" ? "is-active" : ""}`}
              onClick={() => setTab("personal")}
            >
              あなたへ{unread > 0 ? <span className="inbox-tab-badge">{unread}</span> : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "public"}
              className={`inbox-tab ${tab === "public" ? "is-active" : ""}`}
              onClick={() => setTab("public")}
            >
              みんなへ
            </button>
          </div>

          {!ready || loading ? (
            <Loading />
          ) : tab === "personal" ? (
            !userId ? (
              <div className="inbox-empty">
                <p>ログインすると、あなた宛てのお知らせを受け取れます。</p>
                <button type="button" className="inbox-btn" onClick={() => navigate("/auth")}>
                  ログイン・会員登録
                </button>
              </div>
            ) : personal.length === 0 ? (
              <div className="inbox-empty"><p>あなた宛てのお知らせはまだありません。</p></div>
            ) : (
              <>
                {unread > 0 ? (
                  <div className="inbox-toolbar">
                    <button type="button" className="inbox-link" onClick={markAll}>すべて既読にする</button>
                  </div>
                ) : null}
                <ul className="inbox-list">
                  {personal.map((n) => {
                    const open = openId === n.id;
                    return (
                      <li key={n.id} className={`inbox-item ${n.read_at ? "" : "is-unread"} ${open ? "is-open" : ""}`}>
                        <button type="button" className="inbox-row" onClick={() => openPersonal(n)} aria-expanded={open}>
                          <span className="inbox-dot" aria-hidden="true" />
                          <span className="inbox-text">
                            <span className="inbox-item-title">{n.title}</span>
                            {!open ? <span className="inbox-item-sub">{(n.body || "").trim() || "—"}</span> : null}
                          </span>
                          <span className="inbox-date">{fmt(n.created_at)}</span>
                        </button>
                        {open ? (
                          <div className="inbox-body">
                            {n.body ? <div className="inbox-body-text">{n.body}</div> : null}
                            {n.link_url ? (
                              <button type="button" className="inbox-btn" onClick={() => openLink(n.link_url!)}>
                                詳しく見る
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            )
          ) : pub.length === 0 ? (
            <div className="inbox-empty"><p>お知らせはありません。</p></div>
          ) : (
            <ul className="inbox-list">
              {pub.map((n) => (
                <li key={n.id} className="inbox-item">
                  <button type="button" className="inbox-row" onClick={() => navigate(`/notice/${n.id}`)}>
                    <span className="inbox-text">
                      <span className="inbox-item-title">{n.title}</span>
                      <span className="inbox-item-sub">{(n.body || "").trim() || "—"}</span>
                    </span>
                    <span className="inbox-date">{fmt(n.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
