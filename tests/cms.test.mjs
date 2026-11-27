// Enhetstester för årets lopp och resultatarkivet: rensning, formatering och rendering.
// Körs med: npm run test:unit   (ingen emulator behövs)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanContent, cleanEvent, cleanYear, fmtDate, fmtKr, fmtNum, fmtTemp, joinList, numWord, isDate } from "../src/cms/model.js";
import { fillHtml, renderSlots, renderHead, SSFTA_LOGIN, winDist, winSex } from "../src/cms/render.js";
import { fromRest } from "../scripts/vite-cms.mjs";
import { DEFAULT_EVENT, DEFAULT_YEARS } from "../src/cms/defaults.js";

const defaults = () => cleanContent(null);
const withEvent = (over) => cleanContent({ source: "db", event: { ...DEFAULT_EVENT, ...over }, years: DEFAULT_YEARS });

test("svensk formatering", () => {
  assert.equal(fmtDate("2027-01-30"), "30 januari 2027");
  assert.equal(fmtDate("2027-01-30", { weekday: true }), "lördag 30 januari 2027");
  assert.equal(fmtDate("2027-01-24", { weekday: true, year: false }), "söndag 24 januari");
  assert.equal(fmtDate("2027-02-30"), "");
  assert.equal(isDate("2028-02-29"), true);
  assert.equal(isDate("2027-02-29"), false);
  assert.equal(fmtNum(10.5), "10,5");
  assert.equal(fmtKr(1500), "1 500 kr");
  assert.equal(fmtTemp(-20), "−20");
  assert.equal(numWord(1), "ett");
  assert.equal(numWord(1, "en"), "en");
  assert.equal(numWord(4), "fyra");
  assert.equal(numWord(14), "14");
  assert.equal(joinList(["ett", "två", "fyra"], "eller"), "ett, två eller fyra");
  assert.equal(joinList(["42"]), "42");
});

test("standardinnehållet fyller alla platser i båda sidorna", () => {
  for (const file of ["index.html", "inbjudan.html"]) {
    const html = fillHtml(readFileSync(file, "utf8"), defaults());
    assert.doesNotMatch(html, /\{\{cms:/, file);
    for (const m of html.matchAll(/<([a-z]+)\b[^>]*\sdata-cms="([\w-]+)"[^>]*>(<\/\1>)?/g)) assert.equal(m[3], undefined, `${file}: platsen ${m[2]} är tom`);
  }
  const index = fillHtml(readFileSync("index.html", "utf8"), defaults());
  assert.match(index, /<title>Renrajden 2027 – klassiskt långlopp på Ormberget, Luleå<\/title>/);
  assert.match(index, /"startDate":"2027-01-30"/);
  assert.match(index, /<p class="pending" data-cms="deadline">Sista anmälningsdag är söndag 24 januari 2027\./);
});

test("fillHtml stoppar okända och icke-tomma platser", () => {
  assert.throws(() => fillHtml('<p data-cms="finns-inte"></p>', defaults()), /Okänd plats/);
  assert.throws(() => fillHtml("<title>{{cms:finns-inte}}</title>", defaults()), /Okänd plats/);
  assert.throws(() => fillHtml('<p data-cms="facts">gammal text</p>', defaults()), /inte tomma/);
});

test("anmälan länkar till inloggningen i SSF TA tills en direktlänk finns", () => {
  const utan = renderSlots(withEvent({ registrationUrl: "" })).registration;
  assert.match(utan, new RegExp(`href="${SSFTA_LOGIN}"`));
  assert.match(utan, /Logga in i SSF TA/);
  assert.match(utan, /Sök fram Renrajden 2027/);
  const med = renderSlots(withEvent({ registrationUrl: "https://example.com/anmalan" })).registration;
  assert.match(med, /href="https:\/\/example\.com\/anmalan"/);
  assert.doesNotMatch(med, /logga-in/);
});

test("avgifterna länkar till Swish-rutan", () => {
  assert.match(renderSlots(withEvent({})).fees, /<a class="pay-fee" href="#swish">500 kr/);
});

test("text från databasen escapas och farliga länkar tas bort", () => {
  const c = cleanContent({
    source: "db",
    event: { ...DEFAULT_EVENT, venue: '<img src=x onerror="alert(1)">', mapUrl: "javascript:alert(1)", registrationUrl: "https://ok.example/\"><script>" },
    years: [{ year: 2020, text: "<b>fet</b>", links: [{ label: "x", url: "javascript:alert(1)" }, { label: "gammal", url: "http://ta.skidor.com/a?b=1&c=2" }] }],
  });
  const s = renderSlots(c);
  assert.doesNotMatch(s.facts, /<img/);
  assert.match(s.facts, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(s.facts, /Hitta hit/, "ogiltig kartlänk ska inte visas");
  assert.doesNotMatch(s.registration, /<script/);
  assert.doesNotMatch(s.years, /javascript:/);
  assert.match(s.years, /href="http:\/\/ta\.skidor\.com\/a\?b=1&amp;c=2"/);
  assert.match(s.years, /&lt;b&gt;fet&lt;\/b&gt;/);
  const html = fillHtml('<script type="application/json" id="cms-data">{{cms:data}}</script>', cleanContent({ source: "db", event: { ...DEFAULT_EVENT, venue: "</script><script>alert(1)</script>" }, years: [] }));
  assert.equal((html.match(/<\/script>/g) || []).length, 1, "inbäddad data får inte avsluta script-taggen");
});

test("ogiltiga fält från databasen ersätts med standardvärden", () => {
  const e = cleanEvent({ date: "30/1", startTime: "tio", status: "flyttat", venue: "", lapKm: -1, coldLimit: 5, distances: [{ km: 42 }], email: "x" });
  assert.equal(e.date, DEFAULT_EVENT.date);
  assert.equal(e.startTime, DEFAULT_EVENT.startTime);
  assert.equal(e.status, "planned");
  assert.equal(e.venue, DEFAULT_EVENT.venue);
  assert.equal(e.lapKm, DEFAULT_EVENT.lapKm);
  assert.equal(e.coldLimit, DEFAULT_EVENT.coldLimit);
  assert.equal(e.distances.length, 3, "ogiltiga distanser ger standarddistanserna");
  assert.equal(e.email, DEFAULT_EVENT.email);
  assert.equal(cleanYear({ year: 1800 }), null);
  assert.equal(cleanYear({}, "2020").year, 2020);
});

test("årets lopp visas överst i arkivet tills resultatet lagts in", () => {
  const before = renderSlots(defaults());
  assert.match(before.years, /^<li class="year next-year" data-next-year="2027">.*Lördag 30 januari\. Resultaten publiceras här samma dag\./);
  const after = renderSlots(cleanContent({ source: "db", event: DEFAULT_EVENT, years: [...DEFAULT_YEARS, { year: 2027, status: "held", date: "2027-01-30", links: [] }] }));
  assert.doesNotMatch(after.years, /next-year/);
  assert.match(after.years, /^<li class="year" data-year="2027">/);
  assert.equal(renderSlots(defaults())["results-eyebrow"], "Resultat sedan 2013 · fyra år utan tävling");
});

test("segrarna märks med distans, så att 21 km kan filtreras bort", () => {
  for (const c of ["H42", "D42", "42 km", "H40", "D40", "H 21- 42", "", "Motion"]) assert.equal(winDist(c), "42", c);
  for (const c of ["H21", "D21", "H20", "D22"]) assert.equal(winDist(c), "21", c);
  for (const [c, sex] of [["H42", "H"], ["d21", "D"], ["Herrar 21", "H"], ["Damer", "D"], ["42 km", ""], ["Mix 10", ""]]) assert.equal(winSex(c), sex, c);
  const html = renderSlots(defaults());
  const side = html["history-side"].split("</table>")[0];
  assert.match(side, /<thead><tr><th scope="col">År<\/th><th scope="col">Herrar<\/th><th scope="col">Damer<\/th><\/tr><\/thead>/);
  assert.match(side, /<tr data-dist="42"><th scope="row"><span class="win-yr">2025<\/span><\/th><td>Viktor Mäenpää<\/td><td>Helena Lundkvist<\/td><\/tr>/);
  assert.match(side, /<tr data-dist="21"><th scope="row"><span class="win-yr">2025<\/span> <small>21 km<\/small><\/th><td>Samuel Matkala Nordlund<\/td><td>Elvira Niva<\/td><\/tr>/);
  assert.match(side, /<tr data-dist="42"><th scope="row"><span class="win-yr">2020<\/span><\/th><td>Magnus Näslund<\/td>/, "2020 står som alla andra år");
  assert.match(side, /<tr data-dist="21"><th scope="row"><span class="win-yr">2024<\/span> <small>21 km<\/small><\/th><td><span aria-hidden="true">–<\/span><span class="sr-only">ingen klass<\/span><\/td><td>Ebba Rönnbäck<\/td><\/tr>/);
  assert.equal((side.match(/<tr data-dist=/g) || []).length, 20, "en rad per år och distans");
  assert.doesNotMatch(side, /<tr>(?!<th scope="col">)/, "en segrarrad saknar data-dist");
  assert.match(html.years, /<p class="winners" data-dist="21">Segrare D21: Annaclara Forss<\/p>/);
  assert.doesNotMatch(html.years, /class="winners">/, "en segrare i årslistan saknar data-dist");
  const other = renderSlots(cleanContent({ source: "db", event: DEFAULT_EVENT, years: [{ year: 2030, status: "held", winners: [{ class: "H42", names: "A" }, { class: "Lag", names: "B och C" }] }] }))["history-side"];
  assert.match(other, /<td>A<\/td><td><span aria-hidden="true">–<\/span>/, "saknad damsegrare visas som streck");
  assert.match(other, /<td colspan="2">Lag: B och C<\/td>/, "klass utan H eller D får en egen rad");
  const index = readFileSync("index.html", "utf8");
  assert.match(index, /<input type="checkbox" id="vis-42" checked>/, "42 km ska vara valt från början");
  assert.match(index, /<input type="checkbox" id="vis-21">/, "21 km ska vara bortvalt från början");
});

test("distanser, avgifter och status följer innehållet", () => {
  const c = withEvent({
    status: "cancelled", deadline: "",
    distances: [{ km: 30, laps: 3, classes: "HD30", fee: 1200, lateFee: 1500, note: "Ny distans." }],
    liveResultsUrl: "https://live.example/2027",
  });
  const s = renderSlots(c), h = renderHead(c);
  assert.match(s.dist, /<b>30<\/b><span>km · HD30<\/span>/);
  assert.equal((s.dist.match(/class="lap( on)?"/g) || []).length, 3, "ett spår per varv");
  assert.match(s.fees, /1 200 kr<small>Efteranmälan 1 500 kr/, "inställt lopp: avgiften är inte en länk");
  assert.match(s["swish-fees"], /<span class="km">30 km<\/span><b>1 200 kr<\/b><small>Efteranmälan 1 500 kr<\/small>/, "Swish-rutan: ordinarie avgift i fokus, efteranmälan under");
  assert.match(s["swish-fees"], /href="https:\/\/app\.swish\.nu\/1\/p\/sw\/\?sw=1230489575&amp;amt=1200&amp;cur=SEK&amp;msg=RR%20-%20&amp;edit=msg&amp;/, "på mobilen öppnar raden Swish med avgiften ifylld");
  assert.match(s["swish-num"], /amt=1200&amp;cur=SEK&amp;msg=RR%20-%20&amp;edit=amt,msg/, "numret öppnar Swish med längsta distansens avgift, som går att ändra");
  assert.match(s["inv-fees"], /<b>30 km<\/b> <span>3 varv<\/span>/);
  assert.match(s.deadline, /inställt/);
  assert.match(s["hero-date"], /· Inställt$/);
  assert.match(s.years, /Inställt\. Loppet var planerat till lördag 30 januari\./);
  assert.match(s.years, /href="https:\/\/live\.example\/2027"/);
  assert.equal(h.jsonld.eventStatus, "https://schema.org/EventCancelled");
  assert.match(h.description, /30 km\.$/);
});

test("Firestores REST-format avkodas", () => {
  const v = fromRest({ mapValue: { fields: {
    s: { stringValue: "a" }, i: { integerValue: "42" }, d: { doubleValue: 10.5 }, n: { nullValue: null },
    l: { arrayValue: { values: [{ mapValue: { fields: { url: { stringValue: "https://x" } } } }] } }, e: { arrayValue: {} },
  } } });
  assert.deepEqual(v, { s: "a", i: 42, d: 10.5, n: null, l: [{ url: "https://x" }], e: [] });
});
