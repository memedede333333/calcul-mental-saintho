-- =====================================================================
-- Scénario de vérification de bout en bout
-- Lancé par ./supabase/tests/run.sh
--
-- Couvre : profil, enregistrement de partie, attribution des badges,
-- défi à deux joueurs avec questions identiques, classements par
-- période et par portée, et cinq tentatives de contournement qui
-- doivent TOUTES échouer (score gonflé, double participation,
-- changement de classe, auto-attribution de badge, lecture des
-- données d'un autre élève).
--
-- Toute ligne contenant « ECHEC » signale une régression de sécurité.
-- =====================================================================
\set ALICE '11111111-1111-1111-1111-111111111111'
\set BOB   '22222222-2222-2222-2222-222222222222'
\set PROF  '33333333-3333-3333-3333-333333333333'
\set PROF2 '44444444-4444-4444-4444-444444444444'

\echo '=== 1. Alice consulte son profil ==='
set role authenticated;
select set_config('request.jwt.claim.sub', :'ALICE', false);
select jsonb_pretty(jsonb_build_object(
  'prenom',  mon_profil()->'profil'->>'prenom',
  'records', mon_profil()->'records',
  'nb_faits_maitrise', (select count(*) from jsonb_object_keys(mon_profil()->'maitrise'))
));

\echo '=== 2. Alice enregistre une partie (série de 30) ==='
select enregistrer_session(
  p_mode => 'flawless', p_tables => '{7,8,9}'::smallint[],
  p_nb_questions => 30, p_score => 30, p_duree_s => 62.5,
  p_serie_max => 30, p_sans_faute_max => 30,
  p_maitrise => '{"7_8":3,"8_9":3,"7_9":2}'::jsonb
) as resultat;

\echo '=== 3. Tentative de tricherie : score > nb de questions ==='
do $$ begin
  perform enregistrer_session(p_mode=>'sprint', p_tables=>'{2}'::smallint[],
                              p_nb_questions=>10, p_score=>999);
  raise notice 'ECHEC : la triche est passée !';
exception when others then
  raise notice 'OK : refusé (%)', sqlerrm;
end $$;

\echo '=== 4. Alice crée un défi Sprint ==='
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'ALICE', false);
select creer_defi('sprint', '{6,7,8}'::smallint[], 20) as defi \gset alice_
\echo '=== 5. Bob rejoint avec le code ==='
select set_config('request.jwt.claim.sub', :'BOB', false);
select (rejoindre_defi((:'alice_defi'::jsonb)->>'code')->>'ok')::boolean as bob_peut_jouer,
       jsonb_array_length(rejoindre_defi((:'alice_defi'::jsonb)->>'code')->'questions') as nb_questions;

\echo '=== 6. Code inexistant ==='
select rejoindre_defi('ZZZZZ')->>'raison' as raison, rejoindre_defi('ZZZZZ')->>'message' as message;

\echo '=== 7. Les deux terminent ==='
select terminer_defi((:'alice_defi'::jsonb->>'defi_id')::uuid, 18, 74.5, 2) as bob_ok;
select set_config('request.jwt.claim.sub', :'ALICE', false);
select terminer_defi((:'alice_defi'::jsonb->>'defi_id')::uuid, 20, 81.0, 0) as alice_ok;

\echo '=== 8. Alice retente (doit être refusé) ==='
do $$ declare v_id uuid; begin
  select id into v_id from defis order by cree_le desc limit 1;
  perform terminer_defi(v_id, 20, 40.0, 0);
  raise notice 'ECHEC : double participation acceptée !';
exception when others then
  raise notice 'OK : refusé (%)', sqlerrm;
end $$;

\echo '=== 9. Classement du défi (tri sprint = temps + 3s/erreur) ==='
select * from classement_defi((:'alice_defi'::jsonb->>'defi_id')::uuid);

\echo '=== 10. Avancement ==='
select avancement_defi((:'alice_defi'::jsonb->>'defi_id')::uuid);

\echo '=== 11. Classement Progression — semaine, collège ==='
select rang, nom_affiche, classe, points, est_moi
  from classement_progression('semaine', 'college', 'decouverte', 8);

\echo '=== 12. Classement Records — série, tout, collège ==='
select rang, nom_affiche, classe, valeur, est_moi
  from classement_records('serie', 'tout', 'college', 'decouverte', 5);

\echo '=== 13. Classement Records — sprint (plus petit temps gagne) ==='
select rang, nom_affiche, valeur from classement_records('sprint', 'tout', 'college', 'decouverte', 5);

\echo '=== 14. Ma classe uniquement ==='
select rang, nom_affiche, classe from classement_progression('semaine', 'classe', 'decouverte', 8);

\echo '=== 15. Aucun email ne fuit dans les classements ==='
select count(*) as colonnes_sensibles
  from information_schema.columns
 where table_schema='public'
   and column_name in ('email')
   and table_name in ('classement_defi','classement_records','classement_progression');

\echo '=== 16. Bob ne voit PAS les sessions d Alice (RLS) ==='
select set_config('request.jwt.claim.sub', :'BOB', false);
select count(*) as sessions_visibles_par_bob from sessions_jeu;
select count(*) as eleves_visibles_par_bob from eleves;

\echo '=== 17. Bob tente de changer sa classe (doit être ignoré) ==='
update eleves set classe='6Z' where id = eleve_courant();
select prenom, classe from eleves where id = eleve_courant();

\echo '=== 18. Bob tente de s attribuer un badge ==='
do $$ begin
  insert into badges (eleve_id, badge_id) values (eleve_courant(), 'streak_100');
  raise notice 'ECHEC : badge auto-attribué !';
exception when others then
  raise notice 'OK : refusé (%)', sqlerrm;
end $$;

\echo '=== 19. Pondération : une table facile rapporte moins ==='
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'ALICE', false);
select round(poids_moyen('{2,5}'::smallint[]),2)  as tables_faciles,
       round(poids_moyen('{7,8}'::smallint[]),2)  as tables_dures,
       round(poids_moyen('{13,17}'::smallint[]),2) as tables_expertes;
select palier_tables('{2,5,10}'::smallint[]) as p1,
       palier_tables('{11,12}'::smallint[])  as p2,
       palier_tables('{17,19}'::smallint[])  as p3;

\echo '=== 20. Alice (plafond 10) tente les tables de 17 ==='
do $$ begin
  perform enregistrer_session(p_mode=>'libre', p_tables=>'{17}'::smallint[],
                              p_nb_questions=>10, p_score=>10);
  raise notice 'ECHEC : tables au-dessus du plafond acceptées !';
exception when others then
  raise notice 'OK : refusé (%)', sqlerrm;
end $$;

\echo '=== 21. Deux parties de même score, difficulté différente ==='
select (enregistrer_session('libre','{2,5}'::smallint[],20,20)->>'points')::int as pts_faciles;
select (enregistrer_session('libre','{7,9}'::smallint[],20,20)->>'points')::int as pts_dures;

\echo '=== 22. La Montée débloque les tables suivantes ==='
select (enregistrer_session('climb','{2,3,4,5,6,7,8,9,10}'::smallint[],45,41,
        p_plus_haute_table=>10::smallint)->>'plafond_tables')::int as nouveau_plafond;

\echo '=== 23. Tables faibles suggérées ==='
select mes_tables_faibles(4) as a_reviser;

\echo '=== 24. Vue enseignant : maîtrise de la classe 6A ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select table_n, eleves_verts, eleves_total, taux_maitrise
  from maitrise_classe('6A') limit 6;

\echo '=== 25. Portee NIVEAU : tous les 6e du college ==='
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'ALICE', false);
select niveau_scolaire('6A') as n1, niveau_scolaire('5A') as n2, niveau_scolaire('3B') as n3;
select rang, nom_affiche, classe from classement_progression('semaine','niveau','decouverte',10);

\echo '=== 26. Classement des classes (moyenne par eleve) ==='
select rang, classe, eleves_actifs, eleves_total, points_moyens, est_ma_classe
  from classement_classes('semaine');

\echo '=== 27. Classement des classes, 6e uniquement ==='
select rang, classe, points_moyens from classement_classes('semaine','6');

\echo '=== 28. Le prof voit bien sa classe ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select count(*) as eleves_visibles_par_prof from eleves;
select count(*) as sessions_visibles_par_prof from sessions_jeu;

reset role;

\echo '=== 32. Tableau d honneur : palier tous, college entier ==='
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'ALICE', false);
select rang, nom_affiche, classe, points
  from classement_progression('tout','college','tous',10);

\echo '=== 33. Comparaison : palier decouverte seul vs tous ==='
select 'decouverte' as portee, count(*) as nb from classement_records('serie','tout','college','decouverte',50)
union all
select 'tous',              count(*)     from classement_records('serie','tout','college','tous',50);
reset role;

\echo '=== 34. ADMIN : import de rentree ==='
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF', false);
select jsonb_pretty(importer_eleves('[
  {"email":"nouveau.eleve@demo.saintho.fr","nom":"Nouveau","prenom":"Eleve","classe":"6A"},
  {"email":"alice.dupont@demo.saintho.fr","nom":"Dupont","prenom":"Alice","classe":"6A"},
  {"email":"PAS-UN-EMAIL","nom":"X","prenom":"Y","classe":"6A"}
]'::jsonb) - 'actifs_absents_du_fichier');

\echo '=== 35. ADMIN : ajout a l unite ==='
select ajouter_eleve('arrivee.novembre@demo.saintho.fr','Tardif','Marie','6B')->>'message' as resultat;

\echo '=== 36. ADMIN : doublon refuse ==='
select ajouter_eleve('arrivee.novembre@demo.saintho.fr','Tardif','Marie','6B')->>'raison' as resultat;

\echo '=== 37. ADMIN : plafond de toute une classe ==='
select definir_plafond_classe('6A', 12::smallint)->>'message' as resultat;

\echo '=== 38. ADMIN : correction d email interdite apres connexion ==='
do $$ declare v uuid; begin
  select id into v from eleves where email='alice.dupont@demo.saintho.fr';
  perform modifier_eleve(v, p_email=>'autre@demo.saintho.fr');
  raise notice 'ECHEC : email change alors que l eleve s est connecte !';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;

\echo '=== 39. ADMIN : desactivation conserve les resultats ==='
do $$ declare v uuid; n int; begin
  select id into v from eleves where email='hugo.lambert@demo.saintho.fr';
  perform desactiver_eleve(v, 'demenagement');
  select count(*) into n from sessions_jeu where eleve_id = v;
  raise notice 'OK : desactive, % sessions conservees', n;
end $$;

\echo '=== 40. Eleves jamais connectes ==='
select classe, count(*) as jamais_connectes from eleves_sans_connexion() group by classe order by classe;

\echo '=== 41. Journal : qui a fait quoi ==='
select acteur_email, action, coalesce(cible,'-') as cible from journal_admin order by id;

\echo '=== 42. Un ELEVE ne peut pas administrer ==='
select set_config('request.jwt.claim.sub', :'BOB', false);
do $$ begin
  perform ajouter_eleve('pirate@demo.saintho.fr','P','P','6A');
  raise notice 'ECHEC : un eleve a pu ajouter un compte !';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;
do $$ begin
  perform importer_eleves('[]'::jsonb);
  raise notice 'ECHEC : un eleve a pu importer !';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;
reset role;

\echo '=== 43. PROFS : creation de comptes ==='
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF', false);
select creer_prof('cyrille@demo.saintho.fr','Cyrille Moreau','admin','{6A,6B}')->>'message' as r1;
select creer_prof('nouveau.prof@demo.saintho.fr','M. Nouveau','prof')->>'message' as r2;

\echo '=== 44. PROFS : liste ==='
select nom, role, actif, connecte from liste_profs();

\echo '=== 45. GARDE-FOU : on ne peut pas retirer le dernier admin ==='
do $$ declare v uuid; begin
  -- on retrograde d abord Cyrille pour n avoir qu un seul admin
  select id into v from profs where email='cyrille@demo.saintho.fr';
  perform modifier_prof(v, p_role=>'prof');
  select id into v from profs where email='prof.demo@demo.saintho.fr';
  perform modifier_prof(v, p_role=>'prof');
  raise notice 'ECHEC : le dernier admin a pu etre retrograde !';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;

\echo '=== 46. Un prof NON admin voit toutes les classes ==='
select set_config('request.jwt.claim.sub', :'PROF2', false);
select classe, eleves_actifs, est_favorite from liste_classes();

\echo '=== 47. Un prof NON admin gere les eleves de TOUTE classe ==='
select ajouter_eleve('test.crossclass@demo.saintho.fr','Test','Cross','5A')->>'ok' as autorise;

\echo '=== 48. Mais il ne peut PAS creer de compte prof ==='
do $$ begin
  perform creer_prof('pirate@demo.saintho.fr','P','admin');
  raise notice 'ECHEC : un prof non admin a cree un compte !';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;

\echo '=== 49. Ses classes favorites ==='
select definir_mes_classes('{5A}')->>'ok' as ok;
select classe, est_favorite from liste_classes() where est_favorite;
reset role;

\echo '=== 50. QUI SUIS-JE : un eleve ==='
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'ALICE', false);
select qui_suis_je()->>'type' as type, qui_suis_je()->'profil'->>'prenom' as prenom;

\echo '=== 51. QUI SUIS-JE : un prof admin ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select qui_suis_je()->>'type' as type, qui_suis_je()->>'admin' as admin, qui_suis_je()->'profil'->>'nom' as nom;

\echo '=== 52. QUI SUIS-JE : compte inconnu ==='
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);
select qui_suis_je()->>'type' as type, qui_suis_je()->>'message' as message;

\echo '=== 53. Les profs jouent ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select (enregistrer_session_prof('countdown','{7,8,9}'::smallint[],45,42,120.0,15,15)->>'points')::int as pts_prof1;
select set_config('request.jwt.claim.sub', :'PROF2', false);
select (enregistrer_session_prof('countdown','{13,17}'::smallint[],30,28,120.0,12,12)->>'points')::int as pts_prof2;

\echo '=== 54. Classement de la salle des profs (nom complet) ==='
select rang, nom_affiche, valeur, parties, est_moi from classement_profs('points');

\echo '=== 55. Un ELEVE ne voit RIEN du classement des profs ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select count(*) as lignes_vues_par_un_eleve from classement_profs('points');
select count(*) as sessions_profs_lues_par_un_eleve from sessions_profs;

\echo '=== 56. Un ELEVE ne peut pas enregistrer une partie de prof ==='
do $$ begin
  perform enregistrer_session_prof('libre','{2}'::smallint[],10,10);
  raise notice 'ECHEC : un eleve a enregistre une partie de prof !';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;

\echo '=== 57. Les profs n apparaissent PAS dans les classements eleves ==='
select count(*) as profs_dans_classement_eleves
  from classement_progression('tout','college','tous',50)
 where nom_affiche like '%Calcul%' or nom_affiche like '%Demonstration%';

-- =====================================================================
-- 58-60. La Montee des tables ne se gagne qu'en Montee
-- Regression : les badges climb_* etaient accordes des que la plus
-- grande table COCHEE atteignait le seuil, quel que soit le mode.
-- =====================================================================
-- Remise a zero des badges de montee : impossible pour un eleve
-- (aucun droit de suppression sur `badges`), on passe par le proprietaire.
reset role;
delete from badges where badge_id like 'climb_%'
  and eleve_id = (select id from eleves where email = 'alice.dupont@demo.saintho.fr');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);

\echo '=== 58. Entrainement libre en cochant la table 10 : AUCUN badge de montee ==='
select enregistrer_session('libre','{9,10}'::smallint[],10,10,
       '[]'::jsonb,30,10,10,10::smallint,'{}'::jsonb,null) -> 'nouveaux_badges' as doit_etre_vide;
select case when count(*) = 0 then 'OK : aucun badge de montee'
            else 'ECHEC : badge de montee accorde en mode libre' end as verdict
  from badges where eleve_id = eleve_courant() and badge_id like 'climb_%';
select case when plus_haute_table is null then 'OK : colonne non renseignee hors Montee'
            else 'ECHEC : la table cochee a ete enregistree comme atteinte' end as verdict
  from sessions_jeu where eleve_id = eleve_courant() order by cree_le desc limit 1;

\echo '=== 59. Vraie Montee jusqu a la table 10 : le badge est accorde ==='
select enregistrer_session('climb','{2,3,4,5,6,7,8,9,10}'::smallint[],30,30,
       '[]'::jsonb,90,30,30,10::smallint,'{}'::jsonb,null) -> 'nouveaux_badges' as doit_contenir_climb_10;
select case when count(*) = 1 then 'OK : badge climb_10 accorde'
            else 'ECHEC : badge de montee manquant' end as verdict
  from badges where eleve_id = eleve_courant() and badge_id = 'climb_10';

\echo '=== 60. Tables au-dessus du plafond : refus avec un message lisible ==='
do $$ begin
  perform enregistrer_session('libre','{14}'::smallint[],5,5);
  raise notice 'ECHEC : partie acceptee sur une table verrouillee';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;

-- =====================================================================
-- 61-63. Premier coup / rattrapage : chercher doit toujours payer
-- Regression a empecher : si un rattrapage ne vaut rien, abandonner
-- devient la meilleure strategie sous chrono.
-- =====================================================================
\echo '=== 61. 20/20 du premier coup > 20/20 avec 8 rattrapages > 12/20 sans rattrapage ==='
with a as (select (enregistrer_session('libre','{7,8}'::smallint[],20,20,
                    '[]'::jsonb,60,20,20,null,'{}'::jsonb,null,20)->>'points')::int as p),
     b as (select (enregistrer_session('libre','{7,8}'::smallint[],20,20,
                    '[]'::jsonb,60,20,20,null,'{}'::jsonb,null,12)->>'points')::int as p),
     c as (select (enregistrer_session('libre','{7,8}'::smallint[],20,12,
                    '[]'::jsonb,60,12,12,null,'{}'::jsonb,null,12)->>'points')::int as p)
select a.p as tout_premier_coup, b.p as avec_rattrapages, c.p as a_abandonne,
       case when a.p > b.p and b.p > c.p
            then 'OK : chercher paye plus qu abandonner'
            else 'ECHEC : mauvaise incitation' end as verdict
  from a, b, c;

\echo '=== 62. Ancien client hors ligne : parametre absent, aucune penalite ==='
select case when (enregistrer_session('libre','{7,8}'::smallint[],10,10)->>'premier_essai')::int = 10
            then 'OK : traite comme premier coup'
            else 'ECHEC : ancienne partie penalisee' end as verdict;

\echo '=== 63. Un premier essai superieur au score est refuse ==='
do $$ begin
  perform enregistrer_session('libre','{7,8}'::smallint[],10,5,
          '[]'::jsonb,10,0,0,null,'{}'::jsonb,null,9);
  raise notice 'ECHEC : premier_essai > score accepte';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;

-- =====================================================================
-- MIGRATION 17 — « Mes défis » et la salle des profs
-- =====================================================================
set role authenticated;

\echo '=== 64. Le prof cree un defi pour la 6A ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select creer_defi('sprint', '{6,7,8}'::smallint[], 20, null, '6A')->>'code' as code_prof \gset

\echo '=== 65. mes_defis() : le defi du prof est la, 0 participant sur 4 ==='
select code, type, classe, encore_ouvert, participants, attendus
  from mes_defis() where code = :'code_prof';

\echo '=== 66. Alice rejoint et termine ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select (rejoindre_defi(:'code_prof')->>'defi_id') as did \gset
select terminer_defi(:'did'::uuid, 18, 62.0, 2, '{}'::jsonb, '{}'::jsonb, 16)->>'ok' as termine;

\echo '=== 67. Le prof revient sur son defi : 1/4, et le classement se lit ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select case when (select participants from mes_defis() where code = :'code_prof') = 1
            then 'OK : le prof retrouve son defi et son compteur'
            else 'ECHEC : le prof ne voit pas la participation' end as verdict;
select rang, nom_affiche, classe, score, temps_s from classement_defi(:'did'::uuid);

\echo '=== 68. Un defi cree par un eleve n apparait pas chez le prof ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select creer_defi('sprint', '{2,3}'::smallint[], 20)->>'code' as code_alice \gset
select case when exists (select 1 from mes_defis() where code = :'code_alice')
            then 'OK : Alice voit son propre defi'
            else 'ECHEC : Alice ne voit pas son defi' end as verdict;
select set_config('request.jwt.claim.sub', :'PROF', false);
select case when not exists (select 1 from mes_defis() where code = :'code_alice')
            then 'OK : le defi d Alice reste chez Alice'
            else 'ECHEC : fuite entre createurs' end as verdict;

\echo '=== 69. Un eleve sans defi cree ne voit rien ==='
select set_config('request.jwt.claim.sub', :'BOB', false);
select case when (select count(*) from mes_defis()) = 0
            then 'OK : liste vide'
            else 'ECHEC : Bob voit les defis des autres' end as verdict;

\echo '=== 70. Salle des profs : la colonne s appelle bien nom_affiche ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select rang, nom_affiche, valeur, parties, est_moi from classement_profs('points','tout',10);
select case when (select nom_affiche from classement_profs('points','tout',10)
                   where est_moi limit 1) is not null
            then 'OK : le prof a un nom dans son classement'
            else 'ECHEC : nom_affiche vide — le tiret revient' end as verdict;

\echo '=== 71. Un eleve ne voit rien de la salle des profs ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select case when (select count(*) from classement_profs('points','tout',10)) = 0
            then 'OK : verrou en place'
            else 'ECHEC : un eleve lit la salle des profs' end as verdict;

\echo '=== 72. Denominateur : seulement pour un defi de prof ==='
select case when avancement_defi((select id from defis where code = :'code_alice'))->>'attendus' is null
             and (avancement_defi((select id from defis where code = :'code_prof'))->>'attendus')::int > 0
            then 'OK : pas de denominateur entre copains, effectif de classe pour le prof'
            else 'ECHEC : mauvais denominateur' end as verdict;

-- =====================================================================
-- MIGRATION 18 — origine du defi et denominateur qui compte juste
-- =====================================================================
set role authenticated;

\echo '=== 73. Defi de prof vise la 6A, joue par la 6A ET par la 6B ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select creer_defi('sprint','{6,7,8}'::smallint[],20,null,'6A')->>'code' as c \gset
select set_config('request.jwt.claim.sub', :'ALICE', false);
select (rejoindre_defi(:'c')->>'defi_id') as did \gset
select terminer_defi(:'did'::uuid, 18, 62.0, 2, '{}'::jsonb, '{}'::jsonb, 16)->>'ok' as alice_6a;
-- David est en 6B. Faire jouer une classe contre une autre est voulu.
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
select terminer_defi(:'did'::uuid, 15, 70.0, 5, '{}'::jsonb, '{}'::jsonb, 12)->>'ok' as david_6b;

\echo '=== 74. Le ratio de classe ne peut pas depasser 100 % ==='
-- C'est le defaut de la migration 17 : « 2 / 1 ont termine » sur la base
-- reelle, parce que le numerateur comptait toutes les classes et le
-- denominateur une seule.
select set_config('request.jwt.claim.sub', :'PROF', false);
select code, origine, auteur_nom, participants, participants_classe, attendus
  from mes_defis() where code = :'c';
select case when (select participants_classe from mes_defis() where code = :'c')
             <= (select attendus from mes_defis() where code = :'c')
            then 'OK : numerateur et denominateur comptent la meme population'
            else 'ECHEC : numerateur > denominateur' end as verdict;

\echo '=== 75. avancement_defi porte aussi l origine et les deux compteurs ==='
select jsonb_pretty(avancement_defi(:'did'::uuid));
select case when (avancement_defi(:'did'::uuid)->>'termines_classe')::int
             <= (avancement_defi(:'did'::uuid)->>'attendus')::int
            then 'OK : meme regle dans l en-tete du classement'
            else 'ECHEC : en-tete incoherent' end as verdict;

\echo '=== 76. Defi d eleve : origine eleve, nom anonymise, pas de denominateur ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select creer_defi('sprint','{2,3}'::smallint[],20)->>'code' as ca \gset
select code, origine, auteur_nom, participants, participants_classe, attendus
  from mes_defis() where code = :'ca';
select case when (select auteur_nom from mes_defis() where code = :'ca') = 'Alice D.'
             and (select attendus from mes_defis() where code = :'ca') is null
            then 'OK : nom anonymise, aucun denominateur de classe'
            else 'ECHEC : nom complet expose ou faux denominateur' end as verdict;

\echo '=== 77. rejoindre_defi annonce de qui est le defi, avant de jouer ==='
select set_config('request.jwt.claim.sub', :'BOB', false);
select case when rejoindre_defi(:'ca')->>'auteur_nom' = 'Alice D.'
             and rejoindre_defi(:'ca')->>'origine' = 'eleve'
            then 'OK : defi d eleve annonce comme tel'
            else 'ECHEC : origine du defi d eleve' end as verdict;
select set_config('request.jwt.claim.sub', :'PROF', false);
select creer_defi('sprint','{9}'::smallint[],20,null,'6A')->>'code' as cp \gset
select set_config('request.jwt.claim.sub', :'BOB', false);
select case when rejoindre_defi(:'cp')->>'auteur_nom' = 'M. Démonstration'
             and rejoindre_defi(:'cp')->>'origine' = 'prof'
            then 'OK : nom complet du prof annonce a l eleve'
            else 'ECHEC : origine du defi de prof' end as verdict;

-- =====================================================================
-- MIGRATION 19 — maitrise_classe : effectif reel de la classe
-- =====================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF', false);

\echo '=== 78. maitrise_classe distingue « qui a travaille » et « la classe » ==='
select table_n, eleves_verts, eleves_total, eleves_classe, taux_maitrise, taux_couverture
  from maitrise_classe('6A') order by table_n limit 4;
select case when (select bool_and(eleves_total <= eleves_classe) from maitrise_classe('6A'))
             and (select count(distinct eleves_classe) from maitrise_classe('6A')) = 1
            then 'OK : effectif constant, jamais depasse'
            else 'ECHEC : denominateur incoherent' end as verdict;

\echo '=== 79. Un eleve qui n a rien travaille reste dans le denominateur ==='
-- C'est le defaut que la migration 19 corrige : les eleves qui n'ont
-- jamais ouvert la table de 7 disparaissaient du compte — or ce sont
-- exactement ceux dont le professeur doit s'occuper.
select ajouter_eleve('zoe.nouvelle@demo.saintho.fr','Nouvelle','Zoé','6A')->>'ok' as zoe_ajoutee;
select case when (select bool_and(eleves_total < eleves_classe) from maitrise_classe('6A'))
             and (select bool_and(taux_couverture < 100) from maitrise_classe('6A'))
            then 'OK : Zoe est comptee comme non couverte, pas ignoree'
            else 'ECHEC : l eleve sans activite disparait du denominateur' end as verdict;

\echo '=== 80. Un eleve ne voit rien de la maitrise de sa classe ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select case when (select count(*) from maitrise_classe('6A')) = 0
            then 'OK : verrou prof_voit_classe en place'
            else 'ECHEC : un eleve lit la maitrise de la classe' end as verdict;

-- =====================================================================
-- MIGRATION 20 — les tables qui existent pour cette classe
-- =====================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF', false);

\echo '=== 81. Une ligne par table, travaillee ou non — l ecran n en invente plus ==='
select table_n, travaillee, dans_le_plafond_commun, eleves_verts,
       eleves_sans_trace, eleves_total, eleves_classe, taux_couverture
  from maitrise_classe('6A') order by table_n;
select case when (select bool_and(eleves_sans_trace = eleves_classe - eleves_total)
                    from maitrise_classe('6A'))
            then 'OK : le segment gris vient du serveur, pas d une soustraction React'
            else 'ECHEC : eleves_sans_trace incoherent' end as verdict;

\echo '=== 82. Plafonds melanges : afficher jusqu au max, ne proposer que le commun ==='
-- Le bouton « Lancer un defi sur les tables les plus faibles » proposait
-- les tables JAMAIS ouvertes en premier, fabriquees cote React comme
-- « 2 a 20 moins ce que renvoie la fonction ». Dans une 6e plafonnee a
-- 10, il proposait donc 11, 12, 13 — et un defi de prof n'a aucun
-- plafond de tables. La classe aurait recu un defi hors de sa portee.
reset role;
update public.eleves set plafond_tables = 12 where email = 'clara.bernard@demo.saintho.fr';
set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF', false);
select table_n, travaillee, dans_le_plafond_commun
  from maitrise_classe('6A') where table_n >= 10 order by table_n;
select case when (select bool_and(dans_le_plafond_commun)
                    from maitrise_classe('6A') where table_n <= 10)
             and not (select bool_or(dans_le_plafond_commun)
                    from maitrise_classe('6A') where table_n > 10)
             and (select max(table_n) from maitrise_classe('6A')) = 12
            then 'OK : affichage jusqu a 12, defi borne a 10'
            else 'ECHEC : borne du defi incorrecte' end as verdict;
select case when (select count(*) from maitrise_classe('6A') where table_n > 12) = 0
            then 'OK : aucune table fantome au-dela du plafond de la classe'
            else 'ECHEC : tables inventees' end as verdict;


-- =====================================================================
-- MIGRATION 21 — le defi fait autorisation
-- Un defi de prof sur la table 15 etait JOUABLE par une 6e plafonnee a
-- 12, mais son score etait refuse a l'enregistrement : elle jouait deux
-- minutes pour rien. Le plafond est un anti-triche (migration 10), pas
-- une limite de programme. Il cede donc devant un defi — et devant lui
-- SEUL : tout le reste garde son refus.
-- =====================================================================
reset role;
update public.eleves set plafond_tables = 12
 where email in ('alice.dupont@demo.saintho.fr', 'bob.martin@demo.saintho.fr');
set role authenticated;

\echo '=== 83. creer_defi ne refuse pas, mais dit combien d eleves sont concernes ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select (creer_defi('sprint','{15}'::smallint[],10,null,'6A')) as d \gset
select (:'d'::jsonb)->>'code' as code_defi_15 \gset
select set_config('test.code15', :'code_defi_15', false);
select (:'d'::jsonb)->'eleves_classe'       as eleves_classe,
       (:'d'::jsonb)->'eleves_hors_plafond' as hors_plafond,
       (:'d'::jsonb)->'table_max'           as table_max;
select case when ((:'d'::jsonb)->>'eleves_hors_plafond')::int
              = (select count(*) from public.eleves
                  where classe = '6A' and actif and plafond_tables < 15)
             and ((:'d'::jsonb)->>'eleves_classe')::int
              = (select count(*) from public.eleves where classe = '6A' and actif)
            then 'OK : les deux populations sont celles de la classe visee'
            else 'ECHEC : compteur hors plafond incoherent' end as verdict;

\echo '=== 84. Alice (plafond 12) joue le defi sur la table 15 : le score PASSE ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select (rejoindre_defi(:'code_defi_15')->>'defi_id') as did15 \gset
select terminer_defi(:'did15'::uuid, 8, 45, 2)->>'ok' as alice_a_pu_enregistrer;
select case when count(*) = 1
            then 'OK : la session du defi est enregistree'
            else 'ECHEC : le score du defi a ete perdu' end as verdict
  from sessions_jeu where eleve_id = eleve_courant() and defi_id = :'did15'::uuid;

\echo '=== 85. Le defi sur la table 15 ne debloque RIEN (migration 10) ==='
select case when (select plafond_tables from eleves where id = eleve_courant()) = 12
            then 'OK : plafond inchange apres un defi hors plafond'
            else 'ECHEC : le defi a fait monter le plafond' end as verdict;

\echo '=== 86. Hors defi, le plafond refuse toujours : l anti-triche est intact ==='
do $$ begin
  perform enregistrer_session('libre','{15}'::smallint[],5,5);
  raise notice 'ECHEC : partie libre acceptee sur une table verrouillee';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;

\echo '=== 87. Le defi n est pas un passe-partout : d autres tables que les siennes ==='
do $$
declare v_did uuid;
begin
  select id into v_did from defis where code = current_setting('test.code15', true);
  perform enregistrer_session('sprint','{15,16}'::smallint[],5,5,'[]'::jsonb,30,0,0,
                              null,'{}'::jsonb,v_did);
  raise notice 'ECHEC : le defi a autorise une table qui n est pas la sienne';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;

\echo '=== 88. Un eleve qui n a pas participe n obtient rien du defi ==='
select set_config('request.jwt.claim.sub', :'BOB', false);
do $$
declare v_did uuid;
begin
  select id into v_did from defis where code = current_setting('test.code15', true);
  perform enregistrer_session('sprint','{15}'::smallint[],5,5,'[]'::jsonb,30,0,0,
                              null,'{}'::jsonb,v_did);
  raise notice 'ECHEC : un non-participant a profite du defi';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;

\echo '=== 90. Une partie de defi ne s enregistre qu une fois ==='
-- `terminer_defi` etait protege par la cle primaire de
-- `defis_participants` ; l appel direct a `enregistrer_session` avec le
-- meme p_defi_id ne l etait pas, et la session comptait deux fois.
select set_config('request.jwt.claim.sub', :'ALICE', false);
do $$
declare v_did uuid; v_avant integer; v_apres integer;
begin
  select id into v_did from defis where code = current_setting('test.code15', true);
  select count(*) into v_avant from sessions_jeu
   where eleve_id = eleve_courant() and defi_id = v_did;
  begin
    perform enregistrer_session('sprint','{15}'::smallint[],10,10,'[]'::jsonb,5,0,0,
                                null,'{}'::jsonb,v_did);
  exception when others then raise notice 'OK : refuse (%)', sqlerrm; end;
  select count(*) into v_apres from sessions_jeu
   where eleve_id = eleve_courant() and defi_id = v_did;
  if v_apres = v_avant then
    raise notice 'OK : aucune session supplementaire (% avant, % apres)', v_avant, v_apres;
  else
    raise notice 'ECHEC : le defi a ete enregistre deux fois';
  end if;
end $$;

\echo '=== 89. apercu_defi_classe : la question posee AVANT de creer ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select apercu_defi_classe('6A','{15}'::smallint[]) as apercu;
select case when (apercu_defi_classe('6A','{15}'::smallint[])->>'eleves_hors_plafond')::int
              = (select count(*) from public.eleves
                  where classe = '6A' and actif and plafond_tables < 15)
             and (apercu_defi_classe('6A','{9}'::smallint[])->>'eleves_hors_plafond')::int = 0
            then 'OK : apercu juste, et nul quand la table est a la portee de tous'
            else 'ECHEC : apercu incoherent' end as verdict;
select set_config('request.jwt.claim.sub', :'ALICE', false);
select case when (apercu_defi_classe('6A','{15}'::smallint[])->>'eleves_classe')::int = 0
            then 'OK : un eleve n apprend rien des plafonds de sa classe'
            else 'ECHEC : apercu_defi_classe ouvert aux eleves' end as verdict;



-- =====================================================================
-- MIGRATION 22 — le rattachement ne peut plus arriver trop tard
-- Une fiche creee APRES la premiere connexion Google restait orpheline
-- pour toujours : le trigger `on_auth_user_created` ne se declenche
-- qu'a la creation du compte, et rien ne le rejouait.
-- =====================================================================
reset role;

\echo '=== 91. Fiche creee APRES le compte Google : ajouter_eleve rattache ==='
-- Le compte existe d'abord (l'eleve a ouvert l'application par curiosite),
-- la fiche vient ensuite. C'est le cas remonte le 1er septembre.
insert into auth.users (id, email)
values ('cccccccc-0000-0000-0000-000000000091', 'tardive@demo.saintho.fr');
select case when (select user_id from public.eleves
                   where email = 'tardive@demo.saintho.fr') is null
            then 'OK : aucune fiche, le trigger n a rien trouve'
            else 'ECHEC : fiche fantome' end as verdict;
set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF', false);
select ajouter_eleve('tardive@demo.saintho.fr','Tardive','Tina','6A')->>'ok' as ajout;
reset role;
select case when (select user_id from public.eleves
                   where email = 'tardive@demo.saintho.fr')
             = 'cccccccc-0000-0000-0000-000000000091'
            then 'OK : rattachee a son compte existant'
            else 'ECHEC : fiche orpheline, eleve bloquee pour toujours' end as verdict;
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000091', false);
select case when qui_suis_je()->>'type' = 'eleve'
            then 'OK : elle entre dans l application'
            else 'ECHEC : ' || (qui_suis_je()->>'message') end as verdict;

\echo '=== 92. Import de rentree : meme rattrapage, et il est compte ==='
reset role;
insert into auth.users (id, email)
values ('cccccccc-0000-0000-0000-000000000092', 'importee@demo.saintho.fr');
set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF', false);
select importer_eleves('[{"email":"importee@demo.saintho.fr","nom":"Importee",
                          "prenom":"Iris","classe":"6B"}]'::jsonb)->>'rattaches'
       as rattaches_doit_valoir_1;
reset role;
select case when (select user_id from public.eleves
                   where email = 'importee@demo.saintho.fr') is not null
            then 'OK : rattachee des l import'
            else 'ECHEC : import qui laisse un eleve dehors' end as verdict;

\echo '=== 93. reparer_rattachements : le bouton de l administrateur ==='
-- Une fiche laissee orpheline a la main, comme si elle datait d avant la
-- migration 22.
reset role;
insert into auth.users (id, email)
values ('cccccccc-0000-0000-0000-000000000093', 'orpheline@demo.saintho.fr');
insert into public.eleves (email, nom, prenom, classe)
values ('orpheline@demo.saintho.fr','Orpheline','Olga','6B');
update public.eleves set user_id = null where email = 'orpheline@demo.saintho.fr';
set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF', false);
select reparer_rattachements()->>'rattaches' as reparees;
reset role;
select case when (select user_id from public.eleves
                   where email = 'orpheline@demo.saintho.fr') is not null
            then 'OK : fiche debloquee'
            else 'ECHEC : la reparation ne repare pas' end as verdict;
set role authenticated;
select set_config('request.jwt.claim.sub', :'ALICE', false);
do $$ begin
  perform reparer_rattachements();
  raise notice 'ECHEC : un eleve peut lancer la reparation';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;

\echo '=== 94. On ne vole pas le compte de quelqu un d autre ==='
-- Une fiche creee avec l adresse d un compte DEJA rattache ne doit pas
-- le reprendre : sinon une fiche eleve portant l adresse d un
-- administrateur lui prendrait son compte.
reset role;
select case when (select count(*) from public.profs
                   where email = 'prof.demo@demo.saintho.fr'
                     and user_id is not null) = 1
            then 'OK : le prof de demo a bien un compte rattache'
            else 'ECHEC : preparation du cas 94 invalide' end as verdict;
select rattacher_par_email('prof.demo@demo.saintho.fr') is null
       as doit_etre_true_rien_a_rattacher;
select case when (select user_id from public.profs
                   where email = 'prof.demo@demo.saintho.fr') = :'PROF'::uuid
            then 'OK : son compte ne lui a pas ete pris'
            else 'ECHEC : compte vole' end as verdict;

\echo '=== 95. La barriere d entree tient toujours ==='
reset role;
insert into auth.users (id, email)
values ('cccccccc-0000-0000-0000-000000000095', 'inconnue@demo.saintho.fr');
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000095', false);
select case when qui_suis_je()->>'type' = 'inconnu'
            then 'OK : un compte Google sans fiche n obtient rien'
            else 'ECHEC : la barriere d entree a saute' end as verdict;


reset role;
