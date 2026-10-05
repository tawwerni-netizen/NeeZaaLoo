import type { Metadata } from "next";
import { GameClient } from "./GameClient";

type Props = {
  params: Promise<{ locale: string; duelId: string }>;
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

async function fetchDuel(duelId: string) {
  try {
    const res = await fetch(`http://localhost:3000/v1/duels/${encodeURIComponent(duelId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, duelId } = await params;
  const isAr = locale === "ar";
  const duel = await fetchDuel(duelId);

  const rawGameId = duel?.game_id || duel?.gameId || "chess";
  const normalizedGameId = rawGameId.replace(/_/g, "-");
  const gameName = isAr ? (GAME_NAMES_AR[rawGameId] || "نزال مباشر") : (GAME_NAMES_EN[rawGameId] || "Live Match");

  const title = isAr
    ? `نزال مباشر في ${gameName} | منصة نيزالو`
    : `Live ${gameName} Match | Nizalo`;

  const description = isAr
    ? `شاهد نزال ${gameName} المباشر على منصة نيزالو للرياضات الذهنية. انضم لساحة المشاهدين الآن!`
    : `Watch live ${gameName} match on Nizalo Mind Sports. Join the spectator arena now!`;

  const ogImage = `https://nizalo.com/images/games/${normalizedGameId}-hero.jpg`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://nizalo.com/${locale}/game/${duelId}`,
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

export default async function GamePage({ params }: Props) {
  const { duelId } = await params;
  return <GameClient duelId={duelId} />;
}
