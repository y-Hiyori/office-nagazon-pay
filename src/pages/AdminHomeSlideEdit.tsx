import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminHomeSlides.css";

export default function AdminHomeSlideEdit({ mode }: { mode: "new" | "edit" }) {
  const navigate = useNavigate();
  const { id } = useParams(); // ✅ uuid文字列

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(""); // UI上はdescriptionでOK（DBはdesc）
  const [imageUrl, setImageUrl] = useState("");
  const [linkPath, setLinkPath] = useState(""); // ✅ 任意。空なら /products にする
  const [isVisible, setIsVisible] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (mode !== "edit" || !id) return;

      setLoading(true);

      // ✅ DBカラム名に合わせる（desc / link_url）
      const { data, error } = await supabase
        .from("home_slides")
        .select("title, desc, image_url, link_url, is_visible, sort_order")
        .eq("id", id)
        .single();

      if (error || !data) {
        console.error(error);
        alert("読み込みに失敗しました");
        setLoading(false);
        return;
      }

      setTitle(data.title ?? "");
      setDescription(data.desc ?? "");
      setImageUrl(data.image_url ?? "");
      setLinkPath(data.link_url ?? ""); // 空でもOK
      setIsVisible(Boolean(data.is_visible));
      setSortOrder(Number(data.sort_order ?? 0));

      setLoading(false);
    };

    load();
  }, [mode, id]);

  const save = async () => {
    setSaving(true);

    const payload = {
      title: title.trim(),
      desc: description.trim(), // ✅ DBはdesc
      image_url: imageUrl.trim(),
      link_url: (linkPath || "").trim() || "/products", // ✅ 空なら /products
      is_visible: isVisible,
      sort_order: Number(sortOrder) || 0,
    };

    if (!payload.image_url) {
      alert("画像URLは必須です（とりあえずURLでOK）");
      setSaving(false);
      return;
    }

    if (mode === "new") {
      const { error } = await supabase.from("home_slides").insert(payload);
      if (error) {
        console.error(error);
        alert("保存に失敗しました");
        setSaving(false);
        return;
      }
    } else {
      if (!id) {
        alert("IDが見つかりません");
        setSaving(false);
        return;
      }

      const { error } = await supabase.from("home_slides").update(payload).eq("id", id);
      if (error) {
        console.error(error);
        alert("保存に失敗しました");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    navigate("/admin-home", { replace: true });
  };

  return (
    <>
      <AdminHeader />
      <div className="ahs-page" style={{ paddingTop: 80 }}>
        <div className="ahs-head">
          <h2 className="ahs-title">{mode === "new" ? "スライド追加" : "スライド編集"}</h2>
          <div className="ahs-actions">
            <button className="ahs-mini" onClick={() => navigate(-1)}>戻る</button>
            <button className="ahs-add" onClick={save} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ padding: 16 }}>読み込み中...</p>
        ) : (
          <div className="ahs-form">
            <label className="ahs-label">タイトル</label>
            <input className="ahs-input" value={title} onChange={(e) => setTitle(e.target.value)} />

            <label className="ahs-label">説明</label>
            <textarea
              className="ahs-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />

            <label className="ahs-label">画像URL（必須）</label>
            <input className="ahs-input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />

            <label className="ahs-label">リンク先（任意：空なら /products）</label>
            <input
              className="ahs-input"
              value={linkPath}
              onChange={(e) => setLinkPath(e.target.value)}
              placeholder="例：/products（空でもOK）"
            />

            <div className="ahs-row">
              <div>
                <label className="ahs-label">並び順（小さいほど先）</label>
                <input
                  className="ahs-input"
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                />
              </div>

              <div className="ahs-check">
                <input
                  id="vis"
                  type="checkbox"
                  checked={isVisible}
                  onChange={(e) => setIsVisible(e.target.checked)}
                />
                <label htmlFor="vis">表示する</label>
              </div>
            </div>

            <div className="ahs-preview">
              <div className="ahs-preview-title">プレビュー</div>
              <div className="ahs-preview-box">
                {imageUrl ? <img src={imageUrl} alt="preview" /> : <div className="ahs-noimg">No Image</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}