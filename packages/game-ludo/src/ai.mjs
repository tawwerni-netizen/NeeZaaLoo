import { getLegalMoves, getAbsolute, isSafeAbsolute } from "./ludo.mjs";

export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT",
});

const TIER = Object.freeze({
  [Difficulty.EASY]:   { blunderChance: 0.60 },
  [Difficulty.MEDIUM]: { blunderChance: 0.25 },
  [Difficulty.HARD]:   { blunderChance: 0.05 },
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

function scoreMove(state, seat, tokenIndex, rnd) {
  const roll = state.currentRoll;
  const pos = state.tokens[seat][tokenIndex];
  let score = rnd(); // Small random tie-breaker

  if (pos === 0) {
    // Escaping base is very good
    score += 50;
  } else {
    const nextPos = pos + roll;
    if (nextPos === 57) {
      // Reaching finish line is the best
      score += 100;
    } else if (nextPos >= 52) {
      // Entering home stretch is safe and good
      score += 30;
      // Closer to finish is slightly better
      score += (nextPos - 52); 
    } else if (nextPos < 52) {
      const absPos = getAbsolute(state, seat, nextPos);
      
      // Check for captures
      if (!isSafeAbsolute(absPos)) {
        let captures = false;
        for (let opp = 0; opp < state.playerCount; opp++) {
          if (opp === seat) continue;
          for (let j = 0; j < 4; j++) {
            const oppPos = state.tokens[opp][j];
            if (oppPos > 0 && oppPos < 52) {
              if (getAbsolute(state, opp, oppPos) === absPos) {
                captures = true;
                break;
              }
            }
          }
          if (captures) break;
        }
        if (captures) score += 75; // Capturing is highly prioritized
      } else {
        // Landing on a safe square
        score += 20;
      }
      
      // Fleeing from danger? (Simplistic check: if current pos is unsafe, moving is good)
      const currentAbs = getAbsolute(state, seat, pos);
      if (!isSafeAbsolute(currentAbs)) {
        score += 10;
      }
    }
  }
  return score;
}

export function createLudoAiAdapter() {
  return {
    chooseAction(state, seat, difficulty, _deadlineMs, seed = "ai") {
      if (state.phase === "ROLL") {
        return { action: "ROLL" };
      }
      
      const legals = getLegalMoves(state, seat);
      if (legals.length === 0) {
        return null;
      }
      
      const rnd = rngFrom(`${seed}:${state.moves.length}`);
      const tier = TIER[difficulty] || TIER.EXPERT;
      
      if (tier.blunderChance > 0 && rnd() < tier.blunderChance) {
        // Blunder: random move
        const index = Math.floor(rnd() * legals.length);
        return { action: "MOVE", tokenIndex: legals[index] };
      }
      
      // Smart move
      let bestIndex = legals[0];
      let bestScore = -Infinity;
      
      for (const tokenIndex of legals) {
        const score = scoreMove(state, seat, tokenIndex, rnd);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = tokenIndex;
        }
      }
      
      return { action: "MOVE", tokenIndex: bestIndex };
    }
  };
}
