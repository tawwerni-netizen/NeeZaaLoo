import type { ReactNode } from "react";

// Every admin page is a "use client" dashboard reading live, authoritative
// state (system health, pending withdrawals, risk cases, RBAC grants) --
// none of it benefits from Next's default long-lived ISR cache for an
// otherwise-static route, and a cached admin page is actively dangerous:
// an operator could see a stale "0 pending" or a stale "HEALTHY" during a
// real incident. Setting this once, here, covers every current and future
// route under /admin without relying on each page remembering to opt out
// of caching itself.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
