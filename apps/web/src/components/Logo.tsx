"use client";

import styles from "./Logo.module.css";

export function Logo({
  variant = "wordmark",
  className,
}: {
  variant?: "wordmark" | "mark";
  className?: string | undefined;
}) {
  const src =
    variant === "wordmark"
      ? "/logo/nizalo-wordmark-dark.svg"
      : "/logo/nizalo-mark-dark.svg";

  return (
    <span className={`${styles.logo} ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Nizalo"
        className={styles.logoImg}
        width={variant === "wordmark" ? 149 : 28}
        height={28}
      />
    </span>
  );
}
