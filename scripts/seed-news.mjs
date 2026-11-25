#!/usr/bin/env node
// Importerar nyheterna från den gamla bloggen (prototyp/seed-news.json) till Firestore.
// Befintliga nyheter med samma id hoppas över, om du inte anger --force.
//
//   npm run seed -- [--project <id>] [--emulator] [--force]
import { readFileSync } from "node:fs";
import { Timestamp } from "firebase-admin/firestore";
import { connect, parseArgs } from "./_firebase-admin.mjs";

export async function seedNews(db, { force = false, file = "prototyp/seed-news.json" } = {}) {
  const items = JSON.parse(readFileSync(file, "utf8"));
  let written = 0, skipped = 0;
  for (const { id, ...n } of items) {
    const ref = db.doc(`news/${id}`);
    if (!force && (await ref.get()).exists) { skipped++; continue; }
    const at = Timestamp.fromDate(new Date(n.date + "T12:00:00Z"));
    await ref.set({
      title: n.title, date: n.date, tag: n.tag, body: n.body, links: n.links,
      pinned: n.pinned === true, alert: n.alert === true,
      createdAt: at, createdBy: null, updatedAt: at, updatedBy: null,
    });
    written++;
  }
  return { written, skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { flags } = parseArgs();
  const { db, projectId, emulator } = connect(flags);
  const { written, skipped } = await seedNews(db, { force: flags.force });
  console.log(`${written} nyheter importerade, ${skipped} fanns redan (${projectId}${emulator ? ", emulator" : ""}).`);
  process.exit(0);
}
