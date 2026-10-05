/**
 * High-Converting Luxury Wealth & Coin Icon.
 * Replaces generic/boring icons with a shiny, radiant gold coin & wallet symbol
 * symbolizing real cash, instant payouts, and crypto wealth.
 */
export function WealthWalletIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ verticalAlign: "middle", filter: "drop-shadow(0 2px 5px rgba(245, 158, 11, 0.4))" }}
    >
      <defs>
        <linearGradient id="nzGoldOuter" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE082" />
          <stop offset="40%" stopColor="#FFB300" />
          <stop offset="75%" stopColor="#FF8F00" />
          <stop offset="100%" stopColor="#FFA000" />
        </linearGradient>
        <linearGradient id="nzGoldInner" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF8E1" />
          <stop offset="35%" stopColor="#FFCA28" />
          <stop offset="75%" stopColor="#FFA000" />
          <stop offset="100%" stopColor="#FF6F00" />
        </linearGradient>
        <linearGradient id="nzCoinGlint" x1="5" y1="3" x2="15" y2="13" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Outer Coin Edge with Bevel */}
      <circle cx="12" cy="12" r="10" fill="url(#nzGoldOuter)" stroke="#FFF9C4" strokeWidth="0.8" />
      {/* Inner Recessed Face */}
      <circle cx="12" cy="12" r="7.8" fill="url(#nzGoldInner)" stroke="#FF8F00" strokeWidth="0.6" strokeDasharray="1.2 0.8" />
      {/* Brilliant Glint Curve */}
      <path
        d="M6 10 C 6 6, 9.5 4.2, 14 4.2 C 10.5 4.5, 7.2 7, 7.2 11 Z"
        fill="url(#nzCoinGlint)"
      />
      {/* Embossed Currency Symbol ($) */}
      <path
        d="M12 6 V 7.2 M12 16.8 V 18 M14.2 9.2 C 14.2 8.1 13.2 7.4 12 7.4 C 10.7 7.4 9.6 8.1 9.6 9.2 C 9.6 11 14.4 10.4 14.4 12.4 C 14.4 13.6 13.3 14.4 12 14.4 C 10.5 14.4 9.4 13.6 9.4 12.4"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
