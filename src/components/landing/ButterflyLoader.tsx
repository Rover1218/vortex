"use client";

import { motion } from "framer-motion";

/** Deterministic twinkle field (no Math.random — this renders during SSR). */
const TWINKLES: { left: string; top: string; delay: string; size: number }[] = [
  { left: "12%", top: "22%", delay: "0s", size: 2 },
  { left: "24%", top: "68%", delay: "0.8s", size: 1 },
  { left: "38%", top: "14%", delay: "1.6s", size: 2 },
  { left: "52%", top: "78%", delay: "0.4s", size: 1 },
  { left: "63%", top: "28%", delay: "2.1s", size: 2 },
  { left: "76%", top: "62%", delay: "1.2s", size: 1 },
  { left: "84%", top: "20%", delay: "0.6s", size: 2 },
  { left: "90%", top: "74%", delay: "1.9s", size: 1 },
  { left: "8%", top: "48%", delay: "2.4s", size: 1 },
  { left: "46%", top: "44%", delay: "1.0s", size: 1 },
];

function Butterfly() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full overflow-visible">
      <defs>
        {/* Upper wings — light pools near the body, deepens toward the tips */}
        <radialGradient id="bf-up" cx="52%" cy="80%" r="88%">
          <stop offset="0%" stopColor="#ffeaba" />
          <stop offset="42%" stopColor="#f8b43d" />
          <stop offset="100%" stopColor="#dd7513" />
        </radialGradient>
        {/* Lower wings — light near the body (top), deepens downward */}
        <radialGradient id="bf-low" cx="50%" cy="20%" r="96%">
          <stop offset="0%" stopColor="#ffdb8e" />
          <stop offset="52%" stopColor="#f0991e" />
          <stop offset="100%" stopColor="#bd590d" />
        </radialGradient>
        <linearGradient id="bf-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a2f0a" />
          <stop offset="100%" stopColor="#130b02" />
        </linearGradient>
      </defs>

      {/* Antennae (attached to the head — don't flap) */}
      <g stroke="#241603" strokeWidth="1.5" fill="none" strokeLinecap="round">
        <path d="M60 41 C 54 30 49 25 44 21" />
        <path d="M60 41 C 66 30 71 25 76 21" />
      </g>
      <circle cx="44" cy="21" r="2.2" fill="#241603" />
      <circle cx="76" cy="21" r="2.2" fill="#241603" />

      {/* Wings — beat as a group around the body axis (x=60) */}
      <g className="bf-wings">
        <g stroke="#241603" strokeWidth="1.6" strokeLinejoin="round">
          {/* upper wings */}
          <path fill="url(#bf-up)" d="M60 52 C 50 28 27 13 16 21 C 9 26 11 45 20 53 C 31 60 49 59 60 52 Z" />
          <path fill="url(#bf-up)" d="M60 52 C 70 28 93 13 104 21 C 111 26 109 45 100 53 C 89 60 71 59 60 52 Z" />
          {/* lower wings */}
          <path fill="url(#bf-low)" d="M60 62 C 49 64 30 73 29 90 C 28 104 41 109 49 101 C 57 94 61 78 60 62 Z" />
          <path fill="url(#bf-low)" d="M60 62 C 71 64 90 73 91 90 C 92 104 79 109 71 101 C 63 94 59 78 60 62 Z" />
        </g>

        {/* Glossy highlight cells */}
        <g fill="#fff" opacity="0.17">
          <ellipse cx="33" cy="35" rx="11" ry="7.5" transform="rotate(-22 33 35)" />
          <ellipse cx="87" cy="35" rx="11" ry="7.5" transform="rotate(22 87 35)" />
          <ellipse cx="42" cy="83" rx="7" ry="5.5" />
          <ellipse cx="78" cy="83" rx="7" ry="5.5" />
        </g>

        {/* Veins */}
        <g stroke="#7d4109" strokeWidth="0.9" strokeOpacity="0.5" fill="none" strokeLinecap="round">
          <path d="M60 53 L 26 28" /><path d="M60 53 L 42 22" />
          <path d="M60 53 L 94 28" /><path d="M60 53 L 78 22" />
          <path d="M60 64 L 38 92" /><path d="M60 64 L 82 92" />
        </g>

        {/* Dark edge spots + white margin dots (monarch pattern) */}
        <g fill="#241603" fillOpacity="0.55">
          <circle cx="24" cy="24" r="2.4" /><circle cx="96" cy="24" r="2.4" />
        </g>
        <g fill="#fff" fillOpacity="0.92">
          <circle cx="20" cy="31" r="1.8" /><circle cx="29" cy="21" r="1.5" />
          <circle cx="100" cy="31" r="1.8" /><circle cx="91" cy="21" r="1.5" />
          <circle cx="35" cy="98" r="1.5" /><circle cx="85" cy="98" r="1.5" />
        </g>
      </g>

      {/* Body + head (drawn over the wing roots) */}
      <ellipse cx="60" cy="64" rx="3.1" ry="22" fill="url(#bf-body)" />
      <g stroke="#0d0701" strokeWidth="0.8" strokeOpacity="0.45" strokeLinecap="round">
        <path d="M57.2 58 H62.8" /><path d="M57 66 H63" /><path d="M57.4 74 H62.6" />
      </g>
      <circle cx="60" cy="41" r="4.3" fill="url(#bf-body)" />
      <circle cx="58.3" cy="40" r="1" fill="#6b4512" />
      <circle cx="61.7" cy="40" r="1" fill="#6b4512" />
    </svg>
  );
}

/**
 * Full-screen loading scene. A glowing butterfly wanders a looping path across
 * the viewport (transform-only) trailing a soft light, over a star field and the
 * Vortex wordmark. Replaces the plain "V" spinner.
 */
export function ButterflyLoader() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-base">
      {/* Ambient depth */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
        style={{ background: "radial-gradient(circle, rgba(245,166,35,0.10), rgba(45,212,167,0.04) 45%, transparent 70%)" }}
      />
      {/* Star field */}
      {TWINKLES.map((t, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white/60 animate-pulse"
          style={{ left: t.left, top: t.top, width: t.size, height: t.size, animationDelay: t.delay }}
        />
      ))}

      {/* Wordmark */}
      <div className="relative z-10 flex flex-col items-center gap-5 text-center">
        <span className="text-4xl font-black tracking-tight text-gradient-amber md:text-5xl">Vortex</span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.32em] text-text-3">
          Preparing your cinema
        </span>
        <div className="mt-1 h-[3px] w-44 overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-accent via-accent-strong to-teal animate-shimmer" />
        </div>
      </div>

      {/* The butterfly — centred via margins so x/y stay free for the flight path.
          `initial` matches the first keyframe so it never flashes at dead-centre. */}
      <motion.div
        className="absolute left-1/2 top-1/2 z-20 -ml-12 -mt-12 h-24 w-24"
        initial={{ x: "-26vw", y: "-24vh", rotate: -10 }}
        animate={{
          x: ["-26vw", "20vw", "30vw", "-8vw", "-24vw", "-26vw"],
          y: ["-24vh", "10vh", "-12vh", "20vh", "4vh", "-24vh"],
          rotate: [-10, 12, -6, 10, -4, -10],
        }}
        transition={{ duration: 12, ease: "easeInOut", repeat: Infinity }}
      >
        {/* Trailing glow */}
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-accent/25 blur-2xl" />
        <Butterfly />
      </motion.div>
    </div>
  );
}
