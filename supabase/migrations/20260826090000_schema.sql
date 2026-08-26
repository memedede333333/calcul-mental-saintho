-- =====================================================================
-- Calcul Mental Saintho — Schéma de base
-- Migration 1/3 : tables, contraintes, index
-- =====================================================================
--
-- Conventions :
--   - Tout est en français (noms de tables et colonnes) pour rester
--     cohérent avec le front existant et lisible par les enseignants.
--   - Les élèves sont PRÉ-INSCRITS par import. Un compte Supabase Auth
--     est rattaché automatiquement à la première connexion (voir trigger).
--     Conséquence : quelqu'un qui créerait un compte sans être dans la
--     table `eleves` n'a accès à RIEN. C'est notre barrière d'entrée.
--   - Les colonnes marquées [PALIER 3] ne sont pas utilisées aujourd'hui.
--     Elles existent pour éviter une migration si on ajoute plus tard le
--     départ synchronisé / la salle d'attente en direct.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ÉLÈVES
-- ---------------------------------------------------------------------
create table public.eleves (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users(id) on delete set null,
  email           text not null unique,
  nom             text not null,
  prenom          text not null,
  classe          text not null,
  avatar_emoji    text not null default '🎯',
  -- tables de multiplication autorisées pour cet élève
  tables_autorisees smallint[] not null default '{1,2,3,4,5,6,7,8,9,10}',
  actif           boolean not null default true,
  cree_le         timestamptz not null default now(),
  derniere_connexion timestamptz
);

comment on column public.eleves.user_id is
  'NULL tant que l''élève ne s''est jamais connecté. Rempli automatiquement par le trigger de rattachement.';

create index eleves_classe_idx on public.eleves (classe) where actif;
create index eleves_user_idx   on public.eleves (user_id);

-- ---------------------------------------------------------------------
-- ENSEIGNANTS
-- ---------------------------------------------------------------------
create table public.profs (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid unique references auth.users(id) on delete set null,
  email    text not null unique,
  nom      text not null,
  role     text not null default 'prof' check (role in ('prof', 'admin')),
  -- classes dont ce prof a la charge ; un admin voit tout
  classes  text[] not null default '{}',
  actif    boolean not null default true,
  cree_le  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- DÉFIS
-- Un défi = un jeu de questions figé + un code court.
-- Utilisé pour les modes 'sprint' et 'countdown' (comparatif en classe).
-- ---------------------------------------------------------------------
create table public.defis (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  type          text not null check (type in ('sprint', 'countdown')),
  -- créateur : soit un prof, soit un élève (défi entre copains)
  cree_par_prof  uuid references public.profs(id)  on delete set null,
  cree_par_eleve uuid references public.eleves(id) on delete set null,
  classe        text,
  tables        smallint[] not null,
  -- [{"a":7,"b":8}, ...] — LES MÊMES pour tous les participants
  questions     jsonb not null,
  duree_s       integer,             -- uniquement pour 'countdown'
  statut        text not null default 'ouvert' check (statut in ('ouvert', 'ferme')),
  demarre_le    timestamptz,         -- [PALIER 3] départ synchronisé
  expire_le     timestamptz not null default now() + interval '7 days',
  cree_le       timestamptz not null default now(),

  constraint defis_un_createur check (
    (cree_par_prof is not null) <> (cree_par_eleve is not null)
  ),
  constraint defis_questions_non_vide check (jsonb_array_length(questions) > 0)
);

create index defis_code_idx   on public.defis (code) where statut = 'ouvert';
create index defis_classe_idx on public.defis (classe, cree_le desc);

-- ---------------------------------------------------------------------
-- PARTICIPATIONS AUX DÉFIS
-- La clé primaire (defi_id, eleve_id) garantit UNE SEULE participation
-- par élève et par défi. Impossible à contourner côté client.
-- ---------------------------------------------------------------------
create table public.defis_participants (
  defi_id     uuid not null references public.defis(id)  on delete cascade,
  eleve_id    uuid not null references public.eleves(id) on delete cascade,
  score       integer  not null,
  temps_s     numeric(8,2) not null,
  erreurs     integer  not null default 0,
  detail      jsonb    not null default '{}',
  termine_le  timestamptz not null default now(),
  primary key (defi_id, eleve_id)
);

create index defis_participants_classement_idx
  on public.defis_participants (defi_id, score desc, temps_s asc);

-- ---------------------------------------------------------------------
-- SESSIONS DE JEU
-- Toute partie terminée atterrit ici, défi ou pas.
-- C'est la source unique des records, des classements et des badges.
-- ---------------------------------------------------------------------
create table public.sessions_jeu (
  id            uuid primary key default gen_random_uuid(),
  eleve_id      uuid not null references public.eleves(id) on delete cascade,
  defi_id       uuid references public.defis(id) on delete set null,
  mode          text not null check (mode in
                  ('libre', 'apprentissage', 'sprint', 'flawless', 'countdown', 'climb')),
  tables        smallint[] not null default '{}',
  nb_questions  integer not null default 0,
  score         integer not null default 0,
  -- ["3_7", "8_9"] — les faits ratés, pour alimenter la maîtrise
  erreurs       jsonb   not null default '[]',
  duree_s       numeric(8,2) not null default 0,
  serie_max     integer not null default 0,
  sans_faute_max integer not null default 0,
  plus_haute_table smallint,
  cree_le       timestamptz not null default now()
);

create index sessions_eleve_idx on public.sessions_jeu (eleve_id, cree_le desc);
create index sessions_date_idx  on public.sessions_jeu (cree_le desc);
create index sessions_mode_idx  on public.sessions_jeu (mode, cree_le desc);

-- ---------------------------------------------------------------------
-- MAÎTRISE (grille 15×15)
-- Un "fait" est normalisé : min_max, ex. 3×7 et 7×3 → '3_7'
-- niveau : 0 = pas testé, 1 = à revoir, 2 = en cours, 3 = maîtrisé
-- ---------------------------------------------------------------------
create table public.maitrise (
  eleve_id      uuid not null references public.eleves(id) on delete cascade,
  fait          text not null,
  niveau        smallint not null default 0 check (niveau between 0 and 3),
  nb_vues       integer not null default 0,
  nb_reussites  integer not null default 0,
  derniere_vue  timestamptz not null default now(),
  primary key (eleve_id, fait)
);

create index maitrise_revision_idx on public.maitrise (eleve_id, niveau, derniere_vue);

-- ---------------------------------------------------------------------
-- BADGES
-- ---------------------------------------------------------------------
create table public.badges (
  eleve_id   uuid not null references public.eleves(id) on delete cascade,
  badge_id   text not null,
  obtenu_le  timestamptz not null default now(),
  primary key (eleve_id, badge_id)
);

-- =====================================================================
-- RATTACHEMENT AUTOMATIQUE À LA PREMIÈRE CONNEXION
-- Quand un compte Supabase Auth est créé, on cherche l'email dans
-- `eleves` puis dans `profs` et on renseigne user_id.
-- Si l'email n'existe nulle part : le compte est créé mais n'a accès
-- à rien (toutes les politiques RLS s'appuient sur ce rattachement).
-- =====================================================================
create or replace function public.rattacher_compte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Signale au trigger de protection de `eleves` (migration 2) qu'il
  -- s'agit d'un rattachement système et non d'une modification par un
  -- élève. Portée : la transaction courante uniquement.
  perform set_config('app.rattachement_en_cours', 'on', true);

  update public.eleves
     set user_id = new.id,
         derniere_connexion = now()
   where lower(email) = lower(new.email)
     and user_id is null;

  update public.profs
     set user_id = new.id
   where lower(email) = lower(new.email)
     and user_id is null;

  perform set_config('app.rattachement_en_cours', 'off', true);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.rattacher_compte();

-- =====================================================================
-- HELPERS D'IDENTITÉ
-- Utilisés par toutes les politiques RLS. Un élève désactivé renvoie
-- NULL et perd donc tout accès automatiquement.
-- =====================================================================
create or replace function public.eleve_courant()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.eleves
   where user_id = auth.uid() and actif
   limit 1;
$$;

create or replace function public.prof_courant()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.profs
   where user_id = auth.uid() and actif
   limit 1;
$$;

create or replace function public.est_prof()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profs where user_id = auth.uid() and actif
  );
$$;

-- ⚠️ IMPORTANT — pourquoi ce helper existe.
-- Une politique RLS sur `profs` ne doit JAMAIS contenir une
-- sous-requête `select ... from profs` : PostgreSQL réapplique alors la
-- politique sur cette sous-requête, à l'infini
-- ("infinite recursion detected in policy for relation profs").
-- Cette fonction est `security definer` : elle s'exécute avec les
-- droits de son propriétaire, qui possède la table et contourne donc
-- RLS. C'est ce qui casse la boucle.
-- Règle générale : dans une politique, interroger une table protégée
-- passe toujours par une fonction `security definer`.
create or replace function public.est_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profs
     where user_id = auth.uid() and actif and role = 'admin'
  );
$$;

-- Un prof voit-il cette classe ? (un admin voit tout)
create or replace function public.prof_voit_classe(p_classe text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profs
     where user_id = auth.uid()
       and actif
       and (role = 'admin' or p_classe = any(classes))
  );
$$;

-- =====================================================================
-- GÉNÉRATION DES CODES DE DÉFI
-- 5 caractères, alphabet sans ambiguïté visuelle :
-- pas de I / 1 / L, pas de O / 0. Un code doit pouvoir être lu au
-- tableau et recopié sans erreur par un élève de 6e.
-- =====================================================================
create or replace function public.generer_code_defi()
returns text
language plpgsql
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidat text;
  essais   int := 0;
begin
  loop
    candidat := '';
    for i in 1..5 loop
      candidat := candidat || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from public.defis where code = candidat);

    essais := essais + 1;
    if essais > 50 then
      raise exception 'Impossible de générer un code de défi unique';
    end if;
  end loop;

  return candidat;
end;
$$;
