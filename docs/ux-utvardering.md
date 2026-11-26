# UX- och tillgänglighetsutvärdering: renrajden.se (prototyp)

**Utvärderat:** `index.html` med seeddata `seed-news.json`, publiceringsskelett och mock via testharnessen.
**Miljö:** Chromium (Playwright), deviceScaleFactor 1, webbfonterna laddade. Bredder 320, 360, 390, 600, 768, 900, 1024, 1200, 1360, 1380, 1400, 1440 och 1600 px, ljust och mörkt tema, samt forced colors, reducerad rörelse, textavstånd (WCAG 1.4.12) och låg viewporthöjd. axe-core 4.14.1.
**Underlag:** testskripten för omtest finns i `dev/` (`verify.js`, `shots.js`).

---

## Sammanfattning

Prototypen har en stark och ovanlig identitet. Den välvda västrubriken, nummerlappen och de röda dubbelspåren känns som OK Renen och inte som en mall. Grunden är också ovanligt solid: all text klarar AA-kontrast i båda temana (lägst 4,87:1), rubrikstrukturen är felfri, dialogerna är native `<dialog>`, och formuläret har felsammanfattning, `aria-invalid` och `aria-describedby`. axe hittar bara en allvarlig regel för besökare.

De verkliga problemen sitter i **fokushantering och dynamik**. "Ångra" efter borttagning går inte att nå med tangentbord inom tidsgränsen. Fokus tappas efter "Spara ändringar" och vid varje liveuppdatering av nyheterna. Mobilmenyn lämnas öppen över fokuserat innehåll och går inte att scrolla vid låg höjd.

Tvistens km-mätare **täcker text vid 1360–1399 px**, alltså precis vid den vanliga laptopbredden 1366 px. Vid 320 px blir det horisontell scroll.

För skidåkaren besvaras "när, var, hur anmäler jag mig, hur seedas jag" bra. Men seedningen saknas i menyn, det finns ingen vägbeskrivning eller karta, och sidan har inget läge för tävlingsdagen: på mobil ligger PM 5,4 skärmhöjder ner och hero-knappen säger fortfarande "Så anmäler du dig".

**Bedömning:** lovande design och god semantisk grund. Sju P1-fynd behöver åtgärdas före lansering, och alla är avgränsade och går att rätta på kort tid.

---

## Styrkor

- **Identitet:** den välvda "RENRAJDEN 2027", nummerlappen med nedräkning och de röda dubbelspåren ger en igenkännbar, klubbförankrad design som fungerar från 360 till 1600 px.
- **Kontrast:** all text klarar WCAG AA i ljust och mörkt tema, även på blått (vit 5,88:1, `--hero-soft` 4,87:1), på rött (vit på #C8102E 5,88:1), i chips (14,2:1) och i km-mätarens etiketter (7,3:1).
- **Semantik:** en `h1` (tillgänglig text "Renrajden 2027" via sr-only och dekorativ SVG med `aria-hidden`), inga hopp i rubriknivåerna (37 rubriker), `fieldset`/`legend` för distansväljaren, `dl` för fakta och sr-only "(öppnas i ny flik)".
- **Tangentbord:** skip-länken syns och fungerar. `scroll-padding-top` gör att inget fokuserat innehåll hamnar under den fasta headern (kontrollerat med Shift+Tab genom hela sidan). Distansväljaren fungerar med piltangenter och har synlig fokusring.
- **Formulär:** felsammanfattningen får fokus och har länkar som flyttar fokus till rätt fält. Länkrader kan läggas till och tas bort med logisk fokusflytt. Sidan nekar `http://`.
- **Robust i detaljer:** kopiera-knappen har en reservlösning (markerar adressen och visar en instruktion). Packlistan sparas lokalt. Sidan respekterar reducerad rörelse. Textavstånd enligt 1.4.12 klipper ingen text. Målytorna är minst 24 px (axe `target-size` godkänd).
- **Ärlig information:** "Anmälan till 2027 är inte öppen än", tydliga 2025-markeringar och ett vänligt, handlingsbart nekat-meddelande vid inloggning.

---

## Fynd

Fynden är sorterade efter prioritet: **P1** = blockerar eller bryter mot WCAG, **P2** = påtaglig friktion, **P3** = polish. Varje fynd är verifierat i sidan. Där ett fynd bara är verifierat i koden står det uttryckligen.

### P1: blockerar eller bryter mot WCAG

#### P1-1. "Ångra" efter borttagning går inte att nå med tangentbord, och fokus tappas
- **Var:** `#toast` / `#toast-action`, efter "Ta bort" → "Ta bort" i bekräftelsedialogen (alla bredder och teman).
- **Problem:** efter borttagningen hamnar fokus på `#news-h`. Ångra-knappen ligger sist i DOM:en, och det krävdes **69 Tab-tryck** från rubriken för att nå den. Toasten försvinner efter 10 s. Timern pausas inte när fokus står på Ångra: med fokus på knappen i 10,5 s försvann toasten och fokus föll till `<body>`. Efter klick på Ångra faller fokus också till `<body>`, eftersom knappen göms.
- **Varför:** WCAG 2.2.1 Timing Adjustable (A), 2.1.1 Keyboard (A) och 2.4.3 Focus Order (A). Ångra-funktionen finns i praktiken bara för musanvändare.
- **Åtgärd:** flytta fokus till Ångra när toasten visas efter en borttagning, pausa timern vid fokus eller hovring, och ge fokus ett vettigt mål efter ångra.
  ```js
  // efter toast("Nyheten är borttagen", {...}) i #confirm-delete:
  requestAnimationFrame(() => $("#toast-action").focus());
  const t = $("#toast");
  ["focusin", "mouseenter"].forEach(ev => t.addEventListener(ev, () => clearTimeout(toastTimer)));
  t.addEventListener("focusout", (e) => { if (!t.contains(e.relatedTarget)) toastTimer = setTimeout(() => { t.hidden = true; toastAction = null; }, 5000); });
  // i Ångra-run: efter set(rest), fokusera den återställda nyhetens rubrik (#nt-<id>, tabindex=-1) eller #news-h
  ```
  Alternativ: visa "Nyheten är borttagen. Ångra" som en rad på den borttagna nyhetens plats i listan, utan tidsgräns.

#### P1-2. Fokus tappas till `<body>` efter "Spara ändringar"
- **Var:** redigeringsdialogen (`#editor-dialog`), redigering av en befintlig nyhet. Testat i 1440 ljust och 390 mörkt.
- **Problem:** `openDialog(edDlg, '[data-edit="id"]')` sparar ursprungsknappen. Dialogen stängs innan snapshotet ritar om listan, så fokus sätts på den gamla knappen. Ca 30 ms senare ersätts hela listan (`replaceChildren`) och fokus hamnar på `<body>`. Selektor-fallbacken hinner aldrig användas. Uppmätt: "fokus 150 ms efter spara: BODY" och "Sparad: fokus: BODY". Under själva sparandet faller fokus också till `<body>`, eftersom den fokuserade spara-knappen sätts till `disabled`.
- **Varför:** 2.4.3 Focus Order (A). En tangentbords- eller skärmläsaradmin hamnar högst upp på sidan efter varje redigering.
- **Åtgärd:** sätt fokusmålet efter omritning, inte efter stängning.
  ```js
  // i submit: S.focusAfterRender = S.editing ? `[data-edit="${S.editing.id}"]` : null;
  // sist i renderNews():
  if (S.focusAfterRender) { const t = document.querySelector(S.focusAfterRender); if (t) { t.focus(); S.focusAfterRender = null; } }
  ```
  Använd `aria-disabled="true"` och ignorera klick i stället för `disabled` på den fokuserade spara-knappen.

#### P1-3. Mobilmenyn förblir öppen och täcker det fokuserade elementet
- **Var:** `#site-nav[data-open]` vid < 1024 px (testat vid 390 px).
- **Problem:** när man tabbar förbi "Kontakt" lämnar fokus menyn, men menyn stannar öppen. Nästa fokus, "Senaste nytt"-länken `#latest-link`, ligger **helt under** menyn (kontrollerat med `elementFromPoint`). Klick utanför menyn stänger den inte heller. Esc fungerar och återför fokus till "Meny".
- **Varför:** 2.4.11 Focus Not Obscured (Minimum) (AA, ny i 2.2).
- **Åtgärd:**
  ```js
  nav.addEventListener("focusout", (e) => { if (nav.hasAttribute("data-open") && !nav.contains(e.relatedTarget) && e.relatedTarget !== menuBtn) setMenu(false); });
  document.addEventListener("click", (e) => { if (nav.hasAttribute("data-open") && !nav.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false); });
  ```

#### P1-4. Mobilmenyn går inte att scrolla vid låg höjd: "Resultat" och "Kontakt" kan inte nås
- **Var:** `#site-nav` vid 844×390 (liggande mobil), 740×360 och 320×256 (motsvarar 400 % zoom på en 1280×1024-skärm).
- **Problem:** menyn är absolut positionerad i en fast header, så den följer med när sidan scrollas. Länkarna ligger på y = 79–489 px. Vid 390 px höjd ligger "Resultat" och "Kontakt" under vyn och kan inte nås. Med tangentbord får "Kontakt" fokus vid y = 434 px, alltså utanför vyn.
- **Varför:** 1.4.10 Reflow (AA) och 2.4.11 (AA).
- **Åtgärd:**
  ```css
  @media (max-width: 1023px) {
    .site-nav { max-height: calc(100dvh - 4.5rem); overflow-y: auto; overscroll-behavior: contain; }
  }
  ```

#### P1-5. Km-mätarens avläsning täcker text vid 1360–1399 px
- **Var:** `.rail-readout` mot vänsterkanten av `.wrap` (rubriker, faktarutor, nyhetskort, årtal i resultatlistan). Ljust och mörkt tema. Se `rail/1360-*.png`.
- **Problem:** avläsningen slutar som längst vid x = 150 px. Innehållet börjar vid x = 136 px vid 1360 px och vid x = 146 px vid 1380 px. Uppmätt överlapp mot bland annat "ANMÄLAN" (A:et täcks), "NYHETER" (N:et), årtalen "2025", "2021", "2018" och "2013" (2:an täcks, så det står "025") samt "Visa nyhetsarkivet". Från 1400 px finns ingen överlappning. 1366 px är en av de vanligaste laptopbredderna, och med Windows klassiska rullist (ca 17 px) blir överlappningen ännu större, eftersom mediefrågan räknar med rullisten men innehållsytan inte gör det.
- **Varför:** text som döljs ger informationsförlust ("025"), och det är designens egen tvist som går sönder vid sin brytpunkt.
- **Åtgärd** (välj ett alternativ):
  ```css
  /* A: reservera plats för mätaren så länge marginalen är för smal */
  @media (min-width: 1360px) {
    .wrap { padding-left: max(32px, calc(176px - (100vw - var(--wrap)) / 2)); }
  }
  /* B: visa mätaren först när det finns plats */
  @media (min-width: 1360px) { .rail { display: none; } }
  @media (min-width: 1440px) { .rail { display: block; } }
  ```

#### P1-6. Horisontell scroll vid 320 px
- **Var:** `.timeline li b` med texten "Nummerlappsutdelning" i PM-sektionen vid 320 px.
- **Problem:** ordet är 331 px brett och sidan blir 331 px bred, så det blir 11 px sidledsscroll (verifierat med `scrollBy`). Övriga bredder (360–1600) har ingen sidledsscroll.
- **Varför:** 1.4.10 Reflow (AA) kräver att sidan fungerar vid 320 CSS-px.
- **Åtgärd:**
  ```css
  .timeline b { overflow-wrap: anywhere; hyphens: auto; } /* lang="sv" krävs för avstavning */
  @media (max-width: 400px) { .timeline li { grid-template-columns: minmax(0, 1fr); gap: .125rem; } }
  ```

#### P1-7. Inmatningsfältens ramar syns knappt (admin)
- **Var:** `.field input`, `select`, `textarea` och `.icon-btn` i `#editor-dialog`. Ljust och mörkt tema.
- **Problem:** ramen `--line` mot omgivningen har kontrasten **1,44–1,56:1** i ljust och **1,48–1,64:1** i mörkt tema. Fältets fyllning (`--bg`) mot dialogytan är 1,08:1. Inget annat än ramen visar var fältet finns.
- **Varför:** 1.4.11 Non-text Contrast (AA). Fältgränsen behöver minst 3:1.
- **Åtgärd:** inför en egen token för kontrollramar (de uppmätta värdena gäller mot både `--surface` och `--bg`).
  ```css
  :root { --control: #6E7AA3; }           /* 4,22:1 mot #FFF, 3,90:1 mot #F4F6FB */
  /* mörkt tema: --control: #6878B8; */   /* 3,91:1 mot #141C40, 4,34:1 mot #0C1230 */
  .field input, .field select, .field textarea, .icon-btn { border-color: var(--control); }
  ```

### P2: påtaglig friktion

#### P2-1. Liveuppdatering av nyheterna river besökarens fokus
- **Var:** `renderNews()` vid varje `onSnapshot`, både `#news-list` och `#news-archive`.
- **Problem:** hela listan och arkivet ritas om med `replaceChildren`. När en annan admin publicerade, eller ändrade en **annan** nyhet, föll fokus från en länk i ett nyhetskort eller i arkivet till `<body>` (verifierat båda fallen). Öppna arkivposter bevaras, men fokus gör det inte. Det drabbar just tävlingsdagen, när startlistor, PM och resultat publiceras tätt.
- **Varför:** 2.4.3 (A). En skärmläsaranvändare tappar sin plats utan att ha gjort något.
- **Åtgärd:** rita om per nyckel (uppdatera bara kort vars data ändrats), eller spara och återställ fokus.
  ```js
  const a = document.activeElement, key = a && a.closest("[id^='nyhet-']")?.id, idx = key ? [...document.getElementById(key).querySelectorAll("a,button,summary")].indexOf(a) : -1;
  // ... rita om ...
  if (key && idx > -1) document.getElementById(key)?.querySelectorAll("a,button,summary")[idx]?.focus();
  ```

#### P2-2. "Viktigt"-bannern hoppas över av skip-länken, ligger utanför landmärkena och annonseras inte
- **Var:** `#alert-bar` (mellan `<header>` och `<main>`). Testat med en nyhet om inställt lopp vid 390 px.
- **Problem:** "Hoppa till innehållet" leder till `#main` och hoppar alltså **över** det viktigaste meddelandet på sidan ("Renrajden 2027 är inställd"). Bannern saknar landmärke, rubrik och live-region: axe `region` (moderate) flaggar `strong, #alert-text`. En besökare som har sidan öppen när admin publicerar ett viktigt meddelande får ingen annonsering.
- **Varför:** 1.3.1 och 2.4.1 i praktiken. Informationen är kritisk (inställt lopp).
- **Åtgärd:** flytta bannern först i `<main>` och gör den till en region med rubrik. Använd en polite live-region för ändringar under sessionen.
  ```html
  <main id="main" tabindex="-1">
    <section class="alert-bar on-blue" id="alert-bar" aria-labelledby="alert-h" hidden>
      <div class="wrap"><h2 id="alert-h" class="alert-title">Viktigt</h2>…</div>
    </section>
    <p class="sr-only" id="alert-live" aria-live="polite"></p>
  ```

#### P2-3. "Senaste nytt"-remsan visar den fästa nyheten, inte den senaste
- **Var:** `#latest`, `renderNews()`: `const latest = items[0]`, där `items` sorteras med fästa först.
- **Problem:** efter att en ny nyhet publicerats (24 nov) visar remsan fortfarande "Renrajden 2027" (23 nov, fäst). Remsan och hero-knappen "Senaste nytt" pekar alltså fel så fort det finns en fäst nyhet.
- **Åtgärd:** `const latest = [...S.news].sort((a, b) => b.date.localeCompare(a.date))[0];`

#### P2-4. Forced colors (Windows kontrastteman): h1 försvinner och den valda distansen syns inte
- **Var:** `.hero-title svg text` (`fill="#FFFFFF"` hårdkodat) och `.seg input:checked + label`. Se `vp/forced-light-*.png`.
- **Problem:** i ett ljust kontrasttema tvingas herons bakgrund till vit, men SVG-texten förblir vit, så **"RENRAJDEN 2027" blir osynlig**. I distansväljaren visas vald distans bara med röd ram, `box-shadow` och röd text. Allt det skrivs över, och 42, 21 och 10 ser likadana ut.
- **Varför:** användare med nedsatt syn som använder kontrastteman tappar sidans huvudrubrik och valt läge.
- **Åtgärd:**
  ```html
  <svg … style="color:#fff"> <text fill="currentColor"> …
  ```
  ```css
  @media (forced-colors: active) {
    .seg input:checked + label { border: 4px solid Highlight; }
    .seg input:checked + label b::after { content: " ✓"; }
  }
  ```

#### P2-5. Mörkt tema: ramen för vald distans har för låg kontrast
- **Var:** `.seg input:checked + label` i mörkt tema (`vp/dark-seg.png`).
- **Problem:** den röda ramen #B4102B mot ytan #141C40 ger **2,40:1**. Den rosa siffran hjälper, men själva tillståndsindikatorn ligger under 3:1.
- **Varför:** 1.4.11 (AA) för tillstånd.
- **Åtgärd:** i mörkt tema, använd `border-color: var(--red-text)` (#FF7A8E, 6,64:1) eller #E8435C (4,24:1) för vald ruta.

#### P2-6. Esc eller × i redigeraren kastar osparad text utan att fråga
- **Var:** `#editor-dialog` (native `cancel` och `[data-close]`).
- **Problem:** verifierat: text skrevs i brödtexten och Esc stängde dialogen direkt, utan bekräftelse. En admin som skriver ett längre PM kan förlora det med ett tangenttryck.
- **Åtgärd:**
  ```js
  const dirty = () => /* jämför fältvärden mot S.editing eller tomt formulär */;
  edDlg.addEventListener("cancel", (e) => { if (dirty() && !confirm("Stäng utan att spara? Ändringarna försvinner.")) e.preventDefault(); });
  ```
  Gör samma kontroll för × och "Avbryt".

#### P2-7. Felsammanfattningen döljs delvis och visar ett missvisande extrafel
- **Var:** `#error-summary` i `#editor-dialog` vid 1440 px (`vp/crud-fel.png`).
- **Problem:** (a) Fokus står på "Publicera" längst ned. När summeringen får fokus rullas den till toppen, men raden "Rätta följande:" hamnar **under dialogens fasta `.dlg-head`**. (b) När den enda länken har `http://` visas både "Adressen måste börja med https://" och "Skriv en text eller lägg till minst en länk.". Det andra felet är fel: användaren *har* lagt till en länk.
- **Åtgärd:**
  ```css
  #error-summary { scroll-margin-top: 6rem; }
  ```
  Räkna en ifylld men ogiltig länkrad som "har länk" när du kontrollerar om brödtext saknas. Ge summeringen ett namn: `aria-labelledby` som pekar på "Rätta följande".

#### P2-8. Sidan hänger på "Hämtar nyheter…" om databasen inte kan hämtas
- **Var:** `initData()`: `await Promise.all([claude.use("db"), claude.use("user")])` saknar `try/catch`, och 10-sekunderstimern startas först efteråt.
- **Problem:** verifierat genom att låta `use("db")` avvisas. Efter 12 s står det fortfarande "Hämtar nyheter…", och en ohanterad promise-avvisning loggas. Det skarpa motsvarande fallet är att Firestore eller autentiseringen inte går att nå.
- **Åtgärd:**
  ```js
  let db, user;
  try { [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]); }
  catch { setState("unavailable", "Nyheterna kunde inte hämtas", "Försök igen om en stund."); return; }
  ```

#### P2-9. Informationsarkitektur: seedningen saknas i menyn
- **Var:** `.site-nav` och `sectionIds` i JS.
- **Problem:** "Hur seedas jag?" är en av de fyra kärnfrågorna, och sektionen "Vägen till startledet" är bra, men den nås inte från menyn. När man läser seedningssektionen markerar `aria-current` i stället "Loppet" (verifierat vid 1440 px).
- **Åtgärd:** lägg till `<li><a href="#seedning">Seedning</a></li>` efter "Loppet" och `"seedning"` i `sectionIds`. Menyn får plats vid 1024 px. Använd `aria-current="location"` i stället för `"true"`.

#### P2-10. Tävlingsdagen på mobil: ingen vy för tävlingsdagen
- **Var:** hero och PM vid 390×844, med klockan simulerad till 30 jan 2027 kl 07:45 (`vp/raceday-race.png`).
- **Problem:** på tävlingsdagen står det "0, Tävlingsdag! Start kl 10" på nummerlappen, men den börjar vid y = 748 px och syns knappt utan scroll. Hero-knapparna är fortfarande "Så anmäler du dig" och "Senaste nytt". PM-sektionen (tider, nummerlappsutdelning) börjar vid y = 4588 px, alltså 5,4 skärmhöjder ner. Efter loppet står det "Loppet är kört. Se resultaten" utan länk.
- **Varför:** en stressad åkare i kylan med handskar behöver tid, plats, nummerlappsutdelning, väder och liveresultat inom ett tryck.
- **Åtgärd:** byt till ett tävlingsveckoläge när det är ≤ 7 dagar kvar: knapparna blir "PM och tider" (#pm) och "Startlista / Liveresultat" (senaste nyheten med taggen Resultat), och nummerlappen placeras före rubriken på mobil. Gör nummerlappen till en länk till `#resultat` efter loppet.

#### P2-11. Det saknas "hitta hit", och mejladressen är ingen länk
- **Var:** fakta "Plats", Kontakt och sidfoten.
- **Problem:** "Var" besvaras bara med "Ormbergsstadion, Ormberget, Luleå". Det finns ingen adress, kartlänk eller parkeringsinformation (bara "Parkeringsvakter finns" i PM). `info@renrajden.se` visas i `<code>` och `<span>` med en kopiera-knapp, men det finns ingen `mailto:` (0 förekomster), så det går inte att trycka och mejla på mobil.
- **Åtgärd:** lägg till en "Hitta hit"-rad i Plats och i PM med kartlänk (öppnas i ny flik) och parkering. Gör adressen till `<a href="mailto:info@renrajden.se">` och behåll kopiera-knappen som komplement.

#### P2-12. Uppgifter från 2025 visas som rubrikfakta för 2027
- **Var:** `.facts`, rutan "Start": stort "kl 10:00" med finstilt "Alla distanser 2025 … Tid 2027 meddelas."
- **Problem:** den som skummar läser "kl 10:00" som 2027 års starttid. Samma risk gäller "42 · 21 · 10 km".
- **Åtgärd:** låt det stora värdet säga det som gäller, till exempel "Meddelas", och lägg "2025: kl 10:00" i den lilla texten. Lägg också en tydlig "Preliminärt"-chip på osäkra fakta.

#### P2-13. Logotypens tillgängliga namn matchar inte den synliga texten
- **Var:** `.brand` (`aria-label="Renrajden – till toppen"`), alla bredder. axe: `label-content-name-mismatch`, serious.
- **Problem:** synlig text är "Renrajden OK Renen · Luleå". Det tillgängliga namnet saknar "OK Renen · Luleå", så röststyrning med "klicka OK Renen" fungerar inte.
- **Varför:** 2.5.3 Label in Name (A). Tolkningen är gränsfall, eftersom huvudordet matchar, men axe klassar det som serious.
- **Åtgärd:** ta bort `aria-label`. Namnet blir då den synliga texten, och `href="#top"` räcker som funktion.

### P3: polish

| # | Var | Problem | Åtgärd |
|---|---|---|---|
| P3-1 | `#dist-stats` (`aria-live="polite"`) | Utan `aria-atomic` annonseras bara de ändrade värdena: "2", "ca 196", "4", utan etiketter. Prisraden `#ds-prize` ligger utanför regionen. (Verifierat i koden, inte med skärmläsare.) | `aria-atomic="true"` och prisraden in i regionen, eller en sr-only-mening: "21 km: 2 varv, cirka 196 höjdmeter, 4 vätskekontroller." |
| P3-2 | `.ext::after { content: " ↗" }` | Pilen hamnar i det tillgängliga namnet: "Seedningstabeller (öppnas i ny flik) ↗". I `.link-list` hamnar sr-texten mitt i namnet. I länkchipsen (`.news-links`) försvinner mellanslaget före pilen ("Resultat↗"). | `content: " ↗" / "";` och `.news-links .ext::after { margin-left: .3em; }` |
| P3-3 | `section[aria-labelledby]` | 17 region-landmärken: varje `.know section` och `.side-box` blir egna regioner, vilket ger brus i landmärkesnavigeringen. | Byt de inre `<section>` mot `<div>`, eller ta bort `aria-labelledby` på dem. |
| P3-4 | `#toast` (`role="status"`) | Toasten är `hidden` när texten sätts och visas i samma steg. Vissa kombinationer av skärmläsare och webbläsare annonserar inte en live-region som just blivit synlig. (Mekanismen är verifierad i DOM, men inte testad med skärmläsare.) | Låt `#toast-text` alltid finnas i DOM:en (dölj visuellt, inte med `hidden`), och sätt texten efter att regionen visats. |
| P3-5 | `renderNews()` med `profiles()` | När två omritningar sker samtidigt och `profiles()` är långsam blir texten "Senast ändrad … av Test Admin av Test Admin" (verifierat med 600 ms fördröjning). | Skriv texten idempotent (`s.textContent = base + " av " + namn`), eller avbryt äldre omritningar med en token. |
| P3-6 | `.rail-mark` / `.rail-readout` | Vid scroll 0 döljs "START" bakom avläsningen, och längst ned sticker en vit flik av "42 MÅL" ut bakom "MÅL!". Över den mörka "Senaste nytt"-remsan smälter avläsningens ruta ihop med bakgrunden. Km-värdet följer scrollprocent och inte sektionerna, och "v3" är kryptiskt. | Dölj den fasta etiketten när avläsningen är inom ca 20 px. Skriv "varv 3". Överväg att låta 10,5, 21 och 31,5 km sammanfalla med sektionsgränser (Anmälan, PM, Nyheter), så att mätaren också blir en orienteringshjälp. |
| P3-7 | `.site-footer details` | "Om prototypen" sträcks till radens höjd och syns som en stor tom ram när den är stängd. | `.site-footer details { align-self: start; }` |
| P3-8 | `.link-row` vid fel | Felmeddelandet under "Adress" skjuter "Länktext" nedåt (`align-items: end`), så fälten hamnar på olika höjd. | `.link-row { align-items: start; }`, eller lägg felraden under hela raden. |
| P3-9 | `.fact dt`, `.chip`, `.seg label span`, `.lap span`, rail-etiketter | 11 px mono med versaler och spärrning. Kontrasten är godkänd, men texten blir liten för en åkare i kyla och motljus. | Höj till 12–13 px (`.75rem`–`.8125rem`). |
| P3-10 | Nav "PM" mot rubriken "Tävlingsdagen" | Menyetiketten och rubriken stämmer inte överens, och "PM" är jargong för nybörjare. | Kalla menyposten "PM och tider", eller rubriken "PM: tävlingsdagen". |
| P3-11 | `#login-open` som inloggad | Knappen byter text till "Inloggad som administratör", men ett klick öppnar inloggningsdialogen igen. | Dölj knappen eller gör den till "Logga ut" när man är inloggad. |
| P3-12 | Utan JavaScript | `lang` sätts bara via JS (tom utan JS), resultatarkivet är tomt (0 rader), och nyheterna står kvar på "Hämtar nyheter…". | Skarp version: `<html lang="sv">`, resultatlistan i statisk HTML och en `<noscript>`-rad i nyhetsrutan. |
| P3-13 | `.year-links` | Många länkar heter "Resultat (pdf)" eller "SSF TA". Årtalet ger sammanhang (2.4.4 är uppfyllt), men länklistan i en skärmläsare blir tvetydig. | sr-only-år i länken: `Resultat (pdf)<span class="sr-only"> 2025</span>` |
| P3-14 | `.pending` (`role="status"`) | Statisk text med live-roll. Det är semantiskt missvisande, men ofarligt. | Ta bort `role="status"`. |
| P3-15 | Menylänk på mobil | Efter klick på en menylänk stängs menyn och fokus hamnar på `<body>`. Nästa Tab fortsätter rätt i sektionen, men skärmläsaren får ingen bekräftelse. | Sätt `tabindex="-1"` på sektionens `h2` och fokusera den efter navigeringen. |

---

## Heuristisk utvärdering (Nielsen och kontext)

**Begriplighet för skidåkaren (när, var, anmälan, seedning)**
- *När:* tydligt i hero ("Lördag 30 januari 2027") och på nummerlappen. Starttiden är problematisk (P2-12).
- *Var:* "Ormberget · Luleå" och "Ormbergsstadion". Det finns ingen vägbeskrivning eller karta (P2-11).
- *Anmälan:* bra statusrad ("inte öppen än") och tre tydliga vägar med "Enklast" markerat. När anmälan öppnar bör varje kort få en direktlänk.
- *Seedning:* "Vägen till startledet" i fem steg är sidans bästa innehåll: konkret, med Vasa-ID och tidpunkten för inskick. Den saknas dock i menyn (P2-9).

**Informationsarkitektur och navigering:** ordningen Loppet → Seedning → Anmälan → PM → Bana → Nyheter → Resultat följer åkarens resa väl. Den aktiva sektionen markeras i menyn. Nyheterna ligger långt ned (6:e sektionen) men nås via hero-knappen och remsan, och remsan visar fel nyhet (P2-3).

**Synlighet av systemstatus:** bra laddnings-, tom-, långsam- och fel-tillstånd för nyheterna, toasts efter åtgärder och "Kontrollerar behörighet…" vid inloggning. Undantag: hängningen i P2-8.

**Förebygga och hantera fel:** bekräftelse och ångra vid borttagning, och https-validering. Men ångra är otillgängligt (P1-1), Esc kastar text (P2-6) och felmeddelandet för länkar är missvisande (P2-7).

**Tonalitet:** saklig, vänlig och lokal ("Bra åkt!", "Sedvanlig fika", "Inget skräp i naturen"). Den passar en klubbarrangör.

**Tvisten:**
- *Den välvda rubriken* fungerar i alla bredder och är tillgängligt implementerad (sr-only-h1). Den bryts bara i forced colors (P2-4).
- *Nummerlappen* är den starkaste idén: begriplig, rolig och funktionell. På mobil hamnar den dock under vecket (y ≈ 750 px vid 844 px höjd), och den utnyttjas inte för tävlingsdagen och tiden efter loppet (P2-10).
- *Km-mätaren* är charmig på breda skärmar men stör idag: den täcker text vid 1360–1399 px (P1-5) och syns bara för en minoritet (≥ 1360 px). Den betyder inget i förhållande till innehållet (P3-6). På mobil är den reducerad till en 3 px-linje som knappt märks. Den skadar inte när P1-5 är åtgärdad, men den blir användbar först när km-markeringarna knyts till sektionerna.

**Mobil på tävlingsdagen:** knappar på minst 40–48 px, 17 px brödtext och bra kontrast är rätt för handskar och kyla. Packlistan, köldgränsen −20 °C och väderlänkarna är genomtänkta. Men det saknas ett tävlingsläge (P2-10), menyn går inte att använda i liggande läge (P1-4), mejladressen går inte att trycka på (P2-11) och små etiketter på 11 px läses dåligt utomhus (P3-9).

---

## Testade flöden och resultat

| Flöde | Resultat | Kommentar |
|---|---|---|
| Layout 360/390/768/1024/1440/1600, ljust + mörkt | Godkänt | Ingen sidledsscroll, ingen klippt text, ingen text över renen. |
| Layout 320 px | **Underkänt** | 11 px sidledsscroll (P1-6). |
| Km-mätaren nära 1360 px | **Underkänt** | Täcker text vid 1360–1399 px (P1-5). OK från 1400 px. |
| Textavstånd 1.4.12 (390, 1440) | Godkänt | Ingen klippt eller överflödande text. |
| Forced colors | **Underkänt** | h1 osynlig i ljust tema, vald distans osynlig (P2-4). |
| Reducerad rörelse | Godkänt | `scroll-behavior: auto`, övergångar 0 s. |
| Skip-länk | Godkänt | Synlig vid fokus, flyttar fokus till `main`. (Hoppar över bannern, P2-2.) |
| Mobilmeny öppna/stäng/Esc | Delvis | Öppna/Esc: OK, fokus tillbaka till "Meny". Tab ut och klick utanför: **underkänt** (P1-3). Låg höjd: **underkänt** (P1-4). |
| Distansväljaren (pilar, fokusring, uppdatering) | Godkänt | Live-texten är fragmentarisk (P3-1). |
| Packlistan (Space, räknare, sparas vid omladdning) | Godkänt | |
| Kopiera-knapparna (med och utan clipboard-behörighet) | Godkänt | Reservlösningen markerar adressen. Toasten täcker inte fokus. |
| Nyhetsarkivet (knapp, `aria-expanded`, details) | Godkänt | Fokus tappas vid liveuppdatering (P2-1). |
| Sticky header döljer fokus (Shift+Tab genom sidan) | Godkänt | `scroll-padding-top` fungerar. |
| Inloggningsdialogen: fokus in, Esc, fokus ut | Godkänt | Fokus på "Stäng", Esc återför till "Logga in som administratör". |
| Nekad inloggning (`admin:false`) | Godkänt | `role="alert"` med tydligt och handlingsbart besked. Fokus stannar på knappen. |
| Lyckad inloggning | Godkänt | Fokus till "+ Ny nyhet" och toast. |
| Skapa nyhet med `http://` | Godkänt (med friktion) | Nekas, fokus till felsummeringen, länken flyttar fokus till fältet. Extrafel och dold rubrik (P2-7). |
| Lägg till och ta bort länkrad | Godkänt | Fokus till ny rad, respektive närmaste rad. |
| Skapa korrekt nyhet | Godkänt | Fokus tillbaka till "+ Ny nyhet". "Senaste nytt" visar fel post (P2-3). |
| Redigera nyhet | **Underkänt** | Sparas, men fokus tappas till `<body>` (P1-2). |
| Markera som viktigt meddelande | Godkänt (med friktion) | Röd banner visas överst. Brister i landmärke och skip (P2-2). |
| Esc i redigeraren med osparad text | **Underkänt** | Stänger utan fråga (P2-6). |
| Ta bort (bekräftelse) | Godkänt | Rubriken namnger nyheten, fokus går till `#news-h`, bannern försvinner. |
| Ångra i toasten | **Underkänt** | 69 tabbar, 10 s timer utan paus, fokus till `<body>` efter ångra (P1-1). Återställningen i sig fungerar. |
| Utan databas (`signedOut`, `noClaude`) | Godkänt | Tydlig tomruta. Inloggningen ger ett infomeddelande. |
| Databasen avvisar `use("db")` | **Underkänt** | Hänger på "Hämtar nyheter…" (P2-8). |
| Tävlingsdagen (klockan simulerad 30/1 och 31/1 2027) | Delvis | Nedräkningen byter text korrekt. Ingen anpassning för tävlingsdagen, ingen länk efter loppet (P2-10). |

---

## axe-core (4.14.1, regler wcag2a/aa, wcag21a/aa, wcag22aa, best-practice)

| Läge | Violations (allvarlighet) | Regler |
|---|---|---|
| Besökare 1440 ljust/mörkt, 390 ljust/mörkt, meny öppen 390, `signedOut` | 1 serious | `label-content-name-mismatch` (`.brand`) |
| Admin 1440 ljust/mörkt (även med arkivet öppet) | 1 serious, 1 moderate | `label-content-name-mismatch` (`.brand`), `region` (`.admin-who`, adminraden utanför landmärken) |
| Besökare 390 med viktigt meddelande | 1 moderate | `region` (`#alert-bar`: `strong`, `#alert-text`) |
| Inloggningsdialog (nekad), ljust/mörkt | 0 | |
| Redigeringsdialog med valideringsfel, ljust/mörkt | 0 | |
| Ta bort-bekräftelse, ljust/mörkt | 0 | |

**Totalt:** 0 critical, 1 serious (samma nod i alla lägen utom dialogerna), 2 moderate (`region` för adminraden och för bannern).

**Ofullständiga (manuellt granskade):**
- `color-contrast` (8–19 noder per läge): km-mätarens etiketter, SVG-rubriken, seedningsstegens `h3` och länkar (bakgrund via pseudo-element) samt noder under toasten. **Manuellt uppmätt: alla godkända** (rail-etikett 7,32:1, SVG-text 5,88:1 ljust och 10,5:1 mörkt, seedningstext 6,77:1).
- `label-content-name-mismatch` på ×-knapparna ("Stäng", "Ta bort länk"): en ikonglyf, så det är godkänt.

**Det axe inte fångar, men som hittades manuellt:** P1-1 till P1-7, P2-1, P2-4, P2-5 och P2-6. Det automatiska resultatet ger alltså en för positiv bild. Huvudproblemen är dynamik och fokus.

### Kontrast, kontrollmätning (urval)

| Yta | Ljust | Mörkt |
|---|---|---|
| Vit text på blått (hero, nyheter) | 5,88:1 | 10,50:1 |
| `--hero-soft` (eyebrow, ingress) på blått | 4,87:1 | 6,97:1 |
| Vit på rött (chip, banner, nummerlapp, 2027-raden) | 5,88:1 | 6,89:1 |
| Chip (`--text` på `--ice`) / chip-outline | 14,23:1 / 7,32:1 | 12,59:1 / 7,77:1 |
| Länkchip (`--accent` på `--ice`) | 6,11:1 | 7,24:1 |
| `--red-text` (eyebrow, tider) | 7,23–7,82:1 | 6,64–7,36:1 |
| Km-mätarens etiketter / avläsning | 7,32:1 / 14,34:1 | 7,77:1 / 19,48:1 |
| "Senaste nytt"-etikett #FF9AA9 | 7,13:1 | 9,69:1 |
| **Fältramar `--line` (icke-text)** | **1,44–1,56:1** | **1,48–1,64:1** |
| **Vald distans, ram (icke-text)** | 5,88:1 | **2,40:1** |

---

## Rekommenderad åtgärdsordning

1. **Fokus och dynamik:** P1-1, P1-2, P2-1 (en gemensam lösning: rita om per nyckel och återställ fokus).
2. **Mobilmenyn:** P1-3 och P1-4 (cirka 6 rader CSS och JS).
3. **Layout:** P1-5 (km-mätaren) och P1-6 (320 px).
4. **Admin-formuläret:** P1-7, P2-6, P2-7.
5. **Innehåll och IA inför lanseringen:** P2-9 till P2-12 (seedning i menyn, hitta hit, `mailto`, 2025-fakta, läge för tävlingsveckan).
6. **Robusthet och forced colors:** P2-3, P2-4, P2-5, P2-8, därefter P3.

---

## Åtgärder i version 2

Alla P1- och P2-fynd är åtgärdade och omtestade med samma skript och samma harness. axe-core visar nu 0 violations i alla lägen (bara ofullständiga kontrastkontroller som redan har mätts manuellt).

| Fynd | Åtgärd | Omtest |
|---|---|---|
| P1-1 Ångra | Fokus flyttas till Ångra direkt. Timern pausas vid fokus och hovring. Esc och × stänger. Efter ångra får den återställda nyheten fokus. | Godkänt: fokus på Ångra, synlig efter 11 s, fokus till `h3` efter ångra |
| P1-2 Spara | Fokusmålet sätts efter omritning. Spara-knappen använder `aria-disabled` i stället för `disabled`. | Godkänt: fokus till "Redigera" efter spara och till rubriken efter ny nyhet |
| P1-3 Meny | Menyn stängs vid focusout och vid klick utanför. | Godkänt |
| P1-4 Meny vid låg höjd | `max-height` plus `overflow-y: auto`. Hamburgermenyn används upp till 1179 px. | Godkänt vid 740×360, 320×256 och 844×390 |
| P1-5 Km-mätaren | Avläsningen visas först från 1440 px. Under det syns bara markeringarna. | Godkänt: ingen överlappning 1360–1600 |
| P1-6 320 px | Avstavning och en kolumn i tidslinjen under 400 px. | Godkänt: scrollWidth 320 |
| P1-7 Fältramar | Ny token `--control` (3,9–4,3:1). | Godkänt |
| P2-1 Liveuppdatering | Fokus sparas per nyhet och index och återställs efter omritning. | Godkänt |
| P2-2 Viktigt-banner | Ligger först i `<main>`, är en region med `h2` och annonseras när den ändras. | Godkänt |
| P2-3 Senaste nytt | Sorteras på datum, oberoende av fäst. | Godkänt |
| P2-4 och P2-5 Forced colors och vald distans | SVG-rubriken använder `currentColor`. Vald distans får `Highlight`-ram och ✓. Ramen i mörkt tema är 6,6:1. | Kodverifierat |
| P2-6 Osparad text | Ruta inne i dialogen: "Stäng utan att spara?". Esc en gång till betyder fortsätt redigera. | Godkänt |
| P2-7 Felsammanfattning | `scroll-margin-top`, `role="group"` med namn och inget falskt extrafel. | Godkänt |
| P2-8 Databasen avvisas | `Promise.allSettled` ger ett tydligt feltillstånd. | Godkänt |
| P2-9 Seedning i menyn | Ny menypost. `aria-current="location"`. | Godkänt |
| P2-10 Tävlingsdagen | Lägena före, tävlingsvecka, tävlingsdag och efter loppet. Knapparna och nummerlappen anpassas, och nummerlappen ligger först på mobil. Lägena kan förhandsvisas under "Om prototypen" i sidfoten. | Godkänt |
| P2-11 Hitta hit och mejl | Kartlänk i Plats och i PM. `mailto:` på alla adresser, med kopiera-knapp kvar. | Godkänt |
| P2-12 2025-fakta | Start: "Meddelas" (2025 kl 10:00 i finstil). Distanserna märks "Prel.". | Godkänt |
| P2-13 Logotyp | `aria-label` borttagen. | Godkänt (axe) |
| P3-1 till P3-11, P3-13 till P3-15 | Åtgärdade enligt förslagen. Km-mätarens varv följer nu sektionerna: 10,5 km = Anmälan, 21 km = Bana, 31,5 km = Resultat. | |
| P3-12 Utan JavaScript | Delvis: `<noscript>` i nyhetsrutan. `lang` och statisk resultatlista hör till den skarpa sajten, eftersom prototypens skelett läggs på av plattformen. | |

---

## Granskning 3: inbjudan och efteranmälan (november 2026)

Tre granskare gick igenom den skarpa sajten: grafisk form i inbjudan, efteranmälan ur deltagarens perspektiv och huvudsidan. Utgångspunkten var att efteranmälan i inbjudan inte såg färdig ut. Mätt med Chromium (Playwright), axe-core, avkodning av QR-koderna (jsQR och OpenCV) och utskrift till PDF.

**Grunden håller:** axe visar 0 fel på båda sidorna. All text klarar AA, även i den mörkblå foten (9,4:1). Ingen bredd från 320 px ger sidledsscroll, och inbjudan blir exakt en A4-sida.

### Åtgärdat

| Fynd | Åtgärd |
|---|---|
| Foten i inbjudan var inte linjerad. Swish-blocket hade en rad mer än renrajden.se-blocket, så etiketterna stod 2,4 mm isär i höjd och "meddelandet" hamnade ensamt på en egen rad | Två likadana block (QR, etikett, stor rad, märkt rad) med en tunn avdelare. Logotypen ligger på samma 16 mm-linje som innehållet |
| "Skriv **RR -** och ditt namn" var tvetydigt: skulle bindestrecket med? | Raden heter nu "Meddelande", följd av en ruta med `RR -` i mono och "ditt namn" som platshållare. Huvudsidan gör likadant |
| Swish-QR:n var en nedskalad PNG med 0,51 mm moduler och såg plottrig ut | Ritad som vektor ur PNG:n i samma färg som sajtens QR. Den är 26 mm stor, med 0,63 mm moduler. Avkodas till exakt samma länk som förut |
| Inbjudan och sajten sa olika saker om efteranmälan ("efter sista anmälningsdag, även på plats" mot "på plats tävlingsdagen") | Steg 2 heter "Efteranmälan på plats": tävlingsdagen, betala med Swish, ta med Vasa-ID. Etiketten i foten heter "Betala med Swish" som på sajten |
| Rutan med sista anmälningsdag stod ovanför steg 2 och kunde läsas som sista dag för efteranmälan | Datumet står i steg 1, "Föranmälan i SSF TA: Senast söndag 24 januari 2027" |
| Steg-siffran "1" och "Kl" lästes som "I" och "KI" i Big Shoulders | Siffran sätts i Familjen Grotesk. Starttiden visas utan "Kl" |
| Kolumnerna hette "Anmälan" och "Efteranmälan" och var olika breda | "Föranmälan" och "Efteranmälan", 20 % var |
| Skärmläsare läste "42 km4 varv" och "Frågorinfo@renrajden.se", och Swish-delen saknade rubrik | Mellanslag i renderingen. Fotens etiketter är `h2` |
| Inbjudan på mobil hade inga länkar, och QR-koderna går inte att skanna med samma telefon | Adressen, mejlen, SSF TA och Swishnumret är länkar (understrukna på smal skärm). QR-koderna döljs på pekskärm |
| Mörkt läge: den mörkblå foten flöt ihop med bakgrunden | Tunn ljus kant runt arket på skärm |
| Swish-rutan på sajten sa inte vad man ska betala | Efteranmälningsavgiften per distans står i rutan (`swish-fees`) |
| Tävlingsdagen på mobil ledde inte till efteranmälan | Nummerlappen får länken "Efteranmälan och Swish" |
| Den aktiva menyposten markerades inte (CSS väntade sig `aria-current="true"`) | Väljaren gäller nu alla värden på `aria-current` |

Inbjudan ryms på en A4-sida även med fyra distanser (2,2 mm marginal).

### Beslut från arrangören

1. **Efteranmälan görs bara på plats**, inte i SSF TA efter sista anmälningsdag.
2. **Efteranmälan går fram till kl 09:30** på tävlingsdagen. Det står i inbjudans steg 2, i Efteranmälan och Swish-rutan på sajten och som en egen rad i PM:s tidslinje.
3. **Ingen distans i Swish-meddelandet.** "RR - ditt namn" gäller, och QR-koden är oförändrad.
4. **Kontant bara med jämna belopp i sedlar.** Det står i inbjudan, i Swish-rutan, i PM och i packlistan.
5. **PM:** kortaste distansen är 10,5 km. Startled finns bara på 42 km. OK Renen seedar startleden och publicerar seedningen på sajten på fredagen före loppet. Regeln "1–9 för föranmälda, 11–20 för efteranmälda" och självseedningen är borttagna.

### Kvar (P3)

- Länken till inbjudan är svår att hitta på startsidan. Den finns bara i Datum och i avgiftsraden, inte i menyn eller sidfoten.
- I läget efter loppet visas Swish-rutan och texten om sista anmälningsdag fortfarande.
- "Öppna Swish" på sajten har `src=qr` i länken, kopierat från QR-koden. Det bör provas på en riktig telefon.
