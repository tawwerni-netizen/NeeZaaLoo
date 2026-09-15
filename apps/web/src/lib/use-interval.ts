"use client";

import { useEffect, useRef } from "react";

/**
 * Executes a callback on a timer interval, automatically pausing when the
 * tab/browser window is hidden (`document.hidden`), and resuming when visible.
 *
 * @param callback Function to call on each interval tick
 * @param delayMs Interval duration in milliseconds, or null/false to pause
 * @param immediate If true, runs callback immediately when becoming visible
 */
export function useVisibilityAwareInterval(
  callback: () => void | Promise<void>,
  delayMs: number | null | false,
  immediate = false
) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (delayMs === null || delayMs === false) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const startTimer = () => {
      if (timer !== null) return;
      timer = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        void savedCallback.current();
      }, delayMs);
    };

    const stopTimer = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopTimer();
      } else {
        if (immediate) {
          void savedCallback.current();
        }
        startTimer();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
      if (!document.hidden) {
        startTimer();
      }
    } else {
      startTimer();
    }

    return () => {
      stopTimer();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [delayMs, immediate]);
}
