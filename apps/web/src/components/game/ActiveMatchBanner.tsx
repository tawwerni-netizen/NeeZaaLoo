"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { LocaleLink } from "@/components/LocaleLink";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import { getGame } from "@/lib/games";
import { useVisibilityAwareInterval } from "@/lib/use-interval";
import { useDuelSocket } from "@/lib/use-duel-socket";
import styles from "./ActiveMatchBanner.module.css";

type ActiveDuelInfo = {
  id: string;
  gameId: string;
  status: string;
  opponentNickname?: string;
  startedAt?: string;
};

const BANNER_I18N: Record<
  string,
  {
    opponentFallback: string;
    activePrefix: string;
    vsLabel: string;
    returnToMatch: string;
    resign: string;
    confirmResign: string;
    resigning: string;
  }
> = {
  ar: {
    opponentFallback: "الخصم",
    activePrefix: "لديك مباراة جارية الآن في ",
    vsLabel: "ضد: ",
    returnToMatch: "العودة للمباراة",
    resign: "إستسلام",
    confirmResign: "تأكيد الإستسلام",
    resigning: "جارٍ الإستسلام...",
  },
  en: {
    opponentFallback: "Opponent",
    activePrefix: "Active match in ",
    vsLabel: "vs ",
    returnToMatch: "Return to Match",
    resign: "Resign",
    confirmResign: "Confirm Resign",
    resigning: "Resigning...",
  },
  es: {
    opponentFallback: "Oponente",
    activePrefix: "Partida activa en ",
    vsLabel: "vs ",
    returnToMatch: "Volver a la partida",
    resign: "Rendirse",
    confirmResign: "Confirmar rendición",
    resigning: "Rindiéndose...",
  },
  fr: {
    opponentFallback: "Adversaire",
    activePrefix: "Partie active sur ",
    vsLabel: "vs ",
    returnToMatch: "Retourner au match",
    resign: "Abandonner",
    confirmResign: "Confirmer l'abandon",
    resigning: "Abandon en cours...",
  },
  hi: {
    opponentFallback: "विरोधी",
    activePrefix: "सक्रिय मैच चल रहा है ",
    vsLabel: "बनाम: ",
    returnToMatch: "मैच पर वापस लौटें",
    resign: "हार मानें",
    confirmResign: "हार की पुष्टि करें",
    resigning: "हार मान रहे हैं...",
  },
  zh: {
    opponentFallback: "对手",
    activePrefix: "当前正在进行对局：",
    vsLabel: "对阵: ",
    returnToMatch: "返回对局",
    resign: "认输",
    confirmResign: "确认认输",
    resigning: "正在认输...",
  },
};

export function ActiveMatchBanner() {
  const { player } = useAuth();
  const { t, locale } = useI18n();
  const bannerDict = (BANNER_I18N[locale] ?? BANNER_I18N["en"])!;
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
  const opponent = activeDuel.opponentNickname || bannerDict.opponentFallback;

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
              {bannerDict.activePrefix}<span className={styles.gameNameHighlight}>{gameName}</span>
            </span>
            <span className={styles.subDetails}>
              {bannerDict.vsLabel}<span className={styles.opponentSpan}>{opponent}</span>
            </span>
          </div>
        </div>

        <div className={styles.actionButtons}>
          <ResignButton duelId={activeDuel.id} bannerDict={bannerDict} onResigned={() => setActiveDuel(null)} />
          <LocaleLink href={`/game/${activeDuel.id}`} className={styles.returnBtn}>
            <span>{bannerDict.returnToMatch}</span>
            <span aria-hidden="true">→</span>
          </LocaleLink>
        </div>
      </div>
    </div>
  );
}

function ResignButton({
  duelId,
  bannerDict,
  onResigned,
}: {
  duelId: string;
  bannerDict: typeof BANNER_I18N["en"];
  onResigned: () => void;
}) {
  const { resign } = useDuelSocket(duelId);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (confirming) {
    return (
      <button
        onClick={async () => {
          setBusy(true);
          try {
            resign?.();
          } catch {}
          onResigned();
        }}
        className={styles.resignBtnConfirm}
        disabled={busy}
      >
        {busy ? bannerDict.resigning : bannerDict.confirmResign}
      </button>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} className={styles.resignBtn}>
      {bannerDict.resign}
    </button>
  );
}
