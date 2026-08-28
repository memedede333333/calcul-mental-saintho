-- =====================================================================
-- Calcul Mental Saintho
-- Migration 11 : `mon_profil()` renvoie enfin le plafond et les points
-- =====================================================================
--
-- CONSTAT (avant l'etape 3, 27 aout 2026)
--
-- L'ecran Profil doit afficher trois choses que `mon_profil()` ne
-- renvoyait pas :
--
--   * le PLAFOND de tables reellement debloque
--   * le PALIER (Decouverte / Confirme / Expert), qui en decoule
--   * le TOTAL DE POINTS ponderes
--
-- Pire : la fonction renvoyait `tables_autorisees`, une colonne
-- FOSSILE. Elle vaut 1..10 pour tout le monde depuis le premier jour,
-- un trigger de protection interdit sa modification, et rien ne la met
-- a jour. Un eleve Expert ayant debloque la table 17 y lisait encore
-- « 1 a 10 ». Un ecran construit dessus aurait ete faux sans que
-- personne ne comprenne pourquoi.
--
-- C'est `plafond_tables` qui fait foi, et elle seule.
--
-- `tables_autorisees` est conservee — la supprimer casserait les types
-- generes et `qui_suis_je()` — mais elle est marquee comme obsolete et
-- ne doit servir a AUCUN affichage.
-- =====================================================================

comment on column public.eleves.tables_autorisees is
  'OBSOLETE — vestige de la version Google Sheets. Figee a 1..10, protegee en ecriture, jamais mise a jour. Ne rien afficher a partir de cette colonne : le plafond reel est `plafond_tables`.';

-- ---------------------------------------------------------------------
-- Le palier d'un eleve, deduit de son plafond.
-- Une seule definition, partagee par le profil et les classements.
-- ---------------------------------------------------------------------
create or replace function public.palier_de_plafond(p_plafond smallint)
returns text
language sql immutable
as $$
  select case when coalesce(p_plafond, 10) <= 10 then 'decouverte'
              when coalesce(p_plafond, 10) <= 12 then 'confirme'
              else 'expert' end;
$$;

comment on function public.palier_de_plafond(smallint) is
  'Decouverte <= 10, Confirme <= 12, Expert au-dela. Le palier n''est jamais saisi : il se deduit du plafond debloque.';

-- ---------------------------------------------------------------------
-- Profil complet, en un seul appel.
-- ---------------------------------------------------------------------
create or replace function public.mon_profil()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profil', (select to_jsonb(x) from (
        select id, prenom, nom, classe, avatar_emoji, email,
               plafond_tables,
               public.palier_de_plafond(plafond_tables) as palier,
               tables_autorisees   -- OBSOLETE, ne rien afficher avec
          from public.eleves where id = public.eleve_courant()) x),
    'records', (select jsonb_build_object(
        'meilleure_serie',   coalesce(max(sans_faute_max), 0),
        'meilleur_chrono',   coalesce(max(score) filter (where mode = 'countdown'), 0),
        -- Depuis la migration 10, cette colonne n'est renseignee qu'en
        -- mode Montee : elle designe donc une table VRAIMENT atteinte.
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
    'maitrise', (select coalesce(jsonb_object_agg(fait, niveau), '{}')
        from public.maitrise where eleve_id = public.eleve_courant()),
    'badges', (select coalesce(jsonb_agg(badge_id), '[]')
        from public.badges where eleve_id = public.eleve_courant())
  );
$$;

grant execute on function public.palier_de_plafond(smallint) to authenticated;
grant execute on function public.mon_profil() to authenticated;
