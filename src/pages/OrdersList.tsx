// src/pages/OrdersList.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import "./OrdersList.css";

type OrderRow = {
  id: string;
  user_id?: string | null;
  total?: number | null;
  created_at?: string | null;

  coupon_code?: string | null;
  discount_amount?: number | null;
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

function OrdersList() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [itemsByOrderId, setItemsByOrderId] = useState<Record<string, OrderItemRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const formatPrice = (value: any) => (Number(value) || 0).toLocaleString("ja-JP");

  const toNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const getCouponCode = (o: any): string => {
    const code = o?.coupon_code ?? o?.couponCode ?? "";
    return typeof code === "string" ? code : "";
  };

  const calcSubtotalFromItems = (items: OrderItemRow[]) =>
    items.reduce((sum, i) => sum + toNumber(i.price) * toNumber(i.quantity), 0);

  const getSubtotal = (o: OrderRow, items: OrderItemRow[]) => {
    const s = (o as any)?.subtotal;
    if (s != null && Number.isFinite(Number(s))) return toNumber(s);
    return calcSubtotalFromItems(items);
  };

  const getDiscount = (o: OrderRow, subtotal: number) => {
    const d = (o as any)?.discount_amount ?? (o as any)?.discountAmount;
    if (d != null && Number.isFinite(Number(d))) return Math.max(0, toNumber(d));
    const total = toNumber(o.total);
    return Math.max(0, subtotal - total);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg("");

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

      const { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (ordersErr) {
        setErrorMsg("購入履歴の読み込みに失敗しました。");
        setLoading(false);
        return;
      }

      const safeOrders = (ordersData || []) as OrderRow[];
      setOrders(safeOrders);

      const orderIds = safeOrders.map((o) => o.id).filter(Boolean);
      if (orderIds.length === 0) {
        setItemsByOrderId({});
        setLoading(false);
        return;
      }

      const { data: itemsData, error: itemsErr } = await supabase
        .from("order_items")
        .select("*")
        .in("order_id", orderIds);

      if (itemsErr) {
        setItemsByOrderId({});
        setLoading(false);
        return;
      }

      const grouped: Record<string, OrderItemRow[]> = {};
      (itemsData as OrderItemRow[]).forEach((it) => {
        const oid = it.order_id;
        if (!oid) return;
        if (!grouped[oid]) grouped[oid] = [];
        grouped[oid].push(it);
      });

      setItemsByOrderId(grouped);
      setLoading(false);
    };

    load();
  }, [navigate]);

  const enriched = useMemo(() => {
    return orders.map((o) => {
      const items = itemsByOrderId[o.id] || [];
      const subtotal = getSubtotal(o, items);
      const discount = getDiscount(o, subtotal);
      const couponCode = getCouponCode(o);
      const hasCoupon = !!couponCode || discount > 0;
      return { o, items, subtotal, discount, couponCode, hasCoupon };
    });
  }, [orders, itemsByOrderId]);

  return (
    <div className="orders-page-wrap">
      <SiteHeader />

      <main className="orders-page">
        <header className="orders-header">
          <h2 className="orders-title">購入履歴</h2>
        </header>

        {loading ? (
          <p className="orders-loading">読み込み中...</p>
        ) : errorMsg ? (
          <p className="no-orders">{errorMsg}</p>
        ) : orders.length === 0 ? (
          <p className="no-orders">購入履歴はありません</p>
        ) : (
          <div className="orders-list">
            {enriched.map(({ o, items, subtotal, discount, couponCode, hasCoupon }) => {
              const preview = items.slice(0, 2);
              const remain = Math.max(0, items.length - preview.length);

              return (
                <div
                  key={o.id}
                  className="order-item"
                  onClick={() => navigate(`/orders/${o.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") navigate(`/orders/${o.id}`);
                  }}
                >
                  <div className="order-top">
                    <h3>注文ID：{o.id}</h3>
                    {hasCoupon && <span className="order-badge">クーポン適用</span>}
                  </div>

                  <p className="total">支払合計：{formatPrice(o.total)}円</p>

                  <p>
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
                  </p>

                  {/* クーポン内訳 */}
                  {hasCoupon && (
                    <div className="coupon-box">
                      {couponCode && (
                        <div className="coupon-row">
                          <span>クーポンコード</span>
                          <strong>{couponCode}</strong>
                        </div>
                      )}

                      {/* 明細があるときだけ小計表示（無いと0になりがち） */}
                      {items.length > 0 && (
                        <div className="coupon-row">
                          <span>小計</span>
                          <strong>{formatPrice(subtotal)}円</strong>
                        </div>
                      )}

                      <div className="coupon-row">
                        <span>値引き</span>
                        <span className="discount">-{formatPrice(discount)}円</span>
                      </div>
                    </div>
                  )}

                  {/* 明細プレビュー */}
                  {items.length > 0 && (
                    <div className="items-preview">
                      <div className="items-preview-title">購入商品</div>

                      {preview.map((it) => (
                        <div key={it.id} className="preview-row">
                          <span className="preview-name">{it.product_name || "商品"}</span>
                          <span className="preview-qty">× {toNumber(it.quantity)}</span>
                        </div>
                      ))}

                      {remain > 0 && <div className="preview-more">＋{remain}件</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

export default OrdersList;