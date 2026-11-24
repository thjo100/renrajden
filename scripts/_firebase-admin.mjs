// Gemensam uppstart för skripten. Kör mot emulatorn med --emulator, annars mot riktiga projektet.
//
// Riktigt projekt kräver inloggning med behörighet till projektet, t.ex.
//   gcloud auth application-default login
// eller en servicekontonyckel:
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
import { readFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = {}, rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--emulator" || a === "--force") flags[a.slice(2)] = true;
    else if (a === "--project") flags.project = argv[++i];
    else rest.push(a);
  }
  return { flags, rest };
}

function defaultProject() {
  try { return JSON.parse(readFileSync(".firebaserc", "utf8")).projects.default; } catch { return undefined; }
}

export function connect({ emulator, project } = {}) {
  if (emulator) {
    process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
  }
  const projectId = emulator && !project ? "demo-renrajden" : project || process.env.GCLOUD_PROJECT || defaultProject();
  if (!projectId) throw new Error("Ange projekt med --project <id>.");
  const app = process.env.FIRESTORE_EMULATOR_HOST ? initializeApp({ projectId }) : initializeApp({ projectId, credential: applicationDefault() });
  return { db: getFirestore(app), projectId, emulator: Boolean(process.env.FIRESTORE_EMULATOR_HOST) };
}
