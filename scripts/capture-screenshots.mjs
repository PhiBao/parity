/**
 * Captures the README screenshots from a running deployment.
 *
 * Usage:
 *   BASE_URL=https://parity-xi.vercel.app node scripts/capture-screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = resolve(process.env.OUT_DIR ?? "docs");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/home/kiter/.local/bin/chromium",
  args: ["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1200 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
page.setDefaultTimeout(60_000);

async function shoot(name, { selector } = {}) {
  if (selector) {
    const el = page.locator(selector).first();
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await el.screenshot({ path: resolve(OUT, name) });
  } else {
    await page.screenshot({ path: resolve(OUT, name) });
  }
  console.log(`wrote ${name}`);
}

// 1. Board: hero + live dislocations
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await shoot("screenshot-home.png");

// 2. Asset verdict card
await page.goto(`${BASE}/asset/NVDA`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await shoot("screenshot-verdict.png", { selector: "main > div > section" });

// 3. Wrapper table
await shoot("screenshot-wrappers.png", { selector: "main table" , padding: 24 });

// 4. Dislocation history chart
await shoot("screenshot-history.png", {
  selector: "figure",
  padding: 24,
});

// 5. Evidence drawer, expanded
const evidenceButton = page.locator("ul.divide-y > li > button").first();
await evidenceButton.scrollIntoViewIfNeeded();
await evidenceButton.click();
await page.waitForTimeout(2000);
await shoot("screenshot-evidence.png", { selector: "main > div > div:last-child", padding: 24 });

await context.close();
await browser.close();
console.log(`Screenshots written to ${OUT}`);
