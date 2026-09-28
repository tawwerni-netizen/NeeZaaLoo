"use client";

// dynamic/revalidate route segment config does not take effect when
// exported from a "use client" page itself in this Next.js/Turbopack
// setup (verified: silently ignored, and `revalidate` outright breaks the
// build -- see this route's own layout.tsx for where the real fix lives).

/**
 * The public, crawlable games catalog -- distinct from /play (which
 * requires an account and starts the real mode-select/matchmaking flow).
 * This page's job is discovery: every real game, its actual duration,
 * mode, turn model, and AI difficulty levels, sourced entirely from
 * listGames() and the SAME i18n copy the homepage's compact strip and
 * /learn already use -- never a second, divergent description.
 *
 * The turn-model filter is genuine, not decorative: turnModel is a real
 * field on every GamePlugin (ALTERNATING vs SIMULTANEOUS), and today it
 * meaningfully separates nine turn-based games from Speed Math's shared
 * 60-second clock.
 */
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { listGames, type GamePlugin } from "@/lib/games";
import { GameThumbnail } from "@/components/game/GameThumbnail";
import styles from "./games.module.css";

type Filter = "ALL" | "ALTERNATING" | "SIMULTANEOUS";

export default function GamesPage() {
  const { t, dir, locale } = useI18n();
  const isRtl = dir === "rtl";
  const games = listGames();
  const [filter, setFilter] = useState<Filter>("ALL");

  const visible = useMemo(
    () => (filter === "ALL" ? games : games.filter((g) => g.turnModel === filter)),
    [games, filter]
  );

  const ARENA_BANNER_I18N: Record<string, { title: string; desc: string; cta: string; rulesCta: string }> = {
    ar: {
      title: "ساحة الأرينا المباشرة للنزالات والجوائز",
      desc: "نافس لاعبين حقيقيين فوراً بـ USDT واسحب أرباحك خلال ثوانٍ!",
      cta: "ادخل الأرينا وابدأ اللعب",
      rulesCta: "القواعد والاستراتيجية",
    },
    en: {
      title: "Live Duel Arena & Instant Prizes",
      desc: "Compete against real players for instant USDT prizes and fast payouts!",
      cta: "Enter Arena & Play",
      rulesCta: "Rules & Guide",
    },
    es: {
      title: "Arena en Vivo de Duelos y Premios al Instante",
      desc: "¡Compite contra jugadores reales por premios USDT y retiros rápidos!",
      cta: "Entrar a la Arena y Jugar",
      rulesCta: "Reglas y Guía",
    },
    fr: {
      title: "Arène en Direct & Récompenses Instantanées",
      desc: "Affrontez de vrais joueurs pour des prix en USDT et des retraits rapides !",
      cta: "Entrer dans l'Arène et Jouer",
      rulesCta: "Règles & Stratégie",
    },
    hi: {
      title: "लाइव द्वंद्व अरीना और तत्काल पुरस्कार",
      desc: "USDT पुरस्कारों और त्वरित निकासी के लिए वास्तविक खिलाड़ियों से मुकाबला करें!",
      cta: "अरीना में प्रवेश करें और खेलें",
      rulesCta: "नियम और रणनीति",
    },
    zh: {
      title: "实时决斗竞技场与即时奖金",
      desc: "与真实在线玩家极速角逐 USDT 现金大奖，收益数秒即刻到账！",
      cta: "进入竞技场即刻开战",
      rulesCta: "规则与进阶攻略",
    },
  };
  const arenaStrings = (ARENA_BANNER_I18N[locale] ?? ARENA_BANNER_I18N["en"])!;

  return (
    <>
      <Header />
      <main className="nz-container">
        <header className={styles.head}>
          <h1 className={styles.heading}>{t("gamesPage.heading")}</h1>
          <p className={styles.subhead}>{t("gamesPage.subhead")}</p>
        </header>

        <div style={{
          margin: "0 0 24px 0",
          padding: "16px 20px",
          background: "linear-gradient(135deg, rgba(201, 169, 110, 0.15) 0%, rgba(14, 19, 29, 0.9) 100%)",
          border: "1px solid rgba(201, 169, 110, 0.35)",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "15px", color: "var(--nz-accent, #c9a96e)", marginBottom: "4px" }}>
              ⚔️ {arenaStrings.title}
            </div>
            <div style={{ fontSize: "13px", color: "var(--nz-text-2)" }}>
              {arenaStrings.desc}
            </div>
          </div>
          <LocaleLink
            href="/play"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 18px",
              background: "linear-gradient(135deg, #ff5a2b, #f59e0b)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "13px",
              borderRadius: "8px",
              textDecoration: "none",
            }}
          >
            <span>⚔️</span>
            <span>{arenaStrings.cta}</span>
          </LocaleLink>
        </div>

        <div className={styles.filters} role="group" aria-label={t("gamesPage.heading")}>
          {(["ALL", "ALTERNATING", "SIMULTANEOUS"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={filter === f ? styles.filterActive : styles.filter}
              onClick={() => setFilter(f)}
            >
              {f === "ALL" ? t("gamesPage.filter_all") : f === "ALTERNATING" ? t("gamesPage.filter_turnbased") : t("gamesPage.filter_shared_clock")}
            </button>
          ))}
        </div>

        <div className={styles.grid}>
          {visible.map((game) => <GameCard key={game.id} game={game} />)}
        </div>
      </main>
      <Footer />
    </>
  );
}

function GameCard({ game }: { game: GamePlugin }) {
  const { t, locale } = useI18n();
  const name = t(`common.game_names.${game.nameKey}`);
  const duration = t(`home.games.${game.nameKey}.duration`);
  const mode = t(`home.games.${game.nameKey}.mode`);

  return (
    <div className={styles.card}>
      <LocaleLink href={`/play/${game.id}`} className={styles.thumbnailLink}>
        <GameThumbnail
          gameId={game.id}
          title={name}
          duration={duration}
          badge={game.turnModel === "SIMULTANEOUS" ? t("gamesPage.turn_model_simultaneous") : t("gamesPage.turn_model_alternating")}
        />
      </LocaleLink>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>
          <LocaleLink href={`/play/${game.id}`} className={styles.cardTitleLink}>{name}</LocaleLink>
        </h2>
        <span className={styles.turnTag}>
          {game.turnModel === "SIMULTANEOUS" ? t("gamesPage.turn_model_simultaneous") : t("gamesPage.turn_model_alternating")}
        </span>
      </div>
      <p className={styles.cardBody}>{t(`home.games.${game.nameKey}.description`)}</p>
      <dl className={styles.meta}>
        <div><dt>{t("home.games.duration_label")}</dt><dd>{duration}</dd></div>
        <div><dt>{t("home.games.mode_label")}</dt><dd>{mode}</dd></div>
      </dl>
      {game.difficulties.length > 0 && (
        <div className={styles.difficulties}>
          {game.difficulties.map((d) => (
            <span key={d} className={styles.difficultyBadge}>{t(`game.difficulty.${d}`)}</span>
          ))}
        </div>
      )}
      <div className={styles.cardActions}>
        <LocaleLink href={`/play/${game.id}`} className={styles.playCta}>
          <span>⚔️</span> {t("gamesPage.play_cta", { name })}
        </LocaleLink>
        <LocaleLink href={`/games/${game.id}`} className={styles.rulesCta}>
          <span>📖</span> {
            locale === "ar" ? "القواعد والاستراتيجية" :
            locale === "es" ? "Reglas y Guía" :
            locale === "fr" ? "Règles & Stratégie" :
            locale === "hi" ? "नियम और रणनीति" :
            locale === "zh" ? "规则与进阶攻略" : "Rules & Guide"
          }
        </LocaleLink>
      </div>
    </div>
  );
}
