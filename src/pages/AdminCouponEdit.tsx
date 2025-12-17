import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
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
  const [discountValue, setDiscountValue] = useState("0"); // stringで管理
  const [maxDiscountYen, setMaxDiscountYen] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [startsAt, setStartsAt] = useState(""); // YYYY-MM-DD
  const [endsAt, setEndsAt] = useState("");

  const title = useMemo(() => (mode === "new" ? "クーポン作成" : "クーポン編集"), [mode]);

  useEffect(() => {
    if (mode !== "edit") return;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("coupons")
        .select("code,discount_type,discount_value,max_discount_yen,min_subtotal,usage_limit,used_count,is_active,starts_at,ends_at")
        .eq("code", editCode)
        .single();

      if (error || !data) {
        console.error(error);
        alert("読み込みに失敗しました");
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
      setStartsAt(r.starts_at ? r.starts_at.slice(0, 10) : "");
      setEndsAt(r.ends_at ? r.ends_at.slice(0, 10) : "");

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

    return null;
  };

  const save = async () => {
    const errMsg = validate();
    if (errMsg) {
      alert(errMsg);
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
      starts_at: startsAt ? new Date(`${startsAt}T00:00:00.000Z`).toISOString() : null,
      ends_at: endsAt ? new Date(`${endsAt}T23:59:59.999Z`).toISOString() : null,
    };

    if (mode === "new") {
      const { error } = await supabase.from("coupons").insert(payload);
      if (error) {
        console.error(error);
        alert("作成に失敗しました（同じcodeが既にあるかも）");
        setSaving(false);
        return;
      }
      alert("作成しました");
      nav("/admin-coupons");
      return;
    }

    // edit
    const { error } = await supabase.from("coupons").update(payload).eq("code", editCode);
    if (error) {
      console.error(error);
      alert("更新に失敗しました");
      setSaving(false);
      return;
    }

    alert("更新しました");
    nav("/admin-coupons");
  };

  if (loading) return <p style={{ padding: 16 }}>読み込み中...</p>;

  return (
    <div className="admin-coupon-edit">
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
              disabled={mode === "edit"} // codeはキー扱いで固定
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

        <div className="actions">
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}