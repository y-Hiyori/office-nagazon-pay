#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vercel Python Function: /api/export-sales-xlsx
売上Excel（本物のExcelグラフ + 積極的なセル数式 + 見やすい商品別売上）を生成する。
"""
import io
import json
from urllib.parse import quote
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, PieChart, Reference

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
ONE_DEC = "0.0"


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
    elif fmt == "one":
        cell.number_format = ONE_DEC


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
            if c in center_set:
                cell.alignment = CENTER
            elif formats.get(c) in ("yen", "count", "pct", "one"):
                cell.alignment = RIGHT
            else:
                cell.alignment = LEFT
            cell.border = BORDER
            if formats.get(c) == "yen":
                cell.number_format = YEN
            elif formats.get(c) == "count":
                cell.number_format = COUNT
            elif formats.get(c) == "pct":
                cell.number_format = PCT
            elif formats.get(c) == "one":
                cell.number_format = ONE_DEC


def build_product_sheet(wb, products):
    ws = wb.active
    ws.title = "商品別売上"
    bar_cells = 10
    total_cols = 8 + bar_cells * 2
    set_widths(ws, [30, 14, 9, 16, 14, 14, 16, 11] + [2] * (bar_cells * 2))
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=total_cols)
    ws["A1"] = "商品別売上（見やすい一覧 + グラフ用データ）"
    ws["A1"].font = TITLE_FONT
    ws["A1"].fill = TITLE_FILL
    ws["A1"].alignment = LEFT
    ws.row_dimensions[1].height = 32
    write_headers(ws, 2, [
        "商品名", "売価(平均・円)", "数量", "売上計算(割引前・円)", "クーポン割引(円)",
        "ポイント充当(円)", "入金売上(割引後・円)", "売上構成比", "売上棒 ▶", *([""] * (bar_cells - 1)), "数量棒 ▶", *([""] * (bar_cells - 1))
    ])

    total_sales = max(1, sum(to_int(p.get("subtotal_after_discount", 0)) for p in products))
    max_sales = max([1] + [to_int(p.get("subtotal_after_discount", 0)) for p in products])
    max_qty = max([1] + [to_int(p.get("quantity", 0)) for p in products])

    for i, p in enumerate(products, start=3):
        qty = to_int(p.get("quantity", 0))
        avg_price = to_int(p.get("avg_unit_price", 0))
        subtotal_raw = to_int(p.get("subtotal_raw", 0))
        coupon_yen = to_int(p.get("couponYen", 0))
        points_yen = to_int(p.get("pointsYen", 0))
        sales_after = to_int(p.get("subtotal_after_discount", 0))
        share = (sales_after / total_sales) if total_sales else 0

        ws.cell(row=i, column=1, value=str(p.get("product_name", "")))
        ws.cell(row=i, column=2, value=avg_price)
        ws.cell(row=i, column=3, value=qty)
        ws.cell(row=i, column=4, value=f"=B{i}*C{i}")
        ws.cell(row=i, column=5, value=coupon_yen)
        ws.cell(row=i, column=6, value=points_yen)
        ws.cell(row=i, column=7, value=f"=D{i}-E{i}-F{i}")
        ws.cell(row=i, column=8, value=f"=IF($G${len(products)+3}=0,0,G{i}/$G${len(products)+3})")

        style_range(ws, i, i, {2: "yen", 3: "count", 4: "yen", 5: "yen", 6: "yen", 7: "yen", 8: "pct"}, center_cols=(3,))
        ws.cell(row=i, column=7).font = Font(name="メイリオ", size=10, bold=True)

        sales_cells = max(1 if sales_after > 0 else 0, round((sales_after / max_sales) * bar_cells))
        qty_cells = max(1 if qty > 0 else 0, round((qty / max_qty) * bar_cells))
        for b in range(bar_cells):
            a = ws.cell(row=i, column=9 + b)
            a.fill = PatternFill("solid", fgColor="4F46E5" if b < sales_cells else "E2E8F0")
            a.border = BORDER
            q = ws.cell(row=i, column=9 + bar_cells + b)
            q.fill = PatternFill("solid", fgColor="0EA5E9" if b < qty_cells else "E2E8F0")
            q.border = BORDER

    total_row = 3 + len(products)
    ws.cell(row=total_row, column=1, value="合計")
    total_row_style(ws.cell(row=total_row, column=1), LEFT)
    for col, fmt in [(2, "yen"), (3, "count"), (4, "yen"), (5, "yen"), (6, "yen"), (7, "yen"), (8, "pct")]:
        total_row_style(ws.cell(row=total_row, column=col), RIGHT, fmt)
    data_end = max(2, total_row - 1)
    ws.cell(row=total_row, column=2, value=f"=IF(C{total_row}=0,0,D{total_row}/C{total_row})")
    ws.cell(row=total_row, column=3, value=f"=SUM(C3:C{data_end})")
    ws.cell(row=total_row, column=4, value=f"=SUM(D3:D{data_end})")
    ws.cell(row=total_row, column=5, value=f"=SUM(E3:E{data_end})")
    ws.cell(row=total_row, column=6, value=f"=SUM(F3:F{data_end})")
    ws.cell(row=total_row, column=7, value=f"=SUM(G3:G{data_end})")
    ws.cell(row=total_row, column=8, value="=1")
    for c in range(9, total_cols + 1):
        total_row_style(ws.cell(row=total_row, column=c), RIGHT)

    note_row = total_row + 2
    notes = [
        "※ 入金売上(割引後) ＝ 売上計算(割引前) − クーポン割引 − ポイント充当 です。",
        "※ グラフは『入金売上』と『数量』がひと目で分かるようにしています。",
    ]
    for i, txt in enumerate(notes):
        ws.merge_cells(start_row=note_row + i, start_column=1, end_row=note_row + i, end_column=total_cols)
        c = ws.cell(row=note_row + i, column=1, value=txt)
        c.font = NOTE_FONT
        c.alignment = LEFT

    if products:
        sales_chart = BarChart()
        sales_chart.type = "col"
        sales_chart.style = 10
        sales_chart.title = "商品別入金売上"
        sales_chart.y_axis.title = "円"
        sales_chart.add_data(Reference(ws, min_col=7, min_row=2, max_row=total_row - 1), titles_from_data=True)
        sales_chart.set_categories(Reference(ws, min_col=1, min_row=3, max_row=total_row - 1))
        sales_chart.width = 19
        sales_chart.height = 9
        if sales_chart.series:
            sales_chart.series[0].graphicalProperties.solidFill = "4F46E5"
        ws.add_chart(sales_chart, "V3")

        qty_chart = BarChart()
        qty_chart.type = "col"
        qty_chart.style = 11
        qty_chart.title = "商品別販売個数"
        qty_chart.y_axis.title = "個"
        qty_chart.add_data(Reference(ws, min_col=3, min_row=2, max_row=total_row - 1), titles_from_data=True)
        qty_chart.set_categories(Reference(ws, min_col=1, min_row=3, max_row=total_row - 1))
        qty_chart.width = 19
        qty_chart.height = 9
        if qty_chart.series:
            qty_chart.series[0].graphicalProperties.solidFill = "0EA5E9"
        ws.add_chart(qty_chart, "V22")

        pie = PieChart()
        pie.title = "売上構成比"
        pie.add_data(Reference(ws, min_col=7, min_row=3, max_row=total_row - 1), titles_from_data=False)
        pie.set_categories(Reference(ws, min_col=1, min_row=3, max_row=total_row - 1))
        pie.width = 13
        pie.height = 9
        ws.add_chart(pie, "V41")

    ws.freeze_panes = "A3"
    return total_row


def build_summary_sheet(wb, range_label, now_jst, summary, product_total_row):
    ws = wb.create_sheet("売上サマリー", 0)
    set_widths(ws, [26, 18, 52])
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
        ("クーポン割引", to_int(summary.get("couponDiscount", 0)), f"{to_int(summary.get('couponOrderCount', 0))} 件で使用（引く）"),
        ("ポイント充当", to_int(summary.get("pointsTotal", 0)), f"{to_int(summary.get('pointsOrderCount', 0))} 件で使用（引く）"),
        ("入金売上", None, "＝ 商品売上 − クーポン割引 − ポイント充当"),
        ("注文件数", to_int(summary.get("orderCount", 0)), "支払い完了した注文数"),
        ("平均注文単価", None, "＝ 入金売上 ÷ 注文件数"),
        ("販売個数", None, "＝ 商品別売上シートの数量合計"),
        ("1注文あたり販売個数", None, "＝ 販売個数 ÷ 注文件数"),
    ]

    for i, (label, val, note) in enumerate(rows, start=3):
        ws.cell(row=i, column=1, value=label)
        if val is not None:
            ws.cell(row=i, column=2, value=val)
        ws.cell(row=i, column=3, value=note)

    style_range(ws, 3, 12, {2: "yen"})
    ws["B9"].number_format = COUNT
    ws["B11"].number_format = COUNT
    ws["B12"].number_format = ONE_DEC
    ws["B8"] = "=B5-B6-B7"
    ws["B10"] = "=IF(B9=0,0,B8/B9)"
    ws["B11"] = f"='商品別売上'!C{product_total_row}"
    ws["B12"] = "=IF(B9=0,0,B11/B9)"
    for addr, fmt in [("B8", YEN), ("B9", COUNT), ("B10", YEN), ("B11", COUNT), ("B12", ONE_DEC)]:
        ws[addr].number_format = fmt
        ws[addr].alignment = RIGHT
        ws[addr].font = Font(name="メイリオ", size=11 if addr == "B8" else 10, bold=True)
    ws["B8"].fill = HIGHLIGHT_FILL

    notes = [
        "入金売上 ＝ お客様から実際にいただいた金額です。",
        "商品別売上シートでは、商品名・売価・数量・売上計算・値引き・入金売上・構成比を表形式で確認できます。",
        "数式を入れているので、Excel上でセルを選ぶと計算式を確認できます。",
    ]
    for i, txt in enumerate(notes, start=14):
        ws.merge_cells(start_row=i, start_column=1, end_row=i, end_column=3)
        c = ws.cell(row=i, column=1, value=txt)
        c.font = NOTE_FONT
        c.alignment = LEFT

    ws.freeze_panes = "A3"


def build_compare_sheet(wb, range_label, prev):
    ws = wb.create_sheet("期間比較")
    set_widths(ws, [24, 16, 16, 16, 14])
    prev_label = (prev or {}).get("label") or "前期"
    title = f"期間比較（{range_label} vs {prev_label}）" if prev else f"期間比較（{range_label}）"
    ws.merge_cells("A1:E1")
    ws["A1"] = title
    ws["A1"].font = TITLE_FONT
    ws["A1"].fill = TITLE_FILL
    ws["A1"].alignment = LEFT
    ws.row_dimensions[1].height = 32
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
        ws.cell(row=i, column=4).font = BOLD_FONT

    if prev:
        chart = BarChart()
        chart.type = "col"
        chart.style = 11
        chart.title = "今期 vs 前期"
        chart.add_data(Reference(ws, min_col=2, max_col=3, min_row=2, max_row=5), titles_from_data=True)
        chart.set_categories(Reference(ws, min_col=1, min_row=3, max_row=5))
        chart.width = 20
        chart.height = 10
        if len(chart.series) >= 2:
            chart.series[0].graphicalProperties.solidFill = "4F46E5"
            chart.series[1].graphicalProperties.solidFill = "CBD5E1"
        ws.add_chart(chart, "H3")

    ws.merge_cells("A7:E7")
    ws["A7"] = "増減 ＝ 今期 − 前期、増減率 ＝ 増減 ÷ 前期 です。"
    ws["A7"].font = NOTE_FONT
    ws["A7"].alignment = LEFT
    ws.freeze_panes = "A3"


def build_order_sheet(wb, orders):
    ws = wb.create_sheet("注文一覧")
    set_widths(ws, [30, 17, 15, 26, 12, 38, 14, 14, 15, 15, 14])
    ws.merge_cells("A1:K1")
    ws["A1"] = "注文一覧"
    ws["A1"].font = TITLE_FONT
    ws["A1"].fill = TITLE_FILL
    ws["A1"].alignment = LEFT
    ws.row_dimensions[1].height = 32
    write_headers(ws, 2, ["注文ID", "注文日時", "購入者名", "メール", "支払方法", "商品内訳", "小計(円)", "クーポンコード", "クーポン割引(円)", "ポイント充当(円)", "入金額(円)"])

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

    n = len(orders)
    if n > 0:
        style_range(ws, 3, 2 + n, {7: "yen", 9: "yen", 10: "yen", 11: "yen"}, center_cols=(5,))
    total_row = 3 + n
    ws.cell(row=total_row, column=1, value="合計")
    total_row_style(ws.cell(row=total_row, column=1), LEFT)
    for col in (7, 9, 10, 11):
        cell = ws.cell(row=total_row, column=col, value=f"=SUM({get_column_letter(col)}3:{get_column_letter(col)}{max(2, total_row - 1)})")
        total_row_style(cell, RIGHT, "yen")
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
    product_total_row = build_product_sheet(wb, products)
    build_summary_sheet(wb, range_label, now_jst, summary, product_total_row)
    build_compare_sheet(wb, range_label, prev)
    build_order_sheet(wb, orders)
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
        wb = build_workbook(d)
        buf = io.BytesIO()
        wb.save(buf)
        raw = buf.getvalue()
        label = str((d.get("range") or {}).get("label") or "期間") \
            .replace("\\", "_").replace("/", "_").replace(":", "_") \
            .replace("*", "_").replace("?", "_").replace('"', "_") \
            .replace("<", "_").replace(">", "_").replace("|", "_") \
            .replace("～", "_").replace("~", "_").strip() or "期間"
        fname = f"OFFICE NAGAZON売上_{label}.xlsx"
        from vercel_response import Response
        return Response(
            body=raw,
            status=200,
            headers={
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": "attachment; filename*=UTF-8''{}".format(quote(fname)),
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
