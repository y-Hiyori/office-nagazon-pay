#pragma once

// ============================================================
// M5Stack Timer Camera X（証拠カメラ）設定
//   config.example.h を config.h にコピーして値を書き換える
// ============================================================

// 学校のWi-Fi（2.4GHzのみ。5GHz専用SSIDには接続できません）
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASS "YOUR_WIFI_PASSWORD"

// 管理画面の「設定 → 端末」に表示されるURLとトークン
#define API_URL "https://your-app.vercel.app/api/guard-event"
#define DEVICE_TOKEN "PASTE_DEVICE_TOKEN_HERE"

#define FIRMWARE_VERSION "guard-camera-1.0.0"

// 何秒おきに起きて棚を見るか
//   内蔵バッテリーのみ：15秒（半日〜1日程度。140mAhしかありません）
//   USB給電　　　　　：5秒（取り逃しを減らす。モバイルバッテリー推奨）
#define WAKE_INTERVAL_SEC 15

// 一度検知したあと、連続で送らないための待ち時間
#define ALERT_COOLDOWN_SEC 20

// 変化を見つけたあと、本当に商品が減ったか確認するまで待つ秒数
#define CONFIRM_INTERVAL_SEC 5

// 設定（ROI・感度・営業時間）を取り直す間隔
#define SYNC_INTERVAL_SEC 3600

// 画質（1〜20、小さいほど高画質・大容量）
#define CAPTURE_QUALITY 11

// 送信に失敗した画像を貯めておく最大数
#define QUEUE_MAX 8

// 検知用の縮小サイズ（変更しない）
#define REF_W 32
#define REF_H 24
