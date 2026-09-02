-- =====================================================================
-- Calcul Mental Saintho
-- Migration 23 : dire le plafond avec les mots du professeur
-- =====================================================================
--
-- CONSTAT (2 septembre 2026, recette d'Aymeri)
--
-- L'avertissement affiche : « 1 eleve sur 2 n'a pas encore debloque la
-- table 15 — lancer quand meme ? »
--
-- Aymeri le lit et le croit faux : « les 2 eleves de la 31 ne l'ont pas
-- fait ». Verification faite, **le compteur est juste** : dans cette
-- classe un eleve a un plafond de 10 et l'autre de 15. Un seul est donc
-- au-dessous de 15.
--
-- Ce qui est faux, c'est le MOT. « Debloque » designe `plafond_tables`,
-- un mecanisme que le professeur ne voit nomme nulle part : ni sur
-- « Ma classe », ni sur une fiche eleve, ni dans l'aide. Lui lit
-- « debloque » et comprend « travaille » — et sur cet ecran-la, les
-- deux eleves n'ont effectivement jamais travaille la table 15.
--
-- Deux notions distinctes, un seul mot pour les dire :
--
--   plafond_tables  = jusqu'ou l'eleve a le DROIT d'aller
--                     (gagne par la Montee des tables)
--   maitrise        = ce qu'il a effectivement TRAVAILLE
--
-- Un chiffre juste que personne ne sait lire ne vaut pas mieux qu'un
-- chiffre faux : dans les deux cas le professeur decide sur une
-- comprehension erronee. C'est la meme famille que les bugs de
-- population, transposee au vocabulaire.
--
-- LE CORRECTIF
--
-- La fonction renvoie de quoi ecrire une phrase qui se suffit a
-- elle-meme, sans jargon et avec son point de repere :
--
--   « La table 15 depasse le niveau atteint par 1 eleve sur 2.
--     Le plus bas de la classe s'arrete a la table 10. »
--
-- `plafond_commun` (le plus bas de la classe) est ce point de repere.
-- `plafond_max` complete le tableau pour l'ecran qui voudrait le dire.
-- Aucun compteur existant ne change de sens.
--
-- NUMEROTATION : 20260902100000, l'heure reelle d'ecriture.
-- =====================================================================

create or replace function public.apercu_defi_classe(
  p_classe text,
  p_tables smallint[]
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'classe',              p_classe,
    'table_max',           (select max(x) from unnest(p_tables) x),
    -- Populations : les trois compteurs ci-dessous portent TOUS sur les
    -- eleves ACTIFS de `p_classe`. Aucun ne se rapporte a ceux qui ont
    -- travaille la table — c'est une autre population, et c'est
    -- precisement la confusion que cette migration corrige.
    'eleves_classe',       count(*),
    'eleves_hors_plafond', count(*) filter (
                             where e.plafond_tables
                                 < (select max(x) from unnest(p_tables) x)),
    -- Le point de repere : le plafond le plus bas de la classe. C'est
    -- lui qui permet d'ecrire « le plus bas de la classe s'arrete a la
    -- table 10 » au lieu d'un « debloque » que personne ne sait lire.
    'plafond_commun',      min(e.plafond_tables),
    'plafond_max',         max(e.plafond_tables))
    from public.eleves e
   where e.classe = p_classe
     and e.actif
     and public.prof_voit_classe(p_classe);
$$;

grant execute on function public.apercu_defi_classe(text, smallint[]) to authenticated;

comment on function public.apercu_defi_classe(text, smallint[]) is
  'Avant de creer un defi de classe : combien d''eleves n''ont pas atteint la plus haute table choisie, et ou s''arrete le plus faible. Populations : `eleves_classe`, `eleves_hors_plafond`, `plafond_commun` et `plafond_max` portent TOUS sur les eleves ACTIFS de `p_classe` — jamais sur ceux qui ont travaille la table, qui sont une autre population. `plafond_tables` est un DROIT gagne par la Montee des tables, pas une trace de travail : ne jamais l''afficher avec le mot « travaille ». Reserve aux enseignants (prof_voit_classe) : un eleve obtient 0 partout.';
