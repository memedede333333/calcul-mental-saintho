-- =====================================================================
-- MIGRATION 19 — « 18 ELEVES SUR 27 », ET SUR 27 POUR DE VRAI
--
-- `maitrise_classe()` renvoyait `eleves_total` : le nombre d'eleves
-- ayant DEJA TRAVAILLE cette table. Pas l'effectif de la classe.
--
-- Affiche tel quel, cela donne « 18 sur 20 » dans une classe de 27 :
-- flatteur et faux. Les neuf eleves qui n'ont jamais ouvert la table de
-- 7 disparaissent du denominateur — or ce sont precisement ceux dont le
-- professeur doit s'occuper.
--
-- C'est la troisieme fois en deux jours qu'un ratio melange deux
-- populations (voir migrations 17 et 18). On ajoute donc la colonne
-- plutot que de laisser l'ecran la deviner : `eleves_classe`, l'effectif
-- actif de la classe, identique sur toutes les lignes.
--
-- On garde `eleves_total` : « 20 eleves ont travaille cette table, 18 la
-- maitrisent » reste une information utile. Ce sont deux phrases
-- differentes, et l'ecran doit pouvoir dire les deux.
--
-- `taux_maitrise` reste calcule sur ceux qui ont travaille la table :
-- c'est un taux de reussite, pas un taux de couverture. Un nouveau
-- `taux_couverture` dit combien de la classe s'y est mise.
-- =====================================================================

drop function if exists public.maitrise_classe(text);

create function public.maitrise_classe(p_classe text)
returns table (
  table_n        smallint,
  eleves_verts   integer,
  eleves_jaunes  integer,
  eleves_rouges  integer,
  eleves_total   integer,   -- ceux qui ont DEJA TRAVAILLE cette table
  eleves_classe  integer,   -- effectif actif de la classe (constante)
  taux_maitrise  numeric,   -- % de verts parmi ceux qui l'ont travaillee
  taux_couverture numeric   -- % de la classe qui l'a travaillee
)
language sql
security definer
set search_path = public
as $$
  with effectif as (
    select count(*)::integer as n
      from public.eleves e
     where e.classe = p_classe and e.actif
  )
  select t::smallint,
         count(*) filter (where niv = 3)::integer,
         count(*) filter (where niv = 2)::integer,
         count(*) filter (where niv = 1)::integer,
         count(*)::integer,
         (select n from effectif),
         round(100.0 * count(*) filter (where niv = 3) / nullif(count(*), 0), 0),
         round(100.0 * count(*) / nullif((select n from effectif), 0), 0)
    from (
      select split_part(m.fait, '_', 2)::smallint as t,
             m.eleve_id,
             max(m.niveau) as niv
        from public.maitrise m
        join public.eleves e on e.id = m.eleve_id
       where e.classe = p_classe and e.actif
         and public.prof_voit_classe(p_classe)
       group by 1, 2
    ) x
   group by t
   order by t;
$$;

grant execute on function public.maitrise_classe(text) to authenticated;

comment on function public.maitrise_classe(text) is
  'Maitrise agregee d''une classe, table par table. ATTENTION : `eleves_total` compte ceux qui ont deja travaille la table, `eleves_classe` est l''effectif. Ne jamais afficher un vert sur `eleves_total` en le presentant comme un ratio de classe.';
