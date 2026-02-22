// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ✅ 開発中だけ：ブラウザConsoleから __sb で触れるようにする
if (import.meta.env.DEV) {
  (window as unknown as { __sb?: typeof supabase }).__sb = supabase;
}

// ============================
// 画像アップロード関数（修正版）
// ============================
export async function uploadImage(file: File): Promise<string | null> {
  try {
    const fileName = `${Date.now()}-${file.name}`;

    const { error } = await supabase.storage
      .from("product-images")
      .upload(fileName, file);

    if (error) {
      console.error("Upload Error:", error);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  } catch (e) {
    console.error("Unexpected upload error:", e);
    return null;
  }
}