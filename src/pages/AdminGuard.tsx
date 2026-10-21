// src/pages/AdminGuard.tsx
// 見守りダッシュボード：不審イベント・証拠写真・端末・通知設定
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import AdminHeader from "../components/AdminHeader";
import Loading from "../components/Loading";
import { appDialog } from "../lib/appDialog";
import { lockScroll, unlockScroll } from "../lib/scrollLock";
import { supabase } from "../lib/supabase";
import "./AdminGuard.css";

type GuardSettings = {
  id: number;
  armed: boolean;
  store_open: string;
  store_close: string;
  match_window_min: number;
  suspicious_cooldown_sec: number;
  motion_threshold: number;
  roi: { x: number; y: number; w: number; h: number } | null;
  teams_webhook_url: string | null;
  alert_email: string | null;
  retention_days: number;
  notify_on_suspicious: boolean;
  notify_on_pickup: boolean;
  video_enabled: boolean;
  video_retention_days: number;
  clip_seconds: number;
  clip_fps: number;
  hub_buzzer_enabled: boolean;
  device_token: string;
  updated_at: string;
};

type GuardEvent = {
  id: string;
  device_id: string | null;
  kind: string;
  occurred_at: string;
  received_at: string;
  order_id: string | null;
  product_id: number | null;
  slot: string | null;
  delta: number | null;
  status: "new" | "ok" | "suspicious" | "resolved" | "ignored";
  image_path: string | null;
  image_sha256: string | null;
  video_path: string | null;
  frame_count: number | null;
  fps: number | null;
  note: string | null;
  meta: { product_name?: string | null; source?: string | null } | null;
  handled_at: string | null;
  handle_note: string | null;
};

type CandidateOrder = {
  id: string;
  paid_at: string | null;
  created_at: string | null;
  status: string;
  fulfillment_type: string | null;
  pickup_status: string | null;
  total: number | null;
  name: string | null;
  email: string | null;
  order_items: { product_name: string | null; quantity: number | null; price: number | null }[] | null;
};

const CANDIDATE_SELECT =
  "id,paid_at,created_at,status,fulfillment_type,pickup_status,total,name,email,order_items(product_name,quantity,price)";

type GuardDevice = {
  id: string;
  name: string;
  kind: string;
  last_seen_at: string | null;
  battery_pct: number | null;
  rssi: number | null;
  firmware: string | null;
  ip: string | null;
  is_active: boolean;
};

type FormState = {
  armed: boolean;
  store_open: string;
  store_close: string;
  match_window_min: number;
  suspicious_cooldown_sec: number;
  motion_threshold: number;
  roi_x: number;
  roi_y: number;
  roi_w: number;
  roi_h: number;
  teams_webhook_url: string;
  alert_email: string;
  retention_days: number;
  notify_on_suspicious: boolean;
  notify_on_pickup: boolean;
  video_enabled: boolean;
  video_retention_days: number;
  clip_seconds: number;
  clip_fps: number;
  hub_buzzer_enabled: boolean;
  device_token: string;
};

const STATUS_LABEL: Record<GuardEvent["status"], string> = {
  new: "未確認",
  ok: "照合済み",
  suspicious: "不審",
  resolved: "解決済み",
  ignored: "対象外",
};

const KIND_LABEL: Record<string, string> = {
  motion: "棚まわりの動き",
  pickup: "受け取り",
  heartbeat: "通信確認",
  test: "テスト通知",
  manual: "手動記録",
  tamper: "端末・設置の異常",
  offline: "端末オフライン",
};

const hhmm = (t: string | null | undefined) => String(t || "00:00").slice(0, 5);

const fmt = (s?: string | null, withDate = true) => {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    ...(withDate ? { month: "2-digit", day: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  });
};

const relative = (s?: string | null) => {
  if (!s) return "未接続";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "未接続";
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
};

function mapForm(s: GuardSettings): FormState {
  const roi = s.roi || { x: 0.12, y: 0.18, w: 0.76, h: 0.64 };
  return {
    armed: !!s.armed,
    store_open: hhmm(s.store_open),
    store_close: hhmm(s.store_close),
    match_window_min: Number(s.match_window_min ?? 20),
    suspicious_cooldown_sec: Number(s.suspicious_cooldown_sec ?? 60),
    motion_threshold: Number(s.motion_threshold ?? 18),
    roi_x: Number(roi.x ?? 0.12),
    roi_y: Number(roi.y ?? 0.18),
    roi_w: Number(roi.w ?? 0.76),
    roi_h: Number(roi.h ?? 0.64),
    teams_webhook_url: s.teams_webhook_url || "",
    alert_email: s.alert_email || "",
    retention_days: Number(s.retention_days ?? 7),
    notify_on_suspicious: !!s.notify_on_suspicious,
    notify_on_pickup: !!s.notify_on_pickup,
    video_enabled: s.video_enabled !== false,
    video_retention_days: Number(s.video_retention_days ?? 7),
    clip_seconds: Number(s.clip_seconds ?? 5),
    clip_fps: Number(s.clip_fps ?? 3),
    hub_buzzer_enabled: !!s.hub_buzzer_enabled,
    device_token: s.device_token || "",
  };
}

export default function AdminGuard() {
  const navigate = useNavigate();

  const [settings, setSettings] = useState<GuardSettings | null>(null);
  const [events, setEvents] = useState<GuardEvent[]>([]);
  const [devices, setDevices] = useState<GuardDevice[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<{ total: number; done: number } | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [tab, setTab] = useState<"events" | "settings" | "devices">("events");
  const [filter, setFilter] = useState<"all" | "unhandled" | "suspicious" | "ok">("all");
  const [selected, setSelected] = useState<GuardEvent | null>(null);
  const [handleNote, setHandleNote] = useState("");
  const [showToken, setShowToken] = useState(false);

  const [clipFrames, setClipFrames] = useState<string[]>([]);
  const [clipIndex, setClipIndex] = useState(0);
  const [clipPlaying, setClipPlaying] = useState(true);
  const [clipLoading, setClipLoading] = useState(false);
  const [candidates, setCandidates] = useState<CandidateOrder[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  const loadSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from("guard_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      const s = data as GuardSettings;
      setSettings(s);
      setForm(mapForm(s));
    }
  }, []);

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from("guard_events")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(150);

    if (error) throw error;
    setEvents((data || []) as GuardEvent[]);
  }, []);

  const loadDevices = useCallback(async () => {
    const { data, error } = await supabase
      .from("guard_devices")
      .select("*")
      .order("kind", { ascending: true });

    if (error) throw error;
    setDevices((data || []) as GuardDevice[]);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      await Promise.all([loadSettings(), loadEvents(), loadDevices()]);
    } catch (e) {
      setErr(
        `見守りデータを読み込めませんでした。supabase_v46_guard.sql を実行したか確認してください。(${
          e instanceof Error ? e.message : String(e)
        })`
      );
    } finally {
      setLoading(false);
    }
  }, [loadSettings, loadEvents, loadDevices]);

  useEffect(() => {
    loadAll();
    const timer = window.setInterval(() => {
      loadEvents().catch(() => {});
      loadDevices().catch(() => {});
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadAll, loadEvents, loadDevices]);

  // 証拠画像の署名付きURLをまとめて取得（非公開バケット）
  useEffect(() => {
    let alive = true;
    const targets = events
      .filter((e) => e.image_path && !imageUrls[e.image_path])
      .slice(0, 40);

    if (targets.length === 0) return;

    (async () => {
      for (const ev of targets) {
        if (!ev.image_path) continue;
        const { data } = await supabase.storage
          .from("guard-evidence")
          .createSignedUrl(ev.image_path, 3600);
        if (!alive) return;
        if (data?.signedUrl) {
          setImageUrls((prev) => ({ ...prev, [ev.image_path as string]: data.signedUrl }));
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [events, imageUrls]);

  // 一覧から消えたイベントの選択状態を解除
  useEffect(() => {
    setCheckedIds((prev) => {
      const next = prev.filter((id) => events.some((e) => e.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [events]);

  useEffect(() => {
    if (selected) lockScroll("guard-modal");
    else unlockScroll("guard-modal");
    return () => unlockScroll("guard-modal");
  }, [selected]);

  // 5秒録画のフレームを署名付きURLで読み込む
  useEffect(() => {
    let alive = true;
    setClipFrames([]);
    setClipIndex(0);
    setClipPlaying(true);
    setClipLoading(false);

    if (!selected?.video_path || !selected.frame_count) return;

    const videoPath = selected.video_path;
    const frameCount = selected.frame_count;
    setClipLoading(true);
    (async () => {
      const urls: string[] = [];
      for (let i = 0; i < frameCount; i++) {
        const path = `${videoPath}/frame_${String(i).padStart(3, "0")}.jpg`;
        const { data } = await supabase.storage
          .from("guard-evidence")
          .createSignedUrl(path, 3600);
        if (!alive) return;
        if (data?.signedUrl) urls.push(data.signedUrl);
      }
      if (!alive) return;
      setClipFrames(urls);
      setClipLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [selected]);

  // フレームを順番に再生する
  useEffect(() => {
    if (!clipPlaying || clipFrames.length < 2) return;
    const fps = Math.max(1, Math.min(10, Number(selected?.fps) || 3));
    const timer = window.setInterval(() => {
      setClipIndex((i) => (i + 1) % clipFrames.length);
    }, Math.round(1000 / fps));
    return () => window.clearInterval(timer);
  }, [clipPlaying, clipFrames.length, selected?.fps]);

  // イベントの前後60分の支払い済み注文を「おそらくの購入履歴」として表示
  useEffect(() => {
    let alive = true;
    setCandidates([]);
    setCandidateLoading(false);
    if (!selected) return;

    const base = new Date(selected.occurred_at || selected.received_at).getTime();
    if (!Number.isFinite(base)) return;

    const from = new Date(base - 60 * 60 * 1000).toISOString();
    const to = new Date(base + 60 * 60 * 1000).toISOString();
    setCandidateLoading(true);

    (async () => {
      const { data } = await supabase
        .from("orders")
        .select(CANDIDATE_SELECT)
        .eq("status", "paid")
        .or("fulfillment_type.is.null,fulfillment_type.neq.shipping")
        .gte("paid_at", from)
        .lte("paid_at", to)
        .order("paid_at", { ascending: false })
        .limit(10);

      if (!alive) return;
      let rows = (data || []) as CandidateOrder[];

      if (selected.order_id && !rows.some((o) => o.id === selected.order_id)) {
        const { data: matched } = await supabase
          .from("orders")
          .select(CANDIDATE_SELECT)
          .eq("id", selected.order_id)
          .maybeSingle();
        if (matched) rows = [matched as CandidateOrder, ...rows];
      }

      if (!alive) return;
      setCandidates(rows);
      setCandidateLoading(false);
    })().catch(() => {
      if (alive) {
        setCandidates([]);
        setCandidateLoading(false);
      }
    });

    return () => {
      alive = false;
    };
  }, [selected]);

  const todayStart = useMemo(() => {
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return new Date(`${ymd}T00:00:00+09:00`).getTime();
  }, []);

  const stats = useMemo(() => {
    const today = events.filter((e) => new Date(e.received_at).getTime() >= todayStart);
    return {
      today: today.length,
      suspicious: today.filter((e) => e.status === "suspicious").length,
      unhandled: events.filter((e) => e.status === "new" || e.status === "suspicious").length,
    };
  }, [events, todayStart]);

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "suspicious") return events.filter((e) => e.status === "suspicious");
    if (filter === "ok") return events.filter((e) => e.status === "ok");
    return events.filter((e) => e.status === "new" || e.status === "suspicious");
  }, [events, filter]);

  const allFilteredChecked =
    filtered.length > 0 && filtered.every((e) => checkedIds.includes(e.id));

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (allFilteredChecked) {
      setCheckedIds((prev) => prev.filter((id) => !filtered.some((e) => e.id === id)));
    } else {
      setCheckedIds((prev) => [...new Set([...prev, ...filtered.map((e) => e.id)])]);
    }
  };

  const hubDevice = devices.find((d) => d.kind === "hub");
  const cameraDevice = devices.find((d) => d.kind === "camera");
  const hubOnline =
    !!hubDevice?.last_seen_at && Date.now() - new Date(hubDevice.last_seen_at).getTime() < 180000;
  const latestSeen =
    devices
      .map((d) => new Date(d.last_seen_at || 0).getTime())
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => b - a)
      .map((t) => relative(new Date(t).toISOString()))[0] || "未接続";

  const patchForm = <K extends keyof FormState,>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const toggleArmed = async () => {
    if (!form || busy) return;
    const next = !form.armed;
    setForm({ ...form, armed: next });
    setBusy(true);
    const { error } = await supabase.from("guard_settings").update({ armed: next }).eq("id", 1);
    setBusy(false);
    if (error) {
      setForm({ ...form, armed: !next });
      setErr(`監視の切り替えに失敗しました：${error.message}`);
      return;
    }
    setSettings((s) => (s ? { ...s, armed: next } : s));
    setMsg(next ? "監視をONにしました。" : "監視をOFFにしました（記録のみ）。");
  };

  const saveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || busy) return;

    const roi = {
      x: Math.min(0.95, Math.max(0, Number(form.roi_x) || 0)),
      y: Math.min(0.95, Math.max(0, Number(form.roi_y) || 0)),
      w: Math.min(1, Math.max(0.05, Number(form.roi_w) || 0.76)),
      h: Math.min(1, Math.max(0.05, Number(form.roi_h) || 0.64)),
    };

    setBusy(true);
    setErr("");
    setMsg("");

    const { error } = await supabase
      .from("guard_settings")
      .update({
        armed: form.armed,
        store_open: form.store_open,
        store_close: form.store_close,
        match_window_min: Math.max(1, Math.min(180, Number(form.match_window_min) || 20)),
        suspicious_cooldown_sec: Math.max(
          0,
          Math.min(600, Number(form.suspicious_cooldown_sec) || 0)
        ),
        motion_threshold: Math.max(3, Math.min(80, Number(form.motion_threshold) || 18)),
        roi,
        teams_webhook_url: form.teams_webhook_url.trim() || null,
        alert_email: form.alert_email.trim() || null,
        retention_days: Math.max(1, Math.min(180, Number(form.retention_days) || 7)),
        notify_on_suspicious: form.notify_on_suspicious,
        notify_on_pickup: form.notify_on_pickup,
        video_enabled: form.video_enabled,
        video_retention_days: Math.max(
          1,
          Math.min(90, Number(form.video_retention_days) || 7)
        ),
        clip_seconds: Math.max(3, Math.min(10, Number(form.clip_seconds) || 5)),
        clip_fps: Math.max(1, Math.min(10, Number(form.clip_fps) || 3)),
        hub_buzzer_enabled: form.hub_buzzer_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    setBusy(false);

    if (error) {
      setErr(`設定を保存できませんでした：${error.message}`);
      return;
    }

    setMsg("設定を保存しました。");
    await loadSettings().catch(() => {});
  };

  const testNotify = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setErr("ログイン情報を取得できませんでした。再ログインしてください。");
        return;
      }

      const r = await fetch("/api/guard-notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ type: "test" }),
      });
      const j = (await r.json().catch(() => null)) as
        | { ok?: boolean; skipped?: boolean; reason?: string; error?: string; teams?: { ok?: boolean; reason?: string; detail?: string }; email?: { ok?: boolean; reason?: string; detail?: string } }
        | null;

      if (j?.skipped) {
        setMsg("通知はOFFです。設定の「不審な動きを通知する」をONにするとテストできます。");
        return;
      }

      if (!r.ok || !j?.ok) {
        setErr(`テスト通知を送信できませんでした：${j?.error || `HTTP ${r.status}`}`);
        return;
      }

      const teams = j.teams;
      const email = j.email;
      if (teams?.ok) setMsg("Teamsへテスト通知を送信しました。");
      else if (email?.ok) setMsg("Teamsは未設定/失敗のため、メールでテスト通知を送信しました。");
      else
        setErr(
          `通知を送信できませんでした。Teams: ${teams?.reason || teams?.detail || "-"} / メール: ${
            email?.reason || email?.detail || "-"
          }`
        );

      await loadEvents().catch(() => {});
    } catch (e) {
      setErr(`テスト通知に失敗しました：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const rotateToken = async () => {
    if (busy) return;
    const ok = await appDialog.confirm({
      title: "端末トークンを再発行",
      message:
        "再発行すると、現在のトークンを使っている端末は通信できなくなります。端末の設定（Basic / Camera）を新しいトークンに更新してください。",
      okText: "再発行する",
      cancelText: "やめる",
    });
    if (!ok) return;

    setBusy(true);
    const { data, error } = await supabase.rpc("guard_rotate_token");
    setBusy(false);

    if (error) {
      setErr(`再発行に失敗しました：${error.message}`);
      return;
    }

    const token = String(data || "");
    setForm((prev) => (prev ? { ...prev, device_token: token } : prev));
    setSettings((s) => (s ? { ...s, device_token: token } : s));
    setShowToken(true);
    setMsg("端末トークンを再発行しました。端末側の設定を更新してください。");
  };

  const copyToken = async () => {
    if (!form?.device_token) return;
    try {
      await navigator.clipboard.writeText(form.device_token);
      setMsg("端末トークンをコピーしました。");
    } catch {
      setErr("コピーできませんでした。表示されている文字を選択してコピーしてください。");
    }
  };

  const setEventStatus = async (status: GuardEvent["status"]) => {
    if (!selected || busy) return;
    setBusy(true);
    setErr("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("guard_events")
      .update({
        status,
        handle_note: handleNote.trim() || null,
        handled_at: new Date().toISOString(),
        handled_by: user?.id ?? null,
      })
      .eq("id", selected.id);

    setBusy(false);

    if (error) {
      setErr(`更新できませんでした：${error.message}`);
      return;
    }

    setSelected(null);
    setHandleNote("");
    setMsg(`「${STATUS_LABEL[status]}」に更新しました。`);
    await loadEvents().catch(() => {});
  };

  const deleteEvent = async () => {
    if (!selected || busy) return;

    const ok = await appDialog.confirm({
      title: "イベントを削除",
      message:
        "このイベントと証拠画像・5秒録画を完全に削除します。元に戻せません。\n注文の受け取り状態は変更されません。",
      okText: "削除する",
      cancelText: "やめる",
    });
    if (!ok) return;

    setBusy(true);
    setDeleteStatus({ total: 1, done: 0 });
    setErr("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setErr("ログイン情報を取得できませんでした。再ログインしてください。");
        return;
      }

      const r = await fetch("/api/guard-delete-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ event_id: selected.id }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!r.ok || !j?.ok) {
        setErr(`削除できませんでした：${j?.error || `HTTP ${r.status}`}`);
        return;
      }

      setDeleteStatus({ total: 1, done: 1 });
      setSelected(null);
      setHandleNote("");
      setMsg("イベントと証拠画像・録画を削除しました。");
      await loadEvents().catch(() => {});
    } catch (e) {
      setErr(`削除に失敗しました：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleteStatus(null);
      setBusy(false);
    }
  };

  const deleteSelected = async () => {
    if (!checkedIds.length || busy) return;

    const count = checkedIds.length;
    const ok = await appDialog.confirm({
      title: `${count}件のイベントを削除`,
      message:
        "選択したイベントと証拠画像・5秒録画をまとめて削除します。元に戻せません。\n注文の受け取り状態は変更されません。",
      okText: "まとめて削除する",
      cancelText: "やめる",
    });
    if (!ok) return;

    setBusy(true);
    setDeleteStatus({ total: count, done: 0 });
    setErr("");
    setMsg("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setErr("ログイン情報を取得できませんでした。再ログインしてください。");
        return;
      }

      const chunks: string[][] = [];
      for (let i = 0; i < checkedIds.length; i += 20) {
        chunks.push(checkedIds.slice(i, i + 20));
      }

      let deleted = 0;
      let processed = 0;
      for (const chunk of chunks) {
        const r = await fetch("/api/guard-delete-event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ event_ids: chunk }),
        });
        const j = (await r.json().catch(() => null)) as
          | { ok?: boolean; deleted?: number; error?: string }
          | null;

        if (!r.ok || !j?.ok) {
          setErr(`削除できませんでした：${j?.error || `HTTP ${r.status}`}`);
          await loadEvents().catch(() => {});
          return;
        }
        deleted += Number(j.deleted || 0);
        processed += chunk.length;
        setDeleteStatus({ total: count, done: Math.min(count, processed) });
      }

      if (selected && checkedIds.includes(selected.id)) {
        setSelected(null);
        setHandleNote("");
      }
      setCheckedIds([]);
      setMsg(`${deleted}件のイベントと証拠画像・録画を削除しました。`);
      await loadEvents().catch(() => {});
    } catch (e) {
      setErr(`削除に失敗しました：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleteStatus(null);
      setBusy(false);
    }
  };

  const openEvent = (ev: GuardEvent) => {
    setSelected(ev);
    setHandleNote(ev.handle_note || "");
  };

  const roiPreview = form
    ? {
        left: `${Math.max(0, Math.min(1, form.roi_x)) * 100}%`,
        top: `${Math.max(0, Math.min(1, form.roi_y)) * 100}%`,
        width: `${Math.max(0.05, Math.min(1, form.roi_w)) * 100}%`,
        height: `${Math.max(0.05, Math.min(1, form.roi_h)) * 100}%`,
      }
    : undefined;

  return (
    <>
      <AdminHeader />

      <main className="guard-page">
        <header className="guard-head">
          <div>
            <h1>見守りダッシュボード</h1>
            <p className="guard-lead">
              棚の前に置いたカメラが動きを検知し、支払い済みの注文と照合します。
              照合できない動きは証拠画像つきで記録し、Teams／メールへ通知します。
            </p>
          </div>
          <button
            type="button"
            className={`guard-power ${form?.armed ? "is-on" : "is-off"}`}
            onClick={toggleArmed}
            disabled={busy || !form}
          >
            <span className="guard-power-dot" />
            {form?.armed ? "監視中" : "監視OFF"}
          </button>
        </header>

        {err && <div className="guard-alert is-err">{err}</div>}
        {msg && <div className="guard-alert is-ok">{msg}</div>}

        {loading ? (
          <Loading />
        ) : !settings || !form ? (
          <div className="guard-empty">
            <h2>見守りがまだ設定されていません</h2>
            <p>
              SupabaseのSQL Editorで <code>supabase_v46_guard.sql</code> を実行すると、
              この画面が使えるようになります。
            </p>
            <button type="button" className="guard-btn" onClick={loadAll}>
              再読み込み
            </button>
          </div>
        ) : (
          <>
            <section className="guard-stats" aria-label="見守りの状況">
              <div className="guard-stat">
                <span className="guard-stat-label">今日の記録</span>
                <strong>{stats.today}</strong>
                <span className="guard-stat-sub">件</span>
              </div>
              <div className={`guard-stat ${stats.suspicious > 0 ? "is-danger" : ""}`}>
                <span className="guard-stat-label">今日の不審</span>
                <strong>{stats.suspicious}</strong>
                <span className="guard-stat-sub">件</span>
              </div>
              <div className={`guard-stat ${stats.unhandled > 0 ? "is-warn" : ""}`}>
                <span className="guard-stat-label">未対応</span>
                <strong>{stats.unhandled}</strong>
                <span className="guard-stat-sub">件</span>
              </div>
              <div className="guard-stat">
                <span className="guard-stat-label">最終通信</span>
                <strong className="is-small">{latestSeen}</strong>
                <span className="guard-stat-sub">
                  ハブ {hubOnline ? "OK" : "未接続"} / カメラ {relative(cameraDevice?.last_seen_at)}
                </span>
              </div>
            </section>

            <nav className="guard-tabs" aria-label="見守りメニュー">
              <button
                type="button"
                className={`guard-tab ${tab === "events" ? "is-on" : ""}`}
                onClick={() => setTab("events")}
              >
                イベント
                {stats.unhandled > 0 && <span className="guard-tab-n">{stats.unhandled}</span>}
              </button>
              <button
                type="button"
                className={`guard-tab ${tab === "settings" ? "is-on" : ""}`}
                onClick={() => setTab("settings")}
              >
                設定
              </button>
              <button
                type="button"
                className={`guard-tab ${tab === "devices" ? "is-on" : ""}`}
                onClick={() => setTab("devices")}
              >
                端末
              </button>
            </nav>

            {tab === "events" && (
              <section className="guard-panel">
                <div className="guard-filters">
                  {(
                    [
                      ["all", "すべて"],
                      ["unhandled", "未対応"],
                      ["suspicious", "不審"],
                      ["ok", "照合済み"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`guard-chip ${filter === key ? "is-on" : ""}`}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="guard-count">{filtered.length}件</span>
                </div>

                {filtered.length > 0 && (
                  <div className="guard-bulk">
                    <label className="guard-bulk-check">
                      <input
                        type="checkbox"
                        checked={allFilteredChecked}
                        onChange={toggleAll}
                      />
                      すべて選択
                    </label>
                    <span className="guard-bulk-count">{checkedIds.length}件選択中</span>
                    <button
                      type="button"
                      className="guard-btn is-danger is-mini"
                      onClick={deleteSelected}
                      disabled={checkedIds.length === 0 || busy}
                    >
                      {deleteStatus ? "削除中…" : "選択したイベントを削除"}
                    </button>
                    {checkedIds.length > 0 && (
                      <button
                        type="button"
                        className="guard-btn is-mini"
                        onClick={() => setCheckedIds([])}
                      >
                        選択解除
                      </button>
                    )}
                  </div>
                )}

                {filtered.length === 0 ? (
                  <div className="guard-empty is-soft">
                    <h2>イベントはまだありません</h2>
                    <p>
                      端末を設置して「監視中」にすると、棚まわりの動きがここに記録されます。
                      まずは「設定」タブで監視と通知の設定を確認してください。
                    </p>
                    <button type="button" className="guard-btn" onClick={() => setTab("settings")}>
                      設定へ
                    </button>
                  </div>
                ) : (
                  <div className="guard-list">
                    {filtered.map((ev) => {
                      const url = ev.image_path ? imageUrls[ev.image_path] : "";
                      return (
                        <div
                          key={ev.id}
                          className={`guard-event-row ${
                            checkedIds.includes(ev.id) ? "is-checked" : ""
                          }`}
                        >
                          <label className="guard-event-check">
                            <input
                              type="checkbox"
                              checked={checkedIds.includes(ev.id)}
                              onChange={() => toggleChecked(ev.id)}
                              aria-label="このイベントを選択"
                            />
                          </label>
                          <button
                            type="button"
                            className={`guard-event is-${ev.status}`}
                            onClick={() => openEvent(ev)}
                          >
                          <span className="guard-event-thumb">
                            {url ? (
                              <img src={url} alt="証拠画像" loading="lazy" />
                            ) : (
                              <span className="guard-event-noimg">
                                {ev.status === "suspicious" ? "!" : "•"}
                              </span>
                            )}
                          </span>
                          <span className="guard-event-body">
                            <span className="guard-event-top">
                              <span className={`guard-badge is-${ev.status}`}>
                                {STATUS_LABEL[ev.status]}
                              </span>
                              {ev.video_path && (
                                <span className="guard-video-badge">
                                  ▶ {Math.max(1, Math.round((ev.frame_count || 0) / (ev.fps || 3)))}秒
                                </span>
                              )}
                              <time dateTime={ev.received_at}>{fmt(ev.received_at)}</time>
                            </span>
                            <span className="guard-event-title">
                              {KIND_LABEL[ev.kind] || ev.kind}
                              {ev.order_id ? "・注文と照合" : ""}
                              {ev.meta?.product_name ? `・${ev.meta.product_name}` : ""}
                            </span>
                            <span className="guard-event-meta">
                              {ev.device_id === "camera" ? "証拠カメラ" : "店頭ハブ"}
                              {ev.note ? ` / ${ev.note}` : ""}
                            </span>
                          </span>
                          <span className="guard-event-chev" aria-hidden="true">
                            ›
                          </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {tab === "settings" && (
              <form className="guard-panel guard-form" onSubmit={saveSettings}>
                <section className="guard-section">
                  <h2>監視</h2>
                  <p className="guard-section-note">
                    監視OFFでも記録は残りますが、照合・通知は行いません。
                  </p>

                  <label className="guard-switch">
                    <input
                      type="checkbox"
                      checked={form.armed}
                      onChange={(e) => patchForm("armed", e.target.checked)}
                    />
                    <span className="guard-switch-track" aria-hidden="true">
                      <span />
                    </span>
                    <span className="guard-switch-text">
                      {form.armed ? "監視する" : "監視しない（記録のみ）"}
                    </span>
                  </label>

                  <div className="guard-grid2">
                    <label className="guard-field">
                      <span>開店</span>
                      <input
                        type="time"
                        value={form.store_open}
                        onChange={(e) => patchForm("store_open", e.target.value)}
                      />
                    </label>
                    <label className="guard-field">
                      <span>閉店</span>
                      <input
                        type="time"
                        value={form.store_close}
                        onChange={(e) => patchForm("store_close", e.target.value)}
                      />
                    </label>
                    <label className="guard-field">
                      <span>照合する時間（分）</span>
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={form.match_window_min}
                        onChange={(e) => patchForm("match_window_min", Number(e.target.value))}
                      />
                      <small>決済からこの時間内の動きを「受け取り」とみなします。</small>
                    </label>
                    <label className="guard-field">
                      <span>連続通知を止める間隔（秒）</span>
                      <input
                        type="number"
                        min={0}
                        max={600}
                        value={form.suspicious_cooldown_sec}
                        onChange={(e) =>
                          patchForm("suspicious_cooldown_sec", Number(e.target.value))
                        }
                      />
                      <small>同じ場所で連続したときに通知をまとめます。</small>
                    </label>
                  </div>
                </section>

                <section className="guard-section">
                  <h2>通知</h2>
                  <p className="guard-section-note">
                    Teamsを使う場合のみWebhookを設定してください。未設定ならメール（EmailJS）で通知します。
                  </p>

                  <label className="guard-field">
                    <span>Teams Webhook URL</span>
                    <input
                      type="url"
                      placeholder="https://...webhook.office.com/..."
                      value={form.teams_webhook_url}
                      onChange={(e) => patchForm("teams_webhook_url", e.target.value)}
                    />
                  </label>

                  <label className="guard-field">
                    <span>メールの宛先（複数可・カンマ区切り）</span>
                    <input
                      type="text"
                      placeholder="a@example.com, b@example.com"
                      value={form.alert_email}
                      onChange={(e) => patchForm("alert_email", e.target.value)}
                    />
                    <small>例：a@example.com, b@example.com</small>
                  </label>

                  <div className="guard-checks">
                    <label>
                      <input
                        type="checkbox"
                        checked={form.notify_on_suspicious}
                        onChange={(e) => patchForm("notify_on_suspicious", e.target.checked)}
                      />
                      不審な動きを通知する
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={form.notify_on_pickup}
                        onChange={(e) => patchForm("notify_on_pickup", e.target.checked)}
                      />
                      通常の受け取りも通知する（通知が多い場合があります）
                    </label>
                  </div>

                  <button
                    type="button"
                    className="guard-btn is-ghost"
                    onClick={testNotify}
                    disabled={busy}
                  >
                    {busy ? "送信中…" : "テスト通知を送る"}
                  </button>

                  <details className="guard-help">
                    <summary>Teams（無料）への通知設定</summary>
                    <ol>
                      <li>Teamsのチャネル右上「…」→「ワークフロー」を開きます。</li>
                      <li>「Webhook 要求を受信したときに投稿する」を追加します。</li>
                      <li>発行されたURLをコピーして、上の欄に貼り付けます。</li>
                      <li>「テスト通知を送る」で届くか確認します。</li>
                    </ol>
                    <p>
                      うまく届かないときは、EmailJSの連絡用テンプレート（
                      <code>EMAILJS_CONTACT_TEMPLATE_ID</code>）でメール送信します。
                      環境変数が未設定の場合はメールも送られません。
                    </p>
                  </details>
                </section>

                <section className="guard-section">
                  <h2>録画とアラート</h2>
                  <p className="guard-section-note">
                    商品が取られた瞬間の5秒録画を保存します。支払い済みでも録画されます。
                  </p>

                  <label className="guard-switch">
                    <input
                      type="checkbox"
                      checked={form.video_enabled}
                      onChange={(e) => patchForm("video_enabled", e.target.checked)}
                    />
                    <span className="guard-switch-track" aria-hidden="true">
                      <span />
                    </span>
                    <span className="guard-switch-text">
                      {form.video_enabled ? "5秒録画を保存する" : "録画しない（静止画のみ）"}
                    </span>
                  </label>

                  <label className="guard-switch">
                    <input
                      type="checkbox"
                      checked={form.hub_buzzer_enabled}
                      onChange={(e) => patchForm("hub_buzzer_enabled", e.target.checked)}
                    />
                    <span className="guard-switch-track" aria-hidden="true">
                      <span />
                    </span>
                    <span className="guard-switch-text">
                      {form.hub_buzzer_enabled
                        ? "ハブのブザーを鳴らす"
                        : "ハブは画面表示のみ（メールのみ）"}
                    </span>
                  </label>

                  <div className="guard-grid2">
                    <label className="guard-field">
                      <span>動画の保存期間（日）</span>
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={form.video_retention_days}
                        onChange={(e) =>
                          patchForm("video_retention_days", Number(e.target.value))
                        }
                      />
                      <small>初期7日（1週間）。写真も7日保存です。</small>
                    </label>
                    <label className="guard-field">
                      <span>録画の長さ（秒）</span>
                      <input
                        type="number"
                        min={3}
                        max={10}
                        value={form.clip_seconds}
                        onChange={(e) => patchForm("clip_seconds", Number(e.target.value))}
                      />
                      <small>初期5秒（直前3秒＋直後2秒）。</small>
                    </label>
                    <label className="guard-field">
                      <span>フレームレート（fps）</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={form.clip_fps}
                        onChange={(e) => patchForm("clip_fps", Number(e.target.value))}
                      />
                      <small>初期3fps。大きいほど滑らかですが容量が増えます。</small>
                    </label>
                  </div>

                  <p className="guard-hint">
                    連続録画はカメラをUSB給電しているときだけ有効です。バッテリーのみの場合は
                    15秒間隔の静止画モードになります。
                  </p>
                </section>

                <section className="guard-section">
                  <h2>証拠画像</h2>
                  <p className="guard-section-note">
                    画像は非公開のStorageに保存し、管理者だけが閲覧できます。
                  </p>

                  <div className="guard-grid2">
                    <label className="guard-field">
                      <span>保存期間（日）</span>
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={form.retention_days}
                        onChange={(e) => patchForm("retention_days", Number(e.target.value))}
                      />
                      <small>初期7日（1週間）。毎日1回、期限を過ぎた画像を自動削除します。</small>
                    </label>
                    <label className="guard-field">
                      <span>動きの感度（3〜80）</span>
                      <input
                        type="number"
                        min={3}
                        max={80}
                        value={form.motion_threshold}
                        onChange={(e) => patchForm("motion_threshold", Number(e.target.value))}
                      />
                      <small>小さいほど敏感。誤検知が多いときは上げてください。</small>
                    </label>
                  </div>

                  <div className="guard-roi">
                    <div className="guard-roi-preview">
                      <span className="guard-roi-box" style={roiPreview} />
                      <span className="guard-roi-label">検知する範囲</span>
                    </div>
                    <div className="guard-roi-fields">
                      <label className="guard-field">
                        <span>横位置 x</span>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          max={0.95}
                          value={form.roi_x}
                          onChange={(e) => patchForm("roi_x", Number(e.target.value))}
                        />
                      </label>
                      <label className="guard-field">
                        <span>縦位置 y</span>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          max={0.95}
                          value={form.roi_y}
                          onChange={(e) => patchForm("roi_y", Number(e.target.value))}
                        />
                      </label>
                      <label className="guard-field">
                        <span>幅 w</span>
                        <input
                          type="number"
                          step="0.01"
                          min={0.05}
                          max={1}
                          value={form.roi_w}
                          onChange={(e) => patchForm("roi_w", Number(e.target.value))}
                        />
                      </label>
                      <label className="guard-field">
                        <span>高さ h</span>
                        <input
                          type="number"
                          step="0.01"
                          min={0.05}
                          max={1}
                          value={form.roi_h}
                          onChange={(e) => patchForm("roi_h", Number(e.target.value))}
                        />
                      </label>
                    </div>
                  </div>
                  <p className="guard-hint">
                    カメラの画角のうち、棚と手元が写る範囲を0〜1の割合で指定します。
                    端末はこの設定を通信時に受け取ります。
                  </p>
                </section>

                <section className="guard-section">
                  <h2>端末</h2>
                  <p className="guard-section-note">
                    BasicとCameraの両方に同じトークンを設定します。外部に公開しないでください。
                  </p>

                  <label className="guard-field">
                    <span>端末トークン</span>
                    <span className="guard-token-row">
                      <input
                        type={showToken ? "text" : "password"}
                        value={form.device_token}
                        readOnly
                      />
                      <button type="button" className="guard-btn is-mini" onClick={() => setShowToken((v) => !v)}>
                        {showToken ? "隠す" : "表示"}
                      </button>
                      <button type="button" className="guard-btn is-mini" onClick={copyToken}>
                        コピー
                      </button>
                    </span>
                  </label>

                  <div className="guard-token-actions">
                    <button type="button" className="guard-btn is-danger" onClick={rotateToken} disabled={busy}>
                      トークンを再発行
                    </button>
                  </div>

                  <pre className="guard-code">
{`API_URL   = ${window.location.origin}/api/guard-event
DEVICE    = hub または camera
TOKEN     = ${form.device_token}`}
                  </pre>
                </section>

                <div className="guard-save">
                  <button type="submit" className="guard-btn is-primary" disabled={busy}>
                    {busy ? "保存中…" : "設定を保存"}
                  </button>
                  <span className="guard-save-note">変更はすぐに端末へ反映されます（次回通信時）。</span>
                </div>
              </form>
            )}

            {tab === "devices" && (
              <section className="guard-panel">
                <div className="guard-device-list">
                  {devices.map((d) => {
                    const isCamera = d.kind === "camera";
                    const online =
                      !!d.last_seen_at &&
                      Date.now() - new Date(d.last_seen_at).getTime() <
                        (isCamera ? 26 * 60 * 60 * 1000 : 180000);
                    const stateLabel = isCamera
                      ? online
                        ? "省電力で稼働中"
                        : "長時間通信なし"
                      : online
                        ? "オンライン"
                        : "オフライン";
                    return (
                      <article key={d.id} className={`guard-device ${online ? "is-online" : "is-offline"}`}>
                        <div className="guard-device-head">
                          <span className="guard-device-icon">{d.kind === "camera" ? "📷" : "🖥"}</span>
                          <div>
                            <h2>{d.name}</h2>
                            <span className={`guard-device-state ${online ? "is-online" : "is-offline"}`}>
                              {stateLabel}
                            </span>
                          </div>
                        </div>
                        <dl className="guard-device-kv">
                          <div>
                            <dt>最終通信</dt>
                            <dd>{relative(d.last_seen_at)}</dd>
                          </div>
                          <div>
                            <dt>バッテリー</dt>
                            <dd>{d.battery_pct == null ? "-" : `${d.battery_pct}%`}</dd>
                          </div>
                          <div>
                            <dt>電波</dt>
                            <dd>{d.rssi == null ? "-" : `${d.rssi} dBm`}</dd>
                          </div>
                          <div>
                            <dt>IP</dt>
                            <dd>{d.ip || "-"}</dd>
                          </div>
                          <div>
                            <dt>ファーム</dt>
                            <dd>{d.firmware || "-"}</dd>
                          </div>
                        </dl>
                      </article>
                    );
                  })}
                </div>

                <div className="guard-empty is-soft">
                  <h2>設置のヒント</h2>
                  <p>
                    <strong>カメラ：</strong>棚の斜め上から、棚全体と手元が写る位置に置きます。
                    磁石で金属板に固定できます。バッテリー駆動の場合は15秒間隔の検知になります。
                    USB給電できるなら5秒間隔にできます。
                  </p>
                  <p>
                    <strong>ハブ：</strong>レジ横に置き、画面に「防犯カメラ作動中」と表示します。
                    通知が来たときはブザーとLEDで知らせます。
                  </p>
                  <p>
                    電源をなるべく使わない場合は、モバイルバッテリーから給電してください。
                    ハブはUSB給電、カメラは内蔵バッテリー＋必要ならUSB給電です。
                  </p>
                  <p>
                    カメラは省電力のため常時接続ではありません。最終通信が26時間以内なら正常です。
                    ハブは10秒ごとに通信するため、3分以内ならオンラインと表示します。
                  </p>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {selected && (
        <div
          className="guard-modal-overlay"
          role="presentation"
          onClick={() => {
            setSelected(null);
            setHandleNote("");
          }}
        >
          <div
            className="guard-modal"
            role="dialog"
            aria-modal="true"
            aria-label="イベントの詳細"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="guard-modal-close"
              aria-label="閉じる"
              onClick={() => {
                setSelected(null);
                setHandleNote("");
              }}
            >
              ×
            </button>

            <header className="guard-modal-head">
              <span className={`guard-badge is-${selected.status}`}>
                {STATUS_LABEL[selected.status]}
              </span>
              <h2>{KIND_LABEL[selected.kind] || selected.kind}</h2>
              <p>{fmt(selected.occurred_at)} に記録</p>
            </header>

            <div className="guard-modal-img">
              {clipLoading ? (
                <span>録画を読み込み中…</span>
              ) : clipFrames.length > 0 ? (
                <div className="guard-clip">
                  <img src={clipFrames[clipIndex]} alt="5秒録画のフレーム" />
                  <div className="guard-clip-bar">
                    <button
                      type="button"
                      className="guard-btn is-mini"
                      onClick={() => setClipPlaying((v) => !v)}
                    >
                      {clipPlaying ? "一時停止" : "再生"}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, clipFrames.length - 1)}
                      value={clipIndex}
                      onChange={(e) => {
                        setClipPlaying(false);
                        setClipIndex(Number(e.target.value));
                      }}
                      aria-label="録画の位置"
                    />
                    <span className="guard-clip-count">
                      {clipIndex + 1}/{clipFrames.length}
                    </span>
                  </div>
                </div>
              ) : selected.image_path && imageUrls[selected.image_path] ? (
                <img src={imageUrls[selected.image_path]} alt="証拠画像" />
              ) : (
                <span>証拠画像はありません</span>
              )}
            </div>

            <dl className="guard-kv">
              <div>
                <dt>端末</dt>
                <dd>{selected.device_id === "camera" ? "証拠カメラ" : "店頭ハブ"}</dd>
              </div>
              <div>
                <dt>受信</dt>
                <dd>{fmt(selected.received_at)}</dd>
              </div>
              <div>
                <dt>注文</dt>
                <dd>{selected.order_id ? `${selected.order_id.slice(0, 8)}…` : "該当なし"}</dd>
              </div>
              <div>
                <dt>内容</dt>
                <dd>{selected.note || "-"}</dd>
              </div>
              {selected.image_sha256 && (
                <div>
                  <dt>SHA-256</dt>
                  <dd className="guard-hash">{selected.image_sha256}</dd>
                </div>
              )}
              {selected.handle_note && (
                <div>
                  <dt>対応メモ</dt>
                  <dd>{selected.handle_note}</dd>
                </div>
              )}
            </dl>

            <section className="guard-candidates">
              <div className="guard-candidates-head">
                <h3>おそらくの購入履歴</h3>
                <span>前後60分</span>
              </div>

              {candidateLoading ? (
                <p className="guard-candidate-loading">購入履歴を照合中…</p>
              ) : candidates.length === 0 ? (
                <div className="guard-candidate-empty">
                  <strong>購入履歴なし → 不審</strong>
                  <p>前後60分に、支払い済みの店頭受け取り注文がありません。</p>
                </div>
              ) : (
                <div className="guard-candidate-list">
                  {candidates.map((o) => {
                    const matched = o.id === selected.order_id;
                    const items = (o.order_items || [])
                      .map((i) => `${i.product_name || "商品"}×${i.quantity || 1}`)
                      .join("、");
                    return (
                      <div key={o.id} className={`guard-candidate ${matched ? "is-matched" : ""}`}>
                        <div className="guard-candidate-top">
                          <span className="guard-candidate-time">{fmt(o.paid_at)}</span>
                          <span className={`guard-candidate-badge ${matched ? "is-matched" : ""}`}>
                            {matched ? "照合済み" : "候補"}
                          </span>
                        </div>
                        <div className="guard-candidate-main">
                          <span className="guard-candidate-name">
                            {o.name || o.email || "購入者不明"}
                          </span>
                          <span className="guard-candidate-items">{items || "明細なし"}</span>
                        </div>
                        <div className="guard-candidate-foot">
                          <span>{o.total == null ? "-" : `${Number(o.total).toLocaleString("ja-JP")}円`}</span>
                          <span>{o.pickup_status === "picked_up" ? "受け取り済み" : "受け取り待ち"}</span>
                          <button
                            type="button"
                            className="guard-btn is-mini"
                            onClick={() => navigate(`/admin-order-detail/${o.id}`)}
                          >
                            注文詳細
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selected.status === "suspicious" && candidates.length > 0 && (
                <p className="guard-candidate-note">
                  候補はありますが、20分の照合範囲外か、すでに受け取り済みのため「不審」になっています。
                </p>
              )}
            </section>

            <label className="guard-field">
              <span>対応メモ（任意）</span>
              <textarea
                rows={3}
                value={handleNote}
                onChange={(e) => setHandleNote(e.target.value)}
                placeholder="例：生徒指導の担当に共有済み / 補充時の誤検知"
              />
            </label>

            <div className="guard-modal-actions">
              <button
                type="button"
                className="guard-btn is-ok"
                onClick={() => setEventStatus("ok")}
                disabled={busy}
              >
                問題なし
              </button>
              <button
                type="button"
                className="guard-btn is-primary"
                onClick={() => setEventStatus("resolved")}
                disabled={busy}
              >
                解決済み
              </button>
              <button
                type="button"
                className="guard-btn is-ghost"
                onClick={() => setEventStatus("ignored")}
                disabled={busy}
              >
                対象外
              </button>
              <button
                type="button"
                className="guard-btn is-danger"
                onClick={() => setEventStatus("suspicious")}
                disabled={busy}
              >
                要確認のまま
              </button>
            </div>

            <div className="guard-modal-delete">
              <button
                type="button"
                className="guard-btn is-danger"
                onClick={deleteEvent}
                disabled={busy}
              >
                {deleteStatus ? "削除中…" : "このイベントを削除"}
              </button>
              <span>証拠画像・5秒録画も削除されます（注文の状態は変わりません）</span>
            </div>
          </div>
        </div>
      )}

      {deleteStatus && (
        <div className="guard-loading-overlay" role="status" aria-live="polite">
          <div className="guard-loading-card">
            <span className="guard-spinner" aria-hidden="true" />
            <strong>削除しています…</strong>
            <span>
              {deleteStatus.done}/{deleteStatus.total}件
            </span>
            <p>証拠画像と5秒録画も削除しています。画面を閉じずにお待ちください。</p>
          </div>
        </div>
      )}
    </>
  );
}
