// src/pages/PurchaseComplete.tsx
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
  const [paid, setPaid] = useState(false);
  const [msg, setMsg] = useState("購入完了を確認しています…");

  // ★ OCIのPayPay APIベース（Vercel Envの VITE_PAYPAY_API_BASE を使う）
  const PAYPAY_API_BASE = (import.meta as any).env?.VITE_PAYPAY_API_BASE || "";

  useEffect(() => {
    if (!orderId) {
      setChecking(false);
      setMsg("注文IDが見つかりませんでした。");
      return;
    }

    // token無し（= 普通に購入履歴から来た等）は確認せず表示
    if (!token) {
      setChecking(false);
      setPaid(true);
      setMsg("ご購入ありがとうございます！");
      return;
    }

    let stopped = false;

    (async () => {
      try {
        // ✅ 決済確認は「OCIのAPI」に投げる（/api じゃなく）
        const url = `${PAYPAY_API_BASE}/api/confirm-paypay-payment`;

        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, token }),
        });

        const j = await r.json().catch(() => null);

        const isPaid =
          r.ok && (j?.paid === true || j?.status === "paid" || j?.status === "COMPLETED" || j?.paypayStatus === "COMPLETED");

        if (stopped) return;

        if (isPaid) {
          setPaid(true);
          setMsg("ご購入ありがとうございます！");

          // ✅ 購入者へメール（Vercel APIに投げる：秘密鍵を守るため）
          // ※サーバ側で「未送信なら送る」(idempotent)にする
          await fetch("/api/send-buyer-order-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, token }),
          }).catch(() => {});
        } else {
          setPaid(false);
          setMsg("決済がまだ完了していない可能性があります。");
        }
      } catch {
        if (!stopped) {
          setPaid(false);
          setMsg("通信に失敗しました。再読み込みしてください。");
        }
      } finally {
        if (!stopped) setChecking(false);
      }
    })();

    return () => {
      stopped = true;
    };
  }, [orderId, token, PAYPAY_API_BASE]);

  return (
    <div className="complete-page">
      <h2>{msg}</h2>
      <p>注文番号：{orderId || "不明"}</p>

      <div className="complete-box">
        {checking ? (
          <p>確認中…</p>
        ) : paid ? (
          <>
            <p>お支払いが完了しました。</p>
            <p>商品をお取りください。</p>
          </>
        ) : (
          <>
            <p>お支払いが未完了の可能性があります。</p>
            <button onClick={() => window.location.reload()}>再読み込み</button>
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