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

const COIN_PACKAGES = [
  { id: "c1", amount: 100, bonus: 0, price: 1.0, popular: false },
  { id: "c2", amount: 500, bonus: 50, price: 5.0, popular: true },
  { id: "c3", amount: 1200, bonus: 200, price: 10.0, popular: false },
  { id: "c4", amount: 2500, bonus: 500, price: 20.0, popular: false },
];

const COSMETICS = [
  { id: "cos1", name: "Neon Flame Avatar Border", nameAr: "إطار شعلة النيون", type: "border", price: 500, image: "🔥" },
  { id: "cos2", name: "Cyberpunk Dice Skin", nameAr: "نرد السايبربانك", type: "dice", price: 800, image: "🎲" },
  { id: "cos3", name: "Holographic Board", nameAr: "لوحة الهولوغرام", type: "board", price: 1200, image: "🌌" },
  { id: "cos4", name: "Golden VIP Badge", nameAr: "شارة VIP الذهبية", type: "badge", price: 300, image: "⭐" },
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
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
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
      const res = await get<{ accounts?: Array<{ key: string; asset: string; balance: string }> }>(
        `/v1/players/${player.id}/wallet`
      );
      if (res?.accounts && Array.isArray(res.accounts)) {
        let coin = 0;
        let usdtMinor = 0n;
        for (const a of res.accounts) {
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
    } catch (err) {
      console.error("Failed to fetch wallet balances", err);
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

  const handleBuyItem = async (price: number, isUsdt: boolean, itemId: string) => {
    playButtonClickSound();
    setFeedback(null);

    if (!player) {
      playPurchaseErrorSound();
      setFeedback({
        type: "error",
        message: locale === "ar" ? "يرجى تسجيل الدخول أولاً لإتمام الشراء." : "Please log in first to complete your purchase.",
        action: {
          label: locale === "ar" ? "تسجيل الدخول" : "Log In",
          onClick: () => openPopup(),
        },
      });
      return;
    }

    if (isUsdt && usdtBalance < price) {
      playPurchaseErrorSound();
      setFeedback({
        type: "error",
        message: locale === "ar"
          ? `رصيد USDT غير كافٍ ($${usdtBalance.toFixed(2)} / $${price.toFixed(2)}). يرجى شحن محفظتك للاستمرار.`
          : `Insufficient USDT balance ($${usdtBalance.toFixed(2)} / $${price.toFixed(2)}). Please deposit funds to continue.`,
        action: {
          label: locale === "ar" ? "شحن المحفظة" : "Deposit Funds",
          href: "/wallet",
        },
      });
      return;
    }

    if (!isUsdt && coinBalance < price) {
      playPurchaseErrorSound();
      setFeedback({
        type: "error",
        message: locale === "ar"
          ? `رصيد الكوينز غير كافٍ (لديك 🪙 ${coinBalance} / المطلوب 🪙 ${price}). يمكنك شحن الكوينز من تبويب العملات.`
          : `Insufficient Coins (you have 🪙 ${coinBalance} / need 🪙 ${price}). Buy more in the Coins tab.`,
        action: {
          label: locale === "ar" ? "شراء كوينز" : "Get Coins",
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
            message: locale === "ar"
              ? `تم شراء حزمة الكوينز بنجاح! تم إضافة 🪙 ${gained} إلى رصيدك.`
              : `Successfully purchased coin pack! Added 🪙 ${gained} to your balance.`,
          });
        } else if (activeCategory === "passes") {
          await post("/v1/store/buy/pass", { itemId });
          playPurchaseSuccessSound();
          triggerBalanceRefresh();
          await fetchWallet();
          setFeedback({
            type: "success",
            message: locale === "ar"
              ? "تم تفعيل بطاقة المعركة المميزة بنجاح! استمتع بالمكافآت الحصرية."
              : "Premium Battle Pass unlocked successfully! Enjoy your exclusive rewards.",
          });
        }
      } else {
        await post("/v1/store/buy/cosmetic", { itemId });
        playPurchaseSuccessSound();
        triggerBalanceRefresh();
        await fetchWallet();
        setFeedback({
          type: "success",
          message: locale === "ar"
            ? "تم شراء العنصر بنجاح! يمكنك الآن تجهيزه في ملفك الشخصي."
            : "Item purchased successfully! You can now equip it in your profile.",
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
          action = { label: locale === "ar" ? "شراء كوينز" : "Get Coins", onClick: () => setActiveCategory("coins") };
        }
      } else if (code === "ALREADY_OWNED" || err?.message?.includes("already own")) {
        msg = locale === "ar" ? "أنت تمتلك هذا العنصر بالفعل!" : "You already own this item!";
      }

      setFeedback({ type: "error", message: msg, ...(action ? { action } : {}) });
    } finally {
      setPurchaseLoading(null);
    }
  };

  return (
    <div className={styles.storeContainer}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerGlow}></div>
        <h1 className={styles.title}>{locale === "ar" ? "متجر نزلو" : "The Emporium"}</h1>
        <p className={styles.subtitle}>
          {locale === "ar" ? "جهّز حسابك، طوّر مستواك، وتألق في ساحات النزال" : "Equip, Upgrade, and Dominate the Neon Realm"}
        </p>
        
        <div className={styles.balancesRow}>
          <div className={styles.balanceWidget}>
            <span className={styles.balanceIcon}>🪙</span>
            <span className={styles.balanceAmount}>{loadingBalance ? "..." : coinBalance}</span>
            <span className={styles.balanceLabel}>{locale === "ar" ? "كوينز" : "Coins"}</span>
          </div>

          <div className={styles.balanceWidget}>
            <span className={styles.balanceIcon}>💵</span>
            <span className={styles.balanceAmount}>${loadingBalance ? "..." : usdtBalance.toFixed(2)}</span>
            <span className={styles.balanceLabel}>USDT</span>
            <LocaleLink href="/wallet" className={styles.addFundsBtn} onMouseEnter={playCardHoverSound} onClick={playButtonClickSound}>
              {locale === "ar" ? "+ شحن" : "+ Deposit"}
            </LocaleLink>
          </div>
        </div>

        {feedback && (
          <div className={`${styles.feedbackBanner} ${feedback.type === "success" ? styles.feedbackSuccess : styles.feedbackError}`}>
            <span>{feedback.message}</span>
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
              <button onClick={() => setFeedback(null)} className={styles.feedbackCloseBtn} title="Dismiss">
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className={styles.navTabs}>
        <button 
          className={`${styles.tabBtn} ${activeCategory === "coins" ? styles.activeTab : ""}`}
          onClick={() => handleTabChange("coins")}
          onMouseEnter={playCardHoverSound}
        >
          🪙 {locale === "ar" ? "العملات" : "Coins"}
        </button>
        <button 
          className={`${styles.tabBtn} ${activeCategory === "cosmetics" ? styles.activeTab : ""}`}
          onClick={() => handleTabChange("cosmetics")}
          onMouseEnter={playCardHoverSound}
        >
          💎 {locale === "ar" ? "المظاهر والأشكال" : "Cosmetics"}
        </button>
        <button 
          className={`${styles.tabBtn} ${activeCategory === "passes" ? styles.activeTab : ""}`}
          onClick={() => handleTabChange("passes")}
          onMouseEnter={playCardHoverSound}
        >
          🎟️ {locale === "ar" ? "بطاقة المعركة" : "Battle Pass"}
        </button>
      </div>

      {/* Content */}
      <div className={styles.contentArea}>
        {activeCategory === "coins" && (
          <div className={styles.grid}>
            {COIN_PACKAGES.map((pkg) => (
              <div 
                key={pkg.id} 
                className={`${styles.card} ${pkg.popular ? styles.popularCard : ""}`}
                onMouseEnter={playCardHoverSound}
              >
                {pkg.popular && <div className={styles.popularBadge}>{locale === "ar" ? "الأفضل قيمة" : "BEST VALUE"}</div>}
                <div className={styles.coinIcon}>🪙</div>
                <div className={styles.coinAmount}>{pkg.amount}</div>
                {pkg.bonus > 0 && <div className={styles.bonusAmount}>+ {pkg.bonus} {locale === "ar" ? "إضافية" : "Bonus"}</div>}
                <button 
                  className={styles.buyBtnUsdt}
                  onClick={() => handleBuyItem(pkg.price, true, pkg.id)}
                  disabled={purchaseLoading === pkg.id}
                >
                  {purchaseLoading === pkg.id ? (locale === "ar" ? "جاري الشراء..." : "Processing...") : `$${pkg.price.toFixed(2)}`}
                </button>
              </div>
            ))}
          </div>
        )}

        {activeCategory === "cosmetics" && (
          <div className={styles.grid}>
            {COSMETICS.map((item) => (
              <div key={item.id} className={styles.card} onMouseEnter={playCardHoverSound}>
                <div className={styles.cosmeticPreview}>{item.image}</div>
                <div className={styles.cosmeticName}>{locale === "ar" ? item.nameAr : item.name}</div>
                <div className={styles.cosmeticType}>{item.type.toUpperCase()}</div>
                <button 
                  className={styles.buyBtnCoin}
                  onClick={() => handleBuyItem(item.price, false, item.id)}
                  disabled={purchaseLoading === item.id}
                >
                  {purchaseLoading === item.id ? "..." : (
                    <>🪙 {item.price}</>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {activeCategory === "passes" && (
          <div className={styles.passContainer}>
            <div className={styles.passGlow}></div>
            <div className={styles.passIcon}>🏆</div>
            <h2 className={styles.passTitle}>{locale === "ar" ? "الموسم الأول: بزوغ النيون" : "Season 1: Neon Genesis"}</h2>
            <p className={styles.passDesc}>
              {locale === "ar" 
                ? "افتح إطارات وألقاب حصرية، وألوان دردشة مميزة، و10% زيادة في نقاط الخبرة لكل فوز!"
                : "Unlock exclusive avatars, chat colors, and 10% more XP per win!"}
            </p>
            <ul className={styles.passPerks}>
              <li>✨ {locale === "ar" ? "إطارات ملف شخصي متحركة ومميزة" : "Animated Profile Borders"}</li>
              <li>🚀 {locale === "ar" ? "دخول فوري لردهات كبار الشخصيات VIP" : "Instant Access to VIP Lobbies"}</li>
              <li>🎁 {locale === "ar" ? "صناديق جوائز ومكافآت يومية" : "Daily Mystery Lootbox"}</li>
            </ul>
            <button 
              className={styles.passBuyBtn}
              onClick={() => handleBuyItem(15.0, true, "pass1")}
              disabled={purchaseLoading === "pass1"}
            >
              {purchaseLoading === "pass1" 
                ? (locale === "ar" ? "جاري التفعيل..." : "Unlocking...") 
                : (locale === "ar" ? "تفعيل بريميوم مقابل $15.00" : "Unlock Premium for $15.00")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
