"use client";

/**
 * Global state for the elegant Sign in / Create account popup. One place
 * decides whether it is open, so it can be triggered from anywhere -- the
 * header's own buttons, a gated action elsewhere in the app, or the
 * first-visit auto-show in AuthPopup.tsx itself -- without every caller
 * needing to know how the popup is mounted.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type AuthPopupContextValue = {
  open: boolean;
  openPopup: () => void;
  closePopup: () => void;
};

const AuthPopupContext = createContext<AuthPopupContextValue | null>(null);

export function AuthPopupProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openPopup = useCallback(() => setOpen(true), []);
  const closePopup = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, openPopup, closePopup }), [open, openPopup, closePopup]);
  return <AuthPopupContext.Provider value={value}>{children}</AuthPopupContext.Provider>;
}

export function useAuthPopup() {
  const ctx = useContext(AuthPopupContext);
  if (!ctx) throw new Error("useAuthPopup must be used within an AuthPopupProvider");
  return ctx;
}
