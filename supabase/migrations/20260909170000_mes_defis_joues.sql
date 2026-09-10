-- =====================================================================
-- MIGRATION 31 — un eleve doit revoir les defis qu'il a JOUES
--
-- LE DEFAUT, ET C'EST LE MIEN
--
-- `mes_defis()` ne renvoie que les defis dont l'utilisateur est
-- l'AUTEUR :
--     where (prof_courant()  is not null and d.cree_par_prof  = ...)
--        or (eleve_courant() is not null and d.cree_par_eleve = ...)
--
-- Pour un professeur, c'est juste. Pour un eleve, c'est un trou : il
-- joue un defi lance par son professeur — le cas le plus frequent, en
-- classe, celui pour lequel toute cette mecanique existe — et cet ecran
-- ne lui montre rien.
--
-- CE BUG EST DEJA DANS ETAT.md. La liste des defauts attrapes en
-- relecture y dit : « un defi de professeur sans aucun chemin de retour :
-- code note, ecran quitte, resultat jamais revu — c'est-a-dire le moment
-- meme ou l'outil devait servir ». On l'avait corrige en creant l'ecran
-- « Mes defis ». Il n'etait corrige que pour l'AUTEUR.
--
-- Trouve par Aymeri en recette, une seconde fois, sur le meme sujet.
--
-- CE QUE LA FONCTION RENVOIE EN PLUS
--
--   `je_suis_createur`  j'ai cree ce defi
--   `j_ai_joue`         j'y ai participe et termine
--   `mon_score`         mon score, null si je n'y ai pas joue
--   `mon_temps_s`       mon temps, null si je n'y ai pas joue
--
-- DEUX FAITS, DEUX COLONNES, et non un « role » unique. Un eleve peut
-- avoir cree un defi ET y avoir joue : lui imposer un role unique
-- forcerait l'ecran a en choisir un, donc a mentir dans un cas sur deux.
-- C'est la meme regle que pour les populations : on nomme, on ne deduit
-- pas.
--
-- `mon_score` et `mon_temps_s` evitent un second appel par ligne. Le
-- RANG n'est pas renvoye : il demanderait le classement complet de
-- chaque defi, et il est deja a un clic — le bouton « Voir le podium ».
--
-- Le retour change de forme : il faut un drop.
--
-- NUMEROTATION : 20260909170000, l'heure reelle d'ecriture.
-- =====================================================================

drop function if exists public.mes_defis(integer);

create or replace function public.mes_defis(p_limite integer default 20)
returns table (
  defi_id             uuid,
  code                text,
  type                text,
  classe              text,
  tables              smallint[],
  cree_le             timestamptz,
  expire_le           timestamptz,
  encore_ouvert       boolean,
  origine             text,      -- 'prof' | 'eleve'
  auteur_nom          text,
  je_suis_createur    boolean,   -- j'ai cree ce defi
  j_ai_joue           boolean,   -- j'y ai participe et termine
  mon_score           integer,   -- null si je n'y ai pas joue
  mon_temps_s         numeric,   -- null si je n'y ai pas joue
  rejoints            integer,   -- ont SAISI LE CODE (migration 25)
  participants        integer,   -- ont TERMINE, toutes classes
  participants_classe integer,   -- ceux de la classe visee (null si aucune)
  attendus            integer    -- effectif de la classe visee (null sinon)
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
         (d.statut = 'ouvert' and d.expire_le > now()),
         a.origine,
         a.auteur_nom,
         -- Migration 31 : QUI SUIS-JE sur ce defi ? Deux faits distincts,
         -- deux colonnes. Un eleve peut avoir cree un defi ET y avoir
         -- joue : l'ecran a besoin des deux, pas d'un role unique qui
         -- l'obligerait a en choisir un.
         -- coalesce OBLIGATOIRE : sur un defi de prof, `cree_par_eleve`
         -- est null, donc `null = mon_id` vaut NULL — pas false. Sans
         -- lui, la colonne renvoie NULL et un `not je_suis_createur`
         -- cote ecran n'est ni vrai ni faux. Trouve en executant.
         coalesce(d.cree_par_eleve = public.eleve_courant(), false)
           or coalesce(d.cree_par_prof = public.prof_courant(), false),
         exists (select 1 from public.defis_participants p
                  where p.defi_id = d.id
                    and p.eleve_id = public.eleve_courant()),
         (select p.score from public.defis_participants p
           where p.defi_id = d.id and p.eleve_id = public.eleve_courant()),
         (select p.temps_s from public.defis_participants p
           where p.defi_id = d.id and p.eleve_id = public.eleve_courant()),
         -- Ont saisi le code. Vaut 0 pour les defis anterieurs a la
         -- migration 25 : la table de presences n'existait pas.
         (select count(*)::integer from public.defis_presences pr
           where pr.defi_id = d.id),
         -- Ont TERMINE. Sens inchange depuis l'origine.
         (select count(*)::integer from public.defis_participants p
           where p.defi_id = d.id),
         -- Meme population que `attendus` : sans quoi on affiche « 2 / 1 ».
         case when d.cree_par_prof is null or d.classe is null then null else
           (select count(*)::integer
              from public.defis_participants p
              join public.eleves e on e.id = p.eleve_id
             where p.defi_id = d.id and e.classe = d.classe) end,
         -- Un denominateur n'a de sens que pour un defi DE PROF adresse a
         -- une classe. Trois amis sur 27 ne sont pas « 3 / 27 ».
         case when d.cree_par_prof is null or d.classe is null then null else
           (select count(*)::integer from public.eleves e
             where e.actif and e.classe = d.classe) end
    from public.defis d
    cross join lateral public.auteur_defi(d.id) a
   where (public.prof_courant()  is not null and d.cree_par_prof  = public.prof_courant())
      or (public.eleve_courant() is not null and d.cree_par_eleve = public.eleve_courant())
      -- Migration 31 : un eleve voit AUSSI les defis auxquels il a joue.
      or (public.eleve_courant() is not null
          and exists (select 1 from public.defis_participants p
                       where p.defi_id = d.id
                         and p.eleve_id = public.eleve_courant()))
   order by d.cree_le desc
   limit p_limite;
$$;

grant execute on function public.mes_defis(integer) to authenticated;

comment on function public.mes_defis(integer) is
  'Les defis qui concernent l''utilisateur courant : ceux qu''il a crees, ET — pour un eleve — ceux auxquels il a participe (migration 31). Sans cette seconde branche, un eleve qui joue le defi de son professeur n''a aucun chemin de retour vers son resultat, ce qui est precisement le moment ou l''outil doit servir. `je_suis_createur` et `j_ai_joue` sont DEUX faits distincts, jamais un role unique : un eleve peut avoir cree un defi et y avoir joue. QUATRE POPULATIONS pour les compteurs : `rejoints` = ont saisi le code ; `participants` = ont TERMINE, toutes classes ; `participants_classe` et `attendus` comptent la meme population, les eleves de la classe visee. Un denominateur n''a de sens que pour un defi DE PROF adresse a une classe.';
