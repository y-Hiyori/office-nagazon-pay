import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function PayPayReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const paypayOrderId = q.get("orderId") || "";
  const token = q.get("token") || "";

  const [msg, setMsg] = useState("決済を確認しています…");

  useEffect(() => {
    if (!paypayOrderId || !token) {
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
        j?.paypayStatus === "COMPLETED"
      );
    };

    const tick = async () => {
      if (stopped) return;

      // ✅ 最大20秒
      if (Date.now() - start > 20 * 1000) {
        navigate(
          `/paypay-failed?orderId=${encodeURIComponent(paypayOrderId)}&reason=TIMEOUT_20S`,
          { replace: true }
        );
        return;
      }

      try {
        const r = await fetch("/api/confirm-paypay-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: paypayOrderId, token }),
        });

        const j = await r.json().catch(() => null);
        if (stopped) return;

        // ✅ 決済完了 → purchase-complete（いつも通り）
        if (isPaidResp(r.ok, j)) {
          const orderDbId = j?.orderDbId || paypayOrderId;
          navigate(
            `/purchase-complete/${orderDbId}?orderId=${encodeURIComponent(orderDbId)}&token=${encodeURIComponent(token)}`,
            { replace: true }
          );
          return;
        }

        // ✅ まだ待ち（PENDING）
        const st = String(j?.status || "").toUpperCase();
        if (r.ok && (st === "PENDING" || j?.paid === false || st === "CREATED")) {
          setMsg("PayPayの支払い完了を待っています…");
          timer = window.setTimeout(tick, 2500);
          return;
        }

        // ❌ それ以外は即失敗扱い
        const reason = String(j?.error || j?.status || r.status || "ERROR");
        navigate(
          `/paypay-failed?orderId=${encodeURIComponent(paypayOrderId)}&reason=${encodeURIComponent(reason)}`,
          { replace: true }
        );
      } catch {
        // 通信失敗はリトライ（20秒までは粘る）
        timer = window.setTimeout(tick, 2500);
      }
    };

    tick();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [paypayOrderId, token, navigate]);

  // ✅ 待機中はボタン無し
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 16, marginBottom: 10 }}>{msg}</div>
        <div style={{ opacity: 0.7, fontSize: 13, wordBreak: "break-all" }}>
          PayPay orderId: {paypayOrderId}
          <br />
          確認中…
        </div>
      </div>
    </main>
  );
}