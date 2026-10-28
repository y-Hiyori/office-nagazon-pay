// src/pages/AdminCorrections.tsx
// 仕入れ原価・廃棄ロスの「緊急修正」画面
//   ・修正は必ず「変更前 → 変更後」「影響額」「理由」を確認してから実行
//   ・実行内容は admin_correction_logs に記録され、この画面の「修正履歴」で確認できる
import { useEffect, useMemo, useState } from "react";
import AdminHeader from "../components/AdminHeader";
import Loading from "../components/Loading";
import { supabase } from "../lib/supabase";
import { lockScroll, unlockScroll } from "../lib/scrollLock";
import "./AdminCorrections.css";

type Target = "product_cost" | "lot_cost" | "sold_cost" | "disposal";
type Field = "cost" | "qty";

type Product = { id: number; name: string | null; cost: number | null };
type Lot = {
  id: string;
  product_id: number;
  cost: number | null;
  remaining: number | null;
  lot_label: string | null;
  expiry_date: string | null;
  created_at: string | null;
};
type Sold = {
  id: string;
  order_id: string;
  product_id: number;
  cost: number;
  qty: number;
  sale: boolean;
  created_at: string;
};
type Disposal = {
  id: string;
  product_id: number;
  qty: number;
  cost: number | null;
  reason: string | null;
  memo: string | null;
  lot_label: string | null;
  created_at: string;
};
type LogRow = {
  id: string;
  target: Target;
  target_id: string;
  product_id: number | null;
  product_name: string | null;
  field: Field;
  before_value: number | null;
  after_value: number | null;
  reason: string;
  admin_name: string | null;
  created_at: string;
};

type Edit = {
  target: Target;
  id: string;
  field: Field;
  productName: string;
  title: string; // 何の値か
  detail: string; // 対象の説明
  before: number;
  unit: "円" | "個";
  /** 修正による合計金額の変化を計算（before→after） */
  impact?: (after: number) => { label: string; diff: number } | null;
};

const TABS: { key: Target | "log"; label: string; help: string }[] = [
  { key: "sold_cost", label: "売れた分の原価", help: "売上画面の「仕入れ原価」「粗利」に使われる金額です（注文ごと）。" },
  { key: "disposal", label: "廃棄ロス", help: "在庫を減らした（廃棄・期限切れ等）記録の原価と個数です。売上画面の「廃棄ロス」に反映されます。" },
  { key: "lot_cost", label: "在庫ロットの原価", help: "まだ売れていない在庫1個ごとの原価です。今後売れたときの原価になります。" },
  { key: "product_cost", label: "商品の標準原価", help: "ロットが無いときに使う原価です（商品ごとに1つ）。" },
  { key: "log", label: "修正履歴", help: "この画面で行った修正の記録です（削除・編集はできません）。" },
];

const TARGET_LABEL: Record<Target, string> = {
  sold_cost: "売れた分の原価",
  disposal: "廃棄ロス",
  lot_cost: "在庫ロットの原価",
  product_cost: "商品の標準原価",
};

const REASON_LABEL: Record<string, string> = {
  discard: "廃棄（傷み・破損）",
  expired: "期限切れ廃棄",
  return: "返品・返却",
  sample: "試食・サンプル",
  other: "その他",
};

const yen = (n: number | null | undefined) => `¥${Math.round(Number(n || 0)).toLocaleString("ja-JP")}`;
const fmtDate = (s?: string | null, withTime = true) => {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 10);
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
};
const toInt = (v: string) => {
  const n = Math.floor(Number(String(v).replace(/[^\d]/g, "")));
  return Number.isFinite(n) ? n : NaN;
};

const CONFIRM_WORD = "修正";

export default function AdminCorrections() {
  const [tab, setTab] = useState<Target | "log">("sold_cost");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [sold, setSold] = useState<Sold[]>([]);
  const [disposals, setDisposals] = useState<Disposal[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);

  const [q, setQ] = useState("");
  const [days, setDays] = useState(90);

  // 修正フォーム
  const [edit, setEdit] = useState<Edit | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [after, setAfter] = useState("");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  // まとめて修正（廃棄ロス・複数選択）
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<string[] | null>(null);
  const [bStep, setBStep] = useState<1 | 2>(1);
  const [bAfter, setBAfter] = useState("");
  const [bReason, setBReason] = useState("");
  const [bTyped, setBTyped] = useState("");
  const [bSaving, setBSaving] = useState(false);
  const [bErr, setBErr] = useState("");

  const [pastNames, setPastNames] = useState<Map<number, string>>(new Map());
  const nameOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of products) m.set(p.id, p.name ?? `ID ${p.id}`);
    return (id: number) => m.get(id) ?? (pastNames.get(id) ? `${pastNames.get(id)}（削除済み）` : `商品ID ${id}（削除済み）`);
  }, [products, pastNames]);
  const PAGE = 30;
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [tab, q, days]);
  // 絞り込みを変えたら選択をリセット（見えていない記録を誤って修正しないため）
  useEffect(() => setPicked(new Set()), [tab, q, days]);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const [pR, lR, sR, dR, gR] = await Promise.all([
        supabase.from("products_admin").select("id,name,cost").order("id"),
        supabase.from("product_lots").select("id,product_id,cost,remaining,lot_label,expiry_date,created_at").order("created_at", { ascending: false }),
        supabase
          .from("order_lot_consumptions")
          .select("id,order_id,product_id,cost,qty,sale,created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("stock_adjustments")
          .select("id,product_id,qty,cost,reason,memo,lot_label,created_at")
          .lt("qty", 0)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("admin_correction_logs").select("*").order("created_at", { ascending: false }).limit(300),
      ]);
      if (pR.error) throw pR.error;
      setProducts((pR.data ?? []) as Product[]);
      setLots((lR.data ?? []) as Lot[]);
      setSold((sR.data ?? []) as Sold[]);
      setDisposals((dR.data ?? []) as Disposal[]);
      if (gR.error) {
        setErr("修正履歴を読み込めませんでした。supabase_v38_admin_correction.sql が実行されているか確認してください。");
      }
      setLogs((gR.data ?? []) as LogRow[]);

      // 削除済み商品は、注文時の商品名を表示する
      const known = new Set(((pR.data ?? []) as Product[]).map((p) => p.id));
      const missing = [
        ...new Set(
          [...((sR.data ?? []) as Sold[]), ...((dR.data ?? []) as Disposal[])]
            .map((r) => r.product_id)
            .filter((id) => !known.has(id))
        ),
      ];
      if (missing.length) {
        const { data: oi } = await supabase.from("order_items").select("product_id,product_name").in("product_id", missing).limit(500);
        const m = new Map<number, string>();
        for (const r of (oi ?? []) as { product_id: number; product_name: string | null }[]) {
          if (r.product_name && !m.has(r.product_id)) m.set(r.product_id, r.product_name);
        }
        setPastNames(m);
      }
    } catch (e: unknown) {
      setErr("読み込みに失敗しました: " + (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  // モーダル表示中は背面スクロールを止める
  useEffect(() => {
    if (!edit) return;
    lockScroll("admin-corrections");
    return () => unlockScroll("admin-corrections");
  }, [edit]);

  const match = (pid: number, extra = "") => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return `${nameOf(pid)} ${pid} ${extra}`.toLowerCase().includes(t);
  };

  const openEdit = (e: Edit) => {
    setEdit(e);
    setStep(1);
    setAfter(String(e.before));
    setReason("");
    setTyped("");
    setFormErr("");
    setMsg("");
  };
  const closeEdit = () => {
    if (saving) return;
    setEdit(null);
  };

  const afterNum = toInt(after);
  const goConfirm = () => {
    if (!edit) return;
    if (!Number.isFinite(afterNum) || afterNum < 0) {
      setFormErr("0以上の数字を入力してください");
      return;
    }
    if (edit.unit === "個" && afterNum < 1) {
      setFormErr("個数は1以上で入力してください");
      return;
    }
    if (afterNum === edit.before) {
      setFormErr("変更前と同じ値です");
      return;
    }
    if (reason.trim().length < 2) {
      setFormErr("修正理由を入力してください（例：請求書と金額が違っていた）");
      return;
    }
    setFormErr("");
    setTyped("");
    setStep(2);
  };

  const submit = async () => {
    if (!edit || saving) return;
    if (typed.trim() !== CONFIRM_WORD) {
      setFormErr(`確認のため「${CONFIRM_WORD}」と入力してください`);
      return;
    }
    setSaving(true);
    setFormErr("");
    try {
      const { error } = await supabase.rpc("admin_correct_value", {
        p_target: edit.target,
        p_id: edit.id,
        p_field: edit.field,
        p_value: afterNum,
        p_reason: reason.trim(),
      });
      if (error) {
        setFormErr("修正できませんでした: " + error.message);
        return;
      }
      setMsg(`「${edit.productName}」の${edit.title}を ${edit.before.toLocaleString()}${edit.unit} → ${afterNum.toLocaleString()}${edit.unit} に修正し、履歴に記録しました。`);
      setEdit(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  // ---------- 一覧データ ----------
  const soldRows = useMemo(() => sold.filter((r) => match(r.product_id, r.order_id)), [sold, q, nameOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const dispRows = useMemo(() => disposals.filter((r) => match(r.product_id, r.memo ?? "")), [disposals, q, nameOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const lotRows = useMemo(() => lots.filter((r) => Number(r.remaining || 0) > 0 && match(r.product_id, r.lot_label ?? "")), [lots, q, nameOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const prodRows = useMemo(() => products.filter((r) => match(r.id)), [products, q, nameOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const logRows = useMemo(
    () => logs.filter((r) => !q.trim() || `${r.product_name ?? ""} ${r.product_id ?? ""} ${r.reason}`.toLowerCase().includes(q.trim().toLowerCase())),
    [logs, q]
  );

  const recentLogFor = (target: Target, id: string) => logs.find((l) => l.target === target && l.target_id === id);

  const current = TABS.find((t) => t.key === tab)!;
  const counts: Record<string, number> = {
    sold_cost: soldRows.length,
    disposal: dispRows.length,
    lot_cost: lotRows.length,
    product_cost: prodRows.length,
    log: logRows.length,
  };

  // ---------- 廃棄ロスのまとめて修正（複数選択） ----------
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const openBulk = () => {
    const ids = dispRows.filter((r) => picked.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    setBulk(ids);
    setBStep(1);
    setBAfter("");
    setBReason("");
    setBTyped("");
    setBErr("");
    setMsg("");
  };

  const closeBulk = () => {
    if (bSaving) return;
    setBulk(null);
  };

  const bulkRows = useMemo(() => (bulk ? disposals.filter((d) => bulk.includes(d.id)) : []), [bulk, disposals]);
  const bAfterNum = toInt(bAfter);
  const bulkCosts = bulkRows.map((d) => Number(d.cost || 0));
  const bulkAllSame = bulkCosts.length > 0 && bulkCosts.every((c) => c === bulkCosts[0]);
  const bulkCurText =
    !bulk || bulkRows.length === 0
      ? ""
      : bulkAllSame
        ? yen(bulkCosts[0])
        : `${yen(Math.min(...bulkCosts))}〜${yen(Math.max(...bulkCosts))}（記録ごとに異なります）`;
  const bulkChanging = Number.isFinite(bAfterNum) ? bulkRows.filter((d) => Number(d.cost || 0) !== bAfterNum) : [];
  const bulkImpactTotal = bulkChanging.reduce((s, d) => s + (bAfterNum - Number(d.cost || 0)) * Math.abs(Number(d.qty || 0)), 0);

  const goBulkConfirm = () => {
    if (!bulk) return;
    if (!Number.isFinite(bAfterNum) || bAfterNum < 0) {
      setBErr("0以上の数字を入力してください");
      return;
    }
    if (bulkChanging.length === 0) {
      setBErr("選択した記録はすべて同じ原価です。変更がありません。");
      return;
    }
    if (bReason.trim().length < 2) {
      setBErr("修正理由を入力してください（例：請求書と金額が違っていた）");
      return;
    }
    setBErr("");
    setBTyped("");
    setBStep(2);
  };

  const submitBulk = async () => {
    if (!bulk || bSaving) return;
    if (bTyped.trim() !== CONFIRM_WORD) {
      setBErr(`確認のため「${CONFIRM_WORD}」と入力してください`);
      return;
    }
    setBSaving(true);
    setBErr("");
    const targets = bulkChanging;
    let done = 0;
    try {
      for (const d of targets) {
        const { error } = await supabase.rpc("admin_correct_value", {
          p_target: "disposal",
          p_id: d.id,
          p_field: "cost",
          p_value: bAfterNum,
          p_reason: bReason.trim(),
        });
        if (error) {
          setBulk(null);
          await load();
          setErr(`${done}件を修正した後、エラーが発生しました：${error.message}`);
          return;
        }
        done++;
      }
      setMsg(`選択した${done}件の廃棄ロスの原価(1個)を ${yen(bAfterNum)} にまとめて修正し、履歴に記録しました。`);
      setBulk(null);
      setPicked(new Set());
      await load();
    } finally {
      setBSaving(false);
    }
  };

  // ---------- 影響額の表示 ----------
  const impact = edit?.impact && Number.isFinite(afterNum) ? edit.impact(afterNum) : null;

  return (
    <>
      <AdminHeader />
      <div className="acr-page">
        <header className="acr-head">
          <h1>緊急修正（仕入れ原価・廃棄ロス）</h1>
          <p className="acr-lead">
            入力ミスなどで金額が違っているときだけ使う画面です。修正すると売上・粗利の計算が変わります。
            修正のたびに「誰が・いつ・何を・なぜ」変えたかが<strong>修正履歴</strong>に残ります。
          </p>
          <div className="acr-warn" role="note">
            <span aria-hidden="true">⚠</span>
            <span>通常の在庫追加・ロット編集は「商品管理」から行ってください。ここは緊急時専用です。</span>
          </div>
        </header>

        <div className="acr-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`acr-tab ${tab === t.key ? "is-on" : ""} ${t.key === "log" ? "is-log" : ""}`}
              onClick={() => setTab(t.key)}
              type="button"
            >
              {t.label}
              <span className="acr-tab-n">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="acr-tools">
          <input
            className="acr-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 商品名・商品ID・注文IDで絞り込み"
            type="search"
          />
          {(tab === "sold_cost" || tab === "disposal") && (
            <select className="acr-days" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="期間">
              <option value={30}>直近30日</option>
              <option value={90}>直近90日</option>
              <option value={365}>直近1年</option>
              <option value={3650}>すべて</option>
            </select>
          )}
        </div>
        <p className="acr-help">{current.help}</p>

        {tab === "disposal" && dispRows.length > 0 && (
          <div className="acr-bulkbar">
            <div className="acr-bulkbar-info">
              <b>{picked.size}</b> 件を選択中
              <span className="acr-bulkbar-sub">チェックした記録の原価(1個)をまとめて直せます</span>
            </div>
            <div className="acr-bulkbar-btns">
              <button
                type="button"
                className="acr-btn acr-btn--sub"
                onClick={() => setPicked(new Set(dispRows.map((r) => r.id)))}
                disabled={picked.size === dispRows.length}
              >
                すべて選択
              </button>
              <button type="button" className="acr-btn acr-btn--sub" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>
                選択解除
              </button>
              <button type="button" className="acr-btn" onClick={openBulk} disabled={picked.size === 0}>
                まとめて原価を修正
              </button>
            </div>
          </div>
        )}

        {msg && (
          <div className="acr-msg" role="status">
            ✓ {msg}
          </div>
        )}
        {err && <div className="acr-err">{err}</div>}

        {loading ? (
          <Loading />
        ) : (
          <div className="acr-list">
            {/* ===== 売れた分の原価 ===== */}
            {tab === "sold_cost" &&
              (soldRows.length === 0 ? (
                <p className="acr-empty">対象の記録はありません</p>
              ) : (
                soldRows.slice(0, limit).map((r) => {
                  const last = recentLogFor("sold_cost", r.id);
                  return (
                    <article className="acr-row" key={r.id}>
                      <div className="acr-row-main">
                        <div className="acr-row-title">{nameOf(r.product_id)}</div>
                        <div className="acr-row-meta">
                          <span>{fmtDate(r.created_at)}</span>
                          <span>注文 {r.order_id.slice(0, 8)}</span>
                          {r.sale && <span className="acr-chip">セール</span>}
                          {!r.order_id && <span className="acr-chip">ロット不明</span>}
                        </div>
                      </div>
                      <div className="acr-vals">
                        <div className="acr-val">
                          <span>原価(1個)</span>
                          <b>{yen(r.cost)}</b>
                        </div>
                        <div className="acr-val">
                          <span>個数</span>
                          <b>{r.qty}</b>
                        </div>
                        <div className="acr-val">
                          <span>原価合計</span>
                          <b>{yen(r.cost * r.qty)}</b>
                        </div>
                      </div>
                      <div className="acr-actions">
                        <button
                          className="acr-btn"
                          type="button"
                          onClick={() =>
                            openEdit({
                              target: "sold_cost",
                              id: r.id,
                              field: "cost",
                              productName: nameOf(r.product_id),
                              title: "売れた分の原価（1個）",
                              detail: `${fmtDate(r.created_at)} の注文（${r.qty}個）`,
                              before: Number(r.cost || 0),
                              unit: "円",
                              impact: (a) => ({ label: "この注文の原価合計", diff: (a - Number(r.cost || 0)) * r.qty }),
                            })
                          }
                        >
                          原価を修正
                        </button>
                      </div>
                      {last && <LastFix log={last} />}
                    </article>
                  );
                })
              ))}

            {/* ===== 廃棄ロス ===== */}
            {tab === "disposal" &&
              (dispRows.length === 0 ? (
                <p className="acr-empty">対象の記録はありません</p>
              ) : (
                dispRows.slice(0, limit).map((r) => {
                  const qty = Math.abs(Number(r.qty || 0));
                  const cost = Number(r.cost || 0);
                  const lastC = recentLogFor("disposal", r.id);
                  return (
                    <article className={`acr-row acr-row--pick${picked.has(r.id) ? " is-picked" : ""}`} key={r.id}>
                      <label className="acr-pick" title="選択する">
                        <input
                          type="checkbox"
                          checked={picked.has(r.id)}
                          onChange={() => togglePick(r.id)}
                          aria-label={`${nameOf(r.product_id)} の廃棄記録を選択`}
                        />
                        <span className="acr-pick-mark" aria-hidden="true" />
                      </label>
                      <div className="acr-row-main">
                        <div className="acr-row-title">{nameOf(r.product_id)}</div>
                        <div className="acr-row-meta">
                          <span>{fmtDate(r.created_at)}</span>
                          <span className="acr-chip acr-chip--red">{REASON_LABEL[r.reason ?? ""] ?? r.reason ?? "-"}</span>
                          {r.memo && <span className="acr-memo">メモ：{r.memo}</span>}
                        </div>
                      </div>
                      <div className="acr-vals">
                        <div className="acr-val">
                          <span>原価(1個)</span>
                          <b>{yen(cost)}</b>
                        </div>
                        <div className="acr-val">
                          <span>個数</span>
                          <b>{qty}</b>
                        </div>
                        <div className="acr-val">
                          <span>廃棄ロス</span>
                          <b className="acr-red">{yen(cost * qty)}</b>
                        </div>
                      </div>
                      <div className="acr-actions">
                        <button
                          className="acr-btn"
                          type="button"
                          onClick={() =>
                            openEdit({
                              target: "disposal",
                              id: r.id,
                              field: "cost",
                              productName: nameOf(r.product_id),
                              title: "廃棄ロスの原価（1個）",
                              detail: `${fmtDate(r.created_at)} の処分記録（${qty}個）`,
                              before: cost,
                              unit: "円",
                              impact: (a) => ({ label: "この記録の廃棄ロス", diff: (a - cost) * qty }),
                            })
                          }
                        >
                          原価を修正
                        </button>
                        <button
                          className="acr-btn acr-btn--sub"
                          type="button"
                          onClick={() =>
                            openEdit({
                              target: "disposal",
                              id: r.id,
                              field: "qty",
                              productName: nameOf(r.product_id),
                              title: "廃棄ロスの個数",
                              detail: `${fmtDate(r.created_at)} の処分記録（原価 ${yen(cost)}/個）※在庫数は変わりません`,
                              before: qty,
                              unit: "個",
                              impact: (a) => ({ label: "この記録の廃棄ロス", diff: (a - qty) * cost }),
                            })
                          }
                        >
                          個数を修正
                        </button>
                      </div>
                      {lastC && <LastFix log={lastC} />}
                    </article>
                  );
                })
              ))}

            {/* ===== 在庫ロットの原価 ===== */}
            {tab === "lot_cost" &&
              (lotRows.length === 0 ? (
                <p className="acr-empty">在庫のあるロットはありません</p>
              ) : (
                lotRows.slice(0, limit).map((r) => {
                  const last = recentLogFor("lot_cost", r.id);
                  return (
                    <article className="acr-row" key={r.id}>
                      <div className="acr-row-main">
                        <div className="acr-row-title">{nameOf(r.product_id)}</div>
                        <div className="acr-row-meta">
                          <span>入荷 {fmtDate(r.created_at, false)}</span>
                          {r.lot_label && <span>{r.lot_label}</span>}
                          <span>期限 {r.expiry_date ? String(r.expiry_date).slice(0, 10) : "なし"}</span>
                        </div>
                      </div>
                      <div className="acr-vals">
                        <div className="acr-val">
                          <span>原価(1個)</span>
                          <b>{yen(r.cost)}</b>
                        </div>
                        <div className="acr-val">
                          <span>残り</span>
                          <b>{Number(r.remaining || 0)}</b>
                        </div>
                      </div>
                      <div className="acr-actions">
                        <button
                          className="acr-btn"
                          type="button"
                          onClick={() =>
                            openEdit({
                              target: "lot_cost",
                              id: r.id,
                              field: "cost",
                              productName: nameOf(r.product_id),
                              title: "在庫ロットの原価（1個）",
                              detail: `入荷 ${fmtDate(r.created_at, false)}・残り${Number(r.remaining || 0)}個`,
                              before: Number(r.cost || 0),
                              unit: "円",
                              impact: (a) => ({
                                label: "このロットの在庫原価",
                                diff: (a - Number(r.cost || 0)) * Number(r.remaining || 0),
                              }),
                            })
                          }
                        >
                          原価を修正
                        </button>
                      </div>
                      {last && <LastFix log={last} />}
                    </article>
                  );
                })
              ))}

            {/* ===== 商品の標準原価 ===== */}
            {tab === "product_cost" &&
              (prodRows.length === 0 ? (
                <p className="acr-empty">商品がありません</p>
              ) : (
                prodRows.slice(0, limit).map((r) => {
                  const last = recentLogFor("product_cost", String(r.id));
                  return (
                    <article className="acr-row" key={r.id}>
                      <div className="acr-row-main">
                        <div className="acr-row-title">{r.name ?? `ID ${r.id}`}</div>
                        <div className="acr-row-meta">
                          <span>商品ID {r.id}</span>
                        </div>
                      </div>
                      <div className="acr-vals">
                        <div className="acr-val">
                          <span>標準原価</span>
                          <b>{yen(r.cost)}</b>
                        </div>
                      </div>
                      <div className="acr-actions">
                        <button
                          className="acr-btn"
                          type="button"
                          onClick={() =>
                            openEdit({
                              target: "product_cost",
                              id: String(r.id),
                              field: "cost",
                              productName: r.name ?? `ID ${r.id}`,
                              title: "商品の標準原価",
                              detail: "原価0円のロットにもこの値が入ります",
                              before: Number(r.cost || 0),
                              unit: "円",
                            })
                          }
                        >
                          原価を修正
                        </button>
                      </div>
                      {last && <LastFix log={last} />}
                    </article>
                  );
                })
              ))}

            {/* ===== 修正履歴 ===== */}
            {tab === "log" &&
              (logRows.length === 0 ? (
                <p className="acr-empty">修正履歴はまだありません</p>
              ) : (
                logRows.slice(0, limit).map((l) => (
                  <article className="acr-row acr-log" key={l.id}>
                    <div className="acr-row-main">
                      <div className="acr-row-title">
                        {l.product_name ?? (l.product_id ? `商品ID ${l.product_id}` : "-")}
                        <span className="acr-chip">{TARGET_LABEL[l.target] ?? l.target}{l.field === "qty" ? "（個数）" : ""}</span>
                      </div>
                      <div className="acr-row-meta">
                        <span>{fmtDate(l.created_at)}</span>
                        <span>実行：{l.admin_name ?? "-"}</span>
                      </div>
                    </div>
                    <div className="acr-change">
                      <span className="acr-before">
                        {l.field === "qty" ? `${l.before_value ?? 0}個` : yen(l.before_value)}
                      </span>
                      <span aria-hidden="true">→</span>
                      <span className="acr-after">{l.field === "qty" ? `${l.after_value ?? 0}個` : yen(l.after_value)}</span>
                    </div>
                    <div className="acr-reason">理由：{l.reason}</div>
                  </article>
                ))
              ))}
            {(counts[tab] ?? 0) > limit && (
              <button className="acr-more" type="button" onClick={() => setLimit((n) => n + PAGE)}>
                さらに表示（残り {(counts[tab] ?? 0) - limit} 件）
              </button>
            )}
          </div>
        )}
      </div>

      {/* ===== 修正ダイアログ（2段階確認） ===== */}
      {edit && (
        <div className="acr-modal-back" onClick={closeEdit}>
          <div className="acr-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="acr-modal-head">
              <div>
                <div className="acr-step">{step === 1 ? "ステップ 1 / 2：修正内容の入力" : "ステップ 2 / 2：最終確認"}</div>
                <h2>{edit.title}を修正</h2>
              </div>
              <button className="acr-x" type="button" onClick={closeEdit} aria-label="閉じる" disabled={saving}>
                ×
              </button>
            </div>

            <div className="acr-modal-body">
              <div className="acr-target">
                <div className="acr-target-name">{edit.productName}</div>
                <div className="acr-target-detail">{edit.detail}</div>
              </div>

              {step === 1 ? (
                <>
                  <label className="acr-field">
                    <span>現在の値</span>
                    <div className="acr-current">
                      {edit.before.toLocaleString("ja-JP")}
                      {edit.unit}
                    </div>
                  </label>
                  <label className="acr-field">
                    <span>修正後の値（{edit.unit}）</span>
                    <input
                      inputMode="numeric"
                      value={after}
                      onChange={(e) => setAfter(e.target.value.replace(/[^\d]/g, ""))}
                      autoFocus
                    />
                  </label>
                  <label className="acr-field">
                    <span>修正理由（必須・履歴に残ります）</span>
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="例：仕入れ伝票の金額と違っていたため（120円→108円）"
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="acr-diff">
                    <div>
                      <span>変更前</span>
                      <b className="acr-before">
                        {edit.before.toLocaleString("ja-JP")}
                        {edit.unit}
                      </b>
                    </div>
                    <div className="acr-arrow" aria-hidden="true">
                      →
                    </div>
                    <div>
                      <span>変更後</span>
                      <b className="acr-after">
                        {afterNum.toLocaleString("ja-JP")}
                        {edit.unit}
                      </b>
                    </div>
                  </div>
                  {impact && impact.diff !== 0 && (
                    <div className="acr-impact">
                      {impact.label}が <b>{impact.diff > 0 ? "+" : "−"}{yen(Math.abs(impact.diff)).slice(1)}円</b>{" "}
                      {impact.diff > 0 ? "増えます" : "減ります"}
                      {(edit.target === "sold_cost" || edit.target === "disposal") && (
                        <>（粗利は {impact.diff > 0 ? "減り" : "増え"}ます）</>
                      )}
                    </div>
                  )}
                  <div className="acr-confirm-log">
                    <div className="acr-confirm-log-title">修正履歴に記録される内容</div>
                    <ul>
                      <li>対象：{TARGET_LABEL[edit.target]}{edit.field === "qty" ? "（個数）" : ""}／{edit.productName}</li>
                      <li>
                        内容：{edit.before.toLocaleString()}
                        {edit.unit} → {afterNum.toLocaleString()}
                        {edit.unit}
                      </li>
                      <li>理由：{reason.trim()}</li>
                      <li>実行者・日時：ログイン中の管理者／{fmtDate(new Date().toISOString())}</li>
                    </ul>
                  </div>
                  <label className="acr-field">
                    <span>
                      本当に修正する場合は「<b>{CONFIRM_WORD}</b>」と入力してください
                    </span>
                    <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={CONFIRM_WORD} autoFocus />
                  </label>
                </>
              )}

              {formErr && <div className="acr-form-err">{formErr}</div>}
            </div>

            <div className="acr-modal-foot">
              {step === 1 ? (
                <>
                  <button className="acr-btn acr-btn--sub" type="button" onClick={closeEdit}>
                    キャンセル
                  </button>
                  <button className="acr-btn" type="button" onClick={goConfirm}>
                    確認へ進む
                  </button>
                </>
              ) : (
                <>
                  <button className="acr-btn acr-btn--sub" type="button" onClick={() => setStep(1)} disabled={saving}>
                    戻る
                  </button>
                  <button
                    className="acr-btn acr-btn--danger"
                    type="button"
                    onClick={submit}
                    disabled={saving || typed.trim() !== CONFIRM_WORD}
                  >
                    {saving ? (
                      <>
                        <span className="btn-spinner" />
                        修正中…
                      </>
                    ) : (
                      "この内容で修正する"
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== まとめて修正ダイアログ（廃棄ロス・複数選択） ===== */}
      {bulk && (
        <div className="acr-modal-back" onClick={closeBulk}>
          <div className="acr-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="acr-modal-head">
              <div>
                <div className="acr-step">{bStep === 1 ? "ステップ 1 / 2：修正内容の入力" : "ステップ 2 / 2：最終確認"}</div>
                <h2>廃棄ロスの原価をまとめて修正</h2>
              </div>
              <button className="acr-x" type="button" onClick={closeBulk} aria-label="閉じる" disabled={bSaving}>
                ×
              </button>
            </div>

            <div className="acr-modal-body">
              <div className="acr-target">
                <div className="acr-target-name">選択した {bulkRows.length} 件の廃棄ロス</div>
                <div className="acr-target-detail">原価(1個)をすべて同じ金額にそろえます。個数・在庫数は変わりません。</div>
              </div>

              {bStep === 1 ? (
                <>
                  <label className="acr-field">
                    <span>現在の原価(1個)</span>
                    <div className="acr-current acr-current--sm">{bulkCurText}</div>
                  </label>
                  <label className="acr-field">
                    <span>修正後の原価（1個・円）</span>
                    <input
                      inputMode="numeric"
                      value={bAfter}
                      onChange={(e) => setBAfter(e.target.value.replace(/[^\d]/g, ""))}
                      autoFocus
                      placeholder="例：108"
                    />
                  </label>
                  <label className="acr-field">
                    <span>修正理由（必須・履歴に残ります）</span>
                    <textarea
                      rows={3}
                      value={bReason}
                      onChange={(e) => setBReason(e.target.value)}
                      placeholder="例：仕入れ伝票の金額と違っていたため（120円→108円）"
                    />
                  </label>
                  {Number.isFinite(bAfterNum) && bulkChanging.length > 0 && (
                    <div className="acr-impact">
                      変更される記録：<b>{bulkChanging.length}件</b>
                      {bulkRows.length - bulkChanging.length > 0 && (
                        <>（すでに同じ原価の{bulkRows.length - bulkChanging.length}件はそのまま）</>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="acr-diff">
                    <div>
                      <span>変更前</span>
                      <b className="acr-before">{bulkRows.length}件</b>
                    </div>
                    <div className="acr-arrow" aria-hidden="true">
                      →
                    </div>
                    <div>
                      <span>変更後（1個）</span>
                      <b className="acr-after">{yen(bAfterNum)}</b>
                    </div>
                  </div>
                  {bulkImpactTotal !== 0 && (
                    <div className="acr-impact">
                      選択した{bulkChanging.length}件の廃棄ロス（合計）が{" "}
                      <b>
                        {bulkImpactTotal > 0 ? "+" : "−"}
                        {yen(Math.abs(bulkImpactTotal)).slice(1)}円
                      </b>{" "}
                      {bulkImpactTotal > 0 ? "増えます" : "減ります"}（粗利は {bulkImpactTotal > 0 ? "減り" : "増え"}ます）
                    </div>
                  )}
                  <div className="acr-confirm-log">
                    <div className="acr-confirm-log-title">修正履歴に記録される内容</div>
                    <ul>
                      <li>対象：廃棄ロス（原価）／選択した{bulkRows.length}件</li>
                      <li>
                        内容：原価(1個)を {yen(bAfterNum)} に変更（{bulkChanging.length}件）
                      </li>
                      <li>理由：{bReason.trim()}</li>
                      <li>実行者・日時：ログイン中の管理者／{fmtDate(new Date().toISOString())}</li>
                      <li>記録ごとに1行ずつ履歴に残ります</li>
                    </ul>
                  </div>
                  <label className="acr-field">
                    <span>
                      本当に修正する場合は「<b>{CONFIRM_WORD}</b>」と入力してください
                    </span>
                    <input value={bTyped} onChange={(e) => setBTyped(e.target.value)} placeholder={CONFIRM_WORD} autoFocus />
                  </label>
                </>
              )}

              {bErr && <div className="acr-form-err">{bErr}</div>}
            </div>

            <div className="acr-modal-foot">
              {bStep === 1 ? (
                <>
                  <button className="acr-btn acr-btn--sub" type="button" onClick={closeBulk}>
                    キャンセル
                  </button>
                  <button className="acr-btn" type="button" onClick={goBulkConfirm}>
                    確認へ進む
                  </button>
                </>
              ) : (
                <>
                  <button className="acr-btn acr-btn--sub" type="button" onClick={() => setBStep(1)} disabled={bSaving}>
                    戻る
                  </button>
                  <button
                    className="acr-btn acr-btn--danger"
                    type="button"
                    onClick={submitBulk}
                    disabled={bSaving || bTyped.trim() !== CONFIRM_WORD}
                  >
                    {bSaving ? (
                      <>
                        <span className="btn-spinner" />
                        修正中…
                      </>
                    ) : (
                      "この内容で修正する"
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LastFix({ log }: { log: LogRow }) {
  const v = (n: number | null) => (log.field === "qty" ? `${n ?? 0}個` : yen(n));
  return (
    <div className="acr-lastfix">
      最終修正：{fmtDate(log.created_at)}（{log.admin_name ?? "-"}）{v(log.before_value)} → {v(log.after_value)}／{log.reason}
    </div>
  );
}
