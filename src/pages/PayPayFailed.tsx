import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./PurchaseComplete.css"; // ✅ 同じCSSを流用

export default function PayPayFailed() {
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || "";
  const reason = q.get("reason") || "UNKNOWN";

  const goContact = () => {
    const subject = "PayPay決済の確認に失敗しました";
    const detail = `PayPay決済の確認に失敗しました。

【注文ID】
${orderId || "不明"}

【理由】
${reason}

【状況】
・PayPay画面から戻ったあと、決済完了画面が出ない / 決済確認に失敗した

対応をお願いします。`;

    const params = new URLSearchParams();
    if (orderId) params.set("orderId", orderId);
    params.set("reason", reason);
    params.set("subject", subject);
    params.set("detail", detail);

    navigate(`/contact?${params.toString()}`, { replace: true });
  };

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

      <button className="home-btn" onClick={goContact}>
        お問い合わせへ
      </button>
    </div>
  );
}