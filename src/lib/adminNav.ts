// src/lib/adminNav.ts
// 管理画面のメニュー定義（管理者メニュー画面・ヘッダーのドロワーで共通）
export type AdminNavItem = {
  label: string;
  path: string;
  icon: string;
  desc: string;
  tone?: "main" | "danger" | "warn";
};
export type AdminNavGroup = { title: string; note?: string; items: AdminNavItem[] };

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: "見守り",
    note: "店頭の防犯カメラ",
    items: [
      { label: "見守りダッシュボード", path: "/admin-guard", icon: "🛡", desc: "不審な動き・購入履歴・証拠写真・8秒録画", tone: "main" },
    ],
  },
  {
    title: "商品・在庫",
    items: [
      { label: "商品管理", path: "/admin-page", icon: "📦", desc: "商品の追加・編集、在庫・ロット、セール", tone: "main" },
      { label: "売上状況確認", path: "/admin-sales", icon: "📊", desc: "売上・粗利・廃棄ロス、Excel出力" },
      { label: "緊急修正（原価・廃棄ロス）", path: "/admin-corrections", icon: "🛠", desc: "入力ミスの原価・廃棄ロスを修正（履歴が残ります）", tone: "warn" },
    ],
  },
  {
    title: "お客様・販促",
    items: [
      { label: "注文検索・キャンセル", path: "/admin-orders", icon: "🔎", desc: "注文検索、キャンセル申請の対応・返金", tone: "warn" },
      { label: "決済失敗の整理", path: "/admin-failed-orders", icon: "🧹", desc: "未払い・決済失敗の注文をまとめて削除", tone: "danger" },
      { label: "ゲスト購入履歴", path: "/admin-guest-orders", icon: "🧾", desc: "アカウント未登録での購入" },
      { label: "アカウント管理", path: "/admin-users", icon: "👤", desc: "会員情報・購入履歴・ポイント" },
      { label: "クーポン管理", path: "/admin-coupons", icon: "🎟", desc: "割引クーポンの作成・停止" },
      { label: "ポイント管理", path: "/admin-points", icon: "💰", desc: "ポイントの付与・調整", tone: "danger" },
      { label: "お知らせ管理", path: "/admin-notices", icon: "📣", desc: "ホームのお知らせ" },
    ],
  },
  {
    title: "ゲーム",
    note: "スコアと報酬（クーポン）",
    items: [
      { label: "ゲームスコア管理", path: "/admin-game-scores", icon: "🏆", desc: "ランキング・スコア" },
      { label: "ゲーム報酬設定", path: "/admin-coupon-rewards", icon: "🎁", desc: "スコアに応じたクーポン" },
    ],
  },
];
