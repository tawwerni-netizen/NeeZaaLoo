"use client";

/**
 * The homepage's real Live Arena preview. Reads the exact same public,
 * anonymous-accessible endpoint /watch's own page uses (GET /v1/duels/live,
 * action duel.spectate, anonymous: true) -- never a fabricated match,
 * player count, or "X people online" figure. An empty result renders an
 * honest empty state, not a placeholder match.
 */
import { useEffect, useState } from "react";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import { getGame } from "@/lib/games";
import styles from "./LiveArenaSection.module.css";

type LiveMatchPlayer = { handle: string; badge: string | null; ratingX100: number | null };
type LiveMatch = {
  duelId: string; gameId: string; isTournamentMatch: boolean; moveCount: number;
  players: LiveMatchPlayer[];
};

const POLL_MS = 10000;
const PREVIEW_LIMIT = 6;

const EMPTY_ARENA_I18N = {
  title: {
    ar: "الميدان التنافسي بانتظار إطلاق أول نزال",
    en: "The Arena Is Ready for the Next Duel",
    es: "La arena está lista para el próximo duelo",
    fr: "L'arène est prête pour le prochain duel",
    hi: "अखाड़ा अगले द्वंद्व के लिए तैयार है",
    zh: "竞技擂台静候下一场巅峰对决",
  },
  sub: {
    ar: "لا توجد مبارزات جارية حالياً. اختر لعبتك المفضلة، تدرب مجاناً أو خض مواجهة كاش عادلة 100%.",
    en: "No live matches in progress right now. Choose your favorite game, practice free, or launch a certified 100% skill duel.",
    es: "No hay duelos activos en este momento. Elige tu juego favorito, practica gratis o compite al 100% habilidad.",
    fr: "Aucun duel actif en ce moment. Choisissez votre jeu, entraînez-vous gratuitement ou lancez un duel certifié.",
    hi: "इस समय कोई सीधा मुकाबला नहीं है। अपना पसंदीदा खेल चुनें, मुफ्त अभ्यास करें या निष्पक्ष मुकाबला शुरू करें।",
    zh: "当前暂无进行中的对局。选择您擅长的游戏，免费训练或开启认证的纯技术对决。",
  },
  cta: {
    ar: "⚔️ خض نزالاً الآن في الميدان",
    en: "⚔️ Launch a Duel Now",
    es: "⚔️ Iniciar un Duelo Ahora",
    fr: "⚔️ Lancer un Duel",
    hi: "⚔️ अभी मुकाबला शुरू करें",
    zh: "⚔️ 即刻开启对决",
  },
};

export function LiveArenaSection() {
  const { t, locale } = useI18n();
  const [matches, setMatches] = useState<LiveMatch[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void get<{ matches: LiveMatch[] }>(`/v1/duels/live?limit=${PREVIEW_LIMIT}`)
        .then((r) => { if (!cancelled) setMatches(r.matches); })
        .catch(() => { if (!cancelled) setMatches((prev) => prev ?? []); });
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const emptyTitle = (EMPTY_ARENA_I18N.title as Record<string, string>)[locale] || EMPTY_ARENA_I18N.title.en;
  const emptySub = (EMPTY_ARENA_I18N.sub as Record<string, string>)[locale] || EMPTY_ARENA_I18N.sub.en;
  const emptyCta = (EMPTY_ARENA_I18N.cta as Record<string, string>)[locale] || EMPTY_ARENA_I18N.cta.en;

  return (
    <section className={styles.section}>
      <div className="nz-container">
        <div className={styles.headRow}>
          <div>
            <h2 className={styles.heading}>{t("home.liveArena.heading")}</h2>
            <p className={styles.subhead}>{t("home.liveArena.subhead")}</p>
          </div>
          <LocaleLink href="/watch" className={styles.viewAll}>{t("home.liveArena.view_all")}</LocaleLink>
        </div>

        {matches === null ? (
          <div className={styles.grid} aria-hidden="true">
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </div>
        ) : matches.length === 0 ? (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIcon}>⚔️</div>
            <div className={styles.emptyContent}>
              <h3 className={styles.emptyTitle}>{emptyTitle}</h3>
              <p className={styles.emptySub}>{emptySub}</p>
            </div>
            <LocaleLink href="/play" className={styles.emptyCta}>
              <span>{emptyCta}</span>
            </LocaleLink>
          </div>
        ) : (
          <div className={styles.grid}>
            {matches.map((m) => {
              const nameKey = getGame(m.gameId)?.nameKey ?? m.gameId;
              return (
                <LocaleLink key={m.duelId} href={`/game/${m.duelId}`} className={styles.card}>
                  <img src={`/images/games/${m.gameId}-hero.jpg`} alt={m.gameId} className={styles.cardCoverImage} />
                  <div className={styles.cardCoverOverlay} />
                  <div className={styles.cardContent}>
                    <div className={styles.cardTop}>
                      <span className={styles.liveDot} aria-hidden="true" />
                      <span className={styles.gameName}>{t(`common.game_names.${nameKey}`)}</span>
                      {m.isTournamentMatch && <span className={styles.tournamentTag}>{t("watch.tournament_badge")}</span>}
                    </div>
                    <div className={styles.players}>
                      <span className={styles.handle}>{m.players[0]?.handle}</span>
                      <span className={styles.vs}>{t("watch.vs")}</span>
                      <span className={styles.handle}>{m.players[1]?.handle}</span>
                    </div>
                    <span className={styles.moves}>{t("watch.move_count", { count: m.moveCount })}</span>
                  </div>
                </LocaleLink>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
