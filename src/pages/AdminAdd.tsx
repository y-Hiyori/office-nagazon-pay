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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    if (!name || !price || !stock) {
      alert("すべての項目を入力してください");
      setIsSubmitting(false);
      return;
    }

    // ▼ 画像をBase64に変換
    let finalImage = "";
    if (imageFile) {
      finalImage = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(imageFile);
      });
    }

    // ▼ Supabase に保存
    const { error } = await supabase.from("products").insert({
      name,
      price: Number(price),
      stock: Number(stock),
      imageData: finalImage,
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
          追加
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

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

export default AdminAdd;