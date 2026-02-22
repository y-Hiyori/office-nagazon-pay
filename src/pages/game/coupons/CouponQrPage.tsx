import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "../../../lib/supabase";

type IssueResult =
  | { ok: true; issued: true; token: string; reward: any }
  | { ok: true; issued: false; reason: string; existing_token?: string; reward_id?: string }
  | { ok: false; error: string };

function getBaseUrl() {
  // 本番: window.location.origin
  return window.location.origin;
}

export default function CouponQrPage() {
  // 例：ゲーム終了時に sessionStorage に入れて遷移してくる想定
  // sessionStorage.setItem("lastGameScore", String(score));
  const score = useMemo(() => {
    const v = sessionStorage.getItem("lastGameScore");
    return v ? Number(v) : 0;
  }, []);

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<IssueResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase.functions.invoke("issue-coupon", {
          body: { score },
        });

        if (!alive) return;

        if (error) {
          setResult({ ok: false, error: error.message });
          return;
        }
        setResult(data as IssueResult);

        // 発券成功なら QR 作る（token を開くURL）
        if (data?.ok === true && data?.issued === true) {
          const url = `${getBaseUrl()}/coupon/${encodeURIComponent(data.token)}`;
          const durl = await QRCode.toDataURL(url, { margin: 1, scale: 8 });
          setQrDataUrl(durl);
        }

        // 既に発券済みでも「再表示させたい」ならQR作る（要望次第）
        if (data?.ok === true && data?.issued === false && data?.existing_token) {
          const url = `${getBaseUrl()}/coupon/${encodeURIComponent(data.existing_token)}`;
          const durl = await QRCode.toDataURL(url, { margin: 1, scale: 8 });
          setQrDataUrl(durl);
        }
      } catch (e: any) {
        if (!alive) return;
        setResult({ ok: false, error: String(e?.message ?? e) });
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [score]);

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.title}>クーポン発行</div>
        <div style={styles.sub}>今回のスコア：<b>{score}</b></div>

        {loading && <div style={styles.muted}>確認中...</div>}

        {!loading && result?.ok === false && (
          <div style={styles.error}>エラー：{result.error}</div>
        )}

        {!loading && result?.ok === true && result.issued === false && (
          <div style={styles.box}>
            <div style={styles.muted}>
              {result.reason === "no_reward" && "今回は発行条件に達していません。"}
              {result.reason === "already_issued" && "この端末（IP）からは既に発行済みです。"}
              {result.reason !== "no_reward" && result.reason !== "already_issued" && `発行できません：${result.reason}`}
            </div>

            {qrDataUrl && (
              <>
                <div style={{ ...styles.muted, marginTop: 10 }}>（既存クーポンを再表示）</div>
                <img src={qrDataUrl} alt="coupon qr" style={styles.qr} />
              </>
            )}
          </div>
        )}

        {!loading && result?.ok === true && result.issued === true && (
          <div style={styles.box}>
            <div style={styles.success}>クーポンを発行しました！</div>
            {qrDataUrl && <img src={qrDataUrl} alt="coupon qr" style={styles.qr} />}
            <div style={styles.muted}>
              お店でこのQRを見せてください（読み取り後、使用確認が表示されます）
            </div>
          </div>
        )}

        <div style={styles.actions}>
          <button style={styles.btn} onClick={() => window.location.href = "/game"}>
            ゲームへ戻る
          </button>
          <button style={styles.btn2} onClick={() => window.location.href = "/"}>
            ホームへ
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 16,
    background: "linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0.9))",
  },
  card: {
    width: "min(520px, 100%)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#fff",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  },
  title: { fontSize: 18, fontWeight: 800, letterSpacing: 0.4 },
  sub: { marginTop: 8, opacity: 0.9 },
  muted: { marginTop: 10, opacity: 0.75, fontSize: 13, lineHeight: 1.6 },
  box: {
    marginTop: 14,
    borderRadius: 14,
    padding: 14,
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  qr: {
    width: "min(320px, 80vw)",
    height: "auto",
    display: "block",
    margin: "12px auto 8px",
    borderRadius: 12,
    background: "#fff",
    padding: 10,
  },
  success: { fontWeight: 800, marginBottom: 6 },
  error: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: "rgba(255,0,0,0.12)",
    border: "1px solid rgba(255,0,0,0.25)",
  },
  actions: { display: "flex", gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
  btn2: {
    flex: 1,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    opacity: 0.9,
  },
};