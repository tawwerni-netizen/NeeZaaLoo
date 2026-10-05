/**
 * Daily challenges. Every one of today's challenges is assigned to every
 * player the same way -- all active templates, every day, no randomness
 * and no rotation to build "fear of missing today's special one." Progress
 * is never a client-reported number: it is recomputed, from scratch, from
 * the same real signals every other part of this platform already treats
 * as authoritative (`duel.status`, `rating_change`) -- so a retried request,
 * a page refresh, or two tabs open at once can never double-count
 * anything or invent progress that did not happen.
 *
 * No template here has a deposit, a stake, or a CASH-tier requirement
 * (see migration 0034's own header) -- structurally, not by omission: a
 * template row simply has no column that could express one.
 */
import { randomUUID } from "node:crypto";

export const DailyChallengeMetric = Object.freeze({
  WIN_FREE_MATCHES: "WIN_FREE_MATCHES",
  PLAY_GAME_MATCHES: "PLAY_GAME_MATCHES",
  PLAY_DIFFERENT_GAMES: "PLAY_DIFFERENT_GAMES",
  // Replaces WATCH_REPLAYS (migration 0046): the Replay Center this
  // metric used to read from (`replay_view`) was retired along with every
  // other detailed post-match record, per the live-evidence retention
  // rule. A completed, rated match is an equally real, already-durable
  // daily signal -- `rating_change` is written once per player per duel
  // by the SAME settlement path this platform already treats as
  // authoritative for everything else rating-shaped.
  PLAY_RATED_MATCH: "PLAY_RATED_MATCH",
  FINISH_TRAINING: "FINISH_TRAINING",
});

async function liveProgress(db, playerId, template) {
  switch (template.metric) {
    case DailyChallengeMetric.WIN_FREE_MATCHES: {
      const r = await db.query(
        `SELECT count(*)::int c FROM duel
          WHERE ((seat_0=$1 AND result='1-0') OR (seat_1=$1 AND result='0-1'))
            AND tier='FREE' AND is_vs_computer=false
            AND status IN ('COMPLETED','SETTLED') AND completed_at::date = CURRENT_DATE`,
        [playerId]
      );
      return r.rows[0].c;
    }
    case DailyChallengeMetric.PLAY_GAME_MATCHES: {
      const r = await db.query(
        `SELECT count(*)::int c FROM duel
          WHERE (seat_0=$1 OR seat_1=$1) AND game_id=$2
            AND status IN ('COMPLETED','SETTLED') AND completed_at::date = CURRENT_DATE`,
        [playerId, template.game_id]
      );
      return r.rows[0].c;
    }
    case DailyChallengeMetric.PLAY_DIFFERENT_GAMES: {
      const r = await db.query(
        `SELECT count(DISTINCT game_id)::int c FROM duel
          WHERE (seat_0=$1 OR seat_1=$1)
            AND status IN ('COMPLETED','SETTLED') AND completed_at::date = CURRENT_DATE`,
        [playerId]
      );
      return r.rows[0].c;
    }
    case DailyChallengeMetric.PLAY_RATED_MATCH: {
      const r = await db.query(
        `SELECT count(DISTINCT duel_id)::int c FROM rating_change
          WHERE player_id=$1 AND created_at::date = CURRENT_DATE`,
        [playerId]
      );
      return r.rows[0].c;
    }
    case DailyChallengeMetric.FINISH_TRAINING: {
      const r = await db.query(
        `SELECT count(*)::int c FROM duel
          WHERE (seat_0=$1 OR seat_1=$1) AND is_vs_computer=true
            AND status IN ('COMPLETED','SETTLED') AND completed_at::date = CURRENT_DATE`,
        [playerId]
      );
      return r.rows[0].c;
    }
    default:
      throw new Error(`unknown daily challenge metric: ${template.metric}`);
  }
}

export function createDailyChallengeService(db) {
  async function ensureAssignedToday(playerId) {
    const templates = await db.query(
      "SELECT id FROM daily_challenge_template WHERE active = true"
    );
    for (const t of templates.rows) {
      await db.query(
        `INSERT INTO daily_challenge_assignment (id, player_id, template_id, assigned_date)
         VALUES ($1,$2,$3,CURRENT_DATE)
         ON CONFLICT (player_id, template_id, assigned_date) DO NOTHING`,
        [`dca_${randomUUID()}`, playerId, t.id]
      );
    }
  }

  /**
   * Mark one assignment complete and grant its EXP -- guarded by
   * `completed_at IS NULL` so two concurrent callers racing the same
   * just-crossed threshold cannot both "win" the transition, and the
   * exp_event's own `dedupe_key` (keyed on the assignment's id, which is
   * itself unique per player/template/day) makes the EXP grant idempotent
   * a second time over, independent of the row-level guard.
   */
  async function completeAndReward(assignment) {
    return db.transaction(async (tx) => {
      const updated = await tx.query(
        `UPDATE daily_challenge_assignment
            SET progress_count = $2, completed_at = now()
          WHERE id = $1 AND completed_at IS NULL
          RETURNING completed_at`,
        [assignment.id, assignment.target_count]
      );
      if (!updated.rows.length) {
        const existing = await tx.query(
          `SELECT completed_at FROM daily_challenge_assignment WHERE id = $1`, [assignment.id]
        );
        return existing.rows[0].completed_at;
      }
      await tx.query(
        `INSERT INTO exp_event (id, player_id, event_type, source, amount, dedupe_key, created_at)
         VALUES ($1,$2,'DAILY_CHALLENGE',$3,$4,$5,now())
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [`xp_dc_${assignment.id}`, assignment.player_id, `daily_challenge:${assignment.code}`,
         assignment.exp_reward, `daily_challenge:${assignment.id}`]
      );
      await tx.query(
        `INSERT INTO notification (id, player_id, type, title, body, data)
         VALUES ($1,$2,'DAILY_CHALLENGE_COMPLETE','Daily challenge complete',$3,$4::jsonb)`,
        [`ntf_dc_${assignment.id}`, assignment.player_id,
         `You completed "${assignment.code}" and earned ${assignment.exp_reward} EXP.`,
         JSON.stringify({ code: assignment.code, expReward: assignment.exp_reward })]
      );
      return updated.rows[0].completed_at;
    });
  }

  /**
   * Today's challenges for one player: assigns them if this is the first
   * check today, recomputes each one's real progress, and completes (and
   * rewards) any that just crossed their target. Safe to call as often as
   * a client wants -- every write inside is idempotent on its own terms.
   */
  async function myChallenges(playerId) {
    await ensureAssignedToday(playerId);

    const rows = await db.query(
      `SELECT a.id, a.progress_count, a.completed_at,
              t.code, t.metric, t.game_id, t.target_count, t.exp_reward
         FROM daily_challenge_assignment a
         JOIN daily_challenge_template t ON t.id = a.template_id
        WHERE a.player_id = $1 AND a.assigned_date = CURRENT_DATE
        ORDER BY t.id`,
      [playerId]
    );

    const out = [];
    for (const row of rows.rows) {
      let progress = row.completed_at ? row.target_count : await liveProgress(db, playerId, row);
      progress = Math.min(progress, row.target_count);

      let completedAt = row.completed_at;
      if (!completedAt && progress >= row.target_count) {
        completedAt = await completeAndReward({ ...row, player_id: playerId });
      } else if (progress !== row.progress_count) {
        await db.query(
          `UPDATE daily_challenge_assignment SET progress_count = $2 WHERE id = $1`,
          [row.id, progress]
        );
      }

      out.push({
        code: row.code,
        metric: row.metric,
        gameId: row.game_id,
        progress,
        target: row.target_count,
        expReward: row.exp_reward,
        completed: completedAt !== null,
      });
    }
    return out;
  }

  return { myChallenges };
}
