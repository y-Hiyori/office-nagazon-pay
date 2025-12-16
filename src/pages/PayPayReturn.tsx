// src/pages/PayPayReturn.tsx
import { useEffect, useState } from "react";
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
  redirectUrl?: string; // ★Checkoutで保存したPayPayの支払いURL
};

function PayPayReturn() {
  const navigate = useNavigate();
  const cart = useCart();

  const [message, setMessage] = useState("決済結果を確認しています…");
  const [showActions, setShowActions] = useState(false);
  const [retryUrl, setRetryUrl] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setMessage("ログイン情報が見つかりません。もう一度ログインしてください。");
          setTimeout(() => navigate("/login"), 1500);
          return;
        }

        const raw = sessionStorage.getItem("paypayCheckout");
        if (!raw) {
          setMessage("決済情報が見つかりませんでした。");
          setTimeout(() => navigate("/checkout"), 1500);
          return;
        }

        const data: CheckoutData = JSON.parse(raw);
        if (!data.total || !data.items?.length || !data.merchantPaymentId) {
          setMessage("決済情報が不完全です。");
          setTimeout(() => navigate("/checkout"), 1500);
          return;
        }

        setRetryUrl(data.redirectUrl ?? null);

        // ① PayPayに「支払い完了した？」を確認
        const apiBase = import.meta.env.DEV
          ? "https://office-nagazon-pay.vercel.app"
          : "";

        const statusRes = await fetch(`${apiBase}/api/paypay-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchantPaymentId: data.merchantPaymentId }),
        });

        if (!statusRes.ok) {
          console.error("paypay-status error:", statusRes.status);
          setMessage("決済状況の確認に失敗しました。店員にお知らせください。");
          return;
        }

        const statusJson = (await statusRes.json()) as { status?: string | null };
        const status = statusJson.status ?? null;

        // ★ ここが「決済せずに戻ってきた」対処
        if (status !== "COMPLETED") {
          setMessage("お支払いが完了していません。");
          setShowActions(true);
          return;
        }

        // ② ここから「支払い完了した」時だけ注文処理
        setMessage("お支払いを確認しました。注文を確定しています…");

        const { total, items, merchantPaymentId } = data;

        const { data: order, error: orderErr } = await supabase
          .from("orders")
          .insert({
            user_id: user.id,
            total,
            payment_method: "paypay",
            paypay_merchant_payment_id: merchantPaymentId ?? null,
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

        // ③ 管理者メール通知（完了時のみ）
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
                `${i.name} × ${i.quantity}個（単価: ${i.price.toLocaleString(
                  "ja-JP"
                )}円）`
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

        sessionStorage.removeItem("paypayCheckout");
        cart.clearCart();

        navigate(`/purchase-complete/${order.id}`);
      } catch (e) {
        console.error(e);
        setMessage("エラーが発生しました。店員にお知らせください。");
        setTimeout(() => navigate("/checkout"), 2000);
      }
    };

    run();
  }, [navigate, cart]);

  const handleCancel = () => {
    sessionStorage.removeItem("paypayCheckout");
    navigate("/checkout");
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
        <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 10 }}>
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