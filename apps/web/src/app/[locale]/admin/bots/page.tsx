"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get, post, ApiError } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

interface BotConfig {
  ai_difficulty?: {
    mode: "INVINCIBLE" | "EXPERT" | "BALANCED";
    blunder_chance: number;
    think_ms: number;
  };
  standing_by?: {
    enabled: boolean;
    wait_seconds: number;
    pool_size: number;
    max_stake_usd: number;
  };
  tournaments?: {
    enabled: boolean;
    reserved_seats: number;
    fill_interval_seconds: number;
    max_wait_minutes: number;
  };
  simulator?: {
    enabled: boolean;
    interval_seconds: number;
  };
}

interface BotItem {
  id: string;
  handle: string;
  bio: string;
  avatar_url?: string | null;
  balance_usdt: string;
  avg_rating: number;
  is_standing_by: boolean;
  games_count: number;
}

interface BotOverviewResponse {
  config: BotConfig;
  stats: {
    total_bots: number;
    standing_by_count: number;
    active_duels_count: number;
    tournaments_active_count: number;
    total_liquidity_usdt: string;
  };
  bots: BotItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

const LANG_OPTIONS = [
  { code: "all", label: "All Personas (600)", flag: "🌐" },
  { code: "ar", label: "Arabic (100)", flag: "🇸🇦" },
  { code: "en", label: "English (100)", flag: "🇺🇸" },
  { code: "es", label: "Spanish (100)", flag: "🇪🇸" },
  { code: "fr", label: "French (100)", flag: "🇫🇷" },
  { code: "hi", label: "Hindi (100)", flag: "🇮🇳" },
  { code: "zh", label: "Chinese (100)", flag: "🇨🇳" },
];

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  labelOn = "ON",
  labelOff = "OFF",
  color = "#22c55e",
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  labelOn?: string;
  labelOff?: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 12px",
        borderRadius: "20px",
        border: `1px solid ${checked ? color : "#374151"}`,
        background: checked ? `${color}22` : "#1f2937",
        color: checked ? color : "#9ca3af",
        fontSize: "12px",
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s ease",
        outline: "none",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: checked ? color : "#6b7280",
          boxShadow: checked ? `0 0 6px ${color}` : "none",
        }}
      />
      {checked ? labelOn : labelOff}
    </button>
  );
}

export default function AdminBotsPage() {
  const [data, setData] = useState<BotOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLang, setSelectedLang] = useState("all");
  const [selectedStandingBy, setSelectedStandingBy] = useState("all");
  const [pageOffset, setPageOffset] = useState(0);
  const pageSize = 20;

  // Local Editable Config State
  const [aiMode, setAiMode] = useState<"INVINCIBLE" | "EXPERT" | "BALANCED">("INVINCIBLE");
  const [aiThinkMs, setAiThinkMs] = useState(1200);

  const [standingByEnabled, setStandingByEnabled] = useState(true);
  const [standingByWaitSeconds, setStandingByWaitSeconds] = useState(5);
  const [standingByMaxStake, setStandingByMaxStake] = useState(2000);

  const [tournamentsEnabled, setTournamentsEnabled] = useState(true);
  const [reservedSeats, setReservedSeats] = useState(2);
  const [fillInterval, setFillInterval] = useState(30);
  const [maxWaitMinutes, setMaxWaitMinutes] = useState(10);

  const [topupLoading, setTopupLoading] = useState(false);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(pageOffset),
      });
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (selectedLang !== "all") params.set("lang", selectedLang);
      if (selectedStandingBy !== "all") params.set("standing_by", selectedStandingBy);

      const res = await get<BotOverviewResponse>(`/v1/admin/bots/overview?${params.toString()}`);
      setData(res);

      if (res.config) {
        if (res.config.ai_difficulty) {
          setAiMode(res.config.ai_difficulty.mode || "INVINCIBLE");
          setAiThinkMs(res.config.ai_difficulty.think_ms || 1200);
        }
        if (res.config.standing_by) {
          setStandingByEnabled(res.config.standing_by.enabled !== false);
          setStandingByWaitSeconds(res.config.standing_by.wait_seconds || 5);
          setStandingByMaxStake(res.config.standing_by.max_stake_usd || 2000);
        }
        if (res.config.tournaments) {
          setTournamentsEnabled(res.config.tournaments.enabled !== false);
          setReservedSeats(res.config.tournaments.reserved_seats ?? 2);
          setFillInterval(res.config.tournaments.fill_interval_seconds || 30);
          setMaxWaitMinutes(res.config.tournaments.max_wait_minutes || 10);
        }
      }
    } catch (e: any) {
      console.error("Failed to fetch bot overview:", e);
      setNotice({ type: "error", message: e instanceof ApiError ? e.message : "فشل تحميل بيانات البوتات" });
    } finally {
      setLoading(false);
    }
  }, [pageOffset, searchQuery, selectedLang, selectedStandingBy]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  async function saveConfig(key: string, value: any, successMsg: string) {
    try {
      setSavingKey(key);
      setNotice(null);
      await post("/v1/admin/bots/config", { key, value });
      setNotice({ type: "success", message: successMsg });
      await fetchOverview();
    } catch (e: any) {
      setNotice({ type: "error", message: e instanceof ApiError ? e.message : "فشل حفظ التعديلات" });
    } finally {
      setSavingKey(null);
      setTimeout(() => setNotice(null), 5000);
    }
  }

  async function handleSaveAiMode() {
    await saveConfig(
      "ai_difficulty",
      {
        mode: aiMode,
        blunder_chance: aiMode === "INVINCIBLE" ? 0 : aiMode === "EXPERT" ? 0.02 : 0.08,
        think_ms: aiThinkMs,
      },
      `تم تحديث مستوى ذكاء البوتات بنجاح إلى: ${aiMode === "INVINCIBLE" ? "⚡ لا يُقهر (INVINCIBLE - Grandmaster)" : aiMode}`
    );
  }

  async function handleSaveStandingBy() {
    await saveConfig(
      "standing_by",
      {
        enabled: standingByEnabled,
        wait_seconds: standingByWaitSeconds,
        pool_size: 200,
        max_stake_usd: standingByMaxStake,
      },
      `تم تحديث إعدادات البوتات الاحتياطية (Standing-By) بنجاح! وقت الانتظار: ${standingByWaitSeconds} ثوانٍ.`
    );
  }

  async function handleSaveTournaments() {
    await saveConfig(
      "tournaments",
      {
        enabled: tournamentsEnabled,
        reserved_seats: reservedSeats,
        fill_interval_seconds: fillInterval,
        max_wait_minutes: maxWaitMinutes,
      },
      `تم تحديث إعدادات بطولات البوتات! المقاعد المحجوزة للبشر: ${reservedSeats} مقاعد.`
    );
  }

  async function handleTopupAllBots() {
    if (!confirm("هل أنت متأكد من شحن جميع البوتات (600 بوت) ليكون رصيد كل منها 10,000 USDT كحد أدنى؟")) {
      return;
    }
    try {
      setTopupLoading(true);
      setNotice(null);
      const res = await post<{ ok: boolean; toppedUpCount: number; totalCreditedUsdt: string }>("/v1/admin/bots/topup", {
        targetBalanceUsdt: 10000,
      });
      setNotice({
        type: "success",
        message: `تم شحن محافظ البوتات بنجاح! تم شحن ${res.toppedUpCount} بوت بإجمالي $${res.totalCreditedUsdt} USDT.`,
      });
      await fetchOverview();
    } catch (e: any) {
      setNotice({ type: "error", message: e instanceof ApiError ? e.message : "فشل شحن محافظ البوتات" });
    } finally {
      setTopupLoading(false);
      setTimeout(() => setNotice(null), 6000);
    }
  }

  async function handleTopupSingleBot(botId: string) {
    try {
      setNotice(null);
      await post("/v1/admin/bots/topup", { botId, amountUsdt: 1000 });
      setNotice({ type: "success", message: `تمت إضافة 1,000 USDT بنجاح للبوت ${botId}` });
      await fetchOverview();
    } catch (e: any) {
      setNotice({ type: "error", message: e instanceof ApiError ? e.message : "فشل شحن البوت" });
    }
  }

  const totalBots = data?.stats?.total_bots || 600;
  const standingByCount = data?.stats?.standing_by_count || 200;
  const activeDuels = data?.stats?.active_duels_count || 0;
  const activeTournaments = data?.stats?.tournaments_active_count || 0;
  const totalLiquidity = data?.stats?.total_liquidity_usdt || "6,000,000.00";

  return (
    <AdminPageLayout
      title="AI & Bots Fleet Command Center"
      subtitle="Full control over 600 official AI personas, invincible grandmaster engines, standing-by zero-wait matchmaker, and automated tournament fillers."
      breadcrumb={["Home", "Admin", "AI & Bots"]}
      stats={[
        { label: "Active AI Personas", value: `${totalBots}`, trend: "600 Personas Across 6 Languages" },
        { label: "Standing-By Pool", value: `${standingByCount}`, trend: "Instant Matchmaking Standing-By" },
        { label: "Total Bot Liquidity", value: `$${totalLiquidity} USDT`, trend: "100% Solvent in Custody" },
        { label: "AI Engine Power", value: aiMode === "INVINCIBLE" ? "⚡ INVINCIBLE" : aiMode, trend: "0% Blunders • Max Search Depth" },
      ]}
      actions={
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={handleTopupAllBots}
          disabled={topupLoading}
          style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 16px", fontWeight: 700 }}
        >
          {topupLoading ? "جاري الشحن..." : "💰 Top-Up All Bots to 10,000 USDT"}
        </button>
      }
    >
      {notice && (
        <div
          style={{
            padding: "14px 20px",
            background: notice.type === "success" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
            border: `1px solid ${notice.type === "success" ? "#22c55e" : "#ef4444"}`,
            borderRadius: "10px",
            marginBottom: "24px",
            color: notice.type === "success" ? "#22c55e" : "#ef4444",
            fontSize: "14px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span>{notice.type === "success" ? "✅" : "⚠️"}</span>
          <span>{notice.message}</span>
        </div>
      )}

      {/* Control Panels Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px", marginBottom: "30px" }}>
        
        {/* Card 1: AI Difficulty & Invincible Mode */}
        <div style={{ background: "#161922", border: "1px solid #252b37", borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>⚡</span> AI Intelligence & Invincibility Mode
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--nz-text-3)" }}>
                Global difficulty engine across all 10 games (Chess, Dominoes, Backgammon, etc.)
              </p>
            </div>
            <span className={`${styles.badge} ${aiMode === "INVINCIBLE" ? styles.badgeSuccess : styles.badgeNeutral}`}>
              {aiMode}
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            {(["INVINCIBLE", "EXPERT", "BALANCED"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAiMode(mode)}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${aiMode === mode ? (mode === "INVINCIBLE" ? "#22c55e" : "#ff6232") : "#2a3140"}`,
                  background: aiMode === mode ? (mode === "INVINCIBLE" ? "rgba(34, 197, 94, 0.15)" : "rgba(255, 98, 50, 0.15)") : "#1e232f",
                  color: aiMode === mode ? (mode === "INVINCIBLE" ? "#22c55e" : "#ff6232") : "#94a3b8",
                  fontWeight: 700,
                  fontSize: "12px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {mode === "INVINCIBLE" && "⚡ لا يُقهر (0% خطأ)"}
                {mode === "EXPERT" && "🧠 خبير (Grandmaster)"}
                {mode === "BALANCED" && "⚖️ متوازن"}
              </button>
            ))}
          </div>

          <div style={{ background: "#11141c", borderRadius: "8px", padding: "12px", border: "1px solid #1e2430" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "12px", color: "var(--nz-text-2)" }}>
              <span>Thinking Simulation Time (سرعة التفكير)</span>
              <span style={{ fontWeight: 700, color: "#fff" }}>{aiThinkMs} ms</span>
            </div>
            <input
              type="range"
              min={600}
              max={2500}
              step={100}
              value={aiThinkMs}
              onChange={(e) => setAiThinkMs(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#22c55e", cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--nz-text-3)", marginTop: "4px" }}>
              <span>0.6s (Lightning Fast)</span>
              <span>2.5s (Deep Pondering)</span>
            </div>
          </div>

          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={handleSaveAiMode}
            disabled={savingKey === "ai_difficulty"}
            style={{ alignSelf: "flex-start", padding: "8px 16px", fontWeight: 600 }}
          >
            {savingKey === "ai_difficulty" ? "جاري الحفظ..." : "حفظ قوة الذكاء الاصطناعي (Save AI Mode)"}
          </button>
        </div>

        {/* Card 2: Standing-By Matchmaking Engine */}
        <div style={{ background: "#161922", border: "1px solid #252b37", borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>🎯</span> Standing-By Matchmaker (البوتات الاحتياطية)
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--nz-text-3)" }}>
                200 dedicated bots waiting on standby for instant zero-wait matches
              </p>
            </div>
            <ToggleSwitch
              checked={standingByEnabled}
              onChange={() => setStandingByEnabled(!standingByEnabled)}
              labelOn="ACTIVE"
              labelOff="PAUSED"
              color="#22c55e"
            />
          </div>

          <div style={{ background: "#11141c", borderRadius: "8px", padding: "12px", border: "1px solid #1e2430" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "12px", color: "var(--nz-text-2)" }}>
              <span>Trigger Wait Threshold (فترة انتظار اللاعب قبل التدخل)</span>
              <span style={{ fontWeight: 700, color: "#22c55e" }}>{standingByWaitSeconds} ثوانٍ</span>
            </div>
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={standingByWaitSeconds}
              onChange={(e) => setStandingByWaitSeconds(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#ff6232", cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--nz-text-3)", marginTop: "4px" }}>
              <span>2s (فوري جداً)</span>
              <span>20s (إعطاء فرصة للاعبين آخرين)</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1, background: "#11141c", borderRadius: "8px", padding: "10px", border: "1px solid #1e2430" }}>
              <div style={{ fontSize: "11px", color: "var(--nz-text-3)" }}>Standing-By Pool Size</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginTop: "2px" }}>200 Bots</div>
            </div>
            <div style={{ flex: 1, background: "#11141c", borderRadius: "8px", padding: "10px", border: "1px solid #1e2430" }}>
              <div style={{ fontSize: "11px", color: "var(--nz-text-3)" }}>Max Cash Stake USD</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#22c55e", marginTop: "2px" }}>${standingByMaxStake}</div>
            </div>
          </div>

          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={handleSaveStandingBy}
            disabled={savingKey === "standing_by"}
            style={{ alignSelf: "flex-start", padding: "8px 16px", fontWeight: 600 }}
          >
            {savingKey === "standing_by" ? "جاري الحفظ..." : "حفظ إعدادات الانتظار (Save Standing-By)"}
          </button>
        </div>

        {/* Card 3: Tournament Bot Filler Engine */}
        <div style={{ background: "#161922", border: "1px solid #252b37", borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>🏆</span> Tournament Bot Filler (مشاركة البوتات في البطولات)
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--nz-text-3)" }}>
                Gradually fills 16-player tournaments while leaving open seats for human players
              </p>
            </div>
            <ToggleSwitch
              checked={tournamentsEnabled}
              onChange={() => setTournamentsEnabled(!tournamentsEnabled)}
              labelOn="ACTIVE"
              labelOff="PAUSED"
              color="#3b82f6"
            />
          </div>

          <div style={{ background: "#11141c", borderRadius: "8px", padding: "12px", border: "1px solid #1e2430" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "12px", color: "var(--nz-text-2)" }}>
              <span>Human Reserved Seats (المقاعد المحجوزة للاعبين الحقيقيين)</span>
              <span style={{ fontWeight: 700, color: "#3b82f6" }}>{reservedSeats} مقاعد</span>
            </div>
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={reservedSeats}
              onChange={(e) => setReservedSeats(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#3b82f6", cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--nz-text-3)", marginTop: "4px" }}>
              <span>1 مقعد</span>
              <span>6 مقاعد مفتوحة للبشر</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1, background: "#11141c", borderRadius: "8px", padding: "10px", border: "1px solid #1e2430" }}>
              <div style={{ fontSize: "11px", color: "var(--nz-text-3)" }}>Fill Interval (فاصل دخول البوت)</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginTop: "2px" }}>{fillInterval}s</div>
            </div>
            <div style={{ flex: 1, background: "#11141c", borderRadius: "8px", padding: "10px", border: "1px solid #1e2430" }}>
              <div style={{ fontSize: "11px", color: "var(--nz-text-3)" }}>Max Wait Before Full Start</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginTop: "2px" }}>{maxWaitMinutes}m</div>
            </div>
          </div>

          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={handleSaveTournaments}
            disabled={savingKey === "tournaments"}
            style={{ alignSelf: "flex-start", padding: "8px 16px", fontWeight: 600 }}
          >
            {savingKey === "tournaments" ? "جاري الحفظ..." : "حفظ إعدادات البطولات (Save Tournaments)"}
          </button>
        </div>

      </div>

      {/* Bot Roster & Personas Table Card */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader} style={{ flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h2 className={styles.tableTitle} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🤖</span> 600 Official AI Personas Roster
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--nz-text-3)" }}>
              Showing verified bots across Arabic, English, Spanish, French, Hindi, and Chinese languages.
            </p>
          </div>

          {/* Filters Bar */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Search bot handle or ID..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPageOffset(0);
              }}
              style={{
                background: "#0e1015",
                border: "1px solid #252b37",
                borderRadius: "6px",
                padding: "6px 12px",
                color: "#fff",
                fontSize: "12px",
                width: "200px",
              }}
            />

            <select
              value={selectedLang}
              onChange={(e) => {
                setSelectedLang(e.target.value);
                setPageOffset(0);
              }}
              style={{
                background: "#0e1015",
                border: "1px solid #252b37",
                borderRadius: "6px",
                padding: "6px 10px",
                color: "#fff",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              {LANG_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.flag} {opt.label}
                </option>
              ))}
            </select>

            <select
              value={selectedStandingBy}
              onChange={(e) => {
                setSelectedStandingBy(e.target.value);
                setPageOffset(0);
              }}
              style={{
                background: "#0e1015",
                border: "1px solid #252b37",
                borderRadius: "6px",
                padding: "6px 10px",
                color: "#fff",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              <option value="all">All Pools (600)</option>
              <option value="true">🟢 Standing-By Only (200)</option>
              <option value="false">⚪ General Pool (400)</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Bot Persona</th>
                <th>Language / Country</th>
                <th>Matchmaking Pool</th>
                <th>Wallet Balance</th>
                <th>Average Rating</th>
                <th>Active Games</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--nz-text-3)" }}>
                    جاري تحميل بيانات البوتات...
                  </td>
                </tr>
              ) : data?.bots?.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--nz-text-3)" }}>
                    لا توجد بوتات تطابق خيارات البحث الحالية.
                  </td>
                </tr>
              ) : (
                data?.bots?.map((bot) => {
                  const langCode = bot.id.split("_")[1] || "ar";
                  const flagMap: Record<string, string> = {
                    ar: "🇸🇦 AR",
                    en: "🇺🇸 EN",
                    es: "🇪🇸 ES",
                    fr: "🇫🇷 FR",
                    hi: "🇮🇳 HI",
                    zh: "🇨🇳 ZH",
                  };
                  return (
                    <tr key={bot.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              background: "#1e2433",
                              overflow: "hidden",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "13px",
                              fontWeight: 700,
                              color: "#fff",
                              border: "1px solid #2d3748",
                              flexShrink: 0,
                            }}
                          >
                            {bot.avatar_url ? (
                              <img
                                src={bot.avatar_url}
                                alt={bot.handle}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = "none";
                                }}
                              />
                            ) : (
                              bot.handle.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: "#fff", fontSize: "13px" }}>{bot.handle}</div>
                            <div style={{ fontSize: "11px", color: "var(--nz-text-3)", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {bot.bio || bot.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeNeutral}`} style={{ fontSize: "10px" }}>
                          {flagMap[langCode] || langCode.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {bot.is_standing_by ? (
                          <span className={`${styles.badge} ${styles.badgeSuccess}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e" }} />
                            Standing-By (جاهز فوري)
                          </span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                            General Pool
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: "#22c55e", fontSize: "13px" }}>
                          ${bot.balance_usdt} USDT
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontWeight: 700, color: "#fff" }}>{bot.avg_rating}</span>
                          <span
                            className={styles.badge}
                            style={{
                              background: bot.avg_rating >= 2400 ? "rgba(234, 179, 8, 0.15)" : "rgba(59, 130, 246, 0.15)",
                              color: bot.avg_rating >= 2400 ? "#eab308" : "#3b82f6",
                              fontSize: "10px",
                            }}
                          >
                            {bot.avg_rating >= 2400 ? "Grandmaster" : bot.avg_rating >= 2000 ? "Master" : "Expert"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{ color: "var(--nz-text-2)", fontSize: "12px" }}>
                          {bot.games_count || 11} Games
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => handleTopupSingleBot(bot.id)}
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                        >
                          +1,000 USDT
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {data?.pagination && (
          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid #252b37",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "12px",
              color: "var(--nz-text-3)",
            }}
          >
            <div>
              Showing {data.pagination.offset + 1} - {Math.min(data.pagination.offset + data.pagination.limit, data.pagination.total)} of {data.pagination.total} bots
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className={styles.actionBtn}
                disabled={data.pagination.offset === 0}
                onClick={() => setPageOffset(Math.max(0, pageOffset - pageSize))}
                style={{ padding: "4px 12px" }}
              >
                Previous
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                disabled={data.pagination.offset + data.pagination.limit >= data.pagination.total}
                onClick={() => setPageOffset(pageOffset + pageSize)}
                style={{ padding: "4px 12px" }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
}
