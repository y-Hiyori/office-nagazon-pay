// src/lib/excelExport.ts
// ブラウザで「スタイル付き・数式入り」Excel（.xlsx）を生成してダウンロードするヘルパー
// 依存: public/vendor/xlsx.full.min.js（SheetJS）を動的ロード
// 特徴
//  - 列幅を「全角文字＝2幅」で自動計算（文字の重なりを防止）
//  - 太めの罫線・ヘッダー背景・中央揃え・金額書式
//  - 利益は「=売上-クーポン-ポイント」のセル数式（Excel側で計算）
//  - 商品別売上シート内に棒グラフ＋クーポン/ポイント金額列
//  - 期間比較（前日/前週/前月/前年）シートを自動生成
// ※ データは外部に送信されません。すべてブラウザ内で処理します

type XlsxApi = any;

let xlsxPromise: Promise<XlsxApi> | null = null;

function loadXLSX(): Promise<XlsxApi> {
  const w = window as any;
  if (w?.XLSX) return Promise.resolve(w.XLSX);
  if (xlsxPromise) return xlsxPromise;

  xlsxPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/xlsx.full.min.js";
    script.async = true;
    script.onload = () => resolve((window as any).XLSX);
    script.onerror = () => {
      xlsxPromise = null;
      reject(new Error("EXCEL_LIB_LOAD_FAILED"));
    };
    document.head.appendChild(script);
  });

  return xlsxPromise;
}

// ===================== スタイル定数 =====================
const MED = { style: "medium", color: { rgb: "94A3B8" } } as const;
const BORDER = { top: MED, left: MED, bottom: MED, right: MED } as const;

const TITLE_BG = "312E81";
const HEADER_BG = "4338CA";
const HEADER_FONT = "FFFFFF";
const ZEBRA_BG = "F1F5F9";
const BAR_COLOR = "4F46E5";
const BAR_MAX_COLOR = "F97316";
const BAR_PREV_COLOR = "CBD5E1";
const NOTE_COLOR = "64748B";
const PROFIT_BG = "DCFCE7"; // 利益行の背景（緑）

const YEN = "¥#,##0";
const COUNT = "#,##0";

type Align = "left" | "center" | "right";

// 全角文字を2幅としてカウント
function cellW(s: unknown): number {
  let w = 0;
  for (const ch of String(s ?? "")) {
    const code = ch.codePointAt(0) ?? 0;
    w += code > 0x2e7f ? 2 : 1;
  }
  return w;
}

function encode(XLSX: XlsxApi, r: number, c: number) {
  return XLSX.utils.encode_cell({ r, c });
}

function applyCell(ws: any, addr: string, style: Record<string, unknown>) {
  if (!ws[addr]) ws[addr] = { t: "s", v: "" };
  if (!ws[addr].s) ws[addr].s = {};
  for (const [k, v] of Object.entries(style)) {
    if (v !== undefined) ws[addr].s[k] = v;
  }
}

// ===================== 汎用スタイル付きシート =====================
type StyledOptions = {
  title?: string;
  headers: string[];
  rows: unknown[][][] | unknown[][]; // 値を渡す（数式は formulas で上書き）
  rowFormats?: (string | null)[][];
  align?: Align[];
  note?: string[];
  freeze?: boolean;
  // 数式: { addr: "B8", f: "=B5-B6-B7", v: 1234, profit?: true }
  formulas?: { addr: string; f: string; v: number; highlight?: boolean }[];
  // 列幅の手動指定（省略時は自動計算。棒グラフ用に狭い列を使いたいとき用）
  widths?: number[];
  // データ行のセルを中央揃えにする列（ヘッダーは常に中央）
  centerCols?: number[];
  // フッター行（合計など）。values の文字列が "=" で始まる場合は数式として書き込む
  footerRows?: { values: (string | number)[]; formats?: (string | null)[] }[];
};

function styledSheet(XLSX: XlsxApi, opts: StyledOptions): any {
  const { title, headers, rows, rowFormats, align, note, freeze, formulas, widths, centerCols, footerRows } = opts;
  const nCols = headers.length;

  const aoaRows: unknown[][] = [];
  if (title) aoaRows.push([title]);
  aoaRows.push(headers as unknown[]);
  for (const r of rows) aoaRows.push(r as unknown[]);
  if (footerRows) for (const f of footerRows) aoaRows.push([...f.values]);
  if (note) for (const n of note) aoaRows.push([n] as unknown[]);

  const ws = XLSX.utils.aoa_to_sheet(aoaRows);

  // --- 列幅（自動計算：全角2幅 + 余白。手動指定があればそちら優先） ---
  if (widths) {
    ws["!cols"] = widths.map((w) => ({ wch: w }));
  } else {
    ws["!cols"] = headers.map((h, c) => {
      let maxLen = cellW(h);
      for (const r of rows) {
        const cell = (r as unknown[])[c];
        if (cell !== undefined) maxLen = Math.max(maxLen, cellW(cell));
      }
      for (const f of footerRows ?? []) {
        if (f.values[c] !== undefined) maxLen = Math.max(maxLen, cellW(f.values[c]));
      }
      return { wch: Math.max(9, Math.min(56, maxLen + 3)) };
    });
  }

  // --- 行高 ---
  const heights: { hpt: number }[] = [];
  if (title) heights.push({ hpt: 32 });
  heights.push({ hpt: 24 });
  const dataAndFooterLen = (rows as unknown[][]).length + (footerRows?.length ?? 0);
  for (let i = 0; i < dataAndFooterLen + (note ? note.length : 0); i++) heights.push({ hpt: 20 });
  ws["!rows"] = heights;

  // --- 結合 ---
  let headRow = 0;
  if (title) {
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } }];
    headRow = 1;
    applyCell(ws, encode(XLSX, 0, 0), {
      font: { name: "メイリオ", sz: 15, bold: true, color: { rgb: HEADER_FONT } },
      fill: { patternType: "solid", fgColor: { rgb: TITLE_BG } },
      alignment: { horizontal: "left", vertical: "center" },
    });
  }

  for (let c = 0; c < nCols; c++) {
    applyCell(ws, encode(XLSX, headRow, c), {
      font: { name: "メイリオ", sz: 10.5, bold: true, color: { rgb: HEADER_FONT } },
      fill: { patternType: "solid", fgColor: { rgb: HEADER_BG } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: BORDER,
    });
  }

  const centerSet = new Set(centerCols ?? []);
  for (let i = 0; i < (rows as unknown[][]).length; i++) {
    const rIdx = headRow + 1 + i;
    const zebra = i % 2 === 1;
    const fmts = rowFormats?.[i];
    for (let c = 0; c < nCols; c++) {
      const addr = encode(XLSX, rIdx, c);
      const numFmt = fmts?.[c] ?? undefined;
      let a: Align = align?.[c] ?? "left";
      if (centerSet.has(c)) a = "center";
      applyCell(ws, addr, {
        font: { name: "メイリオ", sz: 10 },
        fill: zebra ? { patternType: "solid", fgColor: { rgb: ZEBRA_BG } } : undefined,
        alignment: { horizontal: a, vertical: "center" },
        border: BORDER,
        ...(numFmt ? { numFmt } : {}),
      });
    }
  }

  // --- フッター行（合計など。数式対応） ---
  if (footerRows) {
    for (let i = 0; i < footerRows.length; i++) {
      const rIdx = headRow + 1 + (rows as unknown[][]).length + i;
      for (let c = 0; c < nCols; c++) {
        const raw = footerRows[i].values[c];
        if (raw === undefined) continue;
        const isFormula = typeof raw === "string" && raw.startsWith("=");
        const addr = encode(XLSX, rIdx, c);
        const numFmt = footerRows[i].formats?.[c] ?? undefined;
        applyCell(ws, addr, {
          font: { name: "メイリオ", sz: 10.5, bold: true },
          fill: { patternType: "solid", fgColor: { rgb: "DCE7FF" } },
          alignment: { horizontal: numFmt ? "right" : "left", vertical: "center" },
          border: {
            top: { style: "medium", color: { rgb: "94A3B8" } },
            left: MED, bottom: MED, right: MED,
          },
          ...(numFmt ? { numFmt } : {}),
        });
        if (isFormula) {
          ws[addr] = { t: "n", f: raw.slice(1), v: 0, s: ws[addr]!.s };
        }
      }
    }
  }

  // --- 数式（利益などを Excel 側で計算） ---
  if (formulas) {
    for (const f of formulas) {
      const cell = ws[f.addr];
      if (!cell) continue;
      ws[f.addr] = { t: "n", f: f.f, v: f.v, s: cell.s || {} };
      if (f.highlight) {
        ws[f.addr].s = {
          ...(ws[f.addr].s || {}),
          font: { name: "メイリオ", sz: 11, bold: true },
          fill: { patternType: "solid", fgColor: { rgb: PROFIT_BG } },
        };
      }
    }
  }

  // --- フッター（合計）の開始行より前で、注記の位置を計算 ---
  const footerCount = footerRows?.length ?? 0;
  if (note) {
    for (let i = 0; i < note.length; i++) {
      const rIdx = headRow + 1 + (rows as unknown[][]).length + footerCount + i;
      ws["!merges"] = ws["!merges"] || [];
      ws["!merges"].push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: nCols - 1 } });
      applyCell(ws, encode(XLSX, rIdx, 0), {
        font: { name: "メイリオ", sz: 9, color: { rgb: NOTE_COLOR } },
        alignment: { horizontal: "left", vertical: "center", wrapText: true },
      });
    }
  }

  if (freeze) {
    ws["!freeze"] = { xSplit: 0, ySplit: headRow + 1 };
  }

  return ws;
}

// ===================== 商品別売上シート（チャート内蔵） =====================
function productSheet(
  XLSX: XlsxApi,
  products: SalesProductData[]
): any {
  const BAR_CELLS = 18;
  const nCols = 6 + BAR_CELLS; // 項目6列 + バー18列
  const maxVal = Math.max(1, ...products.map((p) => p.subtotal_after_discount));

  const aoa: unknown[][] = [
    ["商品別売上（クーポン・ポイントの金額込み・棒は売上比較）"],
    ["商品名", "数量", "売上(割引前・円)", "売上(割引後・円)", "クーポン割引(円)", "ポイント充当(円)", "売上比較 ▶", ...Array.from({ length: BAR_CELLS - 1 }, () => "")],
  ];
  for (const p of products) {
    aoa.push([
      p.product_name, p.quantity, p.subtotal_raw, p.subtotal_after_discount,
      p.couponYen, p.pointsYen,
      ...Array.from({ length: BAR_CELLS }, () => ""),
    ]);
  }
  // 合計行（数式）
  aoa.push([
    "合計", `=SUM(B3:B${products.length + 2})`, `=SUM(C3:C${products.length + 2})`,
    `=SUM(D3:D${products.length + 2})`, `=SUM(E3:E${products.length + 2})`, `=SUM(F3:F${products.length + 2})`,
    ...Array.from({ length: BAR_CELLS }, () => ""),
  ]);
  aoa.push(["※ 売上（割引後）＝クーポン・ポイントの割引を商品比率で按分した金額。棒の長さ＝売上比較（最大の商品はオレンジ）。"]);
  aoa.push(["※ 商品に原価（cost）を登録すると、この列に粗利も自動追加できます（推奨機能）。"]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 列幅
  const widths = [42, 10, 16, 16, 16, 16, ...Array.from({ length: BAR_CELLS }, () => 1.8)];
  ws["!cols"] = widths.map((w) => ({ wch: w }));
  ws["!rows"] = [{ hpt: 32 }, { hpt: 24 }, ...Array.from({ length: products.length + 1 }, () => ({ hpt: 20 })), { hpt: 16 }, { hpt: 16 }];

  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } }];
  applyCell(ws, encode(XLSX, 0, 0), {
    font: { name: "メイリオ", sz: 15, bold: true, color: { rgb: HEADER_FONT } },
    fill: { patternType: "solid", fgColor: { rgb: TITLE_BG } },
    alignment: { horizontal: "left", vertical: "center" },
  });

  for (let c = 0; c < nCols; c++) {
    applyCell(ws, encode(XLSX, 1, c), {
      font: { name: "メイリオ", sz: 10.5, bold: true, color: { rgb: HEADER_FONT } },
      fill: { patternType: "solid", fgColor: { rgb: HEADER_BG } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: BORDER,
    });
  }

  for (let i = 0; i < products.length; i++) {
    const rIdx = 2 + i;
    const p = products[i];
    const isMax = p.subtotal_after_discount >= maxVal && maxVal > 1;
    const cells = Math.max(p.subtotal_after_discount > 0 ? 1 : 0, Math.round((p.subtotal_after_discount / maxVal) * BAR_CELLS));
    const barColor = isMax ? BAR_MAX_COLOR : BAR_COLOR;

    const fmts: (string | null)[] = [null, COUNT, YEN, YEN, YEN, YEN];
    const aligns: Align[] = ["left", "center", "right", "right", "right", "right"];

    for (let c = 0; c < 6; c++) {
      const rCur = rIdx;
      applyCell(ws, encode(XLSX, rCur, c), {
        font: { name: "メイリオ", sz: 10, ...(c === 3 ? { bold: true } : {}) },
        fill: i % 2 === 1 ? { patternType: "solid", fgColor: { rgb: ZEBRA_BG } } : undefined,
        alignment: { horizontal: aligns[c], vertical: "center" },
        border: BORDER,
        ...(fmts[c] ? { numFmt: fmts[c] } : {}),
      });
    }

    for (let b = 0; b < BAR_CELLS; b++) {
      const addr = encode(XLSX, rIdx, 6 + b);
      if (b < cells) {
        applyCell(ws, addr, {
          fill: { patternType: "solid", fgColor: { rgb: barColor } },
        });
      }
    }
  }

  // 合計行スタイル（数式セル）
  const totalRIdx = 2 + products.length;
  for (let c = 0; c < 6; c++) {
    applyCell(ws, encode(XLSX, totalRIdx, c), {
      font: { name: "メイリオ", sz: 10.5, bold: true },
      fill: { patternType: "solid", fgColor: { rgb: "DCE7FF" } },
      alignment: { horizontal: c === 0 ? "left" : "right", vertical: "center" },
      border: {
        top: { style: "medium", color: { rgb: "94A3B8" } },
        left: MED, bottom: MED, right: MED,
      },
      ...(["B", "C", "D", "E", "F"].includes(String.fromCharCode(65 + c)) ? { numFmt: c === 1 ? COUNT : YEN } : {}),
    });
    const cellAddr = encode(XLSX, totalRIdx, c);
    if (c >= 1 && c <= 5) {
      const col = String.fromCharCode(65 + c);
      ws[cellAddr] = {
        t: "n",
        f: `SUM(${col}3:${col}${products.length + 2})`,
        v: 0,
        s: ws[cellAddr]!.s,
      };
    }
  }

  // 注記（合計行の後・products.length+1行目から）
  for (let i = 0; i < 2; i++) {
    const rIdx = 2 + products.length + 1 + i;
    ws["!merges"] = ws["!merges"] || [];
    ws["!merges"].push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: nCols - 1 } });
    applyCell(ws, encode(XLSX, rIdx, 0), {
      font: { name: "メイリオ", sz: 9, color: { rgb: NOTE_COLOR } },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
    });
  }

  if (products.length > 0) {
    ws["!freeze"] = { xSplit: 6, ySplit: 2 };
  }

  return ws;
}

// ===================== 期間比較シート（前日/前週/前月/前年） =====================
function compareSheet(
  XLSX: XlsxApi,
  currentLabel: string,
  _prevLabel: string,
  prev: PrevData | null
): any {
  const BAR_CELLS = 16;
  const nCols = 5 + BAR_CELLS;

  const rowsDef: { label: string; cur: number; prevv: number; fmt: string | null }[] = [
    { label: "利益（入金売上）", cur: prev?.current?.cashSales ?? 0, prevv: prev?.previous?.cashSales ?? 0, fmt: YEN },
    { label: "注文件数", cur: prev?.current?.orderCount ?? 0, prevv: prev?.previous?.orderCount ?? 0, fmt: COUNT },
    { label: "商品売上（割引前）", cur: prev?.current?.grossSubtotal ?? 0, prevv: prev?.previous?.grossSubtotal ?? 0, fmt: YEN },
  ];
  const maxVal = Math.max(1, ...rowsDef.flatMap((r) => [r.cur, r.prevv]));

  const title =
    prev && prev.label
      ? `期間比較（${currentLabel} vs ${prev.label}）`
      : `期間比較（${currentLabel}）`;

  const aoa: unknown[][] = [[title], ["指標", "今期", "前期", "増減", "増減率", "売上棒（今期=紺 / 前期=灰）", ...Array.from({ length: BAR_CELLS - 1 }, () => "")]];

  for (const { label, cur, prevv } of rowsDef) {
    const diff = cur - prevv;
    const rate = prevv !== 0 ? Math.round((diff / Math.abs(prevv)) * 100) : cur > 0 ? 100 : 0;
    aoa.push([label, cur, prevv, diff, `${rate > 0 ? "+" : ""}${rate}%`, ...Array.from({ length: BAR_CELLS }, () => "")]);
    aoa.push(["  （前期）", "", prevv, "", "", ...Array.from({ length: BAR_CELLS }, () => "")]);
  }
  aoa.push(["※ 今期の値を紺色、前期の値を灰色の棒で表示。増減率は前期比（%）です。"]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [24, 16, 16, 16, 14, ...Array.from({ length: BAR_CELLS }, () => 2)];
  ws["!rows"] = [{ hpt: 32 }, { hpt: 24 }, ...Array.from({ length: rowsDef.length * 2 }, () => ({ hpt: 18 })), { hpt: 16 }];

  // タイトル
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } }];
  applyCell(ws, encode(XLSX, 0, 0), {
    font: { name: "メイリオ", sz: 14, bold: true, color: { rgb: HEADER_FONT } },
    fill: { patternType: "solid", fgColor: { rgb: TITLE_BG } },
    alignment: { horizontal: "left", vertical: "center" },
  });

  // ヘッダー
  for (let c = 0; c < nCols; c++) {
    applyCell(ws, encode(XLSX, 1, c), {
      font: { name: "メイリオ", sz: 10.5, bold: true, color: { rgb: HEADER_FONT } },
      fill: { patternType: "solid", fgColor: { rgb: HEADER_BG } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: BORDER,
    });
  }

  // データ行＋バー
  for (let i = 0; i < rowsDef.length; i++) {
    const { cur, prevv, fmt } = rowsDef[i];
    const curRowIdx = 2 + i * 2;
    const prevRowIdx = curRowIdx + 1;

    const cellsCur = Math.max(cur > 0 ? 1 : 0, Math.round((cur / maxVal) * BAR_CELLS));
    const cellsPrev = Math.max(prevv > 0 ? 1 : 0, Math.round((prevv / maxVal) * BAR_CELLS));

    for (let c = 0; c < 5; c++) {
      applyCell(ws, encode(XLSX, curRowIdx, c), {
        font: { name: "メイリオ", sz: 10, bold: c === 0 },
        numFmt: c >= 1 && c <= 3 ? (fmt ?? COUNT) : undefined,
        alignment: { horizontal: c === 0 ? "left" : "right", vertical: "center" },
        border: BORDER,
      });
      applyCell(ws, encode(XLSX, prevRowIdx, c), {
        font: { name: "メイリオ", sz: 9.5, color: { rgb: "475569" } },
        numFmt: c === 2 ? (fmt ?? COUNT) : undefined,
        alignment: { horizontal: c === 0 ? "left" : "right", vertical: "center" },
        border: BORDER,
      });
    }

    // ✅ 増減（D列）と増減率（E列）を Excel 数式にする
    const diff = cur - prevv;
    const rate = (prevv !== 0 ? diff / Math.abs(prevv) : cur > 0 ? 1 : 0);
    const addrD = encode(XLSX, curRowIdx, 3);
    ws[addrD] = {
      t: "n",
      f: `C${curRowIdx}-B${curRowIdx}`,
      v: diff,
      s: { ...(ws[addrD]?.s || {}), numFmt: YEN, font: { name: "メイリオ", sz: 10, color: { rgb: diff < 0 ? "B45309" : "166534" }, bold: true }, alignment: { horizontal: "right", vertical: "center" }, border: BORDER },
    };
    const addrE = encode(XLSX, curRowIdx, 4);
    ws[addrE] = {
      t: "n",
      f: `IF(B${curRowIdx}=0,0,D${curRowIdx}/B${curRowIdx})`,
      v: Math.round(rate * 1000) / 1000,
      s: { ...(ws[addrE]?.s || {}), numFmt: "0.0%", font: { name: "メイリオ", sz: 10, bold: true }, alignment: { horizontal: "right", vertical: "center" }, border: BORDER },
    };

    for (let b = 0; b < BAR_CELLS; b++) {
      if (b < cellsCur) {
        applyCell(ws, encode(XLSX, curRowIdx, 5 + b), { fill: { patternType: "solid", fgColor: { rgb: BAR_COLOR } } });
      }
      if (b < cellsPrev) {
        applyCell(ws, encode(XLSX, prevRowIdx, 5 + b), { fill: { patternType: "solid", fgColor: { rgb: BAR_PREV_COLOR } } });
      }
    }
  }

  // 注記
  const noteR = 2 + rowsDef.length * 2;
  ws["!merges"].push({ s: { r: noteR, c: 0 }, e: { r: noteR, c: nCols - 1 } });
  applyCell(ws, encode(XLSX, noteR, 0), {
    font: { name: "メイリオ", sz: 9, color: { rgb: NOTE_COLOR } },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
  });

  return ws;
}

// ===================== データ型 =====================
export type SalesSummaryData = {
  cashSales: number; // 利益（入金売上）
  orderCount: number;
  grossSubtotal: number;
  couponDiscount: number;
  pointsTotal: number;
  couponOrderCount: number;
  pointsOrderCount: number;
};

export type SalesProductData = {
  product_name: string;
  quantity: number;
  subtotal_raw: number;
  subtotal_after_discount: number;
  coupon_orders_count: number;
  points_orders_count: number;
  couponYen: number; // この商品に按分されたクーポン割引額
  pointsYen: number; // この商品に按分されたポイント充当額
};

export type SalesOrderData = {
  id: string;
  created_at: string | null;
  name: string;
  email: string;
  payment_method: string;
  itemsText: string;
  subtotal: number;
  couponCode: string;
  coupon: number;
  points: number;
  total: number;
};

export type SalesRangeData = {
  label: string;
  nowJst: string;
};

export type PrevData = {
  label: string; // 前月 / 前週 / 前日 / 前年
  current: { cashSales: number; orderCount: number; grossSubtotal: number };
  previous: { cashSales: number; orderCount: number; grossSubtotal: number };
};

export async function exportSalesXlsx(
  range: SalesRangeData,
  summary: SalesSummaryData,
  prev: PrevData | null,
  products: SalesProductData[],
  orders: SalesOrderData[]
): Promise<void> {
  const XLSX = await loadXLSX();
  const labelSafe = range.label.replace(/[\\/:*?"<>|～~]/g, "_");
  const fileName = `OFFICE NAGAZON売上_${labelSafe}.xlsx`;

  const wb = XLSX.utils.book_new();

  // ===== シート1: 売上サマリー（利益は Excel 数式） =====
  const summaryWs = styledSheet(XLSX, {
    title: "OFFICE NAGAZON 売上状況レポート",
    headers: ["項目", "金額", "備考"],
    rows: [
      ["対象期間", range.label, "–"],
      ["出力日時", range.nowJst, "–"],
      ["商品売上（割引前）", summary.grossSubtotal, "クーポン・ポイント適用前の合計"],
      ["クーポン割引", summary.couponDiscount, `${summary.couponOrderCount} 件で使用（引く）`],
      ["ポイント充当", summary.pointsTotal, `${summary.pointsOrderCount} 件で使用（引く）`],
      ["利益（入金売上）", summary.cashSales, "＝ 商品売上 − クーポン割引 − ポイント充当"],
      ["注文件数", summary.orderCount, "支払い完了した注文の数"],
    ],
    rowFormats: [
      [null, null, null],
      [null, null, null],
      [null, YEN, null],
      [null, YEN, null],
      [null, YEN, null],
      [null, YEN, null],
      [null, COUNT, null],
    ],
    align: ["left", "right", "left"],
    // 利益セル（B7）を数式にする：
    // 行2=対象期間,行3=出力日時,行4=商品売上,行5=クーポン,行6=ポイント,行7=利益,行8=注文件数
    formulas: [
      { addr: "B7", f: "=B4-B5-B6", v: summary.cashSales, highlight: true },
    ],
    centerCols: [],
    note: [
      "利益 ＝ 入金売上 ＝ お客様から実際にいただいた金額",
      "　（利益セルは計算式 =B5-B6-B7 です。Excel側で自動計算しています）",
      "※ 商品に原価（cost）を登録すると、利益＝入金売上−原価 の粗利表示に自動アップグレードできます（推奨機能）。",
      "※ ポイント充当額は売上・利益に含めません（お客様に付与したポイントで支払われた分のため）。",
    ],
    freeze: true,
  });
  XLSX.utils.book_append_sheet(wb, summaryWs, "売上サマリー");

  // ===== シート2: 商品別売上（チャート＋金額内蔵） =====
  const productWs = productSheet(XLSX, products);
  XLSX.utils.book_append_sheet(wb, productWs, "商品別売上");

  // ===== シート3: 期間比較（前日/前週/前月/前年） =====
  const compareWs = compareSheet(XLSX, range.label, prev?.label ?? "", prev);
  XLSX.utils.book_append_sheet(wb, compareWs, "期間比較");

  // ===== シート4: 注文一覧 =====
  const orderHeaders = [
    "注文ID", "注文日時", "購入者名", "メール", "支払方法", "商品内訳",
    "小計(円)", "クーポンコード", "クーポン割引(円)", "ポイント充当(円)", "入金額(円)",
  ];
  const orderWs = styledSheet(XLSX, {
    title: "注文一覧",
    headers: orderHeaders,
    rows: orders.map((o) => [
      o.id, o.created_at, o.name, o.email, o.payment_method, o.itemsText,
      o.subtotal, o.couponCode, o.coupon, o.points, o.total,
    ]),
    rowFormats: orders.map(() => [null, null, null, null, null, null, YEN, null, YEN, YEN, YEN]),
    align: ["left", "left", "left", "left", "center", "left", "right", "left", "right", "right", "right"],
    freeze: true,
    footerRows: [
      {
        values: [
          "合計", "", "", "", "", "",
          `=SUM(G${2 + 2}:G${orders.length + 2})`,
          "",
          `=SUM(I${2 + 2}:I${orders.length + 2})`,
          `=SUM(J${2 + 2}:J${orders.length + 2})`,
          `=SUM(K${2 + 2}:K${orders.length + 2})`,
        ],
        formats: [null, null, null, null, null, null, YEN, null, YEN, YEN, YEN],
      },
    ],
  });
  XLSX.utils.book_append_sheet(wb, orderWs, "注文一覧");

  XLSX.writeFile(wb, fileName);
}

export { loadXLSX };
