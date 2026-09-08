/**
 * Theme-correct logo, no client JS.
 *
 * Both the light-ground and dark-ground lockups render into the DOM; which
 * one is visible is decided purely by CSS (mirroring the same
 * `:root:not([data-theme="light"])` / `:root[data-theme="dark"]` pattern
 * tokens.css already uses for colour), so there is no flash, no hydration
 * mismatch, and no JS-based theme detection needed just to show a logo.
 */
import styles from "./Logo.module.css";

export function Logo({ variant = "wordmark", className }: { variant?: "wordmark" | "mark"; className?: string }) {
  const light = variant === "wordmark" ? "/logo/nizalo-wordmark.svg" : "/logo/nizalo-mark.svg";
  const dark = variant === "wordmark" ? "/logo/nizalo-wordmark-dark.svg" : "/logo/nizalo-mark-dark.svg";
  return (
    <span className={`${styles.logo} ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG, not a raster asset to optimise */}
      <img src={light} alt="Nizalo" className={styles.light} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dark} alt="Nizalo" className={styles.dark} />
    </span>
  );
}
