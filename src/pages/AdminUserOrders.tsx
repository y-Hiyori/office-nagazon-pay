// src/pages/AdminUserOrders.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

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

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  return (
    <div style={{ padding: 20 }}>
      <button onClick={() => navigate(`/admin-user-detail/${id}`)}>
        ← ユーザー詳細へ戻る
      </button>

      <h2>購入履歴</h2>

      {orders.length === 0 ? (
        <p>購入履歴はありません</p>
      ) : (
        <div>
          {orders.map((o) => (
            <div
              key={o.id}
              onClick={() => navigate(`/orders/${o.id}`)}
              style={{
                border: "1px solid #ccc",
                padding: 12,
                borderRadius: 8,
                marginBottom: 10,
                cursor: "pointer"
              }}
            >
              <p>注文ID：{o.id}</p>
              <p>合計：{o.total}円</p>
              <p>日時：{new Date(o.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminUserOrders;