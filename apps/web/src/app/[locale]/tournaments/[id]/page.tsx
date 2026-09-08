"use client";

/**
 * One tournament: register/withdraw, and -- the actual integration point
 * with the rest of the Game Factory -- a live pairing's duelId links
 * straight into /game/[duelId], the SAME DuelShell every other mode uses.
 * Nothing here renders a board, a clock, or a result; a tournament duel is
 * an ordinary duel the moment it exists.
 */
import { use, useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { LocaleLink } from "@/components/LocaleLink";
import { Button } from "@/components/Button";
import { get, post, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { formatDate } from "@/lib/i18n/format";
import styles from "./tournament-detail.module.css";

type TournamentDetail = {
  id: string; game_id: string; format: "SINGLE_ELIMINATION" | "SWISS"; status: string;
  tier: "FREE" | "RANKED" | "CASH"; entry_fee_minor: string; asset: string | null;
  capacity: number; registeredCount: number; starts_at: string | null;
};
type Pairing = { round_number: number; slot: number; seat_0: string; seat_1: string | null; status: string; result: string | null; duel_id: string | null };
type Standing = { player_id: string; points: number; wins: number; losses: number; draws: number; rank: number | null };
type Preview = { nickname: string };

const GAME_NAME_KEY: Record<string, string> = { chess: "chess", "speed-math": "speed_math" };
const REGISTER_ERROR_KEYS: Record<string, string> = {
  AT_CAPACITY: "tournamentsPage.error_at_capacity",
  NOT_OPEN: "tournamentsPage.error_not_open",
  ALREADY_REGISTERED: "tournamentsPage.error_already_registered",
};

export default function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const { player } = useAuth();
  const [tournament, setTournament] = useState<TournamentDetail | null | "not_found">(null);
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const detail = await get<TournamentDetail>(`/v1/tournaments/${id}`);
      setTournament(detail);
      const [pairingRes, standingRes] = await Promise.all([
        get<{ pairings: Pairing[] }>(`/v1/tournaments/${id}/pairings`),
        get<{ standings: Standing[] }>(`/v1/tournaments/${id}/standings`).catch(() => ({ standings: [] })),
      ]);
      setPairings(pairingRes.pairings);
      setStandings(standingRes.standings);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setTournament("not_found");
    }
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const ids = new Set<string>();
    for (const s of standings) ids.add(s.player_id);
    for (const p of pairings) { ids.add(p.seat_0); if (p.seat_1) ids.add(p.seat_1); }
    const missing = [...ids].filter((pid) => !(pid in previews));
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(missing.map((pid) => get<Preview>(`/v1/players/by-id/${encodeURIComponent(pid)}/preview`).then((p) => [pid, p] as const).catch(() => null)))
      .then((rows) => {
        if (cancelled) return;
        setPreviews((prev) => {
          const next = { ...prev };
          for (const row of rows) if (row) next[row[0]] = row[1];
          return next;
        });
      });
    return () => { cancelled = true; };
  }, [standings, pairings, previews]);

  async function register() {
    setBusy(true);
    setError(null);
    try {
      await post(`/v1/tournaments/${id}/register`);
      setRegistered(true);
      await refresh();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === "ALREADY_REGISTERED") setRegistered(true);
      setError(code && REGISTER_ERROR_KEYS[code] ? t(REGISTER_ERROR_KEYS[code]) : t("tournamentsPage.error_generic"));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    try {
      await post(`/v1/tournaments/${id}/withdraw`);
      setRegistered(false);
      await refresh();
    } catch {
      setError(t("tournamentsPage.error_generic"));
    } finally {
      setBusy(false);
    }
  }

  if (tournament === "not_found") {
    return (
      <RequireAuth>
        <Header />
        <main className="nz-container"><p>{t("tournamentsPage.not_found")}</p></main>
      </RequireAuth>
    );
  }
  if (!tournament) {
    return <RequireAuth><Header /><main className="nz-container" /></RequireAuth>;
  }

  const myLivePairing = player
    ? pairings.find((p) => (p.seat_0 === player.id || p.seat_1 === player.id) && p.status === "LIVE" && p.duel_id)
    : undefined;

  return (
    <RequireAuth>
      <Header />
      <main className="nz-container">
        <LocaleLink href="/tournaments" className={styles.back}>{t("tournamentsPage.back")}</LocaleLink>
        <h1 className={styles.heading}>{t(`common.game_names.${GAME_NAME_KEY[tournament.game_id] ?? tournament.game_id}`)}</h1>
        <div className={styles.metaRow}>
          <span>{t(`tournamentsPage.format.${tournament.format}`)}</span>
          <span>{t(`tournamentsPage.status.${tournament.status}`)}</span>
          <span>{tournament.tier === "FREE" ? t("tournamentsPage.entry_free") : t("tournamentsPage.entry_fee", { amount: Number(tournament.entry_fee_minor) / 100, asset: tournament.asset ?? "" })}</span>
          <span>{t("tournamentsPage.registered_count", { count: tournament.registeredCount, capacity: tournament.capacity })}</span>
          {tournament.starts_at && <span>{t("tournamentsPage.starts_at", { date: formatDate(tournament.starts_at, locale) })}</span>}
        </div>

        {myLivePairing?.duel_id && (
          <LocaleLink href={`/game/${myLivePairing.duel_id}`} className={styles.yourMatch}>
            {t("tournamentsPage.your_match")}
          </LocaleLink>
        )}

        {tournament.status === "REGISTRATION_OPEN" && (
          <div className={styles.actions}>
            {registered ? (
              <Button variant="secondary" onClick={() => void withdraw()} disabled={busy}>{t("tournamentsPage.withdraw")}</Button>
            ) : (
              <Button variant="primary" onClick={() => void register()} disabled={busy}>
                {busy ? t("tournamentsPage.registering") : t("tournamentsPage.register")}
              </Button>
            )}
            {registered && !error && <span className={styles.registeredNote}>{t("tournamentsPage.registered")}</span>}
            {error && <p className={styles.error} role="alert">{error}</p>}
          </div>
        )}

        {standings.length > 0 && (
          <section className={styles.standings}>
            <h2 className={styles.standingsHeading}>{t("tournamentsPage.standings_heading")}</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("tournamentsPage.standings_rank")}</th>
                  <th>{t("tournamentsPage.standings_player")}</th>
                  <th>{t("tournamentsPage.standings_points")}</th>
                  <th>{t("tournamentsPage.standings_record")}</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => (
                  <tr key={s.player_id}>
                    <td>{s.rank ?? "—"}</td>
                    <td>{previews[s.player_id]?.nickname ?? s.player_id}</td>
                    <td className="nz-num">{s.points}</td>
                    <td className="nz-num">{s.wins}-{s.losses}-{s.draws}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </RequireAuth>
  );
}
