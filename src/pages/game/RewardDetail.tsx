// src/pages/game/RewardDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import "./RewardDetail.css";
import { supabase } from "../../lib/supabase";
import { getOrCreateDeviceId } from "./lib/guestName";

type RewardRow = {
  id: string;
  is_active: boolean | null;
  store_name: string | null;
  store_info: string | null;
  product_name: string | null;
  score_threshold: number | null;
  coupon_title: string | null;
  description: string | null;
  valid_from: string | null;
  valid_to: string | null;
};

type Ui =
  | { status: "loading" }
  | { status: "ready"; reward: RewardRow }
  | { status: "error"; message: string };

type IssuedState =
  | { status: "checking" }
  | { status: "none" }
  | { status: "has"; token: string };

function formatDateTime(s?: string | null) {
  if (!s) return "（未設定）";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

async function fetchIssuedTokenByApi(args: {
  rewardId: string;
  deviceId: string;
}): Promise<{ ok: true; token: string | null } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("coupon-issued", {
      body: { reward_id: args.rewardId, device_id: args.deviceId },
    });
    if (error) return { ok: false, error: error.message };

    const obj = (data ?? null) as Record<string, unknown> | null;
    const ok = obj?.ok === true;
    if (!ok) return { ok: false, error: String(obj?.error ?? "coupon-issued failed") };

    const token = typeof obj?.token === "string" ? obj.token : null;
    return { ok: true, token };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export default function RewardDetail() {
  const nav = useNavigate();
  const { id } = useParams();

  const rewardId = useMemo(() => (id ?? "").trim(), [id]);
  const [ui, setUi] = useState<Ui>({ status: "loading" });

  const [issued, setIssued] = useState<IssuedState>({ status: "checking" });
  const [issuedErr, setIssuedErr] = useState<string | null>(null);

  // ① reward 本体
  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!rewardId) {
        setUi({ status: "error", message: "reward_id がありません" });
        return;
      }
      setUi({ status: "loading" });

      const { data, error } = await supabase
        .from("coupon_rewards")
        .select(
          "id,is_active,store_name,store_info,product_name,score_threshold,coupon_title,description,valid_from,valid_to"
        )
        .eq("id", rewardId)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        setUi({ status: "error", message: error.message });
        return;
      }
      if (!data) {
        setUi({ status: "error", message: "報酬が見つかりませんでした" });
        return;
      }

      setUi({ status: "ready", reward: data as RewardRow });
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [rewardId]);

  // ② issued 判定（API）
  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setIssuedErr(null);

      if (!rewardId) {
        setIssued({ status: "none" });
        return;
      }

      setIssued({ status: "checking" });

      const deviceId = getOrCreateDeviceId();
      const res = await fetchIssuedTokenByApi({ rewardId, deviceId });

      if (!mounted) return;

      if (!res.ok) {
        setIssuedErr(res.error);
        setIssued({ status: "none" }); // 失敗でも未達成扱いにしてUIを崩さない
        return;
      }

      if (res.token) setIssued({ status: "has", token: res.token });
      else setIssued({ status: "none" });
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [rewardId]);

  const achieved = issued.status === "has";

  return (
    <div className="rewardDetailPage">
      <SiteHeader />

      <main className="rewardDetailMain">
        <div className="rewardDetailWrap">
          <div className="rewardDetailCard">
            <div className="rewardDetailHead">
              <div className="rewardDetailTitle">🎁 報酬の詳細</div>
              <div className="rewardDetailSub">
                条件を達成するとクーポンが発行されます（報酬ごとに端末1回）
              </div>
            </div>

            {ui.status === "loading" && <div className="rewardDetailBody">読み込み中…</div>}

            {ui.status === "error" && (
              <div className="rewardDetailBody">
                <div className="rewardErr">エラー：{ui.message}</div>
                <div className="rewardDetailBtns">
                  <button type="button" className="rBtn ghost" onClick={() => nav("/game")}>
                    ゲームへ戻る
                  </button>
                </div>
              </div>
            )}

            {ui.status === "ready" && (
              <>
                {/* ✅ ステータス帯（ボタンは「達成済み」だけ） */}
                <div className="rewardStatusBar">
                  {issued.status === "checking" ? (
                    <div className="rewardStatusLeft">
                      <div className="rewardStatusTitle">
                        <span className="badge">確認中…</span>
                      </div>
                      <div className="rewardStatusText">獲得状況を確認しています…</div>
                      {issuedErr ? (
                        <div className="rewardStatusText" style={{ color: "rgba(255,160,160,0.95)" }}>
                          取得失敗：{issuedErr}
                        </div>
                      ) : null}
                    </div>
                  ) : achieved ? (
                    <>
                      <div className="rewardStatusLeft">
                        <div className="rewardStatusTitle">
                          <span className="badge ok">達成済み</span>
                        </div>
                        <div className="rewardStatusText">
                          この報酬は獲得済みです。クーポン詳細（QR）を開けます。
                        </div>
                      </div>

                      <div className="rewardStatusActions">
                        <button
                          type="button"
                          className="rBtn"
                          onClick={() =>
                            nav(
                              `/game/coupon?token=${encodeURIComponent(
                                (issued as { status: "has"; token: string }).token
                              )}`
                            )
                          }
                        >
                          クーポンを開く
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="rewardStatusLeft">
                      <div className="rewardStatusTitle">
                        <span className="badge ng">未達成</span>
                      </div>
                      <div className="rewardStatusText">
                        まだこの報酬は獲得していません（ゲーム終了時に条件を満たすと発行されます）
                      </div>
                    </div>
                  )}
                </div>

                <div className="rewardDetailBody">
                  <div className="rewardGrid">
                    <div className="rewardBlock">
                      <div className="rewardBlockTitle">条件</div>

                      <div className="rewardRow">
                        <div className="k">必要スコア</div>
                        <div className="v strong">{ui.reward.score_threshold ?? 0} 点</div>
                      </div>

                      <div className="rewardRow">
                        <div className="k">配布状態</div>
                        <div className="v">
                          {ui.reward.is_active ? (
                            <span className="badge ok">配布中</span>
                          ) : (
                            <span className="badge ng">停止</span>
                          )}
                        </div>
                      </div>

                      <div className="rewardRow">
                        <div className="k">開始</div>
                        <div className="v">{formatDateTime(ui.reward.valid_from)}</div>
                      </div>

                      <div className="rewardRow">
                        <div className="k">期限</div>
                        <div className="v">{formatDateTime(ui.reward.valid_to)}</div>
                      </div>
                    </div>

                    <div className="rewardBlock">
                      <div className="rewardBlockTitle">内容</div>

                      <div className="rewardRow">
                        <div className="k">タイトル</div>
                        <div className="v">{ui.reward.coupon_title?.trim() || "（未設定）"}</div>
                      </div>

                      <div className="rewardRow">
                        <div className="k">店舗名</div>
                        <div className="v">{ui.reward.store_name?.trim() || "（未設定）"}</div>
                      </div>

                      <div className="rewardRow">
                        <div className="k">商品名</div>
                        <div className="v">{ui.reward.product_name?.trim() || "（未設定）"}</div>
                      </div>

                      <div className="rewardRow">
                        <div className="k">説明</div>
                        <div className="v desc">{ui.reward.description?.trim() || "（未設定）"}</div>
                      </div>

                      {ui.reward.store_info?.trim() ? (
                        <div className="rewardRow">
                          <div className="k">店舗情報</div>
                          <div className="v desc">{ui.reward.store_info}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rewardNote">
                    ※この画面は「報酬の内容確認」用です。クーポン発行はゲーム終了時に行われます。
                  </div>
                </div>

                <div className="rewardDetailBtns">
                  <button type="button" className="rBtn ghost" onClick={() => nav("/game")}>
                    ゲームへ戻る
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}