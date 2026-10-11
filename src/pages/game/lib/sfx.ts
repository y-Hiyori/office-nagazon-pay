// src/pages/game/lib/sfx.ts
// 効果音（Web Audio API・音声ファイル不要）
//  - ユーザー操作（STARTなど）で AudioContext を resume する
//  - ミュート設定は localStorage に保存

let ctx: AudioContext | null = null;

const MUTE_KEY = "game_sfx_muted_v1";

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

let muted = readMuted();

export function isMuted() {
  return muted;
}

export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    // ignore
  }
}

/** ユーザー操作内で呼ぶと AudioContext が有効化される */
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

type ToneOpts = {
  freq: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  slideTo?: number;
};

function tone({ freq, dur = 0.12, type = "sine", gain = 0.16, delay = 0, slideTo }: ToneOpts) {
  if (muted) return;
  const c = getCtx();
  if (!c || c.state !== "running") return;

  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo && slideTo !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/* ---------- 効果音 ---------- */
export function seHit() {
  tone({ freq: 520, dur: 0.08, type: "triangle", gain: 0.14, slideTo: 720 });
}

export function seCombo(combo: number) {
  const base = 660 + Math.min(combo, 12) * 40;
  tone({ freq: base, dur: 0.09, type: "square", gain: 0.1 });
}

export function seFever() {
  // 上昇アルペジオ
  [0, 0.09, 0.18, 0.27].forEach((d, i) => {
    tone({ freq: 523 * Math.pow(1.26, i), dur: 0.16, type: "sawtooth", gain: 0.12, delay: d });
  });
}

export function seCorrect() {
  [0, 0.1].forEach((d, i) => tone({ freq: 660 + i * 220, dur: 0.16, type: "triangle", gain: 0.16, delay: d }));
}

export function seWrong() {
  tone({ freq: 300, dur: 0.26, type: "sawtooth", gain: 0.14, slideTo: 120 });
}

export function seCount() {
  tone({ freq: 440, dur: 0.08, type: "square", gain: 0.1 });
}

export function seStart() {
  [0, 0.1, 0.2].forEach((d, i) => tone({ freq: 523 + i * 130, dur: 0.14, type: "triangle", gain: 0.14, delay: d }));
}

export function seGameover() {
  tone({ freq: 400, dur: 0.5, type: "sine", gain: 0.16, slideTo: 120 });
}
