// Tester av firestore.rules mot Firestore-emulatorn.
// Körs med: npm run test:rules
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";

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

test("andra samlingar är stängda", async () => {
  await assertFails(getDoc(doc(anon(), "secrets", "x")));
  await assertFails(setDoc(doc(admin(), "secrets", "x"), { a: 1 }));
});
