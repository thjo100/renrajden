// Datamodellen för årets lopp (settings/event) och resultatarkivet (years/{år}):
// gränser, rensning av data från Firestore och svensk formatering.
// Gränserna måste stämma med firestore.rules. Filen körs både i webbläsaren och vid bygget.
import { DEFAULT_EVENT, DEFAULT_YEARS } from "./defaults.js";

export const LIMITS = {
  distances: 4,   // distanser i årets lopp
  laps: 6,        // varv per distans
  winners: 6,     // segrarrader per år
  links: 12,      // länkar per år
  text: 300,      // årets text i resultatarkivet
  short: 60,      // arena och område
  classes: 40,    // klasser för en distans, och klass för en segrarrad
  note: 200,      // distansens text i distansväljaren, och namnen i en segrarrad
  label: 80,      // länktext
  url: 2000,
  fee: 10000,
  email: 100,
};
export const EVENT_STATUS = ["planned", "cancelled"];
export const YEAR_STATUS = ["held", "cancelled"];
export const MIN_YEAR = 1990, MAX_YEAR = 2100;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const HTTPS = /^https:\/\/[^\s<>"]+$/i;
export const WEB = /^https?:\/\/[^\s<>"]+$/i; // arkivet har gamla http-länkar
export const EMAIL = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/;

/** Ett riktigt datum i formatet ÅÅÅÅ-MM-DD (inte 2027-02-30). */
export function isDate(s) {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v > lo && v <= hi;
const urlOr = (v, re, fallback = "") => (typeof v === "string" && v.length <= LIMITS.url && re.test(v.trim()) ? v.trim() : fallback);

function cleanLink(l, re) {
  if (!l || typeof l !== "object") return null;
  const url = urlOr(l.url, re);
  return url ? { label: str(l.label, LIMITS.label) || url.replace(/^https?:\/\//i, "").split("/")[0], url } : null;
}

function cleanDistance(d) {
  if (!d || typeof d !== "object") return null;
  if (!isNum(d.km, 0, 100) || !isInt(d.laps, 1, LIMITS.laps) || !str(d.classes, LIMITS.classes)) return null;
  if (!isInt(d.fee, 0, LIMITS.fee) || !isInt(d.lateFee, 0, LIMITS.fee)) return null;
  return { km: d.km, laps: d.laps, classes: str(d.classes, LIMITS.classes), fee: d.fee, lateFee: d.lateFee, note: str(d.note, LIMITS.note) };
}

/** Årets lopp. Fält som saknas eller har fel format får standardvärdet. */
export function cleanEvent(raw) {
  const r = raw && typeof raw === "object" ? raw : {}, D = DEFAULT_EVENT;
  const distances = Array.isArray(r.distances) ? r.distances.slice(0, LIMITS.distances).map(cleanDistance).filter(Boolean) : [];
  return {
    date: isDate(r.date) ? r.date : D.date,
    startTime: typeof r.startTime === "string" && TIME.test(r.startTime) ? r.startTime : D.startTime,
    status: EVENT_STATUS.includes(r.status) ? r.status : D.status,
    venue: str(r.venue, LIMITS.short) || D.venue,
    venueArea: typeof r.venueArea === "string" ? str(r.venueArea, LIMITS.short) : D.venueArea,
    mapUrl: typeof r.mapUrl === "string" ? urlOr(r.mapUrl, HTTPS) : D.mapUrl,
    deadline: r.deadline === "" || isDate(r.deadline) ? r.deadline : D.deadline,
    registrationUrl: urlOr(r.registrationUrl, HTTPS),
    startListUrl: urlOr(r.startListUrl, HTTPS),
    liveResultsUrl: urlOr(r.liveResultsUrl, HTTPS),
    email: typeof r.email === "string" && r.email.length <= LIMITS.email && EMAIL.test(r.email.trim()) ? r.email.trim() : D.email,
    lapKm: isNum(r.lapKm, 0, 50) ? r.lapKm : D.lapKm,
    climbPerLap: isInt(r.climbPerLap, 0, 2000) ? r.climbPerLap : D.climbPerLap,
    waterPerLap: isInt(r.waterPerLap, 0, 10) ? r.waterPerLap : D.waterPerLap,
    coldLimit: isInt(r.coldLimit, -50, 0) ? r.coldLimit : D.coldLimit,
    distances: distances.length ? distances : D.distances.map((d) => ({ ...d })),
  };
}

/** Ett år i resultatarkivet. Returnerar null om året inte går att tolka. */
export function cleanYear(raw, id) {
  const r = raw && typeof raw === "object" ? raw : {};
  const year = Number(id ?? r.year);
  if (!isInt(year, MIN_YEAR, MAX_YEAR)) return null;
  const winners = Array.isArray(r.winners)
    ? r.winners.slice(0, LIMITS.winners).map((w) => (w && typeof w === "object" ? { class: str(w.class, LIMITS.classes), names: str(w.names, LIMITS.note) } : null)).filter((w) => w && w.names)
    : [];
  return {
    year,
    status: YEAR_STATUS.includes(r.status) ? r.status : "held",
    date: isDate(r.date) ? r.date : "",
    text: str(r.text, LIMITS.text),
    winners,
    links: Array.isArray(r.links) ? r.links.slice(0, LIMITS.links).map((l) => cleanLink(l, WEB)).filter(Boolean) : [],
    invitation: cleanLink(r.invitation, WEB),
  };
}

/**
 * Hela innehållet. source = "db" när det kommer från Firestore, annars "defaults".
 * years är sorterade med senaste året först.
 */
export function cleanContent(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const fromDb = r.source === "db";
  const years = (fromDb && Array.isArray(r.years) ? r.years : DEFAULT_YEARS).map((y) => cleanYear(y)).filter(Boolean);
  const unique = [...new Map(years.map((y) => [y.year, y])).values()].sort((a, b) => b.year - a.year);
  return { source: fromDb ? "db" : "defaults", event: cleanEvent(fromDb ? r.event : DEFAULT_EVENT), years: unique };
}

/* ---------- Svensk formatering ---------- */
const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];
const WORDS = ["noll", "ett", "två", "tre", "fyra", "fem", "sex", "sju", "åtta", "nio", "tio", "elva", "tolv"];

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const yearOf = (iso) => Number(String(iso).slice(0, 4));

/** "30 januari 2027", med { weekday: true } "lördag 30 januari 2027", med { year: false } utan år. */
export function fmtDate(iso, { weekday = false, year = true } = {}) {
  if (!isDate(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return (weekday ? wd + " " : "") + d + " " + MONTHS[m - 1] + (year ? " " + y : "");
}
/** 10.5 → "10,5" */
export const fmtNum = (n) => String(n).replace(".", ",");
/** 1500 → "1 500 kr" (hårt mellanslag i tusental) */
export const fmtKr = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " kr";
/** −20 med riktigt minustecken */
export const fmtTemp = (n) => (n < 0 ? "−" : "") + Math.abs(n);
/** 1 → "ett" eller "en", 4 → "fyra". Över tolv blir det siffror. */
export const numWord = (n, one = "ett") => (n === 1 ? one : WORDS[n] ?? String(n));
/** ["a", "b", "c"] → "a, b och c" */
export const joinList = (items, conj = "och") => (items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " " + conj + " " + items[items.length - 1]);
