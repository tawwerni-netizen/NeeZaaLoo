'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';
import { get, post } from '@/lib/api';
import styles from './TournamentReadyWatcher.module.css';

type TournamentNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: {
    tournamentId?: string;
    gameId?: string;
    roundNumber?: number;
    pairingId?: string;
    duelId?: string;
    startsInSeconds?: number;
    startingAt?: string;
  };
  created_at: string;
};

export function TournamentReadyWatcher() {
  const { player } = useAuth();
  const { locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  const [activeAlert, setActiveAlert] = useState<TournamentNotification | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const dismissedIds = useRef<Set<string>>(new Set());

  // Play audio alert chime using Web Audio API
  const playAlertSound = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      // First chime
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.4);

      // Second higher chime
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.15); // E5
      gain2.gain.setValueAtTime(0.25, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.6);
    } catch {
      // Audio context might be restricted before interaction
    }
  }, []);

  const checkNotifications = useCallback(async () => {
    if (!player || pathname.includes('/admin')) return;
    try {
      const res = await get<{ notifications: TournamentNotification[] }>('/v1/me/notifications?unread=true');
      const items = res.notifications || [];
      const matchAlert = items.find(
        (n) =>
          (n.type === 'TOURNAMENT_STARTING' || n.type === 'MATCH_READY') &&
          !dismissedIds.current.has(n.id)
      );

      if (matchAlert) {
        // Calculate remaining seconds out of 60
        const createdAt = new Date(matchAlert.created_at).getTime();
        const elapsed = Math.floor((Date.now() - createdAt) / 1000);
        const remaining = Math.max(0, 60 - elapsed);

        if (remaining > 0) {
          setActiveAlert(matchAlert);
          setSecondsLeft(remaining);

          // Request browser notification if supported
          if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'default') {
              void Notification.requestPermission();
            } else if (Notification.permission === 'granted' && !audioPlayed) {
              try {
                new Notification('Tournament Match Starting! ⚔️', {
                  body: matchAlert.body || 'Your 16-player bracket is starting now. You have 1 minute to enter.',
                  icon: '/favicon.ico',
                });
              } catch {
                // Ignore notification error
              }
            }
          }

          if (!audioPlayed) {
            playAlertSound();
            setAudioPlayed(true);
          }
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, [player, pathname, audioPlayed, playAlertSound]);

  useEffect(() => {
    if (!player || pathname.includes('/admin')) return;
    void checkNotifications();
    const interval = setInterval(checkNotifications, 3000);
    return () => clearInterval(interval);
  }, [player, pathname, checkNotifications]);

  // Countdown timer tick
  useEffect(() => {
    if (!activeAlert) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeAlert]);

  async function handleDismiss() {
    if (!activeAlert) return;
    dismissedIds.current.add(activeAlert.id);
    const alertId = activeAlert.id;
    setActiveAlert(null);
    setAudioPlayed(false);
    try {
      await post(`/v1/me/notifications/${alertId}/read`);
    } catch {
      // Ignore
    }
  }

  async function handleEnter() {
    if (!activeAlert) return;
    dismissedIds.current.add(activeAlert.id);
    const alertId = activeAlert.id;
    const { duelId, tournamentId } = activeAlert.data || {};
    setActiveAlert(null);
    setAudioPlayed(false);

    try {
      await post(`/v1/me/notifications/${alertId}/read`);
    } catch {
      // Ignore
    }

    if (duelId) {
      router.push(`/${locale}/game/${duelId}`);
    } else if (tournamentId) {
      router.push(`/${locale}/tournaments/${tournamentId}`);
    }
  }

  if (!activeAlert) return null;

  const progress = Math.max(0, Math.min(100, (secondsLeft / 60) * 100));

  return (
    <div className={styles.overlay} role="alertdialog" aria-modal="true">
      <div className={styles.card}>
        <div className={styles.glowHeader}>
          <span className={styles.pulseDot} />
          Tournament Starting Now
        </div>

        <h2 className={styles.title}>{activeAlert.title || 'Your Bracket is Live!'}</h2>
        <p className={styles.desc}>
          {activeAlert.body || 'Your 16-player bracket is starting. Please be ready in the arena within 1 minute.'}
        </p>

        <div className={styles.countdownWrapper}>
          <div
            className={styles.countdownCircle}
            style={{ '--progress': `${progress}%` } as React.CSSProperties}
          >
            <div className={styles.countdownInner}>
              <span className={styles.countdownDigits}>{secondsLeft}</span>
              <span className={styles.countdownUnit}>seconds</span>
            </div>
          </div>
        </div>

        <p className={styles.urgencyWarning}>
          ⚠️ Be ready within 1 min! Opening round matches forfeit upon timeout.
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.enterBtn} onClick={handleEnter}>
            Enter Match Now ⚔️
          </button>
          <button type="button" className={styles.dismissBtn} onClick={handleDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
