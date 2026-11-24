// Playwright-harness: lägger på publiceringsskelettet och injicerar mocken.
//   const { openPage } = require("./harness");
//   const { browser, page } = await openPage({ width, height, dark, admin, signedOut, seed, noClaude, reducedMotion });
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PAGE = process.env.RR_PAGE || path.join(ROOT, "prototyp", "index.html");
const SEED = process.env.RR_SEED || path.join(ROOT, "prototyp", "seed-news.json");
const OUT = path.join(__dirname, "wrapped.html");

function build() {
  const body = fs.readFileSync(PAGE, "utf8");
  const reset = ":root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}";
  fs.writeFileSync(OUT, `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${reset}</style></head><body>${body}</body></html>`);
  return OUT;
}

async function openPage(opts = {}) {
  const { width = 1440, height = 900, dark = false, admin = false, signedOut = false, seed = true, noClaude = false, reducedMotion = false } = opts;
  const file = build();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? "dark" : "light", reducedMotion: reducedMotion ? "reduce" : "no-preference", deviceScaleFactor: 1 });
  const page = await context.newPage();
  if (!noClaude) {
    const seedData = seed ? JSON.parse(fs.readFileSync(SEED, "utf8")) : [];
    await page.addInitScript((cfg) => { window.__MOCK = cfg; }, { admin, signedOut, seed: seedData });
    await page.addInitScript({ path: path.join(__dirname, "mock-claude.js") });
  }
  await page.goto("file://" + file);
  await page.waitForTimeout(1200);
  return { browser, context, page };
}

module.exports = { build, openPage };
