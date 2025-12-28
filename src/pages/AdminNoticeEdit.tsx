import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminNoticeEdit.css";

export default function AdminNoticeEdit({ mode }: { mode: "new" | "edit" }) {
  const navigate = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (mode !== "edit" || !id) return;

      setLoading(true);
      const { data, error } = await supabase
        .from("home_notices")
        .select("title,body,link_url,is_visible")
        .eq("id", id)
        .single();

      if (error || !data) {
        console.error(error);
        setLoading(false);
        return;
      }

      setTitle(data.title ?? "");
      setBody(data.body ?? "");
      setLinkUrl(data.link_url ?? "");
      setIsVisible(Boolean(data.is_visible));
      setLoading(false);
    };

    load();
  }, [mode, id]);

  const save = async () => {
    const t = title.trim();
    if (!t) {
      alert("タイトルは必須です");
      return;
    }

    setSaving(true);

    const payload = {
      title: t,
      body: body.trim() || null,
      link_url: linkUrl.trim() || null,
      is_visible: isVisible,
    };

    if (mode === "new") {
      const { error } = await supabase.from("home_notices").insert(payload);
      if (error) {
        console.error(error);
        alert("保存に失敗しました");
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from("home_notices")
        .update(payload)
        .eq("id", id);

      if (error) {
        console.error(error);
        alert("保存に失敗しました");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    navigate("/admin-notices", { replace: true });
  };

  return (
    <>
      <AdminHeader />
      <div className="ane-page" style={{ paddingTop: 80 }}>
        <div className="ane-head">
          <h2 className="ane-title">{mode === "new" ? "お知らせ追加" : "お知らせ編集"}</h2>
          <div className="ane-actions">
            <button className="ane-mini" onClick={() => navigate(-1)}>戻る</button>
            <button className="ane-save" onClick={save} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="ane-loading">読み込み中...</p>
        ) : (
          <div className="ane-form">
            <label className="ane-label">タイトル（必須）</label>
            <input
              className="ane-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：年末年始の営業について"
            />

            <label className="ane-label">本文（任意）</label>
            <textarea
              className="ane-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="表示したい内容を書いてください（改行OK）"
            />

            <label className="ane-label">リンクURL（任意）</label>
            <input
              className="ane-input"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://... または /products など"
            />

            <div className="ane-row">
              <div className="ane-check">
                <input
                  id="vis"
                  type="checkbox"
                  checked={isVisible}
                  onChange={(e) => setIsVisible(e.target.checked)}
                />
                <label htmlFor="vis">表示する</label>
              </div>
            </div>

            <div className="ane-preview">
              <div className="ane-preview-title">プレビュー</div>
              <div className="ane-preview-box">
                <div className="ane-preview-h">{title.trim() || "（タイトル）"}</div>
                <div className="ane-preview-b">{body.trim() || "（本文なし）"}</div>
                {linkUrl.trim() ? <div className="ane-preview-l">link: {linkUrl.trim()}</div> : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}