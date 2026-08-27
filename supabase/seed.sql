-- =====================================================================
-- Données de démonstration — BASE DE DÉVELOPPEMENT UNIQUEMENT
-- =====================================================================
-- Ne JAMAIS exécuter ce fichier sur la base de production.
-- Les adresses utilisent le domaine demo.saintho.fr pour qu'on ne
-- puisse pas les confondre avec de vrais comptes élèves.
-- =====================================================================

insert into public.profs (email, nom, role, classes) values
  ('prof.demo@demo.saintho.fr',  'M. Démonstration', 'admin', '{6A,6B,5A}'),
  ('maths.demo@demo.saintho.fr', 'Mme Calcul',       'prof',  '{6A}');

insert into public.eleves (email, nom, prenom, classe, avatar_emoji, tables_autorisees) values
  ('alice.dupont@demo.saintho.fr',  'Dupont',  'Alice',  '6A', '🌟', '{1,2,3,4,5,6,7,8,9,10}'),
  ('bob.martin@demo.saintho.fr',    'Martin',  'Bob',    '6A', '🚀', '{1,2,3,4,5,6,7,8,9,10}'),
  ('clara.bernard@demo.saintho.fr', 'Bernard', 'Clara',  '6A', '🎯', '{1,2,3,4,5,6,7,8,9,10,11,12}'),
  ('lea.faure@demo.saintho.fr',     'Faure',   'Léa',    '6A', '🦋', '{1,2,3,4,5,6,7,8,9,10}'),
  ('david.petit@demo.saintho.fr',   'Petit',   'David',  '6B', '⚡', '{1,2,3,4,5,6,7,8,9,10}'),
  ('emma.robert@demo.saintho.fr',   'Robert',  'Emma',   '6B', '🌈', '{1,2,3,4,5,6,7,8,9,10,11,12}'),
  ('hugo.lambert@demo.saintho.fr',  'Lambert', 'Hugo',   '6B', '🎸', '{1,2,3,4,5,6,7,8,9,10}'),
  ('ines.chevalier@demo.saintho.fr','Chevalier','Inès',  '5A', '🌸', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15}');

-- Quelques sessions réparties sur trois semaines, avec des niveaux
-- volontairement différents d'un élève à l'autre : sinon tous les
-- classements sont ex æquo et on ne voit rien.
-- Les colonnes `points` et `palier` sont calculees ici comme le ferait
-- `enregistrer_session()`. Sans elles, tous les classements bases sur la
-- progression afficheraient zero et les donnees de demo ne serviraient a rien.
insert into public.sessions_jeu
  (eleve_id, mode, tables, nb_questions, score, duree_s, serie_max, sans_faute_max,
   plus_haute_table, points, palier, cree_le)
select e.id, m.mode, m.tabs,
       m.nb, greatest(1, (m.score * f.coef)::int),
       round(m.duree / f.coef, 1),
       (m.serie * f.coef)::int, (m.serie * f.coef)::int,
       case when m.table_max is null then null
            else greatest(2, (m.table_max * f.coef)::int)::smallint end,
       round(greatest(1, (m.score * f.coef)::int) * public.poids_moyen(m.tabs) * 10)::int,
       public.palier_tables(m.tabs),
       now() - (m.jours || ' days')::interval
  from public.eleves e
  join (values
      ('alice.dupont@demo.saintho.fr',   1.30),
      ('bob.martin@demo.saintho.fr',     0.85),
      ('clara.bernard@demo.saintho.fr',  1.15),
      ('lea.faure@demo.saintho.fr',      0.70),
      ('david.petit@demo.saintho.fr',    1.05),
      ('emma.robert@demo.saintho.fr',    0.90),
      ('hugo.lambert@demo.saintho.fr',   0.60)
  ) as f(email, coef) on f.email = e.email
  cross join (values
      -- mode, nb, score, duree, serie, table_max, jours, tables jouees
      ('countdown', 40, 32, 120.0, 12, 10,   1, '{2,3,4,5,6,7,8,9,10}'::smallint[]),
      ('sprint',    20, 18,  74.5,  9, null, 3, '{6,7,8,9}'::smallint[]),
      ('flawless',  25, 25,  88.0, 25, null, 6, '{2,3,4,5}'::smallint[]),
      ('climb',     45, 41, 210.0, 14, 9,   12, '{2,3,4,5,6,7,8,9,10}'::smallint[]),
      ('countdown', 38, 29, 120.0,  8, 10,  20, '{7,8,9,10}'::smallint[])
  ) as m(mode, nb, score, duree, serie, table_max, jours, tabs);

-- Maîtrise partielle pour voir la grille se colorer
insert into public.maitrise (eleve_id, fait, niveau, nb_vues, nb_reussites, derniere_vue)
select e.id,
       least(a, b) || '_' || greatest(a, b),
       (1 + (a + b) % 3)::smallint,
       5, 3,
       now() - ((a + b) % 10 || ' days')::interval
  from public.eleves e
  cross join generate_series(2, 9) a
  cross join generate_series(2, 9) b
 where e.classe = '6A' and a <= b
on conflict do nothing;
