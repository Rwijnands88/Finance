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
- [ ] Bonnen-scan laten prefilling doen voor de gekozen rekening.
- [ ] Transfers ondersteunen voor stortingen naar de gezamenlijke rekening.

#### Fase 3 - Dashboard herstructureren

- [x] Eerste tabs toevoegen: Gezamenlijk en Mijn rekening.
- [ ] Tabs herzien als views met eigen doel, niet als simpele filter over alles.
- [ ] Snelle invoer globaal en prominent houden.
- [x] Vaste lasten beheer uit Mijn rekening halen.
- [x] Vaste lasten behandelen als gezamenlijk beheer, standaard op gezamenlijke rekening.
- [x] Onderste uitlegblok "Mobiele PWA" verwijderen.
- [x] Dashboard visuele hierarchie compacter maken.
- [x] "Wie voerde wat in" vervangen door gezamenlijke kosten per persoon.
- [ ] Gezamenlijke kosten per persoon tonen als donut/balk-grafiek.
- [x] Categorieen per persoon tonen voor gezamenlijke uitgaven.
- [ ] Mijn rekening schoon houden: alleen prive-transacties, prive-categorieen en prive-maandoverzicht.
- [ ] Maandoverzicht duidelijk labelen als gezamenlijk of prive.

**Volgende werksessie:** eerst Fase 3 afronden, daarna pas Fase 4 starten.
Doel voor Fase 3-afronding: views echt scheiden, snelle invoer logisch
positioneren, maandoverzicht beter labelen en Mijn rekening schoner maken.

#### Fase 3B - Vaste lasten als financiele agenda

- [x] `billing_day` voorbereiden in Supabase-migratie en SQL Editor chunk.
- [x] `billing_day` uitvoeren in Supabase.
- [x] Vaste-last formulier uitbreiden met afschrijfdag.
- [x] Bestaande bevestig/overslaan-flow uit het hoofdscherm verwijderen.
- [x] Vaste lasten automatisch tonen als verwacht voor de maand.
- [x] Desktop: compacte maandkalender met dagen waarop afschrijvingen vallen.
- [x] iPhone: Things 3-achtige tijdlijn met open, verwerkt en overgeslagen.
- [x] Totalen tonen: verwerkt, open en totaal vaste lasten.
- [x] Deactiveren vervangen door Verwijderen vanaf nu.
- [ ] Later: Deze maand aanpassen/overslaan als uitzonderingsactie.

#### Fase 4 - Inleg en cashflow

Start pas nadat Fase 3 is afgerond.

- [ ] Inleg/stortingen toevoegen voor Ralph en Dorine.
- [ ] Inleg als apart type behandelen, niet als gewone uitgave.
- [ ] Gezamenlijke maandcashflow tonen: inleg - vaste lasten - variabel = over/tekort.
- [ ] Maandelijkse standaardinleg kunnen instellen.
- [ ] Historie van inleg tonen in maandrapport.

#### Fase 5 - Mobiele invoer en scanner

- [x] Mobiele quick-entry met rekeningkeuze voorbereiden.
- [x] Bon scannen vult bedrag, datum en winkel in.
- [x] Gebruiker kiest categorie zelf.
- [x] Tanken-flow behouden met liters en auto.
- [ ] Duidelijke concept/bevestig-flow voor gescande bonnen.

#### Fase 6 - Rapportage en polish

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
- tankgegevens staan extra in `fuel_details`, gekoppeld aan de transactie.

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
