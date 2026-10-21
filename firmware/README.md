# NAGAZON Guard（見守り端末）

店頭の「支払ったのに在庫が合わない」を減らすための、M5Stack 2台を使った見守りシステムです。

- **M5Stack Basic** … 店頭ハブ。監視状態の表示、不審時のブザー、補充モード、テスト通知。
- **M5Stack Timer Camera X** … 証拠カメラ。棚の決まった範囲を一定間隔で見て、動きがあったときだけ撮影・送信。

追加部品・新しい有料サービスは使いません。クラウドは既存の Supabase / Vercel の無料枠、通知は Teams の無料 Webhook（届かない場合は EmailJS の無料枠）です。

---

## 1. 仕組み

```
[Timer Camera X]
  15秒ごとに起きる（USB給電なら5秒も可）
  棚のROIを撮影 → 前回との差分で動きを判定
        │ 変化あり → 5秒後にもう一度確認
        │   ├ 手が入って出ただけ → 通知しない
        │   └ 商品が減ったまま → 証拠として送信
        ▼
[Vercel API /api/guard-event]
  端末トークンを確認
  直近20分の「支払い済み・受け取り待ち」注文と照合
        ├ 一致 → その注文を「受け取り済み」に更新（記録）
        └ 不一致 → 不審イベント＋証拠画像を保存
                    → Teams / メールへ通知
        ▼
[Supabase]
  guard_events / guard_devices / guard_settings
  guard-evidence（非公開Storage・7日で自動削除）
        ▼
[管理画面 /admin-guard]
  写真・注文・対応メモ・通知設定
[管理画面 /admin-inventory]
  棚卸しの差異を記録・分析
```

### 受け取りコード

決済が `paid` になった店頭受け取りの注文には、DBトリガーが6桁の受け取りコードを自動発行します（発送商品は対象外）。
購入完了画面と注文詳細に表示され、スタッフが目視確認できます。コードは24時間で期限切れになります。

### 照合の考え方

- カメラは「誰が」ではなく「棚に動きがあった時刻」を記録します。
- その時刻の前20分以内に、支払い済みで未受け取りの注文があれば「受け取り」とみなします。
- ない場合は「不審」として写真つきで残します。
- 完全な犯人特定ではなく、**記録・抑止・再発分析**のための仕組みです。写真と注文・棚卸しを組み合わせて判断してください。

---

## 2. 最初にやること（クラウド側）

1. Supabase の SQL Editor で `supabase_v46_guard.sql` を実行します。
2. アプリを Vercel にデプロイします（`api/guard-event.js` / `api/guard-notify.js` / `api/guard-cleanup.js` が有効になります）。
3. **既存のVPS（PayPay API）も更新します。** 購入完了画面の受け取りコードは VPS の `/api/order-status` が返すため、`vps/server.cjs` を反映しないと表示されません。

   ```bash
   ssh opc@161.33.19.160 'cp /home/opc/paypay-api/server.cjs /home/opc/paypay-api/server.cjs.bak_$(date +%Y%m%d)'
   scp vps/server.cjs opc@161.33.19.160:/home/opc/paypay-api/server.cjs
   ssh opc@161.33.19.160 'cd /home/opc/paypay-api && node --check server.cjs && sudo systemctl restart nagazonpay.service && curl -s http://127.0.0.1:3000/api/health'
   ```

4. Vercel の環境変数を確認します。

| 変数 | 必須 | 用途 |
|---|---|---|
| `SUPABASE_URL` | 必須 | 既存と同じ |
| `SUPABASE_SERVICE_ROLE_KEY` | 必須 | 既存と同じ |
| `APP_BASE_URL` | 推奨 | Teamsの「管理画面を開く」URL。例 `https://your-app.vercel.app` |
| `EMAILJS_CONTACT_TEMPLATE_ID` | 任意 | Teamsが届かないときのメール送信 |
| `EMAILJS_SERVICE_ID` / `EMAILJS_PUBLIC_KEY` / `EMAILJS_PRIVATE_KEY` | 任意 | 同上 |
| `CRON_SECRET` | 任意 | 毎日の画像削除Cronの保護（Vercelが自動で付与） |

5. 管理画面 `/admin-guard` → 「設定」を開きます。
   - 監視ON
   - 開店・閉店時刻
   - Teams Webhook URL（下の手順）
   - 「テスト通知を送る」で届くか確認
6. 「端末」欄の **端末トークン** をコピーします。Basic と Camera の両方に同じ値を設定します。

### Teams の無料 Webhook

1. Teams のチャネル右上「…」→「ワークフロー」。
2. 「Webhook 要求を受信したときに投稿する」を追加。
3. 発行された URL を `/admin-guard` の「Teams Webhook URL」に貼り付け。
4. 「テスト通知を送る」で確認。

届かない場合は、EmailJS の連絡用テンプレートでメール送信します（`EMAILJS_CONTACT_TEMPLATE_ID` などが設定されている場合）。

---

## 3. 端末の書き込み

### 共通

- PlatformIO Core を入れます（VS Code の PlatformIO 拡張でも可）。
- `src/config.example.h` を `src/config.h` にコピーし、Wi-Fi・API URL・端末トークンを書き換えます。
- **Wi-Fi は 2.4GHz の WPA2-Personal（パスワード方式）のみ**です。5GHz専用SSIDや、ID/パスワードが必要な企業認証Wi-Fi（eduroam等）には接続できません。必要なら2.4GHzの別SSIDやモバイルルーターを用意してください。
- `config.h` は `.gitignore` 済みです。トークンをコミットしないでください。

### M5Stack Basic（店頭ハブ）

```bash
cd firmware/basic
cp src/config.example.h src/config.h
# config.h を編集
pio run -t upload
pio device monitor
```

- USB-C で給電します。コンセントを使いたくない場合は、モバイルバッテリーから給電してください（Basic は約 100〜150mA）。
- 画面の表示は英語です（日本語フォントを載せると容量を食うため）。意味は次のとおりです。

| 表示 | 意味 |
|---|---|
| `MONITOR` | 監視中 |
| `OFF` | 監視OFF（記録のみ） |
| `RESTOCK` | 補充モード（ローカルのブザーを10分止める） |
| `ALERT` | 不審な動き。Aボタンで警報停止 |
| `A: alarm/restock` | 警報停止／補充モード |
| `B: info` | 画面切替 |
| `C: test` | Teamsへテスト通知 |

### Timer Camera X（証拠カメラ）

```bash
cd firmware/camera
cp src/config.example.h src/config.h
# config.h を編集
pio run -t upload
pio device monitor
```

- 書き込み時は、本体のリセットボタン／PWRボタンの扱いに注意してください（M5Burner と同じ要領）。
- macOS で認識しない場合は FTDI の VCP ドライバが必要なことがあります。
- 内蔵バッテリーは **140mAh** と非常に小さいため、15秒間隔でも半日〜1日程度しかもちません。**USB給電（モバイルバッテリー可）を強く推奨**します。
- USB給電の場合は `config.h` の `WAKE_INTERVAL_SEC` を `5` にすると取り逃しが減ります。
- 磁石で金属板に固定できます。画角は 66.5° です。

### 電源の方針（コンセントを使わない場合）

- Basic：モバイルバッテリー（5,000〜10,000mAh）から USB 給電。画面とWi-Fiで約1〜3日。
- Camera：内蔵バッテリー＋必要なら同じモバイルバッテリーから USB 給電。
- 2台を1つのバッテリーで賄う場合は、USB 2ポートのものを使用してください。
- バッテリー残量は管理画面の「端末」タブで確認できます（Camera の残量は概算です）。

---

## 4. 設置

1. カメラを棚の斜め上（1.5〜2.5m程度）に固定します。**棚全体と手元が同時に写る**画角にします。
2. 管理画面 `/admin-guard` → 「設定」→「証拠画像」のプレビューで、赤い枠が棚に合うように `x / y / w / h` を調整します。
3. 感度は最初 `18` のままにします。人が通るだけで反応する場合は `24`〜`30` に上げます。
4. Basic をレジ横に置き、画面が見えるようにします。
5. 「テスト通知を送る」で Teams に届くことを確認します。
6. カメラの前で手を動かし、`/admin-guard` にイベントと写真が出ることを確認します。

### 画角のコツ

- 棚の商品と、取ろうとする手が同じフレームに入るようにします。
- 逆光を避けます。蛍光灯の真下はちらつきの原因になります。
- 人の顔をアップで撮る必要はありません。「棚・商品・手元」が主役です。

---

## 5. 運用

### 毎日

- `/admin-guard` の「未対応」を確認します。
- 不審イベントは写真を見て「問題なし」「解決済み」「対象外」を選び、必要ならメモを残します。
- 補充するときは Basic の A ボタンで「補充モード」にします（ローカルのブザーのみ停止。記録は続きます）。

### 週1回

- `/admin-inventory` で棚卸しをします。帳簿在庫と実数を入力して保存します。
- 「よく合わない商品」を見て、棚の位置・画角・動線を見直します。

### 月1回

- カメラのレンズ・画角・バッテリーを確認します。
- 管理画面の「端末」で最終通信が3分以内か確認します。
- 証拠画像・5秒録画は保存期間（初期7日）を過ぎると毎日自動削除されます。

### 誤検知が多いとき

1. 感度を上げる（18 → 24 → 30）。
2. ROI を棚の商品だけに絞る。
3. 開店・閉店時刻を実際に合わせる。
4. カメラを人の動線から外す。
5. どうしても多い場合は「監視OFF」にして記録だけ残す。

---

## 6. プライバシーと掲示（必ず学校と相談）

校内にカメラを置く場合は、次の点を学校側と決めてください。

- 設置目的（盗難防止・証拠保全）と設置場所
- 写す範囲（棚と手元を中心にし、顔のアップは避ける）
- 保存期間（初期7日）と削除方法
- 閲覧できる人（管理者のみ）
- 利用目的外に使わないこと
- 公立学校の場合は教育委員会の規程・学校長の許可

掲示物の例（印刷して棚の近くに貼る）:

```
【防犯カメラ作動中】
この売店には、商品の持ち去り防止のため防犯カメラを設置しています。
写している範囲：商品棚と手元
保存期間：7日（自動削除）
映像は盗難防止の目的にのみ使用し、管理者以外は閲覧できません。
設置者：NAGAZON　お問い合わせ：〈学校の連絡先〉
```

---

## 7. トラブルシューティング

| 症状 | 確認すること |
|---|---|
| 端末が「オフライン」 | 2.4GHz Wi-Fiか / WPA2-Personalか / SSID・パスワード / API URL / 端末トークン / 学校ネットワークがVercel・Supabaseへの通信を許可しているか |
| `401 BAD_TOKEN` | 管理画面でトークンを再確認。再発行した場合は両端末を更新 |
| 写真が送られない | `ps_malloc` 失敗（PSRAM設定）/ Wi-Fi電波 / API URL |
| イベントが増えない | 監視ONか / 営業時間内か / 感度が高すぎないか / レンズキャップ |
| 誤検知が多い | 感度を上げる / ROIを狭める / 人の動線を外す |
| Teamsに届かない | Webhook URL / ワークフローの権限 / 「テスト通知」の結果表示 |
| 画像が表示されない | 保存期間切れ / StorageのRLS / 管理者でログインしているか |
| Basicの画面が真っ暗 | USB給電 / 書き込みポート / `M5.begin()` のボード設定 |

---

## 8. 無料枠の目安

- Supabase Storage 1GB：SVGA JPEG（約60〜100KB）を1日50枚保存しても、7日で約35MB。余裕があります。
- 証拠画像は**不審時だけ**保存する設計です。通常の受け取りでは保存しません。
- Vercel Cron は1日1回の画像削除に使用します。
- Teams Webhook・EmailJS（月200通）は無料枠の範囲です。
- 新しい有料サービスは使いません。

---

## 9. ファイル構成

```
firmware/
  basic/
    platformio.ini
    src/config.example.h
    src/main.cpp
  camera/
    platformio.ini
    src/config.example.h
    src/main.cpp
```

クラウド側:

```
supabase_v46_guard.sql       … テーブル・RLS・受け取りコード・棚卸し
api/_guard.js                … 通知・時刻・共通処理
api/guard-event.js           … 端末からの受信・注文照合
api/guard-notify.js          … 管理画面のテスト通知
api/guard-cleanup.js         … 期限切れ画像の削除（Cron）
src/pages/AdminGuard.tsx     … 見守りダッシュボード
src/pages/AdminInventory.tsx … 棚卸し・在庫差異
```
