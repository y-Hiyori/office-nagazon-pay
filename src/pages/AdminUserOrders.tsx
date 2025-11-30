// src/pages/AdminUserOrders.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminUserOrders.css";

function AdminUserOrders() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false });

      setOrders(data || []);
      setLoading(false);
    };

    load();
  }, [id]);

  if (loading) {
    return (
      <div className="admin-orders-page">
        <div className="admin-orders-card">
          <p className="admin-orders-loading">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-orders-page">
      <div className="admin-orders-card">
        {/* 戻るボタン（テキストは「戻る」だけにしてCSSで←を付ける） */}
        <button
          className="admin-orders-back"
          onClick={() => navigate(`/admin-user-detail/${id}`)}
        >
          戻る
        </button>

        <h2 className="admin-orders-title">購入履歴</h2>

        {orders.length === 0 ? (
          <p className="admin-orders-empty">購入履歴はありません</p>
        ) : (
          <div className="admin-orders-list">
            {orders.map((o) => (
              <div
                key={o.id}
                className="admin-orders-item"
                onClick={() => navigate(`/orders/${o.id}`)}
              >
                <p className="order-id">注文ID：{o.id}</p>
                <p className="order-total">合計：{o.total}円</p>
                <p className="order-date">
                  日時：{new Date(o.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminUserOrders;