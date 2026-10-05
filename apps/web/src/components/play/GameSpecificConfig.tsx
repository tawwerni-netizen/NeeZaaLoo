"use client";

import React from "react";
import { useI18n } from "@/lib/i18n/context";
import type { GameCapability } from "@/lib/games/capabilities";
import type { GamePlugin } from "@/lib/games";
import styles from "./GameSpecificConfig.module.css";

export interface GameSpecificConfigValue {
  timeProfile?: string;
  variant?: string;
  playerCount?: 2 | 4;
  matchPoints?: number;
  sprintOption?: string;
  seriesOption?: string;
}

interface GameSpecificConfigProps {
  capability: GameCapability;
  gameName: string;
  plugin: GamePlugin;
  config: GameSpecificConfigValue;
  onChangeConfig: (newConfig: GameSpecificConfigValue) => void;
  onContinue: () => void;
  loading?: boolean;
  isVsComputer?: boolean;
}

export function GameSpecificConfig({
  capability,
  gameName,
  plugin,
  config,
  onChangeConfig,
  onContinue,
  loading = false,
  isVsComputer = false,
}: GameSpecificConfigProps) {
  const { locale, dir } = useI18n();
  const isRtl = dir === "rtl" || locale === "ar";

  const renderHeader = (title: string, subtitle: string, badgeText: string) => (
    <div className={styles.header}>
      <div className={styles.categoryBadge}>
        <span className={styles.badgePulse} />
        <span>{badgeText}</span>
      </div>
      <h2 className={styles.heading}>
        {title} <span className={styles.gameHighlight}>{gameName}</span>
      </h2>
      <p className={styles.subtitle}>{subtitle}</p>
    </div>
  );

  // 1. Time Control Setup (Chess)
  if (capability.setupType === "time_control" && capability.timeControls && capability.timeControls.length > 0) {
    const selectedId = config.timeProfile || capability.timeControls.find((tc) => tc.isDefault)?.id || capability.timeControls[0]?.id || "BLITZ_3_2";
    return (
      <div className={styles.container} dir={dir}>
        {renderHeader(
          isRtl ? "اختر نظام التوقيت لـ" : "Select Time Control for",
          isRtl
            ? "تُدار مباريات الشطرنج في نيزالو بساعات رسمية معتمدة دولياً من فيد FIDE مع التحقق اللحظي من الخادم."
            : "Official FIDE clocks with server-authoritative countdowns and strict anti-cheat monitoring.",
          isRtl ? "ساعات رسمية معتمدة" : "Official FIDE Clocks"
        )}

        <div className={styles.grid}>
          {capability.timeControls.map((tc) => {
            const isSelected = selectedId === tc.id;
            return (
              <div
                key={tc.id}
                className={[styles.card, isSelected ? styles.cardActive : ""].join(" ")}
                onClick={() => onChangeConfig({ ...config, timeProfile: tc.id })}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
              >
                <div className={styles.topBar}>
                  <div className={styles.iconWrap}>{tc.icon}</div>
                  {tc.badge && <span className={styles.cardBadge}>{tc.badge}</span>}
                </div>
                <h3 className={styles.cardTitle}>{isRtl ? tc.nameAr : tc.nameEn}</h3>
                <div className={styles.cardMetric}>⏱️ {isRtl ? tc.timeAr : tc.timeEn}</div>
                <p className={styles.cardDesc}>{isRtl ? tc.descAr : tc.descEn}</p>
                <div className={styles.selectIndicator}>
                  <span>{isSelected ? (isRtl ? "تم التحديد" : "Selected") : (isRtl ? "تحديد" : "Select")}</span>
                  <div className={[styles.radioCircle, isSelected ? styles.radioActive : ""].join(" ")}>
                    {isSelected && <div className={styles.radioInnerDot} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.actionFooter}>
          <button type="button" className={styles.continueBtn} onClick={onContinue} disabled={loading}>
            <span>{isVsComputer ? (isRtl ? "بدء المواجهة ⚔️" : "Start Duel ⚔️") : (isRtl ? "المتابعة واختيار الرهان ›" : "Continue to Stake ›")}</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. Variant Selection (Dominoes)
  if (capability.setupType === "variant_select" && capability.variants && capability.variants.length > 0) {
    const selectedVariant = config.variant || capability.variants.find((v) => v.isDefault)?.id || capability.variants[0]?.id || "TRADITIONAL";
    return (
      <div className={styles.container} dir={dir}>
        {renderHeader(
          isRtl ? "اختر نمط اللعب لـ" : "Select Game Variant for",
          isRtl
            ? "اختر بين النمط العادي المعتمد في المقاهي الشعبية أو النمط الأمريكي الاحترافي لحساب النقاط."
            : "Choose between traditional draw/block shedding or high-strategy American All-Fives 150 points.",
          isRtl ? "أنماط الدومينو المعتمدة" : "Sanctioned Dominoes Rules"
        )}

        <div className={styles.grid}>
          {capability.variants.map((v) => {
            const isSelected = selectedVariant === v.id;
            return (
              <div
                key={v.id}
                className={[styles.card, isSelected ? styles.cardActiveGold : ""].join(" ")}
                onClick={() => onChangeConfig({ ...config, variant: v.id })}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
              >
                <div className={styles.topBar}>
                  <div className={styles.iconWrap}>{v.icon}</div>
                  {v.badge && <span className={styles.cardBadge} style={{ color: "#F59E0B", borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.12)" }}>{v.badge}</span>}
                </div>
                <h3 className={styles.cardTitle}>{isRtl ? v.nameAr : v.nameEn}</h3>
                <div className={styles.cardMetric}>🀄 {isRtl ? "قواعد رسمية كاملة" : "Official Engine Rules"}</div>
                <p className={styles.cardDesc}>{isRtl ? v.descAr : v.descEn}</p>
                <div className={styles.selectIndicator}>
                  <span>{isSelected ? (isRtl ? "تم التحديد" : "Selected") : (isRtl ? "تحديد" : "Select")}</span>
                  <div className={[styles.radioCircle, isSelected ? styles.radioActive : ""].join(" ")}>
                    {isSelected && <div className={styles.radioInnerDot} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.actionFooter}>
          <button type="button" className={styles.continueBtn} onClick={onContinue} disabled={loading}>
            <span>{isVsComputer ? (isRtl ? "بدء المباراة ⚔️" : "Start Duel ⚔️") : (isRtl ? "المتابعة واختيار الرهان ›" : "Continue to Stake ›")}</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. Player Count / Format (Ludo)
  if (capability.setupType === "player_count" && capability.playerCountOptions) {
    const selectedCount = config.playerCount || capability.playerCountOptions.find((p) => p.isDefault)?.count || 2;
    return (
      <div className={styles.container} dir={dir}>
        {renderHeader(
          isRtl ? "اختر نمط المنافسة لـ" : "Select Match Format for",
          isRtl
            ? "اختر بين المواجهة الثنائية السريعة المباشرة (1v1) أو الملحمة الرباعية الكبرى (Royale) بأعلى جائزة."
            : "Choose between high-speed 1v1 corridor sprint or 4-player high-roller battle royale.",
          isRtl ? "أنماط لودو الأساطير" : "Ludo Match Formats"
        )}

        <div className={styles.grid}>
          {capability.playerCountOptions.map((opt) => {
            const isSelected = selectedCount === opt.count;
            return (
              <div
                key={opt.id}
                className={[styles.card, isSelected ? styles.cardActiveEmerald : ""].join(" ")}
                onClick={() => onChangeConfig({ ...config, playerCount: opt.count })}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
              >
                <div className={styles.topBar}>
                  <div className={styles.iconWrap}>{opt.icon}</div>
                  {opt.badge && <span className={styles.cardBadge} style={{ color: "#10B981", borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.12)" }}>{opt.badge}</span>}
                </div>
                <h3 className={styles.cardTitle}>{isRtl ? opt.nameAr : opt.nameEn}</h3>
                <div className={styles.cardMetric}>
                  👥 {isRtl ? (opt.count === 2 ? "لاعبان (1 ضد 1)" : "4 لاعبين (جائزة كبرى)") : `${opt.count} Players`}
                </div>
                <p className={styles.cardDesc}>{isRtl ? opt.descAr : opt.descEn}</p>
                <div className={styles.selectIndicator}>
                  <span>{isSelected ? (isRtl ? "تم التحديد" : "Selected") : (isRtl ? "تحديد" : "Select")}</span>
                  <div className={[styles.radioCircle, isSelected ? styles.radioActive : ""].join(" ")}>
                    {isSelected && <div className={styles.radioInnerDot} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.actionFooter}>
          <button type="button" className={styles.continueBtn} onClick={onContinue} disabled={loading}>
            <span>{isVsComputer ? (isRtl ? "دخول اللعبة فوراً ⚔️" : "Enter Game ⚔️") : (isRtl ? "المتابعة واختيار الرهان ›" : "Continue to Stake ›")}</span>
          </button>
        </div>
      </div>
    );
  }

  // 4. Match Points (Backgammon)
  if (capability.setupType === "match_points" && capability.matchPoints) {
    const selectedPoints = config.matchPoints || capability.matchPoints.find((m) => m.isDefault)?.points || 1;
    return (
      <div className={styles.container} dir={dir}>
        {renderHeader(
          isRtl ? "اختر طول المباراة لـ" : "Select Match Length for",
          isRtl
            ? "وفقاً للاتحاد الدولي لطاولة الزهر WBF، تحدد النقاط عمق الاستراتيجية واستخدام مكعب المضاعفة."
            : "WBF-sanctioned point matches featuring doubling cube tactics and Crawford rules.",
          isRtl ? "لوائح طاولة الزهر الدولية" : "Official WBF Point Matches"
        )}

        <div className={styles.grid}>
          {capability.matchPoints.map((mp) => {
            const isSelected = selectedPoints === mp.points;
            return (
              <div
                key={mp.id}
                className={[styles.card, isSelected ? styles.cardActiveGold : ""].join(" ")}
                onClick={() => onChangeConfig({ ...config, matchPoints: mp.points })}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
              >
                <div className={styles.topBar}>
                  <div className={styles.iconWrap}>{mp.icon}</div>
                  {mp.badge && <span className={styles.cardBadge} style={{ color: "#F59E0B", borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.12)" }}>{mp.badge}</span>}
                </div>
                <h3 className={styles.cardTitle}>{isRtl ? mp.nameAr : mp.nameEn}</h3>
                <div className={styles.cardMetric}>⏱️ {isRtl ? mp.durationAr : mp.durationEn}</div>
                <p className={styles.cardDesc}>{isRtl ? mp.descAr : mp.descEn}</p>
                <div className={styles.selectIndicator}>
                  <span>{isSelected ? (isRtl ? "تم التحديد" : "Selected") : (isRtl ? "تحديد" : "Select")}</span>
                  <div className={[styles.radioCircle, isSelected ? styles.radioActive : ""].join(" ")}>
                    {isSelected && <div className={styles.radioInnerDot} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.actionFooter}>
          <button type="button" className={styles.continueBtn} onClick={onContinue} disabled={loading}>
            <span>{isVsComputer ? (isRtl ? "بدء الطاولة ⚔️" : "Start Tawla ⚔️") : (isRtl ? "المتابعة واختيار الرهان ›" : "Continue to Stake ›")}</span>
          </button>
        </div>
      </div>
    );
  }

  // 5. Sprint Config (Speed Math)
  if (capability.setupType === "sprint_config" && capability.sprintOptions && capability.sprintOptions.length > 0) {
    const selectedSprint = config.sprintOption || capability.sprintOptions.find((s) => s.isDefault)?.id || capability.sprintOptions[0]?.id || "BLITZ_10";
    return (
      <div className={styles.container} dir={dir}>
        {renderHeader(
          isRtl ? "اختر نوع التحدي الحسابي لـ" : "Select Sprint Format for",
          isRtl
            ? "تنافس لحظي متزامن في الحساب الذهني الخارق. اللاعب الأسرع والأعلى دقة يحصد الفوز."
            : "Simultaneous real-time sprint. Higher accuracy and faster answer velocity claims the pot.",
          isRtl ? "سبرنت الحساب اللحظي" : "Speed Calculation Sprint"
        )}

        <div className={styles.grid}>
          {capability.sprintOptions.map((sp) => {
            const isSelected = selectedSprint === sp.id;
            return (
              <div
                key={sp.id}
                className={[styles.card, isSelected ? styles.cardActivePurple : ""].join(" ")}
                onClick={() => onChangeConfig({ ...config, sprintOption: sp.id })}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
              >
                <div className={styles.topBar}>
                  <div className={styles.iconWrap}>{sp.icon}</div>
                  {sp.badge && <span className={styles.cardBadge} style={{ color: "#A855F7", borderColor: "rgba(168,85,247,0.3)", background: "rgba(168,85,247,0.12)" }}>{sp.badge}</span>}
                </div>
                <h3 className={styles.cardTitle}>{isRtl ? sp.nameAr : sp.nameEn}</h3>
                <div className={styles.cardMetric}>
                  ⏱️ {sp.durationSec}s • {isRtl ? `العمليات: ${sp.operationsAr}` : `Ops: ${sp.operationsEn}`}
                </div>
                <p className={styles.cardDesc}>{isRtl ? sp.descAr : sp.descEn}</p>
                <div className={styles.selectIndicator}>
                  <span>{isSelected ? (isRtl ? "تم التحديد" : "Selected") : (isRtl ? "تحديد" : "Select")}</span>
                  <div className={[styles.radioCircle, isSelected ? styles.radioActive : ""].join(" ")}>
                    {isSelected && <div className={styles.radioInnerDot} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.actionFooter}>
          <button type="button" className={styles.continueBtn} onClick={onContinue} disabled={loading}>
            <span>{isVsComputer ? (isRtl ? "بدء السبرنت ⚡" : "Start Sprint ⚡") : (isRtl ? "المتابعة واختيار الرهان ›" : "Continue to Stake ›")}</span>
          </button>
        </div>
      </div>
    );
  }

  // 6. Series Format (XO, Connect Four)
  if (capability.setupType === "series_format" && capability.seriesOptions && capability.seriesOptions.length > 0) {
    const selectedSeries = config.seriesOption || capability.seriesOptions.find((s) => s.isDefault)?.id || capability.seriesOptions[0]?.id || "BEST_OF_3";
    return (
      <div className={styles.container} dir={dir}>
        {renderHeader(
          isRtl ? "اختر نظام السلسلة لـ" : "Select Series Format for",
          isRtl
            ? "نظام السلسلة (Best of) يضمن عدالة المنافسة الكاملة ويزيل أي تحيز لأفضلية النقلة الأولى."
            : "Multi-round series format eliminates first-move bias and ensures fair competitive victory.",
          isRtl ? "سلسلة جولات حاسمة" : "Competitive Match Series"
        )}

        <div className={styles.grid}>
          {capability.seriesOptions.map((so) => {
            const isSelected = selectedSeries === so.id;
            return (
              <div
                key={so.id}
                className={[styles.card, isSelected ? styles.cardActive : ""].join(" ")}
                onClick={() => onChangeConfig({ ...config, seriesOption: so.id })}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
              >
                <div className={styles.topBar}>
                  <div className={styles.iconWrap}>{so.icon}</div>
                  {so.badge && <span className={styles.cardBadge}>{so.badge}</span>}
                </div>
                <h3 className={styles.cardTitle}>{isRtl ? so.nameAr : so.nameEn}</h3>
                <div className={styles.cardMetric}>
                  🏆 {isRtl ? `الهدف: ${so.targetWins} انتصارات من أصل ${so.gamesCount}` : `Target: ${so.targetWins} wins out of ${so.gamesCount}`}
                </div>
                <p className={styles.cardDesc}>{isRtl ? so.descAr : so.descEn}</p>
                <div className={styles.selectIndicator}>
                  <span>{isSelected ? (isRtl ? "تم التحديد" : "Selected") : (isRtl ? "تحديد" : "Select")}</span>
                  <div className={[styles.radioCircle, isSelected ? styles.radioActive : ""].join(" ")}>
                    {isSelected && <div className={styles.radioInnerDot} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.actionFooter}>
          <button type="button" className={styles.continueBtn} onClick={onContinue} disabled={loading}>
            <span>{isVsComputer ? (isRtl ? "بدء المواجهة ⚔️" : "Start Match ⚔️") : (isRtl ? "المتابعة واختيار الرهان ›" : "Continue to Stake ›")}</span>
          </button>
        </div>
      </div>
    );
  }

  // 7. Canonical Direct (Checkers, Reversi, Gomoku, Seega)
  return (
    <div className={styles.container} dir={dir}>
      <div className={styles.canonicalCard}>
        <div className={styles.canonicalIcon}>{(plugin as any).icon || "🏆"}</div>
        <h2 className={styles.canonicalTitle}>{gameName}</h2>
        <p className={styles.canonicalDesc}>
          {isRtl ? capability.taglineAr : capability.taglineEn}
        </p>

        <div className={styles.featureList}>
          <span className={styles.featurePill}>⚖️ {isRtl ? "قواعد رسمية معتمدة دولياً" : "Official Sanctioned Rules"}</span>
          <span className={styles.featurePill}>🧠 {isRtl ? "مهارة واستراتيجية حتمية 100%" : "100% Deterministic Skill"}</span>
          <span className={styles.featurePill}>🛡️ {isRtl ? "تحكيم وحماية من الخادم" : "Server Authority Guaranteed"}</span>
        </div>

        <button type="button" className={styles.continueBtn} onClick={onContinue} disabled={loading}>
          <span>{isVsComputer ? (isRtl ? "بدء المواجهة ⚔️" : "Start Duel ⚔️") : (isRtl ? "المتابعة واختيار الرهان ›" : "Continue to Stake ›")}</span>
        </button>
      </div>
    </div>
  );
}
