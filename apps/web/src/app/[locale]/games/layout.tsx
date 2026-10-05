import type { ReactNode } from "react";

// See apps/web/src/app/[locale]/admin/layout.tsx's own comment: route
// segment config is silently ignored when exported from the "use client"
// page.tsx itself in this Next.js/Turbopack setup, so it has to live in a
// plain Server Component layout instead. This catalog renders per-game
// cover art whose file path can change between deploys (e.g. a swapped
// image); a cached snapshot from before that deploy must never keep
// serving.
export const dynamic = "force-dynamic";

export default function GamesLayout({ children }: { children: ReactNode }) {
  return children;
}
