# Huishoudelijk financieel dashboard

PWA voor Ralph en Dorine: twee logins, een gedeeld huishouden, vaste lasten als terugkerende afschrijvingen en snelle handmatige invoer voor variabele kosten.

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
