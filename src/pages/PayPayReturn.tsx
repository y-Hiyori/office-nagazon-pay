import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function PayPayReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const paypayOrderId = q.get("orderId") || "";
  const token = q.get("token") || "";

  const [phase, setPhase] = useState<"CHECKING" | "FAILED">("CHECKING");
  const [msg, setMsg] = useState("決済を確認しています…");
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    if (!paypayOrderId || !token) {
      setPhase("FAILED");
      setMsg("URLが不正です（orderId/tokenがありません）");
      setDetail("BAD_REQUEST");
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

      // 最大5分
      if (Date.now() - start > 5 * 60 * 1000) {
        setPhase("FAILED");
        setMsg("決済確認がタイムアウトしました。支払いが完了している場合は店舗にお問い合わせください。");
        setDetail("TIMEOUT");
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

        // ✅ 決済完了 → purchase-complete へ
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
          setPhase("CHECKING");
          setMsg("PayPayの支払い完了を待っています…");
          timer = window.setTimeout(tick, 2500);
          return;
        }

        // ❌ 失敗
        setPhase("FAILED");
        setMsg("決済確認に失敗しました。お手数ですがお問い合わせください。");
        setDetail(String(j?.error || j?.status || r.status || "ERROR"));
      } catch {
        // 通信失敗はリトライ（ボタンは出さない）
        timer = window.setTimeout(tick, 2500);
      }
    };

    tick();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [paypayOrderId, token, navigate]);

  // ✅ 失敗時だけ「お問い合わせへ」
  if (phase === "FAILED") {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>決済を確認できませんでした</div>
          <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 14 }}>{msg}</div>

          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 18, wordBreak: "break-all" }}>
            orderId: {paypayOrderId}
            <br />
            detail: {detail}
          </div>

          <button
            onClick={() => navigate("/contact", { replace: true })}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              fontWeight: 700,
            }}
          >
            お問い合わせへ
          </button>
        </div>
      </main>
    );
  }

  // ✅ 待機中はボタン無し
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 16, marginBottom: 10 }}>{msg}</div>
        <div style={{ opacity: 0.7, fontSize: 13 }}>
          PayPay orderId: {paypayOrderId}
          <br />
          確認中…
        </div>
      </div>
    </main>
  );
}