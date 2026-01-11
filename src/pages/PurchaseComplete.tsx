import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./PurchaseComplete.css";

type ViewState = "paid" | "pending" | "failed";

export default function PurchaseComplete() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || id || "";
  const token = q.get("token") || ""; // PayPayReturnから渡す
  const [view, setView] = useState<ViewState>("pending");
  const [msg, setMsg] = useState("決済状況を確認しています…");
  const [detail, setDetail] = useState<{ status?: string; paidAt?: string } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const refreshByApi = async () => {
    const r = await fetch(`/api/order-status?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`);
    const j = await r.json().catch(() => null);

    if (!r.ok || !j?.ok) {
      setView("pending");
      setMsg("注文情報の取得に失敗しました。");
      return { ok: false as const, status: "ERROR" as const };
    }

    const st = String(j.status || "").toLowerCase();
    setDetail({ status: j.status, paidAt: j.paidAt });

    if (st === "paid") {
      setView("paid");
      setMsg("ご購入ありがとうございます！");
      return { ok: true as const, status: "paid" as const };
    }

    if (st === "canceled" || st === "failed") {
      setView("failed");
      setMsg("決済の確認ができませんでした。");
      return { ok: true as const, status: "failed" as const };
    }

    setView("pending");
    setMsg("決済状況を確認中です。");
    return { ok: true as const, status: "pending" as const };
  };

  const refreshBySupabase = async () => {
    // tokenが無い場合（0円購入でURLにtoken付けてない等）用：ログインしてたら本人の注文だけ確認
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) {
      setView("pending");
      setMsg("注文状況を確認するには、購入に使った端末で開くかログインしてください。");
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .select("id,status,paid_at")
      .eq("id", orderId)
      .eq("user_id", u.user.id)
      .maybeSingle();

    if (error || !data) {
      setView("pending");
      setMsg("注文情報の取得中です…");
      return;
    }

    const st = String(data.status || "").toLowerCase();
    setDetail({ status: data.status, paidAt: data.paid_at || "" });

    if (st === "paid") {
      setView("paid");
      setMsg("ご購入ありがとうございます！");
      return;
    }
    if (st === "canceled" || st === "failed") {
      setView("failed");
      setMsg("決済の確認ができませんでした。");
      return;
    }

    setView("pending");
    setMsg("決済状況を確認中です。");
  };

  const confirmNow = async () => {
    if (!orderId || !token) return;
    setIsConfirming(true);
    try {
      const r = await fetch("/api/confirm-paypay-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, token }),
      });
      const j = await r.json().catch(() => null);

      if (r.ok && (j?.finalized || j?.paid || String(j?.status || "").toLowerCase() === "paid")) {
        await refreshByApi();
        return;
      }

      // 未完了でも一旦ステータス更新
      await refreshByApi();
    } finally {
      setIsConfirming(false);
    }
  };

  useEffect(() => {
    if (!orderId) {
      setView("failed");
      setMsg("注文IDが見つかりませんでした。");
      return;
    }

    let stopped = false;
    let timer: number | null = null;
    const start = Date.now();

    const tick = async () => {
      if (stopped) return;

      // tokenがあるならAPIで確認（未ログインでもOK）
      if (token) {
        const r = await refreshByApi();
        if (!stopped && r.ok && r.status === "pending" && Date.now() - start < 30 * 1000) {
          timer = window.setTimeout(tick, 2500);
        }
        return;
      }

      // tokenが無いならSupabase（ログイン中のみ確認できる）
      await refreshBySupabase();
    };

    tick();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [orderId, token]);

  return (
    <div className="complete-page">
      <h2>{msg}</h2>
      <p>注文番号：{orderId || "不明"}</p>

      {detail?.status && <p style={{ opacity: 0.7 }}>status: {detail.status}</p>}

      {view === "paid" && (
        <>
          <div className="complete-box">
            <p>お支払いが完了しました。</p>
            <p>商品をお取りください。</p>
          </div>
          <button className="home-btn" onClick={() => navigate("/", { replace: true })}>
            トップへ戻る
          </button>
        </>
      )}

      {view === "pending" && (
        <>
          <div className="complete-box">
            <p>決済状況を確認中です。</p>
            <p>しばらくすると反映されます。</p>
          </div>

          {token && (
            <button className="home-btn" onClick={confirmNow} disabled={isConfirming}>
              {isConfirming ? "確認中…" : "支払いを再確認"}
            </button>
          )}

          <button className="home-btn" onClick={() => navigate("/", { replace: true })}>
            トップへ戻る
          </button>
        </>
      )}

      {view === "failed" && (
        <>
          <div className="complete-box">
            <p>決済の確認ができませんでした。</p>
            <p>お手数ですがスタッフへご連絡ください。</p>
          </div>
          <button className="home-btn" onClick={() => navigate("/contact", { replace: true })}>
            お問い合わせへ
          </button>
        </>
      )}
    </div>
  );
}