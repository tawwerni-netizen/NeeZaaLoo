/**
 * The tournament engine.
 *
 * Deliberately thin. A tournament does not reimplement duels, clocks,
 * scoring, ratings, or money movement -- it creates ordinary `duel` rows
 * through the same path matchmaking uses, and settles them through the
 * EXISTING settlement service. A tournament pairing's duel is always tier
 * FREE (stake 0): the entry fee is collected once at registration into the
 * pool, not staked per match, so `settlement.settle()` naturally does
 * rating write-back only for these duels -- no new money code needed.
 *
 * What this file actually owns: registration, capacity, pairing generation
 * (single elimination and Swiss), round progression, standings/tiebreakers,
 * and the one-time pool settlement at the end.
 */
import { randomUUID } from "node:crypto";
import { computeRake } from "../../settlement/src/rake.mjs";
import { buildFirstRound, buildNextRound, buildSwissRound, nextPow2 } from "./pairing.mjs";
import { DEFAULT_SPAWNERS } from "../../matchmaking/src/spawn.mjs";
import { EXP_AMOUNTS } from "../../profile/src/exp.mjs";

export const TournamentError = {
  NOT_FOUND: "NOT_FOUND",
  NOT_OPEN: "NOT_OPEN",
  ALREADY_REGISTERED: "ALREADY_REGISTERED",
  AT_CAPACITY: "AT_CAPACITY",
  NOT_ENOUGH_PLAYERS: "NOT_ENOUGH_PLAYERS",
  WRONG_STATUS: "WRONG_STATUS",
  PAIRING_ALREADY_DECIDED: "PAIRING_ALREADY_DECIDED",
  NOT_LIVE: "NOT_LIVE",
  ROUND_NOT_COMPLETE: "ROUND_NOT_COMPLETE",
  ALREADY_SETTLED: "ALREADY_SETTLED",
  NOT_ELIGIBLE: "NOT_ELIGIBLE",
  NO_ECONOMY_RULE: "NO_ECONOMY_RULE",
};

export function createTournamentService(db, { now = () => Date.now(), emailService = null } = {}) {
  const svc = {
    /** Create a tournament in DRAFT. Registration is opened as a separate step. */
    async create({
      gameId, format, tier = "FREE", entryFeeMinor = 0n, asset = null,
      capacity, minPlayers = 2, timeControl, swissRounds = null,
      registrationClosesAt, prizeStructure = [], createdBy,
      title = null, description = null, eligibility = {}, visibility = "PUBLIC",
      scheduledStartsAt = null,
    }) {
      const id = `trn_${randomUUID()}`;
      // Snapshotted here, not read live at round-creation time: a tournament
      // advertised under one ruleset at signup must play every round of a
      // multi-day event under that SAME ruleset, even if the game's own
      // plugin_version is bumped mid-event.
      const gameRow = await db.query("SELECT plugin_version FROM game WHERE id=$1", [gameId]);
      const rulesetVersion = gameRow.rows[0]?.plugin_version ?? 1;
      if (tier === "CASH") {
        // A CASH tournament's pool fee is priced NOW, at creation, and frozen
        // -- exactly like a duel via mm_pair() (see 0036_fee_snapshot.sql's
        // own header). Without this, settlePrizes() would have to re-resolve
        // the rule when the pool is finally distributed, which could be days
        // after registration closed, and an admin rate change in between
        // would silently reprice every entrant's already-collected fee.
        const priced = await db.query(
          `SELECT * FROM economy_resolve($1,'CASH'::entry_tier, now(), $2)`,
          [gameId, id]
        );
        if (!priced.rows.length) {
          // A CASH tournament that cannot be priced must not be created at
          // all -- exactly the same refusal mm_pair() makes for a CASH duel.
          return { ok: false, reason: TournamentError.NO_ECONOMY_RULE };
        }
        const r = priced.rows[0];
        await db.query(
          `INSERT INTO tournament
             (id, game_id, format, tier, entry_fee_minor, asset, capacity, min_players,
              time_control, swiss_rounds, registration_closes_at, prize_structure, created_by,
              title, description, ruleset_version, eligibility, visibility, scheduled_starts_at,
              priced_rake_bps, priced_economy_rule_id, priced_economy_rule_version,
              priced_min_rake_minor, priced_max_rake_minor, priced_at)
           VALUES ($1,$2,$3::tournament_format,$4::entry_tier,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13,
                   $14,$15,$16,$17::jsonb,$18,$19,$20,$21,$22,$23,$24,now())`,
          [id, gameId, format, tier, String(entryFeeMinor), asset, capacity, minPlayers,
           JSON.stringify(timeControl), swissRounds, registrationClosesAt,
           JSON.stringify(prizeStructure), createdBy ?? null,
           title, description, rulesetVersion, JSON.stringify(eligibility), visibility, scheduledStartsAt,
           r.rake_bps, r.rule_id, r.rule_version, r.min_rake_minor, r.max_rake_minor]
        );
      } else {
        await db.query(
          `INSERT INTO tournament
             (id, game_id, format, tier, entry_fee_minor, asset, capacity, min_players,
              time_control, swiss_rounds, registration_closes_at, prize_structure, created_by,
              title, description, ruleset_version, eligibility, visibility, scheduled_starts_at)
           VALUES ($1,$2,$3::tournament_format,$4::entry_tier,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13,
                   $14,$15,$16,$17::jsonb,$18,$19)`,
          [id, gameId, format, tier, String(entryFeeMinor), asset, capacity, minPlayers,
           JSON.stringify(timeControl), swissRounds, registrationClosesAt,
           JSON.stringify(prizeStructure), createdBy ?? null,
           title, description, rulesetVersion, JSON.stringify(eligibility), visibility, scheduledStartsAt]
        );
      }
      await audit(db, id, "CREATED", "SYSTEM", null, { format, tier, capacity });
      return { ok: true, tournamentId: id };
    },

    /** DRAFT -> SCHEDULED: the admin has set a target start time, but registration is not open yet. */
    async schedule(tournamentId) {
      const r = await db.query(
        `UPDATE tournament SET status='SCHEDULED'::tournament_status
          WHERE id=$1 AND status='DRAFT' RETURNING id`,
        [tournamentId]
      );
      if (!r.rows.length) return { ok: false, reason: TournamentError.WRONG_STATUS };
      await audit(db, tournamentId, "SCHEDULED", "SYSTEM");
      return { ok: true };
    },

    async openRegistration(tournamentId) {
      const r = await db.query(
        `UPDATE tournament SET status='REGISTRATION'::tournament_status
          WHERE id=$1 AND status IN ('DRAFT','SCHEDULED') RETURNING id`,
        [tournamentId]
      );
      if (!r.rows.length) return { ok: false, reason: TournamentError.WRONG_STATUS };
      await audit(db, tournamentId, "REGISTRATION_OPENED", "SYSTEM");
      return { ok: true };
    },

    /**
     * Cancel before play has started. Allowed from DRAFT, SCHEDULED, or
     * REGISTRATION only -- once a single pairing has gone LIVE, cancelling
     * would strand a duel mid-play, so the caller must use forfeits instead.
     * Refunds every locked CASH entry fee in full, same as withdraw().
     */
    async cancel(tournamentId, { reason = "CANCELLED_BY_ADMIN" } = {}) {
      return db.transaction(async (tx) => {
        const t = await tx.query(
          `SELECT status, tier, entry_fee_minor::text AS fee, asset FROM tournament WHERE id=$1 FOR UPDATE`,
          [tournamentId]
        );
        if (!t.rows.length) return { ok: false, reason: TournamentError.NOT_FOUND };
        const tour = t.rows[0];
        if (!["DRAFT", "SCHEDULED", "REGISTRATION"].includes(tour.status)) {
          return { ok: false, reason: TournamentError.WRONG_STATUS };
        }

        const regs = await tx.query(
          `SELECT player_id, entry_tx_id FROM tournament_registration
            WHERE tournament_id=$1 AND status='REGISTERED' FOR UPDATE`,
          [tournamentId]
        );
        for (const reg of regs.rows) {
          if (reg.entry_tx_id) {
            await tx.query(
              `SELECT ledger_post($1,'TOURNAMENT_REFUND','SYSTEM',NULL,$2::jsonb,$3,'tournament cancelled','tournament',$4)`,
              [`tournament:${tournamentId}:refund:${reg.player_id}`,
               JSON.stringify([
                 { account: `user:${reg.player_id}:locked`, amount: tour.fee },
                 { account: `user:${reg.player_id}:available`, amount: "-" + tour.fee },
               ]),
               tour.asset, tournamentId]
            );
          }
          await tx.query(
            `UPDATE tournament_registration SET status='WITHDRAWN'::registration_status, withdrawn_at=now()
              WHERE tournament_id=$1 AND player_id=$2`,
            [tournamentId, reg.player_id]
          );
          await notify(tx, reg.player_id, "TOURNAMENT_CANCELLED",
            "Tournament cancelled", "A tournament you registered for was cancelled. Any entry fee has been refunded.",
            { tournamentId });
        }

        await tx.query(
          `UPDATE tournament SET status='CANCELLED'::tournament_status WHERE id=$1`,
          [tournamentId]
        );
        await tx.query(
          `INSERT INTO tournament_event (tournament_id, event, actor_type, detail)
           VALUES ($1,'CANCELLED','SYSTEM',$2::jsonb)`,
          [tournamentId, JSON.stringify({ reason, refunded: regs.rows.length })]
        );
        return { ok: true, refunded: regs.rows.length };
      });
    },

    /**
     * Register a player. Entry fee locks immediately for cash tournaments,
     * using the same available->locked pattern as a duel entry, keyed so a
     * retried call cannot charge twice.
     *
     * Capacity is enforced by the database trigger, inside this transaction,
     * so two concurrent registrations for the last slot cannot both succeed.
     */
    async register({ tournamentId, playerId, ratingX100 }) {
      return db.transaction(async (tx) => {
        const t = await tx.query(
          `SELECT tier, entry_fee_minor::text AS fee, asset, status, eligibility FROM tournament
            WHERE id=$1 FOR UPDATE`,
          [tournamentId]
        );
        if (!t.rows.length) return { ok: false, reason: TournamentError.NOT_FOUND };
        const tour = t.rows[0];

        const elig = tour.eligibility ?? {};
        if (elig.minRatingX100 != null && ratingX100 < elig.minRatingX100) {
          return { ok: false, reason: TournamentError.NOT_ELIGIBLE };
        }
        if (elig.maxRatingX100 != null && ratingX100 > elig.maxRatingX100) {
          return { ok: false, reason: TournamentError.NOT_ELIGIBLE };
        }

        const existing = await tx.query(
          `SELECT status FROM tournament_registration WHERE tournament_id=$1 AND player_id=$2`,
          [tournamentId, playerId]
        );
        if (existing.rows.length) return { ok: false, reason: TournamentError.ALREADY_REGISTERED };

        let entryTxId = null;
        if (tour.tier === "CASH") {
          try {
            const posted = await tx.query(
              `SELECT * FROM ledger_post($1,'TOURNAMENT_ENTRY','SYSTEM',NULL,$2::jsonb,$3,NULL,'tournament',$4)`,
              [`tournament:${tournamentId}:entry:${playerId}`,
               JSON.stringify([
                 { account: `user:${playerId}:available`, amount: tour.fee },
                 { account: `user:${playerId}:locked`, amount: "-" + tour.fee },
               ]),
               tour.asset, tournamentId]
            );
            entryTxId = posted.rows[0].transaction_id;
          } catch (e) {
            if (/insufficient funds/.test(e.message)) {
              throw Object.assign(new Error("INSUFFICIENT_FUNDS"), { expected: true });
            }
            throw e;
          }
        }

        try {
          await tx.query(
            `INSERT INTO tournament_registration
               (tournament_id, player_id, seed_rating_x100, entry_tx_id)
             VALUES ($1,$2,$3,$4)`,
            [tournamentId, playerId, ratingX100, entryTxId]
          );
        } catch (e) {
          if (/tournament_registration_capacity|at capacity/.test(e.message)) {
            return { ok: false, reason: TournamentError.AT_CAPACITY };
          }
          if (/not open for registration/.test(e.message)) {
            return { ok: false, reason: TournamentError.NOT_OPEN };
          }
          throw e;
        }

        await tx.query(
          `INSERT INTO tournament_event (tournament_id, event, actor_type, actor_id, detail)
           VALUES ($1,'REGISTERED','USER',$2,$3::jsonb)`,
          [tournamentId, playerId, JSON.stringify({ ratingX100 })]
        );
        return { ok: true };
      });
    },

    /** Withdraw before the tournament starts. Refunds any entry fee in full. */
    async withdraw({ tournamentId, playerId }) {
      return db.transaction(async (tx) => {
        const t = await tx.query("SELECT status FROM tournament WHERE id=$1 FOR UPDATE", [tournamentId]);
        if (!t.rows.length) return { ok: false, reason: TournamentError.NOT_FOUND };
        if (t.rows[0].status !== "REGISTRATION") {
          return { ok: false, reason: TournamentError.WRONG_STATUS };
        }
        const reg = await tx.query(
          `SELECT status, entry_tx_id FROM tournament_registration
            WHERE tournament_id=$1 AND player_id=$2 FOR UPDATE`,
          [tournamentId, playerId]
        );
        if (!reg.rows.length || reg.rows[0].status !== "REGISTERED") {
          return { ok: false, reason: "NOT_REGISTERED" };
        }
        if (reg.rows[0].entry_tx_id) {
          const fee = await tx.query("SELECT entry_fee_minor::text f, asset FROM tournament WHERE id=$1", [tournamentId]);
          await tx.query(
            `SELECT ledger_post($1,'TOURNAMENT_REFUND','SYSTEM',NULL,$2::jsonb,$3,'withdrawal before start','tournament',$4)`,
            [`tournament:${tournamentId}:refund:${playerId}`,
             JSON.stringify([
               { account: `user:${playerId}:locked`, amount: fee.rows[0].f },
               { account: `user:${playerId}:available`, amount: "-" + fee.rows[0].f },
             ]),
             fee.rows[0].asset, tournamentId]
          );
        }
        await tx.query(
          `UPDATE tournament_registration SET status='WITHDRAWN'::registration_status, withdrawn_at=now()
            WHERE tournament_id=$1 AND player_id=$2`,
          [tournamentId, playerId]
        );
        return { ok: true };
      });
    },

    /**
     * Close registration and generate round 1. Requires at least min_players.
     * Byes go to the top seeds (see pairing.mjs) for single elimination;
     * Swiss round 1 is seeded strongest-vs-weakest within the field.
     */
    async start(tournamentId) {
      return db.transaction(async (tx) => {
        const t = await tx.query(
          `SELECT format, game_id, time_control, swiss_rounds, min_players, status, ruleset_version, title
             FROM tournament WHERE id=$1 FOR UPDATE`,
          [tournamentId]
        );
        if (!t.rows.length) return { ok: false, reason: TournamentError.NOT_FOUND };
        const tour = t.rows[0];
        if (tour.status !== "REGISTRATION") {
          return { ok: false, reason: TournamentError.WRONG_STATUS };
        }

        const regs = await tx.query(
          `SELECT player_id, seed_rating_x100 FROM tournament_registration
            WHERE tournament_id=$1 AND status='REGISTERED'
            ORDER BY seed_rating_x100 DESC`,
          [tournamentId]
        );
        if (regs.rows.length < tour.min_players) {
          return { ok: false, reason: TournamentError.NOT_ENOUGH_PLAYERS, have: regs.rows.length };
        }
        const players = regs.rows.map((r) => r.player_id);
        const seedByPlayer = new Map(regs.rows.map((r) => [r.player_id, r.seed_rating_x100]));

        const swissTotalRounds = tour.format === "SWISS"
          ? tour.swiss_rounds
          : Math.log2(nextPow2(players.length));

        await tx.query(
          `UPDATE tournament SET status='LIVE'::tournament_status, starts_at=now() WHERE id=$1`,
          [tournamentId]
        );

        const firstRoundPairings = tour.format === "SINGLE_ELIMINATION"
          ? buildFirstRound(players)
          : buildSwissRound(
              players.map((p) => ({ playerId: p, points: 0 })),
              new Set(), new Set()
            );

        await createRound(tx, tournamentId, 1, firstRoundPairings, tour.game_id, tour.time_control, tour.ruleset_version);

        for (const pid of players) {
          await notify(tx, pid, "TOURNAMENT_STARTING", "Tournament Starting Now!",
            "Your 16-player bracket is starting. You have 1 minute to enter your match.",
            { tournamentId, gameId: tour.game_id, roundNumber: 1, startsInSeconds: 60, startingAt: new Date(now()).toISOString() });
        }

        if (emailService) {
          try {
            const emailRows = await tx.query(
              `SELECT ei.email, p.handle FROM email_identity ei
                 JOIN player p ON p.id = ei.player_id
                WHERE ei.player_id = ANY($1::text[])`,
              [players]
            );
            for (const er of emailRows.rows) {
              void emailService.sendTournamentStartingEmail({
                to: er.email,
                tournamentTitle: tour.title || "16-Player Tournament",
                tournamentId,
                startsInSeconds: 60,
              }).catch(() => {});
            }
          } catch {
            // Non-blocking email delivery
          }
        }

        await tx.query(
          `INSERT INTO tournament_event (tournament_id, event, actor_type, detail)
           VALUES ($1,'STARTED','SYSTEM',$2::jsonb)`,
          [tournamentId, JSON.stringify({ players: players.length, totalRounds: swissTotalRounds })]
        );

        return { ok: true, round: 1, pairings: firstRoundPairings.length, seeds: Object.fromEntries(seedByPlayer) };
      });
    },

    /**
     * Report the result of one pairing. Drives the underlying duel to
     * COMPLETED and hands it to the EXISTING settlement service, which does
     * the rating write-back (the duel is FREE tier, so no money moves here).
     *
     * The pairing state machine (migration 0010) makes a second report for
     * an already-decided pairing a hard refusal, not a silent overwrite.
     */
    async reportResult({ pairingId, result, reason = "REPORTED", pairingStatus = "COMPLETED" }, settlementService) {
      return db.transaction(async (tx) => {
        const p = await tx.query(
          `SELECT tournament_id, round_number, seat_0, seat_1, duel_id, status
             FROM tournament_pairing WHERE id=$1 FOR UPDATE`,
          [pairingId]
        );
        if (!p.rows.length) return { ok: false, reason: TournamentError.NOT_FOUND };
        const pairing = p.rows[0];
        if (["COMPLETED", "FORFEIT", "BYE"].includes(pairing.status)) {
          return { ok: false, reason: TournamentError.PAIRING_ALREADY_DECIDED };
        }
        if (!pairing.duel_id) return { ok: false, reason: "NO_DUEL" };

        await tx.query(
          `UPDATE duel SET status='COMPLETED'::duel_status, result=$2,
                  termination_reason=$3, completed_at=now(), game_hash=$4
            WHERE id=$1 AND status NOT IN ('COMPLETED','SETTLED')`,
          [pairing.duel_id, result, reason, `tournament:${pairingId}`]
        );

        // The FINAL pairing status is set HERE, in the one write the pairing
        // state machine allows. A forfeit must not go through COMPLETED and
        // then try to become FORFEIT afterwards -- COMPLETED is terminal, and
        // the immutable-once-terminal trigger correctly refuses that second
        // write. reportResult is the single place a pairing's outcome lands.
        await tx.query(
          `UPDATE tournament_pairing
              SET status=$3::pairing_status, result=$2, decided_at=now()
            WHERE id=$1`,
          [pairingId, result, pairingStatus]
        );

        await tx.query(
          `INSERT INTO tournament_event (tournament_id, event, actor_type, detail)
           VALUES ($1,'PAIRING_DECIDED','SYSTEM',$2::jsonb)`,
          [pairing.tournament_id, JSON.stringify({ pairingId, result })]
        );

        return { ok: true, duelId: pairing.duel_id, tournamentId: pairing.tournament_id };
      }).then(async (res) => {
        // Rating write-back happens OUTSIDE the pairing transaction, through
        // the ordinary settlement path -- the same one every duel uses.
        if (res.ok) await settlementService.settle(res.duelId);
        return res;
      });
    },

    /**
     * Forfeit a pairing (disqualification, no-show). The opponent is awarded
     * the win; a bye-side forfeit is not possible (byes are never forfeited).
     */
    async forfeit({ pairingId, forfeitingPlayerId }, settlementService) {
      const p = await db.query(
        `SELECT seat_0, seat_1 FROM tournament_pairing WHERE id=$1`, [pairingId]
      );
      if (!p.rows.length) return { ok: false, reason: TournamentError.NOT_FOUND };
      const { seat_0 } = p.rows[0];
      const result = forfeitingPlayerId === seat_0 ? "0-1" : "1-0";
      return svc.reportResult(
        { pairingId, result, reason: "FORFEIT", pairingStatus: "FORFEIT" },
        settlementService
      );
    },

    /**
     * Advance to the next round, or finish the tournament.
     *
     * Refuses if any pairing in the current round is still undecided --
     * there is no partial round in a tournament, and pretending otherwise is
     * how standings get computed on incomplete data.
     */
    async advance(tournamentId) {
      return db.transaction(async (tx) => {
        const t = await tx.query(
          `SELECT format, game_id, time_control, swiss_rounds, status, ruleset_version
             FROM tournament WHERE id=$1 FOR UPDATE`,
          [tournamentId]
        );
        if (!t.rows.length) return { ok: false, reason: TournamentError.NOT_FOUND };
        const tour = t.rows[0];
        // FINALS is set below, mid-flow, the moment the round about to be
        // created is the last one -- so a SECOND advance() call (the one
        // that actually decides the final and finishes the tournament) is
        // made while status is already FINALS, not LIVE. Both are valid.
        if (!["LIVE", "FINALS"].includes(tour.status)) {
          return { ok: false, reason: TournamentError.WRONG_STATUS };
        }

        const curRound = await tx.query(
          `SELECT round_number FROM tournament_round WHERE tournament_id=$1
            ORDER BY round_number DESC LIMIT 1`,
          [tournamentId]
        );
        const roundNumber = curRound.rows[0].round_number;

        const pairings = await tx.query(
          `SELECT id, slot, seat_0, seat_1, result, status FROM tournament_pairing
            WHERE tournament_id=$1 AND round_number=$2 ORDER BY slot`,
          [tournamentId, roundNumber]
        );
        const undecided = pairings.rows.filter((p) => !["COMPLETED", "FORFEIT", "BYE"].includes(p.status));
        if (undecided.length) {
          return { ok: false, reason: TournamentError.ROUND_NOT_COMPLETE, pending: undecided.length };
        }

        await tx.query(
          `UPDATE tournament_round SET status='COMPLETED'::round_status, completed_at=now()
            WHERE tournament_id=$1 AND round_number=$2`,
          [tournamentId, roundNumber]
        );

        await recomputeStandings(tx, tournamentId, tour.format);

        if (tour.format === "SINGLE_ELIMINATION") {
          if (pairings.rows.length === 1) {
            // The final has been decided. The tournament is over.
            return finishTournament(tx, tournamentId);
          }
          const seedRatings = await tx.query(
            `SELECT player_id, seed_rating_x100 FROM tournament_registration WHERE tournament_id=$1`,
            [tournamentId]
          );
          const ratingOf = new Map(seedRatings.rows.map((r) => [r.player_id, r.seed_rating_x100]));

          const winners = pairings.rows.map((p) => ({
            slot: p.slot,
            winner: winnerOf(p, ratingOf),
          }));
          const nextPairings = buildNextRound(winners);
          // Exactly one pairing next round means it decides the whole
          // bracket -- the FINALS phase, shown to spectators before the
          // final match itself has been played.
          if (nextPairings.length === 1) {
            await tx.query(`UPDATE tournament SET status='FINALS'::tournament_status WHERE id=$1`, [tournamentId]);
          }
          await createRound(tx, tournamentId, roundNumber + 1, nextPairings, tour.game_id, tour.time_control, tour.ruleset_version);
          return { ok: true, round: roundNumber + 1, pairings: nextPairings.length };
        }

        // SWISS
        if (roundNumber >= tour.swiss_rounds) {
          return finishTournament(tx, tournamentId);
        }
        if (roundNumber + 1 === tour.swiss_rounds) {
          await tx.query(`UPDATE tournament SET status='FINALS'::tournament_status WHERE id=$1`, [tournamentId]);
        }

        const standings = await tx.query(
          `SELECT player_id, points::float AS points FROM tournament_standing WHERE tournament_id=$1`,
          [tournamentId]
        );
        const played = await tx.query(
          `SELECT seat_0, seat_1 FROM tournament_pairing
            WHERE tournament_id=$1 AND seat_1 IS NOT NULL`,
          [tournamentId]
        );
        const playedPairs = new Set(
          played.rows.map((r) => (r.seat_0 < r.seat_1 ? `${r.seat_0}|${r.seat_1}` : `${r.seat_1}|${r.seat_0}`))
        );
        const byeRows = await tx.query(
          `SELECT seat_0 FROM tournament_pairing WHERE tournament_id=$1 AND status='BYE'`,
          [tournamentId]
        );
        const hadBye = new Set(byeRows.rows.map((r) => r.seat_0));

        // buildSwissRound expects {playerId, points}; the query returns the
        // column as player_id. Without this mapping every entry's playerId
        // is undefined, which is how a round-2+ pairing silently ends up
        // with a NULL seat instead of a real player.
        const swissInput = standings.rows.map((r) => ({ playerId: r.player_id, points: r.points }));
        const nextPairings = buildSwissRound(swissInput, playedPairs, hadBye);
        await createRound(tx, tournamentId, roundNumber + 1, nextPairings, tour.game_id, tour.time_control, tour.ruleset_version);
        return { ok: true, round: roundNumber + 1, pairings: nextPairings.length };
      });
    },

    async standings(tournamentId) {
      const r = await db.query(
        `SELECT player_id, points::float AS points, wins, losses, draws, byes,
                buchholz::float AS buchholz, sonneborn_berger::float AS sb, rank, disqualified
           FROM tournament_standing WHERE tournament_id=$1
          ORDER BY rank NULLS LAST, points DESC, buchholz DESC`,
        [tournamentId]
      );
      return r.rows;
    },

    /**
     * Distribute the prize pool. One-time, idempotent, and structurally
     * incapable of double-paying: UNIQUE(tournament_id, player_id) on
     * tournament_settlement plus a per-player idempotent ledger key.
     */
    async settlePrizes(tournamentId) {
      return db.transaction(async (tx) => {
        const t = await tx.query(
          `SELECT tier, entry_fee_minor::text AS fee, asset, game_id, prize_structure, status,
                  priced_rake_bps, priced_min_rake_minor::text AS priced_min_rake_minor,
                  priced_max_rake_minor::text AS priced_max_rake_minor
             FROM tournament WHERE id=$1 FOR UPDATE`,
          [tournamentId]
        );
        if (!t.rows.length) return { ok: false, reason: TournamentError.NOT_FOUND };
        const tour = t.rows[0];
        // Idempotency check FIRST, matching settlement.settle()'s own
        // pattern: settling twice is a successful no-op, not a refusal --
        // status alone answers it here since settlePrizes() is the only
        // path that ever sets SETTLED.
        if (tour.status === "SETTLED") {
          return { ok: true, reason: TournamentError.ALREADY_SETTLED };
        }
        if (tour.status !== "COMPLETED") return { ok: false, reason: TournamentError.WRONG_STATUS };

        const already = await tx.query(
          `SELECT count(*)::int c FROM tournament_settlement WHERE tournament_id=$1`, [tournamentId]
        );
        if (already.rows[0].c > 0) return { ok: true, reason: TournamentError.ALREADY_SETTLED };

        // Query through `tx`, not the public svc.standings() helper -- that
        // helper runs on the outer `db`, and issuing a query on a second
        // logical connection while `tx` still holds this one is a
        // self-deadlock on PGlite's single physical connection (the outer
        // query waits forever for a connection the open transaction is
        // still holding).
        const standingsRows = await tx.query(
          `SELECT player_id, points::float AS points, wins, losses, draws, byes,
                  buchholz::float AS buchholz, sonneborn_berger::float AS sb, rank, disqualified
             FROM tournament_standing WHERE tournament_id=$1
            ORDER BY rank NULLS LAST, points DESC, buchholz DESC`,
          [tournamentId]
        );
        const standings = standingsRows.rows;

        if (tour.tier !== "CASH") {
          // Free tournaments still get ranked and recorded, just with no money.
          for (const s of standings) {
            await tx.query(
              `INSERT INTO tournament_settlement (tournament_id, player_id, rank, prize_minor)
               VALUES ($1,$2,$3,0)`,
              [tournamentId, s.player_id, s.rank]
            );
            if (s.rank === 1) await grantTournamentChampion(tx, s.player_id);
            await notify(tx, s.player_id, "TOURNAMENT_SETTLED",
              "Tournament results are final", `You finished rank ${s.rank}.`, { tournamentId, rank: s.rank });
          }
          await tx.query(
            `UPDATE tournament SET completed_at = COALESCE(completed_at, now()), status='SETTLED'::tournament_status WHERE id=$1`,
            [tournamentId]
          );
          return { ok: true, distributed: "0", entrants: standings.length };
        }

        const entrants = await tx.query(
          `SELECT player_id FROM tournament_registration WHERE tournament_id=$1 AND status='REGISTERED'`,
          [tournamentId]
        );
        const fee = BigInt(tour.fee);
        const pot = fee * BigInt(entrants.rows.length);

        let priced;
        if (tour.priced_rake_bps !== null && tour.priced_rake_bps !== undefined) {
          // The normal case for anything created after
          // db/migrations/0036_fee_snapshot.sql: the pool fee was resolved
          // and frozen at tournament CREATION time. Reading it here, rather
          // than resolving economy_resolve() with now(), is what stops an
          // admin rate change made after registration closed (or even after
          // the final round finished) from repricing a pool that already
          // collected every entrant's fee under a different rule.
          priced = {
            rake_bps: tour.priced_rake_bps,
            min_rake_minor: tour.priced_min_rake_minor ?? "0",
            max_rake_minor: tour.priced_max_rake_minor,
          };
        } else {
          // Legacy fallback ONLY: a tournament created before creation-time
          // pricing existed, or inserted directly by a test fixture. The
          // real production path (svc.create()) always carries a snapshot
          // for a CASH tournament, so this branch never runs there.
          const rule = await tx.query(
            `SELECT * FROM economy_resolve($1,'CASH'::entry_tier, now(), $2)`,
            [tour.game_id, tournamentId]
          );
          priced = rule.rows[0] ?? { rake_bps: 1000, min_rake_minor: "0", max_rake_minor: null };
        }
        const { rakeMinor } = computeRake(pot, {
          rakeBps: priced.rake_bps,
          minRakeMinor: priced.min_rake_minor ?? 0,
          maxRakeMinor: priced.max_rake_minor,
        });
        const distributable = pot - rakeMinor;

        const structure = tour.prize_structure; // [{rank,bps}]
        const prizes = structure.map((p) => ({
          rank: p.rank,
          minor: (distributable * BigInt(p.bps)) / 10000n,
        }));
        const allocated = prizes.reduce((a, p) => a + p.minor, 0n);
        // The indivisible remainder from a multi-way floor split has nowhere
        // fair to go -- there is no single "the player" to round in favour
        // of, unlike a one-to-one duel rake. It is folded into the platform
        // rake leg, explicitly, so the books balance and the number is
        // exactly what was recorded, not silently absorbed.
        const actualRake = rakeMinor + (distributable - allocated);

        const legs = [];
        for (const e of entrants.rows) legs.push({ account: `user:${e.player_id}:locked`, amount: fee.toString() });
        if (actualRake > 0n) legs.push({ account: "platform:rake", amount: (-actualRake).toString() });
        const byRank = new Map(standings.map((s) => [s.rank, s.player_id]));
        for (const p of prizes) {
          if (p.minor <= 0n) continue;
          const winner = byRank.get(p.rank);
          if (!winner) continue;
          legs.push({ account: `user:${winner}:available`, amount: (-p.minor).toString() });
        }

        const posted = await tx.query(
          `SELECT * FROM ledger_post($1,'TOURNAMENT_SETTLE','SYSTEM',NULL,$2::jsonb,$3,NULL,'tournament',$4)`,
          [`tournament:${tournamentId}:settle`, JSON.stringify(legs), tour.asset, tournamentId]
        );
        const txId = posted.rows[0].transaction_id;

        for (const s of standings) {
          const prize = prizes.find((p) => p.rank === s.rank);
          const prizeMinor = prize?.minor ?? 0n;
          await tx.query(
            `INSERT INTO tournament_settlement (tournament_id, player_id, rank, prize_minor, settlement_tx_id)
             VALUES ($1,$2,$3,$4,$5)`,
            [tournamentId, s.player_id, s.rank, prizeMinor.toString(), txId]
          );
          if (s.rank === 1) await grantTournamentChampion(tx, s.player_id);
          const body = prizeMinor > 0n
            ? `You finished rank ${s.rank} and won a prize.`
            : `You finished rank ${s.rank}.`;
          await notify(tx, s.player_id, "TOURNAMENT_SETTLED", "Tournament results are final", body,
            { tournamentId, rank: s.rank, prizeMinor: prizeMinor.toString() });
        }

        await tx.query(
          `INSERT INTO tournament_event (tournament_id, event, actor_type, detail)
           VALUES ($1,'SETTLED','SYSTEM',$2::jsonb)`,
          [tournamentId, JSON.stringify({ pot: pot.toString(), rake: actualRake.toString() })]
        );
        await tx.query(`UPDATE tournament SET status='SETTLED'::tournament_status WHERE id=$1`, [tournamentId]);

        return { ok: true, distributed: distributable.toString(), rake: actualRake.toString(), entrants: standings.length };
      });
    },
  };

  return svc;

  async function createRound(tx, tournamentId, roundNumber, pairings, gameId, timeControl, pluginVersion) {
    await tx.query(
      `INSERT INTO tournament_round (tournament_id, round_number, status, started_at)
       VALUES ($1,$2,'IN_PROGRESS'::round_status, now())`,
      [tournamentId, roundNumber]
    );

    for (const p of pairings) {
      const pairingId = `pr_${randomUUID()}`;
      if (p.seat1 === null) {
        // A bye is not a game: no duel, immediate result, one full point.
        await tx.query(
          `INSERT INTO tournament_pairing
             (id, tournament_id, round_number, slot, seat_0, seat_1, status, result, decided_at)
           VALUES ($1,$2,$3,$4,$5,NULL,'BYE'::pairing_status,'1-0', now())`,
          [pairingId, tournamentId, roundNumber, p.slot, p.seat0]
        );
        continue;
      }

      const duelId = `duel_${randomUUID()}`;
      // The SAME spawner map matchmaking's own dispatch worker uses for a
      // fresh duel of this game -- a tournament pairing is not a special
      // case for whichever plugin ends up playing it.
      const spawn = DEFAULT_SPAWNERS[gameId];
      const { initialState, seed } = spawn ? spawn() : { initialState: {}, seed: null };
      // A tournament pairing's duel is FREE tier: no per-match stake. The
      // pool was already collected once at registration.
      await tx.query(
        `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                           tier, stake_minor, initial_state, seed, time_control, status)
         VALUES ($1,$2,$3,$4,$5,$6,'FREE',0,$7::jsonb,$8,$9::jsonb,'READY'::duel_status)`,
        [duelId, gameId, pluginVersion, `tournament:${tournamentId}:r${roundNumber}:s${p.slot}`,
         p.seat0, p.seat1, JSON.stringify(initialState), seed, JSON.stringify(timeControl)]
      );
      await tx.query(
        `INSERT INTO tournament_pairing
           (id, tournament_id, round_number, slot, seat_0, seat_1, duel_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'LIVE'::pairing_status)`,
        [pairingId, tournamentId, roundNumber, p.slot, p.seat0, p.seat1, duelId]
      );
      for (const playerId of [p.seat0, p.seat1]) {
        await notify(tx, playerId, "MATCH_READY", "Your match is ready",
          `Round ${roundNumber} has begun -- your opponent is waiting.`,
          { tournamentId, roundNumber, pairingId, duelId });
      }
    }
  }

  async function notify(tx, playerId, type, title, body, data = {}) {
    await tx.query(
      `INSERT INTO notification (id, player_id, type, title, body, data)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [`ntf_${randomUUID()}`, playerId, type, title, body, JSON.stringify(data)]
    );
  }

  /**
   * TOURNAMENT_CHAMPION: rank 1 in ANY settled tournament, FREE or CASH --
   * a real, disclosed result either way, independent of whether prize
   * money moved. Every write here goes through the SAME `tx` this whole
   * settlement transaction is already running on, via plain SQL rather
   * than the achievements/badges service objects, for the identical
   * self-deadlock reason settlePrizes() itself already documents (a
   * service bound to a different connection cannot be called from inside
   * this open transaction under PGlite's single physical connection).
   */
  async function grantTournamentChampion(tx, playerId) {
    const inserted = await tx.query(
      `INSERT INTO player_achievement (player_id, achievement_code) VALUES ($1,'TOURNAMENT_CHAMPION')
         ON CONFLICT (player_id, achievement_code) DO NOTHING
       RETURNING achievement_code`,
      [playerId]
    );
    if (!inserted.rows.length) return;
    await tx.query(
      `INSERT INTO player_badge (player_id, badge_code, source) VALUES ($1,'TOURNAMENT_CHAMPION','ACHIEVEMENT'::badge_source)
         ON CONFLICT (player_id, badge_code) DO NOTHING`,
      [playerId]
    );
    await tx.query(
      `INSERT INTO exp_event (id, player_id, event_type, source, amount, dedupe_key, created_at)
       VALUES ($1,$2,'ACHIEVEMENT','TOURNAMENT_CHAMPION',$3,$4,now())
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [`xp_${randomUUID()}`, playerId, EXP_AMOUNTS.ACHIEVEMENT, `achievement:${playerId}:TOURNAMENT_CHAMPION`]
    );
  }

  async function finishTournament(tx, tournamentId) {
    await tx.query(
      `UPDATE tournament SET status='COMPLETED'::tournament_status, completed_at=now() WHERE id=$1`,
      [tournamentId]
    );
    await tx.query(
      `INSERT INTO tournament_event (tournament_id, event, actor_type) VALUES ($1,'COMPLETED','SYSTEM')`,
      [tournamentId]
    );
    return { ok: true, status: "COMPLETED" };
  }
}

function winnerOf(pairing, ratingOf) {
  if (pairing.status === "BYE") return pairing.seat_0;
  if (pairing.result === "1-0") return pairing.seat_0;
  if (pairing.result === "0-1") return pairing.seat_1;
  // A draw cannot advance two players in an elimination bracket. The
  // documented, server-determined tiebreak is the higher seed -- avoiding a
  // requirement for sudden-death infrastructure at this stage. This is a
  // disclosed limitation, not a silent one; see KNOWN ISSUES.
  const a = ratingOf.get(pairing.seat_0) ?? 0;
  const b = ratingOf.get(pairing.seat_1) ?? 0;
  return a >= b ? pairing.seat_0 : pairing.seat_1;
}

async function recomputeStandings(tx, tournamentId, format) {
  const pairings = await tx.query(
    `SELECT seat_0, seat_1, result, status FROM tournament_pairing
      WHERE tournament_id=$1 AND status IN ('COMPLETED','FORFEIT','BYE')`,
    [tournamentId]
  );
  const regs = await tx.query(
    `SELECT player_id FROM tournament_registration WHERE tournament_id=$1 AND status='REGISTERED'`,
    [tournamentId]
  );

  const stats = new Map(regs.rows.map((r) => [r.player_id, {
    points: 0, wins: 0, losses: 0, draws: 0, byes: 0, opponents: [],
  }]));

  for (const p of pairings.rows) {
    const a = stats.get(p.seat_0);
    if (p.status === "BYE") {
      if (a) { a.points += 1; a.byes += 1; }
      continue;
    }
    const b = stats.get(p.seat_1);
    if (!a || !b) continue;
    if (p.result === "1-0") { a.points += 1; a.wins++; b.losses++; }
    else if (p.result === "0-1") { b.points += 1; b.wins++; a.losses++; }
    else { a.points += 0.5; b.points += 0.5; a.draws++; b.draws++; }
    a.opponents.push({ id: p.seat_1, result: p.result });
    b.opponents.push({ id: p.seat_0, result: p.result === "1-0" ? "0-1" : p.result === "0-1" ? "1-0" : "1/2-1/2" });
  }

  // Tiebreakers, Swiss only: Buchholz needs every opponent's FINAL points, so
  // compute points first, then a second pass for Buchholz/Sonneborn-Berger.
  for (const [playerId, s] of stats) {
    let buchholz = 0, sb = 0;
    for (const o of s.opponents) {
      const opp = stats.get(o.id);
      const oppPoints = opp ? opp.points : 0;
      buchholz += oppPoints;
      if (o.result === "1-0") sb += oppPoints;
      else if (o.result === "1/2-1/2") sb += oppPoints * 0.5;
    }
    await tx.query(
      `INSERT INTO tournament_standing
         (tournament_id, player_id, points, wins, losses, draws, byes, buchholz, sonneborn_berger, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (tournament_id, player_id) DO UPDATE
         SET points=EXCLUDED.points, wins=EXCLUDED.wins, losses=EXCLUDED.losses,
             draws=EXCLUDED.draws, byes=EXCLUDED.byes, buchholz=EXCLUDED.buchholz,
             sonneborn_berger=EXCLUDED.sonneborn_berger, updated_at=now()`,
      [tournamentId, playerId, s.points, s.wins, s.losses, s.draws, s.byes, buchholz, sb]
    );
  }

  const ranked = await tx.query(
    `SELECT player_id FROM tournament_standing WHERE tournament_id=$1
      ORDER BY points DESC, buchholz DESC, sonneborn_berger DESC, player_id ASC`,
    [tournamentId]
  );
  for (let i = 0; i < ranked.rows.length; i++) {
    await tx.query(
      `UPDATE tournament_standing SET rank=$3 WHERE tournament_id=$1 AND player_id=$2`,
      [tournamentId, ranked.rows[i].player_id, i + 1]
    );
  }
  void format;
}

async function audit(db, tournamentId, event, actorType, actorId = null, detail = {}) {
  await db.query(
    `INSERT INTO tournament_event (tournament_id, event, actor_type, actor_id, detail)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [tournamentId, event, actorType, actorId, JSON.stringify(detail)]
  );
}
