import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminCoupons.css";

type CouponRow = {
  code: string;
  discount_type: "yen" | "percent" | string;
  discount_value: number | null;
  max_discount_yen: number | null;
  min_subtotal: number | null;
  usage_limit: number | null;
  used_count: number | null;
  is_active: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
};

export default function AdminCoupons() {
  const nav = useNavigate();
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("coupons")
      .select(
        "code,discount_type,discount_value,max_discount_yen,min_subtotal,usage_limit,used_count,is_active,starts_at,ends_at,created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      alert("読み込みに失敗しました");
      setLoading(false);
      return;
    }
    setRows((data ?? []) as CouponRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    return rows.filter((r) => {
      if (onlyActive && !r.is_active) return false;
      if (!s) return true;
      return r.code?.toUpperCase().includes(s);
    });
  }, [rows, q, onlyActive]);

  const fmt = (n: number | null | undefined) => (n == null ? "-" : n.toLocaleString("ja-JP"));

  const discountLabel = (r: CouponRow) => {
    if ((r.discount_type ?? "yen") === "percent") return `${fmt(r.discount_value)}%`;
    return `${fmt(r.discount_value)}円`;
  };

  const toggleActive = async (code: string, next: boolean) => {
    const { error } = await supabase.from("coupons").update({ is_active: next }).eq("code", code);
    if (error) {
      console.error(error);
      alert("更新に失敗しました");
      return;
    }
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, is_active: next } : r)));
  };

  const remove = async (code: string) => {
    if (!confirm(`${code} を削除しますか？`)) return;
    const { error } = await supabase.from("coupons").delete().eq("code", code);
    if (error) {
      console.error(error);
      alert("削除に失敗しました");
      return;
    }
    setRows((prev) => prev.filter((r) => r.code !== code));
  };

  return (
    <div className="admin-coupons-page">
      <div className="admin-coupons-head">
  <div className="admin-coupons-titleRow">
    <button className="btn ghost" onClick={() => nav("/admin-menu")}>
      ← 戻る
    </button>
    <h2>クーポン管理</h2>
  </div>

  <div className="admin-coupons-actions">
    <button className="btn" onClick={() => nav("/admin-coupon-new")}>
      ＋ 新規作成
    </button>
    <button className="btn ghost" onClick={load}>
      更新
    </button>
  </div>
</div>

      <div className="admin-coupons-filter">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="コードで検索"
        />
        <label className="check">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          有効のみ
        </label>
      </div>

      {loading ? (
        <p style={{ padding: 12 }}>読み込み中...</p>
      ) : (
        <div className="admin-coupons-tableWrap">
          <table className="admin-coupons-table">
            <thead>
              <tr>
                <th>コード</th>
                <th>割引</th>
                <th>上限</th>
                <th>最低小計</th>
                <th>回数</th>
                <th>期間</th>
                <th>有効</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.code}>
                  <td className="mono">{r.code}</td>
                  <td>{discountLabel(r)}</td>
                  <td>{fmt(r.max_discount_yen)}円</td>
                  <td>{fmt(r.min_subtotal)}円</td>
                  <td>
                    {fmt(r.used_count)} / {fmt(r.usage_limit)}
                  </td>
                  <td className="small">
                    {r.starts_at ? r.starts_at.slice(0, 10) : "-"} 〜 {r.ends_at ? r.ends_at.slice(0, 10) : "-"}
                  </td>
                  <td>
                    <button
                      className={`pill ${r.is_active ? "on" : "off"}`}
                      onClick={() => toggleActive(r.code, !r.is_active)}
                    >
                      {r.is_active ? "ON" : "OFF"}
                    </button>
                  </td>
                  <td className="right">
                
<button
  className="btn tiny"
  onClick={() => nav(`/admin-coupon-edit/${encodeURIComponent(r.code)}`)}
>
  編集
</button>
                    <button className="btn tiny danger" onClick={() => remove(r.code)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">該当なし</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}