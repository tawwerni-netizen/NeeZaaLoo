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
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/profile/Avatar";
import { badgeIcon } from "@/components/profile/badge-icons";
import { get } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import styles from "./PlayerStrip.module.css";

type Preview = {
  id: string; nickname: string; avatarUrl: string | null;
  level: number; exp: number; selectedBadge: string | null; globalSkill: number | null;
};

function getBotDifficulty(id: string): string | null {
  if (id.startsWith("ai-easy")) return "EASY";
  if (id.startsWith("ai-medium")) return "MEDIUM";
  if (id.startsWith("ai-hard")) return "HARD";
  if (id.startsWith("ai-expert")) return "EXPERT";
  return null;
}

/**
 * Client-side clock interpolation:
 * Decrements locally when active === true so the player sees a real live countdown
 * instead of a frozen number waiting for the next turn packet.
 */
function useInterpolatedClock(serverRemainingMs: number | null, active: boolean): number | null {
  const [displayMs, setDisplayMs] = useState<number | null>(serverRemainingMs);
  const baselineRef = useRef<{ serverMs: number; clientTimestamp: number } | null>(null);

  useEffect(() => {
    if (serverRemainingMs === null) {
      setDisplayMs(null);
      baselineRef.current = null;
      return;
    }
    baselineRef.current = {
      serverMs: serverRemainingMs,
      clientTimestamp: Date.now(),
    };
    setDisplayMs(serverRemainingMs);
  }, [serverRemainingMs]);

  useEffect(() => {
    if (!active || serverRemainingMs === null) {
      return;
    }

    const interval = setInterval(() => {
      if (!baselineRef.current) return;
      const elapsed = Date.now() - baselineRef.current.clientTimestamp;
      const current = Math.max(0, baselineRef.current.serverMs - elapsed);
      setDisplayMs(current);
    }, 100);

    return () => clearInterval(interval);
  }, [active, serverRemainingMs]);

  return displayMs;
}

export function PlayerStrip({
  playerId, active, remainingMs, flagged, disconnected, reverse = false,
}: {
  playerId: string;
  active: boolean;
  remainingMs: number | null;
  flagged: boolean;
  disconnected?: boolean;
  reverse?: boolean;
}) {
  const { t } = useI18n();
  const botDiff = getBotDifficulty(playerId);
  const isVsComputer = botDiff !== null;
  const [preview, setPreview] = useState<Preview | null>(null);
  const currentRemainingMs = useInterpolatedClock(remainingMs, active);

  useEffect(() => {
    if (isVsComputer) return;
    let cancelled = false;
    void get<Preview>(`/v1/players/by-id/${encodeURIComponent(playerId)}/preview`)
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [playerId, isVsComputer]);

  const nickname = isVsComputer
    ? `${t("game.vs_computer_name")} (${t(`game.difficulty.${botDiff}`)})`
    : preview?.nickname ?? "…";
  const avatarUrl = preview?.avatarUrl ?? null;

  const isFlagged = flagged || (currentRemainingMs !== null && currentRemainingMs <= 0);

  return (
    <div className={[styles.strip, active ? styles.active : "", reverse ? styles.reverse : ""].join(" ")}>
      <Avatar nickname={nickname} avatarUrl={avatarUrl} size={40} rating={preview?.globalSkill ?? null} />
      <div className={styles.info}>
        <div className={styles.nameRow}>
          <span className={styles.nickname}>{nickname}</span>
          {preview?.selectedBadge && <span aria-hidden="true">{badgeIcon(preview.selectedBadge)}</span>}
        </div>
        {!isVsComputer && preview && (
          <div className={styles.meta}>
            {preview.globalSkill != null && <span className="nz-num">{t("profile.global_skill_label")} {preview.globalSkill}</span>}
          </div>
        )}
        {disconnected && <div className={styles.disconnected}>{t("game.opponent_disconnected")}</div>}
      </div>
      {currentRemainingMs !== null && (
        <div className={[
          "nz-num", "nz-clock", styles.clock,
          isFlagged ? styles.flagged : currentRemainingMs < 10_000 ? styles.critical : currentRemainingMs < 30_000 ? styles.low : "",
        ].join(" ")}
        >
          {formatClock(currentRemainingMs)}
        </div>
      )}
    </div>
  );
}

function formatClock(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0 && s < 10) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `0:0${s}.${tenths}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

