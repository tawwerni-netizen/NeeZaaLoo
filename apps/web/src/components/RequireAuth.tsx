"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { player, loading } = useAuth();
  const { locale } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !player) router.replace(`/${locale}/login`);
  }, [loading, player, locale, router]);

  if (loading || !player) return null;
  return <>{children}</>;
}
