// src/pages/Checkout.tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCart } from "../context/CartContext";
import "./Checkout.css";

function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const cart = useCart();

  const [user, setUser] = useState<any>(null);

  // ★ PayPay / 未選択（セルフ決済は削除）
  const [method, setMethod] = useState<"paypay" | "">("");

  const [isProcessing, setIsProcessing] = useState(false);

  // ★ 店舗用パスワード入力モーダル
  const [showStoreAuth, setShowStoreAuth] = useState(false);
  const [storeCode, setStoreCode] = useState("");

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

  const total = buyNow
    ? (Number(buyNow.product.price) || 0) * buyNow.quantity
    : cart.getTotalPrice();

  // --- ユーザー取得 ---
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
      setUser(user);
    };
    load();
  }, [navigate]);

  // --- 「購入を確定する」ボタン ---
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

  // ★店舗パスワード確認（PayPayのみ）
  const handleStoreAuthConfirm = async () => {
    const correctCode = "20220114";

    if (storeCode !== correctCode) {
      alert("NAGAZON PAY ID が正しくありません。");
      return;
    }

    setShowStoreAuth(false);
    setStoreCode("");

    if (method !== "paypay") {
      alert("支払い方法を選択してください");
      return;
    }

    try {
      setIsProcessing(true);

      // PayPayReturn で使うため保存
      const itemsForStorage = items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        price: Number(item.product.price) || 0,
        quantity: item.quantity,
        stock: Number(item.product.stock ?? 0),
      }));

      sessionStorage.setItem(
        "paypayCheckout",
        JSON.stringify({
          total,
          items: itemsForStorage,
        })
      );

      // 開発中(localhost)でも Vercel 本番URL を叩く
      const apiBase = import.meta.env.DEV
        ? "https://office-nagazon-pay.vercel.app"
        : "";

      const res = await fetch(`${apiBase}/api/create-paypay-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ total }),
      });

      if (!res.ok) {
        console.error("PayPay API error:", res.status, res.statusText);
        throw new Error("PayPay注文作成に失敗しました");
      }

      const data = (await res.json()) as {
        redirectUrl: string;
        merchantPaymentId?: string;
      };

      // merchantPaymentId も保存（PayPayReturnで照合する）
      sessionStorage.setItem(
        "paypayCheckout",
        JSON.stringify({
          total,
          items: itemsForStorage,
          merchantPaymentId: data.merchantPaymentId,
        })
      );

      // PayPay決済ページへ
      window.location.href = data.redirectUrl;
    } catch (e) {
      console.error(e);
      alert("PayPay決済の開始に失敗しました。時間をおいてお試しください。");
      setIsProcessing(false);
    }
  };

  const handleStoreAuthCancel = () => {
    setShowStoreAuth(false);
    setStoreCode("");
  };

  return (
    <div className="checkout-page">
      {/* ヘッダー */}
      <header className="checkout-header">
        <button className="back" onClick={() => navigate(-1)}>
          ←
        </button>
        <h2 className="checkout-title">購入確認</h2>
      </header>

      {/* 購入商品一覧 */}
      <h3 className="section-title">購入商品</h3>
      <div className="checkout-items">
        {items.map((item) => (
          <div className="checkout-item" key={item.id}>
            <img
              src={item.product.imageData ?? "/no-image.png"}
              className="checkout-item-img"
              alt={item.product.name}
            />
            <div className="checkout-item-info">
              <p className="item-name">{item.product.name}</p>
              <p className="item-price-line">
                {formatPrice(item.product.price)}円 × {item.quantity}
              </p>
              <p className="item-subtotal">
                小計：{formatPrice((Number(item.product.price) || 0) * item.quantity)}円
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 支払い方法（固定＋スクロール） ※消さない */}
      <div className="pay-method-fixed">
        <h3 className="section-title pay-method-title">支払い方法</h3>
        <div className="pay-method-scroll">
          {/* ★ PayPayだけ表示 */}
          <div
            className={`pay-card ${method === "paypay" ? "selected" : ""}`}
            onClick={() => setMethod("paypay")}
          >
            <div className="pay-left">
              <span className="pay-title">PayPay</span>
              <span className="pay-desc">PayPayでお支払い</span>
            </div>
            <div className="pay-check-area">
              <div className="pay-check">{method === "paypay" && "✓"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 画面下の合計＋購入ボタン（固定） */}
      <div className="checkout-bottom-fixed">
        <p className="checkout-total">合計：{formatPrice(total)}円</p>
        <button
          className="checkout-btn"
          onClick={handleClickConfirmButton}
          disabled={isProcessing}
        >
          {isProcessing ? "処理中..." : "購入を確定する"}
        </button>
      </div>

      {/* 店舗用：NAGAZON PAY ID 入力モーダル */}
      {showStoreAuth && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>NAGAZON PAY ID</h3>
            <input
              type="password"
              value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)}
              placeholder="IDを入力してください"
              style={{
                width: "100%",
                padding: "8px 10px",
                marginTop: "8px",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                boxSizing: "border-box",
              }}
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