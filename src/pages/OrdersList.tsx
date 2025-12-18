// src/pages/OrdersList.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import "./OrdersList.css";

function OrdersList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const formatPrice = (value: any) => (Number(value) || 0).toLocaleString("ja-JP");

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
  }, [navigate]);

  return (
    <div className="orders-page-wrap">
      <SiteHeader />

      <main className="orders-page">
        <header className="orders-header">
          <h2 className="orders-title">購入履歴</h2>
        </header>

        {loading ? (
          <p className="orders-loading">読み込み中...</p>
        ) : orders.length === 0 ? (
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
                <p className="total">合計：{formatPrice(o.total)}円</p>
                <p>
                  日時：
                  {new Date(o.created_at).toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

export default OrdersList;