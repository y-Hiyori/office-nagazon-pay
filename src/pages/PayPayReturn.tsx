import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Loading from "../components/Loading";
import { clearPending, loadPending, savePending } from "../lib/pendingPayment";

export default function PayPayReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const qOrderId = q.get("orderId") || "";
  const qToken = q.get("token") || "";
  const qMpid = q.get("merchantPaymentId") || "";

  const [msg, setMsg] = useState("決済を確認しています");
  const [sub, setSub] = useState("画面を閉じずにお待ちください");

  useEffect(() => {
    // PayPayは戻しURLにこちら側のパラメータを返すことを保証しないため、
    // 購入手続き時に保存した {orderId, token, merchantPaymentId} をフォールバックに使う
    const saved = loadPending();

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
    let pendingCount = 0;

    const isPaid = (j: { paid?: boolean; status?: string; paypayStatus?: string } | null) =>
      j?.paid === true ||
      String(j?.status || "").toLowerCase() === "paid" ||
      j?.paypayStatus === "COMPLETED";

    const fail = (reason: string) =>
      navigate(
        `/paypay-failed?orderId=${encodeURIComponent(orderId || "")}&reason=${encodeURIComponent(reason)}`,
        { replace: true }
      );

    // 未払い（PayPay画面でキャンセル・閉じた）→ 支払い再開／取り消しを選べる画面へ
    const unpaid = () => {
      if (saved && saved.orderId === orderId) {
        // 案内を即時に出せるよう作成時刻を少し前にする
        savePending({ ...saved, createdAt: Math.min(Number(saved.createdAt || 0), Date.now() - 5000) });
      }
      navigate(`/paypay-failed?orderId=${encodeURIComponent(orderId || "")}&reason=UNPAID`, { replace: true });
    };

    const tick = async () => {
      if (stopped) return;
      if (Date.now() - start > 30 * 1000) {
        // 30秒たっても支払い完了にならない＝支払っていない可能性が高い
        unpaid();
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
          clearPending();
          const resolvedId = String(j?.orderDbId || orderId || "");

          // 入荷ロット消費・クーポン使用回数は VPS の決済確定処理（confirm-paypay-payment）で
          // service role により実行済み。ここからは画面遷移だけ行う。
          navigate(
            `/purchase-complete/${resolvedId}?orderId=${encodeURIComponent(resolvedId)}&token=${encodeURIComponent(
              token
            )}&paid=1`,
            { replace: true }
          );
          return;
        }

        const st = String(j?.status || "").toUpperCase();
        const pst = String(j?.paypayStatus || "").toUpperCase();

        // PayPay側で取り消し・期限切れ・失敗が確定している
        if (["CANCELED", "EXPIRED", "FAILED", "AUTHORIZATION_EXPIRED"].includes(pst) || st === "CANCELED") {
          unpaid();
          return;
        }

        if (r.ok && (st === "PENDING" || st === "CREATED" || st === "FINALIZING" || j?.paid === false)) {
          pendingCount++;
          setMsg("PayPayの支払い完了を待っています");
          setSub(
            pendingCount >= 3
              ? "支払いをしていない場合は、少し待つと「支払いを続ける／取り消す」を選べます"
              : "画面を閉じずにお待ちください"
          );
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
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <Loading variant="block" label={msg} />
        <div style={{ fontSize: 13, marginTop: -24, color: "#64748b", lineHeight: 1.7 }}>{sub}</div>
      </div>
    </main>
  );
}
