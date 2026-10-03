"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { transition, useReducedMotion } from "@/lib/motion";
import type { ProgressionDelta } from "@/lib/use-progression-snapshot";
import { playVictoryFanfare, playDefeatTone } from "@/lib/game-audio";
import { getGameThemeTokens } from "@/lib/games/theme-tokens";
import { GameVictoryInsignia } from "./GameVictoryInsignia";
import { MatchShareCard } from "./MatchShareCard";
import styles from "./ResultCeremony.module.css";

type Props = {
  isSpectator: boolean;
  outcome: "win" | "loss" | "draw" | null;
  result: string | null;
  reason: string | null;
  vsComputer: boolean;
  duelId: string;
  gameId?: string;
  delta: ProgressionDelta | null;
  onRematch: () => void;
  rematchBusy: boolean;
  rematchSent?: boolean;
};

const CEREMONY_REASON_BADGES: Record<string, Record<string, string>> = {
  VOIDED: {
    ar: "⚠️ تم إلغاء النزال واسترداد الرصيد بالكامل",
    en: "⚠️ Match voided — full stake refunded",
    es: "⚠️ Partida anulada — apuesta reembolsada",
    fr: "⚠️ Duel annulé — mise remboursée",
    hi: "⚠️ मैच रद्द — पूरा दांव वापस",
    zh: "⚠️ 对局已撤销 — 资金已全额退还",
  },
  CANCELLED: {
    ar: "⚠️ تم إلغاء النزال واسترداد الرصيد بالكامل",
    en: "⚠️ Match cancelled — full stake refunded",
    es: "⚠️ Partida cancelada — apuesta reembolsada",
    fr: "⚠️ Duel annulé — mise remboursée",
    hi: "⚠️ मैच रद्द — पूरा दांव वापस",
    zh: "⚠️ 对局已取消 — 资金已全额退还",
  },
  BACKGAMMON: {
    ar: "👑 انتصار باكغامون إمبراطوري ثلاثي (3x)!",
    en: "👑 Imperial Backgammon Win (3x)!",
    es: "👑 ¡Victoria imperial de Backgammon (3x)!",
    fr: "👑 Victoire impériale au Backgammon (3x) !",
    hi: "👑 बैकगैमौन शाही जीत (3x)!",
    zh: "👑 步步高帝国级大胜 (3x)！",
  },
  GAMMON: {
    ar: "🔥 انتصار غامون مضاعف ساحق (2x)!",
    en: "🔥 Crushing Gammon Win (2x)!",
    es: "🔥 ¡Victoria aplastante de Gammon (2x)!",
    fr: "🔥 Victoire écrasante au Gammon (2x) !",
    hi: "🔥 भारी गैमन विजय (2x)!",
    zh: "🔥 全盘大胜 (2x)！",
  },
  DOUBLE_DROPPED: {
    ar: "⚡ استسلام الخصم بعد مضاعفة الرهان!",
    en: "⚡ Opponent Conceded to Double!",
    es: "⚡ ¡El rival se rindió ante la duplicación!",
    fr: "⚡ L'adversaire a concédé sur le double !",
    hi: "⚡ दांव दोगुना होने पर विरोधी ने हार मानी!",
    zh: "⚡ 对手因加倍弃权认输！",
  },
  CHECKMATE: {
    ar: "👑 كش مات! سقوط الملك بالضربة القاضية",
    en: "👑 Checkmate! King Knockout",
    es: "👑 ¡Jaque mate! Caída del Rey",
    fr: "👑 Échec et mat ! Chute du Roi",
    hi: "👑 शह और मात! राजा धराशायी",
    zh: "👑 将死！国王绝杀",
  },
  DOMINO_OUT: {
    ar: "🀄 دومينو خارج! تفريغ البلاطات بالكامل",
    en: "🀄 Domino Out! Hand Cleared",
    es: "🀄 ¡Dominó fuera! Mano vacía",
    fr: "🀄 Domino posé ! Main vidée",
    hi: "🀄 डोमिनोज़ आउट! सभी गोटियां खत्म",
    zh: "🀄 多米诺出尽！手牌清空",
  },
  ALL_FIVES_TARGET_REACHED: {
    ar: "⚡ انتصار ساحق بسقف نقاط الخمسات 55!",
    en: "⚡ All-Fives Target Score Victory!",
    es: "⚡ ¡Victoria por objetivo en All-Fives 55!",
    fr: "⚡ Victoire au score cible All-Fives 55 !",
    hi: "⚡ ऑल-फाइव्स 55 लक्ष्य स्कोर विजय!",
    zh: "⚡ 5的倍数 55分目标达成大胜！",
  },
  LUDO_FINISHED: {
    ar: "🏆 تتويج أسطوري! وصول القواطع للمثلث الذهبي",
    en: "🏆 Ludo Champion! All Tokens Home",
    es: "🏆 ¡Campeón de Ludo! Todas las fichas en meta",
    fr: "🏆 Champion de Ludo ! Tous les pions au centre",
    hi: "🏆 लूडो चैंपियन! सभी गोटियां घर पहुंचीं",
    zh: "🏆 飞行棋冠军！全部棋子到达终点",
  },
  MAHBOUSA_CAPTURED: {
    ar: "🔒 حَبْس واستنزاف كافة أقراص الخصم!",
    en: "🔒 All Checkers Pinned & Borne Off!",
    es: "🔒 ¡Todas las fichas rivales bloqueadas y retiradas!",
    fr: "🔒 Tous les pions adverses bloqués et sortis !",
    hi: "🔒 विरोधी के सभी मोहरे बंद और बाहर!",
    zh: "🔒 封锁并吃尽所有敌方棋子！",
  },
  FOUR_IN_A_ROW: {
    ar: "🎯 رباعية نصر تكتيكية بالجاذبية",
    en: "🎯 Connect Four Victory!",
    es: "🎯 ¡Victoria en Conecta Cuatro!",
    fr: "🎯 Victoire Puissance 4 !",
    hi: "🎯 कनेक्ट फोर विजय!",
    zh: "🎯 四子连珠战术大胜！",
  },
  FIVE_IN_A_ROW: {
    ar: "☯️ خمسة أحجار زن متصلة",
    en: "☯️ 5-in-a-row Zen Master!",
    es: "☯️ ¡Maestro Zen 5 en línea!",
    fr: "☯️ Maître Zen du 5 en ligne !",
    hi: "☯️ ज़ेन मास्टर 5-इन-ए-रो!",
    zh: "☯️ 五子连珠 禅意宗师！",
  },
};

export function ResultCeremony({
  isSpectator, outcome, result, reason, vsComputer, duelId, gameId = "game", delta, onRematch, rematchBusy, rematchSent,
}: Props) {
  const { t, locale } = useI18n();
  const { player } = useAuth();
  const { openPopup } = useAuthPopup();
  const reduceMotion = useReducedMotion();
  const [gemCount, setGemCount] = useState(0);

  const isVoided = reason === "VOIDED" || reason === "CANCELLED";
  const titleKey = isVoided
    ? (locale === "ar" ? "تم إلغاء النزال" : "Match Voided")
    : outcome === "win" ? "game.result_win" : outcome === "draw" ? "game.result_draw" : "game.result_loss";
  const isGuest = player?.handle?.startsWith("Guest_");

  useEffect(() => {
    if (isSpectator) return;
    if (outcome === "win") {
      playVictoryFanfare();
      // Trigger epic confetti
      const duration = 3000;
      const end = Date.now() + duration;


      const frame = () => {
        // Left Cannon
        confetti({
          particleCount: 8,
          angle: 60,
          spread: 60,
          origin: { x: 0 },
          colors: ['#22d3ee', '#fbbf24', '#d946ef', '#FFD700']
        });
        // Right Cannon
        confetti({
          particleCount: 8,
          angle: 120,
          spread: 60,
          origin: { x: 1 },
          colors: ['#22d3ee', '#fbbf24', '#d946ef', '#FFD700']
        });
        
        // Occasional center burst for extra dopamine
        if (Math.random() > 0.85) {
           confetti({
            particleCount: 30,
            spread: 100,
            origin: { y: 0.6 },
            colors: ['#FFD700', '#fbbf24', '#ffffff']
          });
        }

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();

      // Tick up simulated Gems if applicable
      // In a real scenario, delta would contain gem won amounts
      let current = 0;
      const target = 15; // Example +15 N-Gems won
      const interval = setInterval(() => {
        current += 1;
        setGemCount(current);
        if (current >= target) clearInterval(interval);
      }, 50);
      return () => clearInterval(interval);
    } else if (outcome === "loss") {
      playDefeatTone();
    }
  }, [outcome, isSpectator]);

  const gameTokens = useMemo(() => getGameThemeTokens(gameId), [gameId]);

  return (
    <div
      className={[styles.card, outcome ? styles[`outcome-${outcome}`] : ""].join(" ")}
      data-game={gameId}
      style={{
        "--game-accent": gameTokens.palette.accent,
        "--game-glow": gameTokens.palette.glow,
        "--game-border": gameTokens.palette.border,
      } as React.CSSProperties}
    >
      {/* Bespoke Game Victory Insignia for WIN */}
      {!isSpectator && outcome === "win" && (
        <motion.div
          className={styles.insigniaWrap}
          initial={reduceMotion ? {} : { scale: 0.4, rotate: -15, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={transition.ceremonyLong}
        >
          <GameVictoryInsignia type={gameTokens.victoryInsignia} />
        </motion.div>
      )}

      {!isSpectator && (
        <div className={styles.gamePersonaCeremony}>
          <span style={{ color: gameTokens.palette.accent }}>
            {gameTokens.persona[locale] || gameTokens.persona.en}
          </span>
        </div>
      )}

      <motion.h1
        className={styles.title}
        initial={reduceMotion ? {} : { opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={transition.surface}
        style={{
          textShadow: outcome === "win" ? `0 0 24px ${gameTokens.palette.glow}` : "none",
        }}
      >
        {isSpectator ? `${result} · ${reason ? (CEREMONY_REASON_BADGES[reason]?.[locale] ?? t(`game.reason.${reason}`)) : ""}` : isVoided ? titleKey : t(titleKey)}
      </motion.h1>
      {!isSpectator && reason && (
        <div className={styles.reasonBadgeWrap}>
          <span className={styles.reasonBadge}>
            {CEREMONY_REASON_BADGES[reason]?.[locale] ??
             CEREMONY_REASON_BADGES[reason]?.en ??
             t(`game.reason.${reason}`)}
          </span>
        </div>
      )}

      {!isSpectator && delta && delta.newAchievements.length > 0 && (
        <motion.div
          className={`${styles.achievements} nz-earned-foil`}
          initial={reduceMotion ? {} : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={transition.ceremonyLong}
        >
          {delta.newAchievements.map((code) => (
            <div key={code} className={styles.achievement}>
              <span className={`${styles.achievementTitle} nz-earned`}>{t(`game.achievement.${code}.title`)}</span>
              <span className={styles.achievementDescription}>{t(`game.achievement.${code}.description`)}</span>
            </div>
          ))}
        </motion.div>
      )}

      {!isSpectator && (delta || outcome === "win") && (
        <motion.div
          className={styles.delta}
          initial={reduceMotion ? {} : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition.ceremony}
        >
          {outcome === "win" && gemCount > 0 && (
             <span className={styles.gemDeltaItem}>
               +{gemCount} 💎
             </span>
          )}
          {delta && delta.expGained > 0 && (
            <span className={styles.deltaItem}>+{delta.expGained} EXP</span>
          )}
          {delta && delta.ratingBefore !== null && delta.ratingAfter !== null && delta.ratingAfter !== delta.ratingBefore && (
            <span className={`nz-num ${styles.deltaItem} ${delta.ratingAfter >= delta.ratingBefore ? styles.ratingUp : styles.ratingDown}`}>
              {t(delta.ratingAfter >= delta.ratingBefore ? "game.rating_change_up" : "game.rating_change_down", {
                amount: Math.round(delta.ratingAfter - delta.ratingBefore),
              })}
            </span>
          )}
          {delta && delta.levelAfter > delta.levelBefore && (
            <span className={`${styles.deltaItem} ${styles.levelUpBadge}`}>{t("game.level_up", { level: delta.levelAfter })}</span>
          )}
        </motion.div>
      )}

      {/* Guest Conversion CTA */}
      {!isSpectator && isGuest && outcome === "win" && (
        <motion.div 
          className={styles.guestConversionCard}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
        >
          <div className={styles.guestConversionIcon}>🎁</div>
          <h3 className={styles.guestConversionTitle}>{locale === "ar" ? "لقد فزت بجواهر!" : "You won Gems!"}</h3>
          <p className={styles.guestConversionDesc}>
            {locale === "ar" 
              ? "لا تفقد تقدمك وجوائزك. احفظ حسابك الآن بضغطة واحدة لاستلامها." 
              : "Don't lose your progress and rewards. Save your account now with one click to claim them."}
          </p>
          <Button
            variant="primary"
            className={styles.guestConversionBtn}
            onClick={() => openPopup()}
          >
            {locale === "ar" ? "احفظ الحساب لاستلام الجوائز 🎁" : "Save Account to Claim 🎁"}
          </Button>
        </motion.div>
      )}

      {!isSpectator && (
        <>
          <div className={styles.actions}>
            {vsComputer ? (
              <>
                <Button variant="primary" onClick={onRematch} disabled={rematchBusy} className={styles.actionBtn}>
                  {rematchBusy ? (locale === "ar" ? "جارٍ التحضير..." : "Preparing...") : (locale === "ar" ? "إعادة النزال ضد الكمبيوتر ⚡" : t("game.rematch"))}
                </Button>
                <LocaleLink href={`/play/${gameId}`} style={{ width: "100%" }}>
                  <Button variant="secondary" className={styles.actionBtn}>
                    ⚔️ {locale === "ar" ? "تحدي لاعب حقيقي في الأرينا" : "Challenge Real Opponent"}
                  </Button>
                </LocaleLink>
                <LocaleLink href="/games" style={{ width: "100%" }}>
                  <Button variant="ghost" className={styles.actionBtn}>
                    🎲 {locale === "ar" ? "استكشاف باقي الألعاب" : "Explore All Games"}
                  </Button>
                </LocaleLink>
              </>
            ) : (
              <>
                {rematchSent ? (
                  <div className={styles.rematchSentNotice}>
                    <span className={styles.pulseDot} />
                    <span>{locale === "ar" ? "تم إرسال طلب إعادة النزال! في انتظار رد الخصم..." : "Rematch request sent! Waiting for opponent..."}</span>
                  </div>
                ) : (
                  <Button variant="primary" onClick={onRematch} disabled={rematchBusy} className={styles.actionBtn}>
                    {rematchBusy
                      ? (locale === "ar" ? "جارٍ إرسال التحدي..." : "Sending Rematch...")
                      : (locale === "ar" ? "طلب ثأر / إعادة النزال ⚔️" : "Request Rematch ⚔️")}
                  </Button>
                )}
                <LocaleLink href={`/play/${gameId}`} style={{ width: "100%" }}>
                  <Button variant="secondary" className={styles.actionBtn}>
                    ⚔️ {locale === "ar" ? "خصم جديد في نفس اللعبة" : t("game.new_opponent")}
                  </Button>
                </LocaleLink>
                <LocaleLink href="/games" style={{ width: "100%" }}>
                  <Button variant="ghost" className={styles.actionBtn}>
                    🎲 {locale === "ar" ? "استكشاف باقي الألعاب" : "Explore All Games"}
                  </Button>
                </LocaleLink>
              </>
            )}
            <LocaleLink href={`/support/new?category=MATCH_PROBLEM&referenceId=${encodeURIComponent(duelId)}`} style={{ width: "100%" }}>
              <Button variant="ghost" className={styles.actionBtn}>{t("support.game_report_cta")}</Button>
            </LocaleLink>
          </div>


          <MatchShareCard
            gameId={gameId}
            outcome={outcome}
            result={result}
            duelId={duelId}
            delta={delta}
            playerHandle={player?.handle}
          />
        </>
      )}
    </div>
  );
}
