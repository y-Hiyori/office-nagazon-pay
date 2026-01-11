import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function PayPayReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || "";
  const token = q.get("token") || "";
  const merchantPaymentId = q.get("merchantPaymentId") || ""; // PayPayが付けてくることがある（無くてもOK）

  const [msg, setMsg] = useState("PayPay決済を確認しています…");

  useEffect(() => {
    // orderId & token が無いと、第三者が orderId だけで確定させる攻撃ができるので必須
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

      // 60秒で諦め（好みで調整OK）
      if (Date.now() - start > 60 * 1000) {
        navigate(
          `/paypay-failed?orderId=${encodeURIComponent(orderId)}&reason=TIMEOUT_60S`,
          { replace: true }
        );
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

        // ✅ 完了（このAPIが “反映＋メール” までやる）
        if (r.ok && (j?.finalized === true || j?.paid === true || String(j?.status).toLowerCase() === "paid")) {
          navigate(
            `/purchase-complete/${encodeURIComponent(orderId)}?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,
            { replace: true }
          );
          return;
        }

        // ✅ まだ未完了
        const st = String(j?.status || "").toUpperCase();
        if (r.ok && (st === "PENDING" || st === "CREATED" || st === "FINALIZING")) {
          setMsg(st === "FINALIZING" ? "注文を確定しています…" : "PayPayの支払い完了を待っています…");
          timer = window.setTimeout(tick, 2500);
          return;
        }

        // それ以外は失敗扱い
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
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 16, marginBottom: 10 }}>{msg}</div>
        <div style={{ opacity: 0.7, fontSize: 13, wordBreak: "break-all" }}>
          orderId: {orderId}
          <br />
          token: {token ? "OK" : "MISSING"}
          <br />
          merchantPaymentId: {merchantPaymentId || "(none)"}
        </div>
      </div>
    </main>
  );
}