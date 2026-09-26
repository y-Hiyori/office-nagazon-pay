import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const LS_KEY = "nagazonpay_pending_order";

export default function PayPayReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const qOrderId = q.get("orderId") || "";
  const qToken = q.get("token") || "";
  const qMpid = q.get("merchantPaymentId") || "";

  const [msg, setMsg] = useState("決済を確認しています…");

  useEffect(() => {
    // PayPayは戻しURLにこちら側のパラメータを返すことを保証しないため、
    // 購入手続き時に保存した {orderId, token, merchantPaymentId} をフォールバックに使う
    let saved: { orderId?: string; token?: string; merchantPaymentId?: string } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    } catch {
      saved = null;
    }

    const orderId = (qOrderId || saved?.orderId || "").trim();
    const token = (qToken || saved?.token || "").trim();
    const mpid = (qMpid || saved?.merchantPaymentId || "").trim();

    if (!orderId && !mpid) {
      navigate(`/paypay-failed?orderId=&reason=${encodeURIComponent("BAD_REQUEST")}`, { replace: true });
      return;
    }

    let stopped = false;
    const start = Date.now();
    let timer: number | null = null;

    const isPaid = (j: any) =>
      j?.paid === true ||
      String(j?.status || "").toLowerCase() === "paid" ||
      j?.paypayStatus === "COMPLETED";

    const fail = (reason: string) =>
      navigate(
        `/paypay-failed?orderId=${encodeURIComponent(orderId || "")}&reason=${encodeURIComponent(reason)}`,
        { replace: true }
      );

    const tick = async () => {
      if (stopped) return;
      if (Date.now() - start > 30 * 1000) {
        fail("TIMEOUT_30S");
        return;
      }

      try {
        const r = await fetch("/api/confirm-paypay-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: orderId || undefined,
            token: token || undefined,
            merchantPaymentId: mpid || undefined,
          }),
        });
        const j = await r.json().catch(() => null);
        if (stopped) return;

        if (r.ok && isPaid(j)) {
          try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
          const resolvedId = String(j?.orderDbId || orderId || "");

          // ✅ 入荷ロットを消費（冪等：二重に減りません）
          if (resolvedId) {
            try {
              const { supabase } = await import("../lib/supabase");
              const { error: eLot } = await supabase.rpc("consume_lots_for_order", {
                p_order_id: resolvedId,
              });
              if (eLot) {
                console.error("consume_lots_for_order failed:", eLot);
                const r2 = await supabase.rpc("consume_lots_for_order", { p_order_id: resolvedId });
                if (r2.error) console.error("consume_lots_for_order retry failed:", r2.error);
              }

              // ✅ クーポンの使用を記録（PayPay購入分／同じ注文では二重に数えない）
              const { error: eCoupon } = await supabase.rpc("coupon_redeem_for_order", {
                p_order_id: resolvedId,
              });
              if (eCoupon) console.error("coupon_redeem_for_order failed:", eCoupon);
            } catch (eLot) {
              console.error("consume_lots_for_order exception:", eLot);
            }
          }
          navigate(`/purchase-complete/${resolvedId}?orderId=${encodeURIComponent(resolvedId)}&token=${encodeURIComponent(token)}&paid=1`, {
            replace: true,
          });
          return;
        }

        const st = String(j?.status || "").toUpperCase();
        if (r.ok && (st === "PENDING" || st === "CREATED" || j?.paid === false)) {
          setMsg("PayPayの支払い完了を待っています…");
          timer = window.setTimeout(tick, 2500);
          return;
        }

        // 決済APIの反映遅延を考慮し、一瞬のエラーはリトライ。確定エラーは失敗画面へ
        const reason = String(j?.error || j?.status || r.status || "ERROR");
        if (!r.ok && (reason === "PAYMENT_NOT_FOUND" || reason === "ORDER_NOT_FOUND")) {
          timer = window.setTimeout(tick, 2500);
          return;
        }
        fail(reason);
      } catch {
        timer = window.setTimeout(tick, 2500);
      }
    };

    tick();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [qOrderId, qToken, qMpid, navigate]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div className="pc-spinner" aria-label="loading" />
        <div style={{ fontSize: 16, marginTop: 14, opacity: 0.8 }}>{msg}</div>
      </div>
    </main>
  );
}
