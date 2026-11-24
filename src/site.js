// Sidans interaktivitet som inte kräver Firebase: lägen kring tävlingsdagen, meny, km-mätare,
// distansväljare, packlista och kopiera-knappar.
import { $, $$, store, toast } from "./ui.js";

/* ---------- Lägen: före, tävlingsvecka, tävlingsdag, efter loppet ---------- */
export const RACE_DATE = new Date(2027, 0, 30); // lördag 30 januari 2027
const daysLeft = () => { const n = new Date(); return Math.round((RACE_DATE - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000); };
const phaseFor = (d) => (d > 7 ? "before" : d > 0 ? "raceweek" : d === 0 ? "raceday" : "after");
// Förhandsvisning: ?lage=tavlingsvecka | tavlingsdag | efter
const PREVIEW = { tavlingsvecka: ["raceweek", 3], tavlingsdag: ["raceday", 0], efter: ["after", -1] };

function applyPhase() {
  const preview = PREVIEW[new URLSearchParams(location.search).get("lage")];
  const d = preview ? preview[1] : daysLeft();
  const phase = preview ? preview[0] : phaseFor(d);
  document.body.dataset.phase = phase;
  const num = $("#count-num"), label = $("#count-label"), link = $("#count-link");
  link.hidden = true;
  if (d > 1) { num.textContent = d; label.textContent = "dagar kvar till start"; }
  else if (d === 1) { num.textContent = "1"; label.textContent = "dag kvar till start"; }
  else if (d === 0) { num.textContent = "0"; label.textContent = "Tävlingsdag! Tider finns i PM"; }
  else { num.textContent = "✓"; label.textContent = "Loppet är kört"; link.hidden = false; }
  const set = (a, text, href) => { a.textContent = text; a.href = href; };
  const c1 = $("#cta-1"), c2 = $("#cta-2");
  if (phase === "before") { set(c1, "Så anmäler du dig", "#anmalan"); set(c2, "Senaste nytt", "#nyheter"); }
  else if (phase === "after") { set(c1, "Resultat", "#resultat"); set(c2, "Senaste nytt", "#nyheter"); }
  else { set(c1, "PM och tider", "#pm"); set(c2, "Startlista och liveresultat", "#nyheter"); }
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
  const sectionIds = ["loppet", "seedning", "anmalan", "pm", "bana", "nyheter", "resultat", "partners", "kontakt"];
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
const DIST = {
  42: { laps: 4, prize: "Prisutdelning för 1:a–3:e i HD42, direkt när de gått i mål." },
  21: { laps: 2, prize: "Pris till vinnarna i HD21." },
  10: { laps: 1, prize: "Motionsdistans. Startade samtidigt som de långa, kl 10:00, år 2025." },
};
function initDistances() {
  $$('input[name="dist"]').forEach((r) => r.addEventListener("change", () => {
    const d = DIST[r.value];
    $$(".lap").forEach((l, i) => l.classList.toggle("on", i < d.laps));
    $("#ds-laps").textContent = d.laps;
    $("#ds-hm").textContent = "ca " + d.laps * 98;
    $("#ds-water").textContent = d.laps * 2;
    $("#ds-prize").textContent = d.prize;
    $("#dist-live").textContent = `${r.value} km: ${d.laps} varv, cirka ${d.laps * 98} höjdmeter och ${d.laps * 2} vätskekontroller. ${d.prize}`;
  }));
}

/* ---------- Packlista (bara i webbläsaren) ---------- */
function initPacklist() {
  const key = "rr-pack-2027";
  const state = store.get(key) || {};
  const boxes = $$("#packlist input");
  const count = () => { $("#pack-count").textContent = `${boxes.filter((b) => b.checked).length} av ${boxes.length} packat`; };
  boxes.forEach((b) => {
    b.checked = !!state[b.id];
    b.addEventListener("change", () => { state[b.id] = b.checked; store.set(key, state); count(); });
  });
  count();
}

/* ---------- Kopiera e-post ---------- */
function initCopy() {
  $$("[data-copy]").forEach((btn) => btn.addEventListener("click", () => {
    const src = document.getElementById(btn.dataset.copy);
    const fallback = () => {
      const r = document.createRange(); r.selectNodeContents(src);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      toast("Adressen är markerad. Kopiera med Ctrl+C eller ⌘C");
    };
    try { navigator.clipboard.writeText(src.textContent.trim()).then(() => toast("Adressen är kopierad"), fallback); }
    catch { fallback(); }
  }));
}

export function initSite() {
  applyPhase();
  initMenu();
  initRail();
  initDistances();
  initPacklist();
  initCopy();
}
