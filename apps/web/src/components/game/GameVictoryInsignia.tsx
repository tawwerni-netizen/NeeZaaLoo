"use client";

import React from "react";
import type { VictoryInsigniaType } from "@/lib/games/theme-tokens";
import styles from "./ResultCeremony.module.css";

export function GameVictoryInsignia({ type }: { type: VictoryInsigniaType }) {
  switch (type) {
    case "crown":
      // Chess: Grandmaster Imperial Crown
      return (
        <svg viewBox="0 0 100 100" className={styles.laurelSvg} aria-hidden="true">
          <defs>
            <linearGradient id="crown-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFF4D0" />
              <stop offset="40%" stopColor="#F59E0B" />
              <stop offset="85%" stopColor="#B45309" />
              <stop offset="100%" stopColor="#78350F" />
            </linearGradient>
            <radialGradient id="crown-ruby" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#FF6B6B" />
              <stop offset="100%" stopColor="#B91C1C" />
            </radialGradient>
          </defs>
          {/* Outer Laurel Wings */}
          <path d="M 18 72 C 8 50, 14 28, 30 16 C 28 24, 30 32, 36 38 C 28 44, 24 56, 26 70 Z" fill="url(#crown-gold)" opacity="0.8" />
          <path d="M 82 72 C 92 50, 86 28, 70 16 C 72 24, 70 32, 64 38 C 72 44, 76 56, 74 70 Z" fill="url(#crown-gold)" opacity="0.8" />
          {/* Imperial Crown */}
          <path
            d="M 22 66 L 30 32 L 42 48 L 50 20 L 58 48 L 70 32 L 78 66 Z"
            fill="url(#crown-gold)"
            filter="drop-shadow(0 4px 8px rgba(0,0,0,0.6))"
          />
          <rect x="22" y="66" width="56" height="10" rx="3" fill="url(#crown-gold)" />
          {/* Jewels */}
          <circle cx="50" cy="18" r="4" fill="url(#crown-ruby)" />
          <circle cx="30" cy="30" r="3" fill="url(#crown-ruby)" />
          <circle cx="70" cy="30" r="3" fill="url(#crown-ruby)" />
          <circle cx="38" cy="71" r="2.5" fill="#3B82F6" />
          <circle cx="50" cy="71" r="3" fill="url(#crown-ruby)" />
          <circle cx="62" cy="71" r="2.5" fill="#3B82F6" />
        </svg>
      );

    case "domino-bone":
      // Dominoes: Double-Six Bone Tile & Amber Laurel
      return (
        <svg viewBox="0 0 100 100" className={styles.laurelSvg} aria-hidden="true">
          <defs>
            <linearGradient id="dom-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FEF3C7" />
              <stop offset="50%" stopColor="#D97706" />
              <stop offset="100%" stopColor="#78350F" />
            </linearGradient>
            <linearGradient id="dom-tile-body" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="60%" stopColor="#F5EFE6" />
              <stop offset="100%" stopColor="#E2D5BE" />
            </linearGradient>
          </defs>
          {/* Laurel */}
          <path d="M 20 70 C 10 52, 14 32, 28 20 C 27 28, 29 36, 34 42 C 28 48, 25 58, 27 68 Z" fill="url(#dom-gold)" />
          <path d="M 80 70 C 90 52, 86 32, 72 20 C 73 28, 71 36, 66 42 C 72 48, 75 58, 73 68 Z" fill="url(#dom-gold)" />
          {/* 3D Domino Tile */}
          <rect x="36" y="22" width="28" height="56" rx="6" fill="url(#dom-tile-body)" stroke="#B45309" strokeWidth="2" filter="drop-shadow(0 6px 12px rgba(0,0,0,0.6))" />
          <line x1="39" y1="50" x2="61" y2="50" stroke="#B45309" strokeWidth="1.5" />
          <circle cx="50" cy="50" r="1.5" fill="#D97706" />
          {/* Top 6 pips */}
          <circle cx="43" cy="29" r="2" fill="#1C1917" />
          <circle cx="43" cy="36" r="2" fill="#1C1917" />
          <circle cx="43" cy="43" r="2" fill="#1C1917" />
          <circle cx="57" cy="29" r="2" fill="#1C1917" />
          <circle cx="57" cy="36" r="2" fill="#1C1917" />
          <circle cx="57" cy="43" r="2" fill="#1C1917" />
          {/* Bottom 6 pips */}
          <circle cx="43" cy="57" r="2" fill="#1C1917" />
          <circle cx="43" cy="64" r="2" fill="#1C1917" />
          <circle cx="43" cy="71" r="2" fill="#1C1917" />
          <circle cx="57" cy="57" r="2" fill="#1C1917" />
          <circle cx="57" cy="64" r="2" fill="#1C1917" />
          <circle cx="57" cy="71" r="2" fill="#1C1917" />
        </svg>
      );

    case "ludo-star":
      // Ludo: 4-Color Champions Star & Victory Podium
      return (
        <svg viewBox="0 0 100 100" className={styles.laurelSvg} aria-hidden="true">
          <defs>
            <radialGradient id="star-center-gold" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFBEB" />
              <stop offset="60%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#D97706" />
            </radialGradient>
          </defs>
          {/* 4 Colored Orbital Glow Wings */}
          <circle cx="32" cy="32" r="14" fill="#EF4444" opacity="0.3" filter="blur(6px)" />
          <circle cx="68" cy="32" r="14" fill="#3B82F6" opacity="0.3" filter="blur(6px)" />
          <circle cx="32" cy="68" r="14" fill="#10B981" opacity="0.3" filter="blur(6px)" />
          <circle cx="68" cy="68" r="14" fill="#F59E0B" opacity="0.3" filter="blur(6px)" />
          {/* 4 Tokens on corners */}
          <circle cx="28" cy="28" r="7" fill="#EF4444" stroke="#FFF" strokeWidth="1.5" />
          <circle cx="72" cy="28" r="7" fill="#3B82F6" stroke="#FFF" strokeWidth="1.5" />
          <circle cx="28" cy="72" r="7" fill="#10B981" stroke="#FFF" strokeWidth="1.5" />
          <circle cx="72" cy="72" r="7" fill="#F59E0B" stroke="#FFF" strokeWidth="1.5" />
          {/* Central Mega Golden Star */}
          <polygon
            points="50,14 59,35 82,37 65,52 70,75 50,63 30,75 35,52 18,37 41,35"
            fill="url(#star-center-gold)"
            stroke="#92400E"
            strokeWidth="1.5"
            filter="drop-shadow(0 4px 10px rgba(245,158,11,0.5))"
          />
        </svg>
      );

    case "cube-64":
      // Backgammon: Isometric 64x Doubling Cube
      return (
        <svg viewBox="0 0 100 100" className={styles.laurelSvg} aria-hidden="true">
          <defs>
            <linearGradient id="cube-brass-top" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFF8E7" />
              <stop offset="100%" stopColor="#D4AF37" />
            </linearGradient>
            <linearGradient id="cube-brass-left" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#C59B27" />
              <stop offset="100%" stopColor="#7A5E12" />
            </linearGradient>
            <linearGradient id="cube-brass-right" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E6C86E" />
              <stop offset="100%" stopColor="#A8821B" />
            </linearGradient>
          </defs>
          {/* Laurel */}
          <path d="M 16 70 C 8 48, 14 26, 30 14 C 28 22, 30 30, 36 36 C 28 42, 24 54, 26 68 Z" fill="#D4AF37" opacity="0.75" />
          <path d="M 84 70 C 92 48, 86 26, 70 14 C 72 22, 70 30, 64 36 C 72 42, 76 54, 74 68 Z" fill="#D4AF37" opacity="0.75" />
          {/* Isometric Cube */}
          <g filter="drop-shadow(0 6px 14px rgba(0,0,0,0.7))">
            {/* Top face */}
            <polygon points="50,22 75,36 50,50 25,36" fill="url(#cube-brass-top)" stroke="#5C420D" strokeWidth="1" />
            {/* Left face */}
            <polygon points="25,36 50,50 50,78 25,64" fill="url(#cube-brass-left)" stroke="#5C420D" strokeWidth="1" />
            {/* Right face */}
            <polygon points="50,50 75,36 75,64 50,78" fill="url(#cube-brass-right)" stroke="#5C420D" strokeWidth="1" />
            {/* 64 text on right face */}
            <text x="62" y="62" fill="#1C1405" fontSize="16" fontWeight="900" fontFamily="sans-serif" textAnchor="middle">64</text>
          </g>
        </svg>
      );

    case "lightning-bolt":
      // Speed Math: Electric Neural Lightning & Synapse Rings
      return (
        <svg viewBox="0 0 100 100" className={styles.laurelSvg} aria-hidden="true">
          <defs>
            <linearGradient id="bolt-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#A5F3FC" />
              <stop offset="40%" stopColor="#06B6D4" />
              <stop offset="100%" stopColor="#3B82F6" />
            </linearGradient>
            <radialGradient id="electric-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(6, 182, 212, 0.6)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="38" fill="url(#electric-glow)" />
          {/* Synapse Rings */}
          <circle cx="50" cy="50" r="36" fill="none" stroke="#06B6D4" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.7" />
          <circle cx="50" cy="50" r="28" fill="none" stroke="#8B5CF6" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
          {/* Giant Lightning Bolt */}
          <polygon
            points="54,12 28,48 48,48 42,88 74,44 54,44"
            fill="url(#bolt-grad)"
            stroke="#FFF"
            strokeWidth="1.5"
            filter="drop-shadow(0 0 14px rgba(6,182,212,0.8))"
          />
        </svg>
      );

    case "crossed-blades":
      // XO: Crossed Cyber Neon Blades
      return (
        <svg viewBox="0 0 100 100" className={styles.laurelSvg} aria-hidden="true">
          <defs>
            <linearGradient id="blade-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E0F2FE" />
              <stop offset="50%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#0284C7" />
            </linearGradient>
            <linearGradient id="blade-rose" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFE4E6" />
              <stop offset="50%" stopColor="#F43F5E" />
              <stop offset="100%" stopColor="#BE123C" />
            </linearGradient>
          </defs>
          {/* Crossed Lasers */}
          <g filter="drop-shadow(0 0 12px rgba(56,189,248,0.7))">
            <line x1="20" y1="20" x2="80" y2="80" stroke="url(#blade-cyan)" strokeWidth="6" strokeLinecap="round" />
            <line x1="20" y1="20" x2="80" y2="80" stroke="#FFF" strokeWidth="2" strokeLinecap="round" />
          </g>
          <g filter="drop-shadow(0 0 12px rgba(244,63,94,0.7))">
            <line x1="80" y1="20" x2="20" y2="80" stroke="url(#blade-rose)" strokeWidth="6" strokeLinecap="round" />
            <line x1="80" y1="20" x2="20" y2="80" stroke="#FFF" strokeWidth="2" strokeLinecap="round" />
          </g>
          {/* Center Clash Star */}
          <circle cx="50" cy="50" r="6" fill="#FFF" filter="drop-shadow(0 0 8px #FFF)" />
        </svg>
      );

    case "quad-circle":
      // Connect Four: Quad Aligned Discs Crest
      return (
        <svg viewBox="0 0 100 100" className={styles.laurelSvg} aria-hidden="true">
          <defs>
            <radialGradient id="c4-gold-disc" cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#FEF08A" />
              <stop offset="50%" stopColor="#EAB308" />
              <stop offset="100%" stopColor="#854D0E" />
            </radialGradient>
          </defs>
          {/* Blue Column Framework */}
          <rect x="24" y="16" width="52" height="68" rx="8" fill="rgba(2, 132, 199, 0.2)" stroke="#0284C7" strokeWidth="2" />
          {/* 4 Connected Discs */}
          <circle cx="36" cy="70" r="8" fill="url(#c4-gold-disc)" stroke="#FFF" strokeWidth="1" filter="drop-shadow(0 2px 6px rgba(0,0,0,0.5))" />
          <circle cx="45" cy="56" r="8" fill="url(#c4-gold-disc)" stroke="#FFF" strokeWidth="1" filter="drop-shadow(0 2px 6px rgba(0,0,0,0.5))" />
          <circle cx="55" cy="42" r="8" fill="url(#c4-gold-disc)" stroke="#FFF" strokeWidth="1" filter="drop-shadow(0 2px 6px rgba(0,0,0,0.5))" />
          <circle cx="64" cy="28" r="8" fill="url(#c4-gold-disc)" stroke="#FFF" strokeWidth="1" filter="drop-shadow(0 2px 6px rgba(0,0,0,0.5))" />
          {/* Laser connection line */}
          <line x1="36" y1="70" x2="64" y2="28" stroke="#FBBF24" strokeWidth="2.5" strokeDasharray="3 3" opacity="0.9" />
        </svg>
      );

    case "king-blade":
      // Checkers: Crowned King Damas Crest
      return (
        <svg viewBox="0 0 100 100" className={styles.laurelSvg} aria-hidden="true">
          <defs>
            <radialGradient id="chk-king-grad" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#EF4444" />
              <stop offset="50%" stopColor="#B91C1C" />
              <stop offset="100%" stopColor="#450A0A" />
            </radialGradient>
          </defs>
          {/* Battle Wreath */}
          <path d="M 18 70 C 10 50, 14 30, 28 18 C 27 26, 29 34, 34 40 C 28 46, 25 56, 27 66 Z" fill="#EF4444" opacity="0.8" />
          <path d="M 82 70 C 90 50, 86 30, 72 18 C 73 26, 71 34, 66 40 C 72 46, 75 56, 73 66 Z" fill="#EF4444" opacity="0.8" />
          {/* Heavy Checker Disc */}
          <circle cx="50" cy="54" r="26" fill="url(#chk-king-grad)" stroke="#FCA5A5" strokeWidth="2" filter="drop-shadow(0 6px 14px rgba(0,0,0,0.7))" />
          <circle cx="50" cy="54" r="20" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          {/* King Crown on Top */}
          <polygon points="40,40 45,46 50,34 55,46 60,40 59,50 41,50" fill="#FBBF24" stroke="#78350F" strokeWidth="1" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))" />
        </svg>
      );

    case "yin-yang":
      // Reversi: Emerald Yin-Yang Championship Disc
      return (
        <svg viewBox="0 0 100 100" className={styles.laurelSvg} aria-hidden="true">
          <defs>
            <linearGradient id="emerald-ring" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6EE7B7" />
              <stop offset="50%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#064E3B" />
            </linearGradient>
          </defs>
          {/* Championship Emerald Ring */}
          <circle cx="50" cy="50" r="36" fill="none" stroke="url(#emerald-ring)" strokeWidth="4" filter="drop-shadow(0 0 10px rgba(16,185,129,0.5))" />
          {/* Dual Reversi Disc */}
          <g filter="drop-shadow(0 6px 12px rgba(0,0,0,0.6))">
            {/* White side */}
            <path d="M 50 20 A 30 30 0 0 1 50 80 A 15 15 0 0 1 50 50 A 15 15 0 0 0 50 20 Z" fill="#F8FAFC" />
            {/* Black side */}
            <path d="M 50 20 A 30 30 0 0 0 50 80 A 15 15 0 0 0 50 50 A 15 15 0 0 1 50 20 Z" fill="#0F172A" />
            <circle cx="50" cy="35" r="4.5" fill="#0F172A" />
            <circle cx="50" cy="65" r="4.5" fill="#F8FAFC" />
          </g>
        </svg>
      );

    case "zen-stone":
      // Gomoku: Zen Wood Enso Brush & 5-Stone Constellation
      return (
        <svg viewBox="0 0 100 100" className={styles.laurelSvg} aria-hidden="true">
          <defs>
            <radialGradient id="zen-gold" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#FEF3C7" />
              <stop offset="50%" stopColor="#D97706" />
              <stop offset="100%" stopColor="#78350F" />
            </radialGradient>
          </defs>
          {/* Enso Brush Circle */}
          <circle
            cx="50"
            cy="50"
            r="35"
            fill="none"
            stroke="url(#zen-gold)"
            strokeWidth="3.5"
            strokeDasharray="180 30"
            strokeLinecap="round"
            opacity="0.85"
            filter="drop-shadow(0 0 8px rgba(217,119,6,0.4))"
          />
          {/* 5 Connected Zen Stones */}
          <circle cx="26" cy="50" r="6" fill="#1E293B" stroke="#64748B" strokeWidth="1" />
          <circle cx="38" cy="50" r="6" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="1" />
          <circle cx="50" cy="50" r="7.5" fill="#1E293B" stroke="#F59E0B" strokeWidth="2" filter="drop-shadow(0 0 8px #F59E0B)" />
          <circle cx="62" cy="50" r="6" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="1" />
          <circle cx="74" cy="50" r="6" fill="#1E293B" stroke="#64748B" strokeWidth="1" />
        </svg>
      );

    case "scarab":
      // Seega: Pharaonic Golden Scarab & Sun Disc
      return (
        <svg viewBox="0 0 100 100" className={styles.laurelSvg} aria-hidden="true">
          <defs>
            <linearGradient id="pharaoh-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FEF3C7" />
              <stop offset="50%" stopColor="#D97706" />
              <stop offset="100%" stopColor="#78350F" />
            </linearGradient>
            <radialGradient id="turquoise-gem" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#5EEAD4" />
              <stop offset="100%" stopColor="#0F766E" />
            </radialGradient>
          </defs>
          {/* Sun Disc on top */}
          <circle cx="50" cy="18" r="8" fill="url(#pharaoh-gold)" stroke="#78350F" strokeWidth="1" filter="drop-shadow(0 0 10px rgba(217,119,6,0.6))" />
          {/* Scarab Wings */}
          <path d="M 50 42 C 34 32, 16 46, 20 72 C 34 76, 46 64, 50 42 Z" fill="url(#pharaoh-gold)" stroke="#78350F" strokeWidth="1" />
          <path d="M 50 42 C 66 32, 84 46, 80 72 C 66 76, 54 64, 50 42 Z" fill="url(#pharaoh-gold)" stroke="#78350F" strokeWidth="1" />
          {/* Central Turquoise Gem Body */}
          <ellipse cx="50" cy="54" rx="8" ry="12" fill="url(#turquoise-gem)" stroke="#134E4A" strokeWidth="1" />
          {/* Scarab Head */}
          <path d="M 44 38 C 44 32, 56 32, 56 38 Z" fill="url(#pharaoh-gold)" stroke="#78350F" strokeWidth="1" />
        </svg>
      );

    default:
      return null;
  }
}
