"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import styles from "./ChessTimePerMoveSelect.module.css";

export interface TimePerMoveOption {
  id: string;
  seconds: number | null;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
}

export const TIME_PER_MOVE_OPTIONS: TimePerMoveOption[] = [
  { id: "PER_MOVE_5S", seconds: 5, labelAr: "5 ثوانٍ لكل حركة", labelEn: "5s per move", descAr: "سرعة خارقة ورد فعل لحظي", descEn: "Lightning blitz pace" },
  { id: "PER_MOVE_10S", seconds: 10, labelAr: "10 ثوانٍ لكل حركة", labelEn: "10s per move", descAr: "خاطف وسريع جداً", descEn: "Fast-paced tactical" },
  { id: "PER_MOVE_30S", seconds: 30, labelAr: "30 ثانية لكل حركة", labelEn: "30s per move", descAr: "توازن مثالي بين التفكير والسرعة", descEn: "Ideal tactical balance" },
  { id: "PER_MOVE_60S", seconds: 60, labelAr: "دقيقة واحدة لكل حركة", labelEn: "1 min per move", descAr: "وقت كافٍ للحسابات العميقة", descEn: "Standard rapid calculation" },
  { id: "PER_MOVE_120S", seconds: 120, labelAr: "دقيقتان لكل حركة", labelEn: "2 mins per move", descAr: "وقت ممتد لدراسة كل التفريعات", descEn: "Extended strategic deep think" },
  { id: "UNLIMITED", seconds: null, labelAr: "وقت مفتوح بلا قيود", labelEn: "Unlimited (Open)", descAr: "بدون أي ضغط زمني", descEn: "No time constraints" },
];

export function ChessTimePerMoveSelect({
  onSelect,
  loading = false,
}: {
  onSelect: (profileId: string) => void;
  loading?: boolean;
}) {
  const { locale } = useI18n();
  const isAr = locale === "ar";
  const [selectedId, setSelectedId] = useState("PER_MOVE_30S");

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>
        {isAr ? "⏱️ اختر وقت الحركة (Time Per Move)" : "⏱️ Choose Time Per Move"}
      </h2>
      <p className={styles.subheading}>
        {isAr
          ? "يتم منحك وقتاً محدداً لكل نقلة على حدة، ويتجدد المؤقت مع كل حركة تقوم بها."
          : "You get a dedicated countdown per move, resetting on each turn."}
      </p>

      <div className={styles.dropdownWrap}>
        <label className={styles.label}>{isAr ? "وقت النقلة:" : "Turn Clock:"}</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className={styles.select}
          disabled={loading}
        >
          {TIME_PER_MOVE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {isAr ? opt.labelAr : opt.labelEn}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.grid}>
        {TIME_PER_MOVE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`${styles.card} ${selectedId === opt.id ? styles.cardActive : ""}`}
            onClick={() => setSelectedId(opt.id)}
          >
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>{opt.seconds ? "⚡" : "♾️"}</span>
              <span className={styles.cardTitle}>{isAr ? opt.labelAr : opt.labelEn}</span>
            </div>
            <p className={styles.cardDesc}>{isAr ? opt.descAr : opt.descEn}</p>
          </button>
        ))}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.startBtn}
          onClick={() => onSelect(selectedId)}
          disabled={loading}
        >
          {loading ? (isAr ? "جاري الإنشاء..." : "Starting...") : (isAr ? "بدء الجيم الآن ➔" : "Start Match ➔")}
        </button>
      </div>
    </div>
  );
}
