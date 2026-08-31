-- =====================================================================
-- MIGRATION 20 — LES TABLES QUI EXISTENT POUR CETTE CLASSE
--
-- L'ecran « Ma classe » propose un bouton « Lancer un defi sur les
-- tables les plus faibles ». Voici ce qu'il fait aujourd'hui :
--
--   const candidates = [
--       ...tablesAbsentes.slice(0, 3),      // tables JAMAIS ouvertes
--       ...tablesSorted.map(d => d.table_n),
--   ];
--
-- Les tables jamais ouvertes passent EN PREMIER. Le professeur croit
-- lancer un rattrapage sur ce qui bloque ; il lance une decouverte sur
-- ce qui n'a pas encore ete aborde. Ce n'est pas la meme action
-- pedagogique, et ce n'est pas ce qu'annonce le bouton.
--
-- Pire : `tablesAbsentes` est calcule cote React comme « 2 a 20 moins
-- ce que la fonction renvoie ». Dans une 6e plafonnee a 10, les tables
-- 11 a 20 sont donc toutes « jamais ouvertes », et le bouton propose
-- 11, 12, 13. Un defi de prof n'a AUCUN plafond de tables (voir
-- `creer_defi`) : la classe recevrait donc un defi sur des tables
-- qu'aucun de ses eleves n'a le droit de travailler.
--
-- La cause est la meme que les trois bugs de ratio precedents : l'ecran
-- fabrique lui-meme une population que le serveur ne lui a pas donnee.
-- On arrete. `maitrise_classe()` renvoie desormais UNE LIGNE PAR TABLE
-- QUI EXISTE POUR CETTE CLASSE, travaillee ou non, avec de quoi
-- distinguer les trois cas sans aucun calcul cote React :
--
--   travaillee = false            → « jamais ouverte », gris plein
--   travaillee = true, verts bas  → « ca coince », cible du defi
--   dans_le_plafond_commun        → jouable par TOUS les eleves
-- =====================================================================

drop function if exists public.maitrise_classe(text);

create function public.maitrise_classe(p_classe text)
returns table (
  table_n                smallint,
  travaillee             boolean,  -- au moins un eleve l'a rencontree
  dans_le_plafond_commun boolean,  -- tous les eleves de la classe y ont droit
  eleves_verts           integer,
  eleves_jaunes          integer,
  eleves_rouges          integer,
  eleves_sans_trace      integer,  -- effectif - travailleurs, calcule ICI
  eleves_total           integer,  -- ceux qui ont DEJA travaille la table
  eleves_classe          integer,  -- effectif actif de la classe
  taux_maitrise          numeric,  -- % de verts parmi les travailleurs
  taux_couverture        numeric   -- % de la classe qui l'a travaillee
)
language sql
security definer
set search_path = public
as $$
  with classe as (
    select count(*)::integer            as effectif,
           -- Plafond COMMUN : la plus haute table que TOUT LE MONDE peut
           -- travailler. C'est la seule borne sure pour un defi adresse
           -- a la classe entiere.
           min(e.plafond_tables)        as plafond_commun,
           -- Plafond le plus haut atteint dans la classe : borne de
           -- l'affichage, pour ne pas masquer le travail des plus avances.
           max(e.plafond_tables)        as plafond_max
      from public.eleves e
     where e.classe = p_classe and e.actif
  ),
  -- Une ligne par table existante pour cette classe, meme vide.
  toutes as (
    select generate_series(2, greatest(coalesce((select plafond_max from classe), 10), 2))::smallint as t
     where public.prof_voit_classe(p_classe)
  ),
  travail as (
    select split_part(m.fait, '_', 2)::smallint as t,
           m.eleve_id,
           max(m.niveau) as niv
      from public.maitrise m
      join public.eleves e on e.id = m.eleve_id
     where e.classe = p_classe and e.actif
     group by 1, 2
  ),
  agrege as (
    select t,
           count(*) filter (where niv = 3)::integer as verts,
           count(*) filter (where niv = 2)::integer as jaunes,
           count(*) filter (where niv = 1)::integer as rouges,
           count(*)::integer                        as total
      from travail
     group by t
  )
  select tt.t,
         coalesce(a.total, 0) > 0,
         tt.t <= coalesce((select plafond_commun from classe), 0),
         coalesce(a.verts, 0),
         coalesce(a.jaunes, 0),
         coalesce(a.rouges, 0),
         (select effectif from classe) - coalesce(a.total, 0),
         coalesce(a.total, 0),
         (select effectif from classe),
         round(100.0 * coalesce(a.verts, 0) / nullif(a.total, 0), 0),
         round(100.0 * coalesce(a.total, 0)
               / nullif((select effectif from classe), 0), 0)
    from toutes tt
    left join agrege a on a.t = tt.t
   order by tt.t;
$$;

grant execute on function public.maitrise_classe(text) to authenticated;

comment on function public.maitrise_classe(text) is
  'Maitrise agregee d''une classe : UNE LIGNE PAR TABLE existant pour cette classe (jusqu''au plus haut plafond de ses eleves), travaillee ou non — l''ecran ne doit plus fabriquer la liste des tables ni soustraire quoi que ce soit. Populations : `eleves_verts/jaunes/rouges/total` comptent les eleves AYANT TRAVAILLE la table ; `eleves_sans_trace` et `eleves_classe` comptent la classe. `taux_maitrise` se rapporte a `eleves_total`, `taux_couverture` a `eleves_classe`. `dans_le_plafond_commun` = table jouable par TOUS les eleves actifs : c''est la seule borne sure pour un defi de classe.';
