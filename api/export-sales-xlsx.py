#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vercel Python Function: /api/export-sales-xlsx
BaseHTTPRequestHandler 版。Vercel の /api ディレクトリ用 Python 関数として公開する。
"""
import io
import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import quote
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, PieChart, LineChart, Reference
from openpyxl.chart.label import DataLabelList

TITLE_FILL = PatternFill("solid", fgColor="312E81")
HEADER_FILL = PatternFill("solid", fgColor="4338CA")
ZEBRA_FILL = PatternFill("solid", fgColor="F8FAFC")
TOTAL_FILL = PatternFill("solid", fgColor="DBEAFE")
HIGHLIGHT_FILL = PatternFill("solid", fgColor="DCFCE7")

TITLE_FONT = Font(name="メイリオ", size=15, bold=True, color="FFFFFF")
HEADER_FONT = Font(name="メイリオ", size=10.5, bold=True, color="FFFFFF")
BODY_FONT = Font(name="メイリオ", size=10)
BOLD_FONT = Font(name="メイリオ", size=10, bold=True)
NOTE_FONT = Font(name="メイリオ", size=9, color="64748B")

THIN = Side(style="thin", color="94A3B8")
MED = Side(style="medium", color="94A3B8")
BORDER = Border(top=THIN, left=THIN, bottom=THIN, right=THIN)
TOTAL_BORDER = Border(top=MED, left=THIN, bottom=THIN, right=THIN)

CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)
RIGHT = Alignment(horizontal="right", vertical="center")

YEN = "¥#,##0"
COUNT = "#,##0"
PCT = "0.0%"


def to_int(v):
    try:
        return int(round(float(v or 0)))
    except Exception:
        return 0


def write_headers(ws, row, headers):
    for c, h in enumerate(headers, start=1):
        cell = ws.cell(row=row, column=c, value=h)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = CENTER
        cell.border = BORDER


def set_widths(ws, widths):
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def style_range(ws, start_row, end_row, formats=None, center_cols=()):
    formats = formats or {}
    center_set = set(center_cols)
    for r in range(start_row, end_row + 1):
        zebra = ((r - start_row) % 2) == 1
        for c in range(1, ws.max_column + 1):
            cell = ws.cell(row=r, column=c)
            cell.font = BODY_FONT
            if zebra:
                cell.fill = ZEBRA_FILL
            cell.border = BORDER
            if c in center_set:
                cell.alignment = CENTER
            elif formats.get(c) in ("yen", "count", "pct"):
                cell.alignment = RIGHT
            else:
                cell.alignment = LEFT
            if formats.get(c) == "yen":
                cell.number_format = YEN
            elif formats.get(c) == "count":
                cell.number_format = COUNT
            elif formats.get(c) == "pct":
                cell.number_format = PCT


def total_row_style(cell, align=RIGHT, fmt=None):
    cell.font = BOLD_FONT
    cell.fill = TOTAL_FILL
    cell.alignment = align
    cell.border = TOTAL_BORDER
    if fmt == "yen":
        cell.number_format = YEN
    elif fmt == "count":
        cell.number_format = COUNT
    elif fmt == "pct":
        cell.number_format = PCT


def build_product_sheet(wb, products):
    ws = wb.active
    ws.title = "商品別売上"
    set_widths(ws, [30, 15, 10, 19, 15, 15, 17, 15, 13, 13, 10, 12, 3, 3, 3, 14, 14, 14, 14, 14, 14])
    ws.merge_cells("A1:L1")
    ws["A1"] = "商品別売上（売上・仕入れ原価・粗利がひと目で分かる一覧）"
    ws["A1"].font = TITLE_FONT
    ws["A1"].fill = TITLE_FILL
    ws["A1"].alignment = LEFT
    ws.row_dimensions[1].height = 36
    ws.row_dimensions[2].height = 34
    write_headers(ws, 2, [
        "商品名", "売価(平均・円)", "数量", "売上計算(割引前・円)", "クーポン割引(円)",
        "ポイント充当(円)", "入金売上(割引後・円)", "仕入れ原価(単価・円)", "売上原価(円)",
        "粗利(円)", "粗利率", "売上構成比"
    ])

    total_sales = max(1, sum(to_int(p.get("subtotal_after_discount", 0)) for p in products))
    for i, p in enumerate(products, start=3):
        qty = to_int(p.get("quantity", 0))
        avg_price = to_int(p.get("avg_unit_price", 0))
        coupon_yen = to_int(p.get("couponYen", 0))
        points_yen = to_int(p.get("pointsYen", 0))
        sales_after = to_int(p.get("subtotal_after_discount", 0))
        cost_unit = to_int(p.get("cost_unit", 0))

        ws.cell(row=i, column=1, value=str(p.get("product_name", "")))
        ws.cell(row=i, column=2, value=avg_price)
        ws.cell(row=i, column=3, value=qty)
        ws.cell(row=i, column=4, value="=B{0}*C{0}".format(i))
        ws.cell(row=i, column=5, value=coupon_yen)
        ws.cell(row=i, column=6, value=points_yen)
        ws.cell(row=i, column=7, value="=D{0}-E{0}-F{0}".format(i))
        ws.cell(row=i, column=8, value=cost_unit)
        ws.cell(row=i, column=9, value="=H{0}*C{0}".format(i))
        ws.cell(row=i, column=10, value="=G{0}-I{0}".format(i))
        ws.cell(row=i, column=11, value="=IF(G{0}=0,0,J{0}/G{0})".format(i))
        ws.cell(row=i, column=12, value=sales_after / total_sales if total_sales else 0)
        style_range(ws, i, i, {2: "yen", 3: "count", 4: "yen", 5: "yen", 6: "yen", 7: "yen",
                               8: "yen", 9: "yen", 10: "yen", 11: "pct", 12: "pct"}, center_cols=(3,))
        ws.row_dimensions[i].height = 22
        ws.cell(row=i, column=7).font = Font(name="メイリオ", size=10, bold=True)
        ws.cell(row=i, column=10).font = Font(name="メイリオ", size=10, bold=True, color="15803D")
        if cost_unit <= 0:
            ws.cell(row=i, column=8).font = Font(name="メイリオ", size=10, color="B91C1C")
            ws.cell(row=i, column=9).font = Font(name="メイリオ", size=10, color="B91C1C")

    total_row = 3 + len(products)
    ws.cell(row=total_row, column=1, value="合計")
    total_row_style(ws.cell(row=total_row, column=1), LEFT)
    for col, fmt in [(2, "yen"), (3, "count"), (4, "yen"), (5, "yen"), (6, "yen"), (7, "yen"),
                     (8, "yen"), (9, "yen"), (10, "yen"), (11, "pct"), (12, "pct")]:
        total_row_style(ws.cell(row=total_row, column=col), RIGHT, fmt)
    ws.row_dimensions[total_row].height = 22
    data_end = max(2, total_row - 1)
    ws.cell(row=total_row, column=2, value="=IF(C{0}=0,0,D{0}/C{0})".format(total_row))
    ws.cell(row=total_row, column=3, value="=SUM(C3:C{0})".format(data_end))
    ws.cell(row=total_row, column=4, value="=SUM(D3:D{0})".format(data_end))
    ws.cell(row=total_row, column=5, value="=SUM(E3:E{0})".format(data_end))
    ws.cell(row=total_row, column=6, value="=SUM(F3:F{0})".format(data_end))
    ws.cell(row=total_row, column=7, value="=SUM(G3:G{0})".format(data_end))
    ws.cell(row=total_row, column=8, value="=IF(C{0}=0,0,I{0}/C{0})".format(total_row))
    ws.cell(row=total_row, column=9, value="=SUM(I3:I{0})".format(data_end))
    ws.cell(row=total_row, column=10, value="=G{0}-I{0}".format(total_row))
    ws.cell(row=total_row, column=11, value="=IF(G{0}=0,0,J{0}/G{0})".format(total_row))
    ws.cell(row=total_row, column=12, value="=1")

    note_row = total_row + 3
    notes = [
        "※ 入金売上(割引後) ＝ 売上計算(割引前) − クーポン割引 − ポイント充当 です。",
        "※ 粗利 ＝ 入金売上(割引後) − 売上原価 です。売上原価 ＝ 仕入れ原価(単価) × 数量。",
        "※ 仕入れ原価が未登録（赤文字）の商品は原価0円で計算されるため、粗利が実際より大きく出ます。",
    ]
    for idx, txt in enumerate(notes):
        ws.merge_cells(start_row=note_row + idx, start_column=1, end_row=note_row + idx, end_column=12)
        c = ws.cell(row=note_row + idx, column=1, value=txt)
        c.font = NOTE_FONT
        c.alignment = LEFT
        ws.row_dimensions[note_row + idx].height = 20

    if products:
        sales_chart = BarChart()
        sales_chart.type = "bar"
        sales_chart.style = 10
        sales_chart.title = "商品別入金売上"
        sales_chart.legend = None
        sales_chart.gapWidth = 55
        sales_chart.add_data(Reference(ws, min_col=7, min_row=2, max_row=total_row - 1), titles_from_data=True)
        sales_chart.set_categories(Reference(ws, min_col=1, min_row=3, max_row=total_row - 1))
        sales_chart.width = 11.8
        sales_chart.height = 8.0
        if sales_chart.series:
            sales_chart.series[0].graphicalProperties.solidFill = "4F46E5"
        ws.add_chart(sales_chart, "N3")

        profit_chart = BarChart()
        profit_chart.type = "bar"
        profit_chart.style = 12
        profit_chart.title = "商品別粗利"
        profit_chart.legend = None
        profit_chart.gapWidth = 55
        profit_chart.add_data(Reference(ws, min_col=10, min_row=2, max_row=total_row - 1), titles_from_data=True)
        profit_chart.set_categories(Reference(ws, min_col=1, min_row=3, max_row=total_row - 1))
        profit_chart.width = 11.8
        profit_chart.height = 8.0
        if profit_chart.series:
            profit_chart.series[0].graphicalProperties.solidFill = "15803D"
        ws.add_chart(profit_chart, "T3")

        qty_chart = BarChart()
        qty_chart.type = "col"
        qty_chart.style = 11
        qty_chart.title = "商品別販売個数"
        qty_chart.legend = None
        qty_chart.gapWidth = 45
        qty_chart.add_data(Reference(ws, min_col=3, min_row=2, max_row=total_row - 1), titles_from_data=True)
        qty_chart.set_categories(Reference(ws, min_col=1, min_row=3, max_row=total_row - 1))
        qty_chart.width = 11.8
        qty_chart.height = 8.0
        if qty_chart.series:
            qty_chart.series[0].graphicalProperties.solidFill = "0EA5E9"
        ws.add_chart(qty_chart, "N22")

        pie = PieChart()
        pie.title = "売上構成比"
        pie.legend.position = "r"
        pie.varyColors = True
        pie.add_data(Reference(ws, min_col=7, min_row=3, max_row=total_row - 1), titles_from_data=False)
        pie.set_categories(Reference(ws, min_col=1, min_row=3, max_row=total_row - 1))
        if len(products) <= 6:
            pie.dataLabels = DataLabelList()
            pie.dataLabels.showPercent = True
            pie.dataLabels.showLeaderLines = True
        pie.width = 11.0
        pie.height = 8.8
        ws.add_chart(pie, "T22")

    ws.auto_filter.ref = "A2:L{0}".format(total_row)
    ws.freeze_panes = "A3"


def build_summary_sheet(wb, range_label, now_jst, summary):
    ws = wb.create_sheet("売上サマリー", 0)
    set_widths(ws, [24, 18, 56])
    ws.merge_cells("A1:C1")
    ws["A1"] = "OFFICE NAGAZON 売上状況レポート"
    ws["A1"].font = TITLE_FONT
    ws["A1"].fill = TITLE_FILL
    ws["A1"].alignment = LEFT
    ws.row_dimensions[1].height = 32
    write_headers(ws, 2, ["項目", "値", "説明"])

    rows = [
        ("対象期間", range_label, "集計対象の期間"),
        ("出力日時", now_jst, "Excelを出力した日時"),
        ("商品売上（割引前）", to_int(summary.get("grossSubtotal", 0)), "商品ごとの売上計算の合計"),
        ("クーポン割引", to_int(summary.get("couponDiscount", 0)), "{0} 件で使用（引く）".format(to_int(summary.get("couponOrderCount", 0)))),
        ("ポイント充当", to_int(summary.get("pointsTotal", 0)), "{0} 件で使用（引く）".format(to_int(summary.get("pointsOrderCount", 0)))),
        ("入金売上", None, "＝ 商品売上 − クーポン割引 − ポイント充当"),
        ("総値引額", None, "＝ クーポン割引 ＋ ポイント充当"),
        ("実収率", None, "＝ 入金売上 ÷ 商品売上（割引前）"),
        ("売上原価（仕入れ）", to_int(summary.get("costTotal", 0)), "＝ Σ（仕入れ原価 × 販売数量）"),
        ("廃棄ロス（処分原価）", to_int(summary.get("disposalCost", 0)),
         "＝ Σ（処分した原価）／処分 {0} 個（引く）".format(to_int(summary.get("disposalQty", 0)))),
        ("粗利（利益）", None, "＝ 入金売上 − 売上原価（仕入れ）"),
        ("粗利率", None, "＝ 粗利 ÷ 入金売上"),
    ]

    for i, (label, val, note) in enumerate(rows, start=3):
        ws.cell(row=i, column=1, value=label)
        if val is not None:
            ws.cell(row=i, column=2, value=val)
        ws.cell(row=i, column=3, value=note)

    style_range(ws, 3, 14, {2: "yen"})
    ws["B8"] = "=B5-B6-B7"
    ws["B9"] = "=B6+B7"
    ws["B10"] = "=IF(B5=0,0,B8/B5)"
    ws["B13"] = "=B8-B11-B12"
    ws["B14"] = "=IF(B8=0,0,B13/B8)"
    for addr, fmt in [("B8", YEN), ("B9", YEN), ("B10", PCT), ("B11", YEN), ("B12", YEN), ("B13", YEN), ("B14", PCT)]:
        ws[addr].number_format = fmt
        ws[addr].alignment = RIGHT
        ws[addr].font = Font(name="メイリオ", size=11 if addr in ("B8", "B13") else 10, bold=True)
    ws["B8"].fill = HIGHLIGHT_FILL
    ws["B13"].fill = HIGHLIGHT_FILL

    notes = [
        "入金売上 ＝ お客様から実際にいただいた金額です。",
        "粗利（利益）＝ 入金売上 − 売上原価（仕入れ） − 廃棄ロス（処分した原価）です。仕入れ原価は商品ごと・入荷ロットごとに管理画面で設定できます。廃棄ロスは「処分履歴」シートで理由と商品名を確認できます。",
        "商品別売上シートには売上・粗利・数量・売上構成比のグラフを追加しています。",
        "期間比較シートには今期 vs 比較期間の棒グラフと、増減率の折れ線グラフを追加しています。",
    ]
    for i, txt in enumerate(notes, start=16):
        ws.merge_cells(start_row=i, start_column=1, end_row=i, end_column=3)
        c = ws.cell(row=i, column=1, value=txt)
        c.font = NOTE_FONT
        c.alignment = LEFT

    ws.freeze_panes = "A3"


def build_compare_sheet(wb, range_label, prev):
    ws = wb.create_sheet("期間比較")
    prev_label = (prev or {}).get("label") or "比較期間"
    set_widths(ws, [26, 16, 16, 16, 13, 3, 14, 14, 14, 14, 14, 14, 14])
    ws.merge_cells("A1:E1")
    ws["A1"] = f"期間比較（{range_label}{' vs ' + prev_label if prev else ''}）"
    ws["A1"].font = TITLE_FONT
    ws["A1"].fill = TITLE_FILL
    ws["A1"].alignment = LEFT
    ws.row_dimensions[1].height = 36
    ws.row_dimensions[2].height = 32
    write_headers(ws, 2, ["指標", "今期", prev_label, "増減", "増減率"])

    cur = (prev or {}).get("current") or {}
    pre = (prev or {}).get("previous") or {}
    rows = [
        ("入金売上", to_int(cur.get("cashSales", 0)), to_int(pre.get("cashSales", 0)), "yen"),
        ("注文件数", to_int(cur.get("orderCount", 0)), to_int(pre.get("orderCount", 0)), "count"),
        ("商品売上（割引前）", to_int(cur.get("grossSubtotal", 0)), to_int(pre.get("grossSubtotal", 0)), "yen"),
    ]
    for i, (label, curv, prevv, fmt) in enumerate(rows, start=3):
        ws.cell(row=i, column=1, value=label).font = BOLD_FONT
        ws.cell(row=i, column=2, value=curv)
        ws.cell(row=i, column=3, value=prevv)
        ws.cell(row=i, column=4, value=f"=B{i}-C{i}")
        ws.cell(row=i, column=5, value=f"=IF(C{i}=0,0,D{i}/C{i})")
        style_range(ws, i, i, {2: fmt, 3: fmt, 4: fmt, 5: "pct"})
        ws.row_dimensions[i].height = 22
        ws.cell(row=i, column=4).font = BOLD_FONT

    if prev:
        compare_chart = BarChart()
        compare_chart.type = "col"
        compare_chart.style = 11
        compare_chart.title = "今期 vs {}".format(prev_label)
        compare_chart.legend.position = "b"
        compare_chart.gapWidth = 45
        compare_chart.add_data(Reference(ws, min_col=2, max_col=3, min_row=2, max_row=5), titles_from_data=True)
        compare_chart.set_categories(Reference(ws, min_col=1, min_row=3, max_row=5))
        compare_chart.width = 13.8
        compare_chart.height = 8.2
        if len(compare_chart.series) >= 2:
            compare_chart.series[0].graphicalProperties.solidFill = "4F46E5"
            compare_chart.series[1].graphicalProperties.solidFill = "CBD5E1"
        ws.add_chart(compare_chart, "G3")

        rate_chart = LineChart()
        rate_chart.title = "増減率"
        rate_chart.style = 13
        rate_chart.legend = None
        rate_chart.add_data(Reference(ws, min_col=5, min_row=2, max_row=5), titles_from_data=True)
        rate_chart.set_categories(Reference(ws, min_col=1, min_row=3, max_row=5))
        rate_chart.width = 13.8
        rate_chart.height = 7.4
        if rate_chart.series:
            rate_chart.series[0].graphicalProperties.line.solidFill = "DC2626"
            rate_chart.series[0].graphicalProperties.line.width = 24000
        ws.add_chart(rate_chart, "G20")

    ws.merge_cells("A8:E8")
    ws["A8"] = f"増減 ＝ 今期 − {prev_label}、増減率 ＝ 増減 ÷ {prev_label} です。"
    ws["A8"].font = NOTE_FONT
    ws["A8"].alignment = LEFT
    ws.row_dimensions[8].height = 22
    ws.auto_filter.ref = "A2:E5"
    ws.freeze_panes = "A3"


def build_order_sheet(wb, orders):
    ws = wb.create_sheet("注文一覧")
    set_widths(ws, [30, 17, 15, 26, 12, 38, 14, 14, 15, 15, 14, 14, 14])
    ws.merge_cells("A1:M1")
    ws["A1"] = "注文一覧"
    ws["A1"].font = TITLE_FONT
    ws["A1"].fill = TITLE_FILL
    ws["A1"].alignment = LEFT
    ws.row_dimensions[1].height = 32
    write_headers(ws, 2, ["注文ID", "注文日時", "購入者名", "メール", "支払方法", "商品内訳", "小計(円)", "クーポンコード", "クーポン割引(円)", "ポイント充当(円)", "入金額(円)", "売上原価(円)", "粗利(円)"])

    for i, o in enumerate(orders, start=3):
        ws.cell(row=i, column=1, value=str(o.get("id", "")))
        ws.cell(row=i, column=2, value=str(o.get("created_at", "") or ""))
        ws.cell(row=i, column=3, value=str(o.get("name", "") or ""))
        ws.cell(row=i, column=4, value=str(o.get("email", "") or ""))
        ws.cell(row=i, column=5, value=str(o.get("payment_method", "") or ""))
        ws.cell(row=i, column=6, value=str(o.get("itemsText", "") or ""))
        ws.cell(row=i, column=7, value=to_int(o.get("subtotal", 0)))
        ws.cell(row=i, column=8, value=str(o.get("couponCode", "") or ""))
        ws.cell(row=i, column=9, value=to_int(o.get("coupon", 0)))
        ws.cell(row=i, column=10, value=to_int(o.get("points", 0)))
        ws.cell(row=i, column=11, value=to_int(o.get("total", 0)))
        ws.cell(row=i, column=12, value=to_int(o.get("cost", 0)))
        ws.cell(row=i, column=13, value="=K{0}-L{0}".format(i))

    n = len(orders)
    if n > 0:
        style_range(ws, 3, 2 + n, {7: "yen", 9: "yen", 10: "yen", 11: "yen", 12: "yen", 13: "yen"}, center_cols=(5,))
    total_row = 3 + n
    ws.cell(row=total_row, column=1, value="合計")
    total_row_style(ws.cell(row=total_row, column=1), LEFT)
    for col in (7, 9, 10, 11, 12, 13):
        cell = ws.cell(row=total_row, column=col, value="=SUM({0}3:{0}{1})".format(get_column_letter(col), max(2, total_row - 1)))
        total_row_style(cell, RIGHT, "yen")
    ws.freeze_panes = "A3"


def build_disposal_sheet(wb, rows):
    ws = wb.create_sheet("処分履歴")
    headers = ["日時", "商品名", "商品ID", "数量", "処分理由", "メモ", "ロット", "原価(1個)", "処分原価(円)"]
    write_headers(ws, 1, headers)
    for i, r in enumerate(rows, start=2):
        ws.cell(row=i, column=1, value=str(r.get("created_at") or ""))
        ws.cell(row=i, column=2, value=str(r.get("product_name") or ""))
        ws.cell(row=i, column=3, value=to_int(r.get("product_id", 0)))
        ws.cell(row=i, column=4, value=to_int(r.get("quantity", 0)))
        ws.cell(row=i, column=5, value=str(r.get("reason") or ""))
        ws.cell(row=i, column=6, value=str(r.get("memo") or ""))
        ws.cell(row=i, column=7, value=str(r.get("lot_label") or ""))
        ws.cell(row=i, column=8, value=to_int(r.get("cost", 0)))
        ws.cell(row=i, column=9, value=to_int(r.get("cost_total", 0)))
    total = sum(to_int(r.get("cost_total", 0)) for r in rows)
    row = 2 + len(rows)
    ws.cell(row=row, column=1, value="合計")
    ws.cell(row=row, column=9, value=total)
    set_widths(ws, [17, 26, 9, 8, 16, 24, 16, 12, 14])
    style_range(ws, 2, row, formats=(None, None, None, None, None, None, None, None, "#,##0"))
    return ws


def build_cost_sheet(wb, products):
    ws = wb.create_sheet("仕入れ原価一覧")
    set_widths(ws, [30, 17, 17, 16, 10, 15, 3, 14, 14, 14, 14, 14, 14, 14])
    ws.merge_cells("A1:F1")
    ws["A1"] = "仕入れ原価一覧（商品ごとの原価と1個あたり粗利）"
    ws["A1"].font = TITLE_FONT
    ws["A1"].fill = TITLE_FILL
    ws["A1"].alignment = LEFT
    ws.row_dimensions[1].height = 34
    ws.row_dimensions[2].height = 32
    write_headers(ws, 2, [
        "商品名", "販売価格(平均・円)", "仕入れ原価(単価・円)", "1個あたり粗利(円)", "販売数量", "売上原価(円)"
    ])

    for i, p in enumerate(products, start=3):
        qty = to_int(p.get("quantity", 0))
        avg = to_int(p.get("avg_unit_price", 0))
        cost = to_int(p.get("cost_unit", 0))
        ws.cell(row=i, column=1, value=str(p.get("product_name", "")))
        ws.cell(row=i, column=2, value=avg)
        ws.cell(row=i, column=3, value=cost)
        ws.cell(row=i, column=4, value="=B{0}-C{0}".format(i))
        ws.cell(row=i, column=5, value=qty)
        ws.cell(row=i, column=6, value="=C{0}*E{0}".format(i))
        style_range(ws, i, i, {2: "yen", 3: "yen", 4: "yen", 5: "count", 6: "yen"}, center_cols=(5,))
        ws.row_dimensions[i].height = 22
        ws.cell(row=i, column=4).font = Font(name="メイリオ", size=10, bold=True, color="15803D")
        if cost <= 0:
            ws.cell(row=i, column=3).font = Font(name="メイリオ", size=10, color="B91C1C")

    total_row = 3 + len(products)
    data_end = max(2, total_row - 1)
    ws.cell(row=total_row, column=1, value="合計")
    total_row_style(ws.cell(row=total_row, column=1), LEFT)
    for col, fmt in [(2, "yen"), (3, "yen"), (4, "yen"), (5, "count"), (6, "yen")]:
        total_row_style(ws.cell(row=total_row, column=col), RIGHT, fmt)
    ws.cell(row=total_row, column=3, value="=IF(E{0}=0,0,F{0}/E{0})".format(total_row))
    ws.cell(row=total_row, column=5, value="=SUM(E3:E{0})".format(data_end))
    ws.cell(row=total_row, column=6, value="=SUM(F3:F{0})".format(data_end))
    ws.row_dimensions[total_row].height = 22

    note_row = total_row + 2
    notes = [
        "※ 仕入れ原価は「売上状況」画面ではなく、管理画面の「仕入れ原価の登録」で商品ごとに設定します。",
        "※ 赤文字の商品は仕入れ原価が未登録です（原価0円として計算されます）。",
    ]
    for idx, txt in enumerate(notes):
        ws.merge_cells(start_row=note_row + idx, start_column=1, end_row=note_row + idx, end_column=6)
        c = ws.cell(row=note_row + idx, column=1, value=txt)
        c.font = NOTE_FONT
        c.alignment = LEFT
        ws.row_dimensions[note_row + idx].height = 20

    if products:
        profit_unit = BarChart()
        profit_unit.type = "col"
        profit_unit.style = 12
        profit_unit.title = "1個あたり粗利"
        profit_unit.legend = None
        profit_unit.gapWidth = 45
        profit_unit.add_data(Reference(ws, min_col=4, min_row=2, max_row=total_row - 1), titles_from_data=True)
        profit_unit.set_categories(Reference(ws, min_col=1, min_row=3, max_row=total_row - 1))
        profit_unit.width = 13.0
        profit_unit.height = 8.2
        if profit_unit.series:
            profit_unit.series[0].graphicalProperties.solidFill = "15803D"
        ws.add_chart(profit_unit, "H3")

    ws.auto_filter.ref = "A2:F{0}".format(total_row)
    ws.freeze_panes = "A3"


def build_workbook(d):
    range_info = d.get("range") or {}
    summary = d.get("summary") or {}
    prev = d.get("prev")
    products = d.get("products") or []
    orders = d.get("orders") or []
    range_label = str(range_info.get("label") or "")
    now_jst = str(range_info.get("nowJst") or "")

    wb = Workbook()
    build_product_sheet(wb, products)
    build_summary_sheet(wb, range_label, now_jst, summary)
    build_compare_sheet(wb, range_label, prev)
    build_order_sheet(wb, orders)
    disposals = d.get("disposals") or []
    if disposals:
        build_disposal_sheet(wb, disposals)
    build_cost_sheet(wb, products)
    return wb


def build_xlsx_bytes(payload):
    wb = build_workbook(payload or {})
    buf = io.BytesIO()
    wb.save(buf)
    raw = buf.getvalue()
    label = str((payload.get("range") or {}).get("label") or "期間") \
        .replace("\\", "_").replace("/", "_").replace(":", "_") \
        .replace("*", "_").replace("?", "_").replace('"', "_") \
        .replace("<", "_").replace(">", "_").replace("|", "_") \
        .replace("～", "_").replace("~", "_").strip() or "期間"
    fname = f"OFFICE NAGAZON売上_{label}.xlsx"
    return raw, fname


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        self.send_response(405)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps({"error": "method_not_allowed"}).encode("utf-8"))

    def do_POST(self):
        try:
            length = int(self.headers.get("content-length", "0") or "0")
            raw_body = self.rfile.read(length) if length > 0 else b"{}"
            payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            raw, fname = build_xlsx_bytes(payload)
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            self.send_header("Content-Disposition", "attachment; filename*=UTF-8''{}".format(quote(fname)))
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}, ensure_ascii=False).encode("utf-8"))
