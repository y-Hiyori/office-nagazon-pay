// src/pages/AdminDetail.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminDetail.css";

function AdminDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadProduct = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("商品取得エラー:", error);
    } else {
      setProduct(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProduct();
  }, [id]);

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  if (!product)
    return (
      <div style={{ padding: 20 }}>
        <p>商品が見つかりません</p>
        <button onClick={() => navigate("/admin-page")}>← 戻る</button>
      </div>
    );

  // 商品削除
  const handleDelete = async () => {
    const ok = confirm("本当に削除しますか？");
    if (!ok) return;

    const { error } = await supabase.from("products").delete().eq("id", id);

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

      <img
        src={product.imageData}
        alt={product.name}
        className="detail-image"
      />

      <h2>{product.name}</h2>
      <p>価格：{product.price}円</p>
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