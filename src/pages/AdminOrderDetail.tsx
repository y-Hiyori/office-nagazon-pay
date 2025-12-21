// src/pages/AdminOrderDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminOrderDetail.css";
import { findProductImage } from "../data/products";

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

export default function AdminOrderDetail() {
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

  const getCouponCode = (o: any): string => {
    const code = o?.coupon_code ?? o?.couponCode ?? "";
    return typeof code === "string" ? code : "";
  };

  const getImageByProductId = (productId: number | null | undefined) => {
    if (productId == null) return "";
    return findProductImage(Number(productId)) ?? "";
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg("");

      // ✅ 管理者ログイン確認（AdminRouteがあっても念のため）
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData.user) {
        navigate("/admin-login");
        return;
      }

      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", authData.user.id)
        .single();

      if (meErr || !me?.is_admin) {
        alert("このページは管理者専用です。");
        navigate("/");
        return;
      }

      if (!id) {
        setErrorMsg("注文IDが不正です。");
        setLoading(false);
        return;
      }

      // ✅ 管理者は user_id 縛りなしで注文を取得
      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
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

  const summary = useMemo(() => {
    const total = toNumber(order?.total);
    const couponCode = getCouponCode(order);

    const subtotalFromItems = items.reduce(
      (sum, i) => sum + toNumber(i.price) * toNumber(i.quantity),
      0
    );

    const subtotal =
      order && (order as any).subtotal != null && Number.isFinite(Number((order as any).subtotal))
        ? toNumber((order as any).subtotal)
        : subtotalFromItems;

    const discountRaw = (order as any)?.discount_amount ?? (order as any)?.discountAmount;
    const discount =
      discountRaw != null && Number.isFinite(Number(discountRaw))
        ? Math.max(0, toNumber(discountRaw))
        : Math.max(0, subtotal - total);

    const hasCoupon = !!couponCode || discount > 0;

    return { total, subtotal, discount, couponCode, hasCoupon };
  }, [order, items]);

  return (
    <>
      <AdminHeader />

      <div className="admin-order-wrap">
        <main className="admin-order-page">
          <header className="admin-order-header">
            <button className="admin-order-back" type="button" onClick={() => navigate(-1)}>
              ← 戻る
            </button>
            <h2 className="admin-order-title">注文詳細（管理者）</h2>
          </header>

          {loading ? (
            <p className="admin-order-state">読み込み中...</p>
          ) : errorMsg || !order ? (
            <p className="admin-order-state">{errorMsg || "注文が見つかりませんでした。"}</p>
          ) : (
            <>
              <div className="admin-order-info">
                <p>
                  <strong>注文ID：</strong> {order.id}
                </p>

                <p>
                  <strong>user_id：</strong> {order.user_id || "-"}
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

                {summary.hasCoupon && (
                  <>
                    {summary.couponCode && (
                      <p>
                        <strong>クーポンコード：</strong> {summary.couponCode}
                      </p>
                    )}
                    <p>
                      <strong>値引き：</strong> -{formatPrice(summary.discount)}円
                    </p>
                  </>
                )}

                <p>
                  <strong>支払合計：</strong> {formatPrice(summary.total)}円
                </p>
              </div>

              <h3 className="admin-items-title">購入した商品</h3>

              {items.length === 0 ? (
                <p className="admin-order-state">購入商品が見つかりませんでした。</p>
              ) : (
                items.map((i) => {
                  const imgSrc = getImageByProductId(i.product_id);
                  const lineTotal = toNumber(i.price) * toNumber(i.quantity);

                  return (
                    <div key={i.id} className="admin-item-box">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          className="admin-item-image"
                          alt={i.product_name || "商品"}
                        />
                      ) : (
                        <div className="admin-noimg">画像なし</div>
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
      </div>
    </>
  );
}