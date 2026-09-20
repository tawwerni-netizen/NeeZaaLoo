"use client";

/**
 * The Global Leaderboard and Skill page.
 * Displays real human players ranked across all games or by specific game,
 * with Top 3 podium highlights, direct links to player profiles,
 * one-click Messenger chat links, and direct duel challenge CTAs.
 */
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import { get } from "@/lib/api";
import { listGames, getGame } from "@/lib/games";
import { Avatar } from "@/components/profile/Avatar";
import styles from "./rank.module.css";

type Breakdown = {
  gameId: string;
  percentile: number;
  rawWeight: number;
  weight: number;
  weightPct: number;
  wasCapped: boolean;
  contribution: number;
};

type GlobalSkill = { score: number | null; breakdown: Breakdown[]; appliedCap: boolean; breadth: number };

type LeaderboardEntry = {
  player_id: string;
  handle: string;
  avatar_key?: string | null;
  selected_badge_code?: string | null;
  rating_x100: number;
  rd_x100?: number;
  games_played: number;
};

export default function RankPage() {
  const { t, dir, locale } = useI18n();
  const { player } = useAuth();
  const games = listGames();

  const [selectedGame, setSelectedGame] = useState<string>("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [skill, setSkill] = useState<GlobalSkill | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);

  // Fetch leaderboard data when selected game changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const endpoint = selectedGame === "all" ? "/v1/leaderboard?game=all" : `/v1/leaderboard?game=${selectedGame}`;
    get<{ gameId: string; entries: LeaderboardEntry[] }>(endpoint)
      .then((res) => {
        if (!cancelled && res?.entries) {
          setEntries(res.entries);
        }
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedGame]);

  // Fetch personal skill breakdown if player is logged in
  useEffect(() => {
    if (player?.id) {
      get<GlobalSkill>("/v1/me/global-skill")
        .then(setSkill)
        .catch(() => setSkill(null));
    }
  }, [player?.id]);

  const top3 = entries.slice(0, 3);

  return (
    <>
      <Header />
      <main className={`nz-container ${styles.wrap}`}>
        {/* Hero Banner */}
        <div className={styles.heroBanner}>
          <img
            src="/images/banners/banner-global-leaderboard.jpg"
            alt={dir === "rtl" ? "لوحة المتصدرين العالمية" : "Global Rankings"}
            className={styles.heroBannerImg}
          />
          <div className={styles.heroBannerOverlay}>
            <div className={styles.heroBadgeRow}>
              <span className={styles.heroBadge}>
                {dir === "rtl" ? "⚡ تصنيف المهارة الحي المباشر" : "⚡ LIVE SKILL LEADERBOARD"}
              </span>
              <span className={styles.heroSubBadge}>
                {dir === "rtl" ? "🏆 نظام Glicko-2 المعتمد" : "🏆 Certified Glicko-2"}
              </span>
            </div>
            <h1 className={styles.heading}>{t("rank.heading")}</h1>
            <p className={styles.subtitle}>
              {dir === "rtl"
                ? "قائمة نخبة أبطال نزالو الحقيقيين. تصفح الترتيب، تفقد ملفات اللاعبين، وتحدث معهم أو تحداهم في مبارزات فورية لإثبات جدارتك."
                : t("rank.subtitle")}
            </p>
          </div>
        </div>

        {/* User Personal Skill Card if signed in */}
        {player && (
          <div className={styles.personalCard}>
            <div className={styles.personalInfo}>
              <div className={styles.personalAvatar}>
                <Avatar nickname={player.handle} avatarUrl={null} size={48} />
              </div>
              <div>
                <span className={styles.personalLabel}>
                  {dir === "rtl" ? "إحصائياتك وتصنيفك الشخصي" : "Your Personal Rank"}
                </span>
                <div className={styles.personalHandle}>@{player.handle}</div>
              </div>
            </div>
            <div className={styles.personalStats}>
              <div className={styles.statBox}>
                <span className={styles.statNum}>{skill?.score ? skill.score : "1500"}</span>
                <span className={styles.statLabel}>{dir === "rtl" ? "نقاط المهارة" : "Skill Score"}</span>
              </div>
              <div className={styles.statBox}>
                <span className={styles.statNum}>{skill?.breakdown?.length ?? 0}</span>
                <span className={styles.statLabel}>{dir === "rtl" ? "ألعاب نشطة" : "Active Games"}</span>
              </div>
            </div>
          </div>
        )}

        {/* Game Filter Pills */}
        <div className={styles.filtersSection}>
          <div className={styles.filtersHeader}>
            <span className={styles.filtersTitle}>
              {dir === "rtl" ? "اختر اللعبة لعرض المتصدرين:" : "Select Game Category:"}
            </span>
          </div>
          <div className={styles.filtersWrap}>
            <button
              type="button"
              className={selectedGame === "all" ? styles.filterActive : styles.filter}
              onClick={() => setSelectedGame("all")}
            >
              <span className={styles.filterIcon}>🌐</span>
              <span className={styles.filterText}>{dir === "rtl" ? "الترتيب العام الشامل" : "All Games Combined"}</span>
            </button>
            {games.map((g) => {
              const name = t(`common.game_names.${g.nameKey}`);
              const GAME_ICONS: Record<string, string> = {
                chess: "♟️",
                dominoes: "🀄",
                backgammon: "🎲",
                "speed-math": "🔢",
                xo: "❌",
                "connect-four": "🔴",
                checkers: "⚫",
                reversi: "⚪",
                gomoku: "🟢",
                seega: "🎯",
              };
              const icon = GAME_ICONS[g.id] || "🎮";
              return (
                <button
                  key={g.id}
                  type="button"
                  className={selectedGame === g.id ? styles.filterActive : styles.filter}
                  onClick={() => setSelectedGame(g.id)}
                >
                  <span className={styles.filterIcon}>{icon}</span>
                  <span className={styles.filterText}>{name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Leaderboard Body */}
        {loading ? (
          <div className={styles.loadingCard}>
            <div className={styles.spinner} />
            <p>{dir === "rtl" ? "جارٍ تحديث وتنسيق لوحة المتصدرين..." : "Loading leaderboard..."}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className={styles.emptyCard}>
            <span className={styles.emptyIcon}>👑</span>
            <h3>{dir === "rtl" ? "كن أول من يتصدر اللائحة!" : "Be the First to Claim the Crown!"}</h3>
            <p>
              {dir === "rtl"
                ? "لا توجد مباريات مسجلة في هذا القسم بعد. العب الآن مبارزتك الأولى وضع بصمتك في قائمة الأساطير."
                : "No rated games in this section yet. Play your first match now to secure your rank!"}
            </p>
            <LocaleLink href="/games" className={styles.playNowBtn}>
              ⚔️ {dir === "rtl" ? "ابدأ مبارزة الآن" : "Play a Match Now"}
            </LocaleLink>
          </div>
        ) : (
          <>
            {/* Top 3 Podium */}
            {top3.length > 0 && (
              <div className={styles.podium}>
                {/* 2nd Place */}
                {top3[1] && (
                  <div className={`${styles.podiumCard} ${styles.rank2}`}>
                    <div className={styles.podiumCrown}>🥈</div>
                    <div className={styles.avatarWrap}>
                      <Avatar nickname={top3[1].handle} avatarUrl={null} size={72} />
                      <span className={styles.rankBadge}>#2</span>
                    </div>
                    <h3 className={styles.podiumHandle}>
                      <LocaleLink href={`/players/${top3[1].handle}`}>{top3[1].handle}</LocaleLink>
                    </h3>
                    <div className={styles.podiumScore}>
                      {Math.round(top3[1].rating_x100 / 100)} <span className={styles.scoreUnit}>{dir === "rtl" ? "نقطة" : "pts"}</span>
                    </div>
                    <div className={styles.podiumMatches}>
                      {top3[1].games_played} {dir === "rtl" ? "مباراة ملعوبة" : "matches"}
                    </div>
                    <div className={styles.podiumActions}>
                      <LocaleLink
                        href={`/players/${top3[1].handle}`}
                        className={styles.iconBtn}
                        title={dir === "rtl" ? "الملف الشخصي" : "Profile"}
                      >
                        👤
                      </LocaleLink>
                      <LocaleLink
                        href={`/chat?partner=${top3[1].player_id}`}
                        className={styles.chatBtn}
                        title={dir === "rtl" ? "مراسلة فورية" : "Message"}
                      >
                        💬 {dir === "rtl" ? "مراسلة" : "Chat"}
                      </LocaleLink>
                      <LocaleLink
                        href={`/play?challenge=${top3[1].player_id}`}
                        className={styles.challengeBtn}
                        title={dir === "rtl" ? "تحدي" : "Challenge"}
                      >
                        ⚔️
                      </LocaleLink>
                    </div>
                  </div>
                )}

                {/* 1st Place (Center & Elevated) */}
                {top3[0] && (
                  <div className={`${styles.podiumCard} ${styles.rank1}`}>
                    <div className={styles.podiumCrown}>👑 🥇</div>
                    <div className={styles.avatarWrap}>
                      <Avatar nickname={top3[0].handle} avatarUrl={null} size={88} />
                      <span className={styles.rankBadgeGold}>#1</span>
                    </div>
                    <h3 className={styles.podiumHandle}>
                      <LocaleLink href={`/players/${top3[0].handle}`}>{top3[0].handle}</LocaleLink>
                    </h3>
                    <div className={styles.podiumScoreGold}>
                      {Math.round(top3[0].rating_x100 / 100)} <span className={styles.scoreUnit}>{dir === "rtl" ? "نقطة" : "pts"}</span>
                    </div>
                    <div className={styles.podiumMatches}>
                      {top3[0].games_played} {dir === "rtl" ? "مباراة ملعوبة" : "matches"}
                    </div>
                    <div className={styles.podiumActions}>
                      <LocaleLink
                        href={`/players/${top3[0].handle}`}
                        className={styles.iconBtn}
                        title={dir === "rtl" ? "الملف الشخصي" : "Profile"}
                      >
                        👤
                      </LocaleLink>
                      <LocaleLink
                        href={`/chat?partner=${top3[0].player_id}`}
                        className={styles.chatBtnGold}
                        title={dir === "rtl" ? "مراسلة فورية" : "Message"}
                      >
                        💬 {dir === "rtl" ? "مراسلة البطل" : "Chat Champion"}
                      </LocaleLink>
                      <LocaleLink
                        href={`/play?challenge=${top3[0].player_id}`}
                        className={styles.challengeBtnGold}
                        title={dir === "rtl" ? "تحدي البطل" : "Challenge Champion"}
                      >
                        ⚔️ {dir === "rtl" ? "تحدي" : "Fight"}
                      </LocaleLink>
                    </div>
                  </div>
                )}

                {/* 3rd Place */}
                {top3[2] && (
                  <div className={`${styles.podiumCard} ${styles.rank3}`}>
                    <div className={styles.podiumCrown}>🥉</div>
                    <div className={styles.avatarWrap}>
                      <Avatar nickname={top3[2].handle} avatarUrl={null} size={72} />
                      <span className={styles.rankBadge}>#3</span>
                    </div>
                    <h3 className={styles.podiumHandle}>
                      <LocaleLink href={`/players/${top3[2].handle}`}>{top3[2].handle}</LocaleLink>
                    </h3>
                    <div className={styles.podiumScore}>
                      {Math.round(top3[2].rating_x100 / 100)} <span className={styles.scoreUnit}>{dir === "rtl" ? "نقطة" : "pts"}</span>
                    </div>
                    <div className={styles.podiumMatches}>
                      {top3[2].games_played} {dir === "rtl" ? "مباراة ملعوبة" : "matches"}
                    </div>
                    <div className={styles.podiumActions}>
                      <LocaleLink
                        href={`/players/${top3[2].handle}`}
                        className={styles.iconBtn}
                        title={dir === "rtl" ? "الملف الشخصي" : "Profile"}
                      >
                        👤
                      </LocaleLink>
                      <LocaleLink
                        href={`/chat?partner=${top3[2].player_id}`}
                        className={styles.chatBtn}
                        title={dir === "rtl" ? "مراسلة فورية" : "Message"}
                      >
                        💬 {dir === "rtl" ? "مراسلة" : "Chat"}
                      </LocaleLink>
                      <LocaleLink
                        href={`/play?challenge=${top3[2].player_id}`}
                        className={styles.challengeBtn}
                        title={dir === "rtl" ? "تحدي" : "Challenge"}
                      >
                        ⚔️
                      </LocaleLink>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Complete Leaderboard Table */}
            <div className={styles.tableCard}>
              <div className={styles.tableCardHead}>
                <h2>{dir === "rtl" ? "🏆 الترتيب العام للأعضاء" : "🏆 Member Standings"}</h2>
                <span className={styles.entryCount}>
                  {entries.length} {dir === "rtl" ? "لاعب متنافس" : "active competitors"}
                </span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.colRank}>#</th>
                      <th className={styles.colPlayer}>{dir === "rtl" ? "اللاعب" : "Player"}</th>
                      <th className={styles.colScore}>{dir === "rtl" ? "تقييم المهارة" : "Skill Rating"}</th>
                      <th className={styles.colGames}>{dir === "rtl" ? "المباريات" : "Matches"}</th>
                      <th className={styles.colActions}>{dir === "rtl" ? "إجراءات وتواصل" : "Connect & Play"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((row, idx) => {
                      const rankNum = idx + 1;
                      const isMe = player?.id === row.player_id;
                      return (
                        <tr key={row.player_id} className={isMe ? styles.myRow : undefined}>
                          <td className={styles.colRank}>
                            <span className={rankNum <= 3 ? styles.medalRank : styles.normalRank}>
                              {rankNum === 1 ? "🥇 1" : rankNum === 2 ? "🥈 2" : rankNum === 3 ? "🥉 3" : `#${rankNum}`}
                            </span>
                          </td>
                          <td className={styles.colPlayer}>
                            <div className={styles.playerMeta}>
                              <Avatar nickname={row.handle} avatarUrl={null} size={36} />
                              <div>
                                <LocaleLink href={`/players/${row.handle}`} className={styles.playerNameLink}>
                                  {row.handle}
                                  {isMe && <span className={styles.meBadge}>{dir === "rtl" ? "أنت" : "You"}</span>}
                                </LocaleLink>
                                {row.selected_badge_code && (
                                  <span className={styles.badgeCode}>{row.selected_badge_code}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={styles.colScore}>
                            <span className={styles.scoreText}>{Math.round(row.rating_x100 / 100)}</span>
                          </td>
                          <td className={styles.colGames}>
                            <span className={styles.gamesCount}>{row.games_played}</span>
                          </td>
                          <td className={styles.colActions}>
                            <div className={styles.actionGroup}>
                              <LocaleLink
                                href={`/players/${row.handle}`}
                                className={styles.tblProfileBtn}
                                title={dir === "rtl" ? "الملف الشخصي" : "Profile"}
                              >
                                👤 {dir === "rtl" ? "البروفايل" : "Profile"}
                              </LocaleLink>
                              <LocaleLink
                                href={`/chat?partner=${row.player_id}`}
                                className={styles.tblChatBtn}
                                title={dir === "rtl" ? "مراسلة في الشات" : "Message in Chat"}
                              >
                                💬 {dir === "rtl" ? "شات" : "Chat"}
                              </LocaleLink>
                              <LocaleLink
                                href={`/play?challenge=${row.player_id}`}
                                className={styles.tblChallengeBtn}
                                title={dir === "rtl" ? "تحدي مبارزة" : "Challenge Duel"}
                              >
                                ⚔️ {dir === "rtl" ? "تحدي" : "Fight"}
                              </LocaleLink>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Detailed Breakdown if available */}
        {skill && skill.breakdown.length > 0 && (
          <div className={styles.breakdownCard}>
            <div className={styles.breakdownHead}>
              <h3>{dir === "rtl" ? "📊 تفاصيل تقييمك للألعاب الفردية" : "📊 Your Game Skill Breakdown"}</h3>
              <p>{t("rank.score_scale")}</p>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t("rank.col_game")}</th>
                    <th>{t("rank.col_percentile")}</th>
                    <th>{t("rank.col_weight")}</th>
                    <th>{t("rank.col_contribution")}</th>
                  </tr>
                </thead>
                <tbody>
                  {skill.breakdown.map((row) => {
                    const nameKey = getGame(row.gameId)?.nameKey ?? row.gameId;
                    return (
                      <tr key={row.gameId}>
                        <td>{t(`common.game_names.${nameKey}`)}</td>
                        <td className="nz-num">{Math.round(row.percentile * 100)}%</td>
                        <td className="nz-num">
                          {row.weightPct}%
                          {row.wasCapped && <span className={styles.cappedNote}> {t("rank.capped_note")}</span>}
                        </td>
                        <td className="nz-num">{Math.round(row.contribution * 1000)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Methodology Toggle */}
        <div className={styles.methodology}>
          <button
            type="button"
            className={styles.methodologyToggle}
            onClick={() => setShowMethodology((prev) => !prev)}
          >
            <span>ℹ️</span> {t("rank.methodology_title")} {showMethodology ? "▲" : "▼"}
          </button>
          {showMethodology && (
            <div className={styles.methodologyBody}>
              <p>{t("rank.methodology_body_1")}</p>
              <p>{t("rank.methodology_body_2")}</p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
