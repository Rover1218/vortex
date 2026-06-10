"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useRef } from "react";

type PosterDef = {
  src: string;
  className: string;
  rot: string;
  size: string;
  z: number;
  big?: boolean;
  dim?: boolean;
  /** Parallax depth multiplier — higher = moves more. */
  depth: number;
  delay: number;
};

const POSTERS: PosterDef[] = [
  { src: "/posters/dune.png", className: "left-1/2 -translate-x-[120%] top-[20%]", rot: "-11deg", size: "w-40", z: 10, dim: true, depth: 0.5, delay: -1.5 },
  { src: "/posters/silo.png", className: "left-1/2 translate-x-[20%] top-[16%]", rot: "11deg", size: "w-40", z: 10, dim: true, depth: 0.7, delay: -3 },
  { src: "/posters/anime.png", className: "left-1/2 -translate-x-1/2 top-[8%]", rot: "-2deg", size: "w-56", z: 20, big: true, depth: 1, delay: 0 },
];

export function HeroPosters() {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // Scroll-driven parallax: cluster drifts up as the hero scrolls away.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const scrollY = useTransform(scrollYProgress, [0, 1], [0, -120]);

  // Mouse-driven parallax.
  const mx = useSpring(0, { stiffness: 60, damping: 18 });
  const my = useSpring(0, { stiffness: 60, damping: 18 });

  const handleMouse = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    mx.set(px * 40);
    my.set(py * 40);
  };

  const handleLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      className="relative h-[480px] hidden lg:block"
      style={{ perspective: 1200 }}
    >
      {/* Ambient glows */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full blur-[100px]"
        style={{ background: "radial-gradient(circle, rgba(245,166,35,0.22), rgba(45,212,167,0.06) 45%, transparent 70%)" }}
      />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full blur-[80px] bg-accent/25 animate-glow-breathe" />

      {POSTERS.map((p, i) => (
        <PosterCard
          key={p.src}
          poster={p}
          index={i}
          scrollY={scrollY}
          mx={mx}
          my={my}
          reduceMotion={!!reduceMotion}
        />
      ))}
    </div>
  );
}

function PosterCard({
  poster,
  index,
  scrollY,
  mx,
  my,
  reduceMotion,
}: {
  poster: PosterDef;
  index: number;
  scrollY: MotionValue<number>;
  mx: MotionValue<number>;
  my: MotionValue<number>;
  reduceMotion: boolean;
}) {
  const tx = useTransform(mx, (v) => v * poster.depth);
  const ty = useTransform(my, (v) => v * poster.depth);
  const combinedY = useTransform([scrollY, ty] as MotionValue<number>[], ([s, t]) => (s as number) * poster.depth + (t as number));

  // Positioning (Tailwind translate) lives on a plain outer div; the parallax
  // transform lives on an inner motion div. Keeping them on separate elements
  // stops Framer's `x`/`y` transform from clobbering the `-translate-x` offsets.
  return (
    <div className={`absolute ${poster.className} ${poster.size}`} style={{ zIndex: poster.z }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.2 + index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div style={{ x: reduceMotion ? 0 : tx, y: reduceMotion ? 0 : combinedY }}>
          <div className="animate-float-slow" style={{ ["--rot" as string]: poster.rot, animationDelay: `${poster.delay}s` }}>
            <PosterArt src={poster.src} big={poster.big} dim={poster.dim} />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function PosterArt({ src, big, dim }: { src: string; big?: boolean; dim?: boolean }) {
  return (
    <div
      className={`relative rounded-[20px] overflow-hidden poster-ratio border ${
        big ? "ring-1 ring-accent/40 border-white/15" : "border-white/10"
      } shadow-[0_40px_85px_-28px_rgba(0,0,0,0.92)] ${dim ? "brightness-[0.65] saturate-[0.9]" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
      {big && (
        <>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="relative flex items-center justify-center">
              <span className="absolute w-[70px] h-[70px] rounded-full bg-accent/25 animate-glow-breathe" />
              <span className="relative w-[54px] h-[54px] rounded-full bg-accent text-black flex items-center justify-center shadow-accent-glow ring-4 ring-black/25">
                <svg className="w-6 h-6 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
          </div>
          <div className="absolute bottom-3 inset-x-3">
            <div className="h-1 rounded-full bg-white/25 overflow-hidden">
              <div className="h-full w-2/5 bg-accent rounded-full" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
