-- =====================================================================
-- MIGRATION 37 — un role dedie a la sauvegarde, en LECTURE SEULE
--
-- POURQUOI. La sauvegarde du 10 septembre se connectait avec le compte
-- `postgres`, celui qui peut tout lire, tout modifier et tout effacer
-- sur les donnees de 313 mineurs. Ce mot de passe vit desormais dans un
-- secret GitHub et dans un fichier sur un Mac : deux endroits de plus
-- qu'il n'en faut pour un travail qui n'a besoin que de LIRE.
--
-- Ce role ne sait rien faire d'autre que lire. S'il fuit, on perd la
-- confidentialite d'une sauvegarde — pas la base.
--
-- ---------------------------------------------------------------------
-- ⚠️ TROIS PIEGES, ET LE DEUXIEME EST MORTEL
--
-- 1. LE MOT DE PASSE N'EST PAS ICI, ET N'Y SERA JAMAIS.
--    Le role est cree sans mot de passe : il ne peut donc pas encore se
--    connecter. C'est voulu. Aymeri le pose lui-meme, une seule fois,
--    dans l'editeur SQL de Supabase :
--
--        alter role matho_sauvegarde with password 'xxxxx';
--
--    Un mot de passe dans un fichier du depot est un mot de passe
--    publie : le depot est clone, sauvegarde, ouvert dans un editeur.
--
-- 2. ⚠️ RLS S'APPLIQUE A CE ROLE, ET LE REND AVEUGLE.
--    C'est le piege qui transforme une sauvegarde en fichier vide.
--    Toutes les tables de `public` ont RLS active, et les politiques
--    verifient `est_prof()` ou `auth.uid()`. Un role ordinaire qui fait
--    `select * from eleves` obtient donc ZERO ligne — pas une erreur,
--    zero ligne. Le dump reussit, pese 3 Ko, et personne n'est alerte.
--
--    D'ou `bypassrls` ci-dessous. C'est le seul privilege eleve de ce
--    role, et il est indispensable : sans lui, la sauvegarde ment.
--
--    ⚠️ `alter role ... bypassrls` peut etre refuse selon les droits du
--    compte qui applique la migration. SI C'EST LE CAS, la migration le
--    dit et ne s'arrete pas — mais il faut alors executer cette seule
--    ligne dans l'editeur SQL de Supabase, connecte en `postgres` :
--
--        alter role matho_sauvegarde with bypassrls;
--
--    Et surtout : VERIFIER LE NOMBRE DE LIGNES du premier dump fait
--    avec ce role. C'est le seul controle qui prouve que ca marche.
--
-- 3. LES TABLES FUTURES.
--    `grant select on all tables` ne vaut que pour les tables existant
--    aujourd'hui. Sans `alter default privileges`, la table ajoutee par
--    la migration 42 sortirait absente de toutes les sauvegardes
--    suivantes, en silence. La ligne est en bas.
--
-- NUMEROTATION : 20260910233000, l'heure reelle d'ecriture.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Le role, sans mot de passe : il ne peut pas encore se connecter
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'matho_sauvegarde') then
    create role matho_sauvegarde with login;
    raise notice 'Role matho_sauvegarde cree, SANS mot de passe.';
  end if;
end $$;

-- `comment on role` demande le superutilisateur : on n'echoue pas dessus.
do $$
begin
  execute 'comment on role matho_sauvegarde is ' || quote_literal(
    'Sauvegarde en lecture seule (migration 37). Ne sert qu''a pg_dump. '
    'Ne doit JAMAIS recevoir de droit d''ecriture. Mot de passe pose a la '
    'main dans l''editeur SQL de Supabase, jamais dans le depot.');
exception when others then null;
end $$;

-- ---------------------------------------------------------------------
-- 2. Voir au travers de RLS — sans quoi la sauvegarde serait vide
-- ---------------------------------------------------------------------
do $$
begin
  execute 'alter role matho_sauvegarde with bypassrls';
  raise notice 'bypassrls accorde : la sauvegarde verra toutes les lignes.';
exception when insufficient_privilege or feature_not_supported then
  raise warning
    'bypassrls REFUSE. La sauvegarde faite avec ce role serait VIDE. '
    'Executer a la main dans l''editeur SQL Supabase, en postgres : '
    'alter role matho_sauvegarde with bypassrls;';
end $$;

-- ---------------------------------------------------------------------
-- 3. Lire, et rien d'autre
-- ---------------------------------------------------------------------
grant usage on schema public to matho_sauvegarde;
grant select on all tables in schema public to matho_sauvegarde;
grant select on all sequences in schema public to matho_sauvegarde;

-- Les tables qui n'existent pas encore. Sans cette ligne, une table
-- ajoutee dans six mois disparaitrait des sauvegardes sans un mot.
alter default privileges in schema public
  grant select on tables to matho_sauvegarde;
alter default privileges in schema public
  grant select on sequences to matho_sauvegarde;

-- Ceinture et bretelles : on retire explicitement tout ce qui ecrit,
-- y compris ce qu'un `grant all` malencontreux ajouterait plus tard.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from matho_sauvegarde;

-- Il n'appelle aucune fonction : `pg_dump` lit les tables, il n'a pas
-- besoin des RPC de l'application, et chaque fonction `security definer`
-- ouverte a ce role serait une porte qui contourne sa lecture seule.
revoke execute on all functions in schema public from matho_sauvegarde;

-- Le schema `auth` ne le concerne pas : les comptes Google ne sont pas
-- a nous, et RESTAURATION.md explique que l'adresse e-mail suffit a les
-- recoller apres une restauration.
do $$
begin
  execute 'revoke all on schema auth from matho_sauvegarde';
exception when others then null;
end $$;
