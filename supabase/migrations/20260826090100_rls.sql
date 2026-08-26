-- =====================================================================
-- Calcul Mental Saintho — Sécurité
-- Migration 2/3 : Row Level Security
-- =====================================================================
--
-- PRINCIPE DIRECTEUR
-- Les tables sont fermées par défaut. Un élève ne peut lire QUE ses
-- propres lignes. Il n'a jamais accès en lecture directe à la table
-- `eleves` des autres — sinon il récupérerait les emails de tout le
-- collège, ce qui serait un problème RGPD.
--
-- Les classements ont pourtant besoin d'afficher les noms des autres.
-- Ils sont donc servis par des fonctions `security definer`
-- (migration 3/3) qui ne renvoient QUE : prénom, initiale du nom,
-- classe, avatar, valeur. Jamais l'email, jamais l'identifiant.
--
-- Règle à retenir : on n'ouvre jamais une table pour faire un
-- classement. On écrit une fonction qui renvoie le strict nécessaire.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DROITS DE TABLE
-- Supabase accorde par défaut tous les droits au rôle `authenticated`
-- sur les nouvelles tables de `public`. On les redéfinit explicitement :
-- RLS filtre les LIGNES, ces GRANT limitent les OPÉRATIONS possibles.
-- Les deux se cumulent — ceinture et bretelles.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.eleves   to authenticated; -- RLS restreint aux admins sauf avatar
grant select, insert, update, delete on public.profs    to authenticated; -- RLS restreint aux admins
grant select, update                 on public.defis    to authenticated; -- création via RPC uniquement
grant select                         on public.defis_participants to authenticated;
grant select, insert                 on public.sessions_jeu to authenticated;
grant select, insert, update, delete on public.maitrise to authenticated;
grant select                         on public.badges   to authenticated;

-- Volontairement absents :
--   INSERT sur badges              → attribution par le serveur seul
--   INSERT sur defis_participants  → passe par terminer_defi()
--   DELETE sur sessions_jeu        → une partie enregistrée est définitive

alter table public.eleves              enable row level security;
alter table public.profs               enable row level security;
alter table public.defis               enable row level security;
alter table public.defis_participants  enable row level security;
alter table public.sessions_jeu        enable row level security;
alter table public.maitrise            enable row level security;
alter table public.badges              enable row level security;

-- ---------------------------------------------------------------------
-- ELEVES
-- ---------------------------------------------------------------------

-- L'élève lit sa propre fiche.
create policy eleves_lecture_soi on public.eleves
  for select to authenticated
  using (id = public.eleve_courant());

-- Le prof lit les fiches des classes dont il a la charge.
create policy eleves_lecture_prof on public.eleves
  for select to authenticated
  using (public.prof_voit_classe(classe));

-- L'élève peut modifier son avatar, rien d'autre.
-- (le WITH CHECK vérifie l'état APRÈS modification : les champs
--  sensibles doivent être identiques à ce qu'ils étaient)
create policy eleves_maj_avatar on public.eleves
  for update to authenticated
  using  (id = public.eleve_courant())
  with check (id = public.eleve_courant());

-- Seul un admin crée, importe ou désactive des élèves.
create policy eleves_admin_tout on public.eleves
  for all to authenticated
  using (public.est_admin())
  with check (public.est_admin());

-- Verrou complémentaire : un élève ne peut pas s'auto-promouvoir ni
-- changer de classe via l'API. Seul l'avatar est modifiable par lui.
create or replace function public.eleves_champs_proteges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rattachement automatique du compte à la première connexion :
  -- c'est le système qui écrit, pas l'élève. Voir `rattacher_compte()`.
  if coalesce(current_setting('app.rattachement_en_cours', true), 'off') = 'on' then
    return new;
  end if;

  -- un admin fait ce qu'il veut
  if public.est_admin() then
    return new;
  end if;

  new.email             := old.email;
  new.nom               := old.nom;
  new.prenom            := old.prenom;
  new.classe            := old.classe;
  new.tables_autorisees := old.tables_autorisees;
  new.actif             := old.actif;
  new.user_id           := old.user_id;
  return new;
end;
$$;

create trigger eleves_protection
  before update on public.eleves
  for each row execute function public.eleves_champs_proteges();

-- ---------------------------------------------------------------------
-- PROFS — lecture réservée aux profs, écriture aux admins
-- ---------------------------------------------------------------------
create policy profs_lecture on public.profs
  for select to authenticated
  using (public.est_prof());

create policy profs_admin on public.profs
  for all to authenticated
  using (public.est_admin())
  with check (public.est_admin());

-- ---------------------------------------------------------------------
-- SESSIONS DE JEU
-- ---------------------------------------------------------------------

-- L'élève lit son historique.
create policy sessions_lecture_soi on public.sessions_jeu
  for select to authenticated
  using (eleve_id = public.eleve_courant());

-- L'élève enregistre ses propres parties, et seulement les siennes.
create policy sessions_insert_soi on public.sessions_jeu
  for insert to authenticated
  with check (eleve_id = public.eleve_courant());

-- Aucune politique UPDATE ni DELETE : une partie enregistrée est
-- définitive. Un élève ne peut pas retoucher son score après coup.

-- Le prof consulte les sessions de ses classes.
create policy sessions_lecture_prof on public.sessions_jeu
  for select to authenticated
  using (exists (
    select 1 from public.eleves e
     where e.id = sessions_jeu.eleve_id
       and public.prof_voit_classe(e.classe)));

-- ---------------------------------------------------------------------
-- MAÎTRISE — strictement personnelle (+ lecture prof pour le suivi)
-- ---------------------------------------------------------------------
create policy maitrise_soi on public.maitrise
  for all to authenticated
  using      (eleve_id = public.eleve_courant())
  with check (eleve_id = public.eleve_courant());

create policy maitrise_lecture_prof on public.maitrise
  for select to authenticated
  using (exists (
    select 1 from public.eleves e
     where e.id = maitrise.eleve_id
       and public.prof_voit_classe(e.classe)));

-- ---------------------------------------------------------------------
-- BADGES — lecture seule côté client, attribution par le serveur
-- ---------------------------------------------------------------------
create policy badges_lecture_soi on public.badges
  for select to authenticated
  using (eleve_id = public.eleve_courant());

create policy badges_lecture_prof on public.badges
  for select to authenticated
  using (exists (
    select 1 from public.eleves e
     where e.id = badges.eleve_id
       and public.prof_voit_classe(e.classe)));

-- Pas de politique INSERT : les badges sont attribués exclusivement
-- par la fonction `enregistrer_session` (security definer).
-- Un élève ne peut pas s'auto-décerner un badge.

-- ---------------------------------------------------------------------
-- DÉFIS
-- ---------------------------------------------------------------------

-- Tout élève connecté peut lire un défi ouvert et non expiré.
-- Nécessaire pour rejoindre par code. Le contenu (questions) n'est
-- pas sensible : c'est une liste de multiplications.
create policy defis_lecture on public.defis
  for select to authenticated
  using (
    statut = 'ouvert'
    and expire_le > now()
  );

-- Le prof relit tous ses défis, y compris fermés.
create policy defis_lecture_prof on public.defis
  for select to authenticated
  using (public.est_prof());

-- Création et fermeture : par les fonctions RPC uniquement
-- (migration 3/3). Pas d'INSERT direct depuis le client, sinon un
-- élève pourrait fabriquer un défi avec ses propres questions.
create policy defis_prof_gestion on public.defis
  for update to authenticated
  using (public.est_prof())
  with check (public.est_prof());

-- ---------------------------------------------------------------------
-- PARTICIPATIONS
-- ---------------------------------------------------------------------

-- L'élève lit sa propre participation (pour savoir s'il a déjà joué).
-- Le classement complet passe par `classement_defi()`.
create policy participants_lecture_soi on public.defis_participants
  for select to authenticated
  using (eleve_id = public.eleve_courant());

create policy participants_lecture_prof on public.defis_participants
  for select to authenticated
  using (public.est_prof());

-- Pas d'INSERT direct : tout passe par `terminer_defi()`, qui valide
-- que le défi est ouvert et calcule le score côté serveur.
