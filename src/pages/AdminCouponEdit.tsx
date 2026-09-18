// src/pages/AdminCouponEdit.tsx
// ✅ v34：セクション分け＋クイック設定＋プレビューで編集しやすく
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { appDialog } from "../lib/appDialog";
import AdminHeader from "../components/AdminHeader";
import "./AdminCouponEdit.css";

type Props = { mode: "new" | "edit" };

type CouponRow = {
  code: string;
  discount_type: "yen" | "percent";
  discount_value: number;
  max_discount_yen: number | null;
  min_subtotal: number | null;
  usage_limit: number | null;
  used_count: number | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  audience: string | null;
  per_user_limit: number | null;
  target_scope: string | null;
};

type ProductRow = { id: number; name: string | null; is_visible: boolean | null };

const toIntOrNull = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return v === "" ? null : Math.trunc(n);
};

const jstDate = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

const jstToday = () => jstDate(new Date().toISOString());

const addDaysYmd = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return jstDate(d.toISOString());
};

const endOfMonthYmd = (ymd: string) => {
  const [y, m] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return `${y}-${String(m).padStart(2, "0")}-${String(last.getUTCDate()).padStart(2, "0")}`;
};

const fmt = (n: number) => n.toLocaleString("ja-JP");

export default function AdminCouponEdit({ mode }: Props) {
  const nav = useNavigate();
  const params = useParams<{ code: string }>();
  const editCode = params.code ? decodeURIComponent(params.code) : "";

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"yen" | "percent">("yen");
  const [discountValue, setDiscountValue] = useState("");
  const [maxDiscountYen, setMaxDiscountYen] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [audience, setAudience] = useState<"all" | "member" | "guest">("all");
  const [perUserLimit, setPerUserLimit] = useState("");
  const [targetScope, setTargetScope] = useState<"all" | "products">("all");
  const [targetIds, setTargetIds] = useState<number[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [prodSearch, setProdSearch] = useState("");
  const [usedCount, setUsedCount] = useState<number | null>(null);

  const title = useMemo(() => (mode === "new" ? "クーポンを作成" : "クーポンを編集"), [mode]);

  useEffect(() => {
    if (mode !== "edit") {
      (async () => {
        const { data: prodData } = await supabase
          .from("products")
          .select("id,name,is_visible")
          .order("id", { ascending: true });
        setProducts((prodData ?? []) as ProductRow[]);
      })();
      return;
    }

    const load = async () => {
      setLoading(true);

      const { data: prodData } = await supabase
        .from("products")
        .select("id,name,is_visible")
        .order("id", { ascending: true });
      setProducts((prodData ?? []) as ProductRow[]);

      const { data, error } = await supabase
        .from("coupons")
        .select(
          "code,discount_type,discount_value,max_discount_yen,min_subtotal,usage_limit,used_count,is_active,starts_at,ends_at,audience,per_user_limit,target_scope"
        )
        .eq("code", editCode)
        .single();

      if (error || !data) {
        console.error(error);
        await appDialog.alert({ message: "読み込みに失敗しました" });
        nav("/admin-coupons");
        return;
      }

      const r = data as CouponRow;
      setCode(r.code);
      setDiscountType(r.discount_type ?? "yen");
      setDiscountValue(r.discount_value == null ? "" : String(r.discount_value));
      setMaxDiscountYen(r.max_discount_yen == null ? "" : String(r.max_discount_yen));
      setMinSubtotal(r.min_subtotal == null ? "" : String(r.min_subtotal));
      setUsageLimit(r.usage_limit == null ? "" : String(r.usage_limit));
      setUsedCount(r.used_count == null ? 0 : Number(r.used_count));
      setIsActive(!!r.is_active);
      setStartsAt(jstDate(r.starts_at));
      setEndsAt(jstDate(r.ends_at));
      setAudience((r.audience as any) ?? "all");
      setPerUserLimit(r.per_user_limit == null ? "" : String(r.per_user_limit));
      setTargetScope((r.target_scope as any) ?? "all");

      const { data: tgt } = await supabase
        .from("coupon_products")
        .select("product_id")
        .eq("code", editCode);
      setTargetIds(((tgt ?? []) as { product_id: number }[]).map((t) => Number(t.product_id)));

      setLoading(false);
    };

    load();
  }, [mode, editCode, nav]);

  const validate = () => {
    const c = code.trim().toUpperCase();
    if (!c) return "クーポンコードを入力してください";
    if (!/^[A-Z0-9_-]{3,32}$/.test(c)) return "コードは英数字/ _ - で3〜32文字にしてください";

    const v = Number(discountValue);
    if (!Number.isFinite(v) || v <= 0) return "割引値を入力してください（1以上）";
    if (discountType === "percent" && v > 100) return "％割引は 1〜100 の範囲にしてください";

    if (targetScope === "products" && targetIds.length === 0) return "対象商品を1つ以上選んでください";
    if (startsAt && endsAt && startsAt > endsAt) return "開始日は終了日より前にしてください";
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) {
      setErrMsg(err);
      await appDialog.alert({ message: err });
      return;
    }
    setErrMsg("");

    const c = code.trim().toUpperCase();
    setSaving(true);

    const payload: Record<string, any> = {
      code: c,
      discount_type: discountType,
      discount_value: Math.trunc(Number(discountValue)),
      max_discount_yen: toIntOrNull(maxDiscountYen),
      min_subtotal: toIntOrNull(minSubtotal),
      usage_limit: toIntOrNull(usageLimit),
      is_active: isActive,
      starts_at: startsAt ? new Date(`${startsAt}T00:00:00+09:00`).toISOString() : null,
      ends_at: endsAt ? new Date(`${endsAt}T23:59:59.999+09:00`).toISOString() : null,
      audience,
      per_user_limit: toIntOrNull(perUserLimit),
      target_scope: targetScope,
    };

    if (mode === "new") {
      const { error } = await supabase.from("coupons").insert(payload);
      if (error) {
        console.error(error);
        setErrMsg("作成に失敗しました（同じコードが既にあるかもしれません）");
        await appDialog.alert({ message: "作成に失敗しました（同じコードが既にあるかもしれません）" });
        setSaving(false);
        return;
      }
      await saveTargets(c);
      await appDialog.alert({ message: "クーポンを作成しました" });
      nav("/admin-coupons");
      return;
    }

    const { error } = await supabase.from("coupons").update(payload).eq("code", editCode);
    if (error) {
      console.error(error);
      setErrMsg("更新に失敗しました：" + error.message);
      await appDialog.alert({ message: "更新に失敗しました：" + error.message });
      setSaving(false);
      return;
    }
    await saveTargets(c);
    await appDialog.alert({ message: "クーポンを更新しました" });
    nav("/admin-coupons");
  };

  // ✅ 対象商品の保存（全商品なら対象を消す）
  const saveTargets = async (codeValue: string) => {
    await supabase.from("coupon_products").delete().eq("code", codeValue);
    if (targetScope !== "products" || targetIds.length === 0) return;
    const rows = targetIds.map((pid) => ({ code: codeValue, product_id: pid }));
    const { error } = await supabase.from("coupon_products").insert(rows);
    if (error) await appDialog.alert({ message: "対象商品の保存に失敗しました: " + error.message });
  };

  const deleteCoupon = async () => {
    const ok = await appDialog.confirm({
      title: "削除確認",
      message:
        `${editCode} を削除しますか？\n` +
        `（これまでの使用：${Number(usedCount ?? 0)}回／対象商品の設定も一緒に削除されます）\n` +
        "元に戻せません。",
      okText: "削除する",
      cancelText: "キャンセル",
    });
    if (!ok) return;
    const { error } = await supabase.from("coupons").delete().eq("code", editCode);
    if (error) {
      await appDialog.alert({ message: "削除に失敗しました: " + error.message });
      return;
    }
    await appDialog.alert({ message: "削除しました" });
    nav("/admin-coupons");
  };

  const shownProducts = useMemo(() => {
    const s = prodSearch.trim().toLowerCase();
    if (!s) return products;
    return products.filter(
      (p) => String(p.id).includes(s) || String(p.name ?? "").toLowerCase().includes(s)
    );
  }, [products, prodSearch]);

  const toggleTarget = (id: number) =>
    setTargetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // ✅ 設定内容のプレビュー（1行で確認できる）
  const preview = useMemo(() => {
    const v = Number(discountValue);
    const disc = Number.isFinite(v) && v > 0
      ? discountType === "percent"
        ? `${fmt(v)}%引き`
        : `${fmt(v)}円引き`
      : "割引未入力";
    const parts = [
      disc,
      minSubtotal.trim() ? `${fmt(Number(minSubtotal))}円以上` : "最低小計なし",
      audience === "member" ? "会員のみ" : audience === "guest" ? "ゲストのみ" : "全員",
      targetScope === "products" ? `対象商品 ${targetIds.length}件` : "全商品",
    ];
    if (perUserLimit.trim()) parts.push(`1人${fmt(Number(perUserLimit))}回まで`);
    if (usageLimit.trim()) parts.push(`全体${fmt(Number(usageLimit))}回まで`);
    if (startsAt || endsAt) {
      parts.push(`${startsAt || "指定なし"}〜${endsAt || "指定なし"}`);
    } else {
      parts.push("期間指定なし");
    }
    return parts.join(" ／ ");
  }, [
    discountValue,
    discountType,
    minSubtotal,
    audience,
    targetScope,
    targetIds.length,
    perUserLimit,
    usageLimit,
    startsAt,
    endsAt,
  ]);

  const setPeriod = (kind: "today" | "week" | "month" | "clear") => {
    const t = jstToday();
    if (kind === "today") {
      setStartsAt(t);
      setEndsAt("");
    } else if (kind === "week") {
      setStartsAt(t);
      setEndsAt(addDaysYmd(t, 6));
    } else if (kind === "month") {
      setStartsAt(t);
      setEndsAt(endOfMonthYmd(t));
    } else {
      setStartsAt("");
      setEndsAt("");
    }
  };

  if (loading) {
    return (
      <>
        <AdminHeader />
        <p className="ac-loading">読み込み中...</p>
      </>
    );
  }

  return (
    <>
      <AdminHeader />

      <div className="admin-coupon-edit">
        <div className="ce-head">
          <div>
            <h2 className="ce-title">{title}</h2>
            <p className="ce-lead">
              {mode === "new"
                ? "割引の条件・期間・対象者・対象商品を設定して保存します。"
                : `${editCode} の設定を変更します。`}
            </p>
          </div>
          <button className="btn ghost" onClick={() => nav("/admin-coupons")}>
            一覧へ戻る
          </button>
        </div>

        <div className="ce-preview">
          <span className="ce-preview-label">この内容で保存</span>
          <span className="ce-preview-text">{preview}</span>
        </div>

        {/* ---------- 1. 基本 ---------- */}
        <section className="ce-card">
          <h3 className="ce-card-title">
            <span className="ce-no">1</span>基本設定
          </h3>
          <div className="ce-grid">
            <label className="ce-field">
              <span className="lab">
                クーポンコード<span className="req">必須</span>
              </span>
              <input
                className="input mono"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="例：NAGAZON30"
                disabled={mode === "edit"}
              />
              <span className="hint">
                英数字 / _ - で3〜32文字{mode === "edit" ? "（コードは変更できません）" : ""}
              </span>
            </label>

            <label className="ce-field">
              <span className="lab">有効・停止</span>
              <div className="ce-switch">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  <span>{isActive ? "有効（使用できます）" : "停止中（使用できません）"}</span>
                </label>
              </div>
              <span className="hint">保存すると、すぐに購入画面で使える／使えないが切り替わります。</span>
            </label>
          </div>
        </section>

        {/* ---------- 2. 割引 ---------- */}
        <section className="ce-card">
          <h3 className="ce-card-title">
            <span className="ce-no">2</span>割引の内容
          </h3>
          <div className="ce-grid">
            <label className="ce-field">
              <span className="lab">
                割引タイプ<span className="req">必須</span>
              </span>
              <select
                className="input"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as any)}
              >
                <option value="yen">円（◯円引き）</option>
                <option value="percent">％（◯%引き）</option>
              </select>
            </label>

            <label className="ce-field">
              <span className="lab">
                割引値<span className="req">必須</span>
              </span>
              <input
                className="input"
                inputMode="numeric"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "percent" ? "例：30" : "例：500"}
              />
              <span className="hint">
                {discountType === "percent" ? "30 → 30%オフ" : "500 → 500円引き"}
              </span>
            </label>

            <label className="ce-field">
              <span className="lab">割引上限（任意）</span>
              <input
                className="input"
                inputMode="numeric"
                value={maxDiscountYen}
                onChange={(e) => setMaxDiscountYen(e.target.value)}
                placeholder="例：1000"
              />
              <span className="hint">％のときの上限額。円のときは空欄でOK。</span>
            </label>

            <label className="ce-field">
              <span className="lab">最低小計（任意）</span>
              <input
                className="input"
                inputMode="numeric"
                value={minSubtotal}
                onChange={(e) => setMinSubtotal(e.target.value)}
                placeholder="例：3000"
              />
              <span className="hint">この金額以上でないと使えません。</span>
            </label>
          </div>
        </section>

        {/* ---------- 3. 期間 ---------- */}
        <section className="ce-card">
          <h3 className="ce-card-title">
            <span className="ce-no">3</span>利用期間
          </h3>
          <div className="ce-quick">
            <button className="btn tiny" onClick={() => setPeriod("today")}>
              今日から
            </button>
            <button className="btn tiny" onClick={() => setPeriod("week")}>
              今日から7日間
            </button>
            <button className="btn tiny" onClick={() => setPeriod("month")}>
              今月末まで
            </button>
            <button className="btn tiny ghost" onClick={() => setPeriod("clear")}>
              期間をクリア
            </button>
          </div>
          <div className="ce-grid">
            <label className="ce-field">
              <span className="lab">開始日</span>
              <input
                className="input"
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
              <span className="hint">空欄なら「いつからでも」</span>
            </label>
            <label className="ce-field">
              <span className="lab">終了日</span>
              <input
                className="input"
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
              <span className="hint">
                {endsAt
                  ? `${endsAt} の 23:59 まで有効（日本時間）`
                  : "空欄なら「ずっと有効」"}
              </span>
            </label>
          </div>
        </section>

        {/* ---------- 4. 誰が使えるか ---------- */}
        <section className="ce-card">
          <h3 className="ce-card-title">
            <span className="ce-no">4</span>使える人・回数
          </h3>
          <div className="ce-radios">
            <label className={`ce-radio ${audience === "all" ? "is-on" : ""}`}>
              <input
                type="radio"
                checked={audience === "all"}
                onChange={() => setAudience("all")}
              />
              <span className="ce-radio-body">
                <b>全員</b>
                <i>会員・ゲストどちらでも使えます</i>
              </span>
            </label>
            <label className={`ce-radio ${audience === "member" ? "is-on" : ""}`}>
              <input
                type="radio"
                checked={audience === "member"}
                onChange={() => setAudience("member")}
              />
              <span className="ce-radio-body">
                <b>会員のみ</b>
                <i>アカウント登録してログイン中の方だけ</i>
              </span>
            </label>
            <label className={`ce-radio ${audience === "guest" ? "is-on" : ""}`}>
              <input
                type="radio"
                checked={audience === "guest"}
                onChange={() => setAudience("guest")}
              />
              <span className="ce-radio-body">
                <b>ゲストのみ</b>
                <i>アカウント未登録での購入だけ</i>
              </span>
            </label>
          </div>

          <div className="ce-grid">
            <label className="ce-field">
              <span className="lab">1人あたりの使用回数（任意）</span>
              <input
                className="input"
                inputMode="numeric"
                value={perUserLimit}
                onChange={(e) => setPerUserLimit(e.target.value)}
                placeholder="例：1（同じ人・同じメールで1回だけ）"
              />
              <span className="hint">空欄なら無制限。会員はアカウント、ゲストはメールで判定します。</span>
            </label>

            <label className="ce-field">
              <span className="lab">全体の使用回数上限（任意）</span>
              <input
                className="input"
                inputMode="numeric"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                placeholder="例：100"
              />
              <span className="hint">
                {mode === "edit" && usedCount != null
                  ? `これまで ${fmt(usedCount)}回 使用されています。`
                  : "空欄なら無制限。"}
              </span>
            </label>
          </div>
        </section>

        {/* ---------- 5. 対象商品 ---------- */}
        <section className="ce-card">
          <h3 className="ce-card-title">
            <span className="ce-no">5</span>対象商品
          </h3>

          <div className="ce-radios is-inline">
            <label className={`ce-radio ${targetScope === "all" ? "is-on" : ""}`}>
              <input
                type="radio"
                checked={targetScope === "all"}
                onChange={() => setTargetScope("all")}
              />
              <span className="ce-radio-body">
                <b>全商品（ALL）</b>
                <i>カートの小計すべてに適用</i>
              </span>
            </label>
            <label className={`ce-radio ${targetScope === "products" ? "is-on" : ""}`}>
              <input
                type="radio"
                checked={targetScope === "products"}
                onChange={() => setTargetScope("products")}
              />
              <span className="ce-radio-body">
                <b>対象商品を選ぶ</b>
                <i>選んだ商品の小計にだけ適用（複数選択できます）</i>
              </span>
            </label>
          </div>

          {targetScope === "products" && (
            <div className="ce-target">
              <div className="ce-target-bar">
                <input
                  className="input"
                  value={prodSearch}
                  onChange={(e) => setProdSearch(e.target.value)}
                  placeholder="🔍 商品名・商品IDで検索"
                />
                <button
                  className="btn tiny"
                  onClick={() => setTargetIds(shownProducts.map((p) => p.id))}
                >
                  表示中を全選択
                </button>
                <button className="btn tiny ghost" onClick={() => setTargetIds([])}>
                  選択解除
                </button>
                <span className="ce-target-count">選択中 {targetIds.length}商品</span>
              </div>

              <div className="ce-target-list">
                {shownProducts.map((p) => (
                  <label
                    key={p.id}
                    className={`ce-target-row ${targetIds.includes(p.id) ? "is-on" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={targetIds.includes(p.id)}
                      onChange={() => toggleTarget(p.id)}
                    />
                    <span className="ce-target-id">ID {p.id}</span>
                    <span className="ce-target-name">{p.name || "(名前なし)"}</span>
                    {p.is_visible === false && <span className="ce-target-off">非表示</span>}
                  </label>
                ))}
                {shownProducts.length === 0 && <p className="hint">該当する商品がありません</p>}
              </div>
            </div>
          )}
        </section>

        {errMsg && <p className="ce-err">{errMsg}</p>}

        {/* ---------- 保存バー（追従） ---------- */}
        <div className="ce-savebar">
          <span className="ce-savebar-text">{preview}</span>
          <div className="ce-savebar-actions">
            {mode === "edit" && (
              <button className="btn danger" onClick={deleteCoupon} disabled={saving}>
                このクーポンを削除
              </button>
            )}
            <button className="btn ghost" onClick={() => nav("/admin-coupons")} disabled={saving}>
              キャンセル
            </button>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? "保存中..." : mode === "new" ? "作成する" : "変更を保存"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
