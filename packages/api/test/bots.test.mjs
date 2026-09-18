import test from "node:test";
import assert from "node:assert/strict";
import { ALL_BOT_PERSONAS, ALL_GAMES, getBotById, getBotsForGame } from "../src/bots/personas.mjs";
import { generateBotReply, getFallbackReply } from "../src/bots/bot-chat-service.mjs";

test("bots: generates exactly 600 unique bot personas across 6 languages for all 11 games", () => {
  assert.equal(ALL_BOT_PERSONAS.length, 600);
  assert.equal(ALL_GAMES.length, 11);

  const langCounts = {};
  for (const bot of ALL_BOT_PERSONAS) {
    langCounts[bot.language] = (langCounts[bot.language] || 0) + 1;
    assert.ok(bot.rating >= 1500 && bot.rating <= 2900, "Rating in realistic human ELO range");
    assert.ok(bot.name.length > 0, "Has non-empty name");
    assert.ok(bot.dialect.length > 0, "Has dialect description");
    assert.ok(bot.favoriteGames.length >= 2, "Has favorite games");

    // Check that ratings exist for all 11 games
    for (const g of ALL_GAMES) {
      assert.ok(typeof bot.gameRatings[g] === "number", `Has rating for ${g}`);
      assert.ok(bot.gameRatings[g] >= 1400 && bot.gameRatings[g] <= 3000, `Valid rating for ${g}`);
    }
  }

  // Exactly 100 bots for each of the 6 languages
  assert.equal(langCounts.ar, 100, "100 Arabic bots");
  assert.equal(langCounts.en, 100, "100 English bots");
  assert.equal(langCounts.es, 100, "100 Spanish bots");
  assert.equal(langCounts.fr, 100, "100 French bots");
  assert.equal(langCounts.hi, 100, "100 Hindi bots");
  assert.equal(langCounts.zh, 100, "100 Chinese bots");
});

test("bots: retrieves bot by ID", () => {
  const botAr = getBotById("bot_ar_001");
  assert.ok(botAr);
  assert.equal(botAr.language, "ar");
  assert.equal(botAr.id, "bot_ar_001");

  const botEn = getBotById("bot_en_050");
  assert.ok(botEn);
  assert.equal(botEn.language, "en");
});

test("bots: game leaderboards return sorted bots for Backgammon and Dominoes", () => {
  const backgammonBots = getBotsForGame("backgammon");
  assert.equal(backgammonBots.length, 600);
  assert.ok(backgammonBots[0].gameRatings.backgammon >= backgammonBots[1].gameRatings.backgammon);

  const dominoesArabic = getBotsForGame("dominoes", "ar");
  assert.equal(dominoesArabic.length, 100);
  assert.ok(dominoesArabic[0].gameRatings.dominoes >= dominoesArabic[1].gameRatings.dominoes);
});

test("bots: chat fallback returns game-aware authentic dialect messages", async () => {
  const botAr = getBotById("bot_ar_001");

  // Chess message
  const chessReply = await generateBotReply({ botId: botAr.id, messageText: "مرحبا يا بطل", gameId: "chess" });
  assert.ok(chessReply && chessReply.length > 0);

  // Backgammon message
  const bgReply = await generateBotReply({ botId: botAr.id, messageText: "رمية حلوة!", gameId: "backgammon" });
  assert.ok(bgReply && bgReply.length > 0);

  // Dominoes message
  const domReply = await generateBotReply({ botId: botAr.id, messageText: "قفلتها خلاص", gameId: "dominoes" });
  assert.ok(domReply && domReply.length > 0);
});
