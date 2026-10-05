/**
 * Central Game Engine Registry
 *
 * Exposes all 11 individual rules engines under the formal Game Engine Contract:
 * - chess
 * - dominoes
 * - ludo
 * - backgammon
 * - speed-math
 * - xo
 * - connect-four
 * - checkers
 * - reversi
 * - gomoku
 * - seega
 *
 * Each engine is validated against validateGameDefinition at startup.
 */

import { validateGameDefinition, TurnModel, RngPolicy, ScoringType } from "../contract.mjs";

// Import existing underlying plugin modules
import { ChessPlugin } from "../../../game-chess/src/plugin.mjs";
import { DominoesPlugin } from "../../../game-dominoes/src/plugin.mjs";
import { LudoPlugin } from "../../../game-ludo/src/plugin.mjs";
import { BackgammonPlugin } from "../../../game-backgammon/src/plugin.mjs";
import { SpeedMathPlugin } from "../../../game-speed-math/src/plugin.mjs";
import { XOPlugin } from "../../../game-xo/src/plugin.mjs";
import { ConnectFourPlugin } from "../../../game-connect-four/src/plugin.mjs";
import { CheckersPlugin } from "../../../game-checkers/src/plugin.mjs";
import { ReversiPlugin } from "../../../game-reversi/src/plugin.mjs";
import { GomokuPlugin } from "../../../game-gomoku/src/plugin.mjs";
import { SeegaPlugin } from "../../../game-seega/src/plugin.mjs";

// Helper to build a compliant GameEngineContract instance
function buildContractEngine({
  plugin,
  slug,
  title,
  variants,
  playerCount,
  boardDefinition,
  turnModel = TurnModel.ALTERNATING,
  timeControl,
  scoringModel,
  rngPolicy = RngPolicy.DETERMINISTIC,
  rulesVersion,
  ratingProfile,
  cashEligibility,
  tournamentEligibility,
  disconnectHandling = { gracePeriodMs: 45000, reconnectTimeoutMs: 60000, autoForfeitOnExpiry: true },
  legalMovesFn,
  moveValidationFn,
}) {
  const engine = {
    id: plugin.id,
    slug,
    version: plugin.version ?? 1,
    title,
    variants,
    playerCount,
    boardDefinition,
    turnModel,
    timeControl,
    scoringModel,
    rngPolicy,
    rulesVersion,
    ratingProfile,
    cashEligibility,
    tournamentEligibility,
    disconnectHandling,

    createChallenge: (seed, config) => plugin.createChallenge(seed, config),

    legalMoves: (state, seat) => {
      if (typeof legalMovesFn === "function") {
        return legalMovesFn(state, seat);
      }
      return [];
    },

    moveValidation: (state, action, context) => {
      if (typeof moveValidationFn === "function") {
        return moveValidationFn(state, action, context);
      }
      // Delegate to pure test of applyIntent
      const test = plugin.applyIntent(state, action, context);
      if (!test.ok) {
        return { valid: false, reason: test.reason ?? "ILLEGAL_MOVE" };
      }
      return { valid: true };
    },

    applyAction: (state, action, context) => {
      const res = plugin.applyIntent(state, action, context);
      if (!res.ok) return res;
      return {
        ok: true,
        state: res.state,
        events: res.events ?? [],
      };
    },

    winCondition: (state) => {
      const evalResult = plugin.evaluate(state);
      if (evalResult && evalResult.result) {
        if (evalResult.result === "1-0") {
          return { won: true, winnerSeat: 0, reason: evalResult.reason };
        }
        if (evalResult.result === "0-1") {
          return { won: true, winnerSeat: 1, reason: evalResult.reason };
        }
      }
      return { won: false };
    },

    drawCondition: (state) => {
      const evalResult = plugin.evaluate(state);
      if (evalResult && evalResult.result === "1/2-1/2") {
        return { isDraw: true, reason: evalResult.reason };
      }
      return { isDraw: false };
    },

    resignation: (state, resigningSeat) => ({
      result: resigningSeat === 0 ? "0-1" : "1-0",
      reason: "RESIGNATION",
      winnerSeat: resigningSeat === 0 ? 1 : 0,
    }),

    timeout: (state, timedOutSeat) => ({
      result: timedOutSeat === 0 ? "0-1" : "1-0",
      reason: "TIMEOUT",
      winnerSeat: timedOutSeat === 0 ? 1 : 0,
    }),

    outcomeOnExpiry: typeof plugin.outcomeOnExpiry === "function" ? plugin.outcomeOnExpiry : undefined,

    stateSerializer: {
      serialize: (state) => JSON.parse(JSON.stringify(state)),
      deserialize: (data) => JSON.parse(JSON.stringify(data)),
    },

    replaySerializer: (challengeState, events) => {
      if (typeof plugin.serializeReplay === "function") {
        return plugin.serializeReplay(challengeState, events);
      }
      return { initialState: challengeState, moves: events.filter(e => e.type === "MoveAccepted") };
    },
  };

  validateGameDefinition(engine);
  return engine;
}

// 1. CHESS
export const ChessEngine = buildContractEngine({
  plugin: ChessPlugin,
  slug: "chess",
  title: { en: "Chess", ar: "الشطرنج" },
  variants: [
    { id: "standard", name: "Standard FIDE", description: "Standard international chess rules" },
    { id: "blitz", name: "Blitz 3+2", description: "Fast-paced tournament timing" },
  ],
  playerCount: { min: 2, max: 2, default: 2 },
  boardDefinition: { type: "grid-8x8", dimensions: [8, 8], setupDescription: "Standard 32 pieces, White on ranks 1-2, Black on ranks 7-8" },
  turnModel: TurnModel.ALTERNATING,
  timeControl: { defaultProfile: "rapid_10_0", allowedProfiles: ["blitz_3_2", "rapid_10_0", "classical_15_10"], incrementSupported: true },
  scoringModel: { type: ScoringType.BINARY, description: "1-0 for White win, 0-1 for Black win, 1/2-1/2 for draw" },
  rngPolicy: RngPolicy.DETERMINISTIC,
  rulesVersion: "FIDE-2023",
  ratingProfile: { category: "chess", kFactor: 32, provisionalThreshold: 20 },
  cashEligibility: { eligible: true, minStakeMinor: 1_000_000, maxStakeMinor: 100_000_000 },
  tournamentEligibility: { supported: true, formats: ["SINGLE_ELIMINATION", "SWISS"] },
});

// 2. XO (Tic-Tac-Toe)
export const XoEngine = buildContractEngine({
  plugin: XOPlugin,
  slug: "xo",
  title: { en: "Tic-Tac-Toe (XO)", ar: "إكس أو" },
  variants: [{ id: "standard", name: "Classic 3x3", description: "Standard 3 in a row" }],
  playerCount: { min: 2, max: 2, default: 2 },
  boardDefinition: { type: "grid-3x3", dimensions: [3, 3], setupDescription: "9 empty cells" },
  turnModel: TurnModel.ALTERNATING,
  timeControl: { defaultProfile: "blitz_1_0", allowedProfiles: ["bullet_30s", "blitz_1_0"], incrementSupported: false },
  scoringModel: { type: ScoringType.BINARY, description: "1-0 (X), 0-1 (O), 1/2-1/2 (Draw)" },
  rngPolicy: RngPolicy.DETERMINISTIC,
  rulesVersion: "NIZALO-XO-v1",
  ratingProfile: { category: "xo", kFactor: 24, provisionalThreshold: 15 },
  cashEligibility: { eligible: false, minStakeMinor: 0, maxStakeMinor: 0 },
  tournamentEligibility: { supported: false, formats: [] },
  legalMovesFn: (state) => {
    const moves = [];
    if (!state?.board) return moves;
    for (let i = 0; i < 9; i++) {
      if (state.board[i] === 0) moves.push(i);
    }
    return moves;
  },
});

// 3. CONNECT FOUR
export const ConnectFourEngine = buildContractEngine({
  plugin: ConnectFourPlugin,
  slug: "connect-four",
  title: { en: "Connect Four", ar: "أربعة على التوالي" },
  variants: [{ id: "standard", name: "Standard 7x6", description: "Gravity-drop 4 in a line" }],
  playerCount: { min: 2, max: 2, default: 2 },
  boardDefinition: { type: "grid-7x6-gravity", dimensions: [7, 6], setupDescription: "7 vertical columns, 6 rows" },
  turnModel: TurnModel.ALTERNATING,
  timeControl: { defaultProfile: "blitz_3_0", allowedProfiles: ["blitz_1_0", "blitz_3_0", "rapid_5_0"], incrementSupported: true },
  scoringModel: { type: ScoringType.BINARY, description: "1-0 (Player 1), 0-1 (Player 2), 1/2-1/2 (Draw)" },
  rngPolicy: RngPolicy.DETERMINISTIC,
  rulesVersion: "NIZALO-CONNECT-FOUR-v1",
  ratingProfile: { category: "connect-four", kFactor: 32, provisionalThreshold: 20 },
  cashEligibility: { eligible: true, minStakeMinor: 1_000_000, maxStakeMinor: 50_000_000 },
  tournamentEligibility: { supported: true, formats: ["SINGLE_ELIMINATION"] },
  legalMovesFn: (state) => {
    const cols = [];
    if (!state?.board) return cols;
    for (let c = 0; c < 7; c++) {
      if (state.board[5 * 7 + c] === 0) cols.push(c);
    }
    return cols;
  },
});

// 4. CHECKERS
export const CheckersEngine = buildContractEngine({
  plugin: CheckersPlugin,
  slug: "checkers",
  title: { en: "Checkers", ar: "الداما" },
  variants: [{ id: "american", name: "American Standard (8x8)", description: "Compulsory jump captures, kings fly 1 square" }],
  playerCount: { min: 2, max: 2, default: 2 },
  boardDefinition: { type: "grid-8x8-dark-cells", dimensions: [8, 8], setupDescription: "12 men per side on dark squares" },
  turnModel: TurnModel.ALTERNATING,
  timeControl: { defaultProfile: "rapid_5_0", allowedProfiles: ["blitz_3_2", "rapid_5_0", "rapid_10_0"], incrementSupported: true },
  scoringModel: { type: ScoringType.BINARY, description: "1-0, 0-1, 1/2-1/2" },
  rngPolicy: RngPolicy.DETERMINISTIC,
  rulesVersion: "WCDF-AMERICAN-v1",
  ratingProfile: { category: "checkers", kFactor: 32, provisionalThreshold: 20 },
  cashEligibility: { eligible: true, minStakeMinor: 1_000_000, maxStakeMinor: 50_000_000 },
  tournamentEligibility: { supported: true, formats: ["SINGLE_ELIMINATION", "SWISS"] },
});

// 5. REVERSI
export const ReversiEngine = buildContractEngine({
  plugin: ReversiPlugin,
  slug: "reversi",
  title: { en: "Reversi (Othello)", ar: "ريفيرسي" },
  variants: [{ id: "standard", name: "Classic Othello", description: "Flank and flip opponent discs" }],
  playerCount: { min: 2, max: 2, default: 2 },
  boardDefinition: { type: "grid-8x8", dimensions: [8, 8], setupDescription: "Center 4 discs placed diagonally (2 Black, 2 White)" },
  turnModel: TurnModel.ALTERNATING,
  timeControl: { defaultProfile: "rapid_5_0", allowedProfiles: ["rapid_5_0", "rapid_10_0"], incrementSupported: true },
  scoringModel: { type: ScoringType.POINTS, description: "Total disc count comparison at terminal state" },
  rngPolicy: RngPolicy.DETERMINISTIC,
  rulesVersion: "WOF-OTHELLO-v1",
  ratingProfile: { category: "reversi", kFactor: 32, provisionalThreshold: 20 },
  cashEligibility: { eligible: true, minStakeMinor: 1_000_000, maxStakeMinor: 50_000_000 },
  tournamentEligibility: { supported: true, formats: ["SINGLE_ELIMINATION"] },
});

// 6. GOMOKU
export const GomokuEngine = buildContractEngine({
  plugin: GomokuPlugin,
  slug: "gomoku",
  title: { en: "Gomoku", ar: "جوموكو" },
  variants: [{ id: "standard", name: "Five-in-a-Row Freestyle", description: "First to complete 5 stones consecutively" }],
  playerCount: { min: 2, max: 2, default: 2 },
  boardDefinition: { type: "grid-15x15", dimensions: [15, 15], setupDescription: "225 intersection points" },
  turnModel: TurnModel.ALTERNATING,
  timeControl: { defaultProfile: "rapid_5_0", allowedProfiles: ["blitz_3_0", "rapid_5_0"], incrementSupported: true },
  scoringModel: { type: ScoringType.BINARY, description: "1-0, 0-1, 1/2-1/2" },
  rngPolicy: RngPolicy.DETERMINISTIC,
  rulesVersion: "RIF-GOMOKU-v1",
  ratingProfile: { category: "gomoku", kFactor: 32, provisionalThreshold: 20 },
  cashEligibility: { eligible: true, minStakeMinor: 1_000_000, maxStakeMinor: 50_000_000 },
  tournamentEligibility: { supported: true, formats: ["SINGLE_ELIMINATION"] },
});

// 7. SEEGA
export const SeegaEngine = buildContractEngine({
  plugin: SeegaPlugin,
  slug: "seega",
  title: { en: "Seega", ar: "السيجة" },
  variants: [{ id: "standard", name: "Traditional 5x5 Bedouin", description: "Drop phase followed by custodial capture movement" }],
  playerCount: { min: 2, max: 2, default: 2 },
  boardDefinition: { type: "grid-5x5", dimensions: [5, 5], setupDescription: "25 squares, center square (al-wasat) reserved" },
  turnModel: TurnModel.ALTERNATING,
  timeControl: { defaultProfile: "rapid_5_0", allowedProfiles: ["rapid_5_0", "rapid_10_0"], incrementSupported: true },
  scoringModel: { type: ScoringType.BINARY, description: "1-0, 0-1, 1/2-1/2" },
  rngPolicy: RngPolicy.DETERMINISTIC,
  rulesVersion: "NIZALO-SEEGA-BEDOUIN-v1",
  ratingProfile: { category: "seega", kFactor: 32, provisionalThreshold: 20 },
  cashEligibility: { eligible: true, minStakeMinor: 1_000_000, maxStakeMinor: 50_000_000 },
  tournamentEligibility: { supported: true, formats: ["SINGLE_ELIMINATION"] },
});

// 8. SPEED MATH
export const SpeedMathEngine = buildContractEngine({
  plugin: SpeedMathPlugin,
  slug: "speed-math",
  title: { en: "Speed Math", ar: "الرياضيات السريعة" },
  variants: [{ id: "arithmetic-race", name: "Rapid Arithmetic Race", description: "Race to solve arithmetic problems under shared deadline" }],
  playerCount: { min: 2, max: 2, default: 2 },
  boardDefinition: { type: "equation-panel", setupDescription: "Problem sequence generated from seed" },
  turnModel: TurnModel.SIMULTANEOUS,
  timeControl: { defaultProfile: "shared_60s", allowedProfiles: ["shared_30s", "shared_60s", "shared_90s"], incrementSupported: false },
  scoringModel: { type: ScoringType.POINTS, description: "Highest score at clock expiry wins" },
  rngPolicy: RngPolicy.SERVER_SEEDED,
  rulesVersion: "NIZALO-SPEED-MATH-v1",
  ratingProfile: { category: "speed-math", kFactor: 24, provisionalThreshold: 15 },
  cashEligibility: { eligible: true, minStakeMinor: 1_000_000, maxStakeMinor: 50_000_000 },
  tournamentEligibility: { supported: true, formats: ["SINGLE_ELIMINATION"] },
});

// 9. DOMINOES
export const DominoesEngine = buildContractEngine({
  plugin: DominoesPlugin,
  slug: "dominoes",
  title: { en: "Dominoes", ar: "الدومينو" },
  variants: [
    { id: "traditional_block", name: "Traditional Block", description: "Classic double-six block dominoes; no boneyard drawing" },
    { id: "all_fives", name: "American All-Fives (Muggins)", description: "Score multiples of 5 during play with boneyard drawing" },
  ],
  playerCount: { min: 2, max: 4, default: 2 },
  boardDefinition: { type: "open-chain", setupDescription: "28 domino bones (0-0 through 6-6)" },
  turnModel: TurnModel.ALTERNATING,
  timeControl: { defaultProfile: "rapid_10_0", allowedProfiles: ["rapid_5_0", "rapid_10_0"], incrementSupported: true },
  scoringModel: { type: ScoringType.POINTS, description: "Pip summation of remaining opponent tiles / Multiples of 5" },
  rngPolicy: RngPolicy.SERVER_SEEDED,
  rulesVersion: "NIZALO-DOMINOES-CLASSIC-DRAW-v1",
  ratingProfile: { category: "dominoes", kFactor: 32, provisionalThreshold: 20 },
  cashEligibility: { eligible: true, minStakeMinor: 1_000_000, maxStakeMinor: 100_000_000 },
  tournamentEligibility: { supported: true, formats: ["SINGLE_ELIMINATION"] },
});

// 10. LUDO
export const LudoEngine = buildContractEngine({
  plugin: LudoPlugin,
  slug: "ludo",
  title: { en: "Ludo", ar: "لودو" },
  variants: [{ id: "classic", name: "Classic 4-Player Cross", description: "Cross track with 4 colored home columns" }],
  playerCount: { min: 2, max: 4, default: 2 },
  boardDefinition: { type: "cross-track", setupDescription: "52 perimeter spaces, 4 home paths of 6 squares each" },
  turnModel: TurnModel.ALTERNATING,
  timeControl: { defaultProfile: "rapid_15_0", allowedProfiles: ["rapid_10_0", "rapid_15_0"], incrementSupported: true },
  scoringModel: { type: ScoringType.BINARY, description: "First player to bear off all 4 tokens wins" },
  rngPolicy: RngPolicy.SERVER_SEEDED,
  rulesVersion: "NIZALO-LUDO-STANDARD-v1",
  ratingProfile: { category: "ludo", kFactor: 24, provisionalThreshold: 20 },
  cashEligibility: { eligible: true, minStakeMinor: 1_000_000, maxStakeMinor: 50_000_000 },
  tournamentEligibility: { supported: true, formats: ["SINGLE_ELIMINATION"] },
});

// 11. BACKGAMMON
export const BackgammonEngine = buildContractEngine({
  plugin: BackgammonPlugin,
  slug: "backgammon",
  title: { en: "Backgammon", ar: "طاولة الزهر" },
  variants: [{ id: "classic-tavla", name: "Classic Tavla", description: "24 points, 15 checkers, bearing off" }],
  playerCount: { min: 2, max: 2, default: 2 },
  boardDefinition: { type: "points-24", setupDescription: "24 triangular points divided into four 6-point quadrants" },
  turnModel: TurnModel.ALTERNATING,
  timeControl: { defaultProfile: "rapid_10_0", allowedProfiles: ["rapid_5_0", "rapid_10_0"], incrementSupported: true },
  scoringModel: { type: ScoringType.BINARY, description: "First to bear off all 15 checkers wins" },
  rngPolicy: RngPolicy.SERVER_SEEDED,
  rulesVersion: "NIZALO-BACKGAMMON-TAVLA-v1",
  ratingProfile: { category: "backgammon", kFactor: 32, provisionalThreshold: 20 },
  cashEligibility: { eligible: true, minStakeMinor: 1_000_000, maxStakeMinor: 100_000_000 },
  tournamentEligibility: { supported: true, formats: ["SINGLE_ELIMINATION"] },
});

export const ALL_ENGINES = [
  ChessEngine,
  XoEngine,
  ConnectFourEngine,
  CheckersEngine,
  ReversiEngine,
  GomokuEngine,
  SeegaEngine,
  SpeedMathEngine,
  DominoesEngine,
  LudoEngine,
  BackgammonEngine,
];

export function getEngineById(id) {
  const engine = ALL_ENGINES.find(e => e.id === id || e.slug === id);
  if (!engine) throw new Error(`Game engine '${id}' not found`);
  return engine;
}
