"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { BrandingConfig, BrandTheme } from "./branding";
import {
  BRAND_THEMES,
  getDefaultBranding,
  loadBranding,
  saveBranding,
  resetBranding,
  applyThemeVariables,
} from "./branding";

type BrandContextType = {
  branding: BrandingConfig;
  currentTheme: BrandTheme;
  updateBranding: (partial: Partial<BrandingConfig>) => void;
  resetToDefault: () => void;
  isDemoActive: boolean;
};

const defaultTheme = BRAND_THEMES.nizalo!;

const BrandContext = createContext<BrandContextType>({
  branding: getDefaultBranding(),
  currentTheme: defaultTheme,
  updateBranding: () => {},
  resetToDefault: () => {},
  isDemoActive: false,
});

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [branding, setBrandingState] = useState<BrandingConfig>(getDefaultBranding());

  useEffect(() => {
    const initial = loadBranding();
    setBrandingState(initial);
    applyThemeVariables(initial.themeId);

    const onBrandingChanged = (e: Event) => {
      const customEvent = e as CustomEvent<BrandingConfig>;
      if (customEvent.detail) {
        setBrandingState(customEvent.detail);
      }
    };

    window.addEventListener("nizalo:branding-changed", onBrandingChanged);
    return () => {
      window.removeEventListener("nizalo:branding-changed", onBrandingChanged);
    };
  }, [pathname]);

  const updateBranding = (partial: Partial<BrandingConfig>) => {
    const updated = saveBranding(partial);
    setBrandingState(updated);
  };

  const resetToDefault = () => {
    const def = resetBranding();
    setBrandingState(def);
  };

  const currentTheme = BRAND_THEMES[branding.themeId] || defaultTheme;

  return (
    <BrandContext.Provider
      value={{
        branding,
        currentTheme,
        updateBranding,
        resetToDefault,
        isDemoActive: branding.isDemoActive,
      }}
    >
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}
