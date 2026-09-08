"use client";

/**
 * The one place a player names WHO they want to play, by nickname.
 * Deliberately just a form -- it knows nothing about challenges, duels, or
 * the API; FriendChallenge.tsx owns what happens on submit. Kept separate
 * so a future "spectate a friend" or "invite to a lobby" flow can reuse the
 * same nickname-entry primitive without pulling in challenge logic.
 */
import { useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { useI18n } from "@/lib/i18n/context";
import styles from "./OpponentSelect.module.css";

export function OpponentSelect({ onSubmit, busy }: {
  onSubmit: (nickname: string) => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const [nickname, setNickname] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.label} htmlFor="opponent-nickname">{t("play.challenge.nickname_label")}</label>
      <div className={styles.row}>
        <input
          id="opponent-nickname"
          className={styles.input}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={t("play.challenge.nickname_placeholder")}
          disabled={busy}
        />
        <Button type="submit" variant="primary" disabled={busy || !nickname.trim()}>
          {busy ? t("play.challenge.sending") : t("play.challenge.send")}
        </Button>
      </div>
    </form>
  );
}
