// Adminläget för årets lopp (settings/event), resultatarkivet (years/{år}) och partnerna (settings/partners).
// Startas av admin.js efter inloggning. Dialogerna byggs här, så att de bara laddas för administratörer.
//
// Första gången något sparas finns inget i Firestore än, och sidan visar standardinnehållet
// (src/cms/defaults.js). Då sparas hela det innehållet i samma batch som ändringen, så att inget
// år i arkivet försvinner när sidan börjar läsa från Firestore. Partnerna sparas för sig och berörs inte av det.
import { $, $$, el, toast, openDialog, closeDialog, focusEl, initDialog } from "./ui.js";
import { withTimeout, writeErr, field, selectField, dialogParts, formKit, repeater, linkRow, readLinks, confirmDelete } from "./admin-kit.js";
import { getContent, applyContent, refreshContent, isInitialized, onContent } from "./cms/runtime.js";
import { cleanContent, formerNames, isDate, fmtNum, LIMITS, TIME, HTTPS, WEB, EMAIL, MIN_YEAR, MAX_YEAR } from "./cms/model.js";

let db, fs, user = null;

/* ---------- Spara ---------- */
const eventDoc = (e) => ({
  date: e.date, startTime: e.startTime, status: e.status, venue: e.venue, venueArea: e.venueArea, mapUrl: e.mapUrl,
  deadline: e.deadline, registrationUrl: e.registrationUrl, startListUrl: e.startListUrl, liveResultsUrl: e.liveResultsUrl,
  email: e.email, lapKm: e.lapKm, climbPerLap: e.climbPerLap, waterPerLap: e.waterPerLap, coldLimit: e.coldLimit,
  distances: e.distances.map(({ km, laps, classes, fee, lateFee, note }) => ({ km, laps, classes, fee, lateFee, note })),
});
const yearDoc = (y) => ({
  year: y.year, status: y.status, date: y.date, text: y.text,
  winners: y.winners.map((w) => ({ class: w.class, names: w.names })),
  links: y.links.map(({ label, url }) => ({ label, url })),
  invitation: y.invitation ? { label: y.invitation.label, url: y.invitation.url } : null,
});

/** Sparar årets lopp och/eller ett år, eller tar bort ett år. Visar ändringen direkt. */
async function save({ event, year, removeYear }) {
  const c = getContent(), init = !isInitialized();
  const stamp = (d) => ({ ...d, updatedAt: fs.serverTimestamp(), updatedBy: user.uid });
  const yearRef = (y) => fs.doc(db, "years", String(y));
  const keep = c.years.filter((y) => y.year !== year?.year && y.year !== removeYear);
  const batch = fs.writeBatch(db);
  if (event || init) batch.set(fs.doc(db, "settings", "event"), stamp(eventDoc(event || c.event)));
  if (init) keep.forEach((y) => batch.set(yearRef(y.year), stamp(yearDoc(y))));
  if (year) batch.set(yearRef(year.year), stamp(yearDoc(year)));
  if (removeYear && !init) batch.delete(yearRef(removeYear));
  await withTimeout(batch.commit());
  applyContent(cleanContent({ source: "db", event: event || c.event, years: year ? [...keep, year] : keep, partners: c.partners }));
  refreshContent(true); // bekräfta mot Firestore i bakgrunden
}

/** Sparar partnerna (hela listan i ett dokument). Visar ändringen direkt. */
async function savePartners(p) {
  const c = getContent();
  await withTimeout(fs.setDoc(fs.doc(db, "settings", "partners"), {
    partners: p.partners.map(({ name, text, url }) => ({ name, text, url })),
    former: p.former,
    updatedAt: fs.serverTimestamp(), updatedBy: user.uid,
  }));
  applyContent(cleanContent({ source: c.source, event: c.event, years: c.years, partners: p }));
  refreshContent(true);
}

/* ---------- Hjälpare för formulären ---------- */
const num = (s) => { const t = String(s).trim().replace(/\s/g, "").replace(",", ".").replace("−", "-"); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN; };
const int = (s) => { const n = num(s); return Number.isInteger(n) ? n : NaN; };
const within = (n, lo, hi) => n >= lo && n <= hi; // NaN blir false
const val = (id) => $("#" + id).value.trim();
const group = (legend, ...kids) => el("fieldset", { class: "group" }, el("legend", { text: legend }), ...kids);
const grid = (cls, ...kids) => el("div", { class: cls }, ...kids);
const busy = (btn, on, text) => { if (on) { btn._text = btn.textContent; btn.setAttribute("aria-disabled", "true"); btn.textContent = text; } else { btn.removeAttribute("aria-disabled"); btn.textContent = btn._text; } };

function makeDialog(id, title) {
  const parts = dialogParts(id);
  const body = el("div", { class: "dlg-body" }, parts.summary);
  const save = el("button", { class: "btn btn-red", type: "submit", text: "Spara" });
  const form = el("form", { novalidate: true },
    el("div", { class: "dlg-head" }, el("h2", { id: id + "-h", text: title }), el("button", { class: "dlg-close", type: "button", "data-close": "", "aria-label": "Stäng utan att spara" }, "×")),
    body, parts.discard,
    el("div", { class: "dlg-foot" }, el("button", { class: "btn btn-quiet", type: "button", "data-close": "", text: "Avbryt" }), save));
  const dlg = el("dialog", { id, class: "dlg-wide", "aria-labelledby": id + "-h" }, form);
  document.body.append(dlg);
  initDialog(dlg);
  return { dlg, body, form, save, kit: formKit(dlg) };
}

/* ---------- Årets lopp ---------- */
let E = null, dists = null, savingEvent = false;

function distRow(d = {}, n) {
  const f = (key, label, value, attrs = {}) => field({ id: `d${key}-${n}`, label, value: value ?? "", ...attrs });
  return el("fieldset", { class: "sub-row" }, el("legend", { text: "Distans" }),
    grid("row-grid",
      f("km", "Km", d.km != null ? fmtNum(d.km) : "", { inputmode: "decimal", maxlength: "5" }),
      f("laps", "Varv", d.laps, { inputmode: "numeric", maxlength: "1" }),
      f("cls", "Klasser", d.classes, { maxlength: String(LIMITS.classes), placeholder: "HD42" }),
      f("fee", "Avgift, kr", d.fee, { inputmode: "numeric", maxlength: "5" }),
      f("late", "Efteranmälan, kr", d.lateFee, { inputmode: "numeric", maxlength: "5" })),
    f("note", "Text i distansväljaren", d.note, { maxlength: String(LIMITS.note), hint: "Till exempel vilka som får pris." }),
    el("button", { class: "btn btn-quiet btn-sm", type: "button", "data-remove-row": "", text: "Ta bort distansen" }));
}

function buildEventDialog() {
  E = makeDialog("event-dialog", "Årets lopp");
  const addDist = el("button", { class: "btn btn-quiet btn-sm add-row", type: "button", text: "+ Lägg till distans" });
  const distList = el("div", { class: "sub-rows", id: "ev-dists" });
  const url = (id, label, hint) => field({ id, label, type: "url", inputmode: "url", placeholder: "https://", hint });
  const small = (id, label, hint) => field({ id, label, inputmode: id === "ev-cold" ? "text" : "decimal", maxlength: "6", hint });
  E.body.append(
    el("p", { class: "note", text: "Ändringarna syns direkt på startsidan och i inbjudan. Har du ändrat distanser eller avgifter: öppna inbjudan och kontrollera med Skriv ut att den fortfarande ryms på ett A4." }),
    group("Datum och plats",
      grid("row2", field({ id: "ev-date", label: "Tävlingsdag", type: "date" }), field({ id: "ev-time", label: "Starttid", type: "time" })),
      grid("row2",
        field({ id: "ev-deadline", label: "Sista anmälningsdag", type: "date", hint: "Lämna tomt om den inte är bestämd." }),
        selectField({ id: "ev-status", label: "Status", options: [["planned", "Planerat"], ["cancelled", "Inställt"]] })),
      grid("row2",
        field({ id: "ev-venue", label: "Arena", maxlength: String(LIMITS.short) }),
        field({ id: "ev-area", label: "Område", maxlength: String(LIMITS.short) })),
      url("ev-map", "Kartlänk till arenan", "Visas som Hitta hit.")),
    group("Länkar för årets lopp",
      url("ev-reg", "Anmälan i SSF TA", "Direktlänk till tävlingen, visas under Anmälan. Lämnas det tomt länkar sidan till inloggningen i SSF TA."),
      url("ev-start", "Startlista", "Visas på startsidan veckan före loppet och i resultatarkivet."),
      url("ev-live", "Liveresultat", "Visas på startsidan på tävlingsdagen och i resultatarkivet.")),
    group("Distanser och avgifter", distList, addDist),
    group("Banan",
      grid("row4",
        small("ev-lap", "Slinga, km"),
        small("ev-climb", "Höjdmeter per varv"),
        small("ev-water", "Vätskekontroller per varv"),
        small("ev-cold", "Köldgräns, °C", "Till exempel −20."))),
    group("Kontakt", field({ id: "ev-email", label: "E-post för frågor", type: "email", maxlength: String(LIMITS.email) })),
  );
  dists = repeater(distList, addDist, {
    build: distRow, max: LIMITS.distances, min: 1,
    onChange: (rows) => rows.forEach((r, i) => {
      $("legend", r).textContent = "Distans " + (i + 1);
      $("[data-remove-row]", r).setAttribute("aria-label", "Ta bort distans " + (i + 1));
    }),
  });
  E.form.addEventListener("submit", onEventSubmit);
}

function openEvent(focusId) {
  const e = getContent().event;
  E.kit.clear();
  const set = (id, v) => { $("#" + id).value = v; };
  set("ev-date", e.date); set("ev-time", e.startTime); set("ev-deadline", e.deadline); set("ev-status", e.status);
  set("ev-venue", e.venue); set("ev-area", e.venueArea); set("ev-map", e.mapUrl);
  set("ev-reg", e.registrationUrl); set("ev-start", e.startListUrl); set("ev-live", e.liveResultsUrl);
  set("ev-lap", fmtNum(e.lapKm)); set("ev-climb", e.climbPerLap); set("ev-water", e.waterPerLap);
  set("ev-cold", (e.coldLimit < 0 ? "−" : "") + Math.abs(e.coldLimit)); set("ev-email", e.email);
  dists.reset(e.distances);
  E.kit.snapshot();
  openDialog(E.dlg);
  (document.getElementById(focusId) || E.kit.firstField()).focus();
}

async function onEventSubmit(ev) {
  ev.preventDefault();
  if (savingEvent) return;
  const K = E.kit, errs = [], err = (id, msg) => K.error($("#" + id), msg, errs);
  K.clear();
  const date = val("ev-date"), startTime = val("ev-time"), deadline = val("ev-deadline");
  if (!isDate(date)) err("ev-date", "Välj tävlingsdag.");
  if (!TIME.test(startTime)) err("ev-time", "Skriv starttiden som TT:MM, till exempel 10:00.");
  if (deadline && !isDate(deadline)) err("ev-deadline", "Välj ett datum eller lämna fältet tomt.");
  else if (deadline && isDate(date) && deadline > date) err("ev-deadline", "Sista anmälningsdag måste vara före tävlingsdagen.");
  const venue = val("ev-venue");
  if (!venue) err("ev-venue", "Skriv arenan, till exempel Ormbergsstadion.");
  const urls = {};
  for (const [id, key] of [["ev-map", "mapUrl"], ["ev-reg", "registrationUrl"], ["ev-start", "startListUrl"], ["ev-live", "liveResultsUrl"]]) {
    urls[key] = val(id);
    if (urls[key] && !HTTPS.test(urls[key])) err(id, "Adressen måste börja med https://");
  }
  const distances = dists.rows().map((row, i) => {
    const n = (key) => $(`input[id^="d${key}-"]`, row);
    const pre = `Distans ${i + 1}: `;
    const d = { km: num(n("km").value), laps: int(n("laps").value), classes: n("cls").value.trim(), fee: int(n("fee").value), lateFee: int(n("late").value), note: n("note").value.trim() };
    if (!within(d.km, 0.1, 100)) K.error(n("km"), pre + "skriv distansen i km, till exempel 42 eller 10,5.", errs);
    if (!within(d.laps, 1, LIMITS.laps)) K.error(n("laps"), pre + `antal varv ska vara 1–${LIMITS.laps}.`, errs);
    if (!d.classes) K.error(n("cls"), pre + "skriv klasserna, till exempel HD42 eller Motion.", errs);
    if (!within(d.fee, 0, LIMITS.fee)) K.error(n("fee"), pre + "skriv avgiften i hela kronor.", errs);
    if (!within(d.lateFee, 0, LIMITS.fee)) K.error(n("late"), pre + "skriv efteranmälningsavgiften i hela kronor.", errs);
    return d;
  });
  const lapKm = num(val("ev-lap")), climbPerLap = int(val("ev-climb")), waterPerLap = int(val("ev-water")), coldLimit = int(val("ev-cold"));
  if (!within(lapKm, 0.1, 50)) err("ev-lap", "Skriv slingans längd i km, till exempel 10,5.");
  if (!within(climbPerLap, 0, 2000)) err("ev-climb", "Skriv höjdmetrarna som ett heltal.");
  if (!within(waterPerLap, 0, 10)) err("ev-water", "Skriv antalet vätskekontroller som ett heltal, 0–10.");
  if (!within(coldLimit, -50, 0)) err("ev-cold", "Köldgränsen ska vara 0 eller minusgrader, till exempel −20.");
  const email = val("ev-email");
  if (!EMAIL.test(email)) err("ev-email", "Skriv en giltig e-postadress.");
  if (errs.length) { K.show(errs); return; }

  const event = { date, startTime, deadline, status: $("#ev-status").value, venue, venueArea: val("ev-area"), ...urls, email, lapKm, climbPerLap, waterPerLap, coldLimit, distances };
  savingEvent = true; busy(E.save, true, "Sparar…");
  try {
    await save({ event });
    closeDialog(E.dlg);
    toast("Årets lopp är sparat");
  } catch (e) {
    K.show([{ msg: writeErr(e, "Årets lopp") }]);
  } finally {
    savingEvent = false; busy(E.save, false);
  }
}

/* ---------- Resultatarkivet ---------- */
let Y = null, winners = null, ylinks = null, editingYear = null, savingYear = false;

const winRow = (w = {}, n) => el("div", { class: "link-row" },
  field({ id: "w-cls-" + n, label: "Klass", value: w.class || "", maxlength: String(LIMITS.classes), placeholder: "H42" }),
  field({ id: "w-names-" + n, label: "Namn", value: w.names || "", maxlength: String(LIMITS.note) }),
  el("button", { class: "icon-btn", type: "button", "aria-label": "Ta bort segrare", "data-remove-row": "" }, "×"));

function buildYearDialog() {
  Y = makeDialog("year-dialog", "Lägg till år");
  const addWin = el("button", { class: "btn btn-quiet btn-sm add-row", type: "button", text: "+ Lägg till segrare" });
  const addLink = el("button", { class: "btn btn-quiet btn-sm add-row", type: "button", text: "+ Lägg till länk" });
  const winList = el("div", { class: "link-rows", id: "yr-winners" }), linkList = el("div", { class: "link-rows", id: "yr-links" });
  Y.body.append(
    grid("row2",
      field({ id: "yr-year", label: "År", inputmode: "numeric", maxlength: "4", hint: "Fyra siffror, till exempel 2027." }),
      selectField({ id: "yr-status", label: "Status", options: [["held", "Loppet kördes"], ["cancelled", "Ingen tävling (inställt eller paus)"]] })),
    field({ id: "yr-date", label: "Datum", type: "date", hint: "Visas under årtalet. Lämna tomt om det är okänt." }),
    field({ id: "yr-text", label: "Text", textarea: true, cls: "short", maxlength: String(LIMITS.text), hint: "Kort text under årtalet. Till exempel Även Kalvrajden för HD10–16, eller varför loppet ställdes in." }),
    group("Segrare", el("span", { class: "hint", text: "Klass som H42, D42, H21 eller D21, och bara segraren. Visas under året och i rutan Segrare i arkivet." }), winList, addWin),
    group("Länkar", el("span", { class: "hint", text: "Resultat, liveresultat, startlista, bilder och pressklipp. Adressen ska börja med https:// (äldre länkar får börja med http://)." }), linkList, addLink),
    group("Inbjudan", el("span", { class: "hint", text: "Visas under Tidigare inbjudningar. Lämna tomt om den inte finns." }),
      grid("row2",
        field({ id: "yr-inv-label", label: "Länktext", maxlength: String(LIMITS.label), placeholder: "Inbjudan 2027" }),
        field({ id: "yr-inv-url", label: "Adress", type: "url", inputmode: "url", placeholder: "https://" }))),
  );
  winners = repeater(winList, addWin, { build: winRow, max: LIMITS.winners });
  ylinks = repeater(linkList, addLink, { build: (v, n) => linkRow(v, n), max: LIMITS.links });
  Y.form.addEventListener("submit", onYearSubmit);
}

/** y = befintligt år att redigera, eller null. prefill = förslag för ett nytt år. */
function openYear(y, prefill) {
  editingYear = y || null;
  const v = y || { year: "", status: "held", date: "", text: "", winners: [], links: [], invitation: null, ...prefill };
  Y.kit.clear();
  $("#year-dialog-h").textContent = y ? `Redigera ${y.year}` : prefill ? `Resultat för ${prefill.year}` : "Lägg till år";
  const yr = $("#yr-year");
  yr.value = v.year; yr.readOnly = !!y;
  $("#yr-year-hint").textContent = y ? "Årtalet går inte att ändra. Är det fel: ta bort året och lägg till det på nytt." : "Fyra siffror, till exempel 2027.";
  $("#yr-status").value = v.status; $("#yr-date").value = v.date; $("#yr-text").value = v.text;
  $("#yr-inv-label").value = v.invitation?.label || ""; $("#yr-inv-url").value = v.invitation?.url || "";
  winners.reset(v.winners);
  ylinks.reset(v.links.length ? v.links : [{}]);
  Y.kit.snapshot();
  openDialog(Y.dlg, y ? `[data-year-edit="${y.year}"]` : null);
  Y.kit.firstField().focus();
}

async function onYearSubmit(ev) {
  ev.preventDefault();
  if (savingYear) return;
  const K = Y.kit, errs = [], err = (id, msg) => K.error($("#" + id), msg, errs);
  K.clear();
  const yearStr = val("yr-year"), year = Number(yearStr);
  if (!/^\d{4}$/.test(yearStr) || !within(year, MIN_YEAR, MAX_YEAR)) err("yr-year", "Skriv årtalet med fyra siffror, till exempel 2027.");
  else if (!editingYear && getContent().years.some((y) => y.year === year)) err("yr-year", `${year} finns redan i arkivet. Redigera det i listan i stället.`);
  const date = val("yr-date");
  if (date && !isDate(date)) err("yr-date", "Välj ett datum eller lämna fältet tomt.");
  const win = [];
  winners.rows().forEach((row) => {
    const [c, n] = $$("input", row);
    if (!c.value.trim() && !n.value.trim()) return;
    if (!n.value.trim()) { K.error(n, "Skriv namnen, eller ta bort raden.", errs); return; }
    win.push({ class: c.value.trim(), names: n.value.trim() });
  });
  const { links } = readLinks($("#yr-links"), K, errs, WEB, "Adressen måste börja med https:// eller http://");
  const invLabel = val("yr-inv-label"), invUrl = val("yr-inv-url");
  let invitation = null;
  if (invUrl && !WEB.test(invUrl)) err("yr-inv-url", "Adressen till inbjudan måste börja med https:// eller http://");
  else if (invLabel && !invUrl) err("yr-inv-url", "Skriv adressen till inbjudan, eller töm länktexten.");
  else if (invUrl) invitation = { label: invLabel || `Inbjudan ${yearStr}`, url: invUrl };
  if (errs.length) { K.show(errs); return; }

  const y = { year, status: $("#yr-status").value, date, text: val("yr-text").slice(0, LIMITS.text), winners: win, links, invitation };
  savingYear = true; busy(Y.save, true, "Sparar…");
  try {
    await save({ year: y });
    closeDialog(Y.dlg, { target: $(`[data-year-edit="${year}"]`) });
    toast(editingYear ? `Ändringarna i ${year} är sparade` : `${year} är sparat i resultatarkivet`);
  } catch (e) {
    K.show([{ msg: writeErr(e, "Året") }]);
  } finally {
    savingYear = false; busy(Y.save, false);
  }
}

function askDeleteYear(y) {
  confirmDelete({
    title: `Ta bort ${y.year} ur resultatarkivet?`,
    desc: "Året och dess länkar försvinner för alla besökare. Du kan ångra direkt efteråt.",
    run: async () => {
      try {
        await save({ removeYear: y.year });
        closeDialog($("#confirm-dialog"), { skipReturn: true });
        toast(`${y.year} är borttaget ur resultatarkivet`, {
          label: "Ångra",
          returnTo: "#res-h",
          run: async () => {
            try { await save({ year: y }); focusEl($(`[data-year-edit="${y.year}"]`)); toast(`${y.year} är återställt`); }
            catch (e) { toast(writeErr(e, "Året")); }
          },
        });
        requestAnimationFrame(() => $("#toast-action").focus());
      } catch (e) {
        closeDialog($("#confirm-dialog"));
        toast(writeErr(e, "Året"));
      }
    },
  });
}

/* ---------- Partners ---------- */
let P = null, plist = null, savingPartners = false;

// Adress utan https:// (till exempel umara.se) får https:// framför.
const withScheme = (u) => (u && !/^[a-z][a-z\d+.-]*:/i.test(u) && /^[^\s/]+\.[^\s/]+/.test(u) ? "https://" + u : u);

function partnerRow(p = {}, n) {
  const f = (key, label, value, attrs = {}) => field({ id: `p${key}-${n}`, label, value: value ?? "", ...attrs });
  const btn = (text, attrs) => el("button", { class: "btn btn-quiet btn-sm", type: "button", ...attrs, text });
  return el("fieldset", { class: "sub-row" }, el("legend", { text: "Partner" }),
    grid("row2",
      f("name", "Namn", p.name, { maxlength: String(LIMITS.short) }),
      f("text", "Text under namnet", p.text, { maxlength: String(LIMITS.short), placeholder: "Priser" })),
    f("url", "Webbplats", p.url, { type: "url", inputmode: "url", placeholder: "https://", hint: "Frivillig. Med adress blir kortet en länk till partnerns webbplats." }),
    el("div", { class: "row-btns" },
      btn("Flytta upp", { "data-move": "up" }),
      btn("Flytta ner", { "data-move": "down" }),
      btn("Ta bort partnern", { "data-remove-row": "" })));
}

function buildPartnersDialog() {
  P = makeDialog("partners-dialog", "Partners");
  const add = el("button", { class: "btn btn-quiet btn-sm add-row", type: "button", text: "+ Lägg till partner" });
  const list = el("div", { class: "sub-rows", id: "pa-list" });
  const live = el("p", { class: "sr-only", "aria-live": "polite", id: "pa-live" });
  const label = (r, i) => $("input[id^='pname-']", r).value.trim() || "Partner " + (i + 1);
  P.body.append(
    el("p", { class: "note", text: `Partnerna visas under Partners på startsidan, i den ordning de står här. Ändringarna syns direkt. Högst ${LIMITS.partners} partners.` }),
    group("Årets partners", list, add),
    group("Tidigare år",
      field({ id: "pa-former", label: "Tidigare partners", textarea: true, cls: "short", maxlength: String(LIMITS.former),
        hint: "Ett namn per rad. Visas som en rad under partnerna: Tidigare år: A, B och C. Lämna tomt för att dölja raden." })),
    live,
  );
  plist = repeater(list, add, {
    build: partnerRow, max: LIMITS.partners,
    onChange: (rows) => rows.forEach((r, i) => {
      $("legend", r).textContent = "Partner " + (i + 1);
      $("[data-move='up']", r).setAttribute("aria-label", `Flytta upp partner ${i + 1}`);
      $("[data-move='down']", r).setAttribute("aria-label", `Flytta ner partner ${i + 1}`);
      $("[data-remove-row]", r).setAttribute("aria-label", `Ta bort partner ${i + 1}`);
    }),
    onMove: (row, rows) => { live.textContent = `${label(row, rows.indexOf(row))} är nu nummer ${rows.indexOf(row) + 1} av ${rows.length}.`; },
  });
  P.form.addEventListener("submit", onPartnersSubmit);
}

function openPartners() {
  const { partners, former } = getContent().partners;
  P.kit.clear();
  $("#pa-live").textContent = "";
  plist.reset(partners.length ? partners : [{}]);
  $("#pa-former").value = former;
  P.kit.snapshot();
  openDialog(P.dlg);
  P.kit.firstField().focus();
}

async function onPartnersSubmit(ev) {
  ev.preventDefault();
  if (savingPartners) return;
  const K = P.kit, errs = [];
  K.clear();
  const partners = [];
  plist.rows().forEach((row, i) => {
    const n = (key) => $(`input[id^="p${key}-"]`, row), pre = `Partner ${i + 1}: `;
    const name = n("name").value.trim(), text = n("text").value.trim(), url = withScheme(n("url").value.trim());
    if (!name && !text && !url) return; // tom rad
    if (!name) K.error(n("name"), pre + "skriv namnet, eller ta bort raden.", errs);
    if (url && (!HTTPS.test(url) || url.length > LIMITS.url)) K.error(n("url"), pre + "adressen måste börja med https://", errs);
    n("url").value = url;
    partners.push({ name: name.slice(0, LIMITS.short), text: text.slice(0, LIMITS.short), url });
  });
  // En namn per rad. Kommatecken går också, men sparas som nya rader.
  const former = formerNames($("#pa-former").value).join("\n");
  if (former.length > LIMITS.former) K.error($("#pa-former"), `Tidigare partners får vara högst ${LIMITS.former} tecken.`, errs);
  if (errs.length) { K.show(errs); return; }

  savingPartners = true; busy(P.save, true, "Sparar…");
  try {
    await savePartners({ partners, former });
    closeDialog(P.dlg);
    toast("Partnerna är sparade");
  } catch (e) {
    K.show([{ msg: writeErr(e, "Partnerna") }]);
  } finally {
    savingPartners = false; busy(P.save, false);
  }
}

/* ---------- Knappar i resultatarkivet ---------- */
// Knapparna läggs bara till där de saknas, så att fokus inte tappas när innehållet hämtas om.
function decorateYears() {
  if (!user) { $$("#years .year-admin").forEach((n) => n.remove()); return; }
  const btn = (text, attrs) => el("button", { class: "btn btn-quiet btn-sm", type: "button", ...attrs, text });
  $$("#years > li").forEach((li) => {
    if ($(".year-admin", li)) return;
    const y = li.dataset.year, next = li.dataset.nextYear;
    const box = el("div", { class: "year-admin" });
    if (y) box.append(btn("Redigera", { "data-year-edit": y, "aria-label": "Redigera " + y }), btn("Ta bort", { "data-year-delete": y, "aria-label": "Ta bort " + y }));
    else if (next) box.append(btn("Lägg in resultat", { "data-year-new": next, "aria-label": "Lägg in resultat för " + next }));
    $(".year-body", li).append(box);
  });
}

/* ---------- Start ---------- */
export function initCms(api) {
  ({ db, fs } = api);
  buildEventDialog();
  buildYearDialog();
  buildPartnersDialog();
  onContent(decorateYears);
  document.addEventListener("click", (e) => {
    if (!user) return;
    const t = e.target.closest("[data-action='edit-event'], [data-action='new-year'], [data-action='edit-partners'], [data-year-new], [data-year-edit], [data-year-delete]");
    if (!t) return;
    const find = (y) => getContent().years.find((x) => x.year === Number(y));
    if (t.dataset.action === "edit-event") openEvent(t.dataset.focus);
    else if (t.dataset.action === "new-year") openYear(null);
    else if (t.dataset.action === "edit-partners") openPartners();
    else if (t.dataset.yearNew) {
      const ev = getContent().event;
      const links = [["Startlista", ev.startListUrl], ["Liveresultat", ev.liveResultsUrl]].filter(([, u]) => u).map(([label, url]) => ({ label, url }));
      openYear(null, { year: Number(t.dataset.yearNew), date: ev.date, links });
    } else if (t.dataset.yearEdit) { const y = find(t.dataset.yearEdit); if (y) openYear(y); }
    else if (t.dataset.yearDelete) { const y = find(t.dataset.yearDelete); if (y) askDeleteYear(y); }
  });
}

/** Anropas av admin.js när någon loggar in eller ut. */
export function setCmsAdmin(u) {
  user = u;
  decorateYears();
}
