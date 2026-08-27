-- =====================================================================
-- Calcul Mental Saintho
-- Migration 6/6 : palier « tous » — le tableau d'honneur du collège
-- =====================================================================
--
-- Jusqu'ici, tout classement etait enferme dans un palier : un 6e ne
-- voyait jamais les performances des Experts. C'est le bon reglage par
-- defaut — on ne classe pas une 6e face a un 3e — mais il manquait le
-- cas inverse.
--
-- `p_palier = 'tous'` desactive le filtre. On obtient alors les
-- meilleures performances du college, tous niveaux confondus.
--
-- USAGE : c'est un TABLEAU D'HONNEUR, pas un classement ou l'on se
-- situe. Personne ne s'attend a ce qu'un 6e detienne le record. A
-- afficher comme une vitrine (« les records du college »), jamais
-- comme le classement par defaut — sinon on retombe exactement sur
-- l'effet qu'on cherche a eviter : les memes toujours en tete, et les
-- plus fragiles toujours en bas.
--
-- Rappel des valeurs acceptees :
--   p_palier : 'decouverte' | 'confirme' | 'expert' | 'tous' | NULL
--              (NULL = le palier de l'eleve, comportement par defaut)
--   p_portee : 'classe' | 'niveau' | 'college'
-- =====================================================================

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
            and ((select palier from cible) = 'tous'
                 or s.palier = (select palier from cible))
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
       -- « montee » ignore toujours le palier : c'est le classement qui
       -- montre jusqu'ou chacun est alle, tous niveaux confondus.
       and (p_categorie = 'montee'
            or (select palier from cible) = 'tous'
            or s.palier = (select palier from cible))
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

grant execute on function
  public.classement_records(text, text, text, text, integer),
  public.classement_progression(text, text, text, integer)
to authenticated;
