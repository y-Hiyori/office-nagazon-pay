import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./PurchaseComplete.css";

function PurchaseComplete() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || id || "";
  const token = q.get("token") || "";

  const [checking, setChecking] = useState(true);
  const [msg, setMsg] = useState("購入完了を確認しています…");

  useEffect(() => {
    // token が無い（= 普通に /purchase-complete/:id で来た）なら確認せず表示
    if (!token || !orderId) {
      setChecking(false);
      setMsg("ご購入ありがとうございます！");
      return;
    }

    let stopped = false;

    (async () => {
      try {
        const r = await fetch("/api/confirm-paypay-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, token }),
        });

        const j = await r.json().catch(() => null);

        if (!stopped && r.ok && (j?.paid === true || j?.status === "paid" || j?.status === "COMPLETED")) {
          setMsg("ご購入ありがとうございます！");
        } else if (!stopped) {
          setMsg("決済がまだ完了していない可能性があります。");
        }
      } catch {
        if (!stopped) setMsg("通信に失敗しました。再読み込みしてください。");
      } finally {
        if (!stopped) setChecking(false);
      }
    })();

    return () => {
      stopped = true;
    };
  }, [orderId, token]);

  return (
    <div className="complete-page">
      <h2>{msg}</h2>

      <p>注文番号：{orderId || "不明"}</p>

      <div className="complete-box">
        {checking ? (
          <p>確認中…</p>
        ) : (
          <>
            <p>お支払いが完了しました。</p>
            <p>商品をお取りください。</p>
          </>
        )}
      </div>

      <button className="home-btn" onClick={() => navigate("/")}>
        ホームに戻る
      </button>
    </div>
  );
}

export default PurchaseComplete;