-- =====================================================================
-- MIGRATION 32 — l'ecran « Mes defis » doit pouvoir dire la verite
--
-- Deux chiffres ecrits en dur dans `MesDefis.jsx`, faute de les avoir
-- au serveur :
--
--   l. 335 :  d.type === 'countdown' ? 'chrono' : '20 questions'
--
-- « chrono » remplace la vraie duree — on vient pourtant de rendre la
-- duree parametrable (30 s, 1 min, 1 min 30, 2 min), et l'ecran ne peut
-- pas la dire parce que `mes_defis` ne la renvoie pas.
-- « 20 questions » est ecrit en dur alors que `creer_defi` accepte
-- `p_nb_questions` : un defi de 15 questions afficherait 20. C'est le
-- meme defaut que celui corrige il y a deux jours dans
-- `JoinChallenge.jsx` — il a simplement reapparu ailleurs, faute d'avoir
-- la valeur a la source.
--
-- La lecon, et c'est la troisieme fois : quand un ecran ecrit un chiffre
-- en dur, ce n'est presque jamais de la paresse. C'est que la fonction
-- ne le lui donne pas. Le corriger dans l'ecran le fait reapparaitre
-- ailleurs ; le corriger a la source le supprime partout.
--
-- Le retour change de forme : il faut un drop. Cinquieme fois — une
-- signature n'est jamais modifiable en place.
--
-- NUMEROTATION : 20260910080000, l'heure reelle d'ecriture.
-- =====================================================================

drop function if exists public.mes_defis(integer);

create or replace function public.mes_defis(p_limite integer default 20)
returns table (
  defi_id             uuid,
  code                text,
  type                text,
  classe              text,
  tables              smallint[],
  nb_questions        integer,   -- lu sur la liste FIGEE des questions
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
         -- Il n'existe pas de colonne `nb_questions` sur `defis` : les
         -- questions sont figees dans un tableau JSON a la creation, et
         -- ce sont LES MEMES pour tous les participants. Le compte se lit
         -- donc dessus — c'est la seule source, et elle ne peut pas
         -- diverger de ce que les eleves ont reellement joue.
         jsonb_array_length(d.questions)::integer,
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
  'Les defis qui concernent l''utilisateur courant : ceux qu''il a crees, ET — pour un eleve — ceux auxquels il a participe (migration 31). `nb_questions` et `duree_s` sont renvoyes depuis la migration 32, pour que l''ecran cesse d''ecrire « 20 questions » et « chrono » en dur : `duree_s` est null hors Contre-la-montre. ATTENTION AU SENS DE `mon_score` : c''est le NOMBRE DE BONNES REPONSES du defi, pas des points — les points sont dans sessions_jeu.points et valent tout autre chose. Ne jamais l''afficher suivi de « pts ». `je_suis_createur` et `j_ai_joue` sont DEUX faits distincts, jamais un role unique. QUATRE POPULATIONS pour les compteurs : `rejoints` = ont saisi le code ; `participants` = ont TERMINE, toutes classes ; `participants_classe` et `attendus` comptent la meme population, les eleves de la classe visee.';
