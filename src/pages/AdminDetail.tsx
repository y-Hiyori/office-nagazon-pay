// src/pages/AdminDetail.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminDetail.css";
import { findProductImage } from "../data/products";

type AdminProduct = {
  id: number;
  name: string;
  price: number;
  stock: number;
};

function AdminDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProduct = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, price, stock")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      console.error("商品取得エラー:", error);
      setProduct(null);
    } else {
      setProduct(data as AdminProduct);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProduct();
  }, [id]);

  const formatPrice = (value: number | string) => {
    const num = Number(value ?? 0);
    if (Number.isNaN(num)) return String(value ?? "");
    return num.toLocaleString("ja-JP");
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  if (!product)
    return (
      <div style={{ padding: 20 }}>
        <p>商品が見つかりません</p>
        <button onClick={() => navigate("/admin-page")}>← 戻る</button>
      </div>
    );

  const imgSrc = findProductImage(product.id) ?? "";

  const handleDelete = async () => {
    const ok = confirm("本当に削除しますか？");
    if (!ok) return;

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id);

    if (error) {
      alert("削除に失敗しました: " + error.message);
      return;
    }

    alert("商品を削除しました！");
    navigate("/admin-page");
  };

  return (
    <div className="detail-container">
      <header className="detail-header">
        <button className="back-btn" onClick={() => navigate("/admin-page")}>
          ←
        </button>
        <h2 className="detail-title">商品詳細</h2>
      </header>

      {imgSrc ? (
        <img src={imgSrc} alt={product.name} className="detail-image" />
      ) : (
        <div className="admin-noimg detail-image">画像なし</div>
      )}

      <h2>{product.name}</h2>
      <p>価格：{formatPrice(product.price)}円</p>
      <p>在庫：{product.stock}</p>

      <div className="detail-buttons">
        <button
          className="edit-btn"
          onClick={() => navigate(`/admin-edit/${product.id}`)}
        >
          編集
        </button>

        <button className="delete-btn" onClick={handleDelete}>
          削除
        </button>
      </div>
    </div>
  );
}

export default AdminDetail;