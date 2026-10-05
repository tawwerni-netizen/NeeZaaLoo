"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
  useEffect,
} from "react";
import styles from "./Toast.module.css";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string | undefined;
  durationMs?: number | undefined;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, "id">) => void;
  success: (title: string, message?: string | undefined) => void;
  error: (title: string, message?: string | undefined) => void;
  warning: (title: string, message?: string | undefined) => void;
  info: (title: string, message?: string | undefined) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    return {
      showToast: () => {},
      success: () => {},
      error: () => {},
      warning: () => {},
      info: () => {},
      dismiss: () => {},
    };
  }
  return ctx;
}

const ICONS: Record<ToastType, string> = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, durationMs = 4000 }: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, title, message, durationMs }]);
    },
    []
  );

  const success = useCallback(
    (title: string, message?: string | undefined) => showToast({ type: "success", title, message }),
    [showToast]
  );
  const error = useCallback(
    (title: string, message?: string | undefined) => showToast({ type: "error", title, message }),
    [showToast]
  );
  const warning = useCallback(
    (title: string, message?: string | undefined) => showToast({ type: "warning", title, message }),
    [showToast]
  );
  const info = useCallback(
    (title: string, message?: string | undefined) => showToast({ type: "info", title, message }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info, dismiss }}>
      {children}
      <div className={styles.container} role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const { type, title, message, durationMs = 4000 } = toast;

  useEffect(() => {
    if (durationMs <= 0) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDismiss]);

  const typeClass =
    type === "success"
      ? styles.toastSuccess
      : type === "error"
      ? styles.toastError
      : type === "warning"
      ? styles.toastWarning
      : styles.toastInfo;

  return (
    <div
      className={[styles.toast, typeClass].join(" ")}
      role="alert"
      aria-live={type === "error" ? "assertive" : "polite"}
    >
      <span className={styles.icon} aria-hidden="true">
        {ICONS[type]}
      </span>
      <div className={styles.content}>
        <div className={styles.title}>{title}</div>
        {message && <div className={styles.message}>{message}</div>}
      </div>
      <button
        type="button"
        className={styles.closeBtn}
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
      {durationMs > 0 && (
        <div
          className={styles.progressBar}
          style={{ animationDuration: `${durationMs}ms` }}
        />
      )}
    </div>
  );
}
