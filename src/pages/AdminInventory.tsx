// src/pages/AdminInventory.tsx
// 棚卸し：帳簿在庫と実数の差異を記録し、再発防止の分析に使う
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminHeader from "../components/AdminHeader";
import Loading from "../components/Loading";
import { appDialog } from "../lib/appDialog";
import { lockScroll, unlockScroll } from "../lib/scrollLock";
import { supabase } from "../lib/supabase";
import "./AdminInventory.css";

type Product = {
  id: number;
  name: string | null;
  stock: number | null;
  is_visible: boolean | null;
};

type Row = {
  id: number;
  name: string;
  expected: number;
  actual: string;
  note: string;
};

type Check = {
  id: string;
  created_by_name: string | null;
  note: string | null;
  item_count: number;
  diff_count: number;
  total_diff: number;
  total_abs_diff: number;
  created_at: string;
};

type CheckItem = {
  id: string;
  product_id: number | null;
  product_name: string | null;
  expected: number;
  actual: number;
  diff: number;
  note: string | null;
};

type ShortProduct = {
  name: string;
  count: number;
  short: number;
  over: number;
  abs: number;
};

const fmtDate = (s?: string | null) => {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const toCsv = (rows: { name: string; expected: number; actual: number; diff: number; note?: string }[]) => {
  const head = ["商品名", "帳簿在庫", "実数", "差異", "メモ"];
  const body = rows.map((r) => [
    r.name,
    String(r.expected),
    String(r.actual),
    String(r.diff),
    r.note || "",
  ]);
  return [head, ...body]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
};

const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default function AdminInventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");

  const [checks, setChecks] = useState<Check[]>([]);
  const [shortProducts, setShortProducts] = useState<ShortProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [detail, setDetail] = useState<Check | null>(null);
  const [detailItems, setDetailItems] = useState<CheckItem[]>([]);

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from("inventory_checks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) throw error;
    setChecks((data || []) as Check[]);

    const { data: items, error: iErr } = await supabase
      .from("inventory_check_items")
      .select("product_name,diff,check_id")
      .neq("diff", 0)
      .limit(1200);

    if (iErr) throw iErr;

    const map = new Map<string, ShortProduct>();
    for (const it of items || []) {
      const name = String(it.product_name || "（商品名なし）");
      const cur = map.get(name) || { name, count: 0, short: 0, over: 0, abs: 0 };
      const diff = Number(it.diff || 0);
      cur.count += 1;
      cur.abs += Math.abs(diff);
      if (diff < 0) cur.short += Math.abs(diff);
      else cur.over += diff;
      map.set(name, cur);
    }

    setShortProducts(
      Array.from(map.values())
        .sort((a, b) => b.abs - a.abs || b.count - a.count)
        .slice(0, 6)
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,stock,is_visible")
        .order("id", { ascending: true });

      if (error) throw error;
      setProducts((data || []) as Product[]);
      await loadHistory();
    } catch (e) {
      setErr(
        `棚卸しデータを読み込めませんでした。supabase_v46_guard.sql を実行したか確認してください。(${
          e instanceof Error ? e.message : String(e)
        })`
      );
    } finally {
      setLoading(false);
    }
  }, [loadHistory]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (detail) lockScroll("inventory-modal");
    else unlockScroll("inventory-modal");
    return () => unlockScroll("inventory-modal");
  }, [detail]);

  const startCheck = () => {
    const next = products
      .filter((p) => p.name)
      .map((p) => ({
        id: Number(p.id),
        name: String(p.name || ""),
        expected: Math.max(0, Number(p.stock || 0)),
        actual: "",
        note: "",
      }));
    setRows(next);
    setNote("");
    setChecking(true);
    setMsg("");
    setErr("");
  };

  const cancelCheck = async () => {
    const ok = await appDialog.confirm({
      title: "棚卸しをやめる",
      message: "入力した実数は保存されません。やめますか？",
      okText: "やめる",
      cancelText: "続ける",
    });
    if (!ok) return;
    setRows([]);
    setChecking(false);
  };

  const patchRow = (id: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const fillExpected = () => {
    setRows((prev) => prev.map((r) => ({ ...r, actual: String(r.expected) })));
  };

  const clearActuals = () => {
    setRows((prev) => prev.map((r) => ({ ...r, actual: "", note: "" })));
  };

  const entered = useMemo(
    () => rows.filter((r) => String(r.actual).trim() !== "" && Number.isFinite(Number(r.actual))),
    [rows]
  );

  const diffSummary = useMemo(() => {
    let short = 0;
    let over = 0;
    let diffCount = 0;
    for (const r of entered) {
      const diff = Number(r.actual) - r.expected;
      if (diff === 0) continue;
      diffCount += 1;
      if (diff < 0) short += Math.abs(diff);
      else over += diff;
    }
    return { short, over, diffCount };
  }, [entered]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || String(r.id).includes(q)
    );
  }, [rows, search]);

  const saveCheck = async () => {
    if (busy) return;
    if (entered.length === 0) {
      setErr("実数を1つ以上入力してください。");
      return;
    }

    const ok = await appDialog.confirm({
      title: "棚卸しを保存",
      message: `${entered.length}件を保存します。\n在庫数は自動で変更されません（差異の記録だけ残します）。`,
      okText: "保存する",
      cancelText: "見直す",
    });
    if (!ok) return;

    setBusy(true);
    setErr("");
    setMsg("");

    const payload = entered.map((r) => ({
      product_id: r.id,
      product_name: r.name,
      expected: r.expected,
      actual: Math.max(0, Math.floor(Number(r.actual))),
      note: r.note.trim() || null,
    }));

    const { data, error } = await supabase.rpc("guard_save_inventory_check", {
      p_note: note.trim() || null,
      p_items: payload,
    });

    setBusy(false);

    if (error) {
      setErr(`保存できませんでした：${error.message}`);
      return;
    }

    const res = data as { ok?: boolean; error?: string } | null;
    if (!res?.ok) {
      setErr(`保存できませんでした：${res?.error || "不明なエラー"}`);
      return;
    }

    setMsg(`棚卸しを保存しました（${entered.length}件）。`);
    setChecking(false);
    setRows([]);
    setNote("");
    await loadHistory().catch(() => {});
  };

  const openDetail = async (check: Check) => {
    setDetail(check);
    setDetailItems([]);
    const { data, error } = await supabase
      .from("inventory_check_items")
      .select("*")
      .eq("check_id", check.id)
      .order("diff", { ascending: true });

    if (error) {
      setErr(`履歴を読み込めませんでした：${error.message}`);
      return;
    }
    setDetailItems((data || []) as CheckItem[]);
  };

  const exportCurrent = () => {
    if (entered.length === 0) return;
    downloadCsv(
      `棚卸し_${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        entered.map((r) => ({
          name: r.name,
          expected: r.expected,
          actual: Number(r.actual),
          diff: Number(r.actual) - r.expected,
          note: r.note,
        }))
      )
    );
  };

  const exportDetail = () => {
    if (!detail) return;
    downloadCsv(
      `棚卸し履歴_${detail.created_at.slice(0, 10)}.csv`,
      toCsv(
        detailItems.map((i) => ({
          name: i.product_name || "",
          expected: i.expected,
          actual: i.actual,
          diff: i.diff,
          note: i.note || "",
        }))
      )
    );
  };

  const totals = useMemo(() => {
    const count = checks.length;
    const diffChecks = checks.filter((c) => c.diff_count > 0).length;
    const abs = checks.reduce((s, c) => s + Number(c.total_abs_diff || 0), 0);
    return { count, diffChecks, abs };
  }, [checks]);

  return (
    <>
      <AdminHeader />

      <main className="inv-page">
        <header className="inv-head">
          <h1>棚卸し・在庫差異</h1>
          <p className="inv-lead">
            「あるべき在庫」と「実際にあった数」を記録します。差異が繰り返す商品・時間帯を見つけることが、
            盗難対策の第一歩です。在庫数は自動では変更しません。
          </p>
        </header>

        {err && <div className="inv-alert is-err">{err}</div>}
        {msg && <div className="inv-alert is-ok">{msg}</div>}

        {loading ? (
          <Loading />
        ) : (
          <>
            <section className="inv-stats" aria-label="棚卸しの集計">
              <div className="inv-stat">
                <span>実施回数</span>
                <strong>{totals.count}</strong>
              </div>
              <div className="inv-stat">
                <span>差異があった回</span>
                <strong>{totals.diffChecks}</strong>
              </div>
              <div className="inv-stat">
                <span>差異の延べ数</span>
                <strong>{totals.abs}</strong>
              </div>
            </section>

            <div className="inv-columns">
              <section className="inv-card">
                <div className="inv-card-head">
                  <div>
                    <h2>棚卸しを実施</h2>
                    <p>帳簿の在庫を読み込み、実際の数を入力します。</p>
                  </div>
                  {!checking && (
                    <button type="button" className="inv-btn is-primary" onClick={startCheck}>
                      棚卸しを開始
                    </button>
                  )}
                </div>

                {!checking ? (
                  <div className="inv-intro">
                    <p>
                      商品数は <strong>{products.length}</strong> 件です。
                      開始すると、いまの在庫数が「帳簿在庫」として固定されます。
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="inv-toolbar">
                      <input
                        className="inv-search"
                        type="search"
                        placeholder="商品名・IDで絞り込み"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <button type="button" className="inv-btn is-mini" onClick={fillExpected}>
                        実数＝帳簿
                      </button>
                      <button type="button" className="inv-btn is-mini" onClick={clearActuals}>
                        クリア
                      </button>
                    </div>

                    <div className="inv-summary">
                      <span>
                        入力 <strong>{entered.length}</strong>/{rows.length}件
                      </span>
                      <span className={diffSummary.diffCount > 0 ? "is-warn" : ""}>
                        差異 <strong>{diffSummary.diffCount}</strong>件
                      </span>
                      <span className={diffSummary.short > 0 ? "is-short" : ""}>
                        不足 <strong>{diffSummary.short}</strong>
                      </span>
                      <span className={diffSummary.over > 0 ? "is-over" : ""}>
                        余剰 <strong>{diffSummary.over}</strong>
                      </span>
                    </div>

                    <div className="inv-list">
                      {filteredRows.length === 0 ? (
                        <p className="inv-none">該当する商品がありません。</p>
                      ) : (
                        filteredRows.map((r) => {
                          const has = String(r.actual).trim() !== "";
                          const diff = has ? Number(r.actual) - r.expected : null;
                          return (
                            <div key={r.id} className="inv-row">
                              <div className="inv-row-name">
                                <span>{r.name}</span>
                                <small>
                                  ID {r.id} / 帳簿 {r.expected}
                                  {r.expected < 0 ? "（要確認）" : ""}
                                </small>
                              </div>
                              <input
                                className="inv-actual"
                                type="number"
                                min={0}
                                inputMode="numeric"
                                placeholder="実数"
                                value={r.actual}
                                onChange={(e) => patchRow(r.id, { actual: e.target.value })}
                              />
                              <span
                                className={`inv-diff ${
                                  diff == null ? "" : diff < 0 ? "is-short" : diff > 0 ? "is-over" : "is-zero"
                                }`}
                              >
                                {diff == null ? "—" : diff > 0 ? `+${diff}` : diff}
                              </span>
                              <input
                                className="inv-note"
                                type="text"
                                placeholder="メモ（任意）"
                                value={r.note}
                                onChange={(e) => patchRow(r.id, { note: e.target.value })}
                              />
                            </div>
                          );
                        })
                      )}
                    </div>

                    <label className="inv-field">
                      <span>棚卸し全体のメモ（任意）</span>
                      <textarea
                        rows={2}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="例：放課後に実施 / 冷蔵ケース導入前 / 体育祭期間"
                      />
                    </label>

                    <div className="inv-actions">
                      <button
                        type="button"
                        className="inv-btn is-primary"
                        onClick={saveCheck}
                        disabled={busy}
                      >
                        {busy ? "保存中…" : "この内容で保存"}
                      </button>
                      <button type="button" className="inv-btn is-ghost" onClick={exportCurrent}>
                        CSV出力
                      </button>
                      <button type="button" className="inv-btn is-ghost" onClick={cancelCheck}>
                        やめる
                      </button>
                    </div>
                  </>
                )}
              </section>

              <section className="inv-card">
                <div className="inv-card-head">
                  <div>
                    <h2>よく合わない商品</h2>
                    <p>過去の棚卸しで差異が大きかった商品です。</p>
                  </div>
                </div>

                {shortProducts.length === 0 ? (
                  <p className="inv-none">差異の記録がまだありません。</p>
                ) : (
                  <ol className="inv-rank">
                    {shortProducts.map((s, i) => (
                      <li key={s.name}>
                        <span className="inv-rank-no">{i + 1}</span>
                        <span className="inv-rank-name">{s.name}</span>
                        <span className="inv-rank-nums">
                          {s.short > 0 && <em className="is-short">不足 {s.short}</em>}
                          {s.over > 0 && <em className="is-over">余剰 {s.over}</em>}
                          <small>{s.count}回</small>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}

                <p className="inv-hint">
                  不足が続く商品は、棚の位置・カメラの画角・受け取り動線を見直してください。
                  余剰は返品・補充ミスの可能性があります。
                </p>
              </section>
            </div>

            <section className="inv-card">
              <div className="inv-card-head">
                <div>
                  <h2>棚卸しの履歴</h2>
                  <p>過去の実施内容を確認できます。</p>
                </div>
              </div>

              {checks.length === 0 ? (
                <p className="inv-none">まだ棚卸しの記録がありません。</p>
              ) : (
                <div className="inv-history">
                  {checks.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`inv-history-row ${c.diff_count > 0 ? "has-diff" : ""}`}
                      onClick={() => openDetail(c)}
                    >
                      <span className="inv-history-date">{fmtDate(c.created_at)}</span>
                      <span className="inv-history-by">{c.created_by_name || "管理者"}</span>
                      <span className="inv-history-nums">
                        <span>{c.item_count}件</span>
                        {c.diff_count > 0 ? (
                          <strong>差異 {c.diff_count}件 / 合計 {c.total_abs_diff}</strong>
                        ) : (
                          <span className="is-zero">差異なし</span>
                        )}
                      </span>
                      <span className="inv-history-chev" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {detail && (
        <div
          className="inv-modal-overlay"
          role="presentation"
          onClick={() => setDetail(null)}
        >
          <div
            className="inv-modal"
            role="dialog"
            aria-modal="true"
            aria-label="棚卸しの履歴詳細"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="inv-modal-close"
              aria-label="閉じる"
              onClick={() => setDetail(null)}
            >
              ×
            </button>

            <header className="inv-modal-head">
              <h2>棚卸しの詳細</h2>
              <p>{fmtDate(detail.created_at)} / {detail.created_by_name || "管理者"}</p>
            </header>

            {detail.note && <p className="inv-modal-note">{detail.note}</p>}

            <div className="inv-modal-summary">
              <span>{detail.item_count}件</span>
              <span className={detail.diff_count > 0 ? "is-warn" : ""}>
                差異 {detail.diff_count}件
              </span>
              <span>合計 {detail.total_abs_diff}</span>
            </div>

            <div className="inv-detail-list">
              {detailItems.length === 0 ? (
                <p className="inv-none">明細を読み込み中…</p>
              ) : (
                detailItems.map((i) => (
                  <div key={i.id} className={`inv-detail-row ${i.diff !== 0 ? "has-diff" : ""}`}>
                    <span className="inv-detail-name">{i.product_name || "（商品名なし）"}</span>
                    <span className="inv-detail-nums">
                      帳簿 {i.expected} → 実数 {i.actual}
                    </span>
                    <span
                      className={`inv-diff ${
                        i.diff < 0 ? "is-short" : i.diff > 0 ? "is-over" : "is-zero"
                      }`}
                    >
                      {i.diff > 0 ? `+${i.diff}` : i.diff}
                    </span>
                    {i.note && <span className="inv-detail-note">{i.note}</span>}
                  </div>
                ))
              )}
            </div>

            <div className="inv-actions">
              <button type="button" className="inv-btn is-ghost" onClick={exportDetail}>
                CSV出力
              </button>
              <button type="button" className="inv-btn is-primary" onClick={() => setDetail(null)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
