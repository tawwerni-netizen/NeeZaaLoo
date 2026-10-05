import React from "react";
import styles from "./Scoreboard.module.css";

export interface ScorePlayer {
  name: string;
  score: number;
  isTurn?: boolean;
}

export interface ScoreboardProps {
  players: ScorePlayer[];
  roundLabel?: string;
  className?: string;
}

export function Scoreboard({
  players,
  roundLabel,
  className,
}: ScoreboardProps) {
  return (
    <div
      className={[styles.scoreboard, className].filter(Boolean).join(" ")}
      role="region"
      aria-label="Match Scoreboard"
    >
      {players.map((p, idx) => (
        <React.Fragment key={p.name + idx}>
          {idx > 0 && <span className={styles.divider}>:</span>}
          <div className={styles.scoreItem}>
            <span className={styles.playerName} title={p.name}>
              {p.name}
            </span>
            <span className={styles.scoreNum}>{p.score}</span>
            {p.isTurn && <span className={styles.turnIndicator} title="Active Turn" />}
          </div>
        </React.Fragment>
      ))}

      {roundLabel && <div className={styles.roundInfo}>{roundLabel}</div>}
    </div>
  );
}
