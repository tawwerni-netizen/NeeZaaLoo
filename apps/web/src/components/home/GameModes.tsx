"use client";

/**
 * The live games -- reads its catalog from the SAME registry /play's own
 * lobby does (getGame/listGames), not a hardcoded list. This card grid
 * used to hardcode ["chess", "speed_math"], which is exactly the "lobby
 * advertises a game with no real board" catalog drift already fixed once
 * in app/[locale]/play/page.tsx -- Speed Math has never had a frontend
 * board, so it never belonged in either list to begin with.
 */
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { listGames } from "@/lib/games";
import { GameThumbnail } from "@/components/game/GameThumbnail";
import styles from "./GameModes.module.css";

export function GameModes() {
  const { t, dir, locale } = useI18n();
  const games = listGames();

  return (
    <section className={styles.section}>
      <div className="nz-container">
        <h2 className={styles.heading}>{t("home.games.heading")}</h2>
        <div className={styles.grid}>
          {games.map((game) => {
            const name = t(`common.game_names.${game.nameKey}`);
            const duration = t(`home.games.${game.nameKey}.duration`);
            const mode = t(`home.games.${game.nameKey}.mode`);
            return (
              <div key={game.id} className={styles.card}>
                <LocaleLink href={`/games/${game.id}`} className={styles.thumbnailLink}>
                  <GameThumbnail
                    gameId={game.id}
                    title={name}
                    duration={duration}
                    badge={game.turnModel === "SIMULTANEOUS" ? t("gamesPage.turn_model_simultaneous") : t("gamesPage.turn_model_alternating")}
                  />
                </LocaleLink>
                <h3 className={styles.cardTitle}>
                  <LocaleLink href={`/games/${game.id}`}>{name}</LocaleLink>
                </h3>
                <p className={styles.cardDescription}>{t(`home.games.${game.nameKey}.description`)}</p>
                <dl className={styles.meta}>
                  <div>
                    <dt>{t("home.games.duration_label")}</dt>
                    <dd>{duration}</dd>
                  </div>
                  <div>
                    <dt>{t("home.games.mode_label")}</dt>
                    <dd>{mode}</dd>
                  </div>
                </dl>
                <LocaleLink href={`/play/${game.id}`}>
                  <Button variant="secondary" className={styles.cardAction}>
                    {t("home.games.play_cta", { name })}
                  </Button>
                </LocaleLink>
              </div>
            );
          })}


          {(() => {
            const ARENA_CARD_I18N: Record<string, { title: string; badge: string; desc: string; cta: string }> = {
              ar: {
                title: "بطولات الأرينا والتحديات المباشرة",
                badge: "أرينا حية",
                desc: "انضم إلى جولات تنافسية بنظام خروج المغلوب، وتحدَّ نخبة لاعبي المنصة في منافسات مهارية خالية من الحظ مع تصنيفات ELO رسمية.",
                cta: "دخول صالة البطولات ←",
              },
              en: {
                title: "Pro Tournaments & Live Duels",
                badge: "LIVE ARENA",
                desc: "Compete in single-elimination tournament brackets, challenge online members, and build your Global Skill rating.",
                cta: "Enter Tournament Arena →",
              },
              es: {
                title: "Torneos Pro y Duelos en Vivo",
                badge: "ARENA EN VIVO",
                desc: "Compite en cuadros de eliminación directa, desafía a jugadores online y mejora tu clasificación ELO.",
                cta: "Entrar a la Arena de Torneos →",
              },
              fr: {
                title: "Tournois Pro & Duels en Direct",
                badge: "ARÈNE EN DIRECT",
                desc: "Participez à des tournois à élimination directe, défiez des joueurs en ligne et forgez votre classement ELO.",
                cta: "Entrer dans l'Arène des Tournois →",
              },
              hi: {
                title: "प्रो टूर्नामेंट और लाइव द्वंद्व",
                badge: "लाइव अरीना",
                desc: "सिंगल-एलिमिनेशन टूर्नामेंट में भाग लें, ऑनलाइन खिलाड़ियों को चुनौती दें और अपनी वैश्विक रेटिंग बढ़ाएं।",
                cta: "टूर्नामेंट अरीना में प्रवेश करें →",
              },
              zh: {
                title: "职业锦标赛与实时决斗",
                badge: "实时竞技场",
                desc: "参与单败淘汰锦标赛晋级战，向全球各路在线高手发起挑战，赢取官方天梯 ELO 战力认证。",
                cta: "进入锦标赛大厅 →",
              },
            };
            const arenaStrings = (ARENA_CARD_I18N[locale] ?? ARENA_CARD_I18N["en"])!;

            return (
              <div className={styles.arenaCard}>
                <div className={styles.arenaThumbnailWrapper}>
                  <picture style={{ width: "100%", height: "100%", display: "block" }}>
                    <source srcSet="/images/banners/arena-tournaments-card.webp" type="image/webp" />
                    <img
                      src="/images/banners/arena-tournaments-card.jpg"
                      alt={arenaStrings.title}
                      className={styles.arenaThumbnailImg}
                      loading="lazy"
                      decoding="async"
                    />
                  </picture>
                  <span className={styles.arenaLiveBadgeOverlay}>
                    <span className={styles.pulseDot} />
                    {arenaStrings.badge}
                  </span>
                </div>

                <div className={styles.arenaCardHeader}>
                  <h3 className={styles.cardTitle}>
                    <LocaleLink href="/tournaments">
                      {arenaStrings.title}
                    </LocaleLink>
                  </h3>
                </div>
                <p className={styles.cardDescription}>
                  {arenaStrings.desc}
                </p>
                <div className={styles.arenaCardFooter}>
                  <LocaleLink href="/tournaments">
                    <Button variant="primary">
                      {arenaStrings.cta}
                    </Button>
                  </LocaleLink>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </section>
  );
}
