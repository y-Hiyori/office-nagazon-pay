// supabase/functions/paypay-create-order/index.ts
// Deno ランタイム用の HTTP サーバ
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req: Request): Promise<Response> => {
  // ----- Preflight (OPTIONS) 対応 -----
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // ----- フロントから送られてきたデータ -----
  const { total, items } = await req.json();

  // ★ 今は「準備モード」：環境変数がなくてもエラーにしない
  const apiKey = Deno.env.get("PAYPAY_API_KEY") || "";
  const apiSecret = Deno.env.get("PAYPAY_API_SECRET") || "";
  const merchantId = Deno.env.get("PAYPAY_MERCHANT_ID") || "";

  console.log("PayPay config(check only length):", {
    apiKeyLen: apiKey.length,
    apiSecretLen: apiSecret.length,
    merchantId,
    total,
    itemsCount: Array.isArray(items) ? items.length : 0,
  });

  // ──────────────────────────────
  // 本当はここで PayPay の API を叩いて決済用 URL を作る
  // （Create Payment のサンプルコードを公式ドキュメントからコピペしてここに入れる）
  // ──────────────────────────────

  // 今は「絶対にアクセスできるページ」をダミーにしておく
  // → とりあえず画面遷移することだけ確認する用
  const redirectUrl = "https://paypay.ne.jp/" as string;

  return new Response(JSON.stringify({ redirectUrl }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});