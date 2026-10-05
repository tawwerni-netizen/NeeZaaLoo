export type BrandTheme = {
  id: string;
  name: string;
  nameAr: string;
  primaryColor: string;
  primaryGradient: string;
  accentGlow: string;
  badgeBg: string;
  badgeText: string;
  previewColor: string;
};

export const BRAND_THEMES: Record<string, BrandTheme> = {
  nizalo: {
    id: "nizalo",
    name: "Nizalo Arena",
    nameAr: "نيزالو أرينا",
    primaryColor: "#f59e0b",
    primaryGradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    accentGlow: "rgba(245, 158, 11, 0.35)",
    badgeBg: "rgba(245, 158, 11, 0.15)",
    badgeText: "#fbbf24",
    previewColor: "#f59e0b",
  },
  crypto: {
    id: "crypto",
    name: "CryptoPlay 3",
    nameAr: "كريبتو بلاي",
    primaryColor: "#10b981",
    primaryGradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    accentGlow: "rgba(16, 185, 129, 0.35)",
    badgeBg: "rgba(16, 185, 129, 0.15)",
    badgeText: "#34d399",
    previewColor: "#10b981",
  },
  royal: {
    id: "royal",
    name: "Royal Club VIP",
    nameAr: "نادي الملوك VIP",
    primaryColor: "#e11d48",
    primaryGradient: "linear-gradient(135deg, #f43f5e 0%, #be123c 100%)",
    accentGlow: "rgba(225, 29, 72, 0.35)",
    badgeBg: "rgba(225, 29, 72, 0.15)",
    badgeText: "#fb7185",
    previewColor: "#e11d48",
  },
  sapphire: {
    id: "sapphire",
    name: "Apex Gaming",
    nameAr: "أبيكس جيمنج",
    primaryColor: "#3b82f6",
    primaryGradient: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
    accentGlow: "rgba(59, 130, 246, 0.35)",
    badgeBg: "rgba(59, 130, 246, 0.15)",
    badgeText: "#60a5fa",
    previewColor: "#3b82f6",
  },
  cyber: {
    id: "cyber",
    name: "Vanguard Esports",
    nameAr: "فانجارد سبورتس",
    primaryColor: "#a855f7",
    primaryGradient: "linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)",
    accentGlow: "rgba(168, 85, 247, 0.35)",
    badgeBg: "rgba(168, 85, 247, 0.15)",
    badgeText: "#c084fc",
    previewColor: "#a855f7",
  },
};

export type BrandingConfig = {
  brandName: string;
  brandNameAr: string;
  themeId: string;
  customLogoUrl: string | null;
  isDemoActive: boolean;
};

const STORAGE_KEY = "nizalo_whitelabel_config";

export function getDefaultBranding(): BrandingConfig {
  return {
    brandName: "Nizalo",
    brandNameAr: "نيزالو",
    themeId: "nizalo",
    customLogoUrl: null,
    isDemoActive: false,
  };
}

export function isDemoEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.hostname.startsWith("demo.") ||
    window.location.search.includes("demo=1") ||
    window.location.pathname.includes("/demo") ||
    window.location.pathname.includes("/b2b")
  );
}

export function loadBranding(): BrandingConfig {
  if (typeof window === "undefined") return getDefaultBranding();
  try {
    const isDemoHost = isDemoEnvironment();

    // Strictly isolate: Main production domain (nizalo.com) outside /b2b ALWAYS runs default Nizalo platform
    if (!isDemoHost) {
      return getDefaultBranding();
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...parsed,
        isDemoActive: true,
      };
    }

    return {
      ...getDefaultBranding(),
      isDemoActive: true,
    };
  } catch {
    return getDefaultBranding();
  }
}

export function saveBranding(config: Partial<BrandingConfig>): BrandingConfig {
  if (typeof window === "undefined") return getDefaultBranding();
  try {
    const current = loadBranding();
    const updated = { ...current, ...config };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    // Apply CSS custom properties dynamically
    applyThemeVariables(updated.themeId);
    window.dispatchEvent(new CustomEvent("nizalo:branding-changed", { detail: updated }));
    return updated;
  } catch {
    return getDefaultBranding();
  }
}

export function resetBranding(): BrandingConfig {
  if (typeof window === "undefined") return getDefaultBranding();
  try {
    localStorage.removeItem(STORAGE_KEY);
    const def = getDefaultBranding();
    applyThemeVariables(def.themeId);
    window.dispatchEvent(new CustomEvent("nizalo:branding-changed", { detail: def }));
    return def;
  } catch {
    return getDefaultBranding();
  }
}

export function applyThemeVariables(themeId: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  if (!isDemoEnvironment() || themeId === "nizalo") {
    // Remove custom overrides so native Nizalo CSS variables from globals.css take full control
    root.style.removeProperty("--nz-brand-primary");
    root.style.removeProperty("--nz-brand-gradient");
    root.style.removeProperty("--nz-brand-glow");
    root.style.removeProperty("--nz-brand-badge-bg");
    root.style.removeProperty("--nz-brand-badge-text");
    root.style.removeProperty("--nz-accent");
    root.style.removeProperty("--nz-accent-hover");
    root.style.removeProperty("--nz-accent-press");
    root.style.removeProperty("--nz-accent-soft");
    root.style.removeProperty("--nz-accent-line");
    root.style.removeProperty("--nz-mat-gold");
    root.style.removeProperty("--nz-mat-gold-ink");
    root.style.removeProperty("--nz-mat-gold-line");
    root.style.removeProperty("--nz-shadow-gold-glow");
    root.style.removeProperty("--nz-neon-amber");
    return;
  }

  const theme = BRAND_THEMES[themeId] || BRAND_THEMES.nizalo || Object.values(BRAND_THEMES)[0];
  if (!theme) return;

  // Custom B2B Theme variables
  root.style.setProperty("--nz-brand-primary", theme.primaryColor);
  root.style.setProperty("--nz-brand-gradient", theme.primaryGradient);
  root.style.setProperty("--nz-brand-glow", theme.accentGlow);
  root.style.setProperty("--nz-brand-badge-bg", theme.badgeBg);
  root.style.setProperty("--nz-brand-badge-text", theme.badgeText);

  // Core System Variables Override
  root.style.setProperty("--nz-accent", theme.primaryColor);
  root.style.setProperty("--nz-accent-hover", theme.primaryColor);
  root.style.setProperty("--nz-accent-press", theme.primaryColor);
  root.style.setProperty("--nz-accent-soft", theme.badgeBg);
  root.style.setProperty("--nz-accent-line", theme.accentGlow);
  root.style.setProperty("--nz-mat-gold", theme.primaryColor);
  root.style.setProperty("--nz-mat-gold-ink", theme.primaryColor);
  root.style.setProperty("--nz-mat-gold-line", theme.accentGlow);
  root.style.setProperty("--nz-shadow-gold-glow", `0 0 20px ${theme.accentGlow}, 0 0 40px ${theme.accentGlow}`);
  root.style.setProperty("--nz-neon-amber", theme.primaryColor);
}
