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

#define FIRMWARE_VERSION "guard-camera-1.1.0"
