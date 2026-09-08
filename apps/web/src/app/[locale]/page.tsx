import { Header } from "@/components/Header";
import { Hero } from "@/components/home/Hero";
import { GameModes } from "@/components/home/GameModes";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Footer } from "@/components/Footer";

export default function LandingPage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <GameModes />
        <HowItWorks />
      </main>
      <Footer />
    </>
  );
}
