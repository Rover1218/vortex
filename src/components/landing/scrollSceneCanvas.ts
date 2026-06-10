/**
 * Canvas 2D painter for the landing ScrollScene.
 *
 * Everything is a pure function of `p` (scroll progress, 0..1) so scrubbing
 * backwards and forwards is perfectly deterministic — the scene behaves like
 * footage being shuttled on a timeline, not a particle sim.
 *
 * Color values below are the Vortex design tokens from tailwind.config.ts —
 * no new colors are introduced here.
 */

const TOKEN = {
  base: "#09090b",
  surface: "#131316",
  elevated: "#1c1c21",
  accent: "#f5a623",
  accentStrong: "#ffc04d",
  teal: "#2dd4a7",
  text1: "#f7f6f3",
} as const;

const TAU = Math.PI * 2;
const RIDGE_LAYERS = 4;
const STAR_COUNT = 80;
const MOTE_COUNT = 24;
const GRAIN_SIZE = 160;

/** Final "hero frame" rendered when prefers-reduced-motion is on. */
export const STATIC_PROGRESS = 0.84;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/** Gaussian-ish bump centered at `center`, used for one-shot cues. */
function bell(p: number, center: number, width: number): number {
  const d = (p - center) / width;
  return Math.exp(-d * d);
}

/** Deterministic pseudo-random in [0,1) — stable across frames. */
function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp01(alpha)})`;
}

function mixHex(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const c = clamp01(t);
  return `rgb(${Math.round(lerp(a[0], b[0], c))},${Math.round(lerp(a[1], b[1], c))},${Math.round(lerp(a[2], b[2], c))})`;
}

/** Pre-rendered film-grain tile, created once per mount and tiled per frame. */
export function createGrainTile(size: number = GRAIN_SIZE): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext("2d");
  if (!ctx) return tile;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(hash(i) * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 22;
  }
  ctx.putImageData(img, 0, 0);
  return tile;
}

type Ctx = CanvasRenderingContext2D;

function drawSky(ctx: Ctx, w: number, h: number, warmth: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, TOKEN.base);
  sky.addColorStop(0.5, mixHex(TOKEN.base, TOKEN.surface, 0.85));
  sky.addColorStop(0.78, mixHex(TOKEN.surface, TOKEN.accent, 0.06 + warmth * 0.14));
  sky.addColorStop(1, mixHex(TOKEN.elevated, TOKEN.accent, 0.1 + warmth * 0.2));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
}

function drawStars(ctx: Ctx, w: number, h: number, p: number, warmth: number): void {
  for (let i = 0; i < STAR_COUNT; i++) {
    const depth = 0.3 + hash(i * 3 + 1) * 0.7;
    const x = ((hash(i * 3) + p * 0.06 * depth) % 1) * w;
    const y = Math.pow(hash(i * 3 + 2), 1.5) * h * 0.5;
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(p * 9 + i * 1.7));
    ctx.fillStyle = rgba(TOKEN.text1, (0.08 + 0.3 * twinkle * depth) * (1 - warmth * 0.55));
    const s = depth > 0.8 ? 2 : 1;
    ctx.fillRect(x, y, s, s);
  }
}

function drawSun(ctx: Ctx, w: number, h: number, p: number, warmth: number): void {
  const x = w * lerp(0.24, 0.76, smooth(p));
  const y = h * lerp(0.72, 0.26, smooth(p));
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  const halo = ctx.createRadialGradient(x, y, 0, x, y, h * (0.55 + warmth * 0.25));
  halo.addColorStop(0, rgba(TOKEN.accent, 0.5 + warmth * 0.25));
  halo.addColorStop(0.35, rgba(TOKEN.accent, 0.16 + warmth * 0.1));
  halo.addColorStop(1, rgba(TOKEN.accent, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  const core = ctx.createRadialGradient(x, y, 0, x, y, h * 0.09);
  core.addColorStop(0, rgba(TOKEN.accentStrong, 0.95));
  core.addColorStop(0.6, rgba(TOKEN.accentStrong, 0.5));
  core.addColorStop(1, rgba(TOKEN.accentStrong, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, h * 0.09, 0, TAU);
  ctx.fill();

  // Slowly rotating god rays — the clearest "this is playing" cue.
  const rayAlpha = 0.04 + warmth * 0.09;
  ctx.translate(x, y);
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * TAU + p * 1.4;
    const spread = 0.08 + hash(i + 41) * 0.07;
    const len = h * 1.3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang - spread) * len, Math.sin(ang - spread) * len);
    ctx.lineTo(Math.cos(ang + spread) * len, Math.sin(ang + spread) * len);
    ctx.closePath();
    ctx.fillStyle = rgba(TOKEN.accent, rayAlpha * (0.35 + hash(i + 7) * 0.65));
    ctx.fill();
  }
  ctx.restore();
}

function drawRidges(ctx: Ctx, w: number, h: number, p: number, warmth: number): void {
  for (let k = 0; k < RIDGE_LAYERS; k++) {
    const t = k / (RIDGE_LAYERS - 1); // 0 = far, 1 = near
    const baseY = h * lerp(0.5, 0.88, t);
    const amp = h * lerp(0.06, 0.11, t);
    const drift = p * w * lerp(0.05, 0.2, t); // near layers track faster — parallax
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w + 8; x += 8) {
      const u = ((x + drift) / w) * (4.5 - t * 1.5);
      const y =
        baseY +
        Math.sin(u * 2.1 + k * 17) * amp * 0.55 +
        Math.sin(u * 5.3 + k * 31) * amp * 0.3 +
        Math.sin(u * 11.7 + k * 7) * amp * 0.15;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, baseY - amp, 0, h);
    grad.addColorStop(0, mixHex(TOKEN.elevated, TOKEN.accent, (1 - t) * (0.08 + warmth * 0.3)));
    grad.addColorStop(1, mixHex(TOKEN.base, TOKEN.surface, 0.5 * (1 - t)));
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

function drawMotes(ctx: Ctx, w: number, h: number, p: number, warmth: number): void {
  for (let i = 0; i < MOTE_COUNT; i++) {
    const depth = 0.35 + hash(i * 7 + 3) * 0.65;
    const x = ((hash(i * 7) + p * 0.22 * depth) % 1) * w;
    const y = (0.3 + hash(i * 7 + 1) * 0.55) * h + Math.sin(p * 7 + i * 2.3) * h * 0.015;
    ctx.fillStyle = rgba(TOKEN.accentStrong, 0.03 + 0.1 * depth * warmth);
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + depth * 2.2, 0, TAU);
    ctx.fill();
  }
}

/** Teal transcode "scan" sweep — peaks in the middle shot (buffering). */
function drawScan(ctx: Ctx, w: number, h: number, p: number): void {
  const phase = bell(p, 0.5, 0.16);
  if (phase < 0.02) return;
  const x = w * lerp(-0.15, 1.15, clamp01((p - 0.32) / 0.36));
  const band = ctx.createLinearGradient(x - w * 0.14, 0, x + w * 0.14, 0);
  band.addColorStop(0, rgba(TOKEN.teal, 0));
  band.addColorStop(0.5, rgba(TOKEN.teal, 0.18 * phase));
  band.addColorStop(1, rgba(TOKEN.teal, 0));
  ctx.fillStyle = band;
  ctx.fillRect(x - w * 0.14, 0, w * 0.28, h);
  ctx.fillStyle = rgba(TOKEN.teal, 0.5 * phase);
  ctx.fillRect(x, 0, 1.5, h);
}

/** Brief exposure flash at the two shot boundaries — reads as a hard cut. */
function drawFlash(ctx: Ctx, w: number, h: number, p: number): void {
  const flash = bell(p, 1 / 3, 0.015) + bell(p, 2 / 3, 0.015);
  if (flash < 0.02) return;
  ctx.fillStyle = rgba(TOKEN.text1, Math.min(flash, 1) * 0.08);
  ctx.fillRect(0, 0, w, h);
}

function drawGrain(ctx: Ctx, w: number, h: number, p: number, grain: HTMLCanvasElement): void {
  const pattern = ctx.createPattern(grain, "repeat");
  if (!pattern) return;
  const offX = Math.floor(p * 1409) % grain.width;
  const offY = Math.floor(p * 947) % grain.height;
  ctx.save();
  ctx.translate(-offX, -offY);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w + grain.width, h + grain.height);
  ctx.restore();
}

function drawVignette(ctx: Ctx, w: number, h: number): void {
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.72);
  v.addColorStop(0, rgba(TOKEN.base, 0));
  v.addColorStop(1, rgba(TOKEN.base, 0.62));
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** Paint one full frame of the scene at scroll progress `p`. */
export function drawScene(ctx: Ctx, w: number, h: number, p: number, grain: HTMLCanvasElement): void {
  const pr = clamp01(p);
  const warmth = smooth((pr - 0.06) / 0.7); // global exposure ramps across the scene
  drawSky(ctx, w, h, warmth);
  drawStars(ctx, w, h, pr, warmth);
  drawSun(ctx, w, h, pr, warmth);
  drawRidges(ctx, w, h, pr, warmth);
  drawMotes(ctx, w, h, pr, warmth);
  drawScan(ctx, w, h, pr);
  drawFlash(ctx, w, h, pr);
  drawGrain(ctx, w, h, pr, grain);
  drawVignette(ctx, w, h);
}
