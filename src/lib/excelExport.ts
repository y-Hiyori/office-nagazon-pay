// src/lib/excelExport.ts
// ブラウザで「スタイル付き」Excel（.xlsx）を生成してダウンロードするヘルパー
// 依存: public/vendor/xlsx.full.min.js（SheetJS）を動的ロード
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
const THIN = { style: "thin", color: { rgb: "C7CBD1" } } as const;
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN } as const;

const TITLE_BG = "312E81"; // 濃紺
const HEADER_BG = "4F46E5"; // インディゴ
const HEADER_FONT = "FFFFFF";
const ZEBRA_BG = "F8FAFC"; // 縞の奇数行
const BAR_COLOR = "4F46E5"; // 棒グラフ（通常）
const BAR_MAX_COLOR = "F97316"; // 棒グラフ（最大値）
const NOTE_COLOR = "6B7280";

const YEN = "¥#,##0";
const COUNT = "#,##0";

type Align = "left" | "center" | "right";

type StyledOptions = {
  title?: string;
  headers: string[];
  widths: number[];
  rows: unknown[][];
  rowFormats?: (string | null)[][];
  align?: Align[];
  note?: string[];
  freeze?: boolean;
};

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

function styledSheet(XLSX: XlsxApi, opts: StyledOptions): any {
  const { title, headers, widths, rows, rowFormats, align, note, freeze } = opts;
  const nCols = headers.length;

  const aoaRows: unknown[][] = [];
  if (title) aoaRows.push([title]);
  aoaRows.push(headers as unknown[]);
  for (const r of rows) aoaRows.push(r);
  if (note) for (const n of note) aoaRows.push([n] as unknown[]);

  const ws = XLSX.utils.aoa_to_sheet(aoaRows);

  // 列幅
  ws["!cols"] = widths.map((w) => ({ wch: w }));

  // 行高
  const heights: { hpt: number }[] = [];
  if (title) {
    heights.push({ hpt: 30 });
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } }];
  }
  heights.push({ hpt: 22 }); // ヘッダー
  for (let i = 0; i < rows.length + (note ? note.length : 0); i++) heights.push({ hpt: 20 });
  ws["!rows"] = heights;

  // タイトル
  if (title) {
    applyCell(ws, encode(XLSX, 0, 0), {
      font: { name: "メイリオ", sz: 14, bold: true, color: { rgb: HEADER_FONT } },
      fill: { patternType: "solid", fgColor: { rgb: TITLE_BG } },
      alignment: { horizontal: "left", vertical: "center" },
    });
  }

  // ヘッダー
  const headRowIdx = title ? 1 : 0;
  for (let c = 0; c < nCols; c++) {
    applyCell(ws, encode(XLSX, headRowIdx, c), {
      font: { name: "メイリオ", sz: 11, bold: true, color: { rgb: HEADER_FONT } },
      fill: { patternType: "solid", fgColor: { rgb: HEADER_BG } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: BORDER,
    });
  }

  // データ行
  for (let i = 0; i < rows.length; i++) {
    const rIdx = headRowIdx + 1 + i;
    const zebra = i % 2 === 1;
    const fmts = rowFormats?.[i];
    for (let c = 0; c < nCols; c++) {
      const addr = encode(XLSX, rIdx, c);
      const numFmt = fmts?.[c] ?? undefined;
      const a = align?.[c] ?? (numFmt ? "right" : "left");
      applyCell(ws, addr, {
        font: { name: "メイリオ", sz: 10 },
        fill: zebra ? { patternType: "solid", fgColor: { rgb: ZEBRA_BG } } : undefined,
        alignment: { horizontal: a, vertical: "center", wrapText: c === 0 },
        border: BORDER,
        ...(numFmt ? { numFmt } : {}),
      });
    }
  }

  // 注記
  if (note) {
    for (let i = 0; i < note.length; i++) {
      const rIdx = headRowIdx + 1 + rows.length + i;
      ws["!merges"] = ws["!merges"] || [];
      ws["!merges"].push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: nCols - 1 } });
      applyCell(ws, encode(XLSX, rIdx, 0), {
        font: { name: "メイリオ", sz: 9, color: { rgb: NOTE_COLOR } },
        alignment: { horizontal: "left", vertical: "center", wrapText: true },
      });
    }
  }

  // ウィンドウ固定（ヘッダーまで）
  if (freeze) {
    ws["!freeze"] = { xSplit: 0, ySplit: headRowIdx + 1 };
  }

  return ws;
}

// ===================== 商品別チャート（棒グラフ） =====================
function barSheet(
  XLSX: XlsxApi,
  titleText: string,
  items: { label: string; value: number }[],
  maxCells = 20
): any {
  const maxVal = Math.max(1, ...items.map((i) => i.value));
  const labelW = 26;
  const valW = 14;
  const barW = 2.4;

  const headers = ["商品名", "売上（円）", ...Array.from({ length: maxCells }, () => "")];
  const widths = [labelW, valW, ...Array.from({ length: maxCells }, () => barW)];

  const aoa: unknown[][] = [[titleText], headers];
  for (const it of items) {
    const row: unknown[] = [it.label, it.value, ...Array.from({ length: maxCells }, () => "")];
    aoa.push(row);
  }
  aoa.push(["※ 棒の長さ＝売上（割引後）の比較。最大の商品はオレンジで表示しています。"]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const nCols = maxCells + 2;
  ws["!cols"] = widths;
  ws["!rows"] = [{ hpt: 30 }, { hpt: 20 }, ...Array.from({ length: items.length }, () => ({ hpt: 18 })), { hpt: 16 }];

  // タイトル
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } }];
  applyCell(ws, encode(XLSX, 0, 0), {
    font: { name: "メイリオ", sz: 13, bold: true, color: { rgb: HEADER_FONT } },
    fill: { patternType: "solid", fgColor: { rgb: TITLE_BG } },
    alignment: { horizontal: "left", vertical: "center" },
  });

  // ヘッダー
  for (let c = 0; c < nCols; c++) {
    applyCell(ws, encode(XLSX, 1, c), {
      font: { name: "メイリオ", sz: 10, bold: true, color: { rgb: HEADER_FONT } },
      fill: { patternType: "solid", fgColor: { rgb: HEADER_BG } },
      alignment: { horizontal: "center", vertical: "center" },
      border: c < 2 ? BORDER : { ...BORDER, left: THIN, right: THIN },
    });
  }

  // データ＋棒
  for (let i = 0; i < items.length; i++) {
    const rIdx = 2 + i;
    const isMax = items[i].value >= maxVal && maxVal > 1;
    const barColor = isMax ? BAR_MAX_COLOR : BAR_COLOR;
    const cells = maxVal > 0 ? Math.max(items[i].value > 0 ? 1 : 0, Math.round((items[i].value / maxVal) * maxCells)) : 0;

    applyCell(ws, encode(XLSX, rIdx, 0), {
      font: { name: "メイリオ", sz: 10 },
      alignment: { horizontal: "left", vertical: "center" },
      border: BORDER,
    });
    applyCell(ws, encode(XLSX, rIdx, 1), {
      font: { name: "メイリオ", sz: 10, bold: isMax },
      numFmt: YEN,
      alignment: { horizontal: "right", vertical: "center" },
      border: BORDER,
    });

    for (let b = 0; b < maxCells; b++) {
      const addr = encode(XLSX, rIdx, 2 + b);
      if (b < cells) {
        applyCell(ws, addr, {
          fill: { patternType: "solid", fgColor: { rgb: barColor } },
        });
      }
    }
  }

  // 注記
  if (items.length > 0) {
    const noteR = 2 + items.length;
    ws["!merges"] = ws["!merges"] || [];
    ws["!merges"].push({ s: { r: noteR, c: 0 }, e: { r: noteR, c: nCols - 1 } });
    applyCell(ws, encode(XLSX, noteR, 0), {
      font: { name: "メイリオ", sz: 9, color: { rgb: NOTE_COLOR } },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
    });
  }

  return ws;
}

// ===================== 売上レポート全体を生成 =====================
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

export async function exportSalesXlsx(
  range: SalesRangeData,
  summary: SalesSummaryData,
  products: SalesProductData[],
  orders: SalesOrderData[]
): Promise<void> {
  const XLSX = await loadXLSX();
  const labelSafe = range.label.replace(/[\\/:*?"<>|～~]/g, "_");
  const fileName = `OFFICE NAGAZON売上_${labelSafe}.xlsx`;

  const wb = XLSX.utils.book_new();

  // シート1: 売上サマリー
  const summaryWs = styledSheet(XLSX, {
    title: "OFFICE NAGAZON 売上状況レポート",
    headers: ["項目", "金額", "備考"],
    widths: [34, 18, 44],
    rows: [
      ["対象期間", range.label, "–"],
      ["出力日時", range.nowJst, "–"],
      ["利益（入金売上）", summary.cashSales, "お客様から実際にいただいた金額"],
      ["注文件数", summary.orderCount, "支払い完了した注文の数"],
      ["商品売上（割引前）", summary.grossSubtotal, "クーポン・ポイント適用前の合計"],
      ["クーポン割引", summary.couponDiscount, `${summary.couponOrderCount} 件で使用`],
      ["ポイント充当（利益に含めない）", summary.pointsTotal, `${summary.pointsOrderCount} 件で使用`],
    ],
    rowFormats: [
      [null, null, null],
      [null, null, null],
      [null, YEN, null],
      [null, COUNT, null],
      [null, YEN, null],
      [null, YEN, null],
      [null, YEN, null],
    ],
    align: ["left", "right", "left"],
    note: [
      "利益 ＝ 入金売上 ＝ 商品売上 − クーポン割引 − ポイント充当",
      "※ 現在は商品原価（cost）を未設定のため、利益＝入金売上です。",
      "　 商品に原価を登録すると 利益 ＝ 入金売上 − 原価 に自動で変わります（推奨機能）。",
      "※ ポイント充当額は売上・利益に含めません（お客様に付与したポイントで支払われた分のため）。",
    ],
    freeze: true,
  });
  XLSX.utils.book_append_sheet(wb, summaryWs, "売上サマリー");

  // シート2: 商品別売上
  const productWs = styledSheet(XLSX, {
    title: "商品別売上",
    headers: ["商品名", "数量", "売上（割引前・円）", "売上（割引後・円）", "クーポン使用（件）", "ポイント使用（件）"],
    widths: [30, 10, 16, 16, 14, 14],
    rows: products.map((it) => [
      it.product_name,
      it.quantity,
      it.subtotal_raw,
      it.subtotal_after_discount,
      it.coupon_orders_count,
      it.points_orders_count,
    ]),
    rowFormats: products.map(() => [null, COUNT, YEN, YEN, COUNT, COUNT]),
    align: ["left", "center", "right", "right", "center", "center"],
    note: [
      "※ 売上（割引後）＝ クーポン・ポイントの割引を商品比率で按分した金額。",
      "　 原価（cost）を商品に登録すると、この列が商品ごとの利益（粗利）になります。",
    ],
    freeze: true,
  });
  XLSX.utils.book_append_sheet(wb, productWs, "商品別売上");

  // シート3: 商品別チャート（棒グラフ）
  const chartWs = barSheet(
    XLSX,
    "商品別売上比較（割引後・円）",
    products.map((it) => ({ label: it.product_name, value: it.subtotal_after_discount }))
  );
  XLSX.utils.book_append_sheet(wb, chartWs, "商品別チャート");

  // シート4: 注文一覧
  const orderWs = styledSheet(XLSX, {
    title: "注文一覧",
    headers: [
      "注文ID", "注文日時", "購入者名", "メール", "支払方法", "商品内訳",
      "小計（円）", "クーポンコード", "クーポン割引（円）", "ポイント充当（円）", "入金額（円）",
    ],
    widths: [30, 17, 15, 24, 11, 36, 13, 14, 14, 14, 13],
    rows: orders.map((o) => [
      o.id,
      o.created_at,
      o.name,
      o.email,
      o.payment_method,
      o.itemsText,
      o.subtotal,
      o.couponCode,
      o.coupon,
      o.points,
      o.total,
    ]),
    rowFormats: orders.map(() => [
      null, null, null, null, null, null,
      YEN, null, YEN, YEN, YEN,
    ]),
    align: ["left", "left", "left", "left", "center", "left", "right", "left", "right", "right", "right"],
    freeze: true,
  });
  XLSX.utils.book_append_sheet(wb, orderWs, "注文一覧");

  XLSX.writeFile(wb, fileName);
}

export { loadXLSX };
