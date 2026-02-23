// src/pages/game/CouponRedeem.tsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "./CouponRedeem.css";
import { confirmCouponRedeem, getCouponStatus } from "./lib/couponApi";

type CouponStatusOkFound = {
  ok: true;
  found: true;
  used: boolean;
  used_at: string | null;
  used_confirmed_at: string | null;
  user_name?: string | null;
  reward?: {
    store_name: string | null;
    store_info: string | null;
    product_name: string | null;
    coupon_title: string | null;
    description: string | null;
    valid_from: string | null;
    valid_to: string | null;
  } | null;
};

type CouponStatus =
  | CouponStatusOkFound
  | { ok: true; found: false }
  | { ok: false; error: string };

type UiState =
  | { status: "checking" }
  | { status: "ready"; used: boolean }
  | { status: "confirming" }
  | { status: "done" }
  | { status: "error"; message: string };

function formatDateTime(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export default function CouponRedeem() {
  const [sp] = useSearchParams();
  const token = useMemo(() => (sp.get("token") ?? "").trim(), [sp]);

  const [ui, setUi] = useState<UiState>({ status: "checking" });
  const [pw, setPw] = useState("");

  const [detail, setDetail] = useState<{
    title: string;
    storeName: string;
    productName: string;
    userName: string;
    usedConfirmedAt: string | null;
  } | null>(null);

  const isConfirming = ui.status === "confirming";
  const isChecking = ui.status === "checking";
  const isError = ui.status === "error";

  const used = (ui.status === "ready" && ui.used === true) || ui.status === "done";
  const canConfirm = ui.status === "ready" && ui.used === false && pw.trim().length >= 4;

  const load = async () => {
    if (!token) {
      setUi({ status: "error", message: "tokenがありません（URLに ?token= が必要）" });
      return;
    }

    setUi({ status: "checking" });

    const st = (await getCouponStatus(token)) as CouponStatus;

    if (!st.ok) {
      setUi({ status: "error", message: st.error });
      return;
    }
    if (st.found === false) {
      setUi({ status: "error", message: "このクーポンは見つかりませんでした" });
      return;
    }

    const r = st.reward ?? null;
    setDetail({
      title: (r?.coupon_title ?? "").trim() || "クーポン",
      storeName: (r?.store_name ?? "").trim() || "（未設定）",
      productName: (r?.product_name ?? "").trim() || "（未設定）",
      userName: (st.user_name ?? "").trim() || "（未設定）",
      usedConfirmedAt: st.used_confirmed_at ?? null,
    });

    if (st.used || st.used_confirmed_at) {
      setUi({ status: "ready", used: true });
      return;
    }
    setUi({ status: "ready", used: false });
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onConfirm = async () => {
    if (!token) return;

    const p = pw.trim();
    if (p.length < 4) {
      setUi({ status: "error", message: "パスワードを入力してください" });
      return;
    }

    setUi({ status: "confirming" });

    const res = await confirmCouponRedeem(token, p);
    if (!res.ok) {
      setUi({ status: "error", message: res.error });
      return;
    }
    if (res.found === false) {
      setUi({ status: "error", message: "このクーポンは見つかりませんでした" });
      return;
    }

    setPw("");
    setUi({ status: "done" });
    void load();
  };

  const badgeText = (() => {
    if (isChecking) return "確認中";
    if (isConfirming) return "処理中";
    if (isError) return "エラー";
    if (used) return "受取済み";
    return "未受取";
  })();

  const badgeCls = (() => {
    if (isChecking || isConfirming) return "tag wait";
    if (isError) return "tag ng";
    if (used) return "tag ok";
    return "tag";
  })();

  return (
    <div className="crPage">
      <main className="crMain">
        <div className="crWrap">
          <div className="crCard">
            <header className="crHead">
              <div className="crHeadTop">
                <div className="crTitle">店舗用 クーポン確認</div>
                <span className={badgeCls}>{badgeText}</span>
              </div>

              {ui.status === "error" ? <div className="crErr">エラー：{ui.message}</div> : null}
            </header>

            <div className="crBody">
              <section className="crPanel">
                <div className="crPanelTitle">クーポン内容</div>
                <div className="crBigTitle">{detail?.title ?? "（読み込み中）"}</div>

                <div className="crRows">
                  <div className="crRow">
                    <div className="crK">店舗名</div>
                    <div className="crV">{detail?.storeName ?? "（読み込み中）"}</div>
                  </div>
                  <div className="crRow">
                    <div className="crK">商品名</div>
                    <div className="crV">{detail?.productName ?? "（読み込み中）"}</div>
                  </div>
                  <div className="crRow">
                    <div className="crK">使用者</div>
                    <div className="crV">{detail?.userName ?? "（読み込み中）"}</div>
                  </div>

                  {detail?.usedConfirmedAt ? (
                    <div className="crRow">
                      <div className="crK">受取確定</div>
                      <div className="crV">{formatDateTime(detail.usedConfirmedAt)}</div>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="crPanel">
                <div className="crPanelTitle">受け取り確定</div>

                {isChecking ? (
                  <div className="crInfo">状態を確認しています…</div>
                ) : used ? (
                  <div className="crDone">
                    <div className="crDoneMark">✅</div>
                    <div className="crDoneText">受け取り済み</div>
                    {detail?.usedConfirmedAt ? (
                      <div className="crDoneSub">{formatDateTime(detail.usedConfirmedAt)}</div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <input
                      className="crPw"
                      type="password"
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      placeholder="店舗パスワード"
                      autoComplete="current-password"
                    />

                    <div className="crActions">
                      <button
                        type="button"
                        className="crBtn primary"
                        onClick={onConfirm}
                        disabled={!canConfirm || isConfirming}
                      >
                        {isConfirming ? "処理中…" : "受け取り完了"}
                      </button>
                    </div>

                    {ui.status === "error" ? <div className="crErrMini">{ui.message}</div> : null}
                  </>
                )}

                {(used || ui.status === "error") && (
                  <div className="crActions" style={{ marginTop: 10 }}>
                    <button type="button" className="crBtn ghost" onClick={() => void load()}>
                      再読み込み
                    </button>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}