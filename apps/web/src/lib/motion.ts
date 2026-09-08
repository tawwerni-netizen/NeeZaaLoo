/**
 * Motion tokens for JS-driven animation (Framer Motion transition configs).
 *
 * These are NOT a second source of truth — they mirror the exact values in
 * packages/tokens/tokens.css (--nz-dur-*, --nz-ease-*) verbatim, because CSS
 * custom properties cannot be read into a Framer Motion `transition` object
 * without a runtime style lookup on every animation. If a duration or easing
 * curve ever changes, change it in tokens.css first, per the brand
 * guidelines (docs/brand/BRAND_GUIDELINES.md §6), then update this file to
 * match -- never the other way around.
 *
 * Per the brand guidelines: motion is confirmation, never decoration. Every
 * duration here maps to a specific, named USE, not a vibe.
 */

export const duration = {
  /** State echo -- press, toggle. */
  instant: 0.09,
  /** Default UI transition. */
  fast: 0.14,
  /** Entrance, reveal. */
  base: 0.2,
  /** Rare -- full-surface change only. */
  slow: 0.32,
  /** Ceremony tier (packages/tokens/tokens.css's own --nz-dur-ceremony*):
   * a moment the player EARNED -- achievement, badge, rating/EXP resolve.
   * Never for confirming an ordinary action; see that file's own fence. */
  ceremony: 0.48,
  ceremonyLong: 0.72,
} as const;

export const ease = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
  /** Snap: playful overshoot, reserved for reward/achievement moments. */
  snap: [0.34, 1.56, 0.64, 1],
} as const;

/** Ready-to-spread Framer Motion transition presets for the common cases. */
export const transition = {
  press: { duration: duration.instant, ease: ease.out },
  ui: { duration: duration.fast, ease: ease.out },
  reveal: { duration: duration.base, ease: ease.out },
  surface: { duration: duration.slow, ease: ease.inOut },
  reward: { duration: duration.base, ease: ease.snap },
  /** The ceremony tier itself, snap-eased (achievement/badge/level-up). */
  ceremony: { duration: duration.ceremony, ease: ease.snap },
  ceremonyLong: { duration: duration.ceremonyLong, ease: ease.snap },
} as const;

/**
 * `prefers-reduced-motion` as a boolean, safe to call during render on the
 * client (returns false during SSR, corrected on mount by the caller via
 * `useReducedMotion` below) -- Framer Motion's own `useReducedMotion` hook
 * does exactly this, re-exported here so every component imports motion
 * concerns from one place.
 */
export { useReducedMotion } from "framer-motion";
