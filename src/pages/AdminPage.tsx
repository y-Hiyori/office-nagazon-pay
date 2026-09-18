// src/pages/AdminPage.tsx
// ✅ 商品管理（完全統合版 / v21）
//   ・商品の追加（在庫を入れるときは原価と期限が必須）
//   ・入荷（在庫を増やす＝原価と期限が必須）
//   ・在庫を減らす（理由と対象ロットが必須／履歴に残る）
//   ・ロットの編集、期限なし、セール設定、購入上限、表示切替
//   すべてこの1画面で行います（仕入れ原価画面は廃止）。
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminPage.css";
import "./AdminCosts.css";
import { findProductImage } from "../data/products";
import {
  daysLeftOf,
  expiryStatusLabel,
  expiryStatusOf,
  setProductSale,
  type ExpiryStatus,
} from "../lib/lots";
import { appDialog } from "../lib/appDialog";

type ViewMode = "all" | "selling" | "hidden" | "stock" | "expiry" | "expired" | "sale" | "missing";

type ProductRow = {
  id: number;
  name: string | null;
  price: number | null;
  stock: number | null;
  is_visible?: boolean | null;
  max_per_order?: number | null;
  expiry_alert_days?: number | null;
  sale_price?: number | null;
  sale_qty?: number | null;
  sale_remaining?: number | null;
};

type Lot = {
  id: string;
  product_id: number;
  lot_label: string | null;
  cost: number;
  quantity: number;
  remaining: number;
  expiry_date: string | null;
  expiry_type: string;
  no_expiry?: boolean | null;
  received_at: string | null;
};

type LotDraft = {
  cost: string;
  expiry_date: string;
  expiry_type: string;
  lot_label: string;
  no_expiry: boolean;
  remaining?: string; // 「1件ずつ追加」フォーム用
};

type UnitDraft = {
  cost: string;
  expiry_date: string;
  expiry_type: "best_before" | "use_by";
  no_expiry: boolean;
};

type Reason = "discard" | "expired" | "return" | "sample" | "other";

const REASONS: { value: Reason; label: string }[] = [
  { value: "discard", label: "廃棄（傷み・破損）" },
  { value: "expired", label: "期限切れ廃棄" },
  { value: "return", label: "返品・返却" },
  { value: "sample", label: "試食・サンプル提供" },
  { value: "other", label: "その他（メモ必須）" },
];

const reasonLabel = (v: string) => REASONS.find((r) => r.value === v)?.label ?? v;

type AdjustState = {
  productId: number;
  productName: string;
  lotId: string;
  lotLabel: string | null;
  remaining: number;
  cost: number;
  expiryDate: string | null;
  qty: string;
  reason: "" | Reason;
  memo: string;
};

type AddForm = {
  productId: string;
  name: string;
  price: string;
  originalPrice: string;
  stock: string;
  memberPrice: string;
  earnPoints: string;
  cost: string;
  maxPerOrder: string;
  alertDays: string;
  expiryDate: string;
  expiryType: "best_before" | "use_by";
  noExpiry: boolean;
  lotLabel: string;
  isShipping: boolean;
  shippingLeadMin: string;
  shippingLeadMax: string;
  shippingLeadUnit: "business_days" | "days";
};

const emptyAddForm: AddForm = {
  productId: "",
  name: "",
  price: "",
  originalPrice: "",
  stock: "",
  memberPrice: "",
  earnPoints: "",
  cost: "",
  maxPerOrder: "",
  alertDays: "30",
  expiryDate: "",
  expiryType: "best_before",
  noExpiry: false,
  lotLabel: "初回入荷",
  isShipping: false,
  shippingLeadMin: "",
  shippingLeadMax: "",
  shippingLeadUnit: "business_days",
};

const toInt = (v: any) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
};

const yen = (v: any) => toInt(v).toLocaleString("ja-JP");

const draftOf = (l: Lot): LotDraft => ({
  cost: String(toInt(l.cost)),
  expiry_date: l.expiry_date ? String(l.expiry_date).slice(0, 10) : "",
  expiry_type: l.expiry_type === "use_by" ? "use_by" : "best_before",
  lot_label: l.lot_label ?? "",
  no_expiry: !!l.no_expiry,
});

const emptyUnit = (cost: string, noExpiry = false): UnitDraft => ({
  cost,
  expiry_date: "",
  expiry_type: "best_before",
  no_expiry: noExpiry,
});

function AdminPage() {
  const navigate = useNavigate();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [q, setQ] = useState("");

  // セール設定
  const [saleReady, setSaleReady] = useState(true);
  const [saleOpenId, setSaleOpenId] = useState<number | null>(null);
  const [saleDraft, setSaleDraft] = useState<Record<number, { price: string; qty: string }>>({});

  // 展開中の商品
  const [openId, setOpenId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LotDraft>>({});

  // 在庫を1個ずつ登録
  const [unitCount, setUnitCount] = useState<Record<number, string>>({});
  const [unitBulkCost, setUnitBulkCost] = useState<Record<number, string>>({});
  const [unitRows, setUnitRows] = useState<Record<number, UnitDraft[]>>({});
  const [unitSyncStock, setUnitSyncStock] = useState<Record<number, boolean>>({});

  // 在庫を減らす
  const [adjust, setAdjust] = useState<AdjustState | null>(null);
  const [reduceErr, setReduceErr] = useState("");

  // 期限なし機能が使えるか（v20のSQL実行済みか）
  const [noExpiryReady, setNoExpiryReady] = useState(true);

  // 商品追加
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(emptyAddForm);
  const [addErr, setAddErr] = useState("");

  const load = async () => {
    setLoading(true);

    const baseCols = "id,name,price,stock,is_visible,max_per_order,expiry_alert_days";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pRes: any = await supabase
      .from("products")
      .select(`${baseCols},sale_price,sale_qty,sale_remaining`)
      .order("id", { ascending: true });

    if (pRes.error) {
      console.warn("商品取得（セール列あり）エラー:", pRes.error);
      setSaleReady(false);
      pRes = await supabase.from("products").select(baseCols).order("id", { ascending: true });
    } else {
      setSaleReady(true);
    }

    const lRes = await supabase.from("product_lots").select("*");

    if (pRes.error) {
      console.error("商品取得エラー:", pRes.error);
      setProducts([]);
    } else {
      setProducts((pRes.data ?? []) as ProductRow[]);
    }

    if (lRes.error) {
      console.error("ロット取得エラー:", lRes.error);
      setLots([]);
    } else {
      const ls = (lRes.data ?? []) as Lot[];
      setLots(ls);
      const d: Record<string, LotDraft> = {};
      for (const l of ls) d[l.id] = draftOf(l);
      setDrafts(d);

      const probe = await supabase.from("product_lots").select("no_expiry").limit(1);
      setNoExpiryReady(!probe.error);
    }

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
    let missingCost = false;
    let missingExpiry = false;
    let hasDated = false;
    let hasNoExpiry = false;

    for (const l of ls) {
      const rem = Math.max(0, toInt(l.remaining));
      remaining += rem;
      costSum += toInt(l.cost) * rem;
      if (rem > 0 && toInt(l.cost) <= 0) missingCost = true;
      if (rem > 0 && !l.expiry_date && !l.no_expiry) missingExpiry = true;
      if (rem > 0 && l.expiry_date) {
        hasDated = true;
        const d = String(l.expiry_date).slice(0, 10);
        if (!nearest || d < nearest) nearest = d;
      }
      if (rem > 0 && !l.expiry_date && l.no_expiry) hasNoExpiry = true;
    }

    const avgCost = remaining > 0 ? Math.round(costSum / remaining) : 0;
    const status: ExpiryStatus = expiryStatusOf(nearest, alertDays);
    const stockNum = Math.max(0, toInt(p.stock));

    const salePriceNum = toInt(p.sale_price) > 0 ? toInt(p.sale_price) : null;
    const saleQtyN = Math.max(0, toInt(p.sale_qty));
    const saleRemainingN = Math.max(0, toInt(p.sale_remaining));
    const limitNum = toInt(p.max_per_order);

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
      stockNum,
      unregistered: Math.max(0, stockNum - remaining),
      missingCost,
      missingExpiry,
      noExpiryOnly: !hasDated && hasNoExpiry,
      hasSale: salePriceNum != null && saleRemainingN > 0,
      salePrice: salePriceNum,
      saleQtyN,
      saleRemainingN,
      limit: limitNum > 0 ? limitNum : null,
    };
  };

  const extended = useMemo(
    () => products.map((p) => ({ p, info: infoOf(p) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, lotsByProduct]
  );

  const counts = useMemo(() => {
    let expired = 0;
    let soon = 0;
    let sale = 0;
    let missing = 0;
    let missingField = 0;
    for (const { info } of extended) {
      if (info.status === "expired") expired++;
      else if (info.status === "urgent" || info.status === "warn") soon++;
      if (info.hasSale) sale++;
      if (info.unregistered > 0) missing++;
      else if (info.missingCost || info.missingExpiry) missingField++;
    }
    return { expired, soon, sale, missing, missingField };
  }, [extended]);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let list = [...extended];

    if (kw) {
      list = list.filter(
        ({ p }) =>
          String(p.name ?? "").toLowerCase().includes(kw) || String(p.id).includes(kw)
      );
    }

    if (viewMode === "selling") list = list.filter(({ info, p }) => (p.is_visible ?? true) && info.stockNum > 0);
    if (viewMode === "hidden") list = list.filter(({ p }) => p.is_visible === false);
    if (viewMode === "sale") list = list.filter(({ info }) => info.hasSale);
    if (viewMode === "missing")
      list = list.filter(({ info }) => info.unregistered > 0 || info.missingCost || info.missingExpiry);

    if (viewMode === "stock") {
      list = list.filter(({ info }) => info.stockNum <= 3);
      list.sort((a, b) => a.info.stockNum - b.info.stockNum || a.p.id - b.p.id);
      return list;
    }

    if (viewMode === "expiry" || viewMode === "expired") {
      list = list.filter(({ info }) =>
        viewMode === "expired"
          ? info.status === "expired"
          : info.status === "expired" || info.status === "urgent" || info.status === "warn"
      );
      list.sort((a, b) => {
        const ad = a.info.days ?? Number.MAX_SAFE_INTEGER;
        const bd = b.info.days ?? Number.MAX_SAFE_INTEGER;
        if (ad !== bd) return ad - bd;
        return a.p.id - b.p.id;
      });
      return list;
    }

    list.sort((a, b) => a.p.id - b.p.id);
    return list;
  }, [extended, viewMode, q]);

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

  // ---------- 表示切替 ----------
  const toggleVisible = async (id: number, nextVisible: boolean) => {
    const { error } = await supabase.from("products").update({ is_visible: nextVisible }).eq("id", id);
    if (error) {
      console.error("表示切替エラー:", error);
      setMsg("表示切替に失敗しました: " + error.message);
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, is_visible: nextVisible } : p)));
  };

  // ---------- セール ----------
  const openSale = (id: number) => {
    if (saleOpenId === id) {
      setSaleOpenId(null);
      return;
    }
    setMsg("");
    setSaleOpenId(id);
    const row = extended.find((e) => e.p.id === id);
    setSaleDraft((prev) => ({
      ...prev,
      [id]: prev[id] ?? {
        price: row?.info.salePrice != null ? String(row.info.salePrice) : "",
        qty: row && row.info.saleQtyN > 0 ? String(row.info.saleQtyN) : "",
      },
    }));
  };

  const resetSaleDraft = (id: number) => {
    setSaleDraft((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const applySale = async (id: number, name: string | null, stockNum: number) => {
    if (busyId != null) return;
    const d = saleDraft[id] ?? { price: "", qty: "" };
    const price = toInt(d.price);
    const qty = toInt(d.qty);

    if (price <= 0 || qty <= 0) {
      setMsg("セール価格（1円以上）とセール個数（1個以上）を入力してください");
      return;
    }
    if (stockNum > 0 && qty > stockNum) {
      setMsg(`在庫は${stockNum}個です。セール個数は在庫以下にしてください`);
      return;
    }

    const ok = await appDialog.confirm({
      message: `「${name ?? id}」を セール価格 ¥${yen(price)} × ${qty}個 で販売しますか？`,
    });
    if (!ok) return;

    setBusyId(id);
    try {
      const res = await setProductSale(id, price, qty);
      if (!res.ok) {
        setMsg("セール設定に失敗しました: " + res.error);
        return;
      }
      setMsg(`セールを設定しました（${name ?? id}：¥${yen(price)} × ${qty}個）`);
      setSaleOpenId(null);
      resetSaleDraft(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const clearSale = async (id: number, name: string | null) => {
    if (busyId != null) return;
    const ok = await appDialog.confirm({
      message: `「${name ?? id}」のセールを解除して通常価格に戻しますか？`,
    });
    if (!ok) return;

    setBusyId(id);
    try {
      const res = await setProductSale(id, 0, 0);
      if (!res.ok) {
        setMsg("セール解除に失敗しました: " + res.error);
        return;
      }
      setMsg(`「${name ?? id}」のセールを解除しました（通常価格に戻りました）`);
      setSaleOpenId(null);
      resetSaleDraft(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  // ---------- 在庫に合わせてロットを一括作成 ----------
  const backfillAll = async () => {
    if (busy) return;
    const targets = extended.filter((e) => e.info.unregistered > 0);
    if (targets.length === 0) {
      setMsg("ロット未作成の在庫はありません（すべて在庫とロットが一致しています）");
      return;
    }
    const total = targets.reduce((s, t) => s + t.info.unregistered, 0);

    const ok = await appDialog.confirm({
      message:
        `${targets.length}商品・合計${total}個のロットを、いまの在庫数に合わせて作成します。\n\n` +
        "・在庫数は変わりません（すでにある在庫をロットとして登録するだけです）\n" +
        "・原価は0円・期限は未設定で作られます\n" +
        "・作成後、各商品を開いて「原価」と「賞味期限」を入力してください\n\n" +
        "よろしいですか？",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const rows = targets.map((t) => ({
        product_id: t.p.id,
        lot_label: "初期在庫（要編集）",
        cost: 0,
        quantity: t.info.unregistered,
        remaining: t.info.unregistered,
        expiry_date: null,
        expiry_type: "best_before",
      }));
      const { error } = await supabase.from("product_lots").insert(rows);
      if (error) {
        setMsg("作成に失敗しました: " + error.message);
        return;
      }
      setMsg(
        `${targets.length}商品・${total}個のロットを作成しました。原価と期限が未入力なので、各商品を開いて入力してください`
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ---------- 1個ずつ登録 ----------
  const ensureUnitRows = (p: ProductRow) => {
    if (unitRows[p.id] !== undefined) return;
    const info = infoOf(p);
    const n = info.unregistered;
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
      [p.id]: Array.from({ length: unit }, () => emptyUnit(base)),
    }));
  };

  const buildUnitRows = (p: ProductRow) => {
    const n = Math.min(200, Math.max(0, toInt(unitCount[p.id])));
    if (n <= 0) {
      setMsg("個数を1以上で入力してください");
      return;
    }
    const base = (unitBulkCost[p.id] ?? "").trim();
    setUnitRows((prev) => ({
      ...prev,
      [p.id]: Array.from({ length: n }, () => emptyUnit(base)),
    }));
    setMsg(`${n}個ぶんの入力欄を作りました。原価と期限を入れてください`);
  };

  const setUnitRow = (pid: number, idx: number, key: keyof UnitDraft, value: string) => {
    setUnitRows((prev) => {
      const rows = [...(prev[pid] ?? [])];
      if (!rows[idx]) return prev;
      const row = { ...rows[idx] };
      if (key === "no_expiry") {
        row.no_expiry = value === "1";
        if (value === "1") row.expiry_date = "";
      } else if (key === "expiry_type") {
        row.expiry_type = value === "use_by" ? "use_by" : "best_before";
      } else {
        row[key] = value;
      }
      rows[idx] = row;
      return { ...prev, [pid]: rows };
    });
  };

  const removeUnitRow = (pid: number, idx: number) => {
    setUnitRows((prev) => ({ ...prev, [pid]: (prev[pid] ?? []).filter((_, i) => i !== idx) }));
  };

  const fillUnitCost = (p: ProductRow) => {
    const v = (unitBulkCost[p.id] ?? "").trim();
    setUnitRows((prev) => ({
      ...prev,
      [p.id]: (prev[p.id] ?? []).map((r) => ({ ...r, cost: v })),
    }));
  };

  const setAllUnitNoExpiry = (p: ProductRow) => {
    setUnitRows((prev) => ({
      ...prev,
      [p.id]: (prev[p.id] ?? []).map((r) => ({ ...r, no_expiry: true, expiry_date: "" })),
    }));
  };

  const saveUnits = async (p: ProductRow) => {
    if (busy) return;
    const rows = unitRows[p.id] ?? [];
    if (rows.length === 0) {
      setMsg("先に個数を入れて「この個数で作り直す」を押してください");
      return;
    }
    if (rows.some((r) => r.cost.trim() === "")) {
      setMsg("原価は全行に入力してください（在庫を増やすときは必須です）");
      return;
    }
    if (rows.some((r) => !r.no_expiry && r.expiry_date.trim() === "")) {
      setMsg(
        "賞味期限（消費期限）を入力するか、「期限なし」にチェックしてください（在庫を増やすときは必須です）"
      );
      return;
    }
    if (rows.some((r) => r.no_expiry) && !noExpiryReady) {
      setMsg("「期限なし」を使うには supabase_v20_no_expiry.sql を実行してください");
      return;
    }

    const parsed = rows.map((r) => ({
      cost: Math.max(0, toInt(r.cost)),
      expiry_date: r.no_expiry ? null : r.expiry_date.trim(),
      expiry_type: r.expiry_type === "use_by" ? "use_by" : "best_before",
      no_expiry: r.no_expiry,
    }));

    const syncAfter = unitSyncStock[p.id] !== false;
    const stockNow = toInt(p.stock);

    const ok = await appDialog.confirm({
      message:
        `「${p.name ?? p.id}」に ${parsed.length}個ぶんのロットを1個ずつ登録し、在庫を ${parsed.length}個 増やします。\n` +
        `在庫数：${stockNow} → ${stockNow + parsed.length}\n` +
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
          expiry_date: r.expiry_date,
          expiry_type: r.expiry_type,
          no_expiry: r.no_expiry,
        }))
      );
      if (error) {
        setMsg("登録に失敗しました: " + error.message);
        return;
      }

      if (syncAfter) {
        const { error: e2 } = await supabase
          .from("products")
          .update({ stock: stockNow + parsed.length })
          .eq("id", p.id);
        if (e2) {
          setMsg("ロットは登録しましたが、在庫数の更新に失敗しました: " + e2.message);
        } else {
          setMsg(
            `${parsed.length}個ぶんを1個ずつ登録し、在庫数を ${stockNow + parsed.length} に更新しました`
          );
        }
      } else {
        setMsg(`${parsed.length}個ぶんを1個ずつ登録しました（在庫数は変えていません）`);
      }

      setUnitRows((prev) => ({ ...prev, [p.id]: [] }));
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ---------- ロット編集 ----------
  const saveLot = async (l: Lot) => {
    if (busy) return;
    const d = drafts[l.id];
    if (!d) return;

    if (d.cost.trim() === "") {
      setMsg("原価を入力してください");
      return;
    }
    if (!d.no_expiry && d.expiry_date.trim() === "") {
      setMsg("賞味期限（消費期限）を入力するか、「期限なし」にチェックしてください");
      return;
    }
    if (d.no_expiry && !noExpiryReady) {
      setMsg("「期限なし」を使うには supabase_v20_no_expiry.sql を実行してください");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase
        .from("product_lots")
        .update({
          cost: Math.max(0, toInt(d.cost)),
          expiry_date: d.no_expiry ? null : d.expiry_date.trim(),
          expiry_type: d.expiry_type === "use_by" ? "use_by" : "best_before",
          no_expiry: d.no_expiry,
          lot_label: d.lot_label.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", l.id);
      if (error) {
        setMsg("保存に失敗しました: " + error.message);
        return;
      }
      setMsg("ロットを保存しました");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const deleteEmptyLot = async (l: Lot) => {
    if (busy) return;
    if (toInt(l.remaining) > 0) {
      setMsg("残りがあるロットは削除できません。「在庫を減らす」から理由を選んでください");
      return;
    }
    const ok = await appDialog.confirm({
      message: "残数0のこのロットを削除しますか？（在庫数は変わりません）",
    });
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

  // ---------- 在庫を減らす ----------
  const requestReduce = (p: ProductRow, l: Lot) => {
    setReduceErr("");
    setAdjust({
      productId: p.id,
      productName: p.name ?? String(p.id),
      lotId: l.id,
      lotLabel: l.lot_label,
      remaining: toInt(l.remaining),
      cost: toInt(l.cost),
      expiryDate: l.expiry_date ? String(l.expiry_date).slice(0, 10) : null,
      qty: String(toInt(l.remaining)),
      reason: "",
      memo: "",
    });
  };

  const confirmReduce = async () => {
    if (!adjust || busy) return;

    const qty = Math.floor(Number(adjust.qty));
    if (!Number.isFinite(qty) || qty <= 0) {
      setReduceErr("減らす数は1以上で入力してください");
      return;
    }
    if (qty > adjust.remaining) {
      setReduceErr(`このロットの残りは${adjust.remaining}個です`);
      return;
    }
    if (!adjust.reason) {
      setReduceErr("理由を選択してください（必須）");
      return;
    }
    if (adjust.reason === "other" && adjust.memo.trim() === "") {
      setReduceErr("「その他」を選んだ場合はメモを入力してください");
      return;
    }

    const product = products.find((pp) => pp.id === adjust.productId);
    if (!product) {
      setReduceErr("商品が見つかりません。画面を再読み込みしてください");
      return;
    }

    setBusy(true);
    try {
      const newRemaining = adjust.remaining - qty;
      const fullDelete = newRemaining <= 0;

      if (fullDelete) {
        const { error } = await supabase.from("product_lots").delete().eq("id", adjust.lotId);
        if (error) {
          setReduceErr("削除に失敗しました: " + error.message);
          return;
        }
      } else {
        const { error } = await supabase
          .from("product_lots")
          .update({ remaining: newRemaining, updated_at: new Date().toISOString() })
          .eq("id", adjust.lotId);
        if (error) {
          setReduceErr("更新に失敗しました: " + error.message);
          return;
        }
      }

      const stockNow = Math.max(0, toInt(product.stock));
      const { error: eStock } = await supabase
        .from("products")
        .update({ stock: Math.max(0, stockNow - qty) })
        .eq("id", product.id);
      if (eStock) console.error("stock update error:", eStock);

      const { error: eLog } = await supabase.from("stock_adjustments").insert({
        product_id: product.id,
        lot_id: adjust.lotId,
        qty: -qty,
        reason: adjust.reason,
        memo: adjust.memo.trim() || null,
        lot_label: adjust.lotLabel,
        cost: adjust.cost,
        expiry_date: adjust.expiryDate,
      });
      if (eLog) {
        console.warn("stock_adjustments insert failed:", eLog);
        setMsg(
          `在庫を${qty}個減らしました（理由：${reasonLabel(adjust.reason)}）／履歴の保存に失敗: ${eLog.message}`
        );
      } else {
        setMsg(
          `「${product.name ?? product.id}」の在庫を${qty}個減らしました（理由：${reasonLabel(
            adjust.reason
          )}）${fullDelete ? "／ロットを削除しました" : ""}`
        );
      }

      setAdjust(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ---------- 1件ずつ追加（数量まとめて入荷） ----------
  const addOneLot = async (p: ProductRow) => {
    if (busy) return;
    const d = drafts[`new-${p.id}`];
    const costRaw = d ? d.cost.trim() : "";
    const qty = d ? Math.max(1, toInt(d.remaining)) : 1;
    const noExpiry = !!d?.no_expiry;
    const expiry = noExpiry ? "" : d ? d.expiry_date.trim() : "";

    if (costRaw === "") {
      setMsg("原価を入力してください（在庫を増やすときは必須です）");
      return;
    }
    if (!noExpiry && expiry === "") {
      setMsg(
        "賞味期限（消費期限）を入力するか、「期限なし」にチェックしてください（在庫を増やすときは必須です）"
      );
      return;
    }
    if (noExpiry && !noExpiryReady) {
      setMsg("「期限なし」を使うには supabase_v20_no_expiry.sql を実行してください");
      return;
    }

    const stockNow = toInt(p.stock);
    const ok = await appDialog.confirm({
      message:
        `「${p.name ?? p.id}」に ${qty}個のロットを追加し、在庫を ${qty}個 増やします。\n` +
        `在庫数：${stockNow} → ${stockNow + qty}\n` +
        "よろしいですか？",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase.from("product_lots").insert({
        product_id: p.id,
        lot_label: d?.lot_label?.trim() || null,
        cost: Math.max(0, toInt(costRaw)),
        quantity: qty,
        remaining: qty,
        expiry_date: noExpiry ? null : expiry,
        expiry_type: d?.expiry_type === "use_by" ? "use_by" : "best_before",
        no_expiry: noExpiry,
      });
      if (error) {
        setMsg("追加に失敗しました: " + error.message);
        return;
      }

      await supabase.from("products").update({ stock: stockNow + qty }).eq("id", p.id);
      setMsg(`ロットを追加し、在庫数を ${stockNow + qty} に更新しました`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ---------- 棚卸し調整 ----------
  const syncStock = async (p: ProductRow) => {
    if (busy) return;
    const info = infoOf(p);
    const stockNow = info.stockNum;
    const diff = info.remaining - stockNow;

    if (diff === 0) {
      setMsg("在庫数とロット残数はすでに一致しています");
      return;
    }

    const ok = await appDialog.confirm({
      message:
        `「${p.name ?? p.id}」の在庫数を ${stockNow} → ${info.remaining} に合わせますか？\n` +
        `（${diff > 0 ? "+" : ""}${diff}個／棚卸し調整として履歴に残ります）`,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase.from("products").update({ stock: info.remaining }).eq("id", p.id);
      if (error) {
        setMsg("在庫の更新に失敗しました: " + error.message);
        return;
      }
      await supabase.from("stock_adjustments").insert({
        product_id: p.id,
        lot_id: null,
        qty: diff,
        reason: "棚卸し調整（在庫数をロット残数に合わせる）",
        memo: null,
        lot_label: null,
        cost: null,
        expiry_date: null,
      });
      setMsg(`在庫数をロット残数（${info.remaining}）に合わせました`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ---------- 商品を追加（在庫を入れるときは原価・期限が必須） ----------
  const submitAddProduct = async () => {
    if (busy) return;
    setAddErr("");

    const f = addForm;
    const idNum = Number(f.productId);
    const priceNum = Number(f.price);
    const stockNum = Number(f.stock || 0);
    const costNum = Math.floor(Number(f.cost || 0));
    const originalPriceNum = f.originalPrice.trim() === "" ? null : Number(f.originalPrice);

    if (!f.productId || !f.name || !f.price) {
      setAddErr("商品ID・商品名・価格を入力してください");
      return;
    }
    if (!Number.isInteger(idNum) || idNum <= 0) {
      setAddErr("商品IDは1以上の整数で入力してください");
      return;
    }
    if (!Number.isFinite(priceNum) || !Number.isFinite(stockNum) || stockNum < 0) {
      setAddErr("価格・在庫は数値で入力してください");
      return;
    }
    if (originalPriceNum != null && (!Number.isFinite(originalPriceNum) || originalPriceNum <= priceNum)) {
      setAddErr("通常価格は販売価格より大きい金額を入力してください");
      return;
    }
    if (stockNum > 0) {
      if (f.cost.trim() === "") {
        setAddErr(
          "在庫を登録する場合は「仕入れ原価（1個あたり）」が必須です。入荷ロットとして登録されます。"
        );
        return;
      }
      if (!f.noExpiry && f.expiryDate.trim() === "") {
        setAddErr(
          "在庫を登録する場合は「賞味期限 / 消費期限」の入力（または「期限なし」の選択）が必須です。"
        );
        return;
      }
      if (f.noExpiry && !noExpiryReady) {
        setAddErr("「期限なし」を使うには supabase_v20_no_expiry.sql を実行してください");
        return;
      }
    }
    if (f.isShipping) {
      const min = f.shippingLeadMin.trim();
      const max = f.shippingLeadMax.trim();
      if (min === "" || max === "") {
        setAddErr("発送商品では発送目安（最短・最長）の入力が必要です");
        return;
      }
      if (Number(min) > Number(max)) {
        setAddErr("発送目安は「最短 ≦ 最長」になるよう入力してください");
        return;
      }
    }

    const payload: Record<string, unknown> = {
      id: idNum,
      name: f.name.trim(),
      price: priceNum,
      cost: costNum,
      stock: stockNum,
      member_price: f.memberPrice.trim() === "" ? null : Math.floor(Number(f.memberPrice)),
      earn_points: Math.max(0, Math.floor(Number(f.earnPoints || 0) || 0)),
      max_per_order: f.maxPerOrder.trim() === "" ? null : Math.max(1, Math.floor(Number(f.maxPerOrder))),
      expiry_alert_days: f.alertDays.trim() === "" ? 30 : Math.max(1, Math.floor(Number(f.alertDays))),
      is_shipping: f.isShipping,
      shipping_lead_min: f.isShipping ? Math.floor(Number(f.shippingLeadMin)) : null,
      shipping_lead_max: f.isShipping ? Math.floor(Number(f.shippingLeadMax)) : null,
      shipping_lead_unit: f.isShipping ? f.shippingLeadUnit : "business_days",
    };
    if (originalPriceNum != null) payload.original_price = originalPriceNum;

    setBusy(true);
    try {
      const { error } = await supabase.from("products").insert(payload);
      if (error) {
        setAddErr("商品追加に失敗: " + error.message);
        return;
      }

      if (stockNum > 0) {
        const { error: eLot } = await supabase.from("product_lots").insert({
          product_id: idNum,
          lot_label: f.lotLabel.trim() || "初回入荷",
          cost: costNum,
          quantity: stockNum,
          remaining: stockNum,
          expiry_date: f.noExpiry ? null : f.expiryDate.trim(),
          expiry_type: f.expiryType,
          no_expiry: f.noExpiry,
        });
        if (eLot) {
          setAddErr(
            "商品は追加しましたが、入荷ロットの登録に失敗しました: " +
              eLot.message +
              "（この画面で改めて入荷してください）"
          );
          await load();
          return;
        }
      }

      setMsg(`商品「${f.name.trim()}」を追加しました${stockNum > 0 ? "（入荷ロットも登録）" : ""}`);
      setAddOpen(false);
      setAddForm(emptyAddForm);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdminHeader />

      <div className="admin-page" style={{ paddingTop: 80 }}>
        <div className="admin-top-actions">
          <button className="admin-add" onClick={() => { setAddErr(""); setAddOpen(true); }}>
            ＋商品を追加
          </button>
          <button className="admin-add" onClick={backfillAll} disabled={busy}>
            在庫に合わせてロットを一括作成
          </button>
        </div>

        {!saleReady && (
          <div className="admin-msg">
            セール設定を使うには supabase_v18_product_sale.sql を実行してください。
          </div>
        )}

        {!noExpiryReady && (
          <div className="admin-msg">
            「期限なし」を使うには supabase_v20_no_expiry.sql を実行してください。
          </div>
        )}

        {msg && <div className="admin-msg">{msg}</div>}

        {/* ✅ アラート／絞り込みチップ */}
        {(counts.expired > 0 ||
          counts.soon > 0 ||
          counts.sale > 0 ||
          counts.missing > 0 ||
          counts.missingField > 0) && (
          <div className="admin-alertbar">
            {counts.expired > 0 && (
              <button className="admin-alert-chip is-expired" onClick={() => setViewMode("expired")}>
                期限切れ {counts.expired}件
              </button>
            )}
            {counts.soon > 0 && (
              <button className="admin-alert-chip is-warn" onClick={() => setViewMode("expiry")}>
                期限間近 {counts.soon}件
              </button>
            )}
            {counts.sale > 0 && (
              <button className="admin-alert-chip is-sale" onClick={() => setViewMode("sale")}>
                セール中 {counts.sale}件
              </button>
            )}
            {counts.missing > 0 && (
              <button className="admin-alert-chip is-missing" onClick={() => setViewMode("missing")}>
                ロット未作成の在庫 {counts.missing}件
              </button>
            )}
            {counts.missingField > 0 && (
              <button className="admin-alert-chip is-missing" onClick={() => setViewMode("missing")}>
                原価・期限が未入力 {counts.missingField}件
              </button>
            )}
          </div>
        )}

        <input
          className="admin-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="商品名 or 商品IDで絞り込み"
          inputMode="search"
        />

        <div className="admin-sort-row">
          <button className={`admin-sort-btn ${viewMode === "all" ? "active" : ""}`} onClick={() => setViewMode("all")}>
            全て
          </button>
          <button
            className={`admin-sort-btn ${viewMode === "selling" ? "active" : ""}`}
            onClick={() => setViewMode("selling")}
          >
            販売中
          </button>
          <button
            className={`admin-sort-btn ${viewMode === "hidden" ? "active" : ""}`}
            onClick={() => setViewMode("hidden")}
          >
            非表示
          </button>
          <button
            className={`admin-sort-btn ${viewMode === "stock" ? "active" : ""}`}
            onClick={() => setViewMode("stock")}
          >
            在庫注意
          </button>
          <button
            className={`admin-sort-btn ${viewMode === "missing" ? "active" : ""}`}
            onClick={() => setViewMode("missing")}
          >
            ロット未整備
          </button>
          <button
            className={`admin-sort-btn ${viewMode === "expiry" ? "active" : ""}`}
            onClick={() => setViewMode("expiry")}
          >
            期限間近
          </button>
          <button
            className={`admin-sort-btn ${viewMode === "expired" ? "active" : ""}`}
            onClick={() => setViewMode("expired")}
          >
            期限切れ
          </button>
          <button
            className={`admin-sort-btn ${viewMode === "sale" ? "active" : ""}`}
            onClick={() => setViewMode("sale")}
          >
            セール中
          </button>
        </div>

        <div className="admin-list">
          {loading ? (
            <p>読み込み中...</p>
          ) : shown.length === 0 ? (
            <p>
              {viewMode === "missing"
                ? "ロット未整備の商品はありません"
                : "該当する商品がありません"}
            </p>
          ) : (
            shown.map(({ p, info }) => {
              const imgSrc = findProductImage(p.id);
              const isOpen = openId === p.id;

              return (
                <div
                  key={p.id}
                  className={`admin-item ${info.stockNum <= 0 ? "admin-item-soldout" : ""} ${
                    info.stockNum > 0 && info.stockNum <= 3 ? "admin-item-low" : ""
                  } ${info.status === "expired" ? "admin-item-expired" : ""} ${isOpen ? "is-open" : ""}`}
                >
                  <div
                    className="admin-item-head"
                    onClick={() => {
                      if (isOpen) {
                        setOpenId(null);
                      } else {
                        ensureUnitRows(p);
                        setOpenId(p.id);
                      }
                    }}
                  >
                    {imgSrc ? (
                      <img src={imgSrc} alt={p.name ?? ""} />
                    ) : (
                      <div className="admin-no-img">画像なし</div>
                    )}

                    <div className="admin-info">
                      <h3>
                        {p.name}
                        {p.is_visible === false && <span className="admin-tag">非表示</span>}
                        {info.hasSale && (
                          <span className="admin-tag sale">セール中 残{info.saleRemainingN}個</span>
                        )}
                        {info.limit != null && <span className="admin-tag limit">1会計{info.limit}個まで</span>}
                        {info.unregistered > 0 && (
                          <span className="admin-tag warn">ロット未作成 {info.unregistered}個</span>
                        )}
                        {info.unregistered === 0 && (info.missingCost || info.missingExpiry) && (
                          <span className="admin-tag warn">
                            {info.missingCost && info.missingExpiry
                              ? "原価・期限が未入力"
                              : info.missingCost
                              ? "原価が未入力"
                              : "期限が未設定"}
                          </span>
                        )}
                      </h3>

                      <p>{toInt(p.price).toLocaleString("ja-JP")}円</p>

                      <div className="admin-stock-line">
                        <span className="admin-stock-label">在庫: {info.stockNum}</span>
                        {info.stockNum <= 0 && <span className="admin-stock-badge soldout">在庫切れ</span>}
                        {info.stockNum > 0 && info.stockNum <= 3 && (
                          <span className="admin-stock-badge low">残りわずか</span>
                        )}
                        <button
                          className={`admin-visible-btn ${p.is_visible === false ? "off" : "on"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleVisible(p.id, p.is_visible === false);
                          }}
                        >
                          {p.is_visible === false ? "非表示" : "表示中"}
                        </button>
                      </div>

                      <div className="admin-exp-line">
                        <span className={`admin-exp ${statusClass(info.status)}`}>
                          {info.noExpiryOnly ? "期限なし" : expiryStatusLabel(info.status, info.days)}
                        </span>
                        {info.nearest && <span className="admin-exp-date">{info.nearest}</span>}
                        {info.status !== "none" && info.status !== "ok" && (
                          <span className="admin-exp-note">{info.alertDays}日以内で警告中</span>
                        )}
                      </div>

                      <div className="admin-cost-line">
                        <span>
                          ロット {info.count}件 / 残 {info.remaining}
                        </span>
                        <span>平均原価 ¥{yen(info.avgCost)}</span>
                        <span>在庫原価 ¥{yen(info.costSum)}</span>
                      </div>

                      <div className="admin-open-hint">{isOpen ? "▲ 閉じる" : "▼ 入荷・在庫の操作を開く"}</div>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="ac-lots" onClick={(e) => e.stopPropagation()}>
                      <div className="ac-lots-actions">
                        <button className="ac-mini" type="button" onClick={() => syncStock(p)} disabled={busy}>
                          在庫数をロット残数（{info.remaining}）に合わせる
                        </button>
                        <button className="ac-mini" type="button" onClick={() => navigate(`/admin-edit/${p.id}`)}>
                          商品設定（価格・購入上限）を編集
                        </button>
                        <button className="ac-mini" type="button" onClick={() => navigate(`/admin-detail/${p.id}`)}>
                          商品ページを確認
                        </button>
                      </div>

                      {/* セール設定 */}
                      {saleReady && (
                        <>
                          <button
                            className={`admin-sale-btn ${info.hasSale ? "is-on" : ""}`}
                            type="button"
                            onClick={() => openSale(p.id)}
                          >
                            {info.hasSale
                              ? `セール中 ¥${yen(info.salePrice ?? 0)} ／ 残り${info.saleRemainingN}個（設定${info.saleQtyN}個）`
                              : "セール価格・セール個数を設定"}
                          </button>

                          {saleOpenId === p.id && (
                            <div className="admin-sale-panel">
                              <div className="admin-sale-grid">
                                <label>
                                  <span>セール価格（円）</span>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    placeholder="例: 100"
                                    value={(saleDraft[p.id] ?? { price: "", qty: "" }).price}
                                    onChange={(e) =>
                                      setSaleDraft((prev) => ({
                                        ...prev,
                                        [p.id]: {
                                          price: e.target.value,
                                          qty: (prev[p.id] ?? { price: "", qty: "" }).qty,
                                        },
                                      }))
                                    }
                                  />
                                </label>
                                <label>
                                  <span>セール個数（個）</span>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    placeholder="例: 5"
                                    value={(saleDraft[p.id] ?? { price: "", qty: "" }).qty}
                                    onChange={(e) =>
                                      setSaleDraft((prev) => ({
                                        ...prev,
                                        [p.id]: {
                                          price: (prev[p.id] ?? { price: "", qty: "" }).price,
                                          qty: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </label>
                              </div>

                              <div className="admin-sale-actions">
                                <button
                                  className="admin-sale-apply"
                                  type="button"
                                  disabled={busyId === p.id}
                                  onClick={() => applySale(p.id, p.name, info.stockNum)}
                                >
                                  {busyId === p.id ? "処理中..." : "この内容でセール開始"}
                                </button>
                                {info.hasSale && (
                                  <button
                                    className="admin-sale-clear"
                                    type="button"
                                    disabled={busyId === p.id}
                                    onClick={() => clearSale(p.id, p.name)}
                                  >
                                    セール解除
                                  </button>
                                )}
                              </div>

                              <p className="admin-sale-hint">
                                在庫{info.stockNum}個のうち、指定した個数をセール価格で販売します。
                                売り切れると自動で通常価格（¥{yen(p.price)}円）に戻ります。
                              </p>
                            </div>
                          )}
                        </>
                      )}

                      {/* ロット一覧 */}
                      {info.lots.length === 0 ? (
                        <p className="ac-lots-empty">
                          まだロットがありません。下の「在庫を1個ずつ登録」または「1件ずつ追加」で登録してください。
                        </p>
                      ) : (
                        <div className="ac-lot-list">
                          {info.lots.map((l) => {
                            const d = drafts[l.id] ?? draftOf(l);
                            const st = expiryStatusOf(d.expiry_date, info.alertDays);
                            const dDays = daysLeftOf(d.expiry_date);
                            const rem = toInt(l.remaining);
                            const isNoExpiry = !!d.no_expiry;

                            return (
                              <div key={l.id} className={`ac-lot${rem <= 0 ? " is-empty" : ""}`}>
                                <div className="ac-lot-head">
                                  <span className={`ac-exp ${isNoExpiry ? "is-none" : statusClass(st)}`}>
                                    {isNoExpiry ? "期限なし" : expiryStatusLabel(st, dDays)}
                                  </span>
                                  {l.lot_label && <span className="ac-lot-label">{l.lot_label}</span>}
                                  <span className="ac-lot-id">
                                    入荷 {l.received_at ? String(l.received_at).slice(0, 10) : "-"}
                                  </span>
                                  <span className="ac-lot-id">残り {rem}個</span>
                                </div>

                                <div className="ac-lot-grid">
                                  <label>
                                    <span>原価(1個) 必須</span>
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
                                    <span>期限（または期限なし）</span>
                                    <input
                                      type="date"
                                      value={d.no_expiry ? "" : d.expiry_date}
                                      disabled={d.no_expiry}
                                      onChange={(e) =>
                                        setDrafts((prev) => ({
                                          ...prev,
                                          [l.id]: { ...d, expiry_date: e.target.value },
                                        }))
                                      }
                                    />
                                    <span className="ac-noexp">
                                      <input
                                        type="checkbox"
                                        checked={d.no_expiry}
                                        onChange={(e) =>
                                          setDrafts((prev) => ({
                                            ...prev,
                                            [l.id]: { ...d, no_expiry: e.target.checked },
                                          }))
                                        }
                                      />
                                      期限なし
                                    </span>
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
                                    このロットの在庫原価：¥{yen(toInt(d.cost) * rem)}
                                  </span>
                                  <button className="ac-save" type="button" disabled={busy} onClick={() => saveLot(l)}>
                                    保存
                                  </button>
                                  {rem > 0 ? (
                                    <button
                                      className="ac-del"
                                      type="button"
                                      disabled={busy}
                                      onClick={() => requestReduce(p, l)}
                                    >
                                      在庫を減らす
                                    </button>
                                  ) : (
                                    <button
                                      className="ac-del"
                                      type="button"
                                      disabled={busy}
                                      onClick={() => deleteEmptyLot(l)}
                                    >
                                      削除
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 1件ずつ追加 */}
                      <div className="ac-new">
                        <div className="ac-new-title">入荷する（原価・期限は必須）</div>
                        <div className="ac-lot-grid">
                          <label>
                            <span>原価(1個) 必須</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              placeholder="例: 80"
                              value={drafts[`new-${p.id}`]?.cost ?? ""}
                              onChange={(e) =>
                                setDrafts((prev) => {
                                  const cur = prev[`new-${p.id}`] ?? {
                                    cost: "",
                                    remaining: "1",
                                    expiry_date: "",
                                    expiry_type: "best_before",
                                    lot_label: "",
                                    no_expiry: false,
                                  };
                                  return { ...prev, [`new-${p.id}`]: { ...cur, cost: e.target.value } };
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>数量 必須</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              placeholder="1"
                              value={drafts[`new-${p.id}`]?.remaining ?? ""}
                              onChange={(e) =>
                                setDrafts((prev) => {
                                  const cur = prev[`new-${p.id}`] ?? {
                                    cost: "",
                                    remaining: "",
                                    expiry_date: "",
                                    expiry_type: "best_before",
                                    lot_label: "",
                                    no_expiry: false,
                                  };
                                  return { ...prev, [`new-${p.id}`]: { ...cur, remaining: e.target.value } };
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>期限（または期限なし）</span>
                            <input
                              type="date"
                              value={drafts[`new-${p.id}`]?.no_expiry ? "" : drafts[`new-${p.id}`]?.expiry_date ?? ""}
                              disabled={!!drafts[`new-${p.id}`]?.no_expiry}
                              onChange={(e) =>
                                setDrafts((prev) => {
                                  const cur = prev[`new-${p.id}`] ?? {
                                    cost: "",
                                    remaining: "",
                                    expiry_date: "",
                                    expiry_type: "best_before",
                                    lot_label: "",
                                    no_expiry: false,
                                  };
                                  return { ...prev, [`new-${p.id}`]: { ...cur, expiry_date: e.target.value } };
                                })
                              }
                            />
                            <span className="ac-noexp">
                              <input
                                type="checkbox"
                                checked={!!drafts[`new-${p.id}`]?.no_expiry}
                                onChange={(e) =>
                                  setDrafts((prev) => {
                                    const cur = prev[`new-${p.id}`] ?? {
                                      cost: "",
                                      remaining: "",
                                      expiry_date: "",
                                      expiry_type: "best_before",
                                      lot_label: "",
                                      no_expiry: false,
                                    };
                                    return {
                                      ...prev,
                                      [`new-${p.id}`]: {
                                        ...cur,
                                        no_expiry: e.target.checked,
                                        expiry_date: e.target.checked ? "" : cur.expiry_date,
                                      },
                                    };
                                  })
                                }
                              />
                              期限なし
                            </span>
                          </label>
                          <label>
                            <span>種類</span>
                            <select
                              value={drafts[`new-${p.id}`]?.expiry_type ?? "best_before"}
                              onChange={(e) =>
                                setDrafts((prev) => {
                                  const cur = prev[`new-${p.id}`] ?? {
                                    cost: "",
                                    remaining: "",
                                    expiry_date: "",
                                    expiry_type: "best_before",
                                    lot_label: "",
                                    no_expiry: false,
                                  };
                                  return { ...prev, [`new-${p.id}`]: { ...cur, expiry_type: e.target.value } };
                                })
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
                                setDrafts((prev) => {
                                  const cur = prev[`new-${p.id}`] ?? {
                                    cost: "",
                                    remaining: "",
                                    expiry_date: "",
                                    expiry_type: "best_before",
                                    lot_label: "",
                                    no_expiry: false,
                                  };
                                  return { ...prev, [`new-${p.id}`]: { ...cur, lot_label: e.target.value } };
                                })
                              }
                            />
                          </label>
                        </div>
                        <button className="ac-save" type="button" disabled={busy} onClick={() => addOneLot(p)}>
                          この内容で入荷（在庫が増えます）
                        </button>
                      </div>

                      {/* 在庫を1個ずつ登録 */}
                      <div className="ac-units">
                        <div className="ac-new-title">
                          在庫を1個ずつ登録（同じ商品でも1個ごとに原価・賞味期限を個別設定）
                        </div>
                        <p className="ac-units-desc">
                          商品を開くと、<b>まだロット登録していない在庫の数だけ入力欄が自動で並びます</b>。
                          それぞれの行に原価・期限を入れて登録すると、<b>1個＝1ロット</b>として保存され、
                          在庫がその個数だけ増えます。
                          （在庫 {info.stockNum}個 ／ うちロット登録済み {info.remaining}個 ／{" "}
                          <b>未登録 {info.unregistered}個</b>）
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
                              onChange={(e) => setUnitCount((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            />
                          </label>
                          <button className="ac-mini" type="button" onClick={() => buildUnitRows(p)}>
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
                              onChange={(e) => setUnitBulkCost((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            />
                          </label>
                          <button className="ac-mini" type="button" onClick={() => fillUnitCost(p)}>
                            表示中の行に反映
                          </button>
                          <button className="ac-mini" type="button" onClick={() => setAllUnitNoExpiry(p)}>
                            表示中の行をすべて期限なし
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
                                    <span>原価（1個・円）必須</span>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      min={0}
                                      value={r.cost}
                                      onChange={(e) => setUnitRow(p.id, idx, "cost", e.target.value)}
                                    />
                                  </label>
                                  <label>
                                    <span>賞味期限 / 消費期限（または期限なし）</span>
                                    <input
                                      type="date"
                                      value={r.no_expiry ? "" : r.expiry_date}
                                      disabled={r.no_expiry}
                                      onChange={(e) => setUnitRow(p.id, idx, "expiry_date", e.target.value)}
                                    />
                                    <span className="ac-noexp">
                                      <input
                                        type="checkbox"
                                        checked={r.no_expiry}
                                        onChange={(e) =>
                                          setUnitRow(p.id, idx, "no_expiry", e.target.checked ? "1" : "")
                                        }
                                      />
                                      期限なし
                                    </span>
                                  </label>
                                  <label>
                                    <span>種類</span>
                                    <select
                                      value={r.expiry_type}
                                      onChange={(e) => setUnitRow(p.id, idx, "expiry_type", e.target.value)}
                                    >
                                      <option value="best_before">賞味</option>
                                      <option value="use_by">消費</option>
                                    </select>
                                  </label>
                                  <button className="ac-del" type="button" onClick={() => removeUnitRow(p.id, idx)}>
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
                                    setUnitSyncStock((prev) => ({ ...prev, [p.id]: e.target.checked }))
                                  }
                                />
                                <span>登録後に在庫数へ反映する</span>
                              </label>
                              <button className="ac-save" type="button" disabled={busy} onClick={() => saveUnits(p)}>
                                {busy ? "処理中..." : `${(unitRows[p.id] ?? []).length}個を1個ずつ登録（在庫が増えます）`}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <p className="admin-costs-note">
          ※ 在庫を増やすには、原価と「賞味期限（消費期限）または期限なし」を入れた入荷登録が必要です（在庫が自動で増えます）。
          <br />※ 在庫を減らすときは「在庫を減らす」から<b>理由</b>と<b>対象ロット</b>を指定してください。履歴が残ります。
          <br />※ ロットの残数は購入時に「セール分 → 期限が近い順」で自動的に減ります。
          <br />※ 「在庫に合わせてロットを一括作成」は、いまの在庫数をそのままロットにする作業です（在庫は増減しません）。
        </p>
      </div>

      {/* ✅ 在庫を減らすダイアログ */}
      {adjust && (
        <div className="ac-modal-back">
          <div className="ac-modal">
            <h3 className="ac-modal-title">在庫を減らす</h3>
            <p className="ac-modal-sub">
              {adjust.productName}
              {adjust.lotLabel ? ` ／ ${adjust.lotLabel}` : ""} ／ 残り{adjust.remaining}個
            </p>

            <div className="ac-modal-grid">
              <label>
                <span>減らす数（個）必須</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={adjust.remaining}
                  value={adjust.qty}
                  onChange={(e) => setAdjust((prev) => (prev ? { ...prev, qty: e.target.value } : prev))}
                />
              </label>
              <label>
                <span>理由 必須</span>
                <select
                  value={adjust.reason}
                  onChange={(e) =>
                    setAdjust((prev) => (prev ? { ...prev, reason: e.target.value as Reason | "" } : prev))
                  }
                >
                  <option value="">選択してください</option>
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ac-modal-wide">
                <span>メモ{adjust.reason === "other" ? "（必須）" : "（任意）"}</span>
                <input
                  type="text"
                  placeholder="例: 賞味期限切れのため廃棄"
                  value={adjust.memo}
                  onChange={(e) => setAdjust((prev) => (prev ? { ...prev, memo: e.target.value } : prev))}
                />
              </label>
            </div>

            <p className="ac-modal-note">
              このロットから{toInt(adjust.qty)}個を在庫から減らします
              {toInt(adjust.qty) >= adjust.remaining ? "（ロットは削除されます）" : ""}。在庫数も同じ数だけ減ります。
            </p>

            {reduceErr && <p className="ac-modal-err">{reduceErr}</p>}

            <div className="ac-modal-foot">
              <button className="ac-del" type="button" disabled={busy} onClick={() => setAdjust(null)}>
                キャンセル
              </button>
              <button className="ac-save" type="button" disabled={busy} onClick={confirmReduce}>
                {busy ? "処理中..." : "在庫を減らす"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 商品を追加ダイアログ */}
      {addOpen && (
        <div className="ac-modal-back">
          <div className="ac-modal ac-modal-wide-box">
            <h3 className="ac-modal-title">商品を追加</h3>
            <p className="ac-modal-sub">
              在庫を入れる場合は<b>仕入れ原価</b>と<b>賞味期限（または期限なし）</b>が必須です。入荷ロットとして登録されます。
            </p>

            <div className="ac-modal-grid">
              <label>
                <span>商品ID 必須</span>
                <input
                  type="number"
                  placeholder="例: 101"
                  value={addForm.productId}
                  onChange={(e) => setAddForm((f) => ({ ...f, productId: e.target.value }))}
                />
              </label>
              <label>
                <span>商品名 必須</span>
                <input
                  type="text"
                  placeholder="商品名"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label>
                <span>販売価格 必須</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="例: 150"
                  value={addForm.price}
                  onChange={(e) => setAddForm((f) => ({ ...f, price: e.target.value }))}
                />
              </label>
              <label>
                <span>通常価格（SALE表示する時だけ）</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="例: 200"
                  value={addForm.originalPrice}
                  onChange={(e) => setAddForm((f) => ({ ...f, originalPrice: e.target.value }))}
                />
              </label>
              <label>
                <span>在庫数 必須</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="例: 10"
                  value={addForm.stock}
                  onChange={(e) => setAddForm((f) => ({ ...f, stock: e.target.value }))}
                />
              </label>
              <label>
                <span>仕入れ原価（1個あたり・円）在庫がある場合は必須</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="例: 80"
                  value={addForm.cost}
                  onChange={(e) => setAddForm((f) => ({ ...f, cost: e.target.value }))}
                />
              </label>
              <label>
                <span>賞味期限 / 消費期限（在庫がある場合は必須）</span>
                <input
                  type="date"
                  value={addForm.noExpiry ? "" : addForm.expiryDate}
                  disabled={addForm.noExpiry}
                  onChange={(e) => setAddForm((f) => ({ ...f, expiryDate: e.target.value }))}
                />
                <span className="ac-noexp">
                  <input
                    type="checkbox"
                    checked={addForm.noExpiry}
                    onChange={(e) =>
                      setAddForm((f) => ({
                        ...f,
                        noExpiry: e.target.checked,
                        expiryDate: e.target.checked ? "" : f.expiryDate,
                      }))
                    }
                  />
                  期限なし
                </span>
              </label>
              <label>
                <span>期限の種類</span>
                <select
                  value={addForm.expiryType}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, expiryType: e.target.value as "best_before" | "use_by" }))
                  }
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
                  value={addForm.lotLabel}
                  onChange={(e) => setAddForm((f) => ({ ...f, lotLabel: e.target.value }))}
                />
              </label>
              <label>
                <span>会員価格（ログイン時・空欄なら通常価格）</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="例: 130"
                  value={addForm.memberPrice}
                  onChange={(e) => setAddForm((f) => ({ ...f, memberPrice: e.target.value }))}
                />
              </label>
              <label>
                <span>購入時付与ポイント（pt）</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="例: 10"
                  value={addForm.earnPoints}
                  onChange={(e) => setAddForm((f) => ({ ...f, earnPoints: e.target.value }))}
                />
              </label>
              <label>
                <span>1会計の購入上限（個・空欄=無制限）</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="例: 3"
                  value={addForm.maxPerOrder}
                  onChange={(e) => setAddForm((f) => ({ ...f, maxPerOrder: e.target.value }))}
                />
              </label>
              <label>
                <span>賞味期限アラートの日数（既定30）</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="30"
                  value={addForm.alertDays}
                  onChange={(e) => setAddForm((f) => ({ ...f, alertDays: e.target.value }))}
                />
              </label>
              <label className="ac-modal-wide">
                <span>受渡方法</span>
                <label className="ac-noexp" style={{ marginTop: 2 }}>
                  <input
                    type="checkbox"
                    checked={addForm.isShipping}
                    onChange={(e) => setAddForm((f) => ({ ...f, isShipping: e.target.checked }))}
                  />
                  発送商品（購入時に配送先の住所・電話番号が必要）
                </label>
              </label>

              {addForm.isShipping && (
                <>
                  <label>
                    <span>発送目安・最短 必須</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="例: 3"
                      value={addForm.shippingLeadMin}
                      onChange={(e) => setAddForm((f) => ({ ...f, shippingLeadMin: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>発送目安・最長 必須</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="例: 5"
                      value={addForm.shippingLeadMax}
                      onChange={(e) => setAddForm((f) => ({ ...f, shippingLeadMax: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>単位</span>
                    <select
                      value={addForm.shippingLeadUnit}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          shippingLeadUnit: e.target.value as "business_days" | "days",
                        }))
                      }
                    >
                      <option value="business_days">営業日</option>
                      <option value="days">日</option>
                    </select>
                  </label>
                </>
              )}
            </div>

            {addErr && <p className="ac-modal-err">{addErr}</p>}

            <div className="ac-modal-foot">
              <button
                className="ac-del"
                type="button"
                disabled={busy}
                onClick={() => {
                  setAddOpen(false);
                  setAddErr("");
                }}
              >
                キャンセル
              </button>
              <button className="ac-save" type="button" disabled={busy} onClick={submitAddProduct}>
                {busy ? "処理中..." : "この内容で追加"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AdminPage;
