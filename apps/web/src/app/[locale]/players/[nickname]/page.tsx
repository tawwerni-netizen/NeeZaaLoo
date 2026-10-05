import type { Metadata } from "next";
import { PlayerProfileClient } from "./PlayerProfileClient";

type Props = {
  params: Promise<{ locale: string; nickname: string }>;
};

async function fetchPlayer(nickname: string) {
  try {
    const res = await fetch(`http://localhost:3000/v1/players/${encodeURIComponent(nickname)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, nickname } = await params;
  const isAr = locale === "ar";
  const profile = await fetchPlayer(nickname);

  const level = profile?.exp?.level ?? 1;
  const totalExp = profile?.exp?.totalExp ?? 0;
  const globalSkill = profile?.globalSkill;

  const title = isAr
    ? `الملف الشخصي: ${nickname} | منصة نيزالو`
    : `Player Profile: ${nickname} | Nizalo`;

  const skillInfo = globalSkill
    ? (isAr ? ` • التقييم العالمي ${globalSkill}` : ` • Global Skill ${globalSkill}`)
    : "";

  const description = isAr
    ? `تحدى اللاعب ${nickname} في الشطرنج، الدومينو، واللودو على منصة نيزالو للرياضات الذهنية. المستوى ${level}${skillInfo} • نقاط الخبرة ${totalExp}.`
    : `Challenge player ${nickname} in Chess, Dominoes, and Ludo on Nizalo Mind Sports. Level ${level}${skillInfo} • Total EXP ${totalExp}.`;

  const ogImage = profile?.avatarUrl && profile.avatarUrl.startsWith("http")
    ? profile.avatarUrl
    : "https://nizalo.com/images/home_hero_bg.jpg";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://nizalo.com/${locale}/players/${encodeURIComponent(nickname)}`,
      siteName: isAr ? "نيزالو" : "Nizalo",
      type: "profile",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${nickname} on Nizalo`,
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

export default async function PublicProfilePage({ params }: Props) {
  const { nickname } = await params;
  return <PlayerProfileClient nickname={nickname} />;
}
