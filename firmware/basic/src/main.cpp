// firmware/basic/src/main.cpp
// M5Stack Basic = 店頭ハブ
//   - 画面に監視状態を表示（日本語フォントは無いので英語表記）
//   - 10秒ごとに新しいイベントを取得し、不審ならブザー＋赤画面
//   - A: 警報停止 / 補充モード、B: 画面切替、C: テスト通知
#include <Arduino.h>
#include <M5Unified.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include "config.h"

static bool g_wifiOk = false;
static bool g_armed = true;
static bool g_buzzer = false;
static bool g_alert = false;
static bool g_restock = false;

static uint32_t g_alertUntil = 0;
static uint32_t g_restockUntil = 0;
static uint32_t g_lastHeartbeat = 0;
static uint32_t g_lastPoll = 0;
static uint32_t g_lastDraw = 0;
static uint32_t g_lastWifiTry = 0;

static String g_lastPollIso = "";
static String g_lastEvent = "-";
static String g_lastAlertEventId = "";
static String g_ip = "-";
static int g_battery = -1;
static int g_rssi = 0;
static int g_page = 0;

static String isoNow() {
  time_t now = time(nullptr);
  if (now < 1700000000) return "";
  struct tm tmUtc;
  gmtime_r(&now, &tmUtc);
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tmUtc);
  return String(buf);
}

static String urlEncode(const String &s) {
  String out;
  char buf[8];
  for (size_t i = 0; i < s.length(); i++) {
    unsigned char c = (unsigned char)s[i];
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
      out += (char)c;
    } else {
      snprintf(buf, sizeof(buf), "%%%02X", c);
      out += buf;
    }
  }
  return out;
}

static bool tryWifiProfile(const GuardWifiProfile &p) {
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(true);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  if (p.auth == 1 || p.auth == 2) {
    WiFi.begin(p.ssid, (wpa2_auth_method_t)p.auth,
               p.identity, p.username, p.password, p.ca_cert);
  } else {
    WiFi.begin(p.ssid, p.password);
  }

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    M5.update();
    delay(150);
  }
  return WiFi.status() == WL_CONNECTED;
}

static bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(true);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  for (const auto &p : WIFI_PROFILES) {
    Serial.printf("WiFi try: %s (auth=%u)\n", p.ssid, (unsigned)p.auth);
    if (tryWifiProfile(p)) {
      configTime(9 * 3600, 0, "ntp.nict.jp", "pool.ntp.org");
      for (int i = 0; i < 16 && time(nullptr) < 1700000000; i++) {
        M5.update();
        delay(200);
      }
      g_ip = WiFi.localIP().toString();
      g_rssi = WiFi.RSSI();
      Serial.printf("WiFi connected: %s ip=%s mac=%s\n",
                    p.ssid, g_ip.c_str(), WiFi.macAddress().c_str());
      return true;
    }
  }

  Serial.println("WiFi: all profiles failed");
  return false;
}

static int postJson(const String &payload, String &response) {
  WiFiClientSecure client;
  client.setInsecure();  // 学校のWi-Fi環境で証明書更新に悩まされないための割り切り
  HTTPClient http;
  http.setTimeout(15000);
  if (!http.begin(client, API_URL)) return -1;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Guard-Token", DEVICE_TOKEN);

  int code = http.POST((uint8_t *)payload.c_str(), payload.length());
  response = http.getString();
  http.end();
  return code;
}

static void heartbeat() {
  g_lastHeartbeat = millis();
  if (WiFi.status() != WL_CONNECTED) return;

  int rawBattery = M5.Power.getBatteryLevel();
  g_battery = rawBattery < 0 ? 0 : (rawBattery > 100 ? 100 : rawBattery);
  g_rssi = WiFi.RSSI();
  g_ip = WiFi.localIP().toString();

  JsonDocument doc;
  doc["token"] = DEVICE_TOKEN;
  doc["device"] = "hub";
  doc["kind"] = "heartbeat";
  doc["battery_pct"] = g_battery;
  doc["rssi"] = g_rssi;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["ip"] = g_ip;

  String body;
  serializeJson(doc, body);

  String response;
  int code = postJson(body, response);
  if (code == 200) {
    JsonDocument res;
    if (!deserializeJson(res, response)) {
      g_armed = res["armed"] | true;
      g_buzzer = res["hub_buzzer_enabled"] | false;
    }
  } else {
    Serial.printf("heartbeat failed: %d %s\n", code, response.c_str());
  }

  g_lastHeartbeat = millis();
  g_lastDraw = 0;
}

static void triggerAlert(const String &note) {
  g_alert = true;
  g_restock = false;
  g_alertUntil = millis() + 30000UL;
  g_lastEvent = note.length() ? note : "check the shelf";

  if (g_buzzer) {
    M5.Speaker.setVolume(BUZZER_VOLUME);
    for (int i = 0; i < 3; i++) {
      M5.Speaker.tone(2200, 220);
      delay(300);
    }
    M5.Speaker.stop();
  }
}

static void pollEvents() {
  g_lastPoll = millis();
  if (WiFi.status() != WL_CONNECTED) return;

  String url = String(API_URL) + "?device=hub";
  String since = g_lastPollIso.length() ? g_lastPollIso : isoNow();
  if (since.length()) url += "&since=" + urlEncode(since);

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(15000);
  if (!http.begin(client, url)) return;
  http.addHeader("X-Guard-Token", DEVICE_TOKEN);

  int code = http.GET();
  String response = http.getString();
  http.end();

  if (code != 200) {
    Serial.printf("poll failed: %d %s\n", code, response.c_str());
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, response)) return;

  g_armed = doc["armed"] | g_armed;
  g_buzzer = doc["buzzer"] | g_buzzer;

  JsonArray events = doc["events"].as<JsonArray>();
  for (JsonObject ev : events) {
    const char *status = ev["status"] | "";
    if (strcmp(status, "suspicious") == 0) {
      String id = String((const char *)(ev["id"] | ""));
      if (id.length() && id == g_lastAlertEventId) continue;
      g_lastAlertEventId = id;
      String note = String("event ") + String((const char *)(ev["received_at"] | ""));
      triggerAlert(note);
      break;
    }
  }

  const char *serverTime = doc["server_time"] | "";
  String nowIso = isoNow();
  if (nowIso.length()) g_lastPollIso = nowIso;
  else if (strlen(serverTime)) g_lastPollIso = String(serverTime);
}

static void sendTest() {
  if (WiFi.status() != WL_CONNECTED) return;

  JsonDocument doc;
  doc["token"] = DEVICE_TOKEN;
  doc["device"] = "hub";
  doc["kind"] = "test";
  doc["battery_pct"] = g_battery;
  doc["rssi"] = WiFi.RSSI();
  doc["firmware"] = FIRMWARE_VERSION;
  doc["note"] = "Basic test button";

  String body;
  serializeJson(doc, body);

  String response;
  int code = postJson(body, response);

  g_lastEvent = (code == 200) ? "test sent" : "test failed";
  if (g_buzzer) {
    M5.Speaker.setVolume(BUZZER_VOLUME);
    M5.Speaker.tone(code == 200 ? 1600 : 500, 180);
  }
  g_lastDraw = 0;
}

static void draw() {
  auto &d = M5.Display;
  bool alert = g_alert;
  bool restock = g_restock && millis() < g_restockUntil;

  d.fillScreen(alert ? TFT_RED : (restock ? 0x7A5A00 : TFT_BLACK));
  d.setTextColor(TFT_WHITE);

  d.setTextSize(2);
  d.setCursor(10, 8);
  d.print("NAGAZON Guard");

  d.setTextSize(1);
  d.setTextColor(alert ? TFT_WHITE : (g_armed ? TFT_RED : TFT_DARKGREY));
  d.setCursor(278, 12);
  d.print("REC");
  d.setTextColor(TFT_WHITE);
  d.setCursor(10, 34);
  d.printf("WiFi %s  RSSI %d  BAT %d%%", g_wifiOk ? "OK" : "...", g_rssi, g_battery);
  d.setCursor(10, 46);
  d.printf("IP %s", g_ip.c_str());

  d.setTextSize(3);
  d.setCursor(10, 76);
  if (alert) d.print("ALERT");
  else if (restock) d.print("RESTOCK");
  else d.print(g_armed ? "MONITOR" : "OFF");

  d.setTextSize(1);
  d.setCursor(10, 122);
  if (alert) {
    d.print("Check the shelf now.");
    d.setCursor(10, 136);
    d.print(g_buzzer ? "Press A to stop alarm." : "Email only (silent).");
  } else if (restock) {
    d.print("Local alarm paused.");
    d.setCursor(10, 136);
    d.print("Press A again to resume.");
  } else {
    d.print(g_armed ? "Watching the shelf." : "Monitoring is OFF.");
    d.setCursor(10, 136);
    d.print("C: send test notification");
  }

  d.setCursor(10, 168);
  d.setTextSize(1);
  d.printf("Last: %s", g_lastEvent.c_str());
  d.setCursor(10, 184);
  d.printf("Poll: %s", g_wifiOk ? "10s" : "waiting for WiFi");

  d.setCursor(10, 212);
  if (g_page == 0) {
    d.print("A: alarm/restock  B: info  C: test");
  } else {
    d.printf("FW %s  DEVICE %s", FIRMWARE_VERSION, DEVICE_ID);
  }

  g_lastDraw = millis();
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);
  M5.Display.fillScreen(TFT_BLACK);
  M5.Speaker.setVolume(BUZZER_VOLUME);

  Serial.begin(115200);
  Serial.println("NAGAZON Guard hub starting...");

  g_wifiOk = connectWiFi();
  int rawBattery = M5.Power.getBatteryLevel();
  g_battery = rawBattery < 0 ? 0 : (rawBattery > 100 ? 100 : rawBattery);
  g_lastPollIso = isoNow();

  if (g_wifiOk) {
    heartbeat();
    pollEvents();
  }

  draw();
}

void loop() {
  M5.update();

  if (WiFi.status() != WL_CONNECTED && millis() - g_lastWifiTry > 30000UL) {
    g_lastWifiTry = millis();
    g_wifiOk = connectWiFi();
    if (g_wifiOk) {
      heartbeat();
      g_lastPollIso = isoNow();
      g_lastDraw = 0;
    } else {
      g_lastDraw = 0;
    }
  }

  if (millis() - g_lastHeartbeat > HEARTBEAT_INTERVAL_MS) heartbeat();
  if (millis() - g_lastPoll > EVENT_POLL_INTERVAL_MS) pollEvents();

  if (g_alert && (int32_t)(millis() - g_alertUntil) >= 0) {
    g_alert = false;
    g_lastDraw = 0;
  }

  if (g_restock && (int32_t)(millis() - g_restockUntil) >= 0) {
    g_restock = false;
    g_lastDraw = 0;
  }

  if (M5.BtnA.wasPressed()) {
    if (g_alert) {
      g_alert = false;
    } else if (g_restock) {
      g_restock = false;
    } else {
      g_restock = true;
      g_restockUntil = millis() + RESTOCK_MODE_MS;
    }
    g_lastDraw = 0;
  }

  if (M5.BtnB.wasPressed()) {
    g_page = (g_page + 1) % 2;
    g_lastDraw = 0;
  }

  if (M5.BtnC.wasPressed()) {
    sendTest();
  }

  if (millis() - g_lastDraw > 1000) {
    draw();
  }

  delay(20);
}
