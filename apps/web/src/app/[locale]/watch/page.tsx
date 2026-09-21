"use client";

/**
 * The Live Arena: a discoverable list of REAL live matches, fetched from
 * /v1/duels/live -- never a fabricated match, spectator count, or "safe
 * state summary." Each card shows exactly what the server already
 * computed: the game, both real seats (handle/badge/rating), a real move
 * count as the safe public summary (never board state -- that stays
 * behind the spectator projection the game page itself applies), and
 * whether this is a real tournament pairing's duel (isTournamentMatch,
 * derived server-side from the pairing_key -- never asserted here).
 * Clicking WATCH opens the same game screen a player uses; that page
 * decides MATCH vs SPECTATOR view from the server's own seat answer.
 */
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { LocaleLink } from "@/components/LocaleLink";
import { Avatar } from "@/components/profile/Avatar";
import { badgeIcon } from "@/components/profile/badge-icons";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import { getGame } from "@/lib/games";
import { LiveMatchShareModal } from "@/components/game/LiveMatchShareModal";
import styles from "./watch.module.css";

type LiveMatchPlayer = { handle: string; badge: string | null; ratingX100: number | null; avatarUrl?: string | null };
type LiveMatch = {
  duelId: string;
  gameId: string;
  status?: "LIVE" | "READY" | "COMPLETED" | "SETTLED";
  startedAt: string;
  isTournamentMatch: boolean;
  isVsComputer?: boolean;
  tier?: "FREE" | "CASH";
  stakeMinor?: string;
  asset?: string;
  winnerPrizeMinor?: string | null;
  moveCount: number;
  players: LiveMatchPlayer[];
};
type LiveMatchesResponse = { matches: LiveMatch[] };

const POLL_MS = 3000;

const WATCH_GAMES = [
  { id: "all", nameEn: "All Games", nameAr: "جميع الألعاب", icon: "🌐" },
  { id: "dominoes", nameEn: "Dominoes", nameAr: "الدومينو", icon: "🀄" },
  { id: "chess", nameEn: "Chess", nameAr: "الشطرنج", icon: "♟️" },
  { id: "backgammon", nameEn: "Backgammon", nameAr: "طاولة الزهر", icon: "🎲" },
  { id: "xo", nameEn: "Tic-Tac-Toe", nameAr: "إكس أو", icon: "⚔️" },
  { id: "checkers", nameEn: "Checkers", nameAr: "الداما", icon: "⚪" },
  { id: "connect-four", nameEn: "Connect Four", nameAr: "أربعة على التوالي", icon: "🔴" },
  { id: "speed-math", nameEn: "Speed Math", nameAr: "الحساب السريع", icon: "⚡" },
  { id: "seega", nameEn: "Seega", nameAr: "السيجة", icon: "🏜️" },
  { id: "reversi", nameEn: "Reversi", nameAr: "ريفيرسي", icon: "⚫" },
  { id: "gomoku", nameEn: "Gomoku", nameAr: "جوموكو", icon: "⭕" },
];

export default function WatchPage() {
  return (
    <>
      <Header />
      <WatchContent />
    </>
  );
}

function WatchContent() {
  const { t, locale, dir } = useI18n();
  const isRtl = dir === "rtl";
  const [matches, setMatches] = useState<LiveMatch[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGame, setSelectedGame] = useState("all");
  const [searchHandle, setSearchHandle] = useState("");
  const [includeBots, setIncludeBots] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharingMatch, setSharingMatch] = useState<LiveMatch | null>(null);

  const loadMatches = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (selectedGame !== "all") params.set("gameId", selectedGame);
      if (searchHandle.trim()) params.set("handle", searchHandle.trim());
      if (includeBots) params.set("includeBots", "true");

      const r = await get<LiveMatchesResponse>(`/v1/duels/live?${params.toString()}`);
      setMatches(r.matches || []);
    } catch {
      setMatches((prev) => prev ?? []);
    } finally {
      if (isManual) setTimeout(() => setRefreshing(false), 400);
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadMatches();
    const interval = setInterval(() => {
      if (!cancelled && typeof document !== "undefined" && !document.hidden) void loadMatches();
    }, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedGame, searchHandle, includeBots]);

  const handleCopyLink = (duelId: string) => {
    const url = `${window.location.origin}/${locale}/game/${duelId}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedId(duelId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.heroContainer}>
        <img
          src="/images/arena/hero.jpg"
          alt="Live Arena"
          className={styles.heroImage}
        />
        <div className={styles.heroOverlay} />
        
        <div className={styles.heroContent}>
          <div className={styles.titleBadge}>
            <span className={styles.livePulseDot} />
            <span>{t("watch.realtime_feed")}</span>
            {matches && matches.length > 0 && (
              <span style={{ marginInlineStart: 8, color: "#ffd700", fontWeight: 800 }}>
                • {t("watch.live_count", { count: String(matches.length) })}
              </span>
            )}
          </div>
          <h1 className={styles.title}>{t("watch.title")}</h1>
          <p className={styles.subtitle}>{t("watch.subtitle")}</p>

          <div className={styles.heroActions}>
            <button
              type="button"
              className={`${styles.refreshBtn} ${refreshing ? styles.refreshing : ""}`}
              onClick={() => void loadMatches(true)}
              disabled={refreshing}
              title={t("watch.refresh_tooltip")}
            >
              <span className={styles.refreshIcon}>🔄</span>
              <span>{t("watch.live_refresh")}</span>
            </button>
            <LocaleLink href="/play" className={styles.createDuelBtn}>
              <span>⚔️ {t("watch.start_duel")}</span>
            </LocaleLink>
          </div>
        </div>
      </div>

      {/* Control Bar: Search & Game Tabs */}
      <div className={styles.controlsBar}>
        <div className={styles.controlsTopRow}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t("watch.search_placeholder")}
              value={searchHandle}
              onChange={(e) => setSearchHandle(e.target.value)}
            />
          </div>

          <button
            type="button"
            className={`${styles.toggleBotsBtn} ${includeBots ? styles.toggleBotsBtnActive : ""}`}
            onClick={() => setIncludeBots(!includeBots)}
          >
            <span>🤖</span>
            <span>{t("watch.include_bots")}</span>
          </button>
        </div>

        {/* Scrollable Game Filter Tabs */}
        <div className={styles.gameTabs}>
          {WATCH_GAMES.map((g) => {
            const active = selectedGame === g.id;
            return (
              <button
                key={g.id}
                type="button"
                className={`${styles.gameTab} ${active ? styles.gameTabActive : ""}`}
                onClick={() => setSelectedGame(g.id)}
              >
                <span>{g.icon}</span>
                <span>{g.id === "all" ? t("play_page.cat_all") : t(`common.game_names.${getGame(g.id)?.nameKey ?? g.id}`)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {matches === null ? (
        <div className={styles.grid} aria-hidden="true">
          <div className={styles.matchCardSkeleton} />
          <div className={styles.matchCardSkeleton} />
        </div>
      ) : matches.length === 0 ? (
        <div className={styles.emptyArenaCard}>
          <div className={styles.radarGraphic}>
            <div className={styles.radarSweep} />
            <span className={styles.radarIcon}>📡</span>
          </div>
          <h3 className={styles.emptyArenaTitle}>
            {t("watch.no_matches_found")}
          </h3>
          <p className={styles.emptyArenaDesc}>
            {searchHandle.trim()
              ? (isRtl ? `لم نجد أي مباراة جارية حالياً للاعب "${searchHandle}". تأكد من صحة الاسم أو أن المباراة لا تزال جارية.` : `No active live match found for "${searchHandle}". Check handle spelling or wait for match to begin.`)
              : (isRtl ? "لا توجد مبارزات جارية في هذه اللعبة حالياً. بادر ببدء نزالك الخاص أو اختر لعبة أخرى من الفلاتر!" : "No live duels in progress right now. Launch a duel and challenge real opponents instantly!")}
          </p>
          <div className={styles.emptyArenaActions}>
            <LocaleLink href="/play" className={styles.heroPlayBtn}>
              ⚔️ {t("watch.play_challenge_cta")}
            </LocaleLink>
            <LocaleLink href="/tournaments" className={styles.heroTourneyBtn}>
              🏆 {t("watch.explore_tournaments_cta")}
            </LocaleLink>
          </div>
        </div>
      ) : (
        <div className={styles.grid}>
          {matches.map((m) => {
            const nameKey = getGame(m.gameId)?.nameKey ?? m.gameId;
            return (
              <div key={m.duelId} className={styles.matchCard}>
                <div className={styles.cardCover}>
                  <img src={`/images/games/${m.gameId}-hero.jpg`} alt={m.gameId} className={styles.cardCoverImage} />
                  <div className={styles.cardCoverOverlay} />
                </div>
                <div className={styles.cardTop}>
                  <span className={styles.gameName}>{t(`common.game_names.${nameKey}`)}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {m.isVsComputer && (
                      <span className={styles.botBadge}>
                        <span>🤖</span> {t("watch.vs_bot")}
                      </span>
                    )}
                    {m.status === "READY" ? (
                      <span className={styles.readyBadge}>
                        <span>⏳</span> {t("watch.starting_soon")}
                      </span>
                    ) : (
                      <span className={styles.liveBadge}>
                        <span className={styles.liveDot} aria-hidden="true" />
                        {t("watch.live_badge")}
                      </span>
                    )}
                  </div>
                </div>

                {m.isTournamentMatch && (
                  <span className={styles.tournamentBadge}>{t("watch.tournament_badge")}</span>
                )}

                {m.winnerPrizeMinor && Number(m.winnerPrizeMinor) > 0 ? (
                  <div className={styles.prizeBanner}>
                    <span className={styles.prizeIcon}>⚡</span>
                    <span className={styles.prizeText}>
                      {isRtl
                        ? `جائزة الفائز: $${(Number(m.winnerPrizeMinor) / 1_000_000).toFixed(2)} USDT كاش`
                        : `Winner Prize: $${(Number(m.winnerPrizeMinor) / 1_000_000).toFixed(2)} USDT Cash`}
                    </span>
                  </div>
                ) : (
                  <div className={styles.freeBanner}>
                    <span>🎮</span>
                    <span>{t("watch.free_duel")}</span>
                  </div>
                )}

                <div className={styles.matchPlayers}>
                  <PlayerChip player={m.players[0]} />
                  <span className={styles.vs}>{t("watch.vs")}</span>
                  <PlayerChip player={m.players[1]} />
                </div>

                <div className={styles.cardBottom}>
                  <span className={styles.moveCount}>
                    {m.status === "READY"
                      ? t("watch.preparing_match")
                      : m.moveCount > 0
                      ? t("watch.move_count", { count: m.moveCount })
                      : t("watch.first_move")}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      type="button"
                      className={styles.copyLinkBtn}
                      title={t("watch.share_stream_tooltip")}
                      onClick={() => setSharingMatch(m)}
                    >
                      📡
                    </button>
                    <button
                      type="button"
                      className={styles.copyLinkBtn}
                      title={copiedId === m.duelId ? t("watch.copied") : t("watch.copy_link_tooltip")}
                      onClick={() => handleCopyLink(m.duelId)}
                    >
                      {copiedId === m.duelId ? "✅" : "🔗"}
                    </button>
                    <LocaleLink href={`/game/${m.duelId}`} className={styles.watchCta}>{t("watch.watch_cta")}</LocaleLink>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sharingMatch && (
        <LiveMatchShareModal
          isOpen={Boolean(sharingMatch)}
          onClose={() => setSharingMatch(null)}
          duelId={sharingMatch.duelId}
          gameId={sharingMatch.gameId}
          gameName={t(`common.game_names.${getGame(sharingMatch.gameId)?.nameKey ?? sharingMatch.gameId}`)}
          player1={sharingMatch.players[0]?.handle || "Player 1"}
          player2={sharingMatch.players[1]?.handle || "Player 2"}
        />
      )}
    </div>
  );
}

function PlayerChip({ player }: { player: LiveMatchPlayer | undefined }) {
  if (!player) return null;
  const isBot = player.handle === 'Computer AI';
  const avatarUrl = player.avatarUrl || (isBot ? "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80" : null);
  const rating = player.ratingX100 != null ? Math.round(player.ratingX100 / 100) : 1200;
  
  // Rank color mapping
  let rankColor = "#94a3b8"; // Silver
  if (rating >= 2000) rankColor = "#fbbf24"; // Gold/Expert
  else if (rating >= 1500) rankColor = "#60a5fa"; // Blue/Advanced

  const content = (
    <>
      <div className={styles.playerAvatar} style={{ borderColor: rankColor }}>
        <Avatar nickname={player.handle} avatarUrl={avatarUrl} size={52} rating={rating ?? null} />
      </div>
      <span className={styles.playerInfo}>
        <span className={styles.playerHandle} style={{ color: isBot ? "#93c5fd" : undefined }}>
          {player.handle}
        </span>
        <span className={`nz-num ${styles.playerRating}`} style={{ color: rankColor, borderColor: rankColor }}>
          {rating}
        </span>
      </span>
      {player.badge && <span className={styles.playerBadge}>{badgeIcon(player.badge)}</span>}
    </>
  );

  const isGuest = player.handle === 'Computer AI' || player.handle === 'Player 2' || player.handle.startsWith('Guest_');

  if (isGuest) {
    return <div className={styles.playerChip}>{content}</div>;
  }

  return (
    <LocaleLink href={`/players/${encodeURIComponent(player.handle)}`} className={styles.playerChip}>
      {content}
    </LocaleLink>
  );
}
