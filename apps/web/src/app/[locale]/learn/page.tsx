"use client";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { listGames } from "@/lib/games";
import styles from "./learn.module.css";

export default function LearnPage() {
  const { t, dir } = useI18n();
  const isRtl = dir === "rtl";
  const games = listGames();

  return (
    <>
      <Header />
      <main className="nz-container" dir={isRtl ? "rtl" : "ltr"}>
        <header className={styles.head}>
          <h1 className={styles.heading}>{t("learnPage.heading")}</h1>
          <p className={styles.subhead}>{t("learnPage.subhead")}</p>
        </header>

        {/* How A Match Is Decided - Rich Visual Split Hero */}
        <section className={styles.section}>
          <div className={styles.howItDecidedContainer}>
            <div className={styles.howItDecidedContent}>
              <span className={styles.decidedBadge}>
                <span className={styles.pulseDot} />
                {isRtl ? "حوكمة اللعب النظيف 100%" : "SERVER-AUTHORITATIVE ENGINE"}
              </span>
              <h2 className={styles.sectionHeading}>{t("learnPage.how_heading")}</h2>
              <p className={styles.sectionBody}>{t("learnPage.how_body")}</p>

              <div className={styles.pillarsGrid}>
                <div className={styles.pillarCard}>
                  <div className={styles.pillarIcon}>⏱️</div>
                  <h4 className={styles.pillarTitle}>
                    {isRtl ? "ساعة الخادم ونقلات اللعب" : "Deterministic Clock"}
                  </h4>
                  <p className={styles.pillarDesc}>
                    {isRtl
                      ? "الخادم وحده هو من يقيس الوقت ويتحقق من صحة كل حركة فورياً."
                      : "Moves are server requests; time & rules are verified centrally."}
                  </p>
                </div>

                <div className={styles.pillarCard}>
                  <div className={styles.pillarIcon}>🛡️</div>
                  <h4 className={styles.pillarTitle}>
                    {isRtl ? "سجل النقلات المشفر" : "Cryptographic Audit"}
                  </h4>
                  <p className={styles.pillarDesc}>
                    {isRtl
                      ? "كل مباراة مسجلة بتسلسل زمني مشفر يمكن إعادة عرضه ومراجعته."
                      : "Immutable cryptographic event log replayable from move zero."}
                  </p>
                </div>

                <div className={styles.pillarCard}>
                  <div className={styles.pillarIcon}>⚖️</div>
                  <h4 className={styles.pillarTitle}>
                    {isRtl ? "صفر حظ وتلاعب" : "Zero Client Trust"}
                  </h4>
                  <p className={styles.pillarDesc}>
                    {isRtl
                      ? "لا يمكن لأي جهاز ادعاء الفوز أو التلاعب بساعة المباراة أبداً."
                      : "No client can assert a score or timeout. 100% fair play."}
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.howItDecidedVisual}>
              <img
                src="/images/banners/learn-match-decision.jpg"
                alt={isRtl ? "كيف تُحسم المباراة في نيزالو - محرك الخادم المستقل" : "How a match is decided - Server Engine"}
                className={styles.decidedImg}
              />
              <div className={styles.decidedImgOverlay} />
            </div>
          </div>
        </section>

        {/* Rules per Game Grid with Visual Thumbnails */}
        <section className={styles.section}>
          <div className={styles.rulesSectionHeader}>
            <span className={styles.sectionTag}>
              {isRtl ? "أدلة القواعد المعتمدة" : "OFFICIAL RULEBOOKS"}
            </span>
            <h2 className={styles.sectionHeading}>{t("learnPage.games_heading")}</h2>
            <p className={styles.sectionBody}>{t("learnPage.games_body")}</p>
          </div>

          <div className={styles.grid}>
            {games.map((game) => {
              const name = t(`common.game_names.${game.nameKey}`);
              const normId = game.id.replace(/_/g, "-");
              return (
                <div key={game.id} className={styles.card}>
                  <LocaleLink href={`/games/${game.id}`} className={styles.thumbnailLink}>
                    <div className={styles.cardThumbnailWrapper}>
                      <img
                        src={`/images/games/${normId}.jpg`}
                        alt={name}
                        className={styles.cardThumbnailImg}
                      />
                      <span className={styles.ruleBadge}>
                        {isRtl ? "دليل القواعد" : "RULES GUIDE"}
                      </span>
                    </div>
                  </LocaleLink>
                  <h3 className={styles.cardTitle}>
                    <LocaleLink href={`/games/${game.id}`}>{name}</LocaleLink>
                  </h3>
                  <p className={styles.cardBody}>{t(`home.games.${game.nameKey}.description`)}</p>
                  <div className={styles.cardActions}>
                    <LocaleLink href={`/games/${game.id}`} className={styles.cardCta}>
                      {isRtl ? `قوانين ${name} ←` : `${name} Rules →`}
                    </LocaleLink>
                    <LocaleLink href={`/play/${game.id}`} className={styles.cardPlayBtn}>
                      {isRtl ? "العب الآن" : "Play Now"}
                    </LocaleLink>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Fair Play Hub Link */}
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("learnPage.fair_heading")}</h2>
          <p className={styles.sectionBody}>{t("learnPage.fair_body")}</p>
          <LocaleLink href="/fair-play" className={styles.link}>{t("learnPage.fair_cta")}</LocaleLink>
        </section>
      </main>
      <Footer />
    </>
  );
}
