alter table public.products
  add column if not exists cost integer;

comment on column public.products.cost is '商品原価（1個あたり・円）。売上Excelの粗利計算に使用';
