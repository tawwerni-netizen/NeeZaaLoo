"use client";

import { useState, useEffect, useMemo } from "react";
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
      zh: "⚡ 即时结算",
      hi: "⚡ त्वरित भुगतान",
      es: "⚡ Pagos Instantáneos",
      fr: "⚡ Paiements Instantanés",
    },
    title: {
      ar: "سحوبات USDT مباشرة ومؤكدة",
      en: "Direct USDT Settlement",
      zh: "USDT 直接结算",
      hi: "प्रत्यक्ष USDT सेटलमेंट",
      es: "Liquidación Directa en USDT",
      fr: "Règlement Direct en USDT",
    },
    desc: {
      ar: "سحوبات تشفيرية شفافة بدون رسوم منصة على الأرباح المؤهلة.",
      en: "Transparent cryptographic withdrawals with zero platform fees on eligible earnings.",
      zh: "透明的加密货币提款，合规收益零平台手续费。",
      hi: "पात्र कमाई पर शून्य प्लेटफ़ॉर्म शुल्क के साथ पारदर्शी ब्लॉकचेन निकासी।",
      es: "Retiros criptográficos transparentes con cero comisiones de plataforma en ganancias elegibles.",
      fr: "Retraits cryptographiques transparents sans frais de plateforme sur les gains éligibles.",
    },
    cta: {
      ar: "فتح المحفظة",
      en: "Open Wallet",
      zh: "打开钱包",
      hi: "वॉलेट खोलें",
      es: "Abrir Billetera",
      fr: "Ouvrir le Portefeuille",
    },
  },
  {
    id: "skill",
    img: "/images/banners/banner-certified-skill.jpg",
    href: "/learn",
    tag: {
      ar: "🧠 مهارة معتمدة 100%",
      en: "🧠 Certified Skill",
      zh: "🧠 认证技巧",
      hi: "🧠 प्रमाणित कौशल",
      es: "🧠 Habilidad Certificada",
      fr: "🧠 Compétence Certifiée",
    },
    title: {
      ar: "100% استراتيجية ومهارة خالصة",
      en: "100% Pure Strategy & Skill",
      zh: "100% 纯粹策略与技巧",
      hi: "100% शुद्ध रणनीति एवं कौशल",
      es: "100% Estrategia y Habilidad Pura",
      fr: "100% Pure Stratégie et Habileté",
    },
    desc: {
      ar: "خوارزميات صفرية الصدفة والحظ. قواعد شفافة يتم التحقق منها عبر خادم مستقل.",
      en: "Zero chance, zero luck algorithms. Transparent rules verified on server-authoritative state.",
      zh: "零随机、无运气算法。透明规则经服务器权威状态严格验证。",
      hi: "शून्य संयोग, शून्य भाग्य एल्गोरिदम। सर्वर-सत्यापित पारदर्शी नियम।",
      es: "Cero azar, cero algoritmos de suerte. Reglas transparentes verificadas en el servidor.",
      fr: "Zéro hasard, zéro chance. Règles transparentes vérifiées sur l'état du serveur.",
    },
    cta: {
      ar: "استكشف القواعد",
      en: "Learn Rules",
      zh: "了解规则",
      hi: "नियम जानें",
      es: "Ver Reglas",
      fr: "Apprendre les Règles",
    },
  },
  {
    id: "cups",
    img: "/images/banners/banner-freeroll-cups.jpg",
    href: "/tournaments",
    tag: {
      ar: "🏅 الكؤوس والبطولات",
      en: "🏅 Daily Cups",
      zh: "🏅 每日锦标杯",
      hi: "🏅 दैनिक कप",
      es: "🏅 Copas Diarias",
      fr: "🏅 Coupes Quotidiennes",
    },
    title: {
      ar: "بطولات مصنفة وكؤوس يومية مجانية",
      en: "Ranked Tournaments & Free Cups",
      zh: "天梯排位赛与免费杯赛",
      hi: "रैंक्ड टूर्नामेंट और निःशुल्क कप",
      es: "Torneos Clasificatorios y Copas Gratis",
      fr: "Tournois Classés et Coupes Gratuites",
    },
    desc: {
      ar: "تنافس يومياً بنظام المجموعات السويسري وخروج المغلوب لتصدر لوحة الشرف.",
      en: "Compete daily in Swiss brackets, single elimination, and leaderboard qualifiers.",
      zh: "每日参与瑞士轮战圈、单败淘汰赛与天梯预选赛。",
      hi: "स्विस ब्रैकेट, सिंगल एलिमिनेशन और लीडरबोर्ड क्वालीफायर में प्रतिदिन मुकाबला करें।",
      es: "Compite a diario en cuadros suizos, eliminación directa y clasificatorios.",
      fr: "Participez quotidiennement à des tournois suisses et à élimination directe.",
    },
    cta: {
      ar: "عرض البطولات",
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
      ar: "🛡️ حراسة أمنية متقدمة",
      en: "🛡️ Sentinel Security",
      zh: "🛡️ 哨兵反作弊",
      hi: "🛡️ सेंटिनल सुरक्षा",
      es: "🛡️ Seguridad Sentinel",
      fr: "🛡️ Sécurité Sentinel",
    },
    title: {
      ar: "نظام مكافحة الغش التشفيري الحتمي",
      en: "Cryptographic Anti-Cheat System",
      zh: "密码学反作弊防御系统",
      hi: "क्रिप्टोग्राफ़िक एंटी-चीट सिस्टम",
      es: "Sistema Criptográfico Anti-Trampas",
      fr: "Système Cryptographique Anti-Triche",
    },
    desc: {
      ar: "تحقق كامل من كل حركة وتحليلات سلوكية فورية لحماية نزاهة كل مباراة.",
      en: "Full client-move verification and behavioral heuristics protecting every match.",
      zh: "全量客户端操作核验与实时行为启发式分析，保障每一局公正。",
      hi: "हर मैच की रक्षा करने वाला पूर्ण चाल सत्यापन और व्यवहार विश्लेषण।",
      es: "Verificación total de movimientos y análisis heurístico protegiendo cada partida.",
      fr: "Vérification complète des mouvements et analyses comportementales protégeant chaque match.",
    },
    cta: {
      ar: "ميثاق اللعب النظيف",
      en: "Fair Play Policy",
      zh: "公平守则",
      hi: "निष्पक्ष खेल नीति",
      es: "Juego Limpio",
      fr: "Jeu Équitable",
    },
  },
  {
    id: "leaderboard",
    img: "/images/banners/banner-global-leaderboard.jpg",
    href: "/rank",
    tag: {
      ar: "👑 لوحة المتصدرين",
      en: "👑 Leaderboards",
      zh: "👑 荣耀排行榜",
      hi: "👑 लीडरबोर्ड",
      es: "👑 Tablas de Clasificación",
      fr: "👑 Classements",
    },
    title: {
      ar: "قاعة المشاهير وخواتم التتويج الموسمية",
      en: "Hall of Fame & Seasonal Rings",
      zh: "名人堂与赛季荣耀之戒",
      hi: "हॉल ऑफ फेम एवं मौसमी रिंग्स",
      es: "Salón de la Fama y Anillos de Temporada",
      fr: "Temple de la Renommée et Anneaux Saisonniers",
    },
    desc: {
      ar: "ارتقِ في التصنيفات العالمية، واحصد شارات المواسم، وأثبت سيادتك بين الأساتذة.",
      en: "Climb the global ranks, claim seasonal badges, and prove master status.",
      zh: "攀登全球天梯，斩获赛季勋章，证明您的顶尖大师地位。",
      hi: "वैश्विक रैंकिंग में ऊपर चढ़ें, मौसमी बैज प्राप्त करें और मास्टर स्थिति साबित करें।",
      es: "Asciende en el ranking global, reclama insignias y demuestra tu estatus de maestro.",
      fr: "Grimpez dans les classements, obtenez des badges saisonniers et prouvez votre statut.",
    },
    cta: {
      ar: "تفقد الترتيب",
      en: "Check Rankings",
      zh: "查看排行",
      hi: "रैंकिंग देखें",
      es: "Ver Clasificación",
      fr: "Consulter le Classement",
    },
  },
  {
    id: "vip",
    img: "/images/banners/banner-vip-club.jpg",
    href: "/profile",
    tag: {
      ar: "💎 امتيازات الإتقان",
      en: "💎 Mastery Perks",
      zh: "💎 大师尊享特权",
      hi: "💎 मास्टरी सुविधाएं",
      es: "💎 Ventajas de Maestría",
      fr: "💎 Avantages de Maîtrise",
    },
    title: {
      ar: "مكافآت حصرية لفئات المحترفين",
      en: "Exclusive Mastery Tier Rewards",
      zh: "大师阶梯专属荣耀奖励",
      hi: "विशिष्ट मास्टरी टियर पुरस्कार",
      es: "Recompensas Exclusivas por Niveles",
      fr: "Récompenses Exclusives des Niveaux",
    },
    desc: {
      ar: "احصل على صور رمزية نادرة، ودعوات لبطولات كبرى خاصة، ومعالجة ذات أولوية.",
      en: "Earn custom avatars, exclusive tournament invitations, and priority processing.",
      zh: "获取专属头像、特邀锦标赛门票以及极速优先处理权益。",
      hi: "कस्टम अवतार, विशेष टूर्नामेंट आमंत्रण और प्राथमिकता प्रसंस्करण अर्जित करें।",
      es: "Consigue avatares personalizados, invitaciones exclusivas a torneos y prioridad.",
      fr: "Gagnez des avatars personnalisés, des invitations exclusives et un traitement prioritaire.",
    },
    cta: {
      ar: "استعراض المستويات",
      en: "View Tiers",
      zh: "查看阶梯",
      hi: "टियर देखें",
      es: "Ver Niveles",
      fr: "Voir les Niveaux",
    },
  },
  {
    id: "multilingual",
    img: "/images/banners/banner-multilingual-arena.jpg",
    href: "/games",
    tag: {
      ar: "🌍 مجتمع عالمي",
      en: "🌍 Global Community",
      zh: "🌍 全球竞技社区",
      hi: "🌍 वैश्विक समुदाय",
      es: "🌍 Comunidad Global",
      fr: "🌍 Communauté Mondiale",
    },
    title: {
      ar: "تنافس بـ 6 لغات عالمية معتمدة",
      en: "Play Across 6 Languages",
      zh: "支持 6 种主流语言竞技",
      hi: "6 भाषाओं में सहजता से खेलें",
      es: "Juega en 6 Idiomas Oficiales",
      fr: "Jouez dans 6 Langues Officielles",
    },
    desc: {
      ar: "ترجمة كاملة وتجربة متسقة بالعربية، الإنجليزية، الصينية، الإسبانية، الفرنسية، والهندية.",
      en: "Fully localized in Arabic, English, Chinese, Spanish, French, and Hindi.",
      zh: "阿拉伯语、英语、中文、西班牙语、法语与印地语全方位无缝本地化。",
      hi: "अरबी, अंग्रेजी, चीनी, स्पेनिश, फ्रेंच और हिंदी में पूरी तरह से स्थानीयकृत।",
      es: "Completamente traducido al árabe, inglés, chino, español, francés e hindi.",
      fr: "Entièrement traduit en arabe, anglais, chinois, espagnol, français et hindi.",
    },
    cta: {
      ar: "استكشف الألعاب",
      en: "Explore Games",
      zh: "探索游戏",
      hi: "खेल खोजें",
      es: "Explorar Juegos",
      fr: "Explorer les Jeux",
    },
  },
  {
    id: "platforms",
    img: "/images/banners/banner-mobile-desktop.jpg",
    href: "/register",
    tag: {
      ar: "📱 تجربة لعب متكاملة",
      en: "📱 Seamless Play",
      zh: "📱 多端无缝畅玩",
      hi: "📱 निर्बाध खेल",
      es: "📱 Juego Fluido",
      fr: "📱 Jeu Fluide",
    },
    title: {
      ar: "تزامن تام بين الموبايل والديسكتوب",
      en: "Mobile & Desktop Synchronized",
      zh: "手机与电脑端实时同步",
      hi: "मोबाइल और डेस्कटॉप सिंक्रनाइज़्ड",
      es: "Móvil y Escritorio Sincronizados",
      fr: "Mobile et Ordinateur Synchronisés",
    },
    desc: {
      ar: "ابدأ مباراتك على هاتفك وأكملها على حاسوبك دون أدنى تأخير في المزامنة.",
      en: "Start a match on your phone, finish on your desktop. Zero sync delay.",
      zh: "手机开局，电脑收官，状态秒级同步零延迟。",
      hi: "अपने फोन पर मैच शुरू करें, अपने डेस्कटॉप पर समाप्त करें। शून्य विलंब।",
      es: "Inicia la partida en tu móvil y termínala en tu escritorio sin retrasos.",
      fr: "Commencez un match sur mobile, terminez sur ordinateur sans aucun délai.",
    },
    cta: {
      ar: "العب الآن",
      en: "Play Now",
      zh: "立即畅玩",
      hi: "अभी खेलें",
      es: "Jugar Ahora",
      fr: "Jouer Maintenant",
    },
  },
];

export function ConversionBannerStrip() {
  const { locale, dir } = useI18n();
  const isRtl = dir === "rtl";
  const loc = (locale as SupportedLocale) || "en";

  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % MAIN_BANNERS.length);
    }, 6500);
    return () => clearInterval(timer);
  }, []);

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

  const active = banners[activeIdx] ?? banners[0]!;
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

        <div className={styles.carouselWrap}>
          <img src={active.img} alt={active.title} className={styles.bannerImg} />
          <div className={styles.bannerOverlay}>
            <div className={styles.bannerCopyCard}>
              <span className={styles.tagPill}>{active.tag}</span>
              <h3 className={styles.bannerTitle}>{active.title}</h3>
              <p className={styles.bannerDesc}>
                <bdi>{active.desc}</bdi>
              </p>
              <LocaleLink href={active.href} className={styles.ctaBtn}>
                <span>{active.cta}</span>
                <span aria-hidden="true">{isRtl ? "←" : "→"}</span>
              </LocaleLink>
            </div>
          </div>
        </div>

        <div className={styles.pillsNav}>
          {banners.map((b, i) => (
            <button
              key={b.id}
              className={`${styles.navPill} ${activeIdx === i ? styles.navPillActive : ""}`}
              onClick={() => setActiveIdx(i)}
            >
              {b.tag}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

