// src/pages/game/CouponsList.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import "./CouponsList.css";

type IssuedCouponView = {
  token: string;
  redeem_url: string;
  qr_png_base64: string | null;
  qr_svg: string | null;
  expires_at: string | null;

  coupon_title: string | null;
  store_name: string | null;
  product_name: string | null;
  description: string | null;
  score_threshold: number | null;
  coupon_code?: string | null;
  display_mode?: string | null;

  user_name?: string | null;
  is_guest?: boolean | null;
};

const STORAGE_KEY_ARRAY = "game_last_coupons_v1";
const STORAGE_KEY_SINGLE = "game_last_coupon_v1";

function safeParseArray(raw: string | null): IssuedCouponView[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x) => x && typeof x.token === "string") as IssuedCouponView[];
  } catch {
    return [];
  }
}

function safeParseSingle(raw: string | null): IssuedCouponView | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as IssuedCouponView;
    if (!v || typeof v.token !== "string") return null;
    return v;
  } catch {
    return null;
  }
}

function formatDateTime(s?: string | null) {
  if (!s) return "（未設定）";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function CouponsList() {
  const nav = useNavigate();
  const [rows, setRows] = useState<IssuedCouponView[]>([]);

  useEffect(() => {
    // ✅ まず配列（複数）を読む
    const arr = safeParseArray(sessionStorage.getItem(STORAGE_KEY_ARRAY));
    if (arr.length > 0) {
      setRows(arr);
      return;
    }
    // ✅ 互換：単体キーしか無い場合も表示できるように
    const one = safeParseSingle(sessionStorage.getItem(STORAGE_KEY_SINGLE));
    if (one) setRows([one]);
  }, []);

  const title = useMemo(() => {
    if (rows.length === 0) return "獲得クーポン";
    return `獲得クーポン（${rows.length}枚）`;
  }, [rows.length]);

  return (
    <div className="couponsListPage">
      <SiteHeader />

      <main className="couponsListMain">
        <div className="couponsListWrap">
          <div className="couponsListCard">
            <div className="couponsListHead">
              <div className="couponsListTitle">🎫 {title}</div>
              <div className="couponsListSub">
                それぞれタップで詳細（QR表示）へ移動できます
              </div>
            </div>

            <div className="couponsListBody">
              {rows.length === 0 ? (
                <div className="couponsEmpty">
                  まだ獲得クーポンがありません。
                </div>
              ) : (
                <div className="couponsGrid">
                  {rows.map((c) => (
                    <button
                      key={c.token}
                      type="button"
                      className="couponItem"
                      onClick={() => nav(`/game/coupon?token=${encodeURIComponent(c.token)}`)}
                    >
                      <div className="couponItemTop">
                        <div className="couponItemTitle">
                          {c.coupon_title?.trim() || "クーポン"}
                        </div>
                        <div className="couponItemBadge">
                          {typeof c.score_threshold === "number"
                            ? `${c.score_threshold}点`
                            : "報酬"}
                        </div>
                      </div>

                      <div className="couponItemMeta">
                        <div className="m">
                          <span className="k">店舗</span>
                          <span className="v">{c.store_name?.trim() || "（未設定）"}</span>
                        </div>
                        {c.product_name?.trim() ? (
                          <div className="m">
                            <span className="k">商品</span>
                            <span className="v">{c.product_name.trim()}</span>
                          </div>
                        ) : null}
                        <div className="m">
                          <span className="k">期限</span>
                          <span className="v">{formatDateTime(c.expires_at)}</span>
                        </div>
                        {(c.display_mode ?? "qr") === "code" && c.coupon_code?.trim() ? (
                          <div className="m">
                            <span className="k">コード</span>
                            <span className="v couponCodeMono">{c.coupon_code.trim()}</span>
                          </div>
                        ) : null}
                      </div>

                      {c.user_name?.trim() ? (
                        <div className="couponItemWho">
                          使用者：{c.user_name}
                        </div>
                      ) : null}

                      <div className="couponItemHint">タップして開く →</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="couponsListBtns">
              <button type="button" className="clBtn ghost" onClick={() => nav("/game")}>
                ゲームへ戻る
              </button>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}