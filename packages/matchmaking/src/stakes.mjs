/**
 * The one, canonical competitive stake ladder -- shared by every mode that
 * can offer a real-money game (RANDOM OPPONENT's matchmaking_ticket pool,
 * PLAY WITH FRIEND's duel_challenge). A single source of truth here is what
 * makes "the UI must never allow an invalid value; the backend must
 * revalidate everything" actually true: the frontend renders this same
 * list rather than hand-typing it a second time, and every service that
 * accepts a stake calls `isValidStakeMinor()` before it ever reaches a
 * ticket row, a challenge row, or a duel.
 *
 * $2000 is not an arbitrary ceiling: packages/payments/src/payments.mjs's
 * own DEFAULTS.maxWithdrawalMinor documents this exact figure as "the same
 * ceiling the platform already uses as its maximum competitive stake" --
 * this file is that ceiling's other half, made real rather than aspirational.
 */
const USDT_MINOR = 1_000_000n;

export const STAKE_PRESETS_USD = Object.freeze([2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000]);

export const STAKE_PRESETS_MINOR = Object.freeze(
  STAKE_PRESETS_USD.map((usd) => BigInt(usd) * USDT_MINOR)
);

export const MAX_STAKE_MINOR = STAKE_PRESETS_MINOR[STAKE_PRESETS_MINOR.length - 1];

/** `stakeMinor` may be a BigInt, a numeric string, or a number -- callers
 * hand this whatever came off a JSON body or a DB row's ::text cast. */
export function isValidStakeMinor(stakeMinor) {
  let n;
  try { n = BigInt(stakeMinor); } catch { return false; }
  return STAKE_PRESETS_MINOR.some((p) => p === n);
}
