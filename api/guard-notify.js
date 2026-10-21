// api/guard-notify.js
// 管理画面の「テスト通知」用。管理者のログインTokenを検証してから送信する。
import { getAdminClient, notifyGuard } from "./_guard.js";

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

    const { data: settings } = await sb.from("guard_settings").select("*").eq("id", 1).single();
    if (!settings) return res.status(500).json({ ok: false, error: "SETTINGS_NOT_FOUND" });

    if (!settings.notify_on_suspicious) {
      return res.status(200).json({ ok: true, skipped: true, reason: "NOTIFICATIONS_OFF" });
    }

    const now = new Date().toISOString();
    const eventId = crypto.randomUUID();

    const { error: iErr } = await sb.from("guard_events").insert({
      id: eventId,
      device_id: "camera",
      kind: "test",
      occurred_at: now,
      received_at: now,
      status: "ok",
      note: "管理画面から送信したテスト通知です。",
      meta: { source: "admin" },
    });
    if (iErr) console.error("test event insert failed:", iErr);

    const event = {
      id: eventId,
      device_id: "camera",
      kind: "test",
      occurred_at: now,
      received_at: now,
      status: "ok",
      note: "管理画面から送信したテスト通知です。",
    };

    const result = await notifyGuard(sb, settings, event, null, null);

    await sb
      .from("guard_events")
      .update({
        meta: {
          source: "admin",
          notified: true,
          notify_result: { teams: result.teams, email: result.email },
        },
      })
      .eq("id", eventId);

    return res.status(200).json({ ok: true, event_id: eventId, ...result });
  } catch (e) {
    console.error("GUARD_NOTIFY_ERROR:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
