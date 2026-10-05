"use client";

import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n/context";
import styles from "./Logo.module.css";

export function Logo({
  variant = "wordmark",
  className,
}: {
  variant?: "wordmark" | "mark";
  className?: string | undefined;
}) {
  const { branding, currentTheme } = useBrand();
  const { locale } = useI18n();

  const isCustomBrand = branding.brandName && branding.brandName.trim().toLowerCase() !== "nizalo";

  if (isCustomBrand) {
    const displayName = (locale === "ar" && branding.brandNameAr) ? branding.brandNameAr : branding.brandName;
    const initialLetter = displayName.trim().slice(0, 1).toUpperCase();

    return (
      <span
        className={`${styles.logo} ${className ?? ""}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          fontWeight: "800",
          fontSize: variant === "wordmark" ? "20px" : "16px",
          letterSpacing: "-0.5px",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            background: currentTheme.primaryGradient,
            color: "#ffffff",
            fontSize: "17px",
            fontWeight: "900",
            boxShadow: `0 0 14px ${currentTheme.accentGlow}`,
            flexShrink: 0,
          }}
        >
          {initialLetter}
        </span>
        {variant === "wordmark" && (
          <span
            style={{
              display: "inline-block",
              lineHeight: "1.2",
              fontSize: "20px",
              fontWeight: "900",
              color: "#ffffff",
              letterSpacing: "-0.5px",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </span>
        )}
      </span>
    );
  }

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
