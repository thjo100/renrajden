// Gemensamt innehåll och prototyplogik för konceptprototyperna i prototyp/v2/.
// Allt som är märkt ex: true är påhittat för prototypen och visas med en "exempel"-etikett.
// Resten kommer från dagens renrajden.se och den gamla bloggen.
(function () {
  "use strict";
  const RR = (window.RR = {});

  /* ---------- Fakta ---------- */
  RR.START = new Date(2027, 0, 30, 10, 0); // starttid 2027 ej klar, 2025 var det 10:00
  RR.MAP = "https://www.google.com/maps/search/?api=1&query=Ormbergsstadion%2C%20Lule%C3%A5";
  RR.MAIL = "info@renrajden.se";
  RR.SEED_TABLES = "https://www.vasaloppet.se/lopp/skidlopp/vasaloppet/seedning/seedningstabeller/";
  RR.LAP_KM = 10.5;
  RR.HM_PER_LAP = 98;
  RR.WATER_PER_LAP = 2;
  RR.DIST = {
    42: { key: 42, laps: 4, cls: "HD42", name: "42 km", prize: "Pris till 1:a–3:e i HD42, direkt efter målgång.", min: 110, max: 330, typical: 190 },
    21: { key: 21, laps: 2, cls: "HD21", name: "21 km", prize: "Pris till vinnarna i HD21.", min: 50, max: 170, typical: 95 },
    10: { key: 10, laps: 1, cls: "Motion", name: "10 km", prize: "Motionsklass. Startar samtidigt som de långa.", min: 25, max: 95, typical: 48 },
  };
  RR.WEATHER = [
    ["Temperatur vid stadion", "https://iot.lunet.se/dashboard/198d8930-774c-11ee-bb6a-17314c01ceae?publicId=59878940-6788-11eb-afaf-e3eb52d62c89", "live"],
    ["Webbkamera Ormberget", "https://www2.lulea.se/web-camera/ormberget/imageorm.jpg", "Luleå kommun"],
    ["Prognos timme för timme", "https://www.klart.se/se/norrbottens-l%C3%A4n/v%C3%A4der-lule%C3%A5/", "klart.se"],
    ["Väderprognos Luleå", "https://www.smhi.se/vader/prognoser-och-varningar/vaderprognos/q/Lule%C3%A5/2694762", "SMHI"],
  ];
  RR.COURSE_LINKS = [
    ["Banskiss och stadionkarta", "https://renrajden.blogspot.com/p/bans.html", "bild, 2022"],
    ["Banan i Strava", "https://www.strava.com/routes/23387754", "rutt, 2020"],
    ["Karta till duscharna", "https://renrajden.blogspot.com/2015/01/karta-till-duscharna.html", "bild"],
  ];

  /* ---------- Tävlingsdagen (PM 2025 som mall) ---------- */
  // from/to i minuter efter midnatt. approx = ingen fast tid.
  RR.DAY = [
    { t: "08:00–15:00", from: 480, to: 900, what: "Ombyte och dusch", note: "Ormbergsanläggningen." },
    { t: "08:00–09:45", from: 480, to: 585, what: "Nummerlappsutdelning", note: "Kom i god tid. Parkeringsvakter visar vägen.", key: "bib" },
    { t: "10:00", from: 600, to: 615, what: "Start, alla distanser", note: "Seedning 1–9 för föranmälda, därefter självseedning.", key: "start" },
    { t: "Efter målgång", from: 760, to: 800, approx: true, what: "Prisutdelning på stadion", note: "När 1:a–3:e i HD42 och vinnarna i HD21 gått i mål." },
    { t: "15:00", from: 900, to: 905, what: "Dusch och ombyte stänger" },
    { t: "Kvällen", from: 1250, to: 1260, approx: true, what: "Seedningen skickas till Vasaloppet", note: "2024 skickades den kl 20:50.", key: "seed" },
  ];
  RR.RULES = [
    "83 % stavlängd. Stilkontrollanter längs banan.",
    "Inga skidor mellan spåren under starten.",
    "Två vätskekontroller per varv, med skräpzon direkt efter.",
    "Fäst gels med kardborreband. Inget skräp i naturen.",
    "Ta med Vasa-ID för automatisk seedning vid efteranmälan.",
    "Swish, eller jämna pengar om du betalar kontant.",
  ];
  RR.PACK = ["Vasa-ID", "Swish eller jämna kontanter", "Kardborreband för gels", "Glid- och fästvalla", "Stavar, max 83 % av längden", "Handduk och ombyte", "Varma kläder till prisutdelningen"];

  /* ---------- Historik ---------- */
  RR.YEARS = [
    { y: 2027, kind: "next", date: "30 januari 2027", text: "Nästa upplaga. Resultaten publiceras här samma dag." },
    { y: 2025, date: "9 februari 2025", links: [["Resultat", "https://drive.google.com/file/d/18MDWvPwT7fYfBq7Ffobwkv2o5Ng6c-tY/view?usp=sharing"], ["Liveresultat", "http://live.skidor.com/5583#result@46786@1@-1"], ["Startlista", "https://drive.google.com/file/d/11-cwtSXdqn99fxNKolL9g5z0oK6Qnghb/view?usp=sharing"]] },
    { y: 2024, date: "10 februari 2024", text: "Seedningen skickades till Vasaloppet kl 20:50 samma kväll.", links: [["Resultat", "https://drive.google.com/file/d/1Auuj2y_SYhVtES366o7NH1-czVkCQ14x/view?usp=sharing"], ["SSF TA", "https://ta.skidor.com/ResultList.aspx?eventid=14793&competitionid=25311&orgid=2920"]] },
    { y: 2023, date: "11 februari 2023", links: [["Resultat", "https://drive.google.com/file/d/1MLrjuAHvQ4BOJSSZ6t7kAgGW8lONGRv2/view?usp=share_link"]] },
    { y: 2022, date: "19 februari 2022", text: "10 km-åkarna startade också kl 10:00.", links: [["Resultat", "https://drive.google.com/file/d/1IGspsGsRtOmkcbsIR68j7WqscqUged3u/view?usp=sharing"], ["Varvtider", "http://obasen.orientering.se/winsplits/online/sv/default.asp?page=table&databaseId=80132&categoryId=0"], ["Bilder", "https://photos.app.goo.gl/VTYn9jouczi5rCTv9"]] },
    { y: 2021, kind: "dns", reason: "Inställt", text: "Planerat till 2 januari 2021. Ställdes in." },
    { y: 2020, date: "januari 2020", text: "Ny fyravarvsbana med 10, 20 och 40 km. Spurtpris på andra varvet.", links: [["Resultat", "https://www.okrenen.se/globalassets/ok-renen---orientering/dokument/resultat-renrajden2020.pdf"], ["SSF TA", "http://ta.skidor.com/ResultList.aspx?eventid=11471&competitionid=19335&orgid=2920"]] },
    { y: 2019, kind: "dns", reason: "Paus", text: "Klubben arrangerade flera stora event och tog paus." },
    { y: 2018, text: "Även Kalvrajden för HD10–16.", links: [["SSF TA", "http://ta.skidor.com/ResultList.aspx?eventid=8698&competitionid=14578&orgid=2920"], ["Bilder", "https://www.flickr.com/photos/139458541@N05/sets/72157691084581201"]] },
    { y: 2017, date: "14 januari 2017", winners: "Klas Nilsson och Anna Rimpi", press: ["Kuriren", "Tungt före gav rejäl genomkörare", "http://www.kuriren.nu/nyheter/tungt-fore-gav-rejal-genomkorare-i-arets-renrajden-9091356.aspx"], links: [["SSF TA", "http://ta.skidor.com/ResultList.aspx?eventid=7506&competitionid=12701&orgid=2920"]] },
    { y: 2016, date: "16 januari 2016", press: ["Kuriren", "Landslagskille slog rekord på Ormberget", "http://www.kuriren.nu/sport/landslagskille-slog-rekord-pa-ormberget-8685214.aspx"], links: [["Resultat", "http://www.okrenen.se/globalassets/ok-renen---orientering/tavling/renrajden2016_resultat.pdf"]] },
    { y: 2015, winners: "Tarjei Solli och Emma Bergström", press: ["Kuriren", "Spännande spurtduell avgjorde Renrajden", "http://www.kuriren.nu/sport/spannande-spurtduell-avgjorde-renrajden-8079740.aspx"], links: [["Resultat", "https://docs.google.com/spreadsheets/d/1f9HGkHk8o17EsdgJ_ZBJSgh3F4vJIVprvc4jA9HVslM/pubhtml"], ["Varvtider", "http://fij.se/ttt/rr15.html"]] },
    { y: 2014, kind: "dns", reason: "Kyla", text: "Inställt på grund av kyla. Under −20 °C på banans kallaste punkt får loppet inte köras." },
    { y: 2013, text: "Äldsta resultatet i arkivet.", links: [["Resultat", "https://drive.google.com/file/d/0B1D0YYjNfooockxvbFIwU3hoTlk/view"]] },
  ];

  /* ---------- Nyheter ---------- */
  RR.NEWS = [
    { date: "2026-11-23", tag: "Info", title: "Renrajden 2027", body: "Renrajden är tillbaka! Boka in lördag 30 januari 2027 för skidfest på Ormberget. Mer info kommer." },
    { date: "2025-02-08", tag: "Resultat", title: "Renrajden 2025, 9 februari", body: "Resultat, liveresultat, startlista och PM för Renrajden 2025." },
    { date: "2023-12-17", tag: "Resultat", title: "Renrajden 2024", body: "Resultatlistan reviderades kl 20:00. Seedningen till Vasaloppet skickades in lördag kl 20:50 och är nu klar." },
    { date: "2023-01-15", tag: "Resultat", title: "Renrajden 11 februari 2023", body: "Resultatlistan uppdaterades 18 februari." },
  ];
  // Påhittade nyheter som dyker upp i senare lägen, för att visa hur flödet ser ut nära loppet.
  const NEWS_EX = [
    { at: new Date(2027, 0, 22, 12, 0), date: "2027-01-22", tag: "Info", title: "PM för Renrajden 2027", body: "PM med tider, parkering och startled är publicerat.", ex: true },
    { at: new Date(2027, 0, 27, 17, 0), date: "2027-01-27", tag: "Info", title: "Startlistan är klar", body: "Kolla ditt startnummer och startled innan du åker hemifrån.", ex: true },
    { at: new Date(2027, 0, 30, 6, 40), date: "2027-01-30", time: "06:40", tag: "Valla", title: "Spåren är pistade", body: "Pistat kl 23:40. Hårt och snabbt före, −8 °C vid stadion.", ex: true },
    { at: new Date(2027, 0, 30, 20, 50), date: "2027-01-30", time: "20:50", tag: "Resultat", title: "Resultat och seedning klara", body: "Resultatlistan är publicerad och seedningen är skickad till Vasaloppet.", ex: true },
  ];
  RR.newsAt = (now) => [...NEWS_EX.filter((n) => n.at <= now), ...RR.NEWS].sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));

  /* ---------- Bana: schematisk höjdprofil (inte uppmätt) ---------- */
  const PTS = [[0, 0], [0.7, 5], [1.4, 2], [2.2, 13], [2.9, 21], [3.5, 16], [4.3, 27], [5.0, 35], [5.6, 30], [6.3, 41], [7.0, 33], [7.8, 22], [8.5, 26], [9.2, 12], [9.9, 4], [10.5, 0]];
  const climb = PTS.reduce((s, p, i) => (i && p[1] > PTS[i - 1][1] ? s + p[1] - PTS[i - 1][1] : s), 0);
  const K = RR.HM_PER_LAP / climb;
  RR.WATER_AT = [3.6, 7.4]; // schematisk placering
  RR.elev = (km) => {
    let x = ((km % RR.LAP_KM) + RR.LAP_KM) % RR.LAP_KM;
    for (let i = 1; i < PTS.length; i++) {
      if (x <= PTS[i][0]) {
        const [x0, y0] = PTS[i - 1], [x1, y1] = PTS[i];
        const t = (x - x0) / (x1 - x0), s = (1 - Math.cos(Math.PI * t)) / 2;
        return (y0 + (y1 - y0) * s) * K;
      }
    }
    return 0;
  };
  RR.ELEV_MAX = Math.max(...PTS.map((p) => p[1])) * K;

  /* ---------- Exempelfält: påhittade sluttider för klung-illustrationer ---------- */
  RR.field = (dist, n) => {
    const d = RR.DIST[dist];
    let seed = 7 + dist;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const out = [];
    for (let i = 0; i < n; i++) {
      const g = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
      const t = Math.exp(Math.log(d.typical) + 0.2 * g);
      out.push(Math.min(d.max - 2, Math.max(d.min + 4, t)));
    }
    return out.sort((a, b) => a - b);
  };

  /* ---------- Format ---------- */
  const two = (n) => String(n).padStart(2, "0");
  RR.clock = (d) => two(d.getHours()) + ":" + two(d.getMinutes());
  RR.hm = (min) => { min = Math.round(min); return Math.floor(min / 60) + ":" + two(min % 60); };
  RR.pace = (secPerKm) => Math.floor(secPerKm / 60) + ":" + two(Math.round(secPerKm % 60)) + " min/km";
  RR.dateSv = (iso, opts) => new Date(iso + "T12:00").toLocaleDateString("sv-SE", opts || { day: "numeric", month: "short", year: "numeric" });
  RR.dur = (ms) => {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return m + " min";
    return Math.floor(m / 60) + " h " + two(m % 60) + " min";
  };
  RR.km = (x) => (Math.round(x * 10) / 10).toString().replace(".", ",");

  /* ---------- Lägen och klocka ---------- */
  RR.KEYS = ["nu", "tavlingsvecka", "tavlingsdag", "efter"];
  RR.LABELS = { nu: "Idag", tavlingsvecka: "Tävlingsvecka", tavlingsdag: "Tävlingsdag", efter: "Efter loppet" };
  const SIM = { tavlingsvecka: new Date(2027, 0, 27, 18, 30), tavlingsdag: new Date(2027, 0, 30, 8, 52), efter: new Date(2027, 0, 30, 21, 10) };
  let key = "nu", anchorReal = Date.now();
  const listeners = [];
  RR.now = () => (key === "nu" ? new Date() : new Date(SIM[key].getTime() + (Date.now() - anchorReal)));
  RR.daysLeft = (now) => {
    const a = new Date(RR.START); a.setHours(0, 0, 0, 0);
    const b = new Date(now); b.setHours(0, 0, 0, 0);
    return Math.round((a - b) / 864e5);
  };
  RR.phaseOf = (now) => {
    const d = RR.daysLeft(now);
    if (d > 7) return "fore";
    if (d > 0) return "vecka";
    if (d === 0 && now.getHours() < 16) return "dag";
    return "efter";
  };
  RR.state = () => { const now = RR.now(); return { key, now, phase: RR.phaseOf(now), days: RR.daysLeft(now), toStart: RR.START - now }; };
  RR.on = (fn) => { listeners.push(fn); fn(RR.state()); };
  RR.set = (k) => {
    if (!RR.KEYS.includes(k) || k === key) return;
    key = k; anchorReal = Date.now();
    document.documentElement.dataset.phase = RR.state().phase;
    syncBar();
    listeners.forEach((fn) => fn(RR.state()));
  };
  RR.tick = (fn, ms) => { fn(RR.now()); return setInterval(() => fn(RR.now()), ms || 1000); };
  // Status för en rad i dagens schema: done | now | next | later
  RR.dayStatus = (now) => {
    const same = RR.daysLeft(now) === 0, m = now.getHours() * 60 + now.getMinutes();
    let nextSet = false;
    return RR.DAY.map((e) => {
      if (!same) return RR.daysLeft(now) < 0 ? "done" : "later";
      if (m >= e.to) return "done";
      if (m >= e.from) return "now";
      if (!nextSet) { nextSet = true; return "next"; }
      return "later";
    });
  };

  /* ---------- Lagring som tål att vara avstängd ---------- */
  RR.store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privat läge */ } },
  };
  RR.copy = (text, btn) => {
    const done = (msg) => { const o = btn.textContent; btn.textContent = msg; setTimeout(() => (btn.textContent = o), 1800); };
    try { navigator.clipboard.writeText(text).then(() => done("Kopierad"), () => done("Markera och kopiera")); }
    catch { done("Markera och kopiera"); }
  };
  RR.ex = '<span class="ex">exempel</span>';
  RR.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  /* ---------- Prototyplisten ---------- */
  const CONCEPTS = [["klungan.html", "Klungan"], ["mellantid.html", "Mellantid"], ["malfoto.html", "Målfoto"]];
  let bar;
  function syncBar() {
    if (!bar) return;
    bar.querySelectorAll("[data-k]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === key)));
    bar.querySelectorAll("[data-concept]").forEach((a) => (a.href = a.dataset.concept + (key === "nu" ? "" : "#" + key)));
  }
  function mountBar() {
    const here = location.pathname.split("/").pop() || "index.html";
    const css = document.createElement("style");
    css.textContent = `
.rrp{--rrp-bg:#0E1430;--rrp-fg:#E9EDFA;--rrp-mut:#A9B3D6;--rrp-on:#FFFFFF;--rrp-onfg:#0E1430;--rrp-line:#2A3566;
  background:var(--rrp-bg);color:var(--rrp-fg);font:500 13px/1.3 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  padding:8px max(16px,env(safe-area-inset-left,0px)) 8px max(16px,env(safe-area-inset-right,0px));position:relative;z-index:80}
.rrp-in{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;max-width:80rem;margin-inline:auto}
.rrp a{color:var(--rrp-fg)}
.rrp-home{font-weight:600;text-decoration:none;white-space:nowrap}
.rrp-home:hover{text-decoration:underline}
.rrp-tag{font:700 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--rrp-mut)}
.rrp-seg{display:flex;flex-wrap:wrap;gap:2px;border:1px solid var(--rrp-line);border-radius:999px;padding:2px}
.rrp-seg button{font:inherit;color:var(--rrp-fg);background:transparent;border:0;border-radius:999px;padding:5px 10px;cursor:pointer;min-height:30px}
.rrp-seg button[aria-pressed="true"]{background:var(--rrp-on);color:var(--rrp-onfg);font-weight:700}
.rrp-concepts{display:flex;gap:4px;margin-left:auto;flex-wrap:wrap}
.rrp-concepts a{text-decoration:none;padding:5px 10px;border-radius:999px;min-height:30px;display:inline-flex;align-items:center}
.rrp-concepts a[aria-current="page"]{box-shadow:inset 0 0 0 1px var(--rrp-fg);font-weight:700}
.rrp-note{margin:0;flex-basis:100%;color:var(--rrp-mut);font-size:12px}
.rrp :focus-visible{outline:2px solid #FFFFFF;outline-offset:2px}
@media (max-width:640px){.rrp-concepts{margin-left:0}.rrp-sim{display:none}.rrp-tag{display:none}
  .rrp-seg{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;max-width:100%}.rrp-seg button{white-space:nowrap;padding:5px 9px}
  .rrp-in{gap:6px 10px}}
.ex{display:inline-block;font:600 .62rem/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;
  border:1px dashed currentColor;border-radius:3px;padding:.2em .35em;margin-left:.4em;vertical-align:.18em;opacity:.8;white-space:nowrap}`;
    document.head.appendChild(css);
    bar = document.createElement("div");
    bar.className = "rrp";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Prototypinställningar");
    bar.innerHTML = `<div class="rrp-in">
      <a class="rrp-home" href="index.html">← Översikt</a>
      <span class="rrp-tag">Prototyp · visa som</span>
      <div class="rrp-seg" role="group" aria-label="Visa sidan som">${RR.KEYS.map((k) => `<button type="button" data-k="${k}" aria-pressed="false">${RR.LABELS[k]}</button>`).join("")}</div>
      <nav class="rrp-concepts" aria-label="Koncept">${CONCEPTS.map(([h, n]) => `<a data-concept="${h}" href="${h}"${h === here ? ' aria-current="page"' : ""}>${n}</a>`).join("")}</nav>
      <p class="rrp-note"><span class="rrp-sim">Läget simulerar klockan: tävlingsvecka = ons 27 jan 18:30, tävlingsdag = lör 30 jan 08:52, efter loppet = lör 30 jan 21:10. </span>Värden märkta <span class="ex">exempel</span> är påhittade.</p>
    </div>`;
    document.body.prepend(bar);
    bar.addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (b) RR.set(b.dataset.k); });
    syncBar();
  }

  // Läget kan väljas med #tavlingsdag osv. i adressen.
  const fromHash = () => { const h = location.hash.slice(1); if (RR.KEYS.includes(h)) RR.set(h); };
  document.documentElement.dataset.phase = RR.state().phase;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { mountBar(); fromHash(); });
  else { mountBar(); fromHash(); }
  addEventListener("hashchange", fromHash);
})();
