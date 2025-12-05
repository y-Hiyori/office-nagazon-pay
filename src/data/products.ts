// src/data/products.ts
import img1 from "./商品画像/黒豆おにぎり.png";
import img2 from "./商品画像/ハーバリウムペン.png";

// 画像だけのマスタ
export type ProductImageMaster = {
  id: number;        // products テーブルの id と合わせる
  imageData: string; // import した画像パス
};

// 画像マスタ（名前・価格は Supabase 側）
export const PRODUCT_IMAGES: ProductImageMaster[] = [
  { id: 1, imageData: img1 },
  { id: 2, imageData: img2 },
];

// id から画像パスを取る関数（なければ undefined）
export const findProductImage = (id: number): string | undefined =>
  PRODUCT_IMAGES.find((p) => p.id === id)?.imageData;