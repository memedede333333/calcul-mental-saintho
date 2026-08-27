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
