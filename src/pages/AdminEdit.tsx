// src/pages/AdminEdit.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminEdit.css";

function AdminEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");

  const [isSaving, setIsSaving] = useState(false);

  // 🔥 商品読み込み（name / price / stock だけ使う）
  const loadProduct = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("name, price, stock")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      alert("商品が見つかりません");
      console.error(error);
      navigate("/admin-page");
      return;
    }

    setName(data.name);
    setPrice(String(data.price));
    setStock(String(data.stock));
    setLoading(false);
  };

  useEffect(() => {
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 🔧 保存（画像関連は一切ナシ）
  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    if (!name || !price || !stock) {
      alert("すべての項目を入力してください");
      setIsSaving(false);
      return;
    }

    const { error } = await supabase
      .from("products")
      .update({
        name,
        price: Number(price),
        stock: Number(stock),
      })
      .eq("id", id);

    if (error) {
      alert("商品更新に失敗しました: " + error.message);
      console.error(error);
      setIsSaving(false);
      return;
    }

    alert("商品を更新しました！");
    navigate("/admin-page");
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  return (
    <div className="edit-container">
      <header className="edit-header">
        <button className="back-button" onClick={() => navigate("/admin-page")}>
          ←
        </button>
        <h2 className="edit-title">商品編集</h2>
      </header>

      <input
        className="edit-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="商品名"
      />

      <input
        className="edit-input"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="価格"
        type="number"
      />

      <input
        className="edit-input"
        value={stock}
        onChange={(e) => setStock(e.target.value)}
        placeholder="在庫数"
        type="number"
      />

      {/* 画像アップロード＆プレビュー部分は全部削除 */}

      <button
        className="save-button"
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? "保存中..." : "保存する"}
      </button>
    </div>
  );
}

export default AdminEdit;