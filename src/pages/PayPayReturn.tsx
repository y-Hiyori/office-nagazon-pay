import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function PayPayReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || "";
  const merchantPaymentId = q.get("merchantPaymentId") || "";
  const token = q.get("token") || ""; // あってもOK、なくても動く設計にする

  const [msg, setMsg] = useState("決済を確認しています…");

  useEffect(() => {
    if (!orderId || !merchantPaymentId) {
      navigate(
        `/paypay-failed?orderId=${encodeURIComponent(orderId || "")}&reason=BAD_REQUEST`,
        { replace: true }
      );
      return;
    }

    let stopped = false;
    const start = Date.now();
    let timer: number | null = null;

    const isPaidResp = (rOk: boolean, j: any) => {
      if (!rOk) return false;
      return (
        j?.paid === true ||
        String(j?.status || "").toLowerCase() === "paid" ||
        String(j?.paypayStatus || "").toUpperCase() === "COMPLETED"
      );
    };

    const tick = async () => {
      if (stopped) return;

      // 最大15秒
      if (Date.now() - start > 15 * 1000) {
        navigate(
          `/paypay-failed?orderId=${encodeURIComponent(orderId)}&reason=TIMEOUT_15S`,
          { replace: true }
        );
        return;
      }

      try {
        // ① PayPay決済確認（OCIへ）
        const r = await fetch("/api/confirm-paypay-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, merchantPaymentId }),
        });

        const j = await r.json().catch(() => null);
        if (stopped) return;

        // ✅ 決済完了
        if (isPaidResp(r.ok, j)) {
          setMsg("決済完了！仕上げ処理中…");

          // ② ポイント減算（失敗しても画面は進める）
          fetch("/api/finalize-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, token }),
          }).catch(() => {});

          // ③ 完了画面へ
          navigate(
            `/purchase-complete/${encodeURIComponent(orderId)}?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,
            { replace: true }
          );
          return;
        }

        // まだ待つ
        const st = String(j?.paypayStatus || j?.status || "").toUpperCase();
        if (r.ok && (st === "PENDING" || st === "CREATED" || j?.paid === false)) {
          setMsg("PayPayの支払い完了を待っています…");
          timer = window.setTimeout(tick, 2500);
          return;
        }

        // 失敗扱い
        const reason = String(j?.status || j?.error || r.status || "ERROR");
        navigate(
          `/paypay-failed?orderId=${encodeURIComponent(orderId)}&reason=${encodeURIComponent(reason)}`,
          { replace: true }
        );
      } catch {
        timer = window.setTimeout(tick, 2500);
      }
    };

    tick();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [orderId, merchantPaymentId, token, navigate]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 16, marginBottom: 10 }}>{msg}</div>
        <div style={{ opacity: 0.7, fontSize: 13, wordBreak: "break-all" }}>
          orderId: {orderId}
          <br />
          merchantPaymentId: {merchantPaymentId}
          <br />
          確認中…
        </div>
      </div>
    </main>
  );
}