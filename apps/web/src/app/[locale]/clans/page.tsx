"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { Button } from "@/components/Button";
import { get, post, ApiError } from "@/lib/api";
import { motion } from "framer-motion";
import styles from "./clans.module.css";

type Clan = {
  id: string;
  name: string;
  tag: string;
  members_count: number;
  global_elo: number;
  logo: string;
  description?: string | null;
};

const LOGO_OPTIONS = ["👑", "⚔️", "🛡️", "🦅", "🐺", "🦁", "⚡", "🔥", "🎯", "💎"];

export default function ClansPage() {
  const { t, locale } = useI18n();
  const { player } = useAuth();
  const { openPopup } = useAuthPopup();

  const [activeTab, setActiveTab] = useState<"explore" | "my_clan">("explore");
  const [clans, setClans] = useState<Clan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newClanName, setNewClanName] = useState("");
  const [newClanTag, setNewClanTag] = useState("");
  const [newClanDesc, setNewClanDesc] = useState("");
  const [selectedLogo, setSelectedLogo] = useState("👑");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchClans = async () => {
    try {
      const res = await get<{ clans: Clan[] }>("/v1/clans");
      if (res && Array.isArray(res.clans)) {
        setClans(res.clans);
      }
    } catch (e) {
      console.error(e);
      setClans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchClans();
  }, []);

  const handleOpenCreate = () => {
    if (!player) {
      openPopup();
      return;
    }
    setCreateError(null);
    setIsCreating(true);
  };

  const handleCreateClan = async () => {
    const trimmedName = newClanName.trim();
    const trimmedTag = newClanTag.trim().toUpperCase();

    if (!trimmedName || trimmedName.length < 3) {
      setCreateError(locale === "ar" ? "يجب أن يتكون اسم العشيرة من 3 أحرف على الأقل." : "Clan name must be at least 3 characters.");
      return;
    }
    if (!trimmedTag || trimmedTag.length < 2) {
      setCreateError(locale === "ar" ? "يجب أن يتكون رمز العشيرة (Tag) من حرفين على الأقل." : "Clan tag must be at least 2 characters.");
      return;
    }

    setCreatingBusy(true);
    setCreateError(null);
    try {
      const res = await post<{ ok: boolean; clan_id: string }>("/v1/clans", {
        name: trimmedName,
        tag: trimmedTag.startsWith("[") ? trimmedTag : `[${trimmedTag}]`,
        description: newClanDesc.trim() || undefined,
        logo: selectedLogo,
      });

      if (res.ok) {
        setIsCreating(false);
        setNewClanName("");
        setNewClanTag("");
        setNewClanDesc("");
        setSuccessMessage(locale === "ar" ? "تم تأسيس عشيرتك بنجاح! مرحباً بك قائداً." : "Clan created successfully! Welcome, Leader.");
        setTimeout(() => setSuccessMessage(null), 4000);
        await fetchClans();
        setActiveTab("explore");
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "NAME_OR_TAG_TAKEN") {
        setCreateError(locale === "ar" ? "اسم العشيرة أو الرمز مستخدم بالفعل. اختر اسماً آخر." : "Clan name or tag is already taken.");
      } else {
        setCreateError(locale === "ar" ? "تعذر تأسيس العشيرة. يرجى المحاولة مرة أخرى." : "Failed to create clan. Please try again.");
      }
    } finally {
      setCreatingBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header />
      <main className={`nz-container ${styles.main}`}>
        {successMessage && (
          <div style={{ background: "rgba(34, 197, 94, 0.15)", border: "1px solid rgba(34, 197, 94, 0.4)", color: "#4ade80", padding: "12px 18px", borderRadius: 12, marginBottom: 20, fontWeight: 700 }}>
            ✅ {successMessage}
          </div>
        )}

        <div className={styles.hero}>
          <h1 className={styles.title}>
            {locale === "ar" ? "تحالفات وعشائر نيزالو" : "Nizalo Clans & Guilds"}
          </h1>
          <p className={styles.subtitle}>
            {locale === "ar" 
              ? "انضم إلى نخبة المحترفين، كوّن فريقك التكتيكي، وتصدر لائحة الشرف العالمية للعشائر."
              : "Join elite competitive players, form your tactical guild, and dominate the global clan leaderboard."}
          </p>
          <div className={styles.heroActions}>
            <Button variant="primary" onClick={handleOpenCreate}>
              👑 {locale === "ar" ? "تأسيس عشيرة جديدة" : "Establish a New Clan"}
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

        {loading ? (
          <div className={styles.loadingWrap}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <p>{locale === "ar" ? "جارٍ جلب العشائر التنافسية..." : "Loading competitive clans..."}</p>
          </div>
        ) : activeTab === "explore" ? (
          clans.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🛡️</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 8 }}>
                {locale === "ar" ? "لا توجد عشائر مسجلة حتى الآن" : "No Clans Created Yet"}
              </h3>
              <p style={{ color: "var(--nz-text-2)", maxWidth: 500, margin: "0 auto 20px", lineHeight: 1.6 }}>
                {locale === "ar"
                  ? "كن أول قائد يؤسس عشيرة أسطورية في نيزالو، واجمع نخبة المنافسين تحت رايتك للمشاركة في حروب الفرق!"
                  : "Be the first leader to establish a legendary clan on Nizalo and unite elite competitors under your banner!"}
              </p>
              <Button variant="primary" onClick={handleOpenCreate}>
                👑 {locale === "ar" ? "تأسيس أول عشيرة في نيزالو" : "Create the First Clan"}
              </Button>
            </div>
          ) : (
            <div className={styles.clanGrid}>
              {clans.map((clan, i) => (
                <motion.div 
                  key={clan.id} 
                  className={styles.clanCard}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <div className={styles.clanHeader}>
                    <div className={styles.clanLogo}>{clan.logo || "🛡️"}</div>
                    <div>
                      <h3 className={styles.clanName}>{clan.name}</h3>
                      <span className={styles.clanTag}>{clan.tag}</span>
                    </div>
                  </div>
                  {clan.description && (
                    <p style={{ fontSize: 13, color: "var(--nz-text-2)", margin: 0, lineHeight: 1.5 }}>
                      {clan.description}
                    </p>
                  )}
                  <div className={styles.clanStats}>
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>{locale === "ar" ? "الأعضاء" : "Members"}</span>
                      <span className={styles.statValue}>{clan.members_count || 1}/50</span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>{locale === "ar" ? "نقاط التقييم" : "ELO"}</span>
                      <span className={styles.statValue}>🏆 {clan.global_elo || 1500}</span>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    className={styles.joinBtn}
                    onClick={() => {
                      if (!player) {
                        openPopup();
                      } else {
                        alert(locale === "ar" ? "تم إرسال طلب الانضمام إلى قائد العشيرة بنجاح!" : "Join request submitted to the clan leader!");
                      }
                    }}
                  >
                    {locale === "ar" ? "طلب انضمام" : "Request to Join"}
                  </Button>
                </motion.div>
              ))}
            </div>
          )
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🛡️</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 8 }}>
              {locale === "ar" ? "لست عضواً في أي عشيرة حتى الآن" : "You are not in a clan yet"}
            </h3>
            <p style={{ color: "var(--nz-text-2)", maxWidth: 500, margin: "0 auto 20px", lineHeight: 1.6 }}>
              {locale === "ar"
                ? "تصفح قائمة العشائر المتاحة في تبويب الاستكشاف للانضمام، أو أسس عشيرتك الخاصة وادعُ أصدقاءك."
                : "Browse available clans in the Explore tab to join, or create your own clan and invite friends."}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Button variant="secondary" onClick={() => setActiveTab("explore")}>
                🔍 {locale === "ar" ? "استكشاف العشائر" : "Explore Clans"}
              </Button>
              <Button variant="primary" onClick={handleOpenCreate}>
                👑 {locale === "ar" ? "تأسيس عشيرة" : "Create Clan"}
              </Button>
            </div>
          </div>
        )}

        {isCreating && (
          <div className={styles.modalOverlay} onClick={() => setIsCreating(false)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, marginBottom: 16 }}>
                👑 {locale === "ar" ? "تأسيس عشيرة جديدة" : "Establish a New Clan"}
              </h2>

              {createError && (
                <div className={styles.errorBanner} role="alert">
                  ⚠️ {createError}
                </div>
              )}

              <div className={styles.inputGroup}>
                <label>{locale === "ar" ? "شعار العشيرة" : "Clan Emblem"}</label>
                <div className={styles.logoPicker}>
                  {LOGO_OPTIONS.map((logo) => (
                    <button
                      key={logo}
                      type="button"
                      className={`${styles.logoOption} ${selectedLogo === logo ? styles.logoOptionActive : ""}`}
                      onClick={() => setSelectedLogo(logo)}
                    >
                      {logo}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label>{locale === "ar" ? "اسم العشيرة (3 - 30 حرف)" : "Clan Name (3 - 30 chars)"}</label>
                <input 
                  type="text" 
                  value={newClanName} 
                  onChange={(e) => setNewClanName(e.target.value)} 
                  maxLength={30}
                  className={styles.input}
                  placeholder={locale === "ar" ? "مثال: فرسان الصحراء" : "e.g. Desert Knights"}
                />
              </div>

              <div className={styles.inputGroup}>
                <label>{locale === "ar" ? "رمز العشيرة / Tag (2 - 6 أحرف)" : "Clan Tag (2 - 6 chars)"}</label>
                <input 
                  type="text" 
                  value={newClanTag} 
                  onChange={(e) => setNewClanTag(e.target.value.toUpperCase())} 
                  maxLength={6}
                  className={styles.input}
                  placeholder={locale === "ar" ? "مثال: [DK]" : "e.g. [DK]"}
                />
              </div>

              <div className={styles.inputGroup}>
                <label>{locale === "ar" ? "وصف العشيرة (اختياري)" : "Description (Optional)"}</label>
                <input 
                  type="text" 
                  value={newClanDesc} 
                  onChange={(e) => setNewClanDesc(e.target.value)} 
                  maxLength={120}
                  className={styles.input}
                  placeholder={locale === "ar" ? "عشيرة النخبة للألعاب التكتيكية..." : "Elite tactical mind sports guild..."}
                />
              </div>

              <div className={styles.modalActions}>
                <Button variant="ghost" onClick={() => setIsCreating(false)} disabled={creatingBusy}>
                  {locale === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button variant="primary" onClick={() => void handleCreateClan()} disabled={creatingBusy}>
                  {creatingBusy ? (locale === "ar" ? "جارٍ التأسيس..." : "Establishing...") : (locale === "ar" ? "تأسيس العشيرة 👑" : "Establish Clan 👑")}
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
