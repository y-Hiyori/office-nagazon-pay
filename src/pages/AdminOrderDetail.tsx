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
  total?: number | null; // 支払合計
  created_at?: string | null;
  subtotal?: number | null; // DBにあるなら使う（無ければ明細から計算）

  // ✅ クーポン
  coupon_code?: string | null;
  discount_amount?: number | null;

  // ✅ ポイント（列名ゆれ吸収用）
  points_used?: number | null;
  points_spent?: number | null;
  used_points?: number | null;
  points_amount?: number | null;

  points_discount_amount?: number | null;
  points_discount?: number | null;
  points_value?: number | null;
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

  const pickNumber = (obj: any, keys: string[]) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v != null && Number.isFinite(Number(v))) return toNumber(v);
    }
    return 0;
  };

  const pickString = (obj: any, keys: string[]) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };

  const getImageByProductId = (productId: number | null | undefined) => {
    if (productId == null) return "";
    return findProductImage(Number(productId)) ?? "";
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg("");

      // ✅ 管理者ログイン確認
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

      // ✅ 注文取得
      // 注意：存在しない列名を select に混ぜると Supabase がエラーになるため、
      // まず * を取得して、後で pickNumber/pickString で吸収する（これが一番安全）
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

      // ✅ 明細取得
      const { data: itemData, error: itemErr } = await supabase
        .from("order_items")
        .select("id,order_id,product_id,product_name,price,quantity")
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

    const subtotalFromItems = items.reduce(
      (sum, i) => sum + toNumber(i.price) * toNumber(i.quantity),
      0
    );

    // ✅ subtotal（DB優先）
    const rawSubtotal = (order as any)?.subtotal;
    const subtotal =
      rawSubtotal != null && Number.isFinite(Number(rawSubtotal))
        ? toNumber(rawSubtotal)
        : subtotalFromItems;

    // ✅ クーポン
    const couponCode = pickString(order, ["coupon_code", "couponCode"]);
    const discountFromDb = pickNumber(order, ["discount_amount", "discountAmount"]);

    // discount_amount が無い運用なら、小計-合計から推定（ポイントと併用時は0になりやすいので後で調整）
    const discountGuess = Math.max(0, subtotal - total);
    const couponDiscount = discountFromDb > 0 ? Math.max(0, discountFromDb) : 0;

    // ✅ ポイント
    const pointsUsed = Math.floor(
      pickNumber(order, ["points_used", "points_spent", "used_points", "points_amount"])
    );

    // ✅ ポイント値引き額（円換算）が別列で持てるなら優先
    const pointsDiscountFromDb = pickNumber(order, [
      "points_discount_amount",
      "points_discount",
      "points_value",
    ]);

    // 1pt=1円 の運用なら pointsUsed を円としてもOK
    const pointsDiscount =
      pointsDiscountFromDb > 0 ? Math.max(0, pointsDiscountFromDb) : Math.max(0, pointsUsed);

    const hasPoints = pointsUsed > 0 || pointsDiscount > 0;

    // ✅ 「クーポンを使った」と見なす条件
    // - コードがある or discount_amountがある
    // （推定はポイント併用だとズレるから、ここでは判断材料にしない）
    const hasCoupon = !!couponCode || couponDiscount > 0;

    // ✅ もし discount_amount が無くて couponCode はあるのに couponDiscount が 0 の場合、
    // 推定値（小計-合計）から「ポイント値引き」を引いて残った分をクーポン値引き扱いにする
    // （二重計算を防ぐため）
    let resolvedCouponDiscount = couponDiscount;
    if (hasCoupon && resolvedCouponDiscount === 0) {
      const rest = Math.max(0, discountGuess - (hasPoints ? pointsDiscount : 0));
      resolvedCouponDiscount = rest;
    }

    const afterCoupon = Math.max(0, subtotal - (hasCoupon ? resolvedCouponDiscount : 0));
    const afterPoints = Math.max(0, afterCoupon - (hasPoints ? pointsDiscount : 0));

    return {
      total,
      subtotal,

      couponCode,
      couponDiscount: resolvedCouponDiscount,
      hasCoupon,

      pointsUsed,
      pointsDiscount,
      hasPoints,

      afterCoupon,
      afterPoints,
    };
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

                {/* ✅ 内訳 */}
<div className="admin-order-breakdown">
  <div className="aob-row">
    <span>小計</span>
    <strong>{formatPrice(summary.subtotal)}円</strong>
  </div>

  {summary.hasCoupon && (
    <>
      {summary.couponCode && (
        <div className="aob-row">
          <span>クーポンコード</span>
          <strong>{summary.couponCode}</strong>
        </div>
      )}

      {summary.couponDiscount > 0 && (
        <div className="aob-row">
          <span>クーポン値引き</span>
          <strong className="aob-minus">
            -{formatPrice(summary.couponDiscount)}円
          </strong>
        </div>
      )}
    </>
  )}

  {summary.hasPoints && (
    <>
      <div className="aob-row">
        <span>ポイント使用</span>
        <strong>{formatPrice(summary.pointsUsed)} pt</strong>
      </div>

      {summary.pointsDiscount > 0 && (
        <div className="aob-row">
          <span>ポイント値引き</span>
          <strong className="aob-minus">
            -{formatPrice(summary.pointsDiscount)}円
          </strong>
        </div>
      )}
    </>
  )}

  <div className="aob-row aob-total">
    <span>支払合計</span>
    <strong>{formatPrice(summary.total)}円</strong>
  </div>
</div>
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
                        <strong>商品名：</strong> {i.product_name || "商品"}
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