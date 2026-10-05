/**
 * USDT (and every other supported asset today) is stored as signed integer
 * minor units, 6 decimal places -- see packages/ledger's own I6 invariant.
 * This is the one place the admin dashboard turns that into a human string;
 * it never rounds through a float.
 */
export function fromMinorUnits(minor: string | number | null | undefined): number {
  if (minor === null || minor === undefined) return 0;
  return Number(BigInt(minor)) / 1_000_000;
}

export function formatUsd(minor: string | number | null | undefined, { compact = false }: { compact?: boolean } = {}): string {
  const n = fromMinorUnits(minor);
  if (compact) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCompactNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
