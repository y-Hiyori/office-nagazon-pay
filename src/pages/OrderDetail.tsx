// src/pages/OrderDetail.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./OrderDetail.css";
import { findProductImage } from "../data/products"; // ← ここだけ変更

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const formatPrice = (value: any) =>
    (Number(value) || 0).toLocaleString("ja-JP");

  const getImageByProductId = (productId: number | null | undefined) => {
    if (productId == null) return "";
    return findProductImage(Number(productId)) ?? "";
  };

  useEffect(() => {
    const load = async () => {
      const { data: orderData } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();

      setOrder(orderData);

      const { data: itemData } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", id);

      setItems(itemData || []);
      setLoading(false);
    };

    load();
  }, [id]);

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  if (!order) {
    return (
      <div className="order-detail-page">
        <p>注文が見つかりませんでした。</p>
      </div>
    );
  }

  return (
    <div className="order-detail-page">
      <header className="order-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← 戻る
        </button>
        <h2 className="detail-title">注文詳細</h2>
      </header>

      <div className="order-info">
        <p>
          <strong>注文ID：</strong> {order.id}
        </p>
        <p>
          <strong>日時：</strong>{" "}
          {new Date(order.created_at).toLocaleString()}
        </p>
        <p>
          <strong>合計：</strong> {formatPrice(order.total)}円
        </p>
      </div>

      <h3 className="items-title">購入した商品</h3>

      {items.map((i) => {
        const imgSrc = getImageByProductId(i.product_id);

        return (
          <div key={i.id} className="order-item-box">
            {imgSrc ? (
              <img
                src={imgSrc}
                className="order-item-image"
                alt={i.product_name}
              />
            ) : (
              <div className="order-noimg">画像なし</div>
            )}

            <p>
              <strong>商品名：</strong> {i.product_name}
            </p>
            <p>
              <strong>単価：</strong> {formatPrice(i.price)}円
            </p>
            <p>
              <strong>数量：</strong> {i.quantity}</p>
          </div>
        );
      })}
    </div>
  );
}

export default OrderDetail;