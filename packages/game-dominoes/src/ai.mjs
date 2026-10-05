/**
 * The Dominoes AI adapter -- same contract as every other launch game's
 * own ai.mjs: pure, and never anything but a legal action (the platform
 * revalidates it through the ordinary INTENT path regardless).
 *
 * Search: not a lookahead search -- dominoes' branching factor from a
 * hidden-information hand makes a real minimax pointless without also
 * modelling the opponent's unknown tiles. Instead, a simple, honest
 * heuristic: among legal placements, prefer unloading the HEAVIEST tile
 * (highest pip total) first -- the standard, sound "get rid of your
 * expensive tiles before a block scores them against you" instinct any
 * competent player follows -- with a seeded blunder chance (picking a
 * random legal placement instead) for lower tiers, the same construction
 * every other adapter in this codebase uses.
 */
import { legalEndsForTile, rngFrom, sameTile } from "./dominoes.mjs";

export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT", INVINCIBLE: "INVINCIBLE",
});

const TIER = Object.freeze({
  [Difficulty.EASY]:   { blunderChance: 0.50 },
  [Difficulty.MEDIUM]: { blunderChance: 0.22 },
  [Difficulty.HARD]:   { blunderChance: 0.07 },
  [Difficulty.EXPERT]: { blunderChance: 0 },
  [Difficulty.INVINCIBLE]: { blunderChance: 0 },
});

function legalCandidates(hand, line) {
  const candidates = [];
  for (const tile of hand) {
    const ends = legalEndsForTile(tile, line);
    for (const end of ends) candidates.push({ tile, end: end === "ANY" ? undefined : end });
  }
  return candidates;
}

export function createDominoesAiAdapter() {
  return {
    chooseAction(state, seat, difficulty, _deadlineMs, seed = "ai") {
      const tier = TIER[difficulty] ?? TIER[Difficulty.EXPERT];
      const hand = state.hands[seat];

      // The forced opening double (dominoes.mjs's own ruleset doc) is not
      // a choice at all -- every tier plays it, exactly like a human
      // would have no alternative either.
      if (state.openingConstraint && state.openingConstraint.seat === seat) {
        return { tile: state.openingConstraint.tile };
      }

      const candidates = legalCandidates(hand, state.line);
      if (candidates.length === 0) return { pass: true };

      const rnd = rngFrom(`${seed}:${state.moves.length}`);
      if (tier.blunderChance > 0 && rnd() < tier.blunderChance) {
        return candidates[Math.floor(rnd() * candidates.length)];
      }

      // Heaviest tile first; a stable tie-break (favour a double, then
      // higher secondary pip) keeps this deterministic for a given state
      // rather than depending on hand iteration order.
      let best = candidates[0];
      let bestWeight = weightOf(best.tile);
      for (const c of candidates.slice(1)) {
        const w = weightOf(c.tile);
        if (w > bestWeight || (w === bestWeight && !sameTile(c.tile, best.tile) && isBetterTiebreak(c.tile, best.tile))) {
          best = c;
          bestWeight = w;
        }
      }
      return best;
    },
  };
}

function weightOf(tile) {
  return tile[0] + tile[1];
}

function isBetterTiebreak(a, b) {
  const aDouble = a[0] === a[1], bDouble = b[0] === b[1];
  if (aDouble !== bDouble) return aDouble;
  return a[1] > b[1];
}
