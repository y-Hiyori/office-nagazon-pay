// src/pages/PurchaseComplete.tsx
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
  const token = q.get("token") || "";

  const [view, setView] = useState<ViewState>("success");
  const [msg, setMsg] = useState("ご購入ありがとうございます！");

  useEffect(() => {
    // orderIdが無いのは失敗扱い
    if (!orderId) {
      setView("failed");
      setMsg("注文IDが見つかりませんでした。");
      return;
    }

    // token無しでも「完了表示」は出す（Safari復帰でログイン消えてもOK）
    if (!token) {
      setView("success");
      setMsg("ご購入ありがとうございます！");
      return;
    }

    // tokenがある＝PayPayReturnで確定してから来る想定
    // 念のためメール送信だけ叩く（失敗しても購入表示は崩さない）
    fetch("/api/send-buyer-order-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, token }),
    }).catch(() => {});

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

          {/* ✅ ここが消えてたので復活 */}
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