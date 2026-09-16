// src/lib/excelExport.ts
// ブラウザで「スタイル付き・数式入り」Excel（.xlsx）を生成してダウンロードするヘルパー
// 依存: public/vendor/xlsx.full.min.js（SheetJS）を動的ロード
// 特徴
//  - 列幅を「全角文字＝2幅」で自動計算
//  - 太めの罫線・ヘッダー背景・中央揃え・金額/率書式
//  - 売上サマリーは数式で自動計算（入金売上・平均注文単価・粗利・粗利率）
//  - 商品別売上は 売価・原価・数量・売上・利益・利益率 を表形式で出力
//  - サーバー版が使えない時のフォールバックとしてブラウザ内で完結

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

const MED = { style: "medium", color: { rgb: "94A3B8" } } as const;
const BORDER = { top: MED, left: MED, bottom: MED, right: MED } as const;

const TITLE_BG = "312E81";
const HEADER_BG = "4338CA";
const HEADER_FONT = "FFFFFF";
const ZEBRA_BG = "F1F5F9";
const NOTE_COLOR = "64748B";
const PROFIT_BG = "DCFCE7";
const TOTAL_BG = "DCE7FF";
const LOSS_FONT = "B91C1C";
const PROFIT_FONT = "166534";
const BAR_COLOR = "4F46E5";
const PROFIT_BAR_COLOR = "059669";
const BAR_EMPTY = "E2E8F0";

const YEN = "¥#,##0";
const COUNT = "#,##0";
const PCT = "0.0%";

type Align = "left" | "center" | "right";

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

type FormulaCell = { addr: string; f: string; v: number; highlight?: boolean; numFmt?: string };

type StyledOptions = {
  title?: string;
  headers: string[];
  rows: unknown[][];
  rowFormats?: (string | null)[][];
  align?: Align[];
  note?: string[];
  freeze?: boolean;
  formulas?: FormulaCell[];
  widths?: number[];
  centerCols?: number[];
  footerRows?: { values: (string | number)[]; formats?: (string | null)[] }[];
};

function styledSheet(XLSX: XlsxApi, opts: StyledOptions): any {
  const { title, headers, rows, rowFormats, align, note, freeze, formulas, widths, centerCols, footerRows } = opts;
  const nCols = headers.length;

  const aoaRows: unknown[][] = [];
  if (title) aoaRows.push([title]);
  aoaRows.push(headers as unknown[]);
  for (const r of rows) aoaRows.push(r);
  if (footerRows) for (const f of footerRows) aoaRows.push([...f.values]);
  if (note) for (const n of note) aoaRows.push([n]);

  const ws = XLSX.utils.aoa_to_sheet(aoaRows);

  if (widths) {
    ws["!cols"] = widths.map((w) => ({ wch: w }));
  } else {
    ws["!cols"] = headers.map((h, c) => {
      let maxLen = cellW(h);
      for (const r of rows) {
        const cell = r[c];
        if (cell !== undefined) maxLen = Math.max(maxLen, cellW(cell));
      }
      for (const f of footerRows ?? []) {
        if (f.values[c] !== undefined) maxLen = Math.max(maxLen, cellW(f.values[c]));
      }
      return { wch: Math.max(10, Math.min(56, maxLen + 3)) };
    });
  }

  const heights: { hpt: number }[] = [];
  if (title) heights.push({ hpt: 32 });
  heights.push({ hpt: 24 });
  const dataAndFooterLen = rows.length + (footerRows?.length ?? 0);
  for (let i = 0; i < dataAndFooterLen + (note ? note.length : 0); i++) heights.push({ hpt: 20 });
  ws["!rows"] = heights;

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
  for (let i = 0; i < rows.length; i++) {
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
        alignment: { horizontal: a, vertical: "center", wrapText: true },
        border: BORDER,
        ...(numFmt ? { numFmt } : {}),
      });
    }
  }

  if (footerRows) {
    for (let i = 0; i < footerRows.length; i++) {
      const rIdx = headRow + 1 + rows.length + i;
      for (let c = 0; c < nCols; c++) {
        const raw = footerRows[i].values[c];
        if (raw === undefined) continue;
        const isFormula = typeof raw === "string" && raw.startsWith("=");
        const addr = encode(XLSX, rIdx, c);
        const numFmt = footerRows[i].formats?.[c] ?? undefined;
        applyCell(ws, addr, {
          font: { name: "メイリオ", sz: 10.5, bold: true },
          fill: { patternType: "solid", fgColor: { rgb: TOTAL_BG } },
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

  if (formulas) {
    for (const f of formulas) {
      const base = ws[f.addr] || { t: "n", v: f.v, s: {} };
      ws[f.addr] = { t: "n", f: f.f.replace(/^=/, ""), v: f.v, s: base.s || {} };
      if (f.numFmt) ws[f.addr].s.numFmt = f.numFmt;
      if (f.highlight) {
        ws[f.addr].s = {
          ...(ws[f.addr].s || {}),
          font: { name: "メイリオ", sz: 11, bold: true },
          fill: { patternType: "solid", fgColor: { rgb: PROFIT_BG } },
        };
      }
    }
  }

  const footerCount = footerRows?.length ?? 0;
  if (note) {
    for (let i = 0; i < note.length; i++) {
      const rIdx = headRow + 1 + rows.length + footerCount + i;
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

export type SalesSummaryData = {
  cashSales: number;
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
  avg_unit_price: number;
  subtotal_raw: number;
  subtotal_after_discount: number;
  coupon_orders_count: number;
  points_orders_count: number;
  couponYen: number;
  pointsYen: number;
  cost_per_unit: number;
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
  label: string;
  current: { cashSales: number; orderCount: number; grossSubtotal: number };
  previous: { cashSales: number; orderCount: number; grossSubtotal: number };
};

function productSheet(XLSX: XlsxApi, products: SalesProductData[]): { ws: any; totalRowNumber: number } {
  const BAR_CELLS = 12;
  const nCols = 11 + BAR_CELLS * 2;
  const maxSales = Math.max(1, ...products.map((p) => p.subtotal_after_discount));
  const maxProfit = Math.max(1, ...products.map((p) => Math.max(0, p.subtotal_after_discount - p.cost_per_unit * p.quantity)));

  const aoa: unknown[][] = [["商品別売上（売価・原価・数量・売上・利益）"]];
  aoa.push([
    "商品名",
    "売価(平均・円)",
    "原価/個(円)",
    "数量",
    "売上計算(円)",
    "売上(割引後・円)",
    "クーポン割引(円)",
    "ポイント充当(円)",
    "原価計(円)",
    "商品別利益(円)",
    "利益率",
    "売上棒 ▶",
    ...Array.from({ length: BAR_CELLS - 1 }, () => ""),
    "利益棒 ▶",
    ...Array.from({ length: BAR_CELLS - 1 }, () => ""),
  ]);

  for (const p of products) {
    aoa.push([
      p.product_name,
      p.avg_unit_price,
      p.cost_per_unit,
      p.quantity,
      p.subtotal_raw,
      p.subtotal_after_discount,
      p.couponYen,
      p.pointsYen,
      p.cost_per_unit * p.quantity,
      p.subtotal_after_discount - p.cost_per_unit * p.quantity,
      p.subtotal_after_discount > 0
        ? (p.subtotal_after_discount - p.cost_per_unit * p.quantity) / p.subtotal_after_discount
        : 0,
      ...Array.from({ length: BAR_CELLS * 2 }, () => ""),
    ]);
  }

  aoa.push([
    "合計", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ...Array.from({ length: BAR_CELLS * 2 }, () => ""),
  ]);
  aoa.push(["※ 原価が未登録の商品は 0 円として計算しています。正しい粗利を見るには商品編集で原価を入れてください。"]);
  aoa.push(["※ 売上計算＝売価(平均)×数量、商品別利益＝売上(割引後)−原価計、利益率＝商品別利益÷売上(割引後) です。"]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [32, 14, 14, 9, 14, 15, 13, 13, 14, 15, 11, ...Array.from({ length: BAR_CELLS * 2 }, () => 2.1)].map((w) => ({ wch: w }));
  ws["!rows"] = [{ hpt: 32 }, { hpt: 26 }, ...Array.from({ length: products.length + 1 }, () => ({ hpt: 20 })), { hpt: 16 }, { hpt: 16 }];
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
    const rowIdx = 2 + i;
    const p = products[i];
    const profit = p.subtotal_after_discount - p.cost_per_unit * p.quantity;
    const salesCells = Math.max(p.subtotal_after_discount > 0 ? 1 : 0, Math.round((p.subtotal_after_discount / maxSales) * BAR_CELLS));
    const profitCells = Math.max(profit > 0 ? 1 : 0, Math.round((Math.max(0, profit) / maxProfit) * BAR_CELLS));

    for (let c = 0; c < 11; c++) {
      const fmt = c === 3 ? COUNT : c === 10 ? PCT : c >= 1 ? YEN : undefined;
      const align: Align = c === 0 ? "left" : c === 3 ? "center" : "right";
      applyCell(ws, encode(XLSX, rowIdx, c), {
        font: {
          name: "メイリオ",
          sz: 10,
          ...(c === 9 ? { bold: true, color: { rgb: profit < 0 ? LOSS_FONT : PROFIT_FONT } } : {}),
        },
        fill: i % 2 === 1 ? { patternType: "solid", fgColor: { rgb: ZEBRA_BG } } : undefined,
        alignment: { horizontal: align, vertical: "center" },
        border: BORDER,
        ...(fmt ? { numFmt: fmt } : {}),
      });
    }

    ws[encode(XLSX, rowIdx, 4)] = {
      t: "n",
      f: `B${rowIdx + 1}*D${rowIdx + 1}`,
      v: p.subtotal_raw,
      s: ws[encode(XLSX, rowIdx, 4)]?.s,
    };
    ws[encode(XLSX, rowIdx, 8)] = {
      t: "n",
      f: `C${rowIdx + 1}*D${rowIdx + 1}`,
      v: p.cost_per_unit * p.quantity,
      s: ws[encode(XLSX, rowIdx, 8)]?.s,
    };
    ws[encode(XLSX, rowIdx, 9)] = {
      t: "n",
      f: `F${rowIdx + 1}-I${rowIdx + 1}`,
      v: profit,
      s: ws[encode(XLSX, rowIdx, 9)]?.s,
    };
    ws[encode(XLSX, rowIdx, 10)] = {
      t: "n",
      f: `IF(F${rowIdx + 1}=0,0,J${rowIdx + 1}/F${rowIdx + 1})`,
      v: p.subtotal_after_discount > 0 ? profit / p.subtotal_after_discount : 0,
      s: ws[encode(XLSX, rowIdx, 10)]?.s,
    };

    for (let b = 0; b < BAR_CELLS; b++) {
      applyCell(ws, encode(XLSX, rowIdx, 11 + b), {
        fill: { patternType: "solid", fgColor: { rgb: b < salesCells ? BAR_COLOR : BAR_EMPTY } },
        border: BORDER,
      });
      applyCell(ws, encode(XLSX, rowIdx, 11 + BAR_CELLS + b), {
        fill: { patternType: "solid", fgColor: { rgb: b < profitCells ? PROFIT_BAR_COLOR : BAR_EMPTY } },
        border: BORDER,
      });
    }
  }

  const totalRowIdx = 2 + products.length;
  for (let c = 0; c < 11; c++) {
    const addr = encode(XLSX, totalRowIdx, c);
    applyCell(ws, addr, {
      font: { name: "メイリオ", sz: 10.5, bold: true },
      fill: { patternType: "solid", fgColor: { rgb: TOTAL_BG } },
      alignment: { horizontal: c === 0 ? "left" : c === 3 ? "center" : "right", vertical: "center" },
      border: {
        top: { style: "medium", color: { rgb: "94A3B8" } },
        left: MED, bottom: MED, right: MED,
      },
      ...(c === 3 ? { numFmt: COUNT } : c === 10 ? { numFmt: PCT } : c >= 1 ? { numFmt: YEN } : {}),
    });
  }

  const lastDataRow = products.length + 2;
  const setFormula = (colIdx: number, f: string, v = 0) => {
    const addr = encode(XLSX, totalRowIdx, colIdx);
    ws[addr] = { t: "n", f, v, s: ws[addr]?.s };
  };

  setFormula(1, `IF(D${totalRowIdx + 1}=0,0,E${totalRowIdx + 1}/D${totalRowIdx + 1})`);
  setFormula(2, `IF(D${totalRowIdx + 1}=0,0,I${totalRowIdx + 1}/D${totalRowIdx + 1})`);
  setFormula(3, `SUM(D3:D${lastDataRow})`);
  setFormula(4, `SUM(E3:E${lastDataRow})`);
  setFormula(5, `SUM(F3:F${lastDataRow})`);
  setFormula(6, `SUM(G3:G${lastDataRow})`);
  setFormula(7, `SUM(H3:H${lastDataRow})`);
  setFormula(8, `SUM(I3:I${lastDataRow})`);
  setFormula(9, `SUM(J3:J${lastDataRow})`);
  setFormula(10, `IF(F${totalRowIdx + 1}=0,0,J${totalRowIdx + 1}/F${totalRowIdx + 1})`);

  for (let c = 11; c < nCols; c++) {
    applyCell(ws, encode(XLSX, totalRowIdx, c), {
      fill: { patternType: "solid", fgColor: { rgb: TOTAL_BG } },
      border: {
        top: { style: "medium", color: { rgb: "94A3B8" } },
        left: MED, bottom: MED, right: MED,
      },
    });
  }

  for (let i = 0; i < 2; i++) {
    const rIdx = totalRowIdx + 1 + i;
    ws["!merges"].push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: nCols - 1 } });
    applyCell(ws, encode(XLSX, rIdx, 0), {
      font: { name: "メイリオ", sz: 9, color: { rgb: NOTE_COLOR } },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
    });
  }

  ws["!freeze"] = { xSplit: 0, ySplit: 2 };
  return { ws, totalRowNumber: totalRowIdx + 1 };
}

function summarySheet(
  XLSX: XlsxApi,
  range: SalesRangeData,
  summary: SalesSummaryData,
  productTotalRowNumber: number
): any {
  const rows: unknown[][] = [
    ["対象期間", range.label, "集計対象の期間"],
    ["出力日時", range.nowJst, "Excelを出力した日時"],
    ["商品売上（割引前）", summary.grossSubtotal, "商品単価 × 数量 の合計"],
    ["クーポン割引", summary.couponDiscount, `${summary.couponOrderCount} 件で使用（引く）`],
    ["ポイント充当", summary.pointsTotal, `${summary.pointsOrderCount} 件で使用（引く）`],
    ["入金売上", summary.cashSales, "＝ 商品売上 − クーポン割引 − ポイント充当"],
    ["注文件数", summary.orderCount, "支払い完了した注文数"],
    ["平均注文単価", summary.orderCount > 0 ? Math.round(summary.cashSales / summary.orderCount) : 0, "＝ 入金売上 ÷ 注文件数"],
    ["販売個数", 0, "＝ 商品別売上シートの数量合計"],
    ["推定原価合計", 0, "＝ 商品別売上シートの原価計合計"],
    ["粗利", 0, "＝ 入金売上 − 推定原価合計"],
    ["粗利率", 0, "＝ 粗利 ÷ 入金売上"],
  ];

  return styledSheet(XLSX, {
    title: "OFFICE NAGAZON 売上状況レポート",
    headers: ["項目", "値", "説明"],
    rows,
    rowFormats: [
      [null, null, null],
      [null, null, null],
      [null, YEN, null],
      [null, YEN, null],
      [null, YEN, null],
      [null, YEN, null],
      [null, COUNT, null],
      [null, YEN, null],
      [null, COUNT, null],
      [null, YEN, null],
      [null, YEN, null],
      [null, PCT, null],
    ],
    align: ["left", "right", "left"],
    formulas: [
      { addr: "B8", f: "B5-B6-B7", v: summary.cashSales, highlight: true, numFmt: YEN },
      { addr: "B10", f: "IF(B9=0,0,B8/B9)", v: summary.orderCount > 0 ? summary.cashSales / summary.orderCount : 0, numFmt: YEN },
      { addr: "B11", f: `'商品別売上'!D${productTotalRowNumber}`, v: 0, numFmt: COUNT },
      { addr: "B12", f: `'商品別売上'!I${productTotalRowNumber}`, v: 0, numFmt: YEN },
      { addr: "B13", f: "B8-B12", v: 0, highlight: true, numFmt: YEN },
      { addr: "B14", f: "IF(B8=0,0,B13/B8)", v: 0, numFmt: PCT },
    ],
    widths: [26, 18, 52],
    note: [
      "入金売上 ＝ お客様から実際にいただいた金額です。",
      "粗利は『入金売上 − 商品原価』で計算しています。原価未登録の商品は 0 円扱いです。",
      "商品別売上シートでは、売価・原価・数量・売上・利益・利益率をすべて表形式で確認できます。",
    ],
    freeze: true,
  });
}

function compareSheet(XLSX: XlsxApi, currentLabel: string, prev: PrevData | null): any {
  const prevLabel = prev?.label ?? "前期";
  const rows = [
    ["入金売上", prev?.current?.cashSales ?? 0, prev?.previous?.cashSales ?? 0, 0, 0],
    ["注文件数", prev?.current?.orderCount ?? 0, prev?.previous?.orderCount ?? 0, 0, 0],
    ["商品売上（割引前）", prev?.current?.grossSubtotal ?? 0, prev?.previous?.grossSubtotal ?? 0, 0, 0],
  ];

  const ws = styledSheet(XLSX, {
    title: `期間比較（${currentLabel}${prev ? ` vs ${prevLabel}` : ""}）`,
    headers: ["指標", "今期", prevLabel, "増減", "増減率"],
    rows,
    rowFormats: [
      [null, YEN, YEN, YEN, PCT],
      [null, COUNT, COUNT, COUNT, PCT],
      [null, YEN, YEN, YEN, PCT],
    ],
    align: ["left", "right", "right", "right", "right"],
    formulas: [
      { addr: "D3", f: "B3-C3", v: (prev?.current?.cashSales ?? 0) - (prev?.previous?.cashSales ?? 0), numFmt: YEN },
      { addr: "E3", f: "IF(C3=0,0,D3/C3)", v: 0, numFmt: PCT },
      { addr: "D4", f: "B4-C4", v: (prev?.current?.orderCount ?? 0) - (prev?.previous?.orderCount ?? 0), numFmt: COUNT },
      { addr: "E4", f: "IF(C4=0,0,D4/C4)", v: 0, numFmt: PCT },
      { addr: "D5", f: "B5-C5", v: (prev?.current?.grossSubtotal ?? 0) - (prev?.previous?.grossSubtotal ?? 0), numFmt: YEN },
      { addr: "E5", f: "IF(C5=0,0,D5/C5)", v: 0, numFmt: PCT },
    ],
    widths: [24, 16, 16, 16, 14],
    note: ["増減 ＝ 今期 − 前期、増減率 ＝ 増減 ÷ 前期 です。"],
    freeze: true,
  });

  [3, 4, 5].forEach((rowNo) => {
    const diffAddr = `D${rowNo}`;
    const cell = ws[diffAddr];
    if (!cell) return;
    ws[diffAddr].s = {
      ...(cell.s || {}),
      font: {
        name: "メイリオ",
        sz: 10,
        bold: true,
        color: { rgb: rowNo === 4 ? PROFIT_FONT : PROFIT_FONT },
      },
    };
  });

  return ws;
}

function orderSheet(XLSX: XlsxApi, orders: SalesOrderData[]): any {
  return styledSheet(XLSX, {
    title: "注文一覧",
    headers: [
      "注文ID", "注文日時", "購入者名", "メール", "支払方法", "商品内訳",
      "小計(円)", "クーポンコード", "クーポン割引(円)", "ポイント充当(円)", "入金額(円)",
    ],
    rows: orders.map((o) => [
      o.id, o.created_at, o.name, o.email, o.payment_method, o.itemsText,
      o.subtotal, o.couponCode, o.coupon, o.points, o.total,
    ]),
    rowFormats: orders.map(() => [null, null, null, null, null, null, YEN, null, YEN, YEN, YEN]),
    align: ["left", "left", "left", "left", "center", "left", "right", "left", "right", "right", "right"],
    footerRows: [
      {
        values: [
          "合計", "", "", "", "", "",
          `=SUM(G3:G${orders.length + 2})`,
          "",
          `=SUM(I3:I${orders.length + 2})`,
          `=SUM(J3:J${orders.length + 2})`,
          `=SUM(K3:K${orders.length + 2})`,
        ],
        formats: [null, null, null, null, null, null, YEN, null, YEN, YEN, YEN],
      },
    ],
    widths: [30, 17, 15, 26, 12, 38, 14, 14, 15, 15, 14],
    freeze: true,
  });
}

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

  const product = productSheet(XLSX, products);
  const summaryWs = summarySheet(XLSX, range, summary, product.totalRowNumber);
  const compareWs = compareSheet(XLSX, range.label, prev);
  const orderWs = orderSheet(XLSX, orders);

  XLSX.utils.book_append_sheet(wb, summaryWs, "売上サマリー");
  XLSX.utils.book_append_sheet(wb, product.ws, "商品別売上");
  XLSX.utils.book_append_sheet(wb, compareWs, "期間比較");
  XLSX.utils.book_append_sheet(wb, orderWs, "注文一覧");

  XLSX.writeFile(wb, fileName);
}

export { loadXLSX };
