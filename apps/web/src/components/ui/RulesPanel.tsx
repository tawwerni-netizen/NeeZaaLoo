"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { GameRegistry } from "@/lib/games/registry";
import { RulesetRegistry, getRuleset } from "@nizalo/duel-engine/ruleset";
import { useI18n } from "@/lib/i18n/context";
import styles from "./RulesPanel.module.css";

export interface RulesPanelProps {
  open: boolean;
  gameSlug: string;
  variantSlug?: string;
  onClose: () => void;
}

export function RulesPanel({ open, gameSlug, variantSlug, onClose }: RulesPanelProps) {
  const { locale, dir } = useI18n();
  const isRtl = dir === "rtl" || locale === "ar";

  const [activeTab, setActiveTab] = useState<"overview" | "rules" | "timing" | "fairplay">("overview");

  const normalizedSlug = useMemo(() => gameSlug.replace(/-/g, "_"), [gameSlug]);
  const registryEntry = useMemo(() => {
    const reg = RulesetRegistry as Record<string, any>;
    return reg[normalizedSlug] || reg[gameSlug] || null;
  }, [normalizedSlug, gameSlug]);

  const availableVariants = useMemo(() => {
    if (!registryEntry?.variants) return [];
    return Object.values(registryEntry.variants) as any[];
  }, [registryEntry]);

  const [selectedVariant, setSelectedVariant] = useState<string>(
    variantSlug || registryEntry?.defaultVariant || (availableVariants[0]?.variant ?? "default")
  );

  useEffect(() => {
    if (variantSlug) {
      setSelectedVariant(variantSlug);
    } else if (registryEntry?.defaultVariant) {
      setSelectedVariant(registryEntry.defaultVariant);
    }
  }, [variantSlug, registryEntry]);

  const currentRuleset = useMemo(() => {
    try {
      return (getRuleset as any)(gameSlug, selectedVariant);
    } catch {
      return null;
    }
  }, [gameSlug, selectedVariant]);

  const fallbackGame = GameRegistry.get(gameSlug);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;
  if (!fallbackGame && !currentRuleset) return null;

  const displayName = isRtl
    ? currentRuleset?.nameAr || fallbackGame?.nameAr || currentRuleset?.name || fallbackGame?.name || gameSlug
    : currentRuleset?.name || fallbackGame?.name || gameSlug;

  const subtitleName = isRtl
    ? currentRuleset?.name || fallbackGame?.name || ""
    : currentRuleset?.nameAr || fallbackGame?.nameAr || "";

  const standard = isRtl
    ? currentRuleset?.sourceAr || currentRuleset?.source || fallbackGame?.rulesVersion?.standard || "القواعد الرسمية المعتمدة"
    : currentRuleset?.source || fallbackGame?.rulesVersion?.standard || fallbackGame?.rules?.governingStandard || "Official Rules";

  const version = currentRuleset?.version || fallbackGame?.rules?.version || "v1.0";
  const duration = isRtl
    ? fallbackGame?.typicalDurationAr || fallbackGame?.durationMinutes || "5-10 دقيقة"
    : fallbackGame?.durationMinutes || fallbackGame?.typicalDuration || "5-10 min";

  const playerMode = isRtl
    ? fallbackGame?.playerModeDisplayAr || "مواجهة 1 ضد 1"
    : fallbackGame?.playerMode || fallbackGame?.playerModeDisplay || "1v1 Head-to-Head";

  const isCash = currentRuleset?.cashEligible ?? fallbackGame?.stakeEligibility?.isCashEligible ?? true;
  const isTourney = currentRuleset?.tournamentEligible ?? true;

  const doc = currentRuleset?.rulesDocument;
  const rngPolicy = doc?.rngPolicy || (fallbackGame?.rules?.hasRng ? "CSPRNG" : "DETERMINISTIC");
  
  const rngDesc = isRtl
    ? doc?.rngDescriptionAr || (fallbackGame?.rules?.hasRng ? "عشوائية خوارزمية مشفرة CSPRNG تضمن عدالة النرد والأحجار بنسبة 100%." : "مهارة ذهنية مطلقة 100%. بدون حظ أو بطاقات أو نرد.")
    : doc?.rngDescription || (fallbackGame?.rules?.hasRng ? "Cryptographically verifiable server RNG seeds ensure 100% fair tile/dice outcomes." : "100% pure skill. No dice, no cards, no chance mechanics.");

  const movesText = isRtl
    ? doc?.legalMovesAr || "جميع الحركات والالتقاطات تخضع للتحقق الإلزامي من محرك نيزالو السحابي."
    : doc?.legalMoves || doc?.movementAndCapture || "All moves strictly validated server-side by the Nizalo duel engine.";

  const content = (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={isRtl ? `لوائح وقواعد ${displayName}` : `${displayName} Rules & Regulations`}
      dir={dir}
      lang={locale}
    >
      <div className={styles.panel} dir={dir}>
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <span className={styles.gameIcon} aria-hidden="true">
              {fallbackGame?.icon || "🎮"}
            </span>
            <div>
              <h2 className={styles.title}>{displayName}</h2>
              <p className={styles.subtitle}>
                {subtitleName ? `${subtitleName} • ` : ""}
                {standard} ({version})
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={isRtl ? "إغلاق لوحة القوانين" : "Close rules panel"}
          >
            ×
          </button>
        </div>

        {availableVariants.length > 1 && (
          <div className={styles.variantSelector}>
            <span className={styles.variantLabel}>
              {isRtl ? "النمط المختار:" : "Variant:"}
            </span>
            {availableVariants.map((v) => (
              <button
                key={v.variant}
                type="button"
                className={[styles.variantChip, selectedVariant === v.variant ? styles.variantChipActive : ""].join(" ")}
                onClick={() => setSelectedVariant(v.variant)}
              >
                {isRtl ? v.nameAr || v.name : v.name}
              </button>
            ))}
          </div>
        )}

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            className={[styles.tab, activeTab === "overview" ? styles.tabActive : ""].join(" ")}
            onClick={() => setActiveTab("overview")}
            role="tab"
            aria-selected={activeTab === "overview"}
          >
            {isRtl ? "📖 نظرة عامة" : "📖 Overview"}
          </button>
          <button
            type="button"
            className={[styles.tab, activeTab === "rules" ? styles.tabActive : ""].join(" ")}
            onClick={() => setActiveTab("rules")}
            role="tab"
            aria-selected={activeTab === "rules"}
          >
            {isRtl ? "♟️ القواعد والحركات" : "♟️ Rules & Moves"}
          </button>
          <button
            type="button"
            className={[styles.tab, activeTab === "timing" ? styles.tabActive : ""].join(" ")}
            onClick={() => setActiveTab("timing")}
            role="tab"
            aria-selected={activeTab === "timing"}
          >
            {isRtl ? "⏱️ التوقيت والأدوار" : "⏱️ Timing & Turns"}
          </button>
          <button
            type="button"
            className={[styles.tab, activeTab === "fairplay" ? styles.tabActive : ""].join(" ")}
            onClick={() => setActiveTab("fairplay")}
            role="tab"
            aria-selected={activeTab === "fairplay"}
          >
            {isRtl ? "🛡️ اللعب النظيف" : "🛡️ Fair Play"}
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === "overview" && (
            <>
              <div className={styles.ruleCard}>
                <h3 className={styles.ruleCardTitle}>
                  {isRtl ? "الهدف واللوائح المنظمة" : "Objective & Governance"}
                </h3>
                <p className={styles.ruleCardText}>
                  {isRtl
                    ? doc?.overviewAr || fallbackGame?.shortDescriptionAr || doc?.overview || fallbackGame?.shortDescription
                    : doc?.overview || fallbackGame?.shortDescription}
                </p>
                <p className={styles.ruleCardText} style={{ marginTop: "6px", opacity: 0.85 }}>
                  {isRtl ? (
                    <>معتمد وفقاً للوائح <strong>{standard}</strong>. إصدار المحرك المعتمد {currentRuleset?.engineVersion ?? 1} (ساري منذ {currentRuleset?.effectiveDate ?? "2024"}).</>
                  ) : (
                    <>Governed by <strong>{standard}</strong>. Sanctioned engine version {currentRuleset?.engineVersion ?? 1} (Effective {currentRuleset?.effectiveDate ?? "2024"}).</>
                  )}
                </p>
              </div>

              {currentRuleset?.boardDefinition && (
                <div className={styles.ruleCard}>
                  <h3 className={styles.ruleCardTitle}>
                    {isRtl ? "الرقعة والتجهيز الابتدائي" : "Board & Setup"}
                  </h3>
                  <p className={styles.ruleCardText}>
                    <strong>{isRtl ? "نوع الرقعة:" : "Format:"}</strong> {currentRuleset.boardDefinition.type}
                    {currentRuleset.boardDefinition.dimensions ? ` (${currentRuleset.boardDefinition.dimensions.join("×")})` : ""}
                  </p>
                  <p className={styles.ruleCardText}>
                    {isRtl
                      ? currentRuleset.boardDefinition.setupDescriptionAr || currentRuleset.boardDefinition.setupDescription
                      : currentRuleset.boardDefinition.setupDescription}
                  </p>
                </div>
              )}

              <div className={styles.ruleCard}>
                <h3 className={styles.ruleCardTitle}>
                  {isRtl ? "محددات المواجهة والاعتماد" : "Match Parameters & Certification"}
                </h3>
                <div className={styles.badgeList}>
                  <span className={styles.badge}>⏱️ {duration}</span>
                  <span className={styles.badge}>👥 {playerMode}</span>
                  <span className={styles.badge}>
                    🔄 {currentRuleset?.turnModel === "SIMULTANEOUS"
                      ? (isRtl ? "أدوار متزامنة لحظية" : "Simultaneous Moves")
                      : (isRtl ? "أدوار متبادلة" : "Alternating Turns")}
                  </span>
                  <span className={styles.badge}>
                    {isCash
                      ? (isRtl ? "💰 معتمد للجوائز النقدية" : "💰 Certified Cash Eligible")
                      : (isRtl ? "🎮 تدريب مجاني فقط" : "🎮 Free Practice Only")}
                  </span>
                  {isTourney && (
                    <span className={styles.badge}>
                      {isRtl ? "🏆 معتمد للمنافسات الكبرى" : "🏆 Tournament Sanctioned"}
                    </span>
                  )}
                  <span className={styles.badge}>
                    {isRtl
                      ? `🎲 نظام الحظ: ${rngPolicy === "DETERMINISTIC" ? "حتمي (مهارة نقية)" : "عشوائي مشفر CSPRNG"}`
                      : `🎲 RNG: ${rngPolicy}`}
                  </span>
                </div>
              </div>
            </>
          )}

          {activeTab === "rules" && (
            <>
              <div className={styles.ruleCard}>
                <h3 className={styles.ruleCardTitle}>
                  {isRtl ? "الحركات القانونية والالتقاط" : "Legal Moves & Movement"}
                </h3>
                <p className={styles.ruleCardText}>{movesText}</p>
                
                {(doc?.scoring || doc?.scoringAr) && (
                  <div style={{ marginTop: "10px" }}>
                    <h4 className={styles.ruleCardTitle} style={{ fontSize: "12px", marginBottom: "4px" }}>
                      {isRtl ? "قواعد احتساب النقاط" : "Scoring Rules"}
                    </h4>
                    <p className={styles.ruleCardText}>{isRtl ? doc.scoringAr || doc.scoring : doc.scoring}</p>
                  </div>
                )}
                
                {(doc?.passRule || doc?.passRuleAr) && (
                  <div style={{ marginTop: "10px" }}>
                    <h4 className={styles.ruleCardTitle} style={{ fontSize: "12px", marginBottom: "4px" }}>
                      {isRtl ? "قاعدة التمرير" : "Pass Rule"}
                    </h4>
                    <p className={styles.ruleCardText}>{isRtl ? doc.passRuleAr || doc.passRule : doc.passRule}</p>
                  </div>
                )}
                
                {(doc?.forcedPass || doc?.forcedPassAr) && (
                  <div style={{ marginTop: "10px" }}>
                    <h4 className={styles.ruleCardTitle} style={{ fontSize: "12px", marginBottom: "4px" }}>
                      {isRtl ? "التمرير الإجباري" : "Forced Pass"}
                    </h4>
                    <p className={styles.ruleCardText}>{isRtl ? doc.forcedPassAr || doc.forcedPass : doc.forcedPass}</p>
                  </div>
                )}
                
                {(doc?.sanctuaryRule || doc?.sanctuaryRuleAr) && (
                  <div style={{ marginTop: "10px" }}>
                    <h4 className={styles.ruleCardTitle} style={{ fontSize: "12px", marginBottom: "4px" }}>
                      {isRtl ? "قاعدة الأمان (الحصون)" : "Sanctuary Rule"}
                    </h4>
                    <p className={styles.ruleCardText}>{isRtl ? doc.sanctuaryRuleAr || doc.sanctuaryRule : doc.sanctuaryRule}</p>
                  </div>
                )}
                
                {(doc?.specialRules || doc?.specialRulesAr) && (
                  <div style={{ marginTop: "10px" }}>
                    <h4 className={styles.ruleCardTitle} style={{ fontSize: "12px", marginBottom: "4px" }}>
                      {isRtl ? "قواعد خاصة واستثنائية" : "Special Rules"}
                    </h4>
                    <p className={styles.ruleCardText}>{isRtl ? doc.specialRulesAr || doc.specialRules : doc.specialRules}</p>
                  </div>
                )}
              </div>

              {((isRtl && doc?.winConditionsAr?.length) || (doc?.winConditions && doc.winConditions.length > 0)) && (
                <div className={styles.ruleCard}>
                  <h3 className={styles.ruleCardTitle}>
                    {isRtl ? "شروط الفوز والانتصار" : "Victory Conditions"}
                  </h3>
                  <ul className={styles.bulletList}>
                    {(isRtl && doc?.winConditionsAr?.length ? doc.winConditionsAr : (doc?.winConditions || [])).map((cond: string, i: number) => (
                      <li key={i} className={styles.bulletItem}>✓ {cond}</li>
                    ))}
                  </ul>
                </div>
              )}

              {((isRtl && doc?.drawConditionsAr?.length) || (doc?.drawConditions && doc.drawConditions.length > 0)) && (
                <div className={styles.ruleCard}>
                  <h3 className={styles.ruleCardTitle}>
                    {isRtl ? "شروط التعادل الرسمية" : "Draw Conditions"}
                  </h3>
                  <ul className={styles.bulletList}>
                    {(isRtl && doc?.drawConditionsAr?.length ? doc.drawConditionsAr : (doc?.drawConditions || [])).map((cond: string, i: number) => (
                      <li key={i} className={styles.bulletItem}>= {cond}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {activeTab === "timing" && (
            <div className={styles.ruleCard}>
              <h3 className={styles.ruleCardTitle}>
                {isRtl ? "الساعة الرسمية وحدود الأدوار" : "Official Clock & Turn Limits"}
              </h3>
              <p className={styles.ruleCardText}>
                {isRtl
                  ? "• تُدار المباريات بنظام توقيت رسمي صارم معتمد دولياً مع عداد ثواني دقيق يدار مركزياً من الخادم."
                  : "• Matches run with official FIDE / tournament-grade server-authoritative countdown clocks."}
              </p>
              {currentRuleset?.timeControls && (
                <p className={styles.ruleCardText}>
                  {isRtl ? (
                    <>
                      • نظام الوقت الافتراضي: <strong>{currentRuleset.timeControls.defaultProfile}</strong>.
                      {currentRuleset.timeControls.allowedProfiles?.length > 1 && (
                        <span> الخيارات المتاحة: {currentRuleset.timeControls.allowedProfiles.join("، ")}.</span>
                      )}
                    </>
                  ) : (
                    <>
                      • Default time control: <strong>{currentRuleset.timeControls.defaultProfile}</strong>.
                      {currentRuleset.timeControls.allowedProfiles?.length > 1 && (
                        <span> Allowed profiles: {currentRuleset.timeControls.allowedProfiles.join(", ")}.</span>
                      )}
                    </>
                  )}
                </p>
              )}
              <p className={styles.ruleCardText}>
                {isRtl
                  ? "• سقوط الوقت (Flag Fall): عند وصول ساعتك إلى الصفر، تخسر المباراة فوراً وبشكل تلقائي."
                  : "• Flag Fall: If your clock reaches zero, you flag out and forfeit the match immediately."}
              </p>
              <p className={styles.ruleCardText}>
                {isRtl
                  ? "• مهلة انقطاع الاتصال: يُمنح اللاعب مهلة 30 ثانية لإعادة الاتصال قبل إعلان انسحابه."
                  : "• Disconnection grace period: 30 seconds to reconnect before forfeiting the match."}
              </p>
            </div>
          )}

          {activeTab === "fairplay" && (
            <div className={styles.ruleCard}>
              <h3 className={styles.ruleCardTitle}>
                {isRtl ? "ميثاق اللعب النظيف والنزاهة" : "Fair Play & Integrity Policy"}
              </h3>
              <p className={styles.ruleCardText}>
                {isRtl ? (
                  <>
                    • <strong>حظر تام للمساعدات الخارجية:</strong> يمنع منعاً باتاً استخدام أي محركات شطرنج أو أدوات ذكاء اصطناعي أو برامج مساعدة أثناء اللعب المصنف والمالي. تخضع جميع المباريات لتحليل سلوكي وزمني دقيق لكشف أي تلاعب.
                  </>
                ) : (
                  <>
                    • <strong>Zero Assistance:</strong> Zero external chess/game engine or AI assistance permitted during rated and cash play. Matches are subjected to automated behavioral, blunder-correlation, and move-timing analysis.
                  </>
                )}
              </p>
              <p className={styles.ruleCardText}>
                {isRtl ? (
                  <>
                    • <strong>السلطة التامة للخادم (Server Authority):</strong> كافة مدخلات اللاعبين هي مجرد نوايا لحركات؛ يتم التحقق من صحة جميع النقلات والالتقاطات والنتائج وتطبيقها حصرياً على خوادم نيزالو.
                  </>
                ) : (
                  <>
                    • <strong>Server Authority:</strong> Client inputs are pure intents; all moves, captures, turns, and outcomes are validated and resolved strictly server-side.
                  </>
                )}
              </p>
              <p className={styles.ruleCardText}>
                {isRtl ? (
                  <>
                    • <strong>نموذج العشوائية والنزاهة:</strong> {rngDesc}
                  </>
                ) : (
                  <>
                    • <strong>RNG Model:</strong> {rngDesc}
                  </>
                )}
              </p>
              <p className={styles.ruleCardText}>
                {isRtl ? (
                  <>
                    • <strong>سجل تدقيق غير قابل للتلاعب (Audit Ledger):</strong> تسجل كل حركة داخل تسلسل أحداث تسلسلي مع تشفير حالة الرقعة بتجزئة SHA-256 للتحقق الفوري والتحكيم العادل في أي نزاع.
                  </>
                ) : (
                  <>
                    • <strong>Immutable Replay Ledger:</strong> Every move is recorded in an append-only event stream with SHA-256 state hashing for instant verification and dispute auditability.
                  </>
                )}
              </p>
              {(doc?.fairPlay || doc?.fairPlayAr) && (
                <p className={styles.ruleCardText}>
                  {isRtl ? (
                    <>
                      • <strong>ضمان المحرك:</strong> {doc.fairPlayAr || doc.fairPlay}
                    </>
                  ) : (
                    <>
                      • <strong>Engine Guarantee:</strong> {doc.fairPlay}
                    </>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof window === "undefined") return null;
  return createPortal(content, document.body);
}
