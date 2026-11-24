# Renrajden

Ny webbplats för **Renrajden**, OK Renens klassiska långlopp på Ormberget i Luleå. Loppet är seedningsgrundande för Vasaloppet. Nästa upplaga körs lördag 30 januari 2027.

Det här repot innehåller UX-prototypen och är grunden för den skarpa sajten som ska ersätta dagens renrajden.se (en Blogger-blogg).

## Status

| Del | Läge |
|---|---|
| UX-prototyp (en HTML-sida) | Klar, version 2 efter UX-utvärdering |
| Innehåll från renrajden.se | Överfört: alla sidor och 22 blogginlägg som nyheter |
| Nyheter (CRUD) för admins | Fungerar i prototypen. Inloggningen är simulerad. |
| Skarp sajt med Google-inloggning | Ej påbörjad. Se förslaget nedan. |

Prototypen är också publicerad som en Claude-artefakt: <https://claude.ai/artifact/PwuU3ouB9nq1pnThraWpfs> (privat tills den delas).

## Struktur

```
prototyp/index.html       Hela prototypen: HTML, CSS och JS i en fil (utan doctype/head, som läggs på vid publicering)
prototyp/seed-news.json   Nyheterna, flyttade från bloggen (22 st)
docs/ux-utvardering.md    UX- och tillgänglighetsutvärdering (WCAG 2.2 AA, axe-core) plus åtgärdslogg
dev/mock-claude.js        Lokal mock av databasen och inloggningen
dev/build-preview.js      Bygger dev/preview.html som går att öppna direkt i webbläsaren
dev/harness.js            Playwright-harness för tester och skärmdumpar
dev/shots.js              Skärmdumpar i ljust/mörkt tema på desktop och mobil
dev/verify.js             Funktionstest av fokus, CRUD, ångra, mobilmeny och lägen
```

## Kom igång

Förhandsvisa utan installation (kräver bara Node):

```bash
npm run preview          # besökare
npm run preview:admin    # inloggad admin: skapa, redigera, ta bort nyheter
```

Öppna sedan `dev/preview.html` i webbläsaren. Mocken håller nyheterna i minnet, så ändringar försvinner när sidan laddas om.

Tester och skärmdumpar (kräver Playwright):

```bash
npm install
npx playwright install chromium
npm run verify
npm run shots
```

## Design

Designen bygger på OK Renens klubbväst: västblått `#4561AE`, vitt, rött `#C8102E` och den ljusblå renen.

- **Välvd rubrik:** "RENRAJDEN 2027" är välvd som trycket "OK Renen" på västen.
- **Nummerlapp:** nedräkningen till start visas på en nummerlapp.
- **Km-mätare:** västens röda sidopanel blir en km-mätare med dubbelspår (≥1360 px). Scrollen är 42 km i fyra varv, och varvgränserna ligger vid Anmälan, Bana och Resultat.
- **Lägen:** sidan byter läge automatiskt: före loppet, tävlingsvecka, tävlingsdag och efter loppet. Under "Om prototypen" i sidfoten går lägena att förhandsvisa.
- **Typsnitt:** Big Shoulders Display, Familjen Grotesk och JetBrains Mono (Google Fonts).
- **Tillgänglighet:** ljust och mörkt tema, WCAG 2.2 AA, tangentbord, reducerad rörelse och forced colors.

## Nyheter och inloggning

- Allt innehåll och alla nyheter är öppna för alla. Bara administratörer loggar in.
- I prototypen läses och skrivs nyheterna via artefaktens databas (`window.claude.use("db")`), och adminrollen kommer från `use("user")`. Databasregeln är läsning för alla och skrivning bara för admin.
- Datamodell per nyhet: `title`, `date` (ÅÅÅÅ-MM-DD), `tag` (Info, Resultat, Ändring, Inställt, Valla), `body` (tom rad ger nytt stycke), `links` [{`label`, `url` (måste vara https)}], `pinned`, `alert` (röd banner högst upp), `createdAt`, `createdBy`, `updatedAt` och `updatedBy`.

## Förslag för den skarpa sajten

1. **Hosting:** statisk sajt (till exempel Astro eller ren HTML) på Firebase Hosting, GitHub Pages eller Netlify, med renrajden.se pekad dit.
2. **Inloggning:** Google via OpenID Connect, med Firebase Authentication och Google som leverantör. Bara e-postadresser på klubbens adminlista släpps in. Övriga får beskedet "Endast administratörer".
3. **Data:** Firestore-samlingen `news` med samma datamodell som prototypen. Säkerhetsreglerna ger alla läsrätt och ger skrivrätt bara när `request.auth.token.email` finns i adminlistan (lagrad i en egen samling eller som custom claims).
4. **Migrering:** importera `prototyp/seed-news.json`.
5. **Kvar från utvärderingen:** `<html lang="sv">` i skelettet och en resultatlista som renderas statiskt, så att den fungerar utan JavaScript.

## Källor

Innehållet kommer från renrajden.se (renrajden.blogspot.com), hämtat i november 2026. Länkar till resultat och inbjudningar från 2013–2018 pekar på gamla adresser och kan vara döda.
