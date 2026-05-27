// src/data/homeSlides.ts

// ✅ src 配下の画像は import して使う（Vite）
import appHero from "./商品ヒーロー/hero_app.png";
import Herogame from "./商品ヒーロー/hero_game.png";
import pureb from "./商品ヒーロー/2.png";
import purem from "./商品ヒーロー/3.png";
import ramune from "./商品ヒーロー/4.png";
import jagas from "./商品ヒーロー/5.png";
import jagac from "./商品ヒーロー/6.png";
import jagab from "./商品ヒーロー/7.png";

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
    sortOrder: 1,
  },
  {
    id: "pureb",
    title: "ピュレグミ グレープ",
    desc: "商品をチェック",
    image: pureb,
    link: "/products/4",
    buttonText: "商品を見る",
    isVisible: true,
    sortOrder: 2,
  },
  {
    id: "purem",
    title: "ピュレグミ マスカット",
    desc: "商品をチェック",
    image: purem,
    link: "/products/5",
    buttonText: "商品を見る",
    isVisible: true,
    sortOrder: 3,
  },

  {
    id: "ramune",
    title: "ラムネ",
    desc: "商品をチェック",
    image: ramune,
    link: "/products/6",
    buttonText: "商品を見る",
    isVisible: true,
    sortOrder: 4,
  },

  {
    id: "jagas",
    title: "じゃがりこ サラダ",
    desc: "商品をチェック",
    image: jagas,
    link: "/products/1",
    buttonText: "商品を見る",
    isVisible: true,
    sortOrder: 5,
  },

  {
    id: "jagac",
    title: "じゃがりこ チーズ",
    desc: "商品をチェック",
    image: jagac,
    link: "/products/2",
    buttonText: "商品を見る",
    isVisible: true,
    sortOrder: 6,
  },

  {
    id: "jagab",
    title: "じゃがりこ バター",
    desc: "商品をチェック",
    image: jagab,
    link: "/products/3",
    buttonText: "商品を見る",
    isVisible: true,
    sortOrder: 7,
  },

   {
    id: "game",
    title: "がん細胞キラー",
    desc: "がん細胞をやっつけよう！！",
    image: Herogame,
    link: "/game",
    buttonText: "プレイ",
    isVisible: true,
    sortOrder: 8,
  },
];