import type { Metadata } from "next";
import ClientPage from "./ClientPage";

type Props = {
  params: Promise<{ locale: string; code: string }>;
};

// Use an internal helper to fetch without relying on client `get` which uses window
async function fetchDuel(code: string) {
  try {
    const res = await fetch(`http://localhost:3000/v1/duels/${code}`, {
      cache: "no-store"
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = (await params).code;
  
  // Duel IDs are typically KSUIDs (27 chars).
  if (code && code.length >= 20) {
    const duel = await fetchDuel(code);
    if (duel && duel.id) {
      let gameName = "Nizalo Match";
      if (duel.game_id === "ludo") gameName = "Ludo";
      if (duel.game_id === "dominoes") gameName = "Dominoes";

      const title = duel.tier === "CASH" 
        ? `Watch High-Stakes ${gameName} Live!`
        : `Watch ${gameName} Match Live!`;
      const desc = `Join the spectator arena on Nizalo and watch this match live.`;
      
      const locale = (await params).locale;
      
      return {
        title,
        description: desc,
        openGraph: {
          title,
          description: desc,
          url: `https://nizalo.com/${locale}/r/${code}`,
          siteName: "Nizalo",
          type: "website",
          images: [
            {
              url: "https://nizalo.com/images/og-spectate.jpg",
              width: 1200,
              height: 630,
            }
          ]
        },
        twitter: {
          card: "summary_large_image",
          title,
          description: desc,
          images: ["https://nizalo.com/images/og-spectate.jpg"]
        }
      };
    }
  }

  return {
    title: "You've been invited to Nizalo",
    description: "Join Nizalo with this referral code and start playing competitive games.",
    openGraph: {
      title: "You've been invited to Nizalo",
      description: "Join Nizalo with this referral code and start playing competitive games.",
    }
  };
}

export default async function Page({ params }: Props) {
  return <ClientPage params={params} />;
}
