"use client";

/**
 * Avatar / nickname / badge / rating for one seat, plus that seat's clock.
 *
 * Resolves identity through GET /v1/players/by-id/:id/preview -- the BY-ID
 * sibling of the existing nickname-shaped preview route -- because
 * `playerId` here always comes from the duel's own `players` array
 * (STATE/EVENT over the socket), which is a player's permanent id, never
 * their current handle. Using the nickname-shaped route would silently
 * break for any opponent who has ever renamed since registration.
 */
import { useEffect, useState } from "react";
import { Avatar } from "@/components/profile/Avatar";
import { badgeIcon } from "@/components/profile/badge-icons";
import { get } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import styles from "./PlayerStrip.module.css";

type Preview = {
  id: string; nickname: string; avatarUrl: string | null;
  level: number; exp: number; selectedBadge: string | null; globalSkill: number | null;
};

const BOT_DIFFICULTY: Record<string, string> = {
  "ai-easy": "EASY", "ai-medium": "MEDIUM", "ai-hard": "HARD", "ai-expert": "EXPERT",
};

export function PlayerStrip({
  playerId, active, remainingMs, flagged, disconnected,
}: {
  playerId: string;
  active: boolean;
  remainingMs: number | null;
  flagged: boolean;
  disconnected?: boolean;
}) {
  const { t } = useI18n();
  const isBot = playerId in BOT_DIFFICULTY;
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (isBot) return;
    let cancelled = false;
    void get<Preview>(`/v1/players/by-id/${encodeURIComponent(playerId)}/preview`)
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [playerId, isBot]);

  const nickname = isBot ? t(`game.difficulty.${BOT_DIFFICULTY[playerId]}`) : preview?.nickname ?? "…";
  const avatarUrl = preview?.avatarUrl ?? null;

  return (
    <div className={[styles.strip, active ? styles.active : ""].join(" ")}>
      <Avatar nickname={nickname} avatarUrl={avatarUrl} size={40} />
      <div className={styles.info}>
        <div className={styles.nameRow}>
          <span className={styles.nickname}>{isBot ? `♞ ${nickname}` : nickname}</span>
          {preview?.selectedBadge && <span aria-hidden="true">{badgeIcon(preview.selectedBadge)}</span>}
        </div>
        {!isBot && preview && (
          <div className={styles.meta}>
            {preview.globalSkill != null && <span className="nz-num">{t("profile.global_skill_label")} {preview.globalSkill}</span>}
          </div>
        )}
        {disconnected && <div className={styles.disconnected}>{t("game.opponent_disconnected")}</div>}
      </div>
      {remainingMs !== null && (
        <div className={[
          "nz-num", "nz-clock", styles.clock,
          flagged ? styles.flagged : remainingMs < 10_000 ? styles.critical : remainingMs < 30_000 ? styles.low : "",
        ].join(" ")}
        >
          {formatClock(remainingMs)}
        </div>
      )}
    </div>
  );
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
