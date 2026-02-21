// src/pages/AdminAdd.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminAdd.css";
import { appDialog } from "../lib/appDialog"; // ✅ 追加

function AdminAdd() {
  const navigate = useNavigate();

  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    if (!productId || !name || !price || !stock) {
      await appDialog.alert({
        title: "入力エラー",
        message: "商品ID・商品名・価格・在庫をすべて入力してください",
      });
      setIsSubmitting(false);
      return;
    }

    const idNum = Number(productId);
    const priceNum = Number(price);
    const stockNum = Number(stock);

    if (!Number.isInteger(idNum) || idNum <= 0) {
      await appDialog.alert({
        title: "入力エラー",
        message: "商品IDは1以上の整数で入力してください",
      });
      setIsSubmitting(false);
      return;
    }

    if (Number.isNaN(priceNum) || Number.isNaN(stockNum)) {
      await appDialog.alert({
        title: "入力エラー",
        message: "価格と在庫は数値で入力してください",
      });
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase.from("products").insert({
      id: idNum,
      name,
      price: priceNum,
      stock: stockNum,
    });

    if (error) {
      console.error(error);
      await appDialog.alert({
        title: "追加に失敗しました",
        message: "商品追加に失敗: " + error.message,
      });
      setIsSubmitting(false);
      return;
    }

    await appDialog.alert({ title: "完了", message: "商品を追加しました！" });
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