/**
 * Nizalo Game Engine Contract
 * 
 * Formal specification for the Universal Match Platform + Individual Rules Engines.
 * The universal platform owns infrastructure, lifecycle, clocks, events, and settlement.
 * Each rules engine owns game-specific rules, legal move generation, move validation,
 * terminal evaluation, and board definitions.
 */
import { TurnModel } from "./duel.mjs";
export { TurnModel };

export const RngPolicy = Object.freeze({
  DETERMINISTIC: "DETERMINISTIC",
  SERVER_SEEDED: "SERVER_SEEDED",
  COMMIT_REVEAL: "COMMIT_REVEAL",
});

export const ScoringType = Object.freeze({
  BINARY: "BINARY", // 1-0, 0-1, 1/2-1/2
  POINTS: "POINTS", // e.g. Speed Math, Dominoes pip count
  ROUNDS: "ROUNDS", // Best of N
});

export const MatchEventType = Object.freeze({
  MatchCreated: "MatchCreated",
  PlayersJoined: "PlayersJoined",
  GameStarted: "GameStarted",
  MoveSubmitted: "MoveSubmitted",
  MoveAccepted: "MoveAccepted",
  MoveRejected: "MoveRejected",
  TurnChanged: "TurnChanged",
  ClockUpdated: "ClockUpdated",
  GameEnded: "GameEnded",
  PlayerResigned: "PlayerResigned",
  PlayerTimedOut: "PlayerTimedOut",
  PlayerDisconnected: "PlayerDisconnected",
  GameAborted: "GameAborted",
  ResultFinalized: "ResultFinalized",
  SettlementTriggered: "SettlementTriggered",
  SettlementCompleted: "SettlementCompleted",
});

export const REQUIRED_CONTRACT_FIELDS = [
  "id",
  "slug",
  "version",
  "title",
  "variants",
  "playerCount",
  "boardDefinition",
  "turnModel",
  "timeControl",
  "scoringModel",
  "rngPolicy",
  "rulesVersion",
  "ratingProfile",
  "cashEligibility",
  "tournamentEligibility",
  "disconnectHandling",
  // Function methods:
  "createChallenge",
  "moveValidation",
  "legalMoves",
  "applyAction",
  "winCondition",
  "drawCondition",
  "resignation",
  "timeout",
  "stateSerializer",
  "replaySerializer",
];

/**
 * Validates that an engine implementation strictly adheres to the Game Engine Contract.
 * Throws TypeError if any required field, type, or function is missing or invalid.
 */
export function validateGameDefinition(engine) {
  if (!engine || typeof engine !== "object") {
    throw new TypeError("GameDefinition must be a non-null object");
  }

  // Identity & Versioning
  if (!engine.id || typeof engine.id !== "string") {
    throw new TypeError("GameDefinition must have a string 'id'");
  }
  if (!engine.slug || typeof engine.slug !== "string") {
    throw new TypeError(`GameDefinition ${engine.id}: must have a string 'slug'`);
  }
  if (!Number.isInteger(engine.version) || engine.version < 1) {
    throw new TypeError(`GameDefinition ${engine.id}: 'version' (GameEngineVersion) must be a positive integer`);
  }
  if (!engine.rulesVersion || typeof engine.rulesVersion !== "string") {
    throw new TypeError(`GameDefinition ${engine.id}: 'rulesVersion' (RulesetVersion) must be a string`);
  }
  if (!engine.title || typeof engine.title !== "object" || !engine.title.en || !engine.title.ar) {
    throw new TypeError(`GameDefinition ${engine.id}: 'title' must be an object with { en, ar }`);
  }

  // Variants & Players
  if (!Array.isArray(engine.variants) || engine.variants.length === 0) {
    throw new TypeError(`GameDefinition ${engine.id}: 'variants' must be a non-empty array`);
  }
  if (!engine.playerCount || typeof engine.playerCount !== "object" ||
      typeof engine.playerCount.min !== "number" || typeof engine.playerCount.max !== "number") {
    throw new TypeError(`GameDefinition ${engine.id}: 'playerCount' must specify { min, max, default }`);
  }

  // Board & Model
  if (!engine.boardDefinition || typeof engine.boardDefinition !== "object" || !engine.boardDefinition.type) {
    throw new TypeError(`GameDefinition ${engine.id}: 'boardDefinition' must declare a 'type'`);
  }
  if (!Object.values(TurnModel).includes(engine.turnModel)) {
    throw new TypeError(`GameDefinition ${engine.id}: invalid turnModel '${engine.turnModel}'`);
  }
  if (!Object.values(RngPolicy).includes(engine.rngPolicy)) {
    throw new TypeError(`GameDefinition ${engine.id}: invalid rngPolicy '${engine.rngPolicy}'`);
  }
  if (!engine.timeControl || typeof engine.timeControl !== "object") {
    throw new TypeError(`GameDefinition ${engine.id}: 'timeControl' configuration is required`);
  }
  if (!engine.scoringModel || typeof engine.scoringModel !== "object" || !engine.scoringModel.type) {
    throw new TypeError(`GameDefinition ${engine.id}: 'scoringModel' must specify { type, description }`);
  }

  // Policy & Eligibility
  if (!engine.ratingProfile || typeof engine.ratingProfile !== "object") {
    throw new TypeError(`GameDefinition ${engine.id}: 'ratingProfile' is required`);
  }
  if (!engine.cashEligibility || typeof engine.cashEligibility !== "object" || typeof engine.cashEligibility.eligible !== "boolean") {
    throw new TypeError(`GameDefinition ${engine.id}: 'cashEligibility' must specify { eligible, minStakeMinor, maxStakeMinor }`);
  }
  if (!engine.tournamentEligibility || typeof engine.tournamentEligibility !== "object" || typeof engine.tournamentEligibility.supported !== "boolean") {
    throw new TypeError(`GameDefinition ${engine.id}: 'tournamentEligibility' must specify { supported, formats }`);
  }
  if (!engine.disconnectHandling || typeof engine.disconnectHandling !== "object") {
    throw new TypeError(`GameDefinition ${engine.id}: 'disconnectHandling' configuration is required`);
  }

  // Core Function Contracts
  const requiredFunctions = [
    "createChallenge",
    "moveValidation",
    "legalMoves",
    "applyAction",
    "winCondition",
    "drawCondition",
    "resignation",
    "timeout",
  ];

  for (const fn of requiredFunctions) {
    if (typeof engine[fn] !== "function") {
      throw new TypeError(`GameDefinition ${engine.id}: missing required function '${fn}()'`);
    }
  }

  // Serializer contracts
  if (!engine.stateSerializer || typeof engine.stateSerializer.serialize !== "function" || typeof engine.stateSerializer.deserialize !== "function") {
    throw new TypeError(`GameDefinition ${engine.id}: 'stateSerializer' must provide serialize() and deserialize()`);
  }
  if (typeof engine.replaySerializer !== "function") {
    throw new TypeError(`GameDefinition ${engine.id}: missing 'replaySerializer()'`);
  }

  return true;
}
