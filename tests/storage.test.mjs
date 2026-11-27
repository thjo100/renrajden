// Tester av storage.rules mot Storage-emulatorn. Adminkontrollen läser Firestore, så båda emulatorerna behövs.
// Körs med: npm run test:rules
// Att en fil inte kan skrivas över (allow update: if false) går inte att testa här: emulatorn
// behandlar varje uppladdning som create.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

const PROJECT = "demo-renrajden";
const BUCKET = "demo-renrajden.firebasestorage.app";
let env;

const google = (email, extra = {}) => ({ email, email_verified: true, firebase: { sign_in_provider: "google.com" }, ...extra });
const storageAs = (uid, token) => env.authenticatedContext(uid, token).storage(BUCKET);
const admin = () => storageAs("admin-uid", google("admin@example.com"));
const anon = () => env.unauthenticatedContext().storage(BUCKET);
const bytes = (n) => new Uint8Array(n).fill(7);
const put = (st, path, n, contentType) => st.ref(path).put(bytes(n), { contentType });
const ID = "abcDEF0123456789wxyz";
const MB = 1024 * 1024;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "admins", "admin@example.com"), { email: "admin@example.com" });
  });
});

test("admin kan ladda upp bild, miniatyr och film, och ta bort dem", async () => {
  const st = admin();
  await assertSucceeds(put(st, `galleri/${ID}/bild.jpg`, 1000, "image/jpeg"));
  await assertSucceeds(put(st, `galleri/${ID}/mini.jpg`, 1000, "image/jpeg"));
  await assertSucceeds(put(st, `galleri/${ID}x/bild.png`, 1000, "image/png"));
  await assertSucceeds(put(st, `galleri/${ID}y/bild.gif`, 1000, "image/gif"));
  await assertSucceeds(put(st, `galleri/${ID}z/film.mp4`, 1000, "video/mp4"));
  await assertSucceeds(put(st, `galleri/${ID}w/film.webm`, 1000, "video/webm"));
  await assertSucceeds(st.ref(`galleri/${ID}/bild.jpg`).delete());
});

test("alla kan se filerna i galleriet, men bara admin kan ladda upp", async () => {
  await assertSucceeds(put(admin(), `galleri/${ID}/bild.jpg`, 100, "image/jpeg"));
  await assertSucceeds(anon().ref(`galleri/${ID}/bild.jpg`).getMetadata());
  await assertFails(put(anon(), `galleri/${ID}/mini.jpg`, 100, "image/jpeg"));
  await assertFails(put(storageAs("u2", google("someone@example.com")), `galleri/${ID}/mini.jpg`, 100, "image/jpeg"));
  await assertFails(storageAs("u2", google("someone@example.com")).ref(`galleri/${ID}/bild.jpg`).delete());
  await assertFails(put(storageAs("admin-uid", google("admin@example.com", { email_verified: false })), `galleri/${ID}/mini.jpg`, 100, "image/jpeg"), "overifierad e-post");
  await assertFails(put(storageAs("admin-uid", google("admin@example.com", { firebase: { sign_in_provider: "password" } })), `galleri/${ID}/mini.jpg`, 100, "image/jpeg"), "inte Google");
});

test("fel filnamn, filtyp, storlek eller mapp nekas även för admin", async () => {
  const st = admin();
  const bad = [
    ["svg-bild", `galleri/${ID}/bild.svg`, 100, "image/svg+xml"],
    ["html som bild", `galleri/${ID}/bild.jpg`, 100, "text/html"],
    ["okänt filnamn", `galleri/${ID}/sida.html`, 100, "text/html"],
    ["film som bild", `galleri/${ID}/bild.jpg`, 100, "video/mp4"],
    ["bild som film", `galleri/${ID}/film.mp4`, 100, "image/jpeg"],
    ["miniatyr som png", `galleri/${ID}/mini.jpg`, 100, "image/png"],
    ["för stor bild", `galleri/${ID}/bild.jpg`, 15 * MB + 1, "image/jpeg"],
    ["för stor miniatyr", `galleri/${ID}/mini.jpg`, 2 * MB + 1, "image/jpeg"],
    ["ogiltigt id", `galleri/ab.cd/bild.jpg`, 100, "image/jpeg"],
    ["undermapp", `galleri/${ID}/extra/bild.jpg`, 100, "image/jpeg"],
    ["utanför galleriet", `privat/${ID}/bild.jpg`, 100, "image/jpeg"],
  ];
  for (const [name, path, n, type] of bad) await assertFails(put(st, path, n, type), name);
  await assertFails(anon().ref(`privat/${ID}/bild.jpg`).getMetadata(), "läsa utanför galleriet");
});
