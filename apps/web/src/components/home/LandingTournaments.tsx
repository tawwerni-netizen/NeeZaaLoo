"use client";

import { useI18n } from "@/lib/i18n/context";
import { UpcomingTournaments } from "@/components/tournaments/UpcomingTournaments";

const TOURNAMENT_BANNERS = [
  {
    img: "/images/tournaments/tournament-blitz-masters.jpg",
    tag: "⚡ Live Esports Stage",
    title: "Blitz Masters Arena",
    desc: "Fast-paced knockout brackets with real-time spectator streaming and instant results.",
  },
  {
    img: "/images/tournaments/tournament-weekend-knockout.jpg",
    tag: "🏆 Weekend Cup",
    title: "Weekend Knockout Championship",
    desc: "Multi-round Swiss & Single Elimination matches with grand finals.",
  },
  {
    img: "/images/tournaments/tournament-speed-battle.jpg",
    tag: "⏱️ Bullet & Blitz",
    title: "Speed Battle Arena",
    desc: "Ultra-fast turns with zero delay: pure reflexes and sharp mental strategy.",
  },
  {
    img: "/images/tournaments/tournament-midnight-flash.jpg",
    tag: "🌙 Night Arena",
    title: "Midnight Flash Showdown",
    desc: "Night-owl competitive brackets for global masters across all timezones.",
  },
  {
    img: "/images/tournaments/tournament-pro-bracket.jpg",
    tag: "👑 Pro Circuit",
    title: "Pro League Final Bracket",
    desc: "Top ranked seeds clashing for verified leaderboard dominance.",
  },
];

export function LandingTournaments() {
  const { t } = useI18n();
  return (
    <UpcomingTournaments
      heading={t("home.tournaments.heading")}
      emptyText={t("home.tournaments.empty")}
      viewAllHref="/tournaments"
      viewAllText={t("home.tournaments.view_all")}
      limit={4}
      banners={TOURNAMENT_BANNERS}
    />
  );
}
