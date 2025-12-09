// src/data/products.ts
import img1 from "./商品画像/黒豆おにぎり.png";
import img2 from "./商品画像/ハーバリウムペン.png";
import img3 from "./商品画像/うるたばワックス.png";
import img4 from "./商品画像/パスタ.png";
import img5 from "./商品画像/抹茶モンブラン.png";
import img6 from "./商品画像/雪だるま.png";
import img7 from "./商品画像/カンデミーナ.png";
import img8 from "./商品画像/ハリボーゴールドベア.png";
import img9 from "./商品画像/しゃりもにグミグレープ.png";
import img10 from "./商品画像/ポテトチップスうすしお.png";
import img11 from "./商品画像/カップヌードル.png";
import img12 from "./商品画像/辛ラーメン.png";
// 画像だけのマスタ
export type ProductImageMaster = {
  id: number;        // products テーブルの id と合わせる
  imageData: string; // import した画像パス
};

// 画像マスタ（名前・価格は Supabase 側）
export const PRODUCT_IMAGES: ProductImageMaster[] = [
  { id: 1, imageData: img1 },
  { id: 2, imageData: img2 },
  { id: 3, imageData: img3 },
  { id: 4, imageData: img4 },
  { id: 5, imageData: img5 },
  { id: 6, imageData: img6 },
  { id: 7, imageData: img7 },
  { id: 8, imageData: img8 },
  { id: 9, imageData: img9 },
  { id: 10, imageData: img10 },
  { id: 11, imageData: img11 },
  { id: 12, imageData: img12 },
];

// id から画像パスを取る関数（なければ undefined）
export const findProductImage = (id: number): string | undefined =>
  PRODUCT_IMAGES.find((p) => p.id === id)?.imageData;