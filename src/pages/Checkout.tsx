// src/pages/Checkout.tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCart } from "../context/CartContext";
import "./Checkout.css";
import emailjs from "@emailjs/browser";

function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const cart = useCart();

  const [user, setUser] = useState<any>(null);
  // ★ PayPay / セルフ決済 / 未選択
  const [method, setMethod] = useState<"paypay" | "self" | "">("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPayGuide, setShowPayGuide] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);

  // ★ 店舗用パスワード入力モーダル
  const [showStoreAuth, setShowStoreAuth] = useState(false);
  const [storeCode, setStoreCode] = useState("");

  // 💰 カンマ区切り
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

  // ★管理者にメール通知を送る
  const sendAdminMail = async (orderId: string) => {
    if (!user) return;

    // 商品一覧テキスト
    const itemsText = items
      .map((item) => {
        const name = item.product.name;
        const qty = item.quantity;
        const price = Number(item.product.price) || 0;
        return `${name} × ${qty}個（単価: ${formatPrice(price)}円）`;
      })
      .join("\n");

    // プロフィールから購入者名
    let buyerName = "(名前未設定)";
    try {
      const { data: profile, error: profError } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .single();

      if (!profError && profile?.name) {
        buyerName = profile.name;
      }
    } catch (e) {
      console.error("購入者名の取得に失敗:", e);
    }

    try {
      await emailjs.send(
        import.meta.env.VITE_EMAILJS_SERVICE_ID as string,
        import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string,
        {
          order_id: orderId,
          buyer_name: buyerName,
          items_text: itemsText,
          total_text: `${formatPrice(total)}円`,
        },
        import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string
      );
    } catch (e) {
      console.error("管理者メール送信に失敗:", e);
      // ここは失敗しても購入処理はそのまま進める
    }
  };

  // --- 「購入を確定する」ボタン ---
  const handleClickConfirmButton = () => {
    // カートチェック
    if (!buyNow && cart.cart.length === 0) {
      alert("カートが空です");
      return;
    }

    // ★ 支払い方法が未選択ならエラー
    if (!method) {
      alert("支払い方法を選択してください");
      return;
    }

    // ★ PayPay でも セルフ決済でも、まず NAGAZON PAY ID モーダルを出す
    setShowStoreAuth(true);
  };

  // ★店舗パスワード確認（PayPay / セルフ共通）
  const handleStoreAuthConfirm = async () => {
    const correctCode = "20220114";

    if (storeCode !== correctCode) {
      alert("NAGAZON PAY ID が正しくありません。");
      return;
    }

    setShowStoreAuth(false);
    setStoreCode("");

    // ★ PayPay のときだけ Vercel の API を呼ぶ
    if (method === "paypay") {
      try {
        setIsProcessing(true);

        // Supabase に登録するためのデータを一旦保存しておく
        const itemsForStorage = items.map((item) => ({
          productId: item.product.id,
          name: item.product.name,
          price: Number(item.product.price) || 0,
          quantity: item.quantity,
          stock: Number(item.product.stock ?? 0),
        }));

        // とりあえず保存（後で merchantPaymentId を上書きする）
        sessionStorage.setItem(
          "paypayCheckout",
          JSON.stringify({
            total,
            items: itemsForStorage,
          })
        );

        // 開発中( localhost ) のときも Vercel 本番 URL を叩く
        const apiBase = import.meta.env.DEV
          ? "https://office-nagazon-pay.vercel.app"
          : "";

        const res = await fetch(`${apiBase}/api/create-paypay-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            total,
          }),
        });

        if (!res.ok) {
          console.error("PayPay API error:", res.status, res.statusText);
          throw new Error("PayPay注文作成に失敗しました");
        }

        const data = (await res.json()) as {
          redirectUrl: string;
          deeplink?: string;
          merchantPaymentId?: string;
        };

        // merchantPaymentId も保存しておくと、後で突合しやすい
        sessionStorage.setItem(
          "paypayCheckout",
          JSON.stringify({
            total,
            items: itemsForStorage,
            merchantPaymentId: data.merchantPaymentId,
          })
        );

        // API から返ってきた PayPay の決済ページへリダイレクト
        window.location.href = data.redirectUrl;
      } catch (e) {
        console.error(e);
        alert("PayPay決済の開始に失敗しました。時間をおいてお試しください。");
        setIsProcessing(false);
      }
      return;
    }

    // セルフ決済のときは今まで通り
    if (method === "self") {
      setShowPayGuide(true);
    } else {
      alert("支払い方法を選択してください");
    }
  };

  const handleStoreAuthCancel = () => {
    setShowStoreAuth(false);
    setStoreCode("");
  };

  // --- 最終購入処理（セルフ決済で使う） ---
  const finalizePurchase = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const { data: order, error } = await supabase
        .from("orders")
        .insert({ user_id: user.id, total })
        .select()
        .single();

      if (error || !order) {
        alert("注文作成に失敗しました");
        return;
      }

      for (const item of items) {
        await supabase.from("order_items").insert({
          order_id: order.id,
          product_id: item.product.id,
          product_name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
        });

        // 在庫更新
        await supabase
          .from("products")
          .update({ stock: Number(item.product.stock) - item.quantity })
          .eq("id", item.product.id);
      }

      if (!buyNow) {
        cart.clearCart();
      }

      // 管理者へメール通知
      await sendAdminMail(order.id);

      navigate(`/purchase-complete/${order.id}`);
    } finally {
      setIsProcessing(false);
    }
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
              <p>
                {formatPrice(item.product.price)}円 × {item.quantity}
              </p>
              <p className="item-subtotal">
                小計：
                {formatPrice(
                  (Number(item.product.price) || 0) * item.quantity
                )}
                円
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 支払い方法（固定＋スクロール） */}
      <div className="pay-method-fixed">
        <h3 className="section-title pay-method-title">支払い方法</h3>
        <div className="pay-method-scroll">
          {/* ★ PayPay */}
          <div
            className={`pay-card ${method === "paypay" ? "selected" : ""}`}
            onClick={() => setMethod("paypay")}
          >
            <div className="pay-left">
              <span className="pay-title">PayPay</span>
              <span className="pay-desc">
              </span>
            </div>
            <div className="pay-check-area">
              <div className="pay-check">{method === "paypay" && "✓"}</div>
            </div>
          </div>

          {/* セルフ決済（今まで通りのフロー） */}
          <div
            className={`pay-card ${method === "self" ? "selected" : ""}`}
            onClick={() => setMethod("self")}
          >
            <div className="pay-left">
              <span className="pay-title">PayPayセルフ決済</span>
              <span className="pay-desc">
                店舗のQRコードを読み取り
                <br />
                合計 {formatPrice(total)}円 を入力して支払ってください。
              </span>
            </div>
            <div className="pay-check-area">
              <div className="pay-check">{method === "self" && "✓"}</div>
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
          購入を確定する
        </button>
      </div>

      {/* 店舗用：NAGAZON PAY ID 入力モーダル（全支払い共通） */}
      {showStoreAuth && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>NAGAZON PAY ID </h3>
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
              <button
                className="modal-main-btn"
                onClick={handleStoreAuthConfirm}
              >
                次へ進む
              </button>
              <button
                className="modal-sub-btn"
                onClick={handleStoreAuthCancel}
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      )}

      {/* モーダル①：PayPayセルフ決済の手順 */}
      {showPayGuide && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>PayPayセルフ決済の手順</h3>
            <p>1. 店舗のQRコードを読み取る</p>
            <p>
              2. 金額 <strong>{formatPrice(total)}円</strong> を入力
            </p>
            <p>3. 決済を完了</p>

            <div className="modal-buttons">
              <button
                className="modal-main-btn"
                onClick={() => {
                  setShowPayGuide(false);
                  setShowFinalConfirm(true);
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

      {/* モーダル②：最終確認（セルフ決済） */}
      {showFinalConfirm && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>支払いは完了しましたか？</h3>
            <p>
              金額 <strong>{formatPrice(total)}円</strong> で間違いありませんか？
            </p>

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