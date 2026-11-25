# Renrajden

Webbplats för **Renrajden**, OK Renens klassiska långlopp på Ormberget i Luleå. Loppet är seedningsgrundande för Vasaloppet. Nästa upplaga körs lördag 30 januari 2027.

Sajten ersätter den gamla Blogger-bloggen på renrajden.se. All information och alla nyheter är öppna för alla. Bara arrangörens administratörer loggar in, med sitt Google-konto, för att skriva, ändra och ta bort nyheter.

## Teknik

| Del | Val |
|---|---|
| Sajt | Statisk HTML, CSS och JS byggd med Vite. Typsnitten ligger på egen server (Fontsource). |
| Hosting | Firebase Hosting med renrajden.se som egen domän |
| Inloggning | Firebase Authentication med Google (OpenID Connect) |
| Nyheter | Firestore (samlingen `news`). Besökare läser via Firestore Lite, och listan hämtas om varje minut. |
| Behörighet | Firestore-regler: alla läser, bara konton i `admins` skriver |
| Test | Regeltester och ände-till-ände-tester (Playwright) mot Firebase-emulatorerna |
| Publicering | GitHub Actions: tester på varje push och PR, förhandsversion för PR, publicering från `main` |

Besökare laddar cirka 55 kB gzippad JavaScript. Inloggningskoden (cirka 40 kB) laddas bara för administratörer. Sidan sätter inga cookies för spårning.

## Struktur

```
index.html                Hela sidan (innehåll, SEO, strukturerad data för evenemanget)
src/main.js               Ingång: typsnitt, CSS, sidans interaktivitet, laddar nyheter och admin vid behov
src/site.js               Nedräkning och lägen, meny, km-mätare, distansväljare, packlista
src/news.js               Hämtar och visar nyheter, arkiv, viktigt meddelande
src/admin.js              Google-inloggning, kontroll av adminlistan, skapa, redigera, ta bort och ångra
src/firebase.js           Firebase-konfiguration (via miljövariabler) och emulatorstöd
src/ui.js                 Gemensamma hjälpfunktioner, toast och dialoger
src/styles.css            Design (OK Renens klubbfärger, ljust och mörkt tema)
firestore.rules           Säkerhetsregler
scripts/admin.mjs         Lägg till, ta bort och lista administratörer
scripts/seed-news.mjs     Importera bloggens 22 nyheter
tests/rules.test.mjs      Tester av säkerhetsreglerna
tests/e2e.mjs             Ände-till-ände: besökare, nekad inloggning, admin-CRUD, ångra, mobil
prototyp/, dev/           UX-prototypen och dess verktyg (se nedan)
docs/ux-utvardering.md    UX- och tillgänglighetsutvärdering (WCAG 2.2 AA)
```

## Utveckla lokalt

Kräver Node 20+ och Java 21+ (för Firestore-emulatorn). Inget Firebase-projekt behövs.

```bash
npm install
npx playwright install chromium
```

Starta emulatorerna i ett fönster:

```bash
npm run emulators
```

Fyll emulatorn med nyheter och gör dig själv till admin, i ett annat fönster:

```bash
npm run seed -- --emulator
```

```bash
npm run admin -- add din.adress@gmail.com --emulator
```

Starta sajten mot emulatorerna:

```bash
npm run dev:emulator
```

Öppna http://localhost:5173. Vid inloggning visar emulatorn ett låtsas-Google-fönster. Välj "Add new account" och skriv adressen du gjorde till admin.

Lägena kring tävlingsdagen kan förhandsvisas med `?lage=tavlingsvecka`, `?lage=tavlingsdag` eller `?lage=efter`.

### Tester

```bash
npm test
```

`npm test` kör både `test:rules` (säkerhetsreglerna) och `test:e2e` (bygger sajten och testar den i Chromium mot emulatorerna). Skärmdumparna hamnar i `tests/out/`.

## Driftsättning (en gång)

Följ den detaljerade guiden i [docs/driftsattning.md](docs/driftsattning.md). I korthet:

1. Skapa ett Firebase-projekt med Firestore (Europa) och slå på Google-inloggning.
2. Lägg webbkonfigurationen som GitHub-variabler (`VITE_FIREBASE_*`) och ett servicekonto som secret (`FIREBASE_SERVICE_ACCOUNT`).
3. Lägg till administratörer och importera bloggens nyheter.
4. Slå ihop till `main`. GitHub Actions testar och publicerar till `<projekt-id>.web.app`.
5. Peka om renrajden.se från Blogger, ta bort den anpassade domänen i Blogger och godkänn domänen för inloggning.

Guiden har också ett avsnitt om gratisplanens tak inför tävlingsdagen, och en felsökningstabell.

### Administratörer

- `npm run admin -- list --project <id>` visar alla administratörer.
- `npm run admin -- remove namn@gmail.com --project <id>` tar bort en.
- Adressen ska vara den som personen loggar in med hos Google. Versaler spelar ingen roll.
- Den som loggar in men inte står på listan loggas ut direkt och får ett besked om att bara administratörer har tillgång. Firebase sparar ändå ett användarkonto för inloggningen. Det ger ingen behörighet, men om ni vill stoppa sådana konton redan vid inloggningen kan ni slå på Identity Platform och använda en blockerande funktion (`beforeSignIn`).

## Säkerhet

Reglerna i `firestore.rules` gör sajten säker oavsett vad webbläsaren skickar:

- Alla kan läsa nyheter. Ingen utan adminbehörighet kan skriva.
- **Admin** innebär tre saker:
  - inloggad med Google
  - verifierad e-postadress
  - dokumentet `admins/{e-post}` finns
- Adminlistan går inte att läsa i sin helhet eller ändra från webbläsaren.
- **Kontroll av nyheter:** varje nyhet kontrolleras på servern:
  - fasta fält
  - längder
  - etikett ur en fast lista
  - datumformat
  - högst 12 länkar, och alla börjar med `https://`
  - `updatedBy` måste vara den inloggade och `updatedAt` serverns tid
- Allt annat i databasen är stängt.

## Prototypen

`prototyp/index.html` är UX-prototypen som publicerades som en Claude-artefakt: <https://claude.ai/artifact/PwuU3ouB9nq1pnThraWpfs>. Den har en mock av databasen och kan förhandsvisas utan Firebase:

```bash
npm run proto:preview:admin
```

Öppna sedan `dev/preview.html`. Med `npm run proto:verify` körs prototypens tester.

## Källor

Innehållet kommer från den gamla bloggen renrajden.se (renrajden.blogspot.com), hämtat i november 2026. Länkar till resultat och inbjudningar från 2013–2018 pekar på gamla adresser och kan vara döda.
