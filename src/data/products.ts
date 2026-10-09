// src/data/products.ts
import img1 from "./商品画像/じゃがりこサラダ.jpg";
import img6 from "./商品画像/ラムネ.webp";
import img7 from "./商品画像/めいらくアイス.jpg";
import img10 from "./商品画像/大粒ラムネ.jpg";
import img11 from "./商品画像/チョコチップクッキー.png";
import img12 from "./商品画像/グミのわグレープ＆マスカット味.jpg";
import img13 from "./商品画像/グミのわ コーラ＆ソーダ味.jpg";
import img14 from "./商品画像/忍者飯めし 巨峰.jpg";
import img15 from "./商品画像/忍者めし ラムネ.avif";
import img16 from "./商品画像/コアラのマーチ.jpg";
import img17 from "./商品画像/タフグミ.jpgg";
import img18 from "./商品画像/フットチーネグミイタリアングレープ味.webp";
import img19 from "./商品画像/フットチーネグミコーラ味.jpg";
import img20 from "./商品画像/つぶグミ ソーダ.jp";
import img21 from "./商品画像/つぶグミ.jp";

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
];

// id から画像パスを取る関数（なければ undefined）
export const findProductImage = (id: number): string | undefined =>
  PRODUCT_IMAGES.find((p) => p.id === id)?.imageData;
