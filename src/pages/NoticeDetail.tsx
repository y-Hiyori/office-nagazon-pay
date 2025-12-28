import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import "./NoticeDetail.css";

type NoticeRow = {
  id: string;
  title: string;
  body: string | null;
  link_url: string | null;
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

export default function NoticeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<NoticeRow | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;

      setLoading(true);
      const { data, error } = await supabase
        .from("home_notices")
        .select("id,title,body,link_url,created_at")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        console.error("notice load error:", error);
        setRow(null);
        setLoading(false);
        return;
      }

      setRow(data as NoticeRow);
      setLoading(false);
    };

    load();
  }, [id]);

  return (
    <div className="notice-page">
      <SiteHeader />

      <main className="notice-main">
        <div className="notice-shell">
          <button className="notice-back" onClick={() => navigate(-1)}>
            ← 戻る
          </button>

          {loading ? (
            <div className="notice-card">読み込み中...</div>
          ) : !row ? (
            <div className="notice-card">お知らせが見つかりませんでした。</div>
          ) : (
            <div className="notice-card">
              <div className="notice-date">{fmtDate(row.created_at)}</div>
              <h2 className="notice-title">{row.title}</h2>
              {row.body && <div className="notice-body">{row.body}</div>}

              {row.link_url?.trim() ? (
                <button
                  className="notice-linkbtn"
                  onClick={() => window.open(row.link_url!.trim(), "_blank")}
                >
                  リンクを開く
                </button>
              ) : null}
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}