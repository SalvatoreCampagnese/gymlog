# GymLog

Piattaforma per personal trainer e clienti: schede da Excel, modalità allenamento con recuperi, diario dei pasti, peso e dati di Apple Salute.

- **Personal trainer** (`/trainer`): crea i clienti (nome, cognome, peso, altezza, email, password), carica per ognuno l'Excel delle schede con lo storico delle versioni, vede in sola lettura allenamenti, pasti, peso e attività, scarica l'Excel con il REPORT compilato.
- **Cliente**: entra con email e password o con il link via email, vede la sua scheda, registra allenamenti, pasti e peso, collega Apple Salute.
- Nessuno può registrarsi da solo: i clienti li crea il trainer, il trainer si crea a mano dal database.

Stack: Next.js 15 su Vercel, Supabase (Postgres + Auth). Gli Excel stanno nel database (`workbooks.file`), il diario di ogni cliente è un documento JSON (`client_state.data`). Tutto è protetto da Row Level Security: un cliente vede solo i suoi dati, un trainer solo i suoi clienti, in sola lettura.

## Sviluppo in locale

Serve Docker Desktop acceso.

```bash
npm install
npx supabase start          # avvia Postgres, Auth e Mailpit in Docker, applica migrazioni e seed
npx supabase status         # mostra API URL, anon key e service_role key
cp .env.example .env.local  # e incolla URL e chiavi
npm run dev                 # http://127.0.0.1:3000
```

- Trainer di prova (da `supabase/seed.sql`): **trainer@gymlog.local** / **trainer123**.
- Le email (link di accesso) in locale non partono davvero: si leggono in Mailpit, http://127.0.0.1:54324.
- Per ripartire da zero: `npx supabase db reset` (riapplica migrazioni e seed).
- Apri il sito su `http://127.0.0.1:3000` (non `localhost`): è l'indirizzo configurato in `supabase/config.toml` per i link delle email.

## Database: migrazioni

Le migrazioni sono in `supabase/migrations/`:

- `profiles`: trainer e clienti (ruolo, trainer del cliente, anagrafica, chiave Apple Salute). Il profilo nasce in automatico con un trigger quando si crea l'utente in Auth.
- `workbooks`: gli Excel caricati, con il JSON già elaborato. Il più recente è la scheda attiva, gli altri sono lo storico.
- `client_state`: il diario del cliente, con numero di versione per evitare sovrascritture.
- `rest_timers`: l'ultimo timer di recupero di ogni utente, per le notifiche.

## Produzione

### 1. Progetto Supabase

1. Crea il progetto su supabase.com.
2. Applica le migrazioni dal tuo computer:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-del-progetto>
   npx supabase db push
   ```
   Non lanciare il seed in produzione.
3. **Authentication → Sign In / Providers**: disattiva **Allow new users to sign up**. Lascia attivo il provider Email.
4. **Authentication → URL Configuration**: Site URL = l'indirizzo del sito (es. `https://gymlog-liart.vercel.app`). In Redirect URLs aggiungi `https://<dominio>/auth/confirm`.
5. **Authentication → Emails → Magic Link**: oggetto `Accedi a GymLog`, corpo = il contenuto di `supabase/templates/magic_link.html`. Il link deve restare `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
6. **Authentication → Emails → SMTP Settings**: configura un SMTP vero (Resend, Brevo, SendGrid…). Il server email incluso in Supabase manda pochissime email l'ora ed è pensato solo per i test.

### 2. Creare il personal trainer

Da **Authentication → Users → Add user → Create new user**: email e password, spunta **Auto Confirm User**. Poi nello **SQL Editor**:

```sql
update public.profiles
set role = 'trainer', trainer_id = null, first_name = 'Nome', last_name = 'Cognome'
where email = 'email-del-trainer@esempio.it';
delete from public.client_state where client_id = (select id from public.profiles where email = 'email-del-trainer@esempio.it');
```

### 3. Variabili su Vercel

| Variabile | Dove si trova |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon / publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (service_role / secret). Solo lato server, mai nel browser |
| `NEXT_PUBLIC_SITE_URL` | l'indirizzo del sito, es. `https://gymlog-liart.vercel.app` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | come prima |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | come prima (notifiche di fine recupero) |

Non servono più `APP_PASSWORD`, `HEALTH_TOKEN` e `BLOB_READ_WRITE_TOKEN`.

### 4. Portare i dati della versione attuale

La versione precedente teneva tutto su Vercel Blob. Dopo aver creato il tuo account cliente dall'area trainer:

```bash
BLOB_READ_WRITE_TOKEN=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npx tsx scripts/import-blob.ts --email tua@email.it --dry-run   # controlla cosa importa
# poi senza --dry-run; con --keep-health-token e HEALTH_TOKEN=<vecchio token>
# il comando rapido di Apple Salute continua a funzionare (se cambia il dominio, aggiorna solo quello)
```

Importa allenamenti, pasti, peso, dati Salute, alimenti salvati e la correzione della bilancia, più tutti gli Excel caricati come storico delle schede.

## Apple Salute

Ogni cliente ha un indirizzo personale per il comando rapido nella pagina **Apple Salute** (`/salute`). La chiave è nel profilo (`profiles.health_token`) e non è leggibile dal browser.

## Script

- `npm run parse -- percorso/file.xlsx`: controlla come viene letto un Excel.
- `scripts/import-blob.ts`: import dalla versione su Vercel Blob (vedi sopra).
