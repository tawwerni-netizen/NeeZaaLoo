"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { player, loading } = useAuth();
  const { locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !player) {
      const returnParam = pathname ? `?returnTo=${encodeURIComponent(pathname)}` : "";
      router.replace(`/${locale}/login${returnParam}`);
    }
  }, [loading, player, locale, router, pathname]);

  if (loading || !player) return null;
  return <>{children}</>;
}
