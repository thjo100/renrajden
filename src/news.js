// Nyheter: läses publikt från Firestore (samlingen "news") och hämtas om varje minut.
// Administratörsläget (admin.js) slår på redigeringsknappar via setAdminMode().
import { $, $$, el, fmtDate, todayIso, safeUrl, FOCUSABLE, focusEl, announce } from "./ui.js";
import { getDb, isConfigured } from "./firebase.js";

export const TAGS = ["Info", "Resultat", "Ändring", "Inställt", "Valla"];
const NEWS_VISIBLE = 4;

export const S = {
  news: [],
  status: "loading",
  showAll: false,
  openIds: new Set(),
  focusAfter: null, // { sel?, id, until } – fokusmål efter spara/ångra
  rendered: false,
  lastAlert: null,
  adminOn: false,
};

const toIso = (v) => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : typeof v === "string" ? v : null);

export const clean = (raw, id) => ({
  id,
  title: String(raw.title || "Utan rubrik").slice(0, 160),
  date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : todayIso(),
  tag: TAGS.includes(raw.tag) ? raw.tag : "Info",
  body: String(raw.body || "").slice(0, 4000),
  links: Array.isArray(raw.links)
    ? raw.links.filter((l) => l && typeof l.label === "string").slice(0, 12).map((l) => ({ label: l.label.slice(0, 80), url: String(l.url || "") }))
    : [],
  pinned: raw.pinned === true,
  alert: raw.alert === true,
  createdAtRaw: raw.createdAt ?? null, // Firestore Timestamp, behålls vid uppdatering
  createdBy: raw.createdBy ?? null,
  updatedAt: toIso(raw.updatedAt),
});

const sortNews = (a) => [...a].sort((x, y) => (y.pinned === true) - (x.pinned === true) || String(y.date).localeCompare(String(x.date)));

export function setState(status, title, text) {
  S.status = status;
  const box = $("#news-state");
  if (status === "ready") { box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren(el("b", { text: title }), text ? el("p", { text }) : null);
}

const tagChip = (n, extra = "") => el("span", { class: "chip" + extra + (n.tag === "Inställt" || n.tag === "Ändring" ? " chip-red" : ""), text: n.tag });

function newsContent(n) {
  const box = el("div", { class: "news-content" });
  if (n.body.trim()) {
    const body = el("div", { class: "news-body" });
    n.body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).forEach((p) => body.append(el("p", { text: p })));
    box.append(body);
  }
  const links = n.links.map((l) => ({ label: l.label, url: safeUrl(l.url) })).filter((l) => l.url);
  if (links.length) {
    const ul = el("ul", { class: "news-links", "aria-label": "Länkar: " + n.title });
    links.forEach((l) => ul.append(el("li", {}, el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer", class: "ext" }, l.label, el("span", { class: "sr-only", text: " (öppnas i ny flik)" })))));
    box.append(ul);
  }
  if (S.adminOn) {
    const admin = el("div", { class: "news-admin" },
      el("button", { class: "btn btn-quiet btn-sm", type: "button", "data-edit": n.id, "aria-label": "Redigera: " + n.title, text: "Redigera" }),
      el("button", { class: "btn btn-quiet btn-sm", type: "button", "data-delete": n.id, "aria-label": "Ta bort: " + n.title, text: "Ta bort" }));
    if (n.updatedAt) admin.append(el("small", { text: "Senast ändrad " + fmtDate(n.updatedAt.slice(0, 10)) }));
    box.append(admin);
  }
  return box;
}

function newsCard(n, featured) {
  const card = el("article", { class: "news-card" + (n.pinned ? " pinned" : "") + (featured ? " featured" : ""), id: "nyhet-" + n.id, "aria-labelledby": "nt-" + n.id });
  const meta = el("div", { class: "news-meta" }, el("time", { datetime: n.date, text: fmtDate(n.date) }), tagChip(n));
  if (n.pinned) meta.append(el("span", { class: "chip chip-outline", text: "Fäst" }));
  card.append(el("div", { class: "news-head" }, meta, el("h3", { id: "nt-" + n.id, text: n.title })), newsContent(n));
  return card;
}

function archiveItem(n) {
  const d = el("details", { id: "nyhet-" + n.id });
  if (S.openIds.has(n.id)) d.open = true;
  d.addEventListener("toggle", () => { d.open ? S.openIds.add(n.id) : S.openIds.delete(n.id); });
  d.append(el("summary", {}, el("time", { datetime: n.date, text: fmtDate(n.date) }), el("span", { class: "arch-title", text: n.title }), tagChip(n, " arch-tag")), newsContent(n));
  return el("li", {}, d);
}

export function renderNews() {
  const list = $("#news-list"), more = $("#news-more"), arch = $("#news-archive");
  const items = sortNews(S.news);
  // Spara besökarens fokus inom nyheterna så att liveuppdateringar inte river det.
  const a = document.activeElement;
  const holder = a && a !== document.body && a.closest ? a.closest("[id^='nyhet-']") : null;
  const key = holder ? holder.id : null;
  const idx = holder ? $$(FOCUSABLE, holder).indexOf(a) : -1;

  if (S.status === "ready" && !items.length) {
    setState("empty", "Inga nyheter än", S.adminOn ? "Skriv den första nyheten med knappen Ny nyhet." : "Nyheter om Renrajden 2027 publiceras här.");
  } else if (S.status === "empty" && items.length) setState("ready");

  list.replaceChildren();
  items.slice(0, NEWS_VISIBLE).forEach((n, i) => list.append(newsCard(n, i === 0)));
  const older = items.slice(NEWS_VISIBLE);
  arch.replaceChildren();
  if (S.showAll) older.forEach((n) => arch.append(archiveItem(n)));
  arch.hidden = !S.showAll || !older.length;
  more.hidden = !older.length;
  more.setAttribute("aria-expanded", String(S.showAll));
  more.textContent = S.showAll ? "Dölj nyhetsarkivet" : `Visa nyhetsarkivet (${older.length} äldre)`;

  // Fokus: först ett uttryckligt mål efter spara/ångra, annars återställ det besökaren hade.
  const f = S.focusAfter;
  if (f && Date.now() > f.until) S.focusAfter = null;
  if (S.focusAfter) {
    const t = (f.sel && $(f.sel)) || $("#nt-" + f.id) || $("#nyhet-" + f.id + " > summary");
    if (t) { focusEl(t); S.focusAfter = null; }
    else if (S.news.some((n) => n.id === f.id)) { focusEl(more.hidden ? $("#news-h") : more); S.focusAfter = null; }
  } else if (key) {
    const nh = document.getElementById(key);
    if (nh) { const c = $$(FOCUSABLE, nh); focusEl(idx >= 0 && c[idx] ? c[idx] : nh); }
    else focusEl($("#news-h"));
  }

  // Senaste nytt = nyaste datum, oavsett fäst.
  const latest = [...S.news].sort((x, y) => String(y.date).localeCompare(String(x.date)))[0];
  $("#latest").hidden = !latest;
  if (latest) {
    const l = $("#latest-link");
    l.textContent = latest.title;
    l.href = document.getElementById("nyhet-" + latest.id) ? "#nyhet-" + latest.id : "#nyheter";
    const t = $("#latest-date"); t.dateTime = latest.date; t.textContent = fmtDate(latest.date);
  }

  // Viktigt meddelande (t.ex. inställt lopp)
  const alertItem = items.filter((n) => n.alert).sort((x, y) => y.date.localeCompare(x.date))[0];
  $("#alert-bar").hidden = !alertItem;
  if (alertItem) {
    $("#alert-text").textContent = alertItem.title;
    $("#alert-link").href = document.getElementById("nyhet-" + alertItem.id) ? "#nyhet-" + alertItem.id : "#nyheter";
  }
  const alertKey = alertItem ? alertItem.id + "|" + alertItem.title : null;
  if (S.rendered && alertKey && alertKey !== S.lastAlert) announce("Viktigt meddelande: " + alertItem.title);
  S.lastAlert = alertKey;
  S.rendered = true;
}

export function setAdminMode(on) {
  S.adminOn = on;
  renderNews();
}

const POLL_MS = 60000;
let lastJson = "";
let inflight = null;

async function fetchOnce() {
  try {
    const { db, fs } = await getDb();
    const q = fs.query(fs.collection(db, "news"), fs.orderBy("date", "desc"), fs.limit(300));
    const snap = await fs.getDocs(q);
    const news = snap.docs.map((d) => clean(d.data(), d.id));
    const json = JSON.stringify(news.map(({ createdAtRaw, ...rest }) => rest));
    const first = S.status === "loading" || S.status === "slow" || S.status === "unavailable";
    if (first) setState("ready");
    if (json !== lastJson || first) {
      lastJson = json;
      S.news = news;
      renderNews();
    }
    return true;
  } catch {
    if (!S.news.length) setState("unavailable", "Nyheterna kunde inte hämtas", "Vi försöker igen om en stund.");
    return false;
  }
}

/**
 * Hämtar nyheterna. Ritar bara om när något ändrats.
 * force = true (efter en ändring): vänta in en pågående hämtning och hämta sedan på nytt,
 * så att svaret garanterat innehåller ändringen.
 */
export function refreshNews(force = false) {
  if (inflight && !force) return inflight;
  const prev = inflight;
  const p = (async () => { if (prev) await prev; return fetchOnce(); })();
  inflight = p;
  p.finally(() => { if (inflight === p) inflight = null; });
  return p;
}

export async function startNews() {
  $("#news-more").addEventListener("click", () => { S.showAll = !S.showAll; renderNews(); });
  if (!isConfigured) {
    setState("unavailable", "Nyhetsflödet är inte konfigurerat", "Lägg in Firebase-konfigurationen i .env.local (se README).");
    return;
  }
  const slow = setTimeout(() => {
    if (S.status === "loading") setState("slow", "Nyheterna dröjer", "Vi får inte kontakt med nyhetsflödet just nu. Det laddas så snart anslutningen är tillbaka.");
  }, 10000);
  await refreshNews();
  clearTimeout(slow);
  // Uppdatera varje minut medan fliken syns, och direkt när den syns igen.
  setInterval(() => { if (document.visibilityState === "visible") refreshNews(); }, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshNews(); });
  addEventListener("online", () => refreshNews());
}
