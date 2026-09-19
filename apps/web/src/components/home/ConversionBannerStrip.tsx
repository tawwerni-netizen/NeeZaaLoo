"use client";

import { useState, useMemo } from "react";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import type { SupportedLocale } from "@/lib/i18n/locale";
import styles from "./ConversionBannerStrip.module.css";

const SECTION_STRINGS: Record<SupportedLocale, { heading: string; subheading: string }> = {
  ar: {
    heading: "لماذا يختار المنافسون منصة نيزالو؟",
    subheading: "هندسة برمجية متطورة مصممة للنزاهة التنافسية المطلقة وبناء الثقة الفورية للاعبين.",
  },
  en: {
    heading: "Why Competitors Choose Nizalo",
    subheading: "Engineered for pure competitive integrity and instant player trust.",
  },
  zh: {
    heading: "为什么竞技玩家选择 Nizalo？",
    subheading: "专为纯粹的竞技公平与玩家即时信任而构建的高性能架构。",
  },
  hi: {
    heading: "प्रतियोगी Nizalo को क्यों चुनते हैं?",
    subheading: "विशुद्ध प्रतिस्पर्धी निष्पक्षता और त्वरित खिलाड़ी विश्वास के लिए निर्मित उन्नत मंच।",
  },
  es: {
    heading: "¿Por qué los competidores eligen Nizalo?",
    subheading: "Diseñado para la máxima integridad competitiva y la confianza instantánea de los jugadores.",
  },
  fr: {
    heading: "Pourquoi les compétiteurs choisissent Nizalo ?",
    subheading: "Conçu pour une intégrité compétitive pure et une confiance immédiate des joueurs.",
  },
};

type LocalizedBanner = {
  id: string;
  img: string;
  href: string;
  tag: Record<SupportedLocale, string>;
  title: Record<SupportedLocale, string>;
  desc: Record<SupportedLocale, string>;
  cta: Record<SupportedLocale, string>;
};

const MAIN_BANNERS: LocalizedBanner[] = [
  {
    id: "arena",
    img: "/images/banners/banner-global-arena.jpg",
    href: "/games",
    tag: {
      ar: "🏆 الأرينا العالمية",
      en: "🏆 Global Arena",
      zh: "🏆 全球竞技场",
      hi: "🏆 ग्लोबल एरीना",
      es: "🏆 Arena Global",
      fr: "🏆 Arène Mondiale",
    },
    title: {
      ar: "بطولات المهارة والسيادة التنافسية",
      en: "Sovereign Skill Championship",
      zh: "巅峰技巧锦标赛",
      hi: "कौशल चैम्पियनशिप",
      es: "Campeonato Soberano de Habilidad",
      fr: "Championnat Souverain de Compétence",
    },
    desc: {
      ar: "أرينا تنافسية 1 ضد 1 حيث يحسم الذكاء الاستراتيجي وسرعة البديهة مصير الفوز.",
      en: "1v1 competitive arena where strategic intelligence and reflexes determine victory.",
      zh: "1v1 竞技对战，战略智慧与瞬时反应决定最终胜负。",
      hi: "1v1 प्रतिस्पर्धी क्षेत्र जहां रणनीतिक बुद्धिमत्ता और रिफ्लेक्स जीत तय करते हैं।",
      es: "Arena competitiva 1c1 donde la inteligencia estratégica y los reflejos determinan la victoria.",
      fr: "Arène compétitive 1v1 où l'intelligence stratégique et les réflexes déterminent la victoire.",
    },
    cta: {
      ar: "ادخل الأرينا",
      en: "Join Arena",
      zh: "加入赛场",
      hi: "एरीना में शामिल हों",
      es: "Unirse a la Arena",
      fr: "Rejoindre l'Arène",
    },
  },
  {
    id: "payouts",
    img: "/images/banners/banner-instant-payouts.jpg",
    href: "/wallet",
    tag: {
      ar: "⚡ تسوية فورية",
      en: "⚡ Instant Payouts",
      zh: "⚡ 秒速提现",
      hi: "⚡ त्वरित भुगतान",
      es: "⚡ Pagos Instantáneos",
      fr: "⚡ Paiements Instantanés",
    },
    title: {
      ar: "دفعات فورية غير قابلة للاحتجاز",
      en: "Non-Custodial Instant Rewards",
      zh: "非托管式即时奖金结算",
      hi: "गैर-कस्टोडियल त्वरित पुरस्कार",
      es: "Recompensas Instantáneas No Custodiadas",
      fr: "Récompenses Instantanées Non Dépositaires",
    },
    desc: {
      ar: "تصل جوائزك مباشرة إلى محفظتك في ثوانٍ بفضل تقنية العقود الذكية لضمان حقك فور انتهاء النزال.",
      en: "Your winnings hit your wallet in seconds via on-chain smart contracts. Zero delays.",
      zh: "对局结束，奖金通过链上智能合约即刻发放至您的钱包。零延迟，绝对透明。",
      hi: "आपकी जीत ऑन-चेन स्मार्ट कॉन्ट्रैक्ट्स के माध्यम से सेकंडों में आपके वॉलेट में आ जाती है। शून्य विलंब।",
      es: "Tus ganancias llegan a tu billetera en segundos mediante contratos inteligentes en cadena. Cero retrasos.",
      fr: "Vos gains arrivent dans votre portefeuille en quelques secondes via des contrats intelligents on-chain. Zéro délai.",
    },
    cta: {
      ar: "اكتشف المحفظة",
      en: "Explore Wallet",
      zh: "探索钱包",
      hi: "वॉलेट देखें",
      es: "Explorar Billetera",
      fr: "Explorer le Portefeuille",
    },
  },
  {
    id: "tournaments",
    img: "/images/banners/banner-tournaments.jpg",
    href: "/tournaments",
    tag: {
      ar: "🌍 بطولات ضخمة",
      en: "🌍 Major Tournaments",
      zh: "🌍 大型锦标赛",
      hi: "🌍 प्रमुख टूर्नामेंट",
      es: "🌍 Grandes Torneos",
      fr: "🌍 Tournois Majeurs",
    },
    title: {
      ar: "نظام إقصاء متطور ومنافسات كبرى",
      en: "Advanced Knockout Systems",
      zh: "高级淘汰晋级系统",
      hi: "उन्नत नॉकआउट सिस्टम",
      es: "Sistemas Avanzados de Eliminación",
      fr: "Systèmes d'Élimination Avancés",
    },
    desc: {
      ar: "شارك في بطولات ضخمة بنظام الإقصاء أو السويسري ونافس النخبة على جوائز مالية قيّمة.",
      en: "Compete in massive Swiss or Elimination bracket tournaments against the elite for massive prizes.",
      zh: "参与庞大的瑞士轮或单败淘汰赛制锦标赛，与精英对决，赢取巨额奖金。",
      hi: "विशाल स्विस या एलिमिनेशन ब्रैकेट टूर्नामेंट में अभिजात वर्ग के खिलाफ प्रतिस्पर्धा करें।",
      es: "Compite en torneos masivos suizos o de eliminación directa contra la élite por grandes premios.",
      fr: "Participez à des tournois massifs en système suisse ou à élimination directe contre l'élite.",
    },
    cta: {
      ar: "تصفح البطولات",
      en: "View Tournaments",
      zh: "查看比赛",
      hi: "टूर्नामेंट देखें",
      es: "Ver Torneos",
      fr: "Voir les Tournois",
    },
  },
  {
    id: "fast",
    img: "/images/banners/banner-fast-matchmaking.jpg",
    href: "/games",
    tag: {
      ar: "⏱️ تطابق خلال 5 ثوانٍ",
      en: "⏱️ 5s Matchmaking",
      zh: "⏱️ 5秒匹配",
      hi: "⏱️ 5 सेकंड मैचमेकिंग",
      es: "⏱️ Emparejamiento en 5s",
      fr: "⏱️ Matchmaking en 5s",
    },
    title: {
      ar: "تطابق ذكي فوري حول العالم",
      en: "Instant Global Matchmaking",
      zh: "全球即时精准匹配",
      hi: "त्वरित वैश्विक मैचमेकिंग",
      es: "Emparejamiento Global Instantáneo",
      fr: "Matchmaking Mondial Instantané",
    },
    desc: {
      ar: "واجه لاعبين حقيقيين يطابقون تصنيف ELO الخاص بك بدقة في أقل من خمس ثوانٍ.",
      en: "Match with real players of your exact ELO rating in under five seconds.",
      zh: "五秒之内，为您精准匹配同等 ELO 天梯分数的真实对手。",
      hi: "पाँच सेकंड से कम समय में अपनी सटीक ELO रेटिंग के वास्तविक खिलाड़ियों से मिलें।",
      es: "Empareja con jugadores reales de tu misma calificación ELO en menos de cinco segundos.",
      fr: "Affrontez de vrais joueurs ayant exactement votre classement ELO en moins de 5 secondes.",
    },
    cta: {
      ar: "ابحث عن مباراة",
      en: "Find Match",
      zh: "开始对局",
      hi: "मैच खोजें",
      es: "Buscar Partida",
      fr: "Trouver un Match",
    },
  },
  {
    id: "anticheat",
    img: "/images/banners/banner-anti-cheat.jpg",
    href: "/fair-play",
    tag: {
      ar: "🛡️ حراسة سيبرانية",
      en: "🛡️ Cyber Overwatch",
      zh: "🛡️ 赛博防作弊",
      hi: "🛡️ साइबर ओवरवॉच",
      es: "🛡️ CiberVigilancia",
      fr: "🛡️ CyberSurveillance",
    },
    title: {
      ar: "نظام حماية متقدم ضد الغش",
      en: "Advanced Anti-Cheat Matrix",
      zh: "高级反作弊矩阵",
      hi: "उन्नत एंटी-चीट मैट्रिक्स",
      es: "Matriz Avanzada Anti-Trampas",
      fr: "Matrice Anti-Triche Avancée",
    },
    desc: {
      ar: "تقنيات تحليل سلوك مدعومة بالذكاء الاصطناعي لضمان اللعب النظيف ومعاقبة الغشاشين فوراً.",
      en: "AI-driven behavioral analysis ensures fair play and permanently bans cheaters.",
      zh: "基于 AI 的行为分析系统，确保竞技绝对公平，严惩作弊者。",
      hi: "AI-संचालित व्यवहार विश्लेषण निष्पक्ष खेल सुनिश्चित करता है।",
      es: "El análisis de comportamiento impulsado por IA asegura el juego limpio.",
      fr: "L'analyse comportementale par IA garantit un jeu équitable et bannit les tricheurs.",
    },
    cta: {
      ar: "تفاصيل الحماية",
      en: "Security Details",
      zh: "安全详情",
      hi: "सुरक्षा विवरण",
      es: "Detalles de Seguridad",
      fr: "Détails de Sécurité",
    },
  },
];

export function ConversionBannerStrip() {
  const { locale, dir } = useI18n();
  const isRtl = dir === "rtl";
  const loc = (locale as SupportedLocale) || "en";

  const [activeIdx, setActiveIdx] = useState(0);

  const banners = useMemo(() => {
    return MAIN_BANNERS.map((b) => ({
      id: b.id,
      img: b.img,
      href: b.href,
      tag: b.tag[loc] ?? b.tag.en,
      title: b.title[loc] ?? b.title.en,
      desc: b.desc[loc] ?? b.desc.en,
      cta: b.cta[loc] ?? b.cta.en,
    }));
  }, [loc]);

  const strings = SECTION_STRINGS[loc] ?? SECTION_STRINGS.en;

  return (
    <section className={styles.section} dir={isRtl ? "rtl" : "ltr"}>
      <div className="nz-container">
        <div className={styles.headerRow}>
          <div>
            <h2 className={styles.heading}>{strings.heading}</h2>
            <p className={styles.subheading}>{strings.subheading}</p>
          </div>
        </div>

        <div className={styles.accordionContainer}>
          {banners.map((b, idx) => {
            const isActive = activeIdx === idx;
            return (
              <div
                key={b.id}
                className={`${styles.accordionItem} ${isActive ? styles.accordionItemActive : ""}`}
                onMouseEnter={() => setActiveIdx(idx)}
              >
                <img
                  src={b.img}
                  alt={b.title}
                  className={styles.bannerImg}
                  loading="lazy"
                  decoding="async"
                />
                <div className={styles.bannerOverlay} />
                <div className={styles.contentWrapper}>
                  <span className={styles.tagPill}>{b.tag}</span>
                  <h3 className={styles.bannerTitle}>{b.title}</h3>
                  <p className={styles.bannerDesc}>
                    <bdi>{b.desc}</bdi>
                  </p>
                  <LocaleLink href={b.href} className={styles.ctaBtn}>
                    <span>{b.cta}</span>
                    <span aria-hidden="true">{isRtl ? "←" : "→"}</span>
                  </LocaleLink>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
