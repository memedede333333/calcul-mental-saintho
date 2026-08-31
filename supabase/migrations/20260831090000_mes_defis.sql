-- =====================================================================
-- MIGRATION 17 — « MES DÉFIS » + un nom dans la salle des profs
--
-- Deux trous decouverts en utilisant l'application, pas en la lisant.
--
-- 1. UN DEFI DE PROF EST UN OBJET SANS RETOUR.
--    Le professeur cree un defi, note le code, quitte l'ecran... et il
--    n'a plus AUCUN moyen d'y revenir. Le seul point d'entree vers le
--    classement d'un defi est le champ « Rejoindre un defi », et
--    `rejoindre_defi()` leve une exception si l'appelant n'est pas un
--    eleve (c'est voulu : un prof ne joue pas le defi de sa classe).
--    Resultat : le prof lance le defi le lundi et ne verra jamais le
--    resultat. C'est precisement le moment ou l'outil devait servir.
--
--    `mes_defis()` rend la liste des defis que j'ai crees, avec le
--    nombre de participants et l'effectif attendu. C'est la porte de
--    retour manquante — pour les profs comme pour les eleves.
--
-- 2. « — (toi) 51 pts » DANS LA SALLE DES PROFS.
--    `classement_profs()` renvoyait une colonne `nom`, alors que les
--    trois autres classements renvoient `nom_affiche`. Le composant
--    d'affichage lit `nom_affiche` et retombe sur son tiret par defaut.
--    On aligne le contrat plutot que d'ajouter une exception de plus
--    cote React : quatre classements, quatre fois les memes colonnes.
--    (Le nom reste le nom COMPLET — entre adultes qui se connaissent,
--    « M. D. » n'aurait aucun sens. Seul le nom de la colonne change.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SALLE DES PROFS — meme contrat que les autres classements
-- ---------------------------------------------------------------------
-- Le type de retour change : `create or replace` ne suffit pas.
drop function if exists public.classement_profs(text, text, integer);

create function public.classement_profs(
  p_categorie text default 'points',   -- points | serie | chrono | sprint | montee
  p_periode   text default 'tout',
  p_limite    integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,     -- nom COMPLET : ce sont des collegues
  classe      text,     -- toujours null, present pour l'uniformite
  avatar      text,     -- toujours null, present pour l'uniformite
  valeur      numeric,
  parties     integer,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  select row_number() over (
           order by case when p_categorie = 'sprint' then v end asc nulls last,
                    case when p_categorie <> 'sprint' then v end desc nulls last) as rang,
         nom, null::text, null::text, round(v, 1), parties, moi
    from (
      select p.nom,
             case p_categorie
               when 'points' then sum(s.points)::numeric
               when 'serie'  then max(s.sans_faute_max)::numeric
               when 'chrono' then max(s.points) filter (where s.mode = 'countdown')::numeric
               when 'montee' then max(s.plus_haute_table)::numeric
               when 'sprint' then min(s.duree_s) filter (where s.mode = 'sprint')
             end                                  as v,
             count(*)::integer                    as parties,
             p.id = public.prof_courant()         as moi
        from public.profs p
        join public.sessions_profs s on s.prof_id = p.id
       where p.actif
         and public.est_prof()          -- verrou : rien pour un eleve
         and s.cree_le >= public.debut_periode(p_periode)
       group by p.id, p.nom
    ) x
   where v is not null
   order by rang
   limit p_limite;
$$;

-- ---------------------------------------------------------------------
-- 2. MES DEFIS — la porte de retour
--
-- Un prof voit les defis qu'il a crees ; un eleve, les siens.
-- On renvoie les defis EXPIRES aussi : le resultat d'un defi de lundi
-- se regarde le mardi, quand il est ferme. C'est meme le cas normal.
-- ---------------------------------------------------------------------
create index if not exists defis_createur_prof_idx
  on public.defis (cree_par_prof, cree_le desc)
  where cree_par_prof is not null;

create index if not exists defis_createur_eleve_idx
  on public.defis (cree_par_eleve, cree_le desc)
  where cree_par_eleve is not null;

create or replace function public.mes_defis(p_limite integer default 20)
returns table (
  defi_id         uuid,
  code            text,
  type            text,
  classe          text,
  tables          smallint[],
  cree_le         timestamptz,
  expire_le       timestamptz,
  encore_ouvert   boolean,
  participants    integer,
  attendus        integer
)
language sql
security definer
set search_path = public
as $$
  select d.id,
         d.code,
         d.type,
         d.classe,
         d.tables,
         d.cree_le,
         d.expire_le,
         (d.statut = 'ouvert' and d.expire_le > now())      as encore_ouvert,
         (select count(*)::integer from public.defis_participants p
           where p.defi_id = d.id)                          as participants,
         -- Un denominateur n'a de sens que pour un defi DE PROF adresse
         -- a une classe : « 18 / 27 ont termine ». Pour un defi entre
         -- copains, l'effectif de la classe n'est pas la cible — trois
         -- amis sur 27 ne sont pas « 3 / 27 ». Dans ce cas, null, et
         -- l'interface affiche « 3 ont joue » sans denominateur.
         (select case when d.cree_par_prof is null or d.classe is null
                      then null else
            (select count(*)::integer from public.eleves e
              where e.actif and e.classe = d.classe) end)    as attendus
    from public.defis d
   where (public.prof_courant()  is not null and d.cree_par_prof  = public.prof_courant())
      or (public.eleve_courant() is not null and d.cree_par_eleve = public.eleve_courant())
   order by d.cree_le desc
   limit p_limite;
$$;

grant execute on function
  public.classement_profs(text, text, integer),
  public.mes_defis(integer)
to authenticated;

comment on function public.mes_defis(integer) is
  'Les defis crees par l''utilisateur courant (prof ou eleve), du plus recent au plus ancien, expires compris. Seule porte de retour vers le classement d''un defi passe.';

-- ---------------------------------------------------------------------
-- 3. MEME REGLE POUR `avancement_defi()`
--
-- L'ecran de classement d'un defi affichait « 1 / 27 ont termine » a un
-- eleve qui avait defie deux copains. Le denominateur ne vaut que pour
-- un defi de prof adresse a une classe entiere.
-- ---------------------------------------------------------------------
create or replace function public.avancement_defi(p_defi_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'termines', (select count(*) from public.defis_participants
                  where defi_id = p_defi_id),
    'attendus', (select case
                   when d.cree_par_prof is null or d.classe is null then null
                   else (select count(*) from public.eleves e
                          where e.actif and e.classe = d.classe)
                 end
                   from public.defis d where d.id = p_defi_id)
  );
$$;
