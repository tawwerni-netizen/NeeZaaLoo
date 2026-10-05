import type { Metadata } from "next";
import { GameDetailClient } from "./GameDetailClient";

type Props = {
  params: Promise<{ locale: string; gameId: string }>;
};

const GAME_NAMES_AR: Record<string, string> = {
  chess: "الشطرنج",
  speed_math: "الرياضيات السريعة",
  "speed-math": "الرياضيات السريعة",
  checkers: "الداما",
  connect_four: "أربعة على التوالي",
  "connect-four": "أربعة على التوالي",
  xo: "إكس أو",
  dominoes: "الدومينو",
  ludo: "اللودو",
  backgammon: "الطاولة (طاولة الزهر)",
  seega: "السيجة",
  reversi: "ريفيرسي",
  gomoku: "جوموكو",
};

const GAME_NAMES_EN: Record<string, string> = {
  chess: "Chess",
  speed_math: "Speed Math",
  "speed-math": "Speed Math",
  checkers: "Checkers",
  connect_four: "Connect Four",
  "connect-four": "Connect Four",
  xo: "Tic-Tac-Toe",
  dominoes: "Dominoes",
  ludo: "Ludo",
  backgammon: "Backgammon",
  seega: "Seega",
  reversi: "Reversi",
  gomoku: "Gomoku",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, gameId } = await params;
  const isAr = locale === "ar";
  const normalizedGameId = gameId.replace(/_/g, "-");

  const gameName = isAr
    ? (GAME_NAMES_AR[gameId] || GAME_NAMES_AR[normalizedGameId] || gameId)
    : (GAME_NAMES_EN[gameId] || GAME_NAMES_EN[normalizedGameId] || gameId);

  const title = isAr
    ? `العب ${gameName} أونلاين مجاناً وتنافس على جوائز حقيقية | منصة نيزالو`
    : `Play ${gameName} Online - 100% Skill-Based Competitions | Nizalo`;

  const description = isAr
    ? `العب ${gameName} ضد لاعبين حقيقيين من جميع أنحاء الوطن العربي على نيزالو. بدون حظ، مهارة خالصة 100%، توقيت مركزي دقيق ومسابقات رسمية. ابدأ التحدي الآن!`
    : `Play ${gameName} online against real players on Nizalo. 100% pure skill, no luck, real-time matchmaking, official ranked tournaments, and cash prizes!`;

  const ogImage = `https://nizalo.com/images/games/${normalizedGameId}-hero.jpg`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://nizalo.com/${locale}/games/${gameId}`,
      siteName: isAr ? "نيزالو" : "Nizalo",
      type: "website",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${gameName} on Nizalo`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function GameDetailsPage({ params }: Props) {
  const { locale, gameId } = await params;
  return <GameDetailClient locale={locale} gameId={gameId} />;
}
