// Bildsektionen: filmen överst, val av kategori, rutnät med miniatyrer och helskärmsvisning.
// Bilderna och listan (public/bilder/bilder.json) är hämtade från gamla bloggen renrajden.blogspot.com.
import { $, openDialog } from "./ui.js";

const KATEGORIER = [
  ["alla", "Alla"], ["foton", "Foton"], ["affischer", "Affischer"],
  ["banor", "Banor"], ["sponsorer", "Sponsorer"], ["seedning", "Seedning"],
];
const NAMN = Object.fromEntries(KATEGORIER);
const ORDNING = KATEGORIER.map((k) => k[0]);
const FORST = 8; // så många bilder visas innan "Visa alla"

let alla = [], vald = "alla", allaSynliga = false, lista = [], nu = 0;

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

function ritaVal() {
  const el = $("#galleri-val");
  el.replaceChildren(...KATEGORIER.map(([id, namn]) => {
    const n = id === "alla" ? alla.length : alla.filter((b) => b.kategori === id).length;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "galleri-chip";
    b.setAttribute("aria-pressed", String(vald === id));
    b.append(namn, Object.assign(document.createElement("small"), { textContent: n }));
    b.addEventListener("click", () => { vald = id; allaSynliga = false; rita(); });
    return b;
  }));
}

function ritaRutnat() {
  const urval = alla.filter((b) => vald === "alla" || b.kategori === vald);
  lista = urval;
  const visas = allaSynliga ? urval : urval.slice(0, FORST);
  $("#galleri").replaceChildren(...visas.map((b, i) => {
    const li = document.createElement("li");
    const k = document.createElement("button");
    k.type = "button";
    k.className = "galleri-kort";
    k.setAttribute("aria-label", `Visa bilden ${b.titel}, ${b.ar}`);
    const img = document.createElement("img");
    img.src = b.mini; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
    const liggande = b.b >= b.h;
    img.width = liggande ? 640 : Math.round(640 * b.b / b.h);
    img.height = liggande ? Math.round(640 * b.h / b.b) : 640;
    const text = document.createElement("span");
    text.className = "galleri-text";
    text.append(
      Object.assign(document.createElement("b"), { textContent: b.titel }),
      Object.assign(document.createElement("span"), { textContent: b.ar }),
    );
    k.append(Object.assign(document.createElement("span"), { className: "galleri-bild" }), text);
    k.firstChild.append(img);
    k.addEventListener("click", () => oppna(i));
    li.append(k);
    return li;
  }));
  const mer = $("#galleri-mer");
  mer.hidden = allaSynliga || urval.length <= FORST;
  mer.textContent = `Visa alla ${urval.length} bilder`;
}

function rita() { ritaVal(); ritaRutnat(); }

function visa(i) {
  nu = (i + lista.length) % lista.length;
  const b = lista[nu], img = $("#bild-stor");
  img.src = b.mini; img.alt = b.titel;
  const full = new Image();
  full.onload = () => { if (lista[nu] === b) img.src = b.fil; };
  full.src = b.fil;
  $("#bild-antal").textContent = `${nu + 1} / ${lista.length}`;
  $("#bild-titel").textContent = b.titel;
  $("#bild-info").textContent = `${NAMN[b.kategori]} · ${b.ar}`;
  $("#bild-orig").href = b.fil;
  const flera = lista.length > 1;
  $("#bild-fore").hidden = $("#bild-nasta").hidden = !flera;
  if (flera) for (const g of [lista[(nu + 1) % lista.length], lista[(nu - 1 + lista.length) % lista.length]]) new Image().src = g.fil;
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
  // Klick på den mörka ytan runt bilden stänger.
  dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.classList.contains("bv-bild")) dlg.close(); });
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") visa(nu - 1);
    else if (e.key === "ArrowRight") visa(nu + 1);
  });
  let x0 = null;
  dlg.addEventListener("touchstart", (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  dlg.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const d = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(d) > 50) visa(nu + (d < 0 ? 1 : -1));
  }, { passive: true });
}

export async function startBilder() {
  if (!$("#galleri")) return;
  initFilm();
  initVisning();
  $("#galleri-mer").addEventListener("click", () => { allaSynliga = true; ritaRutnat(); });
  try {
    const r = await fetch("/bilder/bilder.json");
    alla = (await r.json()).sort((a, b) =>
      ORDNING.indexOf(a.kategori) - ORDNING.indexOf(b.kategori) || b.ar - a.ar || a.titel.localeCompare(b.titel, "sv"));
    rita();
  } catch {
    $("#galleri-val").textContent = "Bilderna kunde inte laddas just nu.";
  }
}
