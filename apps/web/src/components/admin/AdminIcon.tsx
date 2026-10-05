/**
 * A small, self-contained line-icon set for the admin shell -- no icon
 * package dependency, just the ~20 glyphs this surface actually needs.
 * Every icon is a plain 20x20 stroke path in `currentColor`, so it inherits
 * whatever color the sidebar/topbar already applies (muted, active-emerald,
 * or a state chip's own semantic color) without a second theming system.
 */
type IconName =
  | "dashboard" | "players" | "games" | "matches" | "tournaments" | "arena"
  | "finance" | "deposits" | "withdrawals" | "risk" | "fairplay" | "support"
  | "chat" | "referrals" | "store" | "content" | "systemHealth" | "settings" | "rbac" | "bot"
  | "search" | "bell" | "chevronDown" | "customize" | "trendUp" | "trendDown" | "menu";

const PATHS: Record<IconName, string> = {
  bot: "M12 2v2M9 4h6a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Zm-3 7h.01M15 11h.01M9 15h6M2 12h2M20 12h2",
  dashboard: "M3 3h7v9H3V3Zm11 0h7v5h-7V3ZM3 15h7v6H3v-6Zm11-4h7v10h-7V11Z",
  players: "M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 19c0-3.3 2.7-6 6-6s6 2.7 6 6H2Zm12.5-4c2.5.3 4.5 2.3 4.8 4.8H15c0-.2 0-.5-.1-.7-.2-1.6-1-3-2.1-4.1H14.5Z",
  games: "M6 9h2v2h2v2H8v2H6v-2H4v-2h2V9Zm10 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm-3-4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM7 4h6c3.9 0 7 3.1 7 7s-3.1 7-7 7l-.6-.1L11 15H9l-1.4 2.9-.6.1c-3.9 0-7-3.1-7-7s3.1-7 7-7Z",
  matches: "M4 4h5v5H4V4Zm11 0h5v5h-5V4ZM4 15h5v5H4v-5Zm11 0h5v5h-5v-5ZM9 6.5h6M9 17.5h6M6.5 9v6M17.5 9v6",
  tournaments: "M7 3h10v2h2v2a4 4 0 0 1-4 4h-.2A5 5 0 0 1 13 13.9V17h3v2H8v-2h3v-3.1A5 5 0 0 1 9.2 11H9a4 4 0 0 1-4-4V5h2V3Zm-2 4a2 2 0 0 0 2 2 5 5 0 0 1-.8-3H5v1Zm14-1h-1.2a5 5 0 0 1-.8 3 2 2 0 0 0 2-2V6Z",
  arena: "M12 2 3 6v6c0 5 3.8 8.7 9 10 5.2-1.3 9-5 9-10V6l-9-4Zm0 2.2 7 3.1v4.7c0 3.9-2.9 6.9-7 8-4.1-1.1-7-4.1-7-8V7.3l7-3.1ZM9 12l2 2 4-4-1.4-1.4L11 11.2l-.6-.6L9 12Z",
  finance: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm.9 4.5v1.2c1.3.2 2.4 1 2.6 2.3h-1.8c-.1-.5-.6-.9-1.4-.9-1 0-1.5.4-1.5 1 0 .5.4.8 1.6 1.1 2 .5 3 1.2 3 2.8 0 1.4-1.1 2.3-2.5 2.6v1.2h-1.6v-1.2c-1.4-.2-2.5-1-2.7-2.5h1.8c.1.6.7 1 1.6 1s1.5-.4 1.5-1c0-.6-.5-.9-1.8-1.2-1.7-.4-2.8-1.1-2.8-2.7 0-1.4 1.1-2.2 2.4-2.5V6.5h1.6Z",
  deposits: "M12 3v11.2M7 9.7l5 5 5-5M5 17h14v4H5v-4Z",
  withdrawals: "M12 21V9.8M17 14.3l-5-5-5 5M5 3h14v4H5V3Z",
  risk: "M12 2 2 20h20L12 2Zm0 6v6m0 3.2h.01",
  fairplay: "M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Zm-1.1 12.3L7.8 11.1l1.4-1.4 1.7 1.7 4.1-4.1 1.4 1.4-5.5 5.6Z",
  support: "M12 2a8 8 0 0 0-8 8v5a2.5 2.5 0 0 0 2.5 2.5H8v-6H5v-1.5a7 7 0 0 1 14 0V16h-3v6h1.5A2.5 2.5 0 0 0 20 19.5v-5a8 8 0 0 0-8-8v-4Z",
  chat: "M4 4h16v11H8l-4 4V4Zm3 4h10M7 9.5h7",
  referrals: "M18 8a3 3 0 1 0-2.8-4H15a3 3 0 0 0-3 3v.2A5 5 0 0 0 8 6a3 3 0 1 0 0 6 4.9 4.9 0 0 0 2-.4v.4a5 5 0 0 0 4.8 5H16a3 3 0 1 0 2-5.2A3 3 0 0 0 15 14a3 3 0 0 0 .1.8A3 3 0 0 1 18 8Z",
  store: "M4 8 5 4h14l1 4M4 8v11h16V8M4 8h16M9 12a2 2 0 1 1-4 0M19 12a2 2 0 1 1-4 0M14 12a2 2 0 1 1-4 0",
  content: "M5 3h9l5 5v13H5V3Zm9 0v5h5M8 12h8M8 15.5h8M8 8.5h3",
  systemHealth: "M3 12h4l2-7 4 14 2-7h6",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.9 5.5-1.6 1 .2 1.9-1.7 1-1.6-1.1-1.8.7-.6 1.9h-2l-.6-1.9-1.8-.7-1.6 1.1-1.7-1 .2-1.9-1.6-1-.2-2 1.6-1-.2-1.9 1.7-1 1.6 1.1 1.8-.7.6-1.9h2l.6 1.9 1.8.7 1.6-1.1 1.7 1-.2 1.9 1.6 1 .2 2Z",
  rbac: "M8 11V7a4 4 0 1 1 8 0v4M5 11h14v10H5V11Zm7 4v3",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm10 17-5.6-5.6",
  bell: "M6 17h12l-1.4-2V10a4.6 4.6 0 0 0-9.2 0v5L6 17Zm4.5 3a1.5 1.5 0 0 0 3 0",
  chevronDown: "m6 9 6 6 6-6",
  customize: "M4 6h9M4 12h5M4 18h9M17 3v6M14 6h6M15 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  trendUp: "m4 16 5-6 4 4 7-9M14 4h6v6",
  trendDown: "m4 8 5 6 4-4 7 9M14 20h6v-6",
  menu: "M4 6h16M4 12h16M4 18h16",
};

export function AdminIcon({ name, size = 18, className }: { name: IconName; size?: number; className?: string | undefined }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export type { IconName };
