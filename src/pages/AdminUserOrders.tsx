import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminUserOrders.css";

type OrderRow = {
  id: string;
  user_id?: string | null;
  total?: number | null;
  created_at?: string | null;
};

export default function AdminUserOrders() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ 検索
  const [query, setQuery] = useState("");

  const formatPrice = (v: any) => (Number(v) || 0).toLocaleString("ja-JP");

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("orders load error:", error);
        setOrders([]);
        setLoading(false);
        return;
      }

      setOrders((data || []) as OrderRow[]);
      setLoading(false);
    };

    load();
  }, [id]);

  // ✅ 注文IDの部分一致検索
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => (o.id || "").toLowerCase().includes(q));
  }, [orders, query]);

  return (
    <>
      <AdminHeader />

      <div className="admin-orders-wrap">
        <main className="admin-orders-page">
          <header className="admin-orders-head">
            {/* ✅ 戻るボタン */}
            <button
              type="button"
              className="admin-orders-back"
              onClick={() => navigate(-1)}
            >
              ← 戻る
            </button>

            <h2 className="admin-orders-title">購入履歴</h2>
            <p className="admin-orders-sub">user_id: {id}</p>

            {/* ✅ 検索欄 */}
            <div className="admin-orders-search">
              <input
                className="admin-orders-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="注文IDで検索"
                inputMode="search"
                autoComplete="off"
              />
              {query.trim() && (
                <button
                  type="button"
                  className="admin-orders-search-clear"
                  onClick={() => setQuery("")}
                  aria-label="検索をクリア"
                >
                  ×
                </button>
              )}
            </div>

            {/* 件数 */}
            {!loading && (
              <p className="admin-orders-count">
                {query.trim()
                  ? `検索結果：${filtered.length}件`
                  : `全${orders.length}件`}
              </p>
            )}
          </header>

          {loading ? (
            <p className="admin-orders-state">読み込み中...</p>
          ) : filtered.length === 0 ? (
            <p className="admin-orders-state">
              {query.trim() ? "該当する注文がありません" : "購入履歴はありません"}
            </p>
          ) : (
            <div className="admin-orders-list">
              {filtered.map((o) => (
                <div
                  key={o.id}
                  className="admin-orders-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/admin-order-detail/${o.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      navigate(`/admin-order-detail/${o.id}`);
                    }
                  }}
                >
                  <div className="admin-orders-card-top">
                    <div className="admin-orders-id">注文ID：{o.id}</div>
                    <div className="admin-orders-total">
                      {formatPrice(o.total)}円
                    </div>
                  </div>

                  <div className="admin-orders-card-bottom">
                    <div className="admin-orders-date">
                      日時：
                      {o.created_at
                        ? new Date(o.created_at).toLocaleString("ja-JP", {
                            timeZone: "Asia/Tokyo",
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "-"}
                    </div>
                    <div className="admin-orders-open">詳細を見る ＞</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}