// src/pages/AdminPage.tsx
// ✅ 商品管理（統合・v22）
//   ・商品を探しやすい一覧（検索＋絞り込みチップ＋統計）
//   ・カードをタップ → 商品ごとの操作パネル（在庫の追加／ロット編集／在庫を減らす／セール）
//   ・在庫の追加＝ロットの追加（原価と期限は必須）
//   ・ロットの保存はパネル下の「変更を保存」1つに統一
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
  member_price?: number | null;
  cost?: number | null;
  earn_points?: number | null;
  is_shipping?: boolean | null;
  shipping_lead_min?: number | null;
  shipping_lead_max?: number | null;
  shipping_lead_unit?: string | null;
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

type ProductEdit = {
  name: string;
  price: string;
  memberPrice: string;
  earnPoints: string;
  cost: string;
  maxPerOrder: string;
  alertDays: string;
  isShipping: boolean;
  leadMin: string;
  leadMax: string;
  leadUnit: "business_days" | "days";
  isVisible: boolean;
  newId: string;
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

type Arrival = {
  cost: string;
  qty: string;
  expiryDate: string;
  expiryType: "best_before" | "use_by";
  noExpiry: boolean;
  memo: string;
  perUnit: boolean;
};

const emptyArrival: Arrival = {
  cost: "",
  qty: "",
  expiryDate: "",
  expiryType: "best_before",
  noExpiry: false,
  memo: "",
  perUnit: false,
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
  const [msg, setMsg] = useState("");

  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [q, setQ] = useState("");

  // 選択中の商品（操作パネル）
  const [openId, setOpenId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LotDraft>>({});

  // 在庫の追加
  const [arrivals, setArrivals] = useState<Record<number, Arrival>>({});
  const [unitRows, setUnitRows] = useState<Record<number, UnitDraft[]>>({});
  const [bulkCost, setBulkCost] = useState<Record<number, string>>({});

  // セール
  const [saleReady, setSaleReady] = useState(true);
  const [saleOpen, setSaleOpen] = useState(false);
  const [saleDraft, setSaleDraft] = useState<{ price: string; qty: string }>({ price: "", qty: "" });

  // 在庫を減らす
  const [adjust, setAdjust] = useState<AdjustState | null>(null);
  const [reduceErr, setReduceErr] = useState("");

  const [noExpiryReady, setNoExpiryReady] = useState(true);

  // 商品追加
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(emptyAddForm);
  const [addErr, setAddErr] = useState("");

  // ✅ v24：この画面で商品情報の編集・削除まで行う
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ProductEdit | null>(null);
  const [editErr, setEditErr] = useState("");

  const load = async () => {
    setLoading(true);

    const baseCols = "id,name,price,stock,is_visible,max_per_order,expiry_alert_days,member_price,cost,earn_points,is_shipping,shipping_lead_min,shipping_lead_max,shipping_lead_unit";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pRes: any = await supabase
      .from("products")
      .select(`${baseCols},sale_price,sale_qty,sale_remaining`)
      .order("id", { ascending: true });

    if (pRes.error) {
      setSaleReady(false);
      pRes = await supabase.from("products").select(baseCols).order("id", { ascending: true });
    } else {
      setSaleReady(true);
    }

    const lRes = await supabase.from("product_lots").select("*");

    if (pRes.error) {
      console.error("商品取得エラー:", pRes.error);
      setMsg("商品の読み込みに失敗しました: " + pRes.error.message);
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

    // 0円セールも有効（null のときだけセールなし）
    const salePriceNum =
      p.sale_price == null || p.sale_price === undefined ? null : Math.max(0, toInt(p.sale_price));
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
    let soldOut = 0;
    let visible = 0;
    for (const { p, info } of extended) {
      if (info.status === "expired") expired++;
      else if (info.status === "urgent" || info.status === "warn") soon++;
      if (info.hasSale) sale++;
      if (info.missingCost || info.missingExpiry) missing++;
      if (info.stockNum <= 0) soldOut++;
      if (p.is_visible !== false) visible++;
    }
    return { expired, soon, sale, missing, soldOut, visible, total: extended.length };
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

    if (viewMode === "selling")
      list = list.filter(({ p, info }) => p.is_visible !== false && info.stockNum > 0);
    if (viewMode === "hidden") list = list.filter(({ p }) => p.is_visible === false);
    if (viewMode === "sale") list = list.filter(({ info }) => info.hasSale);
    if (viewMode === "missing")
      list = list.filter(({ info }) => info.missingCost || info.missingExpiry);

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

  // ---------- 選択中の商品 ----------
  const openRow = useMemo(
    () => extended.find((e) => e.p.id === openId) ?? null,
    [extended, openId]
  );

  const arrivalOf = (id: number): Arrival => arrivals[id] ?? emptyArrival;

  const setArrival = (id: number, patch: Partial<Arrival>) =>
    setArrivals((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyArrival), ...patch } }));

  // ---------- 表示切替 ----------
  const toggleVisible = async (id: number, nextVisible: boolean) => {
    const { error } = await supabase.from("products").update({ is_visible: nextVisible }).eq("id", id);
    if (error) {
      setMsg("表示切替に失敗しました: " + error.message);
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, is_visible: nextVisible } : p)));
  };

  // ---------- 在庫の追加（まとめて） ----------
  const addArrival = async (p: ProductRow) => {
    if (busy) return;
    const a = arrivalOf(p.id);
    const qty = toInt(a.qty);
    const costRaw = a.cost.trim();

    if (costRaw === "") {
      setMsg("原価（1個あたり）を入力してください");
      return;
    }
    if (qty <= 0) {
      setMsg("数量は1以上で入力してください");
      return;
    }
    if (!a.noExpiry && a.expiryDate.trim() === "") {
      setMsg("賞味期限（消費期限）を入力するか、「期限なし」にチェックしてください");
      return;
    }
    if (a.noExpiry && !noExpiryReady) {
      setMsg("「期限なし」を使うには supabase_v20_no_expiry.sql を実行してください");
      return;
    }

    const stockNow = toInt(p.stock);
    const ok = await appDialog.confirm({
      message:
        `「${p.name ?? p.id}」の在庫を ${qty}個 追加します。\n` +
        `在庫数：${stockNow} → ${stockNow + qty}\n\n` +
        `原価 ¥${yen(costRaw)}／${a.noExpiry ? "期限なし" : "期限 " + a.expiryDate}\n` +
        "よろしいですか？",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase.from("product_lots").insert({
        product_id: p.id,
        lot_label: a.memo.trim() || null,
        cost: Math.max(0, toInt(costRaw)),
        quantity: qty,
        remaining: qty,
        expiry_date: a.noExpiry ? null : a.expiryDate.trim(),
        expiry_type: a.expiryType,
        no_expiry: a.noExpiry,
      });
      if (error) {
        setMsg("在庫の追加に失敗しました: " + error.message);
        return;
      }

      const { error: e2 } = await supabase
        .from("products")
        .update({ stock: stockNow + qty })
        .eq("id", p.id);
      if (e2) setMsg("入荷は登録しましたが、在庫数の更新に失敗しました: " + e2.message);
      else setMsg(`在庫を ${qty}個 追加しました（在庫数 ${stockNow + qty}）`);

      setArrivals((prev) => ({ ...prev, [p.id]: emptyArrival }));
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ---------- 在庫の追加（1個ずつ） ----------
  const buildUnitRows = (p: ProductRow) => {
    const a = arrivalOf(p.id);
    const n = Math.min(200, Math.max(0, toInt(a.qty)));
    if (n <= 0) {
      setMsg("先に数量を1以上で入力してください");
      return;
    }
    const base = a.cost.trim();
    setUnitRows((prev) => ({
      ...prev,
      [p.id]: Array.from({ length: n }, () =>
        emptyUnit(base, a.noExpiry)
      ).map((r) => ({
        ...r,
        expiry_date: a.noExpiry ? "" : a.expiryDate,
        expiry_type: a.expiryType,
      })),
    }));
    setMsg(`${n}個ぶんの入力欄を作りました。1個ずつ原価と期限を入れてください`);
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

  const removeUnitRow = (pid: number, idx: number) =>
    setUnitRows((prev) => ({ ...prev, [pid]: (prev[pid] ?? []).filter((_, i) => i !== idx) }));

  const fillUnitCost = (p: ProductRow) => {
    const v = (bulkCost[p.id] ?? "").trim();
    setUnitRows((prev) => ({
      ...prev,
      [p.id]: (prev[p.id] ?? []).map((r) => ({ ...r, cost: v })),
    }));
  };

  const saveUnitRows = async (p: ProductRow) => {
    if (busy) return;
    const rows = unitRows[p.id] ?? [];
    if (rows.length === 0) {
      setMsg("先に数量を入れて「1個ずつ入力する」を押してください");
      return;
    }
    if (rows.some((r) => r.cost.trim() === "")) {
      setMsg("原価は全行に入力してください");
      return;
    }
    if (rows.some((r) => !r.no_expiry && r.expiry_date.trim() === "")) {
      setMsg("賞味期限（消費期限）を入力するか、「期限なし」にチェックしてください");
      return;
    }
    if (rows.some((r) => r.no_expiry) && !noExpiryReady) {
      setMsg("「期限なし」を使うには supabase_v20_no_expiry.sql を実行してください");
      return;
    }

    const stockNow = toInt(p.stock);
    const ok = await appDialog.confirm({
      message:
        `「${p.name ?? p.id}」の在庫を ${rows.length}個 追加します（1個ずつ原価・期限を設定）。\n` +
        `在庫数：${stockNow} → ${stockNow + rows.length}\n` +
        "よろしいですか？",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase.from("product_lots").insert(
        rows.map((r) => ({
          product_id: p.id,
          lot_label: null,
          cost: Math.max(0, toInt(r.cost)),
          quantity: 1,
          remaining: 1,
          expiry_date: r.no_expiry ? null : r.expiry_date.trim(),
          expiry_type: r.expiry_type,
          no_expiry: r.no_expiry,
        }))
      );
      if (error) {
        setMsg("在庫の追加に失敗しました: " + error.message);
        return;
      }
      const { error: e2 } = await supabase
        .from("products")
        .update({ stock: stockNow + rows.length })
        .eq("id", p.id);
      if (e2) setMsg("入荷は登録しましたが、在庫数の更新に失敗しました: " + e2.message);
      else setMsg(`在庫を ${rows.length}個 追加しました（在庫数 ${stockNow + rows.length}）`);

      setUnitRows((prev) => ({ ...prev, [p.id]: [] }));
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ---------- ロットの変更（まとめて保存） ----------
  const dirtyLots = useMemo(() => {
    if (openId == null) return [] as Lot[];
    return (lotsByProduct.get(openId) ?? []).filter((l) => {
      const d = drafts[l.id];
      if (!d) return false;
      const o = draftOf(l);
      return (
        d.cost !== o.cost ||
        d.expiry_type !== o.expiry_type ||
        d.no_expiry !== o.no_expiry ||
        d.lot_label !== o.lot_label ||
        (d.no_expiry ? "" : d.expiry_date) !== (o.no_expiry ? "" : o.expiry_date)
      );
    });
  }, [lotsByProduct, openId, drafts]);

  const saveAllLots = async () => {
    if (busy || dirtyLots.length === 0) return;

    for (const l of dirtyLots) {
      const d = drafts[l.id];
      if (!d) continue;
      if (d.cost.trim() === "") {
        setMsg("原価が空のロットがあります。入力してください");
        return;
      }
      if (!d.no_expiry && d.expiry_date.trim() === "") {
        setMsg("期限が空のロットがあります。日付を入れるか「期限なし」にチェックしてください");
        return;
      }
      if (d.no_expiry && !noExpiryReady) {
        setMsg("「期限なし」を使うには supabase_v20_no_expiry.sql を実行してください");
        return;
      }
    }

    const ok = await appDialog.confirm({
      message: `${dirtyLots.length}件のロットの変更を保存しますか？`,
    });
    if (!ok) return;

    setBusy(true);
    try {
      for (const l of dirtyLots) {
        const d = drafts[l.id];
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
      }
      setMsg(`${dirtyLots.length}件のロットを保存しました`);
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
      await supabase
        .from("products")
        .update({ stock: Math.max(0, stockNow - qty) })
        .eq("id", product.id);

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

  // ---------- セール ----------
  const openSalePanel = (p: ProductRow, info: ReturnType<typeof infoOf>) => {
    if (saleOpen) {
      setSaleOpen(false);
      return;
    }
    setSaleDraft({
      price: info.salePrice != null ? String(info.salePrice) : "",
      qty: info.saleQtyN > 0 ? String(info.saleQtyN) : "",
    });
    setSaleOpen(true);
    if (p.id !== openId) setOpenId(p.id);
  };

  const applySale = async (p: ProductRow, stockNum: number) => {
    if (busy) return;
    const price = toInt(saleDraft.price);
    const qty = toInt(saleDraft.qty);

    if (saleDraft.price.trim() === "") {
      setMsg("セール価格を入力してください（0円も設定できます）");
      return;
    }
    if (price < 0) {
      setMsg("セール価格は0円以上で入力してください");
      return;
    }
    if (qty <= 0) {
      setMsg("セール個数は1個以上で入力してください");
      return;
    }
    if (stockNum > 0 && qty > stockNum) {
      setMsg(`在庫は${stockNum}個です。セール個数は在庫以下にしてください`);
      return;
    }

    const ok = await appDialog.confirm({
      message:
        `「${p.name ?? p.id}」を セール価格 ¥${yen(price)}${price === 0 ? "（無料）" : ""} × ${qty}個 で販売しますか？`,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await setProductSale(p.id, price, qty);
      if (!res.ok) {
        setMsg("セール設定に失敗しました: " + res.error);
        return;
      }
      setMsg(
        `セールを設定しました（${p.name ?? p.id}：¥${yen(price)}${price === 0 ? "（無料）" : ""} × ${qty}個）`
      );
      setSaleOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const clearSale = async (p: ProductRow) => {
    if (busy) return;
    const ok = await appDialog.confirm({
      message: `「${p.name ?? p.id}」のセールを解除して通常価格に戻しますか？`,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await setProductSale(p.id, 0, 0);
      if (!res.ok) {
        setMsg("セール解除に失敗しました: " + res.error);
        return;
      }
      setMsg(`「${p.name ?? p.id}」のセールを解除しました`);
      setSaleOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ---------- 商品情報の編集（v24：admin-edit を統合） ----------
  const openEditPanel = (p: ProductRow) => {
    if (editOpen && editId === p.id) {
      setEditOpen(false);
      setEditId(null);
      return;
    }
    setEditErr("");
    setEditDraft({
      name: p.name ?? "",
      price: p.price == null ? "" : String(toInt(p.price)),
      memberPrice: p.member_price == null ? "" : String(toInt(p.member_price)),
      earnPoints: p.earn_points == null ? "" : String(toInt(p.earn_points)),
      cost: p.cost == null ? "" : String(toInt(p.cost)),
      maxPerOrder: p.max_per_order == null ? "" : String(toInt(p.max_per_order)),
      alertDays: p.expiry_alert_days == null ? "30" : String(toInt(p.expiry_alert_days)),
      isShipping: !!p.is_shipping,
      leadMin: p.shipping_lead_min == null ? "" : String(toInt(p.shipping_lead_min)),
      leadMax: p.shipping_lead_max == null ? "" : String(toInt(p.shipping_lead_max)),
      leadUnit: p.shipping_lead_unit === "days" ? "days" : "business_days",
      isVisible: p.is_visible !== false,
      newId: String(p.id),
    });
    setEditId(p.id);
    setEditOpen(true);
  };

  const patchEdit = (patch: Partial<ProductEdit>) =>
    setEditDraft((d) => (d ? { ...d, ...patch } : d));

  const closeEditPanel = () => {
    setEditOpen(false);
    setEditId(null);
    setEditDraft(null);
    setEditErr("");
  };

  const saveProductEdit = async (p: ProductRow, lotsCount: number) => {
    if (busy || !editDraft) return;
    setEditErr("");

    const name = editDraft.name.trim();
    if (!name) {
      setEditErr("商品名を入力してください");
      return;
    }
    if (editDraft.price.trim() === "") {
      setEditErr("販売価格を入力してください（0円も設定できます）");
      return;
    }
    const priceNum = toInt(editDraft.price);
    if (priceNum < 0) {
      setEditErr("販売価格は0円以上で入力してください");
      return;
    }

    const leadMinNum = editDraft.leadMin.trim() === "" ? null : toInt(editDraft.leadMin);
    const leadMaxNum = editDraft.leadMax.trim() === "" ? null : toInt(editDraft.leadMax);
    if (editDraft.isShipping) {
      if (leadMinNum == null || leadMinNum < 0) {
        setEditErr("発送商品では発送目安（最短）を入力してください");
        return;
      }
      if (leadMaxNum == null || leadMaxNum < 0) {
        setEditErr("発送商品では発送目安（最長）を入力してください");
        return;
      }
      if (leadMinNum > leadMaxNum) {
        setEditErr("発送目安は「最短 ≦ 最長」で入力してください");
        return;
      }
    }

    const newId = toInt(editDraft.newId);
    const idChanged = newId > 0 && newId !== p.id;
    if (idChanged) {
      if (lotsCount > 0) {
        setEditErr("在庫ロットがあるため商品IDは変更できません（在庫を整理してから変更してください）");
        return;
      }
      const dup = products.some((x) => x.id === newId);
      if (dup) {
        setEditErr(`商品ID ${newId} はすでに使われています`);
        return;
      }
    }

    const ok = await appDialog.confirm({
      message: `「${p.name ?? p.id}」の商品情報を保存しますか？${
        idChanged ? `\n（商品IDを ${p.id} → ${newId} に変更します）` : ""
      }`,
    });
    if (!ok) return;

    const payload: Record<string, any> = {
      name,
      price: priceNum,
      member_price: editDraft.memberPrice.trim() === "" ? null : Math.max(0, toInt(editDraft.memberPrice)),
      earn_points: Math.max(0, toInt(editDraft.earnPoints || 0)),
      cost: editDraft.cost.trim() === "" ? null : Math.max(0, toInt(editDraft.cost)),
      max_per_order:
        editDraft.maxPerOrder.trim() === "" ? null : Math.max(1, toInt(editDraft.maxPerOrder)),
      expiry_alert_days:
        editDraft.alertDays.trim() === "" ? 30 : Math.max(1, toInt(editDraft.alertDays)),
      is_shipping: editDraft.isShipping,
      shipping_lead_min: editDraft.isShipping ? leadMinNum : null,
      shipping_lead_max: editDraft.isShipping ? leadMaxNum : null,
      shipping_lead_unit: editDraft.isShipping ? editDraft.leadUnit : "business_days",
      is_visible: editDraft.isVisible,
    };
    if (idChanged) payload.id = newId;

    setBusy(true);
    try {
      const { error } = await supabase.from("products").update(payload).eq("id", p.id);
      if (error) {
        setEditErr("保存に失敗しました: " + error.message);
        return;
      }
      setMsg(
        `「${name}」の商品情報を保存しました${idChanged ? `（商品ID: ${newId}）` : ""}`
      );
      closeEditPanel();
      setOpenId(idChanged ? newId : p.id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const deleteProduct = async (p: ProductRow, lotsCount: number) => {
    if (busy) return;
    const ok = await appDialog.confirm({
      title: "商品を削除",
      message:
        `「${p.name ?? p.id}」を完全に削除します。元に戻せません。\n` +
        (lotsCount > 0 ? `在庫ロット ${lotsCount}件も一緒に削除されます。\n` : "") +
        "（過去の注文履歴は残ります）\n\n本当に削除しますか？",
      okText: "削除する",
      cancelText: "キャンセル",
    });
    if (!ok) return;

    setBusy(true);
    try {
      if (lotsCount > 0) {
        const { error: eLot } = await supabase.from("product_lots").delete().eq("product_id", p.id);
        if (eLot) {
          setEditErr("在庫ロットの削除に失敗しました: " + eLot.message);
          return;
        }
      }
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) {
        setEditErr("商品の削除に失敗しました: " + error.message);
        return;
      }
      setMsg(`「${p.name ?? p.id}」を削除しました`);
      closeEditPanel();
      setOpenId(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ---------- 商品を追加 ----------
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
    if (
      originalPriceNum != null &&
      (!Number.isFinite(originalPriceNum) || originalPriceNum <= priceNum)
    ) {
      setAddErr("通常価格は販売価格より大きい金額を入力してください");
      return;
    }
    if (stockNum > 0) {
      if (f.cost.trim() === "") {
        setAddErr("在庫を登録する場合は「仕入れ原価（1個あたり）」が必須です");
        return;
      }
      if (!f.noExpiry && f.expiryDate.trim() === "") {
        setAddErr(
          "在庫を登録する場合は「賞味期限 / 消費期限」の入力（または「期限なし」の選択）が必須です"
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
      max_per_order:
        f.maxPerOrder.trim() === "" ? null : Math.max(1, Math.floor(Number(f.maxPerOrder))),
      expiry_alert_days:
        f.alertDays.trim() === "" ? 30 : Math.max(1, Math.floor(Number(f.alertDays))),
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
            "商品は追加しましたが、入荷の登録に失敗しました: " +
              eLot.message +
              "（この画面で改めて在庫を追加してください）"
          );
          await load();
          return;
        }
      }

      setMsg(`商品「${f.name.trim()}」を追加しました${stockNum > 0 ? "（在庫も登録）" : ""}`);
      setAddOpen(false);
      setAddForm(emptyAddForm);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const filters: { key: ViewMode; label: string; count?: number }[] = [
    { key: "all", label: "すべて", count: counts.total },
    { key: "selling", label: "販売中", count: counts.visible },
    { key: "sale", label: "セール中", count: counts.sale },
    { key: "expiry", label: "期限間近", count: counts.soon },
    { key: "expired", label: "期限切れ", count: counts.expired },
    { key: "stock", label: "在庫わずか", count: counts.soldOut },
    { key: "missing", label: "原価・期限の未入力", count: counts.missing },
    { key: "hidden", label: "非表示" },
  ];

  return (
    <>
      <AdminHeader />

      <div className="ap-page">
        <div className="ap-head">
          <div>
            <h1 className="ap-title">商品管理</h1>
            <p className="ap-sub">在庫の追加・ロットの編集・セール設定まで、この画面で完結します</p>
          </div>
          <button className="ap-add-btn" onClick={() => { setAddErr(""); setAddOpen(true); }}>
            ＋ 商品を追加
          </button>
        </div>

        {!saleReady && (
          <div className="ap-msg is-info">
            セール設定を使うには supabase_v18_product_sale.sql を実行してください。
          </div>
        )}
        {!noExpiryReady && (
          <div className="ap-msg is-info">
            「期限なし」を使うには supabase_v20_no_expiry.sql を実行してください。
          </div>
        )}
        {msg && <div className="ap-msg">{msg}</div>}

        <div className="ap-toolbar">
          <input
            className="ap-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 商品名・商品IDで検索"
            inputMode="search"
          />

          <div className="ap-chips">
            {filters.map((f) => (
              <button
                key={f.key}
                className={`ap-chip ${viewMode === f.key ? "active" : ""} ${
                  f.key === "expired" && (f.count ?? 0) > 0 ? "is-alert" : ""
                } ${f.key === "missing" && (f.count ?? 0) > 0 ? "is-alert" : ""}`}
                onClick={() => setViewMode(f.key)}
                type="button"
              >
                {f.label}
                {f.count != null && <span className="ap-chip-count">{f.count}</span>}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="ap-empty">読み込み中...</p>
        ) : shown.length === 0 ? (
          <p className="ap-empty">該当する商品がありません</p>
        ) : (
          <div className="ap-grid">
            {shown.map(({ p, info }) => {
              const imgSrc = findProductImage(p.id);
              const expLabel = info.noExpiryOnly
                ? "期限なし"
                : expiryStatusLabel(info.status, info.days);

              return (
                <button
                  key={p.id}
                  className={`ap-card ${info.stockNum <= 0 ? "is-soldout" : ""} ${
                    info.status === "expired" ? "is-expired" : ""
                  }`}
                  onClick={() => {
                    setMsg("");
                    setSaleOpen(false);
                    setOpenId(p.id);
                  }}
                  type="button"
                >
                  <div className="ap-thumb">
                    {imgSrc ? (
                      <img src={imgSrc} alt={p.name ?? ""} />
                    ) : (
                      <span className="ap-noimg">画像なし</span>
                    )}
                    {info.stockNum <= 0 && <span className="ap-ribbon">在庫切れ</span>}
                    {info.hasSale && info.stockNum > 0 && <span className="ap-ribbon sale">セール</span>}
                  </div>

                  <div className="ap-card-body">
                    <div className="ap-card-name">{p.name || "(名前なし)"}</div>

                    <div className="ap-card-price">
                      ¥{yen(p.price)}
                      {p.is_visible === false && <span className="ap-mini-tag">非表示</span>}
                    </div>

                    <div className="ap-card-row">
                      <span className="ap-stock">在庫 {info.stockNum}</span>
                      <span className={`ap-exp ${statusClass(info.status)}`}>{expLabel}</span>
                    </div>

                    <div className="ap-card-meta">
                      <span>ID {p.id}</span>
                      <span>原価 ¥{yen(info.avgCost)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <p className="ap-note">
          ※ 在庫を増やすときは、原価と「賞味期限（消費期限）または期限なし」の登録が必要です。
          <br />※ 在庫を減らすときは、理由と対象ロットの指定が必要です（履歴に残ります）。
          <br />※ ロットの残数は購入時に「セール分 → 期限が近い順」で自動的に減ります。
        </p>
      </div>

      {/* ================= 商品ごとの操作パネル ================= */}
      {openRow && (
        <div className="ap-modal-back" onClick={() => setOpenId(null)}>
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-head">
              <div className="ap-modal-head-main">
                <h2>{openRow.p.name || "(名前なし)"}</h2>
                <div className="ap-modal-head-meta">
                  <span>ID {openRow.p.id}</span>
                  <span>販売価格 ¥{yen(openRow.p.price)}</span>
                  {toInt(openRow.p.member_price) > 0 && (
                    <span>会員 ¥{yen(openRow.p.member_price)}</span>
                  )}
                  <span>在庫 {openRow.info.stockNum}</span>
                </div>
              </div>
              <div className="ap-modal-head-actions">
                <button
                  className={`admin-visible-btn ${openRow.p.is_visible === false ? "off" : "on"}`}
                  onClick={() => toggleVisible(openRow.p.id, openRow.p.is_visible === false)}
                  type="button"
                >
                  {openRow.p.is_visible === false ? "非表示" : "表示中"}
                </button>
                <button className="ap-close" onClick={() => setOpenId(null)} type="button">
                  閉じる
                </button>
              </div>
            </div>

            <div className="ap-modal-body">
              {/* ---- 在庫を追加 ---- */}
              <section className="ap-section">
                <h3 className="ap-section-title">
                  在庫を追加<span className="ap-req">原価・期限は必須</span>
                </h3>

                {(() => {
                  const a = arrivalOf(openRow.p.id);
                  const rows = unitRows[openRow.p.id] ?? [];
                  return (
                    <>
                      <div className="ap-form">
                        <label>
                          <span>原価（1個・円）必須</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            placeholder="例: 80"
                            value={a.cost}
                            onChange={(e) => setArrival(openRow.p.id, { cost: e.target.value })}
                          />
                        </label>

                        <label>
                          <span>数量 必須</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            placeholder="例: 10"
                            value={a.qty}
                            onChange={(e) => setArrival(openRow.p.id, { qty: e.target.value })}
                          />
                        </label>

                        <label>
                          <span>賞味期限 / 消費期限 必須</span>
                          <input
                            type="date"
                            value={a.noExpiry ? "" : a.expiryDate}
                            disabled={a.noExpiry}
                            onChange={(e) => setArrival(openRow.p.id, { expiryDate: e.target.value })}
                          />
                          <span className="ac-noexp">
                            <input
                              type="checkbox"
                              checked={a.noExpiry}
                              onChange={(e) =>
                                setArrival(openRow.p.id, {
                                  noExpiry: e.target.checked,
                                  expiryDate: e.target.checked ? "" : a.expiryDate,
                                })
                              }
                            />
                            期限なし
                          </span>
                        </label>

                        <label>
                          <span>期限の種類</span>
                          <select
                            value={a.expiryType}
                            onChange={(e) =>
                              setArrival(openRow.p.id, {
                                expiryType: e.target.value as "best_before" | "use_by",
                              })
                            }
                          >
                            <option value="best_before">賞味期限</option>
                            <option value="use_by">消費期限</option>
                          </select>
                        </label>

                        <label className="ap-form-wide">
                          <span>メモ（任意）</span>
                          <input
                            type="text"
                            placeholder="例: ○○商店 9/19仕入れ"
                            value={a.memo}
                            onChange={(e) => setArrival(openRow.p.id, { memo: e.target.value })}
                          />
                        </label>
                      </div>

                      <label className="ap-toggle-row">
                        <input
                          type="checkbox"
                          checked={a.perUnit}
                          onChange={(e) => setArrival(openRow.p.id, { perUnit: e.target.checked })}
                        />
                        <span>1個ずつ原価・期限を入力する（1個＝1ロットで登録）</span>
                      </label>

                      {a.perUnit && (
                        <div className="ap-units">
                          <div className="ap-units-bar">
                            <button className="ac-mini" type="button" onClick={() => buildUnitRows(openRow.p)}>
                              数量ぶんの入力欄を作る
                            </button>
                            <input
                              className="ap-inline-input"
                              type="number"
                              inputMode="numeric"
                              min={0}
                              placeholder="原価をまとめて入力"
                              value={bulkCost[openRow.p.id] ?? ""}
                              onChange={(e) =>
                                setBulkCost((prev) => ({ ...prev, [openRow.p.id]: e.target.value }))
                              }
                            />
                            <button className="ac-mini" type="button" onClick={() => fillUnitCost(openRow.p)}>
                              全行に反映
                            </button>
                            <button
                              className="ac-mini"
                              type="button"
                              onClick={() =>
                                setUnitRows((prev) => ({
                                  ...prev,
                                  [openRow.p.id]: (prev[openRow.p.id] ?? []).map((r) => ({
                                    ...r,
                                    no_expiry: true,
                                    expiry_date: "",
                                  })),
                                }))
                              }
                            >
                              すべて期限なし
                            </button>
                          </div>

                          {rows.length === 0 ? (
                            <p className="ap-hint">
                              数量を入れて「数量ぶんの入力欄を作る」を押してください。
                            </p>
                          ) : (
                            <>
                              <div className="ac-unit-list">
                                {rows.map((r, idx) => (
                                  <div className="ac-unit-row" key={idx}>
                                    <span className="ac-unit-no">{idx + 1}</span>
                                    <label>
                                      <span>原価（1個・円）必須</span>
                                      <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        value={r.cost}
                                        onChange={(e) => setUnitRow(openRow.p.id, idx, "cost", e.target.value)}
                                      />
                                    </label>
                                    <label>
                                      <span>期限 必須</span>
                                      <input
                                        type="date"
                                        value={r.no_expiry ? "" : r.expiry_date}
                                        disabled={r.no_expiry}
                                        onChange={(e) =>
                                          setUnitRow(openRow.p.id, idx, "expiry_date", e.target.value)
                                        }
                                      />
                                      <span className="ac-noexp">
                                        <input
                                          type="checkbox"
                                          checked={r.no_expiry}
                                          onChange={(e) =>
                                            setUnitRow(openRow.p.id, idx, "no_expiry", e.target.checked ? "1" : "")
                                          }
                                        />
                                        期限なし
                                      </span>
                                    </label>
                                    <label>
                                      <span>種類</span>
                                      <select
                                        value={r.expiry_type}
                                        onChange={(e) =>
                                          setUnitRow(openRow.p.id, idx, "expiry_type", e.target.value)
                                        }
                                      >
                                        <option value="best_before">賞味</option>
                                        <option value="use_by">消費</option>
                                      </select>
                                    </label>
                                    <button
                                      className="ac-del"
                                      type="button"
                                      onClick={() => removeUnitRow(openRow.p.id, idx)}
                                    >
                                      削除
                                    </button>
                                  </div>
                                ))}
                              </div>

                              <button
                                className="ap-primary"
                                type="button"
                                disabled={busy}
                                onClick={() => saveUnitRows(openRow.p)}
                              >
                                {busy
                                  ? "処理中..."
                                  : `${rows.length}個を1個ずつ在庫に追加（在庫 ${openRow.info.stockNum} → ${
                                      openRow.info.stockNum + rows.length
                                    }）`}
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {!a.perUnit && (
                        <button
                          className="ap-primary"
                          type="button"
                          disabled={busy}
                          onClick={() => addArrival(openRow.p)}
                        >
                          {busy
                            ? "処理中..."
                            : `在庫を追加する（在庫 ${openRow.info.stockNum} → ${
                                openRow.info.stockNum + Math.max(0, toInt(a.qty))
                              }）`}
                        </button>
                      )}
                    </>
                  );
                })()}
              </section>

              {/* ---- ロット（在庫の内訳） ---- */}
              <section className="ap-section">
                <h3 className="ap-section-title">
                  在庫の内訳（ロット）
                  <span className="ap-badge">{openRow.info.remaining}個 / {openRow.info.count}ロット</span>
                </h3>

                {openRow.info.lots.length === 0 ? (
                  <p className="ap-hint">まだ在庫（ロット）がありません。上の「在庫を追加」から登録してください。</p>
                ) : (
                  <div className="ap-lot-list">
                    {openRow.info.lots.map((l) => {
                      const d = drafts[l.id] ?? draftOf(l);
                      const rem = toInt(l.remaining);
                      const isNo = !!d.no_expiry;
                      const st = expiryStatusOf(d.expiry_date, openRow.info.alertDays);

                      return (
                        <div key={l.id} className={`ap-lot ${rem <= 0 ? "is-empty" : ""}`}>
                          <div className="ap-lot-left">
                            <span className={`ap-exp ${isNo ? "is-none" : statusClass(st)}`}>
                              {isNo ? "期限なし" : expiryStatusLabel(st, daysLeftOf(d.expiry_date))}
                            </span>
                            <span className={`ap-lot-rem ${rem <= 0 ? "is-zero" : ""}`}>残り {rem}個</span>
                            {l.lot_label && <span className="ap-lot-memo">{l.lot_label}</span>}
                          </div>

                          <div className="ap-lot-fields">
                            <label>
                              <span>原価</span>
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
                              <span>期限</span>
                              <input
                                type="date"
                                value={isNo ? "" : d.expiry_date}
                                disabled={isNo}
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
                            <label className="ap-lot-check">
                              <input
                                type="checkbox"
                                checked={isNo}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [l.id]: {
                                      ...d,
                                      no_expiry: e.target.checked,
                                      expiry_date: e.target.checked ? "" : d.expiry_date,
                                    },
                                  }))
                                }
                              />
                              <span>期限なし</span>
                            </label>
                          </div>

                          <div className="ap-lot-right">
                            <span className="ap-lot-cost">在庫原価 ¥{yen(toInt(d.cost) * rem)}</span>
                            {rem > 0 && (
                              <button
                                className="ac-del"
                                type="button"
                                disabled={busy}
                                onClick={() => requestReduce(openRow.p, l)}
                              >
                                在庫を減らす
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="ap-lot-savebar">
                  <span className="ap-dirty">
                    {dirtyLots.length > 0
                      ? `${dirtyLots.length}件の変更が未保存です`
                      : "変更はありません"}
                  </span>
                  <button
                    className="ap-primary is-save"
                    type="button"
                    disabled={busy || dirtyLots.length === 0}
                    onClick={saveAllLots}
                  >
                    {busy ? "保存中..." : "変更を保存"}
                  </button>
                </div>
              </section>

              {/* ---- セール ---- */}
              {saleReady && (
                <section className="ap-section">
                  <h3 className="ap-section-title">セール設定</h3>

                  {openRow.info.hasSale ? (
                    <div className="ap-sale-info">
                      <div>
                        <div className="ap-sale-price">
                          ¥{yen(openRow.info.salePrice ?? 0)}
                          {openRow.info.salePrice === 0 && <span className="ap-sale-free">無料</span>}
                          <span className="ap-sale-orig">（通常 ¥{yen(openRow.p.price)}）</span>
                        </div>
                        <div className="ap-sale-sub">
                          残り {openRow.info.saleRemainingN}個 / 設定 {openRow.info.saleQtyN}個
                        </div>
                      </div>
                      <div className="ap-sale-actions">
                        <button
                          className="ap-secondary"
                          type="button"
                          onClick={() => openSalePanel(openRow.p, openRow.info)}
                        >
                          {saleOpen ? "閉じる" : "内容を変更"}
                        </button>
                        <button
                          className="ap-secondary is-danger"
                          type="button"
                          disabled={busy}
                          onClick={() => clearSale(openRow.p)}
                        >
                          セール解除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="ap-secondary"
                      type="button"
                      onClick={() => openSalePanel(openRow.p, openRow.info)}
                    >
                      {saleOpen ? "閉じる" : "セールを設定する"}
                    </button>
                  )}

                  {saleOpen && (
                    <div className="ap-sale-form">
                      <label>
                        <span>セール価格（円・0で無料）</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          placeholder="0（無料）"
                          value={saleDraft.price}
                          onChange={(e) => setSaleDraft((d) => ({ ...d, price: e.target.value }))}
                        />
                      </label>
                      <label>
                        <span>セール個数（個）</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          placeholder="例: 5"
                          value={saleDraft.qty}
                          onChange={(e) => setSaleDraft((d) => ({ ...d, qty: e.target.value }))}
                        />
                      </label>
                      <button
                        className="ap-primary"
                        type="button"
                        disabled={busy}
                        onClick={() => applySale(openRow.p, openRow.info.stockNum)}
                      >
                        {busy ? "処理中..." : "この内容でセール開始"}
                      </button>
                      <p className="ap-hint">
                        在庫 {openRow.info.stockNum}個のうち、指定した個数をセール価格で販売します。
                        価格は<b>0円（無料）</b>も設定できます。
                        売り切れると通常価格（¥{yen(openRow.p.price)}）に戻ります。
                      </p>
                    </div>
                  )}
                </section>
              )}

              {/* ---- 商品設定（v24：編集・削除までこの画面で完結） ---- */}
              <section className="ap-section">
                <h3 className="ap-section-title">商品設定</h3>

                {!(editOpen && editId === openRow.p.id) ? (
                  <>
                    <div className="ap-links">
                      <button
                        className="ap-edit-open"
                        type="button"
                        onClick={() => openEditPanel(openRow.p)}
                      >
                        商品情報を編集（名前・価格・発送など）
                      </button>
                      <button
                        className="ap-secondary"
                        type="button"
                        onClick={() => navigate(`/products/${openRow.p.id}`)}
                      >
                        商品ページを確認
                      </button>
                    </div>
                    <p className="ap-hint">
                      1会計の購入上限：
                      {openRow.info.limit != null ? `${openRow.info.limit}個` : "無制限"}
                      ／ 期限アラート：{openRow.info.alertDays}日以内
                      ／ 販売状態：{openRow.p.is_visible === false ? "非表示" : "表示中"}
                    </p>
                  </>
                ) : editDraft ? (
                  <div className="ap-edit">
                    <div className="ap-edit-grid">
                      <label className="ap-edit-wide">
                        <span>商品名 必須</span>
                        <input
                          type="text"
                          value={editDraft.name}
                          onChange={(e) => patchEdit({ name: e.target.value })}
                        />
                      </label>

                      <label>
                        <span>販売価格（円）必須</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={editDraft.price}
                          onChange={(e) => patchEdit({ price: e.target.value })}
                        />
                      </label>

                      <label>
                        <span>会員価格（円・空欄=通常価格）</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="例: 130"
                          value={editDraft.memberPrice}
                          onChange={(e) => patchEdit({ memberPrice: e.target.value })}
                        />
                      </label>

                      <label>
                        <span>購入時付与ポイント（pt）</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="例: 10"
                          value={editDraft.earnPoints}
                          onChange={(e) => patchEdit({ earnPoints: e.target.value })}
                        />
                      </label>

                      <label>
                        <span>仕入れ原価（1個・円／入荷時の既定値）</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="例: 80"
                          value={editDraft.cost}
                          onChange={(e) => patchEdit({ cost: e.target.value })}
                        />
                      </label>

                      <label>
                        <span>1会計の購入上限（個・空欄=無制限）</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="例: 3"
                          value={editDraft.maxPerOrder}
                          onChange={(e) => patchEdit({ maxPerOrder: e.target.value })}
                        />
                      </label>

                      <label>
                        <span>期限アラート日数（既定30日）</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="30"
                          value={editDraft.alertDays}
                          onChange={(e) => patchEdit({ alertDays: e.target.value })}
                        />
                      </label>

                      <div className="ap-edit-wide">
                        <span>販売状態</span>
                        <label className="ap-edit-check">
                          <input
                            type="checkbox"
                            checked={editDraft.isVisible}
                            onChange={(e) => patchEdit({ isVisible: e.target.checked })}
                          />
                          <span>商品一覧に表示する（オフで非表示）</span>
                        </label>
                      </div>

                      <div className="ap-edit-wide">
                        <span>受渡方法</span>
                        <label className="ap-edit-check">
                          <input
                            type="checkbox"
                            checked={editDraft.isShipping}
                            onChange={(e) => patchEdit({ isShipping: e.target.checked })}
                          />
                          <span>発送商品（購入時に配送先の住所・電話番号が必要）</span>
                        </label>
                      </div>
                    </div>

                    {editDraft.isShipping && (
                      <div className="ap-edit-grid">
                        <label>
                          <span>発送目安（最短）必須</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            placeholder="例: 3"
                            value={editDraft.leadMin}
                            onChange={(e) => patchEdit({ leadMin: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>発送目安（最長）必須</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            placeholder="例: 5"
                            value={editDraft.leadMax}
                            onChange={(e) => patchEdit({ leadMax: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>単位</span>
                          <select
                            value={editDraft.leadUnit}
                            onChange={(e) =>
                              patchEdit({ leadUnit: e.target.value as "business_days" | "days" })
                            }
                          >
                            <option value="business_days">営業日</option>
                            <option value="days">日</option>
                          </select>
                        </label>
                      </div>
                    )}

                    <details className="ap-edit-id">
                      <summary>商品ID変更（注意）</summary>
                      <label>
                        <span>商品ID</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={editDraft.newId}
                          onChange={(e) => patchEdit({ newId: e.target.value })}
                        />
                      </label>
                      <p className="ap-hint">
                        在庫ロットが登録されている商品はIDを変更できません。変更するとリンク切れの原因になります。
                      </p>
                    </details>

                    {editErr && <p className="ac-modal-err">{editErr}</p>}

                    <div className="ap-edit-foot">
                      <button
                        className="ap-secondary"
                        type="button"
                        disabled={busy}
                        onClick={closeEditPanel}
                      >
                        キャンセル
                      </button>
                      <button
                        className="ap-edit-save"
                        type="button"
                        disabled={busy}
                        onClick={() => saveProductEdit(openRow.p, openRow.info.count)}
                      >
                        {busy ? "処理中..." : "この商品の設定を保存"}
                      </button>
                    </div>

                    <div className="ap-danger">
                      <b>危険な操作</b>
                      <p className="ap-hint">
                        商品と在庫ロット（{openRow.info.count}件）をまとめて削除します。元に戻せません。
                      </p>
                      <button
                        className="ap-danger-btn"
                        type="button"
                        disabled={busy}
                        onClick={() => deleteProduct(openRow.p, openRow.info.count)}
                      >
                        この商品を削除する
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ================= 在庫を減らす ================= */}
      {adjust && (
        <div className="ap-modal-back">
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

      {/* ================= 商品を追加 ================= */}
      {addOpen && (
        <div className="ap-modal-back">
          <div className="ac-modal ac-modal-wide-box">
            <h3 className="ac-modal-title">商品を追加</h3>
            <p className="ac-modal-sub">
              在庫を入れる場合は<b>仕入れ原価</b>と<b>賞味期限（または期限なし）</b>が必須です。
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
                <span>在庫数</span>
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
                <span>仕入れ原価（1個・円）在庫がある場合は必須</span>
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
                <span>会員価格（空欄なら通常価格）</span>
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
