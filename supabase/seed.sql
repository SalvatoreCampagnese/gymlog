-- Solo per lo sviluppo in locale (supabase start / supabase db reset): crea un personal trainer di prova.
-- Accesso: trainer@gymlog.local / trainer123
-- In produzione il trainer si crea a mano: vedi README, sezione "Creare il personal trainer".

do $$
declare
  uid uuid := '00000000-0000-4000-8000-000000000001';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    'trainer@gymlog.local', extensions.crypt('trainer123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"first_name":"Personal","last_name":"Trainer"}', now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', 'trainer@gymlog.local'), 'email', now(), now(), now());

  -- il trigger l'ha creato come cliente: diventa trainer
  update public.profiles set role = 'trainer', trainer_id = null where id = uid;
  delete from public.client_state where client_id = uid;
end $$;
