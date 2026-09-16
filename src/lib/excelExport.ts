// src/lib/excelExport.ts
// ブラウザで Excel（.xlsx）を生成してダウンロードするヘルパー
// 依存ライブラリは public/vendor/xlsx.full.min.js（SheetJS）を動的ロードする
// ※ データは外部に送信せず、すべてブラウザ内で処理します

export type SheetSpec = {
  name: string;
  rows: unknown[][];
};

let xlsxPromise: Promise<any> | null = null;

function loadXLSX(): Promise<any> {
  const w: any = window;
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

function columnWidths(rows: unknown[][]): { wch: number }[] {
  const header = rows[0] ?? [];
  return header.map((_, i) => {
    let maxLen = 0;
    for (const row of rows) {
      const len = String(row[i] ?? "").length;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(32, Math.max(10, maxLen + 1)) };
  });
}

export async function exportXlsxSheets(fileName: string, sheets: SheetSpec[]): Promise<void> {
  const XLSX: any = await loadXLSX();
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows as any[][]);
    ws["!cols"] = columnWidths(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name.slice(0, 31));
  }

  XLSX.writeFile(workbook, fileName);
}
