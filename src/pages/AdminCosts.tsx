// src/pages/AdminCosts.tsx
// ✅ 仕入れ原価・入荷ロット管理
//   ・在庫があるのにロット未作成の商品 →「在庫に合わせてロットを一括作成」で揃える
//   ・在庫を増やすときは「原価」と「賞味期限／消費期限」の登録が必須（1個ずつ／1ロット単位）
//   ・在庫を減らすときは「理由」と「対象ロット」が必須（履歴を stock_adjustments に残す）
//   ・まとめて選択して原価・期限を入力する機能は廃止
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

// ✅ 在庫を1個ずつ登録するときの1行ぶん
type UnitDraft = {
  cost: string;
  expiry_date: string;
  expiry_type: "best_before" | "use_by";
  no_expiry: boolean;
};

// ✅ 在庫を減らすときの理由（必須）
type Reason = "discard" | "expired" | "return" | "sample" | "other";

const REASONS: { value: Reason; label: string }[] = [
  { value: "discard", label: "廃棄（傷み・破損）" },
  { value: "expired", label: "期限切れ廃棄" },
  { value: "return", label: "返品・返却" },
  { value: "sample", label: "試食・サンプル提供" },
  { value: "other", label: "その他（メモ必須）" },
];

const reasonLabel = (v: string) =>
  REASONS.find((r) => r.value === v)?.label ?? v;

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

export default function AdminCosts() {
  const navigate = useNavigate();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [onlyAlert, setOnlyAlert] = useState(false);

  // 展開中の商品
  const [openId, setOpenId] = useState<number | null>(null);
  // ロット編集ドラフト
  const [drafts, setDrafts] = useState<Record<string, LotDraft>>({});

  // ✅ 在庫を1個ずつ登録（商品ごと）
  const [unitCount, setUnitCount] = useState<Record<number, string>>({});
  const [unitBulkCost, setUnitBulkCost] = useState<Record<number, string>>({});
  const [unitRows, setUnitRows] = useState<Record<number, UnitDraft[]>>({});
  const [unitSyncStock, setUnitSyncStock] = useState<Record<number, boolean>>({});

  // ✅ 在庫を減らすダイアログ
  const [adjust, setAdjust] = useState<AdjustState | null>(null);
  const [reduceErr, setReduceErr] = useState("");
  // 「期限なし」機能が使えるか（v20のSQL実行済みか）
  const [noExpiryReady, setNoExpiryReady] = useState(true);

  useEffect(() => {
    document.body.classList.add("adminmenu-whitebg");
    return () => document.body.classList.remove("adminmenu-whitebg");
  }, []);

  const load = async () => {
    setLoading(true);

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

    // 「期限なし」列の有無を確認（未実行でも画面が壊れないように）
    const probe = await supabase.from("product_lots").select("no_expiry").limit(1);
    setNoExpiryReady(!probe.error);

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
    let missingCost = false;
    let missingExpiry = false;

    for (const l of ls) {
      const rem = Math.max(0, toInt(l.remaining));
      remaining += rem;
      costSum += toInt(l.cost) * rem;
      if (rem > 0 && toInt(l.cost) <= 0) missingCost = true;
      if (rem > 0 && !l.expiry_date && !l.no_expiry) missingExpiry = true;
      if (rem > 0 && l.expiry_date) {
        const d = String(l.expiry_date).slice(0, 10);
        if (!nearest || d < nearest) nearest = d;
      }
    }

    const avgCost = remaining > 0 ? Math.round(costSum / remaining) : 0;
    const status: ExpiryStatus = expiryStatusOf(nearest, alertDays);
    const stockNum = Math.max(0, toInt(p.stock));

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
      unregistered: Math.max(0, stockNum - remaining),
      missingCost,
      missingExpiry,
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

  const alertCounts = useMemo(() => {
    let expired = 0;
    let soon = 0;
    let missing = 0;
    let missingField = 0;
    for (const p of products) {
      const info = infoOf(p);
      if (info.status === "expired") expired++;
      else if (info.status === "urgent" || info.status === "warn") soon++;
      if (info.unregistered > 0) missing++;
      else if (info.missingCost || info.missingExpiry) missingField++;
    }
    return { expired, soon, missing, missingField };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, lotsByProduct]);

  // ✅ 在庫があるのにロット未作成 → 在庫に合わせてロットを作る
  const backfillAll = async () => {
    if (busy) return;

    const targets = products
      .map((p) => ({ p, info: infoOf(p) }))
      .filter((t) => t.info.unregistered > 0);
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

  // ✅ 商品を開いたら、未登録の在庫ぶんの入力欄を自動で用意する
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

  // ✅ 入力欄を指定の個数で作り直す
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
    setUnitRows((prev) => ({
      ...prev,
      [pid]: (prev[pid] ?? []).filter((_, i) => i !== idx),
    }));
  };

  // ✅ 入力中の原価を全行にまとめて反映（同じ入荷ぶんを素早く入力）
  const fillUnitCost = (p: ProductRow) => {
    const v = (unitBulkCost[p.id] ?? "").trim();
    setUnitRows((prev) => ({
      ...prev,
      [p.id]: (prev[p.id] ?? []).map((r) => ({ ...r, cost: v })),
    }));
  };

  // ✅ 1個＝1ロットとして登録（在庫が増える／原価・期限は必須）
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
        console.error("unit insert error:", error);
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

  // ✅ ロット1件を保存（原価・期限・メモのみ。残数は変更できない）
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

  // ✅ 残数0のロットを削除（在庫は変わらないので理由は不要）
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

  // ✅ 在庫を減らすダイアログを開く
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

  // ✅ 在庫を減らす（理由と対象ロットが必須・履歴を残す）
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

  // ✅ 1件ずつ追加（在庫が増える／原価・期限は必須）
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

  // ✅ 棚卸し調整（在庫数をロット残数に合わせる）※履歴を残す
  const syncStock = async (p: ProductRow) => {
    if (busy) return;
    const info = infoOf(p);
    const stockNow = toInt(p.stock);
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
      const { error } = await supabase
        .from("products")
        .update({ stock: info.remaining })
        .eq("id", p.id);
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
            在庫は<b>「ロット」＝入荷したひとかたまり</b>として管理します。
            <b>在庫を増やすときは、原価と賞味期限（消費期限）の登録が必須</b>です
            （期限がない商品は「期限なし」を選べます）。
            <b>在庫を減らすときは、理由と対象ロットの指定が必須</b>で、履歴に残ります。
          </p>

          {(alertCounts.expired > 0 ||
            alertCounts.soon > 0 ||
            alertCounts.missing > 0 ||
            alertCounts.missingField > 0) && (
            <div className="admin-costs-alertbar">
              {alertCounts.expired > 0 && (
                <span className="aca-badge is-expired">期限切れ {alertCounts.expired}件</span>
              )}
              {alertCounts.soon > 0 && (
                <span className="aca-badge is-warn">期限間近 {alertCounts.soon}件</span>
              )}
              {alertCounts.missing > 0 && (
                <span className="aca-badge is-missing">
                  ロット未作成の在庫 {alertCounts.missing}件
                </span>
              )}
              {alertCounts.missingField > 0 && (
                <span className="aca-badge is-missing">
                  原価・期限が未入力のロットあり {alertCounts.missingField}件
                </span>
              )}
              <button className="aca-filter" type="button" onClick={() => setOnlyAlert((v) => !v)}>
                {onlyAlert ? "すべて表示" : "期限アラートだけ表示"}
              </button>
            </div>
          )}

          {alertCounts.missing > 0 && (
            <section className="ac-backfill">
              <div className="ac-backfill-title">
                在庫があるのにロットが未作成の商品があります
                <span className="ac-backfill-count">{alertCounts.missing}件</span>
              </div>
              <p className="ac-backfill-desc">
                いまの在庫数をそのままロットとして登録します（在庫は増減しません）。
                原価0円・期限未設定で作られるので、作成後に各商品を開いて原価と期限を入力してください。
              </p>
              <button
                className="ac-bulk-btn"
                type="button"
                disabled={busy}
                onClick={backfillAll}
              >
                {busy ? "処理中..." : "在庫に合わせてロットを一括作成"}
              </button>
            </section>
          )}

          {!noExpiryReady && (
            <div className="admin-costs-msg">
              「期限なし」を使うには supabase_v20_no_expiry.sql を実行してください。
            </div>
          )}

          {msg && <div className="admin-costs-msg">{msg}</div>}

          <div className="admin-costs-toolbar">
            <input
              className="admin-costs-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="商品名 or 商品IDで絞り込み"
              inputMode="search"
            />
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

                return (
                  <div key={p.id} className="admin-costs-row">
                    <div className="ac-row-head">
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
                            <span className="ac-tag limit">上限{toInt(p.max_per_order)}個</span>
                          )}
                          {info.unregistered > 0 && (
                            <span className="ac-tag warn">ロット未作成 {info.unregistered}個</span>
                          )}
                          {info.unregistered === 0 &&
                            (info.missingCost || info.missingExpiry) && (
                              <span className="ac-tag warn">
                                {info.missingCost && info.missingExpiry
                                  ? "原価・期限が未入力"
                                  : info.missingCost
                                  ? "原価が未入力"
                                  : "期限が未設定"}
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
                          {info.unregistered > 0 && (
                            <span className="ac-exp-diff">
                              ⚠ 在庫 {toInt(p.stock)} のうち {info.unregistered}個 がロット未作成
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
                                <div
                                  key={l.id}
                                  className={`ac-lot${rem <= 0 ? " is-empty" : ""}`}
                                >
                                  <div className="ac-lot-head">
                                    <span className={`ac-exp ${isNoExpiry ? "is-none" : statusClass(st)}`}>
                                      {isNoExpiry ? "期限なし" : expiryStatusLabel(st, dDays)}
                                    </span>
                                    {l.lot_label && (
                                      <span className="ac-lot-label">{l.lot_label}</span>
                                    )}
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
                                    <button
                                      className="ac-save"
                                      type="button"
                                      disabled={busy}
                                      onClick={() => saveLot(l)}
                                    >
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

                        {/* 1件ずつ追加（既存ロットと同じ原価・期限のまとまりを追加） */}
                        <div className="ac-new">
                          <div className="ac-new-title">1件ずつ追加（原価・期限は必須）</div>
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
                                    };
                                    return {
                                      ...prev,
                                      [`new-${p.id}`]: { ...cur, cost: e.target.value },
                                    };
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
                                    };
                                    return {
                                      ...prev,
                                      [`new-${p.id}`]: { ...cur, remaining: e.target.value },
                                    };
                                  })
                                }
                              />
                            </label>
                            <label>
                              <span>期限（または期限なし）</span>
                              <input
                                type="date"
                                value={
                                  drafts[`new-${p.id}`]?.no_expiry
                                    ? ""
                                    : drafts[`new-${p.id}`]?.expiry_date ?? ""
                                }
                                disabled={!!drafts[`new-${p.id}`]?.no_expiry}
                                onChange={(e) =>
                                  setDrafts((prev) => {
                                    const cur = prev[`new-${p.id}`] ?? {
                                      cost: "",
                                      remaining: "",
                                      expiry_date: "",
                                      expiry_type: "best_before",
                                      lot_label: "",
                                    };
                                    return {
                                      ...prev,
                                      [`new-${p.id}`]: { ...cur, expiry_date: e.target.value },
                                    };
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
                                    };
                                    return {
                                      ...prev,
                                      [`new-${p.id}`]: { ...cur, expiry_type: e.target.value },
                                    };
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
                                    };
                                    return {
                                      ...prev,
                                      [`new-${p.id}`]: { ...cur, lot_label: e.target.value },
                                    };
                                  })
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
                            この内容で追加（在庫が増えます）
                          </button>
                        </div>

                        {/* ✅ 在庫を1個ずつ登録 */}
                        <div className="ac-units">
                          <div className="ac-new-title">
                            在庫を1個ずつ登録（同じ商品でも1個ごとに原価・賞味期限を個別設定）
                          </div>
                          <p className="ac-units-desc">
                            商品を開くと、<b>まだロット登録していない在庫の数だけ入力欄が自動で並びます</b>。
                            それぞれの行に原価・期限を入れて登録すると、<b>1個＝1ロット</b>として保存され、
                            在庫がその個数だけ増えます。
                            （在庫 {toInt(p.stock)}個 ／ うちロット登録済み {info.remaining}個 ／{" "}
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

                            <button className="ac-mini" type="button" onClick={() => fillUnitCost(p)}>
                              表示中の行に反映
                            </button>

                            <button
                              className="ac-mini"
                              type="button"
                              onClick={() =>
                                setUnitRows((prev) => ({
                                  ...prev,
                                  [p.id]: (prev[p.id] ?? []).map((r) => ({
                                    ...r,
                                    no_expiry: true,
                                    expiry_date: "",
                                  })),
                                }))
                              }
                            >
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
                                        onChange={(e) =>
                                          setUnitRow(p.id, idx, "expiry_date", e.target.value)
                                        }
                                      />
                                      <span className="ac-noexp">
                                        <input
                                          type="checkbox"
                                          checked={r.no_expiry}
                                          onChange={(e) =>
                                            setUnitRow(
                                              p.id,
                                              idx,
                                              "no_expiry",
                                              e.target.checked ? "1" : ""
                                            )
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
                                  <span>登録後に在庫数へ反映する</span>
                                </label>

                                <button
                                  className="ac-save"
                                  type="button"
                                  disabled={busy}
                                  onClick={() => saveUnits(p)}
                                >
                                  {busy
                                    ? "処理中..."
                                    : `${(unitRows[p.id] ?? []).length}個を1個ずつ登録（在庫が増えます）`}
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
            ※ 在庫を増やすには、原価と「賞味期限（消費期限）または期限なし」を入れたロット登録が必要です（在庫が自動で増えます）。
            <br />※ 在庫を減らすときは「在庫を減らす」から<b>理由</b>と<b>対象ロット</b>を指定してください。履歴が残ります。
            残数0のロットだけは理由なしで削除できます。
            <br />※ ロットの残数は購入時に「セール分 → 期限が近い順」で自動的に減ります。
            <br />※ セール（セール価格・セール販売の個数）は<b>商品管理</b>画面で設定します。
          </p>
        </div>
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
                    setAdjust((prev) =>
                      prev ? { ...prev, reason: e.target.value as Reason | "" } : prev
                    )
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
                <span>
                  メモ{adjust.reason === "other" ? "（必須）" : "（任意）"}
                </span>
                <input
                  type="text"
                  placeholder="例: 賞味期限切れのため廃棄"
                  value={adjust.memo}
                  onChange={(e) =>
                    setAdjust((prev) => (prev ? { ...prev, memo: e.target.value } : prev))
                  }
                />
              </label>
            </div>

            <p className="ac-modal-note">
              このロットから{toInt(adjust.qty)}個を在庫から減らします
              {toInt(adjust.qty) >= adjust.remaining ? "（ロットは削除されます）" : ""}。
              在庫数も同じ数だけ減ります。
            </p>

            {reduceErr && <p className="ac-modal-err">{reduceErr}</p>}

            <div className="ac-modal-foot">
              <button
                className="ac-del"
                type="button"
                disabled={busy}
                onClick={() => setAdjust(null)}
              >
                キャンセル
              </button>
              <button className="ac-save" type="button" disabled={busy} onClick={confirmReduce}>
                {busy ? "処理中..." : "在庫を減らす"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
