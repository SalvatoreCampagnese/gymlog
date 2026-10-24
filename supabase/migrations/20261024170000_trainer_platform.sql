-- GymLog: piattaforma per personal trainer
-- Ruoli: il trainer (creato a mano dal DB) crea i propri clienti; nessuno si registra da solo.

create extension if not exists pgcrypto with schema extensions;

create type public.user_role as enum ('trainer', 'client');

-- ---------------------------------------------------------------------------
-- Profili: uno per ogni utente di auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'client',
  trainer_id uuid references public.profiles (id) on delete set null,
  first_name text not null default '',
  last_name text not null default '',
  email text not null,
  height_cm numeric(5, 1),
  start_weight_kg numeric(5, 1),
  -- chiave personale per l'import da Apple Salute (comando rapido iOS)
  health_token text unique default encode(extensions.gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now(),
  constraint client_has_no_self_trainer check (trainer_id is null or trainer_id <> id)
);

create index profiles_trainer_idx on public.profiles (trainer_id);

comment on table public.profiles is 'Trainer e clienti. Il trainer si crea a mano: vedi README.';

-- ---------------------------------------------------------------------------
-- Schede (file Excel caricati dal trainer). Ogni caricamento è una nuova versione:
-- la più recente è quella attiva, le precedenti restano come storico.
-- ---------------------------------------------------------------------------
create table public.workbooks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  file_name text not null,
  file bytea not null,
  size_bytes integer generated always as (octet_length(file)) stored,
  -- schede (fogli) trovate nel file, per mostrarle nello storico senza riaprire l'Excel
  program_titles text[] not null default '{}',
  -- JSON già elaborato dal parser (cache: elaborare un Excel grande richiede secondi)
  parsed jsonb,
  parser_version text,
  note text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create index workbooks_client_idx on public.workbooks (client_id, uploaded_at desc);

-- ---------------------------------------------------------------------------
-- Diario del cliente: allenamenti, pasti, peso, dati Salute, alimenti salvati.
-- Un documento JSON per cliente, aggiornato con controllo di versione.
-- ---------------------------------------------------------------------------
create table public.client_state (
  client_id uuid primary key references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Timer di recupero: solo l'ultimo timer avviato può inviare la notifica
-- ---------------------------------------------------------------------------
create table public.rest_timers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  timer_id text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Nuovo utente in auth.users -> profilo cliente + diario vuoto.
-- Il trainer del cliente arriva da app_metadata (impostabile solo con la chiave service role).
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  trainer uuid := nullif(new.raw_app_meta_data ->> 'trainer_id', '')::uuid;
begin
  insert into public.profiles (id, role, trainer_id, first_name, last_name, email, height_cm, start_weight_kg)
  values (
    new.id,
    'client',
    trainer,
    coalesce(meta ->> 'first_name', ''),
    coalesce(meta ->> 'last_name', ''),
    coalesce(new.email, ''),
    nullif(meta ->> 'height_cm', '')::numeric,
    nullif(meta ->> 'start_weight_kg', '')::numeric
  );
  insert into public.client_state (client_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Tiene allineata l'email del profilo se cambia in auth
create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Funzioni di supporto per le policy (security definer: evitano la ricorsione su profiles)
-- ---------------------------------------------------------------------------
create function public.is_trainer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'trainer');
$$;

create function public.is_my_client(client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = client and p.trainer_id = auth.uid() and p.role = 'client'
  ) and public.is_trainer();
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workbooks enable row level security;
alter table public.client_state enable row level security;
alter table public.rest_timers enable row level security;

-- profiles: ognuno vede sé stesso, il trainer vede i suoi clienti
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: trainer reads clients" on public.profiles
  for select to authenticated using (public.is_my_client(id));
-- il trainer può aggiornare i dati anagrafici dei suoi clienti, senza cambiarne ruolo o trainer
create policy "profiles: trainer updates clients" on public.profiles
  for update to authenticated
  using (public.is_my_client(id))
  with check (trainer_id = auth.uid() and role = 'client');

-- workbooks: il cliente legge le sue schede, il trainer gestisce quelle dei suoi clienti
create policy "workbooks: client reads own" on public.workbooks
  for select to authenticated using (client_id = auth.uid());
create policy "workbooks: trainer reads" on public.workbooks
  for select to authenticated using (public.is_my_client(client_id));
create policy "workbooks: trainer uploads" on public.workbooks
  for insert to authenticated
  with check (public.is_my_client(client_id) and uploaded_by = auth.uid());
create policy "workbooks: trainer updates" on public.workbooks
  for update to authenticated
  using (public.is_my_client(client_id))
  with check (public.is_my_client(client_id));
create policy "workbooks: trainer deletes" on public.workbooks
  for delete to authenticated using (public.is_my_client(client_id));

-- client_state: il cliente scrive il proprio diario, il trainer lo legge soltanto
create policy "state: client reads own" on public.client_state
  for select to authenticated using (client_id = auth.uid());
create policy "state: client writes own" on public.client_state
  for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());
create policy "state: client creates own" on public.client_state
  for insert to authenticated with check (client_id = auth.uid());
create policy "state: trainer reads" on public.client_state
  for select to authenticated using (public.is_my_client(client_id));

-- rest_timers: solo i propri
create policy "timers: own" on public.rest_timers
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Nessun accesso anonimo diretto alle tabelle
revoke all on public.profiles, public.workbooks, public.client_state, public.rest_timers from anon;

-- profiles: permessi per colonna. La chiave Apple Salute si legge solo dal server;
-- ruolo, trainer ed email non si modificano dal browser.
revoke select, insert, update, delete on public.profiles from authenticated;
grant select (id, role, trainer_id, first_name, last_name, email, height_cm, start_weight_kg, created_at)
  on public.profiles to authenticated;
grant update (first_name, last_name, height_cm, start_weight_kg) on public.profiles to authenticated;
