import type { Metadata } from "next";
import { TournamentDetailClient } from "./TournamentDetailClient";

type Props = {
  params: Promise<{ locale: string; id: string }>;
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

async function fetchTournament(id: string) {
  try {
    const res = await fetch(`http://localhost:3000/v1/tournaments/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const isAr = locale === "ar";
  const trn = await fetchTournament(id);

  const rawGameId = trn?.game_id || trn?.gameId || "chess";
  const normalizedGameId = rawGameId.replace(/_/g, "-");
  const gameName = isAr ? (GAME_NAMES_AR[rawGameId] || "بطولة رسمية") : (GAME_NAMES_EN[rawGameId] || "Official Tournament");
  const customTitle = trn?.title || (isAr ? `بطولة ${gameName} الكبرى` : `${gameName} Grand Championship`);

  const formatText = isAr
    ? (trn?.format === "SWISS" ? "النظام السويسري" : "خروج المغلوب")
    : (trn?.format === "SWISS" ? "Swiss System" : "Single Elimination");

  const prizeText = trn?.tier === "CASH"
    ? (isAr ? " • جوائز نقدية حقيقية بالدولار" : " • Real Cash Prize Pool")
    : (isAr ? " • بطولة تصنيفية رسمية" : " • Official Ranked Tournament");

  const title = isAr
    ? `بطولة ${gameName}: ${customTitle} | منصة نيزالو`
    : `${gameName} Tournament: ${customTitle} | Nizalo`;

  const description = isAr
    ? `انضم الآن لبطولة ${gameName} الرسمية على منصة نيزالو للرياضات الذهنية. بنظام ${formatText}${prizeText}. سجّل الآن ونافس أفضل أبطال الوطن العربي!`
    : `Join the official ${gameName} tournament on Nizalo Mind Sports. Format: ${formatText}${prizeText}. Register now and compete against top players!`;

  const ogImage = `https://nizalo.com/images/tournaments/tournament-${normalizedGameId}.webp`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://nizalo.com/${locale}/tournaments/${id}`,
      siteName: isAr ? "نيزالو" : "Nizalo",
      type: "website",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
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

export default async function TournamentDetailPage({ params }: Props) {
  const { id } = await params;
  return <TournamentDetailClient id={id} />;
}
