import React, { type ReactNode } from "react";
import styles from "./ErrorState.module.css";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  errorCode?: string | number;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryAction?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = "Connection or State Disrupted",
  description = "A tactical operation encountered an error. Your session and assets are safely recorded on-chain.",
  errorCode,
  onRetry,
  retryLabel = "Retry Operation",
  secondaryAction,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={[styles.container, className].filter(Boolean).join(" ")}
      role="alert"
    >
      <div className={styles.iconWrapper} aria-hidden="true">
        ⚠️
      </div>
      {errorCode && <span className={styles.codeBadge}>ERR_{errorCode}</span>}
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {(onRetry || secondaryAction) && (
        <div className={styles.actions}>
          {onRetry && (
            <button type="button" className={styles.retryBtn} onClick={onRetry}>
              🔄 {retryLabel}
            </button>
          )}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
