// src/components/PendingPaymentNotice.tsx
// PayPay で「購入を確定」→ 支払わずにアプリへ戻ってきたときに表示する案内
//   ・支払い済みなら完了画面へ
//   ・未払いなら「PayPayで支払う（再開）」「この注文を取り消す」「あとで」を選べる
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  cancelPending,
  canResume,
  checkPendingStatus,
  clearPending,
  completeUrl,
  loadPending,
  type PendingPayment,
} from "../lib/pendingPayment";
import { lockScroll, unlockScroll } from "../lib/scrollLock";
import "./PendingPaymentNotice.css";

// この画面では案内を出さない（自前で処理しているページ）
const SKIP_PATHS = ["/paypay-return", "/purchase-complete", "/paypay-failed"];

type Phase = "checking" | "unpaid" | "canceling" | "done";

export default function PendingPaymentNotice() {
  const navigate = useNavigate();
  const loc = useLocation();
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [open, setOpen] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");
  const busyRef = useRef(false);
  const snoozeRef = useRef(0);

  const skip = SKIP_PATHS.some((p) => loc.pathname.startsWith(p));

  const run = useCallback(async () => {
    if (busyRef.current) return;
    if (Date.now() < snoozeRef.current) return;
    const p = loadPending();
    if (!p) {
      setOpen(false);
      return;
    }
    // PayPayへ移動した直後（数秒）は戻り処理中の可能性があるので待つ
    if (Date.now() - Number(p.createdAt || 0) < 3000) return;

    busyRef.current = true;
    setPending(p);
    setPhase("checking");
    setOpen(true);
    try {
      const st = await checkPendingStatus(p);
      if (st === "paid") {
        clearPending();
        setOpen(false);
        navigate(completeUrl(p), { replace: true });
        return;
      }
      if (st === "canceled" || st === "failed") {
        clearPending();
        setOpen(false);
        return;
      }
      setPhase("unpaid");
    } finally {
      busyRef.current = false;
    }
  }, [navigate]);

  // 画面表示時・ページ切替時・アプリに戻ってきた時（タブ復帰／戻るボタン）に確認
  useEffect(() => {
    if (skip) return;
    run();
  }, [skip, loc.pathname, run]);

  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState === "visible" && !SKIP_PATHS.some((p) => window.location.pathname.startsWith(p))) {
        run();
      }
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) onBack();
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("pageshow", onShow);
    };
  }, [run]);

  useEffect(() => {
    if (!open) return;
    const key = "pending-payment-notice";
    lockScroll(key);
    return () => unlockScroll(key);
  }, [open]);

  if (!open || !pending || skip) return null;

  const resumable = canResume(pending);
  const yen = Number(pending.total || 0);

  const onResume = () => {
    if (!pending.paypayUrl) return;
    // 再開：PayPayへ移動（戻ってきたら PayPayReturn / この案内で再確認）
    window.location.href = pending.paypayUrl;
  };

  const onRecheck = async () => {
    snoozeRef.current = 0;
    await run();
  };

  const onCancel = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase("canceling");
    try {
      const st = await cancelPending(pending);
      if (st === "paid") {
        clearPending();
        setOpen(false);
        navigate(completeUrl(pending), { replace: true });
        return;
      }
      if (st === "canceled") {
        clearPending();
        setDoneMsg("注文を取り消しました。カートの商品はそのまま残っています。");
        setPhase("done");
        return;
      }
      setDoneMsg("取り消しの確認ができませんでした。通信状況を確認して、もう一度お試しください。");
      setPhase("unpaid");
    } finally {
      busyRef.current = false;
    }
  };

  const onLater = () => {
    // 5分間は再表示しない（支払い状況はサーバー側でも自動確認されます）
    snoozeRef.current = Date.now() + 5 * 60 * 1000;
    setOpen(false);
  };

  const onClose = () => {
    setOpen(false);
    setDoneMsg("");
  };

  return (
    <div className="ppn-back" role="dialog" aria-modal="true" aria-labelledby="ppn-title">
      <div className="ppn-card">
        {phase === "checking" && (
          <div className="ppn-checking">
            <span className="app-spinner" aria-hidden="true" />
            <p id="ppn-title" className="ppn-title">お支払い状況を確認しています…</p>
            <p className="ppn-sub">PayPayでの支払いが完了しているか確認中です</p>
          </div>
        )}

        {(phase === "unpaid" || phase === "canceling") && (
          <>
            <div className="ppn-icon" aria-hidden="true">!</div>
            <p id="ppn-title" className="ppn-title">お支払いが完了していません</p>
            <p className="ppn-sub">
              PayPayでの支払いが確認できませんでした。
              {yen > 0 ? (
                <>
                  <br />
                  お支払い予定：<b>{yen.toLocaleString("ja-JP")}円</b>
                </>
              ) : null}
            </p>
            {doneMsg && <p className="ppn-warn">{doneMsg}</p>}

            <div className="ppn-actions">
              {resumable ? (
                <button type="button" className="ppn-btn ppn-btn--primary" onClick={onResume} disabled={phase === "canceling"}>
                  PayPayで支払いを続ける
                </button>
              ) : null}
              <button type="button" className="ppn-btn" onClick={onRecheck} disabled={phase === "canceling"}>
                支払った場合はこちら（再確認）
              </button>
              <button type="button" className="ppn-btn ppn-btn--danger" onClick={onCancel} disabled={phase === "canceling"}>
                {phase === "canceling" ? (
                  <>
                    <span className="btn-spinner" />
                    取り消し中…
                  </>
                ) : resumable ? (
                  "この注文を取り消す"
                ) : (
                  "この注文を取り消して、もう一度購入する"
                )}
              </button>
              <button type="button" className="ppn-btn ppn-btn--ghost" onClick={onLater} disabled={phase === "canceling"}>
                あとで
              </button>
            </div>
            <p className="ppn-note">
              ※ 支払いを完了しない限り、代金は請求されません。
              {!resumable ? "支払い画面の有効期限が切れているため、取り消してから購入し直してください。" : ""}
            </p>
          </>
        )}

        {phase === "done" && (
          <>
            <div className="ppn-icon ppn-icon--ok" aria-hidden="true">✓</div>
            <p id="ppn-title" className="ppn-title">取り消しました</p>
            <p className="ppn-sub">{doneMsg}</p>
            <div className="ppn-actions">
              <button
                type="button"
                className="ppn-btn ppn-btn--primary"
                onClick={() => {
                  onClose();
                  navigate("/cart");
                }}
              >
                カートを見る
              </button>
              <button type="button" className="ppn-btn ppn-btn--ghost" onClick={onClose}>
                閉じる
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
