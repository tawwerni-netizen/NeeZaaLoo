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
import { formatTournamentTitle, formatTournamentDescription, getTournamentCover } from "@/components/tournaments/UpcomingTournaments";
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

  const gameName = t(`common.game_names.${nameKey}`) || tournament.game_id;
  const cleanTitle = formatTournamentTitle(tournament, gameName, locale);
  const cleanDesc = formatTournamentDescription(tournament, locale);
  const coverImg = getTournamentCover(tournament.game_id);
  const entryFeeUsdt = (Number(tournament.entry_fee_minor || 0) / 1_000_000).toFixed(2);
  const winnerPoolUsdt = ((Number(tournament.entry_fee_minor || 0) / 1_000_000) * tournament.capacity * 0.90).toFixed(2);
  const platformFeeUsdt = ((Number(tournament.entry_fee_minor || 0) / 1_000_000) * tournament.capacity * 0.10).toFixed(2);
  const remainingSpots = Math.max(0, tournament.capacity - (tournament.registeredCount || 0));
  const registeredPct = Math.min(100, Math.round(((tournament.registeredCount || 0) / (tournament.capacity || 1)) * 100));

  return (
    <>
      <Header />
      <main className="nz-container">
        <LocaleLink href="/tournaments" className={styles.back}>
          {t("tournamentsPage.back")}
        </LocaleLink>

        {/* Esports Championship Hero Banner Card */}
        <div className={styles.heroCard}>
          <div className={styles.bannerWrap}>
            <img
              src={coverImg}
              alt={cleanTitle}
              className={styles.bannerImg}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/images/games/chess-hero.webp";
              }}
            />
            <div className={styles.bannerOverlay} />
            <div className={styles.topBadgesRow}>
              <span className={styles.gameBadge}>
                <span>🎮</span>
                <span>{gameName}</span>
              </span>
              <span className={styles.formatBadge}>
                <span>🏆</span>
                <span>
                  {t(`tournamentsPage.format.${tournament.format}`)} ({tournament.capacity} {locale === "ar" ? "لاعب" : "p"})
                </span>
              </span>
              <span className={`${styles.statusPill} ${styles[`status_${tournament.status}`] ?? ""}`}>
                {tournament.status === "LIVE" && <span className={styles.liveDot} />}
                {t(`tournamentsPage.status.${tournament.status}`)}
              </span>
            </div>
          </div>

          <div className={styles.heroContent}>
            <h1 className={styles.heading}>{cleanTitle}</h1>
            <p className={styles.description}>{cleanDesc}</p>

            {/* Metrics HUD Row */}
            <div className={styles.metricsGrid}>
              {tournament.tier === "CASH" ? (
                <>
                  <div className={`${styles.metricCard} ${styles.metricGold}`}>
                    <span className={styles.metricLabel}>💰 {locale === "ar" ? "مجموع جوائز الفائز (90%)" : "Winner Pool (90%)"}</span>
                    <span className={`${styles.metricVal} nz-num`}><bdi>${winnerPoolUsdt} USDT</bdi></span>
                    <span className={styles.metricSub}>{locale === "ar" ? "تسوية كاش فورية للمحفظة" : "Instant settlement"}</span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>🎟️ {locale === "ar" ? "رسوم الاشتراك" : "Entry Fee"}</span>
                    <span className={`${styles.metricVal} nz-num`}><bdi>${entryFeeUsdt} USDT</bdi></span>
                    <span className={styles.metricSub}>{t("tournamentsPage.platform_fee", { amount: platformFeeUsdt, asset: "USDT" })}</span>
                  </div>
                </>
              ) : (
                <div className={`${styles.metricCard} ${styles.metricFree}`}>
                  <span className={styles.metricLabel}>🎁 {t("tournamentsPage.entry_free")}</span>
                  <span className={styles.metricVal}>{t("tournamentsPage.entry_free")}</span>
                  <span className={styles.metricSub}>{t("tournamentsPage.prove_skill")}</span>
                </div>
              )}

              <div className={styles.metricCard}>
                <div className={styles.metricLabelRow}>
                  <span className={styles.metricLabel}>👥 {t("tournamentsPage.registered_count", { count: tournament.registeredCount, capacity: tournament.capacity })}</span>
                  {tournament.status === "REGISTRATION" && remainingSpots > 0 && (
                    <span className={styles.spotsBadge}>
                      {locale === "ar" ? `متبقي ${remainingSpots} مقاعد` : `${remainingSpots} spots left`}
                    </span>
                  )}
                </div>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${registeredPct}%` }} />
                </div>
                <span className={styles.metricSub}>
                  {startTarget ? t("tournamentsPage.starts_at", { date: formatDate(startTarget, locale) }) : (locale === "ar" ? "تبدأ عند اكتمال العدد" : "Starts when filled")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {myLivePairing?.duel_id && (
          <LocaleLink href={`/game/${myLivePairing.duel_id}`} className={styles.yourMatch}>
            {t("tournamentsPage.your_match")}
          </LocaleLink>
        )}

        {tournament.status === "REGISTRATION" && (
          <div className={styles.actions}>
            {player && tournament.tier === "CASH" && walletBalance !== null && (
              <div className={`${styles.walletNotice} ${walletBalance < BigInt(tournament.entry_fee_minor || 0) ? styles.walletNoticeLow : styles.walletNoticeOk}`}>
                <div className={styles.walletNoticeText}>
                  <span>{t("tournamentsPage.wallet_balance_label")} <strong className="nz-num">${(Number(walletBalance) / 1_000_000).toFixed(2)} USDT</strong></span>
                  {walletBalance < BigInt(tournament.entry_fee_minor || 0) && (
                    <span className={styles.entryRequires}>
                      {t("tournamentsPage.entry_requires", {
                        amount: entryFeeUsdt,
                        asset: "USDT"
                      })}
                    </span>
                  )}
                </div>
                {walletBalance < BigInt(tournament.entry_fee_minor || 0) && (
                  <LocaleLink href="/wallet" className={styles.depositBtnWrap}>
                    <Button variant="primary">💳 {t("tournamentsPage.deposit_cta")}</Button>
                  </LocaleLink>
                )}
              </div>
            )}

            <div className={styles.mainActionBtnGroup}>
              {!player ? (
                <LocaleLink href="/login" className={styles.fullWidthActionLink}>
                  <Button variant="primary">{t("tournamentsPage.login_to_register")}</Button>
                </LocaleLink>
              ) : registered ? (
                <div className={styles.registeredRow}>
                  <Button variant="secondary" onClick={() => void withdraw()} disabled={busy}>
                    {t("tournamentsPage.withdraw")}
                  </Button>
                  <span className={styles.registeredNote}>✅ {t("tournamentsPage.registered")}</span>
                </div>
              ) : (
                <Button variant="primary" onClick={() => void register()} disabled={busy}>
                  {busy ? t("tournamentsPage.registering") : t("tournamentsPage.register")}
                </Button>
              )}
            </div>

            {error && (
              <div className={styles.errorContainer}>
                <p className={styles.error} role="alert">{error}</p>
                {errorCode === "INSUFFICIENT_FUNDS" && (
                  <LocaleLink href="/wallet" className={styles.depositBtnWrap}>
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
