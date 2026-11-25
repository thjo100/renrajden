// Ände-till-ände-test mot Firebase-emulatorerna (Auth + Firestore) och den byggda sajten.
// Körs med: npm run test:e2e   (bygger i emulator-läge och startar emulatorerna)
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { preview } from "vite";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { seedNews } from "../scripts/seed-news.mjs";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Kör via `npm run test:e2e` så att emulatorerna startas.");
  process.exit(1);
}

const OUT = "tests/out";
mkdirSync(OUT, { recursive: true });
const results = [];
let failed = 0;
async function step(name, fn) {
  try { await fn(); results.push(`OK   ${name}`); }
  catch (e) { failed++; results.push(`FEL  ${name} – ${String(e && e.message || e).split("\n")[0]}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// ---- Testdata ----
const db = getFirestore(initializeApp({ projectId: "demo-renrajden" }));
await seedNews(db, { force: true });
await db.doc("admins/admin@example.com").set({ email: "admin@example.com" });

// ---- Server + webbläsare ----
const server = await preview({ preview: { port: 4173, strictPort: true, host: "127.0.0.1" }, logLevel: "silent" });
const BASE = "http://127.0.0.1:4173/";
const browser = await chromium.launch();

async function googleLogin(page, email) {
  await page.click("#login-open");
  await page.waitForSelector("#login-dialog[open]");
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.click("#google-btn")]);
  await popup.waitForLoadState();
  try {
    await popup.click("#add-account-button", { timeout: 8000 });
    await popup.fill("#email-input", email);
    await popup.click("#sign-in");
  } catch (e) {
    writeFileSync(`${OUT}/auth-popup.html`, await popup.content().catch(() => ""));
    throw new Error("Hittade inte emulatorns inloggningsformulär (se tests/out/auth-popup.html): " + e.message);
  }
  await popup.waitForEvent("close", { timeout: 10000 }).catch(() => {});
}

const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));

await step("besökare ser nyheter, senaste-remsan och resultatarkivet", async () => {
  await page.goto(BASE);
  await page.waitForSelector(".news-card", { timeout: 10000 });
  assert((await page.locator("#news-list .news-card").count()) === 4, "fel antal nyhetskort");
  assert((await page.textContent("#latest-link")) === "Renrajden 2027", "senaste-remsan visar fel nyhet");
  assert((await page.locator("#years > li").count()) === 14, "resultatarkivet är inte statiskt renderat");
  assert(await page.evaluate(() => document.documentElement.lang === "sv"), "lang saknas");
  assert(await page.locator("#admin-bar").isHidden(), "adminraden syns för besökare");
  await page.screenshot({ path: `${OUT}/besokare.png` });
});

await step("nyhetsarkivet går att fälla ut", async () => {
  await page.click("#news-more");
  assert((await page.locator("#news-archive > li").count()) === 18, "arkivet har fel antal poster");
  await page.click("#news-more");
});

await step("Google-konto som inte är admin nekas och loggas ut", async () => {
  await googleLogin(page, "someone@example.com");
  await page.waitForSelector("#login-msg:not([hidden])", { timeout: 10000 });
  const msg = await page.textContent("#login-msg");
  assert(msg.includes("someone@example.com är inte administratör"), "fel meddelande: " + msg);
  assert(await page.locator("#admin-bar").isHidden(), "adminraden syns för icke-admin");
  await page.keyboard.press("Escape");
});

let uid = null;
await step("admin loggar in med Google", async () => {
  await googleLogin(page, "admin@example.com");
  await page.waitForSelector("#admin-bar:not([hidden])", { timeout: 10000 });
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => document.activeElement.textContent.includes("Ny nyhet")), "fokus hamnade inte i adminraden");
  assert((await page.locator("[data-edit]").count()) >= 4, "redigeringsknappar saknas");
  await page.screenshot({ path: `${OUT}/admin.png` });
});

await step("http-länk nekas i formuläret", async () => {
  await page.click('#admin-bar [data-action="new-news"]');
  await page.fill("#f-title", "E2E: parkering vid stadion");
  await page.fill("#f-body", "Parkeringsvakter visar vägen.");
  await page.fill("#link-rows input[type=text]", "Karta");
  await page.fill("#link-rows input[type=url]", "http://example.com/karta");
  await page.click("#save-btn");
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.activeElement.id === "error-summary"), "felsammanfattningen fick inte fokus");
});

let newId = null;
await step("admin publicerar en nyhet som sparas i Firestore", async () => {
  await page.fill("#link-rows input[type=url]", "https://example.com/karta");
  await page.click("#save-btn");
  await page.waitForFunction(() => document.activeElement && document.activeElement.tagName === "H3", null, { timeout: 10000 });
  assert((await page.evaluate(() => document.activeElement.textContent)) === "E2E: parkering vid stadion", "fokus på fel element");
  newId = await page.evaluate(() => document.activeElement.id.replace(/^nt-/, ""));
  const snap = await db.doc(`news/${newId}`).get();
  assert(snap.exists, "nyheten finns inte i Firestore");
  uid = snap.get("updatedBy");
  assert(typeof uid === "string" && uid.length > 0, "updatedBy saknas");
  assert(snap.get("links")[0].url === "https://example.com/karta", "länken sparades fel");
});

await step("admin redigerar och gör nyheten till viktigt meddelande", async () => {
  await page.click(`[data-edit="${newId}"]`);
  await page.fill("#f-title", "E2E: ändrad parkering");
  await page.check("#f-alert");
  await page.click("#save-btn");
  // Webbläsaren återställer själv fokus när dialogen stängs, så vänta på den nya rubriken först.
  await page.waitForFunction((id) => document.getElementById("nt-" + id)?.textContent === "E2E: ändrad parkering", newId, { timeout: 10000 })
    .catch(() => { throw new Error("rubriken uppdaterades inte i listan"); });
  await page.waitForFunction((id) => document.activeElement && document.activeElement.getAttribute("data-edit") === id, newId, { timeout: 5000 })
    .catch(() => { throw new Error("fokus hamnade inte på Redigera-knappen"); });
  assert(await page.locator("#alert-bar").isVisible(), "viktigt-bannern syns inte");
  assert((await page.textContent("#alert-text")) === "E2E: ändrad parkering", "bannern har fel text");
  assert((await db.doc(`news/${newId}`).get()).get("alert") === true, "alert sparades inte");
});

await step("ta bort ger fokus på Ångra, och ångra återställer nyheten", async () => {
  await page.click(`[data-delete="${newId}"]`);
  await page.click("#confirm-delete");
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "toast-action", null, { timeout: 10000 });
  assert(!(await db.doc(`news/${newId}`).get()).exists, "nyheten finns kvar i Firestore");
  await page.keyboard.press("Enter");
  await page.waitForFunction((id) => document.activeElement && document.activeElement.id === "nt-" + id, newId, { timeout: 10000 });
  assert((await db.doc(`news/${newId}`).get()).exists, "nyheten återställdes inte");
});

await step("admin-sessionen finns kvar efter omladdning", async () => {
  await page.reload();
  await page.waitForSelector("#admin-bar:not([hidden])", { timeout: 15000 });
});

await step("admin tar bort testnyheten och loggar ut", async () => {
  await page.click(`[data-delete="${newId}"]`);
  await page.click("#confirm-delete");
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "toast-action", null, { timeout: 10000 });
  await page.click("#logout-btn");
  await page.waitForSelector("#admin-bar", { state: "hidden" });
  assert((await page.locator("[data-edit]").count()) === 0, "redigeringsknappar finns kvar efter utloggning");
  assert(await page.locator("#alert-bar").isHidden(), "bannern ligger kvar fast nyheten är borttagen");
  await page.reload();
  await page.waitForSelector(".news-card");
  await page.waitForTimeout(1500);
  assert(await page.locator("#admin-bar").isHidden(), "adminläget kom tillbaka efter utloggning");
});

await step("inga JavaScript-fel", async () => { assert(!errors.length, errors.join("; ")); });

await step("mobil 360 px: ingen sidledsscroll och läget tävlingsdag fungerar", async () => {
  const p = await browser.newPage({ viewport: { width: 360, height: 780 } });
  await p.goto(BASE + "?lage=tavlingsdag");
  await p.waitForSelector(".news-card");
  assert((await p.evaluate(() => document.documentElement.scrollWidth)) <= 360, "sidledsscroll");
  assert((await p.textContent("#cta-1")) === "PM och tider", "fel knapptext på tävlingsdagen");
  await p.screenshot({ path: `${OUT}/mobil-tavlingsdag.png` });
  await p.close();
});

await step("inbjudan nås från startsidan och ryms på ett A4", async () => {
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(BASE);
  await p.click('#loppet a[href="/inbjudan"]');
  await p.waitForSelector(".sheet");
  await p.evaluate(() => document.fonts.ready);
  const pdf = await p.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert(pages === 1, `inbjudan blir ${pages} sidor`);
  assert(await p.evaluate(() => { const s = document.querySelector(".sheet"), f = document.querySelector(".bottom"), last = f.previousElementSibling; return last.getBoundingClientRect().bottom <= f.getBoundingClientRect().top && f.getBoundingClientRect().bottom <= s.getBoundingClientRect().bottom + 1; }), "innehållet ryms inte på arket");
  writeFileSync(`${OUT}/inbjudan.pdf`, pdf);
  await p.setViewportSize({ width: 360, height: 780 });
  assert((await p.evaluate(() => document.documentElement.scrollWidth)) <= 360, "sidledsscroll på mobil");
  await p.close();
});

await browser.close();
await new Promise((r) => server.httpServer.close(r));
console.log(results.join("\n"));
console.log(failed ? `\n${failed} test misslyckades.` : `\nAlla ${results.length} test godkända.`);
process.exit(failed ? 1 : 0);
