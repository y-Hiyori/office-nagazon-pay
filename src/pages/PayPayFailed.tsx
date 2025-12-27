import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./PurchaseComplete.css"; // ✅ 同じCSSを流用

export default function PayPayFailed() {
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || "";
  const reason = q.get("reason") || "UNKNOWN";

  return (
    <div className="complete-page">
      <h2>決済を確認できませんでした</h2>
      <p>注文番号：{orderId || "不明"}</p>

      <div className="complete-box">
        <p>お手数ですが店舗へご連絡ください。</p>
        <p style={{ fontSize: 14, opacity: 0.7, wordBreak: "break-all", marginTop: 10 }}>
          reason：{reason}
        </p>
      </div>

      <button className="home-btn" onClick={() => navigate("/contact", { replace: true })}>
        お問い合わせへ
      </button>
    </div>
  );
}