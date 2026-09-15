import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const artifactDir = "C:\\Users\\Hifzy\\.gemini\\antigravity\\brain\\c0ae4bce-e9f3-4ba6-ade0-5962c74da5f6";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// Capture full page with 9000px height so How It Works is fully included
const fullPageOut = path.join(artifactDir, "nizalo_full_landing_page.png");
console.log("Capturing full landing page...");
spawnSync(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1400,9000",
    `--screenshot=${fullPageOut}`,
    "http://127.0.0.1:3005/ar",
  ],
  { stdio: "inherit" }
);

// Capture Tournaments section focused
const tournOut = path.join(artifactDir, "tournaments_section_live.png");
console.log("Capturing Tournaments section focused...");
spawnSync(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1400,2400",
    `--screenshot=${tournOut}`,
    "http://127.0.0.1:3005/ar#tournaments",
  ],
  { stdio: "inherit" }
);

// Capture How It Works section focused
const howOut = path.join(artifactDir, "how_it_works_section_redesign.png");
console.log("Capturing How It Works section focused...");
spawnSync(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1400,1600",
    `--screenshot=${howOut}`,
    "http://127.0.0.1:3005/ar#how-it-works",
  ],
  { stdio: "inherit" }
);

console.log("All captures completed!");
