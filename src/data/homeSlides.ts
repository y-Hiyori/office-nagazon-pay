// src/data/homeSlides.ts

// ✅ src 配下の画像は import して使う（Vite）
import appHero from "./商品ヒーロー/hero_app.png";
import herbHero from "./商品ヒーロー/hero_herb.png";
import onigiriHero from "./商品ヒーロー/hero_onigiri.png";
import Herogame from "./商品ヒーロー/hero_game.png";

export type HomeSlide = {
  id: string;
  title: string;
  desc: string;
  image: string;       // ✅ importした画像URLが入る
  link?: string;       // 任意：空なら /products 扱い
  buttonText?: string; // 任意：空なら「詳しく見る」
  isVisible?: boolean;
  sortOrder?: number;
};

export const HOME_SLIDES: HomeSlide[] = [
  {
    id: "app",
    title: "決済アプリ登場！",
    desc: "株式会社NAGAZON",
    image: appHero,
    link: "/how-to",
    buttonText: "使い方を見る",
    isVisible: true,
    sortOrder: 2,
  },
  {
    id: "herb",
    title: "ハーバリウムペン",
    desc: "商品をチェック",
    image: herbHero,
    link: "/products/2",
    buttonText: "商品を見る",
    isVisible: true,
    sortOrder: 3,
  },
  {
    id: "onigiri",
    title: "黒豆おにぎり",
    desc: "商品をチェック",
    image: onigiriHero,
    link: "/products/1",
    buttonText: "商品を見る",
    isVisible: true,
    sortOrder: 4,
  },

   {
    id: "game",
    title: "がん細胞キラー",
    desc: "がん細胞をやっつけよう！！",
    image: Herogame,
    link: "/game",
    buttonText: "プレイ",
    isVisible: true,
    sortOrder: 1,
  },
];