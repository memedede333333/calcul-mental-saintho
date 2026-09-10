-- =====================================================================
-- MIGRATION 33 — `nb_questions` n'a de sens que pour un Sprint
--
-- La migration 32 renvoyait `jsonb_array_length(d.questions)` pour tous
-- les defis. Verifie apres coup sur un vrai defi : un Contre-la-montre
-- de 30 secondes renvoie **120**.
--
-- C'est exact et c'est trompeur. `creer_defi` fige 120 questions pour un
-- Contre-la-montre (migration 21, l. 53) parce qu'on ignore combien
-- l'eleve en fera : c'est une RESERVE, pas un objectif. Personne ne
-- repond a 120 questions en deux minutes.
--
-- Le nom de la colonne invitait donc a afficher « 120 questions » sur
-- une partie de 30 secondes. Le commentaire de la migration 32 disait
-- meme que ce compte « ne peut pas diverger de ce que les eleves ont
-- reellement joue » — vrai pour un Sprint, faux ici.
--
-- LA REGLE : une valeur qui n'a pas de sens dans un contexte ne se
-- renvoie pas avec un commentaire d'avertissement. Elle se renvoie
-- NULL. Un ecran ne peut pas mal afficher ce qu'il ne recoit pas.
--
-- C'est deja ce que fait `duree_s`, null hors Contre-la-montre. Les deux
-- colonnes deviennent symetriques : chaque mode recoit le chiffre qui le
-- decrit, et null pour l'autre.
--
-- NUMEROTATION : 20260910100000, l'heure reelle d'ecriture.
-- =====================================================================

drop function if exists public.mes_defis(integer);

create or replace function public.mes_defis(p_limite integer default 20)
returns table (
  defi_id             uuid,
  code                text,
  type                text,
  classe              text,
  tables              smallint[],
  nb_questions        integer,   -- Sprint uniquement ; null en Contre-la-montre
  duree_s             integer,   -- la duree du defi (Contre-la-montre), null sinon
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
         -- Le nombre de questions n'a de sens QUE pour un Sprint.
         -- `creer_defi` fige 120 questions pour un Contre-la-montre
         -- (l. 53 de la migration 21) : c'est une RESERVE, pas un
         -- objectif — personne ne repond a 120 questions en deux
         -- minutes. Renvoyer 120 ici invitait un ecran a afficher
         -- « 120 questions » sur une partie de 30 secondes.
         -- On renvoie donc null hors Sprint : une valeur qui n'a pas de
         -- sens ne se renvoie pas, elle ne se commente pas.
         case when d.type = 'sprint'
              then jsonb_array_length(d.questions)::integer end,
         d.duree_s,
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
  'Les defis qui concernent l''utilisateur courant : ceux qu''il a crees, ET — pour un eleve — ceux auxquels il a participe (migration 31). DEUX COLONNES SYMETRIQUES, chacune null hors de son mode : `duree_s` decrit un Contre-la-montre, `nb_questions` un Sprint (migration 33). Un Contre-la-montre fige 120 questions en reserve, ce qui n''est pas un nombre de questions a afficher — d''ou le null. ATTENTION AU SENS DE `mon_score` : c''est le NOMBRE DE BONNES REPONSES, pas des points ; les points sont dans sessions_jeu.points et valent tout autre chose. Ne jamais l''afficher suivi de « pts ». `je_suis_createur` et `j_ai_joue` sont DEUX faits distincts, jamais un role unique. QUATRE POPULATIONS pour les compteurs : `rejoints` = ont saisi le code ; `participants` = ont TERMINE, toutes classes ; `participants_classe` et `attendus` comptent la meme population, les eleves de la classe visee.';
