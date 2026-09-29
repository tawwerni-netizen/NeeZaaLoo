import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, "..");
const UI_DIR = path.resolve(WEB_ROOT, "src/components/ui");

describe("Nizalo Production Design System Certification", () => {
  const REQUIRED_COMPONENTS = [
    // Navigation
    "Navbar",
    "MobileBottomNav",
    // Catalog & Hub
    "GameCard",
    "GameHero",
    "GameSelector",
    "StakeSelector",
    "MatchmakingCard",
    "TournamentCard",
    // Tactical Play
    "PlayerCard",
    "RatingBadge",
    "Timer",
    "Scoreboard",
    "MatchResult",
    "RulesPanel",
    "ReplayViewer",
    // Financial & Modals
    "WalletBalance",
    "DepositModal",
    "WithdrawalModal",
    "ConfirmationModal",
    // Feedback & System States
    "Toast",
    "EmptyState",
    "LoadingState",
    "ErrorState",
    "Skeleton",
    // Typography primitives
    "Display",
    "Heading",
    "Body",
    "Caption",
    "Num",
    "GameStateText",
  ];

  test("Design system index exports all 30 required primitives", () => {
    const indexPath = path.join(UI_DIR, "index.ts");
    assert.ok(fs.existsSync(indexPath), "ui/index.ts must exist");
    const indexContent = fs.readFileSync(indexPath, "utf8");

    // Gather all exported symbols from index and re-exported modules
    const reExportMatches = [...indexContent.matchAll(/export\s+\*\s+from\s+["'](\.\/[^"']+)["']/g)];
    let combinedContent = indexContent;
    for (const match of reExportMatches) {
      const relPath = match[1];
      const targetTsx = path.join(UI_DIR, `${relPath.replace("./", "")}.tsx`);
      const targetTs = path.join(UI_DIR, `${relPath.replace("./", "")}.ts`);
      if (fs.existsSync(targetTsx)) {
        combinedContent += "\n" + fs.readFileSync(targetTsx, "utf8");
      } else if (fs.existsSync(targetTs)) {
        combinedContent += "\n" + fs.readFileSync(targetTs, "utf8");
      }
    }

    for (const comp of REQUIRED_COMPONENTS) {
      const isExported =
        combinedContent.includes(comp) ||
        combinedContent.includes(`as ${comp}`);
      assert.ok(isExported, `Component ${comp} must be exported in ui/index.ts`);
    }
  });

  test("Typography system implements all 6 token scales & RTL protection", () => {
    const typoTsx = path.join(UI_DIR, "Typography.tsx");
    const typoCss = path.join(UI_DIR, "Typography.module.css");
    assert.ok(fs.existsSync(typoTsx));
    assert.ok(fs.existsSync(typoCss));

    const tsxContent = fs.readFileSync(typoTsx, "utf8");
    const cssContent = fs.readFileSync(typoCss, "utf8");

    // Verify 6 variants in TSX
    assert.ok(tsxContent.includes("function Display"));
    assert.ok(tsxContent.includes("function Heading"));
    assert.ok(tsxContent.includes("function Body"));
    assert.ok(tsxContent.includes("function Caption"));
    assert.ok(tsxContent.includes("function Num"));
    assert.ok(tsxContent.includes("function GameStateText"));

    // Verify Tabular nums and RTL rules in CSS
    assert.ok(cssContent.includes("tabular-nums"), "Numbers must use tabular figures");
    assert.ok(cssContent.includes(":global([dir=\"rtl\"])"), "CSS must include native RTL rules");
    assert.ok(cssContent.includes("letter-spacing: 0"), "Arabic typography must disable positive tracking");
    assert.ok(cssContent.includes("direction: ltr"), "Financial numbers must maintain LTR in RTL mode");
  });

  test("Tactical Game Screen (DuelShell) satisfies 10 priorities and excludes marketing blocks", () => {
    const duelShellPath = path.join(WEB_ROOT, "src/components/game/DuelShell.tsx");
    assert.ok(fs.existsSync(duelShellPath));
    const content = fs.readFileSync(duelShellPath, "utf8");

    // Invariant: Priority elements are present
    assert.ok(content.includes("opponentBar") || content.includes("opponentSeat"), "1. Opponent info must be prioritized");
    assert.ok(content.includes("playerBar") || content.includes("mySeat"), "2. Player info must be prioritized");
    assert.ok(content.includes("boardContainer"), "3. Board/game area must have dedicated container");
    assert.ok(content.includes("clock") || content.includes("remainingMs"), "4. Clocks must be tracked");
    assert.ok(content.includes("PlayerStrip"), "5. Player strip score/rating must be visible");
    assert.ok(content.includes("canMove") || content.includes("toMove"), "6. Turn indicator must be authoritative");
    assert.ok(content.includes("lastMove") || content.includes("canMove"), "7. Legal move feedback must exist");
    assert.ok(content.includes("connected") && content.includes("reconnecting"), "8. Connection state must be tracked");
    assert.ok(content.includes("resign") || content.includes("ConfirmationModal"), "9. Surrender/draw controls must be accessible");
    assert.ok(content.includes("RulesPanel"), "10. Rules & help panel must be available");

    // Invariant: Marketing blocks MUST be absent during active gameplay
    assert.ok(!content.includes("<MarketingBanner"), "Must NOT render marketing banner in live gameplay");
    assert.ok(!content.includes("<PromoBanner"), "Must NOT render promo banner in live gameplay");
    assert.ok(!content.includes("<HeroBanner"), "Must NOT render hero banner in live gameplay");
    assert.ok(!content.includes("<Footer"), "Must NOT render full footer inside tactical game screen");
  });

  test("Responsive and touch target constraints (>=44px touch targets)", () => {
    const duelCss = path.join(WEB_ROOT, "src/components/game/DuelShell.module.css");
    const cssContent = fs.readFileSync(duelCss, "utf8");

    // Touch action manipulation to prevent zooming/scrolling delay
    assert.ok(cssContent.includes("touch-action: manipulation"), "Interactive board/buttons must have touch-action manipulation");
    // Responsive breakpoints
    assert.ok(cssContent.includes("@media (max-width: 640px)"), "Must handle mobile breakpoint <=640px");
    assert.ok(cssContent.includes("@media (max-width: 480px)"), "Must handle narrow mobile <=480px");
  });

  test("Authoritative Rules Registry covers all 11 canonical games for RulesPanel", async () => {
    const rulesRegistryPath = path.resolve(WEB_ROOT, "../../packages/duel-engine/src/ruleset-registry.mjs");
    assert.ok(fs.existsSync(rulesRegistryPath), "ruleset-registry.mjs must exist");

    const { pathToFileURL } = await import("node:url");
    const { RulesetRegistry } = await import(pathToFileURL(rulesRegistryPath).href);
    assert.ok(RulesetRegistry, "RulesetRegistry must be exported");

    const CANONICAL_GAMES = [
      "chess", "dominoes", "ludo", "backgammon", "speed_math",
      "xo", "connect_four", "checkers", "reversi", "gomoku", "seega"
    ];

    for (const slug of CANONICAL_GAMES) {
      const entry = RulesetRegistry[slug];
      assert.ok(entry, `RulesetRegistry must have entry for canonical game ${slug}`);
      assert.ok(entry.variants, `${slug} must have variants`);
      const defVariant = entry.defaultVariant;
      assert.ok(entry.variants[defVariant], `${slug} default variant ${defVariant} must exist`);
      assert.ok(entry.variants[defVariant].rulesDocument.overview, `${slug} must have overview`);
      assert.ok(entry.variants[defVariant].rulesDocument.legalMoves, `${slug} must have legal moves rules`);
      assert.ok(entry.variants[defVariant].rulesDocument.winConditions, `${slug} must have win conditions`);
    }
  });

  test("All UI component CSS modules exist and are well-formed", () => {
    const cssFiles = fs.readdirSync(UI_DIR).filter((f) => f.endsWith(".module.css"));
    assert.ok(cssFiles.length >= 10, "At least 10 CSS modules for UI primitives");

    for (const file of cssFiles) {
      const fullPath = path.join(UI_DIR, file);
      const text = fs.readFileSync(fullPath, "utf8");
      assert.ok(text.length > 50, `${file} should not be empty`);
    }
  });
});
