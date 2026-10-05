import type { ReactNode } from "react";

// See apps/web/src/app/[locale]/admin/layout.tsx's own comment: route
// segment config is silently ignored when exported from the "use client"
// page.tsx itself in this Next.js/Turbopack setup, so it has to live in a
// plain Server Component layout instead. Same reasoning as the games
// catalog layout: this page renders per-game thumbnails whose file path
// can change between deploys.
export const dynamic = "force-dynamic";

export default function LearnLayout({ children }: { children: ReactNode }) {
  return children;
}
