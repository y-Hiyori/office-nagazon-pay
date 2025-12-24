import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import QRCode from "react-qr-code";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import "./PayPayQr.css";

type PayPaySession = {
  subtotal: number;
  discountYen: number;
  coupon: string | null;
  total: number;
  items: any[];
  merchantPaymentId: string;
  redirectUrl: string;
  deeplink?: string | null;
  orderId: string;
  token: string;
};

function isMobileUA() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android/i.test(ua);
}

export default function PayPayQr() {
  const navigate = useNavigate();
  const location = useLocation();

  const [data, setData] = useState<PayPaySession | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>("支払い待ち…");
  const [checking, setChecking] = useState(false);

  // state -> sessionStorage の順で復元
  useEffect(() => {
    const fromState = (location.state as any)?.paypay as PayPaySession | undefined;
    if (fromState?.merchantPaymentId && fromState?.redirectUrl) {
      setData(fromState);
      return;
    }

    const raw = sessionStorage.getItem("paypayCheckout");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PayPaySession;
      if (parsed?.merchantPaymentId && parsed?.redirectUrl) {
        setData(parsed);
      }
    } catch {
      // ignore
    }
  }, [location.state]);

  const mobile = useMemo(() => isMobileUA(), []);

  // 支払い状況ポーリング（QR決済だとPC側に戻ってこないので必須）
  useEffect(() => {
    if (!data?.merchantPaymentId) return;

    let alive = true;

    const tick = async () => {
      try {
        const res = await fetch("/api/paypay-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchantPaymentId: data.merchantPaymentId }),
        });

        if (!res.ok) return;

        const j = await res.json().catch(() => null) as any;
        if (!alive || !j) return;

        if (j.paid === true || j.status === "COMPLETED") {
          setStatusMsg("支払い完了！画面を移動します…");

          // 購入完了ページへ（あなたのアプリ構成に合わせて）
          navigate(`/purchase-complete/${data.orderId}`, { replace: true });
          return;
        }

        if (j.status === "CANCELED" || j.status === "FAILED") {
          setStatusMsg(`支払い失敗: ${j.status}`);
        } else {
          setStatusMsg("支払い待ち…（PayPayで支払うと自動で反映されます）");
        }
      } catch {
        // ignore
      }
    };

    const id = window.setInterval(tick, 2500);
    tick();

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [data?.merchantPaymentId, data?.orderId, navigate]);

  const openPayPay = () => {
    if (!data) return;
    const link = data.deeplink || data.redirectUrl;
    window.location.href = link;
  };

  const copyLink = async () => {
    if (!data?.redirectUrl) return;
    try {
      await navigator.clipboard.writeText(data.redirectUrl);
      setStatusMsg("リンクをコピーしました");
    } catch {
      setStatusMsg("コピーに失敗しました（手動でURLを選択してコピーしてね）");
    }
  };

  const manualCheck = async () => {
    if (!data?.merchantPaymentId) return;
    setChecking(true);
    try {
      const res = await fetch("/api/paypay-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantPaymentId: data.merchantPaymentId }),
      });
      const j = await res.json().catch(() => null) as any;
      if (j?.paid) {
        setStatusMsg("支払い完了！");
        navigate(`/purchase-complete/${data.orderId}`, { replace: true });
      } else {
        setStatusMsg(`支払い待ち…（status: ${j?.status ?? "unknown"}）`);
      }
    } finally {
      setChecking(false);
    }
  };

  if (!data) {
    return (
      <div className="ppqr-wrap">
        <SiteHeader />
        <main className="ppqr-main">
          <div className="ppqr-card">
            <h2 className="ppqr-title">PayPay決済</h2>
            <p className="ppqr-sub">決済情報が見つかりませんでした。</p>
            <button className="ppqr-btn" onClick={() => navigate("/checkout")}>
              チェックアウトへ戻る
            </button>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="ppqr-wrap">
      <SiteHeader />

      <main className="ppqr-main">
        <div className="ppqr-card">
          <h2 className="ppqr-title">PayPayでお支払い</h2>
          <div className="ppqr-status">{statusMsg}</div>

          <div className="ppqr-grid">
            <div className="ppqr-qrbox">
              <QRCode value={data.redirectUrl} size={220} />
              <div className="ppqr-qrhint">
                {mobile
                  ? "スマホなら「PayPayで開く」を押してね"
                  : "スマホでQRを読み取って支払ってください"}
              </div>
            </div>

            <div className="ppqr-actions">
              <button className="ppqr-btn" onClick={openPayPay}>
                PayPayで開く
              </button>
              <button className="ppqr-btn sub" onClick={copyLink}>
                リンクをコピー
              </button>
              <button className="ppqr-btn sub" onClick={manualCheck} disabled={checking}>
                {checking ? "確認中…" : "支払い状況を確認"}
              </button>

              <div className="ppqr-meta">
                <div>注文ID: {data.orderId}</div>
                <div>決済ID: {data.merchantPaymentId}</div>
              </div>

              <button
                className="ppqr-btn danger"
                onClick={() => navigate("/checkout")}
              >
                キャンセルして戻る
              </button>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}