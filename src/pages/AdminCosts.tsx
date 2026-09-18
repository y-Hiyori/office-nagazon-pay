// src/pages/AdminCosts.tsx
// ✅ 仕入れ原価・入荷ロット管理
//   ・同じ商品でも原価／賞味期限が違う在庫を「ロット」として1件ずつ登録
//   ・複数商品をまとめて選択して一括登録（まとめ仕入れ）
//   ・ロット単位でセール価格（一部だけセール）を設定
//   ・期限切れ／期限間近を色分け表示
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { appDialog } from "../lib/appDialog";
import AdminHeader from "../components/AdminHeader";
import { daysLeftOf, expiryStatusLabel, expiryStatusOf, type ExpiryStatus } from "../lib/lots";
import "./AdminCosts.css";

type ProductRow = {
  id: number;
  name: string | null;
  price: number | null;
  stock: number | null;
  is_visible?: boolean | null;
  max_per_order?: number | null;
  expiry_alert_days?: number | null;
};

type Lot = {
  id: string;
  product_id: number;
  lot_label: string | null;
  cost: number;
  quantity: number;
  remaining: number;
  sale_price: number | null;
  expiry_date: string | null;
  expiry_type: string;
  received_at: string | null;
  memo: string | null;
};

type LotDraft = {
  cost: string;
  remaining: string;
  expiry_date: string;
  expiry_type: string;
  lot_label: string;
};

// ✅ 在庫を1個ずつ登録するときの1行ぶん
type UnitDraft = {
  cost: string;
  expiry_date: string;
  expiry_type: "best_before" | "use_by";
};

const toInt = (v: any) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
};

const yen = (v: any) => toInt(v).toLocaleString("ja-JP");

const draftOf = (l: Lot): LotDraft => ({
  cost: String(toInt(l.cost)),
  remaining: String(toInt(l.remaining)),
  expiry_date: l.expiry_date ? String(l.expiry_date).slice(0, 10) : "",
  expiry_type: l.expiry_type === "use_by" ? "use_by" : "best_before",
  lot_label: l.lot_label ?? "",
});

export default function AdminCosts() {
  const navigate = useNavigate();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [onlyAlert, setOnlyAlert] = useState(false);

  // 選択（まとめて登録用）
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  // 一括登録フォーム
  const [bCost, setBCost] = useState("");
  const [bQty, setBQty] = useState("");
  const [bExpiry, setBExpiry] = useState("");
  const [bExpiryType, setBExpiryType] = useState<"best_before" | "use_by">("best_before");
  const [bLabel, setBLabel] = useState("");

  // ✅ 在庫を1個ずつ登録（商品ごと）
  const [unitCount, setUnitCount] = useState<Record<number, string>>({});
  const [unitBulkCost, setUnitBulkCost] = useState<Record<number, string>>({});
  const [unitRows, setUnitRows] = useState<Record<number, UnitDraft[]>>({});
  const [unitSyncStock, setUnitSyncStock] = useState<Record<number, boolean>>({});

  // 展開中の商品
  const [openId, setOpenId] = useState<number | null>(null);
  // ロット編集ドラフト
  const [drafts, setDrafts] = useState<Record<string, LotDraft>>({});

  useEffect(() => {
    document.body.classList.add("adminmenu-whitebg");
    return () => document.body.classList.remove("adminmenu-whitebg");
  }, []);

  const load = async () => {
    setLoading(true);
    setMsg("");

    const [pRes, lRes] = await Promise.all([
      supabase
        .from("products")
        .select("id,name,price,stock,is_visible,max_per_order,expiry_alert_days")
        .order("id", { ascending: true }),
      supabase
        .from("product_lots")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (pRes.error) {
      console.error("products load error:", pRes.error);
      setMsg("商品の読み込みに失敗しました: " + pRes.error.message);
      setLoading(false);
      return;
    }
    if (lRes.error) {
      console.error("product_lots load error:", lRes.error);
      setMsg(
        "ロットの読み込みに失敗しました: " +
          lRes.error.message +
          "（先に supabase_v17_lots.sql を実行してください）"
      );
    }

    setProducts((pRes.data ?? []) as ProductRow[]);
    const ls = (lRes.data ?? []) as Lot[];
    setLots(ls);

    const d: Record<string, LotDraft> = {};
    for (const l of ls) d[l.id] = draftOf(l);
    setDrafts(d);

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lotsByProduct = useMemo(() => {
    const m = new Map<number, Lot[]>();
    for (const l of lots) {
      const id = Number(l.product_id);
      if (!m.has(id)) m.set(id, []);
      m.get(id)!.push(l);
    }
    return m;
  }, [lots]);

  const infoOf = (p: ProductRow) => {
    const ls = lotsByProduct.get(p.id) ?? [];
    const alertDays = toInt(p.expiry_alert_days) > 0 ? toInt(p.expiry_alert_days) : 30;

    let remaining = 0;
    let costSum = 0;
    let nearest: string | null = null;

    for (const l of ls) {
      const rem = Math.max(0, toInt(l.remaining));
      remaining += rem;
      costSum += toInt(l.cost) * rem;
      if (rem > 0 && l.expiry_date) {
        const d = String(l.expiry_date).slice(0, 10);
        if (!nearest || d < nearest) nearest = d;
      }
    }

    const avgCost = remaining > 0 ? Math.round(costSum / remaining) : 0;
    const status: ExpiryStatus = expiryStatusOf(nearest, alertDays);

    return {
      lots: ls,
      count: ls.length,
      remaining,
      avgCost,
      costSum,
      nearest,
      status,
      alertDays,
      days: daysLeftOf(nearest),
    };
  };

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let list = products;

    if (kw) {
      list = list.filter(
        (p) => String(p.name ?? "").toLowerCase().includes(kw) || String(p.id).includes(kw)
      );
    }
    if (onlyAlert) {
      list = list.filter((p) => {
        const s = infoOf(p).status;
        return s === "expired" || s === "urgent" || s === "warn";
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, q, onlyAlert, lotsByProduct]);

  const selectedIds = useMemo(
    () => products.filter((p) => selected[p.id]).map((p) => p.id),
    [products, selected]
  );

  const alertCounts = useMemo(() => {
    let expired = 0;
    let soon = 0;
    for (const p of products) {
      const s = infoOf(p).status;
      if (s === "expired") expired++;
      else if (s === "urgent" || s === "warn") soon++;
    }
    return { expired, soon };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, lotsByProduct]);

  const toggleAll = (on: boolean) => {
    const next: Record<number, boolean> = {};
    for (const p of filtered) next[p.id] = on;
    setSelected(on ? next : {});
  };

  // ✅ まとめて登録
  const bulkAdd = async () => {
    if (busy) return;
    setMsg("");

    if (selectedIds.length === 0) {
      setMsg("商品を選択してください（チェックボックス）");
      return;
    }

    const costRaw = bCost.trim();
    const qtyRaw = bQty.trim();
    if (costRaw === "" || qtyRaw === "") {
      setMsg("仕入れ原価（1個あたり）と数量を入力してください");
      return;
    }

    const cost = toInt(costRaw);
    const qty = toInt(qtyRaw);
    if (cost < 0 || qty <= 0) {
      setMsg("仕入れ原価は0以上・数量は1以上で入力してください");
      return;
    }

    const ok = await appDialog.confirm({
      message:
        `${selectedIds.length}商品に、原価${yen(cost)}円 × ${qty}個のロットを追加します。\n` +
        (bExpiry ? `期限：${bExpiry}\n` : "") +
        "よろしいですか？",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const rows = selectedIds.map((pid) => ({
        product_id: pid,
        lot_label: bLabel.trim() || null,
        cost,
        quantity: qty,
        remaining: qty,
        sale_price: null,
        expiry_date: bExpiry.trim() || null,
        expiry_type: bExpiryType,
      }));

      const { error } = await supabase.from("product_lots").insert(rows);
      if (error) {
        console.error("bulk insert error:", error);
        setMsg("登録に失敗しました: " + error.message);
        return;
      }

      setMsg(`${selectedIds.length}商品にロットを登録しました（在庫は自動では増えません。「在庫数をロット残数に合わせる」を押してください）`);
      setSelected({});
      setBCost("");
      setBQty("");
      setBExpiry("");
      setBLabel("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ✅ ロット1件を保存
  const saveLot = async (l: Lot) => {
    if (busy) return;
    const d = drafts[l.id];
    if (!d) return;

    const cost = toInt(d.cost);
    const remaining = Math.max(0, toInt(d.remaining));

    setBusy(true);
    try {
      const { error } = await supabase
        .from("product_lots")
        .update({
          cost,
          remaining,
          sale_price: null,
          expiry_date: d.expiry_date.trim() || null,
          expiry_type: d.expiry_type === "use_by" ? "use_by" : "best_before",
          lot_label: d.lot_label.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", l.id);

      if (error) {
        console.error("lot update error:", error);
        setMsg("保存に失敗しました: " + error.message);
        return;
      }
      setMsg("ロットを保存しました");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const deleteLot = async (l: Lot) => {
    const ok = await appDialog.confirm({ message: "このロットを削除しますか？（元に戻せません）" });
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase.from("product_lots").delete().eq("id", l.id);
      if (error) {
        setMsg("削除に失敗しました: " + error.message);
        return;
      }
      setMsg("ロットを削除しました");
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ✅ ロット1件を追加（1個ずつ設定したい時用）
  const addOneLot = async (p: ProductRow) => {
    if (busy) return;
    const d = drafts[`new-${p.id}`];
    const cost = d ? toInt(d.cost) : 0;
    const qty = d ? Math.max(1, toInt(d.remaining)) : 1;

    setBusy(true);
    try {
      const { error } = await supabase.from("product_lots").insert({
        product_id: p.id,
        lot_label: d?.lot_label?.trim() || null,
        cost,
        quantity: qty,
        remaining: qty,
        sale_price: null,
        expiry_date: d?.expiry_date?.trim() || null,
        expiry_type: d?.expiry_type === "use_by" ? "use_by" : "best_before",
      });
      if (error) {
        setMsg("追加に失敗しました: " + error.message);
        return;
      }
      setMsg("ロットを1件追加しました");
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ✅ 在庫数をロット残数の合計に合わせる
  const syncStock = async (p: ProductRow) => {
    if (busy) return;
    const info = infoOf(p);

    const ok = await appDialog.confirm({
      message: `「${p.name ?? p.id}」の在庫数を ${toInt(p.stock)} → ${info.remaining} に合わせますか？`,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ stock: info.remaining })
        .eq("id", p.id);
      if (error) {
        setMsg("在庫の更新に失敗しました: " + error.message);
        return;
      }
      setMsg("在庫数をロット残数に合わせました");
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ✅ 商品を開いたら、未登録の在庫ぶんの入力欄を自動で用意する
  const ensureUnitRows = (p: ProductRow) => {
    // すでに入力欄があるなら触らない（入力中の内容を消さないため）
    if (unitRows[p.id] !== undefined) return;

    const info = infoOf(p);
    const n = Math.max(0, toInt(p.stock) - info.remaining);
    if (n <= 0) {
      setUnitCount((prev) => ({ ...prev, [p.id]: "0" }));
      setUnitRows((prev) => ({ ...prev, [p.id]: [] }));
      return;
    }

    const unit = Math.min(200, n);
    const base = info.avgCost > 0 ? String(info.avgCost) : "";
    setUnitCount((prev) => ({ ...prev, [p.id]: String(unit) }));
    setUnitRows((prev) => ({
      ...prev,
      [p.id]: Array.from({ length: unit }, () => ({
        cost: base,
        expiry_date: "",
        expiry_type: "best_before" as const,
      })),
    }));
  };

  // ✅ 在庫を1個ずつ登録：個数ぶんの入力欄を作る
  const buildUnitRows = (p: ProductRow) => {
    const n = Math.min(200, Math.max(0, toInt(unitCount[p.id])));
    if (n <= 0) {
      setMsg("個数を1以上で入力してください");
      return;
    }
    const base = (unitBulkCost[p.id] ?? "").trim();
    const rows: UnitDraft[] = Array.from({ length: n }, () => ({
      cost: base,
      expiry_date: "",
      expiry_type: "best_before" as const,
    }));
    setUnitRows((prev) => ({ ...prev, [p.id]: rows }));
    setMsg(`${n}個ぶんの入力欄を作りました。原価と期限を入れてください`);
  };

  const setUnitRow = (pid: number, idx: number, key: keyof UnitDraft, value: string) => {
    setUnitRows((prev) => {
      const rows = [...(prev[pid] ?? [])];
      if (!rows[idx]) return prev;
      rows[idx] = { ...rows[idx], [key]: value } as UnitDraft;
      return { ...prev, [pid]: rows };
    });
  };

  const removeUnitRow = (pid: number, idx: number) => {
    setUnitRows((prev) => ({
      ...prev,
      [pid]: (prev[pid] ?? []).filter((_, i) => i !== idx),
    }));
  };

  // ✅ 入力中の原価を全行にまとめて反映
  const fillUnitCost = (p: ProductRow) => {
    const v = (unitBulkCost[p.id] ?? "").trim();
    setUnitRows((prev) => ({
      ...prev,
      [p.id]: (prev[p.id] ?? []).map((r) => ({ ...r, cost: v })),
    }));
  };

  // ✅ 1個＝1ロットとしてまとめて保存
  const saveUnits = async (p: ProductRow) => {
    if (busy) return;

    const rows = unitRows[p.id] ?? [];
    if (rows.length === 0) {
      setMsg("先に個数を入れて「入力欄を作る」を押してください");
      return;
    }

    const parsed = rows.map((r) => ({
      cost: Math.max(0, toInt(r.cost)),
      expiry_date: r.expiry_date.trim() || null,
      expiry_type: r.expiry_type === "use_by" ? "use_by" : "best_before",
    }));

    const info = infoOf(p);
    const syncAfter = unitSyncStock[p.id] !== false;

    const ok = await appDialog.confirm({
      message:
        `「${p.name ?? p.id}」に ${parsed.length}個ぶんのロットを1個ずつ登録します。\n` +
        (syncAfter
          ? `登録後の在庫数：${toInt(p.stock)} → ${info.remaining + parsed.length}\n`
          : "") +
        "よろしいですか？",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase.from("product_lots").insert(
        parsed.map((r) => ({
          product_id: p.id,
          lot_label: null,
          cost: r.cost,
          quantity: 1,
          remaining: 1,
          sale_price: null,
          expiry_date: r.expiry_date,
          expiry_type: r.expiry_type,
        }))
      );

      if (error) {
        console.error("unit insert error:", error);
        setMsg("登録に失敗しました: " + error.message);
        return;
      }

      if (syncAfter) {
        const { error: e2 } = await supabase
          .from("products")
          .update({ stock: info.remaining + parsed.length })
          .eq("id", p.id);

        if (e2) {
          setMsg("ロットは登録しましたが、在庫数の更新に失敗しました: " + e2.message);
        } else {
          setMsg(
            `${parsed.length}個ぶんを1個ずつ登録し、在庫数を ${info.remaining + parsed.length} に更新しました`
          );
        }
      } else {
        setMsg(`${parsed.length}個ぶんを1個ずつ登録しました（在庫数は変わっていません）`);
      }

      setUnitRows((prev) => ({ ...prev, [p.id]: [] }));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const statusClass = (s: ExpiryStatus) =>
    s === "expired"
      ? "is-expired"
      : s === "urgent"
      ? "is-urgent"
      : s === "warn"
      ? "is-warn"
      : s === "ok"
      ? "is-ok"
      : "is-none";

  return (
    <>
      <AdminHeader />

      <div className="admin-costs-page">
        <div className="admin-costs-card">
          <button className="admin-costs-back" onClick={() => navigate("/admin-page")} type="button">
            ← 商品管理へ戻る
          </button>

          <h2 className="admin-costs-title">仕入れ原価・入荷ロット管理</h2>
          <p className="admin-costs-desc">
            仕入れた単位（ロット）ごとに <b>1個あたりの原価</b> と <b>賞味期限・消費期限</b> を登録できます。
            同じ商品でも仕入れた回によって原価や期限が違う場合は、ロットを分けて登録してください。
            複数商品をまとめて仕入れたときは、チェックを付けて一括登録できます。
          </p>

          {(alertCounts.expired > 0 || alertCounts.soon > 0) && (
            <div className="admin-costs-alertbar">
              {alertCounts.expired > 0 && (
                <span className="aca-badge is-expired">期限切れ {alertCounts.expired}件</span>
              )}
              {alertCounts.soon > 0 && (
                <span className="aca-badge is-warn">期限間近 {alertCounts.soon}件</span>
              )}
              <button
                className="aca-filter"
                type="button"
                onClick={() => setOnlyAlert((v) => !v)}
              >
                {onlyAlert ? "すべて表示" : "期限アラートだけ表示"}
              </button>
            </div>
          )}

          {msg && <div className="admin-costs-msg">{msg}</div>}

          {/* ---------- まとめて登録 ---------- */}
          <section className="ac-bulk">
            <h3 className="ac-bulk-title">
              まとめて登録
              <span className="ac-bulk-count">選択中 {selectedIds.length} 商品</span>
            </h3>

            <div className="ac-bulk-grid">
              <label>
                <span>仕入れ原価（1個・円）</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="例: 80"
                  value={bCost}
                  onChange={(e) => setBCost(e.target.value)}
                />
              </label>

              <label>
                <span>数量（個）</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="例: 10"
                  value={bQty}
                  onChange={(e) => setBQty(e.target.value)}
                />
              </label>

              <label>
                <span>賞味期限 / 消費期限</span>
                <input type="date" value={bExpiry} onChange={(e) => setBExpiry(e.target.value)} />
              </label>

              <label>
                <span>期限の種類</span>
                <select
                  value={bExpiryType}
                  onChange={(e) => setBExpiryType(e.target.value as "best_before" | "use_by")}
                >
                  <option value="best_before">賞味期限</option>
                  <option value="use_by">消費期限</option>
                </select>
              </label>

              <label>
                <span>仕入れメモ（任意）</span>
                <input
                  type="text"
                  placeholder="例: ○○商店 9/19仕入れ"
                  value={bLabel}
                  onChange={(e) => setBLabel(e.target.value)}
                />
              </label>
            </div>

            <button className="ac-bulk-btn" type="button" disabled={busy} onClick={bulkAdd}>
              {busy ? "処理中..." : `選択した ${selectedIds.length} 商品に登録`}
            </button>
          </section>

          {/* ---------- 検索・全選択 ---------- */}
          <div className="admin-costs-toolbar">
            <input
              className="admin-costs-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="商品名 or 商品IDで絞り込み"
              inputMode="search"
            />
            <button className="ac-mini" type="button" onClick={() => toggleAll(true)}>
              表示中を全選択
            </button>
            <button className="ac-mini" type="button" onClick={() => toggleAll(false)}>
              選択解除
            </button>
          </div>

          {loading ? (
            <p className="admin-costs-loading">読み込み中...</p>
          ) : filtered.length === 0 ? (
            <p className="admin-costs-empty">該当する商品がありません</p>
          ) : (
            <div className="admin-costs-list">
              {filtered.map((p) => {
                const info = infoOf(p);
                const isOpen = openId === p.id;
                const checked = !!selected[p.id];

                return (
                  <div
                    key={p.id}
                    className={`admin-costs-row${checked ? " is-selected" : ""}`}
                  >
                    <div className="ac-row-head">
                      <label className="ac-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelected((prev) => ({ ...prev, [p.id]: e.target.checked }))
                          }
                        />
                      </label>

                      <button
                        className="ac-row-main"
                        type="button"
                        onClick={() => {
                          if (isOpen) {
                            setOpenId(null);
                          } else {
                            ensureUnitRows(p);
                            setOpenId(p.id);
                          }
                        }}
                      >
                        <div className="ac-row-name">
                          {p.name || "(名前なし)"}
                          {p.is_visible === false && <span className="ac-tag">非表示</span>}
                          {toInt(p.max_per_order) > 0 && (
                            <span className="ac-tag limit">
                              上限{toInt(p.max_per_order)}個
                            </span>
                          )}
                        </div>

                        <div className="ac-row-meta">
                          <span>ID: {p.id}</span>
                          <span>販売価格 ¥{yen(p.price)}</span>
                          <span>在庫 {toInt(p.stock)}</span>
                          <span>
                            ロット {info.count}件 / 残 {info.remaining}
                          </span>
                          <span>平均原価 ¥{yen(info.avgCost)}</span>
                        </div>

                        <div className="ac-row-expiry">
                          <span className={`ac-exp ${statusClass(info.status)}`}>
                            {expiryStatusLabel(info.status, info.days)}
                          </span>
                          {info.nearest && (
                            <span className="ac-exp-date">
                              {info.nearest}
                              {info.status !== "none" ? `（${info.alertDays}日以内で警告）` : ""}
                            </span>
                          )}
                          {info.remaining !== toInt(p.stock) && (
                            <span className="ac-exp-diff">
                              ⚠ 在庫数とロット残数が一致していません
                            </span>
                          )}
                        </div>
                      </button>
                    </div>

                    {isOpen && (
                      <div className="ac-lots">
                        <div className="ac-lots-actions">
                          <button
                            className="ac-mini"
                            type="button"
                            onClick={() => syncStock(p)}
                            disabled={busy}
                          >
                            在庫数をロット残数（{info.remaining}）に合わせる
                          </button>
                          <button
                            className="ac-mini"
                            type="button"
                            onClick={() => navigate(`/admin-edit/${p.id}`)}
                          >
                            商品設定（価格・購入上限）を編集
                          </button>
                          <button
                            className="ac-mini"
                            type="button"
                            onClick={() => navigate("/admin-page")}
                          >
                            セール設定は商品管理で
                          </button>
                        </div>

                        {info.lots.length === 0 ? (
                          <p className="ac-lots-empty">
                            まだロットがありません。下の「1件ずつ追加」または上の「まとめて登録」で登録してください。
                          </p>
                        ) : (
                          <div className="ac-lot-list">
                            {info.lots.map((l) => {
                              const d = drafts[l.id] ?? draftOf(l);
                              const st = expiryStatusOf(d.expiry_date, info.alertDays);
                              const dDays = daysLeftOf(d.expiry_date);

                              return (
                                <div key={l.id} className="ac-lot">
                                  <div className="ac-lot-head">
                                    <span className={`ac-exp ${statusClass(st)}`}>
                                      {expiryStatusLabel(st, dDays)}
                                    </span>
                                    {l.lot_label && (
                                      <span className="ac-lot-label">{l.lot_label}</span>
                                    )}
                                    <span className="ac-lot-id">
                                      入荷 {l.received_at ? String(l.received_at).slice(0, 10) : "-"}
                                    </span>
                                  </div>

                                  <div className="ac-lot-grid">
                                    <label>
                                      <span>原価(1個)</span>
                                      <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        value={d.cost}
                                        onChange={(e) =>
                                          setDrafts((prev) => ({
                                            ...prev,
                                            [l.id]: { ...d, cost: e.target.value },
                                          }))
                                        }
                                      />
                                    </label>

                                    <label>
                                      <span>残数</span>
                                      <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        value={d.remaining}
                                        onChange={(e) =>
                                          setDrafts((prev) => ({
                                            ...prev,
                                            [l.id]: { ...d, remaining: e.target.value },
                                          }))
                                        }
                                      />
                                    </label>

                                    <label>
                                      <span>期限</span>
                                      <input
                                        type="date"
                                        value={d.expiry_date}
                                        onChange={(e) =>
                                          setDrafts((prev) => ({
                                            ...prev,
                                            [l.id]: { ...d, expiry_date: e.target.value },
                                          }))
                                        }
                                      />
                                    </label>

                                    <label>
                                      <span>種類</span>
                                      <select
                                        value={d.expiry_type}
                                        onChange={(e) =>
                                          setDrafts((prev) => ({
                                            ...prev,
                                            [l.id]: { ...d, expiry_type: e.target.value },
                                          }))
                                        }
                                      >
                                        <option value="best_before">賞味</option>
                                        <option value="use_by">消費</option>
                                      </select>
                                    </label>

                                    <label>
                                      <span>メモ</span>
                                      <input
                                        type="text"
                                        value={d.lot_label}
                                        onChange={(e) =>
                                          setDrafts((prev) => ({
                                            ...prev,
                                            [l.id]: { ...d, lot_label: e.target.value },
                                          }))
                                        }
                                      />
                                    </label>
                                  </div>

                                  <div className="ac-lot-foot">
                                    <span className="ac-lot-total">
                                      このロットの在庫原価：¥{yen(toInt(d.cost) * toInt(d.remaining))}
                                    </span>
                                    <button
                                      className="ac-save"
                                      type="button"
                                      disabled={busy}
                                      onClick={() => saveLot(l)}
                                    >
                                      保存
                                    </button>
                                    <button
                                      className="ac-del"
                                      type="button"
                                      disabled={busy}
                                      onClick={() => deleteLot(l)}
                                    >
                                      削除
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* 1件ずつ追加 */}
                        <div className="ac-new">
                          <div className="ac-new-title">1件ずつ追加（バラ売り在庫の1個単位もここで）</div>
                          <div className="ac-lot-grid">
                            <label>
                              <span>原価(1個)</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                placeholder="0"
                                value={drafts[`new-${p.id}`]?.cost ?? ""}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [`new-${p.id}`]: {
                                      ...(prev[`new-${p.id}`] ?? {
                                        cost: "",
                                        remaining: "1",
                                        expiry_date: "",
                                        expiry_type: "best_before",
                                        lot_label: "",
                                      }),
                                      cost: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                            <label>
                              <span>数量</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                placeholder="1"
                                value={drafts[`new-${p.id}`]?.remaining ?? ""}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [`new-${p.id}`]: {
                                      ...(prev[`new-${p.id}`] ?? {
                                        cost: "",
                                        remaining: "",
                                        expiry_date: "",
                                        expiry_type: "best_before",
                                        lot_label: "",
                                      }),
                                      remaining: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                            <label>
                              <span>期限</span>
                              <input
                                type="date"
                                value={drafts[`new-${p.id}`]?.expiry_date ?? ""}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [`new-${p.id}`]: {
                                      ...(prev[`new-${p.id}`] ?? {
                                        cost: "",
                                        remaining: "",
                                        expiry_date: "",
                                        expiry_type: "best_before",
                                        lot_label: "",
                                      }),
                                      expiry_date: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                            <label>
                              <span>種類</span>
                              <select
                                value={drafts[`new-${p.id}`]?.expiry_type ?? "best_before"}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [`new-${p.id}`]: {
                                      ...(prev[`new-${p.id}`] ?? {
                                        cost: "",
                                        remaining: "",
                                        expiry_date: "",
                                        expiry_type: "best_before",
                                        lot_label: "",
                                      }),
                                      expiry_type: e.target.value,
                                    },
                                  }))
                                }
                              >
                                <option value="best_before">賞味</option>
                                <option value="use_by">消費</option>
                              </select>
                            </label>
                            <label>
                              <span>メモ</span>
                              <input
                                type="text"
                                value={drafts[`new-${p.id}`]?.lot_label ?? ""}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [`new-${p.id}`]: {
                                      ...(prev[`new-${p.id}`] ?? {
                                        cost: "",
                                        remaining: "",
                                        expiry_date: "",
                                        expiry_type: "best_before",
                                        lot_label: "",
                                      }),
                                      lot_label: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                          </div>
                          <button
                            className="ac-save"
                            type="button"
                            disabled={busy}
                            onClick={() => addOneLot(p)}
                          >
                            この内容で1件追加
                          </button>
                        </div>

                        {/* ✅ 在庫を1個ずつ登録（同じ商品でも1個ごとに原価・期限） */}
                        <div className="ac-units">
                          <div className="ac-new-title">
                            在庫を1個ずつ登録（同じ商品でも1個ごとに原価・賞味期限を個別設定）
                          </div>
                          <p className="ac-units-desc">
                            商品を開くと、<b>まだロット登録していない在庫の数だけ入力欄が自動で並びます</b>。
                            それぞれの行に原価・期限を入れて登録すると、<b>1個＝1ロット</b>として保存されます。
                            {(() => {
                              const info = infoOf(p);
                              const unregistered = Math.max(0, toInt(p.stock) - info.remaining);
                              return (
                                <>
                                  （在庫 {toInt(p.stock)}個 ／ うちロット登録済み {info.remaining}個 ／{" "}
                                  <b>未登録 {unregistered}個</b>）
                                  {unregistered <= 0 && info.count > 0
                                    ? " すべて登録済みです。追加で登録する場合は個数を入れて「この個数で作り直す」を押してください。"
                                    : ""}
                                </>
                              );
                            })()}
                          </p>

                          <div className="ac-units-top">
                            <label>
                              <span>個数（作り直すとき）</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                placeholder="例: 10"
                                value={unitCount[p.id] ?? ""}
                                onChange={(e) =>
                                  setUnitCount((prev) => ({ ...prev, [p.id]: e.target.value }))
                                }
                              />
                            </label>

                            <button
                              className="ac-mini"
                              type="button"
                              onClick={() => buildUnitRows(p)}
                            >
                              この個数で作り直す
                            </button>

                            <label>
                              <span>原価をまとめて入力（円）</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                placeholder="例: 80"
                                value={unitBulkCost[p.id] ?? ""}
                                onChange={(e) =>
                                  setUnitBulkCost((prev) => ({ ...prev, [p.id]: e.target.value }))
                                }
                              />
                            </label>

                            <button
                              className="ac-mini"
                              type="button"
                              onClick={() => fillUnitCost(p)}
                            >
                              表示中の行に反映
                            </button>
                          </div>

                          {unitRows[p.id] !== undefined && (unitRows[p.id] ?? []).length === 0 && (
                            <p className="ac-units-empty">
                              未登録の在庫がないため入力欄はありません。追加で登録する場合は個数を入れて
                              「この個数で作り直す」を押してください。
                            </p>
                          )}

                          {(unitRows[p.id] ?? []).length > 0 && (
                            <>
                              <div className="ac-unit-list">
                                {(unitRows[p.id] ?? []).map((r, idx) => (
                                  <div className="ac-unit-row" key={idx}>
                                    <span className="ac-unit-no">{idx + 1}</span>

                                    <label>
                                      <span>原価（1個・円）</span>
                                      <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        value={r.cost}
                                        onChange={(e) =>
                                          setUnitRow(p.id, idx, "cost", e.target.value)
                                        }
                                      />
                                    </label>

                                    <label>
                                      <span>賞味期限 / 消費期限</span>
                                      <input
                                        type="date"
                                        value={r.expiry_date}
                                        onChange={(e) =>
                                          setUnitRow(p.id, idx, "expiry_date", e.target.value)
                                        }
                                      />
                                    </label>

                                    <label>
                                      <span>種類</span>
                                      <select
                                        value={r.expiry_type}
                                        onChange={(e) =>
                                          setUnitRow(p.id, idx, "expiry_type", e.target.value)
                                        }
                                      >
                                        <option value="best_before">賞味</option>
                                        <option value="use_by">消費</option>
                                      </select>
                                    </label>

                                    <button
                                      className="ac-del"
                                      type="button"
                                      onClick={() => removeUnitRow(p.id, idx)}
                                    >
                                      削除
                                    </button>
                                  </div>
                                ))}
                              </div>

                              <div className="ac-unit-foot">
                                <label className="ac-unit-sync">
                                  <input
                                    type="checkbox"
                                    checked={unitSyncStock[p.id] !== false}
                                    onChange={(e) =>
                                      setUnitSyncStock((prev) => ({
                                        ...prev,
                                        [p.id]: e.target.checked,
                                      }))
                                    }
                                  />
                                  <span>登録後に在庫数をロット残数に合わせる</span>
                                </label>

                                <button
                                  className="ac-save"
                                  type="button"
                                  disabled={busy}
                                  onClick={() => saveUnits(p)}
                                >
                                  {busy ? "処理中..." : `${(unitRows[p.id] ?? []).length}個を1個ずつ登録`}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="admin-costs-note">
            ※ ロットの残数は購入時に「セール分 → 期限が近い順」で自動的に減ります。
            在庫数（商品の在庫）とロット残数の合計がずれた場合は「在庫数をロット残数に合わせる」で揃えてください。
            <br />※ 同じ商品でも1個ごとに原価・期限を持たせたいときは「在庫を1個ずつ登録」を使ってください（1個＝1ロットで登録されます）。
            <br />※ セール（セール価格・セール販売の個数）は<b>商品管理</b>画面で設定します。
          </p>
        </div>
      </div>
    </>
  );
}
