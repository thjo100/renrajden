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
import { DEFAULT_YEARS } from "../src/cms/defaults.js";

const YEARS = DEFAULT_YEARS.length; // år i standardarkivet; 2027 visas överst som kommande lopp tills resultatet lagts in
const BILDER = JSON.parse(readFileSync("public/bilder/bilder.json", "utf8")).length; // bilderna från gamla bloggen
const STORAGE = "http://127.0.0.1:9199/v0/b/demo-renrajden.firebasestorage.app/o/";
const stored = async (path) => (await fetch(STORAGE + encodeURIComponent(path) + "?alt=media")).status; // 200 eller 404

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
  assert((await page.locator("#years > li").count()) === YEARS + 1, "resultatarkivet är inte statiskt renderat");
  assert(await page.evaluate(() => document.documentElement.lang === "sv"), "lang saknas");
  assert(await page.locator("#admin-bar").isHidden(), "adminraden syns för besökare");
  await page.screenshot({ path: `${OUT}/besokare.png` });
});

await step("nyhetsarkivet går att fälla ut", async () => {
  await page.click("#news-more");
  assert((await page.locator("#news-archive > li").count()) === 18, "arkivet har fel antal poster");
  await page.click("#news-more");
});

await step("besökare ser bilderna från gamla bloggen innan något sparats", async () => {
  await page.locator("#bilder").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.documentElement.dataset.media === "defaults", null, { timeout: 10000 });
  const chips = await page.$$eval("#galleri-val .galleri-chip", (b) => b.map((x) => x.firstChild.textContent));
  assert(JSON.stringify(chips) === JSON.stringify(["Alla", "Foton", "Affischer", "Banor", "Sponsorer", "Seedning"]), "fel kategorier: " + chips.join(", "));
  assert((await page.locator("#galleri > li").count()) === 5, "Foton ska visa fem bilder");
  assert((await page.locator("#galleri [data-media-edit]").count()) === 0, "adminknappar syns för besökare");
  await page.click("#galleri .galleri-kort >> nth=0");
  await page.waitForSelector("#bildvisning[open]");
  assert(await page.locator("#bild-stor").isVisible() && await page.locator("#bild-film").isHidden(), "bilden visas inte i helskärm");
  await page.keyboard.press("Escape");
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

/* ---------- Partners ---------- */
const isOpen = (sel) => page.evaluate((s) => document.querySelector(s)?.open === true, sel);
const partnerNames = (p) => p.$$eval("#partners .partner", (els) => els.map((e) => e.firstChild.textContent));
const row = (n) => page.locator(`#pa-list .sub-row >> nth=${n}`);

await step("admin ändrar, lägger till, flyttar och tar bort partners", async () => {
  await page.click('#admin-bar [data-action="edit-partners"]');
  await page.waitForSelector("#partners-dialog[open]");
  assert((await page.locator("#pa-list .sub-row").count()) === 7, "formuläret har fel antal partners");
  assert(await page.evaluate(() => document.activeElement?.id.startsWith("pname-")), "fokus hamnade inte på första namnet");
  await row(0).locator('input[id^="purl-"]').fill("http://example.com/umara");
  await page.click("#partners-dialog [type=submit]");
  await page.waitForFunction(() => document.activeElement?.classList.contains("error-summary"), null, { timeout: 5000 })
    .catch(() => { throw new Error("felsammanfattningen fick inte fokus"); });
  assert((await row(0).locator('input[id^="purl-"]').getAttribute("aria-invalid")) === "true", "adressen markerades inte som fel");
  await row(0).locator('input[id^="purl-"]').fill("example.com/umara"); // https:// läggs till
  await page.click("#partners-dialog >> text=+ Lägg till partner");
  assert(await page.evaluate(() => document.activeElement?.id.startsWith("pname-")), "fokus hamnade inte i den nya raden");
  await page.keyboard.type("E2E Bygg");
  await row(7).locator('input[id^="ptext-"]').fill("Priser");
  await row(7).locator('[data-move="up"]').click();
  assert(await page.evaluate(() => document.activeElement?.dataset.move === "up"), "fokus stannade inte på Flytta upp");
  assert((await page.textContent("#pa-live")) === "E2E Bygg är nu nummer 7 av 8.", "flytten lästes inte upp");
  assert((await row(6).locator('input[id^="pname-"]').inputValue()) === "E2E Bygg", "raden flyttades inte");
  await row(7).locator("[data-remove-row]").click(); // ICA Porsön
  assert(await row(6).locator('[data-move="down"]').isHidden(), "sista raden har kvar Flytta ner");
  await page.fill("#pa-former", (await page.inputValue("#pa-former")) + "\nICA Porsön");
  await page.screenshot({ path: `${OUT}/partners-dialog.png` });
  await page.click("#partners-dialog [type=submit]");
  await page.waitForFunction(() => !document.querySelector("#partners-dialog").open, null, { timeout: 10000 })
    .catch(() => { throw new Error("dialogen stängdes inte efter sparning"); });
  const names = await partnerNames(page);
  assert(JSON.stringify(names) === JSON.stringify(["Umara", "Port of Luleå", "Hermelinen", "Sweco", "Lappland Media", "ICA Kvantum", "E2E Bygg"]), "fel partners på sidan: " + names.join(", "));
  assert((await page.getAttribute("#partners a.partner", "href")) === "https://example.com/umara", "Umara blev ingen länk");
  assert((await page.textContent("#partners .partners-former")).endsWith("Kuriren, Vitargo och ICA Porsön."), "Tidigare år uppdaterades inte");
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.activeElement?.dataset.action === "edit-partners"), "fokus kom inte tillbaka till knappen");
  const saved = (await db.doc("settings/partners").get()).data();
  assert(saved.partners.length === 7 && saved.partners[0].url === "https://example.com/umara" && saved.partners[6].name === "E2E Bygg" && saved.partners[6].text === "Priser", "partnerna sparades fel");
  assert(saved.former.endsWith("Vitargo\nICA Porsön") && saved.updatedBy === uid, "Tidigare år eller updatedBy sparades fel");
  assert(!(await db.doc("settings/event").get()).exists, "partnerna ska inte skapa årets lopp");
  await page.locator("#partners").screenshot({ path: `${OUT}/partners.png` });
});

await step("besökare ser partnerna innan årets lopp har sparats", async () => {
  const p = await browser.newPage();
  await p.goto(BASE);
  await p.waitForFunction(() => document.documentElement.dataset.cms === "defaults", null, { timeout: 10000 });
  assert((await partnerNames(p)).includes("E2E Bygg"), "besökaren ser inte den nya partnern");
  await p.close();
});

/* ---------- Årets lopp och resultatarkivet ---------- */

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
  assert((await db.collection("years").get()).size === YEARS, "resultatarkivet kopierades inte till Firestore");
});

await step("besökare ser det nya innehållet, även i inbjudan", async () => {
  const p = await browser.newPage();
  await p.goto(BASE);
  await p.waitForFunction(() => document.documentElement.dataset.cms === "db", null, { timeout: 10000 });
  assert((await p.textContent('[data-cms="fees"]')).includes("Efteranmälan 650 kr"), "besökaren ser inte den nya avgiften");
  assert((await p.locator("#years > li").count()) === YEARS + 1, "resultatarkivet har fel antal år efter kopieringen");
  assert((await partnerNames(p)).length === 7, "första sparningen av årets lopp ändrade partnerna");
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
  await p.click('#partners [data-action="edit-partners"]');
  await p.waitForSelector("#partners-dialog[open]");
  assert(await p.evaluate(() => { const d = document.querySelector("#partners-dialog"); return d.scrollWidth <= d.clientWidth; }), "partnerdialogen scrollar i sidled");
  await p.screenshot({ path: `${OUT}/partners-mobil.png` });
  await p.keyboard.press("Escape");
  assert(!(await p.evaluate(() => document.querySelector("#partners-dialog").open)), "Esc stängde inte partnerdialogen");
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

/* ---------- Bilder och filmer ---------- */
const uploaded = async () => (await db.collection("media").get()).docs.filter((d) => d.get("file").startsWith("galleri/")).map((d) => ({ id: d.id, ...d.data() }));
const fixture = (name, mimeType) => ({ name, mimeType, buffer: readFileSync("tests/fixtures/" + name) });
const rowState = () => page.$$eval("#md-list .md-row", (rs) => rs.map((r) => r.dataset.state));

await step("admin ändrar en bild från gamla bloggen, och första sparningen kopierar alla bilder", async () => {
  assert(!(await db.doc("settings/media").get()).exists, "settings/media fanns redan före testet");
  await page.locator("#bilder").scrollIntoViewIfNeeded();
  const id = "foton-2015-tre-akare-i-dimman";
  await page.click(`[data-media-edit="${id}"]`);
  await page.waitForSelector("#media-edit-dialog[open]");
  assert(await page.evaluate(() => document.activeElement?.id === "me-year"), "fokus hamnade inte på året");
  assert((await page.inputValue("#me-year")) === "2015" && (await page.inputValue("#me-text")) === "Tre åkare i dimman", "formuläret har fel värden");
  await page.fill("#me-year", "15");
  await page.click("#media-edit-dialog [type=submit]");
  await page.waitForFunction(() => document.activeElement?.classList.contains("error-summary"), null, { timeout: 5000 })
    .catch(() => { throw new Error("felsammanfattningen fick inte fokus"); });
  await page.fill("#me-year", "2016");
  await page.fill("#me-text", "Tre åkare i dimman på Ormberget");
  await page.click("#media-edit-dialog [type=submit]");
  await page.waitForFunction(() => !document.querySelector("#media-edit-dialog").open, null, { timeout: 15000 })
    .catch(() => { throw new Error("dialogen stängdes inte efter sparning"); });
  await page.waitForFunction((id) => document.activeElement?.dataset.mediaEdit === id, id, { timeout: 5000 })
    .catch(() => { throw new Error("fokus kom inte tillbaka till Redigera"); });
  assert((await page.textContent(`#galleri li[data-media-id="${id}"] .galleri-text`)) === "Tre åkare i dimman på Ormberget2016", "kortet uppdaterades inte");
  assert((await db.doc("settings/media").get()).exists, "settings/media skrevs inte");
  assert((await db.collection("media").get()).size === BILDER, "bilderna kopierades inte till Firestore");
  const d = (await db.doc(`media/${id}`).get()).data();
  assert(d.text === "Tre åkare i dimman på Ormberget" && d.year === 2016 && d.updatedBy === uid && d.file.startsWith("/bilder/"), "ändringen sparades fel");
});

await step("admin laddar upp två bilder och en film, med år och text", async () => {
  await page.click('#admin-bar [data-action="add-media"]');
  await page.waitForSelector("#media-dialog[open]");
  assert(await page.evaluate(() => document.activeElement?.id === "md-pick"), "fokus hamnade inte på Välj filer");
  await page.setInputFiles("#md-files", [
    fixture("stor.jpg", "image/jpeg"), fixture("liten.png", "image/png"), fixture("film.webm", "video/webm"),
    { name: "lista.txt", mimeType: "text/plain", buffer: Buffer.from("inte en bild") },
  ]);
  assert((await page.textContent("#md-skipped")).includes("lista.txt"), "textfilen hoppades inte över");
  await page.waitForFunction(() => [...document.querySelectorAll("#md-list .md-row")].every((r) => r.dataset.state === "ready"), null, { timeout: 20000 })
    .catch(async () => { throw new Error("filerna förbereddes inte: " + (await rowState()).join(", ")); });
  assert((await page.textContent("#md-list .md-row >> nth=0 >> .md-status")).startsWith("2048 × 1365 px"), "den stora bilden förminskades inte");
  assert((await page.textContent("#md-list .md-row >> nth=2 >> .md-status")).startsWith("Film, 0:02"), "filmens längd saknas");
  assert((await page.textContent("#media-dialog [type=submit]")) === "Ladda upp 3 filer", "fel text på knappen");
  const year = (n) => page.locator(`#md-list .md-row >> nth=${n} >> input[id^="md-y-"]`);
  await page.fill("#md-year", "2027");
  assert((await year(0).inputValue()) === "2027" && (await year(2).inputValue()) === "2027", "året fylldes inte i på filerna");
  await year(1).fill("2019");
  await page.fill("#md-year", "2026");
  assert((await year(0).inputValue()) === "2026" && (await year(1).inputValue()) === "2019", "året för alla skrev över ett eget år");
  await page.locator('#md-list .md-row >> nth=0 >> input[id^="md-t-"]').fill("Upploppet");
  await year(2).fill("26");
  await page.screenshot({ path: `${OUT}/bilder-uppladdning.png` });
  await page.click("#media-dialog [type=submit]");
  await page.waitForFunction(() => document.activeElement?.classList.contains("error-summary"), null, { timeout: 5000 })
    .catch(() => { throw new Error("felsammanfattningen fick inte fokus"); });
  assert((await year(2).getAttribute("aria-invalid")) === "true", "fel år markerades inte");
  await year(2).fill("2026");
  await page.click("#media-dialog [type=submit]");
  await page.waitForFunction(() => !document.querySelector("#media-dialog").open, null, { timeout: 30000 })
    .catch(async () => { throw new Error("uppladdningen blev inte klar: " + (await page.$$eval("#md-list .md-status", (s) => s.map((x) => x.textContent))).join(" | ")); });
  assert((await page.textContent("#toast-text")) === "2 bilder och 1 film är uppladdade", "fel besked: " + (await page.textContent("#toast-text")));
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.activeElement?.id === "bilder-h"), "fokus hamnade inte på Bilder");
  const up = await uploaded();
  assert(up.length === 3 && (await db.collection("media").get()).size === BILDER + 3, "fel antal bilder i Firestore");
  const jpg = up.find((m) => m.file.endsWith("bild.jpg")), png = up.find((m) => m.file.endsWith("bild.png")), film = up.find((m) => m.type === "video");
  assert(jpg && jpg.text === "Upploppet" && jpg.year === 2026 && jpg.category === "foton" && jpg.width === 2048 && jpg.height === 1365 && jpg.createdBy === uid, "bilden sparades fel");
  assert(png && png.year === 2019 && png.text === "" && png.width === 400, "PNG-bilden sparades fel");
  assert(film && film.category === "filmer" && film.file.endsWith("film.webm") && film.duration > 1.5 && film.width === 320, "filmen sparades fel");
  for (const m of up) for (const path of [m.file, m.thumb]) assert((await stored(path)) === 200, "filen finns inte i Storage: " + path);
  assert((await page.getAttribute('.galleri-chip:has-text("Alla")', "aria-pressed")) === "true", "galleriet visar inte alla efter uppladdningen");
  assert((await page.locator(`#galleri li[data-media-id="${film.id}"] .galleri-play`).textContent()).includes("0:02"), "filmkortet saknar längden");
  await page.locator("#bilder").screenshot({ path: `${OUT}/bilder-admin.png` });
});

await step("besökare ser de nya bilderna och kan spela filmen", async () => {
  const p = await browser.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "#bilder");
  await p.waitForFunction(() => document.documentElement.dataset.media === "db", null, { timeout: 10000 });
  assert((await p.locator("#galleri-val .galleri-chip >> nth=0 >> small").textContent()) === String(BILDER + 3), "fel antal under Alla");
  assert((await p.textContent("#galleri li >> nth=0")).includes("Upploppet"), "den nya bilden visas inte först under Foton");
  await p.click('.galleri-chip:has-text("Filmer")');
  assert((await p.locator("#galleri > li").count()) === 1, "Filmer ska ha en film");
  assert((await p.getAttribute("#galleri .galleri-kort", "aria-label")) === "Spela filmen från 2026", "fel etikett på filmkortet");
  await p.click("#galleri .galleri-kort");
  await p.waitForSelector("#bildvisning[open]");
  await p.waitForFunction(() => { const f = document.querySelector("#bild-film"); return !f.hidden && f.readyState >= 1; }, null, { timeout: 10000 })
    .catch(() => { throw new Error("filmen laddades inte i helskärmsvisningen"); });
  assert(await p.locator("#bild-stor").isHidden(), "bilden syns samtidigt som filmen");
  assert((await p.textContent("#bild-info")) === "Filmer · 2026", "fel text under filmen");
  await p.screenshot({ path: `${OUT}/bilder-film.png` });
  await p.keyboard.press("Escape");
  // Dialogen stängs (och filmen stoppas) en stund efter Esc.
  await p.waitForFunction(() => !document.querySelector("#bildvisning").open && !document.querySelector("#bild-film").getAttribute("src"), null, { timeout: 5000 })
    .catch(() => { throw new Error("filmen fortsatte efter stängning"); });
  await p.close();
});

await step("ta bort en film ger Ångra, och filerna tas bort först när det inte går att ångra", async () => {
  const film = (await uploaded()).find((m) => m.type === "video");
  await page.click('.galleri-chip:has-text("Filmer")');
  await page.click(`[data-media-delete="${film.id}"]`);
  assert((await page.textContent("#confirm-h")) === "Ta bort filmen från 2026?", "fel rubrik i bekräftelsen");
  await page.click("#confirm-delete");
  await page.waitForFunction(() => document.activeElement?.id === "toast-action", null, { timeout: 10000 });
  assert(!(await db.doc(`media/${film.id}`).get()).exists, "filmen finns kvar i Firestore");
  assert((await stored(film.file)) === 200, "filen togs bort innan det gick att ångra");
  assert((await page.locator(".galleri-chip", { hasText: "Filmer" }).count()) === 0, "Filmer visas fast den är tom");
  await page.keyboard.press("Enter");
  await page.waitForFunction((id) => document.activeElement?.dataset.mediaEdit === id, film.id, { timeout: 10000 })
    .catch(() => { throw new Error("fokus hamnade inte på den återställda filmen"); });
  const back = (await db.doc(`media/${film.id}`).get()).data();
  assert(back && back.createdAt.isEqual(film.createdAt) && back.duration === film.duration, "filmen återställdes fel");
  await page.click(`[data-media-delete="${film.id}"]`);
  await page.click("#confirm-delete");
  await page.waitForFunction(() => document.activeElement?.id === "toast-action", null, { timeout: 10000 });
  await page.click("#toast-close");
  for (let i = 0; i < 40 && (await stored(film.file)) === 200; i++) await page.waitForTimeout(250);
  assert((await stored(film.file)) === 404 && (await stored(film.thumb)) === 404, "filerna togs inte bort ur Storage");
  assert(!(await db.doc(`media/${film.id}`).get()).exists, "filmen finns kvar i Firestore");
});

await step("filer som släpps på sidan öppnar uppladdningen", async () => {
  await page.evaluate(async () => {
    const blob = await (await fetch("/bilder/mini/foton/2015-akare-i-sparet.jpg")).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "slappt.jpg", { type: "image/jpeg" }));
    const t = document.querySelector("#resultat");
    t.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    t.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await page.waitForSelector("#media-dialog[open]");
  await page.waitForFunction(() => document.querySelector("#md-list .md-row")?.dataset.state === "ready", null, { timeout: 10000 });
  assert((await page.textContent("#md-list .md-name b")) === "slappt.jpg", "den släppta filen kom inte med");
  await page.keyboard.press("Escape"); // visar "Stäng utan att ladda upp?"
  assert(await page.locator("#media-dialog .discard").isVisible(), "varningen för filer i listan visas inte");
  await page.click("#media-dialog [data-discard-yes]");
  assert(!(await isOpen("#media-dialog")), "dialogen stängdes inte");
  assert((await uploaded()).length === 2, "filen laddades upp fast dialogen stängdes");
});

await step("uppladdningen fungerar på mobil 360 px", async () => {
  const p = await context.newPage(); // samma inloggning
  await p.setViewportSize({ width: 360, height: 780 });
  await p.goto(BASE);
  await p.waitForSelector("#admin-bar:not([hidden])", { timeout: 15000 });
  await p.click('#bilder [data-action="add-media"]');
  await p.waitForSelector("#media-dialog[open]");
  await p.setInputFiles("#md-files", ["tests/fixtures/stor.jpg", "tests/fixtures/film.webm"]);
  await p.waitForFunction(() => [...document.querySelectorAll("#md-list .md-row")].every((r) => r.dataset.state === "ready"), null, { timeout: 20000 });
  assert(await p.evaluate(() => { const d = document.querySelector("#media-dialog"); return d.scrollWidth <= d.clientWidth; }), "dialogen scrollar i sidled");
  await p.locator("#md-list").scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/bilder-uppladdning-mobil.png` });
  await p.click("#media-dialog [data-close] >> nth=0");
  await p.click("#media-dialog [data-discard-yes]");
  assert((await p.evaluate(() => document.documentElement.scrollWidth)) <= 360, "sidledsscroll med adminknappar i galleriet");
  await p.close();
});

await step("bygget hämtar det sparade innehållet från Firestore", async () => {
  const { content } = await fetchContent({ projectId: "demo-renrajden", emulator: true });
  assert(content.source === "db", "bygget hittade inte innehållet i Firestore");
  assert(content.event.deadline === "2027-01-20" && content.event.distances[2].km === 10.5, "årets lopp lästes fel");
  assert(content.years.length === YEARS + 1 && content.years[0].year === 2027, "resultatarkivet lästes fel");
  assert(content.partners.partners[6].name === "E2E Bygg", "partnerna lästes fel");
  const html = fillHtml(readFileSync("index.html", "utf8"), content);
  assert(html.includes("Efteranmälan 650 kr") && html.includes("Testa Testsson"), "den byggda sidan saknar det sparade innehållet");
  assert(html.includes('<a class="partner" href="https://example.com/umara"') && html.includes("Vitargo och ICA Porsön."), "den byggda sidan saknar partnerna");
});

await step("admin tar bort testnyheten och loggar ut", async () => {
  await page.click(`[data-delete="${newId}"]`);
  await page.click("#confirm-delete");
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "toast-action", null, { timeout: 10000 });
  await page.click("#logout-btn");
  await page.waitForSelector("#admin-bar", { state: "hidden" });
  assert((await page.locator("[data-edit]").count()) === 0, "redigeringsknappar finns kvar efter utloggning");
  assert((await page.locator("[data-media-edit]").count()) === 0, "knapparna i Bilder finns kvar efter utloggning");
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
