// src/pages/AdminCoupons.tsx
// ✅ v34：カード型に刷新（一覧性・編集のしやすさを優先）
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminCoupons.css";
import { appDialog } from "../lib/appDialog";

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
  audience: string | null;
  per_user_limit: number | null;
  target_scope: string | null;
};

type FilterKey = "all" | "running" | "stopped";

const AUDIENCE_LABEL: Record<string, string> = {
  all: "全員",
  member: "会員のみ",
  guest: "ゲストのみ",
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

const fmt = (n: number | null | undefined) => (n == null ? "-" : n.toLocaleString("ja-JP"));

export default function AdminCoupons() {
  const nav = useNavigate();
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [targets, setTargets] = useState<{ code: string; product_id: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("coupons")
      .select(
        "code,discount_type,discount_value,max_discount_yen,min_subtotal,usage_limit,used_count,is_active,starts_at,ends_at,created_at,audience,per_user_limit,target_scope"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      await appDialog.alert({ title: "読み込みに失敗しました", message: "読み込みに失敗しました" });
      setLoading(false);
      return;
    }
    setRows((data ?? []) as CouponRow[]);

    const { data: tgt } = await supabase.from("coupon_products").select("code,product_id");
    setTargets((tgt ?? []) as { code: string; product_id: number }[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const discountLabel = (r: CouponRow) => {
    if ((r.discount_type ?? "yen") === "percent") return `${fmt(r.discount_value)}% 引き`;
    return `${fmt(r.discount_value)}円 引き`;
  };

  const targetCount = (code: string) => targets.filter((t) => t.code === code).length;

  // ✅ いま使えるかどうか（期間・有効・回数から判定）
  const statusOf = (r: CouponRow) => {
    if (!r.is_active) return { label: "停止中", cls: "stopped" };
    const now = Date.now();
    if (r.starts_at && now < new Date(r.starts_at).getTime()) return { label: "開始前", cls: "wait" };
    if (r.ends_at && now > new Date(r.ends_at).getTime()) return { label: "終了", cls: "stopped" };
    if (r.usage_limit != null && (r.used_count ?? 0) >= r.usage_limit)
      return { label: "上限到達", cls: "stopped" };
    return { label: "使用中", cls: "running" };
  };

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    return rows.filter((r) => {
      const st = statusOf(r);
      if (filter === "running" && st.cls !== "running") return false;
      if (filter === "stopped" && st.cls === "running") return false;
      if (!s) return true;
      return r.code?.toUpperCase().includes(s);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, filter]);

  const stats = useMemo(() => {
    let running = 0;
    let used = 0;
    for (const r of rows) {
      if (statusOf(r).cls === "running") running++;
      used += Number(r.used_count ?? 0);
    }
    return { total: rows.length, running, used };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const toggleActive = async (code: string, next: boolean) => {
    setBusyCode(code);
    const { error } = await supabase.from("coupons").update({ is_active: next }).eq("code", code);
    setBusyCode(null);
    if (error) {
      console.error(error);
      await appDialog.alert({ title: "更新に失敗しました", message: "更新に失敗しました" });
      return;
    }
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, is_active: next } : r)));
  };

  const remove = async (code: string, usedCount: number | null) => {
    const ok = await appDialog.confirm({
      title: "削除確認",
      message:
        `${code} を削除しますか？\n` +
        `（これまでの使用回数：${Number(usedCount ?? 0)}回／対象商品の設定も一緒に削除されます）\n` +
        "元に戻せません。",
      okText: "削除する",
      cancelText: "キャンセル",
    });
    if (!ok) return;

    setBusyCode(code);
    const { error } = await supabase.from("coupons").delete().eq("code", code);
    setBusyCode(null);
    if (error) {
      console.error(error);
      await appDialog.alert({
        title: "削除に失敗しました",
        message: "削除に失敗しました: " + error.message,
      });
      return;
    }
    setRows((prev) => prev.filter((r) => r.code !== code));
    setTargets((prev) => prev.filter((t) => t.code !== code));
  };

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "すべて", count: stats.total },
    { key: "running", label: "使用中", count: stats.running },
    { key: "stopped", label: "停止・終了", count: stats.total - stats.running },
  ];

  return (
    <>
      <AdminHeader />

      <div className="admin-coupons-page">
        <div className="ac-head">
          <div>
            <h2 className="ac-title">クーポン管理</h2>
            <p className="ac-lead">
              割引の条件・期間・対象者・対象商品をここで設定します。カードをタップすると編集できます。
            </p>
          </div>
          <div className="ac-head-actions">
            <button className="btn primary" onClick={() => nav("/admin-coupon-new")}>
              ＋ クーポンを作成
            </button>
            <button className="btn ghost" onClick={load}>
              更新
            </button>
          </div>
        </div>

        <div className="ac-stats">
          <div className="ac-stat">
            <span className="ac-stat-label">クーポン数</span>
            <span className="ac-stat-value">{stats.total}</span>
          </div>
          <div className="ac-stat is-running">
            <span className="ac-stat-label">使用中</span>
            <span className="ac-stat-value">{stats.running}</span>
          </div>
          <div className="ac-stat">
            <span className="ac-stat-label">のべ使用回数</span>
            <span className="ac-stat-value">{stats.used}</span>
          </div>
        </div>

        <div className="ac-toolbar">
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 コードで検索"
            inputMode="search"
          />
          <div className="ac-chips">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`ac-chip ${filter === f.key ? "active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                <span className="ac-chip-count">{f.count}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="ac-empty">読み込み中...</p>
        ) : filtered.length === 0 ? (
          <p className="ac-empty">該当するクーポンがありません</p>
        ) : (
          <div className="ac-list">
            {filtered.map((r) => {
              const st = statusOf(r);
              const limit = r.usage_limit;
              const used = Number(r.used_count ?? 0);
              const progress = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

              return (
                <div className="ac-card" key={r.code}>
                  <div className="ac-card-body">
                    <div className="ac-card-top">
                      <span className="ac-code">{r.code}</span>
                      <span className={`ac-pill ${st.cls}`}>{st.label}</span>
                      <span className="ac-tag">{AUDIENCE_LABEL[r.audience ?? "all"] ?? "全員"}</span>
                      <span className="ac-tag is-soft">
                        {(r.target_scope ?? "all") === "products"
                          ? `対象商品 ${targetCount(r.code)}件`
                          : "全商品"}
                      </span>
                    </div>

                    <div className="ac-discount">{discountLabel(r)}</div>

                    <div className="ac-meta">
                      <span>
                        期間：
                        {jstDate(r.starts_at) || "指定なし"} 〜 {jstDate(r.ends_at) || "指定なし"}
                      </span>
                      <span>
                        最低小計：{r.min_subtotal == null ? "なし" : `${fmt(r.min_subtotal)}円`}
                      </span>
                      {r.max_discount_yen != null && (
                        <span>割引上限：{fmt(r.max_discount_yen)}円</span>
                      )}
                      <span>
                        1人上限：{r.per_user_limit == null ? "無制限" : `${fmt(r.per_user_limit)}回`}
                      </span>
                    </div>

                    <div className="ac-usage">
                      <span className="ac-usage-text">
                        使用 {used}回
                        <span className="ac-usage-limit">
                          {" "}
                          / {limit == null ? "無制限" : `${fmt(limit)}回`}
                        </span>
                      </span>
                      {limit != null && limit > 0 && (
                        <span className="ac-bar">
                          <span className="ac-bar-fill" style={{ width: `${progress}%` }} />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="ac-card-actions">
                    <button
                      className="btn tiny primary"
                      onClick={() => nav(`/admin-coupon-edit/${encodeURIComponent(r.code)}`)}
                    >
                      編集
                    </button>
                    <button
                      className="btn tiny"
                      disabled={busyCode === r.code}
                      onClick={() => toggleActive(r.code, !r.is_active)}
                    >
                      {r.is_active ? "停止する" : "再開する"}
                    </button>
                    <button
                      className="btn tiny danger"
                      disabled={busyCode === r.code}
                      onClick={() => remove(r.code, r.used_count)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
