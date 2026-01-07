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

// ✅ 予約なし：balance と available だけ
type Wallet = { balance: number; available: number };

function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const cart = useCart();

  const [method, setMethod] = useState<"paypay" | "">("");
  const [isProcessing, setIsProcessing] = useState(false);

  // ✅ 在庫再確認中フラグ
  const [isCheckingStock, setIsCheckingStock] = useState(false);

  const [showStoreAuth, setShowStoreAuth] = useState(false);
  const [storeCode, setStoreCode] = useState("");

  const [couponCode, setCouponCode] = useState("");
  const [discountYen, setDiscountYen] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<string>("");

  // ✅ ポイント（最初から表示）
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [pointsToUse, setPointsToUse] = useState(0);
  const [pointsMsg, setPointsMsg] = useState("");

  const formatPrice = (value: number | string) => Number(value || 0).toLocaleString("ja-JP");

  const state =
    (location.state as { buyNow?: { product: any; quantity: number } } | undefined) ?? undefined;
  const buyNow = state?.buyNow;

  const items = buyNow
    ? [{ id: buyNow.product.id, product: buyNow.product, quantity: buyNow.quantity }]
    : cart.cart;

  const subtotal = buyNow
    ? (Number(buyNow.product.price) || 0) * buyNow.quantity
    : cart.getTotalPrice();

  // ✅ ポイント上限（クーポン後の残額・保有ptの小さい方）
  const pointsMax = useMemo(() => {
    const maxUsable = Math.max(subtotal - discountYen, 0);
    const available = Number(wallet?.available ?? 0);
    return Math.max(Math.min(available, maxUsable), 0);
  }, [wallet?.available, subtotal, discountYen]);

  // ✅ ポイント割引（常に丸め）
  const pointsDiscountYen = useMemo(() => {
    const p = Math.max(Math.floor(pointsToUse || 0), 0);
    return Math.min(p, pointsMax);
  }, [pointsToUse, pointsMax]);

  const payableTotal = useMemo(
    () => Math.max(subtotal - discountYen - pointsDiscountYen, 0),
    [subtotal, discountYen, pointsDiscountYen]
  );

  // ✅ ログインチェック + ポイント取得（予約なしRPC）
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("ログインしてください");
        navigate("/login");
        return;
      }

      const { data: w, error: wErr } = await supabase.rpc("points_get_my_wallet");
      if (wErr) {
        console.error("points_get_my_wallet error:", wErr);
        setWallet({ balance: 0, available: 0 });
        return;
      }

      const row = Array.isArray(w) ? w?.[0] : (w as any);
      const balance = Number(row?.balance ?? 0);
      const available = Number(row?.available ?? balance);
      setWallet({ balance, available });
    })();
  }, [navigate]);

  // ✅ 入力値を上限で強制丸め
  const setPointsClamped = (raw: number) => {
    const v = Math.max(Math.floor(raw || 0), 0);
    const clamped = Math.min(v, pointsMax);
    setPointsToUse(clamped);

    if (clamped <= 0) setPointsMsg("");
    else setPointsMsg(`ポイント適用：-${formatPrice(clamped)}円`);
  };

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
    if ((data.discount_type ?? "yen") === "percent") discount = Math.floor((subtotal * v) / 100);
    else discount = v;

    if (data.max_discount_yen != null) discount = Math.min(discount, Number(data.max_discount_yen));
    discount = Math.min(discount, subtotal);

    if (discount <= 0) {
      clearCoupon();
      setCouponMsg("このクーポンは使えません。");
      return;
    }

    setDiscountYen(discount);
    setAppliedCoupon(data.code);
    setCouponMsg(`クーポン適用：-${formatPrice(discount)}円`);

    setTimeout(() => setPointsClamped(pointsToUse), 0);
  };

  const clearCoupon = () => {
    setCouponCode("");
    setDiscountYen(0);
    setAppliedCoupon(null);
    setCouponMsg("");
  };

  // ✅ 在庫再チェック
  const recheckStockBeforeConfirm = async () => {
    const ids = Array.from(
      new Set(items.map((it: any) => Number(it?.product?.id)).filter((v) => Number.isFinite(v)))
    ) as number[];

    if (ids.length === 0) return { ok: false as const, ngNames: ["（商品不明）"] };

    const { data, error } = await supabase.from("products").select("id,name,stock,is_visible").in("id", ids);
    if (error) {
      console.error("stock recheck error:", error);
      throw error;
    }

    const map = new Map<number, { name: string; stock: number; is_visible: boolean }>();
    (data ?? []).forEach((p: any) => {
      map.set(Number(p.id), {
        name: String(p.name ?? ""),
        stock: Number(p.stock ?? 0),
        is_visible: p.is_visible !== false,
      });
    });

    const ngNames: string[] = [];
    for (const it of items as any[]) {
      const pid = Number(it?.product?.id);
      const row = map.get(pid);

      const name = String(it?.product?.name ?? row?.name ?? "（商品名不明）");
      const qty = Number(it?.quantity ?? 0);

      if (!row || row.is_visible === false || (row.stock ?? 0) < qty) ngNames.push(name);
    }
    return { ok: ngNames.length === 0, ngNames };
  };

  const handleClickConfirmButton = async () => {
    if (isProcessing || isCheckingStock) return;

    if (!buyNow && cart.cart.length === 0) {
      alert("カートが空です");
      return;
    }
    if (!method) {
      alert("支払い方法を選択してください");
      return;
    }

    setIsCheckingStock(true);
    try {
      const result = await recheckStockBeforeConfirm();
      if (!result.ok) {
        alert(
          `商品の確保ができません。\n在庫不足または非表示：\n・${result.ngNames.join("\n・")}\n\nカートをリセットしてホームに戻ります。`
        );
        if (!buyNow && typeof (cart as any).clearCart === "function") (cart as any).clearCart();
        navigate("/", { replace: true });
        return;
      }
      setShowStoreAuth(true);
    } catch (e) {
      console.error(e);
      alert("在庫確認に失敗しました。時間をおいてお試しください。");
    } finally {
      setIsCheckingStock(false);
    }
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

      // 購入者名
      let buyerName = "(名前未設定)";
      try {
        const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
        if (profile?.name) buyerName = profile.name;
      } catch {}

      const buyerEmail = user.email ?? "";

      const itemsForStorage: StoredItem[] = items.map((item: any) => ({
        productId: item.product.id,
        name: item.product.name,
        price: Number(item.product.price) || 0,
        quantity: item.quantity,
        stock: Number(item.product.stock ?? 0),
      }));

      const pointsUsed = Number(pointsDiscountYen || 0);

      // ========= 0円購入（クーポン/ポイントで0円） =========
      if (payableTotal === 0) {
        const token0yen =
          (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        const paymentMethod = pointsUsed > 0 ? "points" : "coupon";

        const { data: orderRow, error: orderErr } = await supabase
          .from("orders")
          .insert({
            user_id: user.id,
            total: 0,
            payment_method: paymentMethod,
            subtotal,
            discount_amount: discountYen,
            coupon_code: appliedCoupon,
            points_used: pointsUsed,
            status: "pending",
            paypay_return_token: token0yen,
            email: buyerEmail || null,
            name: buyerName || null,
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

        const { error: itemsErr } = await supabase.from("order_items").insert(orderItemsPayload);
        if (itemsErr) {
          console.error(itemsErr);
          alert("注文商品の保存に失敗しました");
          return;
        }

        // ✅ 0円購入はここでポイント差し引き
        if (pointsUsed > 0) {
          const { error: useErr } = await supabase.rpc("points_use_for_order", {
            p_order_id: orderRow.id,
            p_points: pointsUsed,
          });
          if (useErr) {
            console.error("points_use_for_order error:", useErr);
            alert("ポイント使用に失敗しました（残高不足など）");
            return;
          }
        }

        // 在庫減算
        for (const it of itemsForStorage) {
          const { error } = await supabase.rpc("decrement_stock", {
            p_product_id: Number(it.productId),
            p_qty: Number(it.quantity),
          });
          if (error) {
            console.error("decrement_stock error:", error);
            alert((error.message ?? "").includes("在庫不足") ? `在庫が足りません：${it.name}` : "在庫更新に失敗しました");
            return;
          }
        }

        await supabase.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", orderRow.id);

        if (buyerEmail) {
          await fetch("/api/send-buyer-order-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: orderRow.id, token: token0yen }),
          }).catch(() => {});
        }

        if (!buyNow && typeof (cart as any).clearCart === "function") (cart as any).clearCart();
        navigate(`/purchase-complete/${orderRow.id}`, { replace: true });
        return;
      }

      // ========= PayPay購入 =========
      if (method !== "paypay") {
        alert("支払い方法を選択してください");
        return;
      }

      // ✅ orderId を先に作って、OCIとフロントで同じIDを使う
      const orderIdForPayPay =
        (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const res = await fetch("/api/create-paypay-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: orderIdForPayPay,
          total: payableTotal,
          userId: user.id,
          subtotal,
          discountYen,
          coupon: appliedCoupon,
          pointsUsed,
          buyerEmail: buyerEmail || null,
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

      // ✅ PayPayへ飛ぶURLはここ（redirectUrlじゃない）
      const paypayUrl: string | null = data?.paypay?.url ?? null;

      if (!paypayUrl) {
        console.error("create-paypay-order response:", data);
        throw new Error("PayPay URL が取得できませんでした");
      }

      redirecting = true;
      window.location.href = paypayUrl;
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
            {/* 購入商品 */}
            <section className="co-section">
              <h3 className="co-section-title">購入商品</h3>
              <div className="co-card">
                {items.map((item: any) => (
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

            {/* クーポン */}
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

            {/* ✅ ポイント */}
            <section className="co-section">
              <h3 className="co-section-title">ポイント</h3>
              <div className="co-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 800 }}>
                    利用可能：{Number(wallet?.available ?? 0).toLocaleString("ja-JP")} pt
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 800 }}>
                    上限：{Number(pointsMax ?? 0).toLocaleString("ja-JP")} pt
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                  <input
                    className="coupon-input"
                    inputMode="numeric"
                    value={String(pointsToUse)}
                    onChange={(e) => {
                      const v = Number(e.target.value.replace(/[^\d]/g, "") || 0);
                      setPointsClamped(v);
                    }}
                    placeholder="使用ポイント"
                  />
                  <button className="coupon-apply" type="button" onClick={() => setPointsClamped(pointsMax)}>
                    最大
                  </button>
                </div>

                {(pointsMsg || pointsDiscountYen > 0) && (
                  <div className="coupon-msg ok" style={{ marginTop: 10 }}>
                    <span>{pointsMsg || `ポイント適用：-${formatPrice(pointsDiscountYen)}円`}</span>
                    <button
                      className="coupon-clear"
                      type="button"
                      onClick={() => {
                        setPointsToUse(0);
                        setPointsMsg("");
                      }}
                    >
                      クリア
                    </button>
                  </div>
                )}

                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
                  ※ 0ならポイント未使用。クーポン適用後の残額まで（1pt=1円）
                </div>
              </div>
            </section>

            {/* 支払い方法（モバイル） */}
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

            {/* 明細（モバイル） */}
            <section className="co-section only-mobile">
              <h3 className="co-section-title">お支払い明細</h3>
              <div className="co-card">
                <div className="sum-row">
                  <span>小計</span>
                  <span>{formatPrice(subtotal)}円</span>
                </div>
                <div className="sum-row">
                  <span>クーポン</span>
                  <span className={discountYen > 0 ? "sum-discount" : ""}>-{formatPrice(discountYen)}円</span>
                </div>
                <div className="sum-row">
                  <span>ポイント</span>
                  <span className={pointsDiscountYen > 0 ? "sum-discount" : ""}>
                    -{formatPrice(pointsDiscountYen)}円
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

          {/* 右側（PC） */}
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
                  <span className={discountYen > 0 ? "sum-discount" : ""}>-{formatPrice(discountYen)}円</span>
                </div>
                <div className="sum-row">
                  <span>ポイント</span>
                  <span className={pointsDiscountYen > 0 ? "sum-discount" : ""}>
                    -{formatPrice(pointsDiscountYen)}円
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
                  disabled={isProcessing || isCheckingStock}
                >
                  {isCheckingStock ? "在庫確認中..." : isProcessing ? "処理中..." : "購入を確定する"}
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
          disabled={isProcessing || isCheckingStock}
        >
          {isCheckingStock ? "在庫確認中..." : isProcessing ? "処理中..." : "購入を確定する"}
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