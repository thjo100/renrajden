# Renrajden

Webbplats för **Renrajden**, OK Renens klassiska långlopp på Ormberget i Luleå. Loppet är seedningsgrundande för Vasaloppet. Nästa upplaga: lördag 30 januari 2027.

- Alla besökare ser all information och alla nyheter, utan inloggning.
- Bara administratörer loggar in (med Google). De kan skapa, ändra och ta bort nyheter, ändra årets lopp (datum, plats, distanser, avgifter, länkar och banfakta) och sköta resultatarkivet.

## Snabbfakta

| | |
|---|---|
| Live (Firebase) | https://renrajden.web.app (webbplatsen `renrajden` i projektet) |
| Domän | renrajden.se (pekar på gamla Blogger tills DNS flyttas, se [docs/driftsattning.md](docs/driftsattning.md) steg 8) |
| Firebase-projekt | `renrajden-ae53c` |
| Publicering | Automatisk vid push till `main` (GitHub Actions) |
| Språk i kod och gränssnitt | Svenska |

## Teknik

| Del | Lösning |
|---|---|
| Sajt | Statisk HTML, CSS och JavaScript, byggd med Vite |
| Hosting | Firebase Hosting |
| Inloggning | Firebase Authentication med Google |
| Data | Firestore, samlingarna `news`, `settings`, `years` och `admins` |
| Behörighet | `firestore.rules` |
| Tester | Node-test och Playwright mot Firebase-emulatorerna |
| CI/CD | `.github/workflows/firebase.yml` |

## Kommandon

| Kommando | Vad det gör |
|---|---|
| `npm install` | Installerar beroenden |
| `npm run emulators` | Startar lokala Firebase-emulatorer (kräver Java 21+) |
| `npm run dev:emulator` | Startar sajten på http://localhost:5173 mot emulatorerna |
| `npm run dev` | Startar sajten mot riktiga Firebase (kräver `.env.local`) |
| `npm run build` | Bygger sajten till `dist/` |
| `npm test` | Kör alla tester (enhet, regler och ände-till-ände) |
| `npm run test:unit` | Testar datamodellen och renderingen av årets lopp och resultatarkivet (ingen emulator) |
| `npm run test:rules` | Testar bara säkerhetsreglerna |
| `npm run test:e2e` | Bygger och testar sajten i Chromium |
| `npm run seed -- --emulator` | Fyller emulatorn med de 22 gamla nyheterna |
| `npm run segrare -- --emulator` | Fyller i segrare och datum från `src/cms/defaults.js` i arkivet, där de saknas. Saknade segrarklasser läggs till. Mot riktiga projektet via Actions → **Importera segrare till arkivet** |
| `npm run admin -- add <e-post> --emulator` | Gör en adress till admin i emulatorn |

Mot riktiga projektet byter du `--emulator` mot `--project renrajden-ae53c`, efter `gcloud auth application-default login`.

## Kom igång lokalt

Kräver Node 20+ och Java 21+. Inget Firebase-konto behövs.

```bash
npm install
```

```bash
npm run emulators
```

I ett nytt terminalfönster:

```bash
npm run seed -- --emulator
```

```bash
npm run admin -- add din@gmail.com --emulator
```

```bash
npm run dev:emulator
```

Öppna http://localhost:5173. Vid inloggning visar emulatorn ett låtsas-Google-fönster: välj **Add new account** och skriv adressen du gjorde till admin.

För att se lägena kring tävlingsdagen, lägg till `?lage=tavlingsvecka`, `?lage=tavlingsdag` eller `?lage=efter` i adressen.

## Filer

| Fil | Innehåll |
|---|---|
| `index.html` | Sidans struktur och den fasta texten (PM, seedning, partners, kontakt). Årets lopp och resultatarkivet är tomma platser, se nedan |
| `inbjudan.html` | Inbjudan till årets lopp som ett utskrivbart A4-ark, på `/inbjudan` |
| `src/main.js` | Ingång. Laddar CSS, typsnitt, nyheter, årets lopp och (vid behov) admin |
| `src/site.js` | Nedräkning, lägen, meny, km-mätare, distansväljare, packlista |
| `src/news.js` | Hämtar och visar nyheter |
| `src/bilder.js` | Bildsektionen: filmen, val av kategori, rutnät och helskärmsvisning |
| `src/admin.js` | Google-inloggning och hantering av nyheter |
| `src/cms-admin.js` | Adminläget för årets lopp och resultatarkivet |
| `src/admin-kit.js` | Gemensamt för adminformulären: fel, osparat, rader, bekräfta borttagning |
| `src/cms/defaults.js` | Standardinnehållet för årets lopp och resultatarkivet (används tills något sparats i Firestore) |
| `src/cms/model.js` | Datamodell, gränser och svensk formatering |
| `src/cms/render.js` | Gör HTML av innehållet. Används både vid bygget och i webbläsaren |
| `src/cms/runtime.js` | Hämtar innehållet från Firestore i webbläsaren och ritar om det som ändrats |
| `scripts/vite-cms.mjs` | Vite-plugin som fyller platserna när sajten byggs |
| `src/firebase.js` | Firebase-konfiguration och emulatorstöd |
| `src/ui.js` | Gemensamma hjälpfunktioner, toast och dialoger |
| `src/styles.css` | All design |
| `src/inbjudan.js`, `src/inbjudan.css` | Typsnitt, utskriftsknapp och A4-layout för inbjudan |
| `public/grafik/` | OK Renens logotyp (`okrenen-logo`, `-vit` och `-vit-rod`, som SVG och PNG), renhuvudet (`okrenen-ren`), originalet `okrenen-logoark.pdf` och Swish-QR-koden (`swish-qr.png` som den levererades, `swish-qr-kod.png` beskuren för sajten och inbjudan). Allt nås också på renrajden.se/grafik/ |
| `public/bilder/` | Bilderna från gamla bloggen, en mapp per kategori (`foton`, `affischer`, `banor`, `sponsorer`, `seedning`), miniatyrer i `mini/` och listan `bilder.json` (fil, miniatyr, kategori, år, titel, mått). En ny bild behöver en post i listan och en miniatyr |
| `public/video/` | Filmen från Renrajden 2024 (720p) och dess stillbild |
| `public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png` | Flikikonen: renhuvudet på Renenblå |
| `firestore.rules` | Säkerhetsregler |
| `scripts/admin.mjs` | Lägg till, ta bort och lista administratörer |
| `scripts/seed-news.mjs` | Importerar gamla nyheter från `prototyp/seed-news.json` |
| `scripts/segrare.mjs` | Fyller i segrare och datum från `src/cms/defaults.js` i resultatarkivet i Firestore |
| `tests/cms.test.mjs` | Enhetstester av datamodellen och renderingen |
| `tests/rules.test.mjs` | Tester av säkerhetsreglerna |
| `tests/e2e.mjs` | Ände-till-ände-tester |
| `.github/workflows/firebase.yml` | Tester, förhandsversion för PR och publicering |
| `.github/workflows/importera-nyheter.yml` | Manuell import av gamla nyheter |
| `.github/workflows/importera-segrare.yml` | Manuell import av segrare och datum till resultatarkivet |
| `docs/driftsattning.md` | Steg-för-steg för Firebase, GitHub och domän |
| `docs/ux-utvardering.md` | UX- och tillgänglighetsutvärdering |
| `prototyp/`, `dev/` | Den ursprungliga UX-prototypen och dess verktyg |

## Vanliga ändringar

| Jag vill … | Ändra här |
|---|---|
| Ändra tävlingsdatum, plats, distanser, avgifter, sista anmälningsdag, anmälningslänk, startlista, liveresultat, banfakta eller e-post | Logga in som admin och välj **Årets lopp**. Ändringen syns direkt på startsidan och i inbjudan. Kontrollera med Skriv ut att inbjudan fortfarande ryms på en A4 |
| Ställa in loppet | **Årets lopp** → Status: Inställt. Skriv också en nyhet som viktigt meddelande |
| Lägga in årets resultat | Logga in som admin, gå till Resultat och välj **Lägg in resultat** på årets lopp |
| Lägga till, ändra eller ta bort ett äldre år | Resultat → **+ Lägg till år**, eller **Redigera** och **Ta bort** vid året |
| Ändra övrig text, PM eller inbjudans fasta text | `index.html` och `inbjudan.html` |
| Ändra färger eller layout | `src/styles.css` (färgerna är variabler överst) och färgerna överst i `src/inbjudan.css`. De utgår från OK Renens Renenblå `#005DB9` och Renenröd `#E12627` |
| Byta Swishnummer | `SWISH_NUMBER` och `SWISH_DISPLAY` i `src/cms/render.js` (avgiftsraderna och numret i Swish-rutan), QR-kodens alt-text och PM-punkten i `index.html`, foten i `inbjudan.html` (numret och länken till Swish-appen) och bilden `public/grafik/swish-qr-kod.png`. I inbjudan är QR-koden ritad som vektor ur bilden, så den ritningen måste också göras om |
| Lägga till en nyhetsetikett | Samma lista på tre ställen, se nedan |
| Lägga till eller ta bort en admin | `npm run admin -- add/remove <e-post> --project renrajden-ae53c`, eller samlingen `admins` i Firebase-konsolen |

## Datamodell

**`news/{id}`**: en nyhet. Alla kan läsa, bara admins kan skriva.

| Fält | Typ | Regel |
|---|---|---|
| `title` | string | 1–160 tecken |
| `date` | string | `ÅÅÅÅ-MM-DD` |
| `tag` | string | `Info`, `Resultat`, `Ändring`, `Inställt` eller `Valla` |
| `body` | string | Max 4000 tecken. Tom rad ger nytt stycke |
| `links` | array | Max 12 st `{ label, url }`, `url` börjar med `https://` |
| `pinned` | bool | Visas först |
| `alert` | bool | Visas som röd banner högst upp |
| `createdAt` | timestamp | Får inte ändras efter skapandet |
| `createdBy` | string eller null | Användar-ID |
| `updatedAt` | timestamp | Måste vara serverns tid |
| `updatedBy` | string | Måste vara den inloggades ID |

**`settings/event`**: årets lopp. Ett enda dokument. Alla kan läsa, bara admins kan ändra, ingen kan ta bort.

| Fält | Typ | Regel |
|---|---|---|
| `date` | string | `ÅÅÅÅ-MM-DD`, tävlingsdagen. Årtalet blir loppets namn (Renrajden 2027) |
| `startTime` | string | `TT:MM` |
| `status` | string | `planned` eller `cancelled` |
| `venue`, `venueArea` | string | Arena (1–60 tecken) och område (max 60) |
| `mapUrl`, `registrationUrl`, `startListUrl`, `liveResultsUrl` | string | Tom eller `https://…` |
| `deadline` | string | Tom eller `ÅÅÅÅ-MM-DD` |
| `email` | string | E-postadress, max 100 tecken |
| `lapKm` | number | Slingans längd, över 0 och högst 50 |
| `climbPerLap`, `waterPerLap`, `coldLimit` | int | 0–2000, 0–10 och −50–0 |
| `distances` | array | 1–4 st `{ km, laps, classes, fee, lateFee, note }`. `laps` 1–6, avgifter i hela kronor |
| `updatedAt`, `updatedBy` | | Som för nyheter |

**`years/{år}`**: ett år i resultatarkivet. Dokument-ID är årtalet. Alla kan läsa, bara admins kan skriva och ta bort.

| Fält | Typ | Regel |
|---|---|---|
| `year` | int | Samma som dokument-ID, 1990–2100 |
| `status` | string | `held` eller `cancelled` (struket år) |
| `date` | string | Tom eller `ÅÅÅÅ-MM-DD` |
| `text` | string | Max 300 tecken |
| `winners` | array | Max 6 st `{ class, names }` |
| `links` | array | Max 12 st `{ label, url }`. `url` får börja med `http://` här, eftersom arkivet har gamla länkar |
| `invitation` | map eller null | `{ label, url }`, visas under Tidigare inbjudningar |
| `updatedAt`, `updatedBy` | | Som för nyheter |

**`admins/{e-post}`**: en administratör. Dokument-ID är Google-adressen med små bokstäver. Kan bara läsas av personen själv och kan inte ändras från webbläsaren.

## Regler att hålla isär

- **Admin** = inloggad med Google, verifierad e-post och ett dokument i `admins`. Kontrollen görs i `firestore.rules`. Knapparna i `src/admin.js` är bara bekvämlighet.
- **Nyhetsetiketterna** finns på tre ställen som måste stämma överens: `TAGS` i `src/news.js`, `<select id="f-tag">` i `index.html` och listan i `validNews` i `firestore.rules`.
- **Ändras en regel** i `firestore.rules` ska ett test läggas till i `tests/rules.test.mjs`.
- **Firestore Lite** används, inte full Firestore. Nyheterna hämtas på nytt varje minut och efter varje ändring. Det finns ingen live-prenumeration.
- **Årets lopp och resultatarkivet** står inte i `index.html` och `inbjudan.html`. Där finns tomma platser, `<dl data-cms="facts"></dl>` och `{{cms:title}}`. När sajten byggs hämtar `scripts/vite-cms.mjs` innehållet från Firestore och fyller platserna, så att sidan fungerar utan JavaScript och sökmotorer ser rätt datum. I webbläsaren hämtar `src/cms/runtime.js` det senaste och ritar om det som ändrats. Platserna måste vara tomma i källfilen, annars stoppas bygget.
- **Första sparningen** i adminläget kopierar standardinnehållet (`src/cms/defaults.js`) till Firestore i samma batch, så att inget år försvinner. Därefter är det Firestore som gäller, och `defaults.js` används bara om Firestore saknar innehållet.
- **Rutan Segrare i arkivet** är en tabell med ett år per rad och herrar och damer i var sin kolumn. Klassens första bokstav avgör kolumnen (H eller D, `winSex` i `src/cms/render.js`). En segrare vars klass inte börjar med H eller D får en egen rad över båda kolumnerna.
- **Segrarna på 21 km** är dolda i arkivet tills besökaren kryssar i *21 km* ovanför listan. Filtret är ren CSS (`#vis-42`, `#vis-21` i `index.html`). Vilken grupp en segrare hör till avgörs av den största siffran i klassen (`winDist` i `src/cms/render.js`): under 30 blir 21 km (H21, D20, H22), annars 42 km (H42, D40, "42 km").
- **Gränserna** för årets lopp och resultatarkivet finns på två ställen som måste stämma överens: `LIMITS` i `src/cms/model.js` och `validEvent`/`validYear` i `firestore.rules`.
- **Logotypen och renhuvudet** ligger som symbolerna `#okrenen` och `#ren` längst ner i både `index.html` och `inbjudan.html`, och ska vara likadana i båda. De är tagna direkt ur vektorerna i `public/grafik/okrenen-logoark.pdf`. Renen får färg från `currentColor`. Logotypens bakgrund styrs med `--logo-bg` (transparent på blå botten) och färgen på RENEN med `--logo-renen`.
- **Webbkonfigurationen** (`VITE_FIREBASE_*`) läses från miljövariabler. Lokalt i `.env.local` eller `.env.emulator`, i GitHub som repository variables.

## Publicering

| Händelse | Vad som händer |
|---|---|
| Push eller PR | Testerna körs |
| PR | Förhandsversion publiceras, länk som kommentar i PR:en |
| Push till `main` | Säkerhetsregler publiceras, sedan byggs och publiceras sajten med innehållet från Firestore. Går Firestore inte att nå avbryts publiceringen |
| Varje natt (03:17 UTC) | Sajten byggs om och publiceras, så att HTML:en för sökmotorer och delningar får med det admins har ändrat |
| Actions → Run workflow på `main` | Publicerar igen utan kodändring |

GitHub behöver variablerna `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` och secret `FIREBASE_SERVICE_ACCOUNT`. Hela uppsättningen står i [docs/driftsattning.md](docs/driftsattning.md).

## Källor

Innehållet kommer från den gamla bloggen renrajden.blogspot.com, hämtat i november 2026. Länkar till resultat från 2013–2018 kan vara döda.
