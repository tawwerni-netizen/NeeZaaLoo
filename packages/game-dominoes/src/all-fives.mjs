/**
 * American All-Fives (Muggins) Dominoes Engine
 *
 * Ruleset: NIZALO-DOMINOES-ALL-FIVES-v1
 * - Double-six set: 28 tiles (0-0 through 6-6).
 * - Deal: 7 tiles to each player in 2-player mode.
 * - Boneyard: The remaining 14 tiles form the boneyard.
 * - Opening: Player with highest double leads.
 * - Scoring during play: Whenever the exposed ends of the board sum to a multiple of 5 (5, 10, 15, 20),
 *   that player immediately scores that point total.
 * - Doubles on ends: An open double at an end counts for the sum of both its ends (e.g., 5-5 = 10, 6-6 = 12)
 *   unless attached on its other sides.
 * - Drawing: A player who cannot play must draw from the boneyard until a playable tile is found
 *   or only 2 tiles remain in the boneyard.
 * - End of round: Domino-out or blocked game awards the winner the opponent's remaining pips,
 *   rounded to the nearest multiple of 5.
 */

import {
  fullSet, pipSum, sameTile, SEAT_0, SEAT_1,
} from "./dominoes.mjs";

export const ALL_TILES = fullSet();

export function canonicalise(tile) {
  if (!Array.isArray(tile) || tile.length !== 2) return null;
  const a = tile[0], b = tile[1];
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a > 6 || b < 0 || b > 6) return null;
  return a <= b ? [a, b] : [b, a];
}

export const VARIANT_ALL_FIVES = "all_fives";
export const RULESET_VERSION_ALL_FIVES = "NIZALO-DOMINOES-ALL-FIVES-v1";

function hashSeed(seed) {
  let h = 2166136261 >>> 0;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function prng(seed) {
  let a = hashSeed(seed);
  return function next() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(array, rand) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function dealAllFives(seed) {
  const rand = prng(seed);
  const deck = shuffle(ALL_TILES, rand);
  const hand0 = deck.slice(0, 7);
  const hand1 = deck.slice(7, 14);
  const boneyard = deck.slice(14); // 14 tiles
  return { hand0, hand1, boneyard };
}

/**
 * Calculates the current sum of exposed ends on the board.
 * In All-Fives:
 * - If line has 1 tile [a, b]:
 *   If a === b, it's a double and counts as a + b.
 *   If a !== b, it counts as a + b.
 * - If line has multiple tiles:
 *   Left open end value + Right open end value.
 *   If the tile at an exposed end is a double placed crosswise and has no attachments on its outer end,
 *   it counts both pips.
 */
export function calculateEndSum(line) {
  if (line.tiles.length === 0) return 0;
  if (line.tiles.length === 1) {
    const [a, b] = line.tiles[0];
    return a + b;
  }

  let sum = 0;
  // Left end: if double, both pips count (crosswise)
  const leftTile = line.tiles[0];
  if (leftTile[0] === leftTile[1]) {
    sum += leftTile[0] * 2;
  } else {
    sum += line.left;
  }

  // Right end: if double, both pips count (crosswise)
  const rightTile = line.tiles[line.tiles.length - 1];
  if (rightTile[0] === rightTile[1]) {
    sum += rightTile[0] * 2;
  } else {
    sum += line.right;
  }

  return sum;
}

export function roundToNearestFive(n) {
  const rem = n % 5;
  if (rem < 3) return n - rem;
  return n + (5 - rem);
}

export function createAllFivesState(seed, targetScore = 100) {
  const { hand0, hand1, boneyard } = dealAllFives(seed);

  // Determine highest double
  let leader = SEAT_0;
  let highestDouble = -1;

  for (const t of hand0) {
    if (t[0] === t[1] && t[0] > highestDouble) {
      highestDouble = t[0];
      leader = SEAT_0;
    }
  }
  for (const t of hand1) {
    if (t[0] === t[1] && t[0] > highestDouble) {
      highestDouble = t[0];
      leader = SEAT_1;
    }
  }

  // If no double, highest pip tile leads
  if (highestDouble === -1) {
    let maxPip0 = Math.max(...hand0.map(([a, b]) => a + b));
    let maxPip1 = Math.max(...hand1.map(([a, b]) => a + b));
    leader = maxPip0 >= maxPip1 ? SEAT_0 : SEAT_1;
  }

  return {
    variant: VARIANT_ALL_FIVES,
    rulesetVersion: RULESET_VERSION_ALL_FIVES,
    seed: String(seed),
    hands: [hand0, hand1],
    boneyard,
    scores: [0, 0],
    targetScore,
    line: {
      left: null,
      right: null,
      tiles: [],
      firstDoubleIsLeft: false,
      firstDoubleIsRight: false,
    },
    turn: leader,
    consecutivePasses: 0,
    moves: [],
    winner: null,
    isOver: false,
  };
}

export function applyAllFivesIntent(state, intent, seat) {
  if (state.isOver) return { ok: false, reason: "GAME_OVER" };
  if (state.turn !== seat) return { ok: false, reason: "NOT_YOUR_TURN" };

  const hand = state.hands[seat];
  const next = {
    ...state,
    hands: [state.hands[0].map((t) => [...t]), state.hands[1].map((t) => [...t])],
    boneyard: state.boneyard.map((t) => [...t]),
    scores: [...state.scores],
    line: { ...state.line, tiles: state.line.tiles.map((t) => [...t]) },
    moves: [...state.moves],
  };

  // Draw Action
  if (intent.action === "DRAW" || intent.draw === true) {
    if (next.boneyard.length <= 2) {
      return { ok: false, reason: "BONEYARD_EXHAUSTED" };
    }
    // Check if player already had a legal play
    const hasMove = hand.some(
      ([a, b]) =>
        next.line.left === null ||
        a === next.line.left ||
        b === next.line.left ||
        a === next.line.right ||
        b === next.line.right
    );
    if (hasMove) {
      return { ok: false, reason: "LEGAL_MOVE_EXISTS_CANNOT_DRAW" };
    }

    const drawn = next.boneyard.pop();
    next.hands[seat].push(drawn);
    next.moves.push({ seat, action: "DRAW", tileCount: 1 });

    return {
      ok: true,
      state: next,
      record: { seat, action: "DRAW" },
      events: [{ type: "DRAW", payload: { seat } }],
    };
  }

  // Pass Action
  if (intent.action === "PASS" || intent.pass === true) {
    if (next.boneyard.length > 2) {
      return { ok: false, reason: "MUST_DRAW_BEFORE_PASSING" };
    }
    const hasMove = hand.some(
      ([a, b]) =>
        next.line.left === null ||
        a === next.line.left ||
        b === next.line.left ||
        a === next.line.right ||
        b === next.line.right
    );
    if (hasMove) return { ok: false, reason: "LEGAL_MOVE_EXISTS" };

    next.consecutivePasses++;
    next.turn = seat === SEAT_0 ? SEAT_1 : SEAT_0;
    next.moves.push({ seat, action: "PASS" });

    // Check if blocked
    if (next.consecutivePasses >= 2) {
      next.isOver = true;
      const p0 = pipSum(next.hands[SEAT_0]);
      const p1 = pipSum(next.hands[SEAT_1]);
      if (p0 < p1) {
        const bonus = roundToNearestFive(p1 - p0);
        next.scores[SEAT_0] += bonus;
        next.winner = SEAT_0;
      } else if (p1 < p0) {
        const bonus = roundToNearestFive(p0 - p1);
        next.scores[SEAT_1] += bonus;
        next.winner = SEAT_1;
      } else {
        // Tie
        next.winner = next.scores[SEAT_0] >= next.scores[SEAT_1] ? (next.scores[SEAT_0] > next.scores[SEAT_1] ? SEAT_0 : null) : SEAT_1;
      }
    }

    return {
      ok: true,
      state: next,
      record: { seat, action: "PASS" },
      events: [{ type: "PASS", payload: { seat } }],
    };
  }

  // Play Tile Action
  const tile = canonicalise(intent.tile);
  if (!tile) return { ok: false, reason: "MALFORMED_TILE" };

  const tileIdx = next.hands[seat].findIndex((t) => sameTile(t, tile));
  if (tileIdx === -1) return { ok: false, reason: "NOT_IN_HAND" };

  // Board is empty (opening move)
  if (next.line.tiles.length === 0) {
    next.hands[seat].splice(tileIdx, 1);
    next.line.tiles.push(tile);
    next.line.left = tile[0];
    next.line.right = tile[1];
    if (tile[0] === tile[1]) {
      next.line.firstDoubleIsLeft = true;
      next.line.firstDoubleIsRight = true;
    }

    // Score opening if multiple of 5
    const sum = calculateEndSum(next.line);
    let scored = 0;
    if (sum > 0 && sum % 5 === 0) {
      scored = sum;
      next.scores[seat] += scored;
    }

    next.turn = seat === SEAT_0 ? SEAT_1 : SEAT_0;
    next.consecutivePasses = 0;
    next.moves.push({ seat, action: "PLAY", tile, end: "INITIAL", scored });

    return {
      ok: true,
      state: next,
      record: { seat, tile, scored },
      events: [{ type: "PLAY", payload: { seat, tile, scored } }],
    };
  }

  // Attach to existing line
  const end = intent.end || (tile[0] === next.line.left || tile[1] === next.line.left ? "LEFT" : "RIGHT");
  let legal = false;

  if (end === "LEFT") {
    if (tile[1] === next.line.left) {
      next.line.left = tile[0];
      next.line.tiles.unshift(tile);
      legal = true;
    } else if (tile[0] === next.line.left) {
      next.line.left = tile[1];
      next.line.tiles.unshift([tile[1], tile[0]]);
      legal = true;
    }
  } else if (end === "RIGHT") {
    if (tile[0] === next.line.right) {
      next.line.right = tile[1];
      next.line.tiles.push(tile);
      legal = true;
    } else if (tile[1] === next.line.right) {
      next.line.right = tile[0];
      next.line.tiles.push([tile[1], tile[0]]);
      legal = true;
    }
  }

  if (!legal) return { ok: false, reason: "ILLEGAL_ATTACHMENT" };

  next.hands[seat].splice(tileIdx, 1);
  next.consecutivePasses = 0;

  // Calculate All-Fives end sum and award points
  const sum = calculateEndSum(next.line);
  let scored = 0;
  if (sum > 0 && sum % 5 === 0) {
    scored = sum;
    next.scores[seat] += scored;
  }

  // Check Domino Out
  if (next.hands[seat].length === 0) {
    next.isOver = true;
    const oppSeat = seat === SEAT_0 ? SEAT_1 : SEAT_0;
    const oppPips = pipSum(next.hands[oppSeat]);
    const dominoBonus = roundToNearestFive(oppPips);
    next.scores[seat] += dominoBonus;
    next.winner = seat;
  } else {
    next.turn = seat === SEAT_0 ? SEAT_1 : SEAT_0;
  }

  next.moves.push({ seat, action: "PLAY", tile, end, scored });

  return {
    ok: true,
    state: next,
    record: { seat, tile, end, scored },
    events: [{ type: "PLAY", payload: { seat, tile, end, scored } }],
  };
}
