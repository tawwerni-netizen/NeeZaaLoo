/**
 * Bot Router & API endpoints for 600 AI Personas across all 11 games.
 */
import { ALL_BOT_PERSONAS, ALL_GAMES, getBotById, getBotsForGame } from "./personas.mjs";
import { generateBotReply } from "./bot-chat-service.mjs";
import { createVsComputerService } from "../../matchmaking/src/vs-computer.mjs";

export function registerBotRoutes(routes) {
  // GET /v1/bots -- list bots with optional gameId and language filter (powers Leaderboards!)
  routes.push({
    method: "GET",
    path: "/v1/bots",
    action: "player.login",
    anonymous: true,
    handler: async ({ query }) => {
      const lang = query?.get?.("lang") || null;
      const gameId = query?.get?.("gameId") || null;

      let list = gameId ? getBotsForGame(gameId, lang) : ALL_BOT_PERSONAS;
      if (!gameId && lang) {
        list = list.filter((b) => b.language === lang);
      }

      const limit = Math.min(100, Math.max(1, parseInt(query?.get?.("limit") ?? "50", 10)));
      const page = Math.max(1, parseInt(query?.get?.("page") ?? "1", 10));
      const offset = (page - 1) * limit;

      const paginated = list.slice(offset, offset + limit);
      return {
        body: {
          total: list.length,
          page,
          limit,
          gameId: gameId || "all",
          bots: paginated,
        },
      };
    },
  });

  // GET /v1/bots/:id -- get details for one bot persona across all games
  routes.push({
    method: "GET",
    path: "/v1/bots/:id",
    action: "player.login",
    anonymous: true,
    handler: async ({ params }) => {
      const bot = getBotById(params.id);
      if (!bot) return { status: 404, body: { ok: false, reason: "BOT_NOT_FOUND" } };
      return { body: { ok: true, bot } };
    },
  });

  // POST /v1/bots/:id/chat -- in-game text chat or DM with bot in any game
  routes.push({
    method: "POST",
    path: "/v1/bots/:id/chat",
    action: "player.chat.match.write",
    anonymous: true,
    handler: async ({ params, body }) => {
      const bot = getBotById(params.id);
      if (!bot) return { status: 404, body: { ok: false, reason: "BOT_NOT_FOUND" } };
      const message = String(body?.message ?? "").trim();
      if (!message) return { status: 400, body: { ok: false, reason: "EMPTY_MESSAGE" } };
      const gameId = String(body?.gameId ?? "chess");

      const reply = await generateBotReply({ botId: bot.id, messageText: message, gameId });
      return {
        body: {
          ok: true,
          botId: bot.id,
          senderName: bot.name,
          reply,
          gameId,
          dialect: bot.dialect,
          timestamp: Date.now(),
        },
      };
    },
  });

  // POST /v1/bots/:id/challenge -- challenge any of the 600 bots to ANY of the 11 games
  routes.push({
    method: "POST",
    path: "/v1/bots/:id/challenge",
    action: "duel.play.free",
    handler: async ({ actor, params, body, db }) => {
      const bot = getBotById(params.id);
      if (!bot) return { status: 404, body: { ok: false, reason: "BOT_NOT_FOUND" } };

      const gameId = String(body?.gameId ?? "chess");
      if (!ALL_GAMES.includes(gameId)) {
        return { status: 400, body: { ok: false, reason: "UNSUPPORTED_GAME" } };
      }

      const timeProfile = body?.timeProfile ? String(body.timeProfile).toUpperCase() : "STANDARD";
      
      // Derive difficulty from bot's game-specific rating
      const rating = bot.gameRatings?.[gameId] ?? bot.rating;
      let difficulty = "MEDIUM";
      if (rating > 2400) difficulty = "EXPERT";
      else if (rating > 1950) difficulty = "HARD";
      else if (rating < 1650) difficulty = "EASY";

      const vsComputer = createVsComputerService(db);
      const r = await vsComputer.createDuel({
        gameId,
        playerId: actor.id,
        difficulty,
        timeProfile,
      });

      if (!r.ok) return { status: 400, body: { ok: false, reason: r.reason } };
      return {
        status: 201,
        body: {
          ok: true,
          duelId: r.duelId,
          gameId,
          difficulty,
          bot: {
            id: bot.id,
            name: bot.name,
            country: bot.country,
            rating,
            favoriteGames: bot.favoriteGames,
          },
        },
      };
    },
  });
}
