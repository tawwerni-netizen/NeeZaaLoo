"use client";

/**
 * PLAY WITH FRIEND, end to end: name an opponent (OpponentSelect), send a
 * real challenge (POST /v1/challenges), and watch it live -- both the
 * outgoing challenge waiting on a reply, and any incoming ones this player
 * can accept. Polls the same GET /v1/challenges an incoming-side player
 * would use; there is no push channel for challenges (unlike a live duel,
 * which has one), so polling is the honest mechanism here, not a
 * placeholder for one.
 *
 * Accepting a challenge -- theirs or the one this player just sent -- hands
 * a real duelId to onDuelReady, which navigates into the SAME /game/[duelId]
 * route every other mode uses. Nothing here knows how a duel is played.
 */
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/Button";
import { get, post, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { OpponentSelect } from "./OpponentSelect";
import styles from "./FriendChallenge.module.css";

type ChallengeRow = { id: string; game_id: string; created_at: string; expires_at: string };
type IncomingRow = ChallengeRow & { challenger_handle: string };
type OutgoingRow = ChallengeRow & { opponent_handle: string };

const ERROR_KEYS: Record<string, string> = {
  UNKNOWN_OPPONENT: "play.challenge.error_unknown_opponent",
  CANNOT_CHALLENGE_SELF: "play.challenge.error_self",
  ALREADY_PENDING: "play.challenge.error_already_pending",
};

export function FriendChallenge({ gameId, onDuelReady }: {
  gameId: string;
  onDuelReady: (duelId: string) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingRow[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingRow[]>([]);

  const refresh = useCallback(async () => {
    try {
      const r = await get<{ incoming: IncomingRow[]; outgoing: OutgoingRow[] }>("/v1/challenges");
      setIncoming(r.incoming.filter((c) => c.game_id === gameId));
      setOutgoing(r.outgoing.filter((c) => c.game_id === gameId));
    } catch {
      // A transient poll failure is not fatal -- the next tick retries.
    }
  }, [gameId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function sendChallenge(nickname: string) {
    setBusy(true);
    setError(null);
    try {
      await post("/v1/challenges", { gameId, opponentNickname: nickname });
      setSentTo(nickname);
      await refresh();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setError(code && ERROR_KEYS[code] ? t(ERROR_KEYS[code], { handle: nickname }) : t("play.challenge.error_generic"));
    } finally {
      setBusy(false);
    }
  }

  async function accept(challengeId: string) {
    const r = await post<{ duelId: string }>(`/v1/challenges/${challengeId}/accept`);
    onDuelReady(r.duelId);
  }

  async function decline(challengeId: string) {
    await post(`/v1/challenges/${challengeId}/decline`);
    await refresh();
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

      {incoming.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("play.challenge.incoming_heading")}</h2>
          <ul className={styles.list}>
            {incoming.map((c) => (
              <li key={c.id} className={styles.row}>
                <span>{t("play.challenge.from", { handle: c.challenger_handle })}</span>
                <span className={styles.actions}>
                  <Button variant="primary" onClick={() => void accept(c.id)}>{t("play.challenge.accept")}</Button>
                  <Button variant="ghost" onClick={() => void decline(c.id)}>{t("play.challenge.decline")}</Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("play.challenge.outgoing_heading")}</h2>
          <ul className={styles.list}>
            {outgoing.map((c) => (
              <li key={c.id} className={styles.row}>
                <span>{t("play.challenge.waiting_for", { handle: c.opponent_handle })}</span>
                <Button variant="ghost" onClick={() => void cancel(c.id)}>{t("play.challenge.cancel")}</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
