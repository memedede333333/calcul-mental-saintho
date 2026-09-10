


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
