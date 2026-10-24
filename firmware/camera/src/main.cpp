// firmware/camera/src/main.cpp
// NAGAZON Guard camera (continuous clip mode)
//
//   - 営業時間中はカメラを連続稼働
//   - 常に直前3秒分のJPEGをPSRAMのリングバッファに保持
//   - 棚の局所的な変化を検知したら、直前3秒＋直後5秒の8秒クリップ（2fps）を送信
//   - 3秒待って「商品が減ったままか」を確認。手が入って出ただけなら破棄
//   - 支払い済み/未払いに関係なく録画。未払いのときだけAPIがメール通知
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <esp_camera.h>
#include <img_converters.h>
#include <mbedtls/base64.h>
#include <esp32-hal-psram.h>
#include <time.h>
#include "esp_sleep.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "config.h"

// ---- Timer Camera X / OV3660 ピン配置 ----
#define PWDN_GPIO_NUM  -1
#define RESET_GPIO_NUM 15
#define XCLK_GPIO_NUM  27
#define SIOD_GPIO_NUM  25
#define SIOC_GPIO_NUM  23
#define Y9_GPIO_NUM    19
#define Y8_GPIO_NUM    36
#define Y7_GPIO_NUM    18
#define Y6_GPIO_NUM    39
#define Y5_GPIO_NUM    5
#define Y4_GPIO_NUM    34
#define Y3_GPIO_NUM    35
#define Y2_GPIO_NUM    32
#define VSYNC_GPIO_NUM 22
#define HREF_GPIO_NUM  26
#define PCLK_GPIO_NUM  21

#define BAT_ADC_PIN  38
#define BAT_HOLD_PIN 33
#define LED_PIN      2

// ---- クリップ設定 ----
#define CAPTURE_FPS        2
#define FRAME_INTERVAL_MS  (1000 / CAPTURE_FPS)
#define PRE_FRAMES         (3 * CAPTURE_FPS)   // 直前3秒
#define CLIP_MAX_FRAMES    16                  // 最大16枚（2fpsで8秒）
#define DETECT_EVERY_N     2                   // 2枚に1回（1秒ごと）だけ画像差分を計算
#define SETTLE_MS          3000                // 録画後に商品が減ったままか確認するまで
#define VERIFY_MS          5000                // 1回目の確認後、もう5秒待って「静止」を確認
#define SETTLE_STABLE_RATIO 0.05f              // 2枚の確認フレームの変化がこれ以下なら静止
#define SETTLE_STABLE_MEAN  5.0f
#define WIFI_RETRY_MS      30000
#define HEARTBEAT_MS       15000
#define DISARMED_HEARTBEAT_MS 10000
#define FRAME_MAX_BYTES    70000
#define MOTION_MIN_RATIO   0.015f
#define MOTION_MAX_RATIO   0.90f
#define MOTION_BBOX_MAX    0.85f
// 確定判定は「商品が1つ減った」ような小さな塊だけに絞る
#define CONFIRM_MAX_RATIO  0.60f
#define CONFIRM_BBOX_MAX   0.60f
#define CONFIRM_BBOX_W_MAX 0.60f
#define CONFIRM_BBOX_H_MAX 0.70f
#define GLOBAL_REBASE_TICKS 60

#define REF_W 32
#define REF_H 24

enum GuardState { ST_IDLE, ST_RECORDING, ST_SETTLE, ST_VERIFY };

static uint8_t g_baseline[REF_W * REF_H];
static bool g_hasBaseline = false;
static uint8_t g_verifyRef[REF_W * REF_H];
RTC_DATA_ATTR uint32_t g_bootCount = 0;

static uint8_t *g_ring[PRE_FRAMES];
static size_t g_ringLen[PRE_FRAMES];
static int g_ringHead = 0;
static int g_ringCount = 0;

static uint8_t *g_clip[CLIP_MAX_FRAMES];
static size_t g_clipLen[CLIP_MAX_FRAMES];
static int g_clipCount = 0;

static uint8_t *g_rgb = nullptr;
static char *g_b64 = nullptr;

static bool g_camReady = false;
static bool g_armed = true;
static bool g_videoEnabled = true;

static int g_threshold = 18;
static int g_openMin = 480;
static int g_closeMin = 1020;
static int g_clipSeconds = 8;
static int g_clipFps = CAPTURE_FPS;
static uint8_t g_roiX = 12;
static uint8_t g_roiY = 18;
static uint8_t g_roiW = 76;
static uint8_t g_roiH = 64;

static uint32_t g_lastHeartbeat = 0;
static uint32_t g_lastWifiTry = 0;
static uint32_t g_lastFrame = 0;
static int g_frameNo = 0;

static GuardState g_state = ST_IDLE;
static int g_globalCount = 0;
static time_t g_eventAt = 0;
static uint32_t g_settleAt = 0;
static uint32_t g_verifyAt = 0;
static uint32_t g_recordingDeadline = 0;
static int g_targetFrames = PRE_FRAMES;

struct DiffStats {
  float ratio;
  float bbox;
  float bboxW;
  float bboxH;
  float mean;
  bool motion;
  bool global;
  bool confirm;
};

static void blink(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(50);
    digitalWrite(LED_PIN, LOW);
    delay(80);
  }
}

static void isoTime(time_t t, char *out, size_t n) {
  if (t < 1700000000) t = time(nullptr);
  if (t < 1700000000) {
    snprintf(out, n, "1970-01-01T00:00:00Z");
    return;
  }
  struct tm tmUtc;
  gmtime_r(&t, &tmUtc);
  strftime(out, n, "%Y-%m-%dT%H:%M:%SZ", &tmUtc);
}

static int readBatteryPct() {
  analogReadResolution(12);
  analogSetPinAttenuation(BAT_ADC_PIN, ADC_11db);
  int raw = analogRead(BAT_ADC_PIN);
  float v = (raw / 4095.0f) * 3.3f * 2.0f;
  int pct = (int)(((v - 3.5f) / 0.7f) * 100.0f);
  return constrain(pct, 0, 100);
}

static int parseHHMM(const char *s) {
  int h = 8;
  int m = 0;
  if (sscanf(s, "%d:%d", &h, &m) != 2) {
    h = 8;
    m = 0;
  }
  return h * 60 + m;
}

static bool withinHours(time_t now, bool timeOk) {
  if (!timeOk) return true;
  struct tm t;
  localtime_r(&now, &t);
  int m = t.tm_hour * 60 + t.tm_min;
  if (g_openMin == g_closeMin) return true;
  if (g_openMin < g_closeMin) return m >= g_openMin && m <= g_closeMin;
  return m >= g_openMin || m <= g_closeMin;
}

static bool tryWifiProfile(const GuardWifiProfile &p) {
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  if (p.auth == 1 || p.auth == 2) {
    // WPA2-Enterprise (PEAP/MSCHAPv2 or TTLS/PAP)
    WiFi.begin(p.ssid, (wpa2_auth_method_t)p.auth,
               p.identity, p.username, p.password, p.ca_cert);
  } else {
    // WPA2-Personal (or open when password is empty)
    WiFi.begin(p.ssid, p.password);
  }

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(120);
  }
  return WiFi.status() == WL_CONNECTED;
}

static bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  for (const auto &p : WIFI_PROFILES) {
    Serial.printf("WiFi try: %s (auth=%u)\n", p.ssid, (unsigned)p.auth);
    if (tryWifiProfile(p)) {
      Serial.printf("WiFi connected: %s ip=%s mac=%s\n",
                    p.ssid, WiFi.localIP().toString().c_str(),
                    WiFi.macAddress().c_str());

      if (time(nullptr) < 1700000000) {
        configTime(9 * 3600, 0, "ntp.nict.jp", "pool.ntp.org");
        for (int i = 0; i < 20 && time(nullptr) < 1700000000; i++) delay(200);
      }
      return true;
    }
  }

  Serial.println("WiFi: all profiles failed");
  return false;
}

static void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - g_lastWifiTry < WIFI_RETRY_MS) return;
  g_lastWifiTry = millis();
  connectWiFi();
}

static bool initCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA;
  config.jpeg_quality = 12;
  config.fb_count = 2;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.grab_mode = CAMERA_GRAB_LATEST;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("esp_camera_init failed: 0x%x\n", err);
    return false;
  }
  g_camReady = true;
  return true;
}

static bool allocBuffers() {
  for (int i = 0; i < PRE_FRAMES; i++) {
    g_ring[i] = (uint8_t *)ps_malloc(FRAME_MAX_BYTES);
    if (!g_ring[i]) return false;
  }
  for (int i = 0; i < CLIP_MAX_FRAMES; i++) {
    g_clip[i] = (uint8_t *)ps_malloc(FRAME_MAX_BYTES);
    if (!g_clip[i]) return false;
  }
  g_rgb = (uint8_t *)ps_malloc(640 * 480 * 3);
  g_b64 = (char *)ps_malloc((FRAME_MAX_BYTES * 4 / 3) + 64);
  return g_rgb && g_b64;
}

static bool buildReference(camera_fb_t *fb, uint8_t *out) {
  if (!fb || !g_rgb) return false;
  size_t rgbLen = (size_t)fb->width * fb->height * 3;
  if (rgbLen > 640 * 480 * 3) return false;

  if (!fmt2rgb888(fb->buf, fb->len, PIXFORMAT_JPEG, g_rgb)) return false;

  int rx = fb->width * g_roiX / 100;
  int ry = fb->height * g_roiY / 100;
  int rw = fb->width * g_roiW / 100;
  int rh = fb->height * g_roiH / 100;

  if (rx < 0) rx = 0;
  if (ry < 0) ry = 0;
  if (rw < 2) rw = 2;
  if (rh < 2) rh = 2;
  if (rx + rw > (int)fb->width) rw = fb->width - rx;
  if (ry + rh > (int)fb->height) rh = fb->height - ry;

  for (int y = 0; y < REF_H; y++) {
    int py = ry + (rh - 1) * y / (REF_H - 1);
    for (int x = 0; x < REF_W; x++) {
      int px = rx + (rw - 1) * x / (REF_W - 1);
      size_t idx = ((size_t)py * fb->width + px) * 3;
      int r = g_rgb[idx];
      int g = g_rgb[idx + 1];
      int b = g_rgb[idx + 2];
      out[y * REF_W + x] = (uint8_t)((r * 77 + g * 150 + b * 29) >> 8);
    }
  }
  return true;
}

static DiffStats diffRefs(const uint8_t *a, const uint8_t *b) {
  DiffStats st = {0, 0, 0, 0, 0, false, false, false};

  int changed = 0;
  long sum = 0;
  int minX = REF_W, maxX = -1, minY = REF_H, maxY = -1;
  const int total = REF_W * REF_H;

  for (int y = 0; y < REF_H; y++) {
    for (int x = 0; x < REF_W; x++) {
      int i = y * REF_W + x;
      int d = abs((int)a[i] - (int)b[i]);
      sum += d;
      if (d > g_threshold) {
        changed++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  st.ratio = (float)changed / (float)total;
  st.mean = (float)sum / (float)total;

  if (changed > 0) {
    int bw = maxX - minX + 1;
    int bh = maxY - minY + 1;
    st.bbox = (float)(bw * bh) / (float)total;
    st.bboxW = (float)bw / (float)REF_W;
    st.bboxH = (float)bh / (float)REF_H;
  }

  st.global = st.ratio > MOTION_MAX_RATIO;
  st.motion = !st.global && st.ratio >= MOTION_MIN_RATIO &&
              st.bbox <= MOTION_BBOX_MAX;
  // 「商品が1つ減った」ような、小さくまとまった変化だけを確定候補にする。
  // 人が立っている・手が画面を覆うような大きな塊はここで落とす。
  st.confirm = !st.global && st.ratio >= MOTION_MIN_RATIO &&
               st.ratio <= CONFIRM_MAX_RATIO &&
               st.bbox <= CONFIRM_BBOX_MAX &&
               st.bboxW <= CONFIRM_BBOX_W_MAX &&
               st.bboxH <= CONFIRM_BBOX_H_MAX;

  return st;
}

static DiffStats compareReference(const uint8_t *ref) {
  if (!g_hasBaseline) return DiffStats{0, 0, 0, 0, 0, false, false, false};
  return diffRefs(ref, g_baseline);
}

static void pushRing(camera_fb_t *fb) {
  if (!fb || fb->len > FRAME_MAX_BYTES) return;
  int idx = g_ringHead;
  memcpy(g_ring[idx], fb->buf, fb->len);
  g_ringLen[idx] = fb->len;
  g_ringHead = (g_ringHead + 1) % PRE_FRAMES;
  if (g_ringCount < PRE_FRAMES) g_ringCount++;
}

static void startEvent() {
  g_state = ST_RECORDING;
  g_eventAt = time(nullptr);
  g_clipCount = 0;

  int start = (g_ringHead - g_ringCount + PRE_FRAMES) % PRE_FRAMES;
  for (int i = 0; i < g_ringCount && i < CLIP_MAX_FRAMES; i++) {
    int src = (start + i) % PRE_FRAMES;
    if (g_ringLen[src] == 0) continue;
    memcpy(g_clip[g_clipCount], g_ring[src], g_ringLen[src]);
    g_clipLen[g_clipCount] = g_ringLen[src];
    g_clipCount++;
  }

  g_targetFrames = g_clipSeconds * CAPTURE_FPS;
  if (g_targetFrames < PRE_FRAMES) g_targetFrames = PRE_FRAMES;
  if (g_targetFrames > CLIP_MAX_FRAMES) g_targetFrames = CLIP_MAX_FRAMES;
  g_recordingDeadline = millis() + (g_targetFrames * FRAME_INTERVAL_MS) + 2000;

  Serial.printf("EVENT start: pre=%d target=%d\n", g_clipCount, g_targetFrames);

  if (g_clipCount >= g_targetFrames) {
    g_state = ST_SETTLE;
    g_settleAt = millis() + SETTLE_MS;
  }
}

static void appendClip(camera_fb_t *fb) {
  if (!fb) return;
  if (fb->len > FRAME_MAX_BYTES) {
    Serial.printf("frame too large: %u > %u\n", (unsigned)fb->len, (unsigned)FRAME_MAX_BYTES);
    return;
  }
  if (g_clipCount >= CLIP_MAX_FRAMES) return;

  memcpy(g_clip[g_clipCount], fb->buf, fb->len);
  g_clipLen[g_clipCount] = fb->len;
  g_clipCount++;

  if (g_clipCount >= g_targetFrames) {
    g_state = ST_SETTLE;
    g_settleAt = millis() + SETTLE_MS;
    Serial.printf("EVENT recorded: frames=%d\n", g_clipCount);
  }
}

static void detectMotion(camera_fb_t *fb) {
  if (!g_hasBaseline) {
    if (buildReference(fb, g_baseline)) g_hasBaseline = true;
    return;
  }

  uint8_t ref[REF_W * REF_H];
  if (!buildReference(fb, ref)) return;

  DiffStats st = compareReference(ref);

  if (st.global) {
    // 照明が大きく変わった／カメラが動いた／人が画面いっぱいに立っている。
    // すぐには基準を書き換えず、30秒以上続いたときだけ再学習する。
    g_ringCount = 0;
    g_ringHead = 0;
    g_globalCount++;
    if (g_globalCount >= GLOBAL_REBASE_TICKS) {
      memcpy(g_baseline, ref, sizeof(g_baseline));
      g_globalCount = 0;
      Serial.println("baseline rebased after global change");
    } else {
      Serial.printf("global change ignored (ratio=%.2f)\n", st.ratio);
    }
    return;
  }

  g_globalCount = 0;

  if (st.motion) {
    startEvent();
    return;
  }

  // 動きなし → ゆっくり照明に追従
  for (int i = 0; i < REF_W * REF_H; i++) {
    g_baseline[i] = (uint8_t)((g_baseline[i] * 7 + ref[i]) / 8);
  }
}

// ---- HTTP ----
static bool postBody(const char *body, size_t len, String &response) {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.setTimeout(30000);
  if (!http.begin(client, API_URL)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Guard-Token", DEVICE_TOKEN);

  int code = http.POST((uint8_t *)body, len);
  response = http.getString();
  http.end();
  return code == 200;
}

static bool postSingle(const uint8_t *jpg, size_t len, time_t ts, const char *note) {
  if (!g_b64 || !jpg || len == 0) return false;

  size_t olen = 0;
  if (mbedtls_base64_encode((unsigned char *)g_b64,
                            (FRAME_MAX_BYTES * 4 / 3) + 64, &olen, jpg, len) != 0) {
    return false;
  }

  char iso[32];
  isoTime(ts, iso, sizeof(iso));

  size_t cap = olen + 1200;
  char *body = (char *)ps_malloc(cap);
  if (!body) return false;

  int n = snprintf(
      body, cap,
      "{\"token\":\"%s\",\"device\":\"camera\",\"kind\":\"motion\",\"occurred_at\":\"%s\","
      "\"battery_pct\":%d,\"rssi\":%d,\"firmware\":\"%s\",\"note\":\"%s\",\"image_b64\":\"",
      DEVICE_TOKEN, iso, readBatteryPct(), WiFi.RSSI(), FIRMWARE_VERSION, note);
  memcpy(body + n, g_b64, olen);
  n += (int)olen;
  n += snprintf(body + n, cap - n, "\"}");

  String response;
  bool ok = postBody(body, n, response);
  Serial.printf("postSingle code=%d resp=%.160s\n", ok ? 200 : -1, response.c_str());
  free(body);
  blink(2);
  return ok;
}

static int pickThumbIndex() {
  // 検知直後（最初のpostフレーム）をサムネイルに使う
  int preferred = PRE_FRAMES;
  if (preferred < g_clipCount && g_clipLen[preferred] > 0) return preferred;
  for (int i = g_clipCount - 1; i >= 0; i--) {
    if (g_clipLen[i] > 0) return i;
  }
  return -1;
}

static bool postClip() {
  if (!g_b64) return false;

  int thumb = pickThumbIndex();
  if (thumb < 0) {
    Serial.println("postClip: no thumb");
    return false;
  }

  // 有効なフレームだけを送る
  int valid = 0;
  size_t totalB64 = 0;
  for (int i = 0; i < g_clipCount; i++) {
    if (g_clipLen[i] == 0) continue;
    valid++;
    totalB64 += 4 * ((g_clipLen[i] + 2) / 3);
  }
  if (valid < 4) {
    Serial.printf("postClip: too few frames (%d)\n", valid);
    return false;
  }

  size_t cap = totalB64 + (FRAME_MAX_BYTES * 4 / 3) + 4096;
  char *body = (char *)ps_malloc(cap);
  if (!body) {
    Serial.printf("postClip: alloc failed cap=%u free=%u\n",
                  (unsigned)cap, (unsigned)ESP.getFreePsram());
    return false;
  }

  char iso[32];
  isoTime(g_eventAt, iso, sizeof(iso));

  size_t olen = 0;
  if (mbedtls_base64_encode((unsigned char *)g_b64,
                            (FRAME_MAX_BYTES * 4 / 3) + 64, &olen,
                            g_clip[thumb], g_clipLen[thumb]) != 0) {
    Serial.printf("postClip: thumb encode failed len=%u\n", (unsigned)g_clipLen[thumb]);
    free(body);
    return false;
  }

  int n = snprintf(
      body, cap,
      "{\"token\":\"%s\",\"device\":\"camera\",\"kind\":\"motion\",\"occurred_at\":\"%s\","
      "\"battery_pct\":%d,\"rssi\":%d,\"firmware\":\"%s\",\"fps\":%d,"
      "\"note\":\"8s clip (paid/unpaid)\",\"image_b64\":\"",
      DEVICE_TOKEN, iso, readBatteryPct(), WiFi.RSSI(), FIRMWARE_VERSION, g_clipFps);

  memcpy(body + n, g_b64, olen);
  n += (int)olen;
  n += snprintf(body + n, cap - n, "\",\"frames_b64\":[");

  bool first = true;
  for (int i = 0; i < g_clipCount; i++) {
    if (g_clipLen[i] == 0) continue;
    if (mbedtls_base64_encode((unsigned char *)g_b64,
                              (FRAME_MAX_BYTES * 4 / 3) + 64, &olen,
                              g_clip[i], g_clipLen[i]) != 0) {
      continue;
    }
    if (!first) body[n++] = ',';
    body[n++] = '"';
    memcpy(body + n, g_b64, olen);
    n += (int)olen;
    body[n++] = '"';
    first = false;
  }

  n += snprintf(body + n, cap - n, "]}");

  String response;
  bool ok = postBody(body, n, response);
  Serial.printf("postClip frames=%d bytes=%d cap=%u free=%u ok=%d resp=%.200s\n",
                valid, n, (unsigned)cap, (unsigned)ESP.getFreePsram(),
                ok, response.c_str());
  free(body);
  blink(3);
  return ok;
}

static bool sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return false;

  JsonDocument doc;
  doc["token"] = DEVICE_TOKEN;
  doc["device"] = "camera";
  doc["kind"] = "heartbeat";
  doc["battery_pct"] = readBatteryPct();
  doc["rssi"] = WiFi.RSSI();
  doc["firmware"] = FIRMWARE_VERSION;
  doc["ip"] = WiFi.localIP().toString();

  String body;
  serializeJson(doc, body);

  String response;
  bool ok = postBody(body.c_str(), body.length(), response);
  if (!ok) {
    Serial.printf("heartbeat failed: %.160s\n", response.c_str());
    return false;
  }

  JsonDocument res;
  if (deserializeJson(res, response)) return false;

  bool wasArmed = g_armed;
  int oldThreshold = g_threshold;
  uint8_t oldRoiX = g_roiX, oldRoiY = g_roiY, oldRoiW = g_roiW, oldRoiH = g_roiH;

  g_armed = res["armed"] | true;
  g_videoEnabled = res["video_enabled"] | true;
  g_threshold = constrain((int)(res["motion_threshold"] | 18), 3, 80);
  g_openMin = parseHHMM((const char *)(res["store_open"] | "08:00"));
  g_closeMin = parseHHMM((const char *)(res["store_close"] | "17:00"));
  g_clipSeconds = constrain((int)(res["clip_seconds"] | 8), 3, 8);
  // 撮影は2fps固定。サーバー/再生側のfpsも実撮影に合わせる。
  g_clipFps = CAPTURE_FPS;

  JsonObject roi = res["roi"].as<JsonObject>();
  if (!roi.isNull()) {
    g_roiX = (uint8_t)constrain((int)((roi["x"] | 0.12f) * 100.0f), 0, 95);
    g_roiY = (uint8_t)constrain((int)((roi["y"] | 0.18f) * 100.0f), 0, 95);
    g_roiW = (uint8_t)constrain((int)((roi["w"] | 0.76f) * 100.0f), 5, 100);
    g_roiH = (uint8_t)constrain((int)((roi["h"] | 0.64f) * 100.0f), 5, 100);
  }

  bool detectionChanged =
      oldThreshold != g_threshold || oldRoiX != g_roiX || oldRoiY != g_roiY ||
      oldRoiW != g_roiW || oldRoiH != g_roiH;

  if (wasArmed != g_armed || detectionChanged) {
    // OFF→ON、ROI/感度変更で古い基準のまま誤検知しないよう、基準を作り直す。
    g_state = ST_IDLE;
    g_clipCount = 0;
    g_ringCount = 0;
    g_ringHead = 0;
    g_frameNo = 0;
    g_globalCount = 0;
    g_hasBaseline = false;
    g_lastFrame = millis();
    if (wasArmed != g_armed) {
      Serial.printf("monitoring %s; baseline reset\n", g_armed ? "resumed" : "paused");
    } else {
      Serial.println("detection settings changed; baseline reset");
    }
  }

  Serial.printf("settings armed=%d video=%d th=%d roi=%d,%d,%d,%d clip=%ds@%dfps\n",
                g_armed, g_videoEnabled, g_threshold, g_roiX, g_roiY, g_roiW, g_roiH,
                g_clipSeconds, g_clipFps);
  return true;
}

static void resetEvent() {
  g_state = ST_IDLE;
  g_clipCount = 0;
  g_ringCount = 0;
  g_ringHead = 0;
  g_frameNo = 0;
  g_globalCount = 0;
  g_lastFrame = millis();
}

static void verifyFirst() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("verify1: no frame");
    resetEvent();
    return;
  }

  uint8_t ref[REF_W * REF_H];
  bool built = buildReference(fb, ref);
  esp_camera_fb_return(fb);

  if (!built) {
    Serial.println("verify1: ref build failed");
    resetEvent();
    return;
  }

  if (!g_hasBaseline) {
    memcpy(g_baseline, ref, sizeof(g_baseline));
    g_hasBaseline = true;
    Serial.println("verify1: baseline initialized");
    resetEvent();
    return;
  }

  DiffStats st = compareReference(ref);
  Serial.printf("verify1 ratio=%.2f bbox=%.2f/%.2fx%.2f confirmed=%d global=%d\n",
                st.ratio, st.bbox, st.bboxW, st.bboxH, st.confirm, st.global);

  if (!st.confirm) {
    // 手が入っただけ・人が通っただけ・照明変化。基準は変えない。
    // 商品が本当に無くなっていれば、人が離れたあとに再検知される。
    Serial.println("verify1: not confirmed; keep baseline");
    resetEvent();
    return;
  }

  memcpy(g_verifyRef, ref, sizeof(g_verifyRef));
  g_state = ST_VERIFY;
  g_verifyAt = millis() + VERIFY_MS;
}

static void verifySecond() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("verify2: no frame");
    resetEvent();
    return;
  }

  uint8_t ref[REF_W * REF_H];
  bool built = buildReference(fb, ref);
  esp_camera_fb_return(fb);

  if (!built) {
    Serial.println("verify2: ref build failed");
    resetEvent();
    return;
  }

  DiffStats st = compareReference(ref);
  DiffStats stable = diffRefs(g_verifyRef, ref);
  bool still = stable.ratio <= SETTLE_STABLE_RATIO && stable.mean <= SETTLE_STABLE_MEAN;
  bool confirmed = st.confirm && still;

  Serial.printf("verify2 ratio=%.2f bbox=%.2f/%.2fx%.2f confirmed=%d move=%.2f/%.1f still=%d\n",
                st.ratio, st.bbox, st.bboxW, st.bboxH, st.confirm,
                stable.ratio, stable.mean, still);

  if (!confirmed) {
    // まだ人が動いている／手が残っている。基準は変えない。
    // 商品が無くなっていれば、人が離れたあとに再検知される。
    Serial.println("verify2: moving/transient; keep baseline");
    resetEvent();
    return;
  }

  // 商品が減ったまま静止している → 確定。送信成功後に基準を更新する。
  bool ok = false;
  for (int attempt = 0; attempt < 3 && !ok; attempt++) {
    ensureWiFi();
    if (WiFi.status() == WL_CONNECTED) {
      if (g_videoEnabled) {
        ok = postClip();
      }
      if (!ok) {
        int thumb = pickThumbIndex();
        if (thumb >= 0) {
          ok = postSingle(g_clip[thumb], g_clipLen[thumb], g_eventAt,
                          g_videoEnabled ? "clip upload failed" : "photo");
        }
      }
    }
    if (!ok) {
      Serial.printf("upload retry %d/3\n", attempt + 1);
      delay(3000);
    }
  }
  if (ok) {
    memcpy(g_baseline, ref, sizeof(g_baseline));
    g_hasBaseline = true;
  } else {
    // 送れなかった時は基準を更新しない。次の検知でもう一度送信を試みる。
    Serial.println("upload failed; keep baseline for re-detection");
  }

  resetEvent();
}

static void sleepSeconds(uint32_t sec) {
  Serial.printf("sleep %u sec\n", sec);
  Serial.flush();
  if (g_camReady) {
    esp_camera_deinit();
    g_camReady = false;
  }
  WiFi.mode(WIFI_OFF);
  esp_sleep_enable_timer_wakeup((uint64_t)sec * 1000000ULL);
  esp_deep_sleep_start();
}

static void sleepUntilOpen() {
  time_t now = time(nullptr);
  if (now < 1700000000) {
    sleepSeconds(60);
    return;
  }
  struct tm t;
  localtime_r(&now, &t);
  int m = t.tm_hour * 60 + t.tm_min;
  int waitMin = 0;
  if (g_openMin == g_closeMin) {
    sleepSeconds(60);
    return;
  }
  if (g_openMin < g_closeMin) {
    waitMin = (m < g_openMin) ? (g_openMin - m) : (24 * 60 - m + g_openMin);
  } else {
    waitMin = (m < g_openMin && m > g_closeMin) ? (g_openMin - m) : 60;
  }
  if (waitMin < 1) waitMin = 1;
  if (waitMin > 60) waitMin = 60;  // 設定変更を取り込むため最大1時間
  sleepSeconds((uint32_t)waitMin * 60);
}

static void handleIdleFrame(camera_fb_t *fb) {
  pushRing(fb);
  g_frameNo++;
  if (!g_armed) return;  // 監視OFF中もカメラは温め続けるが、判定・録画はしない
  // 直前3秒分が溜まるまで判定しない。起動直後やON直後の
  // 短いプリロールで「決定的な瞬間」を逃さないため。
  if (g_ringCount < PRE_FRAMES) return;
  if (g_frameNo % DETECT_EVERY_N == 0) {
    detectMotion(fb);
  }
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  pinMode(BAT_HOLD_PIN, OUTPUT);
  digitalWrite(BAT_HOLD_PIN, HIGH);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.begin(115200);
  delay(50);

  setenv("TZ", "JST-9", 1);
  tzset();

  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS mount failed");
  }

  g_bootCount++;

  if (!initCamera()) {
    Serial.println("camera init failed; retry in 60s");
    sleepSeconds(60);
  }

  if (!connectWiFi()) {
    Serial.println("WiFi failed at boot; retry in 60s");
    sleepSeconds(60);
  }

  sendHeartbeat();

  time_t now = time(nullptr);
  if (!withinHours(now, now > 1700000000)) {
    Serial.println("outside store hours");
    sleepUntilOpen();
  }

  if (!allocBuffers()) {
    Serial.println("PSRAM allocation failed");
    sleepSeconds(60);
  }

  // 露出が落ち着いてから基準を取る（起動直後の暗いフレームを避ける）
  delay(1500);

  if (!g_hasBaseline) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) {
      if (buildReference(fb, g_baseline)) g_hasBaseline = true;
      esp_camera_fb_return(fb);
    }
  }

  g_lastHeartbeat = millis();
  g_lastFrame = millis();
  Serial.println("continuous guard mode started");
  Serial.printf("free PSRAM: %u bytes\n", (unsigned)ESP.getFreePsram());
}

void loop() {
  uint32_t now = millis();

  ensureWiFi();

  time_t tnow = time(nullptr);
  bool timeOk = tnow > 1700000000;
  if (!withinHours(tnow, timeOk)) {
    sleepUntilOpen();
  }

  // OFF中は深いスリープにせず、10秒ごとに設定を確認してすぐONへ戻れるようにする。
  uint32_t hbInterval = g_armed ? HEARTBEAT_MS : DISARMED_HEARTBEAT_MS;
  if (now - g_lastHeartbeat >= hbInterval) {
    g_lastHeartbeat = now;
    if (WiFi.status() == WL_CONNECTED) sendHeartbeat();
  }

  if (g_state == ST_IDLE || g_state == ST_RECORDING) {
    if (now - g_lastFrame >= FRAME_INTERVAL_MS) {
      g_lastFrame = now;
      camera_fb_t *fb = esp_camera_fb_get();
      if (fb) {
        if (g_state == ST_IDLE) {
          handleIdleFrame(fb);
        } else {
          appendClip(fb);
        }
        esp_camera_fb_return(fb);
      }
    }
  } else if (g_state == ST_SETTLE) {
    if ((int32_t)(now - g_settleAt) >= 0) {
      verifyFirst();
    }
  } else if (g_state == ST_VERIFY) {
    if ((int32_t)(now - g_verifyAt) >= 0) {
      verifySecond();
    }
  }

  if (g_state == ST_RECORDING && (int32_t)(now - g_recordingDeadline) >= 0) {
    Serial.printf("recording deadline: frames=%d\n", g_clipCount);
    g_state = ST_SETTLE;
    g_settleAt = now + SETTLE_MS;
  }

  delay(5);
}
