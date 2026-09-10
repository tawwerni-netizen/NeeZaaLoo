/**
 * Server-authoritative Dominoes rules.
 *
 * ============================================================================
 * RULESET: Nizalo Dominoes Ruleset v1 -- Double-Six Block Dominoes (2-player)
 * ============================================================================
 * This is the ONE launch ruleset. It does not mix in Draw Dominoes (a
 * boneyard players draw from when they cannot play), Muggins/All Fives
 * (scoring by multiples of five on the open ends), Mexican Train, Chicken
 * Foot, or a "spinner" variant where doubles are played perpendicular and
 * open a fourth line of play. Every rule below is drawn from the single,
 * internally consistent BLOCK variant of Double-Six dominoes:
 *
 *   - Set: the standard double-six set, 28 tiles, every unordered pair of
 *     pip values 0-6 inclusive (0-0 through 6-6), each appearing once.
 *   - Deal: 7 tiles to each of the 2 players (14 dealt). The remaining 14
 *     tiles are NOT a boneyard -- they stay OUT OF PLAY for the entire
 *     game. There is no drawing. This is the defining difference from
 *     Draw Dominoes and the reason a player who cannot play must pass
 *     rather than draw.
 *   - Opening leader: whichever player holds the highest-value double
 *     (6-6 first, then 5-5, and so on) leads, and MUST play that double
 *     as their first tile. If NEITHER hand holds any double at all (a
 *     real, if unlikely, possibility when only half the set is dealt),
 *     the player holding the single heaviest tile (highest total pips)
 *     leads instead, with a completely free choice of opening tile.
 *   - Turn sequence: players alternate strictly. On your turn, if your
 *     hand holds at least one tile that matches the pip value exposed at
 *     either open end of the line of play, you MUST play one (your
 *     choice of which tile, and which end, when more than one is legal).
 *     A tile is played by placing it so the matching pip touches the
 *     open end; its other pip becomes the new open end there. A double
 *     is placed the same way as any other tile -- it does NOT act as a
 *     spinner and does NOT open a second line of play (see this file's
 *     own header on regional variants not mixed in here).
 *   - Passing: if your hand holds no tile that matches either open end,
 *     you must pass -- turn passes to the opponent with no other effect.
 *   - The game ends the instant EITHER: (a) a player plays their last
 *     tile ("domino out"), who wins immediately; or (b) two passes occur
 *     back to back (neither player could move) -- the game is BLOCKED.
 *   - Scoring on a domino-out win: the winner scores the sum of the pips
 *     still held by the opponent.
 *   - Scoring on a block: each player's hand pip-total is compared. The
 *     LOWER total wins, scoring the difference between the two totals.
 *     If both hands hold an IDENTICAL pip total when blocked, the game
 *     is drawn -- the only draw condition in this ruleset.
 *   - Special cases: doubles are not spinners (see above); the 14
 *     undealt tiles are never revealed or used; a player who holds a
 *     legal tile may never pass instead (enforced server-side, not
 *     merely a house rule).
 *
 * Pure functions over an explicit state object -- no module-level mutable
 * state, no clock, no I/O, the same discipline as every other ruleset
 * module in this codebase (chess.mjs, checkers.mjs, xo.mjs).
 */

export const SEAT_0 = 0, SEAT_1 = 1;

/** Every unordered tile in a double-six set, canonicalised low-pip-first,
 * i.e. `[a, b]` with `a <= b`. 28 tiles total. */
export function fullSet() {
  const tiles = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) tiles.push([a, b]);
  }
  return tiles;
}

export function pipSum(hand) {
  return hand.reduce((total, [a, b]) => total + a + b, 0);
}

export function isDouble(tile) {
  return tile[0] === tile[1];
}

export function sameTile(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Deterministic PRNG (mulberry32 over an FNV-1a hashed seed) -- the same
 * construction every other plugin in this codebase uses for its own
 * seeded randomness (see game-speed-math/src/plugin.mjs's own header on
 * why determinism from a seed, rather than Math.random, is what makes a
 * duel replayable and auditable rather than merely "random enough").
 */
export function rngFrom(seed) {
  let h = 2166136261 >>> 0;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return function next() {
    h |= 0; h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fair (Fisher-Yates) shuffle of the full set, seeded -- the same
 * shuffled order is produced by the same seed on the server, in a
 * replay, and in an audit, and by nobody else without that seed. */
export function shuffledDeck(seed) {
  const rnd = rngFrom(seed);
  const deck = fullSet();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Deals 7 tiles to each of 2 players from a seeded shuffle. The
 * remaining 14 tiles are simply never referenced again -- see this
 * file's own header on why that is a rule, not an omission. */
export function dealHands(seed) {
  const deck = shuffledDeck(seed);
  return { hand0: deck.slice(0, 7), hand1: deck.slice(7, 14) };
}

function highestDouble(hand) {
  let best = null;
  for (const tile of hand) {
    if (isDouble(tile) && (best === null || tile[0] > best[0])) best = tile;
  }
  return best;
}

/** The single heaviest (highest total-pip) tile across BOTH hands, with a
 * fully deterministic tie-break (higher pip sum, then higher high-value,
 * then higher low-value, then seat 0 before seat 1) so this never depends
 * on iteration order or Math.random. Returns `{ seat, tile }`. */
function heaviestTileAcross(hand0, hand1) {
  let best = null; // { seat, tile }
  const consider = (seat, hand) => {
    for (const tile of hand) {
      if (
        best === null ||
        tile[0] + tile[1] > best.tile[0] + best.tile[1] ||
        (tile[0] + tile[1] === best.tile[0] + best.tile[1] && tile[1] > best.tile[1]) ||
        (tile[0] + tile[1] === best.tile[0] + best.tile[1] && tile[1] === best.tile[1] && tile[0] > best.tile[0])
      ) {
        best = { seat, tile };
      }
    }
  };
  consider(SEAT_0, hand0);
  consider(SEAT_1, hand1);
  return best;
}

/**
 * Who leads, and whether they are FORCED to open with a specific double
 * (see this file's own header). Returns `{ leader, mustPlayTile }` --
 * `mustPlayTile` is `null` when the leader has a completely free choice.
 */
export function determineOpening(hand0, hand1) {
  const d0 = highestDouble(hand0);
  const d1 = highestDouble(hand1);
  if (d0 || d1) {
    if (d0 && (!d1 || d0[0] >= d1[0])) return { leader: SEAT_0, mustPlayTile: d0 };
    return { leader: SEAT_1, mustPlayTile: d1 };
  }
  const heaviest = heaviestTileAcross(hand0, hand1);
  return { leader: heaviest.seat, mustPlayTile: null };
}

export function initialLine() {
  return { left: null, right: null, tiles: [] };
}

/** Which open end(s) of `line` this tile could legally attach to.
 * `["ANY"]` is a sentinel meaning "the line is still empty -- this is
 * the very first tile of the game, and any tile may open it". */
export function legalEndsForTile(tile, line) {
  if (line.tiles.length === 0) return ["ANY"];
  const ends = [];
  if (tile[0] === line.left || tile[1] === line.left) ends.push("LEFT");
  if (tile[0] === line.right || tile[1] === line.right) ends.push("RIGHT");
  return ends;
}

export function handHasLegalMove(hand, line) {
  return hand.some((tile) => legalEndsForTile(tile, line).length > 0);
}

/** Attach an already-validated tile to `line` at `end` ("LEFT"/"RIGHT",
 * ignored -- either works identically -- when the line is still empty).
 * Pure: returns a NEW line object, or `null` if the tile genuinely does
 * not match that end (defensive; callers are expected to have already
 * checked `legalEndsForTile`). */
export function attach(line, tile, end) {
  const [a, b] = tile;
  if (line.tiles.length === 0) {
    return { left: a, right: b, tiles: [{ tile, orientation: [a, b] }] };
  }
  if (end === "LEFT") {
    if (a !== line.left && b !== line.left) return null;
    const other = a === line.left ? b : a;
    return {
      left: other,
      right: line.right,
      tiles: [{ tile, orientation: [other, line.left] }, ...line.tiles],
    };
  }
  if (a !== line.right && b !== line.right) return null;
  const other = a === line.right ? b : a;
  return {
    left: line.left,
    right: other,
    tiles: [...line.tiles, { tile, orientation: [line.right, other] }],
  };
}
