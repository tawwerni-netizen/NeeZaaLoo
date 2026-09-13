import styles from "./Logo.module.css";

export function Logo({ variant = "wordmark", className }: { variant?: "wordmark" | "mark"; className?: string }) {
  const light = variant === "wordmark" ? "/logo/nizalo-wordmark.svg" : "/logo/nizalo-mark.svg";
  const dark = variant === "wordmark" ? "/logo/nizalo-wordmark-dark.svg" : "/logo/nizalo-mark-dark.svg";

  return (
    <span className={`${styles.logo} ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dark} alt="Nizalo" className={`${styles.logoImg} ${styles.logoDark}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={light} alt="Nizalo" className={`${styles.logoImg} ${styles.logoLight}`} />
    </span>
  );
}
