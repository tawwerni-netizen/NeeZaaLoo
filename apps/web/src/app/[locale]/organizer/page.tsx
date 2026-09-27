"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/lib/i18n/context";
import { get, post } from "@/lib/api";
import { listGames } from "@/lib/games";
import styles from "./organizer.module.css";

export default function OrganizerDashboard() {
  const { t } = useI18n();
  const router = useRouter();
  
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [gameId, setGameId] = useState("");
  const [capacity, setCapacity] = useState("16");
  const [entryFeeUsd, setEntryFeeUsd] = useState("0");
  const [format, setFormat] = useState("SINGLE_ELIMINATION");
  const [rakeBps, setRakeBps] = useState("500"); // 5% default

  useEffect(() => {
    // 1. Fetch available games
    setGames(listGames());
    
    // 2. Check if user is organizer
    get<{ is_organizer: boolean }>("/v1/me").then((res) => {
      if (!res.is_organizer) {
        router.push("/");
      } else {
        setLoading(false);
      }
    }).catch(() => {
      router.push("/login");
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    if (!title || !gameId) {
      setError("Please fill in all required fields.");
      setSubmitting(false);
      return;
    }

    const payload = {
      title,
      gameId,
      capacity: parseInt(capacity, 10),
      format,
      entryFeeUsd,
      organizerRakeBps: parseInt(rakeBps, 10),
      autoOpen: true
    };
    try {
      const res = await post<{ tournamentId: string }>("/v1/tournaments", payload);
      setSuccess("Tournament created successfully! Redirecting...");
      setTimeout(() => {
        router.push(`/tournaments/${res.tournamentId}`);
      }, 2000);
    } catch (e: any) {
      setError(e.detail || e.message || "Failed to create tournament.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <Header />
        <main className="container" style={{ padding: "100px 0", textAlign: "center" }}>
          Loading Organizer Dashboard...
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <Header />
      
      <main className="container">
        <header className={styles.pageHeader}>
          <div className={styles.badgeRow}>
            <div className={styles.b2bBadge}>
              <div className={styles.badgePulse}></div>
              B2B PARTNER
            </div>
          </div>
          <h1 className={styles.heading}>Organizer Dashboard</h1>
          <p className={styles.subHeading}>
            Host branded tournaments for your community. Set entry fees, choose formats, and earn a percentage of the prize pool.
          </p>
        </header>

        <div className={styles.dashboardLayout} style={{ marginTop: "32px" }}>
          {/* Sidebar */}
          <aside className={styles.sidebar}>
            <h2 className={styles.sidebarTitle}>Partner Overview</h2>
            
            <div className={styles.sidebarMetric}>
              <div className={styles.metricLabel}>Total Tournaments Hosted</div>
              <div className={styles.metricValue}>1</div>
            </div>
            
            <div className={styles.sidebarMetric}>
              <div className={styles.metricLabel}>Total Organizer Rake (Est.)</div>
              <div className={styles.metricValue}>$0.00</div>
            </div>

            <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)", marginTop: "16px", lineHeight: "1.5" }}>
              As a verified B2B partner, you can host tournaments and collect a rake (commission) on every paid entry. 
              Contact your partner manager to increase your maximum allowed limits.
            </p>
          </aside>

          {/* Main Content */}
          <section className={styles.mainContent}>
            <h2 className={styles.sectionTitle}>Create New Tournament</h2>
            
            {error && <div className={styles.errorMsg}>{error}</div>}
            {success && <div className={styles.successMsg}>{success}</div>}
            
            <form onSubmit={handleSubmit} className={styles.formGrid}>
              <div className={styles.formGroupFull}>
                <label className={styles.label}>Tournament Title</label>
                <input 
                  type="text" 
                  className={styles.input} 
                  placeholder="e.g. RedBull Weekly Chess Cup" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={50}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Game</label>
                <select 
                  className={styles.select} 
                  value={gameId} 
                  onChange={(e) => setGameId(e.target.value)}
                  required
                >
                  <option value="">Select a Game...</option>
                  {games.filter(g => g.isLive).map(g => (
                    <option key={g.id} value={g.id}>{g.displayName}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Format</label>
                <select className={styles.select} value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="SINGLE_ELIMINATION">Single Elimination</option>
                  <option value="SWISS">Swiss System</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Players Capacity</label>
                <select className={styles.select} value={capacity} onChange={(e) => setCapacity(e.target.value)}>
                  <option value="4">4 Players</option>
                  <option value="8">8 Players</option>
                  <option value="16">16 Players</option>
                  <option value="32">32 Players</option>
                  <option value="64">64 Players</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Entry Fee (USD)</label>
                <input 
                  type="number" 
                  step="0.5" 
                  min="0"
                  max="100"
                  className={styles.input} 
                  value={entryFeeUsd}
                  onChange={(e) => setEntryFeeUsd(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Your Rake (Commission %)</label>
                <select className={styles.select} value={rakeBps} onChange={(e) => setRakeBps(e.target.value)}>
                  <option value="0">0% (All to Prize Pool)</option>
                  <option value="250">2.5%</option>
                  <option value="500">5.0%</option>
                  <option value="1000">10.0% (Max)</option>
                </select>
              </div>

              <button type="submit" className={styles.submitBtn} disabled={submitting}>
                {submitting ? "Creating..." : "Launch Tournament"}
              </button>
            </form>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
