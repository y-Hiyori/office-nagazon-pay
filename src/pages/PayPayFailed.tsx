import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  cancelPending,
  canResume,
  checkPendingStatus,
  clearPending,
  completeUrl,
  loadPending,
} from "../lib/pendingPayment";
import "./PurchaseComplete.css"; // ✅ 同じCSSを流用

export default function PayPayFailed() {
  const navigate = useNavigate();
  const location = useLocation();

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderId = q.get("orderId") || "";
  const reason = q.get("reason") || "UNKNOWN";

  // この注文の「支払い再開／取り消し」情報（購入手続き時に保存）
  const pending = useMemo(() => {
    const p = loadPending();
    if (!p) return null;
    if (orderId && p.orderId !== orderId) return null;
    return p;
  }, [orderId]);

  const [busy, setBusy] = useState<"" | "check" | "cancel">("");
  const [info, setInfo] = useState("");
  const [canceled, setCanceled] = useState(false);

  const isUnpaid = reason === "UNPAID" || reason.startsWith("TIMEOUT");
  const resumable = !canceled && canResume(pending);

  const goContact = () => {
    const subject = "PayPay決済の確認に失敗しました";
    const detail = `PayPay決済の確認に失敗しました。

【注文ID】
${orderId || "不明"}

【理由】
${reason}

【状況】
・PayPay画面から戻ったあと、決済完了画面が出ない / 決済確認に失敗した

対応をお願いします。`;

    const params = new URLSearchParams();
    if (orderId) params.set("orderId", orderId);
    params.set("reason", reason);
    params.set("subject", subject);
    params.set("detail", detail);

    navigate(`/contact?${params.toString()}`, { replace: true });
  };

  const recheck = async () => {
    if (!pending || busy) return;
    setBusy("check");
    setInfo("");
    try {
      const st = await checkPendingStatus(pending);
      if (st === "paid") {
        clearPending();
        navigate(completeUrl(pending), { replace: true });
        return;
      }
      if (st === "canceled" || st === "failed") {
        clearPending();
        setCanceled(true);
        setInfo("この注文はすでに取り消されています。もう一度購入してください。");
        return;
      }
      setInfo("まだ支払いが確認できません。PayPayで支払いを完了した直後の場合は、数秒待ってからもう一度お試しください。");
    } finally {
      setBusy("");
    }
  };

  const cancel = async () => {
    if (!pending || busy) return;
    setBusy("cancel");
    setInfo("");
    try {
      const st = await cancelPending(pending);
      if (st === "paid") {
        clearPending();
        navigate(completeUrl(pending), { replace: true });
        return;
      }
      if (st === "canceled") {
        clearPending();
        setCanceled(true);
        setInfo("注文を取り消しました。カートの商品はそのまま残っています。");
        return;
      }
      setInfo("取り消しの確認ができませんでした。通信状況を確認して、もう一度お試しください。");
    } finally {
      setBusy("");
    }
  };

  // ---------- 未払いのまま戻ってきた ----------
  if (isUnpaid && (pending || canceled)) {
    return (
      <div className="complete-page">
        <h2>{canceled ? "注文を取り消しました" : "お支払いが完了していません"}</h2>
        <p>注文番号：{orderId || "不明"}</p>

        <div className="complete-box">
          {canceled ? (
            <p>代金は請求されていません。</p>
          ) : (
            <>
              <p>PayPayでの支払いが確認できませんでした。</p>
              {pending?.total ? (
                <p>
                  お支払い予定：<b>{Number(pending.total).toLocaleString("ja-JP")}円</b>
                </p>
              ) : null}
              <p style={{ fontSize: 13 }}>支払いを完了しない限り、代金は請求されません。</p>
            </>
          )}
          {info && (
            <p style={{ marginTop: 12, fontSize: 13, color: "#9a3412", background: "#fff7ed", padding: "10px 12px", borderRadius: 10, textAlign: "left" }}>
              {info}
            </p>
          )}
        </div>

        {canceled ? (
          <>
            <button className="home-btn" type="button" onClick={() => navigate("/cart", { replace: true })}>
              カートへ戻って購入し直す
            </button>
            <button className="home-btn" type="button" onClick={() => navigate("/", { replace: true })}>
              トップへ戻る
            </button>
          </>
        ) : (
          <>
            {resumable && (
              <button
                className="home-btn"
                type="button"
                disabled={!!busy}
                onClick={() => {
                  if (pending?.paypayUrl) window.location.href = pending.paypayUrl;
                }}
              >
                PayPayで支払いを続ける
              </button>
            )}
            <button className="home-btn" type="button" onClick={recheck} disabled={!!busy}>
              {busy === "check" ? (
                <>
                  <span className="btn-spinner" />
                  確認中…
                </>
              ) : (
                "支払った場合はこちら（再確認）"
              )}
            </button>
            <button className="home-btn" type="button" onClick={cancel} disabled={!!busy} style={{ color: "#b91c1c" }}>
              {busy === "cancel" ? (
                <>
                  <span className="btn-spinner" />
                  取り消し中…
                </>
              ) : (
                "この注文を取り消す"
              )}
            </button>
            {!resumable && (
              <p style={{ marginTop: 12, fontSize: 12, color: "#94a3b8", maxWidth: 320 }}>
                支払い画面の有効期限が切れたため、取り消してから購入し直してください。
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  // ---------- その他のエラー ----------
  return (
    <div className="complete-page">
      <h2>決済を確認できませんでした</h2>
      <p>注文番号：{orderId || "不明"}</p>

      <div className="complete-box">
        <p>PayPayでの支払いが完了しているか確認できませんでした。</p>
        <p>支払い済みの場合は「再確認」を押してください。解決しない場合はお問い合わせください。</p>
        {info && <p style={{ marginTop: 10, fontSize: 13, color: "#9a3412" }}>{info}</p>}
        <p style={{ fontSize: 12, opacity: 0.7, wordBreak: "break-all", marginTop: 10 }}>reason：{reason}</p>
      </div>

      {pending && (
        <button className="home-btn" type="button" onClick={recheck} disabled={!!busy}>
          {busy === "check" ? (
            <>
              <span className="btn-spinner" />
              確認中…
            </>
          ) : (
            "支払いを再確認"
          )}
        </button>
      )}
      <button className="home-btn" onClick={goContact} type="button">
        お問い合わせへ
      </button>
      <button className="home-btn" onClick={() => navigate("/", { replace: true })} type="button">
        トップへ戻る
      </button>
    </div>
  );
}
