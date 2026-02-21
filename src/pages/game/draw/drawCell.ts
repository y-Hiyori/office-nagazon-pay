// src/pages/game/draw/drawCell.ts

export function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string
) {
  // --- helpers (全部この関数内で完結 / 未使用なし) ---
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  // 0..1 hash（x,y,r,color から毎回同じ形になるように固定）
  const hash01 = (n: number) => {
    const s = Math.sin(n) * 43758.5453123;
    return s - Math.floor(s);
  };

  const colorSeed = (() => {
    // 簡易文字列seed
    let acc = 0;
    for (let i = 0; i < color.length; i++) acc = (acc * 31 + color.charCodeAt(i)) >>> 0;
    return acc;
  })();

  const seedBase =
    Math.floor(x * 0.17) * 73856093 +
    Math.floor(y * 0.17) * 19349663 +
    Math.floor(r * 10) * 83492791 +
    (colorSeed >>> 0);

  const noise01 = (t: number) => hash01(seedBase + t * 999.123);

  // soft “aura” をデカくしすぎない（前の「オーラがでかい」問題を抑える）
  const auraMul = 0.10; // 0.0〜0.2くらいで調整
  const auraR = r * (1.02 + auraMul); // ほぼ膜の外側だけ

  ctx.save();
  ctx.translate(x, y);

  // ===== 1) 背景の薄いオーラ（控えめ） =====
  ctx.save();
  ctx.globalAlpha = 0.25;
  const grad = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, auraR);
  grad.addColorStop(0, "rgba(255,255,255,0.05)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.03)");
  grad.addColorStop(1, "rgba(255,255,255,0.00)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, auraR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ===== 2) 細胞膜（不規則 / ブレブ入り） =====
  // “リアルっぽさ”は「不規則な膜 + ちょいブレブ + ハイライト」で出す
  const points = 28; // 22〜36で調整可
  const blebCount = 3; // 膜の膨らみ
  const blebA = r * 0.16;

  // ブレブ角度固定
  const blebAngles = new Array(blebCount).fill(0).map((_, i) => {
    const base = noise01(10 + i) * Math.PI * 2;
    return base;
  });

  // 膜の輪郭
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const a = t * Math.PI * 2;

    // 形の不規則さ（大きめ）
    const n1 = Math.sin(a * 3 + noise01(1) * 10) * 0.10;
    const n2 = Math.sin(a * 7 + noise01(2) * 10) * 0.07;
    const n3 = Math.sin(a * 11 + noise01(3) * 10) * 0.04;

    let rr = r * (1 + n1 + n2 + n3);

    // ブレブ（局所的に膨らむ）
    for (let b = 0; b < blebCount; b++) {
      const da = Math.atan2(Math.sin(a - blebAngles[b]), Math.cos(a - blebAngles[b])); // -pi..pi
      const k = Math.exp(-(da * da) / (2 * (0.22 * 0.22))); // ガウスっぽい山
      rr += blebA * k;
    }

    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  // 中身のベース色（指定colorをベースに濃淡つける）
  ctx.globalAlpha = 0.96;
  ctx.fillStyle = color;
  ctx.fill();

  // 膜の縁（ハイライト & 影）
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.stroke();

  ctx.globalAlpha = 0.65;
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.stroke();

  // ===== 3) 内部の“質感”（粒状、斑点） =====
  // 透明度の違う粒を散らして「細胞質っぽさ」
  const specks = clamp(Math.floor(r * 0.9), 18, 46);
  for (let i = 0; i < specks; i++) {
    const a = noise01(100 + i) * Math.PI * 2;
    const d = Math.sqrt(noise01(200 + i)) * (r * 0.78);
    const sx = Math.cos(a) * d;
    const sy = Math.sin(a) * d;

    const pr = r * (0.018 + noise01(300 + i) * 0.028);
    const alpha = 0.08 + noise01(400 + i) * 0.10;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.arc(sx, sy, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // ===== 4) 核（いびつ + 濃淡） =====
  // がん細胞っぽさ：核が目立つ、形がやや不規則、核小体っぽい点
  const nucR = r * (0.42 + noise01(55) * 0.08);
  const nucX = (-r * 0.16) + (noise01(56) - 0.5) * r * 0.18;
  const nucY = (-r * 0.10) + (noise01(57) - 0.5) * r * 0.18;

  // 核の形（軽くいびつ）
  ctx.save();
  ctx.translate(nucX, nucY);
  ctx.beginPath();
  const nPts = 18;
  for (let i = 0; i <= nPts; i++) {
    const t = i / nPts;
    const a = t * Math.PI * 2;
    const wob =
      Math.sin(a * 2 + noise01(60) * 10) * 0.08 +
      Math.sin(a * 5 + noise01(61) * 10) * 0.05;
    const rr = nucR * (1 + wob);
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  // 核グラデ
  const ng = ctx.createRadialGradient(-nucR * 0.2, -nucR * 0.2, nucR * 0.2, 0, 0, nucR * 1.1);
  ng.addColorStop(0, "rgba(20,24,40,0.55)");
  ng.addColorStop(0.65, "rgba(10,12,22,0.58)");
  ng.addColorStop(1, "rgba(0,0,0,0.35)");

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = ng;
  ctx.fill();

  // 核の縁
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1, r * 0.025);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.stroke();

  // 核小体っぽい点
  const nucleoli = 2 + Math.floor(noise01(80) * 2);
  for (let i = 0; i < nucleoli; i++) {
    const aa = noise01(90 + i) * Math.PI * 2;
    const dd = Math.sqrt(noise01(95 + i)) * nucR * 0.45;
    const nx = Math.cos(aa) * dd;
    const ny = Math.sin(aa) * dd;
    const rr = nucR * (0.10 + noise01(98 + i) * 0.06);

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(nx, ny, rr, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.38;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.arc(nx + rr * 0.15, ny + rr * 0.15, rr * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore(); // nucleus translate

  // ===== 5) 外膜のハイライト（光沢） =====
  // 右上に薄いハイライトを乗せると“生っぽさ”が出る
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.ellipse(r * 0.18, -r * 0.22, r * 0.42, r * 0.26, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fill();
  ctx.restore();

  // ===== 6) 膜の影（立体感） =====
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.ellipse(-r * 0.10, r * 0.18, r * 0.55, r * 0.42, 0.25, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fill();
  ctx.restore();

  ctx.restore(); // translate
}