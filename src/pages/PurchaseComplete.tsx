// src/pages/PurchaseComplete.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase"; // ✅ 追加
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

  const PAYPAY_API_BASE = (import.meta as any).env?.VITE_PAYPAY_API_BASE || "";

  useEffect(() => {
    if (!orderId) {
      setChecking(false);
      setMsg("注文IDが見つかりませんでした。");
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
      setChecking(true);
      setMsg("購入完了を確認しています…");

      // ✅ token無しでも DB から paid 判定 → 送ってなければメール送信
      if (!token) {
        try {
          const { data: order } = await supabase
            .from("orders")
            .select("status,paypay_return_token,buyer_email_sent_at")
            .eq("id", orderId)
            .single();

          const st = String(order?.status || "").toLowerCase();

          if (st === "paid") {
            if (stopped) return;

            setPaid(true);
            setMsg("ご購入ありがとうございます！");
            setChecking(false);

            const t = order?.paypay_return_token;
            if (t && !order?.buyer_email_sent_at) {
              await fetch("/api/send-buyer-order-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId, token: t }),
              }).catch(() => {});
            }
            return;
          }

          if (stopped) return;
          setPaid(false);
          setMsg("決済がまだ完了していない可能性があります。");
          setChecking(false);
          return;
        } catch {
          if (stopped) return;
          setPaid(false);
          setMsg("通信に失敗しました。再読み込みしてください。");
          setChecking(false);
          return;
        }
      }

      // ✅ tokenあり：PayPay推奨 4〜5秒間隔ポーリング
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
            setPaid(true);
            setMsg("ご購入ありがとうございます！");

            await fetch("/api/send-buyer-order-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId, token }),
            }).catch(() => {});

            setChecking(false);
            return;
          }

          setPaid(false);
          setMsg("決済確認中です…（少し待ってください）");
          await sleep(intervalMs);
        }

        if (!stopped) {
          setPaid(false);
          setMsg("決済確認が完了しませんでした。数秒後に再読み込みしてください。");
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