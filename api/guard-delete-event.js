// api/guard-delete-event.js
// 管理画面からイベントと証拠画像・5秒録画を削除する
import { getAdminClient } from "./_guard.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  try {
    const sb = getAdminClient();
    const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!auth) return res.status(401).json({ ok: false, error: "NO_AUTH" });

    const { data: userData, error: uErr } = await sb.auth.getUser(auth);
    if (uErr || !userData?.user) return res.status(401).json({ ok: false, error: "BAD_AUTH" });

    const { data: profile } = await sb
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.is_admin) return res.status(403).json({ ok: false, error: "NOT_ADMIN" });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const eventId = String(body.event_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
      return res.status(400).json({ ok: false, error: "BAD_EVENT_ID" });
    }

    const { data: event, error: eErr } = await sb
      .from("guard_events")
      .select("id,image_path,video_path")
      .eq("id", eventId)
      .maybeSingle();

    if (eErr) return res.status(500).json({ ok: false, error: "QUERY_FAILED" });
    if (!event) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const paths = [];
    if (event.image_path) paths.push(event.image_path);

    if (event.video_path) {
      const { data: objects } = await sb.storage
        .from("guard-evidence")
        .list(event.video_path, { limit: 100 });
      for (const obj of objects || []) {
        paths.push(`${event.video_path}/${obj.name}`);
      }
    }

    let removed = 0;
    if (paths.length) {
      const { error: rmErr } = await sb.storage.from("guard-evidence").remove(paths);
      if (rmErr) {
        console.error("evidence remove failed:", rmErr);
        return res.status(500).json({ ok: false, error: "STORAGE_DELETE_FAILED" });
      }
      removed = paths.length;
    }

    const { error: dErr } = await sb.from("guard_events").delete().eq("id", eventId);
    if (dErr) return res.status(500).json({ ok: false, error: "EVENT_DELETE_FAILED" });

    return res.status(200).json({ ok: true, event_id: eventId, files_deleted: removed });
  } catch (e) {
    console.error("GUARD_DELETE_EVENT_ERROR:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
