import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function PayPayFailed() {
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || "";
  const reason = q.get("reason") || "UNKNOWN";

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
          決済を確認できませんでした
        </div>

        <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 14 }}>
          お手数ですが店舗へお問い合わせください。
        </div>

        <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 18, wordBreak: "break-all" }}>
          orderId: {orderId || "-"}
          <br />
          reason: {reason}
        </div>

        <button
          onClick={() => navigate("/contact", { replace: true })}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            fontWeight: 800,
          }}
        >
          お問い合わせへ
        </button>
      </div>
    </main>
  );
}