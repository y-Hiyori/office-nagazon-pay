// src/pages/Checkout.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCart } from "../context/CartContext";
import "./Checkout.css";

function Checkout() {
  const navigate = useNavigate();
  const cart = useCart();

  const [user, setUser] = useState<any>(null);
  const [method, setMethod] = useState<"paypay" | "self" | "">("");
  const [isProcessing, setIsProcessing] = useState(false);      // 実際の購入処理中
  const [showPayGuide, setShowPayGuide] = useState(false);      // 「QR読んでね」画面
  const [showFinalConfirm, setShowFinalConfirm] = useState(false); // 「本当に払った？」画面

  const total = cart.getTotalPrice();

  // 🔥 ユーザー取得
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("ログインしてください");
        navigate("/login");
        return;
      }
      setUser(user);
    };
    load();
  }, [navigate]);

  // ① 「購入を確定する」ボタンを押したときの処理（まだDBは触らない）
  const handleClickConfirmButton = () => {
    if (!method) {
      alert("支払い方法を選択してください");
      return;
    }

    if (cart.cart.length === 0) {
      alert("カートが空です");
      return;
    }

    if (method === "paypay") {
      alert("PayPay決済は現在準備中です");
      return;
    }

    // method === "self" → PayPayセルフ決済
    setShowPayGuide(true); // まず「QRコード読んでね」モーダルを表示
  };

  // ③ 本当に購入を確定するときの処理（ここで初めて Supabase に保存）
  const finalizePurchase = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      // orders を作成
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          total: total,
        })
        .select()
        .single();

      if (error || !order) {
        console.error(error);
        alert("注文作成に失敗しました");
        setIsProcessing(false);
        return;
      }

      // order_items を追加 & 在庫を減らす
      for (const item of cart.cart) {
        await supabase.from("order_items").insert({
  order_id: order.id,
  product_name: item.product.name,
  price: item.product.price,
  quantity: item.quantity,
  imageData: item.product.imageData ?? null   // ← 追加！
});

        await supabase
          .from("products")
          .update({
            stock: Number(item.product.stock) - item.quantity,
          })
          .eq("id", item.product.id);
      }

      cart.clearCart();
      setShowFinalConfirm(false); // モーダル閉じる

      // 完了画面へ
      navigate(`/purchase-complete/${order.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="checkout-page">
      <header className="checkout-header">
        <button className="back" onClick={() => navigate(-1)}>←</button>
        <h2 className="checkout-title">購入確認</h2>
      </header>

      {/* 商品一覧 */}
      <h3 className="section-title">購入商品</h3>
      <div className="checkout-items">
        {cart.cart.map((item) => (
          <div className="checkout-item" key={item.id}>
            <img
              src={item.product.imageData ?? "/no-image.png"}
              className="checkout-item-img"
              alt={item.product.name}
            />
            <div className="checkout-item-info">
              <p className="item-name">{item.product.name}</p>
              <p>{item.product.price}円 × {item.quantity}</p>
              <p className="item-subtotal">
                小計：{item.product.price * item.quantity}円
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="checkout-total">合計：{total}円</p>

      {/* 支払い方法 */}
      <h3 className="section-title">支払い方法</h3>

      {/* PayPay（通常決済・まだ準備中） */}
      <div className="pay-card disabled">
        <div className="pay-left">
          <span className="pay-title">PayPay</span>
          <span className="pay-desc">今後搭載予定</span>
        </div>
        <div className="pay-check-area">
          <div className="pay-check"></div>
        </div>
      </div>

      {/* PayPayセルフ決済（今回使うほう） */}
      <div
        className={`pay-card ${method === "self" ? "selected" : ""}`}
        onClick={() => setMethod("self")}
      >
        <div className="pay-left">
          <span className="pay-title">PayPayセルフ決済</span>
          <span className="pay-desc">
  購入確定ボタンを押したあと、<br />
  PayPayのQRコードを読み取り<br />
  合計金額（{total}円）を入力し支払いを完了させてください。
</span>
        </div>
        <div className="pay-check-area">
          <div className="pay-check">{method === "self" && "✓"}</div>
        </div>
      </div>

      <button
        className="checkout-btn"
        onClick={handleClickConfirmButton}
        disabled={isProcessing}
      >
        購入を確定する
      </button>

      {/* ② PayPayセルフ決済の手順モーダル */}
      {showPayGuide && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>PayPayセルフ決済の手順</h3>
            <p>1. 店舗に掲示されている PayPay のQRコードを読み取ってください。</p>
            <p>2. この画面の合計金額 <strong>{total}円</strong> を入力してください。</p>
            <p>3. PayPay上で支払いを完了させてください。</p>

            <div className="modal-buttons">
              <button
                className="modal-main-btn"
                onClick={() => {
                  setShowPayGuide(false);
                  setShowFinalConfirm(true); // 次の確認へ
                }}
              >
                完了しました
              </button>
              <button
                className="modal-sub-btn"
                onClick={() => setShowPayGuide(false)}
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ③ 本当に支払いした？確認モーダル */}
      {showFinalConfirm && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>支払いは完了しましたか？</h3>
            <p>本当に PayPay での支払いを完了させましたか？</p>
            <p>合計金額 <strong>{total}円</strong> に間違いはありませんか？</p>

            <div className="modal-buttons">
              <button
                className="modal-main-btn"
                onClick={finalizePurchase}
                disabled={isProcessing}
              >
                {isProcessing ? "処理中..." : "はい、完了しました"}
              </button>
              <button
                className="modal-sub-btn"
                onClick={() => setShowFinalConfirm(false)}
                disabled={isProcessing}
              >
                いいえ、戻る
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Checkout;