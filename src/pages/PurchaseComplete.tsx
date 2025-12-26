// src/pages/PurchaseComplete.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./PurchaseComplete.css";

const INTERVAL_MS = 3000;       // 3秒おき
const MAX_WAIT_MS = 5 * 60_000; // 最大5分

function PurchaseComplete() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || id || "";
  const token = q.get("token") || "";

  const [checking, setChecking] = useState(true);
  const [paid, setPaid] = useState(false);
  const [msg, setMsg] = useState("PayPayの支払い完了を待っています…（最大5分）");
  const [detail, setDetail] = useState<string>("");

  const PAYPAY_API_BASE = (import.meta as any).env?.VITE_PAYPAY_API_BASE || "";

  // ✅ 二重実行防止（React StrictMode対策にも効く）
  const startedRef = useRef(false);
  const mailSentRef = useRef(false);

  const confirmOnce = async () => {
    const url = `${PAYPAY_API_BASE}/api/confirm-paypay-payment`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, token }),
    });

    const j = await r.json().catch(() => null);

    const isPaid =
      r.ok &&
      (j?.paid === true ||
        j?.status === "paid" ||
        j?.status === "COMPLETED" ||
        j?.paypayStatus === "COMPLETED");

    return { isPaid, res: j, ok: r.ok };
  };

  const sendBuyerEmailOnce = async () => {
    if (mailSentRef.current) return;
    mailSentRef.current = true;

    await fetch("/api/send-buyer-order-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, token }),
    }).catch(() => {});
  };

  useEffect(() => {
    if (!orderId) {
      setChecking(false);
      setMsg("注文IDが見つかりませんでした。");
      return;
    }

    // token無し：0円購入 or 購入履歴から表示（確認せずOK表示）
    if (!token) {
      setChecking(false);
      setPaid(true);
      setMsg("ご購入ありがとうございます！");
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;

    let stopped = false;
    const startedAt = Date.now();
    let timer: number | null = null;

    const loop = async () => {
      if (stopped) return;

      try {
        const { isPaid, res } = await confirmOnce();

        if (stopped) return;

        const paypayStatus = res?.paypayStatus || res?.status || "PENDING";
        const message = res?.message ? String(res.message) : "";

        if (isPaid) {
          setPaid(true);
          setChecking(false);
          setMsg("ご購入ありがとうございます！");
          setDetail("");
          await sendBuyerEmailOnce();
          return;
        }

        // まだ未決済
        setPaid(false);
        setChecking(true);
        setMsg("PayPayの支払い完了を待っています…（最大5分）");
        setDetail(
          message
            ? `状態: ${paypayStatus} / ${message}`
            : `状態: ${paypayStatus}`
        );

        // タイムアウト判定
        if (Date.now() - startedAt >= MAX_WAIT_MS) {
          setChecking(false);
          setMsg("決済確認が完了しませんでした。支払い後なら再読み込みしてください。");
          return;
        }

        timer = window.setTimeout(loop, INTERVAL_MS);
      } catch {
        if (stopped) return;
        setChecking(false);
        setPaid(false);
        setMsg("通信に失敗しました。再読み込みしてください。");
      }
    };

    loop();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [orderId, token, PAYPAY_API_BASE]);

  return (
    <div className="complete-page">
      <h2>{msg}</h2>
      <p>注文番号：{orderId || "不明"}</p>

      <div className="complete-box">
        {checking ? (
          <>
            <p>確認中…</p>
            {detail ? <p style={{ opacity: 0.7, fontSize: 12 }}>{detail}</p> : null}
          </>
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