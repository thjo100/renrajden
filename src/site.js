// Sidans interaktivitet som inte kräver Firebase: lägen kring tävlingsdagen, meny, km-mätare,
// distansväljare och packlista. Datum, distanser och länkar kommer från
// årets lopp (src/cms/), och allt räknas om när innehållet uppdateras.
import { $, $$, el, store } from "./ui.js";
import { getContent, onContent } from "./cms/runtime.js";
import { distanceSummary } from "./cms/render.js";

const ev = () => getContent().event;

/* ---------- Lägen: före, tävlingsvecka, tävlingsdag, efter loppet ---------- */
const raceDate = () => { const [y, m, d] = ev().date.split("-").map(Number); return new Date(y, m - 1, d); };
const daysLeft = () => { const n = new Date(); return Math.round((raceDate() - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000); };
const phaseFor = (d) => (d > 7 ? "before" : d > 0 ? "raceweek" : d === 0 ? "raceday" : "after");
// Förhandsvisning: ?lage=tavlingsvecka | tavlingsdag | efter
const PREVIEW = { tavlingsvecka: ["raceweek", 3], tavlingsdag: ["raceday", 0], efter: ["after", -1] };

// Knappar och länkar som kan gå till en extern sida (startlista, liveresultat) får ↗ och öppnas i ny flik.
function setLink(a, text, href) {
  const external = /^https:/.test(href);
  a.replaceChildren(text, external ? el("span", { class: "sr-only", text: " (öppnas i ny flik)" }) : "");
  a.href = href;
  a.classList.toggle("ext", external);
  a.toggleAttribute("target", external);
  a.toggleAttribute("rel", external);
  if (external) { a.target = "_blank"; a.rel = "noopener"; }
}

function applyPhase() {
  const e = ev();
  const preview = PREVIEW[new URLSearchParams(location.search).get("lage")];
  const d = preview ? preview[1] : daysLeft();
  const phase = preview ? preview[0] : phaseFor(d);
  const cancelled = e.status === "cancelled";
  document.body.dataset.phase = phase;
  document.body.dataset.status = e.status;
  const num = $("#count-num"), label = $("#count-label"), link = $("#count-link");
  link.hidden = true;
  setLink(link, "Se resultaten", "#resultat");
  if (cancelled) { num.textContent = "–"; label.textContent = "Loppet är inställt"; setLink(link, "Läs mer under Nyheter", "#nyheter"); link.hidden = false; }
  else if (d > 1) { num.textContent = d; label.textContent = "dagar kvar till start"; }
  else if (d === 1) { num.textContent = "1"; label.textContent = "dag kvar till start"; }
  else if (d === 0) { num.textContent = "0"; label.textContent = "Tävlingsdag! Tider finns i PM"; setLink(link, "Efteranmälan och Swish", "#swish"); link.hidden = false; }
  else { num.textContent = "✓"; label.textContent = "Loppet är kört"; link.hidden = false; }
  const c1 = $("#cta-1"), c2 = $("#cta-2");
  if (cancelled) { setLink(c1, "Senaste nytt", "#nyheter"); setLink(c2, "Resultat", "#resultat"); }
  else if (phase === "before") { setLink(c1, "Så anmäler du dig", "#anmalan"); setLink(c2, "Senaste nytt", "#nyheter"); }
  else if (phase === "after") { setLink(c1, "Resultat", "#resultat"); setLink(c2, "Senaste nytt", "#nyheter"); }
  else {
    setLink(c1, "PM och tider", "#pm");
    // Tävlingsdagen: liveresultat i första hand. Veckan före: startlistan i första hand.
    const order = phase === "raceday" ? [["Liveresultat", e.liveResultsUrl], ["Startlista", e.startListUrl]] : [["Startlista", e.startListUrl], ["Liveresultat", e.liveResultsUrl]];
    const [text, href] = order.find(([, u]) => u) || ["Startlista och liveresultat", "#nyheter"];
    setLink(c2, text, href);
  }
}

/* ---------- Meny ---------- */
function initMenu() {
  const menuBtn = $("#menu-btn"), nav = $("#site-nav");
  const isOpen = () => nav.hasAttribute("data-open");
  const setMenu = (open) => { menuBtn.setAttribute("aria-expanded", String(open)); open ? nav.setAttribute("data-open", "") : nav.removeAttribute("data-open"); };
  menuBtn.addEventListener("click", () => setMenu(!isOpen()));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) { setMenu(false); menuBtn.focus(); } });
  nav.addEventListener("focusout", (e) => { if (isOpen() && e.relatedTarget && !nav.contains(e.relatedTarget) && e.relatedTarget !== menuBtn) setMenu(false); });
  document.addEventListener("click", (e) => { if (isOpen() && !nav.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false); });
  nav.addEventListener("click", (e) => {
    const a = e.target.closest("a[href^='#']");
    if (!a) return;
    setMenu(false);
    const h = $(a.getAttribute("href") + " h2");
    if (h) requestAnimationFrame(() => { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); });
  });
}

/* ---------- Km-mätare: varven följer sektionerna ---------- */
function initRail() {
  const rail = $(".rail"), railKm = $("#rail-km"), railLap = $("#rail-lap"), mbar = $("#progress-mobile");
  const marks = $$(".rail-mark"), navLinks = $$(".site-nav a");
  const sectionIds = ["loppet", "seedning", "anmalan", "pm", "bana", "nyheter", "bilder", "resultat", "partners", "kontakt"];
  const lapAnchors = ["anmalan", "bana", "resultat"]; // 10,5 / 21 / 31,5 km
  const kmAt = (y, max) => {
    if (max <= 0) return 0;
    y = Math.min(max, Math.max(0, y));
    const off = innerHeight * 0.35, pts = [0];
    for (const id of lapAnchors) { const s = document.getElementById(id); pts.push(s ? s.getBoundingClientRect().top + scrollY - off : 0); }
    pts.push(max);
    for (let i = 1; i < pts.length; i++) pts[i] = Math.min(max, Math.max(pts[i], pts[i - 1] + 1));
    for (let i = 0; i < 4; i++) if (y <= pts[i + 1]) return (i + (y - pts[i]) / Math.max(1, pts[i + 1] - pts[i])) * 10.5;
    return 42;
  };
  let raf = 0;
  const update = () => {
    raf = 0;
    const max = document.documentElement.scrollHeight - innerHeight;
    const km = kmAt(scrollY, max), p = km / 42, done = km >= 41.9;
    rail.style.setProperty("--p", p.toFixed(4));
    mbar.style.transform = `scaleX(${p.toFixed(4)})`;
    railKm.textContent = done ? "MÅL!" : km.toFixed(1).replace(".", ",") + " km";
    railLap.textContent = done ? "Bra åkt" : "varv " + Math.min(4, Math.floor(km / 10.5) + 1);
    const h = rail.clientHeight - 24;
    marks.forEach((m, i) => m.classList.toggle("near", Math.abs(p - i / 4) * h < 30));
    let current = null;
    for (const id of sectionIds) { const s = document.getElementById(id); if (s && s.getBoundingClientRect().top < innerHeight * 0.35) current = id; }
    navLinks.forEach((a) => (a.getAttribute("href") === "#" + current ? a.setAttribute("aria-current", "location") : a.removeAttribute("aria-current")));
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  update();
}

/* ---------- Distansväljare ---------- */
// Väljaren ritas av src/cms/render.js. Radioknapparnas värde är distansens plats i listan.
let distIdx = 0;
function showDistance(i) {
  const e = ev(), d = e.distances[i];
  if (!d || !$("#ds-laps")) return null;
  distIdx = i;
  $$(".lap").forEach((l, j) => l.classList.toggle("on", j < d.laps));
  $("#ds-laps").textContent = d.laps;
  $("#ds-hm").textContent = "ca " + d.laps * e.climbPerLap;
  $("#ds-water").textContent = d.laps * e.waterPerLap;
  $("#ds-prize").textContent = d.note;
  return d;
}
function initDistances() {
  document.addEventListener("change", (e) => {
    const r = e.target.closest && e.target.closest('input[name="dist"]');
    if (!r) return;
    const d = showDistance(Number(r.value));
    if (d) $("#dist-live").textContent = distanceSummary(ev(), d);
  });
  // Efter en uppdatering: behåll besökarens val om distansen finns kvar.
  onContent((c) => {
    if (distIdx >= c.event.distances.length) distIdx = 0;
    const r = $("#d" + distIdx);
    if (r) { r.checked = true; showDistance(distIdx); }
  });
}

/* ---------- Packlista (bara i webbläsaren) ---------- */
function initPacklist() {
  const key = "rr-pack-" + ev().date.slice(0, 4); // ny packlista varje år
  const state = store.get(key) || {};
  const boxes = $$("#packlist input");
  const count = () => { $("#pack-count").textContent = `${boxes.filter((b) => b.checked).length} av ${boxes.length} packat`; };
  boxes.forEach((b) => {
    b.checked = !!state[b.id];
    b.addEventListener("change", () => { state[b.id] = b.checked; store.set(key, state); count(); });
  });
  count();
}

export function initSite() {
  applyPhase();
  onContent(applyPhase);
  initMenu();
  initRail();
  initDistances();
  initPacklist();
}
