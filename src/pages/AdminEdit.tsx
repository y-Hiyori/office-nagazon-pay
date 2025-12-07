// src/pages/AdminEdit.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminEdit.css";

function AdminEdit() {
  const navigate = useNavigate();
  const { id: urlId } = useParams<{ id: string }>(); // URL の元のID

  const [loading, setLoading] = useState(true);

  // 編集用の「商品ID」
  const [editId, setEditId] = useState("");

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");

  const [isSaving, setIsSaving] = useState(false);

  // 商品読み込み（id / name / price / stock）
  const loadProduct = async () => {
    if (!urlId) {
      alert("商品のIDが不正です");
      navigate("/admin-page");
      return;
    }

    const { data, error } = await supabase
      .from("products")
      .select("id, name, price, stock")
      .eq("id", urlId)
      .maybeSingle();

    if (error || !data) {
      alert("商品が見つかりません");
      console.error(error);
      navigate("/admin-page");
      return;
    }

    setEditId(String(data.id));
    setName(data.name);
    setPrice(String(data.price));
    setStock(String(data.stock));
    setLoading(false);
  };

  useEffect(() => {
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId]);

  // 保存（ID も含めて更新）
  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    if (!editId || !name || !price || !stock) {
      alert("すべての項目を入力してください");
      setIsSaving(false);
      return;
    }

    const idNum = Number(editId);
    const priceNum = Number(price);
    const stockNum = Number(stock);

    if (Number.isNaN(idNum) || Number.isNaN(priceNum) || Number.isNaN(stockNum)) {
      alert("ID・価格・在庫は数値で入力してください");
      setIsSaving(false);
      return;
    }

    if (!urlId) {
      alert("商品のIDが不正です");
      setIsSaving(false);
      return;
    }

    const { error } = await supabase
      .from("products")
      .update({
        id: idNum, // ID も更新
        name,
        price: priceNum,
        stock: stockNum,
      })
      .eq("id", urlId); // 元のIDで探す

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

      {/* ▼ フローティングラベル付きフィールドたち */}
      <div className="edit-field">
        <input
          className="edit-input"
          value={editId}
          onChange={(e) => setEditId(e.target.value)}
          type="number"
          placeholder=" "            // ← 空白1文字がポイント
        />
        <label className="edit-label">商品ID</label>
      </div>

      <div className="edit-field">
        <input
          className="edit-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          type="text"
          placeholder=" "
        />
        <label className="edit-label">商品名</label>
      </div>

      <div className="edit-field">
        <input
          className="edit-input"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          type="number"
          placeholder=" "
        />
        <label className="edit-label">価格</label>
      </div>

      <div className="edit-field">
        <input
          className="edit-input"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          type="number"
          placeholder=" "
        />
        <label className="edit-label">在庫数</label>
      </div>

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