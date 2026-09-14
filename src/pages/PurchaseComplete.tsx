// src/pages/PurchaseComplete.tsx
import { useEffect, useMemo, useRef, useState } from "react";
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
  // PayPayReturn / 0円購入フローが「すでに決済確定済み」で飛ばしてきた場合
  const paidOnArrival = q.get("paid") === "1";

  const [view, setView] = useState<ViewState>(paidOnArrival ? "paid" : "pending");
  const [earnedPt, setEarnedPt] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);

  // ✅ 初回チェックが終わるまで「確認中画面」に固定する
  const [booting, setBooting] = useState(paidOnArrival ? false : true);

  // ✅ 一定時間たっても pending なら「再確認」ボタンを出す
  const [showManual, setShowManual] = useState(false);
  const startRef = useRef<number>(Date.now());

  const refreshByApi = async () => {
    const r = await fetch(
      `/api/order-status?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`
    );
    const j = await r.json().catch(() => null);

    if (!r.ok || !j?.ok) {
      // 決済は確定済みなら pending に落とさない（到達済み情報を優先）
      if (!paidOnArrival) setView("pending");
      return { ok: false as const, status: "ERROR" as const };
    }

    const st = String(j.status || "").toLowerCase();

    if (typeof j.points_earned === "number" && j.points_earned > 0) {
      setEarnedPt(j.points_earned);
    }

    if (st === "paid") {
      setView("paid");
      return { ok: true as const, status: "paid" as const };
    }

    if (st === "canceled" || st === "failed") {
      setView("failed");
      return { ok: true as const, status: "failed" as const };
    }

    if (!paidOnArrival) setView("pending");
    return { ok: true as const, status: "pending" as const };
  };

  const refreshBySupabase = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) {
      if (!paidOnArrival) setView("pending");
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .select("id,status,paid_at")
      .eq("id", orderId)
      .eq("user_id", u.user.id)
      .maybeSingle();

    if (error || !data) {
      if (!paidOnArrival) setView("pending");
      return;
    }

    const st = String(data.status || "").toLowerCase();
    if (st === "paid") setView("paid");
    else if (st === "canceled" || st === "failed") setView("failed");
    else if (!paidOnArrival) setView("pending");
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
      await r.json().catch(() => null);
      await refreshByApi();
    } finally {
      setIsConfirming(false);
    }
  };

  useEffect(() => {
    if (!orderId) {
      setView("failed");
      setBooting(false);
      return;
    }

    let stopped = false;
    let timer: number | null = null;
    startRef.current = Date.now();

    // ✅ 5秒以上 pending なら「再確認」ボタン出す
    const manualTimer = window.setTimeout(() => {
      if (!stopped) setShowManual(true);
    }, 5000);

    const tick = async () => {
      if (stopped) return;

      try {
        // 到達時点で決済確定済みの場合は、獲得ポイント表示のため1回だけ問い合わせ
        if (paidOnArrival) {
          await refreshByApi();
          if (!stopped) setBooting(false);
          return;
        }

        if (token) {
          const r = await refreshByApi();
          if (!stopped) setBooting(false);

          // paid/failedになったらボタン不要
          if (!stopped && r.ok && (r.status === "paid" || r.status === "failed")) {
            setShowManual(false);
            return;
          }

          // pendingなら最大30秒だけ自動で追う
          if (!stopped && r.ok && r.status === "pending" && Date.now() - startRef.current < 30 * 1000) {
            timer = window.setTimeout(tick, 2500);
          }
          return;
        }

        await refreshBySupabase();
        if (!stopped) setBooting(false);
      } catch {
        if (!stopped) setBooting(false);
        timer = window.setTimeout(tick, 2500);
      }
    };

    tick();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      window.clearTimeout(manualTimer);
    };
  }, [orderId, token, paidOnArrival]);

  // ✅ 初回チェック終わるまで「確認中」だけ
  if (booting) {
    return (
      <div className="complete-page">
        <h2>決済状況を確認しています…</h2>
        <div className="pc-spinner" aria-label="loading" />
        <p>画面は閉じずにお待ちください。</p>
      </div>
    );
  }

  return (
    <div className="complete-page">
      <h2>ご購入ありがとうございます！</h2>
      <p>注文番号：{orderId || "不明"}</p>

      {view === "paid" && (
        <div className="complete-box">
          <p>お支払いが完了しました。</p>
          <p>商品をお取りください。</p>
          {earnedPt > 0 ? (
            <p className="complete-points">＋{earnedPt.toLocaleString("ja-JP")} pt 獲得！</p>
          ) : null}
        </div>
      )}

      {view === "pending" && (
        <div className="complete-box">
          <div className="pc-spinner small" aria-label="loading" />
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

      {view === "pending" && token && showManual && (
        <button className="home-btn" onClick={confirmNow} disabled={isConfirming} type="button">
          {isConfirming ? "確認中…" : "支払いを再確認"}
        </button>
      )}

      {/* ✅ 決済の確認が取れるまでは「トップへ戻る」を出さない（誤って戻るのを防止） */}
      {view !== "pending" && (
        <button className="home-btn" onClick={() => navigate("/", { replace: true })} type="button">
          トップへ戻る
        </button>
      )}
    </div>
  );
}
