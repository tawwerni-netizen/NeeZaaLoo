/**
 * Rake arithmetic.
 *
 * Separated from the settlement transaction so it can be tested exhaustively
 * without a database. Every value is a BigInt of minor units -- there is no
 * float anywhere in this file, and there must never be.
 */

/**
 * Compute the platform fee on a pot.
 *
 * Rounding is FLOOR, which means the fraction of a minor unit that cannot be
 * represented stays with the players rather than the platform. Over millions of
 * duels this costs the platform under one minor unit per duel and buys a rule
 * that is trivially explainable: "we always round the fee down".
 *
 * @param {bigint} potMinor       total staked by both players
 * @param {object} rule           { rakeBps, minRakeMinor, maxRakeMinor }
 * @returns {{rakeMinor: bigint, residueMicroMinor: bigint}}
 *          residue is the discarded fraction, scaled by 10000, kept for audit.
 */
export function computeRake(potMinor, rule) {
  if (typeof potMinor !== "bigint") throw new TypeError("potMinor must be a BigInt");
  if (potMinor < 0n) throw new RangeError("potMinor cannot be negative");

  const bps = BigInt(rule.rakeBps);
  if (bps < 0n || bps > 2000n) {
    // Mirrors the economy_rule_rake_sane constraint. If these ever disagree,
    // the application is the one that is wrong.
    throw new RangeError(`rakeBps out of bounds: ${rule.rakeBps}`);
  }

  const numerator = potMinor * bps;          // scaled by 10000
  let rake = numerator / 10000n;             // BigInt division truncates = floor for non-negatives
  const residue = numerator - rake * 10000n; // the fraction we give back

  const min = BigInt(rule.minRakeMinor ?? 0);
  const max = rule.maxRakeMinor == null ? null : BigInt(rule.maxRakeMinor);

  if (rake < min) rake = min;
  if (max !== null && rake > max) rake = max;

  // A fee may never exceed the pot, whatever the configuration says.
  if (rake > potMinor) rake = potMinor;

  return { rakeMinor: rake, residueMicroMinor: residue };
}

/**
 * The legs of a settlement, as plain data.
 *
 * Returning legs rather than posting them keeps this pure: the same function is
 * used by the settlement transaction and by any future audit that wants to ask
 * "what should this duel have paid?" without touching the ledger.
 *
 * Conventions (see LEDGER_SPECIFICATION): user accounts are CREDIT-normal, so a
 * POSITIVE raw amount REDUCES what we owe a player, and a NEGATIVE raw amount
 * increases it.
 */
export function settlementLegs({ seat0, seat1, stakeMinor, result, rakeMinor }) {
  const s = BigInt(stakeMinor);
  const rake = BigInt(rakeMinor);
  const pot = s * 2n;

  const locked = (p) => `user:${p}:locked`;
  const available = (p) => `user:${p}:available`;

  if (result === "1/2-1/2") {
    // A draw refunds both stakes in full and takes no rake.
    //
    // This is a deliberate choice, not an oversight. Charging a fee on a drawn
    // game means both players end poorer for a game neither lost, which is the
    // single fastest way to make a skill platform feel like a house edge. The
    // cost is real (draws are common in chess at higher ratings) and accepted.
    return [
      { account: locked(seat0), amount: s.toString() },
      { account: available(seat0), amount: (-s).toString() },
      { account: locked(seat1), amount: s.toString() },
      { account: available(seat1), amount: (-s).toString() },
    ];
  }

  const winner = result === "1-0" ? seat0 : seat1;
  const loser = result === "1-0" ? seat1 : seat0;
  const payout = pot - rake;

  const legs = [
    // Release both locked stakes...
    { account: locked(loser), amount: s.toString() },
    { account: locked(winner), amount: s.toString() },
    // ...pay the winner the pot less the fee...
    { account: available(winner), amount: (-payout).toString() },
  ];
  // ...and the fee, only if there is one.
  if (rake > 0n) legs.push({ account: "platform:rake", amount: (-rake).toString() });

  return legs;
}

/** Entry: move both stakes from available into locked, before play begins. */
export function reservationLegs({ seat0, seat1, stakeMinor }) {
  const s = BigInt(stakeMinor);
  return [
    { account: `user:${seat0}:available`, amount: s.toString() },
    { account: `user:${seat0}:locked`, amount: (-s).toString() },
    { account: `user:${seat1}:available`, amount: s.toString() },
    { account: `user:${seat1}:locked`, amount: (-s).toString() },
  ];
}

/** Void: return both stakes untouched. Used for platform faults and voided duels. */
export function refundLegs({ seat0, seat1, stakeMinor }) {
  const s = BigInt(stakeMinor);
  return [
    { account: `user:${seat0}:locked`, amount: s.toString() },
    { account: `user:${seat0}:available`, amount: (-s).toString() },
    { account: `user:${seat1}:locked`, amount: s.toString() },
    { account: `user:${seat1}:available`, amount: (-s).toString() },
  ];
}
