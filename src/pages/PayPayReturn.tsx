// src/pages/PayPayReturn.tsx
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function PayPayReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  const [message, setMessage] = useState("決済結果を確認しています…");
  const [showActions, setShowActions] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const ranRef = useRef(false);

  const openInChrome = () => {
    const url = window.location.href;
    const chromeUrl = url.replace(/^https?:\/\//, "googlechrome://");
    window.location.href = chromeUrl;
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      const q = new URLSearchParams(location.search);
      const oid = q.get("orderId");
      const token = q.get("token");

      setOrderId(oid);

      if (!oid || !token) {
        setMessage("決済確認に必要な情報が見つかりませんでした。");
        setShowActions(true);
        return;
      }

      // ✅ サーバーで PayPay照会→DB確定
      const apiBase = import.meta.env.DEV ? "https://office-nagazon-pay.vercel.app" : "";
      const r = await fetch(`${apiBase}/api/confirm-paypay-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: oid, token }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
  setMessage(`決済が確定できませんでした。（状態: ${j?.status ?? "不明"}）`);
  setShowActions(true);
  return;
}

setMessage("お支払いを確認しました。決済は完了しています。");

// ✅ ログイン関係なく完了ページへ（tokenも渡す）
navigate(`/purchase-complete/${oid}?token=${encodeURIComponent(token)}`, { replace: true });
return;

      // ❗ Safariに飛んで未ログインの場合は、ここで止めて案内する
      setShowActions(true);
    };

    run();
  }, [location.search, navigate]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", gap: 14, alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 16 }}>{message}</div>

      {showActions && (
        <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={openInChrome}
            style={{ padding: 14, borderRadius: 12, border: "none", fontWeight: 700, fontSize: 16 }}
          >
            Chromeで開く（ログイン状態を引き継ぐ）
          </button>

          <button
            onClick={() => navigate("/login", { replace: true })}
            style={{ padding: 12, borderRadius: 12, border: "none", fontWeight: 600, fontSize: 15 }}
          >
            ログインする
          </button>

          <button
            onClick={() => navigate("/")}
            style={{ padding: 12, borderRadius: 12, border: "none", fontWeight: 600, fontSize: 15 }}
          >
            トップへ戻る
          </button>

          {orderId && (
            <div style={{ fontSize: 12, opacity: 0.7 }}>注文ID: {orderId}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default PayPayReturn;