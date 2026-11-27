#!/usr/bin/env node
// Lägger in segrarna från standardinnehållet (src/cms/defaults.js) i resultatarkivet i Firestore.
// Bara år som redan finns i Firestore och saknar segrare ändras, om du inte anger --force.
// Övriga fält (datum, text, länkar, inbjudan) rörs inte.
//
//   npm run segrare -- [--project <id>] [--emulator] [--force]
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_YEARS } from "../src/cms/defaults.js";
import { connect, parseArgs } from "./_firebase-admin.mjs";

export async function importWinners(db, { force = false, years = DEFAULT_YEARS } = {}) {
  const result = { written: [], skipped: [], missing: [] };
  for (const y of years.filter((y) => y.winners.length)) {
    const ref = db.doc(`years/${y.year}`);
    const snap = await ref.get();
    if (!snap.exists) { result.missing.push(y.year); continue; }
    const current = snap.get("winners");
    if (!force && Array.isArray(current) && current.length) { result.skipped.push(y.year); continue; }
    await ref.update({
      winners: y.winners.map((w) => ({ class: w.class, names: w.names })),
      updatedAt: FieldValue.serverTimestamp(),
    });
    result.written.push(y.year);
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { flags } = parseArgs();
  const { db, projectId, emulator } = connect(flags);
  const { written, skipped, missing } = await importWinners(db, { force: flags.force });
  const list = (a) => (a.length ? a.join(", ") : "inga");
  console.log(`Segrare inlagda: ${list(written)}. Hade redan segrare: ${list(skipped)}. Saknas i Firestore: ${list(missing)}. (${projectId}${emulator ? ", emulator" : ""})`);
  process.exit(0);
}
