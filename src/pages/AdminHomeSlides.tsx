import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminHomeSlides.css";

type SlideRow = {
  id: string;              // ✅ uuid
  title: string;
  desc: string;            // ✅ DBは desc
  image_url: string;
  link_url: string;        // ✅ DBは link_url
  is_visible: boolean;
  sort_order: number;
  created_at: string;
};

export default function AdminHomeSlides() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SlideRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("home_slides")
      // ✅ DBカラム名に合わせる
      .select("id,title,desc,image_url,link_url,is_visible,sort_order,created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("home_slides load error:", error);
      setRows([]);
    } else {
      setRows((data ?? []) as SlideRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleVisible = async (id: string, next: boolean) => {
    const { error } = await supabase
      .from("home_slides")
      .update({ is_visible: next })
      .eq("id", id);

    if (error) return console.error(error);
    setRows((p) => p.map((r) => (r.id === id ? { ...r, is_visible: next } : r)));
  };

  const removeRow = async (id: string) => {
    if (!confirm("このスライドを削除しますか？")) return;

    const { error } = await supabase.from("home_slides").delete().eq("id", id);
    if (error) return console.error(error);

    setRows((p) => p.filter((r) => r.id !== id));
  };

  // 並び替え（sort_order を入れ替え）
  const move = async (id: string, dir: -1 | 1) => {
    const list = [...rows].sort(
      (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)
    );

    const idx = list.findIndex((r) => r.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= list.length) return;

    const a = list[idx];
    const b = list[to];

    const { error: e1 } = await supabase
      .from("home_slides")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);

    const { error: e2 } = await supabase
      .from("home_slides")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);

    if (e1 || e2) {
      console.error(e1 || e2);
      return;
    }

    await load();
  };

  const visibleCount = useMemo(() => rows.filter((r) => r.is_visible).length, [rows]);

  return (
    <>
      <AdminHeader />
      <div className="ahs-page" style={{ paddingTop: 80 }}>
        <div className="ahs-head">
          <h2 className="ahs-title">ホームスライド</h2>
          <div className="ahs-actions">
            <div className="ahs-chip">表示中：{visibleCount}</div>
            <button className="ahs-add" onClick={() => navigate("/admin-home-new")}>
              ＋ 追加
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ padding: 16 }}>読み込み中...</p>
        ) : rows.length === 0 ? (
          <p style={{ padding: 16 }}>スライドがありません</p>
        ) : (
          <div className="ahs-list">
            {rows.map((r) => (
              <div className={`ahs-item ${r.is_visible ? "" : "is-hidden"}`} key={r.id}>
                <div className="ahs-thumb">
                  {r.image_url ? (
                    <img src={r.image_url} alt={r.title} />
                  ) : (
                    <div className="ahs-noimg">No Image</div>
                  )}
                </div>

                <div className="ahs-info" onClick={() => navigate(`/admin-home-edit/${r.id}`)}>
                  <div className="ahs-row1">
                    <div className="ahs-name">{r.title || "（無題）"}</div>
                    {!r.is_visible && <span className="ahs-badge">非表示</span>}
                  </div>

                  {/* ✅ desc */}
                  <div className="ahs-desc">{r.desc || "—"}</div>

                  <div className="ahs-meta">
                    {/* ✅ link_url */}
                    <span>link: {r.link_url || "-"}</span>
                    <span>order: {r.sort_order}</span>
                  </div>
                </div>

                <div className="ahs-buttons">
                  <button className="ahs-mini" onClick={(e) => (e.stopPropagation(), move(r.id, -1))}>↑</button>
                  <button className="ahs-mini" onClick={(e) => (e.stopPropagation(), move(r.id, 1))}>↓</button>

                  <button
                    className={`ahs-toggle ${r.is_visible ? "on" : "off"}`}
                    onClick={(e) => (e.stopPropagation(), toggleVisible(r.id, !r.is_visible))}
                  >
                    {r.is_visible ? "表示中" : "非表示"}
                  </button>

                  <button className="ahs-mini danger" onClick={(e) => (e.stopPropagation(), removeRow(r.id))}>
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