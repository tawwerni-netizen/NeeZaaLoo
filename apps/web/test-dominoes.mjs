import { DominoesPlugin } from "../../packages/game-dominoes/src/plugin.mjs";
import { dealHands, determineOpening, rngFrom, fullSet } from "../../packages/game-dominoes/src/dominoes.mjs";

const seed = "test-seed-123456";
console.log("Hands:", dealHands(seed));
const challenge = DominoesPlugin.createChallenge(seed);
console.log("Turn:", challenge.state.turn);
console.log("Must play tile:", challenge.state.openingConstraint);

const intent = { tile: challenge.state.openingConstraint.tile };
console.log("Intent:", intent);

const res = DominoesPlugin.applyIntent(challenge.state, intent, { seat: challenge.state.turn, serverTimeMs: Date.now() });
console.log("Apply Intent Result:", res);
