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
        {/* Cinematic Mega Hero Banner (similar to /home) */}
        <section className={styles.megaHero}>
          <div className={styles.megaHeroBackdrop} />
          <div className={styles.megaHeroGlow} />

          <div className={styles.megaHeroContent}>
            <div className={styles.heroBadges}>
              <span className={styles.heroTagBadge}>
                <span className={styles.pulseDot} />
                {isRtl ? "أكاديمية نزالو للمحترفين" : "NIZALO PRO ACADEMY"}
              </span>
              <span className={styles.heroVerifiedBadge}>
                {isRtl ? "⚡ 100% مهارة ذهنية حرة من الحظ" : "⚡ 100% PURE SKILL • ZERO LUCK"}
              </span>
            </div>

            <h1 className={styles.megaHeading}>
              {isRtl ? (
                <>
                  اتقن خفايا اللعب، <span className={styles.goldText}>اكتشف أسرار الفوز</span>، واربح بجدارة عقلك
                </>
              ) : (
                <>
                  Master the Meta, <span className={styles.goldText}>Unlock Victory Strategies</span>, and Win on Pure Skill
                </>
              )}
            </h1>

            <p className={styles.megaSubhead}>
              {isRtl
                ? "دليلك الاستراتيجي المعتمد لاحتراف ألعاب الذكاء التنافسية. تعلم أساليب الافتتاح، إدارة الوقت تحت الضغط، وتكتيكات الأبطال قبل دخول ساحة النزال الحقيقية."
                : "Your official tactical masterclass for competitive mind sports. Study deterministic openings, clock management under pressure, and champion heuristics before stepping into the arena."}
            </p>

            <div className={styles.megaActions}>
              <LocaleLink href="/games" className={styles.megaPlayBtn}>
                <span>⚔️</span> {isRtl ? "ابدأ اللعب الآن وجرب تكتيكاتك" : "Play Now & Test Your Tactics"}
              </LocaleLink>
              <LocaleLink href="/tournaments" className={styles.megaTourneyBtn}>
                <span>🏆</span> {isRtl ? "تصفح البطولات المفتوحة" : "Browse Active Tournaments"}
              </LocaleLink>
            </div>

            {/* Quick Authority Stats Bar */}
            <div className={styles.statsStrip}>
              <div className={styles.statItem}>
                <span className={styles.statVal}>10</span>
                <span className={styles.statDesc}>{isRtl ? "ألعاب استراتيجية معتمدة" : "Deterministic Games"}</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statItem}>
                <span className={styles.statVal}>0%</span>
                <span className={styles.statDesc}>{isRtl ? "عناصر حظ (مهارة 100%)" : "Luck or RNG (100% Pure Skill)"}</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statItem}>
                <span className={styles.statVal}>&lt; 1s</span>
                <span className={styles.statDesc}>{isRtl ? "تسوية فورية للجوائز" : "Instant Settlement"}</span>
              </div>
            </div>
          </div>
        </section>

        {/* How A Match Is Decided - Server Determinism */}
        <section className={styles.section}>
          <div className={styles.howItDecidedContainer}>
            <div className={styles.howItDecidedContent}>
              <span className={styles.decidedBadge}>
                <span className={styles.pulseDotGreen} />
                {isRtl ? "حوكمة اللعب النظيف ومكافحة التلاعب" : "SERVER-AUTHORITATIVE ENGINE"}
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

              <div className={styles.pillarPlayCtaWrap}>
                <LocaleLink href="/games" className={styles.pillarPlayCta}>
                  ⚔️ {isRtl ? "ادخل الميدان العادل وتحدَّ منافسك الآن" : "Enter the Fair Arena & Duel Now"}
                </LocaleLink>
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

        {/* Rules per Game Grid with Visual Thumbnails & Strategy Badges */}
        <section className={styles.section}>
          <div className={styles.rulesSectionHeader}>
            <span className={styles.sectionTag}>
              {isRtl ? "أدلة القواعد والاستراتيجيات المعتمدة" : "OFFICIAL RULEBOOKS & TACTICS"}
            </span>
            <h2 className={styles.sectionHeading}>{t("learnPage.games_heading")}</h2>
            <p className={styles.sectionBody}>
              {isRtl
                ? "اختر لعبتك المفضلة، ادرس تكتيكات الفوز وإدارة الوقت، ثم توجه فوراً لمواجهة لاعبين حقيقيين وإثبات مهارتك."
                : t("learnPage.games_body")}
            </p>
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
                        {isRtl ? "أسرار الاحتراف ⚡" : "PRO STRATEGY ⚡"}
                      </span>
                    </div>
                  </LocaleLink>
                  <h3 className={styles.cardTitle}>
                    <LocaleLink href={`/games/${game.id}`}>{name}</LocaleLink>
                  </h3>
                  <p className={styles.cardBody}>{t(`home.games.${game.nameKey}.description`)}</p>
                  <div className={styles.cardActions}>
                    <LocaleLink href={`/play/${game.id}`} className={styles.cardPlayBtn}>
                      ⚔️ {isRtl ? "العب الآن" : "Play Now"}
                    </LocaleLink>
                    <LocaleLink href={`/games/${game.id}`} className={styles.cardCta}>
                      📖 {isRtl ? "القواعد والتكتيك" : "Rules & Tactics"}
                    </LocaleLink>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Fair Play Hub Link */}
        <section className={styles.fairPlayBanner}>
          <div className={styles.fairPlayContent}>
            <span className={styles.fairPlayTag}>{isRtl ? "ميثاق النزاهة والشفافية" : "INTEGRITY CHARTER"}</span>
            <h2 className={styles.fairPlayHeading}>{t("learnPage.fair_heading")}</h2>
            <p className={styles.fairPlayBody}>{t("learnPage.fair_body")}</p>
            <LocaleLink href="/fair-play" className={styles.fairPlayBtn}>
              🛡️ {t("learnPage.fair_cta")}
            </LocaleLink>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
