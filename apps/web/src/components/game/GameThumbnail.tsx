"use client";

import React from "react";
import { useI18n } from "@/lib/i18n/context";
import styles from "./GameThumbnail.module.css";

interface GameThumbnailProps {
  gameId: string;
  title?: string;
  subtitle?: string;
  duration?: string;
  turnModel?: string;
  badge?: string;
  variant?: "square" | "hero" | "versus" | "badge" | "mobile";
}

// chess and billiards are deliberately NOT here despite having real photo
// assets on disk: that generated art has real chess grandmasters' names
// and a fabricated sponsor logo baked into the pixels respectively (see
// getTournamentCover()'s own comment in UpcomingTournaments.tsx for the
// full reasoning). Both fall through to their own hand-authored `case`
// below instead, same as every other game did before real photography
// existed for it.
const SUPPORTED_GAMES = new Set([
  "checkers",
  "connect-four",
  "xo",
  "speed-math",
  "dominoes",
  "backgammon",
  "seega",
  "reversi",
  "gomoku",
]);

export function GameThumbnail({
  gameId,
  title,
  subtitle,
  duration,
  turnModel,
  badge,
  variant = "square"
}: GameThumbnailProps) {
  const { dir } = useI18n();
  const isRtl = dir === "rtl";
  const normId = gameId.replace(/_/g, "-");

  const renderGameArt = () => {
    if (SUPPORTED_GAMES.has(normId)) {
      const suffix =
        variant === "hero"
          ? "-hero"
          : variant === "versus"
          ? "-versus"
          : variant === "badge"
          ? "-badge"
          : variant === "mobile"
          ? "-mobile"
          : "";
      return (
        <img
          src={`/images/games/${normId}${suffix}.jpg`}
          alt={title || normId}
          className={styles.bgArtImage}
          loading="lazy"
        />
      );
    }

    switch (normId) {
      case "chess":
        return (
          <svg viewBox="0 0 400 225" className={styles.bgArt} preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="chessGlow" cx="50%" cy="45%" r="45%">
                <stop offset="0%" stopColor="#FFD700" stopOpacity="0.28" />
                <stop offset="70%" stopColor="#C6A867" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#0B0D10" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFF1B8" />
                <stop offset="50%" stopColor="#FFD700" />
                <stop offset="100%" stopColor="#B38A2B" />
              </linearGradient>
            </defs>
            {/* Background 3D Perspective Grid */}
            <rect width="400" height="225" fill="#080A10" />
            <circle cx="200" cy="100" r="140" fill="url(#chessGlow)" />
            <g opacity="0.18" stroke="#FFD700" strokeWidth="0.8">
              <line x1="20" y1="225" x2="160" y2="110" />
              <line x1="80" y1="225" x2="180" y2="110" />
              <line x1="140" y1="225" x2="195" y2="110" />
              <line x1="200" y1="225" x2="200" y2="110" />
              <line x1="260" y1="225" x2="205" y2="110" />
              <line x1="320" y1="225" x2="220" y2="110" />
              <line x1="380" y1="225" x2="240" y2="110" />
              <line x1="40" y1="180" x2="360" y2="180" />
              <line x1="70" y1="150" x2="330" y2="150" />
              <line x1="110" y1="125" x2="290" y2="125" />
            </g>
            {/* Central Sovereign King Emblem */}
            <g transform="translate(165, 35) scale(1.4)" className={styles.emblemGlow}>
              <path
                d="M25 5 L28 12 L35 12 L30 16 L32 23 L25 19 L18 23 L20 16 L15 12 L22 12 Z"
                fill="url(#goldGrad)"
              />
              <path
                d="M17 26 C17 22, 33 22, 33 26 C33 32, 30 35, 31 46 C32 50, 36 52, 36 56 L14 56 C14 52, 18 50, 19 46 C20 35, 17 32, 17 26 Z"
                fill="url(#goldGrad)"
                stroke="#FFE082"
                strokeWidth="0.8"
              />
              <ellipse cx="25" cy="56" rx="14" ry="3" fill="#FFE082" />
            </g>
          </svg>
        );

      case "billiards":
        return (
          <svg viewBox="0 0 400 225" className={styles.bgArt} preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="billiardsGlow" cx="62%" cy="45%" r="55%">
                <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.22" />
                <stop offset="70%" stopColor="#0e3a2f" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#080A10" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="billiardsFelt" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#123d33" />
                <stop offset="100%" stopColor="#081f19" />
              </linearGradient>
            </defs>
            <rect width="400" height="225" fill="#080A10" />
            <circle cx="248" cy="100" r="150" fill="url(#billiardsGlow)" />

            <rect x="40" y="28" width="320" height="169" rx="10" fill="#141a26" stroke="#2dd4bf" strokeOpacity="0.35" strokeWidth="2" />
            <rect x="52" y="40" width="296" height="145" rx="4" fill="url(#billiardsFelt)" stroke="#2dd4bf" strokeOpacity="0.5" strokeWidth="1" />

            {[[52, 40], [200, 40], [348, 40], [52, 185], [200, 185], [348, 185]].map(([px, py], i) => (
              <circle key={i} cx={px} cy={py} r="8" fill="#05100c" stroke="#f97316" strokeOpacity="0.55" strokeWidth="1" />
            ))}

            <line x1="70" y1="200" x2="150" y2="140" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
            <line x1="150" y1="140" x2="168" y2="127" stroke="#c08a4e" strokeWidth="5" strokeLinecap="round" opacity="0.7" />

            <g className={styles.emblemGlow}>
              <circle cx="168" cy="127" r="8.5" fill="#f4f4f2" stroke="#0B0D10" strokeWidth="1" />
              <circle cx="168" cy="127" r="2.6" fill="#22d3ee" opacity="0.85" />

              <circle cx="230" cy="112" r="8.5" fill="#FFD700" stroke="#0B0D10" strokeWidth="1" />
              <circle cx="247" cy="112" r="8.5" fill="#d62828" stroke="#0B0D10" strokeWidth="1" />
              <circle cx="238.5" cy="127" r="8.5" fill="#1f5fd6" stroke="#0B0D10" strokeWidth="1" />
              <circle cx="256" cy="127" r="8.5" fill="#111318" stroke="#FFD700" strokeWidth="1.2" />
              <circle cx="247" cy="142" r="8.5" fill="#5b2a86" stroke="#0B0D10" strokeWidth="1" />
              <circle cx="264.5" cy="142" r="8.5" fill="#e8790a" stroke="#0B0D10" strokeWidth="1" />
              <circle cx="273" cy="112" r="8.5" fill="#1f8c3b" stroke="#0B0D10" strokeWidth="1" />
              <circle cx="256" cy="112" r="8.5" fill="#f4f4f2" stroke="#e8b923" strokeWidth="2.2" />
            </g>
          </svg>
        );

      case "checkers":
        return (
          <svg viewBox="0 0 400 225" className={styles.bgArt} preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="checkersGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FF7248" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#0B0D10" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="400" height="225" fill="#080A10" />
            <circle cx="200" cy="110" r="130" fill="url(#checkersGlow)" />
            {/* Checkerboard diamond pattern */}
            <g opacity="0.14" fill="#FF5A2B">
              <polygon points="200,20 230,50 200,80 170,50" />
              <polygon points="140,50 170,80 140,110 110,80" />
              <polygon points="260,50 290,80 260,110 230,80" />
              <polygon points="200,80 230,110 200,140 170,110" />
              <polygon points="140,110 170,140 140,170 110,140" />
              <polygon points="260,110 290,140 260,170 230,140" />
              <polygon points="200,140 230,170 200,200 170,170" />
            </g>
            {/* Stacked Draughts Crowns */}
            <g transform="translate(200, 105)" className={styles.emblemGlow}>
              <ellipse cx="0" cy="20" rx="42" ry="14" fill="#1A1F2C" stroke="#334155" strokeWidth="2" />
              <ellipse cx="0" cy="14" rx="42" ry="14" fill="#0E131F" stroke="#FF5A2B" strokeWidth="1.5" />
              <ellipse cx="0" cy="-4" rx="36" ry="12" fill="#E8441A" stroke="#FF8A65" strokeWidth="2" />
              <ellipse cx="0" cy="-10" rx="36" ry="12" fill="#FF5A2B" stroke="#FFCCBC" strokeWidth="1" />
              {/* King Crown Stamp */}
              <path d="M-10,-12 L-6,-6 L0,-16 L6,-6 L10,-12 L8,-2 L-8,-2 Z" fill="#FFD700" />
            </g>
          </svg>
        );

      case "dominoes":
        return (
          <svg viewBox="0 0 400 225" className={styles.bgArt} preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="domGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#0B0D10" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="400" height="225" fill="#080A10" />
            <circle cx="200" cy="110" r="120" fill="url(#domGlow)" />
            {/* Sleek Obsidian Tile */}
            <g transform="translate(160, 45) rotate(-12, 40, 65)" className={styles.emblemGlow}>
              <rect width="80" height="135" rx="10" fill="#121622" stroke="#00E5FF" strokeWidth="2" filter="drop-shadow(0 8px 20px rgba(0,0,0,0.8))" />
              <line x1="8" y1="67" x2="72" y2="67" stroke="#38BDF8" strokeWidth="2" />
              <circle cx="40" cy="67" r="3.5" fill="#FFD700" />
              {/* Top Pips: 3 */}
              <circle cx="24" cy="22" r="5" fill="#FFD700" />
              <circle cx="40" cy="38" r="5" fill="#FFD700" />
              <circle cx="56" cy="54" r="5" fill="#FFD700" />
              {/* Bottom Pips: 4 */}
              <circle cx="26" cy="84" r="5" fill="#00E5FF" />
              <circle cx="54" cy="84" r="5" fill="#00E5FF" />
              <circle cx="26" cy="114" r="5" fill="#00E5FF" />
              <circle cx="54" cy="114" r="5" fill="#00E5FF" />
            </g>
          </svg>
        );

      case "backgammon":
        return (
          <svg viewBox="0 0 400 225" className={styles.bgArt} preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="bgmGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFD700" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#0B0D10" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="400" height="225" fill="#080A10" />
            <circle cx="200" cy="110" r="140" fill="url(#bgmGlow)" />
            {/* Geometric Triangular Points */}
            <g opacity="0.3">
              <polygon points="110,225 130,130 150,225" fill="#C6A867" />
              <polygon points="150,225 170,130 190,225" fill="#1E293B" />
              <polygon points="210,225 230,130 250,225" fill="#C6A867" />
              <polygon points="250,225 270,130 290,225" fill="#1E293B" />
              <polygon points="110,0 130,95 150,0" fill="#1E293B" />
              <polygon points="150,0 170,95 190,0" fill="#C6A867" />
              <polygon points="210,0 230,95 250,0" fill="#1E293B" />
              <polygon points="250,0 270,95 290,0" fill="#C6A867" />
            </g>
            {/* Two Glowing Cubes (Dice) */}
            <g transform="translate(170, 75)" className={styles.emblemGlow}>
              <rect x="0" y="5" width="40" height="40" rx="8" fill="#181D2D" stroke="#FFD700" strokeWidth="1.8" />
              <circle cx="12" cy="17" r="3.5" fill="#FFD700" />
              <circle cx="20" cy="25" r="3.5" fill="#FFD700" />
              <circle cx="28" cy="33" r="3.5" fill="#FFD700" />

              <rect x="34" y="-8" width="38" height="38" rx="8" fill="#2A1B0E" stroke="#FF9800" strokeWidth="1.8" />
              <circle cx="45" cy="3" r="3.5" fill="#FFE082" />
              <circle cx="61" cy="3" r="3.5" fill="#FFE082" />
              <circle cx="45" cy="19" r="3.5" fill="#FFE082" />
              <circle cx="61" cy="19" r="3.5" fill="#FFE082" />
            </g>
          </svg>
        );

      case "seega":
        return (
          <svg viewBox="0 0 400 225" className={styles.bgArt} preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="seegaGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#0B0D10" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="400" height="225" fill="#080A10" />
            <circle cx="200" cy="110" r="130" fill="url(#seegaGlow)" />
            {/* 5x5 Ancient Grid */}
            <g opacity="0.2" stroke="#F59E0B" strokeWidth="1.5">
              <line x1="130" y1="45" x2="270" y2="45" />
              <line x1="130" y1="80" x2="270" y2="80" />
              <line x1="130" y1="115" x2="270" y2="115" />
              <line x1="130" y1="150" x2="270" y2="150" />
              <line x1="130" y1="185" x2="270" y2="185" />
              <line x1="130" y1="45" x2="130" y2="185" />
              <line x1="165" y1="45" x2="165" y2="185" />
              <line x1="200" y1="45" x2="200" y2="185" />
              <line x1="235" y1="45" x2="235" y2="185" />
              <line x1="270" y1="45" x2="270" y2="185" />
            </g>
            {/* Central Sacred Altar Stone */}
            <g transform="translate(200, 115)" className={styles.emblemGlow}>
              <rect x="-16" y="-16" width="32" height="32" rx="4" fill="rgba(245, 158, 11, 0.15)" stroke="#F59E0B" strokeWidth="2" />
              <polygon points="0,-10 8,0 0,10 -8,0" fill="#FFD700" />
              {/* Lapis and Carnelian gaming stones */}
              <circle cx="-35" cy="-35" r="9" fill="#0284C7" stroke="#38BDF8" strokeWidth="2" />
              <circle cx="35" cy="35" r="9" fill="#EA580C" stroke="#FB923C" strokeWidth="2" />
            </g>
          </svg>
        );

      case "connect-four":
        return (
          <svg viewBox="0 0 400 225" className={styles.bgArt} preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="c4Glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#00E676" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#0B0D10" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="400" height="225" fill="#080A10" />
            <circle cx="200" cy="110" r="130" fill="url(#c4Glow)" />
            {/* Vertical Cyber Blue Matrix */}
            <g transform="translate(130, 45)" className={styles.emblemGlow}>
              <rect width="140" height="120" rx="14" fill="#0F172A" stroke="#3B82F6" strokeWidth="2" />
              {/* 4 In-a-Row Diagonal Line */}
              <line x1="30" y1="95" x2="110" y2="25" stroke="#FFD700" strokeWidth="3" strokeDasharray="3 3" opacity="0.8" />
              {/* Token slots */}
              <circle cx="30" cy="95" r="11" fill="#FFD700" stroke="#FFE082" strokeWidth="2" />
              <circle cx="56" cy="71" r="11" fill="#FFD700" stroke="#FFE082" strokeWidth="2" />
              <circle cx="83" cy="48" r="11" fill="#FFD700" stroke="#FFE082" strokeWidth="2" />
              <circle cx="110" cy="25" r="11" fill="#FFD700" stroke="#FFE082" strokeWidth="2" />
              {/* Opponent Red Tokens */}
              <circle cx="30" cy="48" r="11" fill="#EF4444" stroke="#F87171" strokeWidth="1.5" />
              <circle cx="56" cy="95" r="11" fill="#EF4444" stroke="#F87171" strokeWidth="1.5" />
              <circle cx="83" cy="95" r="11" fill="#EF4444" stroke="#F87171" strokeWidth="1.5" />
            </g>
          </svg>
        );

      case "xo":
        return (
          <svg viewBox="0 0 400 225" className={styles.bgArt} preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="xoGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#0B0D10" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="400" height="225" fill="#080A10" />
            <circle cx="200" cy="110" r="130" fill="url(#xoGlow)" />
            {/* Laser 3x3 Grid */}
            <g stroke="#334155" strokeWidth="2.5" opacity="0.4">
              <line x1="165" y1="45" x2="165" y2="165" />
              <line x1="235" y1="45" x2="235" y2="165" />
              <line x1="125" y1="85" x2="275" y2="85" />
              <line x1="125" y1="125" x2="275" y2="125" />
            </g>
            {/* Glowing Golden X & Cyan O */}
            <g className={styles.emblemGlow}>
              {/* Center X */}
              <line x1="182" y1="88" x2="218" y2="122" stroke="#FFD700" strokeWidth="5" strokeLinecap="round" />
              <line x1="218" y1="88" x2="182" y2="122" stroke="#FFD700" strokeWidth="5" strokeLinecap="round" />
              {/* Top Left O */}
              <circle cx="145" cy="65" r="14" fill="none" stroke="#00E5FF" strokeWidth="4.5" />
              {/* Bottom Right O */}
              <circle cx="255" cy="145" r="14" fill="none" stroke="#00E5FF" strokeWidth="4.5" />
            </g>
          </svg>
        );

      case "speed-math":
        return (
          <svg viewBox="0 0 400 225" className={styles.bgArt} preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="mathGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#0B0D10" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="400" height="225" fill="#080A10" />
            <circle cx="200" cy="110" r="130" fill="url(#mathGlow)" />
            {/* Speed vectors and radial dial */}
            <circle cx="200" cy="105" r="60" fill="none" stroke="#1E293B" strokeWidth="3" />
            <circle cx="200" cy="105" r="60" fill="none" stroke="#00E5FF" strokeWidth="3.5" strokeDasharray="90 280" strokeLinecap="round" />
            <g className={styles.emblemGlow}>
              <text x="200" y="115" textAnchor="middle" fill="#FFFFFF" fontSize="32" fontWeight="900" fontFamily="var(--font-plex-mono)">
                60s
              </text>
              <text x="145" y="70" fill="#FFD700" fontSize="24" fontWeight="800">∑</text>
              <text x="250" y="70" fill="#00E676" fontSize="24" fontWeight="800">×</text>
              <text x="145" y="150" fill="#F43F5E" fontSize="24" fontWeight="800">÷</text>
              <text x="250" y="150" fill="#38BDF8" fontSize="24" fontWeight="800">+</text>
            </g>
          </svg>
        );

      case "reversi":
        return (
          <svg viewBox="0 0 400 225" className={styles.bgArt} preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="revGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#0B0D10" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="400" height="225" fill="#080A10" />
            <circle cx="200" cy="110" r="130" fill="url(#revGlow)" />
            {/* Emerald Felt Matrix */}
            <rect x="130" y="40" width="140" height="140" rx="10" fill="#064E3B" stroke="#059669" strokeWidth="2" opacity="0.6" />
            <g stroke="#047857" strokeWidth="1" opacity="0.5">
              <line x1="165" y1="40" x2="165" y2="180" />
              <line x1="200" y1="40" x2="200" y2="180" />
              <line x1="235" y1="40" x2="235" y2="180" />
              <line x1="130" y1="75" x2="270" y2="75" />
              <line x1="130" y1="110" x2="270" y2="110" />
              <line x1="130" y1="145" x2="270" y2="145" />
            </g>
            {/* Dual Face Discs */}
            <g className={styles.emblemGlow}>
              <circle cx="182" cy="92" r="14" fill="#111827" stroke="#4B5563" strokeWidth="2" />
              <circle cx="218" cy="92" r="14" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2" />
              <circle cx="182" cy="128" r="14" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2" />
              <circle cx="218" cy="128" r="14" fill="#111827" stroke="#4B5563" strokeWidth="2" />
            </g>
          </svg>
        );

      case "gomoku":
        return (
          <svg viewBox="0 0 400 225" className={styles.bgArt} preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="gomGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#C6A867" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#0B0D10" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="400" height="225" fill="#080A10" />
            <circle cx="200" cy="110" r="130" fill="url(#gomGlow)" />
            {/* Zen Go Grid */}
            <g stroke="#C6A867" strokeWidth="1" opacity="0.3">
              <line x1="120" y1="60" x2="280" y2="60" />
              <line x1="120" y1="85" x2="280" y2="85" />
              <line x1="120" y1="110" x2="280" y2="110" />
              <line x1="120" y1="135" x2="280" y2="135" />
              <line x1="120" y1="160" x2="280" y2="160" />
              <line x1="140" y1="40" x2="140" y2="180" />
              <line x1="170" y1="40" x2="170" y2="180" />
              <line x1="200" y1="40" x2="200" y2="180" />
              <line x1="230" y1="40" x2="230" y2="180" />
              <line x1="260" y1="40" x2="260" y2="180" />
              {/* Tengen Star Point */}
              <circle cx="200" cy="110" r="3" fill="#FFD700" />
            </g>
            {/* Five in a Row Stones */}
            <g className={styles.emblemGlow}>
              <circle cx="140" cy="110" r="11" fill="#0F172A" stroke="#334155" strokeWidth="2" />
              <circle cx="170" cy="110" r="11" fill="#0F172A" stroke="#334155" strokeWidth="2" />
              <circle cx="200" cy="110" r="11" fill="#0F172A" stroke="#FFD700" strokeWidth="2.5" />
              <circle cx="230" cy="110" r="11" fill="#0F172A" stroke="#334155" strokeWidth="2" />
              <circle cx="260" cy="110" r="11" fill="#0F172A" stroke="#334155" strokeWidth="2" />
            </g>
          </svg>
        );

      default:
        return (
          <svg viewBox="0 0 400 225" className={styles.bgArt} preserveAspectRatio="xMidYMid slice">
            <rect width="400" height="225" fill="#0D111A" />
            <circle cx="200" cy="110" r="90" fill="rgba(255, 215, 0, 0.1)" />
          </svg>
        );
    }
  };

  return (
    <div className={styles.thumbnailWrap}>
      {renderGameArt()}
      <div className={styles.overlayGradients} />
      <div className={styles.cornerBrackets} />

      <div className={styles.badgeTopLeft}>
        <span className={`${styles.pillTag} ${badge === "LIVE" ? styles.emeraldTag : styles.goldTag}`}>
          {badge || (isRtl ? "مواجهة 1v1" : "1v1 DUEL")}
        </span>
      </div>

      <div className={styles.badgeTopRight}>
        {duration && <span className={`${styles.pillTag} ${styles.cyanTag}`}>{duration}</span>}
      </div>

      <div className={styles.bottomBar}>
        <div>
          {title && <h3 className={styles.gameTitle}>{title}</h3>}
          {subtitle && <p className={styles.gameSubtext}>{subtitle}</p>}
        </div>
        <div className={styles.liveIndicator}>
          <span className={styles.liveDot} />
          <span>{isRtl ? "مصنّف" : "RANKED"}</span>
        </div>
      </div>
    </div>
  );
}
