// src/pages/PayPayReturn.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

type ConfirmRes = {
  paid?: boolean;
  status?: string;
  error?: string;

  // 念のため、サーバが入れ子で返すパターンも拾う
  result?: { status?: string; paid?: boolean };
  data?: { status?: string; paid?: boolean };
};

export default function PayPayReturn() {
  const navigate = useNavigate();
  const location = useLocation();

  const [msg, setMsg] = useState("決済を確認しています…");
  const [status, setStatus] = useState<string>("PENDING");

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || "";
  const token = q.get("token") || "";

  // ✅ ここが超重要：Vercelの /api じゃなく、OCIを叩く
  // Vercelの環境変数に VITE_PAYPAY_API_BASE を設定してね
  // 例) http://161.33.19.160  （本番は https ドメイン推奨）
  const API_BASE =
    (import.meta as any).env?.VITE_PAYPAY_API_BASE?.replace(/\/$/, "") || "";

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
        const url = `${API_BASE}/api/confirm-paypay-payment`;

        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, token }),
        });

        const j: ConfirmRes | null = await r.json().catch(() => null);

        // デバッグしたいときだけ有効化
        // console.log("confirm:", r.status, j);

        const s =
          j?.status ?? j?.result?.status ?? j?.data?.status ?? (r.ok ? "PENDING" : "ERROR");
        const paid =
          j?.paid ?? j?.result?.paid ?? j?.data?.paid ?? false;

        // ✅ 完了判定（ここで purchase-complete に飛ばす）
        if (r.ok && (paid === true || s === "COMPLETED" || s === "paid")) {
          navigate(`/purchase-complete/${orderId}`, { replace: true });
          return;
        }

        // ✅ 未完了（待つ）
        if (r.ok && (s === "PENDING" || paid === false)) {
          setMsg("PayPayの支払い完了を待っています…（最大5分）");
          setStatus("PENDING");
          timer = window.setTimeout(tick, 2500);
          return;
        }

        // ✅ それ以外はエラー
        setMsg(`決済確認に失敗しました（${j?.error || s || r.status}）`);
        setStatus(j?.error || s || "ERROR");
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
  }, [orderId, token, navigate, API_BASE]);

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