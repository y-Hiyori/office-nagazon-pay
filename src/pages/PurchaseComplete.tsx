// src/pages/PurchaseComplete.tsx
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
  const token = q.get("token") || "";

  const [view, setView] = useState<ViewState>("pending");
  const [isConfirming, setIsConfirming] = useState(false);

  const refreshByApi = async () => {
    const r = await fetch(
      `/api/order-status?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`
    );
    const j = await r.json().catch(() => null);

    if (!r.ok || !j?.ok) {
      setView("pending");
      return { ok: false as const, status: "ERROR" as const };
    }

    const st = String(j.status || "").toLowerCase();

    if (st === "paid") {
      setView("paid");
      return { ok: true as const, status: "paid" as const };
    }

    if (st === "canceled" || st === "failed") {
      setView("failed");
      return { ok: true as const, status: "failed" as const };
    }

    setView("pending");
    return { ok: true as const, status: "pending" as const };
  };

  const refreshBySupabase = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) {
      setView("pending");
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
      return;
    }

    const st = String(data.status || "").toLowerCase();

    if (st === "paid") {
      setView("paid");
      return;
    }
    if (st === "canceled" || st === "failed") {
      setView("failed");
      return;
    }

    setView("pending");
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

      if (
        r.ok &&
        (j?.finalized || j?.paid || String(j?.status || "").toLowerCase() === "paid")
      ) {
        await refreshByApi();
        return;
      }

      await refreshByApi();
    } finally {
      setIsConfirming(false);
    }
  };

  useEffect(() => {
    if (!orderId) {
      setView("failed");
      return;
    }

    let stopped = false;
    let timer: number | null = null;
    const start = Date.now();

    const tick = async () => {
      if (stopped) return;

      if (token) {
        const r = await refreshByApi();
        if (!stopped && r.ok && r.status === "pending" && Date.now() - start < 30 * 1000) {
          timer = window.setTimeout(tick, 2500);
        }
        return;
      }

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
      <h2>ご購入ありがとうございます！</h2>
      <p>注文番号：{orderId || "不明"}</p>

      {view === "paid" && (
        <div className="complete-box">
          <p>お支払いが完了しました。</p>
          <p>商品をお取りください。</p>
        </div>
      )}

      {view === "pending" && (
        <div className="complete-box">
          <p>決済状況を確認中です。</p>
          <p>しばらくすると反映されます。</p>
        </div>
      )}

      {view === "failed" && (
        <div className="complete-box">
          <p>決済の確認ができませんでした。</p>
          <p>お手数ですがスタッフへご連絡ください。</p>
        </div>
      )}

      {view === "pending" && token && (
        <button className="home-btn" onClick={confirmNow} disabled={isConfirming} type="button">
          {isConfirming ? "確認中…" : "支払いを再確認"}
        </button>
      )}

      <button className="home-btn" onClick={() => navigate("/", { replace: true })} type="button">
        トップへ戻る
      </button>
    </div>
  );
}