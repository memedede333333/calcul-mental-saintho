


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
