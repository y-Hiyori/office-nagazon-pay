// api/guard-event.js
// 端末（M5Stack Basic / Timer Camera X）からのイベント受信
//   - 端末トークンで認証
//   - 動きを検知したら「直近の支払い済み・未受け取り注文」と照合
//   - 照合できなければ不審イベントとして証拠画像を保存し、Teams/メールへ通知
import { createHash, randomUUID, timingSafeEqual } from "crypto";
import {
  getAdminClient,
  isWithinStoreHours,
  jstTimeParts,
  normalizeTime,
  notifyGuard,
} from "./_guard.js";

export const config = { maxDuration: 30 };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Guard-Token",
};

function json(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function sha256(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

function tokenMatches(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(sha256(a));
  const y = Buffer.from(sha256(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function ymdJst(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function intOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function asBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return fallback;
}

async function pickOrderForEvent(sb, settings, event, productId, delta) {
  const windowMs = Math.max(1, Number(settings.match_window_min || 20)) * 60 * 1000;
  const since = Date.now() - windowMs;
  const now = Date.now();

  const { data, error } = await sb
    .from("orders")
    .select("id,paid_at,created_at,pickup_code,pickup_code_expires_at,order_items(product_id,quantity)")
    .eq("status", "paid")
    .eq("pickup_status", "waiting")
    .or("fulfillment_type.is.null,fulfillment_type.neq.shipping")
    .order("paid_at", { ascending: true })
    .limit(40);

  if (error) {
    console.error("pickOrderForEvent query error:", error);
    return null;
  }

  const candidates = (data || []).filter((o) => {
    const paid = new Date(o.paid_at || o.created_at || 0).getTime();
    if (!Number.isFinite(paid) || paid < since || paid > now + 60 * 1000) return false;
    const exp = o.pickup_code_expires_at ? new Date(o.pickup_code_expires_at).getTime() : Infinity;
    if (Number.isFinite(exp) && exp < now) return false;
    if (productId == null) return true;
    return (o.order_items || []).some(
      (it) =>
        Number(it.product_id) === Number(productId) &&
        Number(it.quantity || 0) >= Math.max(1, Number(delta || 1))
    );
  });

  for (const order of candidates) {
    const { data: updated } = await sb
      .from("orders")
      .update({
        pickup_status: "picked_up",
        picked_up_at: event.occurred_at,
      })
      .eq("id", order.id)
      .eq("pickup_status", "waiting")
      .select("id,paid_at")
      .maybeSingle();

    if (updated) return order;
  }

  return null;
}

async function findOrderByCode(sb, code, productId) {
  const clean = String(code || "").replace(/\D/g, "").slice(0, 6);
  if (clean.length !== 6) return null;

  const { data: order } = await sb
    .from("orders")
    .select("id,paid_at,pickup_code,pickup_code_expires_at,order_items(product_id,quantity)")
    .eq("pickup_code", clean)
    .eq("status", "paid")
    .eq("pickup_status", "waiting")
    .or("fulfillment_type.is.null,fulfillment_type.neq.shipping")
    .maybeSingle();

  if (!order) return null;
  if (order.pickup_code_expires_at && new Date(order.pickup_code_expires_at).getTime() < Date.now()) {
    return null;
  }
  if (productId != null) {
    const ok = (order.order_items || []).some((it) => Number(it.product_id) === Number(productId));
    if (!ok) return null;
  }

  const { data: updated } = await sb
    .from("orders")
    .update({ pickup_status: "picked_up", picked_up_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("pickup_status", "waiting")
    .select("id")
    .maybeSingle();

  return updated ? order : null;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeader("Access-Control-Allow-Origin", "*").end();
    return;
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return json(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  try {
    const sb = getAdminClient();

    const { data: settings, error: sErr } = await sb
      .from("guard_settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (sErr || !settings) return json(res, 500, { ok: false, error: "SETTINGS_NOT_FOUND" });

    // 店頭ハブからのポーリング（新しいイベントだけ返す）
    if (req.method === "GET") {
      const token = String(req.query?.token || req.query?.device_token || req.headers["x-guard-token"] || "");
      if (!tokenMatches(token, settings.device_token)) {
        return json(res, 401, { ok: false, error: "BAD_TOKEN" });
      }

      const sinceRaw = req.query?.since ? String(req.query.since) : "";
      const sinceDate = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 5 * 60 * 1000);
      const since = Number.isNaN(sinceDate.getTime())
        ? new Date(Date.now() - 5 * 60 * 1000).toISOString()
        : sinceDate.toISOString();

      const { data: events, error: eErr } = await sb
        .from("guard_events")
        .select("id,device_id,kind,occurred_at,received_at,status,note,order_id")
        .gte("received_at", since)
        .order("received_at", { ascending: true })
        .limit(30);

      if (eErr) return json(res, 500, { ok: false, error: "EVENT_QUERY_FAILED" });

      const deviceId = String(req.query?.device || "").toLowerCase() === "hub" ? "hub" : null;
      if (deviceId) {
        await sb
          .from("guard_devices")
          .upsert(
            {
              id: deviceId,
              name: "店頭ハブ（M5Stack Basic）",
              kind: "hub",
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
      }

      return json(res, 200, {
        ok: true,
        server_time: new Date().toISOString(),
        armed: settings.armed,
        buzzer: settings.hub_buzzer_enabled,
        events: events || [],
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const token = String(body.token || req.headers["x-guard-token"] || "");
    if (!tokenMatches(token, settings.device_token)) {
      return json(res, 401, { ok: false, error: "BAD_TOKEN" });
    }

    const deviceId = String(body.device || "camera").toLowerCase() === "hub" ? "hub" : "camera";
    const kind = String(body.kind || "motion").toLowerCase();
    const nowIso = new Date().toISOString();
    const occurredAt = normalizeTime(body.occurred_at);
    const productId = intOrNull(body.product_id);
    const delta = intOrNull(body.delta);

    // 端末の生存情報を更新（送られてきた項目だけ更新する）
    const deviceRow = {
      id: deviceId,
      name: deviceId === "camera" ? "証拠カメラ（Timer Camera X）" : "店頭ハブ（M5Stack Basic）",
      kind: deviceId,
      last_seen_at: nowIso,
    };
    if (body.battery_pct != null) deviceRow.battery_pct = intOrNull(body.battery_pct);
    if (body.rssi != null) deviceRow.rssi = intOrNull(body.rssi);
    if (body.firmware) deviceRow.firmware = String(body.firmware).slice(0, 80);
    if (body.ip) deviceRow.ip = String(body.ip).slice(0, 64);
    await sb.from("guard_devices").upsert(deviceRow, { onConflict: "id" });

    // 通信確認だけならイベントは作らない
    if (kind === "heartbeat") {
      return json(res, 200, {
        ok: true,
        server_time: nowIso,
        jst: jstTimeParts(),
        armed: settings.armed,
        store_open: settings.store_open,
        store_close: settings.store_close,
        match_window_min: settings.match_window_min,
        motion_threshold: settings.motion_threshold,
        roi: settings.roi,
        retention_days: settings.retention_days,
        video_enabled: settings.video_enabled,
        video_retention_days: settings.video_retention_days,
        clip_seconds: settings.clip_seconds,
        clip_fps: settings.clip_fps,
        hub_buzzer_enabled: settings.hub_buzzer_enabled,
      });
    }

    const eventId = randomUUID();
    const meta = {
      source: String(body.source || deviceId),
      product_name: body.product_name ? String(body.product_name).slice(0, 120) : null,
      code: body.code ? String(body.code).slice(0, 12) : null,
      firmware: body.firmware ? String(body.firmware).slice(0, 80) : null,
      battery_pct: intOrNull(body.battery_pct),
      rssi: intOrNull(body.rssi),
    };

    const { data: inserted, error: iErr } = await sb
      .from("guard_events")
      .insert({
        id: eventId,
        device_id: deviceId,
        kind: ["motion", "pickup", "test", "manual", "tamper", "offline"].includes(kind)
          ? kind
          : "motion",
        occurred_at: occurredAt,
        received_at: nowIso,
        product_id: productId,
        slot: body.slot ? String(body.slot).slice(0, 64) : null,
        delta,
        status: "new",
        note: body.note ? String(body.note).slice(0, 500) : null,
        meta,
      })
      .select("id")
      .single();

    if (iErr || !inserted) {
      console.error("guard_events insert error:", iErr);
      return json(res, 500, { ok: false, error: "EVENT_INSERT_FAILED" });
    }

    // 証拠画像（base64 JPEG）を非公開バケットへ保存
    let imagePath = null;
    let imageSha = null;
    if (body.image_b64) {
      try {
        const raw = String(body.image_b64).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
        const buf = Buffer.from(raw, "base64");
        if (buf.length > 0 && buf.length <= 2_500_000) {
          imageSha = createHash("sha256").update(buf).digest("hex");
          imagePath = `${ymdJst(new Date(occurredAt))}/${eventId}.jpg`;
          const { error: upErr } = await sb.storage
            .from("guard-evidence")
            .upload(imagePath, buf, { contentType: "image/jpeg", upsert: true });
          if (upErr) {
            console.error("evidence upload failed:", upErr);
            imagePath = null;
            imageSha = null;
          }
        }
      } catch (e) {
        console.error("image decode failed:", e);
        imagePath = null;
      }
    }

    // 5秒録画（フレーム連番）を保存
    let videoPath = null;
    let frameCount = 0;
    let videoFps = null;

    const frames = Array.isArray(body.frames_b64) ? body.frames_b64.slice(0, 25) : [];
    if (settings.video_enabled && frames.length >= 4) {
      const folder = `${ymdJst(new Date(occurredAt))}/${eventId}`;
      let uploaded = 0;

      for (let i = 0; i < frames.length; i++) {
        try {
          const raw = String(frames[i] || "").replace(
            /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
            ""
          );
          const buf = Buffer.from(raw, "base64");
          if (!buf.length || buf.length > 300_000) continue;

          const path = `${folder}/frame_${String(i).padStart(3, "0")}.jpg`;
          const { error } = await sb.storage
            .from("guard-evidence")
            .upload(path, buf, { contentType: "image/jpeg", upsert: true });
          if (!error) uploaded++;
        } catch (e) {
          console.error("clip frame upload failed:", e);
        }
      }

      if (uploaded === frames.length && uploaded >= 4) {
        videoPath = folder;
        frameCount = uploaded;
        videoFps = Math.max(
          1,
          Math.min(10, intOrNull(body.fps) || Number(settings.clip_fps) || 3)
        );
      } else {
        // 欠けた連番を残さない
        const { data: listed } = await sb.storage.from("guard-evidence").list(folder, { limit: 100 });
        if (listed?.length) {
          await sb.storage
            .from("guard-evidence")
            .remove(listed.map((o) => `${folder}/${o.name}`));
        }
      }
    }

    let status = "new";
    let matchedOrder = null;
    let note = body.note ? String(body.note).slice(0, 500) : null;

    if (kind === "test") {
      status = "ok";
      note = note || "テスト通知";
    } else if (!settings.armed) {
      status = "ignored";
      note = note || "監視停止中のため記録のみ";
    } else if (kind === "pickup") {
      matchedOrder = await findOrderByCode(sb, body.code, productId);
      if (matchedOrder) {
        status = "ok";
        note = note || "受け取りコードで照合しました";
      } else {
        status = "ignored";
        note = note || "受け取りコードが一致しませんでした";
      }
    } else {
      matchedOrder = await pickOrderForEvent(sb, settings, { occurred_at: occurredAt }, productId, delta);
      if (matchedOrder) {
        status = "ok";
        note = note || `支払い済み注文 ${String(matchedOrder.id).slice(0, 8)} と照合しました`;
      } else if (!isWithinStoreHours(settings, new Date())) {
        status = "ignored";
        note = note || "営業時間外のため記録のみ";
      } else {
        status = "suspicious";
        note = note || "支払い済みの注文と照合できませんでした";
      }
    }

    // 同じ不審が短時間に連続した場合は通知だけ抑制する（記録は残す）
    let notifySuppressed = false;
    const cooldownSec = Math.max(0, Number(settings.suspicious_cooldown_sec || 60));
    if (status === "suspicious" && cooldownSec > 0) {
      const since = new Date(Date.now() - cooldownSec * 1000).toISOString();
      const { data: recent } = await sb
        .from("guard_events")
        .select("id")
        .eq("status", "suspicious")
        .gte("received_at", since)
        .neq("id", eventId)
        .limit(1);
      notifySuppressed = (recent || []).length > 0;
    }

    const { error: uErr } = await sb
      .from("guard_events")
      .update({
        status,
        order_id: matchedOrder?.id || null,
        note,
        image_path: imagePath,
        image_sha256: imageSha,
        video_path: videoPath,
        frame_count: frameCount || null,
        fps: videoFps,
        meta: { ...meta, notified: false, notify_suppressed: notifySuppressed },
      })
      .eq("id", eventId);

    if (uErr) console.error("guard_events update error:", uErr);

    const notifyAllowed = asBool(settings.notify_on_suspicious, false);
    const shouldNotify =
      (notifyAllowed &&
        !notifySuppressed &&
        (kind === "test" || status === "suspicious")) ||
      (status === "ok" && matchedOrder && asBool(settings.notify_on_pickup, false));

    let notifyResult = null;
    if (shouldNotify) {
      const eventForNotify = {
        ...inserted,
        id: eventId,
        device_id: deviceId,
        kind,
        occurred_at: occurredAt,
        received_at: nowIso,
        status,
        note,
        order_id: matchedOrder?.id || null,
        image_path: imagePath,
        video_path: videoPath,
        frame_count: frameCount,
      };
      notifyResult = await notifyGuard(sb, settings, eventForNotify, matchedOrder, imagePath);
      await sb
        .from("guard_events")
        .update({
          meta: {
            ...meta,
            notified: true,
            notify_suppressed: false,
            notify_result: {
              teams: notifyResult.teams,
              email: notifyResult.email,
            },
          },
        })
        .eq("id", eventId);
    }

    return json(res, 200, {
      ok: true,
      event_id: eventId,
      status,
      order_id: matchedOrder?.id || null,
      video_path: videoPath,
      frame_count: frameCount,
      fps: videoFps,
      notified: shouldNotify,
      notify: notifyResult,
    });
  } catch (e) {
    console.error("GUARD_EVENT_ERROR:", e);
    return json(res, 500, { ok: false, error: String(e?.message || e) });
  }
}
