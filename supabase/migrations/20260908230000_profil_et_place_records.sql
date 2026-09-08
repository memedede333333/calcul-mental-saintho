-- =====================================================================
-- MIGRATION 30 — le profil de l'eleve, et sa place au classement des
--                records
--
-- Deux ecrans de la maquette v10 demandent des chiffres que le serveur
-- ne sait pas produire. Rien de nouveau dans les regles : ce sont des
-- valeurs qui existent en base et qu'aucune fonction ne renvoyait.
--
-- 1. LE PROFIL ELEVE (maquette 29)
--    Elle affiche « 48 s » au record de Sprint, « 12 jours
--    d'entrainement », et « Montee des tables — debloquee le 3
--    septembre ». Or `mon_profil()` :
--      — ne renvoyait PAS le meilleur sprint (il n'existait que dans
--        `mon_profil_prof`, pour les enseignants) ;
--      — ne comptait les jours que sur SEPT jours glissants
--        (`jours_actifs_7j`) ou sur la semaine en cours ;
--      — n'a aucune date de deblocage de plafond.
--
--    La date n'est stockee nulle part et ne peut pas etre inventee. On
--    la DEDUIT : la premiere partie de Montee qui a produit le plafond
--    actuel. `null` veut dire « le plafond n'a jamais ete releve par une
--    Montee » — c'est le cas de tout eleve encore au plafond de depart —
--    et l'ecran n'ecrit alors aucune date.
--
-- 2. MA PLACE AU CLASSEMENT DES RECORDS (maquette 31)
--    « 12e — Lou A. (toi) — 1 min 02 — 3 secondes de moins et tu passes
--    11e ». Exactement le meme trou que pour la progression :
--    `classement_records()` finit par `limit p_limite`, donc un eleve
--    12e avec une limite de 10 n'est pas dans le resultat.
--    `ma_place_records()` reutilise le MEME corps de requete — memes
--    CTE, memes filtres, meme tri — pour que les deux ne puissent pas
--    annoncer deux rangs differents sur le meme ecran.
--
--    ATTENTION AU SENS DU TRI. Pour le Sprint, la meilleure valeur est
--    la PLUS PETITE : c'est un temps. Pour les quatre autres, la plus
--    grande. `ecart_au_dessus` est donc calcule ICI, toujours positif,
--    et se lit toujours « ce qu'il te manque » — que ce soit des
--    secondes a retrancher ou des points a gagner. Un ecran qui
--    soustrairait lui-meme afficherait un nombre negatif une fois sur
--    deux.
--
-- NUMEROTATION : 20260908230000, l'heure reelle d'ecriture.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LE PROFIL ELEVE
-- ---------------------------------------------------------------------
create or replace function public.mon_profil()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case when public.eleve_courant() is null then
    jsonb_build_object('ok', false, 'raison', 'pas_un_eleve',
      'message', 'Ce profil est reserve aux eleves.')
  else
  jsonb_build_object(
    'profil', (select to_jsonb(x) from (
        select id, prenom, nom, classe, avatar_emoji, email,
               plafond_tables,
               public.palier_de_plafond(plafond_tables) as palier,
               tables_autorisees,  -- OBSOLETE, ne rien afficher avec
               -- Migration 30 : « Montee des tables — debloquee le 3
               -- septembre ». Aucune date n'est stockee ; on la DEDUIT
               -- de la premiere partie de Montee qui a produit ce
               -- plafond. `null` veut dire « le plafond n'a jamais ete
               -- releve par une Montee » : l'ecran n'ecrit alors aucune
               -- date, il n'en invente pas une.
               (select min(s.cree_le) from public.sessions_jeu s
                 where s.eleve_id = public.eleve_courant()
                   and s.mode = 'climb'
                   and coalesce(s.plus_haute_table, 0) + 1 >= eleves.plafond_tables)
                 as plafond_atteint_le
          from public.eleves where id = public.eleve_courant()) x),
    'records', (select jsonb_build_object(
        'meilleure_serie',   coalesce(max(sans_faute_max), 0),
        'meilleur_chrono',   coalesce(max(score) filter (where mode = 'countdown'), 0),
        'plus_haute_table',  coalesce(max(plus_haute_table), 0),
        'nb_sessions',       count(*),
        -- Migration 30 : la maquette 29 affiche « 48 s » au record de
        -- Sprint et « 12 jours d'entrainement ». Ni l'un ni l'autre
        -- n'existait : `meilleur_sprint` n'etait renvoye que pour les
        -- enseignants, et `jours_actifs_7j` ne compte que la semaine.
        'meilleur_sprint',   coalesce(min(duree_s) filter (where mode = 'sprint'), 0),
        'jours_actifs',      (select count(distinct date_trunc('day', cree_le))
                                from public.sessions_jeu
                               where eleve_id = public.eleve_courant()),
        'points_total',      coalesce(sum(points), 0),
        'points_semaine',    coalesce(sum(points)
                               filter (where cree_le >= public.debut_periode('semaine')), 0),
        'jours_actifs_7j',   (select count(distinct date_trunc('day', cree_le))
                                from public.sessions_jeu
                               where eleve_id = public.eleve_courant()
                                 and cree_le > now() - interval '7 days'))
        from public.sessions_jeu where eleve_id = public.eleve_courant()),
    'progression', (select to_jsonb(p) from public.progression_detail(
        public.eleve_courant(), public.debut_periode('semaine')) p),
    'maitrise', (select coalesce(jsonb_object_agg(fait, niveau), '{}')
        from public.maitrise where eleve_id = public.eleve_courant()),
    'badges', (select coalesce(jsonb_agg(badge_id), '[]')
        from public.badges where eleve_id = public.eleve_courant()))
  end;
$$;


comment on function public.mon_profil() is
  'Le profil complet d''un eleve. `records` porte les valeurs de TOUTE sa scolarite : `meilleur_sprint` (secondes, 0 s''il n''a jamais fait de Sprint) et `jours_actifs` (jours distincts ou il a joue, depuis toujours) ont ete ajoutes en migration 30 — `jours_actifs_7j` reste la fenetre glissante de sept jours, c''est une AUTRE population, ne pas les confondre. `profil.plafond_atteint_le` est DEDUIT de la premiere partie de Montee ayant produit le plafond actuel : null veut dire que le plafond n''a jamais ete releve par une Montee, et l''ecran n''ecrit alors aucune date.';


-- ---------------------------------------------------------------------
-- 2. MA PLACE AU CLASSEMENT DES RECORDS
--
-- Meme requete que classement_records(), sans la limite. Une seule
-- ligne : la mienne. Zero ligne si je n'ai pas de record dans cette
-- categorie — l'ecran affiche alors son etat vide, il n'invente pas un
-- rang.
-- ---------------------------------------------------------------------
create or replace function public.ma_place_records(
  p_categorie text default 'serie',
  p_periode   text default 'tout',
  p_portee    text default 'classe',
  p_palier    text default null
)
returns table (
  rang             bigint,
  valeur           numeric,
  classes_total    bigint,    -- combien d'eleves figurent a ce classement
  rang_au_dessus   bigint,    -- null si je suis premier
  valeur_au_dessus numeric,
  ecart_au_dessus  numeric    -- TOUJOURS positif : « ce qu'il te manque »
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe, plafond_tables from public.eleves where id = public.eleve_courant()
  ),
  cible as (
    select coalesce(p_palier,
      case when (select plafond_tables from moi) <= 10 then 'decouverte'
           when (select plafond_tables from moi) <= 12 then 'confirme'
           else 'expert' end) as palier
  ),
  base as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           case p_categorie
             when 'serie'  then max(s.sans_faute_max)::numeric
             when 'chrono' then max(s.points) filter (where s.mode = 'countdown')::numeric
             when 'montee' then max(s.plus_haute_table)::numeric
             when 'points' then sum(s.points)::numeric
             when 'sprint' then min(s.duree_s + 3 * jsonb_array_length(s.erreurs))
                                 filter (where s.mode = 'sprint')
           end as valeur
      from public.eleves e
      join public.sessions_jeu s on s.eleve_id = e.id
     where e.actif
       and s.cree_le >= public.debut_periode(p_periode)
       -- « montee » ignore toujours le palier : c'est le classement qui
       -- montre jusqu'ou chacun est alle, tous niveaux confondus.
       and (p_categorie = 'montee'
            or (select palier from cible) = 'tous'
            or s.palier = (select palier from cible))
       and (p_portee = 'college'
            or (p_portee = 'niveau'
                and public.niveau_scolaire(e.classe)
                  = public.niveau_scolaire((select classe from moi)))
            or (p_portee = 'classe' and e.classe = (select classe from moi)))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  ),
  -- Le classement COMPLET, sans limite. C'est la seule difference avec
  -- classement_records(). Le tri est copie a l'identique : le sprint se
  -- classe sur le temps le plus COURT.
  complet as (
    select row_number() over (
             order by case when p_categorie = 'sprint' then valeur end asc nulls last,
                      case when p_categorie <> 'sprint' then valeur end desc nulls last
           ) as rang,
           id, valeur,
           id = public.eleve_courant() as est_moi
      from base
     where valeur is not null
  ),
  moi_ligne as (select * from complet where est_moi)
  select m.rang,
         round(m.valeur, 1),
         (select count(*) from complet),
         a.rang,
         round(a.valeur, 1),
         -- Toujours positif. Pour le sprint c'est un temps a retrancher,
         -- ailleurs des points a gagner : dans les deux cas, ce qu'il
         -- manque pour passer devant.
         round(abs(a.valeur - m.valeur), 1)
    from moi_ligne m
    left join complet a on a.rang = m.rang - 1;
$$;

grant execute on function public.ma_place_records(text, text, text, text) to authenticated;

comment on function public.ma_place_records(text, text, text, text) is
  'Ma place au classement des records, meme au-dela de la limite affichee par classement_records(). Meme corps de requete que celle-ci — memes CTE, memes filtres, meme tri — pour que les deux ne puissent pas annoncer deux rangs differents sur le meme ecran. `ecart_au_dessus` est TOUJOURS positif et se lit « ce qu''il te manque » : des secondes a retrancher pour le Sprint, des points ou des tables a gagner ailleurs. Il est calcule ici parce qu''un ecran qui soustrairait lui-meme afficherait un nombre negatif une fois sur deux. Zero ligne si je n''ai pas de record dans cette categorie.';
