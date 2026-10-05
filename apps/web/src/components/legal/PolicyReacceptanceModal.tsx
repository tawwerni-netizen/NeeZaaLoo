"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get, post } from "@/lib/api";
import { Button } from "@/components/Button";
import { getPolicyDetail } from "@/lib/legal/policies-data";
import styles from "./PolicyReacceptanceModal.module.css";

type PendingPolicy = {
  identifier: string;
  version: string;
  title: string;
  isMandatory: boolean;
};

type ConsentStatusResponse = {
  ok: boolean;
  allAccepted: boolean;
  pending: PendingPolicy[];
};

export function PolicyReacceptanceModal() {
  const { player } = useAuth();
  const { t, locale } = useI18n();
  const [pending, setPending] = useState<PendingPolicy[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [readingPolicyId, setReadingPolicyId] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  const checkStatus = useCallback(async () => {
    if (!player) {
      setPending([]);
      return;
    }
    try {
      const res = await get<ConsentStatusResponse>("/v1/me/consent/status");
      if (res && res.allAccepted === false && res.pending && res.pending.length > 0) {
        setPending(res.pending);
      } else {
        setPending([]);
      }
    } catch {
      // Ignored if unauthenticated or endpoint unavailable
    }
  }, [player]);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const activePolicyDetail = useMemo(() => {
    if (!readingPolicyId) return null;
    return getPolicyDetail(readingPolicyId, locale);
  }, [readingPolicyId, locale]);

  if (pending.length === 0) return null;

  async function handleAcceptAll() {
    setSubmitting(true);
    try {
      for (const p of pending) {
        await post("/v1/me/consent/accept", {
          policyIdentifier: p.identifier,
          policyVersion: p.version,
          locale,
        });
      }
      await checkStatus();
    } catch {
      // Retryable on network failure
    } finally {
      setSubmitting(false);
    }
  }

  // If reading a specific policy, render the In-Modal Policy Reader
  if (readingPolicyId && activePolicyDetail) {
    const currentIndex = pending.findIndex((p) => p.identifier === readingPolicyId);
    const nextPolicy = currentIndex >= 0 && currentIndex < pending.length - 1 ? pending[currentIndex + 1] : null;

    return (
      <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="policy-reader-title">
        <div className={`${styles.modal} ${styles.readerModal}`}>
          {/* Reader Top Bar */}
          <div className={styles.readerTopBar}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => setReadingPolicyId(null)}
            >
              <span>{locale === "ar" ? "← العودة لقائمة الشروط" : "← Back to Policies"}</span>
            </button>

            <a
              href={`/${locale}/help#${readingPolicyId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              <span>{locale === "ar" ? "فتح في صفحة مستقلة" : "Open in new tab"}</span>
              <span>↗</span>
            </a>
          </div>

          {/* Document Header */}
          <div className={styles.readerDocHeader}>
            <span className={styles.readerDocIcon} aria-hidden="true">{activePolicyDetail.icon}</span>
            <div className={styles.readerDocInfo}>
              <h2 id="policy-reader-title" className={styles.readerDocTitle}>
                {activePolicyDetail.title}
              </h2>
              <div className={styles.readerDocMeta}>
                <span className={styles.categoryBadge}>{activePolicyDetail.category}</span>
                <span className={styles.versionBadge}>v{activePolicyDetail.version}</span>
                <span className={styles.dateBadge}>
                  {locale === "ar" ? "تاريخ السريان:" : "Effective:"} {activePolicyDetail.lastUpdated}
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable Policy Content */}
          <div className={styles.readerBody}>
            {activePolicyDetail.summary && (
              <div className={styles.readerSummary}>
                <div className={styles.summaryTitle}>
                  <span>💡</span>
                  <span>{locale === "ar" ? "ملخص الوثيقة:" : "Summary:"}</span>
                </div>
                <p>{activePolicyDetail.summary}</p>
              </div>
            )}

            {activePolicyDetail.sections.map((sec, idx) => (
              <article key={idx} className={styles.readerSection}>
                <h3 className={styles.readerSectionTitle}>{sec.title}</h3>
                {sec.content.map((p, pIdx) => (
                  <p key={pIdx} className={styles.readerParagraph}>{p}</p>
                ))}
                {sec.callout && (
                  <div className={styles.readerCallout}>
                    <span>⚠️ {sec.callout}</span>
                  </div>
                )}
              </article>
            ))}
          </div>

          {/* Reader Footer Controls */}
          <div className={styles.readerFooter}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setReviewedIds((prev) => new Set(prev).add(readingPolicyId));
                setReadingPolicyId(null);
              }}
            >
              {locale === "ar" ? "✓ تمت المراجعة — العودة" : "✓ Done Reading — Back"}
            </Button>

            {nextPolicy ? (
              <Button
                type="button"
                className={styles.nextBtn}
                onClick={() => {
                  setReviewedIds((prev) => new Set(prev).add(readingPolicyId));
                  setReadingPolicyId(nextPolicy.identifier);
                }}
              >
                <span>{locale === "ar" ? "الوثيقة التالية:" : "Next Policy:"}</span>{" "}
                <span>{getPolicyDetail(nextPolicy.identifier, locale)?.title ?? nextPolicy.title}</span>{" "}
                <span>→</span>
              </Button>
            ) : (
              <Button
                type="button"
                className={styles.submitBtn}
                onClick={() => void handleAcceptAll()}
                disabled={submitting}
              >
                {submitting ? t("auth.register.submitting") : t("legal.accept_button")}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default: Policies Acceptance Checklist Modal
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="reacceptance-title">
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.icon} aria-hidden="true">📜</span>
          <div>
            <h2 id="reacceptance-title" className={styles.title}>
              {t("legal.reacceptance_title")}
            </h2>
            <p className={styles.body}>
              {t("legal.reacceptance_body")}
            </p>
          </div>
        </div>

        <div className={styles.interactiveHint}>
          <span className={styles.hintIcon}>💡</span>
          <span>
            {locale === "ar"
              ? "اضغط على أي بند أدناه لقراءة الشروط والبنود كاملة قبل الموافقة:"
              : "Click on any policy below to read its full terms and conditions:"}
          </span>
        </div>

        <ul className={styles.policyList}>
          {pending.map((p) => {
            const detail = getPolicyDetail(p.identifier, locale);
            const title = detail?.title ?? p.title;
            const icon = detail?.icon ?? "📜";
            const category = detail?.category ?? "";
            const isReviewed = reviewedIds.has(p.identifier);

            return (
              <li key={p.identifier}>
                <button
                  type="button"
                  className={`${styles.policyButton} ${isReviewed ? styles.policyButtonReviewed : ""}`}
                  onClick={() => {
                    setReviewedIds((prev) => new Set(prev).add(p.identifier));
                    setReadingPolicyId(p.identifier);
                  }}
                  title={locale === "ar" ? `قراءة وثيقة: ${title}` : `Read: ${title}`}
                >
                  <div className={styles.policyButtonLeft}>
                    <span className={styles.policyIcon} aria-hidden="true">{icon}</span>
                    <div className={styles.policyTextGroup}>
                      <span className={styles.policyTitle}>{title}</span>
                      {category && <span className={styles.policyCategory}>{category}</span>}
                    </div>
                  </div>

                  <div className={styles.policyButtonRight}>
                    <span className={styles.versionBadge}>v{p.version}</span>
                    {isReviewed ? (
                      <span className={styles.readBadge}>
                        <span>✓</span>
                        <span>{locale === "ar" ? "تمت المراجعة" : "Reviewed"}</span>
                      </span>
                    ) : (
                      <span className={styles.readCta}>
                        <span>{locale === "ar" ? "قراءة البنود" : "Read"}</span>
                        <span>↗</span>
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className={styles.notice}>
          <span>
            {t("authPopup.footnote")}{" "}
            <button
              type="button"
              className={styles.termsInlineLink}
              onClick={() => {
                setReviewedIds((prev) => new Set(prev).add("terms_of_service"));
                setReadingPolicyId("terms_of_service");
              }}
            >
              {t("legal.terms_link")}
            </button>
          </span>
        </div>

        <div className={styles.actions}>
          <Button
            type="button"
            className={styles.submitBtn}
            onClick={() => void handleAcceptAll()}
            disabled={submitting}
          >
            {submitting ? t("auth.register.submitting") : t("legal.accept_button")}
          </Button>
        </div>
      </div>
    </div>
  );
}
