// Ände-till-ände-test mot Firebase-emulatorerna (Auth + Firestore) och den byggda sajten.
// Körs med: npm run test:e2e   (bygger i emulator-läge och startar emulatorerna)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { preview } from "vite";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { seedNews } from "../scripts/seed-news.mjs";
import { fetchContent } from "../scripts/vite-cms.mjs";
import { fillHtml } from "../src/cms/render.js";

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

/* ---------- Årets lopp och resultatarkivet ---------- */
const isOpen = (sel) => page.evaluate((s) => document.querySelector(s)?.open === true, sel);

await step("admin ändrar årets lopp, och första sparningen kopierar arkivet till Firestore", async () => {
  assert(!(await db.doc("settings/event").get()).exists, "settings/event fanns redan före testet");
  await page.click('#admin-bar [data-action="edit-event"]');
  await page.waitForSelector("#event-dialog[open]");
  assert((await page.inputValue("#ev-date")) === "2027-01-30", "formuläret har fel datum");
  assert((await page.locator("#ev-dists .sub-row").count()) === 3, "formuläret har fel antal distanser");
  await page.fill("#ev-reg", "http://example.com/anmalan");
  await page.click("#event-dialog [type=submit]");
  await page.waitForFunction(() => document.activeElement?.classList.contains("error-summary"), null, { timeout: 5000 })
    .catch(() => { throw new Error("felsammanfattningen fick inte fokus"); });
  assert((await page.getAttribute("#ev-reg", "aria-invalid")) === "true", "fältet markerades inte som fel");
  await page.fill("#ev-reg", "https://example.com/anmalan");
  await page.fill("#ev-deadline", "2027-01-20");
  await page.locator('#ev-dists .sub-row >> nth=0 >> input[id^="dlate-"]').fill("650");
  await page.screenshot({ path: `${OUT}/arets-lopp.png` });
  await page.click("#event-dialog [type=submit]");
  await page.waitForFunction(() => !document.querySelector("#event-dialog").open, null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('[data-cms="fees"]').textContent.includes("Efteranmälan 650 kr"), null, { timeout: 5000 })
    .catch(() => { throw new Error("avgiften uppdaterades inte på sidan"); });
  assert((await page.textContent('[data-cms="deadline"]')).includes("onsdag 20 januari 2027"), "sista anmälningsdag uppdaterades inte");
  assert((await page.getAttribute('[data-cms="registration"] a', "href")) === "https://example.com/anmalan", "anmälningslänken syns inte");
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.activeElement?.dataset.action === "edit-event"), "fokus kom inte tillbaka till knappen");
  const ev = (await db.doc("settings/event").get()).data();
  assert(ev.deadline === "2027-01-20" && ev.distances[0].lateFee === 650 && ev.distances[2].km === 10.5, "årets lopp sparades fel");
  assert(ev.updatedBy === uid, "updatedBy saknas");
  assert((await db.collection("years").get()).size === 13, "resultatarkivet kopierades inte till Firestore");
});

await step("besökare ser det nya innehållet, även i inbjudan", async () => {
  const p = await browser.newPage();
  await p.goto(BASE);
  await p.waitForFunction(() => document.documentElement.dataset.cms === "db", null, { timeout: 10000 });
  assert((await p.textContent('[data-cms="fees"]')).includes("Efteranmälan 650 kr"), "besökaren ser inte den nya avgiften");
  assert((await p.locator("#years > li").count()) === 14, "resultatarkivet har fel antal år efter kopieringen");
  await p.goto(BASE + "inbjudan");
  await p.waitForFunction(() => document.documentElement.dataset.cms === "db", null, { timeout: 10000 });
  assert((await p.textContent('[data-cms="inv-fees"]')).includes("650 kr"), "inbjudan visar inte den nya avgiften");
  assert((await p.textContent('[data-cms="inv-deadline"]')).includes("onsdag 20 januari 2027"), "inbjudan visar fel sista anmälningsdag");
  await p.close();
});

await step("admin lägger in resultatet för 2027", async () => {
  await page.click('[data-year-new="2027"]');
  await page.waitForSelector("#year-dialog[open]");
  assert((await page.inputValue("#yr-year")) === "2027" && (await page.inputValue("#yr-date")) === "2027-01-30", "förslaget för 2027 är fel");
  await page.fill("#yr-links input[type=text]", "Resultat (pdf)");
  await page.fill("#yr-links input[type=url]", "https://example.com/resultat-2027.pdf");
  await page.click("#year-dialog >> text=+ Lägg till segrare");
  await page.fill("#yr-winners input >> nth=0", "H42");
  await page.fill("#yr-winners input >> nth=1", "Testa Testsson");
  await page.click("#year-dialog >> text=+ Lägg till segrare");
  await page.fill("#yr-winners input >> nth=2", "D21");
  await page.fill("#yr-winners input >> nth=3", "Korta Kortsson");
  await page.screenshot({ path: `${OUT}/resultat-2027.png` });
  await page.click("#year-dialog [type=submit]");
  await page.waitForSelector('#years > li[data-year="2027"]', { timeout: 10000 });
  assert((await page.locator("#years .next-year").count()) === 0, "2027 visas fortfarande som kommande lopp");
  await page.waitForFunction(() => document.activeElement?.dataset.yearEdit === "2027", null, { timeout: 5000 })
    .catch(() => { throw new Error("fokus hamnade inte på Redigera för 2027"); });
  const side = page.locator('[data-cms="history-side"] tr[data-dist="42"]', { hasText: "Testa Testsson" });
  const short = page.locator('[data-cms="history-side"] tr[data-dist="21"]', { hasText: "Korta Kortsson" });
  assert((await side.locator("th").textContent()).includes("2027") && (await side.locator("td").first().textContent()) === "Testa Testsson", "herrsegraren 2027 står fel i tabellen");
  const shortYear = page.locator('#years > li[data-year="2027"] .winners', { hasText: "Korta Kortsson" });
  assert(await side.isVisible(), "segraren på 42 km syns inte i sidorutan");
  assert(!(await short.isVisible()) && !(await shortYear.isVisible()), "21 km ska vara dolt från början");
  await page.check("#vis-21");
  assert(await short.isVisible() && await shortYear.isVisible(), "21 km syns inte när det är ikryssat");
  await page.uncheck("#vis-42");
  assert(!(await side.isVisible()), "42 km syns fast det är urkryssat");
  await page.locator("#resultat").screenshot({ path: `${OUT}/resultatarkiv-21km.png` });
  await page.check("#vis-42");
  await page.uncheck("#vis-21");
  const y = (await db.doc("years/2027").get()).data();
  assert(y && y.links[0].url === "https://example.com/resultat-2027.pdf" && y.winners[0].names === "Testa Testsson" && y.winners[1].class === "D21", "2027 sparades fel");
  await page.locator("#resultat").screenshot({ path: `${OUT}/resultatarkiv-admin.png` });
});

await step("dialogen för årets lopp fungerar på mobil 360 px", async () => {
  const p = await context.newPage(); // samma inloggning
  await p.setViewportSize({ width: 360, height: 780 });
  await p.goto(BASE);
  await p.waitForSelector("#admin-bar:not([hidden])", { timeout: 15000 });
  await p.click('#anmalan [data-action="edit-event"]');
  await p.waitForSelector("#event-dialog[open]");
  assert(await p.evaluate(() => document.activeElement?.id === "ev-deadline"), "knappen under Anmälan ska ge fokus på sista anmälningsdag");
  assert(await p.evaluate(() => { const d = document.querySelector("#event-dialog"); return d.scrollWidth <= d.clientWidth; }), "dialogen scrollar i sidled");
  await p.locator("#ev-dists").scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/arets-lopp-mobil.png` });
  await p.keyboard.press("Escape");
  assert(!(await p.evaluate(() => document.querySelector("#event-dialog").open)), "Esc stängde inte en orörd dialog");
  await p.close();
});

await step("admin kan inte lägga till ett år som redan finns", async () => {
  await page.click('[data-action="new-year"]');
  await page.waitForSelector("#year-dialog[open]");
  await page.fill("#yr-year", "2025");
  await page.click("#year-dialog [type=submit]");
  await page.waitForSelector("#yr-year-err:not([hidden])");
  assert((await page.textContent("#yr-year-err")).includes("finns redan"), "fel meddelande för dubblett");
  await page.keyboard.press("Escape"); // visar "Stäng utan att spara?"
  assert(await page.locator("#year-dialog .discard").isVisible(), "varningen för osparat visas inte");
  await page.click("#year-dialog [data-discard-yes]");
  assert(!(await isOpen("#year-dialog")), "dialogen stängdes inte");
});

await step("ta bort ett år ger Ångra, och ångra återställer det", async () => {
  await page.click('[data-year-delete="2013"]');
  await page.click("#confirm-delete");
  await page.waitForFunction(() => document.activeElement?.id === "toast-action", null, { timeout: 10000 });
  assert(!(await db.doc("years/2013").get()).exists, "2013 finns kvar i Firestore");
  assert((await page.locator('#years > li[data-year="2013"]').count()) === 0, "2013 syns kvar");
  assert((await page.textContent('[data-cms="results-eyebrow"]')).startsWith("Resultat sedan 2015"), "överrubriken räknades inte om");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement?.dataset.yearEdit === "2013", null, { timeout: 10000 });
  assert((await db.doc("years/2013").get()).exists, "2013 återställdes inte");
});

await step("bygget hämtar det sparade innehållet från Firestore", async () => {
  const { content } = await fetchContent({ projectId: "demo-renrajden", emulator: true });
  assert(content.source === "db", "bygget hittade inte innehållet i Firestore");
  assert(content.event.deadline === "2027-01-20" && content.event.distances[2].km === 10.5, "årets lopp lästes fel");
  assert(content.years.length === 14 && content.years[0].year === 2027, "resultatarkivet lästes fel");
  const html = fillHtml(readFileSync("index.html", "utf8"), content);
  assert(html.includes("Efteranmälan 650 kr") && html.includes("Testa Testsson"), "den byggda sidan saknar det sparade innehållet");
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

await step("inbjudan nås från startsidan och ryms på en utskriven A4-sida", async () => {
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(BASE);
  await p.click('#loppet a[href="/inbjudan"]');
  await p.waitForSelector(".sheet");
  // Inbjudan ska rymmas även med innehållet som admin sparade ovan.
  await p.waitForFunction(() => document.documentElement.dataset.cms === "db", null, { timeout: 10000 });
  await p.evaluate(() => document.fonts.ready);
  // Utskriften räknas fram med webbläsarens utskriftsmotor.
  const pageCount = (pdf) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  const pages = pageCount(await p.pdf({ preferCSSPageSize: true, printBackground: true }));
  assert(pages === 1, `inbjudan blir ${pages} sidor vid utskrift`);
  // En iPhone lägger till egna marginaler (ca 14 mm upptill och nedtill, 6 mm på sidorna). Även då ska den rymmas.
  await p.addStyleTag({ content: "@page { margin: 14mm 6.35mm !important; }" });
  const iphone = pageCount(await p.pdf({ preferCSSPageSize: true, printBackground: true }));
  assert(iphone === 1, `inbjudan blir ${iphone} sidor med iPhonens marginaler`);
  assert(await p.evaluate(() => { const s = document.querySelector(".sheet"), f = document.querySelector(".bottom"), last = f.previousElementSibling; return last.getBoundingClientRect().bottom <= f.getBoundingClientRect().top && f.getBoundingClientRect().bottom <= s.getBoundingClientRect().bottom + 1; }), "innehållet ryms inte på arket");
  await p.screenshot({ path: `${OUT}/inbjudan.png`, fullPage: true });
  await p.setViewportSize({ width: 360, height: 780 });
  assert((await p.evaluate(() => document.documentElement.scrollWidth)) <= 360, "sidledsscroll på mobil");
  await p.close();
});

await browser.close();
await new Promise((r) => server.httpServer.close(r));
console.log(results.join("\n"));
console.log(failed ? `\n${failed} test misslyckades.` : `\nAlla ${results.length} test godkända.`);
process.exit(failed ? 1 : 0);
