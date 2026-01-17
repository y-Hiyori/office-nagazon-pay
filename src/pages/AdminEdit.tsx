// src/pages/AdminEdit.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminEdit.css";

export default function AdminEdit() {
  const navigate = useNavigate();
  const { id: urlId } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);

  // 編集用（表示＆更新に使う）
  const [editId, setEditId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");

  const [isSaving, setIsSaving] = useState(false);

  // ✅ ID変更は事故りやすいので分離（必要な時だけ開く）
  const [openIdEdit, setOpenIdEdit] = useState(false);

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
        id: idNum,
        name: name.trim(),
        price: priceNum,
        stock: stockNum,
      })
      .eq("id", urlId);

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
    <div className="ae-page">
      {/* ヘッダー */}
      <header className="ae-header">
        <button className="ae-back" onClick={() => navigate("/admin-page")} aria-label="戻る">
          ←
        </button>
        <div className="ae-header-title">
          <h2>商品編集</h2>
          <p>商品ID: <strong>{urlId}</strong></p>
        </div>
      </header>

      {/* メインカード */}
      <main className="ae-card">
        <div className="ae-section-title">
          <h3>基本情報</h3>
          <p>必要な項目を更新して保存してください</p>
        </div>

        {/* 商品名 */}
        <div className="ae-field">
          <label className="ae-label">商品名</label>
          <input
            className="ae-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            type="text"
            placeholder="例：NAGAZON ステッカー"
          />
        </div>

        {/* 価格・在庫（2列） */}
        <div className="ae-grid2">
          <div className="ae-field">
            <label className="ae-label">価格</label>
            <div className="ae-input-wrap">
              <input
                className="ae-input"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                type="number"
                inputMode="numeric"
                placeholder="0"
              />
              <span className="ae-suffix">円</span>
            </div>
          </div>

          <div className="ae-field">
            <label className="ae-label">在庫数</label>
            <div className="ae-input-wrap">
              <input
                className="ae-input"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                type="number"
                inputMode="numeric"
                placeholder="0"
              />
              <span className="ae-suffix">個</span>
            </div>
          </div>
        </div>

        {/* ✅ ID変更（必要なときだけ） */}
        <div className="ae-danger">
          <button
            type="button"
            className="ae-danger-toggle"
            onClick={() => setOpenIdEdit((v) => !v)}
          >
            {openIdEdit ? "▲ 商品ID変更を閉じる" : "▼ 商品ID変更（注意）"}
          </button>

          {openIdEdit && (
            <div className="ae-danger-body">
              <p className="ae-danger-text">
                商品IDの変更はリンク切れや参照ズレの原因になります。必要な場合のみ変更してください。
              </p>

              <div className="ae-field">
                <label className="ae-label">商品ID</label>
                <input
                  className="ae-input"
                  value={editId}
                  onChange={(e) => setEditId(e.target.value)}
                  type="number"
                  inputMode="numeric"
                  placeholder="例：101"
                />
              </div>
            </div>
          )}
        </div>

        {/* 下部余白（固定ボタンに被らないように） */}
        <div className="ae-bottom-space" />
      </main>

      {/* ✅ 固定フッター：保存ボタン */}
      <footer className="ae-footer">
        <button className="ae-save" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "保存中..." : "保存する"}
        </button>
      </footer>
    </div>
  );
}