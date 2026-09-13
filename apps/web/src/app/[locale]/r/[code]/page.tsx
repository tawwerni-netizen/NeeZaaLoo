"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";

type Props = {
  params: Promise<{ locale: string; code: string }>;
};

export default function ReferralVanityPage({ params }: Props) {
  const { code } = use(params);
  const { locale } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (!code) return;
    const cleanCode = encodeURIComponent(code.trim().toUpperCase());
    // Set 30-day referral attribution cookie
    document.cookie = `nz_ref=${cleanCode}; path=/; max-age=2592000; samesite=lax`;

    // Redirect to home/play
    const timer = setTimeout(() => {
      router.replace(`/${locale}/play`);
    }, 800);

    return () => clearTimeout(timer);
  }, [code, locale, router]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#080B10",
      color: "#FFF",
      fontFamily: "var(--font-sans, system-ui, sans-serif)",
      padding: "2rem",
      textAlign: "center",
    }}>
      <div style={{
        background: "rgba(22, 28, 38, 0.8)",
        border: "1px solid rgba(212, 163, 62, 0.3)",
        borderRadius: "1rem",
        padding: "2.5rem 2rem",
        maxWidth: "420px",
        boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
      }}>
        <div style={{
          fontSize: "1.25rem",
          fontWeight: 800,
          color: "#E5C158",
          letterSpacing: "4px",
          marginBottom: "1rem",
        }}>
          NIZALO
        </div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
          Welcome to Nizalo!
        </h1>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.95rem", lineHeight: 1.5, margin: "0 0 1.5rem" }}>
          You were invited by code <strong style={{ color: "#FCD34D" }}>{code?.toUpperCase()}</strong>. Preparing your experience...
        </p>
        <div style={{
          display: "inline-block",
          width: "32px",
          height: "32px",
          border: "3px solid rgba(212, 163, 62, 0.2)",
          borderTopColor: "#E5C158",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
