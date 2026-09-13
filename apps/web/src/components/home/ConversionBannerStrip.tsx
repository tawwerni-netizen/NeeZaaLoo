"use client";

import { useState, useEffect } from "react";
import { LocaleLink } from "@/components/LocaleLink";
import styles from "./ConversionBannerStrip.module.css";

const MAIN_BANNERS = [
  {
    id: "arena",
    img: "/images/banners/banner-global-arena.jpg",
    tag: "🏆 Global Arena",
    title: "Sovereign Skill Championship",
    desc: "1v1 competitive arena where strategic intelligence and reflexes determine victory.",
    cta: "Join Arena",
    href: "/games",
  },
  {
    id: "payouts",
    img: "/images/banners/banner-instant-payouts.jpg",
    tag: "⚡ Instant Payouts",
    title: "Direct USDT Settlement",
    desc: "Transparent cryptographic withdrawals with zero platform fees on eligible earnings.",
    cta: "Open Wallet",
    href: "/wallet",
  },
  {
    id: "skill",
    img: "/images/banners/banner-certified-skill.jpg",
    tag: "🧠 Certified Skill",
    title: "100% Pure Strategy & Skill",
    desc: "Zero chance, zero luck algorithms. Transparent rules verified on server-authoritative state.",
    cta: "Learn Rules",
    href: "/learn",
  },
  {
    id: "cups",
    img: "/images/banners/banner-freeroll-cups.jpg",
    tag: "🏅 Daily Cups",
    title: "Ranked Tournaments & Free Cups",
    desc: "Compete daily in Swiss brackets, single elimination, and leaderboard qualifiers.",
    cta: "View Tournaments",
    href: "/tournaments",
  },
  {
    id: "fast",
    img: "/images/banners/banner-fast-matchmaking.jpg",
    tag: "⏱️ 5s Matchmaking",
    title: "Instant Global Matchmaking",
    desc: "Match with real players of your exact ELO rating in under five seconds.",
    cta: "Find Match",
    href: "/games",
  },
  {
    id: "anticheat",
    img: "/images/banners/banner-anti-cheat.jpg",
    tag: "🛡️ Sentinel Security",
    title: "Cryptographic Anti-Cheat System",
    desc: "Full client-move verification and behavioral heuristics protecting every match.",
    cta: "Fair Play Policy",
    href: "/fair-play",
  },
  {
    id: "leaderboard",
    img: "/images/banners/banner-global-leaderboard.jpg",
    tag: "👑 Leaderboards",
    title: "Hall of Fame & Seasonal Rings",
    desc: "Climb the global ranks, claim seasonal badges, and prove master status.",
    cta: "Check Rankings",
    href: "/rank",
  },
  {
    id: "vip",
    img: "/images/banners/banner-vip-club.jpg",
    tag: "💎 Mastery Perks",
    title: "Exclusive Mastery Tier Rewards",
    desc: "Earn custom avatars, exclusive tournament invitations, and priority processing.",
    cta: "View Tiers",
    href: "/profile",
  },
  {
    id: "multilingual",
    img: "/images/banners/banner-multilingual-arena.jpg",
    tag: "🌍 Global Community",
    title: "Play Across 6 Languages",
    desc: "Fully localized in Arabic, English, Chinese, Spanish, French, and Hindi.",
    cta: "Explore Games",
    href: "/games",
  },
  {
    id: "platforms",
    img: "/images/banners/banner-mobile-desktop.jpg",
    tag: "📱 Seamless Play",
    title: "Mobile & Desktop Synchronized",
    desc: "Start a match on your phone, finish on your desktop. Zero sync delay.",
    cta: "Play Now",
    href: "/register",
  },
];

export function ConversionBannerStrip() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % MAIN_BANNERS.length);
    }, 6500);
    return () => clearInterval(timer);
  }, []);

  const active = MAIN_BANNERS[activeIdx] ?? MAIN_BANNERS[0]!;

  return (
    <section className={styles.section}>
      <div className="nz-container">
        <div className={styles.headerRow}>
          <div>
            <h2 className={styles.heading}>Why Competitors Choose Nizalo</h2>
            <p className={styles.subheading}>Engineered for pure competitive integrity and instant player trust.</p>
          </div>
        </div>

        <div className={styles.carouselWrap}>
          <img src={active.img} alt={active.title} className={styles.bannerImg} />
          <div className={styles.bannerOverlay}>
            <span className={styles.tagPill}>{active.tag}</span>
            <h3 className={styles.bannerTitle}>{active.title}</h3>
            <p className={styles.bannerDesc}>{active.desc}</p>
            <LocaleLink href={active.href} className={styles.ctaBtn}>
              {active.cta}
              <span aria-hidden="true">&rarr;</span>
            </LocaleLink>
          </div>
        </div>

        <div className={styles.pillsNav}>
          {MAIN_BANNERS.map((b, i) => (
            <button
              key={b.id}
              className={`${styles.navPill} ${activeIdx === i ? styles.navPillActive : ""}`}
              onClick={() => setActiveIdx(i)}
            >
              {b.tag}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
