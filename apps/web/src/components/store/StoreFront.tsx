"use client";

import React, { useState } from "react";
import styles from "./StoreFront.module.css";
import { LocaleLink } from "@/components/LocaleLink";
import { post } from "../../lib/api";
import { 
  playCardHoverSound, 
  playButtonClickSound, 
  playCoinClinkSound,
  playPurchaseSuccessSound,
  playPurchaseErrorSound
} from "../../lib/game-audio";

type StoreCategory = "coins" | "cosmetics" | "passes";

const COIN_PACKAGES = [
  { id: "c1", amount: 100, bonus: 0, price: 1.0, popular: false },
  { id: "c2", amount: 500, bonus: 50, price: 5.0, popular: true },
  { id: "c3", amount: 1200, bonus: 200, price: 10.0, popular: false },
  { id: "c4", amount: 2500, bonus: 500, price: 20.0, popular: false },
];

const COSMETICS = [
  { id: "cos1", name: "Neon Flame Avatar Border", type: "border", price: 500, image: "🔥" },
  { id: "cos2", name: "Cyberpunk Dice Skin", type: "dice", price: 800, image: "🎲" },
  { id: "cos3", name: "Holographic Board", type: "board", price: 1200, image: "🌌" },
  { id: "cos4", name: "Golden VIP Badge", type: "badge", price: 300, image: "⭐" },
];

export function StoreFront() {
  const [activeCategory, setActiveCategory] = useState<StoreCategory>("coins");
  const [balance, setBalance] = useState(150); // Fake balance for demo
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);

  const handleTabChange = (cat: StoreCategory) => {
    playButtonClickSound();
    setActiveCategory(cat);
  };

  const handleBuyItem = async (price: number, isUsdt: boolean, itemId: string) => {
    playButtonClickSound();
    setPurchaseLoading(itemId);

    try {
      if (isUsdt) {
        if (activeCategory === "coins") {
          await post("/v1/store/buy/coins", { packId: itemId });
          playPurchaseSuccessSound();
          const pack = COIN_PACKAGES.find(p => p.id === itemId);
          if (pack) {
            setBalance(prev => prev + pack.amount + pack.bonus);
          }
        } else if (activeCategory === "passes") {
          await post("/v1/store/buy/pass", { itemId });
          playPurchaseSuccessSound();
        }
      } else {
        if (balance >= price) {
          await post("/v1/store/buy/cosmetic", { itemId });
          playPurchaseSuccessSound();
          setBalance(prev => prev - price);
        } else {
          playPurchaseErrorSound();
          alert("Insufficient Coins! Buy more in the Coins tab.");
        }
      }
    } catch (err: any) {
      console.error(err);
      playPurchaseErrorSound();
      alert(err.message || "Purchase failed!");
    } finally {
      setPurchaseLoading(null);
    }
  };

  return (
    <div className={styles.storeContainer}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerGlow}></div>
        <h1 className={styles.title}>The Emporium</h1>
        <p className={styles.subtitle}>Equip, Upgrade, and Dominate the Neon Realm</p>
        
        <div className={styles.balanceWidget}>
          <span className={styles.balanceIcon}>🪙</span>
          <span className={styles.balanceAmount}>{balance}</span>
          <LocaleLink href="/wallet" className={styles.addFundsBtn} onMouseEnter={playCardHoverSound} onClick={playButtonClickSound}>
            + USDT
          </LocaleLink>
        </div>
      </div>

      {/* Navigation */}
      <div className={styles.navTabs}>
        <button 
          className={`${styles.tabBtn} ${activeCategory === "coins" ? styles.activeTab : ""}`}
          onClick={() => handleTabChange("coins")}
          onMouseEnter={playCardHoverSound}
        >
          🪙 Coins
        </button>
        <button 
          className={`${styles.tabBtn} ${activeCategory === "cosmetics" ? styles.activeTab : ""}`}
          onClick={() => handleTabChange("cosmetics")}
          onMouseEnter={playCardHoverSound}
        >
          💎 Cosmetics
        </button>
        <button 
          className={`${styles.tabBtn} ${activeCategory === "passes" ? styles.activeTab : ""}`}
          onClick={() => handleTabChange("passes")}
          onMouseEnter={playCardHoverSound}
        >
          🎟️ Battle Pass
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
                {pkg.popular && <div className={styles.popularBadge}>BEST VALUE</div>}
                <div className={styles.coinIcon}>🪙</div>
                <div className={styles.coinAmount}>{pkg.amount}</div>
                {pkg.bonus > 0 && <div className={styles.bonusAmount}>+ {pkg.bonus} Bonus</div>}
                <button 
                  className={styles.buyBtnUsdt}
                  onClick={() => handleBuyItem(pkg.price, true, pkg.id)}
                  disabled={purchaseLoading === pkg.id}
                >
                  {purchaseLoading === pkg.id ? "Processing..." : `$${pkg.price.toFixed(2)}`}
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
                <div className={styles.cosmeticName}>{item.name}</div>
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
            <h2 className={styles.passTitle}>Season 1: Neon Genesis</h2>
            <p className={styles.passDesc}>Unlock exclusive avatars, chat colors, and 10% more XP per win!</p>
            <ul className={styles.passPerks}>
              <li>✨ Animated Profile Borders</li>
              <li>🚀 Instant Access to VIP Lobbies</li>
              <li>🎁 Daily Mystery Lootbox</li>
            </ul>
            <button 
              className={styles.passBuyBtn}
              onClick={() => handleBuyItem(15.0, true, "pass1")}
              disabled={purchaseLoading === "pass1"}
            >
              {purchaseLoading === "pass1" ? "Unlocking..." : "Unlock Premium for $15.00"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
