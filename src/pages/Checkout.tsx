// src/pages/Checkout.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCart } from "../context/CartContext";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import "./Checkout.css";

type StoredItem = {
  productId: string | number;
  name: string;
  price: number;
  quantity: number;
  stock: number;
};

function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const cart = useCart();

  const [method, setMethod] = useState<"paypay" | "">("");
  const [isProcessing, setIsProcessing] = useState(false);

  const [showStoreAuth, setShowStoreAuth] = useState(false);
  const [storeCode, setStoreCode] = useState("");

  // クーポン
  const [couponCode, setCouponCode] = useState("");
  const [discountYen, setDiscountYen] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<string>("");

  const formatPrice = (value: number | string) =>
    Number(value || 0).toLocaleString("ja-JP");

  const state = location.state as
    | { buyNow?: { product: any; quantity: number } }
    | undefined;

  const buyNow = state?.buyNow;

  const items = buyNow
    ? [{ id: buyNow.product.id, product: buyNow.product, quantity: buyNow.quantity }]
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
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("ログインしてください");
        navigate("/login");
      }
    })();
  }, [navigate]);

  // クーポン適用
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

    if (data.min_subtotal != null && subtotal < data.min_subtotal) {
      clearCoupon();
      setCouponMsg(`小計${formatPrice(data.min_subtotal)}円以上で使えます。`);
      return;
    }

    if (data.usage_limit != null && (data.used_count ?? 0) >= data.usage_limit) {
      clearCoupon();
      setCouponMsg("このクーポンは上限回数に達しました。");
      return;
    }

    let discount = 0;
    const v = Number(data.discount_value ?? 0);
    if ((data.discount_type ?? "yen") === "percent") {
      discount = Math.floor((subtotal * v) / 100);
    } else {
      discount = v;
    }

    if (data.max_discount_yen != null) {
      discount = Math.min(discount, Number(data.max_discount_yen));
    }
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

  const clearCoupon = () => {
    setCouponCode("");
    setDiscountYen(0);
    setAppliedCoupon(null);
    setCouponMsg("");
  };

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

  const handleStoreAuthCancel = () => {
    setShowStoreAuth(false);
    setStoreCode("");
  };

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

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("ログインしてください");
        navigate("/login");
        return;
      }

      // 購入者名（表示用）
      let buyerName = "(名前未設定)";
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.name) buyerName = profile.name;
      } catch {}

      const itemsForStorage: StoredItem[] = items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        price: Number(item.product.price) || 0,
        quantity: item.quantity,
        stock: Number(item.product.stock ?? 0),
      }));

      // ========= 0円購入（クーポンで全額相殺） =========
      if (payableTotal === 0) {
        const token0yen =
          (globalThis.crypto as any)?.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

            // ★重要：メール送信APIのtoken照合に使う
            paypay_return_token: token0yen,
          })
          .select("id, paypay_return_token")
          .single();

        if (orderErr || !orderRow) {
          console.error(orderErr);
          alert("注文の作成に失敗しました");
          return;
        }

        const orderItemsPayload = itemsForStorage.map((it) => ({
          order_id: orderRow.id,
          product_id: Number(it.productId),
          product_name: it.name, // ★DBに合わせて product_name
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

        // 在庫減算
        for (const it of itemsForStorage) {
          const { error } = await supabase.rpc("decrement_stock", {
            p_product_id: Number(it.productId),
            p_qty: Number(it.quantity),
          });

          if (error) {
            console.error("decrement_stock error:", error);
            if ((error.message ?? "").includes("在庫不足")) {
              alert(`在庫が足りません：${it.name}`);
            } else {
              alert("在庫更新に失敗しました");
            }
            return;
          }
        }

        // ✅ 購入者メール（Vercel APIに統一：テンプレ変数も統一済み前提）
        await fetch("/api/send-buyer-order-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: orderRow.id,
            token: orderRow.paypay_return_token,
          }),
        }).catch(() => {});

        if (!buyNow && typeof (cart as any).clearCart === "function") {
          (cart as any).clearCart();
        }

        alert("購入が完了しました。");
        navigate(`/purchase-complete/${orderRow.id}`, { replace: true });
        return;
      }

      // ========= PayPay購入 =========
      if (method !== "paypay") {
        alert("支払い方法を選択してください");
        return;
      }

      // 保険
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
      const merchantPaymentId: string | null = data.merchantPaymentId ?? null;
      const orderId: string | null = data.orderId ?? null;
      const token: string | null = data.token ?? null;

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
          deeplink: data.deeplink ?? null,
          returnUrl: data.returnUrl ?? null,
        })
      );

      redirecting = true;
      window.location.href = redirectUrl;
    } catch (e) {
      console.error(e);
      alert("決済の開始に失敗しました。時間をおいてお試しください。");
    } finally {
      if (!redirecting) setIsProcessing(false);
    }
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
                        {formatPrice((Number(item.product.price) || 0) * item.quantity)}円
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
    </div>
  );
}

export default Checkout;