#pragma once

// ============================================================
// M5Stack Basic（店頭ハブ）設定
//   config.example.h を config.h にコピーして値を書き換える
// ============================================================

// 学校のWi-Fi（2.4GHzのみ対応。5GHz専用SSIDには接続できません）
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASS "YOUR_WIFI_PASSWORD"

// 管理画面の「設定 → 端末」に表示されるURLとトークン
#define API_URL "https://your-app.vercel.app/api/guard-event"
#define DEVICE_TOKEN "PASTE_DEVICE_TOKEN_HERE"

#define DEVICE_ID "hub"
#define FIRMWARE_VERSION "guard-hub-1.0.0"

// 通知の確認音の大きさ（0〜255）
#define BUZZER_VOLUME 160

// 通信間隔（ミリ秒）
#define HEARTBEAT_INTERVAL_MS 60000UL
#define EVENT_POLL_INTERVAL_MS 10000UL

// 補充モードの長さ（ミリ秒）
#define RESTOCK_MODE_MS (10UL * 60UL * 1000UL)
