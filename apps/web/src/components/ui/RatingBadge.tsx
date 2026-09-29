import React from "react";
import styles from "./RatingBadge.module.css";

export type TierName =
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum"
  | "Diamond"
  | "Grandmaster";

export interface RatingBadgeProps {
  rating: number;
  showTierName?: boolean;
  className?: string;
}

export function getTier(rating: number): { name: TierName; icon: string; className: string } {
  if (rating >= 2400) {
    return { name: "Grandmaster", icon: "👑", className: styles.tierGrandmaster ?? "" };
  }
  if (rating >= 2100) {
    return { name: "Diamond", icon: "💎", className: styles.tierDiamond ?? "" };
  }
  if (rating >= 1800) {
    return { name: "Platinum", icon: "⚡", className: styles.tierPlatinum ?? "" };
  }
  if (rating >= 1500) {
    return { name: "Gold", icon: "🏆", className: styles.tierGold ?? "" };
  }
  if (rating >= 1200) {
    return { name: "Silver", icon: "⚔️", className: styles.tierSilver ?? "" };
  }
  return { name: "Bronze", icon: "🛡️", className: styles.tierBronze ?? "" };
}

export function RatingBadge({
  rating,
  showTierName = true,
  className,
}: RatingBadgeProps) {
  const tier = getTier(rating);

  return (
    <span
      className={[styles.badge, tier.className, className].filter(Boolean).join(" ")}
      title={`${tier.name} Tier (${rating} ELO)`}
      aria-label={`${tier.name} rating ${rating}`}
    >
      <span className={styles.crestIcon} aria-hidden="true">
        {tier.icon}
      </span>
      {showTierName && <span>{tier.name}</span>}
      <span className={styles.ratingNum}>{rating}</span>
    </span>
  );
}
