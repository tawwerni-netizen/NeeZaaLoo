"use client";

import { useI18n } from "@/lib/i18n/context";
import { UpcomingTournaments } from "@/components/tournaments/UpcomingTournaments";

export function LandingTournaments() {
  const { t } = useI18n();
  return (
    <UpcomingTournaments
      heading={t("home.tournaments.heading")}
      emptyText={t("home.tournaments.empty")}
      viewAllHref="/tournaments"
      viewAllText={t("home.tournaments.view_all")}
      limit={4}
    />
  );
}
