import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function PayPayReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || "";
  const merchantPaymentId = q.get("merchantPaymentId") || "";

  const [msg, setMsg] = useState("決済を確認しています…");

  useEffect(() => {
    if (!orderId || !merchantPaymentId) {
      navigate(`/paypay-failed?orderId=${encodeURIComponent(orderId)}&reason=BAD_REQUEST`, { replace: true });
      return;
    }

    let stopped = false;
    const start = Date.now();
    let timer: number | null = null;

    const isPaidResp = (rOk: boolean, j: any) => {
      if (!rOk) return false;
      return j?.paid === true || String(j?.status || "").toLowerCase() === "paid" || j?.paypayStatus === "COMPLETED";
    };

    const tick = async () => {
      if (stopped) return;

      if (Date.now() - start > 15 * 1000) {
        navigate(`/paypay-failed?orderId=${encodeURIComponent(orderId)}&reason=TIMEOUT_15S`, { replace: true });
        return;
      }

      try {
        const r = await fetch("/api/confirm-paypay-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, merchantPaymentId }),
        });

        const j = await r.json().catch(() => null);
        if (stopped) return;

        if (isPaidResp(r.ok, j)) {
          // ✅ ここで finalize を叩く（ポイント減算・在庫・paid反映をサーバ側で確定）
          await fetch("/api/finalize-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, merchantPaymentId }),
          }).catch(() => {});

          // ✅ 完了画面へ（merchantPaymentId も渡す）
          navigate(
            `/purchase-complete/${orderId}?orderId=${encodeURIComponent(orderId)}&merchantPaymentId=${encodeURIComponent(
              merchantPaymentId
            )}`,
            { replace: true }
          );
          return;
        }

        const st = String(j?.status || "").toUpperCase();
        if (r.ok && (st === "PENDING" || j?.paid === false || st === "CREATED")) {
          setMsg("PayPayの支払い完了を待っています…");
          timer = window.setTimeout(tick, 2500);
          return;
        }

        const reason = String(j?.error || j?.status || r.status || "ERROR");
        navigate(`/paypay-failed?orderId=${encodeURIComponent(orderId)}&reason=${encodeURIComponent(reason)}`, {
          replace: true,
        });
      } catch {
        timer = window.setTimeout(tick, 2500);
      }
    };

    tick();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [orderId, merchantPaymentId, navigate]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 16, marginBottom: 10 }}>{msg}</div>
        <div style={{ opacity: 0.7, fontSize: 13, wordBreak: "break-all" }}>
          orderId: {orderId}
          <br />
          merchantPaymentId: {merchantPaymentId}
        </div>
      </div>
    </main>
  );
}