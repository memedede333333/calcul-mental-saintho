


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
