"use client";

import { useEffect, useState } from "react";
import styles from "./Logo.module.css";

export function Logo({
  variant = "wordmark",
  className,
}: {
  variant?: "wordmark" | "mark";
  className?: string | undefined;
}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const updateTheme = () => {
      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      setTheme(isLight ? "light" : "dark");
    };
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const src =
    variant === "wordmark"
      ? theme === "light"
        ? "/logo/nizalo-wordmark.svg"
        : "/logo/nizalo-wordmark-dark.svg"
      : theme === "light"
        ? "/logo/nizalo-mark.svg"
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
