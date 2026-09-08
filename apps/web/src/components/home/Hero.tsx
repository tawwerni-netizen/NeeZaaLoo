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
import styles from "./Hero.module.css";

const stage = (index: number, reduceMotion: boolean | null) => ({
  initial: reduceMotion ? {} : { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { ...transition.reveal, delay: reduceMotion ? 0 : index * 0.12 },
});

export function Hero() {
  const reduceMotion = useReducedMotion();
  const { t } = useI18n();

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
            <LocaleLink href="/learn">
              <Button variant="ghost">{t("home.hero.cta_secondary")}</Button>
            </LocaleLink>
          </motion.div>
        </div>

        <motion.div
          {...stage(2, reduceMotion)}
          className={styles.visual}
          aria-hidden="true"
        >
          <BoardGlyph />
        </motion.div>
      </div>
    </section>
  );
}

/** A restrained, geometric board motif -- orientation, not decoration. */
function BoardGlyph() {
  const cells = Array.from({ length: 64 });
  return (
    <div className={styles.board}>
      {cells.map((_, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const dark = (row + col) % 2 === 1;
        return <span key={i} className={dark ? styles.cellDark : styles.cellLight} />;
      })}
    </div>
  );
}
