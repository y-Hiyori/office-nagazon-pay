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
  const [imageData, setImageData] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // ★ 追加：保存中フラグ
  const [isSaving, setIsSaving] = useState(false);

  // 🔥 商品読み込み
  const loadProduct = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      alert("商品が見つかりません");
      navigate("/admin-page");
      return;
    }

    setName(data.name);
    setPrice(String(data.price));
    setStock(String(data.stock));
    setImageData(data.imageData);

    setLoading(false);
  };

  useEffect(() => {
    loadProduct();
  }, [id]);

  // 🔥 画像プレビュー
  const handleImageChange = (file: File | null) => {
    setImageFile(file);
    if (!file) {
      setPreview(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // 🔧 保存
  const handleSave = async () => {
    if (isSaving) return; // ← 二重押し防止
    setIsSaving(true);

    if (!name || !price || !stock) {
      alert("すべての項目を入力してください");
      setIsSaving(false);
      return;
    }

    let finalImage = imageData;

    // 画像変更時
    if (imageFile) {
      const reader = new FileReader();
      reader.onload = async () => {
        finalImage = reader.result as string;

        await supabase
          .from("products")
          .update({
            name,
            price: Number(price),
            stock: Number(stock),
            imageData: finalImage,
          })
          .eq("id", id);

        alert("商品を更新しました！");
        navigate("/admin-page");
      };

      reader.readAsDataURL(imageFile);
      return;
    }

    // 画像変わらない時
    await supabase
      .from("products")
      .update({
        name,
        price: Number(price),
        stock: Number(stock),
        imageData: finalImage,
      })
      .eq("id", id);

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

      <input
        className="file-input"
        type="file"
        accept="image/*"
        onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
      />

      <div className="preview-section">
        <p className="preview-label">現在の画像</p>
        <div className="preview-images">
          <img src={imageData} alt="before" />
        </div>

        {preview && (
          <>
            <p className="preview-label">変更後の画像</p>
            <div className="preview-images">
              <img src={preview} alt="after" />
            </div>
          </>
        )}
      </div>

      {/* ★ 保存中は押せない */}
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