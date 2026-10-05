/**
 * The reusable, lightweight profile card -- built for reuse from chat,
 * leaderboards, match lobbies and spectator mode (none of which exist
 * yet), so it fetches only GET /v1/players/:id/preview, never the full
 * profile, and renders nothing but avatar/nickname/level/EXP/Global
 * Skill/selected badge. "View profile" is the one way deeper.
 */
"use client";

import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import { badgeIcon } from "./badge-icons";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import type { ProfilePreview as ProfilePreviewData } from "@/lib/profile-types";
import styles from "./ProfilePreview.module.css";

export function ProfilePreview({ playerId }: { playerId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<ProfilePreviewData | null>(null);

  useEffect(() => {
    let cancelled = false;
    void get<ProfilePreviewData>(`/v1/players/${playerId}/preview`).then((r) => { if (!cancelled) setData(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [playerId]);

  if (!data) return null;

  return (
    <LocaleLink href={`/players/${data.nickname}`} className={styles.card}>
      <Avatar nickname={data.nickname} avatarUrl={data.avatarUrl} size={48} />
      <div className={styles.info}>
        <div className={styles.nickname}>
          {data.nickname} {data.selectedBadge && <span className={styles.badge}>{badgeIcon(data.selectedBadge)}</span>}
        </div>
        <div className={styles.meta}>
          <span>{t("profile.level_label")} {data.level}</span>
          {data.globalSkill != null && <span>{t("profile.global_skill_label")} {data.globalSkill}</span>}
        </div>
        <div className={styles.link}>{t("profile.view_profile_cta")} →</div>
      </div>
    </LocaleLink>
  );
}
