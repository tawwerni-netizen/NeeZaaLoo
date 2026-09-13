"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get, post } from "@/lib/api";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
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

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="reacceptance-title">
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.icon} aria-hidden="true">📜</span>
          <h2 id="reacceptance-title" className={styles.title}>
            {t("legal.reacceptance_title")}
          </h2>
        </div>

        <p className={styles.body}>
          {t("legal.reacceptance_body")}
        </p>

        <ul className={styles.policyList}>
          {pending.map((p) => (
            <li key={p.identifier} className={styles.policyItem}>
              <span>{p.title}</span>
              <span className={styles.versionBadge}>v{p.version}</span>
            </li>
          ))}
        </ul>

        <div className={styles.notice}>
          <span>
            {t("authPopup.footnote")}{" "}
            <LocaleLink href="/help#terms">
              {t("legal.terms_link")}
            </LocaleLink>
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
