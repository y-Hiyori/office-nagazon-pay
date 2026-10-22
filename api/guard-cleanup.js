// api/guard-cleanup.js
// 毎日1回：証拠画像・8秒録画の保存期間切れ削除
//   Vercel Cron から呼ばれる（CRON_SECRET を設定すると Authorization: Bearer <CRON_SECRET> が付く）
import { createHash, timingSafeEqual } from "crypto";
import { getAdminClient } from "./_guard.js";

export const config = { maxDuration: 60 };

function sha256(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

function tokenMatches(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(sha256(a));
  const y = Buffer.from(sha256(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const sb = getAdminClient();
    const { data: settings } = await sb.from("guard_settings").select("*").eq("id", 1).single();
    if (!settings) return res.status(500).json({ ok: false, error: "SETTINGS_NOT_FOUND" });

    const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const provided = String(req.headers["x-guard-token"] || req.query?.token || "");
    const isVercelCron = String(req.headers["x-vercel-cron"] || "") === "1";
    const cronOk =
      (Boolean(process.env.CRON_SECRET) && bearer === process.env.CRON_SECRET) ||
      (!process.env.CRON_SECRET && isVercelCron);
    const deviceOk = tokenMatches(provided, settings.device_token);

    if (!cronOk && !deviceOk) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const retentionDays = Math.max(1, Number(settings.retention_days || 30));

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: oldEvents, error: qErr } = await sb
      .from("guard_events")
      .select("id,image_path")
      .not("image_path", "is", null)
      .lt("received_at", cutoff)
      .limit(200);

    if (qErr) console.error("old events query failed:", qErr);

    // 8秒録画は写真より短い期間（初期14日）で削除
    const videoRetentionDays = Math.max(1, Number(settings.video_retention_days || 14));
    const videoCutoff = new Date(
      Date.now() - videoRetentionDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: videoEvents, error: vErr } = await sb
      .from("guard_events")
      .select("id,video_path")
      .not("video_path", "is", null)
      .lt("received_at", videoCutoff)
      .limit(100);

    if (vErr) console.error("old video events query failed:", vErr);

    let videosDeleted = 0;
    for (const ev of videoEvents || []) {
      if (!ev.video_path) continue;
      const { data: objects } = await sb.storage
        .from("guard-evidence")
        .list(ev.video_path, { limit: 100 });

      if (objects?.length) {
        const { error: rmErr } = await sb.storage
          .from("guard-evidence")
          .remove(objects.map((o) => `${ev.video_path}/${o.name}`));
        if (rmErr) {
          console.error("video remove failed:", ev.video_path, rmErr);
          continue;
        }
      }

      await sb
        .from("guard_events")
        .update({ video_path: null, frame_count: null, fps: null })
        .eq("id", ev.id);
      videosDeleted += 1;
    }

    let imagesDeleted = 0;
    const old = oldEvents || [];
    for (const ev of old) {
      if (!ev.image_path) continue;
      const { error: rmErr } = await sb.storage.from("guard-evidence").remove([ev.image_path]);
      if (rmErr) {
        console.error("evidence remove failed:", ev.image_path, rmErr);
        continue;
      }
      await sb.from("guard_events").update({ image_path: null }).eq("id", ev.id);
      imagesDeleted += 1;
    }

    // 正常・対象外のイベントは180日、テストは30日で整理（不審イベントは残す）
    const deleteBefore = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const { count: deletedOk } = await sb
      .from("guard_events")
      .delete({ count: "exact" })
      .in("status", ["ok", "ignored", "resolved"])
      .lt("received_at", deleteBefore);

    const testBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: deletedTest } = await sb
      .from("guard_events")
      .delete({ count: "exact" })
      .eq("kind", "test")
      .lt("received_at", testBefore);

    return res.status(200).json({
      ok: true,
      images_deleted: imagesDeleted,
      videos_deleted: videosDeleted,
      old_events_cleaned: deletedOk ?? 0,
      test_events_cleaned: deletedTest ?? 0,
      retention_days: retentionDays,
      video_retention_days: videoRetentionDays,
    });
  } catch (e) {
    console.error("GUARD_CLEANUP_ERROR:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
