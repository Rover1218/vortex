"use client";

import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

type Scene = {
  tag: string;
  title: string;
  meta: string;
  accent: string;
  grad: string;
  /** Real poster URL (Cinemeta). When absent, the procedural art renders. */
  image?: string;
  /** Real rating (e.g. IMDb "8.4"). Falls back to a decorative value. */
  rating?: string;
};

/** Procedural "shelf" of cinematic posters — no image assets, pure gradients. */
const SCENES: readonly Scene[] = [
  { tag: "Sci-Fi", title: "Orbital Decay", meta: "2h 14m · 4K · x265", accent: "#5eead4", grad: "linear-gradient(160deg,#0d3134,#0a3a44 38%,#070f15)" },
  { tag: "Neo-Noir", title: "Neon Rainfall", meta: "1h 58m · 4K · HDR10", accent: "#f5a623", grad: "linear-gradient(160deg,#341907,#3d250b 40%,#140b04)" },
  { tag: "Thriller", title: "The Silent Hour", meta: "2h 06m · 1080p", accent: "#ff5470", grad: "linear-gradient(160deg,#2c0c16,#3c1020 42%,#140509)" },
  { tag: "Drama", title: "After the Tide", meta: "1h 47m · 4K", accent: "#a78bfa", grad: "linear-gradient(160deg,#1f1636,#271c44 42%,#0d0918)" },
  { tag: "Action", title: "Redline", meta: "2h 21m · 4K · HDR", accent: "#fbbf24", grad: "linear-gradient(160deg,#2f1d07,#3d2909 42%,#140d03)" },
  { tag: "Anime", title: "Hoshikuzu", meta: "24 eps · 1080p", accent: "#38bdf8", grad: "linear-gradient(160deg,#0d2236,#102944 42%,#060e19)" },
  { tag: "Docs", title: "Deep Blue Engine", meta: "58m · 4K", accent: "#2dd4a7", grad: "linear-gradient(160deg,#092823,#0b302a 42%,#04120f)" },
  { tag: "Horror", title: "Hollowmere", meta: "1h 39m · 1080p", accent: "#f87171", grad: "linear-gradient(160deg,#280c0c,#350f0f 42%,#120505)" },
] as const;

/** Per-poster orb placement — deterministic (index-based) to stay SSR-stable. */
const ORB: readonly { x: string; y: string }[] = [
  { x: "73%", y: "27%" },
  { x: "27%", y: "32%" },
  { x: "61%", y: "21%" },
  { x: "37%", y: "29%" },
  { x: "78%", y: "31%" },
  { x: "30%", y: "23%" },
  { x: "64%", y: "30%" },
  { x: "43%", y: "25%" },
];

/** Procedural cinematic still — sun/orb, light rays, layered ridges, grain. */
function PosterArt({ scene, index }: { scene: Scene; index: number }) {
  const orb = ORB[index % ORB.length];
  return (
    <div className="absolute inset-0" aria-hidden="true">
      {/* Sky */}
      <div className="absolute inset-0" style={{ backgroundImage: scene.grad }} />
      {/* Light rays radiating from the orb */}
      <div
        className="absolute inset-0 opacity-60 mix-blend-screen"
        style={{
          backgroundImage: `conic-gradient(from 195deg at ${orb.x} ${orb.y}, transparent 0deg, ${scene.accent}24 13deg, transparent 28deg, ${scene.accent}1c 46deg, transparent 64deg, ${scene.accent}24 104deg, transparent 130deg)`,
        }}
      />
      {/* Orb glow + core (the "sun") */}
      <div className="absolute h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl" style={{ left: orb.x, top: orb.y, backgroundImage: `radial-gradient(circle, ${scene.accent}, transparent 68%)`, opacity: 0.6 }} />
      <div className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: orb.x, top: orb.y, backgroundImage: `radial-gradient(circle, #fff, ${scene.accent} 55%, transparent 72%)`, opacity: 0.9 }} />
      {/* Layered ridges (horizon silhouette) */}
      <div className="absolute -inset-x-12 bottom-[24%] h-1/3 rounded-[50%] bg-black/45 blur-md" />
      <div className="absolute -inset-x-16 -bottom-10 h-2/5 rounded-[45%] bg-black/85" />
      {/* Grain + caption scrim */}
      <div className="scene-grain absolute inset-0 opacity-[0.12] mix-blend-overlay" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25" />
    </div>
  );
}

type SceneCardProps = {
  scene: Scene;
  index: number;
  rowX: MotionValue<number>;
  stageWidthRef: React.MutableRefObject<number>;
};

/**
 * One poster. Reads the shared row translate (`rowX`) and its own cached center to
 * derive a coverflow "focus": cards near the stage centre scale up, lift, lose
 * their dimming and gain a glow ring + play button; edges recede. Cards stay
 * opaque (dimmed by an overlay, not transparency) so the parallax word never
 * bleeds through. Centres are cached once — no per-frame layout reads.
 */
function SceneCard({ scene, index, rowX, stageWidthRef }: SceneCardProps) {
  const ref = useRef<HTMLElement>(null);
  const centerRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      centerRef.current = el.offsetLeft + el.offsetWidth / 2;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const proximity = useTransform(rowX, (x) => {
    const stageW = stageWidthRef.current || 1;
    const dist = Math.abs(centerRef.current + x - stageW / 2);
    return clamp01(1 - dist / (stageW * 0.5));
  });

  const scale = useTransform(proximity, [0, 1], [0.9, 1.05]);
  const y = useTransform(proximity, [0, 1], [22, 0]);
  const dim = useTransform(proximity, [0, 1], [0.58, 0]);
  const ringOpacity = useTransform(proximity, [0.5, 1], [0, 1]);
  const playOpacity = useTransform(proximity, [0.72, 1], [0, 1]);

  return (
    <motion.article
      ref={ref}
      style={{ scale, y }}
      className="group relative aspect-[2/3] h-[clamp(240px,52vh,440px)] shrink-0 overflow-hidden rounded-[20px] border border-white/[0.1] shadow-cinema-lg"
    >
      <div className="absolute inset-0 transition-transform duration-[800ms] ease-out group-hover:scale-105">
        {scene.image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={scene.image} alt="" loading="lazy" className="h-full w-full object-cover" />
            <div className="scene-grain absolute inset-0 opacity-[0.1] mix-blend-overlay" aria-hidden="true" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/15" />
          </>
        ) : (
          <PosterArt scene={scene} index={index} />
        )}
      </div>

      {/* Top row */}
      <div className="absolute inset-x-3.5 top-3.5 z-10 flex items-center justify-between">
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] backdrop-blur-md"
          style={{ color: scene.accent, backgroundColor: `${scene.accent}1f`, border: `1px solid ${scene.accent}3a` }}
        >
          {scene.tag}
        </span>
        <span className="font-mono text-[10px] font-semibold text-white/55">4K · HDR</span>
      </div>

      {/* Centre play — only the focused card */}
      <motion.div style={{ opacity: playOpacity }} className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-black/40 backdrop-blur-md">
          <svg className="ml-0.5 h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </span>
      </motion.div>

      {/* Caption */}
      <div className="absolute inset-x-4 bottom-4 z-10">
        <div className="mb-1.5 flex items-center gap-0.5 text-[11px] leading-none" style={{ color: scene.accent }}>
          <span aria-hidden="true">★★★★★</span>
          <span className="ml-1.5 font-mono text-white/45">{scene.rating ?? `4.${8 - (index % 3)}`}</span>
        </div>
        <h3 className="text-lg font-black leading-tight text-white drop-shadow md:text-xl">{scene.title}</h3>
        <p className="mt-0.5 font-mono text-[11px] text-white/60">{scene.meta}</p>
      </div>

      {/* Opaque edge dimming — sits above content so unfocused cards recede */}
      <motion.div style={{ opacity: dim }} className="pointer-events-none absolute inset-0 z-20 bg-black" aria-hidden="true" />

      {/* Focus glow ring — above everything */}
      <motion.div
        style={{ opacity: ringOpacity, boxShadow: `inset 0 0 0 1.5px ${scene.accent}66, 0 18px 50px -12px ${scene.accent}40` }}
        className="pointer-events-none absolute inset-0 z-30 rounded-[20px]"
        aria-hidden="true"
      />
    </motion.article>
  );
}

/**
 * Vertical scroll → horizontal filmstrip. The section pins for 320vh while a row
 * of procedurally-styled posters scrubs sideways with coverflow focus, a slower
 * parallax ghost word drifts behind, and a scrub line tracks progress. All motion
 * is transform/opacity only, so it stays on the compositor.
 */
export function SceneShelf() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const stageWidthRef = useRef(0);
  const [maxX, setMaxX] = useState(0);
  const [cards, setCards] = useState<Scene[]>([...SCENES]);

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 150, damping: 26, mass: 0.35 });

  // Pull real posters from Stremio's Cinemeta catalogue; keep the procedural
  // SCENES as the fallback while it loads or if the request is blocked (CORS/offline).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("https://v3-cinemeta.strem.io/catalog/movie/top.json");
        if (!res.ok) return;
        const data = await res.json();
        const metas: Array<Record<string, unknown>> = Array.isArray(data?.metas) ? data.metas : [];
        const mapped: Scene[] = metas
          .filter((m) => typeof m.poster === "string" && typeof m.name === "string")
          .slice(0, 10)
          .map((m, i) => {
            const base = SCENES[i % SCENES.length];
            const year = typeof m.releaseInfo === "string" ? m.releaseInfo.slice(0, 4) : "";
            const genres = Array.isArray(m.genres) ? (m.genres as string[]) : [];
            const meta = [year, m.runtime, "4K"].filter(Boolean).join(" · ");
            return {
              tag: genres[0] || "Featured",
              title: m.name as string,
              meta: meta || "Movie",
              accent: base.accent,
              grad: base.grad,
              image: (m.poster as string).replace("/small/", "/medium/"),
              rating: m.imdbRating ? String(m.imdbRating) : undefined,
            };
          });
        if (!cancelled && mapped.length >= 4) setCards(mapped);
      } catch {
        /* keep procedural fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const row = rowRef.current;
    if (!stage || !row) return;
    const measure = () => {
      stageWidthRef.current = stage.clientWidth;
      setMaxX(Math.max(0, row.scrollWidth - stage.clientWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  const rowX = useTransform(progress, [0.06, 0.94], [0, -maxX]);
  const ghostX = useTransform(progress, [0, 1], ["6%", "-24%"]);
  const scrubWidth = useTransform(progress, [0.06, 0.94], ["0%", "100%"]);

  const edgeMask = "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)";

  return (
    <section className="relative z-10" aria-label="Your library — scroll-scrubbed filmstrip">
      <div ref={trackRef} className="relative h-[320vh]">
        <div className="sticky top-0 flex h-svh flex-col">
          {/* Heading */}
          <div className="shrink-0 px-6 pt-[9vh] text-center md:pt-[8vh]">
            <div className="cine-chip mb-5 border-teal/15 bg-teal/[0.08] px-4 py-1.5 font-bold uppercase tracking-[0.12em] !text-teal">
              The library
            </div>
            <h2 className="text-3xl font-black leading-[1.02] tracking-tight md:text-5xl">
              Your whole shelf, <span className="text-gradient-amber">in motion.</span>
            </h2>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-text-3">
              Keep scrolling — the lineup comes to you
            </p>
          </div>

          {/* Filmstrip stage */}
          <div
            ref={stageRef}
            className="relative flex-1 overflow-hidden"
            style={{ maskImage: edgeMask, WebkitMaskImage: edgeMask }}
          >
            {/* Parallax ghost typography */}
            <motion.div
              style={{ x: ghostX }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              aria-hidden="true"
            >
              <span className="select-none whitespace-nowrap text-[26vw] font-black leading-none tracking-tighter text-white/[0.02]">
                CINEMA·CINEMA·
              </span>
            </motion.div>

            {/* Poster row */}
            <motion.div
              ref={rowRef}
              style={{ x: rowX, y: "-50%" }}
              className="absolute left-0 top-1/2 flex flex-nowrap items-center gap-5 px-[8vw] will-change-transform md:gap-7"
            >
              {cards.map((scene, i) => (
                <SceneCard key={`${scene.title}-${i}`} scene={scene} index={i} rowX={rowX} stageWidthRef={stageWidthRef} />
              ))}
            </motion.div>
          </div>

          {/* Scrub line */}
          <div className="shrink-0 px-[8vw] pb-[5vh] pt-5">
            <div className="mx-auto flex max-w-3xl items-center gap-4">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-text-3">Now showing</span>
              <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <motion.div style={{ width: scrubWidth }} className="h-full rounded-full bg-gradient-to-r from-accent to-accent-strong" />
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-text-3">{cards.length} titles</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
