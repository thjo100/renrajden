// Bildsektionen: filmen överst, val av kategori, rutnät med miniatyrer och helskärmsvisning av bilder och filmer.
//
// Bilderna och filmerna hämtas från Firestore (samlingen media) när sektionen närmar sig skärmen.
// Innan en administratör har sparat något i Bilder (settings/media saknas) visas bilderna från gamla
// bloggen, public/bilder/bilder.json. Adminläget (src/media-admin.js) lägger till knappar via setGalleriAdmin().
import { $, el, openDialog, focusEl } from "./ui.js";
import { getDb, isConfigured, storageBase } from "./firebase.js";
import { CATEGORIES, CATEGORY_NAMES, cleanMedia, fromBilderJson, sortMedia, mediaUrl, fmtDuration } from "./media.js";

const FORST = 8; // så många visas innan "Visa alla"

let alla = [], vald = "foton", allaSynliga = false, lista = [], nu = 0;
let source = "loading"; // "db" (från Firestore), "defaults" (bilder.json) eller "unavailable" (Firestore svarade inte)
let admin = null;       // { decorate(li, item) } när en administratör är inloggad
const listeners = new Set();

/** Det som visas just nu. source = "db", "defaults", "unavailable" eller "loading". */
export const getMedia = () => ({ source, items: alla });
/** fn() anropas efter varje omritning av rutnätet. */
export const onGalleri = (fn) => { listeners.add(fn); };

// Adress till filen och miniatyren. Filer i Storage går inte att visa om hinken inte är inställd.
const withUrls = (m) => ({ ...m, src: mediaUrl(m.file, storageBase), mini: mediaUrl(m.thumb, storageBase) });
const visbar = (m) => m.src && m.mini;

/** "Tre åkare i dimman, 2015", "från 2027" eller "" */
const namn = (b) => (b.text ? `${b.text}${b.year ? ", " + b.year : ""}` : b.year ? `från ${b.year}` : "");
export const beskrivning = (b) => `${b.type === "video" ? "filmen" : "bilden"}${namn(b) ? " " + namn(b) : ""}`;

function initFilm() {
  const film = $("#film"), spela = $("#film-spela"), ljud = $("#film-ljud");
  if (!film) return;
  const knappar = () => {
    spela.textContent = film.paused ? "Spela" : "Paus";
    spela.setAttribute("aria-label", film.paused ? "Spela filmen" : "Pausa filmen");
    ljud.textContent = film.muted ? "Ljud på" : "Ljud av";
    ljud.setAttribute("aria-label", film.muted ? "Slå på ljudet" : "Stäng av ljudet");
  };
  film.addEventListener("play", knappar);
  film.addEventListener("pause", knappar);
  spela.addEventListener("click", () => (film.paused ? film.play() : film.pause()));
  ljud.addEventListener("click", () => {
    film.muted = !film.muted;
    if (!film.muted && film.paused) film.play();
    knappar();
  });
  knappar();
  // Spela bara när filmen syns och användaren inte valt minskade rörelser.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  let startad = false;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !startad) { startad = true; film.play().catch(knappar); }
    else if (!e.isIntersecting && !film.paused && film.muted) { film.pause(); startad = false; }
  }, { threshold: 0.4 }).observe(film);
}

const antal = (id) => (id === "alla" ? alla.length : alla.filter((b) => b.category === id).length);

function ritaVal() {
  const box = $("#galleri-val");
  if (!alla.length) { box.replaceChildren(el("p", { class: "note", text: source === "loading" ? "Bilderna laddas…" : "Inga bilder än." })); return; }
  // Kategorier utan innehåll visas inte. Är den valda tom (till exempel efter en borttagning) visas alla.
  if (vald !== "alla" && !antal(vald)) vald = "alla";
  box.replaceChildren(...[["alla", "Alla"], ...CATEGORIES].filter(([id]) => id === "alla" || antal(id)).map(([id, text]) => {
    const b = el("button", { type: "button", class: "galleri-chip", "aria-pressed": String(vald === id) }, text, el("small", { text: antal(id) }));
    b.addEventListener("click", () => { vald = id; allaSynliga = false; rita(); });
    return b;
  }));
}

function kort(b, i) {
  const video = b.type === "video";
  const k = el("button", { type: "button", class: "galleri-kort" + (video ? " galleri-film" : ""), "aria-label": `${video ? "Spela" : "Visa"} ${beskrivning(b)}` });
  const img = el("img", { src: b.mini, alt: "", loading: "lazy", decoding: "async" });
  const liggande = b.width >= b.height;
  img.width = liggande ? 640 : Math.round(640 * b.width / b.height);
  img.height = liggande ? Math.round(640 * b.height / b.width) : 640;
  const bild = el("span", { class: "galleri-bild" }, img);
  if (video) bild.append(el("span", { class: "galleri-play", "aria-hidden": "true" }, el("span", { text: "▶" }), b.duration ? fmtDuration(b.duration) : "Film"));
  k.append(bild);
  if (b.text || b.year) {
    k.append(el("span", { class: "galleri-text" }, b.text ? el("b", { text: b.text }) : null, b.year ? el("span", { text: b.year }) : null));
  }
  k.addEventListener("click", () => oppna(i));
  const li = el("li", { "data-media-id": b.id }, k);
  if (admin) admin.decorate(li, b);
  return li;
}

function ritaRutnat() {
  const urval = alla.filter((b) => vald === "alla" || b.category === vald);
  lista = urval;
  const visas = allaSynliga ? urval : urval.slice(0, FORST);
  // Har en knapp i rutnätet fokus (till exempel Redigera efter en sparning) hamnar fokus på samma knapp efteråt.
  const ul = $("#galleri"), a = document.activeElement, li = a && ul.contains(a) ? a.closest("li[data-media-id]") : null;
  const keep = li && { id: li.dataset.mediaId, i: [...li.querySelectorAll("button")].indexOf(a) };
  ul.replaceChildren(...visas.map(kort));
  if (keep) focusEl(ul.querySelector(`li[data-media-id="${CSS.escape(keep.id)}"]`)?.querySelectorAll("button")[keep.i] || $("#bilder-h"));
  const mer = $("#galleri-mer");
  mer.hidden = allaSynliga || urval.length <= FORST;
  const filmer = urval.filter((b) => b.type === "video").length;
  mer.textContent = `Visa alla ${urval.length} ${filmer === urval.length ? "filmer" : filmer ? "bilder och filmer" : "bilder"}`;
  listeners.forEach((fn) => fn());
}

function rita() { ritaVal(); ritaRutnat(); }

/** Väljer en kategori (används efter en uppladdning). */
export function showCategory(id) {
  vald = id; allaSynliga = false;
  rita();
}

/* ---------- Helskärmsvisning ---------- */
function stoppaFilm() {
  const f = $("#bild-film");
  if (!f.hidden) { f.pause(); f.removeAttribute("src"); f.load(); }
}

function visa(i) {
  nu = (i + lista.length) % lista.length;
  const b = lista[nu], img = $("#bild-stor"), film = $("#bild-film"), video = b.type === "video";
  const titel = b.text || (video ? "Film" : "Bild");
  if (video) {
    img.hidden = true; img.removeAttribute("src");
    film.hidden = false; film.poster = b.mini; film.setAttribute("aria-label", titel);
    if (film.getAttribute("src") !== b.src) film.src = b.src;
  } else {
    stoppaFilm(); film.hidden = true;
    img.hidden = false; img.src = b.mini; img.alt = titel;
    const full = new Image();
    full.onload = () => { if (lista[nu] === b) img.src = b.src; };
    full.src = b.src;
  }
  $("#bild-antal").textContent = `${nu + 1} / ${lista.length}`;
  $("#bild-titel").textContent = titel;
  $("#bild-info").textContent = `${CATEGORY_NAMES[b.category]}${b.year ? " · " + b.year : ""}`;
  $("#bild-orig").href = b.src;
  const flera = lista.length > 1;
  $("#bild-fore").hidden = $("#bild-nasta").hidden = !flera;
  if (flera) for (const g of [lista[(nu + 1) % lista.length], lista[(nu - 1 + lista.length) % lista.length]]) if (g.type === "image") new Image().src = g.src;
}

function oppna(i) {
  visa(i);
  const film = $("#film");
  if (film && !film.paused) film.pause();
  openDialog($("#bildvisning"));
}

function initVisning() {
  const dlg = $("#bildvisning");
  $("#bild-fore").addEventListener("click", () => visa(nu - 1));
  $("#bild-nasta").addEventListener("click", () => visa(nu + 1));
  dlg.addEventListener("close", stoppaFilm);
  // Klick på den mörka ytan runt bilden stänger.
  dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.classList.contains("bv-bild")) dlg.close(); });
  // Piltangenterna och svep spolar i filmen när den har fokus eller fingret är på den.
  const iFilm = (e) => e.target.closest && e.target.closest("video");
  dlg.addEventListener("keydown", (e) => {
    if (iFilm(e)) return;
    if (e.key === "ArrowLeft") visa(nu - 1);
    else if (e.key === "ArrowRight") visa(nu + 1);
  });
  let x0 = null;
  dlg.addEventListener("touchstart", (e) => { x0 = e.touches.length === 1 && !iFilm(e) ? e.touches[0].clientX : null; }, { passive: true });
  dlg.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const d = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(d) > 50) visa(nu + (d < 0 ? 1 : -1));
  }, { passive: true });
}

/* ---------- Hämtning ---------- */
async function fromJson() {
  const r = await fetch("/bilder/bilder.json");
  if (!r.ok) throw new Error("bilder.json " + r.status);
  return fromBilderJson(await r.json());
}

async function fetchOnce() {
  if (isConfigured) {
    try {
      const { db, fs } = await getDb();
      const [marker, snap] = await Promise.all([fs.getDoc(fs.doc(db, "settings", "media")), fs.getDocs(fs.collection(db, "media"))]);
      if (marker.exists()) return { source: "db", items: snap.docs.map((d) => cleanMedia(d.data(), d.id)).filter(Boolean) };
      return { source: "defaults", items: await fromJson() };
    } catch {
      return { source: "unavailable", items: await fromJson() };
    }
  }
  return { source: "defaults", items: await fromJson() };
}

/** Visar en ny lista. Används efter hämtning och direkt efter att en admin sparat. */
export function setMedia(items, src = source) {
  source = src;
  alla = sortMedia(items.map(withUrls).filter(visbar));
  rita();
  document.documentElement.dataset.media = source; // testerna väntar på det här
}

let inflight = null, started = false;
/**
 * Hämtar bilderna och ritar om. force = true (efter en ändring): vänta in en pågående
 * hämtning och hämta sedan på nytt.
 */
export function refreshMedia(force = false) {
  started = true;
  if (inflight && !force) return inflight;
  const prev = inflight;
  const p = (async () => {
    if (prev) await prev.catch(() => {});
    try { const r = await fetchOnce(); setMedia(r.items, r.source); }
    catch { if (!alla.length) $("#galleri-val").textContent = "Bilderna kunde inte laddas just nu."; }
  })();
  inflight = p;
  p.finally(() => { if (inflight === p) inflight = null; });
  return p;
}

/** Slår på eller av adminknapparna på korten. a = { decorate(li, item) } eller null. */
export function setGalleriAdmin(a) {
  admin = a;
  if (source !== "loading") ritaRutnat();
}

export function startBilder() {
  if (!$("#galleri")) return;
  initFilm();
  initVisning();
  ritaVal();
  $("#galleri-mer").addEventListener("click", () => { allaSynliga = true; ritaRutnat(); });
  // Hämta först när besökaren närmar sig Bilder, så att den som aldrig scrollar dit inte läser från Firestore.
  if (!("IntersectionObserver" in window)) { refreshMedia(); return; }
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    if (!started) refreshMedia();
  }, { rootMargin: "1200px 0px" });
  io.observe($("#bilder"));
}
