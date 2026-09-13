import { Header } from "@/components/Header";
import { Hero } from "@/components/home/Hero";
import { LiveArenaSection } from "@/components/home/LiveArenaSection";
import { LandingTournaments } from "@/components/home/LandingTournaments";
import { GameModes } from "@/components/home/GameModes";
import { FeatureGrid } from "@/components/home/FeatureGrid";
import { ConversionBannerStrip } from "@/components/home/ConversionBannerStrip";
import { LearnTeaser } from "@/components/home/LearnTeaser";
import { DownloadAppTeaser } from "@/components/home/DownloadAppTeaser";
import { TrustFairPlaySection } from "@/components/home/TrustFairPlaySection";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Footer } from "@/components/Footer";

export default function LandingPage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <LiveArenaSection />
        <LandingTournaments />
        <GameModes />
        <FeatureGrid />
        <ConversionBannerStrip />
        <LearnTeaser />
        <DownloadAppTeaser />
        <TrustFairPlaySection />
        <HowItWorks />
      </main>
      <Footer />
    </>
  );
}
