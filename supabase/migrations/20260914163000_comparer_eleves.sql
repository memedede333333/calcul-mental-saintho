-- =====================================================================
-- Calcul Mental Saintho
-- Migration 47 : comparer les élèves entre eux (lot B)
-- =====================================================================
-- UNE fonction, UNE ligne par élève, toutes les colonnes triables. Le
-- professeur clique sur un en-tête, l'écran trie — il ne calcule rien.
--
-- LE DÉNOMINATEUR EST LE MÊME POUR TOUT LE MONDE, ET C'EST TOUT LE SUJET
-- Un « % de vert » calculé sur ce que chaque élève a rencontré met en
-- tête celui qui a ouvert cinq multiplications et les a réussies. Un
-- « % de vert » calculé sur le plafond de chacun compare une grille de
-- 55 faits à une grille de 120. Les deux classent du bruit.
-- La demande d'Aymeri réglait déjà la question : « sur les tables 1 à 10
-- ou sur une table au choix ». La PLAGE est donc le dénominateur, elle
-- est choisie par le professeur, et elle est identique pour tous les
-- élèves du tableau. `faits_plage` la renvoie pour que l'écran puisse
-- l'écrire : « 34 vertes sur 55 ».
--
-- « LA TABLE DE 7 » N'EST PAS « LE FAIT 7×7 »
-- Trouve en executant, pas en relisant : demander la table de 7 avec
-- une plage 7..7 ne retenait qu'UNE multiplication, 7×7, et tout le
-- monde affichait 100 % ou 0 %. Un professeur qui dit « la table de 7 »
-- entend 7×1 a 7×10. Il y a donc DEUX notions, et deux parametres :
--   · la PLAGE `p_table_min`..`p_table_max` — les deux operandes dedans ;
--   · la TABLE `p_table`, optionnelle — un des deux operandes vaut N,
--     l'autre reste dans la plage.
-- Tables 1 a 10 : 55 multiplications. Table de 7 croisee avec 1 a 10 :
-- 10. La regle vit dans `fait_dans_plage()` et le compte dans
-- `nb_faits_plage()` : une seule definition, trois usages.
--
-- ⚠️ `faits_plage` COMPTE LES MULTIPLICATIONS DISTINCTES, PAS LES CASES
-- Sur les tables 1 à 10 : 55, et non 100. `maitrise` est indexée par
-- `min_max` — 3×7 et 7×3 sont la même entrée. C'est volontairement
-- DIFFÉRENT du compte de la fiche élève, qui annonce les cases de la
-- grille (plafond × plafond) parce qu'un élève doit retrouver le nombre
-- qu'il voit quand il l'ouvre. Ici le lecteur est un professeur qui
-- compare : avec 100 au dénominateur, personne ne dépasserait 55 %.
-- Deux lecteurs, deux dénominateurs, chacun juste pour le sien — écrit
-- ici pour que personne ne les « aligne » un jour.
--
-- PAS DE SEUIL, PAS DE SECTION À PART (tranché par Aymeri le 14/09)
-- Un élève sans aucune mesure n'est pas écarté du tableau : sa vitesse
-- vaut `null`, l'écran affiche `—`, et il se range en fin de tri. On ne
-- cache personne. `nb_temps` part avec la moyenne pour que « 1,9 s » sur
-- trois réponses ne se lise pas comme « 1,9 s » sur quarante.
--
-- CE QUE LA PÉRIODE COUVRE, ET CE QU'ELLE NE COUVRE PAS
-- `p_jours` s'applique au VOLUME (parties, jours actifs, temps passé) et
-- au PROGRÈS. Il ne s'applique ni à la vitesse ni à la maîtrise, qui
-- sont des états courants et cumulés : `maitrise` garde un total, pas un
-- historique. `portee_periode` le dit dans la réponse, pour que l'écran
-- écrive « Vitesse (depuis le début) » et « Parties (30 j) » au lieu de
-- laisser croire que le sélecteur agit sur tout.
--
-- LE PROGRÈS SE MESURE SUR LA CADENCE, PAS SUR LE CALCUL MENTAL
-- Le temps de calcul mental n'a pas d'historique — c'est le prix assumé
-- de la migration 46, qui garde une moyenne courante au lieu de deux
-- millions de lignes par an. Les secondes par question, elles, existent
-- pour toutes les parties passées. Le progrès est donc calculé sur
-- elles, et la colonne porte leur nom. Les deux mesures ne se
-- substituent jamais l'une à l'autre.
-- =====================================================================

-- ---------------------------------------------------------------------
-- LA RÈGLE D'APPARTENANCE, ÉCRITE UNE FOIS
-- ---------------------------------------------------------------------
-- Les cles de `maitrise` sont `min_max` : « 3_7 », jamais « 7_3 »
-- (verifie en base : zero cle inversee). L'appartenance se lit donc sur
-- les deux operandes, et la fonction est `immutable` pour que le
-- planificateur puisse s'en servir librement.
create or replace function public.fait_dans_plage(
  p_fait text, p_table_min int, p_table_max int, p_table int default null
)
returns boolean
language sql
immutable
as $$
  select case
    when p_table is null then
      split_part(p_fait, '_', 1)::int >= p_table_min
      and split_part(p_fait, '_', 2)::int <= p_table_max
    else
      (split_part(p_fait, '_', 1)::int = p_table
        and split_part(p_fait, '_', 2)::int between p_table_min and p_table_max)
      or (split_part(p_fait, '_', 2)::int = p_table
        and split_part(p_fait, '_', 1)::int between p_table_min and p_table_max)
  end;
$$;

comment on function public.fait_dans_plage(text, int, int, int) is
  'Une multiplication appartient-elle a la selection ? Sans `p_table` : les DEUX operandes dans la plage (tables 1 a 10 -> 55 faits). Avec `p_table` : un des deux operandes vaut N, l''autre reste dans la plage (table de 7 croisee avec 1 a 10 -> 10 faits). Une seule definition, pour que le denominateur et le filtre ne divergent jamais.';

create or replace function public.nb_faits_plage(
  p_table_min int, p_table_max int, p_table int default null
)
returns integer
language sql
immutable
as $$
  select case
    when p_table is null
      then ((p_table_max - p_table_min + 1) * (p_table_max - p_table_min + 2)) / 2
    else p_table_max - p_table_min + 1
  end;
$$;

comment on function public.nb_faits_plage(int, int, int) is
  'Le DENOMINATEUR commun du tableau de comparaison : combien de multiplications distinctes la selection contient. Doit toujours s''accorder avec `fait_dans_plage()` — c''est pour ca que les deux vivent cote a cote.';


create or replace function public.comparer_eleves(
  p_classe    text     default null,
  p_table_min smallint default 1,
  p_table_max smallint default 10,
  p_table     smallint default null,
  p_jours     int      default 30
)
returns table (
  eleve_id            uuid,
  prenom              text,
  nom                 text,
  classe              text,
  -- vitesse de calcul mental, sur la plage choisie (cumul, pas periode)
  temps_moyen_ms      integer,
  nb_temps            integer,
  -- maitrise, meme denominateur pour tous
  faits_plage         integer,
  faits_verts         integer,
  taux_vert           numeric,
  faits_a_revoir      integer,
  table_plus_fragile  smallint,
  -- volume et regularite, sur la periode
  nb_parties          integer,
  jours_actifs        integer,
  temps_partie_s      integer,
  -- progres : variation de la cadence par rapport a la periode d'avant
  progres_s_question  numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_depuis  timestamptz;
  v_avant   timestamptz;
  v_n       int;
  v_plage   int;
begin
  if not public.est_prof() then
    raise exception 'Reserve aux enseignants' using errcode = '42501';
  end if;

  p_table_min := greatest(coalesce(p_table_min, 1), 1);
  p_table_max := least(greatest(coalesce(p_table_max, 10), p_table_min), 20);
  p_jours     := least(greatest(coalesce(p_jours, 30), 1), 365);

  v_depuis := now() - make_interval(days => p_jours);
  v_avant  := now() - make_interval(days => p_jours * 2);

  if p_table is not null then
    p_table := least(greatest(p_table, 1), 20);
  end if;
  v_plage := public.nb_faits_plage(p_table_min, p_table_max, p_table);

  return query
    select e.id, e.prenom, e.nom, e.classe,
           m.temps_moyen_ms,
           coalesce(m.nb_temps, 0)::integer,
           v_plage,
           coalesce(m.verts, 0)::integer,
           round(coalesce(m.verts, 0)::numeric / v_plage, 3),
           coalesce(m.a_revoir, 0)::integer,
           fr.table_fragile,
           coalesce(s.n, 0)::integer,
           coalesce(s.jours, 0)::integer,
           coalesce(s.duree, 0)::integer,
           case when s.cadence is null or a.cadence is null then null
                else round(s.cadence - a.cadence, 2) end
      from public.eleves e

      -- Maitrise et vitesse, sur les faits de la plage. Cumul : ni
      -- `v_depuis` ni `p_jours` n'interviennent ici.
      left join lateral (
        select sum(mm.somme_temps_ms)                             as somme,
               sum(mm.nb_temps)                                   as nb_temps,
               case when coalesce(sum(mm.nb_temps), 0) = 0 then null
                    else (sum(mm.somme_temps_ms) / sum(mm.nb_temps))::integer end
                                                                  as temps_moyen_ms,
               count(*) filter (where mm.niveau = 3)              as verts,
               count(*) filter (where mm.niveau in (1, 2))        as a_revoir
          from public.maitrise mm
         where mm.eleve_id = e.id
           and public.fait_dans_plage(mm.fait, p_table_min, p_table_max, p_table)
      ) m on true

      -- La table la plus fragile : chaque fait fragile compte pour SES
      -- DEUX operandes — 3x8 rate, c'est la table de 3 et celle de 8 qui
      -- vacillent. Sans ca, « 3_8 » serait attribue a la seule table 3 et
      -- la table de 8 passerait sous le radar.
      left join lateral (
        select o.t::smallint as table_fragile
          from public.maitrise mm
          cross join lateral (values (split_part(mm.fait, '_', 1)::int),
                                     (split_part(mm.fait, '_', 2)::int)) o(t)
         where mm.eleve_id = e.id
           and mm.niveau in (1, 2)
           and public.fait_dans_plage(mm.fait, p_table_min, p_table_max, p_table)
           and o.t between p_table_min and p_table_max
           -- Quand UNE table est choisie, « la table la plus fragile »
           -- ne dirait rien : ce serait toujours celle-la. On la tait.
           and p_table is null
         group by o.t
         order by count(*) desc, o.t
         limit 1
      ) fr on true

      -- Volume et regularite sur la periode, plus la cadence.
      left join lateral (
        select count(*)                                            as n,
               sum(sj.duree_s)                                      as duree,
               count(distinct (sj.cree_le at time zone 'Europe/Paris')::date) as jours,
               case when coalesce(sum(sj.nb_questions), 0) = 0 then null
                    else sum(sj.duree_s) / sum(sj.nb_questions) end as cadence
          from public.sessions_jeu sj
         where sj.eleve_id = e.id and sj.cree_le >= v_depuis
      ) s on true

      -- La MEME mesure sur la periode precedente de meme longueur.
      left join lateral (
        select case when coalesce(sum(sj.nb_questions), 0) = 0 then null
                    else sum(sj.duree_s) / sum(sj.nb_questions) end as cadence
          from public.sessions_jeu sj
         where sj.eleve_id = e.id
           and sj.cree_le >= v_avant and sj.cree_le < v_depuis
      ) a on true

     where e.actif
       and (p_classe is null or e.classe = p_classe)
     order by e.nom, e.prenom;
end;
$$;

comment on function public.comparer_eleves(text, smallint, smallint, smallint, int) is
  'Une ligne par eleve ACTIF de la portee, toutes colonnes triables par l''ecran. TOUS les eleves y figurent, y compris ceux qui n''ont rien joue : leur vitesse vaut null, l''ecran affiche un tiret et les range en fin de tri — on ne cache personne. `faits_plage` est le nombre de multiplications DISTINCTES de la plage choisie (55 pour les tables 1 a 10, pas 100 : 3x7 et 7x3 sont la meme entree) et sert de denominateur commun a tous les eleves du tableau. `nb_temps` accompagne `temps_moyen_ms` pour qu''une moyenne sur 3 reponses ne se lise pas comme une moyenne sur 40. La periode `p_jours` s''applique au volume et au progres, JAMAIS a la vitesse ni a la maitrise, qui sont des etats cumules. `progres_s_question` est la variation des SECONDES PAR QUESTION entre la periode et la precedente — negatif = il accelere ; le temps de calcul mental n''a pas d''historique et ne peut pas servir a ca. Reserve aux enseignants.';

grant execute on function public.comparer_eleves(text, smallint, smallint, smallint, int) to authenticated;


-- ---------------------------------------------------------------------
-- CE QUE LA PORTÉE DE LA PÉRIODE COUVRE — pour que l'écran l'écrive
-- ---------------------------------------------------------------------
create or replace function public.comparer_eleves_entete(
  p_classe    text     default null,
  p_table_min smallint default 1,
  p_table_max smallint default 10,
  p_table     smallint default null,
  p_jours     int      default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_n int; v_plage int;
begin
  if not public.est_prof() then
    raise exception 'Reserve aux enseignants' using errcode = '42501';
  end if;
  p_table_min := greatest(coalesce(p_table_min, 1), 1);
  p_table_max := least(greatest(coalesce(p_table_max, 10), p_table_min), 20);
  p_jours     := least(greatest(coalesce(p_jours, 30), 1), 365);
  if p_table is not null then
    p_table := least(greatest(p_table, 1), 20);
  end if;
  v_plage := public.nb_faits_plage(p_table_min, p_table_max, p_table);

  return jsonb_build_object(
    'table_min',   p_table_min,
    'table_max',   p_table_max,
    'table_choisie', p_table,
    'faits_plage', v_plage,
    'jours',       p_jours,
    'inscrits',    (select count(*) from public.eleves
                     where actif and (p_classe is null or classe = p_classe)),
    'ont_joue',    (select count(*) from public.eleves e
                     where e.actif and (p_classe is null or e.classe = p_classe)
                       and exists (select 1 from public.sessions_jeu sj
                                    where sj.eleve_id = e.id
                                      and sj.cree_le >= now() - make_interval(days => p_jours))),
    'seuil_rapide_ms', public.seuil_reponse_rapide(),
    -- Ce que le selecteur de periode agit, et ce qu'il n'agit pas.
    -- L'ecran doit pouvoir ecrire « Vitesse (depuis le debut) » a cote
    -- de « Parties (30 j) », sinon le professeur croira que tout bouge.
    'portee_periode', jsonb_build_object(
      'sur_la_periode', jsonb_build_array('nb_parties', 'jours_actifs',
                                          'temps_partie_s', 'progres_s_question'),
      'depuis_le_debut', jsonb_build_array('temps_moyen_ms', 'nb_temps',
                                           'faits_verts', 'taux_vert',
                                           'faits_a_revoir', 'table_plus_fragile'))
  );
end;
$$;

comment on function public.comparer_eleves_entete(text, smallint, smallint, smallint, int) is
  'L''en-tete du tableau de comparaison : la plage choisie et son nombre de multiplications distinctes, les deux populations (`inscrits` et `ont_joue`), le seuil de rapidite, et `portee_periode` — quelles colonnes le selecteur de periode fait bouger et lesquelles non. Sans ce dernier, un professeur croirait que changer la periode change la vitesse affichee. Reserve aux enseignants.';

grant execute on function public.comparer_eleves_entete(text, smallint, smallint, smallint, int) to authenticated;
