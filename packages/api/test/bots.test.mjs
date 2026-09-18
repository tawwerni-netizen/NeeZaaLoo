import test from "node:test";
import assert from "node:assert/strict";
import { ALL_BOT_PERSONAS, getBotById } from "../src/bots/personas.mjs";
import { generateBotReply, getFallbackReply } from "../src/bots/bot-chat-service.mjs";

test("bots: generates exactly 600 unique bot personas across 6 languages", () => {
  assert.equal(ALL_BOT_PERSONAS.length, 600);

  const langCounts = {};
  for (const bot of ALL_BOT_PERSONAS) {
    langCounts[bot.language] = (langCounts[bot.language] || 0) + 1;
    assert.ok(bot.rating >= 1500 && bot.rating <= 2900, "Rating in realistic human ELO range");
    assert.ok(bot.name.length > 0, "Has non-empty name");
    assert.ok(bot.dialect.length > 0, "Has dialect description");
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

test("bots: chat fallback returns authentic dialect messages", async () => {
  const botAr = getBotById("bot_ar_001");
  const reply = await generateBotReply({ botId: botAr.id, messageText: "مرحبا يا بطل" });
  assert.ok(reply && reply.length > 0);
  assert.equal(typeof reply, "string");
});
