import { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./PurchaseComplete.css";

type ViewState = "success" | "failed";

function PurchaseComplete() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || id || "";
  const token = q.get("token") || q.get("merchantPaymentId") || "";

  const [view, setView] = useState<ViewState>("success");
  const [msg, setMsg] = useState("ご購入ありがとうございます！");

  useEffect(() => {
    if (!orderId) {
      setView("failed");
      setMsg("注文IDが見つかりませんでした。");
      return;
    }

    // token/merchantPaymentId が取れた時だけメール送信（失敗しても画面は崩さない）
    if (token) {
      fetch("/api/send-buyer-order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, token }),
      }).catch(() => {});
    }

    setView("success");
    setMsg("ご購入ありがとうございます！");
  }, [orderId, token]);

  return (
    <div className="complete-page">
      <h2>{msg}</h2>
      <p>注文番号：{orderId || "不明"}</p>

      {view === "success" && (
        <>
          <div className="complete-box">
            <p>お支払いが完了しました。</p>
            <p>商品をお取りください。</p>
          </div>

          <button className="home-btn" onClick={() => navigate("/", { replace: true })}>
            トップへ戻る
          </button>
        </>
      )}

      {view === "failed" && (
        <>
          <div className="complete-box">
            <p>決済の確認ができませんでした。</p>
            <p>お手数ですがスタッフへご連絡ください。</p>
          </div>

          <button className="home-btn" onClick={() => navigate("/contact", { replace: true })}>
            お問い合わせへ
          </button>
        </>
      )}
    </div>
  );
}

export default PurchaseComplete;