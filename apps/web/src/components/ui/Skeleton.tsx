import React, { type CSSProperties } from "react";
import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  variant?: "text" | "circular" | "rectangular" | "card" | "board";
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}

export function Skeleton({
  variant = "rectangular",
  width,
  height,
  className,
  style,
  "aria-label": ariaLabel = "Loading...",
}: SkeletonProps) {
  const variantClass =
    variant === "text"
      ? styles.text
      : variant === "circular"
      ? styles.circular
      : variant === "card"
      ? styles.card
      : variant === "board"
      ? styles.board
      : styles.rectangular;

  const inlineStyles: CSSProperties = {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...style,
  };

  return (
    <span
      className={[styles.skeleton, variantClass, className].filter(Boolean).join(" ")}
      style={inlineStyles}
      role="status"
      aria-label={ariaLabel}
      aria-live="polite"
    />
  );
}
