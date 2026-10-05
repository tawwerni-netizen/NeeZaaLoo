"use client";

/**
 * A real, honest before/after EXP and rating snapshot for the result
 * ceremony -- never fabricated, never a client-computed guess. Both
 * reads go through GET /v1/players/:nickname (the full public profile,
 * packages/profile/src/service.mjs's own publicProfileFor), using the
 * viewer's OWN current handle from auth-context -- which is always
 * correct for a viewer's OWN profile, unlike resolving an opponent's id
 * through a route keyed by nickname (see PlayerStrip's own header on
 * why that distinction matters for anyone else's identity).
 *
 * "Before" is captured once, on mount -- i.e. before this duel could
 * possibly have changed anything. "After" is captured starting the instant
 * the duel completes, but settlement (rating) and progression (EXP,
 * achievements) are two SEPARATE sweep-based workers on their own
 * multi-second ticks (packages/settlement, packages/progression) that do
 * not land atomically -- rating routinely shows up a whole sweep cycle
 * before EXP/achievements do. So this polls a fixed number of times
 * regardless of whether an early read already shows a partial change,
 * updating the delta after every read: a rating change can genuinely
 * appear a beat before an achievement does, and stopping at the first
 * sign of ANY change would freeze the ceremony on that partial state and
 * never show the achievement at all. Only ever what the server has
 * actually written at each read -- never a fabricated number.
 */
import { useEffect, useRef, useState } from "react";
import { get } from "./api";

type ProfileSnapshot = {
  exp: { level: number; totalExp: number };
  ratings: { gameId: string; rating: number }[];
  achievements: string[];
};

export type ProgressionDelta = {
  expGained: number;
  levelBefore: number;
  levelAfter: number;
  ratingBefore: number | null;
  ratingAfter: number | null;
  /** Achievement codes present after this duel but not before -- a real,
   * server-awarded unlock (see packages/profile/src/achievements.mjs),
   * never inferred client-side from the outcome. Empty on every duel that
   * didn't unlock anything, which is most of them. */
  newAchievements: string[];
};

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 1500;

export function useProgressionSnapshot(handle: string | undefined, gameId: string | undefined, completed: boolean) {
  const beforeRef = useRef<ProfileSnapshot | null>(null);
  const startedRef = useRef(false);
  const [delta, setDelta] = useState<ProgressionDelta | null>(null);

  useEffect(() => {
    if (!handle || beforeRef.current) return;
    let cancelled = false;
    void get<ProfileSnapshot>(`/v1/players/${encodeURIComponent(handle)}`)
      .then((r) => { if (!cancelled) beforeRef.current = r; })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [handle]);

  useEffect(() => {
    if (!completed || !handle || !beforeRef.current || startedRef.current) return;
    startedRef.current = true;
    const resolvedHandle = handle;
    const before = beforeRef.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function toDelta(after: ProfileSnapshot): ProgressionDelta {
      const ratingBefore = gameId ? before.ratings.find((r) => r.gameId === gameId)?.rating ?? null : null;
      const ratingAfter = gameId ? after.ratings.find((r) => r.gameId === gameId)?.rating ?? null : null;
      const beforeAchievements = new Set(before.achievements);
      return {
        expGained: after.exp.totalExp - before.exp.totalExp,
        levelBefore: before.exp.level,
        levelAfter: after.exp.level,
        ratingBefore,
        ratingAfter,
        newAchievements: after.achievements.filter((code) => !beforeAchievements.has(code)),
      };
    }

    // Always runs the full fixed number of attempts -- rating and
    // achievements/EXP land on different sweeps, so an early read that
    // already shows the rating change is not a signal to stop; the
    // achievement may only appear a few seconds later. Updates the
    // ceremony progressively on every read rather than waiting silently
    // for the last one.
    function attempt(remaining: number) {
      void get<ProfileSnapshot>(`/v1/players/${encodeURIComponent(resolvedHandle)}`)
        .then((after) => {
          if (cancelled) return;
          setDelta(toDelta(after));
          if (remaining > 1) timer = setTimeout(() => attempt(remaining - 1), RETRY_DELAY_MS);
        })
        .catch(() => {});
    }

    attempt(MAX_ATTEMPTS);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [completed, handle, gameId]);

  return delta;
}
