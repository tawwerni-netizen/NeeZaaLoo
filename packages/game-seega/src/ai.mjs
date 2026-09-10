/**
 * The Seega AI adapter -- same contract as every other launch game's own
 * ai.mjs: pure, and never anything but a legal action (the platform
 * revalidates it through the ordinary INTENT path regardless).
 *
 * Placement phase: no captures are possible yet (seega.mjs's own header),
 * so there is nothing to search -- the heuristic instead favours squares
 * that matter once movement starts: adjacent to the center (the only
 * square anyone can move into first) and adjacent to the bot's own
 * already-placed pieces (a cluster defends itself; an isolated piece is
 * an easy flank later).
 *
 * Movement phase: a shallow 2-ply heuristic search -- prefer a move that
 * captures now; among those, and among non-capturing moves, penalise
 * landing somewhere the opponent could capture right back next turn.
 * Lower tiers add a seeded blunder chance (a uniformly random legal
 * action instead), the same construction every other adapter in this
 * codebase uses.
 */
import {
  Phase, CENTER, other, seatOf, legalPlacements, legalMoves, orthogonalNeighbors, applyMove,
} from "./seega.mjs";

export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT",
});

const TIER = Object.freeze({
  [Difficulty.EASY]:   { blunderChance: 0.50 },
  [Difficulty.MEDIUM]: { blunderChance: 0.22 },
  [Difficulty.HARD]:   { blunderChance: 0.07 },
  [Difficulty.EXPERT]: { blunderChance: 0 },
});

function rngFrom(seed) {
  let h = 2166136261 >>> 0;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return function next() {
    h |= 0; h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scorePlacement(board, seat, place) {
  let score = 0;
  for (const n of orthogonalNeighbors(place)) {
    if (n === CENTER) score += 3;
    else if (seatOf(board[n]) === seat) score += 1;
  }
  return score;
}

/** True if, after `board`, `seat` has at least one move that would
 * capture something -- the shallow "would I get punished for this"
 * check the movement heuristic uses one ply deep. */
function opponentHasCaptureAvailable(board, seat) {
  for (const m of legalMoves(board, seat)) {
    const { captured } = applyMove(board, m.from, m.to, seat);
    if (captured.length > 0) return true;
  }
  return false;
}

function scoreMove(board, seat, move) {
  const { board: next, captured } = applyMove(board, move.from, move.to, seat);
  let score = captured.length * 10;
  if (opponentHasCaptureAvailable(next, other(seat))) score -= 6;
  for (const n of orthogonalNeighbors(move.to)) {
    if (n === CENTER) score += 1;
  }
  return score;
}

export function createSeegaAiAdapter() {
  return {
    chooseAction(state, seat, difficulty, _deadlineMs, seed = "ai") {
      const tier = TIER[difficulty] ?? TIER[Difficulty.MEDIUM];
      const rnd = rngFrom(`${seed}:${state.moves.length}`);

      if (state.phase === Phase.PLACEMENT) {
        const candidates = legalPlacements(state.board);
        if (candidates.length === 0) return null;
        if (tier.blunderChance > 0 && rnd() < tier.blunderChance) {
          return { place: candidates[Math.floor(rnd() * candidates.length)] };
        }
        let best = candidates[0];
        let bestScore = scorePlacement(state.board, seat, best);
        for (const c of candidates.slice(1)) {
          const s = scorePlacement(state.board, seat, c);
          if (s > bestScore) { best = c; bestScore = s; }
        }
        return { place: best };
      }

      const candidates = legalMoves(state.board, seat);
      if (candidates.length === 0) return null;
      if (tier.blunderChance > 0 && rnd() < tier.blunderChance) {
        const m = candidates[Math.floor(rnd() * candidates.length)];
        return { from: m.from, to: m.to };
      }
      let best = candidates[0];
      let bestScore = scoreMove(state.board, seat, best);
      for (const c of candidates.slice(1)) {
        const s = scoreMove(state.board, seat, c);
        if (s > bestScore) { best = c; bestScore = s; }
      }
      return { from: best.from, to: best.to };
    },
  };
}
