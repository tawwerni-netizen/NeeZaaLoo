"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "@/components/auth/error-messages";
import { post, ApiError } from "@/lib/api";
import type { CreateTicketResponse } from "@/lib/support-types";
import { TICKET_CATEGORIES, configFor } from "../../../../../../../packages/support/src/categories.mjs";
import styles from "../support.module.css";

export default function NewTicketPage() {
  return (
    <RequireAuth>
      <Header />
      <div className={styles.wrap}>
        <Suspense fallback={null}>
          <NewTicketForm />
        </Suspense>
      </div>
    </RequireAuth>
  );
}

function NewTicketForm() {
  const { t } = useI18n();
  const { locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  // A contextual entry point (e.g. "Report a problem with this match" on
  // the game page) may prefill both -- see the categories.mjs config for
  // which categories actually expect a referenceId.
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [referenceId, setReferenceId] = useState(searchParams.get("referenceId") ?? "");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateTicketId, setDuplicateTicketId] = useState<string | null>(null);

  const config = category ? configFor(category) : null;
  const needsReference = config?.referenceType != null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDuplicateTicketId(null);
    setSubmitting(true);
    try {
      const r = await post<CreateTicketResponse>("/v1/me/tickets", {
        category,
        subject,
        description: description || undefined,
        referenceId: needsReference ? referenceId : undefined,
      });
      router.push(`/${locale}/support/${r.ticketId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "DUPLICATE_OPEN_TICKET") {
        const detail = err.detail as { existingTicketId?: string } | undefined;
        setDuplicateTicketId(detail?.existingTicketId ?? null);
      }
      const code = err instanceof ApiError ? err.code : undefined;
      setError(t(authErrorKey(code ?? "GENERIC")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      <h1 className={styles.title}>{t("support.new.title")}</h1>

      <p className={styles.secretsWarning}>{t("support.new.secrets_warning")}</p>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {duplicateTicketId && (
        <p className={styles.notice}>
          {t("support.duplicate_notice")}{" "}
          <LocaleLink href={`/support/${duplicateTicketId}`}>{t("support.view_existing_cta")}</LocaleLink>
        </p>
      )}

      <div className={styles.field}>
        <label htmlFor="ticketCategory">{t("support.new.category_label")}</label>
        <select id="ticketCategory" value={category} onChange={(e) => setCategory(e.target.value)} required>
          <option value="" disabled>{t("support.new.category_placeholder")}</option>
          {TICKET_CATEGORIES.map((c: string) => (
            <option key={c} value={c}>{t(`support.categories.${c}`)}</option>
          ))}
        </select>
      </div>

      {needsReference && (
        <div className={styles.field}>
          <label htmlFor="ticketReference">{t("support.new.reference_id_label")}</label>
          <input
            id="ticketReference"
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            required
          />
          <p className={styles.hint}>{t("support.new.reference_id_hint")}</p>
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="ticketSubject">{t("support.new.subject_label")}</label>
        <input
          id="ticketSubject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("support.new.subject_placeholder")}
          maxLength={200}
          required
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="ticketDescription">{t("support.new.description_label")}</label>
        <textarea
          id="ticketDescription"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("support.new.description_placeholder")}
          maxLength={4000}
        />
      </div>

      <div className={styles.actions}>
        <Button type="submit" disabled={submitting || !category}>
          {submitting ? t("support.new.submitting") : t("support.new.submit_cta")}
        </Button>
        <LocaleLink href="/support">
          <Button type="button" variant="ghost">{t("support.new.cancel_cta")}</Button>
        </LocaleLink>
      </div>
    </form>
  );
}
