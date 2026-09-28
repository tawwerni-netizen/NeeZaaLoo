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
    ar: "الميدان التنافسي بانتظار بطله الأول!",
    en: "The Arena Awaits Its First Champion!",
    es: "¡La arena competitiva espera a su primer campeón!",
    fr: "L'arène compétitive attend son premier champion !",
    hi: "प्रतिस्पर्धी अखाड़ा अपने पहले चैंपियन की प्रतीक्षा कर रहा है!",
    zh: "竞技擂台正在等待首位霸主登顶！",
  },
  sub: {
    ar: "لا توجد مباريات جارية في هذه اللحظة. أطلق أول نزال بمبلغ 5$ واكسب 8.80$ فوراً!",
    en: "No live duels active right now. Launch a challenge with $5 and win $8.80 instantly!",
    es: "No hay duelos activos en este momento. ¡Lanza un desafío con $5 y gana $8.80 al instante!",
    fr: "Aucun duel actif pour l'instant. Lancez un défi avec 5 $ et gagnez instantanément 8,80 $ !",
    hi: "इस समय कोई सीधा मुकाबला सक्रिय नहीं है। $5 से चुनौती शुरू करें और तुरंत $8.80 जीतें!",
    zh: "当前暂无进行中的比赛。立即用 $5 发起挑战，赢取 $8.80 丰厚奖金！",
  },
  cta: {
    ar: "⚡ ادخل ميدان التحديات واكسب الجائزة",
    en: "⚡ Enter Arena & Win Now",
    es: "⚡ Entrar a la Arena y Ganar Ahora",
    fr: "⚡ Entrer dans l'Arène et Gagner",
    hi: "⚡ अखाड़े में प्रवेश करें और अभी जीतें",
    zh: "⚡ 即刻进入赛场赢取大奖",
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
