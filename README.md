# Huishoudelijk financieel dashboard

PWA voor Ralph en Dorine: twee logins, een gedeeld huishouden, vaste lasten als terugkerende afschrijvingen en snelle handmatige invoer voor variabele kosten.

## V2 richting: huishoudboekje met rekeningen

De huidige app is een werkend prototype met Supabase-auth, gedeelde huishouddata,
vaste lasten, variabele kosten, bonnenscanner, export en PWA-installatie. De
volgende stap is een v2-fundament waarin de app meer werkt zoals Monarch Money
of Dyme, maar zonder bankkoppeling: handmatig invoeren, scannen en controleren.

Belangrijk uitgangspunt: niet opnieuw beginnen met een leeg project. GitHub,
Vercel, Supabase, auth-users, PWA, scanner en de bestaande UI-basis blijven
zoveel mogelijk behouden. Wel krijgt het datamodel een nieuwe kern:
`accounts`.

### Doelmodel

- Gezamenlijke rekening: zichtbaar en bewerkbaar voor Ralph en Dorine.
- Ralph prive-rekening: zichtbaar en bewerkbaar voor Ralph.
- Dorine prive-rekening: zichtbaar en bewerkbaar voor Dorine.
- Transacties hangen aan een rekening, niet alleen aan een huishouden.
- "Ingevoerd door" blijft apart van "van welke rekening".
- Stortingen naar de gezamenlijke rekening worden transfers, geen gewone kosten.
- Vaste lasten worden een financiele agenda: automatisch verwacht per maand,
  met afschrijfdag, kalender/tijdlijn en alleen handmatige actie bij afwijkingen.

### Roadmap

#### Fase 0 - Analyse en planning

- [x] Huidige codebase en Supabase-tabellen nalopen.
- [x] Vaststellen dat het huidige model household-first is.
- [x] Monarch Money en Dyme als productreferentie gebruiken.
- [x] Besluit: doorbouwen in huidige repo/Supabase-project, niet leeg opnieuw starten.
- [ ] Definitief v2-datamodel uitschrijven voordat er databasewijzigingen komen.

#### Fase 1 - Supabase v2 fundament

- [x] Non-destructive migration en SQL Editor chunks voorbereiden.
- [x] Nieuwe `accounts` tabel toevoegen.
- [x] Standaardrekeningen aanmaken: Gezamenlijk, Ralph prive, Dorine prive.
- [x] Eigenaarschap en zichtbaarheid per rekening vastleggen.
- [x] `transactions.account_id` toevoegen.
- [x] Bestaande transacties backfillen naar de gezamenlijke rekening.
- [x] `recurring_expenses` koppelen aan een rekening.
- [x] `fixed_expense_instances` rekeningbewust maken via de recurring item.
- [x] RLS voorbereiden van household-based naar account-aware.
- [x] Views voor maandtotalen per rekening toevoegen.
- [x] Database types bijwerken.

#### Fase 2 - App-data en API's

- [x] Dashboard-loader account-aware maken.
- [x] Transactie API account-aware maken.
- [x] Snelle invoer rekeningkeuze geven.
- [x] Maandoverzicht rekeninglabels tonen.
- [ ] Vaste-lasten API expliciet koppelen aan gezamenlijke rekening.
- [ ] Delete/update flows controleren met accountrechten.
- [x] Bonnen-scan laten prefilling doen voor de gekozen rekening.
- [ ] Transfers ondersteunen voor stortingen naar de gezamenlijke rekening.

#### Fase 3 - Dashboard herstructureren

- [x] Eerste tabs toevoegen: Gezamenlijk en Mijn rekening.
- [x] Tabs herzien als views met eigen doel, niet als simpele filter over alles.
- [x] Snelle invoer globaal en prominent houden.
- [x] Vaste lasten beheer uit Mijn rekening halen.
- [x] Vaste lasten behandelen als gezamenlijk beheer, standaard op gezamenlijke rekening.
- [x] Onderste uitlegblok "Mobiele PWA" verwijderen.
- [x] Dashboard visuele hierarchie compacter maken.
- [x] "Wie voerde wat in" vervangen door gezamenlijke kosten per persoon.
- [x] Gezamenlijke kosten per persoon tonen als balk-grafiek.
- [x] Categorieen per persoon tonen voor gezamenlijke uitgaven.
- [x] Mijn rekening schoon houden: alleen prive-transacties, prive-categorieen en prive-maandoverzicht.
- [x] Maandoverzicht duidelijk labelen als gezamenlijk of prive.

**Status:** Fase 3 is afgerond. Volgende inhoudelijke stap is Fase 4:
inleg en cashflow.

#### Fase 3B - Vaste lasten als financiele agenda

- [x] `billing_day` voorbereiden in Supabase-migratie en SQL Editor chunk.
- [x] `billing_day` uitvoeren in Supabase.
- [x] Vaste-last formulier uitbreiden met afschrijfdag.
- [x] Bestaande bevestig/overslaan-flow uit het hoofdscherm verwijderen.
- [x] Vaste lasten automatisch tonen als verwacht voor de maand.
- [x] Desktop: compacte planninglijst met vaste afschrijvingen.
- [x] iPhone: Things 3-achtige tijdlijn met open, verwerkt en overgeslagen.
- [x] Totalen tonen: verwerkt, open en totaal vaste lasten.
- [x] Deactiveren vervangen door Verwijderen vanaf nu.
- [ ] Later: Deze maand aanpassen/overslaan als uitzonderingsactie.

#### Fase 4 - Inleg en cashflow

- [x] Supabase voorbereiden: transactietype `contribution` en categorie `Inleg`.
- [x] Inleg/stortingen toevoegen voor Ralph en Dorine via de gezamenlijke view.
- [x] Inleg als apart type behandelen, niet als gewone uitgave.
- [x] Gezamenlijke maandcashflow tonen: inleg - vaste lasten - variabel = over/tekort.
- [x] Maandelijkse standaardinleg kunnen instellen.
- [x] Stortdag kiezen via compacte dag-picker; standaardinleg geldt maandelijks.
- [x] Per persoon tonen: gepland, ontvangen en nog verwacht.
- [x] Historie van inleg tonen in maandrapport.

**Status:** Fase 4 is afgerond en Supabase chunk 20 is uitgevoerd. De app is nu
klaar om de standaardinleg live te testen. Daarna is de volgende inhoudelijke
stap Fase 5: mobiele invoer en scanner afronden met een duidelijke
concept/bevestig-flow.

#### Fase 4B - Saldo en inkomsten

- [x] Supabase chunk 21 voorbereiden: `account_balance_snapshots` en transactietype `income`.
- [x] Per rekening een huidig saldo/startpunt kunnen opslaan.
- [x] Verwacht saldo tonen op basis van saldo + inkomsten/inleg - uitgaven.
- [x] Prive-rekening uitbreiden met salaris en extra inkomsten.
- [x] Gezamenlijke rekening blijven rekenen met standaardinleg, extra inleg, vaste lasten en variabele kosten.
- [x] Dashboard tolerant houden zolang chunk 21 nog niet in Supabase is uitgevoerd.

**Status:** Fase 4B is gebouwd en Supabase chunk 21 is uitgevoerd. De app kan nu
saldo per rekening opslaan en prive-inkomsten boeken.

#### Fase 5 - Mobiele invoer en scanner

- [x] Mobiele quick-entry met rekeningkeuze voorbereiden.
- [x] Bon scannen vult bedrag, datum en winkel in.
- [x] Gebruiker kiest categorie zelf.
- [x] Tanken invoeren met alleen bedrag en categorie.
- [x] Duidelijke concept/bevestig-flow voor gescande bonnen.

**Status:** Fase 5 is afgerond voor de bestaande scanner-scope. Een scan vult
bedrag, datum en winkel direct in als concept; daarna kiest de gebruiker zelf
de categorie en bevestigt met "Afschrijving toevoegen".

#### Fase 6 - Bonnen bewaren en rapportage

Uitgangspunt: de bestaande scanner blijft werken zoals nu. De scan maakt alleen
een concept; de bon wordt pas opgeslagen nadat de gebruiker de afschrijving
bevestigt met "Afschrijving toevoegen".

Veilige bouwvolgorde:

1. Database klaarzetten
   - `transactions.receipt_url` toevoegen als nullable veld.
   - Private Supabase Storage bucket `receipts` aanmaken.
   - Storage RLS toevoegen: alleen gebruikers met toegang tot de rekening mogen
     bonnen lezen en schrijven.
   - Stopmoment: SQL eerst handmatig uitvoeren en controleren in Supabase.

2. Data veilig doorgeven
   - Types, Supabase mapping en transactie-API uitbreiden met `receiptUrl`.
   - Nog geen upload en nog geen UI.
   - Controle: bestaande invoer, scanner-draft en transactielijst blijven werken.

3. Bon uploaden na bevestiging
   - Originele scanfoto tijdelijk in de client bewaren.
   - Na bevestiging: eerst de transactie opslaan.
   - Daarna pas client-side comprimeren via canvas: max 800px breed, JPEG 0.6.
   - Uploaden naar Storage en daarna `receipt_url` opslaan.
   - Als upload mislukt: transactie blijft bestaan, bonmelding geeft aan dat
     alleen de bon niet is opgeslagen.

4. Bon tonen bij transacties
   - Kleine thumbnail tonen bij transacties met bon.
   - Klik opent de bon groot.
   - Printknop gebruikt `window.print()` op de bonweergave.
   - Berekeningen, filters en transactiebedragen blijven onaangeraakt.

5. ZIP-download per maand
   - `JSZip` toevoegen als dependency.
   - Knop "Download bonnen [maandnaam]" alleen tonen als er bonnen zijn.
   - Private bonnen downloaden en bundelen als ZIP.
   - Bestandsnamen: `[datum]-[categorie]-[bedrag].jpg`.

6. Excel verbeteren
   - Bestaande Excel-knop behouden.
   - Werkboek uitbreiden naar drie tabbladen:
     `Samenvatting`, `Alle transacties`, `Vaste lasten status`.
   - Kolom toevoegen: bon aanwezig ja/nee.

7. PDF verbeteren
   - Bestaande PDF-knop behouden.
   - A4-rapport uitbreiden met koptekst, samenvatting per rekening, vaste
     lasten status, variabele kosten per categorie en bon-thumbnails.
   - Extra voorzichtig testen, omdat `@react-pdf/renderer` strikte
     rendering-beperkingen heeft.

Controles per stap:

- `npx tsc --noEmit`
- bij export/PDF-wijzigingen ook `npm run build`
- lokaal controleren dat snelle invoer, scanner-draft, Excel en PDF nog starten

#### Fase 7 - Rapportage en polish

- [ ] Excel-export uitbreiden met rekening, type en transfer-info.
- [ ] PDF maandrapport per rekening en gezamenlijk.
- [ ] Grafieken herzien: cashflow, categorieen, 6 maanden, vaste lasten status.
- [ ] Things 3-stijl verder verfijnen.
- [ ] PWA-installatie en Vercel deployment opnieuw controleren.

### Niet in scope

- Geen bankintegratie.
- Geen automatische PSD2-koppelingen.
- Geen AI-budgetadvies.
- Geen betaalfunctionaliteit.
- Geen complexe rollen voordat de basis staat.

## Stack

- Next.js + TypeScript
- Tailwind CSS met shadcn/ui-achtige lokale componenten
- Supabase auth, database en row-level security
- Recharts voor grafieken
- `xlsx` voor Excel-export
- `@react-pdf/renderer` voor maandrapporten
- `next-pwa` voor installable PWA output
- OpenAI Vision via server-side `OPENAI_API_KEY` voor bonnenscans

## Lokaal starten

```bash
npm install
cp .env.example .env
npm run dev
```

Open daarna `http://localhost:3000`.

De huidige UI gebruikt demo-data zodat het dashboard direct te beoordelen is. Vul de Supabase-waarden in `.env` zodra je de database wilt koppelen.

## Supabase

1. Maak een Supabase-project.
2. Zet `NEXT_PUBLIC_SUPABASE_URL` en `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env`.
3. Run de SQL migrations uit `supabase/migrations` op volgorde.
4. Maak twee auth users aan: Ralph en Dorine.
5. Volg `supabase/README.md` om het huishouden, leden, categorieen en de gezinsauto te bootstrappen.

Belangrijk datamodel:

- `recurring_expenses` is de instelling van een vaste last.
- `fixed_expense_instances` is de maandelijkse snapshot.
- bevestigde vaste lasten verschijnen als normale regels in `transactions` met `type = fixed`.
- variabele kosten verschijnen in `transactions` met `type = variable`.
- tanken is een gewone variabele kostenpost met bedrag en categorie.

Historische snapshots worden niet overschreven wanneer een vast maandbedrag verandert.

## Build

```bash
npm run build
npm run start
```

## Deploy naar Vercel

```bash
npx vercel
npx vercel env add NEXT_PUBLIC_SUPABASE_URL
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
npx vercel env add SUPABASE_SERVICE_ROLE_KEY
npx vercel env add OPENAI_API_KEY
npx vercel --prod
```

De PWA-service worker wordt alleen bij production builds geactiveerd.
