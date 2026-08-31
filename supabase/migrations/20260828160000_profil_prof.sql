-- =====================================================================
-- Calcul Mental Saintho
-- Migration 16 : un profil pour les enseignants, et un refus honnete
-- =====================================================================
--
-- CONSTAT (verifie en executant la fonction, pas en la lisant)
--
-- `mon_profil()` appelee par un ENSEIGNANT ne leve aucune erreur. Elle
-- renvoie un succes :
--
--   { "profil": null, "records": { tout a 0 }, "progression": { 0 } }
--
-- Le front croit donc avoir un profil valide. Il affiche zero partout,
-- « Decouverte » et « Tables debloquees : 1 a 10 » — des informations
-- FAUSSES au sujet de la personne connectee. Le garde-fou d'erreur du
-- front ne se declenche jamais, puisqu'il n'y a pas d'erreur.
--
-- C'est la regle qu'on s'est fixee des le premier jour : une donnee
-- inventee qui se fait passer pour vraie.
--
-- DEUX CORRECTIFS
--
--   1. `mon_profil()` REFUSE explicitement un non-eleve. Une fonction
--      qui s'appelle « mon profil » ne doit pas renvoyer un profil vide
--      a quelqu'un qui a un profil ailleurs.
--
--   2. `mon_profil_prof()` existe, symetrique, alimentee par
--      `sessions_profs`. Les enseignants peuvent jouer depuis la
--      migration 9 ; il leur manquait l'ecran qui montre leurs propres
--      resultats.
-- =====================================================================

create or replace function public.mon_profil()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case when public.eleve_courant() is null then
    -- Refus explicite : le front doit afficher SON ecran, pas des zeros.
    jsonb_build_object('ok', false, 'raison', 'pas_un_eleve',
      'message', 'Ce profil est reserve aux eleves.')
  else
  jsonb_build_object(
    'profil', (select to_jsonb(x) from (
        select id, prenom, nom, classe, avatar_emoji, email,
               plafond_tables,
               public.palier_de_plafond(plafond_tables) as palier,
               tables_autorisees   -- OBSOLETE, ne rien afficher avec
          from public.eleves where id = public.eleve_courant()) x),
    'records', (select jsonb_build_object(
        'meilleure_serie',   coalesce(max(sans_faute_max), 0),
        'meilleur_chrono',   coalesce(max(score) filter (where mode = 'countdown'), 0),
        'plus_haute_table',  coalesce(max(plus_haute_table), 0),
        'nb_sessions',       count(*),
        'points_total',      coalesce(sum(points), 0),
        'points_semaine',    coalesce(sum(points)
                               filter (where cree_le >= public.debut_periode('semaine')), 0),
        'jours_actifs_7j',   (select count(distinct date_trunc('day', cree_le))
                                from public.sessions_jeu
                               where eleve_id = public.eleve_courant()
                                 and cree_le > now() - interval '7 days'))
        from public.sessions_jeu where eleve_id = public.eleve_courant()),
    'progression', (select to_jsonb(p) from public.progression_detail(
        public.eleve_courant(), public.debut_periode('semaine')) p),
    'maitrise', (select coalesce(jsonb_object_agg(fait, niveau), '{}')
        from public.maitrise where eleve_id = public.eleve_courant()),
    'badges', (select coalesce(jsonb_agg(badge_id), '[]')
        from public.badges where eleve_id = public.eleve_courant()))
  end;
$$;

-- ---------------------------------------------------------------------
-- Le profil d'un enseignant.
--
-- Volontairement plus sobre que celui d'un eleve : ni palier, ni grille
-- de maitrise, ni badges. Un adulte qui joue le fait pour comprendre
-- l'outil et se mesurer a ses collegues, pas pour etre remedie.
-- ---------------------------------------------------------------------
create or replace function public.mon_profil_prof()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case when public.prof_courant() is null then
    jsonb_build_object('ok', false, 'raison', 'pas_un_prof',
      'message', 'Ce profil est reserve aux enseignants.')
  else
  jsonb_build_object(
    'profil', (select to_jsonb(x) from (
        select id, nom, email, role, classes,
               role = 'admin' as est_admin
          from public.profs where id = public.prof_courant()) x),
    'records', (select jsonb_build_object(
        'nb_sessions',      count(*),
        'points_total',     coalesce(sum(points), 0),
        'points_semaine',   coalesce(sum(points)
                              filter (where cree_le >= public.debut_periode('semaine')), 0),
        'meilleure_serie',  coalesce(max(sans_faute_max), 0),
        'meilleur_chrono',  coalesce(max(score) filter (where mode = 'countdown'), 0),
        'meilleur_sprint',  coalesce(min(duree_s) filter (where mode = 'sprint'), 0),
        'plus_haute_table', coalesce(max(plus_haute_table), 0))
        from public.sessions_profs where prof_id = public.prof_courant()),
    -- Sa place dans la salle des profs, s'il a joue.
    'rang_salle_des_profs', (
        select rang from public.classement_profs('points', 'tout', 100)
         where est_moi limit 1))
  end;
$$;

grant execute on function public.mon_profil(), public.mon_profil_prof()
to authenticated;
