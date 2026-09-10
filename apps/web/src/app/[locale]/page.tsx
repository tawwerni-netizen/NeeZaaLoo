import { Header } from "@/components/Header";
import { Hero } from "@/components/home/Hero";
import { LiveArenaSection } from "@/components/home/LiveArenaSection";
import { LandingTournaments } from "@/components/home/LandingTournaments";
import { GameModes } from "@/components/home/GameModes";
import { FeatureGrid } from "@/components/home/FeatureGrid";
import { LearnTeaser } from "@/components/home/LearnTeaser";
import { DownloadAppTeaser } from "@/components/home/DownloadAppTeaser";
import { TrustFairPlaySection } from "@/components/home/TrustFairPlaySection";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Footer } from "@/components/Footer";

// Section order follows the redesign brief exactly: hero (with its own
// above-the-fold featured-games strip) -> Live Arena -> Upcoming
// Tournaments -> 10 Games -> the four-feature grid (Global Rank / Your
// Mastery / Daily Challenge / Friend Challenge, deliberately ONE section,
// see FeatureGrid's own header on why) -> Learn -> Download App -> Trust &
// Fair Play. HowItWorks (Try/Compete/Improve/Climb/Win) closes the page --
// it is the one section that only makes sense once a visitor already knows
// what the ten games and the live matches actually look like.
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
        <LearnTeaser />
        <DownloadAppTeaser />
        <TrustFairPlaySection />
        <HowItWorks />
      </main>
      <Footer />
    </>
  );
}
