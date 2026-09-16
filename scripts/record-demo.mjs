/**
 * Records the Parity demo video end-to-end against a running deployment.
 *
 * Usage:
 *   BASE_URL=https://parity-xi.vercel.app node scripts/record-demo.mjs
 *
 * Produces a single .webm in OUT_DIR (default ./demo-out). Captions are
 * injected into the page at runtime, so the video is narrated without audio
 * and is reproducible on any machine with Chromium installed.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = resolve(process.env.OUT_DIR ?? "./demo-out");
const VIEWPORT = { width: 1280, height: 720 };

mkdirSync(OUT, { recursive: true });

async function caption(page, text) {
  await page.evaluate((value) => {
    let el = document.getElementById("__parity_caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__parity_caption";
      document.body.appendChild(el);
    }
    el.textContent = value;
    el.style.cssText = [
      "position:fixed",
      "left:0",
      "right:0",
      "bottom:0",
      "z-index:2147483647",
      "padding:16px 26px 18px",
      "background:linear-gradient(0deg, rgba(7,8,10,0.97) 55%, rgba(7,8,10,0.72))",
      "color:#f4f5f7",
      "font:600 21px/1.35 system-ui,-apple-system,'Segoe UI',sans-serif",
      "letter-spacing:-0.01em",
      "border-top:1px solid rgba(216,255,62,0.45)",
      "box-shadow:0 -12px 40px rgba(0,0,0,0.5)",
      "pointer-events:none",
    ].join(";");
  }, text);
}

async function scrollTo(page, selector, offset = 120) {
  await page.evaluate(
    ({ sel, off }) => {
      const el = document.querySelector(sel);
      if (!el) return;
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - off,
        behavior: "smooth",
      });
    },
    { sel: selector, off: offset },
  );
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/home/kiter/.local/bin/chromium",
  args: ["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb", "--font-render-hinting=none"],
});

const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: VIEWPORT },
});

const page = await context.newPage();
page.setDefaultTimeout(60_000);

// ── scene 1: the board ─────────────────────────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await caption(page, "CoinMarketCap's new RWA API lists 7,900+ tokenised assets.");
await wait(3500);

await caption(page, "One Nvidia share. Eight wrappers. None of them compare themselves to each other.");
await wait(4000);

await scrollTo(page, "section:nth-of-type(2)", 90);
await caption(page, "Right now, two wrappers of the same share are 300+ bps apart.");
await wait(5500);

await scrollTo(page, "section:nth-of-type(3)", 90);
await caption(page, "Parity prices every asset against the real instrument — live CMC data, no screenshots.");
await wait(6500);

await scrollTo(page, "section:nth-of-type(4)", 90);
await caption(page, "When the underlying market closes, the anchor freezes — and dislocations cluster.");
await wait(6500);

// ── scene 2: one asset, full breakdown ─────────────────────────────────────
await page.goto(`${BASE}/asset/NVDA`, { waitUntil: "networkidle" });
await caption(page, "Type a ticker. Parity answers with a verdict, not a wall of numbers.");
await wait(5000);

await scrollTo(page, "table", 130);
await caption(page, "Every issuer ranked. Exclusions stay visible — with the reason attached.");
await wait(6000);

await scrollTo(page, "[aria-label='Tokenised wrapper dislocation history']", 150);
await caption(page, "180 sessions of wrapper-vs-wrapper spread. Both legs are tokens, so the comparison is drift-free.");
await wait(6500);

// ── scene 3: proof ─────────────────────────────────────────────────────────
await scrollTo(page, "ul.divide-y", 120);
await caption(page, "Every number links back to the raw CoinMarketCap call it came from.");
await wait(2000);

try {
  const firstEvidenceRow = page.locator("ul.divide-y > li > button").first();
  await firstEvidenceRow.click();
  await wait(2500);
} catch {
  /* evidence drawer may not be in view — the scene still reads */
}
await caption(page, "Endpoint, HTTP status, credits burned, full JSON payload. Audit everything.");
await wait(6000);

await scrollTo(page, "canvas", 200);
await caption(page, "Export the call as an image, ready for the timeline.");
await wait(4500);

// ── scene 4: close ─────────────────────────────────────────────────────────
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await caption(page, "Parity — check the premium before you pay it.  #BuildwithCMC");
await wait(5000);

await context.close();
await browser.close();

console.log(`Done. Video written to ${OUT}`);
