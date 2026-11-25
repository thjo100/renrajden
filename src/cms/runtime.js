// Årets lopp och resultatarkivet i webbläsaren.
//
// Sidan levereras färdigrenderad (scripts/vite-cms.mjs) med innehållet inbäddat i #cms-data,
// så att allt syns direkt och fungerar utan JavaScript. Efter laddning hämtas färskt innehåll
// från Firestore, och bara de platser vars HTML har ändrats ritas om.
import { cleanContent, cleanYear } from "./model.js";
import { renderSlots, renderHead } from "./render.js";
import { focusEl, FOCUSABLE } from "../ui.js";

function readEmbedded() {
  try { return cleanContent(JSON.parse(document.getElementById("cms-data").textContent)); }
  catch { return cleanContent(null); }
}

let current = readEmbedded();
let rendered = renderSlots(current);
// Finns settings/event i Firestore? Annars visas standardinnehållet, och adminläget
// kopierar det till Firestore vid första sparningen (se src/cms-admin.js).
let initialized = current.source === "db";
const listeners = new Set();

/** Innehållet som visas just nu (rensat, se cleanContent). */
export const getContent = () => current;
export const isInitialized = () => initialized;
/** fn(content) anropas efter varje omritning. */
export const onContent = (fn) => { listeners.add(fn); };

// Ritar om en plats. Har besökaren fokus i den hamnar fokus på motsvarande element efteråt.
function replaceSlot(node, html) {
  const a = document.activeElement;
  const idx = a && a !== document.body && node.contains(a) ? [...node.querySelectorAll(FOCUSABLE)].indexOf(a) : -1;
  node.innerHTML = html;
  if (idx < 0) return;
  const t = node.querySelectorAll(FOCUSABLE)[idx];
  focusEl(t || node.closest("section")?.querySelector("h2") || node);
}

function setMeta(sel, value) { const m = document.querySelector(sel); if (m && value) m.setAttribute("content", value); }

function applyHead(c) {
  const h = renderHead(c);
  const p = document.getElementById("cms-data")?.dataset.page === "inbjudan" ? "inv-" : "";
  document.title = h[p + "title"];
  setMeta('meta[name="description"]', h[p + "description"]);
  setMeta('meta[property="og:title"]', h[p + "og-title"]);
  if (p) setMeta('meta[property="og:description"]', h["inv-og-description"]);
  const ld = document.querySelector('script[type="application/ld+json"]');
  if (ld) ld.textContent = JSON.stringify(h.jsonld);
}

/** Visar nytt innehåll. Används efter hämtning och direkt efter att en admin sparat. */
export function applyContent(next) {
  const slots = renderSlots(next);
  for (const [name, html] of Object.entries(slots)) {
    if (html === rendered[name]) continue;
    document.querySelectorAll(`[data-cms="${name}"]`).forEach((n) => replaceSlot(n, html));
  }
  rendered = slots;
  current = next;
  if (next.source === "db") initialized = true;
  applyHead(next);
  listeners.forEach((fn) => fn(next));
}

async function fetchOnce() {
  const { getDb, isConfigured } = await import("../firebase.js");
  if (!isConfigured) { document.documentElement.dataset.cms = "embedded"; return false; }
  try {
    const { db, fs } = await getDb();
    const ev = await fs.getDoc(fs.doc(db, "settings", "event"));
    if (!ev.exists()) {
      initialized = false;
      document.documentElement.dataset.cms = "defaults";
      return true;
    }
    const snap = await fs.getDocs(fs.collection(db, "years"));
    const years = snap.docs.map((d) => cleanYear(d.data(), d.id)).filter(Boolean);
    initialized = true;
    applyContent(cleanContent({ source: "db", event: ev.data(), years }));
    document.documentElement.dataset.cms = "db"; // testerna väntar på det här
    return true;
  } catch {
    document.documentElement.dataset.cms = "unavailable"; // det inbäddade innehållet står kvar
    return false;
  }
}

let inflight = null;
/**
 * Hämtar innehållet från Firestore och ritar om det som ändrats.
 * force = true (efter en ändring): vänta in en pågående hämtning och hämta sedan på nytt.
 */
export function refreshContent(force = false) {
  if (inflight && !force) return inflight;
  const prev = inflight;
  const p = (async () => { if (prev) await prev; return fetchOnce(); })();
  inflight = p;
  p.finally(() => { if (inflight === p) inflight = null; });
  return p;
}
