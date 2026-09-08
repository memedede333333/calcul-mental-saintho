-- =====================================================================
-- MIGRATION 28 — nommer les populations des classements, et rendre sa
--                place a l'eleve qui n'est pas dans les vingt premiers
--
-- Trois corrections, toutes de la meme famille : un ecran demande un
-- chiffre que le serveur ne sait pas donner, ou le donne sous un nom qui
-- ment.
--
-- 1. « TA PLACE » QUAND ON EST 18e SUR 350
--    La maquette 22 garde la ligne de l'eleve visible en bas de l'ecran,
--    avec son rang, ses points, et l'ecart qui le separe de la place
--    au-dessus : « 18e · 228 pts · 42 points de la 17e place ».
--    Or `classement_progression()` finit par `limit p_limite`. Un eleve
--    classe 18e avec une limite de 10 n'est tout simplement PAS dans le
--    resultat. L'ecran ne peut ni afficher sa place, ni calculer l'ecart.
--    On ajoute `ma_place_progression()`, qui reutilise EXACTEMENT le
--    meme corps de requete — memes CTE, meme tri, memes filtres. Deux
--    calculs separes du meme classement finiraient par diverger d'une
--    place, et l'eleve verrait deux rangs differents sur le meme ecran.
--
-- 2. « ACTIF » VEUT DIRE DEUX CHOSES
--    `classement_classes()` renvoie `eleves_actifs` et `eleves_total`.
--    Mais dans `eleves.actif`, « actif » veut dire « pas desactive »,
--    alors qu'ici il veut dire « a joue sur la periode ». Le meme mot,
--    deux populations. C'est la source des cinq bugs de population de ce
--    projet, et il n'y a aucune raison de la laisser en place.
--    On renomme : `ont_joue` et `inscrits`.
--
--    Et surtout : `points_moyens` devient `points_par_inscrit`. Le
--    calcul ne change pas d'un iota — c'est bien la somme des points
--    divisee par l'effectif inscrit, comme decide dans ETAT.md §3, pour
--    qu'une classe ou trois eleves jouent beaucoup ne passe pas devant
--    une classe ou tout le monde s'y met. Mais le nom le dit maintenant.
--    La maquette 23 ecrit « pts / eleve actif » : c'est la MAQUETTE qui
--    a tort, et le libelle de l'ecran doit suivre le serveur.
--
-- 3. L'EN-TETE DE « MA CLASSE »
--    La maquette 24 ecrit « 24 eleves actifs sur 27 · plafond commun :
--    table 10 ». Deux populations et un point de repere, aucun des trois
--    n'existe en un seul appel. `maitrise_classe()` renvoie une ligne
--    par table, pas un en-tete de classe. On ajoute `entete_classe()`.
--
-- NUMEROTATION : 20260908160000, l'heure reelle d'ecriture.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. MA PLACE — meme requete, sans la limite
--
-- Renvoie UNE ligne : la mienne, plus de quoi ecrire l'ecart. Si je n'ai
-- pas joue sur la periode, la fonction ne renvoie rien du tout — l'ecran
-- affiche alors son etat vide, il n'invente pas un rang.
--
-- `ecart_au_dessus` est calcule ICI. L'ecran ne soustrait rien : deux
-- soustractions du meme ecart finissent toujours par donner deux
-- nombres.
-- ---------------------------------------------------------------------
create or replace function public.ma_place_progression(
  p_periode text default 'semaine',
  p_portee  text default 'classe',
  p_palier  text default null
)
returns table (
  rang             bigint,
  points           integer,
  classes_total    bigint,    -- combien d'eleves figurent au classement
  rang_au_dessus   bigint,    -- null si je suis premier
  points_au_dessus integer,
  ecart_au_dessus  integer    -- null si je suis premier
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe, plafond_tables from public.eleves where id = public.eleve_courant()
  ),
  cible as (
    select coalesce(p_palier, public.palier_de_plafond(
             (select plafond_tables from moi))) as palier,
           public.debut_periode(p_periode)      as depuis
  ),
  concernes as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
      from public.eleves e
     where e.actif
       and (p_portee = 'college'
            or (p_portee = 'niveau'
                and public.niveau_scolaire(e.classe)
                  = public.niveau_scolaire((select classe from moi)))
            or (p_portee = 'classe' and e.classe = (select classe from moi)))
  ),
  -- Le filtre par palier porte sur les PARTIES jouees a ce palier :
  -- un eleve n'apparait au palier Confirme que s'il y a joue.
  joue as (
    select c.id,
           coalesce((select sum(s.points) from public.sessions_jeu s
                      where s.eleve_id = c.id
                        and s.cree_le >= (select depuis from cible)
                        and ((select palier from cible) = 'tous'
                             or s.palier = (select palier from cible))), 0) as pts_palier
      from concernes c
  ),
  score as (
    select c.id, c.prenom, c.nom, c.classe, c.avatar_emoji,
           j.pts_palier,
           (select total from public.progression_detail(
              c.id, (select depuis from cible))) as total
      from concernes c join joue j on j.id = c.id
  ),
  -- Le classement COMPLET, sans limite : c'est la difference avec
  -- classement_progression(). Tout le reste est identique.
  classe_complet as (
    select row_number() over (order by total desc) as rang,
           id, total,
           id = public.eleve_courant() as est_moi
      from score
     where pts_palier > 0
       and total > 0
  ),
  moi_ligne as (select * from classe_complet where est_moi)
  select m.rang,
         m.total::integer,
         (select count(*) from classe_complet),
         a.rang,
         a.total::integer,
         (a.total - m.total)::integer
    from moi_ligne m
    left join classe_complet a on a.rang = m.rang - 1;
$$;

grant execute on function public.ma_place_progression(text, text, text) to authenticated;

comment on function public.ma_place_progression(text, text, text) is
  'Ma place au classement de progression, meme quand je suis au-dela de la limite affichee par classement_progression(). Meme corps de requete que celle-ci — memes CTE, meme tri, memes filtres — pour que les deux ne puissent pas annoncer deux rangs differents sur le meme ecran. Renvoie ZERO ligne si je n''ai pas joue sur la periode : l''ecran affiche son etat vide, il n''invente pas un rang. `ecart_au_dessus` est calcule ici, jamais soustrait par l''ecran.';


-- ---------------------------------------------------------------------
-- 2. CLASSEMENT DES CLASSES — les memes chiffres, nommes
--
-- Aucun calcul ne change. Seuls les noms changent, et le front doit
-- suivre dans le meme commit.
--
-- ON SUPPRIME D'ABORD. PostgreSQL refuse de renommer une colonne de
-- retour par `create or replace` : « cannot change return type of
-- existing function ». Il faut passer par un drop, comme pour les
-- migrations 26 et 27 — c'est la troisieme fois, et la raison est
-- toujours la meme : une signature n'est pas modifiable en place.
-- ---------------------------------------------------------------------
drop function if exists public.classement_classes(text, text);

create or replace function public.classement_classes(
  p_periode text default 'semaine',
  p_niveau  text default null      -- '6' | '5' | '4' | '3' ; NULL = tout le collège
)
returns table (
  rang            bigint,
  classe          text,
  ont_joue        integer,   -- ont joue au moins une fois sur la periode
  inscrits        integer,   -- eleves non desactives de la classe
  points_par_inscrit integer, -- points de la classe / inscrits (PAS / ont_joue)
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
         actifs::integer                                          as ont_joue,
         total::integer                                           as inscrits,
         (pts / greatest(total, 1))::integer                       as points_par_inscrit,
         classe = (select classe from moi)                        as est_ma_classe
    from par_classe
   where total > 0
   order by rang;
$$;

grant execute on function public.classement_classes(text, text) to authenticated;

comment on function public.classement_classes(text, text) is
  'Classement des classes. TROIS POPULATIONS, TROIS NOMS : `ont_joue` = ont joue au moins une fois sur la periode ; `inscrits` = eleves non desactives de la classe ; `points_par_inscrit` = points de la classe divises par `inscrits`, JAMAIS par `ont_joue`. Ce choix est celui d''ETAT.md §3 : une classe ou trois eleves jouent beaucoup ne doit pas passer devant une classe ou tout le monde s''y met. Le mot « actif » est banni de cette fonction et de tout ecran qui l''affiche : dans eleves.actif il veut dire « pas desactive », ce qui est une autre population.';


-- ---------------------------------------------------------------------
-- 3. L'EN-TETE DE « MA CLASSE »
--
-- Un seul appel pour la ligne du haut de la maquette 24. Les deux
-- populations sont nommees, et le plafond commun est le point de repere
-- sans lequel un chiffre de plafond ne se lit pas (ETAT.md §3).
--
-- `plafond_tables` est un DROIT gagne par la Montee des tables, pas une
-- trace de travail : ne jamais afficher ces nombres avec le mot
-- « travaille ».
-- ---------------------------------------------------------------------
create or replace function public.entete_classe(
  p_classe  text,
  p_periode text default 'semaine'
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'classe',   p_classe,
    -- Les eleves non desactives de la classe.
    'inscrits', count(*),
    -- Ceux d'entre eux qui ont joue au moins une fois sur la periode.
    -- Sous-ensemble strict des inscrits : les deux se lisent ensemble,
    -- jamais l'un sans l'autre.
    'ont_joue', count(*) filter (where exists (
                  select 1 from public.sessions_jeu s
                   where s.eleve_id = e.id
                     and s.cree_le >= public.debut_periode(p_periode))),
    'plafond_commun', min(e.plafond_tables),
    'plafond_max',    max(e.plafond_tables))
    from public.eleves e
   where e.classe = p_classe
     and e.actif
     and public.prof_voit_classe(p_classe);
$$;

grant execute on function public.entete_classe(text, text) to authenticated;

comment on function public.entete_classe(text, text) is
  'L''en-tete de l''ecran « Ma classe » (maquette 24) en un appel. DEUX POPULATIONS NOMMEES : `inscrits` = eleves non desactives de la classe ; `ont_joue` = ceux d''entre eux qui ont joue au moins une fois sur la periode, sous-ensemble strict des inscrits. Ne jamais afficher l''un sans l''autre, et ne jamais ecrire le mot « actif », qui veut dire autre chose dans eleves.actif. `plafond_commun` est le plafond le plus bas de la classe : c''est le point de repere sans lequel un chiffre de plafond ne se lit pas. plafond_tables est un DROIT gagne par la Montee, pas une trace de travail.';


-- ---------------------------------------------------------------------
-- 4. `liste_classes` — le meme mot, une TROISIEME population
--
-- Trouve en ecrivant les tests de cette migration. `liste_classes()`
-- renvoyait `eleves_actifs`, qui compte ici les eleves NON DESACTIVES —
-- donc `inscrits`, et pas du tout ce que `classement_classes` appelait
-- `eleves_actifs`. Le selecteur de classes de la maquette 24 et l'en-tete
-- de la meme maquette auraient affiche deux nombres nommes pareil et
-- comptant deux choses differentes, sur le MEME ecran.
--
-- Aucun calcul ne change. Le nom, si.
-- ---------------------------------------------------------------------
drop function if exists public.liste_classes();

create or replace function public.liste_classes()
returns table (
  classe        text,
  niveau        text,
  inscrits      integer,   -- eleves non desactives (PAS « ont joue »)
  est_favorite  boolean
)
language sql security definer set search_path = public
as $$
  select e.classe,
         public.niveau_scolaire(e.classe),
         count(*)::integer,
         e.classe = any(coalesce(
           (select classes from public.profs where user_id = auth.uid()), '{}'))
    from public.eleves e
   where e.actif and public.est_prof()
   group by e.classe
   order by e.classe;
$$;

grant execute on function public.liste_classes() to authenticated;

comment on function public.liste_classes() is
  'Les classes du college, pour le selecteur des ecrans enseignants. `inscrits` = eleves NON DESACTIVES de la classe — jamais « ont joue », qui est une autre population et se demande a entete_classe(). Le mot « actif » est banni de cette fonction : il voulait dire « pas desactive » ici et « a joue » dans classement_classes, sur le meme ecran.';
