"use client";

import { use } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { JsonLd } from "@/components/seo/JsonLd";
import { EDITORIAL_ARTICLES_MAP, type EditorialArticle } from "@/lib/editorial/articles-map";
import styles from "./article.module.css";

export default function EditorialArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = use(params);
  const isRtl = locale === "ar";

  const article = EDITORIAL_ARTICLES_MAP.find((a) => a.slug === slug);

  if (!article) {
    return (
      <>
        <Header />
        <main className="nz-container" style={{ paddingBlock: "80px", textAlign: "center" }}>
          <h1>{isRtl ? "المقال غير موجود" : "Article Not Found"}</h1>
          <p style={{ color: "var(--nz-text-2)", marginTop: "12px" }}>
            {isRtl
              ? "لم يتم العثور على الدليل المطلوب. يمكنك استعراض جميع المقالات والألعاب عبر الروابط أدناه."
              : "The requested editorial guide could not be located."}
          </p>
          <LocaleLink href="/learn" style={{ display: "inline-block", marginTop: "24px" }}>
            <Button variant="primary">{isRtl ? "العودة إلى الأكاديمية" : "Back to Academy"}</Button>
          </LocaleLink>
        </main>
        <Footer />
      </>
    );
  }

  const title = isRtl && article.titleAr ? article.titleAr : article.title;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nizalo.com";
  const canonicalUrl = `${siteUrl}/${locale}/learn/${article.slug}`;

  // Related articles
  const related = EDITORIAL_ARTICLES_MAP.filter((a) =>
    article.relatedArticles.includes(a.id)
  ).slice(0, 4);

  // Structured Data (Article & Breadcrumbs)
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: isRtl ? "الرئيسية" : "Home",
        item: `${siteUrl}/${locale}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: isRtl ? "الأكاديمية والدلائل" : "Academy",
        item: `${siteUrl}/${locale}/learn`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: title,
        item: canonicalUrl,
      },
    ],
  };

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: `${title} - In-depth competitive analysis, tactics, and strategic principles on Nizalo Arena.`,
    inLanguage: locale,
    url: canonicalUrl,
    author: {
      "@type": "Organization",
      name: "Nizalo Editorial Board",
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "Nizalo Arena",
      url: siteUrl,
    },
    datePublished: "2026-09-01T00:00:00Z",
    dateModified: "2026-09-13T00:00:00Z",
  };

  const ctaGameLink = article.gameId ? `/play/${article.gameId}` : "/games";
  const coreCtaText = isRtl ? "اثبت مهارتك. العب. اكسب." : "PROVE. PLAY. WIN.";
  const prizeNotice = isRtl
    ? "اكسب الجوائز عبر منافسات المهارة المؤهلة"
    : "earn prizes through eligible skill competitions";

  return (
    <>
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={articleLd} />

      <Header />
      <main className="nz-container" dir={isRtl ? "rtl" : "ltr"}>
        {/* Breadcrumbs */}
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <LocaleLink href="/" className={styles.breadcrumbLink}>
            {isRtl ? "الرئيسية" : "Home"}
          </LocaleLink>
          <span className={styles.breadcrumbSep}>/</span>
          <LocaleLink href="/learn" className={styles.breadcrumbLink}>
            {isRtl ? "الأكاديمية" : "Academy"}
          </LocaleLink>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbCurrent}>{title}</span>
        </nav>

        {/* Header */}
        <header className={styles.articleHeader}>
          <div className={styles.badgeRow}>
            <span className={styles.typeBadge}>
              {article.type === "PILLAR"
                ? isRtl ? "دليل استراتيجي رئيسي" : "Pillar Playbook"
                : isRtl ? "تحليل تكتيكي تخصصي" : "Tactical Guide"}
            </span>
            <span className={styles.keywordBadge}>#{article.keyword}</span>
            {article.gameId && (
              <span className={styles.keywordBadge} style={{ textTransform: "uppercase" }}>
                {article.gameId.replace("-", " ")}
              </span>
            )}
          </div>

          <h1 className={styles.heading}>{title}</h1>

          <div className={styles.metaInfo}>
            <span>{isRtl ? "هيئة تحرير Nizalo" : "Nizalo Editorial Board"}</span>
            <span>•</span>
            <span>{article.type === "PILLAR" ? "8 min read" : "5 min read"}</span>
            <span>•</span>
            <span>{isRtl ? "مُحدّث لعام 2026" : "Updated 2026"}</span>
          </div>
        </header>

        {/* Layout: Main Article + Sidebar */}
        <div className={styles.articleLayout}>
          <article className={styles.articleBody}>
            {/* Visual Concept representation */}
            <div className={styles.visualCard}>
              <div className={styles.visualCardHeading}>
                {isRtl ? "الرؤية البصرية للأرينا" : "Arena Visual Concept"}
              </div>
              <p className={styles.visualCardText}>{article.visualConcept}</p>
            </div>

            <h2 className={styles.sectionTitle}>
              {isRtl ? "1. التأسيس النظري والفلسفة التنافسية" : "1. Theoretical Foundations & Mindset"}
            </h2>
            <p className={styles.paragraph}>
              {isRtl
                ? `تعتبر ساحة ${title} ميداناً حقيقياً لاختبار نقاء القرار التنافسي. في بيئات ألعاب المهارة الصرفة، يتم تحييد كل عناصر الصدفة ليبقى التقييم منصباً فقط على عمق الحساب، وهندسة الانتشار، والتحكم المطلق في تدفق الوقت.`
                : `In high-tier competitive play, "${title}" represents a pure battleground of cognitive discipline. By eliminating random variance, every outcome maps directly to calculation depth, structural understanding, and psychological composure.`}
            </p>
            <p className={styles.paragraph}>
              {isRtl
                ? "يتميز اللاعب المتمرس بقدرته على استباق سيناريوهات الخصم قبل تشكلها بثلاث نقلات على الأقل، مع الحفاظ على مرونة دفاعية تمنع الثغرات الهيكلية في اللحظات الحرجة."
                : "Mastery requires anticipating branch points before they solidify on the board. The decisive factor is not merely finding the optimal immediate move, but constraining your opponent's future branching factor while preserving multiple tactical threats."}
            </p>

            <div className={styles.keyTakeaway}>
              <div className={styles.keyTakeawayHeading}>
                {isRtl ? "القاعدة الذهبية للاحتراف" : "Core Takeaway"}
              </div>
              <p style={{ margin: 0, fontSize: "14px", color: "var(--nz-text)" }}>
                {isRtl
                  ? "لا تنفذ نقلة لمجرد أنها تبدو جيدة؛ اختبر دائماً رد الخصم الأكثر إحكاماً قبل الالتزام."
                  : "Never play a move simply because it appears advantageous. Always calculate your opponent's sharpest rebuttal before committing."}
              </p>
            </div>

            <h2 className={styles.sectionTitle}>
              {isRtl ? "2. المبادئ التكتيكية وإدارة الموارد" : "2. Tactical Principles & Execution"}
            </h2>
            <p className={styles.paragraph}>
              {isRtl
                ? "تتطلب الإدارة الاحترافية للمباراة التوفيق المستمر بين سرعة التنفيذ والدقة الحسابية. في منصة Nizalo، حيث يُدار التوقيت بمؤقتات رقمية مركزية فائقة الدقة، يصبح توفير الثواني في المراحل المبكرة رصيداً حاسماً في نهايات الأدوار المعقدة."
                : "Clock management is an active weapon in live arena play. With millisecond-precise server clocks, preserving time during opening book execution directly finances deeper calculation reserves when tactical crises erupt."}
            </p>

            <h2 className={styles.sectionTitle}>
              {isRtl ? "3. أسلوب التفكير في اللحظات الحاسمة" : "3. Decision Making Under Clock Pressure"}
            </h2>
            <p className={styles.paragraph}>
              {isRtl
                ? "عندما يقل الوقت المتبقي، تجنب الحسابات الطويلة غير المضمونة، وركز على النقلات الصلبة التي تجبر الخصم على الرد وتمنعه من تنظيم هجوم مضاد."
                : "Under severe clock constraints, shift from expansive positional calculations to concrete, forcing moves (checks, captures, dual threats) that simplify branching complexity and transfer cognitive burden to your rival."}
            </p>

            {/* Core CTA */}
            <div className={styles.ctaCard}>
              <div className={styles.ctaBanner}>{coreCtaText}</div>
              <LocaleLink href={ctaGameLink}>
                <Button variant="primary">
                  {article.cta === "PLAY NOW"
                    ? isRtl ? "ابدأ التحدي الآن" : "Play Now"
                    : article.cta === "JOIN TOURNAMENT"
                    ? isRtl ? "انضم إلى البطولة" : "Join Tournament"
                    : isRtl ? "جرّب اللعبة الآن" : "Try The Game"}
                </Button>
              </LocaleLink>
              <p className={styles.complianceNote}>{prizeNotice}</p>
            </div>
          </article>

          {/* Sidebar */}
          <aside className={styles.sidebar}>
            {/* Internal Links */}
            <div className={styles.sidebarCard}>
              <div className={styles.sidebarTitle}>
                {isRtl ? "روابط سريعة ذات صلة" : "Quick References"}
              </div>
              <ul className={styles.linkList}>
                {article.internalLinks.map((link, idx) => (
                  <li key={idx}>
                    <LocaleLink href={link} className={styles.sidebarLink}>
                      → {link.replace("/", "").replace("-", " ").toUpperCase() || "HOME"}
                    </LocaleLink>
                  </li>
                ))}
                <li>
                  <LocaleLink href="/games" className={styles.sidebarLink}>
                    → {isRtl ? "دليل الألعاب الكامل" : "ALL SKILL GAMES"}
                  </LocaleLink>
                </li>
                <li>
                  <LocaleLink href="/fair-play" className={styles.sidebarLink}>
                    → {isRtl ? "ميثاق النزاهة واللعب النظيف" : "FAIR PLAY PROTOCOL"}
                  </LocaleLink>
                </li>
                <li>
                  <LocaleLink href="/help" className={styles.sidebarLink}>
                    → {isRtl ? "السياسات والشروط الرسمية" : "TERMS & POLICIES"}
                  </LocaleLink>
                </li>
              </ul>
            </div>

            {/* Related Articles */}
            {related.length > 0 && (
              <div className={styles.sidebarCard}>
                <div className={styles.sidebarTitle}>
                  {isRtl ? "مقالات ودلائل مقترحة" : "Related Guides"}
                </div>
                <ul className={styles.linkList}>
                  {related.map((rel) => (
                    <li key={rel.id}>
                      <LocaleLink href={`/learn/${rel.slug}`} className={styles.sidebarLink}>
                        • {isRtl && rel.titleAr ? rel.titleAr : rel.title}
                      </LocaleLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
