// src/pages/AdminAdd.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminAdd.css";

function AdminAdd() {
  const navigate = useNavigate();

  // ★ 追加：商品IDを自分で入力する
  const [productId, setProductId] = useState("");

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    // ★ IDも含めて全部チェック
    if (!productId || !name || !price || !stock) {
      alert("商品ID・商品名・価格・在庫をすべて入力してください");
      setIsSubmitting(false);
      return;
    }

    const idNum = Number(productId);
    const priceNum = Number(price);
    const stockNum = Number(stock);

    // ID は整数・1以上の数にする
    if (!Number.isInteger(idNum) || idNum <= 0) {
      alert("商品IDは1以上の整数で入力してください");
      setIsSubmitting(false);
      return;
    }

    if (Number.isNaN(priceNum) || Number.isNaN(stockNum)) {
      alert("価格と在庫は数値で入力してください");
      setIsSubmitting(false);
      return;
    }

    // 👇 ここで id も一緒に渡す
    const { error } = await supabase.from("products").insert({
      id: idNum,
      name,
      price: priceNum,
      stock: stockNum,
    });

    if (error) {
      alert("商品追加に失敗: " + error.message);
      console.error(error);
      setIsSubmitting(false);
      return;
    }

    alert("商品を追加しました！");
    navigate("/admin-page");
  };

  return (
    <div className="add-container">
      <header className="add-header">
        <button className="back-button" onClick={() => navigate("/admin-page")}>
          ← 戻る
        </button>

        <h2 className="add-title">商品追加</h2>

        <button
          className="add-submit-button"
          onClick={handleAdd}
          disabled={isSubmitting}
        >
          {isSubmitting ? "送信中..." : "追加"}
        </button>
      </header>

      {/* ★ 商品ID入力欄を追加 */}
      <input
        type="number"
        placeholder="商品ID（例：101）"
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
      />

      <input
        type="text"
        placeholder="商品名"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <input
        type="number"
        placeholder="価格"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />

      <input
        type="number"
        placeholder="在庫数"
        value={stock}
        onChange={(e) => setStock(e.target.value)}
      />
    </div>
  );
}

export default AdminAdd;