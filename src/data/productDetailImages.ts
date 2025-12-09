// src/data/productDetailImages.ts

// ★ 商品ごとの説明画像をimport
// ファイル名やパスは自分のフォルダ構成に合わせて直してね
import desc12 from "./商品説明画像/辛ラーメン説明.png";
// 必要なだけ追加…

type ProductDetailImageMaster = {
  id: number;      // products.id と合わせる
  image: string;   // 読み込んだ画像のパス
};

// ★ id ごとに対応させる
export const PRODUCT_DETAIL_IMAGES: ProductDetailImageMaster[] = [
  { id: 12, image: desc12 },
  // { id: 3, image: desc3 }, みたいに追加していく
];

// id から説明画像を探す
export const findProductDetailImage = (
  id: number
): string | undefined => {
  return PRODUCT_DETAIL_IMAGES.find((p) => p.id === id)?.image;
};