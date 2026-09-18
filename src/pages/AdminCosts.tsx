// src/pages/AdminCosts.tsx
// ✅ 仕入れ原価の登録画面（商品ごとの原価を一覧でまとめて登録・更新）
//    ここで登録した原価は「売上状況」の粗利計算と、売上Excelの原価・粗利に反映されます。
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { appDialog } from "../lib/appDialog";
import AdminHeader from "../components/AdminHeader";
import "./AdminCosts.css";

type ProductRow = {
  id: number;
  name: string | null;
  price: number | null;
  cost: number | null;
  is_visible?: boolean | null;
};

const toInt = (v: any) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
};

const normCost = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
};

export default function AdminCosts() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [costs, setCosts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    document.body.classList.add("adminmenu-whitebg");
    return () => document.body.classList.remove("adminmenu-whitebg");
  }, []);

  const load = async () => {
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("products")
      .select("id,name,price,cost,is_visible")
      .order("id", { ascending: true });

    if (error) {
      console.error("products load error:", error);
      setMsg("商品の読み込みに失敗しました: " + error.message);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as ProductRow[];
    setRows(list);

    const next: Record<number, string> = {};
    for (const p of list) {
      const c = normCost(p.cost);
      next[p.id] = c == null ? "" : String(c);
    }
    setCosts(next);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter(
      (p) =>
        String(p.name ?? "").toLowerCase().includes(kw) || String(p.id).includes(kw)
    );
  }, [rows, q]);

  const pending = useMemo(() => {
    return rows.filter((p) => {
      const before = normCost(p.cost);
      const after = normCost(costs[p.id]);
      return before !== after;
    });
  }, [rows, costs]);

  const saveAll = async () => {
    if (saving) return;
    setMsg("");

    if (pending.length === 0) {
      setMsg("変更がありません");
      return;
    }

    for (const p of pending) {
      const raw = (costs[p.id] ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setMsg(`原価は0以上の数字で入力してください（商品ID: ${p.id}）`);
        return;
      }
    }

    const ok = await appDialog.confirm({
      message: `${pending.length}件の仕入れ原価を保存します。よろしいですか？`,
    });
    if (!ok) return;

    setSaving(true);
    try {
      let done = 0;
      for (const p of pending) {
        const after = normCost(costs[p.id]);
        const { error } = await supabase
          .from("products")
          .update({ cost: after })
          .eq("id", p.id);

        if (error) {
          console.error("cost update error:", error);
          setMsg(`保存に失敗しました（${p.name ?? p.id}）: ${error.message}`);
          return;
        }
        done++;
      }

      setMsg(`${done}件の仕入れ原価を保存しました`);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const profitOf = (p: ProductRow) => {
    const price = toInt(p.price);
    const raw = (costs[p.id] ?? "").trim();
    if (raw === "") return null;
    const c = Math.floor(Number(raw));
    if (!Number.isFinite(c)) return null;
    return price - c;
  };

  return (
    <>
      <AdminHeader />

      <div className="admin-costs-page">
        <div className="admin-costs-card">
          <button
            className="admin-costs-back"
            onClick={() => navigate("/admin-menu")}
            type="button"
          >
            ← 戻る
          </button>

          <h2 className="admin-costs-title">仕入れ原価の登録</h2>
          <p className="admin-costs-desc">
            商品ごとの仕入れ原価（1個あたり・円）を入力してください。ここで登録した金額は
            <b> 売上状況の粗利 </b>と<b> 売上Excelの原価・粗利 </b>に反映されます。
          </p>

          <div className="admin-costs-toolbar">
            <input
              className="admin-costs-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="商品名 or 商品IDで絞り込み"
              inputMode="search"
            />
            <button
              className="admin-costs-save"
              onClick={saveAll}
              disabled={saving || pending.length === 0}
              type="button"
            >
              {saving ? "保存中..." : `まとめて保存（${pending.length}件）`}
            </button>
          </div>

          {msg && <div className="admin-costs-msg">{msg}</div>}

          {loading ? (
            <p className="admin-costs-loading">読み込み中...</p>
          ) : filtered.length === 0 ? (
            <p className="admin-costs-empty">該当する商品がありません</p>
          ) : (
            <div className="admin-costs-list">
              {filtered.map((p) => {
                const before = normCost(p.cost);
                const after = normCost(costs[p.id]);
                const changed = before !== after;
                const profit = profitOf(p);

                return (
                  <div
                    key={p.id}
                    className={`admin-costs-row${changed ? " is-changed" : ""}`}
                  >
                    <div className="admin-costs-head">
                      <div className="admin-costs-name">
                        {p.name || "(名前なし)"}
                        {p.is_visible === false && (
                          <span className="admin-costs-hidden">非表示</span>
                        )}
                      </div>
                      <div className="admin-costs-id">ID: {p.id}</div>
                    </div>

                    <div className="admin-costs-fields">
                      <div className="admin-costs-field">
                        <label>販売価格</label>
                        <div className="admin-costs-static">
                          ¥{toInt(p.price).toLocaleString("ja-JP")}
                        </div>
                      </div>

                      <div className="admin-costs-field">
                        <label>仕入れ原価（1個）</label>
                        <div className="admin-costs-input-wrap">
                          <input
                            className="admin-costs-input"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            placeholder="未登録"
                            value={costs[p.id] ?? ""}
                            onChange={(e) =>
                              setCosts((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                          />
                          <span className="admin-costs-suffix">円</span>
                        </div>
                      </div>

                      <div className="admin-costs-field">
                        <label>粗利（1個）</label>
                        <div
                          className={`admin-costs-static admin-costs-profit${
                            profit != null && profit < 0 ? " is-minus" : ""
                          }`}
                        >
                          {profit == null
                            ? "原価未登録"
                            : `¥${profit.toLocaleString("ja-JP")}`}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="admin-costs-note">
            ※ 原価を空欄にすると「未登録」になります。未登録の商品は売上状況・Excelで原価0円として扱われ、
            粗利が実際より大きく出ます。必ず登録してください。
          </p>
        </div>
      </div>
    </>
  );
}
