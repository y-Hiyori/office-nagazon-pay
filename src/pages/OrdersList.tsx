import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import "./OrdersList.css";

function OrdersList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 金額フォーマット（3桁区切り）
  const formatPrice = (value: any) =>
    (Number(value) || 0).toLocaleString("ja-JP");

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login");
        return;
      }

      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setOrders(data || []);
      setLoading(false);
    };

    load();
  }, []);

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  return (
    <div className="orders-page">
      <header className="orders-header">
        <button className="back-btn" onClick={() => navigate("/account")}>
          ← 戻る
        </button>
        <h2 className="orders-title">購入履歴</h2>
      </header>

      {orders.length === 0 ? (
        <p className="no-orders">購入履歴はありません</p>
      ) : (
        <div className="orders-list">
          {orders.map((o) => (
            <div
              key={o.id}
              className="order-item"
              onClick={() => navigate(`/orders/${o.id}`)}
            >
              <h3>注文ID：{o.id}</h3>
              <p>合計：{formatPrice(o.total)}円</p>
              <p>日時：{new Date(o.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default OrdersList;