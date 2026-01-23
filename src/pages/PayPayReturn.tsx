import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./PayPayReturn.css";

export default function PayPayReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || "";
  const token = q.get("token") || "";
  const merchantPaymentId = q.get("merchantPaymentId") || "";

  const [msg, setMsg] = useState("PayPay決済を確認しています…");

  useEffect(() => {
    if (!orderId || !token) {
      navigate(
        `/paypay-failed?orderId=${encodeURIComponent(orderId || "")}&reason=BAD_REQUEST`,
        { replace: true }
      );
      return;
    }

    let stopped = false;
    const start = Date.now();
    let timer: number | null = null;

    const tick = async () => {
      if (stopped) return;

      if (Date.now() - start > 60 * 1000) {
        navigate(`/paypay-failed?orderId=${encodeURIComponent(orderId)}&reason=TIMEOUT_60S`, {
          replace: true,
        });
        return;
      }

      try {
        const r = await fetch("/api/confirm-paypay-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            token,
            merchantPaymentId: merchantPaymentId || undefined,
          }),
        });

        const j = await r.json().catch(() => null);
        if (stopped) return;

        if (
          r.ok &&
          (j?.finalized === true ||
            j?.paid === true ||
            String(j?.status).toLowerCase() === "paid")
        ) {
          navigate(
            `/purchase-complete/${encodeURIComponent(orderId)}?orderId=${encodeURIComponent(
              orderId
            )}&token=${encodeURIComponent(token)}`,
            { replace: true }
          );
          return;
        }

        const st = String(j?.status || "").toUpperCase();
        if (r.ok && (st === "PENDING" || st === "CREATED" || st === "FINALIZING")) {
          setMsg(st === "FINALIZING" ? "注文を確定しています…" : "PayPayの支払い完了を待っています…");
          timer = window.setTimeout(tick, 2500);
          return;
        }

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
  }, [orderId, token, merchantPaymentId, navigate]);

  return (
    <main className="pp-return">
      <div className="pp-card">
        <div className="pp-spinner" aria-label="loading" />
        <div className="pp-msg">{msg}</div>
        <div className="pp-sub">画面は閉じずにお待ちください</div>
      </div>
    </main>
  );
}