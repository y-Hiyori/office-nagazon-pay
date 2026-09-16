#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vercel Python Function: /api/export-sales-xlsx
NAGAZON 売上Excel（本物のExcelグラフ+セル数式）生成API。
ブラウザはPOSTで集計データを送る。ここで openpyxl により
  - 売上サマリー（利益セル=B4-B5-B6 の数式）
  - 商品別売上（棒・円のネイティブチャート + 合計 =SUM）
  - 期間比較（増減 =C-B / 増減率 =IF(...) + 比較チャート）
  - 注文一覧（合計 =SUM）
を作成し .xlsx バイト列を返す。SSH/VPS作業は不要。
依存: api/requirements.txt に openpyxl
"""
import json
from urllib.parse import quote
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, PieChart, Reference

# ---------------- スタイル ----------------
TITLE_FILL = PatternFill("solid", fgColor="312E81")
HEADER_FILL = PatternFill("solid", fgColor="4338CA")
ZEBRA_FILL = PatternFill("solid", fgColor="F1F5F9")
TOTAL_FILL = PatternFill("solid", fgColor="DCE7FF")
PROFIT_FILL = PatternFill("solid", fgColor="DCFCE7")

TITLE_FONT = Font(name="メイリオ", size=15, bold=True, color="FFFFFF")
HEADER_FONT = Font(name="メイリオ", size=10.5, bold=True, color="FFFFFF")
BODY_FONT = Font(name="メイリオ", size=10)
BOLD_FONT = Font(name="メイリオ", size=10, bold=True)
NOTE_FONT = Font(name="メイリオ", size=9, color="64748B")

THIN = Side(style="thin", color="94A3B8")
BORDER = Border(top=THIN, left=THIN, bottom=THIN, right=THIN)
MED_TOP = Side(style="medium", color="94A3B8")
TOTAL_BORDER = Border(top=MED_TOP, left=THIN, bottom=THIN, right=THIN)

CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT = Alignment(horizontal="left", vertical="center")
RIGHT = Alignment(horizontal="right", vertical="center")

YEN = "¥#,##0"
COUNT = "#,##0"


def write_headers(ws, row, headers):
    for c, h in enumerate(headers, start=1):
        cell = ws.cell(row=row, column=c, value=h)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = CENTER
        cell.border = BORDER


def style_table(ws, first_data_row, n_data_rows, n_cols, formats, center_cols=()):
    center_set = set(center_cols)
    for i in range(n_data_rows):
        r = first_data_row + i
        zebra = i % 2 == 1
        for c in range(1, n_cols + 1):
            cell = ws.cell(row=r, column=c)
            v = cell.value
            if isinstance(v, str) and v.startswith("="):
                cell.value = v[1:]
            cell.font = BODY_FONT
            if zebra:
                cell.fill = ZEBRA_FILL
            if c in center_set:
                cell.alignment = CENTER
            elif formats.get(c) == "yen" or formats.get(c) == "count":
                cell.alignment = RIGHT
            else:
                cell.alignment = LEFT
            cell.border = BORDER
            if formats.get(c) == "yen":
                cell.number_format = YEN
            elif formats.get(c) == "count":
                cell.number_format = COUNT


def set_widths(ws, widths):
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def build_workbook(d):
    range_info = d.get("range") or {}
    summary = d.get("summary") or {}
    prev = d.get("prev")
    products = d.get("products") or []
    orders = d.get("orders") or []
    range_label = str(range_info.get("label") or "") or ""
    now_jst = str(range_info.get("nowJst") or "") or ""

    wb = Workbook()

    # ============ 1) 売上サマリー ============
    ws = wb.active
    ws.title = "売上サマリー"
    set_widths(ws, [36, 20, 46])
    ws.merge_cells("A1:C1")
    c = ws["A1"]
    c.value = "OFFICE NAGAZON 売上状況レポート"
    c.font = TITLE_FONT
    c.fill = TITLE_FILL
    c.alignment = LEFT
    ws.row_dimensions[1].height = 32
    write_headers(ws, 2, ["項目", "金額", "備考"])
    ws.row_dimensions[2].height = 24

    rows = [
        ("対象期間", range_label, "–"),
        ("出力日時", now_jst, "–"),
        ("商品売上（割引前）", summary.get("grossSubtotal", 0), "クーポン・ポイント適用前の合計"),
        ("クーポン割引", summary.get("couponDiscount", 0), "{} 件で使用（引く）".format(summary.get("couponOrderCount", 0))),
        ("ポイント充当", summary.get("pointsTotal", 0), "{} 件で使用（引く）".format(summary.get("pointsOrderCount", 0))),
        ("利益（入金売上）", None, "＝ 商品売上 − クーポン割引 − ポイント充当（Excel数式）"),
        ("注文件数", summary.get("orderCount", 0), "支払い完了した注文の数"),
    ]
    for i, (label, val, note_txt) in enumerate(rows):
        r = 3 + i
        a = ws.cell(row=r, column=1, value=label)
        b = ws.cell(row=r, column=2)
        ccell = ws.cell(row=r, column=3, value=note_txt)
        a.font = BODY_FONT
        a.alignment = LEFT
        ccell.font = NOTE_FONT
        ccell.alignment = LEFT
        for col in (1, 2, 3):
            ws.cell(row=r, column=col).border = BORDER
        if val is not None:
            b.value = val
            b.alignment = RIGHT

    profit_cell = ws.cell(row=8, column=2)
    profit_cell.value = "=B5-B6-B7"
    profit_cell.number_format = YEN
    profit_cell.font = Font(name="メイリオ", size=11, bold=True)
    profit_cell.fill = PROFIT_FILL
    profit_cell.alignment = RIGHT
    ws.cell(row=8, column=1).border = BORDER
    ws.cell(row=8, column=3).border = BORDER
    for r, fmt in ((5, "yen"), (6, "yen"), (7, "yen"), (9, "count")):
        ws.cell(row=r, column=2).number_format = YEN if fmt == "yen" else COUNT
        ws.cell(row=r, column=2).alignment = RIGHT
    ws.freeze_panes = "A3"

    # ============ 2) 商品別売上（ネイティブ棒・円グラフ） ============
    ws2 = wb.create_sheet("商品別売上")
    set_widths(ws2, [36, 10, 17, 17, 17, 17])
    ws2.merge_cells("A1:F1")
    t = ws2["A1"]
    t.value = "商品別売上（クーポン・ポイントの金額込み）"
    t.font = TITLE_FONT
    t.fill = TITLE_FILL
    t.alignment = LEFT
    ws2.row_dimensions[1].height = 32
    write_headers(ws2, 2, ["商品名", "数量", "売上(割引前・円)", "売上(割引後・円)", "クーポン割引(円)", "ポイント充当(円)"])
    ws2.row_dimensions[2].height = 24

    for i, p in enumerate(products):
        r = 3 + i
        ws2.cell(row=r, column=1, value=str(p.get("product_name", "")))
        ws2.cell(row=r, column=2, value=int(p.get("quantity", 0) or 0))
        ws2.cell(row=r, column=3, value=int(p.get("subtotal_raw", 0) or 0))
        ws2.cell(row=r, column=4, value=int(p.get("subtotal_after_discount", 0) or 0))
        ws2.cell(row=r, column=5, value=int(p.get("couponYen", 0) or 0))
        ws2.cell(row=r, column=6, value=int(p.get("pointsYen", 0) or 0))

    n2 = len(products)
    style_table(ws2, 3, n2, 6, {2: "count", 3: "yen", 4: "yen", 5: "yen", 6: "yen"}, center_cols=(2,))

    if n2 > 0:
        total_r = 3 + n2
        ws2.cell(row=total_r, column=1, value="合計").font = BOLD_FONT
        ws2.cell(row=total_r, column=1).fill = TOTAL_FILL
        ws2.cell(row=total_r, column=1).border = TOTAL_BORDER
        for col in (2, 3, 4, 5, 6):
            L = get_column_letter(col)
            cell = ws2.cell(row=total_r, column=col, value="=SUM({L}3:{L}{n})".format(L=L, n=3 + n2 - 1))
            cell.font = BOLD_FONT
            cell.fill = TOTAL_FILL
            cell.alignment = RIGHT
            cell.border = TOTAL_BORDER
            cell.number_format = COUNT if col == 2 else YEN

        bar = BarChart()
        bar.type = "col"
        bar.style = 10
        bar.title = "商品別売上（割引後・円）"
        bar.y_axis.title = "円"
        bar.x_axis.title = ""
        data = Reference(ws2, min_col=4, min_row=2, max_row=total_r - 1)
        cats = Reference(ws2, min_col=1, min_row=3, max_row=total_r - 1)
        bar.add_data(data, titles_from_data=True)
        bar.set_categories(cats)
        bar.width = 20
        bar.height = 10
        if len(bar.series) > 0:
            bar.series[0].graphicalProperties.solidFill = "4F46E5"
        ws2.add_chart(bar, "H3")

        pie = PieChart()
        pie.title = "売上シェア"
        pdata = Reference(ws2, min_col=4, min_row=3, max_row=total_r - 1)
        pcats = Reference(ws2, min_col=1, min_row=3, max_row=total_r - 1)
        pie.add_data(pdata, titles_from_data=False)
        pie.set_categories(pcats)
        pie.width = 14
        pie.height = 10
        ws2.add_chart(pie, "H22")

    ws2.freeze_panes = "A3"

    # ============ 3) 期間比較 ============
    ws3 = wb.create_sheet("期間比較")
    set_widths(ws3, [24, 16, 16, 16, 14])
    cur = (prev or {}).get("current") or {}
    pre = (prev or {}).get("previous") or {}
    prev_label = (prev or {}).get("label") or "前期"
    title3 = "期間比較（{} vs {}）".format(range_label, prev_label) if prev else "期間比較（{}）".format(range_label)
    ws3.merge_cells("A1:E1")
    t3 = ws3["A1"]
    t3.value = title3
    t3.font = TITLE_FONT
    t3.fill = TITLE_FILL
    t3.alignment = LEFT
    ws3.row_dimensions[1].height = 32
    write_headers(ws3, 2, ["指標", "今期", "前期", "増減", "増減率"])
    ws3.row_dimensions[2].height = 24

    rows3 = [
        ("利益（入金売上）", cur.get("cashSales", 0), pre.get("cashSales", 0), "yen"),
        ("注文件数", cur.get("orderCount", 0), pre.get("orderCount", 0), "count"),
        ("商品売上（割引前）", cur.get("grossSubtotal", 0), pre.get("grossSubtotal", 0), "yen"),
    ]
    for i, (label, cval, pval, fmt) in enumerate(rows3):
        r = 3 + i
        ws3.cell(row=r, column=1, value=label).font = BOLD_FONT
        b = ws3.cell(row=r, column=2, value=int(cval))
        c3 = ws3.cell(row=r, column=3, value=int(pval))
        d = ws3.cell(row=r, column=4, value="=C{r}-B{r}".format(r=r))
        e = ws3.cell(row=r, column=5, value="=IF(B{r}=0,0,D{r}/B{r})".format(r=r))
        e.number_format = "0.0%"
        d.number_format = YEN if fmt == "yen" else COUNT
        b.number_format = YEN if fmt == "yen" else COUNT
        c3.number_format = YEN if fmt == "yen" else COUNT
        for col in range(1, 6):
            cc = ws3.cell(row=r, column=col)
            cc.border = BORDER
            cc.alignment = RIGHT if col >= 2 else LEFT
            if col != 1:
                cc.font = BOLD_FONT

    if prev:
        bar3 = BarChart()
        bar3.type = "col"
        bar3.style = 11
        bar3.title = "今期 vs 前期"
        data3 = Reference(ws3, min_col=2, max_col=3, min_row=2, max_row=5)
        cats3 = Reference(ws3, min_col=1, min_row=3, max_row=5)
        bar3.add_data(data3, titles_from_data=True)
        bar3.set_categories(cats3)
        bar3.width = 20
        bar3.height = 10
        if len(bar3.series) >= 2:
            bar3.series[0].graphicalProperties.solidFill = "4F46E5"
            bar3.series[1].graphicalProperties.solidFill = "CBD5E1"
        ws3.add_chart(bar3, "H3")

    ws3.freeze_panes = "A3"

    # ============ 4) 注文一覧 ============
    ws4 = wb.create_sheet("注文一覧")
    set_widths(ws4, [30, 17, 15, 26, 12, 38, 14, 14, 15, 15, 14])
    ws4.merge_cells("A1:K1")
    t4 = ws4["A1"]
    t4.value = "注文一覧"
    t4.font = TITLE_FONT
    t4.fill = TITLE_FILL
    t4.alignment = LEFT
    ws4.row_dimensions[1].height = 32
    write_headers(ws4, 2, ["注文ID", "注文日時", "購入者名", "メール", "支払方法", "商品内訳",
                           "小計(円)", "クーポンコード", "クーポン割引(円)", "ポイント充当(円)", "入金額(円)"])
    ws4.row_dimensions[2].height = 24

    for i, o in enumerate(orders):
        r = 3 + i
        ws4.cell(row=r, column=1, value=str(o.get("id", "")))
        ws4.cell(row=r, column=2, value=str(o.get("created_at", "") or ""))
        ws4.cell(row=r, column=3, value=str(o.get("name", "") or ""))
        ws4.cell(row=r, column=4, value=str(o.get("email", "") or ""))
        ws4.cell(row=r, column=5, value=str(o.get("payment_method", "") or ""))
        ws4.cell(row=r, column=6, value=str(o.get("itemsText", "") or ""))
        ws4.cell(row=r, column=7, value=int(o.get("subtotal", 0) or 0))
        ws4.cell(row=r, column=8, value=str(o.get("couponCode", "") or ""))
        ws4.cell(row=r, column=9, value=int(o.get("coupon", 0) or 0))
        ws4.cell(row=r, column=10, value=int(o.get("points", 0) or 0))
        ws4.cell(row=r, column=11, value=int(o.get("total", 0) or 0))

    n4 = len(orders)
    style_table(ws4, 3, n4, 11, {7: "yen", 9: "yen", 10: "yen", 11: "yen"}, center_cols=(5,))

    if n4 > 0:
        total_r4 = 3 + n4
        ws4.cell(row=total_r4, column=1, value="合計").font = BOLD_FONT
        ws4.cell(row=total_r4, column=1).fill = TOTAL_FILL
        ws4.cell(row=total_r4, column=1).border = TOTAL_BORDER
        for col in (7, 9, 10, 11):
            L = get_column_letter(col)
            cell = ws4.cell(row=total_r4, column=col, value="=SUM({L}3:{L}{n})".format(L=L, n=3 + n4 - 1))
            cell.font = BOLD_FONT
            cell.fill = TOTAL_FILL
            cell.alignment = RIGHT
            cell.border = TOTAL_BORDER
            cell.number_format = YEN
    ws4.freeze_panes = "A3"

    return wb


def get_json(request):
    j = getattr(request, "json", None)
    if j is None:
        body = getattr(request, "body", b"")
        if isinstance(body, str):
            body = body.encode("utf-8", "replace")
        return json.loads(body) if body else {}
    if callable(j):
        try:
            return j()
        except TypeError:
            return j
    return j


def handler(request):
    try:
        d = get_json(request) or {}
        b64ok = False
        wb = build_workbook(d)
        import io
        buf = io.BytesIO()
        wb.save(buf)
        raw = buf.getvalue()
        buf.close()

        label = str((d.get("range") or {}).get("label") or "期間") \
            .replace("\\", "_").replace("/", "_").replace(":", "_") \
            .replace("*", "_").replace("?", "_").replace('"', "_") \
            .replace("<", "_").replace(">", "_").replace("|", "_") \
            .replace("～", "_").replace("~", "_").strip() or "期間"
        fname = "OFFICE NAGAZON売上_{}.xlsx".format(label)

        from vercel_response import Response
        return Response(
            body=raw,
            status=200,
            headers={
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": "attachment; filename*=UTF-8''{}".format(
                    quote(fname)
                ),
            },
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        try:
            from vercel_response import Response
            return Response(body=str(e).encode("utf-8"), status=500)
        except Exception:
            return ("error", 500)
