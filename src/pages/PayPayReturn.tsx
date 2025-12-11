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
          setMessage("決済情報が見つかりませんでした。");
          setTimeout(() => navigate("/"), 2500);
          return;
        }

        const data: CheckoutData = JSON.parse(raw);

        if (!data.total || !data.items?.length) {
          setMessage("決済情報の形式が不正です。");
          setTimeout(() => navigate("/"), 2500);
          return;
        }

        const { total, items, merchantPaymentId } = data;

        // ★（本番ならここで PayPay API で支払いステータス確認するとなお良い）

        // ③ Supabase に orders を作成
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

        // ④ order_items 登録 & 在庫更新
        for (const item of items) {
          // order_items
          await supabase.from("order_items").insert({
            order_id: order.id,
            product_id: item.productId,
            product_name: item.name,
            price: item.price,
            quantity: item.quantity,
          });

          // products 在庫
          await supabase
            .from("products")
            .update({
              stock: item.stock - item.quantity,
            })
            .eq("id", item.productId);
        }

        // ⑤ 管理者メール通知（簡易版）
        try {
          // 購入者名
          let buyerName = "(名前未設定)";
          const { data: profile, error: profError } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", user.id)
            .single();

          if (!profError && profile?.name) {
            buyerName = profile.name;
          }

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
          console.error("PayPay注文の管理者メール送信に失敗:", e);
          // メールは失敗しても注文処理は続行
        }

        // ⑥ 一時データやカートを片付けて完了画面へ
        sessionStorage.removeItem("paypayCheckout");
        cart.clearCart();

        navigate(`/purchase-complete/${order.id}`);
      } catch (e) {
        console.error(e);
        setMessage("エラーが発生しました。店員にお知らせください。");
        setTimeout(() => navigate("/"), 3000);
      }
    };

    run();
  }, [navigate, cart]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "16px",
      }}
    >
      {message}
    </div>
  );
}

export default PayPayReturn;