#!/usr/bin/env node
// Kompletterar resultatarkivet i Firestore med segrare och datum från standardinnehållet (src/cms/defaults.js).
// Bara år som redan finns i Firestore ändras, och bara fält som är tomma där, om du inte anger --force.
// Övriga fält (text, länkar, inbjudan) rörs inte.
//
//   npm run segrare -- [--project <id>] [--emulator] [--force]
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_YEARS } from "../src/cms/defaults.js";
import { connect, parseArgs } from "./_firebase-admin.mjs";

const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

/** Fälten som kompletteras: namn och hur värdet tas från standardinnehållet. Tomma värden hoppas över. */
const FIELDS = {
  winners: (y) => y.winners.map((w) => ({ class: w.class, names: w.names })),
  date: (y) => y.date,
};

export async function importWinners(db, { force = false, years = DEFAULT_YEARS } = {}) {
  const result = { written: {}, skipped: [], missing: [] };
  for (const y of years) {
    const wanted = Object.entries(FIELDS).map(([k, get]) => [k, get(y)]).filter(([, v]) => !isEmpty(v));
    if (!wanted.length) continue;
    const ref = db.doc(`years/${y.year}`);
    const snap = await ref.get();
    if (!snap.exists) { result.missing.push(y.year); continue; }
    const update = Object.fromEntries(wanted.filter(([k]) => force || isEmpty(snap.get(k))));
    if (!Object.keys(update).length) { result.skipped.push(y.year); continue; }
    await ref.update({ ...update, updatedAt: FieldValue.serverTimestamp() });
    result.written[y.year] = Object.keys(update);
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { flags } = parseArgs();
  const { db, projectId, emulator } = connect(flags);
  const { written, skipped, missing } = await importWinners(db, { force: flags.force });
  const list = (a) => (a.length ? a.join(", ") : "inga");
  const done = Object.entries(written).map(([y, f]) => `${y} (${f.join(", ")})`);
  console.log(`Ifyllt: ${list(done)}. Redan ifyllda: ${list(skipped)}. Saknas i Firestore: ${list(missing)}. (${projectId}${emulator ? ", emulator" : ""})`);
  process.exit(0);
}
