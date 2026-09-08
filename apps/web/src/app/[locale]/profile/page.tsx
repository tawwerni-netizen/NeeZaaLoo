"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/profile/Avatar";
import { badgeIcon } from "@/components/profile/badge-icons";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "@/components/auth/error-messages";
import { get, patch, post, ApiError } from "@/lib/api";
import type { PublicProfile } from "@/lib/profile-types";
import styles from "./profile.module.css";
import formStyles from "@/components/auth/AuthForm.module.css";

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  );
}

function ProfileContent() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function reload() {
    setProfile(await get<PublicProfile>("/v1/me/profile"));
  }

  useEffect(() => { void reload(); }, []);

  async function onAvatarSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const imageBase64 = await fileToBase64(file);
      await post("/v1/me/profile/avatar", { imageBase64 });
      await reload();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(t(authErrorKey(code ?? "GENERIC")));
    } finally {
      setUploading(false);
    }
  }

  if (!profile) return <><Header /><div className={styles.wrap} /></>;

  return (
    <>
      <Header />
      <div className={styles.wrap}>
        {message && <p className={formStyles.subtitle} role="status">{message}</p>}
        {error && <p className={formStyles.error} role="alert">{error}</p>}

        <div className={styles.header}>
          <div>
            <Avatar nickname={profile.nickname} avatarUrl={profile.avatarUrl} size={88} />
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void onAvatarSelected(e)} />
            <Button variant="ghost" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? t("profile.uploading_avatar") : t("profile.change_avatar_cta")}
            </Button>
          </div>

          <div className={styles.identity}>
            <h1 className={styles.nickname}>
              {profile.nickname} {profile.selectedBadge && <span>{badgeIcon(profile.selectedBadge)}</span>}
            </h1>
            <div className={styles.levelRow}>
              <span>{t("profile.level_label")} {profile.exp.level}</span>
              <span>{t("profile.exp_label")} {profile.exp.totalExp}</span>
              {profile.globalSkill != null && <span>{t("profile.global_skill_label")} {profile.globalSkill}</span>}
            </div>
            <div className={styles.expBar}>
              <div
                className={styles.expBarFill}
                style={{ width: `${Math.min(100, (profile.exp.expIntoLevel / (profile.exp.nextLevelFloor - profile.exp.currentLevelFloor || 1)) * 100)}%` }}
              />
            </div>
          </div>

          <Button variant="secondary" className={styles.editButton} onClick={() => setEditing((v) => !v)}>
            {t("profile.edit_cta")}
          </Button>
        </div>

        {editing && (
          <EditProfilePanel
            profile={profile}
            onDone={async () => { setEditing(false); setMessage(t("profile.saved_message")); await reload(); }}
            onCancel={() => setEditing(false)}
          />
        )}

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("profile.bio_label")}</h2>
          <p className={profile.bio ? styles.bio : styles.empty}>{profile.bio || t("profile.no_bio")}</p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("profile.ratings_title")}</h2>
          {profile.ratings.length === 0 ? (
            <p className={styles.empty}>{t("profile.no_ratings")}</p>
          ) : (
            profile.ratings.map((r) => (
              <div key={r.gameId} className={styles.ratingRow}>
                <span>{r.displayName}</span>
                <span className={`nz-num ${styles.ratingValue}`}>{Math.round(r.rating)}</span>
              </div>
            ))
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("profile.stats_title")}</h2>
          <div className={styles.statsGrid}>
            <div><div className={`nz-num ${styles.statValue}`}>{profile.stats.games}</div><div className={styles.statLabel}>{t("profile.games_label")}</div></div>
            <div><div className={`nz-num ${styles.statValue}`}>{profile.stats.wins}</div><div className={styles.statLabel}>{t("profile.wins_label")}</div></div>
            <div><div className={`nz-num ${styles.statValue}`}>{profile.stats.losses}</div><div className={styles.statLabel}>{t("profile.losses_label")}</div></div>
            <div><div className={`nz-num ${styles.statValue}`}>{winRate(profile.stats)}</div><div className={styles.statLabel}>{t("profile.win_rate_label")}</div></div>
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("profile.achievements_title")}</h2>
          {profile.achievements.length === 0 ? (
            <p className={styles.empty}>{t("profile.no_achievements")}</p>
          ) : (
            <div className={styles.achievementList}>
              {profile.achievements.map((code) => (
                <span key={code} className={styles.achievementPill}>{t(`profile.achievements_catalog.${code}`)}</span>
              ))}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("profile.badges_title")}</h2>
          {profile.badges.length === 0 ? (
            <p className={styles.empty}>{t("profile.no_badges")}</p>
          ) : (
            <div className={styles.badgeRow}>
              {profile.badges.map((b) => <span key={b.code} title={t(`profile.achievements_catalog.${b.code}`)}>{badgeIcon(b.code)}</span>)}
            </div>
          )}
        </div>

        <p className={styles.memberSince}>
          {t("profile.member_since_label")} {new Date(profile.memberSince).toLocaleDateString()}
        </p>
      </div>
    </>
  );
}

function winRate(stats: PublicProfile["stats"]): string {
  if (stats.games === 0) return "—";
  return `${Math.round((stats.wins / stats.games) * 100)}%`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function EditProfilePanel({ profile, onDone, onCancel }: { profile: PublicProfile; onDone: () => Promise<void>; onCancel: () => void }) {
  const { t } = useI18n();
  const [nickname, setNickname] = useState(profile.nickname);
  const [bio, setBio] = useState(profile.bio);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await patch("/v1/me/profile", { nickname, bio });
      await onDone();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(t(authErrorKey(code ?? "GENERIC")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      {error && <p className={formStyles.error} role="alert">{error}</p>}
      <div className={formStyles.field}>
        <label htmlFor="nickname">{t("profile.nickname_label")}</label>
        <input id="nickname" minLength={3} maxLength={24} value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </div>
      <div className={formStyles.field}>
        <label htmlFor="bio">{t("profile.bio_label")}</label>
        <textarea id="bio" maxLength={280} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: "var(--nz-space-3)" }}>
        <Button type="submit" disabled={submitting}>{submitting ? t("profile.saving") : t("profile.save_cta")}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{t("profile.cancel_cta")}</Button>
      </div>
    </form>
  );
}
