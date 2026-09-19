"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { LocaleLink } from "@/components/LocaleLink";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import { getGame } from "@/lib/games";
import { useVisibilityAwareInterval } from "@/lib/use-interval";
import styles from "./ActiveMatchBanner.module.css";

type ActiveDuelInfo = {
  id: string;
  gameId: string;
  status: string;
  opponentNickname?: string;
  startedAt?: string;
};

export function ActiveMatchBanner() {
  const { player } = useAuth();
  const { t, locale } = useI18n();
  const pathname = usePathname();

  const [activeDuel, setActiveDuel] = useState<ActiveDuelInfo | null>(null);
  const audioPlayedRef = useRef(false);

  const isAdmin = pathname.includes("/admin");
  const isOnActiveGame = activeDuel ? pathname.includes(`/game/${activeDuel.id}`) : false;

  const checkActive = useCallback(async () => {
    if (!player || isAdmin) {
      setActiveDuel(null);
      return;
    }
    try {
      const res = await get<{ active: boolean; duel?: ActiveDuelInfo }>("/v1/me/active-duel");
      if (res.active && res.duel) {
        setActiveDuel(res.duel);
        if (!audioPlayedRef.current) {
          audioPlayedRef.current = true;
          try {
            const audio = new Audio("/sounds/game-start.mp3");
            audio.volume = 0.4;
            void audio.play().catch(() => {});
          } catch {}
        }
      } else {
        setActiveDuel(null);
        audioPlayedRef.current = false;
      }
    } catch {
      // Transient poll errors are ignored
    }
  }, [player, isAdmin]);

  useEffect(() => {
    void checkActive();
  }, [checkActive]);

  useVisibilityAwareInterval(checkActive, !player || isAdmin ? false : 12000);

  if (!player || !activeDuel || isOnActiveGame || isAdmin) {
    return null;
  }

  const isAr = locale === "ar";
  const gameDef = getGame(activeDuel.gameId);
  const gameName = gameDef ? t(`common.game_names.${gameDef.nameKey}`) : activeDuel.gameId;
  const opponent = activeDuel.opponentNickname || (isAr ? "الخصم" : "Opponent");

  return (
    <div className={styles.bannerWrapper} role="alert" dir={isAr ? "rtl" : "ltr"}>
      <div className={styles.card || styles.bannerCard}>
        <div className={styles.leftInfo}>
          <div className={styles.pulseIndicator} aria-hidden="true">
            <span className={styles.radarRing} />
            ⚔️
          </div>
          <div className={styles.textGroup}>
            <span className={styles.headline}>
              {isAr ? (
                <>
                  لديك مباراة جارية الآن في <span className={styles.gameNameHighlight}>{gameName}</span>
                </>
              ) : (
                <>
                  Active match in <span className={styles.gameNameHighlight}>{gameName}</span>
                </>
              )}
            </span>
            <span className={styles.subDetails}>
              {isAr ? (
                <>
                  ضد: <span className={styles.opponentSpan}>{opponent}</span>
                </>
              ) : (
                <>
                  vs <span className={styles.opponentSpan}>{opponent}</span>
                </>
              )}
            </span>
          </div>
        </div>

        <div className={styles.actionButtons}>
          <ResignButton duelId={activeDuel.id} isAr={isAr} onResigned={() => setActiveDuel(null)} />
          <LocaleLink href={`/game/${activeDuel.id}`} className={styles.returnBtn}>
            <span>{isAr ? "العودة للمباراة" : "Return to Match"}</span>
            <span aria-hidden="true">→</span>
          </LocaleLink>
        </div>
      </div>
    </div>
  );
}

import { useDuelSocket } from "@/lib/use-duel-socket";

function ResignButton({ duelId, isAr, onResigned }: { duelId: string; isAr: boolean; onResigned: () => void }) {
  const { resign, connected } = useDuelSocket(duelId);
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <button
        onClick={() => {
          if (connected && resign) {
            resign();
            onResigned();
          }
        }}
        className={styles.resignBtnConfirm}
        disabled={!connected}
      >
        {isAr ? "تأكيد الإستسلام" : "Confirm Resign"}
      </button>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} className={styles.resignBtn}>
      {isAr ? "إستسلام" : "Resign"}
    </button>
  );
}
