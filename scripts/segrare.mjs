#!/usr/bin/env node
// Kompletterar resultatarkivet i Firestore med segrare och datum från standardinnehållet (src/cms/defaults.js).
// Bara år som redan finns i Firestore ändras. Segrarklasser som saknas läggs till efter de som redan finns,
// och ett tomt datum fylls i. Det som redan står i Firestore rörs inte, om du inte anger --force: då ersätts
// segrarna och datumet med standardinnehållets. Text, länkar och inbjudan rörs aldrig.
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

export async function fillArchive(db, { force = false, years = DEFAULT_YEARS } = {}) {
  const result = { written: {}, skipped: [], missing: [] };
  for (const y of years) {
    const wanted = plain(y.winners);
    if (!wanted.length && !y.date) continue;
    const ref = db.doc(`years/${y.year}`);
    const snap = await ref.get();
    if (!snap.exists) { result.missing.push(y.year); continue; }
    const update = {};
    const current = plain(snap.get("winners"));
    const winners = force ? wanted : mergeWinners(current, wanted);
    if (wanted.length && JSON.stringify(winners) !== JSON.stringify(current)) update.winners = winners;
    const date = snap.get("date");
    if (y.date && (force ? date !== y.date : !date)) update.date = y.date;
    if (!Object.keys(update).length) { result.skipped.push(y.year); continue; }
    await ref.update({ ...update, updatedAt: FieldValue.serverTimestamp() });
    result.written[y.year] = Object.keys(update);
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { flags } = parseArgs();
  const { db, projectId, emulator } = connect(flags);
  const { written, skipped, missing } = await fillArchive(db, { force: flags.force });
  const list = (a) => (a.length ? a.join(", ") : "inga");
  const done = Object.entries(written).map(([y, f]) => `${y} (${f.join(", ")})`);
  console.log(`Ifyllt: ${list(done)}. Redan kompletta: ${list(skipped)}. Saknas i Firestore: ${list(missing)}. (${projectId}${emulator ? ", emulator" : ""})`);
  process.exit(0);
}
