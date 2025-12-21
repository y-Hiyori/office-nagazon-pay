// src/pages/PayPayReturn.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCart } from "../context/CartContext";

type StoredItem = {
  productId: string | number;
  name: string;
  price: number;
  quantity: number;
  stock: number; // Checkout時点の表示用（PayPayReturnでは“現在在庫”を取り直す）
};

type CheckoutData = {
  total: number;
  items: StoredItem[];
  merchantPaymentId?: string;
  redirectUrl?: string;
  // もしCheckoutで入れてるなら持っててもOK（無くても動く）
  subtotal?: number;
  discountYen?: number;
  coupon?: string | null;
};

function PayPayReturn() {
  const navigate = useNavigate();
  const cart = useCart();

  const [message, setMessage] = useState("決済結果を確認しています…");
  const [showActions, setShowActions] = useState(false);
  const [retryUrl, setRetryUrl] = useState<string | null>(null);

  // ✅ StrictMode等で useEffect が2回走っても、処理は1回だけにする
  const ranRef = useRef(false);

  // ✅ setTimeout を使うなら必ず掃除
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
        // 0) ログイン確認
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setMessage("ログイン情報が見つかりません。もう一度ログインしてください。");
          setNavTimer(() => navigate("/login", { replace: true }), 1500);
          return;
        }

        // 1) Checkout情報読み込み
        const raw = sessionStorage.getItem("paypayCheckout");
        if (!raw) {
          setMessage("決済情報が見つかりませんでした。");
          setShowActions(true);
          return;
        }

        let dataCheckout: CheckoutData | null = null;
        try {
          dataCheckout = JSON.parse(raw) as CheckoutData;
        } catch (e) {
          console.error("paypayCheckout JSON parse error:", e);
          setMessage("決済情報が壊れています。");
          setShowActions(true);
          return;
        }

        const total = Number(dataCheckout?.total ?? 0);
        const items = dataCheckout?.items ?? [];
        const merchantPaymentId = dataCheckout?.merchantPaymentId;

        if (!merchantPaymentId || !Array.isArray(items) || items.length === 0 || !(total > 0)) {
          setMessage("決済情報が不完全です。");
          setShowActions(true);
          return;
        }

        setRetryUrl(dataCheckout.redirectUrl ?? null);

        // 2) 既に同じ merchantPaymentId の注文が作られていたら二重作成しない
        const { data: existing, error: existErr } = await supabase
          .from("orders")
          .select("id")
          .eq("paypay_merchant_payment_id", merchantPaymentId)
          .limit(1);

        if (existErr) {
          console.error("existing order check error:", existErr);
          setMessage("注文状態の確認に失敗しました。店員にお知らせください。");
          setShowActions(true);
          return;
        }

        if (existing?.[0]?.id) {
          sessionStorage.removeItem("paypayCheckout");
          if (typeof (cart as any).clearCart === "function") (cart as any).clearCart();
          navigate(`/purchase-complete/${existing[0].id}`, { replace: true });
          return;
        }

        // 3) PayPayに「支払い完了した？」を確認（/api/paypay-status）
        const apiBase = import.meta.env.DEV ? "https://office-nagazon-pay.vercel.app" : "";
        const statusRes = await fetch(`${apiBase}/api/paypay-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchantPaymentId }),
        });

        if (!statusRes.ok) {
          console.error("paypay-status error:", statusRes.status, await statusRes.text().catch(() => ""));
          setMessage("決済状況の確認に失敗しました。店員にお知らせください。");
          setShowActions(true);
          return;
        }

        const statusJson = (await statusRes.json()) as { status?: string | null };
        const status = statusJson.status ?? null;

        if (status !== "COMPLETED") {
          setMessage(`お支払いが完了していません。（状態: ${status ?? "不明"}）`);
          setShowActions(true);
          return;
        }

        // 4) 支払い完了 → 注文確定処理
        setMessage("お支払いを確認しました。注文を確定しています…");

        // 4-1) 注文作成
        const { data: order, error: orderErr } = await supabase
          .from("orders")
          .insert({
            user_id: user.id,
            total,
            payment_method: "paypay",
            merchant_payment_id: null,
            paypay_merchant_payment_id: merchantPaymentId,
          })
          .select("id")
          .single();

        if (orderErr || !order) {
          console.error("order insert error:", orderErr);
          setMessage("注文の登録に失敗しました。店員にお知らせください。");
          setShowActions(true);
          return;
        }

        // 4-2) order_items（まとめてinsert）
        const orderItemsPayload = items.map((it) => ({
          order_id: order.id,
          product_id: Number(it.productId),
          product_name: it.name,
          price: Number(it.price) || 0,
          quantity: Number(it.quantity) || 0,
        }));

        const { error: itemsErr } = await supabase.from("order_items").insert(orderItemsPayload);

        if (itemsErr) {
          console.error("order_items insert error:", itemsErr);
          setMessage("注文商品の登録に失敗しました。店員にお知らせください。");
          setShowActions(true);
          return;
        }

        // 4-3) 在庫更新（現在在庫を取り直して不足なら止める）
        for (const it of items) {
          const pid = Number(it.productId);

          const { data: pRow, error: pErr } = await supabase
            .from("products")
            .select("stock, name")
            .eq("id", pid)
            .single();

          if (pErr || !pRow) {
            console.error("stock load error:", pErr);
            setMessage("在庫確認に失敗しました。店員にお知らせください。");
            setShowActions(true);
            return;
          }

          const currentStock = Number(pRow.stock ?? 0);
          const qty = Number(it.quantity) || 0;

          if (qty <= 0) continue;

          if (currentStock < qty) {
            setMessage(`在庫が足りません：${it.name}`);
            setShowActions(true);
            return;
          }

          const nextStock = currentStock - qty;

          const { error: updErr } = await supabase
            .from("products")
            .update({ stock: nextStock })
            .eq("id", pid);

          if (updErr) {
            console.error("stock update error:", updErr);
            setMessage("在庫更新に失敗しました。店員にお知らせください。");
            setShowActions(true);
            return;
          }
        }

        // 5) 購入者メール（完了時のみ）
        try {
          let buyerName = "(名前未設定)";
          const { data: profile } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", user.id)
            .single();
          if (profile?.name) buyerName = profile.name;

          const itemsText = items
            .map(
              (i) =>
                `${i.name} × ${i.quantity}個（単価: ${Number(i.price || 0).toLocaleString("ja-JP")}円）`
            )
            .join("\n");

          const toEmail = user.email ?? "";
          if (toEmail) {
            await fetch(`${apiBase}/api/send-admin-order-email`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: order.id,
                buyerName,
                itemsText,
                totalText: `${Number(total).toLocaleString("ja-JP")}円`,
                to_email: toEmail,
              }),
            });
          } else {
            console.warn("購入者メールが取得できないため、メール送信をスキップしました");
          }
        } catch (e) {
          console.error("購入者メール送信に失敗:", e);
          // メール失敗しても購入は成功扱いで続行
        }

        // 6) 後片付け
        sessionStorage.removeItem("paypayCheckout");
        if (typeof (cart as any).clearCart === "function") (cart as any).clearCart();

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
              opacity: retryUrl ? 1 : 0.6,
              cursor: retryUrl ? "pointer" : "not-allowed",
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