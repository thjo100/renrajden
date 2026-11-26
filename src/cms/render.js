// Rendering av årets lopp och resultatarkivet till HTML-text.
//
// Sidorna har tomma platser: <dl data-cms="facts"></dl> och, i <head>, {{cms:title}}.
// Vid bygget fyller fillHtml() platserna (scripts/vite-cms.mjs). I webbläsaren ritar
// src/cms/runtime.js om de platser vars HTML har ändrats när färskt innehåll hämtats.
// Allt som kommer från data passerar esc(), och länkar kontrolleras mot HTTPS/WEB.
import { cap, fmtDate, fmtKr, fmtNum, fmtTemp, joinList, numWord, yearOf, HTTPS, WEB } from "./model.js";

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const NEW_TAB = " (öppnas i ny flik)";
const ext = (url, label, sr = NEW_TAB, cls = "ext") =>
  `<a${cls ? ` class="${cls}"` : ""} href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}<span class="sr-only">${esc(sr)}</span></a>`;

/* ---------- Hjälpare för årets lopp ---------- */
const year = (e) => yearOf(e.date);
const longDate = (e) => cap(fmtDate(e.date, { weekday: true }));         // Lördag 30 januari 2027
const dayMonth = (e) => fmtDate(e.date, { weekday: true, year: false }); // lördag 30 januari
const kms = (e) => e.distances.map((d) => fmtNum(d.km));
const longest = (e) => e.distances.reduce((a, d) => (d.km > a.km ? d : a), e.distances[0]);
const waterText = (n) => (n === 0 ? "inga vätskekontroller" : numWord(n, "en") + (n === 1 ? " vätskekontroll" : " vätskekontroller"));
const cancelled = (e) => e.status === "cancelled";

/** Texten som läses upp när någon väljer distans. Används också av src/site.js. */
export function distanceSummary(e, d) {
  return `${fmtNum(d.km)} km: ${d.laps} varv, cirka ${d.laps * e.climbPerLap} höjdmeter och ${d.laps * e.waterPerLap} vätskekontroller.${d.note ? " " + d.note : ""}`;
}

/* ---------- Platser på startsidan ---------- */
function facts(e) {
  const map = e.mapUrl ? ` · ${ext(e.mapUrl, "Hitta hit", " (karta, öppnas i ny flik)")}` : "";
  const lapWords = e.distances.map((d) => numWord(d.laps));
  return [
    `<div class="fact"><dt>Datum</dt><dd>${esc(fmtDate(e.date))}<small>${esc(cap(fmtDate(e.date, { weekday: true }).split(" ")[0]))} · <a href="/inbjudan">Inbjudan ${year(e)}</a></small></dd></div>`,
    `<div class="fact"><dt>Start</dt><dd>Kl ${esc(e.startTime)}<small>Alla distanser</small></dd></div>`,
    `<div class="fact"><dt>Plats</dt><dd>${esc(e.venue)}<small>${esc(e.venueArea)}${map}</small></dd></div>`,
    `<div class="fact"><dt>Stil</dt><dd>Klassisk<small>Dubbelspår, stilkontroll längs banan</small></dd></div>`,
    `<div class="fact"><dt>Distanser</dt><dd>${esc(kms(e).join(" · "))} km<small>${esc(cap(joinList(lapWords, "eller")))} varv på samma slinga</small></dd></div>`,
    `<div class="fact"><dt>Seedning</dt><dd>Vasaloppet<small>Seedningsgrundande lopp</small></dd></div>`,
  ].join("");
}

function dist(e) {
  const first = e.distances[0];
  const maxLaps = Math.max(...e.distances.map((d) => d.laps));
  const lapWords = [...new Set(e.distances.map((d) => d.laps))].sort((a, b) => a - b).map((n) => numWord(n));
  const seg = e.distances.map((d, i) =>
    `<input type="radio" name="dist" id="d${i}" value="${i}"${i === 0 ? " checked" : ""}><label for="d${i}"><b>${esc(fmtNum(d.km))}</b><span>km · ${esc(d.classes)}</span></label>`).join("");
  const laps = Array.from({ length: maxLaps }, (_, i) =>
    `<div class="lap${i < first.laps ? " on" : ""}"><div class="lap-track"></div><span>Varv ${i + 1}</span></div>`).join("");
  return `<fieldset><legend>Välj distans</legend><div class="seg">${seg}</div>`
    + `<p class="note dist-note">Banan är en slinga på ca ${esc(fmtNum(e.lapKm))} km som åks ${esc(joinList(lapWords, "eller"))} varv. Du passerar stadion efter varje varv.</p></fieldset>`
    + `<div><div class="laps" aria-hidden="true">${laps}</div>`
    + `<dl class="dist-stats" id="dist-stats"><div><dt>Varv</dt><dd id="ds-laps">${first.laps}</dd></div>`
    + `<div><dt>Höjdmeter</dt><dd id="ds-hm">ca ${first.laps * e.climbPerLap}</dd></div>`
    + `<div><dt>Vätskekontroller</dt><dd id="ds-water">${first.laps * e.waterPerLap}</dd></div></dl>`
    + `<p class="note dist-note" id="ds-prize">${esc(first.note)}</p><p class="sr-only" id="dist-live" aria-live="polite"></p></div>`;
}

function deadline(e) {
  if (cancelled(e)) return `Renrajden ${year(e)} är inställt. Läs mer under Nyheter.`;
  if (!e.deadline) return "Sista anmälningsdag publiceras här när anmälan öppnar.";
  return `Sista anmälningsdag är ${esc(fmtDate(e.deadline, { weekday: true }))}. Därefter gäller efteranmälan.`;
}

// Swish-länk med OK Renens nummer, beloppet och "RR - " ifyllt. Meddelandet går att ändra, beloppet inte.
export const SWISH_NUMBER = "1230489575";
export const swishUrl = (amount) =>
  `https://app.swish.nu/1/p/sw/?sw=${SWISH_NUMBER}&amt=${encodeURIComponent(amount)}&cur=SEK&msg=RR%20-%20&edit=msg&src=qr`;

// Efteranmälningsavgiften länkar till Swish. Med mus: till Swish-rutan (QR-koden).
// Med pekskärm: direkt till Swish-appen med beloppet ifyllt. CSS visar den ena av de två länkarna.
const lateFee = (d) => {
  const label = `Efteranmälan ${esc(fmtKr(d.lateFee))}`;
  return `<a class="late-fee late-fee-scan" href="#swish">${label}<span class="sr-only">, så betalar du med Swish</span></a>`
    + `<a class="late-fee late-fee-tap" href="${esc(swishUrl(d.lateFee))}">${label}<span class="sr-only">, öppna Swish</span></a>`;
};

const fees = (e) => e.distances.map((d) =>
  `<div><dt>${esc(fmtNum(d.km))} km</dt><dd>${esc(fmtKr(d.fee))}<small>${lateFee(d)}</small></dd></div>`).join("")
  + `<div><dt>Inbjudan</dt><dd><a href="/inbjudan"><span class="sr-only">Inbjudan </span>${year(e)}</a><small>Går att skriva ut</small></dd></div>`;

// Efteranmälningsavgifterna i Swish-rutan, så att man ser vad man ska swisha.
// Med pekskärm är varje avgift en knapp som öppnar Swish med beloppet ifyllt.
const swishFees = (e) => e.distances.map((d) => {
  const fee = `<span>${esc(fmtNum(d.km))} km</span> <b>${esc(fmtKr(d.lateFee))}</b>`;
  return `<li><span class="swish-fee swish-fee-scan">${fee}</span>`
    + `<a class="swish-fee swish-fee-tap" href="${esc(swishUrl(d.lateFee))}">${fee}<i aria-hidden="true">Swisha</i><span class="sr-only">, öppna Swish</span></a></li>`;
}).join("");

// Utan direktlänk till tävlingen länkar vi till inloggningen i SSF TA, där man söker fram tävlingen.
export const SSFTA_LOGIN = "https://ssfta.skidor.com/logga-in";
const registration = (e) => (e.registrationUrl
  ? `<p>${ext(e.registrationUrl, "Anmäl dig i SSF TA", NEW_TAB, "btn btn-primary btn-sm ext")}</p>`
  : `<p>${ext(SSFTA_LOGIN, "Logga in i SSF TA", NEW_TAB, "btn btn-primary btn-sm ext")}</p>`
    + `<p class="note">Sök fram Renrajden ${year(e)} när du har loggat in.</p>`);

const banaStats = (e) => {
  const l = longest(e);
  return `<div><dt>Slinga</dt><dd>~${esc(fmtNum(e.lapKm))} km</dd></div><div><dt>Höjd/varv</dt><dd>~${e.climbPerLap} m</dd></div>`
    + `<div><dt>Varv, ${esc(fmtNum(l.km))} km</dt><dd>${l.laps}</dd></div>`;
};

const cold = (e) => `<b>${fmtTemp(e.coldLimit)} °C</b><p class="note">Köldgräns: under ${fmtTemp(e.coldLimit)} °C på banans kallaste punkt får tävlingen inte genomföras. 2014 ställdes Renrajden in på grund av kyla.</p>`;

/* ---------- Resultatarkivet ---------- */
function resultsEyebrow({ years }) {
  const held = years.filter((y) => y.status === "held").map((y) => y.year);
  const none = years.filter((y) => y.status === "cancelled").length;
  const parts = [held.length ? `Resultat sedan ${Math.min(...held)}` : "Resultat"];
  if (none) parts.push(`${numWord(none)} år utan tävling`);
  return esc(parts.join(" · "));
}

const yearLinks = (links, y) => (links.length
  ? `<ul class="year-links">${links.map((l) => `<li>${ext(l.url, l.label, ` ${y}${NEW_TAB}`)}</li>`).join("")}</ul>`
  : "");

function yearItem(y) {
  const no = y.status === "cancelled";
  const body = [
    y.date ? `<p>${esc(fmtDate(y.date))}</p>` : "",
    y.text ? `<p>${esc(y.text)}</p>` : "",
    ...y.winners.map((w) => `<p class="winners">Segrare${w.class ? " " + esc(w.class) : ""}: ${esc(w.names)}</p>`),
    yearLinks(y.links.filter((l) => WEB.test(l.url)), y.year),
  ].join("");
  return `<li class="year${no ? " cancelled" : ""}" data-year="${y.year}"><span class="year-num">${y.year}${no ? '<span class="sr-only"> (ingen tävling)</span>' : ""}</span><div class="year-body">${body}</div></li>`;
}

/** Årets lopp visas överst i arkivet tills resultatet för året har lagts in. */
function nextYearItem(e) {
  const y = year(e);
  const text = cancelled(e) ? `Inställt. Loppet var planerat till ${dayMonth(e)}.` : `${cap(dayMonth(e))}. Resultaten publiceras här samma dag.`;
  const links = [["Startlista", e.startListUrl], ["Liveresultat", e.liveResultsUrl]].filter(([, u]) => u).map(([label, url]) => ({ label, url }));
  return `<li class="year next-year" data-next-year="${y}"><span class="year-num">${y}</span><div class="year-body"><p>${esc(text)}</p>${yearLinks(links, y)}</div></li>`;
}

function years(c) {
  const hasCurrent = c.years.some((y) => y.year === year(c.event));
  return (hasCurrent ? "" : nextYearItem(c.event)) + c.years.map(yearItem).join("");
}

function historySide(c) {
  const winners = c.years.flatMap((y) => y.winners.map((w) => `<li><b>${y.year}${w.class ? ", " + esc(w.class) : ""}:</b> ${esc(w.names)}</li>`));
  const inv = c.years.filter((y) => y.invitation && WEB.test(y.invitation.url))
    .map((y) => `<li>${ext(y.invitation.url, y.invitation.label, NEW_TAB, "")}</li>`);
  return (winners.length ? `<section class="side-box"><h3>Segrare i arkivet</h3><ul>${winners.join("")}</ul></section>` : "")
    + (inv.length ? `<section class="side-box"><h3>Tidigare inbjudningar</h3><ul class="inv-list">${inv.join("")}</ul></section>` : "");
}

/* ---------- Platser i inbjudan ---------- */
const invFacts = (e) => `<div><dt>Start</dt><dd>${esc(e.startTime)}<small>Alla distanser</small></dd></div>`
  + `<div><dt>Plats</dt><dd>${esc(e.venue)}<small>${esc(e.venueArea)}</small></dd></div>`
  + `<div><dt>Stil</dt><dd>Klassisk<small>Dubbelspår, stilkontroll</small></dd></div>`
  + `<div><dt>Bana</dt><dd>${esc(fmtNum(e.lapKm))} km<small>Slinga, ca ${e.climbPerLap} höjdmeter</small></dd></div>`;

const invFees = (e) => e.distances.map((d) =>
  `<tr><th scope="row"><b>${esc(fmtNum(d.km))} km</b> <span>${d.laps} varv</span></th><td>${esc(d.classes)}</td>`
  + `<td class="num price">${esc(fmtKr(d.fee))}</td><td class="num price late">${esc(fmtKr(d.lateFee))}</td></tr>`).join("");

const invKnow = (e) => `<li>Stavar max 83 % av kroppslängden.</li><li>${esc(cap(waterText(e.waterPerLap)))} per varv.</li>`
  + `<li>Prisutdelning direkt efter målgång och lottade priser på startnummer.</li><li>Köldgräns ${fmtTemp(e.coldLimit)} °C på banans kallaste punkt.</li>`;

const dateTime = (e) => `<time datetime="${e.date}">${esc(longDate(e))}</time>${cancelled(e) ? " · Inställt" : ""}`;

/**
 * HTML för varje plats (data-cms="namn"). En plats som inte finns på en sida ignoreras.
 * @param {ReturnType<import("./model.js").cleanContent>} c
 */
export function renderSlots(c) {
  const e = c.event, mail = esc(e.email);
  return {
    "title-text": `Renrajden ${year(e)}`,
    year: String(year(e)),
    "hero-date": dateTime(e),
    "bib-head": `Renrajden · ${year(e)}`,
    "bib-foot": `${esc(cap(dayMonth(e)))} · ${esc(e.venue)}`,
    facts: facts(e),
    dist: dist(e),
    "anm-eyebrow": `Anmälan ${year(e)}`,
    deadline: deadline(e),
    fees: fees(e),
    registration: registration(e),
    "swish-fees": swishFees(e),
    mail: `<a class="mail" href="mailto:${mail}">${mail}</a>`,
    "footer-mail": `<a class="mono" href="mailto:${mail}">${mail}</a>`,
    "bana-intro": `En flack slinga med cirka ${e.climbPerLap} höjdmeter per varv. Start och mål på ${esc(e.venue)}.`,
    "bana-stats": banaStats(e),
    "bana-text": `Banan är dubbelspårad och markerad hela vägen. ${esc(cap(waterText(e.waterPerLap)))} per varv, med skräpzoner direkt efter.`,
    cold: cold(e),
    "results-eyebrow": resultsEyebrow(c),
    years: years(c),
    "history-side": historySide(c),
    "inv-date": dateTime(e),
    "inv-facts": invFacts(e),
    "inv-fees": invFees(e),
    "inv-deadline": e.deadline ? `Senast <b>${esc(fmtDate(e.deadline, { weekday: true }))}</b>.` : "Sista anmälningsdagen publiceras på renrajden.se.",
    "inv-know": invKnow(e),
    "inv-mail": `<span>Frågor</span> <a href="mailto:${mail}">${mail}</a>`,
  };
}

/** Texter i <head> och den inbäddade datan. Värdena är oescapade, fillHtml() escapar dem. */
export function renderHead(c) {
  const e = c.event, y = year(e), distances = joinList(kms(e)) + " km";
  const ld = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `Renrajden ${y}`,
    description: "Seedningsgrundande klassiskt långlopp inför Vasaloppet.",
    sport: "Längdskidåkning",
    startDate: e.date,
    eventStatus: cancelled(e) ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: e.venue, address: { "@type": "PostalAddress", addressLocality: "Luleå", addressCountry: "SE" } },
    organizer: { "@type": "SportsOrganization", name: "OK Renen", url: "https://www.okrenen.se/" },
    url: "https://renrajden.se/",
  };
  return {
    title: `Renrajden ${y} – klassiskt långlopp på ${e.venueArea || "Ormberget, Luleå"}`,
    description: `Renrajden ${fmtDate(e.date, { weekday: true })}${cancelled(e) ? " är inställt" : ""}: OK Renens klassiska långlopp på Ormberget i Luleå, seedningsgrundande för Vasaloppet. ${distances}.`,
    "og-title": `Renrajden ${y} – ${dayMonth(e)} på Ormberget`,
    jsonld: ld,
    "inv-title": `Inbjudan Renrajden ${y}`,
    "inv-description": `Inbjudan till Renrajden ${fmtDate(e.date, { weekday: true })} på Ormberget i Luleå. Distanser, avgifter och anmälan.`,
    "inv-og-title": `Inbjudan Renrajden ${y} – ${dayMonth(e)} på Ormberget`,
    "inv-og-description": `${distances} klassiskt. Seedningsgrundande för Vasaloppet. Arrangör: OK Renen, Luleå.`,
    data: { source: c.source, event: e, years: c.years },
  };
}

// JSON i <script> får inte innehålla "</script>".
export const jsonInScript = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

/**
 * Fyller platserna i en HTML-sida. Kastar fel för okända eller icke-tomma platser,
 * så att ett stavfel i index.html stoppar bygget i stället för att ge en tom ruta.
 */
export function fillHtml(html, c) {
  const slots = renderSlots(c), head = renderHead(c);
  const out = html.replace(/\{\{cms:([\w-]+)\}\}/g, (_, k) => {
    if (!(k in head)) throw new Error(`Okänd plats {{cms:${k}}}`);
    return typeof head[k] === "string" ? esc(head[k]) : jsonInScript(head[k]);
  });
  let filled = 0;
  const result = out.replace(/(<([a-zA-Z][\w-]*)\b[^>]*?\sdata-cms="([\w-]+)"[^>]*>)(<\/\2>)/g, (_, open, _tag, name, close) => {
    if (!(name in slots)) throw new Error(`Okänd plats data-cms="${name}"`);
    filled++;
    return open + slots[name] + close;
  });
  const total = (html.match(/\sdata-cms="/g) || []).length;
  if (filled !== total) throw new Error(`${total - filled} plats(er) med data-cms är inte tomma i källfilen. Platserna ska vara tomma, innehållet kommer från src/cms/.`);
  return result;
}
