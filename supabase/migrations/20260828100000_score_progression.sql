-- =====================================================================
-- Calcul Mental Saintho
-- Migration 13 : un seul score de progression, nomme et explicable
-- =====================================================================
--
-- CONSTAT (premiers tests reels, 28 aout 2026)
--
-- Lou voit « 193 Points total » sur son profil et « 1243 pts » au
-- classement. Les deux nombres sont justes, mais ils ne mesurent pas la
-- meme chose — et rien ne le dit. Un eleve conclut a un bug.
--
--   profil      = somme des points de jeu
--   classement  = points de jeu + 100 par jour actif + 50 par case verte
--
-- Cette formule composee est volontaire : elle recompense la regularite
-- et la maitrise, pas seulement le volume joue. Mais elle n'avait ni nom
-- ni definition partagee — elle vivait recopiee dans une seule requete.
--
-- CE QUE FAIT CETTE MIGRATION
--
--   1. `score_progression()` : UNE definition, lisible, avec ses trois
--      composantes exposees separement pour que l'ecran puisse les
--      afficher au lieu de sortir un nombre magique.
--   2. `classement_progression()` s'en sert.
--   3. `mon_profil()` renvoie le meme score, avec son detail.
--
-- Les coefficients restent modifiables ici, en un seul endroit.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Les trois composantes, et leur poids.
--
-- ⚠️ Rapport d'echelle a garder en tete : une partie de 20 bonnes
-- reponses sur des tables difficiles vaut environ 200 points de jeu.
-- Une case verte en vaut 50. Vingt cases vertes pesent donc autant que
-- cinq parties. C'est un choix pedagogique — la maitrise compte plus que
-- le volume — mais il se regle ici et nulle part ailleurs.
-- ---------------------------------------------------------------------
create or replace function public.progression_detail(
  p_eleve  uuid,
  p_depuis timestamptz
)
returns table (
  points_jeu    integer,
  jours_actifs  integer,
  cases_vertes  integer,
  bonus_jours   integer,
  bonus_vertes  integer,
  total         integer
)
language sql stable security definer set search_path = public
as $$
  with j as (
    select coalesce(sum(points), 0)::integer                    as pts,
           count(distinct date_trunc('day', cree_le))::integer  as jours
      from public.sessions_jeu
     where eleve_id = p_eleve and cree_le >= p_depuis
  ),
  v as (
    select count(*)::integer as nb
      from public.maitrise
     where eleve_id = p_eleve and niveau = 3 and derniere_vue >= p_depuis
  )
  select j.pts, j.jours, v.nb,
         100 * j.jours,
         50  * v.nb,
         j.pts + 100 * j.jours + 50 * v.nb
    from j, v;
$$;

comment on function public.progression_detail(uuid, timestamptz) is
  'Score de progression et ses trois composantes. Definition unique, partagee par le classement et le profil : les deux ecrans ne peuvent plus diverger.';

-- ---------------------------------------------------------------------
-- Le classement s'aligne sur la definition partagee.
-- ---------------------------------------------------------------------
create or replace function public.classement_progression(
  p_periode text default 'semaine',
  p_portee  text default 'classe',
  p_palier  text default null,
  p_limite  integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,
  classe      text,
  avatar      text,
  points      integer,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe, plafond_tables from public.eleves where id = public.eleve_courant()
  ),
  cible as (
    select coalesce(p_palier, public.palier_de_plafond(
             (select plafond_tables from moi))) as palier,
           public.debut_periode(p_periode)      as depuis
  ),
  concernes as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
      from public.eleves e
     where e.actif
       and (p_portee = 'college'
            or (p_portee = 'niveau'
                and public.niveau_scolaire(e.classe)
                  = public.niveau_scolaire((select classe from moi)))
            or (p_portee = 'classe' and e.classe = (select classe from moi)))
  ),
  -- Le filtre par palier porte sur les PARTIES jouees a ce palier :
  -- un eleve n'apparait au palier Confirme que s'il y a joue.
  joue as (
    select c.id,
           coalesce((select sum(s.points) from public.sessions_jeu s
                      where s.eleve_id = c.id
                        and s.cree_le >= (select depuis from cible)
                        and ((select palier from cible) = 'tous'
                             or s.palier = (select palier from cible))), 0) as pts_palier
      from concernes c
  ),
  score as (
    select c.id, c.prenom, c.nom, c.classe, c.avatar_emoji,
           j.pts_palier,
           (select total from public.progression_detail(
              c.id, (select depuis from cible))) as total
      from concernes c join joue j on j.id = c.id
  )
  select row_number() over (order by total desc) as rang,
         public.nom_public(prenom, nom),
         classe, avatar_emoji, total,
         id = public.eleve_courant()
    from score
   where pts_palier > 0          -- a joue au palier demande
     and total > 0
   order by rang
   limit p_limite;
$$;

-- ---------------------------------------------------------------------
-- Le profil affiche le MEME nombre que le classement, avec son detail.
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
    -- Le score qui fait foi au classement, avec ses trois composantes.
    -- Meme periode que le classement par defaut : la semaine.
    'progression', (select to_jsonb(p) from public.progression_detail(
        public.eleve_courant(), public.debut_periode('semaine')) p),
    'maitrise', (select coalesce(jsonb_object_agg(fait, niveau), '{}')
        from public.maitrise where eleve_id = public.eleve_courant()),
    'badges', (select coalesce(jsonb_agg(badge_id), '[]')
        from public.badges where eleve_id = public.eleve_courant())
  );
$$;

grant execute on function
  public.progression_detail(uuid, timestamptz),
  public.classement_progression(text, text, text, integer),
  public.mon_profil()
to authenticated;
