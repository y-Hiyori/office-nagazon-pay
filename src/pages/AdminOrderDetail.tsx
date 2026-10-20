// src/pages/AdminOrderDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import { appDialog } from "../lib/appDialog";
import { isUnpaidCanceled } from "../lib/orderCancel";
import "./AdminOrderDetail.css";
import { findProductImage } from "../data/products";
import Loading from "../components/Loading";

type OrderRow = {
  id: string;
  user_id?: string | null;
  name?: string | null;
  email?: string | null;
  total?: number | null; // 支払合計
  created_at?: string | null;
  subtotal?: number | null; // DBにあるなら使う（無ければ明細から計算）

  // ✅ キャンセル・返金
  status?: string | null;
  paid_at?: string | null;
  canceled_at?: string | null;
  cancel_reason?: string | null;
  refund_id?: string | null;
  refund_amount?: number | null;
  refunded_at?: string | null;
  points_earned?: number | null;

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

  // ✅ 発送ステータス（管理者切替用）
  fulfillment_type?: string | null;
  shipping_status?: string | null;
  paypay_return_token?: string | null;
};

type CancelRequestRow = {
  id: string;
  order_id: string;
  reason?: string | null;
  status: "requested" | "approved" | "rejected" | string;
  admin_note?: string | null;
  created_at?: string | null;
  handled_at?: string | null;
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

export default function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [shipBusy, setShipBusy] = useState(false);

  // ✅ キャンセル申請・返金
  const [cancelReq, setCancelReq] = useState<CancelRequestRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [revokePoints, setRevokePoints] = useState(true);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const fmtDateTime = (iso?: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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
        await appDialog.alert({ message: "このページは管理者専用です。" });
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
        .select("id,order_id,product_id,product_name,price,quantity,is_sale,original_price,sale_mode")
        .eq("order_id", id)
        .order("id", { ascending: true });

      if (itemErr) {
        setItems([]);
      } else {
        setItems((itemData || []) as OrderItemRow[]);
      }

      // ✅ キャンセル申請（最新1件）
      const { data: reqData } = await supabase
        .from("order_cancel_requests")
        .select("id,order_id,reason,status,admin_note,created_at,handled_at")
        .eq("order_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setCancelReq((reqData as CancelRequestRow) || null);
      setCancelReason(String((reqData as CancelRequestRow)?.reason || ""));

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

  // ✅ 発送ステータスの切替（発送準備中 ⇔ 発送完了）
  const handleToggleShipping = async () => {
    if (shipBusy || !order) return;
    setShipBusy(true);
    try {
      const nextAction = order.shipping_status === "shipped" ? "preparing" : "shipped";
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || "";
      const token = String((order as any).paypay_return_token || "admin");

      const r = await fetch("/api/update-shipping-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, token, accessToken, action: nextAction }),
      });
      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        await appDialog.alert({ message: `発送ステータスの更新に失敗しました\n(${j?.status || r.status || "ERROR"})` });
        return;
      }

      setOrder({ ...order, shipping_status: j.shippingStatus });

      if (nextAction === "shipped") {
        await appDialog.alert({ message: "発送完了にしました。\n購入者への発送完了メールはお手元からお送りください。" });
      } else {
        await appDialog.alert({ message: "発送準備中に戻しました。" });
      }
    } catch (e) {
      console.error(e);
      await appDialog.alert({ message: "発送ステータスの更新に失敗しました。" });
    } finally {
      setShipBusy(false);
    }
  };

  // ✅ キャンセル（返金）実行
  const handleCancelOrder = async (fromRequest: boolean) => {
    if (!order || cancelBusy) return;

    const hasPayment = Number(order.total || 0) > 0;
    const refundText = hasPayment
      ? `${formatPrice(order.total)}円を全額返金します（返金方法は決済方法に準じます）。`
      : "0円購入のため返金はありません（使用ポイントは戻します）。";

    const pointText =
      revokePoints && Number(order.points_earned || 0) > 0
        ? `\n付与済みの ${Number(order.points_earned || 0)}pt も取り消します。`
        : "\n付与済みポイントは残します。";

    const ok = await appDialog.confirm({
      title: fromRequest ? "キャンセル申請を承認" : "注文をキャンセル",
      message:
        `${refundText}${pointText}\n\n` +
        "在庫・クーポン使用回数も自動で戻します。\nこの操作は取り消せません。よろしいですか？",
      okText: fromRequest ? "承認して返金する" : "キャンセルして返金する",
      cancelText: "やめる",
    });
    if (!ok) return;

    setCancelBusy(true);
    setNotice("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || "";
      if (!accessToken) {
        await appDialog.alert({ message: "ログイン情報を取得できませんでした。再ログインしてください。" });
        return;
      }

      const res = await fetch("/api/admin-cancel-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          accessToken,
          reason: cancelReason,
          revokeEarnedPoints: revokePoints,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        const code = String(json?.status || "");
        const msg =
          code === "ALREADY_SHIPPED"
            ? "発送済みの注文はキャンセルできません。"
            : code === "REFUND_FAILED"
              ? "返金処理に失敗しました。時間をおいて再度お試しください。"
              : code === "REFUND_UNAVAILABLE"
                ? "この決済方法は自動返金に対応していません。"
                : code === "CANCEL_IN_PROGRESS"
                  ? "別の操作でキャンセル処理中です。少し待ってから更新してください。"
                  : code === "DB_APPLY_FAILED"
                    ? "返金は完了しましたが、注文データの更新に失敗しました。もう一度「キャンセル」を実行してください。"
                    : `キャンセルに失敗しました（${code || res.status}）。`;
        await appDialog.alert({ message: msg });
        return;
      }

      setOrder({
        ...order,
        status: "canceled",
        canceled_at: new Date().toISOString(),
        cancel_reason: cancelReason,
        refund_id: json.refundId ?? order.refund_id ?? null,
        refund_amount: Number(json.refundAmount ?? order.refund_amount ?? 0),
        refunded_at: new Date().toISOString(),
      });
      setCancelReq((prev) =>
        prev && prev.status === "requested" ? { ...prev, status: "approved" } : prev
      );

      await appDialog.alert({
        message:
          Number(json.refundAmount || 0) > 0
            ? `${formatPrice(json.refundAmount)}円を返金しました。\n注文をキャンセル済みにしました。`
            : "注文をキャンセルしました。\n使用ポイントは返還しました。",
      });
    } catch (e) {
      console.error(e);
      await appDialog.alert({ message: "キャンセル処理中にエラーが発生しました。" });
    } finally {
      setCancelBusy(false);
    }
  };

  // ✅ キャンセル申請を却下
  const handleRejectRequest = async () => {
    if (!order || cancelBusy) return;

    const ok = await appDialog.confirm({
      title: "キャンセル申請を却下",
      message: "この申請を却下します。お客様の購入履歴には「却下」として残ります。よろしいですか？",
      okText: "却下する",
      cancelText: "やめる",
    });
    if (!ok) return;

    setCancelBusy(true);
    try {
      const { data, error } = await supabase.rpc("reject_order_cancel", {
        p_order_id: order.id,
        p_admin_note: "",
      });
      if (error) {
        await appDialog.alert({ message: `却下できませんでした（${error.message}）` });
        return;
      }
      if (!data?.ok) {
        await appDialog.alert({ message: "却下できませんでした。申請がすでに処理された可能性があります。" });
        return;
      }
      setCancelReq((prev) => (prev ? { ...prev, status: "rejected" } : prev));
      setNotice("キャンセル申請を却下しました。");
    } catch (e) {
      console.error(e);
      await appDialog.alert({ message: "却下処理中にエラーが発生しました。" });
    } finally {
      setCancelBusy(false);
    }
  };

  const statusLower = String(order?.status || "").toLowerCase();
  const isCanceled = statusLower === "canceled";
  const isPaid = statusLower === "paid";
  const isShipped = String(order?.shipping_status || "") === "shipped";
  const isPickup = order?.fulfillment_type !== "shipping";
  const unpaidCanceled = isUnpaidCanceled(order || {});
  const canCancel = isPaid && !isShipped;
  const pendingRequest = cancelReq?.status === "requested" ? cancelReq : null;

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
            <Loading />
          ) : errorMsg || !order ? (
            <p className="admin-order-state">{errorMsg || "注文が見つかりませんでした。"}</p>
          ) : (
            <>
              {notice && <div className="admin-order-notice">{notice}</div>}

              {isCanceled ? (
                <div className={`admin-cancel-status ${unpaidCanceled ? "is-unpaid" : "is-canceled"}`}>
                  <div className="acs-head">
                    <span className="acs-title">{unpaidCanceled ? "未払いで取り消された注文" : "キャンセル済み"}</span>
                    <span className="acs-date">{fmtDateTime(order.canceled_at)}</span>
                  </div>
                  {unpaidCanceled ? (
                    <p>お支払い前に取り消された注文です。支払いは発生しておらず、返金もありません。</p>
                  ) : (
                    <p>
                      {Number(order.refund_amount || 0) > 0
                        ? `${formatPrice(order.refund_amount)}円 を返金しました（返金方法は決済方法に準じます）。`
                        : "0円購入のため返金はありません（ポイントは返還済み）。"}
                    </p>
                  )}
                  {order.cancel_reason && <p>理由：{order.cancel_reason}</p>}
                  {order.refund_id && <p className="acs-sub">返金ID：{order.refund_id}</p>}
                </div>
              ) : pendingRequest ? (
                <div className="admin-cancel-request">
                  <div className="acr-head">
                    <span className="acr-badge">キャンセル申請中</span>
                    <span className="acr-date">{fmtDateTime(pendingRequest.created_at)}</span>
                  </div>
                  <p className="acr-reason">
                    <strong>お客様の理由：</strong>
                    {pendingRequest.reason || "（理由なし）"}
                  </p>
                  <p className="acr-note">
                    内容を確認して、返金するか却下するかを選んでください。
                  </p>
                </div>
              ) : isPaid && isShipped ? (
                <div className="admin-cancel-status is-shipped">
                  <span className="acs-title">発送済み</span>
                  <p>発送済みの注文はキャンセル（自動返金）できません。返品対応は個別に行ってください。</p>
                </div>
              ) : null}

              <div className="admin-order-info">
                <p>
                  <strong>注文ID：</strong> {order.id}
                </p>

                {(order.name || order.email) && (
                  <p>
                    <strong>購入者：</strong> {order.name || "-"}
                    {order.email ? `（${order.email}）` : ""}
                  </p>
                )}

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

              {canCancel && (
                <div className={`admin-cancel-box ${pendingRequest ? "is-request" : ""}`}>
                  <div className="acb-head">
                    <h3>{pendingRequest ? "キャンセル申請への対応" : "この注文をキャンセル"}</h3>
                    {!pendingRequest && (
                      <span className="acb-sub">{isPickup ? "支払済・受取前" : "支払済・発送前"}</span>
                    )}
                  </div>

                  <p className="acb-desc">
                    {Number(order.total || 0) > 0
                      ? `${formatPrice(order.total)}円を全額返金します（返金方法は決済方法に準じます）。`
                      : "0円購入のため返金はありません（使用ポイントは戻します）。"}
                    在庫・ロット・クーポン使用回数も自動で戻します。
                  </p>

                  <label className="acb-label" htmlFor="cancel-reason">
                    キャンセル理由（任意）
                  </label>
                  <textarea
                    id="cancel-reason"
                    className="acb-textarea"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="例：お客様からの連絡、注文間違い など"
                    rows={2}
                  />

                  <label className="acb-check">
                    <input
                      type="checkbox"
                      checked={revokePoints}
                      onChange={(e) => setRevokePoints(e.target.checked)}
                    />
                    <span>
                      購入で付与したポイントも取り消す
                      {Number(order.points_earned || 0) > 0 && (
                        <small>（{Number(order.points_earned || 0)}pt）</small>
                      )}
                    </span>
                  </label>

                  {Number(order.points_used || 0) > 0 && (
                    <p className="acb-points">使用された {Number(order.points_used || 0)}pt はお客様へ返還します。</p>
                  )}

                  <div className="acb-actions">
                    {pendingRequest && (
                      <button
                        type="button"
                        className="acb-reject"
                        onClick={handleRejectRequest}
                        disabled={cancelBusy}
                      >
                        申請を却下
                      </button>
                    )}
                    <button
                      type="button"
                      className="acb-cancel"
                      onClick={() => handleCancelOrder(!!pendingRequest)}
                      disabled={cancelBusy}
                    >
                      {cancelBusy
                        ? "処理中..."
                        : pendingRequest
                          ? "承認して全額返金する"
                          : "キャンセルして全額返金する"}
                    </button>
                  </div>
                </div>
              )}

              {order.fulfillment_type === "shipping" && !isCanceled && (
                <div
                  className={`admin-ship-box ${
                    order.shipping_status === "shipped" ? "is-shipped" : "is-preparing"
                  }`}
                >
                  <div className="admin-ship-head">
                    <span className="admin-ship-label">発送ステータス</span>
                    <span className="admin-ship-badge">
                      {order.shipping_status === "shipped" ? "発送完了" : "発送準備中"}
                    </span>
                  </div>
                  <p className="admin-ship-desc">
                    {order.shipping_status === "shipped"
                      ? "発送は完了しています。購入者への発送完了メールはお手元からお送りください。"
                      : "発送作業が完了したら「発送完了にする」を押してください。購入者への発送完了メールはお手元からお送りください。"}
                  </p>
                  <button
                    type="button"
                    className="admin-ship-btn"
                    onClick={handleToggleShipping}
                    disabled={shipBusy}
                  >
                    {shipBusy
                      ? "更新中..."
                      : order.shipping_status === "shipped"
                        ? "発送準備中に戻す"
                        : "発送完了にする"}
                  </button>
                </div>
              )}

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
      </div>
    </>
  );
}