import { Header } from "@/components/Header";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { GameModes } from "@/components/home/GameModes";
import { LiveArenaSection } from "@/components/home/LiveArenaSection";
import { TrustFairPlaySection } from "@/components/home/TrustFairPlaySection";
import { LandingTournaments } from "@/components/home/LandingTournaments";
import { DailyQuestsWidget } from "@/components/home/DailyQuestsWidget";
import { FeatureGrid } from "@/components/home/FeatureGrid";
import { LearnTeaser } from "@/components/home/LearnTeaser";
import { DownloadAppTeaser } from "@/components/home/DownloadAppTeaser";
import { ConversionBannerStrip } from "@/components/home/ConversionBannerStrip";
import { Footer } from "@/components/Footer";

/**
 * Nizalo V2 Conversion-Engineered Homepage.
 * 
 * Strict Conversion Hierarchy:
 * 1. What Nizalo Is (Hero + Value Proposition + 1-Click Play CTA)
 * 2. Why It Is Interesting & How It Works (Immediate 5-Step Core Loop)
 * 3. What I Can Play (Game Discovery Matrix with 3-second comprehension)
 * 4. Live Action (Live Arena Matches)
 * 5. Trust Architecture (Server-authoritative, 88% payout math, 0% draw rake)
 * 6. Competitive Layer (Tournaments & Daily Quests)
 * 7. Supporting Ecosystem (Features, Learning, Mobile App)
 * 8. Final Conversion CTA
 */
export default function LandingPage() {
  return (
    <>
      <Header />
      <main>
        {/* 1. Primary Value Proposition & Visual Showcase */}
        <Hero />

        {/* 2. Immediate Clarity: The 5-Step Ascent & Fair-Play Loop */}
        <HowItWorks />

        {/* 3. Game Discovery: The 11 Canonical Mind Sports */}
        <GameModes />

        {/* 4. Live Competitive Action */}
        <LiveArenaSection />

        {/* 5. Trust, Fair-Play & Settlement Integrity */}
        <TrustFairPlaySection />

        {/* 6. Esports Tournaments & Quests */}
        <LandingTournaments />
        <DailyQuestsWidget />

        {/* 7. Platform Features & Knowledge */}
        <FeatureGrid />
        <LearnTeaser />
        <DownloadAppTeaser />

        {/* 8. Final Conversion Action */}
        <ConversionBannerStrip />
      </main>
      <Footer />
    </>
  );
}
