// Bilderna och filmerna i Bilder: kategorier, gränser, rensning av data från Firestore, sortering
// och adresser till filerna. Körs i webbläsaren och i enhetstesterna.
//
// Ett dokument i media/{id} pekar antingen på en fil i sajten (/bilder/…, bilderna från gamla bloggen)
// eller på filer i Cloud Storage under galleri/{id}/. Gränserna ska stämma med firestore.rules och storage.rules.
import { MIN_YEAR, MAX_YEAR } from "./cms/model.js";

export const IMAGE_CATEGORIES = [
  ["foton", "Foton"], ["affischer", "Affischer"], ["banor", "Banor"], ["sponsorer", "Sponsorer"], ["seedning", "Seedning"],
];
/** Ordningen i galleriets val. Filmer hamnar alltid i "filmer". */
export const CATEGORIES = [IMAGE_CATEGORIES[0], ["filmer", "Filmer"], ...IMAGE_CATEGORIES.slice(1)];
export const CATEGORY_NAMES = Object.fromEntries(CATEGORIES);
const ORDER = CATEGORIES.map((c) => c[0]);
const IMAGE_CATS = IMAGE_CATEGORIES.map((c) => c[0]);

const MB = 1024 * 1024;
export const MEDIA_LIMITS = {
  text: 200,              // texten till en bild eller film
  batch: 50,              // filer per uppladdning
  sourceImage: 40 * MB,   // största bild som går att välja (den förminskas före uppladdningen)
  image: 15 * MB,         // bild.jpg/png/gif i Storage (storage.rules)
  thumb: 2 * MB,          // mini.jpg i Storage (storage.rules)
  video: 200 * MB,        // film.mp4/webm i Storage (storage.rules)
  full: 2048,             // bilder förminskas till högst så många pixlar på längden
  keepPng: 2560,          // en PNG som ryms inom det här och keepPngBytes laddas upp som den är
  keepPngBytes: 5 * MB,
  mini: 640,              // miniatyren i rutnätet
  poster: 960,            // stillbilden till en film
  duration: 36000,        // sekunder
};

const STATIC_PATH = /^\/(bilder|video)\/[A-Za-z0-9/._-]+$/;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/** Sökvägar i Storage för en ny fil. id är dokumentets id i media. */
export const storagePaths = (id, kind, ext) => ({
  file: `galleri/${id}/${kind === "video" ? "film" : "bild"}.${ext}`,
  thumb: `galleri/${id}/mini.jpg`,
});
const validFile = (p, id, video) => typeof p === "string" && p.length <= 300
  && (STATIC_PATH.test(p) || (video ? new RegExp(`^galleri/${id}/film\\.(mp4|webm)$`) : new RegExp(`^galleri/${id}/bild\\.(jpg|png|gif)$`)).test(p));
const validThumb = (p, id) => typeof p === "string" && p.length <= 300 && (STATIC_PATH.test(p) || p === `galleri/${id}/mini.jpg`);

/** År från ett formulärfält: null om det är tomt, NaN om det inte är ett giltigt årtal. */
export function parseYear(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return /^\d{4}$/.test(t) && isInt(n, MIN_YEAR, MAX_YEAR) ? n : NaN;
}

const millis = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : 0);

/** Ett dokument från Firestore, eller null om det inte går att visa. */
export function cleanMedia(raw, id) {
  if (!raw || typeof raw !== "object" || typeof id !== "string" || !/^[A-Za-z0-9-]{1,80}$/.test(id)) return null;
  const video = raw.type === "video";
  if (!video && raw.type !== "image") return null;
  const category = video ? "filmer" : IMAGE_CATS.includes(raw.category) ? raw.category : "foton";
  if (!validFile(raw.file, id, video) || !validThumb(raw.thumb, id)) return null;
  if (!isInt(raw.width, 1, 20000) || !isInt(raw.height, 1, 20000)) return null;
  return {
    id, type: video ? "video" : "image", category,
    year: isInt(raw.year, MIN_YEAR, MAX_YEAR) ? raw.year : null,
    text: typeof raw.text === "string" ? raw.text.trim().slice(0, MEDIA_LIMITS.text) : "",
    file: raw.file, thumb: raw.thumb, width: raw.width, height: raw.height,
    duration: video && typeof raw.duration === "number" && raw.duration >= 0 ? Math.min(raw.duration, MEDIA_LIMITS.duration) : null,
    created: millis(raw.createdAt),
    createdAt: raw.createdAt ?? null, // Firestore Timestamp, behålls vid ångra
    createdBy: raw.createdBy ?? null,
  };
}

/** Id för en bild från gamla bloggen, till exempel foton-2015-tre-akare-i-dimman. */
export const staticId = (fil) => String(fil).replace(/^\/(bilder|video)\//, "").replace(/\.[A-Za-z0-9]+$/, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** Bilderna i public/bilder/bilder.json, i samma form som från Firestore. */
export function fromBilderJson(list) {
  if (!Array.isArray(list)) return [];
  return list.map((b) => b && cleanMedia({
    type: "image", category: b.kategori, year: b.ar, text: b.titel, file: b.fil, thumb: b.mini, width: b.b, height: b.h, duration: null,
  }, staticId(b.fil))).filter(Boolean);
}

/** Fälten som sparas i media/{id}, utan tidsstämplarna. */
export const mediaDoc = (m) => ({
  type: m.type, category: m.type === "video" ? "filmer" : m.category, year: m.year ?? null, text: m.text || "",
  file: m.file, thumb: m.thumb, width: m.width, height: m.height, duration: m.type === "video" ? m.duration ?? 0 : null,
});

/**
 * Ordningen i galleriet: kategori, sedan nyaste året först. En bild utan år sorteras på året den
 * laddades upp, så att nya bilder hamnar överst. Sedan senast uppladdad och till sist texten.
 */
export function sortMedia(list) {
  const year = (m) => m.year ?? (m.created ? new Date(m.created).getFullYear() : 0);
  return [...list].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category)
    || year(b) - year(a) || b.created - a.created || a.text.localeCompare(b.text, "sv"));
}

/** Adressen till en fil. base är adressen till Storage-hinken (se storageBase i firebase.js). */
export function mediaUrl(path, base) {
  if (STATIC_PATH.test(path)) return path;
  return base ? base + encodeURIComponent(path) + "?alt=media" : null;
}

/** Bild eller film, utifrån filtypen (eller filändelsen om webbläsaren inte vet typen). */
export function fileKind(file) {
  const type = String(file.type || "").toLowerCase(), name = String(file.name || "").toLowerCase();
  if (/^image\/(jpeg|png|gif|webp|avif|heic|heif|bmp)$/.test(type)) return "image";
  if (/^video\/(mp4|webm|quicktime|x-m4v)$/.test(type)) return "video";
  if (!type || type === "application/octet-stream") {
    if (/\.(jpe?g|png|gif|webp|avif|heic|heif|bmp)$/.test(name)) return "image";
    if (/\.(mp4|m4v|webm|mov)$/.test(name)) return "video";
  }
  return null;
}

/** 0:42 eller 1:02:03 */
export function fmtDuration(s) {
  const t = Math.max(0, Math.round(s || 0)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** 850 kB eller 12,4 MB */
export function fmtBytes(n) {
  if (n < MB) return `${Math.max(1, Math.round(n / 1024))} kB`;
  return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0).replace(".", ",")} MB`;
}
