import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function PayPayReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  const [msg, setMsg] = useState("決済を確認しています…");
  const [status, setStatus] = useState<string>("PENDING");

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || "";
  const token = q.get("token") || "";

  useEffect(() => {
    if (!orderId || !token) {
      setMsg("URLが不正です（orderId/tokenがありません）");
      setStatus("BAD_REQUEST");
      return;
    }

    let stopped = false;
    const start = Date.now();
    let timer: number | null = null;

    const tick = async () => {
      if (stopped) return;

      // 最大5分
      if (Date.now() - start > 5 * 60 * 1000) {
        setMsg("時間切れです。支払いが完了している場合は再読み込みしてください。");
        setStatus("TIMEOUT");
        return;
      }

      try {
        const r = await fetch("/api/confirm-paypay-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, token }),
        });

        const j = await r.json().catch(() => null);

        // paid 判定（サーバが paid:true を返す想定）
        if (r.ok && (j?.paid === true || j?.status === "paid" || j?.status === "COMPLETED")) {
          // ✅ 完了画面へ
          navigate(`/purchase-complete/${orderId}`, { replace: true });
          return;
        }

        // PENDING系：待つ
        if (r.ok && (j?.status === "PENDING" || j?.paid === false)) {
          setMsg("PayPayの支払い完了を待っています…（最大5分）");
          setStatus("PENDING");
          timer = window.setTimeout(tick, 2500);
          return;
        }

        // それ以外：エラー表示
        setMsg(`決済確認に失敗しました（${j?.error || j?.status || r.status}）`);
        setStatus(j?.error || j?.status || "ERROR");
      } catch {
        // 一時的な失敗は待つ
        timer = window.setTimeout(tick, 2500);
      }
    };

    tick();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [orderId, token, navigate]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 16, marginBottom: 10 }}>{msg}</div>
        <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 18 }}>
          注文ID: {orderId}
          <br />
          状態: {status}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <button onClick={() => window.location.reload()} style={{ padding: 12, borderRadius: 12 }}>
            再読み込み
          </button>
          <button onClick={() => navigate("/login")} style={{ padding: 12, borderRadius: 12 }}>
            ログインする
          </button>
          <button onClick={() => navigate("/")} style={{ padding: 12, borderRadius: 12 }}>
            トップへ戻る
          </button>
        </div>
      </div>
    </main>
  );
}