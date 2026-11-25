# Renrajden

Webbplats för **Renrajden**, OK Renens klassiska långlopp på Ormberget i Luleå. Loppet är seedningsgrundande för Vasaloppet. Nästa upplaga: lördag 30 januari 2027.

- Alla besökare ser all information och alla nyheter, utan inloggning.
- Bara administratörer loggar in (med Google) och kan skapa, ändra och ta bort nyheter.

## Snabbfakta

| | |
|---|---|
| Live (Firebase) | https://renrajden-ae53c.web.app |
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
| Data | Firestore, samlingarna `news` och `admins` |
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
| `npm test` | Kör alla tester (regler och ände-till-ände) |
| `npm run test:rules` | Testar bara säkerhetsreglerna |
| `npm run test:e2e` | Bygger och testar sajten i Chromium |
| `npm run seed -- --emulator` | Fyller emulatorn med de 22 gamla nyheterna |
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
| `index.html` | Allt sidinnehåll: text, fakta, PM, resultatarkiv, dialoger |
| `src/main.js` | Ingång. Laddar CSS, typsnitt, nyheter och (vid behov) admin |
| `src/site.js` | Nedräkning, lägen, meny, km-mätare, distansväljare, packlista |
| `src/news.js` | Hämtar och visar nyheter |
| `src/admin.js` | Google-inloggning och hantering av nyheter |
| `src/firebase.js` | Firebase-konfiguration och emulatorstöd |
| `src/ui.js` | Gemensamma hjälpfunktioner, toast och dialoger |
| `src/styles.css` | All design |
| `firestore.rules` | Säkerhetsregler |
| `scripts/admin.mjs` | Lägg till, ta bort och lista administratörer |
| `scripts/seed-news.mjs` | Importerar gamla nyheter från `prototyp/seed-news.json` |
| `tests/rules.test.mjs` | Tester av säkerhetsreglerna |
| `tests/e2e.mjs` | Ände-till-ände-tester |
| `.github/workflows/firebase.yml` | Tester, förhandsversion för PR och publicering |
| `.github/workflows/importera-nyheter.yml` | Manuell import av gamla nyheter |
| `docs/driftsattning.md` | Steg-för-steg för Firebase, GitHub och domän |
| `docs/ux-utvardering.md` | UX- och tillgänglighetsutvärdering |
| `prototyp/`, `dev/` | Den ursprungliga UX-prototypen och dess verktyg |

## Vanliga ändringar

| Jag vill … | Ändra här |
|---|---|
| Ändra text, fakta eller PM | `index.html` |
| Ändra tävlingsdatum | `src/site.js` (`RACE_DATE`) och texterna i `index.html` |
| Lägga till ett års resultat | `index.html`, listan `<ol class="years">` |
| Ändra färger eller layout | `src/styles.css` (färgerna är variabler överst) |
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

**`admins/{e-post}`**: en administratör. Dokument-ID är Google-adressen med små bokstäver. Kan bara läsas av personen själv och kan inte ändras från webbläsaren.

## Regler att hålla isär

- **Admin** = inloggad med Google, verifierad e-post och ett dokument i `admins`. Kontrollen görs i `firestore.rules`. Knapparna i `src/admin.js` är bara bekvämlighet.
- **Nyhetsetiketterna** finns på tre ställen som måste stämma överens: `TAGS` i `src/news.js`, `<select id="f-tag">` i `index.html` och listan i `validNews` i `firestore.rules`.
- **Ändras en regel** i `firestore.rules` ska ett test läggas till i `tests/rules.test.mjs`.
- **Firestore Lite** används, inte full Firestore. Nyheterna hämtas på nytt varje minut och efter varje ändring. Det finns ingen live-prenumeration.
- **Webbkonfigurationen** (`VITE_FIREBASE_*`) läses från miljövariabler. Lokalt i `.env.local` eller `.env.emulator`, i GitHub som repository variables.

## Publicering

| Händelse | Vad som händer |
|---|---|
| Push eller PR | Testerna körs |
| PR | Förhandsversion publiceras, länk som kommentar i PR:en |
| Push till `main` | Säkerhetsregler och sajt publiceras |
| Actions → Run workflow på `main` | Publicerar igen utan kodändring |

GitHub behöver variablerna `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` och secret `FIREBASE_SERVICE_ACCOUNT`. Hela uppsättningen står i [docs/driftsattning.md](docs/driftsattning.md).

## Källor

Innehållet kommer från den gamla bloggen renrajden.blogspot.com, hämtat i november 2026. Länkar till resultat från 2013–2018 kan vara döda.
