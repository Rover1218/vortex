"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

type Direction = "up" | "down" | "left" | "right" | "none";

type RevealProps = {
  children: ReactNode;
  delay?: number;
  direction?: Direction;
  className?: string;
  /** Distance in px the element travels into place. */
  distance?: number;
  /** Re-animate every time it enters the viewport instead of only once. */
  repeat?: boolean;
};

const OFFSET: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 36 },
  down: { x: 0, y: -36 },
  left: { x: 36, y: 0 },
  right: { x: -36, y: 0 },
  none: { x: 0, y: 0 },
};

/**
 * Scroll-into-view reveal. Fades and slides its children in when they enter the
 * viewport, honouring prefers-reduced-motion (renders instantly, no transform).
 */
export function Reveal({
  children,
  delay = 0,
  direction = "up",
  className,
  distance,
  repeat = false,
}: RevealProps) {
  const reduceMotion = useReducedMotion();
  const base = OFFSET[direction];
  const scale = distance !== undefined ? distance / 36 : 1;

  const variants: Variants = {
    hidden: reduceMotion
      ? { opacity: 0 }
      : { opacity: 0, x: base.x * scale, y: base.y * scale, filter: "blur(6px)" },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      filter: "blur(0px)",
      transition: {
        duration: 0.7,
        delay,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: !repeat, margin: "0px 0px -12% 0px" }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Staggered container — direct <Reveal>-style children animate in sequence.
 * Wrap children in <RevealItem> to participate.
 */
export function RevealGroup({
  children,
  className,
  stagger = 0.08,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  const container: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: stagger } },
  };

  return (
    <motion.div
      className={className}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
  direction = "up",
}: {
  children: ReactNode;
  className?: string;
  direction?: Direction;
}) {
  const reduceMotion = useReducedMotion();
  const base = OFFSET[direction];
  const variants: Variants = {
    hidden: reduceMotion
      ? { opacity: 0 }
      : { opacity: 0, x: base.x, y: base.y, filter: "blur(6px)" },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
    },
  };
  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
}
