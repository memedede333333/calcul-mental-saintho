-- =====================================================================
-- DIAGNOSTIC du 9 septembre 2026 — pourquoi le défi n'apparaît pas
-- dans les classements généraux
--
-- TOUT CE FICHIER EST EN LECTURE SEULE. Aucun insert, aucun update,
-- aucun delete. Il peut être exécuté sur `calcul-mental-dev` sans
-- aucun risque.
--
-- À exécuter bloc par bloc dans l'éditeur SQL de Supabase, et renvoyer
-- les résultats. Chaque bloc répond à une question précise ; l'ordre
-- compte, le bloc B dépend de l'identifiant trouvé au bloc A.
-- =====================================================================


-- ---------------------------------------------------------------------
-- A. LE DÉFI ET LES PARTIES
--
-- Aymeri a créé un défi à 30 secondes. La partie a bien duré 30 s, mais
-- deux écrans affichent « 2 min ». `creer_defi` fait
-- coalesce(p_duree_s, 120) : si duree_s vaut 30, le défaut n'a pas
-- joué et le problème est purement à l'affichage. S'il vaut 120, c'est
-- que le paramètre n'est jamais arrivé au serveur.
-- ---------------------------------------------------------------------
select code, type, duree_s, nb_questions, classe, cree_le, expire_le, statut
  from public.defis
 order by cree_le desc
 limit 5;

-- Les participations à ces défis, et l'identifiant des élèves.
select d.code, e.prenom, e.nom, e.id as eleve_id, e.classe, e.plafond_tables,
       p.score, p.temps_s, p.termine_le
  from public.defis d
  join public.defis_participants p on p.defi_id = d.id
  join public.eleves e on e.id = p.eleve_id
 where d.cree_le > now() - interval '1 day'
 order by d.cree_le desc, p.termine_le;

-- Les sessions écrites par ces parties. Si cette requête ne renvoie
-- rien alors que la précédente montre des participations, c'est que
-- `terminer_defi` a inséré la participation sans écrire la session —
-- ce qui ne devrait pas être possible, les deux étant dans la même
-- transaction.
select s.cree_le, e.prenom, s.mode, s.tables, s.nb_questions, s.score,
       s.score_premier_essai, s.points, s.palier,
       s.defi_id is not null as via_defi
  from public.sessions_jeu s
  join public.eleves e on e.id = s.eleve_id
 where s.cree_le > now() - interval '1 day'
 order by s.cree_le desc;


-- ---------------------------------------------------------------------
-- B. LE CLASSEMENT, VU PAR L'ÉLÈVE
--
-- Il faut le `user_id` — c'est lui qu'auth.uid() renvoie, pas
-- `eleves.id`. La première requête le trouve à partir du prénom ;
-- reporte-le ensuite à la place de <USER_ID_LOU>.
-- ---------------------------------------------------------------------
select prenom, nom, id as eleve_id, user_id, classe, plafond_tables,
       public.palier_de_plafond(plafond_tables) as palier_de_l_eleve
  from public.eleves
 where prenom in ('Lou', 'Agathe')
 order by prenom;

-- Puis, en remplaçant <USER_ID_LOU> par le `user_id` ci-dessus :
-- on se met à sa place et on demande le classement de QUATRE façons.
-- Celle qui la fait apparaître nous dit ce que l'écran aurait dû
-- demander.
select set_config('request.jwt.claim.sub', '<USER_ID_LOU>', false);

select 'palier=null, portee=classe'   as essai,
       (select count(*) from public.classement_progression('semaine','classe',null,50)) as lignes,
       (select count(*) from public.classement_progression('semaine','classe',null,50) where est_moi) as moi
union all
select 'palier=tous, portee=classe',
       (select count(*) from public.classement_progression('semaine','classe','tous',50)),
       (select count(*) from public.classement_progression('semaine','classe','tous',50) where est_moi)
union all
select 'palier=null, portee=college',
       (select count(*) from public.classement_progression('semaine','college',null,50)),
       (select count(*) from public.classement_progression('semaine','college',null,50) where est_moi)
union all
select 'palier=tous, portee=college',
       (select count(*) from public.classement_progression('semaine','college','tous',50)),
       (select count(*) from public.classement_progression('semaine','college','tous',50) where est_moi);

-- Et le détail de sa progression sur la semaine : si `total` vaut 0,
-- elle est exclue du classement par le filtre `total > 0`.
select * from public.progression_detail(
  (select id from public.eleves where user_id = '<USER_ID_LOU>'),
  public.debut_periode('semaine'));


-- ---------------------------------------------------------------------
-- C. LA PERFORMANCE RÉELLE, MAINTENANT QU'IL Y A 310 ÉLÈVES
--
-- J'ai mesuré 277 ms sur une base locale à 328 élèves, contre 2 ms pour
-- `classement_classes` et 5 ms pour `classement_records`. La cause :
-- `classement_progression` appelle `progression_detail()` une fois par
-- élève. Ces trois mesures disent si ça se confirme en conditions
-- réelles — et le `explain analyze` donne le temps sans la latence
-- réseau, donc le vrai coût serveur.
-- ---------------------------------------------------------------------
explain (analyze, buffers)
select * from public.classement_progression('semaine','college','tous',20);

explain (analyze, buffers)
select * from public.classement_records('serie','tout','college','tous',20);

explain (analyze, buffers)
select * from public.classement_classes('semaine');


-- ---------------------------------------------------------------------
-- D. SANTÉ DE L'IMPORT DES 310 ÉLÈVES
--
-- Personne n'a encore regardé la base après l'import. Ces quatre
-- chiffres se lisent en dix secondes et évitent une mauvaise surprise
-- un lundi matin.
-- ---------------------------------------------------------------------
select 'eleves actifs'                as quoi, count(*)::text as combien
  from public.eleves where actif
union all
select 'eleves desactives', count(*)::text
  from public.eleves where not actif
union all
-- Un élève sans user_id ne s'est jamais connecté : c'est normal avant
-- la rentrée, mais le nombre doit tomber à mesure qu'ils se connectent.
select 'jamais connectes', count(*)::text
  from public.eleves where actif and user_id is null
union all
-- Deux fiches pour la même adresse serait un défaut d'import.
select 'e-mails en double', coalesce((
    select count(*)::text from (
      select email from public.eleves group by email having count(*) > 1
    ) x), '0')
union all
-- Un plafond hors des bornes attendues.
select 'plafond hors 10-20', count(*)::text
  from public.eleves where actif and (plafond_tables < 10 or plafond_tables > 20);

-- La répartition par classe : elle doit ressembler à la vraie
-- répartition du collège. Une classe à 1 élève ou à 60 est un signe
-- que le fichier d'import avait un libellé de classe incohérent.
select classe, count(*) as eleves
  from public.eleves where actif
 group by classe
 order by classe;


-- ---------------------------------------------------------------------
-- E. LE COMPTE DE LOU, DE BOUT EN BOUT
--
-- Aymeri demande si son compte serait bloqué. Question légitime : son
-- compte est un compte de bêta, créé AVANT l'import des 310 élèves.
--
-- HYPOTHÈSE À VÉRIFIER EN PRIORITÉ. `importer_eleves` met à jour les
-- fiches dont l'e-mail est déjà connu. Si Lou figurait dans le fichier
-- de rentrée avec une classe différente, sa classe a changé au moment
-- de l'import. Or :
--   — le défi visait la classe « 31 » ;
--   — `classement_progression` en portée « classe » filtre sur
--     `e.classe = (select classe from moi)` ;
--   — les compteurs de classe du défi aussi.
-- Elle jouerait donc normalement, son résultat serait bien écrit, et
-- elle n'apparaîtrait dans aucun classement de classe.
--
-- SECONDE HYPOTHÈSE, qui expliquerait les « Connexion perdue » du
-- premier test : si son `user_id` est null ou pointe sur un autre
-- compte, `eleve_courant()` renvoie null et TOUTES les fonctions la
-- refusent — ce qui s'affiche comme une panne réseau, puisque l'écran
-- ne distingue pas les deux.
-- ---------------------------------------------------------------------

-- 1. Sa fiche complète.
select id, email, prenom, nom, classe, plafond_tables, avatar_emoji,
       actif, user_id,
       user_id is null as jamais_rattachee,
       derniere_connexion, cree_le
  from public.eleves
 where prenom in ('Lou', 'Agathe')
 order by prenom;

-- 2. Son compte d'authentification existe-t-il, et correspond-il ?
--    Si `auth_email` est vide, le rattachement pointe dans le vide.
select e.prenom, e.email as email_fiche, u.email as email_auth, e.user_id
  from public.eleves e
  left join auth.users u on u.id = e.user_id
 where e.prenom in ('Lou', 'Agathe')
 order by e.prenom;

-- 3. Un autre élève porte-t-il le même user_id ? Ce serait le pire cas :
--    deux fiches pour un compte, et le serveur en choisit une.
select user_id, count(*) as fiches, string_agg(prenom || ' (' || classe || ')', ', ')
  from public.eleves
 where user_id is not null
 group by user_id having count(*) > 1;

-- 4. Le journal d'audit la concernant : l'import a-t-il touché sa
--    fiche, et quand ? C'est ici qu'on verra un changement de classe.
select cree_le, action, cible, detail
  from public.journal_admin
 where detail::text ilike '%Lou%' or cible::text ilike '%Lou%'
 order by cree_le desc
 limit 20;

-- 5. Toutes ses parties, depuis toujours. Si la liste est vide alors
--    qu'elle a joué trois fois, l'écriture ne passe pas. Si elle est
--    pleine, c'est bien un problème de lecture.
select s.cree_le, s.mode, s.tables, s.nb_questions, s.score, s.points,
       s.palier, s.defi_id is not null as via_defi
  from public.sessions_jeu s
  join public.eleves e on e.id = s.eleve_id
 where e.prenom = 'Lou'
 order by s.cree_le desc
 limit 20;

-- 6. Ses participations aux défis, et la classe visée par chaque défi.
--    Si `classe_du_defi` et `classe_de_l_eleve` diffèrent, on tient
--    l'explication.
select d.code, d.classe as classe_du_defi, e.classe as classe_de_l_eleve,
       d.classe = e.classe as meme_classe,
       p.score, p.temps_s, p.termine_le
  from public.defis_participants p
  join public.defis d on d.id = p.defi_id
  join public.eleves e on e.id = p.eleve_id
 where e.prenom = 'Lou'
 order by p.termine_le desc;

-- 7. Sa maîtrise : si elle est vide alors qu'elle a joué, c'est que
--    `p_faits` n'arrive pas — et la grille ne bougerait jamais.
select count(*) as cases_en_base,
       count(*) filter (where niveau = 3) as vertes,
       max(derniere_vue) as derniere_ecriture
  from public.maitrise m
  join public.eleves e on e.id = m.eleve_id
 where e.prenom = 'Lou';
