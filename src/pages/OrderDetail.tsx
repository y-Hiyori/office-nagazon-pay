// src/pages/OrderDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import "./OrderDetail.css";
import { findProductImage } from "../data/products";

type OrderRow = {
  id: string;
  user_id?: string | null;
  total?: number | null;
  created_at?: string | null;
  subtotal?: number | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id?: number | null;
  product_name?: string | null;
  price?: number | null;
  quantity?: number | null;
};

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const formatPrice = (value: any) => (Number(value) || 0).toLocaleString("ja-JP");

  const toNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const getImageByProductId = (productId: number | null | undefined) => {
    if (productId == null) return "";
    return findProductImage(Number(productId)) ?? "";
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg("");

      // ログイン必須（+ 他人の注文を見れないように user_id でも縛る）
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr) {
        setErrorMsg("ログイン情報の取得に失敗しました。");
        setLoading(false);
        return;
      }

      if (!user) {
        navigate("/login");
        return;
      }

      if (!id) {
        setErrorMsg("注文IDが不正です。");
        setLoading(false);
        return;
      }

      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (orderErr || !orderData) {
        setOrder(null);
        setErrorMsg("注文が見つかりませんでした。");
        setLoading(false);
        return;
      }

      setOrder(orderData as OrderRow);

      const { data: itemData, error: itemErr } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", id)
        .order("id", { ascending: true });

      if (itemErr) {
        setItems([]);
        setLoading(false);
        return;
      }

      setItems((itemData || []) as OrderItemRow[]);
      setLoading(false);
    };

    load();
  }, [id, navigate]);

  // ✅ 割引は「小計 - 支払合計」で計算（割引がある時だけ表示）
  const summary = useMemo(() => {
    const total = toNumber(order?.total);

    const subtotalFromItems = items.reduce(
      (sum, i) => sum + toNumber(i.price) * toNumber(i.quantity),
      0
    );

    const subtotal =
      order && (order as any).subtotal != null && Number.isFinite(Number((order as any).subtotal))
        ? toNumber((order as any).subtotal)
        : subtotalFromItems;

    const discount = Math.max(0, subtotal - total);
    const hasDiscount = discount > 0;

    return { total, subtotal, discount, hasDiscount };
  }, [order, items]);

  return (
    <div className="orders-page-wrap">
      <SiteHeader />

      <main className="orders-page">
        <header className="order-header">
          {/* ✅ AdminOrderDetail と同じ戻るボタン */}
          <button className="order-back" type="button" onClick={() => navigate(-1)}>
            ← 戻る
          </button>

          <h2 className="detail-title">注文詳細</h2>
        </header>

        {loading ? (
          <p className="orders-loading">読み込み中...</p>
        ) : errorMsg || !order ? (
          <p className="no-orders">{errorMsg || "注文が見つかりませんでした。"}</p>
        ) : (
          <>
            <div className="order-info">
              <p>
                <strong>注文ID：</strong> {order.id}
              </p>

              <p>
                <strong>日時：</strong>{" "}
                {order.created_at
                  ? new Date(order.created_at).toLocaleString("ja-JP", {
                      timeZone: "Asia/Tokyo",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "-"}
              </p>

              <p>
                <strong>小計：</strong> {formatPrice(summary.subtotal)}円
              </p>

              {/* ✅ 割引がある時だけ表示 */}
              {summary.hasDiscount && (
                <p>
                  <strong>割引：</strong> -{formatPrice(summary.discount)}円
                </p>
              )}

              <p>
                <strong>支払合計：</strong> {formatPrice(summary.total)}円
              </p>
            </div>

            <h3 className="items-title">購入した商品</h3>

            {items.length === 0 ? (
              <p className="no-orders">購入商品が見つかりませんでした。</p>
            ) : (
              items.map((i) => {
                const imgSrc = getImageByProductId(i.product_id);
                const lineTotal = toNumber(i.price) * toNumber(i.quantity);

                return (
                  <div key={i.id} className="order-item-box">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        className="order-item-image"
                        alt={i.product_name || "商品"}
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
                      <strong>数量：</strong> {toNumber(i.quantity)}
                    </p>
                    <p>
                      <strong>小計：</strong> {formatPrice(lineTotal)}円
                    </p>
                  </div>
                );
              })
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

export default OrderDetail;