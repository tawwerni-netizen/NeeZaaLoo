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
    img: "/images/banners/tournament-banner-1.jpg",
    tag: {
      ar: "🏆 بطولات نيزالو الكبرى · العب واكسب بجدارة",
      en: "🏆 Grand Nizalo Tournaments · Play & Win With Merit",
      zh: "🏆 尼扎洛巅峰大奖赛 · 凭实力赢荣耀",
      hi: "🏆 निज़ालो ग्रांड टूर्नामेंट · योग्यता से खेलें और जीतें",
      es: "🏆 Grandes Torneos Nizalo · Juega y Gana con Mérito",
      fr: "🏆 Grands Tournois Nizalo · Jouez et Gagnez avec Mérite",
    },
    title: {
      ar: "كأس الأساطير الأسبوعي للنزالات الكبرى",
      en: "Grand Legends Arena Championship",
      zh: "传奇大师周常巅峰争霸赛",
      hi: "ग्रैंड लीजेंड्स एरीना चैंपियनशिप",
      es: "Campeonato Grand Legends Arena",
      fr: "Championnat Grand Legends Arena",
    },
    desc: {
      ar: "مواجهات استراتيجية كبرى في الشطرنج، الطاولة، والدومينو بجوائز كبرى وحسم فوري.",
      en: "Premier strategic tournaments across Chess, Backgammon, and Dominoes with instant payouts.",
      zh: "涵盖国际象棋、西洋双陆棋与西洋跳棋的高额奖池官方锦标赛，即刻结算。",
      hi: "शतरंज, बैकगैमौन और डोमिनोज़ में तत्काल भुगतान के साथ प्रमुख रणनीतिक टूर्नामेंट।",
      es: "Grandes torneos estratégicos en Ajedrez, Backgammon y Dominó con pagos instantáneos.",
      fr: "Tournois stratégiques majeurs aux Échecs, Backgammon et Dominos avec paiements instantanés.",
    },
  },
  {
    img: "/images/banners/tournament-banner-2.jpg",
    tag: {
      ar: "⚡ بطولات نيزالو الكبرى · العب واكسب بجدارة",
      en: "⚡ Grand Nizalo Tournaments · Play & Win With Merit",
      zh: "⚡ 尼扎洛巅峰大奖赛 · 凭实力赢荣耀",
      hi: "⚡ निज़ालो ग्रांड टूर्नामेंट · योग्यता से खेलें और जीतें",
      es: "⚡ Grandes Torneos Nizalo · Juega y Gana con Mérito",
      fr: "⚡ Grands Tournois Nizalo · Jouez et Gagnez avec Mérite",
    },
    title: {
      ar: "بطولة خروج المغلوب السريع (Knockout Blitz)",
      en: "Weekend Knockout Blitz Cup",
      zh: "周末闪击快速淘汰杯赛",
      hi: "सप्ताहांत नॉकआउट ब्लिट्ज़ कप",
      es: "Copa Knockout Blitz de Fin de Semana",
      fr: "Coupe Knockout Blitz du Week-end",
    },
    desc: {
      ar: "جولات حاسمة بنظام خروج المغلوب مع تحكيم خادم مشفّر ونزاهة كاملة 100%.",
      en: "Single-elimination knockout brackets backed by 100% cryptographic server integrity.",
      zh: "单败淘汰制巅峰对抗，由100%密码学服务器裁决系统保障绝对公平。",
      hi: "100% क्रिप्टोग्राफिक सर्वर अखंडता द्वारा समर्थित सिंगल-एलिमिनेशन नॉकआउट ब्रैकेट।",
      es: "Cuadros de eliminación directa respaldados por un 100% de integridad criptográfica.",
      fr: "Tableaux à élimination directe garantis par une intégrité serveur 100% cryptographique.",
    },
  },
  {
    img: "/images/banners/tournament-banner-3.jpg",
    tag: {
      ar: "🎯 بطولات نيزالو الكبرى · العب واكسب بجدارة",
      en: "🎯 Grand Nizalo Tournaments · Play & Win With Merit",
      zh: "🎯 尼扎洛巅峰大奖赛 · 凭实力赢荣耀",
      hi: "🎯 निज़ालो ग्रांड टूर्नामेंट · योग्यता से खेलें और जीतें",
      es: "🎯 Grandes Torneos Nizalo · Juega y Gana con Mérito",
      fr: "🎯 Grands Tournois Nizalo · Jouez et Gagnez avec Mérite",
    },
    title: {
      ar: "معارك السرعة والذكاء الخاطف",
      en: "Speed Battle & Quick Calculation Arena",
      zh: "极限手速与急速心算对决舞台",
      hi: "स्पीड बैटल और त्वरित गणना एरीना",
      es: "Arena de Velocidad y Cálculo Mental",
      fr: "Arène de Vitesse et Calcul Mental",
    },
    desc: {
      ar: "ألعاب الرياضيات السريعة، إكس أو، وأربعة في صف بسرعات فائقة وبدون أي تأخير.",
      en: "Speed Math, XO, and Connect Four at ultra-fast speeds with zero input lag.",
      zh: "极速心算、井字棋与四子棋急速对决，零输入延迟带来极致畅爽体验。",
      hi: "शून्य इनपुट लैग के साथ अल्ट्रा-फास्ट स्पीड में स्पीड मैथ, एक्सओ और कनेक्ट फोर।",
      es: "Speed Math, XO y Conecta Cuatro a velocidades ultrarrápidas sin retraso de entrada.",
      fr: "Speed Math, XO et Puissance 4 à des vitesses ultra-rapides sans aucun décalage.",
    },
  },
  {
    img: "/images/banners/tournament-banner-4.jpg",
    tag: {
      ar: "🌙 بطولات نيزالو الكبرى · العب واكسب بجدارة",
      en: "🌙 Grand Nizalo Tournaments · Play & Win With Merit",
      zh: "🌙 尼扎洛巅峰大奖赛 · 凭实力赢荣耀",
      hi: "🌙 निज़ालो ग्रांड टूर्नामेंट · योग्यता से खेलें और जीतें",
      es: "🌙 Grandes Torneos Nizalo · Juega y Gana con Mérito",
      fr: "🌙 Grands Tournois Nizalo · Jouez et Gagnez avec Mérite",
    },
    title: {
      ar: "تحدي النجوم الليلي المفتوح (Midnight Masters)",
      en: "Midnight Masters Open Arena",
      zh: "午夜群星大师公开竞技场",
      hi: "मिडनाइट मास्टर्स ओपन एरीना",
      es: "Arena Abierta Midnight Masters",
      fr: "Arène Ouverte Midnight Masters",
    },
    desc: {
      ar: "منافسات ليلية مستمرة على مدار الساعة لأبطال العالم في كافة المناطق الزمنية.",
      en: "24/7 global competitive brackets matching grandmasters across all time zones.",
      zh: "24/7 全天候跨时区天梯对抗，随时随地与全球大师切磋棋艺。",
      hi: "सभी समय क्षेत्रों में ग्रैंडमास्टर्स से मुकाबला करने वाले 24/7 वैश्विक प्रतिस्पर्धी ब्रैकेट।",
      es: "Cuadros competitivos 24/7 que emparejan a grandes maestros en todas las zonas horarias.",
      fr: "Tableaux compétitifs 24/7 opposant les grands maîtres de tous fuseaux horaires.",
    },
  },
  {
    img: "/images/banners/tournament-banner-5.jpg",
    tag: {
      ar: "👑 بطولات نيزالو الكبرى · العب واكسب بجدارة",
      en: "👑 Grand Nizalo Tournaments · Play & Win With Merit",
      zh: "👑 尼扎洛巅峰大奖赛 · 凭实力赢荣耀",
      hi: "👑 निज़ालो ग्रांड टूर्नामेंट · योग्यता से खेलें और जीतें",
      es: "👑 Grandes Torneos Nizalo · Juega y Gana con Mérito",
      fr: "👑 Grands Tournois Nizalo · Jouez et Gagnez avec Mérite",
    },
    title: {
      ar: "نهائيات دوري نيزالو للمحترفين (Pro Championship)",
      en: "Nizalo Pro League Grand Finals",
      zh: "尼扎洛职业联赛超级总决赛",
      hi: "निज़ालो प्रो लीग ग्रैंड फाइनल्स",
      es: "Grandes Finales de la Liga Pro Nizalo",
      fr: "Grandes Finales de la Ligue Pro Nizalo",
    },
    desc: {
      ar: "أعلى جوائز الموسم، بث مباشر للمباريات، وتتويج رسمي في قاعة مشاهير نيزالو.",
      en: "Season-high prize pools, live match streaming, and induction into the Hall of Fame.",
      zh: "年度最高奖池荣耀争夺，全网焦点实时直播，官方名人堂殿堂加冕。",
      hi: "सीज़न का सबसे बड़ा पुरस्कार पूल, लाइव मैच स्ट्रीमिंग, और हॉल ऑफ़ फेम में प्रवेश।",
      es: "Los mayores premios de la temporada, streaming en vivo y entrada al Salón de la Fama.",
      fr: "Les plus grands prix de la saison, streaming en direct et intronisation au Hall of Fame.",
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
      limit={7}
      banners={banners}
    />
  );
}

