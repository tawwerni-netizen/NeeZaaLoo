"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ProgressionDelta } from "@/lib/use-progression-snapshot";
import styles from "./MatchShareCard.module.css";

type Props = {
  gameId: string;
  outcome: "win" | "loss" | "draw" | null;
  result: string | null;
  duelId: string;
  delta: ProgressionDelta | null;
  playerHandle?: string | null | undefined;
  referralCode?: string | null | undefined;
};

export function MatchShareCard({
  gameId,
  outcome,
  result,
  duelId,
  delta,
  playerHandle,
  referralCode,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setCanNativeShare(true);
    }
  }, []);

  const drawCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = 1200;
    const height = 630;
    canvas.width = width;
    canvas.height = height;

    // Background base
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#080B10");
    bgGrad.addColorStop(0.5, "#121824");
    bgGrad.addColorStop(1, "#0A0D14");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle background mesh/glow
    const glowGrad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 500);
    if (outcome === "win") {
      glowGrad.addColorStop(0, "rgba(212, 163, 62, 0.18)");
      glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    } else if (outcome === "draw") {
      glowGrad.addColorStop(0, "rgba(96, 165, 250, 0.12)");
      glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    } else {
      glowGrad.addColorStop(0, "rgba(239, 68, 68, 0.10)");
      glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    }
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, width, height);

    // Outer luxury frame
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(212, 163, 62, 0.35)";
    ctx.strokeRect(28, 28, width - 56, height - 56);

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.strokeRect(36, 36, width - 72, height - 72);

    // Brand Header: NIZALO
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#E5C158";
    ctx.letterSpacing = "6px";
    ctx.fillText("N I Z A L O", width / 2, 80);

    // Game Title Badge
    const gameLabel = (gameId || "MATCH").replace(/-/g, " ").toUpperCase();
    ctx.font = "600 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fillText(`• ${gameLabel} •`, width / 2, 120);

    // Outcome Banner
    let outcomeText = "MATCH COMPLETE";
    let outcomeColor = "#E5C158";
    if (outcome === "win") {
      outcomeText = "VICTORY";
      outcomeColor = "#FCD34D";
    } else if (outcome === "loss") {
      outcomeText = "DEFEAT";
      outcomeColor = "#F87171";
    } else if (outcome === "draw") {
      outcomeText = "DRAW";
      outcomeColor = "#93C5FD";
    }

    ctx.font = "900 68px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = outcomeColor;
    ctx.shadowColor = outcomeColor;
    ctx.shadowBlur = 18;
    ctx.fillText(outcomeText, width / 2, 210);
    ctx.shadowBlur = 0; // reset shadow

    // Player Handle
    if (playerHandle) {
      ctx.font = "600 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(`@${playerHandle}`, width / 2, 280);
    }

    // Stats Grid Box
    const boxWidth = 640;
    const boxHeight = 120;
    const boxX = (width - boxWidth) / 2;
    const boxY = 325;

    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 16);
    ctx.fill();
    ctx.stroke();

    // Stats content
    const eloDelta = delta?.ratingBefore !== null && delta?.ratingAfter !== null && delta?.ratingBefore !== undefined && delta?.ratingAfter !== undefined
      ? Math.round(delta.ratingAfter - delta.ratingBefore)
      : null;
    const expGained = delta?.expGained ?? 0;

    const statCol1 = boxX + boxWidth * 0.25;
    const statCol2 = boxX + boxWidth * 0.75;

    // Col 1: ELO Rating
    ctx.font = "500 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillText("RATING RATING", statCol1, boxY + 40);

    ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    if (eloDelta !== null) {
      ctx.fillStyle = eloDelta >= 0 ? "#4ADE80" : "#F87171";
      ctx.fillText(`${eloDelta >= 0 ? "+" : ""}${eloDelta} ELO`, statCol1, boxY + 80);
    } else {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(result ?? "Finished", statCol1, boxY + 80);
    }

    // Col 2: EXP Earned
    ctx.font = "500 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillText("EXPERIENCE", statCol2, boxY + 40);

    ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#FCD34D";
    ctx.fillText(`+${expGained} EXP`, statCol2, boxY + 80);

    // Bottom Footer / Referral Link
    const refCode = referralCode ? referralCode.toUpperCase() : null;
    const inviteUrl = refCode ? `nizalo.com/r/${refCode}` : "nizalo.com";

    ctx.font = "600 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillText(`Play with me at ${inviteUrl}`, width / 2, 530);

    ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fillText(`Match ID: ${duelId.slice(0, 16)}`, width / 2, 570);
  }, [gameId, outcome, result, duelId, delta, playerHandle, referralCode]);

  useEffect(() => {
    drawCard();
  }, [drawCard]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `nizalo-${gameId}-match-${duelId.slice(0, 8)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const refCode = referralCode ? referralCode.toUpperCase() : null;
    const shareUrl = typeof window !== "undefined"
      ? (refCode ? `${window.location.origin}/r/${refCode}` : window.location.origin)
      : "https://nizalo.com";

    const shareData: ShareData = {
      title: `Nizalo ${gameId.toUpperCase()} Match Result`,
      text: `Check out my match result on Nizalo! Play with me:`,
      url: shareUrl,
    };

    if (canNativeShare && navigator.canShare) {
      try {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            await navigator.share(shareData);
            return;
          }
          const file = new File([blob], `nizalo-${gameId}-match.png`, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ ...shareData, files: [file] });
          } else {
            await navigator.share(shareData);
          }
        }, "image/png");
        return;
      } catch {
        // User cancelled or failed; fallback to download
      }
    }

    // Fallback: download image directly
    handleDownload();
  };

  const handleCopyLink = async () => {
    const refCode = referralCode ? referralCode.toUpperCase() : null;
    const shareUrl = typeof window !== "undefined"
      ? (refCode ? `${window.location.origin}/r/${refCode}` : window.location.origin)
      : "https://nizalo.com";

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard write failure
    }
  };

  return (
    <div className={styles.shareContainer}>
      <div className={styles.previewWrap}>
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>

      <div className={styles.buttonGroup}>
        <button type="button" className={styles.shareBtn} onClick={handleShare}>
          <svg className={styles.shareIcon} viewBox="0 0 24 24">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z" />
          </svg>
          Share Result
        </button>

        <button type="button" className={styles.secondaryBtn} onClick={handleDownload} title="Download PNG">
          <svg className={styles.shareIcon} viewBox="0 0 24 24">
            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" />
          </svg>
          Download Card
        </button>

        <button type="button" className={styles.secondaryBtn} onClick={handleCopyLink} title="Copy Referral Link">
          <svg className={styles.shareIcon} viewBox="0 0 24 24">
            <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
          </svg>
          {copied ? "Copied Link!" : "Copy Link"}
        </button>
      </div>
      {copied && <div className={styles.copiedToast}>✓ Link copied to clipboard!</div>}
    </div>
  );
}
