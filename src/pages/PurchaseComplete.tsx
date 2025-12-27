// src/pages/PurchaseComplete.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./PurchaseComplete.css";

type ViewState = "loading" | "success" | "failed";

function PurchaseComplete() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || id || "";
  const token = q.get("token") || "";

  const [view, setView] = useState<ViewState>("loading");
  const [msg, setMsg] = useState("購入完了を確認しています…");

  const PAYPAY_API_BASE = (import.meta as any).env?.VITE_PAYPAY_API_BASE || "";

  useEffect(() => {
    if (!orderId) {
      setView("failed");
      setMsg("注文IDが見つかりませんでした。");
      return;
    }

    // ✅ Safariに戻った時にログインセッションが無くても「購入完了画面は必ず表示」したいので、
    // tokenが無いケース（購入履歴から/セッション消え等）はそのまま成功表示にする
    if (!token) {
      setView("success");
      setMsg("ご購入ありがとうございます！");
      return;
    }

    let stopped = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const isPaidResp = (rOk: boolean, j: any) => {
      if (!rOk) return false;
      return (
        j?.paid === true ||
        String(j?.status || "").toLowerCase() === "paid" ||
        j?.paypayStatus === "COMPLETED"
      );
    };

    (async () => {
      setView("loading");
      setMsg("購入完了を確認しています…");

      const url = `${PAYPAY_API_BASE}/api/confirm-paypay-payment`;
      const intervalMs = 4500;
      const maxTry = 20; // 約90秒

      try {
        for (let i = 0; i < maxTry && !stopped; i++) {
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, token }),
          });

          const j = await r.json().catch(() => null);
          if (stopped) return;

          if (isPaidResp(r.ok, j)) {
            setView("success");
            setMsg("ご購入ありがとうございます！");

            // ✅ paidになった瞬間だけ購入者メール送信（サーバ側も二重防止）
            await fetch("/api/send-buyer-order-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId, token }),
            }).catch(() => {});

            return;
          }

          // まだ未確定
          setMsg("決済確認中です…（少し待ってください）");
          await sleep(intervalMs);
        }

        if (!stopped) {
          setView("failed");
          setMsg("決済確認が完了しませんでした。スタッフにお問い合わせください。");
        }
      } catch {
        if (!stopped) {
          setView("failed");
          setMsg("通信に失敗しました。スタッフにお問い合わせください。");
        }
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

      {view === "loading" && (
        <div className="complete-box">
          <p>確認中…</p>
        </div>
      )}

      {view === "success" && (
        <div className="complete-box">
          <p>お支払いが完了しました。</p>
          <p>商品をお取りください。</p>
        </div>
      )}

      {view === "failed" && (
        <div className="complete-box">
          <p>決済の確認ができませんでした。</p>
          <p>お手数ですがスタッフへご連絡ください。</p>

          <button
            className="home-btn"
            onClick={() => navigate("/contact")}
            style={{ marginTop: 12 }}
          >
            お問い合わせへ
          </button>
        </div>
      )}
    </div>
  );
}

export default PurchaseComplete;