# Restaurer matHo — la procédure, éprouvée le 10 septembre 2026

> Ce document existe parce qu'une sauvegarde qu'on n'a jamais restaurée n'est pas
> une sauvegarde : c'est un fichier auquel on fait confiance.
> La procédure ci-dessous a été **exécutée pour de vrai** sur la sauvegarde
> `matho_db_2026-09-10_17h25_mig-20260910230000_git-1a4fa76.sql.gz`, dans un
> PostgreSQL vierge. Les chiffres du §4 sont ceux qui sont réellement revenus.

---

## 1. La règle qui commande tout

**La structure vient des migrations. Les données viennent de la sauvegarde.**

Jamais l'inverse, et jamais les deux depuis le même fichier.

La raison est concrète et a été trouvée en restaurant : **le fichier produit par
`supabase db dump` ne contient AUCUN `GRANT`.** Vérifié — zéro occurrence dans
les 318 458 octets du fichier.

Ce qui veut dire qu'une base restaurée directement depuis ce fichier contient
bien les 313 élèves, leurs 653 cases de maîtrise et leurs parties… et que
**l'application est morte** : chaque appel renvoie `permission denied for schema
public`. Les données sont là, personne ne peut les lire.

Ce n'est pas un défaut de l'outil : `supabase db dump` est fait pour produire des
fichiers de migration, pas des restaurations complètes. C'est à la procédure d'en
tenir compte.

---

## 2. Ce que la sauvegarde ne contient pas, et pourquoi ce n'est pas grave

**`auth.users`** — les comptes Google — n'est pas dans la sauvegarde : c'est le
schéma d'authentification de Supabase, pas le nôtre.

Après restauration sur un projet neuf, les fiches élèves qui avaient un compte
rattaché pointent donc vers des comptes qui n'existent plus. Sur la sauvegarde du
10 septembre : **29 fiches sur 313**.

Ça a l'air catastrophique. Ça ne l'est pas. **L'adresse e-mail est la clé de
secours** :

- à la première reconnexion Google de l'élève, le déclencheur
  `on_auth_user_created` recolle sa fiche par son adresse ;
- et le bouton **« Réparer les rattachements »** de l'écran Administration fait
  le tour de tous les autres.

Aucun point, aucun badge, aucune case de maîtrise n'est perdu : toutes les tables
pointent sur `eleves.id`, jamais sur le compte Google.

⚠️ **Ne t'affole pas en voyant ces fiches « orphelines » après une
restauration.** C'est attendu, c'est écrit ici, et ça se répare tout seul.

Depuis la **migration 36**, ces élèves continuent d'ailleurs d'apparaître comme
« déjà connectés » et non « jamais connectés », parce que `deja_connecte` regarde
aussi leur trace d'activité — 28 des 29 en avaient une.

---

## 3. La procédure

### Étape 1 — le projet Supabase

Créer le projet (région Francfort). Noter son identifiant.

### Étape 2 — la structure, depuis les migrations

Appliquer **toutes** les migrations de `supabase/migrations/`, dans l'ordre
alphabétique des fichiers, sans en sauter aucune.

C'est ce qui installe les tables, les 69 fonctions, les 24 politiques RLS, les
déclencheurs **et les droits** — ce que la sauvegarde ne porte pas.

⚠️ **Ne jamais appliquer `supabase/seed.sql`** : ce sont des données de
démonstration, elles n'ont rien à faire dans une base restaurée.

### Étape 3 — les données, et elles seules

Extraire du fichier de sauvegarde les seuls blocs `COPY public.…` (11 blocs, un
par table) et les rejouer, encadrés par :

```sql
set session_replication_role = replica;
-- … les 11 blocs COPY …
set session_replication_role = default;
```

La ligne `session_replication_role = replica` désactive le temps du chargement
les clés étrangères et les déclencheurs. Sans elle, l'ordre d'insertion des
tables devient un casse-tête, et le déclencheur `sessions_jeu_activite`
réécrirait une date d'activité par partie chargée.

*(Le plus simple à l'usage : que `sauvegarder.command` produise directement un
second fichier `--data-only` à côté du fichier complet. Le complet reste utile
pour aller relire une valeur ; le `--data-only` est celui qu'on rejoue.)*

### Étape 4 — la vérification

Ne pas déclarer la restauration réussie sans ces cinq chiffres :

```sql
select 'eleves' t, count(*) from public.eleves
union all select 'maitrise',     count(*) from public.maitrise
union all select 'sessions_jeu', count(*) from public.sessions_jeu
union all select 'defis',        count(*) from public.defis
union all select 'profs',        count(*) from public.profs order by 1;
```

Puis, en se faisant passer pour un professeur, vérifier que **l'application
répond** — c'est la seule preuve qui vaut :

```sql
set role authenticated;
select set_config('request.jwt.claim.sub', '<user_id d un prof>', false);
select count(*) from public.liste_classes();          -- doit être > 0
select count(*) from public.liste_eleves();           -- doit être = nb d'élèves
reset role;
```

Si `liste_classes()` renvoie `permission denied`, l'étape 2 a été sautée.

### Étape 5 — les comptes Google

Écran Administration → **« Réparer les rattachements »**.

---

## 4. Ce qui est réellement revenu, le 10 septembre 2026

Sauvegarde `mig-20260910230000` / commit `1a4fa76`, restaurée dans un PostgreSQL
vierge, **0 erreur** :

| | |
|---|---|
| élèves | **313** |
| cases de maîtrise | **653** |
| parties jouées | **91** |
| défis | **24** |
| participations à des défis | **40** |
| badges | **31** |
| entrées du journal d'audit | **8** |
| fonctions publiques | **69** |
| politiques RLS | **24** |

Et l'application, interrogée en tant que professeur sur la base restaurée :
**12 classes**, **313 élèves dont 29 déjà connectés**, **26 élèves au classement
du collège**, `maitrise_classe()` répond.

---

## 5. Ce qui reste à faire

- [ ] Que `sauvegarder.command` produise aussi un fichier `--data-only`.
- [ ] Un rôle PostgreSQL **en lecture seule** dédié à la sauvegarde, au lieu du
      compte `postgres` tout-puissant.
- [ ] Refaire ce test une fois par trimestre. Une procédure de restauration
      vieille d'un an n'a jamais été essayée sur la base d'aujourd'hui.
