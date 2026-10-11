# VPS（決済API）

本番の決済API（PayPay）は VPS `opc@161.33.19.160` の `/home/opc/paypay-api/server.cjs` で動いています。
このフォルダの `server.cjs` は **VPSに実際にデプロイされているもの** の写しです（ルートの `server.cjs` は古い版）。

## デプロイ
```bash
scp vps/server.cjs opc@161.33.19.160:/home/opc/paypay-api/server.cjs
ssh opc@161.33.19.160 'cd /home/opc/paypay-api && node --check server.cjs && sudo systemctl restart nagazonpay.service && curl -s http://127.0.0.1:3000/api/health'
```
※ 事前に `cp server.cjs server.cjs.bak_日付` でバックアップを取ってください。
