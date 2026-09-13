"use client";

import { useMemo } from "react";
import { useI18n } from "@/lib/i18n/context";
import { UpcomingTournaments } from "@/components/tournaments/UpcomingTournaments";
import type { SupportedLocale } from "@/lib/i18n/locale";

type LocalizedBanner = {
  img: string;
  tag: Record<SupportedLocale, string>;
  title: Record<SupportedLocale, string>;
  desc: Record<SupportedLocale, string>;
};

const LOCALIZED_BANNERS: LocalizedBanner[] = [
  {
    img: "/images/tournaments/tournament-blitz-masters.jpg",
    tag: {
      ar: "⚡ مسرح المنافسات الحية",
      en: "⚡ Live Esports Stage",
      zh: "⚡ 实时电竞赛场",
      hi: "⚡ लाइव ई-स्पोर्ट्स मंच",
      es: "⚡ Escenario de Esports en Vivo",
      fr: "⚡ Scène Esports en Direct",
    },
    title: {
      ar: "أرينا أساتذة البليتز الخاطف",
      en: "Blitz Masters Arena",
      zh: "闪电大师竞技场",
      hi: "ब्लिट्ज़ मास्टर्स एरीना",
      es: "Arena de Maestros Blitz",
      fr: "Arène des Maîtres Blitz",
    },
    desc: {
      ar: "مواجهات سريعة بنظام خروج المغلوب مع بث مباشر للمشاهدين ونتائج حاسمة فورية.",
      en: "Fast-paced knockout brackets with real-time spectator streaming and instant results.",
      zh: "快节奏淘汰赛对决，支持观众实时观战与即时赛果结算。",
      hi: "रियल-टाइम दर्शक स्ट्रीमिंग और त्वरित परिणामों के साथ तेज़ गति वाले नॉकआउट ब्रैकेट।",
      es: "Cuadros de eliminación rápida con transmisión en directo para espectadores y resultados al instante.",
      fr: "Tableaux à élimination directe au rythme soutenu avec diffusion en direct et résultats instantanés.",
    },
  },
  {
    img: "/images/tournaments/tournament-weekend-knockout.jpg",
    tag: {
      ar: "🏆 كأس عطلة نهاية الأسبوع",
      en: "🏆 Weekend Cup",
      zh: "🏆 周末巅峰杯",
      hi: "🏆 सप्ताहांत कप",
      es: "🏆 Copa de Fin de Semana",
      fr: "🏆 Coupe du Week-end",
    },
    title: {
      ar: "بطولة خروج المغلوب الأسبوعية",
      en: "Weekend Knockout Championship",
      zh: "周末淘汰锦标赛",
      hi: "सप्ताहांत नॉकआउट चैम्पियनशिप",
      es: "Campeonato Eliminatorio de Fin de Semana",
      fr: "Championnat Éliminatoire du Week-end",
    },
    desc: {
      ar: "جولات متعددة بالنظام السويسري وخروج المغلوب حتى التتويج في النهائي الكبير.",
      en: "Multi-round Swiss & Single Elimination matches with grand finals.",
      zh: "多轮瑞士轮与单败淘汰赛制，角逐最终总决赛荣耀。",
      hi: "भव्य फाइनल के साथ बहु-चरणीय स्विस और सिंगल एलिमिनेशन मैच।",
      es: "Partidas suizas y de eliminación directa en varias rondas hasta la gran final.",
      fr: "Matchs suisses et à élimination directe en plusieurs tours menant à la grande finale.",
    },
  },
  {
    img: "/images/tournaments/tournament-speed-battle.jpg",
    tag: {
      ar: "⏱️ السرعة والبديهة الخاطفة",
      en: "⏱️ Bullet & Blitz",
      zh: "⏱️ 超快棋与闪击",
      hi: "⏱️ बुलेट एवं ब्लिट्ज़",
      es: "⏱️ Partidas Rápidas y Blitz",
      fr: "⏱️ Bullet & Blitz Rapide",
    },
    title: {
      ar: "أرينا معارك السرعة القصوى",
      en: "Speed Battle Arena",
      zh: "极速对决竞技场",
      hi: "स्पीड बैटल एरीना",
      es: "Arena de Batalla Rápida",
      fr: "Arène de Combat de Vitesse",
    },
    desc: {
      ar: "حركات فائقة السرعة مع زمن صفري للتأخير: مهارة نقية وردود أفعال ذهنية حاسمة.",
      en: "Ultra-fast turns with zero delay: pure reflexes and sharp mental strategy.",
      zh: "零延迟极速出招：纯粹考验敏锐反应与果断战术。",
      hi: "शून्य विलंब के साथ अल्ट्रा-फ़ास्ट टर्न: शुद्ध रिफ्लेक्स और तीव्र रणनीतिक सोच।",
      es: "Turnos ultrarrápidos sin retraso: puros reflejos y estrategia mental afilada.",
      fr: "Tours ultra-rapides sans délai : réflexes purs et stratégie mentale aiguisée.",
    },
  },
  {
    img: "/images/tournaments/tournament-midnight-flash.jpg",
    tag: {
      ar: "🌙 التحديات الليلية",
      en: "🌙 Night Arena",
      zh: "🌙 午夜竞技场",
      hi: "🌙 नाइट एरीना",
      es: "🌙 Arena Nocturna",
      fr: "🌙 Arène Nocturne",
    },
    title: {
      ar: "صراع السرعة الليلي الفلاش",
      en: "Midnight Flash Showdown",
      zh: "午夜闪电决战",
      hi: "मिडनाइट फ़्लैश शोडाउन",
      es: "Duelo Relámpago de Medianoche",
      fr: "Confrontation Flash de Minuit",
    },
    desc: {
      ar: "منافسات ليلية مكثفة للمحترفين عبر مختلف المناطق الزمنية حول العالم.",
      en: "Night-owl competitive brackets for global masters across all timezones.",
      zh: "专为全球夜战大师打造的跨时区高水准淘汰角逐。",
      hi: "सभी समय क्षेत्रों में वैश्विक मास्टर्स के लिए प्रतिस्पर्धी ब्रैकेट।",
      es: "Cuadros competitivos nocturnos para maestros globales en todas las zonas horarias.",
      fr: "Tournois nocturnes compétitifs pour les maîtres mondiaux de tous fuseaux horaires.",
    },
  },
  {
    img: "/images/tournaments/tournament-pro-bracket.jpg",
    tag: {
      ar: "👑 دوري النخبة للمحترفين",
      en: "👑 Pro Circuit",
      zh: "👑 职业巡回赛",
      hi: "👑 प्रो सर्किट",
      es: "👑 Circuito Profesional",
      fr: "👑 Circuit Pro",
    },
    title: {
      ar: "نهائيات دوري المحترفين الكبرى",
      en: "Pro League Final Bracket",
      zh: "职业联赛总决赛战圈",
      hi: "प्रो लीग फाइनल ब्रैकेट",
      es: "Cuadro Final de la Liga Pro",
      fr: "Tableau Final de la Ligue Pro",
    },
    desc: {
      ar: "مواجهات حاسمة بين أعلى المصنفين لفرض السيطرة المطلقة على قائمة الصدارة.",
      en: "Top ranked seeds clashing for verified leaderboard dominance.",
      zh: "顶尖种子选手正面硬碰硬，争夺官方天梯榜首统治地位。",
      hi: "सत्यापित लीडरबोर्ड वर्चस्व के लिए शीर्ष रैंक वाले खिलाड़ियों की भिड़ंत।",
      es: "Los mejores clasificados se enfrentan por el dominio verificado en la tabla.",
      fr: "Les têtes de série s'affrontent pour dominer le classement officiel.",
    },
  },
];

export function LandingTournaments() {
  const { t, locale } = useI18n();

  const banners = useMemo(() => {
    const loc = (locale as SupportedLocale) || "en";
    return LOCALIZED_BANNERS.map((b) => ({
      img: b.img,
      tag: b.tag[loc] ?? b.tag.en,
      title: b.title[loc] ?? b.title.en,
      desc: b.desc[loc] ?? b.desc.en,
    }));
  }, [locale]);

  return (
    <UpcomingTournaments
      heading={t("home.tournaments.heading")}
      emptyText={t("home.tournaments.empty")}
      viewAllHref="/tournaments"
      viewAllText={t("home.tournaments.view_all")}
      limit={4}
      banners={banners}
    />
  );
}

