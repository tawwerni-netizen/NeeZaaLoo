"use client";

import React from "react";

export function ChessPieceSvg({ type, colour }: { type: "k" | "q" | "r" | "b" | "n" | "p"; colour: "w" | "b" }) {
  const isWhite = colour === "w";
  const baseGrad = isWhite ? "url(#chess-white-grad)" : "url(#chess-black-grad)";
  const strokeColor = isWhite ? "#4a4036" : "#0d0e11";
  const highlightColor = isWhite ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.25)";

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" className="chess-piece-svg" style={{ filter: isWhite ? "drop-shadow(0 4px 6px rgba(0,0,0,0.35))" : "drop-shadow(0 4px 8px rgba(0,0,0,0.65))" }}>
      <defs>
        <linearGradient id="chess-white-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="40%" stopColor="#F8F6F0" />
          <stop offset="100%" stopColor="#D8CFBE" />
        </linearGradient>
        <linearGradient id="chess-black-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3A3F4A" />
          <stop offset="50%" stopColor="#1C2026" />
          <stop offset="100%" stopColor="#0B0D10" />
        </linearGradient>
        <radialGradient id="chess-specular" cx="35%" cy="30%" r="60%">
          <stop offset="0%" stopColor={highlightColor} />
          <stop offset="60%" stopColor="transparent" />
        </radialGradient>
      </defs>

      {/* 3D Base Pedestal */}
      <ellipse cx="50" cy="85" rx="36" ry="9" fill={baseGrad} stroke={strokeColor} strokeWidth="2.5" />
      <ellipse cx="50" cy="81" rx="30" ry="7" fill={baseGrad} stroke={strokeColor} strokeWidth="2" />
      <path d="M 24 81 C 26 73, 33 70, 36 65 L 64 65 C 67 70, 74 73, 76 81 Z" fill={baseGrad} stroke={strokeColor} strokeWidth="2" />

      {/* Piece Body */}
      {type === "p" && (
        <g>
          <path d="M 36 65 C 38 52, 42 45, 43 38 L 57 38 C 58 45, 62 52, 64 65 Z" fill={baseGrad} stroke={strokeColor} strokeWidth="2" />
          <circle cx="50" cy="27" r="14" fill={baseGrad} stroke={strokeColor} strokeWidth="2.5" />
          <circle cx="46" cy="24" r="12" fill="url(#chess-specular)" />
        </g>
      )}

      {type === "r" && (
        <g>
          <path d="M 34 65 L 38 35 L 62 35 L 66 65 Z" fill={baseGrad} stroke={strokeColor} strokeWidth="2" />
          {/* Battlements */}
          <path d="M 30 35 L 30 20 L 37 20 L 37 26 L 45 26 L 45 20 L 55 20 L 55 26 L 63 26 L 63 20 L 70 20 L 70 35 Z" fill={baseGrad} stroke={strokeColor} strokeWidth="2" />
          <line x1="30" y1="35" x2="70" y2="35" stroke={strokeColor} strokeWidth="2" />
          <rect x="34" y="24" width="32" height="38" fill="url(#chess-specular)" />
        </g>
      )}

      {type === "n" && (
        <g>
          {/* Knight Mane and Head */}
          <path d="M 33 65 C 30 55, 30 45, 33 34 C 35 22, 48 15, 62 20 C 72 24, 75 38, 70 48 C 66 54, 66 60, 67 65 Z" fill={baseGrad} stroke={strokeColor} strokeWidth="2.5" />
          <path d="M 33 34 C 25 36, 20 44, 25 50 C 30 55, 36 53, 42 46 Z" fill={baseGrad} stroke={strokeColor} strokeWidth="2" />
          {/* Eye & Nostril */}
          <circle cx="34" cy="38" r="3" fill={strokeColor} />
          <path d="M 27 47 Q 31 46 33 49" stroke={strokeColor} strokeWidth="2" fill="none" />
          {/* Specular */}
          <path d="M 45 24 C 55 24, 62 30, 60 40" stroke={highlightColor} strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      )}

      {type === "b" && (
        <g>
          <path d="M 36 65 C 38 52, 42 45, 43 40 L 57 40 C 58 45, 62 52, 64 65 Z" fill={baseGrad} stroke={strokeColor} strokeWidth="2" />
          {/* Bishop Mitre */}
          <path d="M 50 14 C 36 22, 33 38, 44 42 L 56 42 C 67 38, 64 22, 50 14 Z" fill={baseGrad} stroke={strokeColor} strokeWidth="2.5" />
          <circle cx="50" cy="12" r="4" fill={baseGrad} stroke={strokeColor} strokeWidth="1.5" />
          {/* Cut/Slit */}
          <path d="M 46 25 L 56 33" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" />
          <ellipse cx="48" cy="28" rx="8" ry="10" fill="url(#chess-specular)" />
        </g>
      )}

      {type === "q" && (
        <g>
          <path d="M 34 65 C 36 52, 40 45, 41 38 L 59 38 C 60 45, 64 52, 66 65 Z" fill={baseGrad} stroke={strokeColor} strokeWidth="2" />
          {/* Queen Crown */}
          <path d="M 28 38 L 24 22 L 38 30 L 50 16 L 62 30 L 76 22 L 72 38 Z" fill={baseGrad} stroke={strokeColor} strokeWidth="2.5" />
          <circle cx="24" cy="20" r="3.5" fill={baseGrad} stroke={strokeColor} strokeWidth="1.5" />
          <circle cx="38" cy="28" r="3" fill={baseGrad} stroke={strokeColor} strokeWidth="1.5" />
          <circle cx="50" cy="14" r="4" fill={baseGrad} stroke={strokeColor} strokeWidth="1.5" />
          <circle cx="62" cy="28" r="3" fill={baseGrad} stroke={strokeColor} strokeWidth="1.5" />
          <circle cx="76" cy="20" r="3.5" fill={baseGrad} stroke={strokeColor} strokeWidth="1.5" />
          <ellipse cx="50" cy="30" rx="14" ry="6" fill="url(#chess-specular)" />
        </g>
      )}

      {type === "k" && (
        <g>
          <path d="M 34 65 C 36 52, 40 45, 41 38 L 59 38 C 60 45, 64 52, 66 65 Z" fill={baseGrad} stroke={strokeColor} strokeWidth="2" />
          {/* King Crown */}
          <path d="M 30 38 C 28 26, 40 22, 50 22 C 60 22, 72 26, 70 38 Z" fill={baseGrad} stroke={strokeColor} strokeWidth="2.5" />
          {/* Royal Cross */}
          <path d="M 50 8 L 50 20 M 44 13 L 56 13" stroke={strokeColor} strokeWidth="3" strokeLinecap="square" />
          <ellipse cx="50" cy="28" rx="14" ry="7" fill="url(#chess-specular)" />
        </g>
      )}
    </svg>
  );
}
