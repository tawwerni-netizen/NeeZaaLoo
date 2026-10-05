"use client";

import { useEffect } from "react";

export function ThemeToggle({ className: _className }: { className?: string } = {}) {
  useEffect(() => {
    try {
      localStorage.removeItem("nizalo-theme");
      document.documentElement.setAttribute("data-theme", "dark");
    } catch {
      // Non-fatal
    }
  }, []);

  return null;
}
