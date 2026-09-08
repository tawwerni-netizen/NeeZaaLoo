/**
 * Pairing algorithms. Pure functions, no I/O, no database.
 *
 * Kept separate from the service for the same reason chess rules are separate
 * from the duel engine: a pairing algorithm is testable in isolation, and a
 * bracket or a Swiss round can be verified against known-correct shapes
 * without a database in the loop.
 */

/** Smallest power of two >= n. A bracket must have a power-of-two number of slots. */
export function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard single-elimination bracket seeding order for a bracket of size S
 * (a power of two). Returns an array of seed NUMBERS (1-indexed) in bracket
 * slot order, e.g. for S=8: [1,8,4,5,2,7,3,6] -- the standard "1 plays the
 * weakest possible opponent, top seeds meet last" shape used by every major
 * bracketed competition.
 *
 * Built recursively: a bracket of size S is two brackets of size S/2, with
 * the second half's seeds "mirrored" so seed 1 and seed 2 cannot meet before
 * the final.
 */
export function bracketSeedOrder(size) {
  if (size === 1) return [1];
  const half = bracketSeedOrder(size / 2);
  const out = [];
  for (const s of half) {
    out.push(s);
    out.push(size + 1 - s);
  }
  return out;
}

/**
 * Round 1 of a single-elimination bracket.
 *
 * `players` must already be sorted strongest-first (by seed rating). Byes go
 * to the TOP seeds, per standard tournament practice -- the alternative
 * (random byes) would let a weak seed skip a round by chance, which is a
 * fairness bug in a skill competition.
 *
 * @returns {{slot:number, seat0:string, seat1:string|null}[]}
 */
export function buildFirstRound(players) {
  const n = players.length;
  const size = nextPow2(n);
  const order = bracketSeedOrder(size);
  const byes = size - n;

  // A seed number > n has no player behind it -- that slot is empty, and its
  // opponent (a real seed <= n) receives a bye automatically.
  const bySeed = (seedNum) => (seedNum <= n ? players[seedNum - 1] : null);

  const pairings = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = bySeed(order[i]);
    const b = bySeed(order[i + 1]);
    // Exactly one of a/b can be null (a bracket never empties both slots of
    // a pairing when byes <= size/2, which nextPow2 guarantees).
    pairings.push({
      slot: i / 2,
      seat0: a ?? b,
      seat1: a && b ? b : null,
    });
  }

  if (pairings.filter((p) => p.seat1 === null).length !== byes) {
    // Defensive: this would indicate a bug in the seeding math, not user input.
    throw new Error("bracket seeding produced an inconsistent number of byes");
  }
  return pairings;
}

/**
 * Round 2+ of a single-elimination bracket.
 *
 * Slot i and slot i+1 in the previous round feed slot floor(i/2) in the next.
 * A bye's "winner" is simply its sole occupant, so this function does not
 * need to special-case byes -- it only needs to know who won each slot.
 *
 * @param {{slot:number, winner:string}[]} previousRoundWinners
 */
export function buildNextRound(previousRoundWinners) {
  const bySlot = new Map(previousRoundWinners.map((w) => [w.slot, w.winner]));
  const slots = [...bySlot.keys()].sort((a, b) => a - b);
  const pairings = [];
  for (let i = 0; i < slots.length; i += 2) {
    const a = bySlot.get(slots[i]);
    const b = bySlot.get(slots[i + 1]);
    pairings.push({ slot: i / 2, seat0: a, seat1: b ?? null });
  }
  return pairings;
}

/**
 * One round of Swiss pairing.
 *
 * Standard "fold within score group" method: group players by current score,
 * and within each group pair the top half against the bottom half (1 vs
 * ceil(k/2)+1, 2 vs ceil(k/2)+2, ...), which spreads rematches out compared
 * to naive adjacent pairing. Where a pairing would be a rematch, it is
 * swapped with the next available opponent in an adjacent group.
 *
 * The player with the fewest points who has not yet had a bye receives one
 * if the field is odd. A bye is worth a full point and is not a game.
 *
 * @param {{playerId:string, points:number}[]} standings sorted is NOT required
 * @param {Set<string>} playedPairs   canonical "a|b" (a<b) pairs already played
 * @param {Set<string>} hadBye        players who have already had a bye
 */
export function buildSwissRound(standings, playedPairs, hadBye) {
  const pool = [...standings].sort((a, b) => b.points - a.points || 0);

  let byePlayer = null;
  if (pool.length % 2 === 1) {
    // Lowest score first; among ties, whoever has not had a bye.
    for (let i = pool.length - 1; i >= 0; i--) {
      if (!hadBye.has(pool[i].playerId)) { byePlayer = pool[i]; break; }
    }
    if (!byePlayer) byePlayer = pool[pool.length - 1]; // everyone has had one; least harm
    pool.splice(pool.indexOf(byePlayer), 1);
  }

  // Group by exact score.
  const groups = [];
  for (const p of pool) {
    const last = groups[groups.length - 1];
    if (last && last[0].points === p.points) last.push(p);
    else groups.push([p]);
  }

  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pairings = [];
  let slot = 0;
  let floaters = []; // players pushed down from a group because of a rematch

  for (let g = 0; g < groups.length; g++) {
    const group = [...floaters, ...groups[g]];
    floaters = [];
    const half = Math.ceil(group.length / 2);
    const top = group.slice(0, half);
    const bottom = group.slice(half);

    for (let i = 0; i < top.length; i++) {
      const a = top[i];
      const bIdx = i < bottom.length ? i : -1;

      // Try the natural (positional) opponent first, but ALWAYS check it is
      // still present: an earlier iteration in this same loop may have
      // already claimed bottom[bIdx] via the rematch-avoidance scan below,
      // nulling a slot other than its own naive index. Touching .playerId
      // on that slot without this guard is a null-pointer bug, not a
      // theoretical one -- it is exactly what a 6-player field with one
      // early rematch triggers.
      let found = -1;
      if (bIdx >= 0 && bottom[bIdx] && !playedPairs.has(pairKey(a.playerId, bottom[bIdx].playerId))) {
        found = bIdx;
      } else {
        // Find any opponent in `bottom` that still exists and has not
        // already played `a`; if none exists, `a` floats to the next group.
        for (let j = 0; j < bottom.length; j++) {
          if (bottom[j] && !playedPairs.has(pairKey(a.playerId, bottom[j].playerId))) {
            found = j;
            break;
          }
        }
      }

      if (found === -1) {
        floaters.push(a);
        continue;
      }
      const b = bottom[found];
      bottom[found] = null;
      pairings.push({ slot: slot++, seat0: a.playerId, seat1: b.playerId });
    }
    floaters.push(...bottom.filter(Boolean));
  }

  // Anyone left over (rematch avoidance exhausted the pool) is paired off
  // among themselves as a last resort -- a repeated pairing is a far smaller
  // fairness cost than a missing round.
  for (let i = 0; i < floaters.length; i += 2) {
    if (floaters[i + 1]) {
      pairings.push({ slot: slot++, seat0: floaters[i].playerId, seat1: floaters[i + 1].playerId });
    } else if (byePlayer) {
      // An odd floater and the pre-assigned bye: merge them rather than
      // create two byes in one round.
      pairings.push({ slot: slot++, seat0: floaters[i].playerId, seat1: byePlayer.playerId });
      byePlayer = null;
    }
  }

  if (byePlayer) pairings.push({ slot: slot++, seat0: byePlayer.playerId, seat1: null });

  return pairings;
}
