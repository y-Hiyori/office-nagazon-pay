// src/pages/PayPayReturn.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCart } from "../context/CartContext";
import emailjs from "@emailjs/browser";

type StoredItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  stock: number;
};

type CheckoutData = {
  total: number;
  items: StoredItem[];
  merchantPaymentId?: string;
  redirectUrl?: string;
};

function PayPayReturn() {
  const navigate = useNavigate();
  const cart = useCart();

  const [message, setMessage] = useState("決済結果を確認しています…");
  const [showActions, setShowActions] = useState(false);
  const [retryUrl, setRetryUrl] = useState<string | null>(null);

  // ✅ StrictMode等で useEffect が2回走っても、処理は1回だけにする
  const ranRef = useRef(false);

  // ✅ setTimeout を使うなら必ず掃除（途中で checkout に戻る事故の原因になる）
  const timersRef = useRef<number[]>([]);
  const setNavTimer = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data.user;

        if (!user) {
          setMessage("ログイン情報が見つかりません。もう一度ログインしてください。");
          setNavTimer(() => navigate("/login", { replace: true }), 1500);
          return;
        }

        const raw = sessionStorage.getItem("paypayCheckout");
        if (!raw) {
          // ✅ 勝手に checkout に飛ばさない（戻る事故防止）
          setMessage("決済情報が見つかりませんでした。");
          setShowActions(true);
          return;
        }

        const dataCheckout: CheckoutData = JSON.parse(raw);
        if (
          !dataCheckout.total ||
          !dataCheckout.items?.length ||
          !dataCheckout.merchantPaymentId
        ) {
          setMessage("決済情報が不完全です。");
          setShowActions(true);
          return;
        }

        setRetryUrl(dataCheckout.redirectUrl ?? null);

        const { total, items, merchantPaymentId } = dataCheckout;

        // ✅ 同じ merchantPaymentId の注文が既に作られてたら、二重作成せず完了画面へ
        const { data: existing } = await supabase
          .from("orders")
          .select("id")
          .eq("paypay_merchant_payment_id", merchantPaymentId)
          .limit(1);

        if (existing?.[0]?.id) {
          sessionStorage.removeItem("paypayCheckout");
          cart.clearCart();
          navigate(`/purchase-complete/${existing[0].id}`, { replace: true });
          return;
        }

        // ① PayPayに「支払い完了した？」を確認（あなたの /api/paypay-status ）
        const apiBase = import.meta.env.DEV
          ? "https://office-nagazon-pay.vercel.app"
          : "";

        const statusRes = await fetch(`${apiBase}/api/paypay-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchantPaymentId }),
        });

        if (!statusRes.ok) {
          console.error("paypay-status error:", statusRes.status);
          setMessage("決済状況の確認に失敗しました。店員にお知らせください。");
          return;
        }

        const statusJson = (await statusRes.json()) as { status?: string | null };
        const status = statusJson.status ?? null;

        // ✅ 未完了なら注文を作らず、戻る or 支払いに戻る
        if (status !== "COMPLETED") {
          setMessage("お支払いが完了していません。");
          setShowActions(true);
          return;
        }

        // ② 支払い完了した時だけ注文処理
        setMessage("お支払いを確認しました。注文を確定しています…");

        const { data: order, error: orderErr } = await supabase
          .from("orders")
          .insert({
            user_id: user.id,
            total,
            payment_method: "paypay",
            paypay_merchant_payment_id: merchantPaymentId,
          })
          .select()
          .single();

        if (orderErr || !order) {
          console.error(orderErr);
          setMessage("注文の登録に失敗しました。店員にお知らせください。");
          return;
        }

        for (const item of items) {
          await supabase.from("order_items").insert({
            order_id: order.id,
            product_id: item.productId,
            product_name: item.name,
            price: item.price,
            quantity: item.quantity,
          });

          await supabase
            .from("products")
            .update({ stock: item.stock - item.quantity })
            .eq("id", item.productId);
        }

        // ③ 管理者メール（完了時のみ）
        try {
          let buyerName = "(名前未設定)";
          const { data: profile, error: profError } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", user.id)
            .single();

          if (!profError && profile?.name) buyerName = profile.name;

          const itemsText = items
            .map(
              (i) =>
                `${i.name} × ${i.quantity}個（単価: ${i.price.toLocaleString("ja-JP")}円）`
            )
            .join("\n");

          await emailjs.send(
            import.meta.env.VITE_EMAILJS_SERVICE_ID as string,
            import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string,
            {
              order_id: order.id,
              buyer_name: buyerName,
              items_text: itemsText,
              total_text: `${total.toLocaleString("ja-JP")}円`,
            },
            import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string
          );
        } catch (e) {
          console.error("管理者メール送信に失敗:", e);
        }

        // 後片付け
        sessionStorage.removeItem("paypayCheckout");
        cart.clearCart();

        // ✅ replace で「戻る」で戻りにくくする
        navigate(`/purchase-complete/${order.id}`, { replace: true });
      } catch (e) {
        console.error(e);
        setMessage("エラーが発生しました。店員にお知らせください。");
        setShowActions(true);
      }
    };

    run();

    return () => {
      timersRef.current.forEach((id) => clearTimeout(id));
      timersRef.current = [];
    };
  }, [navigate, cart]);

  const handleCancel = () => {
    sessionStorage.removeItem("paypayCheckout");
    navigate("/checkout", { replace: true });
  };

  const handleRetry = () => {
    if (retryUrl) window.location.href = retryUrl;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "16px" }}>{message}</div>

      {showActions && (
        <div
          style={{
            width: "100%",
            maxWidth: 360,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <button
            onClick={handleRetry}
            disabled={!retryUrl}
            style={{
              padding: "14px",
              borderRadius: "12px",
              border: "none",
              fontWeight: 700,
              fontSize: "16px",
            }}
          >
            支払いに戻る
          </button>

          <button
            onClick={handleCancel}
            style={{
              padding: "12px",
              borderRadius: "12px",
              border: "none",
              fontWeight: 600,
              fontSize: "15px",
            }}
          >
            購入をやめる（戻る）
          </button>
        </div>
      )}
    </div>
  );
}

export default PayPayReturn;