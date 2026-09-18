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

const jstDate = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return p;
};


const toIntOrNull = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return v === "" ? null : Math.trunc(n);
};

export default function AdminCouponEdit({ mode }: Props) {
  const nav = useNavigate();
  const params = useParams<{ code: string }>();
  const editCode = params.code ? decodeURIComponent(params.code) : "";

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);

  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"yen" | "percent">("yen");
  const [discountValue, setDiscountValue] = useState("0");
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

  const title = useMemo(() => (mode === "new" ? "クーポン作成" : "クーポン編集"), [mode]);

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
        .select("code,discount_type,discount_value,max_discount_yen,min_subtotal,usage_limit,used_count,is_active,starts_at,ends_at,audience,per_user_limit,target_scope")
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
      setDiscountValue(String(r.discount_value ?? 0));
      setMaxDiscountYen(r.max_discount_yen == null ? "" : String(r.max_discount_yen));
      setMinSubtotal(r.min_subtotal == null ? "" : String(r.min_subtotal));
      setUsageLimit(r.usage_limit == null ? "" : String(r.usage_limit));
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
    if (!c) return "コードを入力してください";
    if (!/^[A-Z0-9_-]{3,32}$/.test(c)) return "コードは英数字/ _ - で3〜32文字にしてください";

    const v = Number(discountValue);
    if (!Number.isFinite(v) || v <= 0) return "割引値は1以上にしてください";
    if (discountType === "percent" && (v <= 0 || v > 100)) return "％割引は 1〜100 の範囲にしてください";

    if (targetScope === "products" && targetIds.length === 0) {
      return "対象商品を1つ以上選んでください";
    }
    if (startsAt && endsAt && startsAt > endsAt) {
      return "開始日は終了日より前にしてください";
    }
    return null;
  };

  const save = async () => {
    const errMsg = validate();
    if (errMsg) {
      await appDialog.alert({ message: errMsg });
      return;
    }

    const c = code.trim().toUpperCase();
    setSaving(true);

    const payload = {
      code: c,
      discount_type: discountType,
      discount_value: Math.trunc(Number(discountValue)),
      max_discount_yen: toIntOrNull(maxDiscountYen),
      min_subtotal: toIntOrNull(minSubtotal),
      usage_limit: toIntOrNull(usageLimit),
      is_active: isActive,
      // ✅ 日本時間の 00:00 開始 / 23:59:59 終了で保存する
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
        await appDialog.alert({ message: "作成に失敗しました（同じcodeが既にあるかも）" });
        setSaving(false);
        return;
      }
      await saveTargets(c);
      await appDialog.alert({ message: "作成しました" });
      nav("/admin-coupons");
      return;
    }

    const { error } = await supabase.from("coupons").update(payload).eq("code", editCode);
    if (error) {
      console.error(error);
      await appDialog.alert({ message: "更新に失敗しました" });
      setSaving(false);
      return;
    }

    await saveTargets(c);
    await appDialog.alert({ message: "更新しました" });
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
      message: `${editCode} を削除しますか？（対象商品の設定も一緒に削除されます／元に戻せません）`,
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

  if (loading) return <p style={{ padding: 16 }}>読み込み中...</p>;

  return (
    <>
      <AdminHeader />

      <div className="admin-coupon-edit" style={{ paddingTop: 80 }}>
        <div className="top">
          <h2>{title}</h2>
          <button className="btn ghost" onClick={() => nav("/admin-coupons")}>一覧へ</button>
        </div>

        <div className="card">
          <div className="grid">
            <label>
              <div className="lab">コード（英数字）</div>
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="例：NAGAZON30"
                disabled={mode === "edit"}
              />
            </label>

            <label>
              <div className="lab">割引タイプ</div>
              <select className="input" value={discountType} onChange={(e) => setDiscountType(e.target.value as any)}>
                <option value="yen">円</option>
                <option value="percent">％</option>
              </select>
            </label>

            <label>
              <div className="lab">割引値</div>
              <input className="input" inputMode="numeric" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
              <div className="hint">{discountType === "percent" ? "例：30（＝30%オフ）" : "例：500（＝500円引き）"}</div>
            </label>

            <label>
              <div className="lab">最大割引（任意）</div>
              <input className="input" inputMode="numeric" value={maxDiscountYen} onChange={(e) => setMaxDiscountYen(e.target.value)} placeholder="例：1000" />
              <div className="hint">％のときに「割引上限」を付けたい場合</div>
            </label>

            <label>
              <div className="lab">最低小計（任意）</div>
              <input className="input" inputMode="numeric" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} placeholder="例：3000" />
            </label>

            <label>
              <div className="lab">使用回数上限（任意）</div>
              <input className="input" inputMode="numeric" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="例：100" />
            </label>

            <label>
              <div className="lab">対象者</div>
              <select className="input" value={audience} onChange={(e) => setAudience(e.target.value as any)}>
                <option value="all">全員（会員・ゲストどちらも）</option>
                <option value="member">会員のみ</option>
                <option value="guest">ゲストのみ</option>
              </select>
              <div className="hint">ゲスト＝アカウント未登録での購入</div>
            </label>

            <label>
              <div className="lab">1人あたりの使用回数上限（任意）</div>
              <input
                className="input"
                inputMode="numeric"
                value={perUserLimit}
                onChange={(e) => setPerUserLimit(e.target.value)}
                placeholder="例：1（同じ人・同じメールで1回だけ）"
              />
              <div className="hint">未入力なら無制限（全体の使用回数上限は下で設定）</div>
            </label>

            <label>
              <div className="lab">開始日（任意）</div>
              <input className="input" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </label>

            <label>
              <div className="lab">終了日（任意）</div>
              <input className="input" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </label>

            <label className="check">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              有効
            </label>
          </div>

          <div className="target">
            <div className="lab">対象商品</div>
            <div className="target-modes">
              <label className="radio">
                <input
                  type="radio"
                  checked={targetScope === "all"}
                  onChange={() => setTargetScope("all")}
                />
                全商品（ALL）
              </label>
              <label className="radio">
                <input
                  type="radio"
                  checked={targetScope === "products"}
                  onChange={() => setTargetScope("products")}
                />
                対象商品を選ぶ（複数選択可）
              </label>
            </div>

            {targetScope === "products" && (
              <>
                <div className="target-bar">
                  <input
                    className="input"
                    value={prodSearch}
                    onChange={(e) => setProdSearch(e.target.value)}
                    placeholder="商品名・商品IDで検索"
                  />
                  <button className="btn tiny" onClick={() => setTargetIds(shownProducts.map((p) => p.id))}>
                    表示中を全選択
                  </button>
                  <button className="btn tiny ghost" onClick={() => setTargetIds([])}>
                    選択解除
                  </button>
                  <span className="target-count">選択中 {targetIds.length}商品</span>
                </div>

                <div className="target-list">
                  {shownProducts.map((p) => (
                    <label key={p.id} className="target-row">
                      <input
                        type="checkbox"
                        checked={targetIds.includes(p.id)}
                        onChange={() => toggleTarget(p.id)}
                      />
                      <span className="target-id">ID {p.id}</span>
                      <span className="target-name">{p.name || "(名前なし)"}</span>
                      {p.is_visible === false && <span className="target-off">非表示</span>}
                    </label>
                  ))}
                  {shownProducts.length === 0 && <p className="hint">該当する商品がありません</p>}
                </div>
                <div className="hint">
                  選んだ商品の小計にだけクーポンを適用します（それ以外の商品は通常どおり）。
                </div>
              </>
            )}
          </div>

          <div className="actions">
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? "保存中..." : "保存する"}
            </button>
            {mode === "edit" && (
              <button className="btn danger" onClick={deleteCoupon}>
                このクーポンを削除
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}