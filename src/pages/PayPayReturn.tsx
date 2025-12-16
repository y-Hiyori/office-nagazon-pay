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
};

function PayPayReturn() {
  const navigate = useNavigate();
  const cart = useCart();

  const [message, setMessage] = useState("決済結果を確認しています…");
  const [showButtons, setShowButtons] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        // ① ログインユーザー確認
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setMessage("ログイン情報が見つかりません。もう一度ログインしてください。");
          setTimeout(() => navigate("/login"), 2500);
          return;
        }

        // ② Checkout で保存しておいたデータを取得
        const raw = sessionStorage.getItem("paypayCheckout");
        if (!raw) {
          setMessage("決済情報が見つかりませんでした。カートに戻ってやり直してください。");
          setShowButtons(true);
          return;
        }

        const data: CheckoutData = JSON.parse(raw);
        if (!data.total || !data.items?.length) {
          setMessage("決済情報の形式が不正です。カートに戻ってやり直してください。");
          setShowButtons(true);
          return;
        }

        const { total, items } = data;

        // merchantPaymentId は sessionStorage から
        const merchantPaymentId = data.merchantPaymentId;

        if (!merchantPaymentId) {
          setMessage("決済IDが取得できませんでした。カートに戻ってやり直してください。");
          setShowButtons(true);
          return;
        }

        // ③ PayPayに「支払い完了した？」を確認（未決済なら注文作らない）
        const apiBase = import.meta.env.DEV
          ? "https://office-nagazon-pay.vercel.app"
          : "";

        const checkRes = await fetch(
          `${apiBase}/api/get-paypay-payment?merchantPaymentId=${encodeURIComponent(
            merchantPaymentId
          )}`,
          { method: "GET" }
        );

        if (!checkRes.ok) {
          setMessage("決済状況の確認に失敗しました。店員にお知らせください。");
          setShowButtons(true);
          return;
        }

        const check = (await checkRes.json()) as { status?: string };
        const status = check.status;

        // ★ 未決済 / キャンセル扱い（注文作成しない・在庫減らさない・メール送らない）
        if (status !== "COMPLETED") {
          // ここで古いデータを消しておく（やり直し時に新しく作り直すため）
          sessionStorage.removeItem("paypayCheckout");
          setMessage("支払いが完了していません（キャンセル / 未決済）。購入は確定していません。");
          setShowButtons(true);
          return;
        }

        // ④ ここから先は「決済完了」の時だけ

        // 4-1) orders 作成
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
          setShowButtons(true);
          return;
        }

        // 4-2) order_items & 在庫更新
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

        // 4-3) 管理者メール通知（決済完了後に送る）
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

        // 4-4) 後片付け
        sessionStorage.removeItem("paypayCheckout");
        cart.clearCart();

        // 完了画面へ
        navigate(`/purchase-complete/${order.id}`);
      } catch (e) {
        console.error(e);
        setMessage("エラーが発生しました。カートに戻ってやり直してください。");
        setShowButtons(true);
      }
    };

    run();
  }, [navigate, cart]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        textAlign: "center",
        fontSize: "16px",
      }}
    >
      <div>{message}</div>

      {showButtons && (
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => navigate("/cart")}
            style={{
              padding: "12px 14px",
              borderRadius: "10px",
              border: "1px solid #ddd",
              background: "#fff",
            }}
          >
            カートに戻る
          </button>
          <button
            onClick={() => navigate("/")}
            style={{
              padding: "12px 14px",
              borderRadius: "10px",
              border: "none",
              background: "#5f85db",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            ホームへ
          </button>
        </div>
      )}
    </div>
  );
}

export default PayPayReturn;