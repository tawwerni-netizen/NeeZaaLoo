/**
 * The Profile read/update surface -- the one place that assembles a
 * player's public competitive identity (nickname, bio, avatar, EXP,
 * level, Global Skill, per-game ratings, win/loss stats, achievements,
 * badges) from every domain that owns a piece of it. This module reads
 * from `packages/global-skill` and the existing `rating`/`duel` tables
 * rather than recomputing any of that -- Global Skill and Glicko ratings
 * are reused exactly as they already exist, never reimplemented here.
 *
 * `ownProfile()` and `publicProfileFor()` return the SAME shape
 * deliberately: nothing in a player's own profile view is more sensitive
 * than what is already public, because anything actually sensitive
 * (email, wallet, auth methods) already lives behind its own endpoint
 * (`GET /v1/me`, `GET /v1/me/auth-methods`) and is never assembled here.
 */
import { randomUUID } from "node:crypto";
import { writeSecurityEvent } from "../../auth/src/audit.mjs";
import { sanitizeBio, validateBio } from "./bio.mjs";
import { validateAvatarBuffer } from "./avatar-storage.mjs";
import { expProgress } from "./level.mjs";

export const ProfileError = Object.freeze({
  NOT_FOUND: "NOT_FOUND",
  CANNOT_REPORT_SELF: "CANNOT_REPORT_SELF",
});

export function createProfileService(db, {
  nicknameService, expService, achievementService, badgeService, avatarStorage, globalSkill,
  now = () => Date.now(),
}) {
  async function computeStats(playerId) {
    const r = await db.query(
      `SELECT
         count(*) FILTER (WHERE (seat_0 = $1 AND result = '1-0') OR (seat_1 = $1 AND result = '0-1')) AS wins,
         count(*) FILTER (WHERE (seat_0 = $1 AND result = '0-1') OR (seat_1 = $1 AND result = '1-0')) AS losses,
         count(*) FILTER (WHERE result = '1/2-1/2') AS draws,
         count(*) AS games
       FROM duel
       WHERE (seat_0 = $1 OR seat_1 = $1) AND status IN ('COMPLETED', 'SETTLED')`,
      [playerId]
    );
    const row = r.rows[0];
    return {
      games: Number(row.games), wins: Number(row.wins), losses: Number(row.losses), draws: Number(row.draws),
    };
  }

  async function gameRatings(playerId) {
    const r = await db.query(
      `SELECT g.id AS game_id, g.display_name, rt.rating_x100, rt.games_played, rt.last_played_at
         FROM rating rt JOIN game g ON g.id = rt.game_id
        WHERE rt.player_id = $1
        ORDER BY rt.last_played_at DESC NULLS LAST`,
      [playerId]
    );
    return r.rows.map((row) => ({
      gameId: row.game_id,
      displayName: row.display_name,
      rating: row.rating_x100 / 100,
      gamesPlayed: row.games_played,
      lastPlayedAt: row.last_played_at,
    }));
  }

  /**
   * Nicknames can change (see nickname.mjs's cooldown/uniqueness rules) --
   * `id` never does. A URL built from a CURRENT nickname (a shared link, a
   * "View profile" click) has to resolve through the nickname a player
   * has RIGHT NOW, not whatever their `id` happens to also equal today
   * (only true because id and handle start equal at registration and
   * this is the first slice that lets handle move away from it).
   */
  async function resolveByNickname(nickname) {
    const r = await db.query("SELECT id FROM player WHERE LOWER(handle) = LOWER($1)", [nickname]);
    return r.rows[0]?.id ?? null;
  }

  async function publicProfileByNickname(nickname) {
    const id = await resolveByNickname(nickname);
    return id ? publicProfileFor(id) : null;
  }

  async function previewByNickname(nickname) {
    const id = await resolveByNickname(nickname);
    return id ? previewFor(id) : null;
  }

  async function publicProfileFor(playerId) {
    const p = await db.query(
      "SELECT id, handle, bio, avatar_key, selected_badge_code, created_at FROM player WHERE id = $1", [playerId]
    );
    if (!p.rows.length) return null;
    const row = p.rows[0];

    const [totalExp, achievements, badges, stats, ratings, skill] = await Promise.all([
      expService.totalFor(playerId),
      achievementService.listFor(playerId),
      badgeService.listFor(playerId),
      computeStats(playerId),
      gameRatings(playerId),
      globalSkill.scoreFor(playerId),
    ]);

    return {
      id: row.id,
      nickname: row.handle,
      bio: row.bio,
      avatarUrl: avatarStorage.getPublicUrl(row.avatar_key),
      selectedBadge: row.selected_badge_code,
      exp: expProgress(totalExp),
      globalSkill: skill.score,
      ratings,
      stats,
      achievements: achievements.map((a) => a.achievement_code),
      badges: badges.map((b) => ({ code: b.badge_code, source: b.source })),
      memberSince: row.created_at,
    };
  }

  /** Deliberately the SAME assembly as publicProfileFor -- see this
   * file's own header for why. */
  const ownProfile = publicProfileFor;

  /** Small, fast, and the ONLY shape a chat message, leaderboard row, or
   * spectator overlay should ever fetch -- never the full profile just to
   * render an avatar and a level badge. */
  async function previewFor(playerId) {
    const p = await db.query(
      "SELECT id, handle, avatar_key, selected_badge_code FROM player WHERE id = $1", [playerId]
    );
    if (!p.rows.length) return null;
    const row = p.rows[0];
    const [totalExp, skill] = await Promise.all([expService.totalFor(playerId), globalSkill.scoreFor(playerId)]);
    const progress = expProgress(totalExp);
    return {
      id: row.id,
      nickname: row.handle,
      avatarUrl: avatarStorage.getPublicUrl(row.avatar_key),
      level: progress.level,
      exp: progress.totalExp,
      globalSkill: skill.score,
      selectedBadge: row.selected_badge_code,
    };
  }

  /** `nickname` and `bio` are both optional -- only the fields actually
   * present in the call are validated and changed. Nickname's own
   * cooldown/reserved-word/uniqueness rules live in nickname.mjs; this
   * only sequences them and reports the combined result. */
  async function updateProfile(playerId, { nickname, bio } = {}, ctx = {}) {
    if (nickname !== undefined) {
      const r = await nicknameService.changeNickname(playerId, nickname, ctx);
      if (!r.ok) return r;
    }
    if (bio !== undefined) {
      const sanitized = sanitizeBio(bio);
      const err = validateBio(sanitized);
      if (err) return { ok: false, reason: err };
      const updated = await db.query("UPDATE player SET bio = $2 WHERE id = $1 RETURNING id", [playerId, sanitized]);
      if (!updated.rows.length) return { ok: false, reason: ProfileError.NOT_FOUND };
      await writeSecurityEvent(db, playerId, "PROFILE_UPDATED", { field: "bio" }, ctx);
    }
    return { ok: true, profile: await publicProfileFor(playerId) };
  }

  async function setAvatar(playerId, buffer, ctx = {}) {
    const validated = validateAvatarBuffer(buffer);
    if (!validated.ok) return validated;

    const current = await db.query("SELECT avatar_key FROM player WHERE id = $1", [playerId]);
    if (!current.rows.length) return { ok: false, reason: ProfileError.NOT_FOUND };
    const oldKey = current.rows[0].avatar_key;

    const key = await avatarStorage.replace(playerId, oldKey, buffer, validated.ext);
    await db.query("UPDATE player SET avatar_key = $2 WHERE id = $1", [playerId, key]);
    await writeSecurityEvent(db, playerId, "AVATAR_CHANGED", {}, ctx);
    return { ok: true, avatarUrl: avatarStorage.getPublicUrl(key) };
  }

  /** The write side of directive #3/#4's "moderation/report capability" --
   * a review queue is a later slice's job; this only makes sure a report
   * is never lost. */
  async function reportContent({ reporterId, subjectPlayerId, contentType, reason }, ctx = {}) {
    if (reporterId === subjectPlayerId) return { ok: false, reason: ProfileError.CANNOT_REPORT_SELF };
    const id = `rpt_${randomUUID()}`;
    await db.query(
      `INSERT INTO content_report (id, reporter_id, subject_player_id, content_type, reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, reporterId, subjectPlayerId, contentType, reason ?? null, new Date(now()).toISOString()]
    );
    return { ok: true, reportId: id };
  }

  return {
    publicProfileFor, publicProfileByNickname, ownProfile, previewFor, previewByNickname,
    resolveByNickname, updateProfile, setAvatar, reportContent,
  };
}
