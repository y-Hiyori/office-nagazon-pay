import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function PayPayReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const paypayOrderId = q.get("orderId") || "";
  const merchantPaymentId = q.get("merchantPaymentId") || ""; // ✅ 追加
  const token = q.get("token") || ""; // ✅ あってもなくてもOKにする

  const [msg, setMsg] = useState("決済を確認しています…");

  useEffect(() => {
    // ✅ token必須をやめて merchantPaymentId 必須へ
    if (!paypayOrderId || !merchantPaymentId) {
      navigate(
        `/paypay-failed?orderId=${encodeURIComponent(paypayOrderId || "")}&reason=BAD_REQUEST`,
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
        String(j?.paypayStatus || j?.paypay_status || "").toUpperCase() === "COMPLETED"
      );
    };

    const tick = async () => {
      if (stopped) return;

      // ✅ 最大15秒（コメントも合わせる）
      if (Date.now() - start > 15 * 1000) {
        navigate(
          `/paypay-failed?orderId=${encodeURIComponent(paypayOrderId)}&reason=TIMEOUT_15S`,
          { replace: true }
        );
        return;
      }

      try {
        const r = await fetch("/api/confirm-paypay-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // ✅ tokenじゃなく merchantPaymentId を送る
          body: JSON.stringify({ orderId: paypayOrderId, merchantPaymentId }),
        });

        const j = await r.json().catch(() => null);
        if (stopped) return;

        if (isPaidResp(r.ok, j)) {
          const orderDbId = j?.orderDbId || paypayOrderId;

          // ✅ 成功時に finalize（ポイント減算）を先に叩く
          await fetch("/api/finalize-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: orderDbId, token }), // tokenはあれば送る
          }).catch(() => {});

          navigate(
            `/purchase-complete/${orderDbId}?orderId=${encodeURIComponent(orderDbId)}${
              token ? `&token=${encodeURIComponent(token)}` : ""
            }`,
            { replace: true }
          );
          return;
        }

        // ✅ まだ待ち（PENDING）
        const st = String(j?.status || j?.paypayStatus || j?.paypay_status || "").toUpperCase();
        if (r.ok && (st === "PENDING" || st === "CREATED" || j?.paid === false)) {
          setMsg("PayPayの支払い完了を待っています…");
          timer = window.setTimeout(tick, 2500);
          return;
        }

        const reason = String(j?.error || j?.status || r.status || "ERROR");
        navigate(
          `/paypay-failed?orderId=${encodeURIComponent(paypayOrderId)}&reason=${encodeURIComponent(reason)}`,
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
  }, [paypayOrderId, merchantPaymentId, token, navigate]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 16, marginBottom: 10 }}>{msg}</div>
        <div style={{ opacity: 0.7, fontSize: 13, wordBreak: "break-all" }}>
          PayPay orderId: {paypayOrderId}
          <br />
          merchantPaymentId: {merchantPaymentId}
          <br />
          確認中…
        </div>
      </div>
    </main>
  );
}