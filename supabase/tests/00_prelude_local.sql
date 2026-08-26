-- =====================================================================
-- Environnement Supabase simulé, pour tester les migrations sur un
-- PostgreSQL local (hors Supabase).
--
-- Recrée le strict minimum : les rôles, le schéma `auth`, la table
-- `auth.users`, la fonction `auth.uid()` et la publication Realtime.
-- Sur un vrai projet Supabase, tout cela existe déjà — ce fichier n'y
-- est JAMAIS appliqué.
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;

create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create publication supabase_realtime;
