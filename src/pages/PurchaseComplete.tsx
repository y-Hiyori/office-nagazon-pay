// src/pages/PurchaseComplete.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./PurchaseComplete.css";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

  const PAYPAY_API_BASE = (import.meta as any).env?.VITE_PAYPAY_API_BASE || "";

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

    let stopped = false;

    (async () => {
      try {
        const url = `${PAYPAY_API_BASE}/api/confirm-paypay-payment`;

        // ✅ 反映待ち対策：数回リトライ（例：最大8回、2秒間隔）
        const maxTry = 8;
        for (let i = 1; i <= maxTry; i++) {
          if (stopped) return;

          setMsg(i === 1 ? "購入完了を確認しています…" : `決済反映を待っています…（${i}/${maxTry}）`);

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

          if (isPaid) {
            if (stopped) return;

            setPaid(true);
            setMsg("ご購入ありがとうございます！");

            // ✅ 購入者メール（サーバ側で paid チェック & 二重送信防止）
            await fetch("/api/send-buyer-order-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId, token }),
            }).catch(() => {});

            return;
          }

          // まだ反映してないなら待って次へ
          if (i < maxTry) await sleep(2000);
        }

        // リトライしてもダメなら未完了扱い
        if (!stopped) {
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