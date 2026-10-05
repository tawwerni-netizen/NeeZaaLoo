"use client";

import React, { useState, useEffect, useCallback } from "react";
import styles from "./StoreFront.module.css";
import { LocaleLink } from "@/components/LocaleLink";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { useI18n } from "@/lib/i18n/context";
import { fromMinorUnits } from "@/lib/money";
import { BALANCE_REFRESH_EVENT, triggerBalanceRefresh } from "@/lib/use-wallet-balance";
import { 
  playCardHoverSound, 
  playButtonClickSound, 
  playPurchaseSuccessSound,
  playPurchaseErrorSound
} from "@/lib/game-audio";

type StoreCategory = "coins" | "cosmetics" | "passes";

type CoinPackage = {
  id: string;
  name: string;
  nameAr: string;
  amount: number;
  bonus: number;
  price: number;
  popular?: boolean;
  bestValue?: boolean;
  tagAr: string;
  tagEn: string;
  tierColor: "bronze" | "gold" | "emerald" | "diamond";
};

const COIN_PACKAGES: CoinPackage[] = [
  { 
    id: "c1", 
    name: "Starter Pack",
    nameAr: "حزمة البداية",
    amount: 100, 
    bonus: 0, 
    price: 1.0, 
    popular: false,
    tagAr: "للتجربة السريعة",
    tagEn: "QUICK START",
    tierColor: "bronze"
  },
  { 
    id: "c2", 
    name: "Warrior Pack",
    nameAr: "حزمة المحارب",
    amount: 500, 
    bonus: 50, 
    price: 5.0, 
    popular: true,
    tagAr: "🔥 الأكثر شعبية",
    tagEn: "🔥 MOST POPULAR",
    tierColor: "gold"
  },
  { 
    id: "c3", 
    name: "Elite Pack",
    nameAr: "حزمة النخبة",
    amount: 1200, 
    bonus: 200, 
    price: 10.0, 
    popular: false,
    tagAr: "⚡ بونص +17%",
    tagEn: "⚡ +17% BONUS",
    tierColor: "emerald"
  },
  { 
    id: "c4", 
    name: "Legendary Vault",
    nameAr: "خزينة الأساطير",
    amount: 2500, 
    bonus: 500, 
    price: 20.0, 
    popular: false,
    bestValue: true,
    tagAr: "👑 أفضل قيمة (+20%)",
    tagEn: "👑 BEST VALUE (+20%)",
    tierColor: "diamond"
  },
];

type CosmeticItem = {
  id: string;
  name: string;
  nameAr: string;
  type: "frame" | "badge" | "dice" | "board";
  typeLabelAr: string;
  typeLabelEn: string;
  price: number;
  rarity: "LEGENDARY" | "MYTHIC" | "EPIC" | "EXCLUSIVE";
  rarityAr: string;
  rarityColor: string;
  icon: string;
  code: string;
  descAr: string;
  descEn: string;
};

const COSMETICS: CosmeticItem[] = [
  { 
    id: "cos1", 
    name: "Neon Flame Avatar Border", 
    nameAr: "إطار شعلة النيون", 
    type: "frame", 
    typeLabelAr: "إطار للملف الشخصي",
    typeLabelEn: "Profile Frame",
    price: 500, 
    rarity: "LEGENDARY",
    rarityAr: "أسطوري",
    rarityColor: "#FFB800",
    icon: "🔥", 
    code: "neon",
    descAr: "حلقات لهب نيون متوهجة تحيط بصورتك في جميع الردهات وقوائم المتصدرين.",
    descEn: "Blazing animated neon flames surrounding your avatar in all lobbies and tables."
  },
  { 
    id: "cos2", 
    name: "Cyberpunk Dice Skin", 
    nameAr: "نرد السايبربانك", 
    type: "badge", 
    typeLabelAr: "مظهر نرد خاص",
    typeLabelEn: "Special Dice Skin",
    price: 800, 
    rarity: "EPIC",
    rarityAr: "ملحمي",
    rarityColor: "#00F0FF",
    icon: "🎲", 
    code: "cyber_dice",
    descAr: "نرد مستقبلي بشبكة هولوغرافية وألوان سايبربانك مشعة في كل رمية.",
    descEn: "Futuristic digital cubes with holographic grid trails on every roll."
  },
  { 
    id: "cos3", 
    name: "Holographic Galaxy Board", 
    nameAr: "لوحة المجرة الهولوغرافية", 
    type: "frame", 
    typeLabelAr: "مظهر رقعة اللعب",
    typeLabelEn: "Board Theme",
    price: 1200, 
    rarity: "MYTHIC",
    rarityAr: "خرافي",
    rarityColor: "#BF55EC",
    icon: "🌌", 
    code: "holo_board",
    descAr: "رقعة لعب ساحرة تدور بنجوم ومجرات فضية عميقة تبهر خصومك.",
    descEn: "Mesmerizing galactic nebula board texture with ambient deep-space particle drift."
  },
  { 
    id: "cos4", 
    name: "Golden VIP Crown Badge", 
    nameAr: "شارة VIP الملكية الذهبية", 
    type: "badge", 
    typeLabelAr: "شارة شرف",
    typeLabelEn: "Honor Badge",
    price: 300, 
    rarity: "EXCLUSIVE",
    rarityAr: "حصري",
    rarityColor: "#00FF88",
    icon: "👑", 
    code: "VIP_GOLD",
    descAr: "شارة تاج ملكية متلألئة بجانب اسمك في غرف الدردشة والمباريات.",
    descEn: "Prestigious royal gold crown displayed proudly beside your handle in all matches."
  },
];

export function StoreFront() {
  const { player } = useAuth();
  const { openPopup } = useAuthPopup();
  const { locale } = useI18n();

  const [activeCategory, setActiveCategory] = useState<StoreCategory>("coins");
  const [coinBalance, setCoinBalance] = useState<number>(0);
  const [usdtBalance, setUsdtBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState<boolean>(true);
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);
  const [ownedCodes, setOwnedCodes] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    title?: string;
    message: string;
    action?: { label: string; href?: string; onClick?: () => void } | undefined;
  } | null>(null);

  const fetchWallet = useCallback(async () => {
    if (!player?.id) {
      setCoinBalance(0);
      setUsdtBalance(0);
      setLoadingBalance(false);
      return;
    }
    try {
      const [walletRes, profileRes] = await Promise.allSettled([
        get<{ accounts?: Array<{ key: string; asset: string; balance: string }> }>(
          `/v1/players/${player.id}/wallet`
        ),
        get<{ frames?: string[]; badges?: Array<{ code: string }> }>(`/v1/me/profile`)
      ]);

      if (walletRes.status === "fulfilled" && walletRes.value?.accounts && Array.isArray(walletRes.value.accounts)) {
        let coin = 0;
        let usdtMinor = 0n;
        for (const a of walletRes.value.accounts) {
          if (a.key.endsWith(":available") || a.key.includes("available")) {
            if (a.asset === "COIN") {
              coin = parseInt(a.balance || "0", 10) || 0;
            } else if (a.asset === "USDT") {
              try {
                usdtMinor += BigInt(a.balance || "0");
              } catch {
                // ignore
              }
            }
          }
        }
        setCoinBalance(coin);
        setUsdtBalance(fromMinorUnits(usdtMinor.toString()));
      }

      if (profileRes.status === "fulfilled" && profileRes.value) {
        const owned = new Set<string>();
        if (Array.isArray(profileRes.value.frames)) {
          for (const f of profileRes.value.frames) owned.add(f);
        }
        if (Array.isArray(profileRes.value.badges)) {
          for (const b of profileRes.value.badges) owned.add(b.code);
        }
        setOwnedCodes(owned);
      }
    } catch (err) {
      console.error("Failed to fetch wallet or profile", err);
    } finally {
      setLoadingBalance(false);
    }
  }, [player?.id]);

  useEffect(() => {
    void fetchWallet();
    const handleRefresh = () => void fetchWallet();
    window.addEventListener(BALANCE_REFRESH_EVENT, handleRefresh);
    window.addEventListener("focus", handleRefresh);
    return () => {
      window.removeEventListener(BALANCE_REFRESH_EVENT, handleRefresh);
      window.removeEventListener("focus", handleRefresh);
    };
  }, [fetchWallet]);

  const handleTabChange = (cat: StoreCategory) => {
    playButtonClickSound();
    setActiveCategory(cat);
    setFeedback(null);
  };

  const handleBuyItem = async (price: number, isUsdt: boolean, itemId: string, itemCode?: string) => {
    playButtonClickSound();
    setFeedback(null);

    if (!player) {
      playPurchaseErrorSound();
      setFeedback({
        type: "error",
        title: locale === "ar" ? "تسجيل الدخول مطلوب" : "Login Required",
        message: locale === "ar" ? "يرجى تسجيل الدخول أولاً لإتمام الشراء والاستمتاع بميزات المتجر." : "Please log in first to complete your purchase.",
        action: {
          label: locale === "ar" ? "تسجيل الدخول الآن" : "Log In Now",
          onClick: () => openPopup(),
        },
      });
      return;
    }

    if (itemCode && ownedCodes.has(itemCode)) {
      setFeedback({
        type: "success",
        title: locale === "ar" ? "العنصر بحوزتك بالفعل!" : "Item Already Owned",
        message: locale === "ar" ? "أنت تمتلك هذا العنصر بالفعل، يمكنك تجهيزه الآن من ملفك الشخصي." : "You already own this item. You can equip it in your profile.",
        action: {
          label: locale === "ar" ? "تجهيز في الملف الشخصي" : "Equip in Profile",
          href: "/profile",
        }
      });
      return;
    }

    if (isUsdt && usdtBalance < price) {
      playPurchaseErrorSound();
      setFeedback({
        type: "error",
        title: locale === "ar" ? "رصيد USDT غير كافٍ" : "Insufficient USDT",
        message: locale === "ar"
          ? `رصيدك الحالي هو $${usdtBalance.toFixed(2)} والمطلوب $${price.toFixed(2)}. يرجى شحن محفظتك للاستمرار.`
          : `Your balance is $${usdtBalance.toFixed(2)}, required is $${price.toFixed(2)}. Please deposit funds.`,
        action: {
          label: locale === "ar" ? "+ شحن المحفظة" : "+ Deposit USDT",
          href: "/wallet",
        },
      });
      return;
    }

    if (!isUsdt && coinBalance < price) {
      playPurchaseErrorSound();
      setFeedback({
        type: "error",
        title: locale === "ar" ? "رصيد الكوينز غير كافٍ" : "Insufficient Coins",
        message: locale === "ar"
          ? `رصيدك هو 🪙 ${coinBalance.toLocaleString()} والمطلوب 🪙 ${price.toLocaleString()}. يمكنك شحن الكوينز فوراً من تبويب العملات.`
          : `You have 🪙 ${coinBalance.toLocaleString()} Coins (need 🪙 ${price.toLocaleString()}). Get coins in the Coins tab.`,
        action: {
          label: locale === "ar" ? "شحن كوينز الآن" : "Get Coins Now",
          onClick: () => {
            setActiveCategory("coins");
            setFeedback(null);
          },
        },
      });
      return;
    }

    setPurchaseLoading(itemId);

    try {
      if (isUsdt) {
        if (activeCategory === "coins") {
          const res = await post<{ ok: boolean; yields?: number }>("/v1/store/buy/coins", { packId: itemId });
          playPurchaseSuccessSound();
          triggerBalanceRefresh();
          await fetchWallet();
          const pack = COIN_PACKAGES.find(p => p.id === itemId);
          const gained = res?.yields || (pack ? pack.amount + pack.bonus : 0);
          setFeedback({
            type: "success",
            title: locale === "ar" ? "🎉 تم شحن الكوينز بنجاح!" : "🎉 Coins Added Successfully!",
            message: locale === "ar"
              ? `تم إضافة 🪙 ${gained.toLocaleString()} كوينز إلى رصيدك بنجاح! شكراً لدعمك المنصة.`
              : `Added 🪙 ${gained.toLocaleString()} coins to your balance. Have fun in the arena!`,
          });
        } else if (activeCategory === "passes") {
          await post("/v1/store/buy/pass", { itemId });
          playPurchaseSuccessSound();
          triggerBalanceRefresh();
          await fetchWallet();
          setFeedback({
            type: "success",
            title: locale === "ar" ? "🎟️ تم تفعيل بطاقة المعركة المميزة!" : "🎟️ Battle Pass Activated!",
            message: locale === "ar"
              ? "تهانينا! تم فتح مسار مكافآت بريميوم الموسمي بالكامل. تفضل بزيارة صفحة تصريح المعركة لاستلام الجوائز."
              : "Premium Battle Pass unlocked! Check out the Battle Pass page to claim rewards.",
            action: {
              label: locale === "ar" ? "عرض بطاقة المعركة" : "View Battle Pass",
              href: "/battle-pass",
            }
          });
        }
      } else {
        await post("/v1/store/buy/cosmetic", { itemId });
        playPurchaseSuccessSound();
        triggerBalanceRefresh();
        await fetchWallet();
        if (itemCode) {
          setOwnedCodes(prev => new Set([...prev, itemCode]));
        }
        setFeedback({
          type: "success",
          title: locale === "ar" ? "✨ تم اقتناء المظهر بنجاح!" : "✨ Cosmetic Acquired!",
          message: locale === "ar"
            ? "تم إضافة العنصر إلى خزانتك. يمكنك الآن تجهيزه فوراً للتألق به في ساحات اللعب والدردشة."
            : "Item unlocked! Head over to your profile to equip it now.",
          action: {
            label: locale === "ar" ? "تجهيز في الملف الشخصي" : "Equip in Profile",
            href: "/profile",
          }
        });
      }
    } catch (err: any) {
      console.error(err);
      playPurchaseErrorSound();
      const code = err?.error || err?.message || "";
      let msg = locale === "ar" ? "فشلت عملية الشراء. حاول مرة أخرى." : "Purchase failed. Please try again.";
      let action: { label: string; href?: string; onClick?: () => void } | undefined;

      if (code === "INSUFFICIENT_FUNDS" || err?.message?.includes("Insufficient") || err?.message?.includes("insufficient")) {
        if (isUsdt) {
          msg = locale === "ar" ? "رصيدك من USDT غير كافٍ. يرجى شحن محفظتك للاستمرار." : "Insufficient USDT balance. Please deposit funds into your wallet.";
          action = { label: locale === "ar" ? "شحن المحفظة" : "Deposit USDT", href: "/wallet" };
        } else {
          msg = locale === "ar" ? "رصيد الكوينز غير كافٍ. يمكنك شراء المزيد من تبويب العملات." : "Insufficient Coins. Buy more in the Coins tab.";
          action = { label: locale === "ar" ? "شحن كوينز" : "Get Coins", onClick: () => setActiveCategory("coins") };
        }
      } else if (code === "ALREADY_OWNED" || err?.message?.includes("already own")) {
        msg = locale === "ar" ? "أنت تمتلك هذا العنصر بالفعل في خزانتك!" : "You already own this item!";
        action = { label: locale === "ar" ? "تجهيز في الملف الشخصي" : "Equip in Profile", href: "/profile" };
      }

      setFeedback({ 
        type: "error", 
        title: locale === "ar" ? "تنبيه" : "Notice",
        message: msg, 
        ...(action ? { action } : {}) 
      });
    } finally {
      setPurchaseLoading(null);
    }
  };

  return (
    <div className={styles.storeContainer}>
      {/* Background Ambience */}
      <div className={styles.bgGlowOrbTop} />
      <div className={styles.bgGlowOrbBottom} />
      <div className={styles.cyberGridPattern} />

      {/* Hero Header */}
      <header className={styles.heroHeader}>
        <div className={styles.brandBadge}>
          <span className={styles.brandBadgeDot} />
          <span>{locale === "ar" ? "المتجر الرسمي لنزلو" : "NIZALO OFFICIAL STORE"}</span>
        </div>

        <h1 className={styles.storeTitle}>
          {locale === "ar" ? "متجر نزلو" : "Nizalo Store"}
        </h1>

        <p className={styles.storeSubtitle}>
          {locale === "ar" 
            ? "اشحن رصيدك بالكوينز، تفرّد بأندر المظاهر والإطارات النيون، وسيطر على ساحات التحدي"
            : "Equip elite cosmetics, supercharge your coins, and dominate the arena with style."}
        </p>
        
        {/* Luxury Balances Bar */}
        <div className={styles.balancesDock}>
          {/* Coins Balance Card */}
          <div className={`${styles.balanceCard} ${styles.balanceCardCoin}`}>
            <div className={styles.balanceIconWrapper}>
              <span className={styles.coinGlyph}>🪙</span>
            </div>
            <div className={styles.balanceInfo}>
              <span className={styles.balanceCaption}>{locale === "ar" ? "عملات نزلو" : "Nizalo Coins"}</span>
              <span className={styles.balanceNumber}>
                {loadingBalance ? "..." : coinBalance.toLocaleString()}
              </span>
            </div>
            <button 
              className={styles.quickRechargeBtn}
              onClick={() => {
                playButtonClickSound();
                setActiveCategory("coins");
              }}
              title={locale === "ar" ? "شحن كوينز" : "Recharge Coins"}
            >
              {locale === "ar" ? "+ شحن" : "+ Add"}
            </button>
          </div>

          {/* USDT Balance Card */}
          <div className={`${styles.balanceCard} ${styles.balanceCardUsdt}`}>
            <div className={styles.balanceIconWrapper}>
              <span className={styles.usdtGlyph}>💵</span>
            </div>
            <div className={styles.balanceInfo}>
              <span className={styles.balanceCaption}>{locale === "ar" ? "محفظة USDT" : "USDT Wallet"}</span>
              <span className={styles.balanceNumber}>
                ${loadingBalance ? "..." : usdtBalance.toFixed(2)}
              </span>
            </div>
            <LocaleLink 
              href="/wallet" 
              className={styles.depositCtaBtn} 
              onMouseEnter={playCardHoverSound} 
              onClick={playButtonClickSound}
            >
              {locale === "ar" ? "+ إيداع" : "+ Deposit"}
            </LocaleLink>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div className={`${styles.feedbackBanner} ${feedback.type === "success" ? styles.feedbackSuccess : styles.feedbackError}`}>
            <div className={styles.feedbackIcon}>
              {feedback.type === "success" ? "✨" : "⚠️"}
            </div>
            <div className={styles.feedbackTextGroup}>
              {feedback.title && <div className={styles.feedbackTitle}>{feedback.title}</div>}
              <div className={styles.feedbackMessage}>{feedback.message}</div>
            </div>
            <div className={styles.feedbackActions}>
              {feedback.action?.href && (
                <LocaleLink href={feedback.action.href} className={styles.feedbackActionBtn}>
                  {feedback.action.label}
                </LocaleLink>
              )}
              {feedback.action?.onClick && (
                <button onClick={feedback.action.onClick} className={styles.feedbackActionBtn}>
                  {feedback.action.label}
                </button>
              )}
              <button 
                onClick={() => setFeedback(null)} 
                className={styles.feedbackCloseBtn} 
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Futuristic Segmented Navigation Dock */}
      <nav className={styles.navContainer} aria-label="Store Categories">
        <div className={styles.navDock}>
          <button 
            className={`${styles.tabBtn} ${activeCategory === "coins" ? styles.activeTab : ""}`}
            onClick={() => handleTabChange("coins")}
            onMouseEnter={playCardHoverSound}
          >
            <span className={styles.tabIcon}>🪙</span>
            <span className={styles.tabText}>{locale === "ar" ? "حزم الكوينز" : "Coin Packs"}</span>
            <span className={styles.tabBadgeGold}>{locale === "ar" ? "توفير" : "BONUS"}</span>
          </button>

          <button 
            className={`${styles.tabBtn} ${activeCategory === "cosmetics" ? styles.activeTab : ""}`}
            onClick={() => handleTabChange("cosmetics")}
            onMouseEnter={playCardHoverSound}
          >
            <span className={styles.tabIcon}>💎</span>
            <span className={styles.tabText}>{locale === "ar" ? "المظاهر الحصرية" : "Cosmetics"}</span>
            <span className={styles.tabBadgeNeon}>{locale === "ar" ? "جديد" : "NEW"}</span>
          </button>

          <button 
            className={`${styles.tabBtn} ${activeCategory === "passes" ? styles.activeTab : ""}`}
            onClick={() => handleTabChange("passes")}
            onMouseEnter={playCardHoverSound}
          >
            <span className={styles.tabIcon}>🎟️</span>
            <span className={styles.tabText}>{locale === "ar" ? "بطاقة المعركة" : "Battle Pass"}</span>
            <span className={styles.tabBadgePurple}>{locale === "ar" ? "الموسم 1" : "S1"}</span>
          </button>
        </div>
      </nav>

      {/* Main Showcase Stage */}
      <main className={styles.showcaseStage}>
        {/* TAB 1: COINS */}
        {activeCategory === "coins" && (
          <section className={styles.coinsSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                {locale === "ar" ? "باقات كوينز نزلو" : "Nizalo Coin Packages"}
              </h2>
              <p className={styles.sectionSubtitle}>
                {locale === "ar" 
                  ? "اشحن كوينز للعب في الطاولات والمشاركة في الفعاليات واقتناء أندر المظاهر" 
                  : "Acquire coins to unlock cosmetics, duel in premium tables, and enter high-stakes events."}
              </p>
            </div>

            <div className={styles.coinPacksGrid}>
              {COIN_PACKAGES.map((pkg) => {
                const totalCoins = pkg.amount + pkg.bonus;
                return (
                  <div 
                    key={pkg.id} 
                    className={`
                      ${styles.coinCard} 
                      ${pkg.popular ? styles.popularCard : ""} 
                      ${pkg.bestValue ? styles.bestValueCard : ""}
                      ${styles[`tier_${pkg.tierColor}`]}
                    `}
                    onMouseEnter={playCardHoverSound}
                  >
                    {/* Header Ribbon */}
                    <div className={styles.packRibbon}>
                      <span>{locale === "ar" ? pkg.tagAr : pkg.tagEn}</span>
                    </div>

                    {/* Pack Visual */}
                    <div className={styles.coinVisualWrapper}>
                      <div className={styles.coinGlowAura} />
                      <div className={styles.coinArt}>
                        {pkg.bonus >= 500 ? "👑" : pkg.bonus > 0 ? "💰" : "🪙"}
                      </div>
                    </div>

                    {/* Pack Info */}
                    <h3 className={styles.packName}>
                      {locale === "ar" ? pkg.nameAr : pkg.name}
                    </h3>

                    <div className={styles.coinAmountRow}>
                      <span className={styles.coinCountMajor}>{totalCoins.toLocaleString()}</span>
                      <span className={styles.coinCountUnit}>🪙</span>
                    </div>

                    {pkg.bonus > 0 ? (
                      <div className={styles.bonusCallout}>
                        <span>{pkg.amount.toLocaleString()}</span>
                        <span className={styles.bonusBadge}>+ {pkg.bonus.toLocaleString()} {locale === "ar" ? "بونص" : "Bonus"}</span>
                      </div>
                    ) : (
                      <div className={styles.standardCallout}>
                        {locale === "ar" ? "رصيد أساسي مباشر" : "Instant direct balance"}
                      </div>
                    )}

                    {/* Purchase CTA */}
                    <button 
                      className={styles.buyPackBtn}
                      onClick={() => handleBuyItem(pkg.price, true, pkg.id)}
                      disabled={purchaseLoading === pkg.id}
                    >
                      {purchaseLoading === pkg.id ? (
                        <span className={styles.btnSpinner}>{locale === "ar" ? "جاري الشراء..." : "Processing..."}</span>
                      ) : (
                        <span className={styles.btnPriceContent}>
                          <span>{locale === "ar" ? "شراء بـ" : "Buy for"}</span>
                          <strong className={styles.priceTag}>${pkg.price.toFixed(2)}</strong>
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 2: COSMETICS */}
        {activeCategory === "cosmetics" && (
          <section className={styles.cosmeticsSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                {locale === "ar" ? "خزانة المظاهر والسمات الحصرية" : "Exclusive Vault Cosmetics"}
              </h2>
              <p className={styles.sectionSubtitle}>
                {locale === "ar" 
                  ? "تزيّن بأرقى إطارات النيون والشارات التذكارية، وتباهى بها أمام خصومك في كل نزال" 
                  : "Stand out with animated neon frames and royal badges across all game tables."}
              </p>
            </div>

            <div className={styles.cosmeticsGrid}>
              {COSMETICS.map((item) => {
                const isOwned = ownedCodes.has(item.code);

                return (
                  <div 
                    key={item.id} 
                    className={`${styles.cosmeticCard} ${isOwned ? styles.ownedCosmeticCard : ""}`}
                    onMouseEnter={playCardHoverSound}
                  >
                    {/* Rarity & Type Header */}
                    <div className={styles.cosmeticCardHeader}>
                      <span 
                        className={styles.rarityPill}
                        style={{ color: item.rarityColor, borderColor: `${item.rarityColor}55`, background: `${item.rarityColor}15` }}
                      >
                        {locale === "ar" ? item.rarityAr : item.rarity}
                      </span>
                      <span className={styles.typePill}>
                        {locale === "ar" ? item.typeLabelAr : item.typeLabelEn}
                      </span>
                    </div>

                    {/* Dynamic Interactive Preview Box */}
                    <div className={styles.previewBox}>
                      <div 
                        className={styles.previewAura} 
                        style={{ background: `radial-gradient(circle, ${item.rarityColor}33 0%, transparent 70%)` }}
                      />
                      
                      {item.type === "frame" ? (
                        <div className={styles.framePreviewAvatarWrapper}>
                          <div className={styles.mockAvatarCircle}>
                            <span>👤</span>
                          </div>
                          <div 
                            className={styles.animatedFrameRing}
                            style={{ boxShadow: `0 0 20px ${item.rarityColor}, inset 0 0 12px ${item.rarityColor}` }}
                          />
                        </div>
                      ) : (
                        <div className={styles.badgePreviewWrapper}>
                          <span className={styles.badgeGlyph}>{item.icon}</span>
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className={styles.cosmeticInfo}>
                      <h3 className={styles.cosmeticTitle}>
                        {locale === "ar" ? item.nameAr : item.name}
                      </h3>
                      <p className={styles.cosmeticDesc}>
                        {locale === "ar" ? item.descAr : item.descEn}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className={styles.cosmeticActionRow}>
                      {isOwned ? (
                        <div className={styles.ownedBlock}>
                          <div className={styles.ownedCheck}>
                            <span>✓</span>
                            <span>{locale === "ar" ? "مملوك في خزانتك" : "Owned"}</span>
                          </div>
                          <LocaleLink href="/profile" className={styles.equipBtn}>
                            {locale === "ar" ? "تجهيز في الملف" : "Equip"}
                          </LocaleLink>
                        </div>
                      ) : (
                        <button 
                          className={styles.buyCosmeticBtn}
                          onClick={() => handleBuyItem(item.price, false, item.id, item.code)}
                          disabled={purchaseLoading === item.id}
                        >
                          {purchaseLoading === item.id ? (
                            <span>{locale === "ar" ? "جاري التجهيز..." : "Unlocking..."}</span>
                          ) : (
                            <span className={styles.coinCostContent}>
                              <span>{locale === "ar" ? "اقتناء بـ" : "Unlock for"}</span>
                              <strong className={styles.costCoinValue}>
                                🪙 {item.price.toLocaleString()}
                              </strong>
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 3: BATTLE PASS */}
        {activeCategory === "passes" && (
          <section className={styles.passSection}>
            <div className={styles.passHeroContainer}>
              <div className={styles.passAmbientBackdrop} />

              <div className={styles.passContentGrid}>
                {/* Left/Main Column */}
                <div className={styles.passIntroColumn}>
                  <div className={styles.seasonFlag}>
                    <span className={styles.seasonFlagDot} />
                    <span>{locale === "ar" ? "الموسم الأول • بزوغ النيون" : "SEASON 1 • NEON GENESIS"}</span>
                  </div>

                  <h2 className={styles.passMainTitle}>
                    {locale === "ar" ? "بطاقة المعركة المميزة" : "Premium Battle Pass"}
                  </h2>

                  <p className={styles.passHeroDesc}>
                    {locale === "ar" 
                      ? "افتح مسار الجوائز الأسطوري الكامل واحصل على إطارات متحركة فريدة، ونقاط خبرة مضاعفة، وصناديق USDT مع كل انتصار تحققه في أي لعبة!"
                      : "Unlock the complete tier tree with animated frames, +10% XP multipliers, and instant cash lootboxes on every victory."}
                  </p>

                  <div className={styles.passPerksGrid}>
                    <div className={styles.perkItem}>
                      <div className={styles.perkIcon}>✨</div>
                      <div className={styles.perkText}>
                        <strong>{locale === "ar" ? "إطارات نيون حصرية" : "Animated Profile Frames"}</strong>
                        <p>{locale === "ar" ? "تأثيرات ضوئية متحركة حول صورتك" : "Exclusive glow rings only for pass holders"}</p>
                      </div>
                    </div>

                    <div className={styles.perkItem}>
                      <div className={styles.perkIcon}>⚡</div>
                      <div className={styles.perkText}>
                        <strong>{locale === "ar" ? "مضاعف خبرة +10% XP" : "+10% Season XP Boost"}</strong>
                        <p>{locale === "ar" ? "ارتقِ في المستويات بسرعة البرق" : "Level up faster on every win"}</p>
                      </div>
                    </div>

                    <div className={styles.perkItem}>
                      <div className={styles.perkIcon}>🎁</div>
                      <div className={styles.perkText}>
                        <strong>{locale === "ar" ? "جوائز كوينز ودولار USDT" : "Coins & USDT Loot"}</strong>
                        <p>{locale === "ar" ? "مكافآت مالية قابلة للسحب مع التقدم" : "Cash rewards unlockable at each tier"}</p>
                      </div>
                    </div>

                    <div className={styles.perkItem}>
                      <div className={styles.perkIcon}>👑</div>
                      <div className={styles.perkText}>
                        <strong>{locale === "ar" ? "دخول ردهات كبار الشخصيات" : "VIP Lobby Key"}</strong>
                        <p>{locale === "ar" ? "شارة VIP الخاصة بجانب اسمك" : "Custom chat flair and status emblem"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className={styles.passCtas}>
                    <button 
                      className={styles.passUnlockBtn}
                      onClick={() => handleBuyItem(15.0, true, "pass1")}
                      disabled={purchaseLoading === "pass1"}
                    >
                      {purchaseLoading === "pass1" ? (
                        <span>{locale === "ar" ? "جاري التفعيل..." : "Unlocking..."}</span>
                      ) : (
                        <span>
                          {locale === "ar" ? "تفعيل بريميوم مقابل $15.00" : "Unlock Premium for $15.00"}
                        </span>
                      )}
                    </button>

                    <LocaleLink href="/battle-pass" className={styles.passTrackLink}>
                      {locale === "ar" ? "استعراض مسار المكافآت الكامل ←" : "Explore Full Rewards Track →"}
                    </LocaleLink>
                  </div>
                </div>

                {/* Right Trophy Showcase */}
                <div className={styles.passVisualColumn}>
                  <div className={styles.trophyDisplayFrame}>
                    <div className={styles.trophyGlowHalo} />
                    <span className={styles.trophyIcon}>🏆</span>
                    <div className={styles.trophyCaption}>
                      <span>{locale === "ar" ? "مكافآت بقيمة تتجاوز $60" : "Over $60 in Value"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
