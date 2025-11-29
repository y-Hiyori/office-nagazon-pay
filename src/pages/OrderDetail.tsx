import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./OrderDetail.css";

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, []);

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  return (
    <div className="order-detail-page">

      <header className="order-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← 戻る
        </button>
        <h2 className="detail-title">注文詳細</h2>
      </header>

      <div className="order-info">
        <p><strong>注文ID：</strong> {order.id}</p>
        <p><strong>日時：</strong> {new Date(order.created_at).toLocaleString()}</p>
        <p><strong>合計：</strong> {order.total}円</p>
      </div>

      <h3 className="items-title">購入した商品</h3>

      {items.map((i) => (
        <div key={i.id} className="order-item-box">

          {/* 画像追加（imageData がある場合） */}
          {i.imageData ? (
            <img
              src={i.imageData}
              className="order-item-image"
              alt={i.product_name}
            />
          ) : (
            <div className="order-noimg">画像なし</div>
          )}

          <p><strong>商品名：</strong> {i.product_name}</p>
          <p><strong>単価：</strong> {i.price}円</p>
          <p><strong>数量：</strong> {i.quantity}</p>
        </div>
      ))}
    </div>
  );
}

export default OrderDetail;