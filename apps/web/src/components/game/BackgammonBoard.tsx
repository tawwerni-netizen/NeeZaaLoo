"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { transition } from "@/lib/motion";
import { useVisualSettings } from "./TableEnvironment";
import { playDiceRollSound, playCheckerSlideSound, playCheckerHitSound, playDoublingCubeClack, playMahbousaPinSound } from "@/lib/game-audio";
import styles from "./BackgammonBoard.module.css";

type LegalAction = { from: number | "BAR"; die: number; to: number | "OFF" };
type BackgammonVariant = "classic" | "mahbousa" | "tawla31";

type Props = {
  board: number[];
  bar: [number, number];
  off: [number, number];
  dice: number[];
  legalActions: LegalAction[] | null;
  mySeat: 0 | 1 | null;
  canMove: boolean;
  onMove: (intent: { from: number | "BAR"; die: number } | { pass: true }) => void;
};

const DISP_TOP = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const DISP_BOTTOM = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
const MAX_SHOWN = 5;

function DieFace({ value }: { value: number }) {
  const layout: Record<number, Array<[number, number]>> = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 24], [28, 50], [28, 76], [72, 24], [72, 50], [72, 76]],
  };

  return (
    <motion.div
      className={styles.die3d}
      initial={{ rotateX: 180, rotateY: 90, scale: 0.4, opacity: 0 }}
      animate={{ rotateX: 0, rotateY: 0, scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <svg viewBox="0 0 100 100" className={styles.dieSvg}>
        <defs>
          <linearGradient id="die-bone-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="60%" stopColor="#F5EFE6" />
            <stop offset="100%" stopColor="#D6CBB8" />
          </linearGradient>
          <radialGradient id="die-pip-grad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#111" />
            <stop offset="100%" stopColor="#2A2A2A" />
          </radialGradient>
        </defs>
        <rect x="5" y="5" width="90" height="90" rx="18" fill="url(#die-bone-grad)" stroke="#9C8E77" strokeWidth="2.5" />
        <rect x="7" y="7" width="86" height="86" rx="16" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" />
        {(layout[value] ?? []).map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={8.5} fill="url(#die-pip-grad)" filter="drop-shadow(0 1px 1px rgba(255,255,255,0.4))" />
        ))}
      </svg>
    </motion.div>
  );
}

function BackgammonChecker({ seat, muted = false, isPinned = false }: { seat: 0 | 1; muted?: boolean; isPinned?: boolean }) {
  const isWhite = seat === 0;
  return (
    <div className={[styles.checker3d, isWhite ? styles.checkerWhite : styles.checkerBlack, muted ? styles.checkerMuted : ""].join(" ")}>
      <div className={styles.checkerInnerRim} />
      {isPinned && <span className={styles.pinnedCheckerOverlay} title="قرص محبوس">🔒</span>}
    </div>
  );
}

const DOUBLING_STAKES = [64, 2, 4, 8, 16, 32] as const;

function DoublingCubeFace({
  stake,
  onRotate,
}: {
  stake: number;
  onRotate: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.doublingCubeBtn}
      onClick={onRotate}
      title={`مكعب المضاعفة (Doubling Cube) • ${stake === 64 ? "الرهان الأساسي (1x)" : `مضاعفة ${stake}x`}`}
      aria-label="Doubling Cube"
    >
      <motion.div
        className={styles.doublingCube3d}
        key={stake}
        initial={{ rotateY: -90, rotateX: 35, scale: 0.85 }}
        animate={{ rotateY: 0, rotateX: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <svg viewBox="0 0 100 100" className={styles.doublingCubeSvg}>
          <defs>
            <linearGradient id="cube-amber-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFF5E0" />
              <stop offset="35%" stopColor="#F7DF94" />
              <stop offset="70%" stopColor="#C9972E" />
              <stop offset="100%" stopColor="#8A5B0B" />
            </linearGradient>
            <radialGradient id="cube-specular" cx="30%" cy="30%" r="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.7)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>
          <rect x="6" y="6" width="88" height="88" rx="16" fill="url(#cube-amber-grad)" stroke="#5B3A04" strokeWidth="2.5" />
          <rect x="8" y="8" width="84" height="84" rx="14" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
          <rect x="6" y="6" width="88" height="88" rx="16" fill="url(#cube-specular)" />
          <text
            x="50"
            y={stake >= 16 ? "63" : "66"}
            textAnchor="middle"
            fill="#382103"
            fontFamily="Arial, system-ui, sans-serif"
            fontWeight="900"
            fontSize={stake >= 16 ? "38" : "44"}
            letterSpacing="-1"
            filter="drop-shadow(0 1px 1px rgba(255,255,255,0.8))"
          >
            {stake}
          </text>
        </svg>
      </motion.div>
      <span className={styles.cubeLabel}>
        {stake === 64 ? "1x" : `${stake}x`}
      </span>
    </button>
  );
}

export function BackgammonBoard({ board, bar, off, dice, legalActions, mySeat, canMove, onMove }: Props) {
  const { t, locale } = useI18n();
  const { perspective3D } = useVisualSettings();
  const [selected, setSelected] = useState<number | "BAR" | null>(null);
  const [variant, setVariant] = useState<BackgammonVariant>("classic");
  const [doublingStakeIndex, setDoublingStakeIndex] = useState<number>(0);
  const [doublingBannerText, setDoublingBannerText] = useState<string | null>(null);
  const [doublingOffer, setDoublingOffer] = useState<{ proposer: 0 | 1; nextStake: number } | null>(null);
  const [pinnedPoints, setPinnedPoints] = useState<Set<number>>(new Set());

  const currentStake = DOUBLING_STAKES[doublingStakeIndex] ?? 64;

  function handleDoublingClick() {
    playDoublingCubeClack();
    const nextIdx = (doublingStakeIndex + 1) % DOUBLING_STAKES.length;
    const nextStake = DOUBLING_STAKES[nextIdx] ?? 64;

    if (nextStake === 64) {
      setDoublingStakeIndex(0);
      const label = locale === "ar" ? "🎲 مكعب المضاعفة: الرهان الأساسي 1x" : "🎲 Doubling Cube: Initial Stakes 1x";
      setDoublingBannerText(label);
      setTimeout(() => setDoublingBannerText((prev) => (prev === label ? null : prev)), 3000);
      return;
    }

    // Trigger negotiation offer
    const proposerSeat = mySeat ?? 0;
    setDoublingOffer({ proposer: proposerSeat, nextStake });

    // If local game / vs computer, simulate intelligent opponent response
    const label = locale === "ar"
      ? `⏳ تم طلب مضاعفة الرهان إلى ${nextStake}x... بانتظار رد الخصم!`
      : `⏳ Doubling offered to ${nextStake}x... awaiting response!`;
    setDoublingBannerText(label);

    setTimeout(() => {
      // 80% chance computer accepts
      const willAccept = Math.random() < 0.85;
      if (willAccept) {
        setDoublingStakeIndex(nextIdx);
        playDoublingCubeClack();
        const acceptMsg = locale === "ar"
          ? `✅ الخصم قبل التحدي! الرهان أصبح ${nextStake}x!`
          : `✅ Opponent accepted! Stakes are now ${nextStake}x!`;
        setDoublingBannerText(acceptMsg);
      } else {
        const dropMsg = locale === "ar"
          ? `🏳️ الخصم رفض المضاعفة وانسحب! فوز بالضربة القاضية برهان ${currentStake === 64 ? "1" : currentStake}x!`
          : `🏳️ Opponent dropped the double! Victory claim at ${currentStake === 64 ? "1" : currentStake}x stakes!`;
        setDoublingBannerText(dropMsg);
      }
      setDoublingOffer(null);
      setTimeout(() => setDoublingBannerText(null), 4000);
    }, 1400);
  }

  function handleAcceptDouble() {
    if (!doublingOffer) return;
    const targetStake = doublingOffer.nextStake;
    const targetIdx = DOUBLING_STAKES.indexOf(targetStake as any);
    if (targetIdx !== -1) setDoublingStakeIndex(targetIdx);
    playDoublingCubeClack();
    const msg = locale === "ar" ? `✅ قبلت التحدي! تم رفع الرهان إلى ${targetStake}x!` : `✅ Challenge accepted! Stake is now ${targetStake}x!`;
    setDoublingBannerText(msg);
    setDoublingOffer(null);
    setTimeout(() => setDoublingBannerText(null), 3000);
  }

  function handleDropDouble() {
    if (!doublingOffer) return;
    setDoublingOffer(null);
    const msg = locale === "ar" ? "🏳️ تم الانسحاب من الجولة." : "🏳️ Round conceded.";
    setDoublingBannerText(msg);
    onMove({ pass: true });
    setTimeout(() => setDoublingBannerText(null), 3000);
  }

  const flip = mySeat === 1;
  const toAbsolute = (rel: number) => (flip ? 23 - rel : rel);

  const destinationsFromSelected = useMemo(() => {
    if (selected === null || !legalActions) return new Map<string, LegalAction>();
    const map = new Map<string, LegalAction>();
    for (const a of legalActions) {
      if (a.from === selected) map.set(String(a.to), a);
    }
    return map;
  }, [selected, legalActions]);

  const sourcesWithLegalMove = useMemo(() => {
    if (!legalActions) return new Set<string>();
    return new Set(legalActions.map((a) => String(a.from)));
  }, [legalActions]);

  function pointOwnerAndCount(idx: number): { seat: 0 | 1 | null; count: number } {
    const v = board[idx] ?? 0;
    if (v === 0) return { seat: null, count: 0 };
    return v > 0 ? { seat: 0, count: v } : { seat: 1, count: -v };
  }

  const prevDiceRef = useRef<string>("");
  useEffect(() => {
    const diceStr = (dice || []).join(",");
    if (diceStr && diceStr !== prevDiceRef.current) {
      playDiceRollSound();
    }
    prevDiceRef.current = diceStr;
  }, [dice]);

  function handlePointClick(idx: number) {
    if (!canMove || !legalActions) return;
    const { seat, count } = pointOwnerAndCount(idx);
    const dest = destinationsFromSelected.get(String(idx));
    if (selected !== null && dest) {
      if (seat !== null && mySeat !== null && seat !== mySeat && count === 1) {
        if (variant === "mahbousa") {
          playMahbousaPinSound();
          setPinnedPoints((prev) => new Set([...prev, idx]));
          const banner = locale === "ar"
            ? "🔒 تم حَبْس قرص الخصم بنجاح! لا يمكنه تحريكه حتى تتركه."
            : "🔒 Enemy checker pinned! Cannot move until unblocked.";
          setDoublingBannerText(banner);
          setTimeout(() => setDoublingBannerText((prev) => (prev === banner ? null : prev)), 3500);
        } else {
          playCheckerHitSound();
        }
      } else {
        playCheckerSlideSound();
      }
      onMove({ from: selected, die: dest.die });
      setSelected(null);
      return;
    }
    if (seat === mySeat && sourcesWithLegalMove.has(String(idx))) {
      setSelected(idx === selected ? null : idx);
    }
  }

  function handleBarClick() {
    if (!canMove || !legalActions || mySeat === null) return;
    if (bar[mySeat] > 0 && sourcesWithLegalMove.has("BAR")) {
      setSelected(selected === "BAR" ? null : "BAR");
    }
  }

  function handleOffClick() {
    if (!canMove || selected === null) return;
    const dest = destinationsFromSelected.get("OFF");
    if (dest) {
      playCheckerSlideSound();
      onMove({ from: selected, die: dest.die });
      setSelected(null);
    }
  }

  function renderPoint(rel: number, edge: "top" | "bottom") {
    const idx = toAbsolute(rel);
    const { seat, count } = pointOwnerAndCount(idx);
    const isSelected = selected === idx;
    const isDestination = selected !== null && destinationsFromSelected.has(String(idx));
    const isSelectable = canMove && seat === mySeat && sourcesWithLegalMove.has(String(idx));
    const isPinned = variant === "mahbousa" && pinnedPoints.has(idx);
    const shown = Math.min(count, MAX_SHOWN);
    const overflow = count - shown;

    return (
      <button
        key={idx}
        type="button"
        className={[
          styles.point,
          styles[edge],
          idx % 2 === 0 ? styles.pointLight : styles.pointDark,
          isSelected ? styles.pointSelected : "",
          isDestination ? styles.pointDestination : "",
        ].join(" ")}
        disabled={!isSelectable && !isDestination}
        onClick={() => handlePointClick(idx)}
        aria-label={`point ${idx}`}
      >
        <div className={styles.pointTriangle} />
        <div className={styles.checkerStack}>
          {seat !== null && Array.from({ length: shown }).map((_, i) => (
            <BackgammonChecker key={i} seat={seat} isPinned={isPinned && i === 0} />
          ))}
          {overflow > 0 && <span className={styles.overflowLabel}>+{overflow}</span>}
        </div>
        {isDestination && <span className={styles.destDot} />}
      </button>
    );
  }

  return (
    <div className={styles.wrap}>
      {/* Variant Selector Tabs */}
      <div className={styles.variantSelector}>
        <button
          type="button"
          className={[styles.variantBtn, variant === "classic" ? styles.variantBtnActive : ""].join(" ")}
          onClick={() => {
            setVariant("classic");
            setDoublingBannerText(locale === "ar" ? "🎲 تم تفعيل: طاولة كلاسيكية (قواعد عالمية)" : "🎲 Classic Backgammon Active");
            setTimeout(() => setDoublingBannerText(null), 2500);
          }}
        >
          {locale === "ar" ? "🎲 كلاسيكية" : "🎲 Classic"}
        </button>
        <button
          type="button"
          className={[styles.variantBtn, variant === "mahbousa" ? styles.variantBtnActive : ""].join(" ")}
          onClick={() => {
            setVariant("mahbousa");
            setDoublingBannerText(locale === "ar" ? "🔒 تم تفعيل: طاولة محبوسة (حَبْس القرص بدون أكل للبار)" : "🔒 Egyptian Mahbousa Active");
            setTimeout(() => setDoublingBannerText(null), 2500);
          }}
        >
          {locale === "ar" ? "🔒 محبوسة مصرية" : "🔒 Mahbousa"}
        </button>
        <button
          type="button"
          className={[styles.variantBtn, variant === "tawla31" ? styles.variantBtnActive : ""].join(" ")}
          onClick={() => {
            setVariant("tawla31");
            setDoublingBannerText(locale === "ar" ? "👑 تم تفعيل: طاولة 31 (سباق تجميع البيادق)" : "👑 Tawla 31 Active");
            setTimeout(() => setDoublingBannerText(null), 2500);
          }}
        >
          {locale === "ar" ? "👑 طاولة 31" : "👑 Tawla 31"}
        </button>
      </div>

      <div className={styles.diceRow}>
        <DoublingCubeFace
          stake={currentStake}
          onRotate={handleDoublingClick}
        />
        <AnimatePresence mode="popLayout">
          {dice.map((d, i) => <DieFace key={`${dice.length}-${i}-${d}`} value={d} />)}
        </AnimatePresence>
        {dice.length >= 2 && dice[0] === dice[1] && (
          <span className={styles.doubleBadge}>
            ⚡ DOUBLE {dice[0]}-{dice[0]} • 4 MOVES!
          </span>
        )}
      </div>

      <AnimatePresence>
        {doublingBannerText && (
          <motion.div
            className={styles.doublingBanner}
            initial={{ opacity: 0, y: -8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.9 }}
            transition={{ duration: 0.25 }}
          >
            {doublingBannerText}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Doubling Challenge Modal */}
      <AnimatePresence>
        {doublingOffer && doublingOffer.proposer !== mySeat && (
          <motion.div
            className={styles.doublingOfferModalBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={styles.doublingOfferCard}
              initial={{ scale: 0.85, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 16 }}
            >
              <h3 className={styles.doublingOfferTitle}>
                {locale === "ar" ? `⚡ طلب مضاعفة الرهان إلى ${doublingOffer.nextStake}x!` : `⚡ Doubling Stakes Challenge: ${doublingOffer.nextStake}x!`}
              </h3>
              <p className={styles.doublingOfferDesc}>
                {locale === "ar"
                  ? "يعرض عليك الخصم رفع قيمة الرهان الحالي للجولة. إذا قبلت، يستمر اللعب بضعف القيمة، وإذا انسحبت، يخسر رهانك الحالي فقط."
                  : "The opponent offers to double the current round stakes. Accept to fight at doubled stakes, or drop to forfeit current flat stake."}
              </p>
              <div className={styles.doublingOfferActions}>
                <button type="button" className={styles.doublingAcceptBtn} onClick={handleAcceptDouble}>
                  {locale === "ar" ? `✅ قبول المضاعفة (${doublingOffer.nextStake}x)` : `✅ Accept (${doublingOffer.nextStake}x)`}
                </button>
                <button type="button" className={styles.doublingDropBtn} onClick={handleDropDouble}>
                  {locale === "ar" ? "🏳️ انسحاب وتنازل" : "🏳️ Drop / Concede"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={[styles.boardContainer, perspective3D ? styles.perspective : ""].join(" ")}>
        <div className={styles.attacheCase} dir="ltr">
          <div className={styles.feltBed}>
            {/* Top Left Quadrant */}
            <div className={[styles.quadrant, styles.top].join(" ")}>
              {DISP_TOP.slice(0, 6).map((rel) => renderPoint(rel, "top"))}
            </div>

            {/* Raised Center Bar */}
            <button
              type="button"
              className={[styles.barSlot, selected === "BAR" ? styles.barSelected : ""].join(" ")}
              onClick={handleBarClick}
              disabled={mySeat === null || bar[mySeat] === 0 || !sourcesWithLegalMove.has("BAR")}
              aria-label={t("game.backgammon.bar")}
            >
              <div className={styles.barLeather} />
              {bar[0] > 0 && (
                <div className={styles.barGroup}>
                  {Array.from({ length: bar[0] }).map((_, i) => <BackgammonChecker key={i} seat={0} />)}
                </div>
              )}
              {bar[1] > 0 && (
                <div className={styles.barGroup}>
                  {Array.from({ length: bar[1] }).map((_, i) => <BackgammonChecker key={i} seat={1} />)}
                </div>
              )}
            </button>

            {/* Top Right Quadrant */}
            <div className={[styles.quadrant, styles.top].join(" ")}>
              {DISP_TOP.slice(6, 12).map((rel) => renderPoint(rel, "top"))}
            </div>

            {/* Bottom Left Quadrant */}
            <div className={[styles.quadrant, styles.bottom].join(" ")}>
              {DISP_BOTTOM.slice(0, 6).map((rel) => renderPoint(rel, "bottom"))}
            </div>

            {/* Bottom Right Quadrant */}
            <div className={[styles.quadrant, styles.bottom].join(" ")}>
              {DISP_BOTTOM.slice(6, 12).map((rel) => renderPoint(rel, "bottom"))}
            </div>
          </div>
        </div>
      </div>

      {/* Bear-off Tray */}
      <div className={styles.offRow}>
        <span className={styles.offLabel}>{t("game.backgammon.borne_off")}</span>
        <button
          type="button"
          className={[styles.offTray, selected !== null && destinationsFromSelected.has("OFF") ? styles.pointDestination : ""].join(" ")}
          onClick={handleOffClick}
          disabled={!canMove || selected === null || !destinationsFromSelected.has("OFF")}
        >
          <span className={styles.offCount}>{mySeat !== null ? off[mySeat] : off[0]}</span>
          <span className={styles.offCountOpp}>{mySeat !== null ? off[mySeat === 0 ? 1 : 0] : off[1]}</span>
        </button>
      </div>
    </div>
  );
}
