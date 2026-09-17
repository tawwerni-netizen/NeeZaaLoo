import type { ReactNode } from "react";

// See apps/web/src/app/[locale]/admin/layout.tsx's own comment: route
// segment config is silently ignored when exported from the "use client"
// page.tsx itself in this Next.js/Turbopack setup, so it has to live in a
// plain Server Component layout instead. This route shows live prize
// pools, registration counts, and cover art that must reflect the latest
// deploy, not a cached snapshot that can predate it.
export const dynamic = "force-dynamic";

export default function TournamentsLayout({ children }: { children: ReactNode }) {
  return children;
}
