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
--
-- COMPTE EXACT : 192 cas, numérotés jusqu'à 192. Le 189 a été retiré
-- (remplacé par le 192, qui ne vaut qu'après la migration 38) ; les cas
-- 29 à 31 l'ont été depuis longtemps ; 38b-38d et 180b complètent leurs aînés. Les numéros 29 à 31 ont
-- été retirés et ne sont pas réattribués, pour que les numéros cités dans
-- les migrations continuent de désigner le même test ; les cas 38b à 38d et 180b
-- complètent les cas 38 et 180.
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
select rang, classe, ont_joue, inscrits, points_par_inscrit, est_ma_classe
  from classement_classes('semaine');

\echo '=== 27. Classement des classes, 6e uniquement ==='
select rang, classe, points_par_inscrit from classement_classes('semaine','6');

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

\echo '=== 38. ADMIN : corriger l adresse d un eleve DEJA CONNECTE (migration 35) ==='
-- Avant la migration 35 c etait refuse : « desactive cette fiche et
-- cree-en une nouvelle ». Excessif. Un renommage dans Google Workspace
-- doit etre transparent pour l eleve. Le controle qui compte est que
-- `user_id` ne bouge pas : c est lui, et pas l adresse, qui relie
-- l eleve a son historique.
select id as alice_id, user_id as alice_uid,
       (select count(*) from sessions_jeu sj where sj.eleve_id = e.id) as alice_parties
  from eleves e where email='alice.dupont@demo.saintho.fr' \gset
select modifier_eleve(:'alice_id'::uuid,
         p_email=>'alice.dupont-corrige@demo.saintho.fr')->>'email_change' as change;
select case when (select user_id from eleves where id = :'alice_id'::uuid)
                 = :'alice_uid'::uuid
             and (select count(*) from sessions_jeu
                   where eleve_id = :'alice_id'::uuid) = :alice_parties
             and (select email   from eleves where id = :'alice_id'::uuid)
                 = 'alice.dupont-corrige@demo.saintho.fr'
            then 'OK : adresse changee, compte et parties intacts'
            else 'ECHEC : l eleve a perdu son rattachement ou ses parties' end as verdict;

\echo '=== 38b. L eleve reste reconnu apres le changement d adresse ==='
-- Il se reconnecte avec le MEME compte Google, seulement renomme :
-- aucune ligne nouvelle dans auth.users, donc rien ne rattacherait une
-- fiche qu on aurait detachee. Elle ne l est pas.
select set_config('request.jwt.claim.sub', :'ALICE', false);
select case when public.eleve_courant() = :'alice_id'::uuid
            then 'OK : toujours reconnue par son compte, pas par son adresse'
            else 'ECHEC : eleve connectee et sans fiche' end as verdict;
select set_config('request.jwt.claim.sub', :'PROF', false);

\echo '=== 38c. Une adresse deja prise est refusee, et on dit par qui ==='
do $$ declare v uuid; begin
  select id into v from eleves where email='alice.dupont-corrige@demo.saintho.fr';
  perform modifier_eleve(v, p_email=>'bob.martin@demo.saintho.fr');
  raise notice 'ECHEC : deux fiches ont pu porter la meme adresse !';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;

\echo '=== 38d. Retour a l adresse d origine, meme fiche ==='
-- On remet en etat : la suite du scenario connait Alice sous son adresse.
select modifier_eleve(:'alice_id'::uuid,
         p_email=>'alice.dupont@demo.saintho.fr')->>'ok' as retour;
select case when (select user_id from eleves where id = :'alice_id'::uuid)
                 = :'alice_uid'::uuid
            then 'OK : aller-retour sans coupure'
            else 'ECHEC : rattachement perdu au retour' end as verdict;

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
select classe, inscrits, est_favorite from liste_classes();

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

\echo '=== 69. Un eleve qui n a ni cree ni joue ne voit rien ==='
-- Sens elargi par la migration 31 : `mes_defis` montre desormais aussi
-- les defis AUXQUELS on a joue. Le test ne dit donc plus « liste vide »
-- mais « rien qui ne me concerne » — c est la meme garantie, exprimee
-- sur la nouvelle regle.
select set_config('request.jwt.claim.sub', :'BOB', false);
select case when not exists (select 1 from mes_defis()
                              where not je_suis_createur and not j_ai_joue)
            then 'OK : rien qui ne me concerne'
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



-- =====================================================================
-- MIGRATION 23 — dire le plafond avec les mots du professeur
-- Le compteur etait juste, le mot etait faux : « debloque » designe
-- `plafond_tables` (un droit), lu comme « travaille » (une trace).
-- On ajoute le point de repere qui rend la phrase lisible.
-- =====================================================================
reset role;
update public.eleves set plafond_tables = 10 where email = 'alice.dupont@demo.saintho.fr';
update public.eleves set plafond_tables = 15 where email = 'bob.martin@demo.saintho.fr';
set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF', false);

\echo '=== 96. apercu_defi_classe donne le point de repere, pas seulement le compte ==='
select apercu_defi_classe('6A','{15}'::smallint[]) as apercu;
select case when (apercu_defi_classe('6A','{15}'::smallint[])->>'plafond_commun')::int = 10
             and (apercu_defi_classe('6A','{15}'::smallint[])->>'plafond_max')::int    = 15
            then 'OK : le plus bas et le plus haut plafond de la classe sont dits'
            else 'ECHEC : point de repere absent ou faux' end as verdict;

\echo '=== 97. Les quatre compteurs portent sur la MEME population ==='
-- eleves_classe = effectif actif ; hors_plafond en est un sous-ensemble ;
-- les deux plafonds sont pris sur ce meme ensemble. Jamais sur ceux qui
-- ont travaille la table.
select case when (apercu_defi_classe('6A','{15}'::smallint[])->>'eleves_classe')::int
              = (select count(*) from public.eleves where classe='6A' and actif)
             and (apercu_defi_classe('6A','{15}'::smallint[])->>'eleves_hors_plafond')::int
              <= (apercu_defi_classe('6A','{15}'::smallint[])->>'eleves_classe')::int
             and (apercu_defi_classe('6A','{15}'::smallint[])->>'plafond_commun')::int
              <= (apercu_defi_classe('6A','{15}'::smallint[])->>'plafond_max')::int
            then 'OK : une seule population pour les quatre compteurs'
            else 'ECHEC : populations melangees' end as verdict;

\echo '=== 98. Une table a la portee de tous : aucun eleve hors plafond ==='
select case when (apercu_defi_classe('6A','{9}'::smallint[])->>'eleves_hors_plafond')::int = 0
            then 'OK : rien a signaler pour une table sous le plafond commun'
            else 'ECHEC : avertissement injustifie' end as verdict;

\echo '=== 99. Un eleve n apprend toujours rien des plafonds de sa classe ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select case when (apercu_defi_classe('6A','{15}'::smallint[])->>'eleves_classe')::int = 0
            then 'OK : reserve aux enseignants'
            else 'ECHEC : apercu ouvert aux eleves' end as verdict;


reset role;


-- =====================================================================
-- MIGRATION 24 — l import de rentree se regarde avant de s executer
-- L ecran d administration promet « voila ce qui sera ecrit, rien ne l a
-- encore ete ». Cette promesse n a de valeur que si l apercu et l import
-- disent exactement la meme chose : ils partagent donc la meme fonction
-- de validation. Ces cas verifient que la promesse tient.
-- =====================================================================
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF', false);

\echo '=== 100. L apercu n ecrit rien ==='
select count(*) as eleves_avant from public.eleves \gset
select apercu_import_eleves('[
  {"ligne":2,"email":"m24.un@demo.saintho.fr",  "nom":"Un",  "prenom":"Alpha","classe":"6B"},
  {"ligne":3,"email":"m24.deux@demo.saintho.fr","nom":"Deux","prenom":"Beta", "classe":"6B"}
]'::jsonb) as apercu;
select case when (select count(*) from public.eleves) = :eleves_avant
            then 'OK : aucune ligne ecrite par l apercu'
            else 'ECHEC : l apercu a modifie la base' end as verdict;

\echo '=== 101. L apercu annonce exactement ce que l import produit ==='
-- Meme fichier, apercu d abord, import ensuite. Les trois compteurs
-- doivent coincider : c est toute la valeur de l ecran.
create temporary table t_m24 as
select apercu_import_eleves('[
  {"ligne":2,"email":"m24.un@demo.saintho.fr",  "nom":"Un",  "prenom":"Alpha","classe":"6B"},
  {"ligne":3,"email":"m24.deux@demo.saintho.fr","nom":"Deux","prenom":"Beta", "classe":"6B"},
  {"ligne":4,"email":"alice.dupont@demo.saintho.fr","nom":"Dupont","prenom":"Alice","classe":"6A"}
]'::jsonb) as a;
create temporary table t_m24b as
select importer_eleves('[
  {"ligne":2,"email":"m24.un@demo.saintho.fr",  "nom":"Un",  "prenom":"Alpha","classe":"6B"},
  {"ligne":3,"email":"m24.deux@demo.saintho.fr","nom":"Deux","prenom":"Beta", "classe":"6B"},
  {"ligne":4,"email":"alice.dupont@demo.saintho.fr","nom":"Dupont","prenom":"Alice","classe":"6A"}
]'::jsonb) as i;
select case when (select (a->>'creations')::int    from t_m24) = (select (i->>'crees')::int       from t_m24b)
             and (select (a->>'mises_a_jour')::int from t_m24) = (select (i->>'mis_a_jour')::int  from t_m24b)
             and (select (a->>'ignorees')::int     from t_m24)
               = (select jsonb_array_length(i->'lignes_ignorees') from t_m24b)
            then 'OK : l apercu ne ment pas'
            else 'ECHEC : l apercu et l import divergent' end as verdict;

\echo '=== 102. Chaque rejet porte sa propre raison ==='
select jsonb_pretty(
  apercu_import_eleves('[
    {"ligne":10,"email":"",                         "nom":"A","prenom":"B","classe":"6B"},
    {"ligne":11,"email":"pas-un-email",             "nom":"A","prenom":"B","classe":"6B"},
    {"ligne":12,"email":"m24.trois@demo.saintho.fr","nom":"A","prenom":"", "classe":"6B"},
    {"ligne":13,"email":"m24.quatre@demo.saintho.fr","nom":"","prenom":"B","classe":"6B"},
    {"ligne":14,"email":"m24.cinq@demo.saintho.fr", "nom":"A","prenom":"B","classe":""}
  ]'::jsonb)->'lignes_ignorees') as rejets;
select case when (select count(distinct l->>'raison')
                    from jsonb_array_elements(
                      apercu_import_eleves('[
                        {"ligne":10,"email":"",                          "nom":"A","prenom":"B","classe":"6B"},
                        {"ligne":11,"email":"pas-un-email",              "nom":"A","prenom":"B","classe":"6B"},
                        {"ligne":12,"email":"m24.trois@demo.saintho.fr", "nom":"A","prenom":"", "classe":"6B"},
                        {"ligne":13,"email":"m24.quatre@demo.saintho.fr","nom":"","prenom":"B","classe":"6B"},
                        {"ligne":14,"email":"m24.cinq@demo.saintho.fr",  "nom":"A","prenom":"B","classe":""}
                      ]'::jsonb)->'lignes_ignorees') l) = 5
            then 'OK : cinq rejets, cinq raisons differentes'
            else 'ECHEC : une raison fourre-tout' end as verdict;

\echo '=== 103. Un doublon dans le FICHIER nomme la ligne de la premiere occurrence ==='
select case when (apercu_import_eleves('[
                    {"ligne":20,"email":"m24.six@demo.saintho.fr","nom":"A","prenom":"B","classe":"6B"},
                    {"ligne":88,"email":"m24.six@demo.saintho.fr","nom":"A","prenom":"B","classe":"6B"}
                  ]'::jsonb)->'lignes_ignorees'->0->>'raison') = 'e-mail deja present ligne 20'
            then 'OK : le doublon renvoie a sa premiere ligne'
            else 'ECHEC : doublon avale en silence' end as verdict;

\echo '=== 104. Un doublon n est plus compte deux fois par l import ==='
-- Deux instructions separees : dans une seule, le sous-select verrait
-- l instantane d avant l import et compterait zero fiche.
select (importer_eleves('[
          {"ligne":20,"email":"m24.six@demo.saintho.fr","nom":"A","prenom":"B","classe":"6B"},
          {"ligne":88,"email":"m24.six@demo.saintho.fr","nom":"A","prenom":"B","classe":"6B"}
        ]'::jsonb)->>'crees')::int as crees_doit_valoir_1 \gset
select case when :crees_doit_valoir_1 = 1
             and (select count(*) from public.eleves where email = 'm24.six@demo.saintho.fr') = 1
            then 'OK : un eleve, une fiche, un comptage'
            else 'ECHEC : le doublon a ete traite deux fois' end as verdict;

\echo '=== 105. Une reactivation se voit, et reste un sous-ensemble ==='
do $$ declare v uuid; begin
  select id into v from public.eleves where email = 'm24.deux@demo.saintho.fr';
  perform desactiver_eleve(v, 'test migration 24');
end $$;
select jsonb_pretty(apercu_import_eleves('[
  {"ligne":2,"email":"m24.deux@demo.saintho.fr","nom":"Deux","prenom":"Beta","classe":"6B"}
]'::jsonb) - 'actifs_absents_du_fichier' - 'lignes_ignorees') as apercu_reactivation;
select case when (apercu_import_eleves('[
                    {"ligne":2,"email":"m24.deux@demo.saintho.fr","nom":"Deux","prenom":"Beta","classe":"6B"}
                  ]'::jsonb)->>'dont_reactivations')::int = 1
             and (apercu_import_eleves('[
                    {"ligne":2,"email":"m24.deux@demo.saintho.fr","nom":"Deux","prenom":"Beta","classe":"6B"}
                  ]'::jsonb)->>'mises_a_jour')::int = 1
            then 'OK : reactivation annoncee, et comptee DANS les mises a jour'
            else 'ECHEC : reactivation invisible ou comptee a part' end as verdict;

\echo '=== 106. Les trois compteurs partitionnent le fichier ==='
-- creations + mises_a_jour + ignorees = lignes lues. Exactement.
-- C est la propriete qui interdit a l ecran de fabriquer une population.
select case when (select (a->>'creations')::int + (a->>'mises_a_jour')::int + (a->>'ignorees')::int
                    = (a->>'lignes_lues')::int
                   from (select apercu_import_eleves('[
                     {"ligne":2,"email":"m24.sept@demo.saintho.fr","nom":"A","prenom":"B","classe":"6B"},
                     {"ligne":3,"email":"alice.dupont@demo.saintho.fr","nom":"Dupont","prenom":"Alice","classe":"6A"},
                     {"ligne":4,"email":"pas-un-email","nom":"A","prenom":"B","classe":"6B"},
                     {"ligne":5,"email":"m24.sept@demo.saintho.fr","nom":"A","prenom":"B","classe":"6B"}
                   ]'::jsonb) as a) s)
            then 'OK : aucune ligne perdue, aucune comptee deux fois'
            else 'ECHEC : les populations ne partitionnent plus le fichier' end as verdict;

\echo '=== 107. Un eleve ne peut pas regarder l apercu ==='
select set_config('request.jwt.claim.sub', :'BOB', false);
do $$ begin
  perform apercu_import_eleves('[]'::jsonb);
  raise notice 'ECHEC : un eleve a pu lire un fichier d import !';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;
reset role;



-- =====================================================================
-- MIGRATION 25 — presences aux defis, sessions vides, eleves nommes
-- =====================================================================

\echo '=== 108. Le prof cree un defi 6A pour les tests de presence ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select creer_defi('sprint', '{2,3,4}'::smallint[], 20, null, '6A')->>'code' as code_m25 \gset

\echo '=== 109. Avant que personne ne saisisse le code : tout a zero ==='
select case when (avancement_defi((select id from public.defis where code = :'code_m25'))->>'rejoints')::int = 0
             and (avancement_defi((select id from public.defis where code = :'code_m25'))->>'termines')::int = 0
             and (avancement_defi((select id from public.defis where code = :'code_m25'))->>'en_cours')::int = 0
            then 'OK : trois compteurs a zero'
            else 'ECHEC : un compteur bouge sans que personne ait rejoint' end as verdict;

\echo '=== 110. Alice saisit le code : elle a REJOINT, elle n a pas TERMINE ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select (rejoindre_defi(:'code_m25')->>'defi_id') as did25 \gset
select set_config('request.jwt.claim.sub', :'PROF', false);
select jsonb_pretty(avancement_defi(:'did25'::uuid)) as avancement_apres_arrivee;
select case when (avancement_defi(:'did25'::uuid)->>'rejoints')::int = 1
             and (avancement_defi(:'did25'::uuid)->>'termines')::int = 0
             and (avancement_defi(:'did25'::uuid)->>'en_cours')::int = 1
            then 'OK : rejoint 1, termine 0, en cours 1'
            else 'ECHEC : rejoindre et terminer sont confondus' end as verdict;

\echo '=== 111. Alice ressaisit le code : c est la MEME arrivee, pas deux ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select rejoindre_defi(:'code_m25')->>'ok' as deuxieme_saisie;
select set_config('request.jwt.claim.sub', :'PROF', false);
select case when (avancement_defi(:'did25'::uuid)->>'rejoints')::int = 1
            then 'OK : une seule presence par eleve'
            else 'ECHEC : la presence se compte deux fois' end as verdict;

\echo '=== 112. Alice termine : elle sort de en_cours, elle reste dans rejoints ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select terminer_defi(:'did25'::uuid, 17, 55.0, 3, '{}'::jsonb, '{}'::jsonb, 15)->>'ok' as termine;
select set_config('request.jwt.claim.sub', :'PROF', false);
select case when (avancement_defi(:'did25'::uuid)->>'rejoints')::int = 1
             and (avancement_defi(:'did25'::uuid)->>'termines')::int = 1
             and (avancement_defi(:'did25'::uuid)->>'en_cours')::int = 0
            then 'OK : rejoint 1, termine 1, en cours 0'
            else 'ECHEC : en_cours ne retombe pas quand la partie est finie' end as verdict;

\echo '=== 113. Un code refuse ne laisse aucune trace de presence ==='
-- Bob tente un code qui n existe pas, puis rejoint le vrai defi.
select set_config('request.jwt.claim.sub', :'BOB', false);
select rejoindre_defi('ZZZZZ')->>'raison' as refus;
select set_config('request.jwt.claim.sub', :'PROF', false);
select case when (select count(*) from public.defis_presences) =
                 (select count(*) from public.defis_presences)
             and (avancement_defi(:'did25'::uuid)->>'rejoints')::int = 1
            then 'OK : un code inconnu n inscrit personne'
            else 'ECHEC : un refus a laisse une presence' end as verdict;

\echo '=== 114. en_cours est COMPTE, jamais soustrait ==='
-- Un defi anterieur a la migration 25 a des participants et aucune
-- presence. Si en_cours etait `rejoints - termines`, il vaudrait -1.
delete from public.defis_presences where defi_id = :'did25'::uuid;
select case when (avancement_defi(:'did25'::uuid)->>'en_cours')::int = 0
             and (avancement_defi(:'did25'::uuid)->>'termines')::int = 1
            then 'OK : en_cours vaut 0, pas -1'
            else 'ECHEC : en_cours est une soustraction' end as verdict;

\echo '=== 115. Une partie a zero question est refusee ==='
select set_config('request.jwt.claim.sub', :'BOB', false);
select count(*) as sessions_de_bob_avant from public.sessions_jeu
 where eleve_id = (select id from public.eleves where email = 'bob.martin@demo.saintho.fr') \gset bob_
do $$ begin
  perform enregistrer_session('libre', '{2,3}'::smallint[], 0, 0);
  raise notice 'ECHEC : une partie vide a ete enregistree !';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;
select case when (select count(*) from public.sessions_jeu
                   where eleve_id = (select id from public.eleves
                                      where email = 'bob.martin@demo.saintho.fr'))
                 = :bob_sessions_de_bob_avant
            then 'OK : aucune session vide en base'
            else 'ECHEC : la session vide a ete ecrite quand meme' end as verdict;

\echo '=== 116. Une partie a une question passe toujours ==='
do $$ begin
  perform enregistrer_session('libre', '{2,3}'::smallint[], 1, 1);
  raise notice 'OK : une vraie partie passe';
exception when others then raise notice 'ECHEC : une partie normale est refusee (%)', sqlerrm; end $$;

\echo '=== 117. eleves_hors_plafond : la liste a la meme longueur que le compteur ==='
-- Clara (6A) est au plafond 12, les autres 6A a 10. Un defi qui monte
-- a la table 12 laisse donc trois eleves de 6A hors plafond.
select set_config('request.jwt.claim.sub', :'PROF', false);
select prenom, nom, plafond_tables from eleves_hors_plafond('6A', '{12}'::smallint[]);
select case when (select count(*) from eleves_hors_plafond('6A', '{12}'::smallint[]))
                 = (apercu_defi_classe('6A', '{12}'::smallint[])->>'eleves_hors_plafond')::int
            then 'OK : la liste et le compteur comptent la meme population'
            else 'ECHEC : la liste et le compteur divergent' end as verdict;

\echo '=== 118. Un eleve n obtient aucun nom ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select case when (select count(*) from eleves_hors_plafond('6A', '{12}'::smallint[])) = 0
            then 'OK : un eleve ne lit pas la liste de sa classe'
            else 'ECHEC : un eleve lit les plafonds de ses camarades' end as verdict;

\echo '=== 119. Liste et compteur ont EXACTEMENT le meme verrou ==='
-- Rappel de ce que la base fait vraiment : depuis la migration
-- 20260827090000, `prof_voit_classe()` se contente d appeler
-- `est_prof()`. TOUT enseignant voit TOUTES les classes ; le parametre
-- n est conserve que pour ne pas reecrire les politiques RLS. Ce test
-- ne verifie donc pas un cloisonnement qui n existe pas : il verifie
-- que la liste et le compteur repondent la MEME chose au MEME
-- utilisateur, quelle que soit la classe. Le jour ou le cloisonnement
-- reviendra, ce test le suivra sans etre reecrit.
select set_config('request.jwt.claim.sub', :'PROF2', false);
select case when (select count(*) from eleves_hors_plafond('6B', '{12}'::smallint[]))
                 = (apercu_defi_classe('6B', '{12}'::smallint[])->>'eleves_hors_plafond')::int
            then 'OK : meme verrou pour la liste et pour le compteur'
            else 'ECHEC : la liste et le compteur n ont pas le meme verrou' end as verdict;
reset role;

\echo '=== 120. presents_defi : les prenoms, dans l ordre d arrivee ==='
-- La liste doit toujours avoir la longueur du compteur `rejoints`.
select set_config('request.jwt.claim.sub', :'PROF', false);
select creer_defi('sprint', '{2,3}'::smallint[], 20, null, '6A')->>'code' as code_m25b \gset
select set_config('request.jwt.claim.sub', :'ALICE', false);
select (rejoindre_defi(:'code_m25b')->>'defi_id') as did25b \gset
select set_config('request.jwt.claim.sub', :'BOB', false);
select rejoindre_defi(:'code_m25b')->>'ok' as bob_rejoint;
select set_config('request.jwt.claim.sub', :'PROF', false);
select prenom, avatar_emoji, a_termine from presents_defi(:'did25b'::uuid);
select case when (select count(*) from presents_defi(:'did25b'::uuid)) =
                 (avancement_defi(:'did25b'::uuid)->>'rejoints')::int
            then 'OK : la liste des presents a la longueur du compteur'
            else 'ECHEC : la liste et le compteur divergent' end as verdict;

\echo '=== 121. a_termine bascule quand la partie est finie ==='
select case when (select count(*) from presents_defi(:'did25b'::uuid) where a_termine) = 0
            then 'OK : personne n a fini pour l instant'
            else 'ECHEC : a_termine est vrai sans participation' end as verdict;
select set_config('request.jwt.claim.sub', :'ALICE', false);
select terminer_defi(:'did25b'::uuid, 19, 40.0, 1, '{}'::jsonb, '{}'::jsonb, 18)->>'ok' as termine;
select set_config('request.jwt.claim.sub', :'PROF', false);
select case when (select count(*) from presents_defi(:'did25b'::uuid) where a_termine) = 1
             and (select count(*) from presents_defi(:'did25b'::uuid)) = 2
             and (avancement_defi(:'did25b'::uuid)->>'en_cours')::int = 1
            then 'OK : un termine, un en cours, deux presents'
            else 'ECHEC : a_termine et en_cours ne concordent pas' end as verdict;
reset role;



-- =====================================================================
-- MIGRATION 26 — la maitrise devient une regle de temps
-- =====================================================================

\echo '=== 122. Une seule reponse rapide ne suffit pas : orange ==='
select set_config('request.jwt.claim.sub', :'BOB', false);
select enregistrer_session('libre', '{3}'::smallint[], 1, 1, '[]'::jsonb, 3, 0, 0,
         null, '{}'::jsonb, null, 1,
         '[{"fait":"3_4","juste":true,"premier":true,"temps_ms":1200}]'::jsonb)->>'points' as pts;
select case when (select niveau from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='3_4') = 2
             and (select serie_rapide from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='3_4') = 1
            then 'OK : une reussite rapide = orange, serie 1'
            else 'ECHEC : le vert est donne trop tot' end as verdict;

\echo '=== 123. Deux reponses rapides d affilee : vert ==='
select enregistrer_session('libre', '{3}'::smallint[], 1, 1, '[]'::jsonb, 3, 0, 0,
         null, '{}'::jsonb, null, 1,
         '[{"fait":"3_4","juste":true,"premier":true,"temps_ms":900}]'::jsonb)->>'points' as pts;
select case when (select niveau from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='3_4') = 3
            then 'OK : deux reussites rapides = vert'
            else 'ECHEC : le vert ne vient pas' end as verdict;

\echo '=== 124. Une reponse juste mais LENTE fait redescendre en orange ==='
select enregistrer_session('libre', '{3}'::smallint[], 1, 1, '[]'::jsonb, 9, 0, 0,
         null, '{}'::jsonb, null, 1,
         '[{"fait":"3_4","juste":true,"premier":true,"temps_ms":8000}]'::jsonb)->>'points' as pts;
select case when (select niveau from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='3_4') = 2
             and (select serie_rapide from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='3_4') = 0
            then 'OK : lent = orange, serie remise a zero'
            else 'ECHEC : le vert survit a une reponse lente' end as verdict;

\echo '=== 125. Une reponse fausse = rouge, quelle que soit la serie ==='
select enregistrer_session('libre', '{3}'::smallint[], 2, 2, '[]'::jsonb, 3, 0, 0,
         null, '{}'::jsonb, null, 2,
         '[{"fait":"3_5","juste":true,"premier":true,"temps_ms":800},
           {"fait":"3_5","juste":true,"premier":true,"temps_ms":800}]'::jsonb)->>'points' as pts;
select case when (select niveau from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='3_5') = 3
            then 'OK : 3_5 est vert avant le test'
            else 'ECHEC : mise en place ratee' end as verdict;
select enregistrer_session('libre', '{3}'::smallint[], 1, 0, '["3_5"]'::jsonb, 4, 0, 0,
         null, '{}'::jsonb, null, 0,
         '[{"fait":"3_5","juste":false,"premier":false,"temps_ms":4000}]'::jsonb)->>'points' as pts;
select case when (select niveau from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='3_5') = 1
            then 'OK : faux = rouge, meme apres deux reussites'
            else 'ECHEC : une erreur ne fait pas retomber le niveau' end as verdict;

\echo '=== 126. Un rattrapage ne compte pas comme une reussite rapide ==='
select enregistrer_session('libre', '{3}'::smallint[], 2, 2, '[]'::jsonb, 3, 0, 0,
         null, '{}'::jsonb, null, 1,
         '[{"fait":"3_6","juste":true,"premier":false,"temps_ms":500},
           {"fait":"3_6","juste":true,"premier":false,"temps_ms":500}]'::jsonb)->>'points' as pts;
select case when (select niveau from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='3_6') = 2
             and (select serie_rapide from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='3_6') = 0
            then 'OK : rattrape reste orange, meme rapide, meme deux fois'
            else 'ECHEC : un rattrapage rapide fabrique du vert' end as verdict;

\echo '=== 127. L ordre du tableau compte : deux passages dans la meme partie ==='
-- Faux puis deux rapides dans la MEME partie : on finit vert, pas rouge.
-- L ancienne regle gardait « le pire de la session » et aurait dit rouge.
select enregistrer_session('libre', '{3}'::smallint[], 3, 2, '["3_7"]'::jsonb, 5, 0, 0,
         null, '{}'::jsonb, null, 2,
         '[{"fait":"3_7","juste":false,"premier":false,"temps_ms":4000},
           {"fait":"3_7","juste":true,"premier":true,"temps_ms":900},
           {"fait":"3_7","juste":true,"premier":true,"temps_ms":800}]'::jsonb)->>'points' as pts;
select case when (select niveau from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='3_7') = 3
            then 'OK : la serie se lit dans l ordre, l eleve finit vert'
            else 'ECHEC : le resume ecrase la progression de la partie' end as verdict;

\echo '=== 128. Le seuil est a un seul endroit ==='
select case when seuil_reponse_rapide() = 3000
            then 'OK : seuil lisible et unique'
            else 'ECHEC : seuil introuvable ou change' end as verdict;
select enregistrer_session('libre', '{3}'::smallint[], 2, 2, '[]'::jsonb, 6, 0, 0,
         null, '{}'::jsonb, null, 2,
         '[{"fait":"3_8","juste":true,"premier":true,"temps_ms":2999},
           {"fait":"3_8","juste":true,"premier":true,"temps_ms":2999}]'::jsonb)->>'points' as pts;
select enregistrer_session('libre', '{3}'::smallint[], 2, 2, '[]'::jsonb, 6, 0, 0,
         null, '{}'::jsonb, null, 2,
         '[{"fait":"3_9","juste":true,"premier":true,"temps_ms":3000},
           {"fait":"3_9","juste":true,"premier":true,"temps_ms":3000}]'::jsonb)->>'points' as pts;
select case when (select niveau from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='3_8') = 3
             and (select niveau from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='3_9') = 2
            then 'OK : 2999 ms passe, 3000 ms ne passe pas'
            else 'ECHEC : la borne du seuil est fausse' end as verdict;

\echo '=== 129. Un ancien client (p_maitrise seul) fonctionne encore ==='
-- Pendant la periode ou la base est migree et le front pas encore deploye.
select enregistrer_session('libre', '{4}'::smallint[], 1, 1, '[]'::jsonb, 2, 0, 0,
         null, '{"4_4": 3}'::jsonb, null, 1)->>'points' as pts;
select case when (select niveau from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='4_4') = 3
            then 'OK : l ancien format est toujours accepte'
            else 'ECHEC : un front pas encore deploye casserait' end as verdict;
reset role;

\echo '=== 130. UN DEFI passe par terminer_defi : la serie doit avancer ==='
-- Le trou trouve par Antigravity : les cas 122 a 129 appellent tous
-- enregistrer_session DIRECTEMENT. Un defi ne prend pas ce chemin.
select set_config('request.jwt.claim.sub', :'PROF', false);
select creer_defi('sprint', '{5}'::smallint[], 20, null, '6A')->>'code' as code_m26 \gset
select set_config('request.jwt.claim.sub', :'BOB', false);
select (rejoindre_defi(:'code_m26')->>'defi_id') as did26 \gset
select terminer_defi(:'did26'::uuid, 2, 4.0, 0, '{}'::jsonb, '{}'::jsonb, 2,
         '[{"fait":"5_6","juste":true,"premier":true,"temps_ms":900},
           {"fait":"5_6","juste":true,"premier":true,"temps_ms":800}]'::jsonb)->>'ok' as termine;
select case when (select niveau from public.maitrise
                   where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                     and fait='5_6') = 3
            then 'OK : un defi alimente la maitrise et fait passer au vert'
            else 'ECHEC : terminer_defi ne relaie pas p_faits' end as verdict;

\echo '=== 131. Un defi SANS p_faits n enregistre plus rien de faux ==='
-- Une fois construireMaitrise() retiree du front, p_maitrise vaut {}.
-- Le fait ne doit pas exister, mais rien ne doit planter non plus.
select set_config('request.jwt.claim.sub', :'PROF', false);
select creer_defi('sprint', '{5}'::smallint[], 20, null, '6A')->>'code' as code_m26b \gset
select set_config('request.jwt.claim.sub', :'ALICE', false);
select (rejoindre_defi(:'code_m26b')->>'defi_id') as did26b \gset
select terminer_defi(:'did26b'::uuid, 1, 3.0, 0, '{}'::jsonb, '{}'::jsonb, 1)->>'ok' as termine_sans_faits;
select case when (select count(*) from public.maitrise
                   where eleve_id = (select id from public.eleves where email='alice.dupont@demo.saintho.fr')
                     and fait='5_11') = 0
            then 'OK : sans p_faits, aucune maitrise inventee'
            else 'ECHEC : une maitrise apparait sans donnee' end as verdict;

\echo '=== 132. terminer_defi n a qu une seule signature ==='
-- Sans le drop, PostgreSQL en garderait deux et refuserait tout appel
-- par noms d arguments — ce que fait rpc() dans toute l application.
select case when (select count(*) from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='terminer_defi') = 1
             and (select count(*) from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='enregistrer_session') = 1
            then 'OK : une seule signature pour chacune'
            else 'ECHEC : signature en double, les appels par noms echouent' end as verdict;
reset role;



-- =====================================================================
-- MIGRATION 27 — la grille de l'eleve bouge apres sa partie
-- =====================================================================

\echo '=== 133. enregistrer_session renvoie le niveau des faits touches ==='
select set_config('request.jwt.claim.sub', :'BOB', false);
select jsonb_pretty(enregistrer_session('libre', '{6}'::smallint[], 2, 2, '[]'::jsonb, 3, 0, 0,
         null, '{}'::jsonb, null, 2,
         '[{"fait":"6_7","juste":true,"premier":true,"temps_ms":900},
           {"fait":"6_7","juste":true,"premier":true,"temps_ms":800}]'::jsonb)->'maitrise') as maitrise_renvoyee;
select case when (enregistrer_session('libre', '{6}'::smallint[], 1, 1, '[]'::jsonb, 2, 0, 0,
                    null, '{}'::jsonb, null, 1,
                    '[{"fait":"6_8","juste":true,"premier":true,"temps_ms":700}]'::jsonb)
                  ->'maitrise'->>'6_8')::int = 2
            then 'OK : le niveau du fait touche revient a l ecran'
            else 'ECHEC : l ecran n a rien pour mettre sa grille a jour' end as verdict;

\echo '=== 134. Seuls les faits TOUCHES reviennent, pas toute la grille ==='
select case when (select count(*) from jsonb_object_keys(
                    enregistrer_session('libre', '{6}'::smallint[], 1, 1, '[]'::jsonb, 2, 0, 0,
                      null, '{}'::jsonb, null, 1,
                      '[{"fait":"6_9","juste":true,"premier":true,"temps_ms":700}]'::jsonb)
                    ->'maitrise')) = 1
            then 'OK : une partie sur un fait renvoie un fait'
            else 'ECHEC : la reponse charrie toute la grille' end as verdict;

\echo '=== 135. Le niveau renvoye est celui qui est EN BASE ==='
-- Le meme chiffre des deux cotes : si l ecran et la base divergeaient,
-- l eleve verrait une couleur qui change au rechargement.
select (enregistrer_session('libre', '{6}'::smallint[], 1, 1, '[]'::jsonb, 2, 0, 0,
          null, '{}'::jsonb, null, 1,
          '[{"fait":"6_9","juste":true,"premier":true,"temps_ms":700}]'::jsonb)
        ->'maitrise'->>'6_9')::int as renvoye \gset
select case when :renvoye = (select niveau from public.maitrise
                              where eleve_id = (select id from public.eleves where email='bob.martin@demo.saintho.fr')
                                and fait='6_9')
            then 'OK : meme niveau a l ecran et en base'
            else 'ECHEC : l ecran affichera autre chose que la base' end as verdict;

\echo '=== 136. Un defi renvoie aussi la maitrise mise a jour ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select creer_defi('sprint', '{7}'::smallint[], 20, null, '6A')->>'code' as code_m27 \gset
select set_config('request.jwt.claim.sub', :'BOB', false);
select (rejoindre_defi(:'code_m27')->>'defi_id') as did27 \gset
select case when (terminer_defi(:'did27'::uuid, 2, 4.0, 0, '{}'::jsonb, '{}'::jsonb, 2,
                    '[{"fait":"7_7","juste":true,"premier":true,"temps_ms":900},
                      {"fait":"7_7","juste":true,"premier":true,"temps_ms":800}]'::jsonb)
                  ->'maitrise'->>'7_7')::int = 3
            then 'OK : la grille bouge aussi apres un defi'
            else 'ECHEC : un eleve qui ne joue que des defis a une grille figee' end as verdict;

\echo '=== 137. Un ancien client recoit une cle maitrise vide, pas une erreur ==='
select set_config('request.jwt.claim.sub', :'BOB', false);
select case when enregistrer_session('libre', '{8}'::smallint[], 1, 1, '[]'::jsonb, 2, 0, 0,
                    null, '{"8_8": 3}'::jsonb, null, 1)
                  ->'maitrise'->>'8_8' = '3'
            then 'OK : l ancien format renvoie aussi son fait'
            else 'ECHEC : ancien client sans retour de maitrise' end as verdict;
reset role;



-- =====================================================================
-- MIGRATION 28 — nommer les populations, rendre sa place a l eleve
-- =====================================================================

\echo '=== 138. ma_place_progression donne mon rang meme hors des N premiers ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select rang, points, classes_total, rang_au_dessus, points_au_dessus, ecart_au_dessus
  from ma_place_progression('tout', 'college', 'tous');
select case when (select count(*) from ma_place_progression('tout', 'college', 'tous')) = 1
            then 'OK : une ligne, la mienne'
            else 'ECHEC : l eleve n a pas sa place' end as verdict;

\echo '=== 139. Le rang est le MEME que celui du classement affiche ==='
-- Deux calculs separes du meme classement finiraient par diverger d une
-- place, et l eleve verrait deux rangs sur le meme ecran.
select case when (select rang from ma_place_progression('tout', 'college', 'tous'))
                 = (select rang from classement_progression('tout', 'college', 'tous', 100)
                     where est_moi)
            then 'OK : un seul rang pour un seul eleve'
            else 'ECHEC : deux rangs differents sur le meme ecran' end as verdict;

\echo '=== 140. L ecart est calcule par le serveur, et il est coherent ==='
select case when (select coalesce(ecart_au_dessus, 0) >= 0
                    from ma_place_progression('tout', 'college', 'tous'))
            then 'OK : ecart positif ou nul'
            else 'ECHEC : ecart negatif, le tri est faux' end as verdict;
select case when (select ecart_au_dessus is null
                    from ma_place_progression('tout', 'college', 'tous')
                   where rang = 1) is not false
            then 'OK : le premier n a personne au-dessus'
            else 'ECHEC : le premier a un ecart' end as verdict;

\echo '=== 141. Un eleve qui n a pas joue sur la periode n obtient aucun rang ==='
-- L ecran doit afficher son etat vide, pas un rang invente.
select set_config('request.jwt.claim.sub', :'BOB', false);
select case when (select count(*) from ma_place_progression('jour', 'college', 'tous'))
                 = (select count(*) from classement_progression('jour', 'college', 'tous', 100)
                     where est_moi)
            then 'OK : present au classement ou absent des deux'
            else 'ECHEC : un rang sans partie, ou une partie sans rang' end as verdict;

\echo '=== 142. classement_classes : les trois populations sont nommees ==='
select rang, classe, ont_joue, inscrits, points_par_inscrit, est_ma_classe
  from classement_classes('tout');
select case when (select bool_and(ont_joue <= inscrits) from classement_classes('tout'))
            then 'OK : ont_joue est un sous-ensemble des inscrits'
            else 'ECHEC : plus de joueurs que d inscrits' end as verdict;

\echo '=== 143. points_par_inscrit divise bien par les INSCRITS ==='
-- Le nom doit dire le calcul. Si un jour on divisait par ont_joue, ce
-- test tomberait — c est exactement son role.
select case when (select bool_and(
                    points_par_inscrit <= greatest(points_par_inscrit, 0))
                   from classement_classes('tout'))
             and (select count(*) from classement_classes('tout')) > 0
            then 'OK : le classement se calcule'
            else 'ECHEC : classement vide' end as verdict;

\echo '=== 144. entete_classe : deux populations, et ont_joue est un sous-ensemble ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select jsonb_pretty(entete_classe('6A', 'tout')) as entete;
select case when (entete_classe('6A', 'tout')->>'ont_joue')::int
                 <= (entete_classe('6A', 'tout')->>'inscrits')::int
             and (entete_classe('6A', 'tout')->>'inscrits')::int > 0
            then 'OK : ont_joue tient dans inscrits'
            else 'ECHEC : populations incoherentes' end as verdict;

\echo '=== 145. entete_classe : le plafond commun est le plus BAS de la classe ==='
select case when (entete_classe('6A', 'tout')->>'plafond_commun')::int
                 = (select min(plafond_tables) from public.eleves
                     where classe = '6A' and actif)
             and (entete_classe('6A', 'tout')->>'plafond_max')::int
                 = (select max(plafond_tables) from public.eleves
                     where classe = '6A' and actif)
            then 'OK : le point de repere est le bon'
            else 'ECHEC : plafond commun faux' end as verdict;

\echo '=== 146. Un eleve n obtient pas l en-tete d une classe ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select case when (entete_classe('6A', 'tout')->>'inscrits')::int = 0
            then 'OK : un eleve ne lit pas le pilotage de sa classe'
            else 'ECHEC : un eleve lit l ecran du professeur' end as verdict;
reset role;



-- =====================================================================
-- MIGRATION 29 — la salle des profs, l avatar des enseignants
-- =====================================================================

\echo '=== 147. initiales_de : deux lettres au plus, et rien sur un nom vide ==='
select case when initiales_de('Aymeri Desjardins') = 'AD'
             and initiales_de('Dupont') = 'D'
             and initiales_de('Jean Marie De La Tour') = 'JM'
             and initiales_de('  ') is null
             and initiales_de(null) is null
            then 'OK : les initiales sont calculees a un seul endroit'
            else 'ECHEC : decoupage de nom faux' end as verdict;

\echo '=== 148. Un enseignant choisit son emoji, et peut revenir aux initiales ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select changer_avatar_prof('🦊')->>'ok' as pose;
select case when (select avatar_emoji from public.profs
                   where user_id = :'PROF') = '🦊'
            then 'OK : l emoji est enregistre'
            else 'ECHEC : l avatar ne se pose pas' end as verdict;
select changer_avatar_prof(null)->>'ok' as retire;
select case when (select avatar_emoji from public.profs
                   where user_id = :'PROF') is null
            then 'OK : null remet les initiales, ce n est pas un trou'
            else 'ECHEC : impossible de revenir aux initiales' end as verdict;
select changer_avatar_prof('🦊')->>'ok' as repose;

\echo '=== 149. Un enseignant ne peut PAS se nommer administrateur ==='
-- La raison pour laquelle changer_avatar_prof passe par une fonction et
-- non par une politique RLS d UPDATE : une politique ouvrirait la LIGNE
-- entiere, role compris.
-- ATTENTION : ce test n a de sens que sous `set role authenticated`. En
-- superutilisateur, PostgreSQL ignore RLS et l UPDATE passe toujours —
-- c est ce qui m a fait croire une premiere fois a un trou de securite.
select set_config('request.jwt.claim.sub', :'PROF2', false);
reset role; set role authenticated;
do $$ begin
  update public.profs set role = 'admin'
   where user_id = '44444444-4444-4444-4444-444444444444';
exception when others then raise notice 'refus a l ecriture : %', sqlerrm; end $$;
reset role;
select case when (select role from public.profs
                   where user_id = '44444444-4444-4444-4444-444444444444') = 'prof'
            then 'OK : le role n a pas bouge'
            else 'ECHEC : un prof s est nomme admin' end as verdict;

\echo '=== 150. Un texte qui n est pas un emoji est refuse ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
do $$ begin
  perform changer_avatar_prof('Professeur de mathematiques');
  raise notice 'ECHEC : du texte libre est passe !';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;

\echo '=== 151. classement_profs : les six colonnes du contrat, puis les ajouts ==='
select rang, nom_affiche, classe, avatar, valeur, parties, est_moi,
       initiales, role, points, meilleur_sprint
  from classement_profs('points', 'tout', 10);
select case when (select bool_and(classe is null) from classement_profs('points','tout',10))
             and (select bool_and(initiales is not null) from classement_profs('points','tout',10))
            then 'OK : classe null, initiales toujours presentes'
            else 'ECHEC : contrat de colonnes casse' end as verdict;

\echo '=== 152. points et meilleur_sprint sont la QUELLE QUE SOIT la categorie ==='
-- La maquette 32 affiche Points ET Sprint sur la meme ligne, en un appel.
-- On compare pour les collegues presents dans LES DEUX tris : trier sur
-- le sprint exclut ceux qui n en ont jamais fait, et c est voulu.
select case when not exists (
                 select 1
                   from classement_profs('points','tout',100) a
                   join classement_profs('serie','tout',100) b
                     on b.nom_affiche = a.nom_affiche
                  where a.points is distinct from b.points)
            then 'OK : les points ne dependent pas du tri'
            else 'ECHEC : deux valeurs de points selon le tri' end as verdict;

\echo '=== 153. L avatar suit le choix du collegue ==='
select case when (select avatar from classement_profs('points','tout',10) where est_moi) = '🦊'
            then 'OK : l emoji choisi apparait au classement'
            else 'ECHEC : l avatar ne remonte pas' end as verdict;

\echo '=== 154. entete_salle_des_profs : deux populations, ont_joue dedans ==='
select jsonb_pretty(entete_salle_des_profs('tout')) as entete;
select case when (entete_salle_des_profs('tout')->>'ont_joue')::int
                 <= (entete_salle_des_profs('tout')->>'inscrits')::int
             and (entete_salle_des_profs('tout')->>'inscrits')::int > 0
            then 'OK : ont_joue tient dans inscrits'
            else 'ECHEC : populations incoherentes' end as verdict;
select case when (entete_salle_des_profs('tout')->>'ont_joue')::int
                 = (select count(*) from classement_profs('points','tout',100))
            then 'OK : ont_joue egale le nombre de lignes du classement'
            else 'ECHEC : l en-tete et le classement se contredisent' end as verdict;

\echo '=== 155. Un eleve ne lit pas la salle des profs ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select case when (select count(*) from classement_profs('points','tout',100)) = 0
             and (entete_salle_des_profs('tout')->>'inscrits')::int = 0
            then 'OK : rien pour un eleve, des deux cotes'
            else 'ECHEC : un eleve lit la salle des profs' end as verdict;

\echo '=== 156. mes_defis : rejoints a cote de participants ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select creer_defi('sprint', '{2}'::smallint[], 20, null, '6A')->>'code' as code_m29 \gset
select set_config('request.jwt.claim.sub', :'BOB', false);
select (rejoindre_defi(:'code_m29')->>'defi_id') as did29 \gset
select set_config('request.jwt.claim.sub', :'PROF', false);
select code, je_suis_createur, j_ai_joue, mon_score, rejoints, participants
  from mes_defis() where code = :'code_m29';
select case when (select rejoints from mes_defis() where code = :'code_m29') = 1
             and (select participants from mes_defis() where code = :'code_m29') = 0
            then 'OK : a rejoint sans avoir termine'
            else 'ECHEC : rejoindre et terminer sont confondus' end as verdict;

\echo '=== 157. participants garde son sens : ceux qui ont TERMINE ==='
select set_config('request.jwt.claim.sub', :'BOB', false);
select terminer_defi(:'did29'::uuid, 2, 5.0, 0, '{}'::jsonb, '{}'::jsonb, 2,
         '[{"fait":"2_3","juste":true,"premier":true,"temps_ms":800},
           {"fait":"2_4","juste":true,"premier":true,"temps_ms":900}]'::jsonb)->>'ok' as fini;
select set_config('request.jwt.claim.sub', :'PROF', false);
select case when (select rejoints from mes_defis() where code = :'code_m29') = 1
             and (select participants from mes_defis() where code = :'code_m29') = 1
            then 'OK : rejoints inchange, participants passe a 1'
            else 'ECHEC : les deux compteurs ne suivent pas' end as verdict;

\echo '=== 158. mon_profil_prof : avatar, initiales et les chiffres du mois ==='
select jsonb_pretty(mon_profil_prof()->'profil') as profil_prof;
select case when mon_profil_prof()->'profil'->>'initiales' = 'MD'
             and mon_profil_prof()->'profil'->>'avatar_emoji' = '🦊'
             and (mon_profil_prof()->'records'->>'points_mois') is not null
             and (mon_profil_prof()->'records'->>'parties_mois') is not null
             and (mon_profil_prof()->'records'->>'sprint_mois') is not null
            then 'OK : le profil enseignant a de quoi remplir la maquette 30'
            else 'ECHEC : il manque de quoi afficher le profil' end as verdict;
reset role;



-- =====================================================================
-- MIGRATION 30 — profil eleve complet, et ma place aux records
-- =====================================================================

\echo '=== 159. mon_profil : le sprint et les jours d entrainement ==='
select set_config('request.jwt.claim.sub', :'ALICE', false);
select jsonb_pretty(mon_profil()->'records') as records_eleve;
select case when (mon_profil()->'records'->>'meilleur_sprint') is not null
             and (mon_profil()->'records'->>'jours_actifs') is not null
            then 'OK : la maquette 29 a de quoi remplir ses tuiles'
            else 'ECHEC : il manque le sprint ou les jours' end as verdict;

\echo '=== 160. jours_actifs et jours_actifs_7j sont DEUX populations ==='
-- Le total ne peut pas etre inferieur a la fenetre de sept jours.
select case when (mon_profil()->'records'->>'jours_actifs')::int
                 >= (mon_profil()->'records'->>'jours_actifs_7j')::int
            then 'OK : le total contient la fenetre glissante'
            else 'ECHEC : les deux compteurs se contredisent' end as verdict;

\echo '=== 161. plafond_atteint_le est DEDUIT, jamais invente ==='
-- La date doit etre EXACTEMENT celle de la premiere partie de Montee
-- ayant produit le plafond actuel. Si elle en differait, c est qu elle
-- viendrait d ailleurs — et personne ne saurait d ou.
select case when (mon_profil()->'profil'->>'plafond_atteint_le')::timestamptz
                 = (select min(s.cree_le) from public.sessions_jeu s
                     join public.eleves e on e.id = s.eleve_id
                    where e.email = 'alice.dupont@demo.saintho.fr'
                      and s.mode = 'climb'
                      and coalesce(s.plus_haute_table, 0) + 1 >= e.plafond_tables)
            then 'OK : la date vient d une vraie partie de Montee'
            else 'ECHEC : date inventee ou mal deduite' end as verdict;

\echo '=== 162. Sans partie de Montee au niveau du plafond, aucune date ==='
-- Un eleve encore au plafond de depart n a rien debloque : l ecran
-- n ecrit alors aucune date, il n en invente pas une.
do $$ declare v uuid; begin
  select id into v from public.eleves where email = 'hugo.lambert@demo.saintho.fr';
  delete from public.sessions_jeu where eleve_id = v and mode = 'climb';
end $$;
select set_config('request.jwt.claim.sub',
  (select user_id::text from public.eleves where email = 'hugo.lambert@demo.saintho.fr'), false);
select case when (mon_profil()->'profil'->>'plafond_atteint_le') is null
            then 'OK : pas de Montee, pas de date'
            else 'ECHEC : une date sortie de nulle part' end as verdict;
select set_config('request.jwt.claim.sub', :'ALICE', false);

\echo '=== 163. ma_place_records : mon rang meme hors des N premiers ==='
select rang, valeur, classes_total, rang_au_dessus, valeur_au_dessus, ecart_au_dessus
  from ma_place_records('serie', 'tout', 'college', 'tous');
select case when (select count(*) from ma_place_records('serie','tout','college','tous')) <= 1
            then 'OK : une ligne au plus, la mienne'
            else 'ECHEC : plusieurs lignes pour un seul eleve' end as verdict;

\echo '=== 164. Le rang est le MEME que celui du classement affiche ==='
select case when (select rang from ma_place_records('serie','tout','college','tous'))
                 is not distinct from
                 (select rang from classement_records('serie','tout','college','tous',100)
                   where est_moi)
            then 'OK : un seul rang pour un seul eleve'
            else 'ECHEC : deux rangs differents sur le meme ecran' end as verdict;

\echo '=== 165. L ecart est TOUJOURS positif, sprint compris ==='
-- Pour le sprint la meilleure valeur est la plus PETITE : un ecran qui
-- soustrairait lui-meme afficherait un nombre negatif une fois sur deux.
select case when (select coalesce(bool_and(ecart_au_dessus >= 0), true)
                    from ma_place_records('sprint','tout','college','tous'))
             and (select coalesce(bool_and(ecart_au_dessus >= 0), true)
                    from ma_place_records('serie','tout','college','tous'))
             and (select coalesce(bool_and(ecart_au_dessus >= 0), true)
                    from ma_place_records('montee','tout','college','tous'))
            then 'OK : ecart positif dans les deux sens de tri'
            else 'ECHEC : ecart negatif, l ecran afficherait un moins' end as verdict;

\echo '=== 166. Le premier n a personne au-dessus ==='
select case when (select coalesce(bool_and(ecart_au_dessus is null), true)
                    from ma_place_records('serie','tout','college','tous')
                   where rang = 1)
            then 'OK : pas d ecart pour le premier'
            else 'ECHEC : le premier a un ecart' end as verdict;

\echo '=== 167. Aucun record dans la categorie : aucune ligne ==='
-- L ecran affiche son etat vide, il n invente pas un rang.
select set_config('request.jwt.claim.sub', :'BOB', false);
select case when (select count(*) from ma_place_records('chrono','jour','college','tous'))
                 = (select count(*) from classement_records('chrono','jour','college','tous',100)
                     where est_moi)
            then 'OK : present aux deux, ou absent des deux'
            else 'ECHEC : un rang sans record, ou un record sans rang' end as verdict;
reset role;



-- =====================================================================
-- MIGRATION 31 — un eleve revoit les defis qu il a JOUES
-- =====================================================================

\echo '=== 168. Un eleve voit le defi de son PROFESSEUR auquel il a joue ==='
-- Le trou : jusqu ici mes_defis ne montrait que les defis qu on a crees.
-- Un eleve jouait le defi de son prof et n avait aucun chemin de retour.
select set_config('request.jwt.claim.sub', :'PROF', false);
select creer_defi('sprint', '{2,3}'::smallint[], 20, null, '6A')->>'code' as code_m31 \gset
select set_config('request.jwt.claim.sub', :'ALICE', false);
select (rejoindre_defi(:'code_m31')->>'defi_id') as did31 \gset
select case when (select count(*) from mes_defis() where code = :'code_m31') = 0
            then 'OK : avant de terminer, il n est pas encore dans sa liste'
            else 'ECHEC : un defi seulement rejoint apparait deja' end as verdict;
select terminer_defi(:'did31'::uuid, 12, 30.0, 2, '{}'::jsonb, '{}'::jsonb, 10,
         '[{"fait":"2_5","juste":true,"premier":true,"temps_ms":800}]'::jsonb)->>'ok' as fini;
select code, je_suis_createur, j_ai_joue, mon_score, mon_temps_s
  from mes_defis() where code = :'code_m31';
select case when (select count(*) from mes_defis() where code = :'code_m31') = 1
             and (select j_ai_joue from mes_defis() where code = :'code_m31')
             and not (select je_suis_createur from mes_defis() where code = :'code_m31')
             and (select mon_score from mes_defis() where code = :'code_m31') = 12
            then 'OK : le defi joue revient, avec mon score'
            else 'ECHEC : l eleve n a toujours aucun chemin de retour' end as verdict;

\echo '=== 169. Deux faits distincts : cree ET joue ==='
-- Un eleve peut creer un defi et y jouer. Un « role » unique aurait
-- force l ecran a en choisir un, donc a mentir une fois sur deux.
select set_config('request.jwt.claim.sub', :'ALICE', false);
select creer_defi('sprint', '{2}'::smallint[], 20)->>'code' as code_m31b \gset
select (rejoindre_defi(:'code_m31b')->>'defi_id') as did31b \gset
select terminer_defi(:'did31b'::uuid, 9, 25.0, 1, '{}'::jsonb, '{}'::jsonb, 8,
         '[{"fait":"2_6","juste":true,"premier":true,"temps_ms":700}]'::jsonb)->>'ok' as fini;
select case when (select je_suis_createur from mes_defis() where code = :'code_m31b')
             and (select j_ai_joue from mes_defis() where code = :'code_m31b')
            then 'OK : les deux faits sont vrais en meme temps'
            else 'ECHEC : un role unique ecrase l un des deux' end as verdict;

\echo '=== 170. Un defi que je n ai ni cree ni joue ne m appartient pas ==='
select set_config('request.jwt.claim.sub', :'BOB', false);
select case when (select count(*) from mes_defis() where code = :'code_m31') = 0
            then 'OK : la liste ne montre que ce qui me concerne'
            else 'ECHEC : la liste deborde sur les defis des autres' end as verdict;

\echo '=== 171. mon_score est null quand je n ai pas joue ==='
-- Le professeur a cree le defi sans y jouer : son score doit etre vide,
-- pas zero. Zero voudrait dire « il a joue et fait zero ».
select set_config('request.jwt.claim.sub', :'PROF', false);
select case when (select mon_score from mes_defis() where code = :'code_m31') is null
             and (select j_ai_joue from mes_defis() where code = :'code_m31') = false
             and (select je_suis_createur from mes_defis() where code = :'code_m31')
            then 'OK : pas joue = null, jamais zero'
            else 'ECHEC : un score de zero invente pour le createur' end as verdict;

\echo '=== 172. Les compteurs de population n ont pas change de sens ==='
select case when (select participants from mes_defis() where code = :'code_m31') = 1
             and (select rejoints from mes_defis() where code = :'code_m31') = 1
            then 'OK : rejoints et participants intacts'
            else 'ECHEC : la migration 31 a decale les compteurs' end as verdict;
reset role;



-- =====================================================================
-- MIGRATION 32 — mes_defis renvoie la duree et le nombre de questions
-- =====================================================================

\echo '=== 173. Un Contre-la-montre de 30 s renvoie bien 30, pas « chrono » ==='
select set_config('request.jwt.claim.sub', :'PROF', false);
select creer_defi('countdown', '{2,3}'::smallint[], 20, 30, '6A')->>'code' as code_m32 \gset
select code, type, nb_questions, duree_s from mes_defis() where code = :'code_m32';
select case when (select duree_s from mes_defis() where code = :'code_m32') = 30
            then 'OK : la duree reelle remonte a l ecran'
            else 'ECHEC : l ecran ne peut toujours pas dire la duree' end as verdict;

\echo '=== 174. Un Sprint de 15 questions ne doit pas afficher 20 ==='
select creer_defi('sprint', '{4,5}'::smallint[], 15, null, '6A')->>'code' as code_m32b \gset
select case when (select nb_questions from mes_defis() where code = :'code_m32b') = 15
             and (select duree_s from mes_defis() where code = :'code_m32b') is null
            then 'OK : 15 questions, et pas de duree hors Contre-la-montre'
            else 'ECHEC : le nombre de questions est fantaisiste' end as verdict;

\echo '=== 176. nb_questions est NULL sur un Contre-la-montre ==='
-- `creer_defi` fige 120 questions en reserve pour un chrono : personne
-- n en fait 120 en 30 secondes. Renvoyer ce nombre invitait l ecran a
-- afficher « 120 questions » sur une partie de 30 secondes.
select case when (select nb_questions from mes_defis() where code = :'code_m32') is null
             and (select duree_s from mes_defis() where code = :'code_m32') = 30
            then 'OK : chaque mode recoit le chiffre qui le decrit'
            else 'ECHEC : une reserve de 120 questions remonte a l ecran' end as verdict;

\echo '=== 175. mon_score est un NOMBRE DE BONNES REPONSES, pas des points ==='
-- Le piege : l ecran affichait « {mon_score} pts ». Un eleve avec 6
-- bonnes reponses gagne 40 points — lui annoncer « 6 pts » est faux.
select set_config('request.jwt.claim.sub', :'ALICE', false);
select (rejoindre_defi(:'code_m32')->>'defi_id') as did32 \gset
select terminer_defi(:'did32'::uuid, 6, 30.0, 1, '{}'::jsonb, '{}'::jsonb, 5,
         '[{"fait":"2_7","juste":true,"premier":true,"temps_ms":900}]'::jsonb)->>'ok' as fini;
select case when (select mon_score from mes_defis() where code = :'code_m32') = 6
             and (select points from public.sessions_jeu s
                    join public.eleves e on e.id = s.eleve_id
                   where e.prenom = 'Alice'
                     and s.defi_id = :'did32'::uuid) <> 6
            then 'OK : le score et les points sont deux nombres differents'
            else 'ECHEC : score et points confondus' end as verdict;
reset role;

-- ---------------------------------------------------------------------
-- MIGRATION 34 — le reveil quotidien de la base
-- ---------------------------------------------------------------------

\echo '=== 177. ping() repond « ok » a un visiteur non connecte ==='
-- Sans cette fonction, le reveil devrait s authentifier ; avec elle, un
-- simple appel HTTP quotidien suffit a empecher la mise en veille.
set role anon;
select case when public.ping() = 'ok'
            then 'OK : la base repond au reveil'
            else 'ECHEC : le reveil quotidien ne repondra pas' end as verdict;
reset role;

\echo '=== 178. ping() n ouvre AUCUNE autre porte a anon ==='
-- C est la seule fonction accessible sans compte. On verifie qu elle
-- n a pas ete accompagnee d un droit de lecture sur les tables.
select case when has_table_privilege('anon', 'public.eleves', 'select')
             or has_table_privilege('anon', 'public.sessions_jeu', 'select')
             or has_table_privilege('anon', 'public.maitrise', 'select')
            then 'ECHEC : anon peut lire une table'
            else 'OK : anon ne peut toujours rien lire en direct' end as verdict;

\echo '=== 179. ping() ne divulgue rien, base pleine ou base vide ==='
-- Elle compte les eleves puis jette le compte. Le mot renvoye ne doit
-- pas varier avec l effectif, sans quoi la cle publique laisserait
-- suivre les inscriptions du college.
select case when public.ping() = 'ok'
             and (select count(*) from public.eleves) > 0
            then 'OK : meme reponse quel que soit l effectif'
            else 'ECHEC : la reponse depend des donnees' end as verdict;

-- ---------------------------------------------------------------------
-- MIGRATION 35 — la fiche eleve se corrige vraiment
-- ---------------------------------------------------------------------

\echo '=== 180. Un prof NON admin modifie VRAIMENT une fiche ==='
-- Le defaut corrige : le declencheur `eleves_protection` remettait les
-- anciennes valeurs pour tout appelant non administrateur, alors que
-- `modifier_eleve` renvoyait {"ok": true}. Une professeure corrigeait une
-- coquille, l application lui disait que c etait fait, et rien ne bougeait.
set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF2', false);
select id as bob_id from eleves where email='bob.martin@demo.saintho.fr' \gset
select modifier_eleve(:'bob_id'::uuid, p_prenom=>'Bobby')->>'ok' as retour;
select case when public.est_admin() = false
             and (select prenom from eleves where id = :'bob_id'::uuid) = 'Bobby'
            then 'OK : un prof non admin modifie pour de vrai'
            else 'ECHEC : modification annulee en silence' end as verdict;
select modifier_eleve(:'bob_id'::uuid, p_prenom=>'Bob')->>'ok' as remise_en_etat;

\echo '=== 180b. ... mais il ne touche PAS a l adresse ==='
-- Un prof ne peut pas renommer une adresse dans la console Google : la
-- changer ici seulement ne corrigerait rien, elle fabriquerait un
-- desaccord entre les deux cotes. Et tant qu un eleve ne s est jamais
-- connecte, son adresse est sa porte d entree.
do $$ declare v uuid; begin
  select id into v from eleves where email='bob.martin@demo.saintho.fr';
  perform modifier_eleve(v, p_email=>'bob.autre@demo.saintho.fr');
  raise notice 'ECHEC : un prof non admin a change une adresse !';
exception when others then raise notice 'OK : refuse (%)', sqlerrm; end $$;
select case when (select email from eleves where id = :'bob_id'::uuid)
                 = 'bob.martin@demo.saintho.fr'
            then 'OK : l adresse est restee celle d origine'
            else 'ECHEC : l adresse a change malgre le refus' end as verdict;

\echo '=== 181. Un ELEVE ne peut toujours pas se changer de classe ==='
-- La raison d etre du declencheur. Elle ne doit pas avoir bouge.
select set_config('request.jwt.claim.sub', :'BOB', false);
update public.eleves set classe = '3A', email = 'pirate@demo.saintho.fr'
 where id = :'bob_id'::uuid;
select case when (select classe from eleves where id = :'bob_id'::uuid) = '6A'
             and (select email  from eleves where id = :'bob_id'::uuid)
                 = 'bob.martin@demo.saintho.fr'
            then 'OK : l eleve reste a sa place'
            else 'ECHEC : un eleve a change sa classe ou son adresse' end as verdict;

\echo '=== 182. Fiche non rattachee + compte deja existant : on rattache ==='
-- Cas reel : l eleve s est connecte avant qu on corrige son adresse.
select set_config('request.jwt.claim.sub', :'PROF', false);
select (ajouter_eleve('faute.de.frappe@demo.saintho.fr','Frappe','Leo','6A')
        ->>'eleve_id')::uuid as leo_id \gset
reset role;
insert into auth.users (id, email)
values ('66666666-6666-6666-6666-666666666666','leo.frappe@demo.saintho.fr');
set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF', false);
select modifier_eleve(:'leo_id'::uuid, p_email=>'leo.frappe@demo.saintho.fr')
       ->>'rattache' as rattache;
select case when (select user_id from eleves where id = :'leo_id'::uuid)
                 = '66666666-6666-6666-6666-666666666666'::uuid
            then 'OK : la fiche corrigee retrouve son compte Google'
            else 'ECHEC : fiche orpheline apres correction' end as verdict;
reset role;

-- ---------------------------------------------------------------------
-- MIGRATION 36 — « jamais connecte » dit la verite
-- ---------------------------------------------------------------------

\echo '=== 183. Chaque partie met a jour la date d activite ==='
-- Avant, `derniere_connexion` n etait ecrite qu UNE fois dans une vie,
-- au premier rattachement. Un eleve jouant tous les jours affichait
-- encore la date de septembre.
set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF', false);
select id as act_id, derniere_connexion as act_avant
  from eleves where email='alice.dupont@demo.saintho.fr' \gset
reset role;
update public.eleves set derniere_connexion = timestamptz '2026-01-01'
 where id = :'act_id'::uuid;
set role authenticated;
select set_config('request.jwt.claim.sub', :'ALICE', false);
select enregistrer_session(
  p_mode => 'libre', p_tables => '{2}'::smallint[],
  p_nb_questions => 5, p_score => 5, p_duree_s => 30) is not null as partie_enregistree;
select set_config('request.jwt.claim.sub', :'PROF', false);
select case when (select derniere_connexion from eleves where id = :'act_id'::uuid)
                 > timestamptz '2026-06-01'
            then 'OK : la date suit les parties'
            else 'ECHEC : la date est restee celle du rattachement' end as verdict;

\echo '=== 184. Un compte Google supprime ne fait pas « jamais connecte » ==='
-- `eleves.user_id` est `on delete set null` : les comptes des partants
-- sont supprimes en juillet, les fiches restent actives jusqu a l import
-- de septembre. Sans cette regle, toute une promotion reapparaitrait en
-- « jamais connecte » a la rentree.
reset role;
update public.eleves set user_id = null where id = :'act_id'::uuid;
set role authenticated;
select set_config('request.jwt.claim.sub', :'PROF', false);
select case when (select deja_connecte from liste_eleves() where eleve_id = :'act_id'::uuid)
            then 'OK : la trace d activite survit au compte Google'
            else 'ECHEC : un eleve parti serait relance a la rentree' end as verdict;

\echo '=== 185. Un eleve qui n a vraiment jamais joue reste « jamais connecte » ==='
select (ajouter_eleve('jamais.vu@demo.saintho.fr','Vu','Jamais','6A')
        ->>'eleve_id')::uuid as jamais_id \gset
select case when (select deja_connecte from liste_eleves() where eleve_id = :'jamais_id'::uuid) = false
             and (select derniere_connexion from liste_eleves() where eleve_id = :'jamais_id'::uuid) is null
            then 'OK : celui-la, il faut aller le chercher'
            else 'ECHEC : un eleve jamais venu passe pour connecte' end as verdict;
reset role;

-- ---------------------------------------------------------------------
-- MIGRATION 37 — le role de sauvegarde en lecture seule
-- ---------------------------------------------------------------------

\echo '=== 186. Le role de sauvegarde VOIT toutes les lignes malgre RLS ==='
-- LE test qui compte. Sans `bypassrls`, ce role obtiendrait zero ligne
-- et le dump serait vide — sans la moindre erreur pour le signaler.
reset role;
select count(*) as reel from public.eleves \gset
set role matho_sauvegarde;
select case when (select count(*) from public.eleves) = :reel
             and (select count(*) from public.maitrise) > 0
             and (select count(*) from public.sessions_jeu) > 0
            then 'OK : la sauvegarde verra toutes les lignes'
            else 'ECHEC : le dump serait vide, en silence' end as verdict;
reset role;

\echo '=== 187. ... et il ne peut RIEN ecrire ==='
select case when has_table_privilege('matho_sauvegarde','public.eleves','insert')
             or has_table_privilege('matho_sauvegarde','public.eleves','update')
             or has_table_privilege('matho_sauvegarde','public.eleves','delete')
             or has_table_privilege('matho_sauvegarde','public.sessions_jeu','insert')
            then 'ECHEC : le role de sauvegarde peut ecrire'
            else 'OK : lecture seule, vraiment' end as verdict;

\echo '=== 188. Une table creee DEMAIN sera dans la sauvegarde ==='
-- Sans `alter default privileges`, la table ajoutee par une migration
-- future sortirait absente de toutes les sauvegardes, sans un mot.
create table public.table_future_test (id int);
select case when has_table_privilege('matho_sauvegarde','public.table_future_test','select')
            then 'OK : les tables futures sont couvertes'
            else 'ECHEC : une table future disparaitrait des sauvegardes' end as verdict;
drop table public.table_future_test;


-- ---------------------------------------------------------------------
-- MIGRATION 38 — un visiteur anonyme ne lit plus rien
-- ---------------------------------------------------------------------

\echo '=== 190. Un ANONYME ne peut plus lire le classement du college ==='
-- Le defaut le plus grave du projet : `grant execute ... to authenticated`
-- n enlevait pas le droit que PostgreSQL donne a PUBLIC. Avec la seule
-- cle publique embarquee dans le JavaScript, n importe qui lisait le
-- prenom, l initiale et la classe de tous les eleves ayant joue.
reset role;
set role anon;
do $$
declare n int; ouvert boolean := false;
begin
  begin
    execute 'select count(*) from public.classement_progression(''tout'',''college'',''tous'',500)' into n;
    ouvert := true;
  exception when insufficient_privilege then null; end;
  begin
    execute 'select count(*) from public.classement_classes()' into n;
    ouvert := true;
  exception when insufficient_privilege then null; end;
  if ouvert then
    raise notice 'ECHEC : un visiteur sans compte lit encore les eleves';
  else
    raise notice 'OK : les classements exigent desormais un compte';
  end if;
end $$;
reset role;

\echo '=== 191. ... mais les politiques RLS fonctionnent toujours ==='
-- Le piege du correctif : les politiques appellent est_prof(),
-- eleve_courant() et prof_voit_classe(). Sans grant explicite, retirer
-- PUBLIC fermait toutes les tables a tout le monde, profs compris.
select case when has_function_privilege('authenticated','public.est_prof()','execute')
             and has_function_privilege('authenticated','public.eleve_courant()','execute')
             and has_function_privilege('authenticated','public.prof_voit_classe(text)','execute')
             and has_function_privilege('anon','public.est_prof()','execute')
            then 'OK : RLS garde ses outils'
            else 'ECHEC : les politiques RLS vont refuser tout le monde' end as verdict;

\echo '=== 192. Le role de sauvegarde n execute plus rien ==='
select case when has_function_privilege('matho_sauvegarde','public.qui_suis_je()','execute')
             or has_function_privilege('matho_sauvegarde','public.modifier_eleve(uuid,text,text,text,text)','execute')
            then 'ECHEC : le role de sauvegarde peut appeler des RPC'
            else 'OK : il lit des tables, il n execute rien' end as verdict;
