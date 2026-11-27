// Vite-plugin: fyller sidornas tomma platser för årets lopp, resultatarkivet och partnerna när sajten byggs.
//
// Innehållet hämtas från Firestore (settings/event, settings/partners och years) med Firestores REST-gränssnitt.
// Det är publikt läsbart, så ingen nyckel skickas (webbnyckeln kan vara begränsad till sajtens
// domän). Finns inget sparat innehåll än, eller saknas Firebase-konfigurationen, används
// src/cms/defaults.js.
//
// Går Firestore inte att nå blir det en varning och standardinnehållet. Med
// CMS_REQUIRE_FIRESTORE=true (sätts vid publicering i .github/workflows/firebase.yml) avbryts
// bygget i stället, så att en publicering aldrig lägger ut gammalt innehåll i tysthet.
// Sidan hämtar ändå färskt innehåll i webbläsaren, så besökare med JavaScript ser alltid det senaste.
import { loadEnv } from "vite";
import { cleanContent, cleanYear } from "../src/cms/model.js";
import { fillHtml } from "../src/cms/render.js";

/** Firestores REST-format ({ stringValue: "x" } osv.) till vanliga värden. */
export function fromRest(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromRest);
  if ("mapValue" in v) return fieldsToObject(v.mapValue.fields);
  return null;
}
const fieldsToObject = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromRest(v)]));

/**
 * Hämtar innehållet från Firestore. Returnerar { content, note }.
 * @param {{ projectId: string, emulator?: boolean, timeoutMs?: number }} opts
 */
export async function fetchContent({ projectId, emulator = false, timeoutMs = 10000 }) {
  const base = (emulator ? "http://127.0.0.1:8080" : "https://firestore.googleapis.com") + `/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
  const signal = AbortSignal.timeout(timeoutMs);
  const get = async (path, query = "") => {
    const res = await fetch(`${base}/${path}${query ? "?" + query : ""}`, { signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore svarade ${res.status} för ${path}`);
    return res.json();
  };
  const [event, saved] = await Promise.all([get("settings/event"), get("settings/partners")]);
  const partners = saved ? fieldsToObject(saved.fields) : null;
  const p = saved ? ", partners från Firestore" : ", standardpartnerna";
  if (!event) return { content: cleanContent({ partners }), note: "årets lopp och arkivet är inte sparade i Firestore än, standardinnehållet används" + p };
  const years = [];
  let pageToken = "";
  do {
    const page = await get("years", "pageSize=300" + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""));
    for (const d of page?.documents || []) {
      const y = cleanYear(fieldsToObject(d.fields), d.name.split("/").pop());
      if (y) years.push(y);
    }
    pageToken = page?.nextPageToken || "";
  } while (pageToken);
  return { content: cleanContent({ source: "db", event: fieldsToObject(event.fields), years, partners }), note: `från Firestore (${years.length} år i arkivet${p})` };
}

export function cms() {
  let env = {}, logger = console, isServe = false, cached = null;

  async function load() {
    const projectId = env.VITE_FIREBASE_PROJECT_ID;
    const emulator = env.VITE_USE_EMULATORS === "true";
    if (!projectId || !env.VITE_FIREBASE_API_KEY) return { content: cleanContent(null), note: "Firebase är inte konfigurerat, standardinnehållet används" };
    try {
      return await fetchContent({ projectId, emulator, timeoutMs: emulator ? 2000 : 10000 });
    } catch (e) {
      const why = (e && (e.cause?.code || e.name === "TimeoutError" && "tidsgräns" || e.message)) || String(e);
      if (emulator) return { content: cleanContent(null), note: `emulatorn svarar inte (${why}), standardinnehållet används` };
      if (process.env.CMS_REQUIRE_FIRESTORE === "true") throw new Error(`Årets lopp, resultatarkivet och partnerna kunde inte hämtas från Firestore (${why}). Bygget avbryts för att inte publicera gammalt innehåll.`);
      return { content: cleanContent(null), note: `Firestore gick inte att nå (${why}), standardinnehållet används`, warn: true };
    }
  }

  return {
    name: "renrajden-cms",
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir || config.root, "VITE_");
      logger = config.logger;
      isServe = config.command === "serve";
    },
    transformIndexHtml: {
      order: "pre",
      async handler(html) {
        // Vid bygget hämtas innehållet en gång för alla sidor. I utvecklingsläget vid varje sidladdning.
        const result = await (isServe ? load() : (cached ??= load().then((r) => { (r.warn ? logger.warn : logger.info)(`[cms] Årets lopp, resultatarkivet och partnerna: ${r.note}`); return r; })));
        return fillHtml(html, result.content);
      },
    },
  };
}
