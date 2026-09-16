"use client";

/**
 * One tournament: register/withdraw, the real bracket (every pairing the
 * server has actually created, grouped by round -- never a fabricated
 * bracket shape for rounds that don't exist yet), and the actual
 * integration point with the rest of the Game Factory -- a live pairing's
 * duelId links straight into /game/[duelId], the SAME DuelShell every
 * other mode uses. Nothing here renders a board, a clock, or a result; a
 * tournament duel is an ordinary duel the moment it exists. Viewing is
 * public (the API is anonymous); only register/withdraw require login.
 */
import { use, useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { Button } from "@/components/Button";
import { get, post, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { formatDate } from "@/lib/i18n/format";
import { getGame } from "@/lib/games";
import styles from "./tournament-detail.module.css";

type TournamentDetail = {
  id: string; game_id: string; format: "SINGLE_ELIMINATION" | "SWISS"; status: string;
  tier: "FREE" | "RANKED" | "CASH"; entry_fee_minor: string; asset: string | null;
  capacity: number; registeredCount: number; title: string | null; description: string | null;
  eligibility: { minRatingX100?: number; maxRatingX100?: number } | null;
  scheduled_starts_at: string | null; starts_at: string | null;
  registered: boolean;
};
type Pairing = { round_number: number; slot: number; seat_0: string; seat_1: string | null; status: string; result: string | null; duel_id: string | null };
type Standing = { player_id: string; points: number; wins: number; losses: number; draws: number; rank: number | null };
type Preview = { nickname: string };

const REGISTER_ERROR_KEYS: Record<string, string> = {
  AT_CAPACITY: "tournamentsPage.error_at_capacity",
  NOT_OPEN: "tournamentsPage.error_not_open",
  ALREADY_REGISTERED: "tournamentsPage.error_already_registered",
  NOT_ELIGIBLE: "tournamentsPage.error_not_eligible",
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
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);

  const refresh = useCallback(async () => {
    try {
      const detail = await get<TournamentDetail>(`/v1/tournaments/${id}`);
      setTournament(detail);
      setRegistered(detail.registered);
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
    if (!player) {
      setWalletBalance(null);
      return;
    }
    void get<{ accounts: { key: string; balance: string; asset: string }[] }>(`/v1/players/${player.id}/wallet`)
      .then((r) => {
        const usdtAcc = r.accounts.find((a) => a.asset === "USDT" && a.key.endsWith(":available"));
        setWalletBalance(usdtAcc ? BigInt(usdtAcc.balance || 0) : 0n);
      })
      .catch(() => {
        setWalletBalance(0n);
      });
  }, [player]);

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
    setErrorCode(null);
    try {
      await post(`/v1/tournaments/${id}/register`);
      setRegistered(true);
      await refresh();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      const detail = e instanceof ApiError && typeof e.detail === "string" ? e.detail : undefined;
      setErrorCode(code ?? null);
      if (code === "ALREADY_REGISTERED") {
        setRegistered(true);
      } else if (code === "INSUFFICIENT_FUNDS") {
        setError(detail || t("tournamentsPage.error_insufficient_funds"));
      } else if (code && REGISTER_ERROR_KEYS[code]) {
        setError(t(REGISTER_ERROR_KEYS[code]));
      } else {
        setError(detail || (e instanceof Error && e.message !== code ? e.message : t("tournamentsPage.error_generic")));
      }
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
      <>
        <Header />
        <main className="nz-container"><p>{t("tournamentsPage.not_found")}</p></main>
      </>
    );
  }
  if (!tournament) {
    return <><Header /><main className="nz-container" /></>;
  }

  const nameKey = getGame(tournament.game_id)?.nameKey ?? tournament.game_id;
  const startTarget = tournament.scheduled_starts_at ?? tournament.starts_at;
  const myLivePairing = player
    ? pairings.find((p) => (p.seat_0 === player.id || p.seat_1 === player.id) && p.status === "LIVE" && p.duel_id)
    : undefined;

  const rounds = new Map<number, Pairing[]>();
  for (const p of pairings) {
    if (!rounds.has(p.round_number)) rounds.set(p.round_number, []);
    rounds.get(p.round_number)!.push(p);
  }
  const roundNumbers = [...rounds.keys()].sort((a, b) => a - b);

  return (
    <>
      <Header />
      <main className="nz-container">
        <LocaleLink href="/tournaments" className={styles.back}>{t("tournamentsPage.back")}</LocaleLink>
        <div className={styles.headingRow}>
          <span className={styles.gameName}>{t(`common.game_names.${nameKey}`)}</span>
          <span className={`${styles.statusPill} ${styles[`status_${tournament.status}`] ?? ""}`}>
            {t(`tournamentsPage.status.${tournament.status}`)}
          </span>
        </div>
        <h1 className={styles.heading}>{tournament.title ?? t(`tournamentsPage.format.${tournament.format}`)}</h1>
        {tournament.description && <p className={styles.description}>{tournament.description}</p>}

        <div className={styles.metaRow}>
          <span>{t(`tournamentsPage.format.${tournament.format}`)}</span>
          <span>
            {tournament.tier === "FREE"
              ? t("tournamentsPage.entry_free")
              : `Entry: ${(Number(tournament.entry_fee_minor) / 1_000_000).toFixed(2)} ${tournament.asset ?? "USDT"}`}
          </span>
          {tournament.tier === "CASH" ? (
            <>
              <span style={{ color: "#10b981", fontWeight: 700 }}>
                Winner Pool (90%): ${((Number(tournament.entry_fee_minor || 0) / 1_000_000) * tournament.capacity * 0.90).toFixed(2)} USDT
              </span>
              <span style={{ color: "#818cf8" }}>
                Platform Fee (10%): ${((Number(tournament.entry_fee_minor || 0) / 1_000_000) * tournament.capacity * 0.10).toFixed(2)} USDT
              </span>
            </>
          ) : (
            <span style={{ color: "#10b981", fontWeight: 600 }}>
              🏆 Prove Skill & Climb Rankings
            </span>
          )}
          <span className="nz-num">{t("tournamentsPage.registered_count", { count: tournament.registeredCount, capacity: tournament.capacity })}</span>
          {startTarget && <span>{t("tournamentsPage.starts_at", { date: formatDate(startTarget, locale) })}</span>}
        </div>

        {myLivePairing?.duel_id && (
          <LocaleLink href={`/game/${myLivePairing.duel_id}`} className={styles.yourMatch}>
            {t("tournamentsPage.your_match")}
          </LocaleLink>
        )}

        {tournament.status === "REGISTRATION" && (
          <div className={styles.actions}>
            {player && tournament.tier === "CASH" && walletBalance !== null && (
              <div style={{
                background: walletBalance < BigInt(tournament.entry_fee_minor || 0) ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.08)",
                border: `1px solid ${walletBalance < BigInt(tournament.entry_fee_minor || 0) ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
                borderRadius: "8px",
                padding: "10px 16px",
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                justifyContent: "space-between",
                flexWrap: "wrap",
                width: "100%",
                maxWidth: "600px"
              }}>
                <span>
                  Wallet Balance: <strong>${(Number(walletBalance) / 1_000_000).toFixed(2)} USDT</strong>
                  {walletBalance < BigInt(tournament.entry_fee_minor || 0) && (
                    <span style={{ color: "#f87171", marginLeft: "6px" }}>
                      (Entry requires ${(Number(tournament.entry_fee_minor) / 1_000_000).toFixed(2)} USDT)
                    </span>
                  )}
                </span>
                {walletBalance < BigInt(tournament.entry_fee_minor || 0) && (
                  <LocaleLink href="/wallet">
                    <Button variant="primary">💳 {t("tournamentsPage.deposit_cta")}</Button>
                  </LocaleLink>
                )}
              </div>
            )}

            {!player ? (
              <LocaleLink href="/login"><Button variant="primary">{t("tournamentsPage.login_to_register")}</Button></LocaleLink>
            ) : registered ? (
              <Button variant="secondary" onClick={() => void withdraw()} disabled={busy}>{t("tournamentsPage.withdraw")}</Button>
            ) : (
              <Button variant="primary" onClick={() => void register()} disabled={busy}>
                {busy ? t("tournamentsPage.registering") : t("tournamentsPage.register")}
              </Button>
            )}
            {registered && !error && <span className={styles.registeredNote}>{t("tournamentsPage.registered")}</span>}
            {error && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", width: "100%", maxWidth: "600px" }}>
                <p className={styles.error} role="alert" style={{ width: "100%", textAlign: "center" }}>{error}</p>
                {errorCode === "INSUFFICIENT_FUNDS" && (
                  <LocaleLink href="/wallet">
                    <Button variant="primary">
                      💳 {t("tournamentsPage.deposit_cta")}
                    </Button>
                  </LocaleLink>
                )}
              </div>
            )}
          </div>
        )}

        {roundNumbers.length > 0 && (
          <section className={styles.bracket}>
            <h2 className={styles.sectionHeading}>{t("tournamentsPage.pairings_heading")}</h2>
            {roundNumbers.map((rn) => (
              <div key={rn} className={styles.round}>
                <h3 className={styles.roundLabel}>{t("tournamentsPage.round_label", { number: rn })}</h3>
                <div className={styles.pairingList}>
                  {rounds.get(rn)!.map((p) => (
                    <div key={`${rn}-${p.slot}`} className={styles.pairingRow}>
                      <span className={styles.pairingPlayers}>
                        <span>{previews[p.seat_0]?.nickname ?? p.seat_0}</span>
                        <span className={styles.pairingVs}>{t("watch.vs")}</span>
                        <span>{p.seat_1 ? (previews[p.seat_1]?.nickname ?? p.seat_1) : t("tournamentsPage.bye")}</span>
                      </span>
                      {p.status === "LIVE" && p.duel_id ? (
                        <LocaleLink href={`/game/${p.duel_id}`} className={styles.watchLink}>{t("watch.watch_cta")}</LocaleLink>
                      ) : (
                        <span className={styles.pairingResult}>{p.result ?? t(`tournamentsPage.status.${p.status}`)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {standings.length > 0 && (
          <section className={styles.standings}>
            <h2 className={styles.standingsHeading}>{t("tournamentsPage.standings_heading")}</h2>
            <div className={styles.tableWrap}>
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
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
