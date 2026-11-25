// Tester av firestore.rules mot Firestore-emulatorn.
// Körs med: npm run test:rules
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, serverTimestamp, Timestamp, writeBatch } from "firebase/firestore";

const PROJECT = "demo-renrajden";
let env;

const google = (email, extra = {}) => ({ email, email_verified: true, firebase: { sign_in_provider: "google.com" }, ...extra });
const as = (uid, token) => env.authenticatedContext(uid, token).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const admin = () => as("admin-uid", google("admin@example.com"));

const validNews = (uid, over = {}) => ({
  title: "Startlistan är publicerad",
  date: "2027-01-29",
  tag: "Info",
  body: "Startlistan finns nu.",
  links: [{ label: "Startlista", url: "https://example.com/startlista.pdf" }],
  pinned: false,
  alert: false,
  createdAt: serverTimestamp(),
  createdBy: uid,
  updatedAt: serverTimestamp(),
  updatedBy: uid,
  ...over,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "admins", "admin@example.com"), { email: "admin@example.com" });
    await setDoc(doc(db, "news", "n1"), {
      title: "Renrajden 2027", date: "2026-11-23", tag: "Info", body: "Boka in 30 januari.", links: [],
      pinned: true, alert: false, createdAt: Timestamp.fromDate(new Date("2026-11-23T12:00:00Z")), createdBy: null,
      updatedAt: Timestamp.fromDate(new Date("2026-11-23T12:00:00Z")), updatedBy: null,
    });
  });
});

/* ---------- Läsning ---------- */
test("alla kan läsa nyheter utan inloggning", async () => {
  await assertSucceeds(getDoc(doc(anon(), "news", "n1")));
  await assertSucceeds(getDocs(collection(anon(), "news")));
});

test("besökare kan inte skriva nyheter", async () => {
  await assertFails(setDoc(doc(anon(), "news", "x"), validNews("nobody")));
  await assertFails(deleteDoc(doc(anon(), "news", "n1")));
});

test("inloggad Google-användare som inte är admin kan inte skriva", async () => {
  const db = as("u2", google("someone@example.com"));
  await assertFails(setDoc(doc(db, "news", "x"), validNews("u2")));
  await assertFails(updateDoc(doc(db, "news", "n1"), { title: "Hackad" }));
  await assertFails(deleteDoc(doc(db, "news", "n1")));
});

/* ---------- Admin ---------- */
test("admin kan skapa, ändra och ta bort", async () => {
  const db = admin();
  await assertSucceeds(setDoc(doc(db, "news", "x"), validNews("admin-uid")));
  const created = (await getDoc(doc(db, "news", "x"))).data().createdAt;
  await assertSucceeds(setDoc(doc(db, "news", "x"), validNews("admin-uid", { title: "Ändrad", createdAt: created })));
  await assertSucceeds(deleteDoc(doc(db, "news", "x")));
  for (const [i, tag] of ["Resultat", "Ändring", "Inställt", "Valla"].entries()) {
    await assertSucceeds(setDoc(doc(db, "news", "tag-" + i), validNews("admin-uid", { tag })));
  }
});

test("admin kan återskapa en borttagen nyhet med ursprunglig createdAt (ångra)", async () => {
  const db = admin();
  const orig = Timestamp.fromDate(new Date("2020-01-06T12:00:00Z"));
  await assertSucceeds(setDoc(doc(db, "news", "restored"), validNews("admin-uid", { createdAt: orig, createdBy: null })));
});

test("e-postadressens versaler spelar ingen roll", async () => {
  const db = as("admin-uid", google("Admin@Example.com"));
  await assertSucceeds(setDoc(doc(db, "news", "x"), validNews("admin-uid")));
});

test("admin måste ha loggat in med Google och ha verifierad e-post", async () => {
  const pw = as("admin-uid", { email: "admin@example.com", email_verified: true, firebase: { sign_in_provider: "password" } });
  await assertFails(setDoc(doc(pw, "news", "x"), validNews("admin-uid")));
  const unverified = as("admin-uid", google("admin@example.com", { email_verified: false }));
  await assertFails(setDoc(doc(unverified, "news", "x"), validNews("admin-uid")));
});

/* ---------- Validering ---------- */
test("ogiltiga nyheter nekas även för admin", async () => {
  const db = admin();
  const bad = {
    "tom rubrik": { title: "" },
    "för lång rubrik": { title: "x".repeat(161) },
    "fel datumformat": { date: "30/1 2027" },
    "okänd etikett": { tag: "Reklam" },
    "http-länk": { links: [{ label: "Osäker", url: "http://example.com" }] },
    "javascript-länk": { links: [{ label: "Skript", url: "javascript:alert(1)" }] },
    "för många länkar": { links: Array.from({ length: 13 }, (_, i) => ({ label: "L" + i, url: "https://example.com/" + i })) },
    "extra fält i länk": { links: [{ label: "A", url: "https://example.com", onclick: "x" }] },
    "pinned som text": { pinned: "ja" },
    "falsk författare": { updatedBy: "someone-else" },
    "eget updatedAt": { updatedAt: Timestamp.fromDate(new Date("2020-01-01")) },
  };
  for (const [name, over] of Object.entries(bad)) {
    await assertFails(setDoc(doc(db, "news", "bad"), validNews("admin-uid", over)), name);
  }
  await assertFails(setDoc(doc(db, "news", "bad"), { ...validNews("admin-uid"), html: "<script>" }), "okänt fält");
  const { body, ...missing } = validNews("admin-uid");
  await assertFails(setDoc(doc(db, "news", "bad"), missing), "saknat fält");
});

test("admin kan inte ändra createdAt på en befintlig nyhet", async () => {
  const db = admin();
  await assertFails(setDoc(doc(db, "news", "n1"), validNews("admin-uid", { createdAt: Timestamp.now() })));
});

/* ---------- Adminlistan ---------- */
test("man kan bara läsa sitt eget admin-dokument och ingen kan lista eller skriva", async () => {
  await assertSucceeds(getDoc(doc(admin(), "admins", "admin@example.com")));
  await assertSucceeds(getDoc(doc(as("u2", google("someone@example.com")), "admins", "someone@example.com")));
  await assertFails(getDoc(doc(as("u2", google("someone@example.com")), "admins", "admin@example.com")));
  await assertFails(getDocs(collection(admin(), "admins")));
  await assertFails(setDoc(doc(admin(), "admins", "friend@example.com"), { email: "friend@example.com" }));
  await assertFails(setDoc(doc(as("u2", google("someone@example.com")), "admins", "someone@example.com"), { email: "someone@example.com" }));
  await assertFails(getDoc(doc(anon(), "admins", "admin@example.com")));
});

/* ---------- Årets lopp och resultatarkivet ---------- */
const validEvent = (uid, over = {}) => ({
  date: "2027-01-30", startTime: "10:00", status: "planned",
  venue: "Ormbergsstadion", venueArea: "Ormberget, Luleå", mapUrl: "https://example.com/karta",
  deadline: "2027-01-24", registrationUrl: "", startListUrl: "", liveResultsUrl: "https://example.com/live",
  email: "info@renrajden.se", lapKm: 10.5, climbPerLap: 98, waterPerLap: 2, coldLimit: -20,
  distances: [
    { km: 42, laps: 4, classes: "HD42", fee: 500, lateFee: 600, note: "Pris till 1:a–3:e." },
    { km: 10.5, laps: 1, classes: "Motion", fee: 200, lateFee: 200, note: "" },
  ],
  updatedAt: serverTimestamp(), updatedBy: uid,
  ...over,
});
const validYear = (uid, year, over = {}) => ({
  year, status: "held", date: `${year}-02-09`, text: "", winners: [{ class: "H42", names: "Tarjei Solli" }],
  links: [{ label: "Resultat", url: "https://example.com/r.pdf" }, { label: "Gammal", url: "http://ta.skidor.com/x" }],
  invitation: { label: `Inbjudan ${year}`, url: "https://example.com/inbjudan.pdf" },
  updatedAt: serverTimestamp(), updatedBy: uid,
  ...over,
});

test("alla kan läsa årets lopp och resultatarkivet, men inte skriva", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "settings", "event"), { date: "2027-01-30" });
    await setDoc(doc(ctx.firestore(), "years", "2025"), { year: 2025 });
  });
  await assertSucceeds(getDoc(doc(anon(), "settings", "event")));
  await assertSucceeds(getDocs(collection(anon(), "years")));
  await assertFails(setDoc(doc(anon(), "settings", "event"), validEvent("nobody")));
  await assertFails(setDoc(doc(anon(), "years", "2026"), validYear("nobody", 2026)));
  await assertFails(deleteDoc(doc(anon(), "years", "2025")));
  const user = as("u2", google("someone@example.com"));
  await assertFails(setDoc(doc(user, "settings", "event"), validEvent("u2")));
  await assertFails(setDoc(doc(user, "years", "2026"), validYear("u2", 2026)));
  await assertFails(deleteDoc(doc(user, "years", "2025")));
});

test("admin kan spara årets lopp men inte ta bort det eller skapa andra inställningar", async () => {
  const db = admin();
  await assertSucceeds(setDoc(doc(db, "settings", "event"), validEvent("admin-uid")));
  await assertSucceeds(setDoc(doc(db, "settings", "event"), validEvent("admin-uid", { status: "cancelled", deadline: "", mapUrl: "" })));
  await assertFails(deleteDoc(doc(db, "settings", "event")));
  await assertFails(setDoc(doc(db, "settings", "other"), validEvent("admin-uid")));
});

test("ogiltigt innehåll för årets lopp nekas även för admin", async () => {
  const db = admin();
  const d = (over) => validEvent("admin-uid").distances.map((x, i) => (i === 0 ? { ...x, ...over } : x));
  const bad = {
    "fel datumformat": { date: "30/1 2027" },
    "fel tidsformat": { startTime: "10.00" },
    "okänd status": { status: "flyttat" },
    "tom arena": { venue: "" },
    "http-anmälningslänk": { registrationUrl: "http://example.com" },
    "javascript-länk": { liveResultsUrl: "javascript:alert(1)" },
    "ogiltig e-post": { email: "info@" },
    "slinga 0 km": { lapKm: 0 },
    "höjdmeter som text": { climbPerLap: "98" },
    "plusgrader som köldgräns": { coldLimit: 5 },
    "inga distanser": { distances: [] },
    "fem distanser": { distances: Array.from({ length: 5 }, () => validEvent("x").distances[0]) },
    "för många varv": { distances: d({ laps: 7 }) },
    "avgift med decimaler": { distances: d({ fee: 99.5 }) },
    "extra fält i distans": { distances: d({ html: "<b>" }) },
    "falsk författare": { updatedBy: "someone-else" },
    "eget updatedAt": { updatedAt: Timestamp.fromDate(new Date("2020-01-01")) },
  };
  for (const [name, over] of Object.entries(bad)) {
    await assertFails(setDoc(doc(db, "settings", "event"), validEvent("admin-uid", over)), name);
  }
  await assertFails(setDoc(doc(db, "settings", "event"), { ...validEvent("admin-uid"), extra: 1 }), "okänt fält");
  const { email, ...missing } = validEvent("admin-uid");
  await assertFails(setDoc(doc(db, "settings", "event"), missing), "saknat fält");
});

test("admin kan skapa, ändra och ta bort år i resultatarkivet", async () => {
  const db = admin();
  await assertSucceeds(setDoc(doc(db, "years", "2026"), validYear("admin-uid", 2026)));
  await assertSucceeds(setDoc(doc(db, "years", "2026"), validYear("admin-uid", 2026, { status: "cancelled", date: "", winners: [], links: [], invitation: null, text: "Inställt på grund av kyla." })));
  await assertSucceeds(deleteDoc(doc(db, "years", "2026")));
});

test("ogiltiga år i resultatarkivet nekas även för admin", async () => {
  const db = admin();
  const bad = {
    "årtal som inte stämmer med id": { year: 2024 },
    "årtal som text": { year: "2026" },
    "okänd status": { status: "paus" },
    "fel datumformat": { date: "9 februari" },
    "för lång text": { text: "x".repeat(301) },
    "javascript-länk": { links: [{ label: "x", url: "javascript:alert(1)" }] },
    "för många länkar": { links: Array.from({ length: 13 }, (_, i) => ({ label: "L" + i, url: "https://example.com/" + i })) },
    "segrare utan namn": { winners: [{ class: "H42", names: "" }] },
    "för många segrare": { winners: Array.from({ length: 7 }, () => ({ class: "H42", names: "A" })) },
    "inbjudan med fel fält": { invitation: { url: "https://example.com" } },
    "falsk författare": { updatedBy: "someone-else" },
  };
  for (const [name, over] of Object.entries(bad)) {
    await assertFails(setDoc(doc(db, "years", "2026"), validYear("admin-uid", 2026, over)), name);
  }
  await assertFails(setDoc(doc(db, "years", "tjugo"), validYear("admin-uid", 2026)), "id som inte är ett årtal");
  await assertFails(setDoc(doc(db, "years", "1980"), validYear("admin-uid", 1980)), "för tidigt år");
});

test("första sparningen kan kopiera årets lopp och hela arkivet i en batch", async () => {
  const db = admin();
  const batch = writeBatch(db);
  batch.set(doc(db, "settings", "event"), validEvent("admin-uid"));
  for (let y = 2013; y <= 2025; y++) batch.set(doc(db, "years", String(y)), validYear("admin-uid", y));
  await assertSucceeds(batch.commit());
});

test("andra samlingar är stängda", async () => {
  await assertFails(getDoc(doc(anon(), "secrets", "x")));
  await assertFails(setDoc(doc(admin(), "secrets", "x"), { a: 1 }));
});
