import type { GameDefinition, GameBoardPlugin, GameCategory } from "./types.ts";
import { CANONICAL_GAMES_METADATA } from "./canonical-games.ts";

const DefaultEmptyBoard = () => null;

const GAME_NAMES_EN: Record<string, string> = {
  chess: "Chess",
  xo: "Tic-Tac-Toe",
  connect_four: "Connect Four",
  checkers: "Checkers",
  reversi: "Reversi",
  gomoku: "Gomoku",
  seega: "Seega",
  speed_math: "Speed Math",
  dominoes: "Dominoes",
  ludo: "Ludo Royale",
  backgammon: "Backgammon",
};

const GAME_NAMES_AR: Record<string, string> = {
  chess: "الشطرنج",
  xo: "إكس أو",
  connect_four: "أربعة على التوالي",
  checkers: "الداما",
  reversi: "ريفيرسي",
  gomoku: "جوموكو",
  seega: "السيجة",
  speed_math: "الحساب السريع",
  dominoes: "الدومينو",
  ludo: "لودو رويال",
  backgammon: "طاولة الزهر",
};

/**
 * GameRegistry: The single canonical source of truth for all games across Nizalo.
 * Pre-seeded with all 11 official games in canonical order.
 */
class GameRegistryImpl {
  private map = new Map<string, GameDefinition>();

  constructor() {
    this.seedCanonical();
  }

  private seedCanonical() {
    for (const init of CANONICAL_GAMES_METADATA) {
      const fullDef: GameDefinition = {
        ...init,
        slug: init.id,
        name: init.name || GAME_NAMES_EN[init.id] || init.id,
        nameAr: init.nameAr || GAME_NAMES_AR[init.id] || init.id,
        descriptionAr: init.shortDescriptionAr,
        durationMinutes: init.typicalDuration,
        playerMode: init.playerModeDisplay,
        popular: init.isPopular,
        rulesVersion: {
          standard: init.rules.governingStandard,
          rngModel: init.rules.hasRng ? (init.rules.rngMechanism || "CSPRNG") : "Deterministic (Zero Luck)",
          notes: init.rules.hasRng
            ? "Cryptographically verifiable server RNG seeds ensure 100% fair tile/dice outcomes."
            : "100% pure skill. No dice, no cards, no chance mechanics.",
        },
        Board: init.Board || DefaultEmptyBoard,
      };
      this.map.set(init.id, fullDef);
    }
  }

  /**
   * Register or upgrade a game definition (e.g. attaching the interactive React Board component).
   */
  register(plugin: GameBoardPlugin | GameDefinition): void {
    const existing = this.map.get(plugin.id);
    if (existing && existing.Board !== DefaultEmptyBoard && plugin.Board !== DefaultEmptyBoard && existing.Board !== plugin.Board) {
      throw new Error(`Game "${plugin.id}" is already registered with a board component`);
    }

    if (existing) {
      // Merge with canonical metadata while attaching real board and any plugin overrides
      this.map.set(plugin.id, {
        ...existing,
        ...plugin,
        Board: plugin.Board || existing.Board,
      });
    } else {
      // Entirely new game added dynamically - synthesize minimal canonical defaults if not fully provided
      const fullDef: GameDefinition = {
        icon: "🎮",
        tagline: plugin.id,
        taglineAr: plugin.id,
        shortDescription: plugin.id,
        shortDescriptionAr: plugin.id,
        typicalDuration: "5-10 min",
        typicalDurationAr: "5-10 د",
        playerModeDisplay: "1v1",
        playerModeDisplayAr: "1 ضد 1",
        skillLevel: "Standard",
        skillLevelAr: "قياسي",
        categories: ["ALL", "SKILL", "AVAILABLE_NOW", "FREE_TO_PLAY"],
        availability: {
          status: "LIVE",
          isAvailableNow: true,
          onlinePlayersBenchmark: 50,
          serversOnline: true,
        },
        stakeEligibility: {
          isCashEligible: plugin.cashEnabled,
          isFreeToPlay: true,
          currency: "USDT",
        },
        rules: {
          version: "v1.0",
          rulesUrl: `/games/${plugin.id}`,
          governingStandard: "Official Standard",
          lastReviewedDate: "2026-09",
          hasRng: false,
        },
        variants: [{ id: "standard", name: "Standard", nameAr: "قياسي" }],
        modes: [{ type: "1v1", label: "1v1 Duel", labelAr: "مبارزة 1v1", minPlayers: 2, maxPlayers: 2 }],
        ...plugin,
      };
      this.map.set(plugin.id, fullDef);
    }
  }

  get(id: string): GameDefinition | undefined {
    return this.map.get(id) || this.map.get(id.replace(/-/g, "_")) || this.map.get(id.replace(/_/g, "-"));
  }

  getAll(): GameDefinition[] {
    return [...this.map.values()];
  }

  getSlugs(): string[] {
    return [...this.map.keys()];
  }

  getCount(): number {
    return this.map.size;
  }

  filter(category: GameCategory | "ALL" | string): GameDefinition[] {
    if (!category || category === "ALL") return this.getAll();
    return this.getAll().filter((g) => g.categories.includes(category as GameCategory));
  }

  getAvailableNow(): GameDefinition[] {
    return this.getAll().filter((g) => g.availability.isAvailableNow);
  }

  getCashEligible(): GameDefinition[] {
    return this.getAll().filter((g) => g.stakeEligibility.isCashEligible);
  }

  getFreeToPlay(): GameDefinition[] {
    return this.getAll().filter((g) => g.stakeEligibility.isFreeToPlay);
  }

  getPopular(): GameDefinition[] {
    return this.getAll().filter((g) => Boolean(g.isPopular));
  }

  getNew(): GameDefinition[] {
    return this.getAll().filter((g) => Boolean(g.isNew));
  }

  getRelated(gameId: string, limit = 4): GameDefinition[] {
    const current = this.get(gameId);
    if (!current) return this.getAll().slice(0, limit);
    return this.getAll()
      .filter((g) => g.id !== gameId)
      .sort((a, b) => {
        const aShared = a.categories.filter((c) => current.categories.includes(c)).length;
        const bShared = b.categories.filter((c) => current.categories.includes(c)).length;
        return bShared - aShared;
      })
      .slice(0, limit);
  }
}

export const GameRegistry = new GameRegistryImpl();

export function registerGame(plugin: GameBoardPlugin | GameDefinition): void {
  GameRegistry.register(plugin);
}

export function getGame(id: string): GameDefinition | undefined {
  return GameRegistry.get(id);
}

export function listGames(): GameDefinition[] {
  return GameRegistry.getAll();
}
