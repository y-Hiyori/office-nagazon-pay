// src/pages/Checkout.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCart } from "../context/CartContext";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import QRCode from "react-qr-code";
import "./Checkout.css";

type StoredItem = {
  productId: string | number;
  name: string;
  price: number;
  quantity: number;
  stock: number;
};

type PayPayInfo = {
  redirectUrl: string;
  deeplink?: string | null;
  merchantPaymentId: string;
  orderId: string;
  token: string;
  returnUrl?: string | null;
};

function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const cart = useCart();

  // 支払い方法
  const [method, setMethod] = useState<"paypay" | "">("");
  const [isProcessing, setIsProcessing] = useState(false);

  // 店舗用パスワード入力モーダル
  const [showStoreAuth, setShowStoreAuth] = useState(false);
  const [storeCode, setStoreCode] = useState("");

  // クーポン
  const [couponCode, setCouponCode] = useState("");
  const [discountYen, setDiscountYen] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<string>("");

  // PayPay QR 表示用（PC）
  const [showPaypayQr, setShowPaypayQr] = useState(false);
  const [paypayInfo, setPaypayInfo] = useState<PayPayInfo | null>(null);
  const [paypayPollingMsg, setPaypayPollingMsg] = useState<string>("");

  const isMobile = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }, []);

  const formatPrice = (value: number | string) =>
    Number(value || 0).toLocaleString("ja-JP");

  const state = location.state as
    | { buyNow?: { product: any; quantity: number } }
    | undefined;

  const buyNow = state?.buyNow;

  const items = buyNow
    ? [
        {
          id: buyNow.product.id,
          product: buyNow.product,
          quantity: buyNow.quantity,
        },
      ]
    : cart.cart;

  const subtotal = buyNow
    ? (Number(buyNow.product.price) || 0) * buyNow.quantity
    : cart.getTotalPrice();

  const payableTotal = useMemo(
    () => Math.max(subtotal - discountYen, 0),
    [subtotal, discountYen]
  );

  // ログインチェック
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("ログインしてください");
        navigate("/login");
        return;
      }
    };
    load();
  }, [navigate]);

  // ✅ PCでQR表示中：支払い完了を自動チェックして /paypay-return へ（安全版）
  useEffect(() => {
    if (!showPaypayQr || !paypayInfo) return;

    let stopped = false;
    const start = Date.now();
    let timer: number | null = null;

    setPaypayPollingMsg("支払い完了を確認中…（最大5分）");

    const tick = async () => {
      if (stopped) return;

      // 5分で打ち切り
      if (Date.now() - start > 5 * 60 * 1000) {
        setPaypayPollingMsg("時間切れです。支払いが完了している場合は再読み込みしてください。");
        return;
      }

      try {
        const r = await fetch("/api/paypay-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchantPaymentId: paypayInfo.merchantPaymentId }),
        });

        // 500とかHTMLが返る場合があるので json しない
        if (!r.ok) {
          timer = window.setTimeout(tick, 2500);
          return;
        }

        const j = await r.json().catch(() => null);

        if (j?.paid === true || j?.status === "COMPLETED") {
          const url = `/paypay-return?orderId=${encodeURIComponent(
            paypayInfo.orderId
          )}&token=${encodeURIComponent(paypayInfo.token)}`;
          window.location.href = url;
          return;
        }
      } catch {
        // 一時的な失敗は無視
      }

      timer = window.setTimeout(tick, 2500);
    };

    tick();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [showPaypayQr, paypayInfo]);

  // ✅ Supabaseクーポン適用（円/％ 両対応：discount_value版）
  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    setCouponMsg("");

    if (!code) {
      clearCoupon();
      setCouponMsg("クーポンコードを入力してください。");
      return;
    }

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("coupons")
      .select(
        "code, discount_type, discount_value, max_discount_yen, min_subtotal, is_active, starts_at, ends_at, usage_limit, used_count"
      )
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("coupon load error:", error);
      clearCoupon();
      setCouponMsg("クーポン確認に失敗しました。");
      return;
    }

    if (!data || !data.is_active) {
      clearCoupon();
      setCouponMsg("このクーポンは使えません。");
      return;
    }

    // 期間
    if (data.starts_at && nowIso < data.starts_at) {
      clearCoupon();
      setCouponMsg("このクーポンはまだ使えません。");
      return;
    }
    if (data.ends_at && nowIso > data.ends_at) {
      clearCoupon();
      setCouponMsg("このクーポンは期限切れです。");
      return;
    }

    // 最低購入金額
    if (data.min_subtotal != null && subtotal < data.min_subtotal) {
      clearCoupon();
      setCouponMsg(`小計${formatPrice(data.min_subtotal)}円以上で使えます。`);
      return;
    }

    // 回数制限
    if (data.usage_limit != null && (data.used_count ?? 0) >= data.usage_limit) {
      clearCoupon();
      setCouponMsg("このクーポンは上限回数に達しました。");
      return;
    }

    // 値引き計算（％ or 円）
    let discount = 0;
    const v = Number(data.discount_value ?? 0);

    if ((data.discount_type ?? "yen") === "percent") {
      discount = Math.floor((subtotal * v) / 100);
    } else {
      discount = v;
    }

    // 上限（任意）
    if (data.max_discount_yen != null) {
      discount = Math.min(discount, Number(data.max_discount_yen));
    }

    // 小計を超えない
    discount = Math.min(discount, subtotal);

    if (discount <= 0) {
      clearCoupon();
      setCouponMsg("このクーポンは使えません。");
      return;
    }

    setDiscountYen(discount);
    setAppliedCoupon(data.code);
    setCouponMsg(`クーポン適用：-${formatPrice(discount)}円`);
  };

  // ✅ 解除（完全クリア）
  const clearCoupon = () => {
    setCouponCode("");
    setDiscountYen(0);
    setAppliedCoupon(null);
    setCouponMsg("");
  };

  // 購入確定ボタン
  const handleClickConfirmButton = () => {
    if (!buyNow && cart.cart.length === 0) {
      alert("カートが空です");
      return;
    }
    if (!method) {
      alert("支払い方法を選択してください");
      return;
    }
    setShowStoreAuth(true);
  };

  // 店舗パスワード確認（PayPayのみ）
  const handleStoreAuthConfirm = async () => {
    const correctCode = "20220114";
    if (storeCode !== correctCode) {
      alert("NAGAZON PAY ID が正しくありません。");
      return;
    }

    setShowStoreAuth(false);
    setStoreCode("");

    if (!method) {
      alert("支払い方法を選択してください");
      return;
    }

    let redirecting = false;

    try {
      setIsProcessing(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("ログインしてください");
        navigate("/login");
        return;
      }

      // 購入者名（任意）
      let buyerName = "(名前未設定)";
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.name) buyerName = profile.name;
      } catch {
        // 無視でOK
      }

      const itemsForStorage: StoredItem[] = items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        price: Number(item.product.price) || 0,
        quantity: item.quantity,
        stock: Number(item.product.stock ?? 0),
      }));

      // ✅ 0円：PayPayに行かずDB保存→在庫減算→メール→完了へ
      if (payableTotal === 0) {
        const { data: orderRow, error: orderErr } = await supabase
          .from("orders")
          .insert({
            user_id: user.id,
            total: 0,
            payment_method: "coupon",
            merchant_payment_id: null,
            paypay_merchant_payment_id: null,
            subtotal,
            discount_amount: discountYen,
            coupon_code: appliedCoupon,
            status: "paid",
            paid_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (orderErr || !orderRow) {
          console.error(orderErr);
          alert("注文の作成に失敗しました");
          return;
        }

        const orderItemsPayload = itemsForStorage.map((it) => ({
          order_id: orderRow.id,
          product_id: Number(it.productId),
          product_name: it.name,
          price: it.price,
          quantity: it.quantity,
        }));

        const { error: itemsErr } = await supabase
          .from("order_items")
          .insert(orderItemsPayload);

        if (itemsErr) {
          console.error(itemsErr);
          alert("注文商品の保存に失敗しました");
          return;
        }

        // ✅ 在庫減算（不足なら止める）: RPC
        for (const it of itemsForStorage) {
          const { error } = await supabase.rpc("decrement_stock", {
            p_product_id: Number(it.productId),
            p_qty: Number(it.quantity),
          });

          if (error) {
            console.error("decrement_stock error:", error);
            if ((error.message ?? "").includes("在庫不足")) {
              alert(`在庫が足りません：${it.name}`);
            } else if ((error.message ?? "").includes("not authenticated")) {
              alert("ログインが必要です");
            } else {
              alert("在庫更新に失敗しました");
            }
            return;
          }
        }

        // ✅ 0円でも購入者メール送信（失敗しても購入は成功）
        try {
          const itemsText = itemsForStorage
            .map(
              (i) =>
                `${i.name} × ${i.quantity}個（単価: ${i.price.toLocaleString(
                  "ja-JP"
                )}円）`
            )
            .join("\n");

          const toEmail = user.email ?? "";
          if (toEmail) {
            await fetch("/api/send-admin-order-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: orderRow.id,
                buyerName,
                itemsText,
                totalText: `0円（クーポン${
                  appliedCoupon ? `:${appliedCoupon}` : ""
                } -${formatPrice(discountYen)}円）`,
                to_email: toEmail,
              }),
            });
          }
        } catch (e) {
          console.error("0円購入の購入者メール送信に失敗:", e);
        }

        if (!buyNow && typeof (cart as any).clearCart === "function") {
          (cart as any).clearCart();
        }

        alert("購入が完了しました。");
        navigate(`/purchase-complete/${orderRow.id}`, { replace: true });
        return;
      }

      // ✅ PayPayへ
      if (method !== "paypay") {
        alert("支払い方法を選択してください");
        return;
      }

      // 先にセッション保存（保険）
      sessionStorage.setItem(
        "paypayCheckout",
        JSON.stringify({
          subtotal,
          discountYen,
          coupon: appliedCoupon,
          total: payableTotal,
          items: itemsForStorage,
        })
      );

      // ✅ items/subtotal/discount/coupon/email/name をサーバへ渡す
      const res = await fetch("/api/create-paypay-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total: payableTotal,
          userId: user.id,
          subtotal,
          discountYen,
          coupon: appliedCoupon,
          buyerEmail: user.email ?? null,
          buyerName,
         items: itemsForStorage.map((it) => ({
  productId: Number(it.productId),
  name: it.name,
  price: it.price,
  quantity: it.quantity,
})),
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("create-paypay-order failed:", res.status, errText);
        throw new Error("PayPay注文作成に失敗しました");
      }

      const data = await res.json();

      const redirectUrl: string | null = data.redirectUrl ?? null;
      const deeplink: string | null = data.deeplink ?? null;
      const merchantPaymentId: string | null = data.merchantPaymentId ?? null;
      const orderId: string | null = data.orderId ?? null;
      const token: string | null = data.token ?? null;
      const returnUrl: string | null = data.returnUrl ?? null;

      if (!redirectUrl || !merchantPaymentId || !orderId || !token) {
        console.error("create-paypay-order response:", data);
        throw new Error("PayPay API response invalid");
      }

      sessionStorage.setItem(
        "paypayCheckout",
        JSON.stringify({
          subtotal,
          discountYen,
          coupon: appliedCoupon,
          total: payableTotal,
          items: itemsForStorage,
          merchantPaymentId,
          redirectUrl,
          orderId,
          token,
          deeplink,
          returnUrl,
        })
      );

      // ✅ スマホなら今まで通り飛ぶ
      if (isMobile) {
        redirecting = true;
        window.location.href = redirectUrl;
        return;
      }

      // ✅ PCならQR表示してスマホで読む
      setPaypayInfo({
        redirectUrl,
        deeplink,
        merchantPaymentId,
        orderId,
        token,
        returnUrl,
      });
      setShowPaypayQr(true);

      // PCは遷移しないので処理中解除
      setIsProcessing(false);
      redirecting = true;
    } catch (e) {
      console.error(e);
      alert("決済の開始に失敗しました。時間をおいてお試しください。");
    } finally {
      if (!redirecting) setIsProcessing(false);
    }
  };

  const handleStoreAuthCancel = () => {
    setShowStoreAuth(false);
    setStoreCode("");
  };

  return (
    <div className="checkout-page-wrap">
      <SiteHeader />

      <main className="checkout-page">
        <div className="checkout-layout">
          <div className="checkout-main">
            <section className="co-section">
              <h3 className="co-section-title">購入商品</h3>
              <div className="co-card">
                {items.map((item) => (
                  <div className="co-item" key={item.id}>
                    <img
                      src={item.product.imageData ?? "/no-image.png"}
                      className="co-item-img"
                      alt={item.product.name}
                    />
                    <div className="co-item-info">
                      <div className="co-item-name">{item.product.name}</div>
                      <div className="co-item-sub">
                        {formatPrice(item.product.price)}円 × {item.quantity}
                      </div>
                    </div>
                    <div className="co-item-right">
                      <div className="co-item-subtotal">
                        {formatPrice(
                          (Number(item.product.price) || 0) * item.quantity
                        )}
                        円
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="co-section">
              <h3 className="co-section-title">クーポンコード</h3>
              <div className="co-card">
                <div className="coupon-row">
                  <input
                    className="coupon-input"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="クーポンコードを入力"
                    autoCapitalize="characters"
                  />
                  <button className="coupon-apply" onClick={applyCoupon}>
                    適用
                  </button>
                </div>

                {(couponMsg || appliedCoupon) && (
                  <div className={`coupon-msg ${appliedCoupon ? "ok" : "ng"}`}>
                    <span>{couponMsg}</span>
                    {appliedCoupon && (
                      <button className="coupon-clear" onClick={clearCoupon}>
                        解除
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="co-section only-mobile">
              <h3 className="co-section-title">支払い方法</h3>
              <div className="co-card">
                <button
                  type="button"
                  className={`pay-card ${method === "paypay" ? "selected" : ""}`}
                  onClick={() => setMethod("paypay")}
                >
                  <div className="pay-left">
                    <div className="pay-title">PayPay</div>
                    <div className="pay-desc">PayPayでお支払い</div>
                  </div>
                  <div className="pay-check-area">
                    <div className="pay-check">{method === "paypay" ? "✓" : ""}</div>
                  </div>
                </button>
              </div>
            </section>

            <section className="co-section only-mobile">
              <h3 className="co-section-title">お支払い明細</h3>
              <div className="co-card">
                <div className="sum-row">
                  <span>小計</span>
                  <span>{formatPrice(subtotal)}円</span>
                </div>
                <div className="sum-row">
                  <span>クーポン</span>
                  <span className={discountYen > 0 ? "sum-discount" : ""}>
                    -{formatPrice(discountYen)}円
                  </span>
                </div>
                <div className="sum-sep" />
                <div className="sum-row sum-total">
                  <span>合計</span>
                  <span>{formatPrice(payableTotal)}円</span>
                </div>
              </div>
            </section>
          </div>

          <aside className="checkout-side">
            <section className="co-section only-desktop">
              <h3 className="co-section-title">支払い方法</h3>
              <div className="co-card">
                <button
                  type="button"
                  className={`pay-card pay-mini ${method === "paypay" ? "selected" : ""}`}
                  onClick={() => setMethod("paypay")}
                >
                  <div className="pay-left">
                    <div className="pay-title">PayPay</div>
                    <div className="pay-desc">PayPayでお支払い</div>
                  </div>
                  <div className="pay-check-area">
                    <div className="pay-check">{method === "paypay" ? "✓" : ""}</div>
                  </div>
                </button>
              </div>
            </section>

            <section className="co-section only-desktop">
              <h3 className="co-section-title">お支払い明細</h3>
              <div className="co-card">
                <div className="sum-row">
                  <span>小計</span>
                  <span>{formatPrice(subtotal)}円</span>
                </div>
                <div className="sum-row">
                  <span>クーポン</span>
                  <span className={discountYen > 0 ? "sum-discount" : ""}>
                    -{formatPrice(discountYen)}円
                  </span>
                </div>
                <div className="sum-sep" />
                <div className="sum-row sum-total">
                  <span>合計</span>
                  <span>{formatPrice(payableTotal)}円</span>
                </div>

                <button
                  className="side-pay-btn"
                  onClick={handleClickConfirmButton}
                  disabled={isProcessing}
                >
                  {isProcessing ? "処理中..." : "購入を確定する"}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </main>

      <div className="checkout-bottom-fixed only-mobile">
        <button
          className="checkout-btn checkout-btn-full"
          onClick={handleClickConfirmButton}
          disabled={isProcessing}
        >
          {isProcessing ? "処理中..." : "購入を確定する"}
        </button>
      </div>

      <SiteFooter />

      {/* 店舗IDモーダル */}
      {showStoreAuth && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>NAGAZON PAY ID</h3>
            <input
              type="password"
              value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)}
              placeholder="IDを入力してください"
              className="store-auth-input"
            />

            <div className="modal-buttons">
              <button className="modal-main-btn" onClick={handleStoreAuthConfirm}>
                次へ進む
              </button>
              <button className="modal-sub-btn" onClick={handleStoreAuthCancel}>
                戻る
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PC用：PayPay QR モーダル */}
      {showPaypayQr && paypayInfo && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>PayPay お支払い</h3>

            <div
              style={{
                background: "#fff",
                padding: 12,
                borderRadius: 12,
                width: "fit-content",
                margin: "0 auto",
              }}
            >
              <QRCode value={paypayInfo.redirectUrl} size={220} />
            </div>

            <p
              style={{
                marginTop: 10,
                fontSize: 13,
                opacity: 0.85,
                textAlign: "center",
              }}
            >
              スマホのPayPayでQRを読み取って支払いしてください
            </p>

            {paypayPollingMsg && (
              <p style={{ marginTop: 8, fontSize: 12, opacity: 0.75, textAlign: "center" }}>
                {paypayPollingMsg}
              </p>
            )}

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <button
                className="modal-main-btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(paypayInfo.redirectUrl);
                    alert("支払いリンクをコピーしました");
                  } catch {
                    alert("コピーできませんでした");
                  }
                }}
              >
                支払いリンクをコピー
              </button>

              <button
                className="modal-sub-btn"
                onClick={() => window.open(paypayInfo.redirectUrl, "_blank")}
              >
                このPCで開く（保険）
              </button>

              <button
                className="modal-sub-btn"
                onClick={() => {
                  setShowPaypayQr(false);
                  setPaypayInfo(null);
                  setPaypayPollingMsg("");
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Checkout;