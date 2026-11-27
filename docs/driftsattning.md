# Driftsättning av renrajden.se

En steg-för-steg-guide för att publicera sajten första gången. Räkna med ungefär en timme, plus väntan på att DNS-ändringen slår igenom (från några minuter upp till ett dygn).

**Du behöver:**

- Ett **Google-konto** som ska äga projektet. Använd gärna ett gemensamt klubbkonto, så att sajten inte hänger på en enskild person. Fler ägare kan läggas till senare.
- Ditt **GitHub-konto** (thjo100) med åtkomst till repot.
- Inloggning hos **domänleverantören** för renrajden.se, alltså där DNS-posterna ändras.
- För steg 6: en dator med **Node 20+**, **git** och **Google Cloud CLI** (`gcloud`). Det finns ett alternativ utan dator.

Menynamnen nedan är de engelska. Firebase-konsolen kan visas på svenska, men strukturen är densamma.

---

## 1. Skapa Firebase-projektet

1. Gå till https://console.firebase.google.com och logga in med kontot som ska äga projektet.
2. Klicka på **Create a project** och skriv namnet `Renrajden`.
3. Under namnet visas **projekt-ID:t**, till exempel `renrajden` eller `renrajden-a1b2c`. Klicka på pennan om du vill ändra det. **Anteckna ID:t**, det används i flera steg. Det går inte att ändra senare.
4. **Google Analytics:** välj **bort** det. Sajten behöver det inte, och då slipper ni cookies och samtyckesruta.
5. Klicka på **Create project** och vänta tills det är klart.

**Plan:** projektet startar på gratisplanen **Spark**. Läs avsnittet [Kostnader](#kostnader-och-gratisplanen) längst ned innan tävlingsdagen. Uppgradering till **Blaze** rekommenderas, och kostnaden blir sannolikt 0 kr.

## 2. Skapa Firestore-databasen

1. I vänstermenyn: **Build → Firestore Database → Create database**.
2. Om du får välja utgåva, välj **Standard edition**.
3. **Database ID:** behåll `(default)`. Sajten använder standarddatabasen.
4. **Plats:** välj en plats i Europa, till exempel **europe-north1 (Finland)** eller **eur3 (Europe)**. Platsen går inte att ändra efteråt.
5. Välj **Start in production mode**. Allt är då stängt tills säkerhetsreglerna publiceras i steg 7. Det är rätt.
6. Klicka på **Create**.

## 3. Slå på Google-inloggning

1. **Build → Authentication → Get started**.
2. Fliken **Sign-in method → Add new provider → Google**.
3. Slå på **Enable**.
4. **Public-facing name:** skriv `Renrajden`. Det visas i Googles inloggningsruta.
5. **Project support email:** välj din adress eller klubbens.
6. Klicka på **Save**.

**Kontroll:** under fliken **Settings → Authorized domains** ska det redan stå `localhost`, `<projekt-id>.firebaseapp.com` och `<projekt-id>.web.app`.

## 4. Registrera webbappen och lägg in konfigurationen i GitHub

1. Kugghjulet uppe till vänster → **Project settings → General**.
2. Under **Your apps**, klicka på webbikonen **`</>`**.
3. **App nickname:** `renrajden-web`. Kryssa **inte** i "Also set up Firebase Hosting".
4. Klicka på **Register app**. En kodsnutt visas, ungefär så här:

   ```js
   const firebaseConfig = {
     apiKey: "AIza…",
     authDomain: "renrajden.firebaseapp.com",
     projectId: "renrajden",
     storageBucket: "…",
     messagingSenderId: "…",
     appId: "1:…:web:…"
   };
   ```

5. Spara de fyra värdena `apiKey`, `authDomain`, `projectId` och `appId`. Webbkonfigurationen är inte hemlig, eftersom den syns i alla besökares webbläsare.
6. Öppna repot på GitHub: https://github.com/thjo100/renrajden → **Settings → Secrets and variables → Actions** → fliken **Variables** → **New repository variable**.
7. Lägg in fyra **variabler**, inte secrets. Namnen måste stämma exakt:

   | Name | Value |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | värdet från `apiKey` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | värdet från `authDomain` (tills vidare `<projekt-id>.firebaseapp.com`) |
   | `VITE_FIREBASE_PROJECT_ID` | värdet från `projectId` |
   | `VITE_FIREBASE_APP_ID` | värdet från `appId` |

8. Gå till **Build → Hosting → Get started** i Firebase och klicka igenom guiden utan att köra kommandona. Då aktiveras Hosting i projektet.

## 5. Skapa ett servicekonto för publicering från GitHub

GitHub Actions behöver en nyckel för att få publicera sajten och säkerhetsreglerna.

1. Gå till https://console.cloud.google.com och välj **samma projekt** i projektväljaren högst upp. Firebase-projekt är Google Cloud-projekt.
2. **IAM & Admin → Service Accounts → Create service account**.
3. Fyll i:
   - **Name:** `github-deploy`
   - **Description:** `Publicering från GitHub Actions`
4. Klicka på **Create and continue**. Lägg till följande roller med **Add another role**:
   - **Firebase Hosting Admin** publicerar sajten.
   - **Firebase Rules Admin** publicerar säkerhetsreglerna.
   - **API Keys Viewer** behövs för att publiceringsverktyget ska fungera.
   - **Firebase Authentication Admin** lägger till förhandsversionernas adresser som godkända domäner, så att inloggning fungerar även där.
   - **Service Usage Consumer** låter verktyget kontrollera att Firestore är påslaget.
5. Klicka på **Done**.
6. Klicka på servicekontot i listan → fliken **Keys → Add key → Create new key → JSON → Create**. En `.json`-fil laddas ned.
7. I GitHub: **Settings → Secrets and variables → Actions** → fliken **Secrets** → **New repository secret**.
   - **Name:** `FIREBASE_SERVICE_ACCOUNT`
   - **Secret:** öppna JSON-filen i en textredigerare och klistra in **hela** innehållet, från `{` till `}`.
8. Radera JSON-filen från datorn, eller förvara den säkert. Den ger rätt att publicera.

## 6. Lägg till administratörer och importera nyheterna

### 6a. Administratörer, utan dator

1. Firebase-konsolen → **Firestore Database → Data → Start collection**.
2. **Collection ID:** `admins`.
3. **Document ID:** Google-adressen som ska vara admin, **med små bokstäver**, till exempel `fornamn.efternamn@gmail.com`.
4. Lägg till ett fält:
   - **Field:** `email`
   - **Type:** string
   - **Value:** samma adress
5. Klicka på **Save**. Upprepa för fler administratörer med **Add document** i samlingen `admins`.

### 6b. Importera de 22 nyheterna från bloggen

Importen görs efter att sajten publicerats i steg 7, eftersom arbetsflödet finns i GitHub först när koden ligger på `main`. Fram till dess visar sajten "Inga nyheter än".

#### Utan egen dator: via GitHub Actions (rekommenderas)

1. Ge servicekontot rätt att skriva i databasen:
   1. Gå till Google Cloud-konsolen → **IAM & Admin → IAM**.
   2. Hitta `github-deploy@<projekt-id>.iam.gserviceaccount.com` och klicka på pennan (**Edit principal**).
   3. **Add another role → Cloud Datastore User → Save**.
2. GitHub → fliken **Actions** → **Importera bloggens nyheter** i listan till vänster → **Run workflow** → gren `main` → **Run workflow**.
3. Efter en till två minuter visas en grön bock. Klicka på körningen och öppna steget **Importera**. Det ska stå `22 nyheter importerade, 0 fanns redan`.
4. Ta bort rollen **Cloud Datastore User** igen på samma ställe, med papperskorgen vid rollen. Servicekontot behöver den inte för vanlig publicering.

Arbetsflödet hoppar över nyheter som redan finns, så det är ofarligt att köra det igen.

#### Alternativ: Google Cloud Shell (terminal i webbläsaren)

Cloud Shell är gratis och har redan `gcloud`, `git` och Node installerade.

1. Gå till https://shell.cloud.google.com och logga in med kontot som äger projektet.
2. Repot är privat, så git behöver en GitHub-token:
   1. Gå till GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   2. Välj repot `renrajden` och ge rätten **Contents: Read-only**.
3. Kör kommandona ett i taget och byt `<projekt-id>` mot ditt ID. Vid `git clone` är användarnamnet `thjo100` och lösenordet din token.

   ```bash
   gcloud config set project <projekt-id>
   ```

   ```bash
   gcloud auth application-default login
   ```

   ```bash
   git clone https://github.com/thjo100/renrajden.git
   ```

   ```bash
   cd renrajden
   ```

   ```bash
   npm ci
   ```

   ```bash
   npm run seed -- --project <projekt-id>
   ```

#### Alternativ: egen dator

Gör som i Cloud Shell, men installera först Node 20+, git och Google Cloud CLI (https://cloud.google.com/sdk/docs/install). Kör `gcloud auth application-default set-quota-project <projekt-id>` efter inloggningen.

Administratörer kan också hanteras från terminalen i stället för som i 6a:

```bash
npm run admin -- add fornamn.efternamn@gmail.com --project <projekt-id>
```

## 7. Publicera

1. Slå ihop pull requesten (thjo100/renrajden#1) till `main`. Säg till Claude, eller klicka på **Merge pull request** på GitHub.
2. Fliken **Actions** i GitHub visar körningen "Test och publicering". Först körs testerna (cirka 5 minuter), sedan publiceras säkerhetsreglerna, och därefter byggs och publiceras sajten med årets lopp, resultatarkivet och partnerna från Firestore. Samma publicering körs också automatiskt varje natt.
3. När körningen är grön finns sajten på **https://renrajden.web.app** (webbplatsen `renrajden`, satt i `firebase.json`).
   Adressen `renrajden.web.app` måste finnas under **Authentication → Settings → Authorized domains**, annars fungerar inte inloggningen.
4. Importera nu nyheterna enligt steg 6b.

**Kontroll:**

- [ ] Sidan visas med nedräkning och nyheter.
- [ ] **Logga in som administratör** längst ned → **Logga in med Google** → adminraden visas.
- [ ] Skapa en testnyhet, ändra den och ta bort den.
- [ ] Välj **Årets lopp** i adminraden och spara. Första gången kopieras årets lopp och hela resultatarkivet till Firestore (samlingarna `settings` och `years`).
- [ ] Logga in med ett konto som inte är admin. Du ska få beskedet att bara administratörer har tillgång.

Behöver du publicera om utan kodändring: **Actions → Test och publicering → Run workflow** (gren `main`).

## 8. Flytta renrajden.se till den nya sajten

Gör detta först när steg 7 fungerar. Fram till dess ligger den gamla bloggen kvar.

### 8a. Koppla domänen i Firebase

1. **Build → Hosting → Add custom domain**.
2. Skriv `renrajden.se`. Lämna "Redirect …" urkryssat och klicka på **Continue**.
3. Firebase visar de **DNS-poster** som behövs, oftast en eller två **A-poster** och en **TXT-post**. Låt fönstret vara öppet.
4. Lägg sedan till `www.renrajden.se` på samma sätt och välj att den ska **omdirigera till renrajden.se**.

### 8b. Ändra DNS hos domänleverantören

1. Logga in hos leverantören (till exempel Loopia, One.com eller Binero) och öppna DNS-inställningarna för renrajden.se.
2. **Ta bort de gamla Blogger-posterna:**
   - A-poster för `@` som pekar på Googles Blogger-adresser (`216.239.32.21`, `216.239.34.21`, `216.239.36.21` och `216.239.38.21`)
   - CNAME `www` → `ghs.google.com`
   - eventuell extra CNAME som Blogger använde för verifiering
3. **Lägg till posterna** exakt som Firebase visar dem, både för `renrajden.se` och för `www`.
4. Tillbaka i Firebase: vänta tills status blir **Connected**. Certifikatet för `https` skapas automatiskt. Det kan ta från några minuter till ett dygn.

### 8c. Behåll den gamla bloggen nåbar

Nyheter och sidor länkar till den gamla bloggen (banskiss, PM 2025 med mera). Bloggen måste därför fortsätta fungera på renrajden.blogspot.com och får inte längre skicka besökare till renrajden.se.

1. Gå till https://www.blogger.com → bloggen **Renrajden** → **Settings → Publishing → Custom domain**.
2. Ta bort `renrajden.se` som anpassad domän och spara.
3. **Kontroll:** https://renrajden.blogspot.com/p/bans.html ska visa banskissen.

### 8d. Inloggning på den egna domänen

Inloggningen fungerar bäst om den sker via er egen domän, eftersom vissa webbläsare blockerar tredjepartscookies.

1. Firebase → **Authentication → Settings → Authorized domains → Add domain** → `renrajden.se`. Lägg också till `www.renrajden.se`.
2. Google Cloud-konsolen (samma projekt) → **APIs & Services → Credentials**.
3. Under **OAuth 2.0 Client IDs**, öppna **Web client (auto created by Google Service)**.
4. Under **Authorized redirect URIs**: **Add URI** → `https://renrajden.se/__/auth/handler` → **Save**.
5. GitHub → **Settings → Secrets and variables → Actions → Variables**: ändra `VITE_FIREBASE_AUTH_DOMAIN` till `renrajden.se`.
6. Publicera om: **Actions → Test och publicering → Run workflow** (gren `main`).

**Kontroll:** öppna https://renrajden.se, logga in som administratör och kontrollera att Googles inloggningsruta visar "Renrajden".

## 9. Valfritt men rekommenderat

- **Fler ägare:** Firebase → kugghjulet → **Users and permissions** → lägg till en reservansvarig i klubben som **Owner**.
- **Begränsa API-nyckeln:**
  1. Google Cloud → **APIs & Services → Credentials** → klicka på nyckeln **Browser key (auto created by Firebase)**.
  2. Under **Application restrictions → Websites**, lägg till `renrajden.se/*`, `www.renrajden.se/*`, `renrajden.web.app/*` och `<projekt-id>.firebaseapp.com/*`.
  3. Sajten fungerar även utan detta, eftersom säkerhetsreglerna skyddar datan.

## 10. Slå på uppladdning av bilder och filmer (Cloud Storage)

Administratörer laddar upp bilder och filmer till Cloud Storage. Fram till det här steget fungerar resten av sajten som vanligt: bilderna från gamla bloggen visas, och admins kan ändra och ta bort dem, men inte ladda upp nya. Adminläget visar då beskedet "Uppladdning är inte påslagen än".

1. **Byt till Blaze.** Storage kräver betalplanen Blaze, se [Kostnader](#kostnader-och-gratisplanen). Kugghjulet → **Usage and billing → Details & settings → Modify plan**. Lägg en budgetvarning på till exempel 50 kr.
2. **Skapa lagringen.** **Build → Storage → Get started**.
   - **Plats:** en plats i USA, till exempel **us-central1**, ingår i gratiskvoten. En plats i Europa, till exempel **europe-north1**, går lite snabbare för svenska besökare men kostar några ören per GB och månad. Platsen går inte att ändra efteråt.
   - Välj **Start in production mode**. Allt är stängt tills reglerna publiceras i punkt 6.
3. **Anteckna hinkens namn.** Det står överst under **Storage → Files**, till exempel `gs://renrajden-ae53c.firebasestorage.app`. Namnet är det som står efter `gs://`. Samma värde finns som `storageBucket` under kugghjulet → **Project settings → General → Your apps**.
4. **Lägg in namnet i GitHub.** **Settings → Secrets and variables → Actions → Variables → New repository variable**:

   | Name | Value |
   |---|---|
   | `VITE_FIREBASE_STORAGE_BUCKET` | hinkens namn, utan `gs://`, till exempel `renrajden-ae53c.firebasestorage.app` |

5. **Ge Storage rätt att läsa adminlistan.** Reglerna för Storage kontrollerar att den som laddar upp finns i samlingen `admins` i Firestore. Det enklaste är att publicera reglerna en gång i konsolen:
   1. **Storage → Rules**.
   2. Ersätt allt med innehållet i filen [`storage.rules`](../storage.rules) och klicka på **Publish**.
   3. Konsolen frågar om Storage ska få läsa Firestore. Välj **Grant access** (eller motsvarande).

   Alternativ med `gcloud`. Projektnumret står under kugghjulet → **Project settings → General**:

   ```bash
   gcloud projects add-iam-policy-binding renrajden-ae53c --member=serviceAccount:service-<projektnummer>@gcp-sa-firebasestorage.iam.gserviceaccount.com --role=roles/firebaserules.firestoreServiceAgent
   ```

6. **Ge servicekontot rätt att se hinken.** Google Cloud-konsolen → **IAM & Admin → IAM** → pennan vid `github-deploy@…` → **Add another role → Cloud Storage for Firebase Viewer → Save**. Publiceringen behöver den för att hitta hinken när reglerna för Storage publiceras.
7. **Publicera om:** **Actions → Test och publicering → Run workflow** (gren `main`). Nu publiceras även reglerna för Storage, och sajten byggs med hinkens namn.

**Kontroll:**

- [ ] Logga in som administratör och välj **Bilder** i adminraden. Dialogen visar **Dra hit bilder och filmer**.
- [ ] Ladda upp en bild och skriv ett år. Den syns under Bilder, även i ett privat fönster utan inloggning.
- [ ] Välj **Ta bort** på bilden och sedan **Ta bort** igen. Låt beskedet med **Ångra** försvinna. Under **Storage → Files → galleri** ska bildens mapp vara borta efter en stund.

Första gången något sparas under Bilder kopieras bilderna från gamla bloggen till samlingen `media` i Firestore. Det tar några sekunder.

---

## Kostnader och gratisplanen

Gratisplanen Spark har dagliga tak. Två är relevanta:

| Tjänst | Tak per dag (Spark) | Ungefärlig åtgång |
|---|---|---|
| Hosting, trafik | 360 MB | Ett första besök är cirka 300 kB, alltså runt 1 200 nya besökare per dag |
| Firestore, läsningar | 50 000 | En besökare läser alla nyheter (cirka 25 dokument) vid sidladdning och sedan varje minut medan sidan är öppen, plus årets lopp, partnerna och resultatarkivet (cirka 15 dokument) en gång per sidladdning. Den som scrollar till Bilder läser dessutom ett dokument per bild och film |

En vanlig dag räcker gratisplanen med god marginal. På **tävlingsdagen**, när åkare, publik och anhöriga följer startlistor och resultat, kan taken nås. Då slutar sajten eller nyhetsflödet att fungera resten av dygnet.

**Rekommendation:** uppgradera till **Blaze** (betala per användning) under kugghjulet → **Usage and billing → Details & settings → Modify plan**, och lägg en **budgetvarning** på till exempel 50 kr. Gratiskvoten gäller fortfarande. Det som går över kostar ören: Firestore-läsningar kostar några cent per 100 000, och Hosting-trafik ungefär 0,15 USD per GB.

**Bilder och filmer** (steg 10) kräver Blaze. Med en hink i USA ingår ungefär 5 GB lagring och 100 GB nedladdning per månad. Bilderna förminskas innan de laddas upp och tar sällan mer än 1 MB styck, så det är **filmerna** som kostar: en film på 50 MB som spelas 1 000 gånger är 50 GB. Håll filmerna korta, och spara dem gärna med 720p eller 1080p i stället för 4K. En film laddas bara ned när någon spelar den.

## Felsökning

| Symptom | Trolig orsak och åtgärd |
|---|---|
| Publiceringsjobben i Actions visas som *skipped* | Variabeln `VITE_FIREBASE_PROJECT_ID` saknas eller är felstavad (steg 4). |
| Publiceringen misslyckas med *permission denied* | Någon roll saknas på servicekontot (steg 5), eller hela JSON-filen kom inte med i secret. |
| Publiceringen avbryts med "Årets lopp och resultatarkivet kunde inte hämtas från Firestore" | Bygget når inte Firestore. Kontrollera att `VITE_FIREBASE_PROJECT_ID` stämmer och att säkerhetsreglerna publicerades i steget före. Kör om jobbet när Firestore svarar igen. |
| "Nyheterna kunde inte hämtas" | Reglerna är inte publicerade än (steg 7), eller så är nyheterna inte importerade (steg 6b). |
| "Den här adressen är inte godkänd för inloggning" | Domänen saknas under Authorized domains (steg 8d). |
| "… är inte administratör" fast adressen ska vara admin | Dokument-ID:t i `admins` måste vara exakt Google-adressen med små bokstäver (steg 6a). |
| Inloggningsrutan stängs direkt på mobilen | Popup blockeras. Sajten byter då automatiskt till omdirigering. Kontrollera steg 8d. |
| Gamla blogglänkar hamnar på den nya sajten och ger 404 | Den anpassade domänen ligger kvar i Blogger (steg 8c). |
| Adminläget säger "Uppladdning är inte påslagen än" | Variabeln `VITE_FIREBASE_STORAGE_BUCKET` saknas, eller så har sajten inte publicerats om efter att den lades in (steg 10). |
| "Uppladdningen nekades" fast kontot är admin | Storage får inte läsa adminlistan i Firestore (steg 10, punkt 5), eller så är reglerna för Storage inte publicerade (punkt 7). |
| Publiceringen stoppar vid "Publicera säkerhetsregler för Firestore och Storage" | "Firebase Storage has not been set up": gör steg 10, punkt 2. *Permission denied*: servicekontot saknar rollen i steg 10, punkt 6. |
| En film laddas inte upp: "Filmen kan inte spelas i webbläsaren" | Filmen är i ett format som webbläsaren inte kan spela, ofta HEVC från en iPhone. Spara den som MP4 (H.264), till exempel med **Exportera** i Bilder på Mac eller inställningen **Kamera → Format → Mest kompatibel** på iPhone. |
