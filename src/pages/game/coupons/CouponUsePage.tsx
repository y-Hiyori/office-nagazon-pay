import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabase";

type RedeemResult =
  | { ok: true; found: false }
  | { ok: true; found: true; used: boolean; used_at?: string | null; reward?: any }
  | { ok: false; error: string };

export default function CouponUsePage() {
  const params = useParams();
  const token = useMemo(() => (params.token ? String(params.token) : ""), [params.token]);

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<RedeemResult | null>(null);

  // 2段階確認用
  const [step, setStep] = useState<"view" | "confirm1" | "confirm2" | "done">("view");
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // 表示用に「redeem結果」を取る代わりに、まずは redeem-coupon を confirm=false で叩く
        // …が、関数側で confirm必須にしているので、ここは “使用ボタンを押したら初めて呼ぶ” 作りにして、
        // 表示は簡易でOK（token存在しない/使用済みはredeem時に分かる）
        if (!alive) return;
        setState({ ok: true, found: true, used: false });
      } catch (e: any) {
        if (!alive) return;
        setState({ ok: false, error: String(e?.message ?? e) });
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [token]);

  const doRedeem = async () => {
    try {
      setRedeeming(true);
      const { data, error } = await supabase.functions.invoke("redeem-coupon", {
        body: { token, confirm: true },
      });

      if (error) {
        setState({ ok: false, error: error.message });
        return;
      }

      const r = data as RedeemResult;
      setState(r);
      setStep("done");
    } catch (e: any) {
      setState({ ok: false, error: String(e?.message ?? e) });
    } finally {
      setRedeeming(false);
    }
  };

  const renderBody = () => {
    if (loading) return <div style={styles.muted}>読み込み中...</div>;
    if (!token) return <div style={styles.error}>不正なQRです（tokenなし）</div>;
    if (state?.ok === false) return <div style={styles.error}>エラー：{state.error}</div>;

    if (step === "done") {
      if (state?.ok === true && "found" in state && state.found === false) {
        return <div style={styles.error}>このクーポンは見つかりませんでした。</div>;
      }
      if (state?.ok === true && "found" in state && state.found === true && state.used) {
        return (
          <div style={styles.usedBox}>
            <div style={styles.usedTitle}>使用済み</div>
            <div style={styles.muted}>このクーポンは既に使用されています。</div>
          </div>
        );
      }
      return (
        <div style={styles.usedBox}>
          <div style={styles.usedTitle}>使用完了</div>
          <div style={styles.muted}>クーポンを使用済みにしました。</div>
        </div>
      );
    }

    if (step === "confirm2") {
      return (
        <div style={styles.box}>
          <div style={styles.warn}>本当に使用しますか？</div>
          <div style={styles.muted}>
            ここで「はい」を押すと <b>取り消しできません</b>。
          </div>
          <div style={styles.actions}>
            <button style={styles.btn2} onClick={() => setStep("view")}>いいえ</button>
            <button style={styles.btnDanger} disabled={redeeming} onClick={doRedeem}>
              {redeeming ? "処理中..." : "はい（使用する）"}
            </button>
          </div>
        </div>
      );
    }

    if (step === "confirm1") {
      return (
        <div style={styles.box}>
          <div style={styles.title2}>クーポンを使用しますか？</div>
          <div style={styles.muted}>
            お店の人と一緒に操作してください。
          </div>
          <div style={styles.actions}>
            <button style={styles.btn2} onClick={() => setStep("view")}>いいえ</button>
            <button style={styles.btn} onClick={() => setStep("confirm2")}>はい</button>
          </div>
        </div>
      );
    }

    // view
    return (
      <div style={styles.box}>
        <div style={styles.title2}>クーポン画面</div>
        <div style={styles.muted}>
          「使用する」を押すと確認が出ます（2回確認）。
        </div>
        <div style={styles.actions}>
          <button style={styles.btn} onClick={() => setStep("confirm1")}>使用する</button>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.header}>NAGAZON クーポン</div>
        {renderBody()}
        <div style={{ ...styles.muted, marginTop: 12, fontSize: 12 }}>
          ※QRをスクショして拡散されると不正使用される可能性があります。必要なら「店員PIN」方式も追加できます。
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
    background: "linear-gradient(180deg, rgba(0,0,0,0.8), rgba(0,0,0,0.95))",
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
  header: { fontSize: 18, fontWeight: 900, letterSpacing: 0.4 },
  box: {
    marginTop: 14,
    borderRadius: 14,
    padding: 14,
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  usedBox: {
    marginTop: 14,
    borderRadius: 14,
    padding: 14,
    background: "rgba(0,255,120,0.08)",
    border: "1px solid rgba(0,255,120,0.22)",
  },
  usedTitle: { fontSize: 18, fontWeight: 900, marginBottom: 4 },
  title2: { fontSize: 16, fontWeight: 900 },
  muted: { marginTop: 10, opacity: 0.75, fontSize: 13, lineHeight: 1.6 },
  warn: { fontSize: 16, fontWeight: 900 },
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
    background: "rgba(255,255,255,0.10)",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  btn2: {
    flex: 1,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    opacity: 0.9,
  },
  btnDanger: {
    flex: 1,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,80,80,0.35)",
    background: "rgba(255,80,80,0.18)",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
};