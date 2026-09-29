import { freshState, getLegalMoves, applyMove, rollDice, SEAT_0, SEAT_1 } from "./ludo.mjs";

function cloneState(state) {
  return {
    seed: state.seed,
    prngState: state.prngState,
    playerCount: state.playerCount,
    turn: state.turn,
    phase: state.phase,
    currentRoll: state.currentRoll,
    rollCount: state.rollCount,
    tokens: state.tokens.map(t => [...t]),
    moves: [...state.moves],
    winner: state.winner
  };
}

export const LudoPlugin = {
  id: "ludo",
  version: 1,
  turnModel: "ALTERNATING", // even with consecutive turns, the duel engine's turn timer matches state.turn

  createChallenge(seed, _config = {}) {
    const playerCount = _config.playerCount || 2;
    return { state: freshState(seed, playerCount), publicSeed: null };
  },

  rehydrate(initial) {
    const playerCount = initial.config?.playerCount || (initial.tokens ? initial.tokens.length : (initial.playerCount || 2));
    return { state: freshState(initial.seed, playerCount) };
  },

  applyIntent(state, intent, ctx) {
    if (typeof intent !== "object" || intent === null) return { ok: false, reason: "MALFORMED" };
    if (state.turn !== ctx.seat) return { ok: false, reason: "NOT_YOUR_TURN" };
    if (state.phase === "GAME_OVER") return { ok: false, reason: "GAME_OVER" };

    const next = cloneState(state);

    if (intent.action === "ROLL") {
      if (next.phase !== "ROLL") return { ok: false, reason: "ILLEGAL" };
      
      const r = rollDice(next);
      next.currentRoll = r;
      next.phase = "MOVE";
      
      if (r === 6) {
        next.rollCount += 1;
        if (next.rollCount === 3) {
          // 3rd six forfeits the turn
          next.rollCount = 0;
          next.currentRoll = null;
          next.phase = "ROLL";
          next.turn = (next.turn + 1) % next.playerCount;
          next.moves.push({ seat: ctx.seat, action: "ROLL", roll: r, forfeit: true });
          return {
            ok: true,
            state: next,
            record: { action: "ROLL", seat: ctx.seat, roll: r, forfeit: true },
            events: [{ type: "ROLL", payload: { seat: ctx.seat, roll: r, forfeit: true } }]
          };
        }
      }

      // Check if they have any valid moves. If not, auto-pass to next player.
      const legals = getLegalMoves(next, ctx.seat);
      if (legals.length === 0) {
        next.moves.push({ seat: ctx.seat, action: "ROLL", roll: r, skipped: true });
        // Bonus roll if they rolled 6 but can't move? Usually 6 means you spawn, so you can always move, 
        // unless all tokens are home/blocked. If rolled 6 but can't move, keep turn? No, standard is pass.
        // Actually if roll=6 they get another turn regardless.
        if (r !== 6) {
          next.turn = (next.turn + 1) % next.playerCount;
          next.rollCount = 0;
        }
        next.phase = "ROLL";
        next.currentRoll = null;
        
        return {
          ok: true,
          state: next,
          record: { action: "ROLL", seat: ctx.seat, roll: r, skipped: true },
          events: [{ type: "ROLL", payload: { seat: ctx.seat, roll: r, skipped: true } }]
        };
      }

      next.moves.push({ seat: ctx.seat, action: "ROLL", roll: r });
      return {
        ok: true,
        state: next,
        record: { action: "ROLL", seat: ctx.seat, roll: r },
        events: [{ type: "ROLL", payload: { seat: ctx.seat, roll: r } }]
      };
    }

    if (intent.action === "MOVE") {
      if (next.phase !== "MOVE") return { ok: false, reason: "ILLEGAL" };
      
      const legals = getLegalMoves(next, ctx.seat);
      if (!legals.includes(intent.tokenIndex)) return { ok: false, reason: "ILLEGAL" };
      
      applyMove(next, ctx.seat, intent.tokenIndex);
      next.moves.push({ seat: ctx.seat, action: "MOVE", tokenIndex: intent.tokenIndex });
      
      return {
        ok: true,
        state: next,
        record: { action: "MOVE", seat: ctx.seat, tokenIndex: intent.tokenIndex },
        events: [{ type: "MOVE", payload: { seat: ctx.seat, tokenIndex: intent.tokenIndex, tokens: next.tokens } }]
      };
    }

    return { ok: false, reason: "MALFORMED" };
  },

  evaluate(state) {
    if (state.winner !== null) {
      const res = Array(state.playerCount).fill(0);
      res[state.winner] = 1;
      return { result: res.join("-"), reason: "ALL_HOME" };
    }
    return null;
  },

  score(state) {
    if (state.winner !== null) {
      const res = Array(state.playerCount).fill(0);
      res[state.winner] = 1;
      return res;
    }
    return Array(state.playerCount).fill(1 / state.playerCount);
  },

  project(state, viewer, seat = null) {
    // Open info game, everything is visible
    return {
      turn: state.turn,
      phase: state.phase,
      currentRoll: state.currentRoll,
      rollCount: state.rollCount,
      tokens: state.tokens,
      legalMoves: seat !== null ? getLegalMoves(state, seat) : []
    };
  },

  fairPlaySignals(_state, _history = {}) {
    return [];
  },

  serializeReplay(state, { initialOnly = false } = {}) {
    return initialOnly ? { seed: state.seed } : { seed: state.seed, moves: state.moves };
  },
};
