-- =====================================================================
-- Calcul Mental Saintho
-- Migration 5/5 : classement par niveau scolaire
-- =====================================================================
--
-- Il manquait une portée. Les classements offraient « ma classe » et
-- « tout le collège », plus trois paliers de difficulté — mais rien
-- pour « tous les 6ᵉ ».
--
-- Or c'est le périmètre le plus naturel pour un élève : il connaît les
-- autres 6ᵉ, il les croise à la récréation, et la comparaison entre
-- classes d'un même niveau est ce qui fait vraiment marcher l'émulation.
--
-- ⚠️ NE PAS CONFONDRE avec les paliers :
--
--   niveau scolaire  6ᵉ / 5ᵉ / 4ᵉ / 3ᵉ        → l'âge de l'élève
--   palier           Découverte / Confirmé /   → la difficulté des
--                    Expert                      tables qu'il travaille
--
-- Un 6ᵉ et un 4ᵉ peuvent tous deux être en Découverte. Un 6ᵉ précoce
-- peut être en Expert. Les deux axes sont indépendants et se combinent.
--
-- Le niveau est déduit du premier caractère de la classe : « 6A » → 6.
-- =====================================================================

create or replace function public.niveau_scolaire(p_classe text)
returns text
language sql immutable
as $$
  select nullif(substring(coalesce(p_classe, '') from '^[0-9]'), '');
$$;

comment on function public.niveau_scolaire(text) is
  'Niveau scolaire deduit du nom de classe : 6A -> 6. NULL si le format ne commence pas par un chiffre.';

-- ---------------------------------------------------------------------
-- CLASSEMENT PROGRESSION — ajout de la portée 'niveau'
-- p_portee : 'classe' | 'niveau' | 'college'
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
    select coalesce(p_palier,
      case when (select plafond_tables from moi) <= 10 then 'decouverte'
           when (select plafond_tables from moi) <= 12 then 'confirme'
           else 'expert' end) as palier,
      public.debut_periode(p_periode) as depuis
  ),
  activite as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           coalesce(sum(s.points), 0)                    as pts,
           count(distinct date_trunc('day', s.cree_le))  as jours
      from public.eleves e
      left join public.sessions_jeu s
             on s.eleve_id = e.id
            and s.cree_le >= (select depuis from cible)
            and s.palier   = (select palier from cible)
     where e.actif
       and (p_portee = 'college'
            or (p_portee = 'niveau'
                and public.niveau_scolaire(e.classe)
                  = public.niveau_scolaire((select classe from moi)))
            or (p_portee = 'classe' and e.classe = (select classe from moi)))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  ),
  verts as (
    select eleve_id, count(*) as nb from public.maitrise
     where niveau = 3 and derniere_vue >= (select depuis from cible)
     group by eleve_id
  )
  select row_number() over (order by
           (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0)) desc)  as rang,
         public.nom_public(a.prenom, a.nom),
         a.classe,
         a.avatar_emoji,
         (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0))::integer as points,
         a.id = public.eleve_courant()
    from activite a
    left join verts v on v.eleve_id = a.id
   where (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0)) > 0
   order by rang
   limit p_limite;
$$;

-- ---------------------------------------------------------------------
-- CLASSEMENT RECORDS — ajout de la portée 'niveau'
-- ---------------------------------------------------------------------
create or replace function public.classement_records(
  p_categorie text default 'serie',
  p_periode   text default 'tout',
  p_portee    text default 'classe',
  p_palier    text default null,
  p_limite    integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,
  classe      text,
  avatar      text,
  valeur      numeric,
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
    select coalesce(p_palier,
      case when (select plafond_tables from moi) <= 10 then 'decouverte'
           when (select plafond_tables from moi) <= 12 then 'confirme'
           else 'expert' end) as palier
  ),
  base as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           case p_categorie
             when 'serie'  then max(s.sans_faute_max)::numeric
             when 'chrono' then max(s.points) filter (where s.mode = 'countdown')::numeric
             when 'montee' then max(s.plus_haute_table)::numeric
             when 'points' then sum(s.points)::numeric
             when 'sprint' then min(s.duree_s + 3 * jsonb_array_length(s.erreurs))
                                 filter (where s.mode = 'sprint')
           end as valeur
      from public.eleves e
      join public.sessions_jeu s on s.eleve_id = e.id
     where e.actif
       and s.cree_le >= public.debut_periode(p_periode)
       and (p_categorie = 'montee' or s.palier = (select palier from cible))
       and (p_portee = 'college'
            or (p_portee = 'niveau'
                and public.niveau_scolaire(e.classe)
                  = public.niveau_scolaire((select classe from moi)))
            or (p_portee = 'classe' and e.classe = (select classe from moi)))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  )
  select row_number() over (
           order by case when p_categorie = 'sprint' then valeur end asc nulls last,
                    case when p_categorie <> 'sprint' then valeur end desc nulls last
         ) as rang,
         public.nom_public(prenom, nom),
         classe,
         avatar_emoji,
         round(valeur, 1),
         id = public.eleve_courant()
    from base
   where valeur is not null
   order by rang
   limit p_limite;
$$;

-- ---------------------------------------------------------------------
-- CLASSEMENT DES CLASSES
-- Un classement d'équipes, en plus des classements individuels.
--
-- À cet âge, l'émulation collective marche souvent mieux que
-- l'exposition individuelle : personne n'est exposé en bas de tableau,
-- et un élève faible qui s'entraîne fait gagner sa classe.
--
-- Le total est ramené à une MOYENNE par élève actif, sinon une classe
-- de 30 écrase mécaniquement une classe de 24.
-- ---------------------------------------------------------------------
create or replace function public.classement_classes(
  p_periode text default 'semaine',
  p_niveau  text default null      -- '6' | '5' | '4' | '3' ; NULL = tout le collège
)
returns table (
  rang            bigint,
  classe          text,
  eleves_actifs   integer,
  eleves_total    integer,
  points_moyens   integer,
  est_ma_classe   boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (select classe from public.eleves where id = public.eleve_courant()),
  bornes as (select public.debut_periode(p_periode) as depuis),
  par_classe as (
    select e.classe,
           count(distinct e.id)                                   as total,
           count(distinct s.eleve_id)                             as actifs,
           coalesce(sum(s.points), 0)                             as pts
      from public.eleves e
      left join public.sessions_jeu s
             on s.eleve_id = e.id
            and s.cree_le >= (select depuis from bornes)
     where e.actif
       and (p_niveau is null or public.niveau_scolaire(e.classe) = p_niveau)
     group by e.classe
  )
  select row_number() over (order by (pts / greatest(total, 1)) desc) as rang,
         classe,
         actifs::integer,
         total::integer,
         (pts / greatest(total, 1))::integer                      as points_moyens,
         classe = (select classe from moi)                        as est_ma_classe
    from par_classe
   where total > 0
   order by rang;
$$;

grant execute on function
  public.niveau_scolaire(text),
  public.classement_classes(text, text),
  public.classement_records(text, text, text, text, integer),
  public.classement_progression(text, text, text, integer)
to authenticated;
