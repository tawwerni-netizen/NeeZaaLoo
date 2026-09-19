"use client";


import { useEffect, useState } from "react";
import { get, post } from "@/lib/api";

type Clan = {
  id: string;
  name: string;
  tag: string;
  members_count: number;
  global_elo: number;
  logo: string;
};

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/Button";
import { motion } from "framer-motion";
import styles from "./clans.module.css";

// Mock data for clans
const MOCK_CLANS = [
  { id: "1", name: "Desert Kings", tag: "[DK]", members: 42, elo: 2850, logo: "👑" },
  { id: "2", name: "Shadow Assassins", tag: "[SHDW]", members: 38, elo: 2710, logo: "🥷" },
  { id: "3", name: "Nizalo Knights", tag: "[NK]", members: 50, elo: 2600, logo: "⚔️" },
  { id: "4", name: "Oasis Elite", tag: "[OASIS]", members: 15, elo: 2450, logo: "🌴" }
];

export default function ClansPage() {
  const { t, locale } = useI18n();
  
  const [isCreating, setIsCreating] = useState(false);
  const [newClanName, setNewClanName] = useState("");
  const [newClanTag, setNewClanTag] = useState("");
  
  const handleCreateClan = async () => {
    if (!newClanName || !newClanTag) return;
    try {
      const res = await post<{ok: boolean, clan_id: string}>("/v1/clans", {
        name: newClanName,
        tag: newClanTag,
        description: "A new clan",
        logo: "🛡️"
      });
      if (res.ok) {
        setIsCreating(false);
        // Refresh clans
        get<{clans: Clan[]}>("/v1/clans").then(r => setClans(r.clans)).catch(console.error);
        setActiveTab("my_clan");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to create clan. Name/Tag might be taken.");
    }
  };

  const [activeTab, setActiveTab] = useState<"explore" | "my_clan">("explore");
  const [clans, setClans] = useState<Clan[]>([]);
  useEffect(() => { get<{clans: Clan[]}>("/v1/clans").then(res => setClans(res.clans)).catch(console.error); }, []);

  return (
    <div className={styles.page}>
      <Header />
      <main className={`nz-container ${styles.main}`}>
        <div className={styles.hero}>
          <h1 className={styles.title}>
            {locale === "ar" ? "نظام العشائر والفرق" : "Clans & Guilds"}
          </h1>
          <p className={styles.subtitle}>
            {locale === "ar" 
              ? "انضم إلى عشيرة، تنافس في حروب الفرق، وارتقِ في تصنيف العشائر العالمي."
              : "Join a clan, compete in team wars, and rise in the global clan leaderboard."}
          </p>
          <div className={styles.heroActions}>
            <Button variant="primary" onClick={() => setIsCreating(true)}>
              {locale === "ar" ? "تأسيس عشيرة جديدة (1000 💎)" : "Create a Clan (1000 💎)"}
            </Button>
          </div>
        </div>

        <div className={styles.tabs}>
          <button 
            className={activeTab === "explore" ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab("explore")}
          >
            {locale === "ar" ? "استكشاف العشائر" : "Explore Clans"}
          </button>
          <button 
            className={activeTab === "my_clan" ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab("my_clan")}
          >
            {locale === "ar" ? "عشيرتي" : "My Clan"}
          </button>
        </div>

        {activeTab === "explore" && (
          <div className={styles.clanGrid}>
            {clans.map((clan, i) => (
              <motion.div 
                key={clan.id} 
                className={styles.clanCard}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <div className={styles.clanHeader}>
                  <div className={styles.clanLogo}>{clan.logo}</div>
                  <div>
                    <h3 className={styles.clanName}>{clan.name}</h3>
                    <span className={styles.clanTag}>{clan.tag}</span>
                  </div>
                </div>
                <div className={styles.clanStats}>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>{locale === "ar" ? "الأعضاء" : "Members"}</span>
                    <span className={styles.statValue}>{clan.members_count}/50</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>{locale === "ar" ? "نقاط التقييم" : "ELO"}</span>
                    <span className={styles.statValue}>🏆 {clan.global_elo}</span>
                  </div>
                </div>
                <Button variant="secondary" className={styles.joinBtn}>
                  {locale === "ar" ? "طلب انضمام" : "Request to Join"}
                </Button>
              </motion.div>
            ))}
          </div>
        )}

        {activeTab === "my_clan" && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🛡️</div>
            <h3>{locale === "ar" ? "لست عضواً في أي عشيرة" : "You are not in a clan"}</h3>
            <p>{locale === "ar" ? "ابحث عن عشيرة تناسب مهاراتك أو قم بتأسيس عشيرتك الخاصة." : "Find a clan that matches your skills or create your own."}</p>
          </div>
        )}
      
        {isCreating && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
              <h2>{locale === "ar" ? "تأسيس عشيرة جديدة" : "Create a New Clan"}</h2>
              <div className={styles.inputGroup}>
                <label>{locale === "ar" ? "اسم العشيرة" : "Clan Name"}</label>
                <input 
                  type="text" 
                  value={newClanName} 
                  onChange={e => setNewClanName(e.target.value)} 
                  maxLength={20}
                  className={styles.input}
                  placeholder={locale === "ar" ? "مثال: فرسان الصحراء" : "e.g. Desert Knights"}
                />
              </div>
              <div className={styles.inputGroup}>
                <label>{locale === "ar" ? "رمز العشيرة (Tag)" : "Clan Tag"}</label>
                <input 
                  type="text" 
                  value={newClanTag} 
                  onChange={e => setNewClanTag(e.target.value.toUpperCase())} 
                  maxLength={5}
                  className={styles.input}
                  placeholder={locale === "ar" ? "مثال: [DK]" : "e.g. [DK]"}
                />
              </div>
              <div className={styles.modalActions}>
                <Button variant="ghost" onClick={() => setIsCreating(false)}>
                  {locale === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button variant="primary" onClick={handleCreateClan}>
                  {locale === "ar" ? "تأسيس (1000 💎)" : "Create (1000 💎)"}
                </Button>
              </div>
            </div>
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}
