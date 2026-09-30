/**
 * Ludo 1v1 Engine
 * Pure logic for state, moves, capturing, and dice rolls.
 */

export const SEAT_0 = 0;
export const SEAT_1 = 1;

// FNV-1a hash for string seeds
function hashSeed(seed) {
  let h = 2166136261 >>> 0;
  for (const ch of String(seed || Date.now())) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// PRNG (Mulberry32 with correct accumulator progression)
export function nextRandom(state) {
  let a = typeof state.prngState === "number" ? state.prngState : hashSeed(state.prngState || state.seed || Date.now());
  a = (a + 0x6D2B79F5) | 0;
  state.prngState = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rollDice(state) {
  let r = Math.floor(nextRandom(state) * 6) + 1;
  // Anti-clustering streak suppression:
  // True randomness occasionally produces repetitive streaks (e.g. 5, 5, 5, 5).
  // In casual Ludo, non-6 numbers repeating 3+ times feels tedious and frustrating.
  // We perturb with next uniform entropy so non-6 numbers never repeat 3+ times.
  if (state.lastRoll !== undefined && state.secondLastRoll !== undefined) {
    if (r === state.lastRoll && r === state.secondLastRoll && r !== 6) {
      r = ((r + Math.floor(nextRandom(state) * 5)) % 6) + 1;
    }
  }
  state.secondLastRoll = state.lastRoll;
  state.lastRoll = r;
  return r;
}

export function freshState(seed, playerCount = 2) {
  const effectiveSeed = seed || `${Date.now()}-${Math.random()}`;
  return {
    seed: effectiveSeed,
    prngState: hashSeed(effectiveSeed),
    playerCount,
    turn: SEAT_0,
    phase: "ROLL", // "ROLL" or "MOVE"
    currentRoll: null,
    rollCount: 0,
    lastRoll: undefined,
    secondLastRoll: undefined,
    tokens: Array.from({ length: playerCount }, () => [0, 0, 0, 0]),
    moves: [],
    winner: null
  };
}

// Relative to absolute
export function getAbsolute(state, player, relative) {
  if (relative === 0 || relative >= 52) return null; // Base or Home Stretch
  
  // Calculate offset based on player count and seat
  let offset = 0;
  if (state.playerCount === 2) {
    // Players 0 and 1 sit opposite
    offset = player === 0 ? 0 : 26;
  } else {
    // 4 players (or 3): 0, 13, 26, 39
    offset = player * 13;
  }
  
  return ((relative - 1 + offset) % 52) + 1;
}

const SAFE_SQUARES_RELATIVE = [1, 9, 14, 22, 27, 35, 40, 48];

export function isSafeAbsolute(absolute) {
  return SAFE_SQUARES_RELATIVE.includes(absolute);
}

export function getLegalMoves(state, player) {
  if (state.phase !== "MOVE" || state.turn !== player) return [];
  const roll = state.currentRoll;
  const legalTokens = [];
  
  for (let i = 0; i < 4; i++) {
    const pos = state.tokens[player][i];
    if (pos === 0) {
      if (roll === 6) legalTokens.push(i); // Can spawn
    } else if (pos < 57) {
      if (pos + roll <= 57) {
        legalTokens.push(i); // Can move
      }
    }
  }
  return legalTokens;
}

export function applyMove(state, player, tokenIndex) {
  const roll = state.currentRoll;
  const pos = state.tokens[player][tokenIndex];
  let captured = false;
  let reachedHome = false;

  if (pos === 0) {
    state.tokens[player][tokenIndex] = 1; // Spawn to start
  } else {
    const nextPos = pos + roll;
    state.tokens[player][tokenIndex] = nextPos;
    if (nextPos === 57) {
      reachedHome = true;
    } else if (nextPos < 52) {
      // Check capture
      const absPos = getAbsolute(state, player, nextPos);
      if (!isSafeAbsolute(absPos)) {
        for (let opp = 0; opp < state.playerCount; opp++) {
          if (opp === player) continue;
          for (let j = 0; j < 4; j++) {
            const oppPos = state.tokens[opp][j];
            if (oppPos > 0 && oppPos < 52) {
              if (getAbsolute(state, opp, oppPos) === absPos) {
                state.tokens[opp][j] = 0; // Capture!
                captured = true;
              }
            }
          }
        }
      }
    }
  }

  // Check Win
  if (state.tokens[player].every(p => p === 57)) {
    state.winner = player;
    state.phase = "GAME_OVER";
    return;
  }

  // Determine next turn
  if (roll === 6 || captured || reachedHome) {
    // Bonus turn
    if (roll !== 6) {
      state.rollCount = 0; // Reset consecutive 6s if bonus from capture/home
    }
    state.phase = "ROLL";
    state.currentRoll = null;
  } else {
    state.rollCount = 0;
    state.turn = (player + 1) % state.playerCount;
    state.phase = "ROLL";
    state.currentRoll = null;
  }
}
