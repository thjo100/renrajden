#!/usr/bin/env node
// Hanterar listan över administratörer (Firestore-samlingen "admins").
//
//   npm run admin -- add namn@gmail.com [--project <id>] [--emulator]
//   npm run admin -- remove namn@gmail.com
//   npm run admin -- list
//
// Adressen ska vara den som personen loggar in med hos Google.
import { FieldValue } from "firebase-admin/firestore";
import { connect, parseArgs } from "./_firebase-admin.mjs";

const { flags, rest } = parseArgs();
const [cmd, rawEmail] = rest;
const usage = "Användning: npm run admin -- <add|remove|list> [e-post] [--project <id>] [--emulator]";

if (!["add", "remove", "list"].includes(cmd)) { console.error(usage); process.exit(1); }
const email = (rawEmail || "").trim().toLowerCase();
if (cmd !== "list" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error("Ange en giltig e-postadress.\n" + usage); process.exit(1); }

const { db, projectId, emulator } = connect(flags);
const where = `${projectId}${emulator ? " (emulator)" : ""}`;

if (cmd === "add") {
  await db.doc(`admins/${email}`).set({ email, addedAt: FieldValue.serverTimestamp() });
  console.log(`${email} är nu administratör i ${where}.`);
} else if (cmd === "remove") {
  await db.doc(`admins/${email}`).delete();
  console.log(`${email} är inte längre administratör i ${where}.`);
} else {
  const snap = await db.collection("admins").get();
  console.log(snap.empty ? `Inga administratörer i ${where}.` : `Administratörer i ${where}:\n` + snap.docs.map((d) => "  " + d.id).join("\n"));
}
process.exit(0);
