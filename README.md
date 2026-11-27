# Renrajden

Webbplats för **Renrajden**, OK Renens klassiska långlopp på Ormberget i Luleå. Loppet är seedningsgrundande för Vasaloppet. Nästa upplaga: lördag 30 januari 2027.

- Alla besökare ser all information och alla nyheter, utan inloggning.
- Bara administratörer loggar in (med Google). De kan skapa, ändra och ta bort nyheter, ändra årets lopp (datum, plats, distanser, avgifter, länkar och banfakta), sköta resultatarkivet, ändra partnerna och lägga in bilder och filmer.

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
| Data | Firestore, samlingarna `news`, `settings`, `years`, `media` och `admins` |
| Filer | Cloud Storage: bilder och filmer som admins laddar upp, under `galleri/` |
| Behörighet | `firestore.rules` och `storage.rules` |
| Tester | Node-test och Playwright mot Firebase-emulatorerna |
| CI/CD | `.github/workflows/firebase.yml` |

## Kommandon

| Kommando | Vad det gör |
|---|---|
| `npm install` | Installerar beroenden |
| `npm run emulators` | Startar lokala Firebase-emulatorer för Auth, Firestore och Storage (kräver Java 21+) |
| `npm run dev:emulator` | Startar sajten på http://localhost:5173 mot emulatorerna |
| `npm run dev` | Startar sajten mot riktiga Firebase (kräver `.env.local`) |
| `npm run build` | Bygger sajten till `dist/` |
| `npm test` | Kör alla tester (enhet, regler och ände-till-ände) |
| `npm run test:unit` | Testar datamodellen och renderingen av årets lopp, resultatarkivet, partnerna och bilderna (ingen emulator) |
| `npm run test:rules` | Testar bara säkerhetsreglerna, för Firestore och Storage |
| `npm run test:e2e` | Bygger och testar sajten i Chromium |
| `npm run seed -- --emulator` | Fyller emulatorn med de 22 gamla nyheterna |
| `npm run segrare -- --emulator` | Fyller i segrare och datum från `src/cms/defaults.js` i arkivet, där de saknas. År som saknas i Firestore skapas och saknade segrarklasser läggs till. Med `--force` ("Ersätt" i arbetsflödet) blir segrare, datum och text exakt som i `defaults.js`. Mot riktiga projektet via Actions → **Importera segrare till arkivet** |
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
| `index.html` | Sidans struktur och den fasta texten (PM, seedning, kontakt). Årets lopp, resultatarkivet och partnerna är tomma platser, se nedan |
| `inbjudan.html` | Inbjudan till årets lopp som ett utskrivbart A4-ark, på `/inbjudan` |
| `src/main.js` | Ingång. Laddar CSS, typsnitt, nyheter, årets lopp och (vid behov) admin |
| `src/site.js` | Nedräkning, lägen, meny, km-mätare, distansväljare, packlista |
| `src/news.js` | Hämtar och visar nyheter |
| `src/bilder.js` | Bildsektionen: filmen, val av kategori, rutnät och helskärmsvisning av bilder och filmer. Hämtar bilderna från Firestore när besökaren närmar sig Bilder |
| `src/media.js` | Datamodellen för bilder och filmer: kategorier, gränser, sortering och adresser till filerna |
| `src/media-admin.js` | Adminläget för Bilder: ladda upp (dra och släpp eller välj flera filer), ändra år, text och kategori, ta bort |
| `src/admin.js` | Google-inloggning och hantering av nyheter |
| `src/cms-admin.js` | Adminläget för årets lopp, resultatarkivet och partnerna |
| `src/admin-kit.js` | Gemensamt för adminformulären: fel, osparat, rader, bekräfta borttagning |
| `src/cms/defaults.js` | Standardinnehållet för årets lopp, resultatarkivet och partnerna (används tills något sparats i Firestore) |
| `src/cms/model.js` | Datamodell, gränser och svensk formatering |
| `src/cms/render.js` | Gör HTML av innehållet. Används både vid bygget och i webbläsaren |
| `src/cms/runtime.js` | Hämtar innehållet från Firestore i webbläsaren och ritar om det som ändrats |
| `scripts/vite-cms.mjs` | Vite-plugin som fyller platserna när sajten byggs |
| `src/firebase.js` | Firebase-konfiguration och emulatorstöd |
| `src/ui.js` | Gemensamma hjälpfunktioner, toast och dialoger |
| `src/styles.css` | All design |
| `src/inbjudan.js`, `src/inbjudan.css` | Typsnitt, utskriftsknapp och A4-layout för inbjudan |
| `public/grafik/` | OK Renens logotyp (`okrenen-logo`, `-vit` och `-vit-rod`, som SVG och PNG), renhuvudet (`okrenen-ren`), originalet `okrenen-logoark.pdf` och Swish-QR-koden (`swish-qr.png` som den levererades, `swish-qr-kod.png` beskuren för sajten och inbjudan). Allt nås också på renrajden.se/grafik/ |
| `public/bilder/` | Bilderna från gamla bloggen, en mapp per kategori (`foton`, `affischer`, `banor`, `sponsorer`, `seedning`), miniatyrer i `mini/` och listan `bilder.json` (fil, miniatyr, kategori, år, titel, mått). Listan visas tills en admin har sparat något i Bilder. Då kopieras den till samlingen `media`, och därefter läggs nya bilder in från adminläget, inte här |
| `public/video/` | Filmen från Renrajden 2024 (720p) och dess stillbild |
| `public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png` | Flikikonen: renhuvudet på Renenblå |
| `firestore.rules` | Säkerhetsregler för Firestore |
| `storage.rules` | Säkerhetsregler för Cloud Storage (bilder och filmer) |
| `scripts/admin.mjs` | Lägg till, ta bort och lista administratörer |
| `scripts/seed-news.mjs` | Importerar gamla nyheter från `prototyp/seed-news.json` |
| `scripts/segrare.mjs` | Fyller i segrare och datum från `src/cms/defaults.js` i resultatarkivet i Firestore |
| `tests/cms.test.mjs` | Enhetstester av datamodellen och renderingen |
| `tests/media.test.mjs` | Enhetstester av datamodellen för bilder och filmer |
| `tests/rules.test.mjs`, `tests/storage.test.mjs` | Tester av säkerhetsreglerna för Firestore och Storage |
| `tests/fixtures/` | Små testfiler (bild, PNG och film) för uppladdningen i ände-till-ände-testerna |
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
| Lägga till, ändra, flytta eller ta bort en partner | Logga in som admin och välj **Partners** i adminraden eller **Redigera partners** under Partners. Ordningen i formuläret är ordningen på sidan. En partner med webbadress blir en länk. Slutar en partner: ta bort raden och skriv namnet under Tidigare partners. Högst 12 partners |
| Lägga in bilder och filmer | Logga in som admin och dra filerna var som helst på sidan, eller välj **Bilder** i adminraden eller **+ Lägg till bilder och filmer** under Bilder. Det går att välja flera filer på en gång. År och text är frivilliga: året för alla fylls i en gång, och kan ändras på en enskild fil. Stora bilder förminskas till 2048 pixlar innan de laddas upp. Filmer: MP4 eller WebM, högst 200 MB. Kräver att Storage är påslaget, se [docs/driftsattning.md](docs/driftsattning.md) steg 10 |
| Ändra år, text eller kategori på en bild, eller ta bort den | Logga in som admin. Under Bilder har varje bild och film knapparna **Redigera** och **Ta bort**. Borttagning går att ångra direkt efteråt |
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

**`settings/partners`**: partnerna under Partners på startsidan. Ett enda dokument. Alla kan läsa, bara admins kan ändra, ingen kan ta bort. Saknas det visas partnerna i `src/cms/defaults.js`. Det sparas för sig och påverkas inte av första sparningen av årets lopp.

| Fält | Typ | Regel |
|---|---|---|
| `partners` | array | Max 12 st `{ name, text, url }` i den ordning de visas. `name` 1–60 tecken, `text` (raden under namnet) max 60, `url` tom eller `https://…` |
| `former` | string | Tidigare partners, ett namn per rad. Max 500 tecken. Visas som "Tidigare år: A, B och C." |
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

**`media/{id}`**: en bild eller film under Bilder. Alla kan läsa, bara admins kan skriva och ta bort. Dokument-ID är Firestores eget för uppladdade filer, och till exempel `foton-2015-tre-akare-i-dimman` för bilderna från gamla bloggen.

| Fält | Typ | Regel |
|---|---|---|
| `type` | string | `image` eller `video` |
| `category` | string | Bilder: `foton`, `affischer`, `banor`, `sponsorer` eller `seedning`. Filmer: alltid `filmer` |
| `year` | int eller null | 1990–2100. Frivilligt |
| `text` | string | Max 200 tecken. Frivillig |
| `file` | string | Filen i Storage, `galleri/{id}/bild.jpg` (eller `.png`, `.gif`) och `galleri/{id}/film.mp4` (eller `.webm`), eller en fil i sajten, `/bilder/…` |
| `thumb` | string | Miniatyren eller filmens stillbild, `galleri/{id}/mini.jpg` eller `/bilder/…` |
| `width`, `height` | int | Mått i pixlar, 1–20000 |
| `duration` | number eller null | Filmens längd i sekunder. null för bilder |
| `createdAt`, `createdBy`, `updatedAt`, `updatedBy` | | Som för nyheter |

**`settings/media`**: `{ initialized: true, updatedAt, updatedBy }`. Visar att bilderna från `bilder.json` har kopierats till `media`. Saknas det visar sajten `bilder.json`.

**Cloud Storage, `galleri/{id}/`**: filerna till en uppladdad bild eller film. Alla kan läsa. Bara admins kan ladda upp och ta bort, och en fil kan inte skrivas över. `bild.jpg`, `bild.png` och `bild.gif` högst 15 MB, `mini.jpg` högst 2 MB, `film.mp4` och `film.webm` högst 200 MB.

**`admins/{e-post}`**: en administratör. Dokument-ID är Google-adressen med små bokstäver. Kan bara läsas av personen själv och kan inte ändras från webbläsaren.

## Regler att hålla isär

- **Admin** = inloggad med Google, verifierad e-post och ett dokument i `admins`. Kontrollen görs i `firestore.rules` och `storage.rules`. Knapparna i `src/admin.js` är bara bekvämlighet. `storage.rules` läser adminlistan i Firestore, vilket kräver att Storage har rätt att läsa databasen (se [docs/driftsattning.md](docs/driftsattning.md) steg 10).
- **Nyhetsetiketterna** finns på tre ställen som måste stämma överens: `TAGS` i `src/news.js`, `<select id="f-tag">` i `index.html` och listan i `validNews` i `firestore.rules`.
- **Ändras en regel** i `firestore.rules` ska ett test läggas till i `tests/rules.test.mjs`, och i `storage.rules` ett test i `tests/storage.test.mjs`. Storage-emulatorn behandlar varje uppladdning som en ny fil, så att en fil inte kan skrivas över går inte att testa där.
- **Firestore Lite** används, inte full Firestore. Nyheterna hämtas på nytt varje minut och efter varje ändring. Det finns ingen live-prenumeration.
- **Årets lopp, resultatarkivet och partnerna** står inte i `index.html` och `inbjudan.html`. Där finns tomma platser, `<dl data-cms="facts"></dl>` och `{{cms:title}}`. När sajten byggs hämtar `scripts/vite-cms.mjs` innehållet från Firestore och fyller platserna, så att sidan fungerar utan JavaScript och sökmotorer ser rätt datum. I webbläsaren hämtar `src/cms/runtime.js` det senaste och ritar om det som ändrats. Platserna måste vara tomma i källfilen, annars stoppas bygget.
- **Första sparningen** i adminläget kopierar standardinnehållet (`src/cms/defaults.js`) till Firestore i samma batch, så att inget år försvinner. Därefter är det Firestore som gäller, och `defaults.js` används bara om Firestore saknar innehållet.
- **Rutan Segrare i arkivet** är en tabell med ett år per rad och herrar och damer i var sin kolumn. Klassens första bokstav avgör kolumnen (H eller D, `winSex` i `src/cms/render.js`). En segrare vars klass inte börjar med H eller D får en egen rad över båda kolumnerna.
- **Segrarna på 21 km** är dolda i arkivet tills besökaren kryssar i *21 km* ovanför listan. Filtret är ren CSS (`#vis-42`, `#vis-21` i `index.html`). Vilken grupp en segrare hör till avgörs av den största siffran i klassen (`winDist` i `src/cms/render.js`): under 30 blir 21 km (H21, D20, H22), annars 42 km (H42, D40, "42 km").
- **Gränserna** för årets lopp, resultatarkivet och partnerna finns på två ställen som måste stämma överens: `LIMITS` i `src/cms/model.js` och `validEvent`/`validYear`/`validPartners` i `firestore.rules`.
- **Reglerna får utvärdera högst 1000 uttryck per skrivning.** Listor kontrolleras position för position, så varje post kostar. En partner kostar cirka 60 uttryck och gränsen nås vid 17 partners, därför är taket 12. Höjs ett tak för en lista: lägg till ett test i `tests/rules.test.mjs` som sparar en full lista.
- **Logotypen och renhuvudet** ligger som symbolerna `#okrenen` och `#ren` längst ner i både `index.html` och `inbjudan.html`, och ska vara likadana i båda. De är tagna direkt ur vektorerna i `public/grafik/okrenen-logoark.pdf`. Renen får färg från `currentColor`. Logotypens bakgrund styrs med `--logo-bg` (transparent på blå botten) och färgen på RENEN med `--logo-renen`.
- **Bilderna och filmerna** hämtas från Firestore först när besökaren närmar sig Bilder, så att den som aldrig scrollar dit inte läser något. Besökare hämtar filerna direkt från Storage med en vanlig adress. Storage-biblioteket laddas bara för admins.
- **Första sparningen i Bilder** (en uppladdning, ändring eller borttagning) kopierar bilderna i `public/bilder/bilder.json` till `media`, tio i taget, och skriver `settings/media` sist. Avbryts kopieringen görs den om nästa gång. Därefter är det `media` som gäller.
- **En borttagen bild eller film** försvinner direkt från sajten, men filerna i Storage tas bort först när det inte längre går att ångra (när beskedet med Ångra försvinner). Stängs sidan innan dess ligger filerna kvar i Storage utan att synas.
- **Gränserna för bilder och filmer** finns på tre ställen som måste stämma överens: `MEDIA_LIMITS` i `src/media.js`, `validMedia` i `firestore.rules` och `validFile` i `storage.rules`.
- **Webbkonfigurationen** (`VITE_FIREBASE_*`) läses från miljövariabler. Lokalt i `.env.local` eller `.env.emulator`, i GitHub som repository variables.

## Publicering

| Händelse | Vad som händer |
|---|---|
| Push eller PR | Testerna körs |
| PR | Förhandsversion publiceras, länk som kommentar i PR:en |
| Push till `main` | Säkerhetsregler publiceras (för Storage bara om `VITE_FIREBASE_STORAGE_BUCKET` finns), sedan byggs och publiceras sajten med innehållet från Firestore. Går Firestore inte att nå avbryts publiceringen |
| Varje natt (03:17 UTC) | Sajten byggs om och publiceras, så att HTML:en för sökmotorer och delningar får med det admins har ändrat |
| Actions → Run workflow på `main` | Publicerar igen utan kodändring |

GitHub behöver variablerna `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` och secret `FIREBASE_SERVICE_ACCOUNT`. För uppladdning av bilder och filmer behövs också `VITE_FIREBASE_STORAGE_BUCKET`. Finns den publiceras även `storage.rules`. Hela uppsättningen står i [docs/driftsattning.md](docs/driftsattning.md).

## Källor

Innehållet kommer från den gamla bloggen renrajden.blogspot.com, hämtat i november 2026. Länkar till resultat från 2013–2018 kan vara döda.
