"use client";

/**
 * PLAY WITH FRIEND, sending side: name an opponent (OpponentSelect) and
 * send a real challenge (POST /v1/challenges) -- Free or Competitive,
 * exactly like RANDOM OPPONENT -- then watch it live: the outgoing
 * challenge waiting on a reply, with its own real 30-second countdown.
 * Polls GET /v1/challenges on a fast 1-second cadence so that window
 * actually feels live -- there is no push channel for challenges (unlike a
 * live duel, which has one), so polling is the honest mechanism here, not
 * a placeholder for one.
 *
 * The RECEIVING side's popup is deliberately NOT rendered here: it is
 * IncomingChallengeWatcher, mounted once for the whole app (see the locale
 * layout), so a recipient sees it wherever they are, not only if they
 * happen to already be on the sender's own /play page for the same game.
 *
 * Accepting a sent challenge is the OTHER side's action (the outgoing list
 * here only ever offers Cancel); the resulting duel is handed to that
 * side's IncomingChallengeWatcher, which navigates into the SAME
 * /game/[duelId] route every other mode uses.
 */
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/Button";
import { get, post, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { OpponentSelect } from "./OpponentSelect";
import type { StakeChoice } from "./StakeSelect";
import styles from "./FriendChallenge.module.css";

type OutgoingRow = {
  id: string; game_id: string; created_at: string; expires_at: string;
  tier: "FREE" | "CASH"; stake_minor: string; asset: string | null;
  opponent_id: string; opponent_handle: string;
};

const ERROR_KEYS: Record<string, string> = {
  UNKNOWN_OPPONENT: "play.challenge.error_unknown_opponent",
  CANNOT_CHALLENGE_SELF: "play.challenge.error_self",
  ALREADY_PENDING: "play.challenge.error_already_pending",
  BLOCKED: "play.challenge.error_blocked",
  INVALID_STAKE: "play.challenge.error_invalid_stake",
};

export function FriendChallenge({ gameId, stake }: {
  gameId: string;
  stake?: StakeChoice;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [outgoing, setOutgoing] = useState<OutgoingRow[]>([]);

  const refresh = useCallback(async () => {
    try {
      const r = await get<{ outgoing: OutgoingRow[] }>("/v1/challenges");
      setOutgoing(r.outgoing.filter((c) => c.game_id === gameId));
    } catch {
      // A transient poll failure is not fatal -- the next tick retries.
    }
  }, [gameId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function sendChallenge(nickname: string) {
    setBusy(true);
    setError(null);
    try {
      await post("/v1/challenges", {
        gameId, opponentNickname: nickname,
        ...(stake?.tier === "CASH" ? { tier: "CASH", stakeMinor: stake.stakeMinor } : {}),
      });
      setSentTo(nickname);
      await refresh();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setError(code && ERROR_KEYS[code] ? t(ERROR_KEYS[code], { handle: nickname }) : t("play.challenge.error_generic"));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(challengeId: string) {
    await post(`/v1/challenges/${challengeId}/cancel`);
    await refresh();
  }

  return (
    <div>
      <h1 className={styles.heading}>{t("play.challenge.heading")}</h1>
      <OpponentSelect onSubmit={(nickname) => void sendChallenge(nickname)} busy={busy} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {sentTo && !error && <p className={styles.sent}>{t("play.challenge.sent", { handle: sentTo })}</p>}

      {outgoing.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("play.challenge.outgoing_heading")}</h2>
          <ul className={styles.list}>
            {outgoing.map((c) => (
              <li key={c.id} className={styles.row}>
                <span>
                  {t("play.challenge.waiting_for", { handle: c.opponent_handle })}
                  {c.tier === "CASH" && (
                    <span className={styles.stakeTag}>
                      {t("play.challenge.mode_competitive_stake", { amount: Number(BigInt(c.stake_minor) / 1_000_000n) })}
                    </span>
                  )}
                </span>
                <Button variant="ghost" onClick={() => void cancel(c.id)}>{t("play.challenge.cancel")}</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
