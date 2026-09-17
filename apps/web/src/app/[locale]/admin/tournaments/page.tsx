'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AdminPageLayout } from '@/components/admin/AdminPageLayout';
import { get, post, ApiError } from '@/lib/api';
import styles from '@/components/admin/AdminPageLayout.module.css';

type TournamentApiRow = {
  id: string;
  title: string;
  game_id: string;
  format: 'SINGLE_ELIMINATION' | 'SWISS';
  tier: 'FREE' | 'CASH';
  status: 'CREATED' | 'REGISTRATION' | 'LIVE' | 'FINALS' | 'COMPLETED' | 'SETTLED' | 'CANCELLED';
  capacity: number;
  entry_fee_minor: string;
  asset: string | null;
  registered_count: number;
  created_at: string;
  starts_at: string | null;
  completed_at: string | null;
  priced_rake_bps?: number;
};

type TournamentStats = {
  active_brackets: number;
  total_tournaments: number;
  total_prize_pool_minor: string;
  total_players: number;
  completed_brackets?: number;
};

const AUTOMATED_GAMES = [
  { id: 'chess', name: 'Chess', icon: '♟️', defaultFee: '10.00' },
  { id: 'dominoes', name: 'Dominoes', icon: '🁉', defaultFee: '10.00' },
  { id: 'backgammon', name: 'Backgammon', icon: '🎲', defaultFee: '10.00' },
  { id: 'checkers', name: 'Checkers', icon: '🔴', defaultFee: '10.00' },
  { id: 'speed-math', name: 'Speed Math', icon: '⚡', defaultFee: '10.00' },
];

export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentApiRow[]>([]);
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGame, setNewGame] = useState('chess');
  const [newFee, setNewFee] = useState('10.00');
  const [newAsset, setNewAsset] = useState<'USDT'>('USDT');
  const [submitting, setSubmitting] = useState(false);
  const [quickPublishing, setQuickPublishing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchTournaments = useCallback(async () => {
    try {
      const q = encodeURIComponent(search);
      const s = encodeURIComponent(statusFilter);
      const res = await get<{ ok: boolean; tournaments: TournamentApiRow[]; stats: TournamentStats }>(
        `/v1/admin/tournaments?q=${q}&status=${s}`
      );
      if (res.ok) {
        setTournaments(res.tournaments);
        setStats(res.stats);
      }
    } catch {
      // Keep existing data on error
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void fetchTournaments();
  }, [fetchTournaments]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || submitting) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      await post('/v1/admin/tournaments', {
        gameId: newGame.toLowerCase(),
        title: newTitle.trim(),
        entryFeeUsd: newFee,
        // Entry fees and prizes are both paid in this coin.
        asset: newAsset,
        capacity: 16,
        format: 'SINGLE_ELIMINATION',
        autoOpen: true,
      });
      setNewTitle('');
      setShowCreate(false);
      setFeedback({ type: 'success', message: `Published tournament for ${newGame.toUpperCase()} successfully!` });
      await fetchTournaments();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof ApiError ? err.message : 'Failed to publish tournament' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickPublish(gameId: string, gameName: string) {
    if (quickPublishing) return;
    setQuickPublishing(gameId);
    setFeedback(null);
    try {
      const title = `${gameName} 16 Championship [10 USDT]`;
      await post('/v1/admin/tournaments', {
        gameId,
        title,
        entryFeeUsd: '10.00',
        capacity: 16,
        format: 'SINGLE_ELIMINATION',
        autoOpen: true,
      });
      setFeedback({
        type: 'success',
        message: `⚡ Quick Test Published: ${gameName} 16-Player Tournament ($10 USDT entry, 90% winner pool). Now OPEN for registration!`,
      });
      await fetchTournaments();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof ApiError ? err.message : `Failed to test publish ${gameName}`,
      });
    } finally {
      setQuickPublishing(null);
    }
  }

  const totalPrizeUsd = stats?.total_prize_pool_minor
    ? (Number(stats.total_prize_pool_minor) / 1_000_000).toFixed(2)
    : tournaments.reduce((acc, t) => acc + (Number(t.entry_fee_minor || '0') / 1_000_000) * t.capacity * 0.88, 0).toFixed(2);

  return (
    <AdminPageLayout
      title="Tournaments & Brackets Control"
      subtitle="Automated 16-player continuous brackets, Swiss rounds, and transparent 88% prize pool settlements."
      breadcrumb={['Home', 'Admin', 'Tournaments']}
      stats={[
        {
          label: 'Active Brackets',
          value: String(stats?.active_brackets ?? tournaments.filter((t) => t.status === 'REGISTRATION' || t.status === 'LIVE').length),
          trend: 'Live & Open',
        },
        {
          label: 'Total Prize Pool',
          value: `$${totalPrizeUsd} USDT`,
          trend: '90% Winner Pool',
        },
        {
          label: 'Total Participants',
          value: `${stats?.total_players ?? tournaments.reduce((acc, t) => acc + (t.registered_count || 0), 0)} Players`,
        },
        {
          label: 'Total Tournaments',
          value: String(stats?.total_tournaments ?? tournaments.length),
          trend: 'Continuous Rotation',
        },
      ]}
      actions={
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? 'Cancel' : '+ Custom Tournament'}
          </button>
        </div>
      }
    >
      {/* Real-time Automation Status & Test Publish Panel */}
      <div
        style={{
          background: '#131722',
          border: '1px solid #232a3b',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 10px #10b981',
              }}
            />
            <strong style={{ color: '#ffffff', fontSize: '15px' }}>
              Continuous 16-Player Automation Engine
            </strong>
            <span
              style={{
                fontSize: '11px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 700,
              }}
            >
              RUNNING ALL THE TIME (5s loop)
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
            Entry: <strong style={{ color: '#fff' }}>10 USDT</strong> | Players: <strong style={{ color: '#fff' }}>16</strong> | Winner:{' '}
            <strong style={{ color: '#10b981' }}>90% ($144.00)</strong> | Platform:{' '}
            <strong style={{ color: '#6366f1' }}>10% ($16.00)</strong>
          </div>
        </div>

        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#94a3b8' }}>
          <strong>Test Publish Tournament:</strong> Instantly publish an official $10 USDT 16-player bracket for any game. When 16 players join, the engine starts the bracket automatically, sends browser/mobile/email notifications with a 1-minute readiness timer, and immediately creates a replacement tournament.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {AUTOMATED_GAMES.map((game) => (
            <button
              key={game.id}
              type="button"
              disabled={quickPublishing !== null}
              onClick={() => handleQuickPublish(game.id, game.name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: quickPublishing === game.id ? '#312e81' : '#1e2433',
                border: '1px solid #334155',
                color: '#ffffff',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: quickPublishing !== null ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{game.icon}</span>
              <span>Test Publish {game.name}</span>
              {quickPublishing === game.id && <span style={{ fontSize: '11px', color: '#818cf8' }}>...</span>}
            </button>
          ))}
        </div>

        {feedback && (
          <div
            style={{
              marginTop: '14px',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${feedback.type === 'success' ? '#10b981' : '#ef4444'}`,
              color: feedback.type === 'success' ? '#34d399' : '#f87171',
            }}
          >
            {feedback.message}
          </div>
        )}
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          style={{
            background: '#161922',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #252b37',
            marginBottom: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            alignItems: 'end',
          }}
        >
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              Tournament Title
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Weekly Masters"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={{
                width: '100%',
                background: '#0e1015',
                border: '1px solid #252b37',
                color: '#fff',
                padding: '8px',
                borderRadius: '6px',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              Select Game
            </label>
            <select
              value={newGame}
              onChange={(e) => setNewGame(e.target.value)}
              style={{
                width: '100%',
                background: '#0e1015',
                border: '1px solid #252b37',
                color: '#fff',
                padding: '8px',
                borderRadius: '6px',
              }}
            >
              <option value="chess">Chess</option>
              <option value="dominoes">Dominoes</option>
              <option value="backgammon">Backgammon</option>
              <option value="checkers">Checkers</option>
              <option value="speed-math">Speed Math</option>
              <option value="connect-four">Connect Four</option>
              <option value="xo">Tic-Tac-Toe (XO)</option>
              <option value="reversi">Reversi</option>
              <option value="seega">Seega</option>
              <option value="gomoku">Gomoku</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              Entry Fee ({newAsset})
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={newFee}
              onChange={(e) => setNewFee(e.target.value)}
              style={{
                width: '100%',
                background: '#0e1015',
                border: '1px solid #252b37',
                color: '#fff',
                padding: '8px',
                borderRadius: '6px',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              Coin (fees and prizes)
            </label>
            <select
              value={newAsset}
              onChange={(e) => setNewAsset(e.target.value as 'USDT')}
              style={{ width: '100%', background: '#0e1015', border: '1px solid #252b37', color: '#fff', padding: '8px', borderRadius: '6px' }}
            >
              <option value="USDT">USDT (Tether · Official)</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            style={{ height: '38px' }}
          >
            {submitting ? 'Publishing...' : 'Publish Tournament'}
          </button>
        </form>
      )}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by title, game, or tournament ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1',
            minWidth: '240px',
            background: '#161922',
            border: '1px solid #252b37',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            background: '#161922',
            border: '1px solid #252b37',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        >
          <option value="">All Statuses</option>
          <option value="REGISTRATION">Registration Open</option>
          <option value="LIVE">Live / In Progress</option>
          <option value="FINALS">Finals</option>
          <option value="COMPLETED">Completed</option>
          <option value="SETTLED">Settled</option>
        </select>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Live Tournament Brackets ({tournaments.length})</h2>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
            Real-time DB Telemetry · 100% Dynamic KPIs
          </span>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tournament ID &amp; Title</th>
                <th>Game</th>
                <th>Bracket Format</th>
                <th>Entry Fee</th>
                <th>Prize Pool (90%)</th>
                <th>Platform Rake (10%)</th>
                <th>Participants</th>
                <th>Status</th>
                <th>Schedule</th>
              </tr>
            </thead>
            <tbody>
              {loading && tournaments.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                    Loading tournament brackets...
                  </td>
                </tr>
              ) : tournaments.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                    No tournaments found matching your filters.
                  </td>
                </tr>
              ) : (
                tournaments.map((t) => {
                  const entryUsd = Number(t.entry_fee_minor || '0') / 1_000_000;
                  const prizeUsd = (entryUsd * t.capacity * 0.88).toFixed(2);
                  const rakeUsd = (entryUsd * t.capacity * 0.12).toFixed(2);
                  const isLive = t.status === 'LIVE' || t.status === 'FINALS';
                  const isOpen = t.status === 'REGISTRATION';

                  return (
                    <tr
                      key={t.id}
                      style={{
                        transition: 'background-color 0.2s ease',
                      }}
                    >
                      <td>
                        <strong style={{ color: '#ffffff' }}>{t.title}</strong>
                        <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{t.id}</div>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>
                        <span style={{ fontWeight: 600 }}>{t.game_id}</span>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                          {t.format.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="nz-num" style={{ fontWeight: 600 }}>
                        {entryUsd > 0 ? `${entryUsd.toFixed(2)} USDT` : 'FREE'}
                      </td>
                      <td className="nz-num" style={{ color: '#10b981', fontWeight: 700 }}>
                        ${prizeUsd} USDT
                      </td>
                      <td className="nz-num" style={{ color: '#818cf8', fontSize: '12px' }}>
                        ${rakeUsd} USDT
                      </td>
                      <td className="nz-num">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 700, color: t.registered_count === t.capacity ? '#10b981' : '#ffffff' }}>
                            {t.registered_count ?? 0}
                          </span>
                          <span style={{ color: '#64748b' }}>/ {t.capacity}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            isLive
                              ? styles.badgeSuccess
                              : isOpen
                              ? styles.badgeWarning
                              : styles.badgeNeutral
                          }`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          {isLive && (
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: '#10b981',
                                display: 'inline-block',
                              }}
                            />
                          )}
                          {isOpen && (
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: '#f59e0b',
                                display: 'inline-block',
                              }}
                            />
                          )}
                          {t.status}
                        </span>
                      </td>
                      <td className="nz-num" style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {t.starts_at ? new Date(t.starts_at).toLocaleDateString() : 'Auto-starts on 16/16'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPageLayout>
  );
}
