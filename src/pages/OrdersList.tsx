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
  status?: string | null;

  coupon_code?: string | null;
  discount_amount?: number | null;
  subtotal?: number | null;

  // ✅ ポイント使用（ordersにある想定）
  points_used?: number | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id?: number | null;
  product_name?: string | null;
  price?: number | null;
  quantity?: number | null;

  // ✅ 表示側は変えない：ここにローカル画像URLを入れる
  products?: {
    image_url?: string | null;
  } | null;
};

// ✅ Vite: フォルダ内pngをまとめてURL化（eager）
const LOCAL_PRODUCT_IMAGES = import.meta.glob("../data/商品画像/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const getLocalImageUrlByProductName = (productName?: string | null) => {
  const name = String(productName || "").trim();
  if (!name) return null;

  // 例: "../data/商品画像/抹茶モンブラン.png" の末尾一致で探す
  const key = Object.keys(LOCAL_PRODUCT_IMAGES).find((k) => k.endsWith(`/${name}.png`));
  return key ? LOCAL_PRODUCT_IMAGES[key] : null;
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

  const round0 = (v: any) => Math.max(0, Math.round(toNumber(v)));

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getCouponCode = (o: any): string => {
    const code = o?.coupon_code ?? o?.couponCode ?? "";
    return typeof code === "string" ? code : "";
  };

  const getPointsUsed = (o: any): number => {
    const p = o?.points_used ?? o?.pointsUsed ?? 0;
    return Math.max(0, toNumber(p));
  };

  const calcSubtotalFromItems = (items: OrderItemRow[]) =>
    items.reduce((sum, i) => sum + toNumber(i.price) * toNumber(i.quantity), 0);

  const getSubtotal = (o: OrderRow, items: OrderItemRow[]) => {
    const s = (o as any)?.subtotal;
    if (s != null && Number.isFinite(Number(s))) return toNumber(s);
    return calcSubtotalFromItems(items);
  };

  // ✅ クーポン割引だけ（points_usedを差し引いた上で推定）
  const getCouponDiscount = (o: OrderRow, subtotal: number, pointsUsed: number) => {
    const d = (o as any)?.discount_amount ?? (o as any)?.discountAmount;
    if (d != null && Number.isFinite(Number(d))) return Math.max(0, toNumber(d));

    const total = toNumber(o.total);
    // total = subtotal - coupon - points とみなして coupon を推定
    return Math.max(0, subtotal - pointsUsed - total);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg("");
      setOrders([]);
      setItemsByOrderId({});

      // 1) ログイン中ユーザー
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

      // 2) 注文（paidのみ）
      const { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "paid")
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
        setLoading(false);
        return;
      }

      // 3) order_items（JOINしない：400回避）
      const { data: itemsData, error: itemsErr } = await supabase
        .from("order_items")
        .select("id,order_id,product_id,product_name,price,quantity")
        .in("order_id", orderIds);

      if (itemsErr) {
        console.error("order_items error:", itemsErr);
        setErrorMsg("購入履歴の読み込みに失敗しました。（order_items）");
        setLoading(false);
        return;
      }

      const rawItems = (itemsData || []) as OrderItemRow[];

      // 4) ローカル画像URLを埋め込む（products列は触らない）
      const fixedItems: OrderItemRow[] = rawItems.map((it) => ({
        ...it,
        products: { image_url: getLocalImageUrlByProductName(it.product_name) },
      }));

      // 5) 注文IDごとにまとめる
      const grouped: Record<string, OrderItemRow[]> = {};
      fixedItems.forEach((it) => {
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
      const pointsUsed = getPointsUsed(o);
      const couponDiscount = getCouponDiscount(o, subtotal, pointsUsed);
      const couponCode = getCouponCode(o);

      const hasCoupon = !!couponCode || couponDiscount > 0;
      const hasPoints = pointsUsed > 0;

      const total = Math.max(0, toNumber(o.total) || (subtotal - couponDiscount - pointsUsed));

      return {
        o,
        items,
        subtotal,
        couponDiscount,
        couponCode,
        hasCoupon,
        pointsUsed,
        hasPoints,
        total,
      };
    });
  }, [orders, itemsByOrderId]);

  return (
    <div className="orders-page-wrap">
      <SiteHeader />

      <main className="orders-page">
        <header className="orders-header">
          <button type="button" className="orders-back" onClick={() => navigate(-1)}>
            ← 戻る
          </button>
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
            {enriched.map(
              ({ o, items, subtotal, couponDiscount, couponCode, hasCoupon, pointsUsed, hasPoints, total }) => {
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
                      <h3>日時：{formatDateTime(o.created_at)}</h3>

                      <div style={{ display: "flex", gap: 8 }}>
                        {hasCoupon && <span className="order-badge">クーポン適用</span>}
                        {hasPoints && <span className="order-badge order-badge-points">ポイント使用</span>}
                      </div>
                    </div>

                    <p>注文ID：{o.id}</p>

                    {items.length > 0 && (
                      <div className="items-preview">
                        <div className="items-preview-title">購入商品</div>

                        {preview.map((it) => {
                          const img = it.products?.image_url || null;

                          return (
                            <div key={it.id} className="preview-row">
                              <div className="preview-left">
                                {img ? (
                                  <img className="preview-thumb" src={img} alt="" />
                                ) : (
                                  <div className="preview-thumb preview-thumb-placeholder" />
                                )}
                                <span className="preview-name">{it.product_name || "商品"}</span>
                              </div>

                              <span className="preview-qty">× {round0(it.quantity)}</span>
                            </div>
                          );
                        })}

                        {remain > 0 && <div className="preview-more">＋{remain}件</div>}
                      </div>
                    )}

                    <div className="calc-box">
                      <div className="calc-row">
                        <span>小計</span>
                        <strong>{formatPrice(subtotal)}円</strong>
                      </div>

                      {hasCoupon && (
                        <>
                          {couponCode && (
                            <div className="calc-row">
                              <span>クーポンコード</span>
                              <strong>{couponCode}</strong>
                            </div>
                          )}
                          <div className="calc-row">
                            <span>クーポン値引き</span>
                            <span className="discount">-{formatPrice(couponDiscount)}円</span>
                          </div>
                        </>
                      )}

                      {hasPoints && (
                        <div className="calc-row calc-points">
                          <span>ポイント使用</span>
                          <span className="points-amount">-{formatPrice(pointsUsed)}円</span>
                        </div>
                      )}

                      <div className="calc-total-row">
                        <span>支払合計</span>
                        <span className="calc-total">{formatPrice(total)}円</span>
                      </div>
                    </div>

                    <div className="orders-open">詳細を見る ＞</div>
                  </div>
                );
              }
            )}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

export default OrdersList;