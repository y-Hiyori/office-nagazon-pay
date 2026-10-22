// api/_guard-ai.js
// 任意のAI判定（Google Gemini の無料枠）。
// GEMINI_API_KEY が Vercel に設定され、管理画面で AI判定 をONにした場合だけ動く。
// キーが無い/失敗した場合は null を返し、従来のルール判定にフォールバックする。
const MODELS = [
  process.env.GEMINI_MODEL || "",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
].filter((m, i, a) => m && a.indexOf(m) === i);

const PROMPT = `あなたは学校の売店の棚を監視する判定AIです。
時系列の静止画（before → during → after）を見て、棚から商品が取られたかを判定してください。

- item_removed: 商品が棚から無くなった/取られたなら true。
  人が通り過ぎただけ、手を伸ばしただけ、商品を戻した、照明や影だけなら false。
- person_present: 人や手が写っているか。
- scene_change: 照明・影・カメラの動きによる変化か。
- confidence: 0〜1。判断に自信がない場合は低くする。
- reason: 40文字以内の日本語。

支払いの有無は判断しないでください。JSONだけを返してください:
{"item_removed":true,"person_present":true,"scene_change":false,"confidence":0.8,"reason":"商品が1つ減った"}`;

function stripB64(value) {
  return String(value || "")
    .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "")
    .trim();
}

function pickFrames(frames, imageB64) {
  const list = Array.isArray(frames) ? frames : [];
  const picks = [];
  const add = (v) => {
    const s = stripB64(v);
    if (s && !picks.includes(s)) picks.push(s);
  };
  if (list.length) {
    add(list[0]);
    add(list[Math.floor((list.length - 1) / 2)]);
    add(list[list.length - 1]);
  }
  if (picks.length < 2) add(imageB64);
  return picks.slice(0, 4);
}

function parseResult(text) {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const obj = JSON.parse(cleaned.slice(start, end + 1));
  const bool = (v) => v === true || v === "true" || v === 1;
  return {
    item_removed: bool(obj.item_removed),
    person_present: bool(obj.person_present),
    scene_change: bool(obj.scene_change),
    confidence: Math.max(0, Math.min(1, Number(obj.confidence) || 0)),
    reason: String(obj.reason || "").slice(0, 120),
  };
}

async function callModel(model, key, parts) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 300,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(7000),
    }
  );

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, status: res.status, detail: text.slice(0, 200) };
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, detail: "BAD_JSON" };
  }

  if (data?.promptFeedback?.blockReason) {
    return { ok: false, status: res.status, detail: `BLOCKED:${data.promptFeedback.blockReason}` };
  }

  const out = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p?.text || "")
    .join("");
  let parsed;
  try {
    parsed = parseResult(out);
  } catch {
    parsed = null;
  }
  if (!parsed) return { ok: false, status: res.status, detail: "PARSE_FAILED" };
  return { ok: true, ...parsed, model };
}

export async function reviewGuardFrames(frames, imageB64) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, skipped: true, reason: "NO_GEMINI_KEY" };

  const picks = pickFrames(frames, imageB64);
  if (picks.length < 2) {
    return { ok: false, skipped: true, reason: "NOT_ENOUGH_FRAMES" };
  }

  const parts = [{ text: PROMPT }];
  picks.forEach((data, i) => {
    parts.push({ text: `frame ${i + 1}/${picks.length}` });
    parts.push({ inline_data: { mime_type: "image/jpeg", data } });
  });

  let last = null;
  for (const model of MODELS) {
    try {
      const result = await callModel(model, key, parts);
      if (result.ok) return result;
      last = result;
      // モデル名が無い/権限が無い場合は次のモデルを試す。429等も次の候補へ。
    } catch (e) {
      last = { ok: false, error: String(e?.message || e) };
    }
  }

  return {
    ok: false,
    error: "GEMINI_FAILED",
    status: last?.status || null,
    detail: last?.detail || last?.error || null,
  };
}
