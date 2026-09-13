"use client";

/**
 * The homepage hero.
 *
 * UX objective: communicate the core loop (try -> compete -> improve ->
 * climb -> win) in one screen, with a single unambiguous primary action.
 * Psychological objective: curiosity and skill motivation -- "let's see
 * what I can do" -- never urgency or money pressure (docs/brand/
 * BRAND_GUIDELINES.md §8: cash is a section, not the homepage's anchor).
 *
 * Motion: a staged reveal (headline, then subhead, then CTA, then the
 * board), each stage 200ms apart -- long enough to read as sequence, short
 * enough to never feel slow. This is the ONE place a slightly longer
 * choreographed moment is justified (a first impression), everywhere else
 * defaults to the faster tokens. Respects prefers-reduced-motion: with it
 * set, everything appears at once, fully readable, nothing withheld.
 */
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { transition } from "@/lib/motion";
import { useI18n } from "@/lib/i18n/context";
import { listGames } from "@/lib/games";
import styles from "./Hero.module.css";

// The above-the-fold "Featured games" strip -- a handful of the real
// catalogue, not a separate/fabricated list. Kept short and compact on
// purpose: the full ten-game grid already exists below the fold (10 GAMES),
// so this strip's only job is a fast visual read, never a duplicate of it.
const FEATURED_COUNT = 6;

const stage = (index: number, reduceMotion: boolean | null) => ({
  initial: reduceMotion ? {} : { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { ...transition.reveal, delay: reduceMotion ? 0 : index * 0.12 },
});

export function Hero() {
  const reduceMotion = useReducedMotion();
  const { t } = useI18n();
  const featured = listGames().slice(0, FEATURED_COUNT);

  return (
    <section className={styles.hero}>
      <div className={`nz-container ${styles.inner}`}>
        <div className={styles.copy}>
          <motion.p {...stage(0, reduceMotion)} className={styles.eyebrow}>
            {t("home.hero.eyebrow")}
          </motion.p>
          <motion.h1 {...stage(1, reduceMotion)} className={styles.headline}>
            {t("home.hero.headline_line1")}
            <br />
            {t("home.hero.headline_line2")}
          </motion.h1>
          <motion.p {...stage(2, reduceMotion)} className={styles.subhead}>
            {t("home.hero.subhead")}
          </motion.p>
          <motion.div {...stage(3, reduceMotion)} className={styles.actions}>
            <LocaleLink href="/register">
              <Button variant="primary">{t("home.hero.cta_primary")}</Button>
            </LocaleLink>
            <LocaleLink href="/watch">
              <Button variant="ghost">{t("home.hero.cta_secondary")}</Button>
            </LocaleLink>
          </motion.div>

          {featured.length > 0 && (
            <motion.div {...stage(4, reduceMotion)} className={styles.featured}>
              <span className={styles.featuredLabel}>{t("home.hero.featured_heading")}</span>
              <div className={styles.featuredList}>
                {featured.map((game) => {
                  const name = t(`common.game_names.${game.nameKey}`);
                  return (
                    <LocaleLink key={game.id} href={`/play/${game.id}`} className={styles.featuredChip}>
                      <span className={styles.featuredGlyph} aria-hidden="true">{name.slice(0, 1)}</span>
                      {name}
                    </LocaleLink>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>

        <motion.div
          {...stage(2, reduceMotion)}
          className={styles.visual}
          aria-hidden="true"
        >
          <div className={styles.showcaseCard}>
            <img
              src="/images/banners/banner-global-arena.jpg"
              alt="Nizalo Competitive Skill Arena"
              className={styles.bannerImg}
            />
            <div className={styles.bannerOverlay} />
            
            <div className={styles.badgeArena}>
              <span className={styles.pulsingDot} />
              <span>LIVE SKILL ARENA</span>
            </div>

            <div className={styles.badgeCertified}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>100% FAIR PLAY</span>
            </div>

            <div className={styles.showcaseBottomBar}>
              <div>
                <h3 className={styles.showcaseTitle}>1v1 Blitz Tournaments</h3>
                <p className={styles.showcaseMeta}>Instant USDT Settlement • Certified Anti-Cheat</p>
              </div>
              <span className={styles.tagFairPlay}>PROVE & WIN</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
