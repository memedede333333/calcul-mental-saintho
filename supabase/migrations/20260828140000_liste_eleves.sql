-- =====================================================================
-- Calcul Mental Saintho
-- Migration 15 : lister les eleves d'une classe
-- =====================================================================
--
-- CONSTAT (premiers tests de l'ecran Administration)
--
-- L'ecran affiche « Classe 31 — 1 eleve actif » puis, juste en dessous,
-- « Aucun eleve actif dans cette classe ». Les deux viennent de sources
-- differentes :
--
--   le compteur  ->  liste_classes()        : compte TOUS les actifs
--   la liste     ->  eleves_sans_connexion(): ne renvoie que ceux qui
--                                             ne se sont JAMAIS connectes
--
-- Un eleve qui se connecte disparait donc de la liste de son propre
-- professeur. C'est le seul cas ou l'ecran se contredit lui-meme.
--
-- La cause est un manque : aucune fonction ne listait simplement les
-- eleves d'une classe. `eleves_sans_connexion()` etait la plus proche,
-- elle a ete prise par defaut.
--
-- Cette migration comble le trou. `eleves_sans_connexion()` reste : elle
-- repond a une autre question — « qui n'a pas encore mis le pied dans
-- l'application ? » — utile a la rentree, mais ce n'est pas une liste
-- de classe.
-- =====================================================================

create or replace function public.liste_eleves(p_classe text default null)
returns table (
  eleve_id          uuid,
  email             text,
  prenom            text,
  nom               text,
  classe            text,
  avatar_emoji      text,
  plafond_tables    smallint,
  palier            text,
  actif             boolean,
  deja_connecte     boolean,
  derniere_connexion timestamptz,
  nb_sessions       integer,
  points_semaine    integer
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.email, e.prenom, e.nom, e.classe, e.avatar_emoji,
         e.plafond_tables,
         public.palier_de_plafond(e.plafond_tables),
         e.actif,
         e.user_id is not null,
         e.derniere_connexion,
         coalesce(s.n, 0)::integer,
         coalesce(s.pts_semaine, 0)::integer
    from public.eleves e
    left join lateral (
      select count(*) as n,
             sum(points) filter (
               where cree_le >= public.debut_periode('semaine')) as pts_semaine
        from public.sessions_jeu where eleve_id = e.id
    ) s on true
   where public.est_prof()                 -- verrou : rien pour un eleve
     and (p_classe is null or e.classe = p_classe)
   -- Les eleves desactives passent en dernier, mais restent visibles :
   -- c'est ce qui permet de les reactiver.
   order by e.actif desc, e.nom, e.prenom;
$$;

comment on function public.liste_eleves(text) is
  'Les eleves d''une classe (ou tous si p_classe est null), actifs ET desactives. C''est CETTE fonction que l''ecran Administration doit utiliser — pas eleves_sans_connexion(), qui repond a la question « qui n''a jamais ouvert l''application ? ».';

grant execute on function public.liste_eleves(text) to authenticated;
