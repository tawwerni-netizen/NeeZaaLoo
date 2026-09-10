"use client";

/**
 * The elegant popup a recipient sees for an incoming PLAY WITH FRIEND
 * challenge: avatar, nickname, game, mode, stake when applicable, and a
 * live countdown against the challenge's own real 30-second expiry --
 * never a decorative timer running on its own clock. Shows nothing beyond
 * the stake amount itself -- no balance, no wallet detail, nothing the
 * brief calls "sensitive financial information."
 *
 * ACCEPT/DECLINE call straight through to the same challenge routes the
 * outgoing list already used; a challenge that expires while this is open
 * (the countdown hits zero) calls onExpired so the caller can drop it from
 * the incoming list without waiting for the next poll.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/profile/Avatar";
import { get, post } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import styles from "./ChallengePopup.module.css";

const GAME_NAME_KEY: Record<string, string> = {
  chess: "chess", checkers: "checkers", "connect-four": "connect_four",
  xo: "xo", "speed-math": "speed_math", dominoes: "dominoes",
  backgammon: "backgammon", seega: "seega", reversi: "reversi", gomoku: "gomoku",
};

export type IncomingChallenge = {
  id: string; game_id: string; created_at: string; expires_at: string;
  tier: "FREE" | "CASH"; stake_minor: string; asset: string | null;
  challenger_id: string; challenger_handle: string;
};

export function ChallengePopup({ challenge, onAccepted, onDeclined, onExpired }: {
  challenge: IncomingChallenge;
  onAccepted: (duelId: string) => void;
  onDeclined: () => void;
  onExpired: () => void;
}) {
  const { t } = useI18n();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(() => new Date(challenge.expires_at).getTime() - Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void get<{ avatarUrl: string | null }>(`/v1/players/by-id/${encodeURIComponent(challenge.challenger_id)}/preview`)
      .then((r) => { if (!cancelled) setAvatarUrl(r.avatarUrl); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [challenge.challenger_id]);

  useEffect(() => {
    const timer = setInterval(() => {
      const left = new Date(challenge.expires_at).getTime() - Date.now();
      setRemainingMs(left);
      if (left <= 0) { clearInterval(timer); onExpired(); }
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge.expires_at]);

  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));
  const gameName = t(`common.game_names.${GAME_NAME_KEY[challenge.game_id] ?? challenge.game_id}`);
  const stakeLabel = useMemo(() => {
    if (challenge.tier !== "CASH") return t("play.challenge.mode_free");
    const usd = Number(BigInt(challenge.stake_minor) / 1_000_000n);
    return t("play.challenge.mode_competitive_stake", { amount: usd });
  }, [challenge.tier, challenge.stake_minor, t]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ duelId: string }>(`/v1/challenges/${challenge.id}/accept`);
      onAccepted(r.duelId);
    } catch {
      setError(t("play.challenge.error_generic"));
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    setError(null);
    try {
      await post(`/v1/challenges/${challenge.id}/decline`);
      onDeclined();
    } catch {
      setError(t("play.challenge.error_generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-label={t("play.challenge.popup_title", { handle: challenge.challenger_handle })}>
      <div className={styles.card}>
        <div className={styles.timerRing} style={{ "--progress": `${(secondsLeft / 30) * 100}%` } as React.CSSProperties}>
          <span className={styles.timerNumber}>{secondsLeft}</span>
        </div>

        <Avatar nickname={challenge.challenger_handle} avatarUrl={avatarUrl} size={64} />
        <h2 className={styles.title}>{t("play.challenge.popup_title", { handle: challenge.challenger_handle })}</h2>

        <dl className={styles.meta}>
          <div><dt>{t("play.challenge.meta_game")}</dt><dd>{gameName}</dd></div>
          <div><dt>{t("play.challenge.meta_mode")}</dt><dd>{stakeLabel}</dd></div>
        </dl>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.actions}>
          <Button variant="primary" disabled={busy} onClick={() => void accept()}>{t("play.challenge.accept")}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void decline()}>{t("play.challenge.decline")}</Button>
        </div>
      </div>
    </div>
  );
}
