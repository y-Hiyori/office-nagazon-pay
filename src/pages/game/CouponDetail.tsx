// src/pages/game/CouponDetail.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import QRCode from "react-qr-code";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import "./CouponDetail.css";
import { getCouponStatus } from "./lib/couponApi";

type IssuedCouponView = {
  title?: string | null;
  code?: string | null; // token

  qr_png_base64?: string | null;
  qr_svg?: string | null;

  redeem_url?: string | null;
  expires_at?: string | null;

  store_name?: string | null;
  store_info?: string | null;
  product_name?: string | null;
  description?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;

  coupon_code?: string | null; // 管理画面で設定した表示用コード
  display_mode?: string | null; // qr / code

  // ✅ 表示用（あれば出す）
  user_name?: string | null;
  is_guest?: boolean | null;
};

type CouponStatus =
  | {
      ok: true;
      found: true;
      used: boolean;
      used_at: string | null;
      used_confirmed_at: string | null;

      // ✅ ここを couponApi 側で返せるなら表示できる
      user_name?: string | null;
      is_guest?: boolean | null;

      reward?: {
        store_name: string | null;
        store_info: string | null;
        product_name: string | null;
        coupon_title: string | null;
        description: string | null;
        valid_from: string | null;
        valid_to: string | null;
        coupon_code?: string | null;
        difficulty?: string | null;
        display_mode?: string | null;
      } | null;
    }
  | { ok: true; found: false }
  | { ok: false; error: string };

const STORAGE_KEY = "game_last_coupon_v1";

function formatDateTime(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function buildRedeemUrl(token: string) {
  return `${window.location.origin}/game/coupon-redeem?token=${encodeURIComponent(token)}`;
}

function extractTokenFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, window.location.origin);
    return u.searchParams.get("token");
  } catch {
    return null;
  }
}

function safeSetStorage(v: IssuedCouponView) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // ignore
  }
}

export default function CouponDetail() {
  const nav = useNavigate();
  const [sp] = useSearchParams();

  // ✅ ① tokenがURLにあれば最優先（一覧→個別遷移で使う）
  const tokenFromQuery = useMemo(() => (sp.get("token") ?? "").trim(), [sp]);

  const [coupon, setCoupon] = useState<IssuedCouponView | null>(null);
  const [status, setStatus] = useState<CouponStatus | null>(null);

  const tokenRef = useRef<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  // ✅ 初期読み込み：token(query)→なければsessionStorage
  useEffect(() => {
    // query token があるなら sessionStorage に依存しない
    if (tokenFromQuery) {
      tokenRef.current = tokenFromQuery;
      const base: IssuedCouponView = {
        code: tokenFromQuery,
        redeem_url: buildRedeemUrl(tokenFromQuery),
      };
      setCoupon(base);
      return;
    }

    // 従来：sessionStorage の最後の1枚
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setCoupon(null);
        return;
      }
      const parsed = JSON.parse(raw) as IssuedCouponView;

      const tokenFromUrl = extractTokenFromUrl(parsed.redeem_url);
      const tokenFromCode = (parsed.code ?? "").trim();
      const token = tokenFromUrl || (tokenFromCode.length >= 10 ? tokenFromCode : null);

      tokenRef.current = token;

      const fixed: IssuedCouponView = {
        ...parsed,
        redeem_url: parsed.redeem_url ?? (token ? buildRedeemUrl(token) : null),
      };
      setCoupon(fixed);
    } catch {
      setCoupon(null);
    }
  }, [tokenFromQuery]);

  const title = useMemo(() => coupon?.title ?? "クーポン", [coupon]);

  const refreshStatus = async () => {
    const token = tokenRef.current;
    if (!token) {
      setStatus({
        ok: false,
        error: "tokenが見つかりません（URLに ?token= が必要）",
      });
      return;
    }

    const res = (await getCouponStatus(token)) as CouponStatus;
    setStatus(res);

    // ✅ reward が取れたら coupon の表示を補完
    if (res.ok && res.found === true && res.reward && coupon) {
      const next: IssuedCouponView = {
        ...coupon,
        store_name: res.reward.store_name ?? coupon.store_name ?? null,
        store_info: res.reward.store_info ?? coupon.store_info ?? null,
        product_name: res.reward.product_name ?? coupon.product_name ?? null,
        description: res.reward.description ?? coupon.description ?? null,
        valid_from: res.reward.valid_from ?? coupon.valid_from ?? null,
        valid_to: res.reward.valid_to ?? coupon.valid_to ?? null,
        expires_at: coupon.expires_at ?? res.reward.valid_to ?? null,
        title: coupon.title ?? res.reward.coupon_title ?? "クーポン",
        coupon_code: res.reward.coupon_code ?? coupon.coupon_code ?? null,
        display_mode: res.reward.display_mode ?? coupon.display_mode ?? null,
        // ✅ 使用者名も返ってくるなら保存してOK
        user_name: res.user_name ?? coupon.user_name ?? null,
        is_guest: typeof res.is_guest === "boolean" ? res.is_guest : coupon.is_guest ?? null,
      };

      setCoupon(next);
      safeSetStorage(next);
    }
  };

  useEffect(() => {
    if (!coupon) return;

    refreshStatus();

    if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = window.setInterval(() => {
      refreshStatus();
    }, 2500);

    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupon]);

  const isRedeemed =
    status?.ok === true &&
    status.found === true &&
    (status.used === true || !!status.used_confirmed_at);

  const statusBadge = useMemo(() => {
    if (!status) return { cls: "badge wait", text: "確認中…" };
    if (status.ok === false) return { cls: "badge ng", text: "エラー" };
    if (status.found === false) return { cls: "badge ng", text: "見つかりません" };
    if (isRedeemed) return { cls: "badge ok", text: "受取済み" };
    return { cls: "badge", text: "未受取" };
  }, [status, isRedeemed]);

  const storeName = (coupon?.store_name ?? "").trim();
  const productName = (coupon?.product_name ?? "").trim();
  const description = (coupon?.description ?? "").trim();
  const couponCode = (coupon?.coupon_code ?? "").trim();
  const displayMode = (coupon?.display_mode ?? "qr").trim() || "qr";
  const showCode = displayMode === "code" && !!couponCode;
  const [copied, setCopied] = useState(false);
  const copyCode = async () => {
    if (!couponCode) return;
    try {
      await navigator.clipboard.writeText(couponCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const who =
    ((status?.ok === true && status.found === true ? status.user_name : null) ??
      (coupon?.user_name ?? null) ??
      "")
      .trim();

  return (
    <div className="couponDetailPage">
      <SiteHeader />

      <main className="couponDetailMain">
        <div className="couponDetailWrap">
          <div className="couponDetailCard">
            <div className="couponDetailHead">
              <div className="couponDetailTitle">🎉 {title}</div>
              <div className="couponDetailSub">
                {showCode
                  ? "購入手続きでコードを入力すると割引が受けられます"
                  : isRedeemed
                    ? "このクーポンは受取済みです"
                    : "QRコードを店舗で提示してください（店舗側で受け取り完了を押すと受取済みになります）"}
              </div>
            </div>

            {!coupon ? (
              <div className="couponDetailEmpty">
                クーポンが見つかりませんでした。
                <div className="couponDetailBtns">
                  <button type="button" className="cBtn ghost" onClick={() => nav("/game")}>
                    ゲームへ戻る
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="couponDetailBody">
                  {/* 左：QR */}
                  <div className="couponQrCol">
                    {showCode ? (
                      <div className="couponCodeBox">
                        <div className="couponCodeLabel">割引クーポンコード</div>
                        <div className="couponCodeValue">{couponCode}</div>
                        <button type="button" className="couponCopyBtn" onClick={() => void copyCode()}>
                          {copied ? "コピーしました ✓" : "コードをコピー"}
                        </button>
                        <div className="couponCodeHint">
                          購入手続きのお会計でクーポン欄にこのコードを入力すると、割引が受けられます。
                        </div>
                      </div>
                    ) : !isRedeemed ? (
                      <>
                        {coupon.qr_png_base64 ? (
                          <img
                            className="couponQrImg"
                            alt="coupon qr"
                            src={`data:image/png;base64,${coupon.qr_png_base64}`}
                          />
                        ) : coupon.qr_svg ? (
                          <div
                            className="couponQrSvg"
                            dangerouslySetInnerHTML={{ __html: coupon.qr_svg }}
                          />
                        ) : coupon.redeem_url ? (
                          <div className="couponQrReact">
                            <QRCode value={coupon.redeem_url} size={220} />
                          </div>
                        ) : (
                          <div className="couponAlt">
                            <div className="couponAltNote">（QR情報の受け取り待ち）</div>
                          </div>
                        )}
                        <div className="couponQrHint">
                          店舗スタッフがこのQRを読み取って
                          <br />
                          「受け取り完了」を押すと受取済みになります
                        </div>
                      </>
                    ) : (
                      <div className="couponAlt">
                        <div className="couponAltNote">✅ 受取済みのため、QRコードは表示されません</div>
                      </div>
                    )}
                  </div>

                  {/* 右：情報 */}
                  <div className="couponInfo">
                    <div className="couponInfoBlock">
                      <div className="couponInfoBlockTitle">ステータス</div>

                      <div className="couponInfoRow">
                        <div className="k">状態</div>
                        <div className="v">
                          <span className={statusBadge.cls}>{statusBadge.text}</span>
                          {status?.ok === false ? (
                            <span style={{ marginLeft: 10, color: "#ff8f8f", fontSize: 12, fontWeight: 800 }}>
                              {status.error}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {who ? (
                        <div className="couponInfoRow">
                          <div className="k">使用者</div>
                          <div className="v">{who}</div>
                        </div>
                      ) : null}

                      {status?.ok === true && status.found === true && status.used_confirmed_at ? (
                        <div className="couponInfoRow">
                          <div className="k">受取確定</div>
                          <div className="v">{formatDateTime(status.used_confirmed_at)}</div>
                        </div>
                      ) : null}

                      {coupon.expires_at || coupon.valid_to ? (
                        <div className="couponInfoRow">
                          <div className="k">有効期限</div>
                          <div className="v">{formatDateTime(coupon.expires_at ?? coupon.valid_to)}</div>
                        </div>
                      ) : null}
                    </div>

                    <div className="couponInfoBlock">
                      <div className="couponInfoBlockTitle">クーポン内容</div>

                      <div className="couponInfoRow">
                        <div className="k">店舗名</div>
                        <div className="v">{storeName || "（未設定）"}</div>
                      </div>

                      <div className="couponInfoRow">
                        <div className="k">商品名</div>
                        <div className="v">{productName || "（未設定）"}</div>
                      </div>

                      <div className="couponInfoRow">
                        <div className="k">説明</div>
                        <div className="v desc">{description || "（未設定）"}</div>
                      </div>

                      {coupon.valid_from ? (
                        <div className="couponInfoRow">
                          <div className="k">開始</div>
                          <div className="v">{formatDateTime(coupon.valid_from)}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="couponDetailBtns">
                  <button type="button" className="cBtn ghost" onClick={() => nav("/game")}>
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