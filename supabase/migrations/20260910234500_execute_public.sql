-- =====================================================================
-- MIGRATION 38 — fermer la porte que PostgreSQL laisse ouverte
--
-- ---------------------------------------------------------------------
-- CE QUI A ETE TROUVE, ET COMMENT
--
-- En verifiant que le role de sauvegarde (migration 37) ne pouvait
-- appeler aucune fonction, le test a echoue : il le pouvait. En
-- cherchant pourquoi, on a trouve bien pire.
--
-- PostgreSQL accorde `EXECUTE` a **PUBLIC** sur toute fonction creee,
-- et `grant execute ... to authenticated` n'enleve pas ce droit par
-- defaut : il s'ajoute a cote. Les 55 `grant` semes dans les 37
-- migrations donnaient donc une fausse impression de fermeture.
--
-- Consequence, mesuree en se faisant passer pour un visiteur anonyme
-- sur la base de test :
--
--   classement_progression('tout','college','tous',500)  ->  6 lignes
--   classement_classes()                                 ->  3 lignes
--
-- Autrement dit : **avec la seule cle `anon`, qui est publique par
-- construction puisqu'elle est embarquee dans le JavaScript de
-- l'application, n'importe qui sur Internet pouvait lire le prenom,
-- l'initiale du nom et la classe de tous les eleves ayant joue**, plus
-- l'effectif de chaque classe. Sans compte, sans connexion.
--
-- Ce sont des donnees de mineurs. C'est le defaut le plus grave trouve
-- dans ce projet.
--
-- Les autres fonctions ne fuyaient pas : elles se gardent elles-memes
-- (`est_prof()`, `eleve_courant()`) et renvoient zero ligne a un
-- inconnu. Les deux classements, eux, sont faits pour montrer tout le
-- monde a tout le monde — il leur manquait seulement d'exiger un
-- « tout le monde » connecte.
--
-- ---------------------------------------------------------------------
-- ⚠️ LE PIEGE DU CORRECTIF, ET IL EST SEVERE
--
-- Retirer `execute` a PUBLIC casse les politiques RLS si on n'y prend
-- pas garde. Une politique est evaluee **avec les droits de celui qui
-- interroge**, pas de celui qui l'a ecrite. Or cinq fonctions sont
-- appelees dans les politiques :
--
--   est_prof()   est_admin()   eleve_courant()   prof_courant()
--   prof_voit_classe(text)
--
-- et aucune n'a jamais recu de `grant` explicite : elles ne marchaient
-- que par PUBLIC. Les retirer sans les rendre revient a fermer toutes
-- les tables a tout le monde, professeurs compris.
--
-- Elles sont donc accordees nommement ci-dessous. C'est la partie du
-- correctif qu'il ne faut surtout pas « simplifier ».
--
-- ---------------------------------------------------------------------
-- ⚠️ ET LE SECOND PIEGE, QUI M'A EU
--
-- J'ai d'abord verifie que les 40 fonctions appelees par `api.js`
-- etaient toutes accordees a `authenticated`, avec
-- `has_function_privilege('authenticated', ...)`. Elles l'etaient
-- toutes. C'etait un controle vide : cette fonction repond « oui » des
-- que PUBLIC a le droit. Elle mesurait exactement ce que je cherchais a
-- supprimer.
--
-- Le scenario de test a plante des le premier cas, sur
-- `permission denied for function enregistrer_session`. En regardant
-- cette fois les ACL une par une, on trouve dix fonctions sans `grant`
-- explicite — et parmi elles **`enregistrer_session`, la fonction la
-- plus appelee de toute l'application**. Elle n'a jamais ete accordee :
-- elle vivait sur le droit PUBLIC. La migration 26 lui avait ajoute le
-- parametre `p_faits`, creant une nouvelle signature que le `grant`
-- d'une migration anterieure ne designait plus.
--
-- Les neuf autres sont des aides internes ou des declencheurs, appeles
-- depuis des fonctions `security definer` : ils s'executent avec les
-- droits du proprietaire et n'ont besoin d'aucun `grant`.
--
-- MORALE : `has_function_privilege` ne sait pas distinguer un droit
-- explicite d'un droit herite de PUBLIC. Pour verifier une fermeture,
-- il faut lire `proacl`.
--
-- NUMEROTATION : 20260910234500, l'heure reelle d'ecriture.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Personne par defaut
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;

-- Et pour toutes les fonctions a venir : sans cette ligne, la migration
-- 45 rouvrirait le trou sans que personne s'en apercoive.
alter default privileges in schema public
  revoke execute on functions from public;
alter default privileges in schema public
  revoke execute on functions from anon;

-- ---------------------------------------------------------------------
-- 2. Sauf les cinq fonctions dont RLS a besoin
--
-- Elles ne divulguent rien par elles-memes : elles repondent « qui
-- est connecte ». A un visiteur anonyme, elles repondent « personne »,
-- ce qui est exactement le comportement voulu.
-- ---------------------------------------------------------------------
grant execute on function
  public.est_prof(),
  public.est_admin(),
  public.eleve_courant(),
  public.prof_courant(),
  public.prof_voit_classe(text)
to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. `enregistrer_session` : le grant qui manquait depuis la migration 26
--
-- C'est la fonction la plus appelee de l'application — chaque partie de
-- chaque eleve passe par elle. Elle n'a jamais eu de `grant` : elle
-- fonctionnait grace au droit PUBLIC qu'on vient de retirer. Sans cette
-- ligne, plus aucun eleve ne peut enregistrer une partie.
-- ---------------------------------------------------------------------
grant execute on function public.enregistrer_session(
  text, smallint[], integer, integer, jsonb, numeric, integer, integer,
  smallint, jsonb, uuid, integer, jsonb)
to authenticated;

-- ---------------------------------------------------------------------
-- 4. Le role de sauvegarde n'execute toujours rien
--
-- Il lit des tables, c'est tout son travail. Le `revoke` de la
-- migration 37 etait sans effet tant que PUBLIC donnait le droit ; il
-- prend effet maintenant.
-- ---------------------------------------------------------------------
do $$
begin
  execute 'revoke execute on all functions in schema public from matho_sauvegarde';
exception when undefined_object then null;
end $$;

comment on schema public is
  'Schema applicatif de matHo. REGLE (migration 38) : `execute` est retire a PUBLIC, sur les fonctions existantes ET futures. Toute nouvelle fonction doit donc porter son propre `grant execute ... to authenticated` — sans quoi l''application recevra « permission denied ». C''est voulu : avant la migration 38, PostgreSQL ouvrait chaque fonction a tout le monde, et un visiteur anonyme muni de la seule cle publique lisait le classement nominatif de tout le college.';
