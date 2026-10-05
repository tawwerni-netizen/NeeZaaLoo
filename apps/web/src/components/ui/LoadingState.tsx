import React, { type ReactNode } from "react";
import styles from "./LoadingState.module.css";

export interface LoadingStateProps {
  message?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  minHeight?: string | number;
}

export function LoadingState({
  message = "Loading tactical data...",
  size = "md",
  className,
  minHeight,
}: LoadingStateProps) {
  const spinnerSizeClass =
    size === "sm" ? styles.spinnerSm : size === "lg" ? styles.spinnerLg : "";

  return (
    <div
      className={[styles.container, className].filter(Boolean).join(" ")}
      style={minHeight !== undefined ? { minHeight } : undefined}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={[styles.spinner, spinnerSizeClass].filter(Boolean).join(" ")}>
        <div className={styles.ringOuter} />
        <div className={styles.ringInner} />
      </div>
      {message && <div className={styles.message}>{message}</div>}
    </div>
  );
}
