import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// ローカル開発（npm run dev）でも決済API（VPS）を使えるよう /api を転送する
// ※ メール送信系（Vercel関数）は本番のみ。ローカルでは失敗しても購入処理は止まりません
const VPS = 'http://161.33.19.160:3000'
const vpsApi = ['/api/create-paypay-order', '/api/confirm-paypay-payment', '/api/cancel-paypay-order', '/api/order-status']

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(vpsApi.map((p) => [p, { target: VPS, changeOrigin: true }])),
  },
})
