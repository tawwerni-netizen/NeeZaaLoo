"use client";

/**
 * Reads plugin.difficulties -- never a hardcoded EASY/MEDIUM/HARD/EXPERT
 * list -- so a game with no AI adapter at all (plugin.difficulties === [])
 * renders nothing here rather than offering a choice matchmaking would
 * later refuse. Labels come from the existing, already cross-game
 * game.difficulty.* vocabulary (see DuelShell's own use of the same keys
 * for a bot's opponent-strip label).
 */
import { Button } from "@/components/Button";
import { useI18n } from "@/lib/i18n/context";
import type { Difficulty, GamePlugin } from "@/lib/games";
import styles from "./DifficultySelect.module.css";

export function DifficultySelect({ plugin, onSelect }: {
  plugin: GamePlugin;
  onSelect: (difficulty: Difficulty) => void;
}) {
  const { t } = useI18n();
  if (plugin.difficulties.length === 0) return null;

  return (
    <div>
      <h1 className={styles.heading}>{t("play.difficulty.heading")}</h1>
      <div className={styles.grid}>
        {plugin.difficulties.map((d) => (
          <Button key={d} variant="secondary" onClick={() => onSelect(d)}>
            {t(`game.difficulty.${d}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
