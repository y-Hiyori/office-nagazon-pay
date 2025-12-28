import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminNotices.css";

type NoticeRow = {
  id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_visible: boolean;
  created_at: string;
};

const fmtDate = (iso: string) => {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}/${m}/${day}`;
  } catch {
    return "";
  }
};

export default function AdminNotices() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<NoticeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("home_notices")
      .select("id,title,body,link_url,is_visible,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("admin notices load error:", error);
      setRows([]);
    } else {
      setRows((data ?? []) as NoticeRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const visibleCount = useMemo(
    () => rows.filter((r) => r.is_visible).length,
    [rows]
  );

  const toggle = async (id: string, next: boolean) => {
    const { error } = await supabase
      .from("home_notices")
      .update({ is_visible: next })
      .eq("id", id);

    if (error) return console.error(error);
    setRows((p) => p.map((r) => (r.id === id ? { ...r, is_visible: next } : r)));
  };

  const removeRow = async (id: string) => {
    if (!confirm("このお知らせを削除しますか？")) return;
    const { error } = await supabase.from("home_notices").delete().eq("id", id);
    if (error) return console.error(error);
    setRows((p) => p.filter((r) => r.id !== id));
  };

  return (
    <>
      <AdminHeader />
      <div className="an-page" style={{ paddingTop: 80 }}>
        <div className="an-head">
          <h2 className="an-title">お知らせ管理</h2>

          <div className="an-actions">
            <div className="an-chip">表示中：{visibleCount}</div>
            <button className="an-add" onClick={() => navigate("/admin-notice-new")}>
              ＋ 追加
            </button>
          </div>
        </div>

        {loading ? (
          <p className="an-loading">読み込み中...</p>
        ) : rows.length === 0 ? (
          <p className="an-loading">お知らせがありません</p>
        ) : (
          <div className="an-list">
            {rows.map((r) => (
              <div className={`an-item ${r.is_visible ? "" : "is-hidden"}`} key={r.id}>
                <button
                  type="button"
                  className="an-info"
                  onClick={() => navigate(`/admin-notice-edit/${r.id}`)}
                >
                  <div className="an-row1">
                    <div className="an-name">{r.title || "（無題）"}</div>
                    {!r.is_visible && <span className="an-badge">非表示</span>}
                  </div>
                  <div className="an-row2">
                    <span className="an-date">{fmtDate(r.created_at)}</span>
                    <span className="an-sub">{(r.body || "").trim() || "—"}</span>
                  </div>
                </button>

                <div className="an-btns">
                  <button
                    className={`an-toggle ${r.is_visible ? "on" : "off"}`}
                    onClick={() => toggle(r.id, !r.is_visible)}
                  >
                    {r.is_visible ? "表示中" : "非表示"}
                  </button>
                  <button className="an-mini" onClick={() => navigate(`/notice/${r.id}`)}>
                    表示確認
                  </button>
                  <button className="an-mini danger" onClick={() => removeRow(r.id)}>
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}