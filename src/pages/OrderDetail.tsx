// src/pages/OrderDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import "./OrderDetail.css";
import { findProductImage } from "../data/products";
import Loading from "../components/Loading";
import { appDialog } from "../lib/appDialog";

type OrderRow = {
  id: string;
  user_id?: string | null;
  total?: number | null;
  created_at?: string | null;
  subtotal?: number | null;

  // ✅ 発送ステータス
  fulfillment_type?: string | null;
  shipping_status?: string | null;

  // ✅ キャンセル・返金
  status?: string | null;
  canceled_at?: string | null;
  cancel_reason?: string | null;
  refund_amount?: number | null;
  refund_id?: string | null;
  points_used?: number | null;
  points_earned?: number | null;
};

type CancelRequestRow = {
  id: string;
  order_id: string;
  reason?: string | null;
  status: string;
  admin_note?: string | null;
  created_at?: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id?: number | null;
  product_name?: string | null;
  price?: number | null;
  quantity?: number | null;
  is_sale?: boolean | null;
  original_price?: number | null;
  sale_mode?: string | null;
};

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // ✅ キャンセル申請
  const [cancelReq, setCancelReq] = useState<CancelRequestRow | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [notice, setNotice] = useState("");

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

      // ✅ キャンセル申請（最新1件）
      const { data: reqData } = await supabase
        .from("order_cancel_requests")
        .select("id,order_id,reason,status,admin_note,created_at")
        .eq("order_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setCancelReq((reqData as CancelRequestRow) || null);

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

    const couponCode = String((order as any)?.coupon_code ?? "").trim();
    const rawPoints = Number((order as any)?.points_used ?? 0) || 0;
    const rawCoupon = Number((order as any)?.discount_amount ?? 0) || 0;

    // ✅ ポイント使用額がDBにある場合はそれを優先（無い場合は推定）
    const pointsUsed = Math.max(0, Math.floor(rawPoints));
    const couponDiscount =
      pointsUsed > 0 ? Math.max(0, rawCoupon) : Math.max(0, rawCoupon > 0 ? rawCoupon : discount);

    return {
      total,
      subtotal,
      discount,
      hasDiscount,
      pointsUsed,
      couponDiscount,
      couponCode,
    };
  }, [order, items]);

  // ✅ キャンセル申請を送る
  const submitCancelRequest = async () => {
    if (!order || requestBusy) return;

    const ok = await appDialog.confirm({
      title: "キャンセルを申請",
      message:
        "この注文のキャンセルを申請します。\n" +
        "発送前の注文が対象です。お店が確認して返金します。\nよろしいですか？",
      okText: "申請する",
      cancelText: "やめる",
    });
    if (!ok) return;

    setRequestBusy(true);
    setNotice("");
    try {
      const { data, error } = await supabase.rpc("request_order_cancel", {
        p_order_id: order.id,
        p_reason: requestReason,
      });

      if (error) {
        await appDialog.alert({ message: `申請できませんでした（${error.message}）` });
        return;
      }

      if (!data?.ok) {
        const code = String(data?.error || "");
        const msg =
          code === "ALREADY_SHIPPED"
            ? "発送済みのため、この注文はキャンセル申請できません。"
            : code === "NOT_PAID"
              ? "支払いが完了していないため、キャンセル申請できません。"
              : "キャンセル申請できませんでした。";
        await appDialog.alert({ message: msg });
        return;
      }

      setCancelReq({
        id: String(data.requestId || ""),
        order_id: order.id,
        reason: requestReason,
        status: "requested",
        created_at: new Date().toISOString(),
      });
      setNotice("キャンセルを申請しました。お店からの連絡をお待ちください。");
    } catch (e) {
      console.error(e);
      await appDialog.alert({ message: "申請中にエラーが発生しました。" });
    } finally {
      setRequestBusy(false);
    }
  };

  const statusLower = String(order?.status || "").toLowerCase();
  const isCanceled = statusLower === "canceled";
  const isPaid = statusLower === "paid";
  const isShipped = String(order?.shipping_status || "") === "shipped";
  const pendingRequest = cancelReq?.status === "requested" ? cancelReq : null;
  const canRequest = isPaid && !isShipped && !pendingRequest;

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
          <Loading />
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

              {/* ✅ 割引の内訳（クーポン / ポイント） */}
              {summary.couponDiscount > 0 && (
                <p>
                  <strong>クーポン値引き：</strong> -{formatPrice(summary.couponDiscount)}円
                  {summary.couponCode ? `（${summary.couponCode}）` : ""}
                </p>
              )}

              {summary.pointsUsed > 0 && (
                <p>
                  <strong>ポイント使用：</strong> -{formatPrice(summary.pointsUsed)}円
                </p>
              )}

              {summary.hasDiscount &&
                summary.couponDiscount <= 0 &&
                summary.pointsUsed <= 0 && (
                  <p>
                    <strong>割引：</strong> -{formatPrice(summary.discount)}円
                  </p>
                )}

              <p>
                <strong>支払合計：</strong> {formatPrice(summary.total)}円
              </p>

              {/* ✅ 発送商品の配送状況 */}
              {order?.fulfillment_type === "shipping" && (
                <div
                  className={`order-ship-status ${
                    order.shipping_status === "shipped" ? "is-shipped" : "is-preparing"
                  }`}
                >
                  <span className="order-ship-label">配送状況</span>
                  <span className="order-ship-value">
                    {order.shipping_status === "shipped" ? "発送完了" : "発送準備中"}
                  </span>
                  {order.shipping_status !== "shipped" && (
                    <p className="order-ship-note">商品が発送され次第、メールでお知らせいたします。</p>
                  )}
                </div>
              )}
            </div>

            {notice && <div className="order-notice">{notice}</div>}

            {isCanceled && (
              <div className="order-canceled-box">
                <div className="ocb-head">
                  <strong>この注文はキャンセルされました</strong>
                  <span className="ocb-badge">キャンセル済み</span>
                </div>
                <p>
                  {Number(order.refund_amount || 0) > 0
                    ? `${formatPrice(order.refund_amount)}円がPayPayに返金されました。`
                    : "0円購入のため返金はありません（使用ポイントは返還済みです）。"}
                </p>
                {Number(order.points_used || 0) > 0 && (
                  <p className="ocb-sub">使用した {Number(order.points_used || 0)}pt は返還済みです。</p>
                )}
                {order.cancel_reason && <p className="ocb-sub">理由：{order.cancel_reason}</p>}
              </div>
            )}

            {pendingRequest && (
              <div className="order-request-box is-pending">
                <div className="orb-head">
                  <strong>キャンセル申請中</strong>
                  <span className="orb-badge">お店の確認待ち</span>
                </div>
                <p>お店が内容を確認しています。返金が完了するまでお待ちください。</p>
                {pendingRequest.reason && <p className="orb-sub">申請理由：{pendingRequest.reason}</p>}
              </div>
            )}

            {cancelReq?.status === "rejected" && !isCanceled && (
              <div className="order-request-box is-rejected">
                <div className="orb-head">
                  <strong>キャンセル申請は却下されました</strong>
                  <span className="orb-badge">却下</span>
                </div>
                <p>お店が申請を確認しました。ご不明な点はお問い合わせください。</p>
                {cancelReq.admin_note && <p className="orb-sub">お店からのメモ：{cancelReq.admin_note}</p>}
              </div>
            )}

            {canRequest && (
              <div className="order-request-box">
                <div className="orb-head">
                  <strong>{cancelReq?.status === "rejected" ? "もう一度キャンセルを申請する" : "キャンセルを申請する"}</strong>
                  <span className="orb-badge is-ok">発送前のみ</span>
                </div>
                <p className="orb-desc">
                  発送前の注文はキャンセルを申請できます。お店が確認して、PayPayへ返金します。
                </p>
                <textarea
                  className="orb-textarea"
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="理由（任意）例：注文を間違えた、受け取りが難しくなった"
                  rows={2}
                />
                <button
                  type="button"
                  className="orb-button"
                  onClick={submitCancelRequest}
                  disabled={requestBusy}
                >
                  {requestBusy ? "送信中..." : "キャンセルを申請する"}
                </button>
              </div>
            )}

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
                      {i.is_sale ? (
                        <span style={{ marginLeft: 6, padding: "2px 8px", borderRadius: 999, background: "#059669", color: "#fff", fontSize: 11, fontWeight: 800 }}>
                          セール
                        </span>
                      ) : null}
                      {i.is_sale && i.original_price != null ? (
                        <span style={{ marginLeft: 6, fontSize: 11, color: "#64748b" }}>
                          （通常 {formatPrice(i.original_price)}円 → セール価格）
                        </span>
                      ) : null}
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
