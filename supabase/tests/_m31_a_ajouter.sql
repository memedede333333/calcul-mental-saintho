


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
