/**
 * Healthy activity streaks. One credit per UTC calendar day for finishing
 * ANY real duel -- including a VS_COMPUTER training match, deliberately
 * unlike the EXP/achievement gate in packages/progression, which excludes
 * training matches to prevent farming. A streak cannot be farmed the same
 * way EXP can (there is no path from "logged a streak day" to money or a
 * rating change), so counting training play here is the more honest
 * reading of "healthy RETURN behavior": showing up to play anything at
 * all, including a zero-risk practice game, is exactly the behavior this
 * system exists to recognise.
 *
 * Every date comparison happens in SQL against `CURRENT_DATE` -- never a
 * JS-computed "today" -- so the server's own clock is the only source of
 * truth and there is no client-timezone or parser-quirk path to a
 * miscounted day.
 *
 * Directive-level guarantees, not incidental: no deposit, stake, or
 * CASH-tier duel is required anywhere in `recordActivity`, and missing a
 * day only ever resets `current_length` to 1 -- there is no penalty
 * beyond that, and nothing here ever reads or touches a wallet balance.
 */
import { EXP_AMOUNTS } from "../../profile/src/exp.mjs";
import { BadgeSource } from "../../profile/src/badges.mjs";

/** current_length values that unlock a one-time reward. Order matters:
 * only ever one milestone can be newly crossed per call (streaks only
 * ever increment by exactly 1 at a time), so no dedupe-by-order concern. */
export const STREAK_MILESTONES = [3, 7, 30];

// Which of the milestones above also grant an achievement/badge/frame,
// beyond the EXP every milestone grants. Deliberately not every
// milestone -- see this file's header for why escalating the reward
// TYPE, not just the amount, is the intended pacing.
const MILESTONE_EXTRAS = {
  7: { achievement: "STREAK_7", badge: "STREAK_7", frame: "STREAK_7_FRAME" },
  30: { achievement: "STREAK_30", badge: "STREAK_30", frame: "STREAK_30_FRAME" },
};

export function createStreakService(db) {
  /**
   * Call once per real, finished duel (see packages/progression's own
   * hook). Safe to call any number of times for the same player on the
   * same UTC day -- a same-day repeat is a structural no-op, not merely
   * a discouraged retry, because the SQL comparison against
   * `last_activity_date = CURRENT_DATE` is what decides "already
   * counted," not any state the caller tracks.
   */
  async function recordActivity(playerId) {
    // A single atomic UPSERT, not a SELECT-then-branch: a `SELECT ... FOR
    // UPDATE` locks a row that already exists, but a brand-new player has
    // no row to lock at all, so two concurrent first-ever activities
    // would both fall through to INSERT and collide on the primary key.
    // `INSERT ... ON CONFLICT DO UPDATE` is what Postgres guarantees is
    // race-free for exactly this "insert-or-update the same key" case --
    // every branch below reads and writes the row's OWN current values
    // (`player_streak.*`), never a value this function computed earlier
    // from a stale read.
    const r = await db.query(
      `WITH prior AS (
         SELECT last_activity_date FROM player_streak WHERE player_id = $1
       ), upserted AS (
         INSERT INTO player_streak (player_id, current_length, longest_length, last_activity_date)
         VALUES ($1, 1, 1, CURRENT_DATE)
         ON CONFLICT (player_id) DO UPDATE SET
           current_length = CASE
             WHEN player_streak.last_activity_date = CURRENT_DATE THEN player_streak.current_length
             WHEN player_streak.last_activity_date = CURRENT_DATE - INTERVAL '1 day' THEN player_streak.current_length + 1
             ELSE 1
           END,
           longest_length = GREATEST(player_streak.longest_length, CASE
             WHEN player_streak.last_activity_date = CURRENT_DATE THEN player_streak.current_length
             WHEN player_streak.last_activity_date = CURRENT_DATE - INTERVAL '1 day' THEN player_streak.current_length + 1
             ELSE 1
           END),
           last_activity_date = CURRENT_DATE,
           updated_at = now()
         RETURNING current_length, longest_length
       )
       SELECT u.current_length, u.longest_length,
              COALESCE(p.last_activity_date = CURRENT_DATE, false) AS was_already_today
         FROM upserted u LEFT JOIN prior p ON true`,
      [playerId]
    );
    const { current_length: current, longest_length: longest, was_already_today: wasAlreadyToday } = r.rows[0];
    if (wasAlreadyToday) {
      return { current, longest, changed: false, milestone: null };
    }

    let milestone = null;
    if (STREAK_MILESTONES.includes(current)) {
      milestone = await db.transaction((tx) => grantMilestone(tx, playerId, current));
    }
    return { current, longest, changed: true, milestone };
  }

  /**
   * Idempotent via `streak_reward`'s own PRIMARY KEY (player_id,
   * milestone) -- a retried or concurrently-raced call that lands on a
   * milestone already granted is a harmless no-op, the same pattern
   * every other one-time award in this codebase uses.
   *
   * Every write here goes through the SAME `tx` the streak update itself
   * is running on, via plain SQL rather than the achievements/badges
   * service objects those primitives normally expose -- calling a
   * service bound to a DIFFERENT connection from inside this transaction
   * is exactly the self-deadlock tournament.mjs's own settlePrizes()
   * documents (PGlite's single physical connection cannot serve two
   * "open transaction" callers at once); a handful of ON CONFLICT DO
   * NOTHING inserts duplicates less than that risk would cost.
   */
  async function grantMilestone(tx, playerId, milestone) {
    const inserted = await tx.query(
      `INSERT INTO streak_reward (player_id, milestone) VALUES ($1, $2)
         ON CONFLICT (player_id, milestone) DO NOTHING
       RETURNING milestone`,
      [playerId, milestone]
    );
    if (!inserted.rows.length) return null;

    const expAmount = EXP_AMOUNTS[`STREAK_${milestone}`];
    await tx.query(
      `INSERT INTO exp_event (id, player_id, event_type, source, amount, dedupe_key, created_at)
       VALUES ($1,$2,'STREAK_MILESTONE',$3,$4,$5,now())
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [`xp_streak_${playerId}_${milestone}`, playerId, `streak:${milestone}`, expAmount,
       `streak:${playerId}:${milestone}`]
    );

    const extras = MILESTONE_EXTRAS[milestone];
    if (extras) {
      await tx.query(
        `INSERT INTO player_achievement (player_id, achievement_code) VALUES ($1,$2)
           ON CONFLICT (player_id, achievement_code) DO NOTHING`,
        [playerId, extras.achievement]
      );
      await tx.query(
        `INSERT INTO player_badge (player_id, badge_code, source) VALUES ($1,$2,$3::badge_source)
           ON CONFLICT (player_id, badge_code) DO NOTHING`,
        [playerId, extras.badge, BadgeSource.ACHIEVEMENT]
      );
      await tx.query(
        `INSERT INTO player_frame (player_id, frame_code) VALUES ($1,$2)
           ON CONFLICT (player_id, frame_code) DO NOTHING`,
        [playerId, extras.frame]
      );
    }

    await tx.query(
      `INSERT INTO notification (id, player_id, type, title, body, data)
       VALUES ($1,$2,'STREAK_MILESTONE','Streak milestone',$3,$4::jsonb)`,
      [`ntf_streak_${playerId}_${milestone}`, playerId, `You reached a ${milestone}-day streak.`,
       JSON.stringify({ milestone })]
    );

    return { milestone, expAwarded: expAmount, ...extras };
  }

  async function streakFor(playerId) {
    const r = await db.query(
      `SELECT current_length, longest_length,
              (last_activity_date = CURRENT_DATE) AS active_today,
              (last_activity_date = CURRENT_DATE - INTERVAL '1 day') AS at_risk
         FROM player_streak WHERE player_id = $1`,
      [playerId]
    );
    if (!r.rows.length) return { current: 0, longest: 0, activeToday: false, atRisk: false };
    const row = r.rows[0];
    return {
      current: row.current_length,
      longest: row.longest_length,
      activeToday: row.active_today,
      // "At risk": the streak is real but today's activity has not yet
      // happened -- shown as a gentle reminder, never a countdown timer
      // or a loss-framed warning (no "you'll LOSE your streak in Xh").
      atRisk: row.at_risk && !row.active_today,
    };
  }

  return { recordActivity, streakFor };
}
