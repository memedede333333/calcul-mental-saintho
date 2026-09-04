


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
