/**
 * Captures the share-card PNG from the running app by driving the real
 * "download PNG" button — the same artifact a user would post.
 *
 * Usage:
 *   BASE_URL=https://parity-xi.vercel.app OUT=demo-out/parity-nvda.png node scripts/capture-share-card.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SYMBOL = process.env.SYMBOL ?? "NVDA";
const OUT = resolve(process.env.OUT ?? "./demo-out/parity-share-card.png");

mkdirSync(dirname(OUT), { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/home/kiter/.local/bin/chromium",
  args: ["--no-sandbox", "--disable-gpu"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

await page.goto(`${BASE}/asset/${SYMBOL}`, { waitUntil: "networkidle" });
const button = page.getByRole("button", { name: /download png/i });
await button.scrollIntoViewIfNeeded();

const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 30_000 }),
  button.click(),
]);
await download.saveAs(OUT);

await context.close();
await browser.close();
console.log(`Share card written to ${OUT}`);
