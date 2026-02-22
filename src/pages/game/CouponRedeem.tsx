import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import "./CouponDetail.css";
import { confirmCouponRedeem, getCouponStatus } from "./lib/couponApi";

type UiState =
  | { status: "checking" }
  | { status: "ready"; used: boolean }
  | { status: "confirming" }
  | { status: "done" }
  | { status: "error"; message: string };

export default function CouponRedeem() {
  const nav = useNavigate();
  const [sp] = useSearchParams();

  const token = useMemo(() => sp.get("token") ?? "", [sp]);
  const [ui, setUi] = useState<UiState>({ status: "checking" });

  // ✅ 追加：店舗パスワード
  const [pw, setPw] = useState("");

  const load = async () => {
    if (!token) {
      setUi({ status: "error", message: "tokenがありません（URLに ?token= が必要）" });
      return;
    }
    setUi({ status: "checking" });

    const st = await getCouponStatus(token);
    if (!st.ok) {
      setUi({ status: "error", message: st.error });
      return;
    }
    if (st.found === false) {
      setUi({ status: "error", message: "このtokenは見つかりませんでした" });
      return;
    }

    if (st.used || st.used_confirmed_at) {
      setUi({ status: "ready", used: true });
      return;
    }
    setUi({ status: "ready", used: false });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onConfirm = async () => {
    if (!token) return;

    const p = pw.trim();
    if (p.length < 4) {
      setUi({ status: "error", message: "パスワードを入力してください（4文字以上）" });
      return;
    }

    setUi({ status: "confirming" });

    const res = await confirmCouponRedeem(token, p);
    if (!res.ok) {
      setUi({ status: "error", message: res.error });
      return;
    }
    if (res.found === false) {
      setUi({ status: "error", message: "このtokenは見つかりませんでした" });
      return;
    }
    setUi({ status: "done" });
  };

  const canConfirm = ui.status === "ready" && ui.used === false && pw.trim().length >= 4;

  return (
    <div className="couponDetailPage">
      <SiteHeader />

      <main className="couponDetailMain">
        <div className="couponDetailWrap">
          <div className="couponDetailCard">
            <div className="couponDetailHead">
              <div className="couponDetailTitle">🏬 店舗用：クーポン確認</div>
              <div className="couponDetailSub">
                お客さんのQRを読み取った後、この画面で確定してください（パスワード必須）
              </div>
            </div>

            <div className="couponDetailBody">
              <div className="couponInfo">
                <div className="couponInfoRow">
                  <div className="k">token</div>
                  <div className="v" style={{ wordBreak: "break-all" }}>
                    {token || "（なし）"}
                  </div>
                </div>

                {/* ✅ 追加：パスワード入力 */}
                <div className="couponInfoRow" style={{ marginTop: 10 }}>
                  <div className="k">パスワード</div>
                  <div className="v">
                    <input
                      className="input"
                      type="password"
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      placeholder="店舗用パスワード"
                      autoComplete="current-password"
                      style={{
                        width: "100%",
                        maxWidth: 320,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.15)",
                        background: "rgba(255,255,255,0.06)",
                        color: "#fff",
                      }}
                    />
                    <div className="couponAltNote" style={{ marginTop: 6 }}>
                      ※クーポン設定時のパスワード（4文字以上）
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                {ui.status === "checking" && "状態確認中…"}
                {ui.status === "confirming" && "受け取り確定中…"}
                {ui.status === "done" && <div style={{ fontWeight: 900 }}>✅ 受け取り完了しました</div>}
                {ui.status === "ready" && ui.used && <div style={{ fontWeight: 900 }}>✅ すでに受取済みです</div>}
                {ui.status === "error" && <div style={{ color: "#ff6b6b" }}>エラー：{ui.message}</div>}
              </div>
            </div>

            <div className="couponDetailBtns">
              <button type="button" className="cBtn ghost" onClick={() => nav("/")}>
                TOPへ
              </button>

              {ui.status === "ready" && ui.used === false ? (
                <button type="button" className="cBtn" onClick={onConfirm} disabled={!canConfirm}>
                  受け取り完了
                </button>
              ) : null}

              {ui.status === "done" ? (
                <button type="button" className="cBtn" onClick={() => load()}>
                  状態を再読み込み
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}