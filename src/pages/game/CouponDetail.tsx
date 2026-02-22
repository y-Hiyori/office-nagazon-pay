// src/pages/game/CouponDetail.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
};

type CouponStatus =
  | {
      ok: true;
      found: true;
      used: boolean;
      used_at: string | null;
      used_confirmed_at: string | null;
      reward?: {
        store_name: string | null;
        store_info: string | null;
        product_name: string | null;
        coupon_title: string | null;
        description: string | null;
        valid_from: string | null;
        valid_to: string | null;
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

function extractTokenFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, window.location.origin);
    return u.searchParams.get("token");
  } catch {
    return null;
  }
}

function buildRedeemUrl(token: string) {
  return `${window.location.origin}/game/coupon-redeem?token=${encodeURIComponent(token)}`;
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

  const [coupon, setCoupon] = useState<IssuedCouponView | null>(null);
  const [status, setStatus] = useState<CouponStatus | null>(null);

  const tokenRef = useRef<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
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
  }, []);

  const title = useMemo(() => coupon?.title ?? "クーポン", [coupon]);

  const refreshStatus = async () => {
    const token = tokenRef.current;
    if (!token) {
      setStatus({
        ok: false,
        error: "tokenが見つかりません（redeem_urlにtokenが必要 / code(token)も必要）",
      });
      return;
    }

    const res = await getCouponStatus(token);
    setStatus(res as CouponStatus);

    // ✅ ここが本命：reward が取れたら、（未設定）を自動で埋める
    if (res.ok && res.found === true && res.reward && coupon) {
      const needFix =
        !(coupon.store_name ?? "").trim() ||
        !(coupon.product_name ?? "").trim() ||
        !(coupon.description ?? "").trim();

      if (needFix) {
        const next: IssuedCouponView = {
          ...coupon,
          store_name: res.reward.store_name ?? coupon.store_name ?? null,
          store_info: res.reward.store_info ?? coupon.store_info ?? null,
          product_name: res.reward.product_name ?? coupon.product_name ?? null,
          description: res.reward.description ?? coupon.description ?? null,
          valid_from: res.reward.valid_from ?? coupon.valid_from ?? null,
          valid_to: res.reward.valid_to ?? coupon.valid_to ?? null,
          title: coupon.title ?? res.reward.coupon_title ?? "クーポン",
        };
        setCoupon(next);
        safeSetStorage(next);
      }
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

  return (
    <div className="couponDetailPage">
      <SiteHeader />

      <main className="couponDetailMain">
        <div className="couponDetailWrap">
          <div className="couponDetailCard">
            <div className="couponDetailHead">
              <div className="couponDetailTitle">🎉 {title}</div>
              <div className="couponDetailSub">
                {isRedeemed
                  ? "このクーポンは受取済みです"
                  : "QRコードを店舗で提示してください（QR以外では店舗画面を開けません）"}
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
                    {!isRedeemed ? (
                      <>
                        {coupon.qr_png_base64 ? (
                          <img
                            className="couponQrImg"
                            alt="coupon qr"
                            src={`data:image/png;base64,${coupon.qr_png_base64}`}
                          />
                        ) : coupon.qr_svg ? (
                          <div className="couponQrSvg" dangerouslySetInnerHTML={{ __html: coupon.qr_svg }} />
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