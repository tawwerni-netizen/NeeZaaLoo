"use client";

/**
 * The Friend Challenge popup, mounted ONCE for the whole app (see the
 * locale layout) so a recipient sees it wherever they are -- not only if
 * they happen to already be on the sender's game's own /play page. Polls
 * GET /v1/challenges globally (no gameId filter) on the same fast 1-second
 * cadence FriendChallenge's own outgoing view uses, so the popup's real
 * 30-second window feels live from anywhere in the app.
 *
 * Renders nothing for a logged-out visitor, and nothing while already on
 * the accepted duel's own game page (avoids a redundant self-navigation).
 *
 * Also renders and polls nothing on any /admin route. An admin account is
 * still a real player row (admin_user.id references player(id)), so this
 * component would otherwise start its 1-second poll the instant an admin
 * opens the dashboard -- pure noise there (an admin console has no use for
 * a friend-challenge popup) that both wastes requests and pollutes
 * admin_audit with player-side traffic on every dashboard visit, found by
 * actually logging in as an admin and watching the network tab, not by
 * inspection alone.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import { ChallengePopup, type IncomingChallenge } from "./ChallengePopup";

type OutgoingChallenge = {
  id: string;
  status?: string;
  duel_id?: string | null;
  duel_status?: string | null;
};

function isDuelHandled(duelId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem("nizalo_handled_duels");
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return list.includes(duelId);
  } catch {
    return false;
  }
}

function markDuelHandled(duelId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem("nizalo_handled_duels");
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(duelId)) {
      list.push(duelId);
      sessionStorage.setItem("nizalo_handled_duels", JSON.stringify(list));
    }
  } catch {
    // Non-fatal
  }
}

export function IncomingChallengeWatcher() {
  const { player } = useAuth();
  const { locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [incoming, setIncoming] = useState<IncomingChallenge[]>([]);
  const isAdminRoute = pathname.includes("/admin");

  useEffect(() => {
    const match = pathname.match(/\/game\/([^/?]+)/);
    if (match?.[1]) {
      markDuelHandled(match[1]);
    }
  }, [pathname]);

  const refresh = useCallback(async () => {
    try {
      const r = await get<{ incoming: IncomingChallenge[]; outgoing?: OutgoingChallenge[] }>("/v1/challenges");
      setIncoming(r.incoming || []);
      const accepted = (r.outgoing || []).find((c) => {
        if (c.status !== "ACCEPTED" || !c.duel_id) return false;
        if (c.duel_status === "COMPLETED" || c.duel_status === "SETTLED" || c.duel_status === "ABORTED") return false;
        return true;
      });

      if (
        accepted &&
        accepted.duel_id &&
        !isDuelHandled(accepted.duel_id) &&
        !pathname.includes(`/game/${accepted.duel_id}`)
      ) {
        markDuelHandled(accepted.duel_id);
        router.push(`/${locale}/game/${accepted.duel_id}`);
      }
    } catch {
      // A transient poll failure is not fatal -- the next tick retries.
    }
  }, [locale, pathname, router]);

  useEffect(() => {
    if (!player || isAdminRoute) { setIncoming([]); return; }
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [player, isAdminRoute, refresh]);

  if (!player || isAdminRoute || incoming.length === 0) return null;
  // Already mid-game (any duel) -- do not pop a new-challenge dialog over
  // an in-progress match; it will still be here the moment they leave.
  if (pathname.includes("/game/")) return null;

  return (
    <ChallengePopup
      challenge={incoming[0]!}
      onAccepted={(duelId) => {
        markDuelHandled(duelId);
        router.push(`/${locale}/game/${duelId}`);
      }}
      onDeclined={() => void refresh()}
      onExpired={() => void refresh()}
    />
  );
}
