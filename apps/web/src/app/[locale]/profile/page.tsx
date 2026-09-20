"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { Avatar } from "@/components/profile/Avatar";
import { badgeIcon } from "@/components/profile/badge-icons";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "@/components/auth/error-messages";
import { get, patch, post, ApiError } from "@/lib/api";
import type { PublicProfile } from "@/lib/profile-types";
import { ImageCropperModal } from "@/components/profile/ImageCropperModal";
import styles from "./profile.module.css";
import formStyles from "@/components/auth/AuthForm.module.css";

const GAME_ICONS: Record<string, string> = {
  chess: "♟️",
  dominoes: "🀄",
  backgammon: "🎲",
  baloot: "♠️",
  tarneeb: "🃏",
  carrom: "🎯",
  billiards: "🎱",
  hand: "🎴",
  ludo: "🎲",
};

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  );
}

function ProfileContent() {
  const { t, locale } = useI18n();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropperImage, setCropperImage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function reload() {
    setProfile(await get<PublicProfile>("/v1/me/profile"));
  }

  useEffect(() => { void reload(); }, []);

  function onAvatarSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      setCropperImage(String(reader.result));
    };
    reader.readAsDataURL(file);
  }

  async function handleCropComplete(imageBase64: string) {
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      await post("/v1/me/profile/avatar", { imageBase64 });
      setCropperImage(null);
      await reload();
      setMessage(locale === "ar" ? "تم تحديث صورة ملفك الشخصي بنجاح!" : "Profile picture updated successfully!");
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(t(authErrorKey(code ?? "GENERIC")));
    } finally {
      setUploading(false);
    }
  }

  async function selectFrame(code: string | null) {
    await post("/v1/me/frame", { code });
    await reload();
  }

  if (!profile) return <><Header /><div className={styles.wrap} /><Footer /></>;

  const expPercent = Math.min(
    100,
    Math.round(
      (profile.exp.expIntoLevel /
        (profile.exp.nextLevelFloor - profile.exp.currentLevelFloor || 1)) *
        100
    )
  );

  return (
    <>
      <Header />
      <div className={styles.wrap}>
        {message && <div className={styles.statusAlert} role="status">{message}</div>}
        {error && <div className={styles.errorAlert} role="alert">{error}</div>}

        {/* Hero Gamer Profile Card */}
        <div className={styles.header}>
          <div className={styles.avatarArea}>
            <span className={`${styles.avatarFrame} ${profile.selectedFrame ? styles[`frame_${profile.selectedFrame}`] ?? "" : ""}`}>
              <Avatar nickname={profile.nickname} avatarUrl={profile.avatarUrl} size={96} />
            </span>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => void onAvatarSelected(e)}
            />
            <button
              type="button"
              className={styles.changeAvatarBtn}
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              📷 {uploading ? t("profile.uploading_avatar") : t("profile.change_avatar_cta")}
            </button>
          </div>

          <div className={styles.identity}>
            <h1 className={styles.nickname}>
              {profile.nickname}
              {profile.clanTag && <span className={styles.clanTag}>[{profile.clanTag}]</span>}
              {profile.selectedBadge && (
                <span className={styles.badgeIconWrapper} title={t(`profile.achievements_catalog.${profile.selectedBadge}`)}>
                  {badgeIcon(profile.selectedBadge)}
                </span>
              )}
            </h1>

            <div className={styles.levelRow}>
              <span className={styles.levelTag}>
                🏆 {t("profile.level_label")} {profile.exp.level}
              </span>
              {profile.globalSkill != null && (
                <span className={styles.skillTag}>
                  ⚡ {t("profile.global_skill_label")}: {profile.globalSkill}
                </span>
              )}
              <span className={styles.expTag}>
                ⭐ {profile.exp.totalExp} {t("profile.exp_label")}
              </span>
            </div>

            <div className={styles.expContainer}>
              <div className={styles.expLabels}>
                <span>{locale === "ar" ? "التقدم للمستوى القادم" : "Next Level Progress"}</span>
                <span>{profile.exp.expIntoLevel} / {profile.exp.nextLevelFloor - profile.exp.currentLevelFloor} ({expPercent}%)</span>
              </div>
              <div className={styles.expBar}>
                <div className={styles.expBarFill} style={{ width: `${expPercent}%` }} />
              </div>
            </div>
          </div>

          <Button
            variant="secondary"
            className={styles.editButton}
            onClick={() => setEditing((v) => !v)}
          >
            ✏️ {t("profile.edit_cta")}
          </Button>
        </div>

        {/* Inline Edit Form */}
        {editing && (
          <EditProfilePanel
            profile={profile}
            onDone={async () => {
              setEditing(false);
              setMessage(t("profile.saved_message"));
              await reload();
            }}
            onCancel={() => setEditing(false)}
          />
        )}

        {/* Quick Esports Stats Highlights */}
        <div className={styles.statsOverviewGrid}>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>🎮</span>
            <div className={`nz-num ${styles.statValue}`}>{profile.stats.games}</div>
            <div className={styles.statLabel}>{t("profile.games_label")}</div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>🏆</span>
            <div className={`nz-num ${styles.statValue}`}>{profile.stats.wins}</div>
            <div className={styles.statLabel}>{t("profile.wins_label")}</div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>⚔️</span>
            <div className={`nz-num ${styles.statValue}`}>{profile.stats.losses}</div>
            <div className={styles.statLabel}>{t("profile.losses_label")}</div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>🎯</span>
            <div className={`nz-num ${styles.statValue}`}>{winRate(profile.stats)}</div>
            <div className={styles.statLabel}>{t("profile.win_rate_label")}</div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>🏅</span>
            <div className={`nz-num ${styles.statValue}`}>{profile.tournaments.played}</div>
            <div className={styles.statLabel}>{t("profile.tournaments_played_label")}</div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>👑</span>
            <div className={`nz-num ${styles.statValue}`}>{profile.tournaments.won}</div>
            <div className={styles.statLabel}>{t("profile.tournaments_won_label")}</div>
          </div>
        </div>

        {/* 2-Column Esports Main Grid */}
        <div className={styles.mainGrid}>
          {/* Main Column */}
          <div className={styles.column}>
            {/* Bio Card */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <span>📝</span> {t("profile.bio_label")}
              </h2>
              <p className={profile.bio ? styles.bio : styles.empty}>
                {profile.bio ? `"${profile.bio}"` : t("profile.no_bio")}
              </p>
            </div>

            {/* Game Ratings & Mastery */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <span>🎖️</span> {t("profile.ratings_title")}
              </h2>
              {profile.ratings.length === 0 ? (
                <p className={styles.empty}>{t("profile.no_ratings")}</p>
              ) : (
                <div className={styles.ratingsList}>
                  {profile.ratings.map((r) => {
                    const m = profile.mastery.find((mm) => mm.gameId === r.gameId);
                    const peak = profile.highestRatings[r.gameId];
                    const icon = GAME_ICONS[r.gameId] || "🎮";
                    return (
                      <div key={r.gameId} className={styles.ratingRow}>
                        <span className={styles.ratingGameName}>
                          <span className={styles.gameIcon}>{icon}</span>
                          {r.displayName}
                          {m && (
                            <span className={styles.masteryPill}>
                              {t(`profile.mastery_level.${m.level}`)}
                            </span>
                          )}
                        </span>
                        <div className={styles.ratingNumbers}>
                          {peak != null && peak > r.rating && (
                            <span className={styles.peakRating}>
                              {t("profile.highest_rating_label")}: {Math.round(peak)}
                            </span>
                          )}
                          <span className={`nz-num ${styles.ratingValue}`}>
                            {Math.round(r.rating)}
                          </span>
                          <LocaleLink href={`/play/${r.gameId}`} className={styles.tryGameLink}>
                            {t("profile.try_game_cta")}
                          </LocaleLink>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Streak Card */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <span>🔥</span> {t("profile.streak_title")}
              </h2>
              {profile.streak.current === 0 ? (
                <p className={styles.empty}>{t("profile.streak_none")}</p>
              ) : (
                <div className={styles.streakContent}>
                  <div className={styles.streakFlame}>🔥</div>
                  <div className={styles.streakInfo}>
                    <div className={`nz-num ${styles.streakValue}`}>
                      {t("profile.streak_current", { count: profile.streak.current })}
                    </div>
                    <div className={styles.streakLongest}>
                      {t("profile.streak_longest", { count: profile.streak.longest })}
                    </div>
                    {profile.streak.atRisk && (
                      <p className={styles.streakAtRisk}>{t("profile.streak_at_risk")}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Side Showcase Column */}
          <div className={styles.column}>
            {/* Achievements Showcase */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <span>🏅</span> {t("profile.achievements_title")}
              </h2>
              {profile.achievements.length === 0 ? (
                <p className={styles.empty}>{t("profile.no_achievements")}</p>
              ) : (
                <div className={styles.achievementList}>
                  {profile.achievements.map((code) => (
                    <span key={code} className={styles.achievementPill}>
                      {t(`profile.achievements_catalog.${code}`)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Badges Showcase */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <span>🛡️</span> {t("profile.badges_title")}
              </h2>
              {profile.badges.length === 0 ? (
                <p className={styles.empty}>{t("profile.no_badges")}</p>
              ) : (
                <div className={styles.badgeRow}>
                  {profile.badges.map((b) => (
                    <span
                      key={b.code}
                      className={styles.badgeItem}
                      title={t(`profile.achievements_catalog.${b.code}`)}
                    >
                      {badgeIcon(b.code)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Frames Showcase */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <span>🖼️</span> {t("profile.frames_title")}
              </h2>
              {profile.frames.length === 0 ? (
                <p className={styles.empty}>{t("profile.no_frames")}</p>
              ) : (
                <div className={styles.frameList}>
                  {profile.frames.map((code) => {
                    const worn = profile.selectedFrame === code;
                    return (
                      <div key={code} className={styles.frameRow}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            className={`${styles.frameSwatch} ${styles[`frame_${code}`] ?? ""}`}
                            aria-hidden="true"
                          />
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                            {t(`profile.achievements_catalog.${code}`)}
                          </span>
                        </div>
                        <Button
                          variant={worn ? "secondary" : "ghost"}
                          onClick={() => void selectFrame(worn ? null : code)}
                        >
                          {worn ? t("profile.frame_selected_cta") : t("profile.frame_select_cta")}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <p className={styles.memberSince}>
          📅 {t("profile.member_since_label")}: {new Date(profile.memberSince).toLocaleDateString()}
        </p>

        {cropperImage && (
          <ImageCropperModal
            imageSrc={cropperImage}
            onCropComplete={handleCropComplete}
            onCancel={() => setCropperImage(null)}
          />
        )}
      </div>
      <Footer />
    </>
  );
}

function winRate(stats: PublicProfile["stats"]): string {
  if (stats.games === 0) return "—";
  return `${Math.round((stats.wins / stats.games) * 100)}%`;
}

function EditProfilePanel({
  profile,
  onDone,
  onCancel,
}: {
  profile: PublicProfile;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const { t, locale } = useI18n();
  const [nickname, setNickname] = useState(profile.nickname);
  const [bio, setBio] = useState(profile.bio);
  const [allowDirectMessages, setAllowDirectMessages] = useState(profile.allowDirectMessages ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await patch("/v1/me/profile", { nickname, bio, allowDirectMessages });
      await onDone();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(t(authErrorKey(code ?? "GENERIC")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={onSubmit} style={{ borderColor: "rgba(56, 189, 248, 0.4)" }}>
      {error && <p className={formStyles.error} role="alert">{error}</p>}
      <div className={formStyles.field}>
        <label htmlFor="nickname">{t("profile.nickname_label")}</label>
        <input
          id="nickname"
          minLength={3}
          maxLength={24}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
      </div>
      <div className={formStyles.field}>
        <label htmlFor="bio">{t("profile.bio_label")}</label>
        <textarea
          id="bio"
          maxLength={280}
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.08)", marginBlock: "12px" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: "14px", color: "#fff" }}>
            {locale === "ar" ? "السماح بالرسائل الخاصة" : "Allow Direct Messages"}
          </div>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>
            {locale === "ar" ? "إلغاء التحديد لمنع استقبال الرسائل الخاصة من أي شخص" : "Turn off to block incoming private messages from other players"}
          </div>
        </div>
        <input
          type="checkbox"
          checked={allowDirectMessages}
          onChange={(e) => setAllowDirectMessages(e.target.checked)}
          style={{ width: "20px", height: "20px", accentColor: "#22c55e", cursor: "pointer" }}
        />
      </div>
      <div style={{ display: "flex", gap: "var(--nz-space-3)", marginTop: "1rem" }}>
        <Button type="submit" disabled={submitting}>
          {submitting ? t("profile.saving") : t("profile.save_cta")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("profile.cancel_cta")}
        </Button>
      </div>
    </form>
  );
}
