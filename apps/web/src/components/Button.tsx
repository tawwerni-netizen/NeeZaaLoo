"use client";

/**
 * The one button component every screen uses.
 *
 * Motion behaviour (see docs/brand/BRAND_GUIDELINES.md §6 and
 * src/lib/motion.ts):
 *   - UX objective: confirm the control is interactive before commitment,
 *     confirm the press landed after commitment.
 *   - Psychological objective: a primary action should feel immediate and
 *     physical -- never sluggish, never bouncy (bounce is reserved for
 *     reward moments elsewhere, e.g. rank-up).
 *   - Hover: a subtle lift (140ms, ease-out).
 *   - Press: a quick scale-down echo (90ms, ease-out) -- the "state echo"
 *     duration from the token table, used for nothing else.
 *   - Reduced motion: hover/press become an instant colour change only: the
 *     press state is still communicated (accessibility requires it), just
 *     without a transform.
 *   - Performance: transform/opacity only, never layout properties, so this
 *     never triggers reflow.
 */
import { motion, useReducedMotion } from "framer-motion";
import type { MouseEventHandler, ReactNode } from "react";
import { transition } from "@/lib/motion";
import styles from "./Button.module.css";

// A deliberately NARROW prop surface, not the full native <button> interface:
// framer-motion's own prop types (style, drag handlers, ...) are not
// compatible with spreading arbitrary native button props under this repo's
// `exactOptionalPropertyTypes: true`, and every actual call site in this app
// only ever needs these five things.
type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement> | undefined;
  // CSS Modules import as an index-signature type, and this repo's
  // `noUncheckedIndexedAccess` makes every such access `string | undefined`
  // even though a real build always resolves a real class name -- accept
  // that shape rather than fight it at every call site.
  className?: string | undefined;
  children: ReactNode;
};

export function Button({ variant = "primary", type = "button", disabled = false, onClick, className, children }: ButtonProps) {
  const reduceMotion = useReducedMotion();
  const motionProps = reduceMotion
    ? { whileTap: { opacity: 0.85 }, transition: { duration: 0 } }
    : { whileHover: { y: -1 }, whileTap: { scale: 0.97 }, transition: transition.ui };
  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${styles.button} ${styles[variant]} ${className ?? ""}`}
      {...motionProps}
    >
      {children}
    </motion.button>
  );
}
