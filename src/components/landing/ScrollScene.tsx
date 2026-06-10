"use client";

import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useCallback, useEffect, useRef } from "react";
import { createGrainTile, drawScene, STATIC_PROGRESS } from "./scrollSceneCanvas";

const RUNTIME_SECONDS = 42 * 60 + 17;
const MAX_SPEED_MBPS = 158;

const BEATS = [
  { title: "Pick a torrent", desc: "Search five sources at once and hit play on any result." },
  { title: "Buffer starts instantly", desc: "First pieces land and the x265 transcode spins up in real time." },
  { title: "Watch while it downloads", desc: "Seek anywhere — full 4K plays while the rest is still arriving." },
] as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const formatTime = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

type SceneCanvasProps = {
  progress: MotionValue<number>;
  isStatic: boolean;
};

/** Canvas layer — re-painted from the scroll MotionValue, like scrubbing footage. */
function SceneCanvas({ progress, isStatic }: SceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grainRef = useRef<HTMLCanvasElement | null>(null);

  const draw = useCallback((p: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (!grainRef.current) grainRef.current = createGrainTile();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(width * dpr);
    const ph = Math.round(height * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, width, height, p, grainRef.current);
  }, []);

  useMotionValueEvent(progress, "change", (v) => {
    if (!isStatic) draw(v);
  });

  useEffect(() => {
    draw(isStatic ? STATIC_PROGRESS : progress.get());
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw(isStatic ? STATIC_PROGRESS : progress.get()));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw, isStatic, progress]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}

type BeatCaptionProps = {
  progress: MotionValue<number>;
  index: number;
  total: number;
  title: string;
  desc: string;
  isStatic: boolean;
};

/** Scene caption — cross-fades in/out across its third of the scroll range. */
function BeatCaption({ progress, index, total, title, desc, isStatic }: BeatCaptionProps) {
  const start = index / total;
  const end = (index + 1) / total;
  const opacity = useTransform(
    progress,
    [Math.max(start, 0.0001), start + 0.05, end - 0.05, Math.min(end, 0.9999)],
    [index === 0 ? 1 : 0, 1, 1, index === total - 1 ? 1 : 0],
  );
  const y = useTransform(progress, [start, start + 0.05], [14, 0]);

  if (isStatic && index !== total - 1) return null;

  const body = (
    <>
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-accent">
        Shot 0{index + 1} / 0{total}
      </span>
      <h3 className="mt-1 text-lg font-black text-text-1 md:text-2xl">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-text-2 md:text-sm">{desc}</p>
    </>
  );

  if (isStatic) return <div className="absolute bottom-0 left-0">{body}</div>;

  return (
    <motion.div className="absolute bottom-0 left-0" style={{ opacity, y }}>
      {body}
    </motion.div>
  );
}

type StepSegmentProps = {
  progress: MotionValue<number>;
  index: number;
  total: number;
  title: string;
  isStatic: boolean;
};

/** Story-style timeline segment that fills across its slice of the scroll. */
function StepSegment({ progress, index, total, title, isStatic }: StepSegmentProps) {
  const start = index / total;
  const end = (index + 1) / total;
  const fill = useTransform(progress, [start, end], ["0%", "100%"]);
  const labelOpacity = useTransform(progress, [start - 0.03, start, end, end + 0.03], [0.4, 1, 1, 0.4]);

  return (
    <div>
      <div className="h-[3px] overflow-hidden rounded-full bg-white/[0.08]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-strong"
          style={{ width: isStatic ? "100%" : fill }}
        />
      </div>
      <motion.p
        className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-text-3 md:text-[11px]"
        style={isStatic ? undefined : { opacity: labelOpacity }}
      >
        <span className="mr-1.5 text-accent">0{index + 1}</span>
        {title}
      </motion.p>
    </div>
  );
}

/**
 * Scroll-scrubbed cinematic scene. The section pins for 200vh while a Canvas 2D
 * "shot" (parallax ridges, drifting light, film grain, scan sweep) scrubs with
 * scroll, framed by minimal player chrome whose buffer/playhead/speed advance
 * in lockstep. With prefers-reduced-motion it renders one static final frame.
 */
export function ScrollScene() {
  const isStatic = Boolean(useReducedMotion());
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 170, damping: 27, mass: 0.35 });

  const playedWidth = useTransform(progress, [0.08, 0.92], ["3%", "68%"]);
  const bufferWidth = useTransform(progress, [0.05, 0.74], ["12%", "97%"]);
  const playOpacity = useTransform(progress, [0.05, 0.16], [1, 0]);
  const playScale = useTransform(progress, [0.05, 0.16], [1, 1.5]);
  const chipOpacity = useTransform(progress, [0.3, 0.38], [0, 1]);
  const chipY = useTransform(progress, [0.3, 0.38], [8, 0]);
  const timeText = useTransform(progress, (v) => formatTime(clamp01((v - 0.08) / 0.84) * RUNTIME_SECONDS));
  const speedText = useTransform(progress, (v) => `${Math.round(MAX_SPEED_MBPS * clamp01((v - 0.3) / 0.5))} Mbps ↓`);
  const pctText = useTransform(progress, (v) => `${Math.round(clamp01((v - 0.05) / 0.78) * 100)}% downloaded`);

  return (
    <section className="relative z-10" aria-label="Stream while it downloads — scroll-scrubbed demo">
      <div ref={trackRef} className={isStatic ? "relative" : "relative h-[200vh]"}>
        <div className={isStatic ? "py-6" : "sticky top-0 flex h-screen flex-col justify-center"}>
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="mb-7 text-center md:mb-9">
              <div className="cine-chip mb-5 border-accent/15 bg-accent/[0.08] px-4 py-1.5 font-bold uppercase tracking-[0.12em] !text-accent">
                The magic
              </div>
              <h2 className="text-3xl font-black leading-[1.02] tracking-tight md:text-5xl">
                Press play <span className="text-gradient-amber">before</span> it finishes.
              </h2>
              {!isStatic && (
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-text-3">
                  Scroll to scrub the stream
                </p>
              )}
            </div>

            {/* Player frame */}
            <div className="relative">
              <div className="pointer-events-none absolute -inset-10 rounded-[48px] bg-accent/10 blur-3xl" />
              <div className="relative aspect-video overflow-hidden rounded-3xl border border-white/[0.08] bg-surface shadow-cinema-lg md:aspect-[21/9]">
                <SceneCanvas progress={progress} isStatic={isStatic} />

                {/* Top chrome */}
                <motion.div
                  className="cine-chip absolute left-4 top-4 border-teal/20 bg-base/60 text-[10px] font-bold uppercase tracking-wider !text-teal backdrop-blur-md"
                  style={isStatic ? undefined : { opacity: chipOpacity, y: chipY }}
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
                  Transcoding x265 · 4K
                </motion.div>
                <div className="cine-chip absolute right-4 top-4 bg-base/60 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md">
                  2160p · HDR10
                </div>

                {/* Play button — dissolves as playback "starts" */}
                <motion.div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  style={isStatic ? { opacity: 0 } : { opacity: playOpacity, scale: playScale }}
                >
                  <span className="relative flex items-center justify-center">
                    <span className="absolute h-20 w-20 animate-glow-breathe rounded-full bg-accent/20" />
                    <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-accent text-black shadow-accent-glow">
                      <svg className="ml-1 h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </span>
                </motion.div>

                {/* Legibility scrim */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-base/90 via-base/35 to-transparent" />

                {/* Shot captions */}
                <div className="absolute bottom-16 left-5 right-5 h-20 md:bottom-[4.75rem] md:left-7 md:h-24">
                  {BEATS.map((b, i) => (
                    <BeatCaption
                      key={b.title}
                      progress={progress}
                      index={i}
                      total={BEATS.length}
                      title={b.title}
                      desc={b.desc}
                      isStatic={isStatic}
                    />
                  ))}
                </div>

                {/* Player controls — buffer + played + playhead scrub with scroll */}
                <div className="absolute inset-x-4 bottom-3.5 md:inset-x-6 md:bottom-5">
                  <div className="relative h-1.5 rounded-full bg-white/15">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full bg-white/25"
                      style={{ width: isStatic ? "97%" : bufferWidth }}
                    />
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full bg-accent"
                      style={{ width: isStatic ? "68%" : playedWidth }}
                    />
                    <motion.span
                      className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-strong shadow-accent-glow"
                      style={{ left: isStatic ? "68%" : playedWidth }}
                    />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between font-mono text-[11px] text-text-2">
                    <div className="flex items-center gap-2.5">
                      <svg className="h-3 w-3 text-text-1" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      <span>
                        <motion.span>{isStatic ? formatTime(RUNTIME_SECONDS * 0.82) : timeText}</motion.span>
                        <span className="text-text-3"> / {formatTime(RUNTIME_SECONDS)}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <motion.span className="hidden text-text-3 sm:inline">
                        {isStatic ? "100% downloaded" : pctText}
                      </motion.span>
                      <motion.span className="font-semibold text-teal">
                        {isStatic ? `${MAX_SPEED_MBPS} Mbps ↓` : speedText}
                      </motion.span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Narrative timeline */}
            <div className="mx-auto mt-6 grid max-w-3xl grid-cols-3 gap-3 md:mt-8 md:gap-5">
              {BEATS.map((b, i) => (
                <StepSegment
                  key={b.title}
                  progress={progress}
                  index={i}
                  total={BEATS.length}
                  title={b.title}
                  isStatic={isStatic}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
