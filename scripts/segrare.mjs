#!/usr/bin/env node
// Kompletterar resultatarkivet i Firestore med segrare och datum från standardinnehållet (src/cms/defaults.js).
// År som saknas i Firestore skapas från standardinnehållet. Segrarklasser som saknas läggs till efter de som redan finns,
// och ett tomt datum fylls i. Det som redan står i Firestore rörs inte, om du inte anger --force: då blir
// segrarna, datumet och texten exakt som i standardinnehållet (även tomma). Länkar och inbjudan rörs aldrig.
//
//   npm run segrare -- [--project <id>] [--emulator] [--force]
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_YEARS } from "../src/cms/defaults.js";
import { LIMITS } from "../src/cms/model.js";
import { connect, parseArgs } from "./_firebase-admin.mjs";

const classKey = (w) => String(w.class ?? "").trim().toLowerCase();
const plain = (list) => (Array.isArray(list) ? list : []).map((w) => ({ class: String(w.class ?? ""), names: String(w.names ?? "") }));

/** De segrare som finns, följt av standardinnehållets klasser som saknas bland dem. */
export function mergeWinners(current, wanted) {
  const have = new Set(current.map(classKey));
  return [...current, ...wanted.filter((w) => !have.has(classKey(w)))].slice(0, LIMITS.winners);
}

/** Ett helt årsdokument från standardinnehållet, för år som saknas i Firestore. Samma fält som adminläget sparar. */
const newYear = (y) => ({
  year: y.year, status: y.status, date: y.date || "", text: y.text || "", winners: plain(y.winners),
  links: (y.links || []).map((l) => ({ label: l.label, url: l.url })),
  invitation: y.invitation ? { label: y.invitation.label, url: y.invitation.url } : null,
  updatedAt: FieldValue.serverTimestamp(), updatedBy: null,
});

export async function fillArchive(db, { force = false, years = DEFAULT_YEARS } = {}) {
  const result = { written: {}, skipped: [], created: [] };
  for (const y of years) {
    const ref = db.doc(`years/${y.year}`);
    const snap = await ref.get();
    if (!snap.exists) { await ref.set(newYear(y)); result.created.push(y.year); continue; }
    const wanted = plain(y.winners);
    if (!force && !wanted.length && !y.date) continue;
    const update = {};
    const current = plain(snap.get("winners"));
    const winners = force ? wanted : mergeWinners(current, wanted);
    if ((force || wanted.length) && JSON.stringify(winners) !== JSON.stringify(current)) update.winners = winners;
    const date = snap.get("date") || "";
    if (force ? date !== (y.date || "") : y.date && !date) update.date = y.date || "";
    if (force && (snap.get("text") || "") !== (y.text || "")) update.text = y.text || "";
    if (!Object.keys(update).length) { result.skipped.push(y.year); continue; }
    await ref.update({ ...update, updatedAt: FieldValue.serverTimestamp() });
    result.written[y.year] = Object.keys(update);
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { flags } = parseArgs();
  const { db, projectId, emulator } = connect(flags);
  const { written, skipped, created } = await fillArchive(db, { force: flags.force });
  const list = (a) => (a.length ? a.join(", ") : "inga");
  const done = Object.entries(written).map(([y, f]) => `${y} (${f.join(", ")})`);
  console.log(`Nya år: ${list(created)}. Ifyllt: ${list(done)}. Redan kompletta: ${list(skipped)}. (${projectId}${emulator ? ", emulator" : ""})`);
  process.exit(0);
}
