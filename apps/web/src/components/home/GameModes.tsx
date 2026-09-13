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
  const { t, dir } = useI18n();
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
          <div className={styles.arenaCard}>
            <div className={styles.arenaThumbnailWrapper}>
              <picture style={{ width: "100%", height: "100%", display: "block" }}>
                <source srcSet="/images/banners/arena-tournaments-card.webp" type="image/webp" />
                <img
                  src="/images/banners/arena-tournaments-card.jpg"
                  alt={dir === "rtl" ? "بطولات الأرينا والتحديات المباشرة" : "Pro Tournaments & Live Duels"}
                  className={styles.arenaThumbnailImg}
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <span className={styles.arenaLiveBadgeOverlay}>
                <span className={styles.pulseDot} />
                {dir === "rtl" ? "أرينا حية" : "LIVE ARENA"}
              </span>
            </div>

            <div className={styles.arenaCardHeader}>
              <h3 className={styles.cardTitle}>
                <LocaleLink href="/tournaments">
                  {dir === "rtl" ? "بطولات الأرينا والتحديات المباشرة" : "Pro Tournaments & Live Duels"}
                </LocaleLink>
              </h3>
            </div>
            <p className={styles.cardDescription}>
              {dir === "rtl"
                ? "انضم إلى جولات تنافسية بنظام خروج المغلوب، وتحدَّ نخبة لاعبي المنصة في منافسات مهارية خالية من الحظ مع تصنيفات ELO رسمية."
                : "Compete in single-elimination tournament brackets, challenge online members, and build your Global Skill rating."}
            </p>
            <div className={styles.arenaCardFooter}>
              <LocaleLink href="/tournaments">
                <Button variant="primary">
                  {dir === "rtl" ? "دخول صالة البطولات ←" : "Enter Tournament Arena →"}
                </Button>
              </LocaleLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
