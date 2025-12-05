// src/pages/AdminSalesProductDetail.tsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminSalesProductDetail.css";

type BuyerRow = {
  userId: string;
  userName: string;
  userEmail: string;
  totalQuantity: number;
  totalSubtotal: number;
  orderCount: number;
  lastCreatedAt: string;
};

type LocationState = {
  startIso?: string;
  endIso?: string;
};

function AdminSalesProductDetail() {
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;

  const [buyers, setBuyers] = useState<BuyerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const productName = name ? decodeURIComponent(name) : "";

  const formatDateJST = (iso: string) =>
    new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  useEffect(() => {
    const load = async () => {
      if (!productName) {
        setError("商品名が不明です");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      setBuyers([]);

      try {
        // 1️⃣ まず期間内の注文を取得
        let query = supabase
          .from("orders")
          .select("id, user_id, created_at, total");

        if (state.startIso && state.endIso) {
          query = query
            .gte("created_at", state.startIso)
            .lt("created_at", state.endIso);
        }

        const { data: orders, error: ordersError } = await query;

        if (ordersError) {
          console.error(ordersError);
          setError("注文の取得に失敗しました");
          setLoading(false);
          return;
        }

        if (!orders || orders.length === 0) {
          setBuyers([]);
          setLoading(false);
          return;
        }

        const orderIds = orders.map((o) => o.id);
        const orderMap = new Map(orders.map((o) => [o.id, o] as const));

        // 2️⃣ その注文の中で、この商品だけの order_items を取得
        const { data: items, error: itemsError } = await supabase
          .from("order_items")
          .select("order_id, product_name, quantity, price")
          .in("order_id", orderIds)
          .eq("product_name", productName);

        if (itemsError) {
          console.error(itemsError);
          setError("注文商品の取得に失敗しました");
          setLoading(false);
          return;
        }

        if (!items || items.length === 0) {
          setBuyers([]);
          setLoading(false);
          return;
        }

        // 3️⃣ ユーザー情報取得（profiles）
        const userIds = Array.from(
          new Set(orders.map((o) => o.user_id as string))
        );

        const { data: profiles, error: profError } = await supabase
          .from("profiles")
          .select("id, name, email")
          .in("id", userIds);

        if (profError) {
          console.error(profError);
          setError("ユーザー情報の取得に失敗しました");
          setLoading(false);
          return;
        }

        const profileMap = new Map(
          (profiles || []).map((p) => [p.id, p] as const)
        );

        // 4️⃣ ユーザーごとに集計（同じアカウントをまとめる）
        const map = new Map<string, BuyerRow>();

        for (const it of items) {
          const order = orderMap.get(it.order_id);
          if (!order) continue;

          const userId = order.user_id as string;
          const prof = profileMap.get(userId);

          const qty = Number(it.quantity ?? 0);
          const price = Number(it.price ?? 0);
          const sub = qty * price;
          const createdAt = order.created_at as string;

          if (!map.has(userId)) {
            map.set(userId, {
              userId,
              userName: prof?.name ?? "(名前未設定)",
              userEmail: prof?.email ?? "",
              totalQuantity: 0,
              totalSubtotal: 0,
              orderCount: 0,
              lastCreatedAt: createdAt,
            });
          }

          const row = map.get(userId)!;
          row.totalQuantity += qty;
          row.totalSubtotal += sub;
          row.orderCount += 1;

          // 最も新しい購入日時を保持
          if (
            new Date(createdAt).getTime() >
            new Date(row.lastCreatedAt).getTime()
          ) {
            row.lastCreatedAt = createdAt;
          }
        }

        const aggregated = Array.from(map.values()).sort(
          (a, b) =>
            new Date(b.lastCreatedAt).getTime() -
            new Date(a.lastCreatedAt).getTime()
        );

        setBuyers(aggregated);
      } catch (e) {
        console.error(e);
        setError("予期せぬエラーが発生しました");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [productName, state.startIso, state.endIso]);

  if (!productName) {
    return <p style={{ padding: 20 }}>商品名が不明です。</p>;
  }

  return (
    <div className="admin-sales-product-page">
      <div className="admin-sales-product-card">
        <button
          className="admin-sales-product-back"
          onClick={() => navigate(-1)}
        >
          ← 戻る
        </button>

        <h2 className="admin-sales-product-title">
          「{productName}」購入者
        </h2>

        {state.startIso && state.endIso && (
          <p className="admin-sales-product-range">
            期間：
            <span>
              {formatDateJST(state.startIso)} ～ {formatDateJST(state.endIso)}
            </span>
          </p>
        )}

        {loading ? (
          <p className="admin-sales-product-loading">読み込み中...</p>
        ) : error ? (
          <p className="admin-sales-product-error">{error}</p>
        ) : buyers.length === 0 ? (
          <p className="admin-sales-product-empty">
            この期間にこの商品を購入したユーザーはいません
          </p>
        // src/pages/AdminSalesProductDetail.tsx
// ...（上はそのままでOK）

        ) : (
          <div className="admin-sales-product-list">
            {buyers.map((b) => (
              <div
                key={b.userId}
                className="admin-sales-product-item"
                onClick={() => navigate(`/admin-user-detail/${b.userId}`)} // ★ 追加
              >
                <p>
                  <strong>名前：</strong> <span>{b.userName}</span>
                </p>
                <p>
                  <strong>メール：</strong> <span>{b.userEmail}</span>
                </p>
                <p>
                  <strong>注文回数：</strong>{" "}
                  <span>{b.orderCount.toLocaleString()} 回</span>
                </p>
                <p>
                  <strong>最終購入：</strong>{" "}
                  <span>{formatDateJST(b.lastCreatedAt)}</span>
                </p>
                <p>
                  <strong>数量合計：</strong>{" "}
                  <span>{b.totalQuantity.toLocaleString()} 個</span>
                </p>
                <p>
                  <strong>合計金額：</strong>{" "}
                  <span>{b.totalSubtotal.toLocaleString()} 円</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminSalesProductDetail;