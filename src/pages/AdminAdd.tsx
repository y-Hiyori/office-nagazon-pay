// src/pages/AdminAdd.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminAdd.css";

function AdminAdd() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    if (!name || !price || !stock) {
      alert("すべての項目を入力してください");
      setIsSubmitting(false);
      return;
    }

    const priceNum = Number(price);
    const stockNum = Number(stock);

    if (Number.isNaN(priceNum) || Number.isNaN(stockNum)) {
      alert("価格と在庫は数値で入力してください");
      setIsSubmitting(false);
      return;
    }

    // 👇 id は送らない！ Supabase 側で自動採番させる
    const { error } = await supabase.from("products").insert({
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