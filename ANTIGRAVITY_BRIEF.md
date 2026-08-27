# Calcul Mental Saintho — Brief de reprise

> **Pour l'agent Antigravity.** Ce document remplace l'ancien `AUDIT_HANDOFF.md`,
> qui décrivait une architecture Google Apps Script désormais abandonnée.
> Lis-le en entier avant d'écrire la moindre ligne.
>
> Date : 26 août 2026 · Établissement : Collège Saint-Honoré d'Eylau (Paris 16e)

---

## 1. Le projet en trois phrases

Application d'entraînement au calcul mental (tables de multiplication) pour
**tout le collège, de la 6e à la 3e**, utilisée sur les iPads de l'établissement
et à la maison.
Le front React/Vite existant est abouti et **doit être conservé**. Le backend,
lui, est entièrement remplacé.

**Public : des élèves de 11 à 15 ans, sur écran tactile.** Chaque décision
d'interface se juge à cette aune.

---

## 2. Ce qui change — décision actée

L'ancien backend (Google Apps Script + Google Sheets) est **abandonné**. Il ne
tenait pas la charge d'une classe entière : 30 exécutions simultanées maximum
pour tout le collège, lecture d'onglets entiers à chaque requête, aucun verrou
transactionnel, et une authentification maison percée.

| Avant | Maintenant |
|---|---|
| Backend Apps Script (`gas/Code.gs`) | **Supprimé** |
| Proxy Vercel `/api/gas` | **Supprimé** |
| Google Sheet comme base de données | **Supabase (PostgreSQL)** |
| Système PIN maison (hash + sel + mails) | **Supabase Auth — code à 6 chiffres par email** |
| Validation de session lisant un onglet | **JWT + Row Level Security** |
| Classements calculés en JS | **Fonctions SQL** |
| Google Sheet pour les profs | **Export en lecture seule** — voir §10 |

**À supprimer du dépôt :** `gas/`, `api/gas.js`, `api/test.js`, et toute la
logique de PIN dans `Login.jsx`.

Le front reste hébergé sur Vercel (déploiement sur `git push`). Il parle
directement à Supabase — plus de proxy. Le domaine `*.supabase.co` doit être
autorisé dans le MDM Jamf ; c'est de la responsabilité de l'administrateur, pas
du code.

---

## 3. Ton autonomie

Tu es censé travailler seul. Branche-toi toi-même sur les outils dont tu as
besoin plutôt que de demander à l'humain de faire le relais :

| Service | Serveur MCP | Ce que ça te donne |
|---|---|---|
| **Supabase** | `@supabase/mcp-server-supabase` | Lire le schéma, exécuter du SQL, appliquer les migrations, générer les types TypeScript, lire les logs et les rapports de sécurité |
| **GitHub** | serveur distant officiel GitHub | Branches, commits, pull requests, issues |
| **Vercel** | serveur MCP officiel Vercel | État des déploiements, logs de build, variables d'environnement |

Ces trois-là couvrent l'essentiel. Le reste — lancer les tests, la CLI Supabase,
`npm` — passe par le terminal. **N'attends pas qu'on te donne une information que
tu peux aller chercher toi-même** : le schéma se lit, les logs se consultent, un
build qui échoue s'inspecte.

### Ce que tu ne peux pas faire seul

Cinq choses demandent un humain. Demande-les **une seule fois, toutes ensemble,
au début** — puis n'y reviens plus :

1. Créer le projet Supabase de dev et fournir sa référence + un jeton d'accès
   personnel (à mettre dans `.agents/mcp_config.json`, jamais dans Git).
2. Configurer le SMTP Google Workspace dans Supabase (mot de passe d'application).
3. Autoriser `*.supabase.co` dans le MDM Jamf.
4. Fournir les accès GitHub et Vercel si l'OAuth des serveurs MCP ne suffit pas.
5. **Déployer en production.** C'est volontairement hors de ta portée : un humain
   relit et lance `supabase db push`. Ne cherche pas à contourner.

---

## 4. Règles de travail — non négociables

1. **La production ne se modifie jamais directement.** Tu travailles sur le
   projet Supabase de développement. Chaque changement de schéma est un fichier
   dans `supabase/migrations/`, versionné dans Git. La production est mise à
   jour par `supabase db push`, par un humain.

2. **`src/api.js` reste le point de passage unique.** Aucun écran n'appelle
   Supabase directement. Tous les accès aux données passent par ce module. Cette
   règle a déjà sauvé le projet une fois (elle rend cette migration possible) —
   elle doit tenir.

3. **Le front n'écrit jamais dans les tables.** Il appelle les fonctions RPC
   définies dans les migrations 3 et 4. Le serveur valide et calcule. Un élève ne doit
   pas pouvoir fabriquer un score, s'attribuer un badge, ou rejouer un défi.

4. **Ne jamais exposer d'email d'élève** dans un écran de classement ou dans une
   réponse d'API partagée. Ce sont des données de mineurs. Les classements
   affichent « Alice D. » — prénom et initiale, rien d'autre.

5. **Ne pas ajouter de dépendance** sans raison explicite. Le projet doit rester
   déployable par `git push` par un enseignant, pas par un ingénieur.

6. **Interdits absolus :** aucun `localStorage` pour des données de jeu (le
   serveur fait foi) ; aucune donnée en dur qui simule un vrai contenu — c'est
   précisément le défaut qui rendait l'ancienne version trompeuse.

---

## 5. Fichiers fournis

```
supabase/migrations/20260826090000_schema.sql   Tables, contraintes, index
supabase/migrations/20260826090100_rls.sql      Sécurité au niveau ligne
supabase/migrations/20260826090200_api.sql      Fonctions RPC + classements
supabase/migrations/20260826090300_difficulte.sql  Tables 1-20, paliers, pondération
supabase/migrations/20260826090400_portee_niveau.sql  Classement par niveau + par classe
supabase/migrations/20260826090500_palier_tous.sql    Tableau d'honneur du collège
supabase/migrations/20260827080000_administration.sql Gestion des élèves + journal
supabase/migrations/20260827090000_comptes_profs.sql  Comptes enseignants, accès à toutes les classes
supabase/migrations/20260827100000_profs_joueurs.sql  Les profs jouent + `qui_suis_je()`
frontend/src/api.js                             Client Supabase complet — DÉJÀ ÉCRIT
archive/api_gas_ancien.js                       L'ancien client, pour mémoire
supabase/seed.sql                               Élèves fictifs (DEV uniquement)
supabase/tests/run.sh                           Vérification de bout en bout
.agents/mcp_config.json                         Connexion MCP Supabase
```

Le schéma couvre **plus** que ce qui est à développer maintenant : certaines
colonnes (`defis.statut`, `defis.demarre_le`) sont prévues pour un éventuel mode
« départ synchronisé » qui n'est pas au programme. Les laisser en place ; ne pas
construire de fonctionnalité autour.

### Les tests

`./supabase/tests/run.sh` rejoue les migrations depuis zéro et déroule un
scénario complet : connexion, partie, badges, défi à deux joueurs, classements,
et cinq tentatives de contournement qui doivent toutes échouer.

**À lancer après chaque modification des migrations.** Toute ligne contenant
« ECHEC » signale une régression de sécurité. Ces migrations ont été vérifiées
sur PostgreSQL 16 : elles passent, et le scénario aussi.

Quand tu ajoutes une fonction ou une politique, ajoute le cas correspondant
dans `01_scenario.sql`. C'est le seul filet de sécurité du projet.

### Trois pièges déjà rencontrés — ne pas les réintroduire

1. **Récursion infinie dans les politiques RLS.** Une politique sur `profs` ne
   doit jamais contenir `select ... from profs` : PostgreSQL réapplique la
   politique sur la sous-requête, sans fin. Toujours passer par une fonction
   `security definer` (`est_admin()`, `est_prof()`, `prof_voit_classe()`). Le
   symptôme est explicite : *infinite recursion detected in policy for relation*.

2. **Concaténation de tableau en PL/pgSQL.** `mon_tableau || 'texte'` échoue
   avec *malformed array literal* : le littéral doit être typé,
   `mon_tableau || 'texte'::text`.

3. **Le trigger de protection de `eleves`** annule toute modification des champs
   sensibles par un non-admin — y compris le rattachement automatique du compte
   à la première connexion. D'où le drapeau de transaction
   `app.rattachement_en_cours`. Si tu ajoutes une écriture système sur `eleves`,
   pense à ce drapeau, sinon elle sera silencieusement annulée.

---

## 5ter. `api.js` est déjà écrit — ne le réécris pas

`frontend/src/api.js` est fourni complet : 38 fonctions, une par action du
serveur. Les 28 appels RPC ont été vérifiés un par un contre les migrations.

**Avant toute chose :**

```bash
cd frontend && npm install @supabase/supabase-js
```

Puis crée `frontend/.env.local` avec `VITE_SUPABASE_URL` et
`VITE_SUPABASE_ANON_KEY` (récupérables via MCP), et vérifie que ce fichier est
ignoré par Git.

Ton travail sur ce fichier consiste à **l'utiliser**, pas à le refaire. Si une
fonction manque, ajoute-la — ne recommence pas le module.

### Trois choses à ne pas casser

**La file d'attente hors-ligne.** `enregistrerSession()` met la partie de côté
dans `localStorage` quand le réseau est coupé, et `viderFile()` la rejoue au
retour. Appelle `viderFile()` au démarrage de l'app et abonne-toi à
`surFileChangee()` pour afficher un discret « résultats en attente d'envoi ».

⚠️ Ce n'est **pas** une entorse à la règle « pas de `localStorage` pour les
données de jeu ». C'est un tampon d'envoi : rien n'en est jamais lu pour être
affiché. Le serveur reste seul juge des scores. Ne supprime pas ce mécanisme en
croyant appliquer la règle.

**Les messages d'erreur du serveur.** Ils sont écrits en français, pour être lus
par un élève ou un professeur. `api.js` les relaie tels quels. Ne les remplace
pas par « Une erreur est survenue ».

**Les trois refus distincts de `rejoindreDefi()`** — `inconnu`, `ferme`,
`deja_joue`. L'interface doit les traiter séparément : un message unique
laisserait l'élève bloqué sans savoir s'il doit retaper le code ou passer à
autre chose.

---

## 5bis. Deux fonctions à connaître avant tout

**`qui_suis_je()`** — à appeler **en premier**, juste après la connexion. Elle
renvoie `{type: 'eleve' | 'prof' | 'inconnu', ...}` et c'est elle qui décide de
l'écran d'accueil. `mon_profil()` ne répond que pour les élèves.

Le cas `inconnu` doit être traité proprement : un compte a été créé mais
l'adresse n'est ni dans `eleves` ni dans `profs`. C'est la barrière d'entrée qui
fonctionne. Affiche le message renvoyé — « demande à ton professeur » — ne
plante pas, ne renvoie pas au login en boucle.

**Les enseignants jouent aussi.** Leurs parties vont dans `sessions_profs`, une
table séparée, via `enregistrer_session_prof()`. Leur classement,
`classement_profs()`, n'est **lisible que par les enseignants** — aucun élève ne
peut le voir, ni par requête ni par fonction.

Deux tables distinctes, aucune intersection : un professeur ne peut pas
apparaître dans un classement d'élèves, même par erreur de filtre. Le même
écran de jeu sert aux deux — seule la fonction d'enregistrement change, selon
ce qu'a répondu `qui_suis_je()`. Pas de badges ni de grille de maîtrise pour les
enseignants : c'est pour l'émulation entre collègues, pas de la remédiation.

Leur classement affiche le **nom complet** — entre adultes qui se connaissent,
« M. D. » n'aurait pas de sens.

---

## 6. Le travail, par lots

### Lot 0 — Fondations

- Appliquer les quatre migrations sur la base de dev, charger `seed.sql`.
- Configurer Supabase Auth : **code à 6 chiffres (OTP), pas de lien magique.**
  Sur iPad, un lien magique s'ouvre dans le navigateur de l'app Mail et la
  session atterrit au mauvais endroit. Le code fonctionne toujours.
- Réécrire `src/api.js` sur `@supabase/supabase-js`, en gardant **exactement les
  mêmes signatures de fonctions** que la version actuelle quand c'est possible.
  Objectif : que les écrans changent le moins possible.
- `App.jsx` : **restaurer la session au démarrage.** C'est un manque actuel et
  il est pénalisant — sur iPad, Safari décharge les onglets en arrière-plan et
  l'élève se retrouve déconnecté en pleine séance. Écran de chargement, puis
  profil restauré ou retour au login.

**Critère d'acceptation :** un élève de `seed.sql` se connecte avec son email,
reçoit un code, entre dans l'app, recharge la page — et reste connecté.

### Lot 1 — Brancher les modes solo

Les quatre modes de jeu existent et fonctionnent. Il leur manque uniquement
l'envoi des résultats.

- Appeler `enregistrer_session()` à la fin de **chaque** partie : Sprint, Sans
  faute, Contre-la-montre, Montée, et aussi le mode Entraînement libre.
- Écran Profil : remplacer les données en dur par `mon_profil()`. Les records,
  les badges et la grille de maîtrise doivent devenir réels.
- Écran Classements : supprimer `DEMO_DATA` et appeler
  `classement_progression()` et `classement_records()`.
- Persister le changement d'avatar.
- **Corriger le bug des tables ignorées** : `ChallengeConfig` laisse choisir les
  tables, mais `SprintPlay` / `FlawlessPlay` / `CountdownPlay` utilisent
  `[2..10]` en dur. Faire descendre la prop.
- **Nouveau sélecteur de tables** regroupé, avec les trois raccourcis et le
  plafond par élève (voir §7). Il remplace les dix cases actuelles.
- **Brancher le moteur pédagogique inutilisé** : `Challenges.jsx` importe
  `buildWeights` depuis `logic/mastery.js` et ne s'en sert jamais. Pondérer le
  tirage des questions par la maîtrise de l'élève — un fait « rouge » doit
  revenir bien plus souvent qu'un fait « vert ». C'est le meilleur rapport
  valeur/effort de tout le projet.

**Critère d'acceptation :** après trois parties, le profil affiche des records
non nuls, des badges cohérents, une grille de maîtrise colorée, et l'élève
apparaît dans les classements.

### Lot 2 — Défis par code

C'est le cœur de l'usage en classe. Le principe : **asynchrone, pas temps réel.**

Le prof (ou un élève) crée un défi, un code à 5 lettres s'affiche, il est écrit
au tableau. Chacun le saisit et joue **exactement les mêmes questions**. En
finissant, l'élève voit le classement de ceux qui ont déjà terminé, et le
regarde se remplir.

En pratique, comme toute la classe démarre au même moment — le prof dit « c'est
parti » —, l'effet ressenti est celui d'un direct. **Il ne faut donc construire
aucun mécanisme de départ synchronisé : la voix du professeur est le mécanisme.**

- Brancher le bouton « Rejoindre » (il n'a aucune action aujourd'hui) sur
  `rejoindre_defi(code)`. Traiter les trois erreurs distinctement : code
  inconnu, défi fermé, déjà participé. Le message doit être compréhensible par
  un élève de 6e.
- Créer l'écran de classement de défi manquant. Aujourd'hui le mode « classe »
  retombe silencieusement sur un Sprint solo — l'élève croit jouer contre sa
  classe et joue seul. C'est le bug le plus trompeur du projet.
- Rafraîchir le classement automatiquement : abonnement Realtime sur
  `defis_participants`, ou rappel toutes les 5 s. Afficher le compteur
  « 18 / 28 ont terminé » via `avancement_defi()`.
- Côté prof : créer un défi depuis l'admin, voir qui a joué, fermer le défi.

**Seuls Sprint et Contre-la-montre sont proposables en défi à code.** Sans faute
et Montée produisent des écarts de durée trop grands pour un usage simultané —
un élève solide tient cinq minutes, un autre s'arrête en vingt secondes. Ces
deux modes alimentent en revanche les classements permanents (semaine, mois,
année). La base l'impose déjà par une contrainte.

**Critère d'acceptation :** deux navigateurs, deux élèves, un code. Les deux ont
les mêmes questions, les deux apparaissent au classement, et une seconde
tentative est refusée.

### Lot 3 — Finitions

- **File d'attente hors-ligne.** Le wifi du collège tombe. Aujourd'hui une
  coupure en fin de partie perd le résultat sans un mot. Mettre les appels
  `enregistrer_session` en file dans `localStorage`, les rejouer au retour du
  réseau, afficher un discret « résultats en attente d'envoi ».
- **Confettis uniquement en cas de réussite.** Ils se déclenchent actuellement
  même quand un élève échoue après deux bonnes réponses. C'est vexant.
- **Corriger les écouteurs clavier** dans `Challenges.jsx` : quatre `useEffect`
  sans tableau de dépendances réattachent les écouteurs à chaque rendu.
  ⚠️ Ne PAS se contenter d'ajouter `[]` — les fonctions capturent l'état courant
  et un tableau vide figerait des valeurs périmées. Utiliser une ref sur le
  gestionnaire.
- **Corriger la violation des Rules of Hooks** : `ChallengeResults` fait
  `if (!result) return null;` avant son `useEffect`. Déplacer la garde après
  tous les hooks.
- Import d'élèves par CSV dans l'admin (colonnes : email, nom, prénom, classe).
  C'est ainsi que les comptes sont créés — il n'y a **aucune donnée à migrer**
  depuis l'ancien système.
- Bouton d'export CSV dans l'administration (voir §10).
- Vue maîtrise agrégée d'une classe via `maitrise_classe()` (voir §8).

---

## 7. Tables jusqu'à 20, paliers et équité

L'app couvre **tout le collège**, de la 6e à la 3e, avec des tables allant
jusqu'à 20 pour l'entraînement.

Ça crée un problème qu'il faut comprendre avant de coder l'interface : si le
classement compte les bonnes réponses, l'élève qui choisit les tables de 2 et 5
en aligne deux fois plus que celui qui travaille 13×17. **Le classement
récompenderait alors le choix de la facilité.**

La migration 4 répond en deux temps, et les deux sont nécessaires :

**La pondération.** Chaque fait vaut un nombre de points fonction de sa
difficulté réelle. Une table qui repose sur une règle (×1, ×10) ou une astuce
(×2 doubler, ×5 compter, ×9 complément à 10, ×20 doubler puis ×10) vaut peu.
Les tables sans motif — 6, 7, 8 dans les classiques, 13/14/17/19 au-delà —
valent cher. 17 est la plus chère : nombre premier, aucun raccourci.

À score égal de 20 bonnes réponses : **82 points** sur les tables de 2 et 5,
**201 points** sur celles de 7 et 9. C'est vérifié par les tests.

Les coefficients vivent dans la table `difficulte_operande`, une ligne par
nombre, avec la raison en clair. Un prof peut en ajuster un sans toucher au code.

**Les paliers.** On ne compare pas une 6e travaillant jusqu'à 10 avec un 3e
travaillant jusqu'à 20. Trois classements séparés :

| Palier | Tables | Public |
|---|---|---|
| Découverte | jusqu'à 10 | 6e / 5e |
| Confirmé | jusqu'à 12 | 5e / 4e |
| Expert | jusqu'à 20 | 4e / 3e et volontaires |

Le palier d'une partie est **déduit** de la plus haute table jouée — personne ne
le choisit, donc personne ne peut se ranger dans un palier facile en jouant dur.

Dans un défi, aucune correction n'est nécessaire : tout le monde a exactement
les mêmes questions.

### Le plafond, et comment on le franchit

Chaque élève a un `plafond_tables` : la table la plus haute qu'il peut
sélectionner. Par défaut 10 en 6e, 12 en 5e, 15 au-dessus. Le prof l'ajuste.

Et surtout : **la Montée des tables le relève automatiquement.** Franchir la
table 10 en Montée débloque la 11 en entraînement. C'est ce qui donne enfin un
rôle à ce mode, et ça garantit qu'un élève de 6e ne tombe jamais sur du 17×18
sans l'avoir mérité. Le serveur refuse toute partie au-dessus du plafond — sinon
ce serait le moyen évident de gonfler ses points.

### Le sélecteur de tables

Vingt cases à cocher sur un iPad, c'est illisible. Regroupe :

- **Les faciles** — 1, 2, 5, 10
- **Le cœur** — 3, 4, 6, 7, 8, 9
- **Au-delà de 10** — 11, 12
- **Les grandes** — 13 à 20 *(grisées au-dessus du plafond, avec « débloque-les
  en Montée des tables »)*

Et trois raccourcis en haut, qui seront utilisés bien plus que les cases :

- **Mes tables faibles** → appelle `mes_tables_faibles()`, qui lit la grille de
  maîtrise et renvoie les 4 tables les plus ratées. Ne demande pas à un élève de
  6e de savoir ce qu'il doit réviser : propose-le-lui.
- **Toutes mes tables** → tout jusqu'au plafond.
- **Les classiques** → 1 à 10.

Affiche la valeur en points de la sélection (« ×2,4 »). L'élève comprend vite
que travailler dur rapporte plus, et c'est exactement le comportement recherché.

---

## 8. La partie enseignant

Le piège serait de construire un mini-ENT. **Ne fais pas ça.** La plupart des
profs n'ouvriront jamais un panneau d'administration.

Sépare en deux endroits très différents :

### « Mode classe » — sur l'écran d'accueil du prof

C'est ce qui sera réellement utilisé, plusieurs fois par semaine. Ça doit être à
**deux tapes** de l'accueil, jamais enfoui dans un menu :

1. Choisir Sprint ou Contre-la-montre, les tables, valider
2. **Le code s'affiche en très grand** — lisible depuis le fond de la salle
3. Le classement se remplit, avec le compteur « 18 / 28 ont terminé »
4. Un bouton « Clore le défi »

L'écran de classement est projetable tel quel au vidéoprojecteur. C'est le
tableau de bord temps réel, et il ne coûte rien à développer.

### « Administration » — pour l'administrateur, deux fois par an

- Import des élèves par CSV (email, nom, prénom, classe) — c'est ainsi que les
  comptes sont créés
- Réglage du plafond de tables par classe ou par élève
- Vue maîtrise agrégée d'une classe via `maitrise_classe()` : « 18 élèves sur 27
  bloquent sur la table de 7 ». **C'est ce chiffre-là qui fait qu'un prof de
  maths rouvre l'outil la semaine suivante** — soigne cet écran.
- Activer / désactiver un compte, renvoyer un code d'accès
- Historique des défis

### Les rôles — décidé le 27 août 2026

**Deux rôles seulement. Ne construis pas de matrice de droits.**

| | `prof` | `admin` |
|---|---|---|
| Voir la maîtrise, lancer des défis | toutes les classes | toutes les classes |
| Ajouter / modifier / désactiver un élève | toutes les classes | toutes les classes |
| Régler le plafond de tables d'une classe | ✓ | ✓ |
| Import de rentrée | — | ✓ |
| Créer et gérer les comptes enseignants | — | ✓ |

**Un enseignant voit et gère TOUTES les classes**, pas seulement les siennes.
C'est un choix assumé : les affectations changent chaque année, un professeur
remplace un collègue, échange un service. Un cloisonnement serait périmé en
permanence et chaque « je ne vois pas ma classe » remonterait à
l'administrateur. Quatre professeurs qui se croisent tous les jours n'ont pas
besoin de cloisons — ils ont besoin d'un journal, et il existe.

`profs.classes[]` survit comme **raccourci d'affichage** (« mes classes
habituelles »), sans aucun effet sur les droits. Vide = on voit la liste
complète via `liste_classes()`. Chaque enseignant règle les siens avec
`definir_mes_classes()`.

Un enseignant peut être administrateur : même compte, rôle `admin`, et il
garde toutes les capacités d'un prof.

### Comptes enseignants

`creer_prof()` · `modifier_prof()` · `desactiver_prof()` · `liste_profs()`

Quatre professeurs : un formulaire de saisie suffit, pas d'import.

⚠️ **Le serveur refuse de retirer le dernier administrateur actif** — rétrogradation
comme désactivation. Sans ce verrou, une fausse manœuvre enfermerait tout le
monde dehors et il faudrait passer par la console Supabase. Relaie le message
d'erreur tel quel : il explique quoi faire.

Prévois **au moins deux administrateurs** dans la vraie base : un seul, c'est un
point de défaillance unique le jour où il est absent à la rentrée.

### Ce qu'il ne faut pas construire

Pas de devoirs à rendre, pas de notes, pas de messagerie, pas de bulletins. Ce
sont les fonctionnalités qui font grossir le projet jusqu'à ce que plus personne
ne le maintienne.

---

## 9. Les défis entre élèves

Oui, un élève peut créer son propre défi et donner le code à ses copains — le
schéma le prévoit (`defis.cree_par_eleve`). C'est autonome, ça n'implique aucun
prof, et l'équité est automatique puisque les questions sont identiques.

Trois garde-fous, déjà dans le SQL :

- **5 défis ouverts maximum** par élève simultanément (anti-spam)
- **24 heures de validité** pour un défi d'élève, une semaine pour un défi de prof
- **Plafonné au niveau du créateur** — un élève ne fabrique pas un défi sur des
  tables qu'il n'a pas débloquées

Et une règle de conception à respecter absolument : **aucun champ de texte libre,
nulle part.** Pas de nom de défi, pas de message, pas de pseudo. Un défi est
identifié par son code, point. Dès qu'on laisse des collégiens écrire du texte
visible par d'autres, il faut de la modération — et personne au collège n'aura
le temps de la faire. Les avatars sont une liste fermée d'emojis pour la même
raison.

---

## 10. Export vers Google Sheet

L'établissement veut pouvoir manipuler ses données dans un tableur. Deux étapes,
dans cet ordre :

**Maintenant — bouton « Exporter » dans l'administration.** Un clic, un CSV
téléchargé, ouvert dans Sheets ou Excel. Zéro infrastructure, disponible tout de
suite. Ça couvre l'essentiel du besoin.

**Plus tard, si l'usage le confirme — synchronisation automatique** vers un
Google Sheet via une Edge Function et un compte de service Google, déclenchée une
fois par nuit.

### Ce que contient l'export

Un onglet par usage, et surtout pas un déversement de la base :

| Onglet | Contenu | Pour qui |
|---|---|---|
| `Eleves` | nom, prénom, classe, actif, dernière connexion, plafond de tables, nb de sessions | Administration |
| `Activite_Hebdo` | élève × semaine → sessions, temps total, points | Suivi de l'assiduité |
| `Maitrise_Classe` | classe × table → % d'élèves en vert | **Le plus utile** — pilotage pédagogique |
| `Defis` | historique : date, type, tables, participants, scores | Mémoire des séances |
| `Sessions` | brut, une ligne par partie | Ceux qui veulent bricoler |

### Une règle à ne pas enfreindre

**L'export est en lecture seule.** On n'écrit jamais depuis le Sheet vers la
base : une synchronisation bidirectionnelle est un cauchemar de conflits, et
c'est exactement ce dont on vient de sortir. Pour modifier des élèves en masse,
le chemin est l'**import CSV**, qui passe par les validations du serveur.

Et pas d'email d'élève dans les onglets destinés à circuler entre collègues.

---

## 11. Les deux classements

L'écran Classements a **deux onglets**, et c'est un choix pédagogique délibéré.

**Progression** *(onglet par défaut)* — points gagnés sur la période, calculés
par `classement_progression()` :

```
points = somme des scores
       + 10 × nombre de jours d'activité
       +  5 × faits passés en vert
```

Un élève fragile qui s'entraîne régulièrement peut être premier. C'est
l'objectif : un classement où seuls les meilleurs peuvent gagner décourage
exactement ceux qu'on cherche à accrocher. La formule est dans le SQL et se
règle facilement après observation en classe.

**Records** *(second onglet)* — performance brute :
meilleure série · meilleur score chrono · meilleur temps au sprint · plus haute
table atteinte.

Les deux acceptent trois filtres combinables :

- **Période** — semaine · mois · année scolaire · depuis toujours
- **Portée** — `classe` · `niveau` (tous les 6ᵉ) · `college`
- **Palier** — `decouverte` · `confirme` · `expert` · `tous`

**Mettre « ma classe » par défaut** : la comparaison de proximité motive,
l'exposition à l'échelle du collège écrase.

Le palier `tous` désactive le filtre de difficulté : c'est un **tableau
d'honneur** (« les records du collège »), à présenter comme une vitrine, jamais
comme le classement par défaut — sinon on retombe sur l'effet qu'on cherche à
éviter, les mêmes toujours en tête.

Il existe aussi `classement_classes()` : un classement d'équipes, 6ᵉA contre
6ᵉB, en moyenne par élève pour ne pas avantager les classes nombreuses. À cet
âge l'émulation collective fonctionne souvent mieux que l'exposition
individuelle.

---

## 11bis. Gestion des élèves — déjà écrite côté serveur

Toute la vie courante du fichier d'élèves existe en base (migration 7). **Il
reste à construire les écrans**, pas la logique. N'écris pas ta propre version.

| Fonction SQL | À quoi ça sert | Qui y a droit |
|---|---|---|
| `importer_eleves(jsonb)` | Import de rentrée | admin |
| `ajouter_eleve(...)` | Arrivée en cours d'année | admin ou prof de la classe |
| `modifier_eleve(...)` | Corriger nom, classe, e-mail | admin ou prof de la classe |
| `desactiver_eleve(id, motif)` | Départ | admin ou prof de la classe |
| `reactiver_eleve(id)` | Retour, ou erreur | admin ou prof de la classe |
| `definir_plafond_classe(classe, n)` | Ouvrir les tables 11-12 à une classe | admin ou prof de la classe |
| `eleves_sans_connexion(classe?)` | Suivi de rentrée | admin ou prof de la classe |

### Les règles à respecter dans l'interface

**On ne supprime jamais un élève en cours d'année.** On le désactive. Supprimer
effacerait ses sessions en cascade : les classements de sa classe changeraient
rétroactivement et les défis auxquels il a participé deviendraient incohérents.
Aucun bouton « Supprimer » dans l'admin — seulement « Désactiver », avec un
champ motif.

**L'import ne désactive personne.** Un élève absent du fichier est seulement
signalé dans le rapport de retour (`actifs_absents_du_fichier`). Affiche cette
liste et laisse l'administrateur décider au cas par cas. Ne propose jamais de
désactivation en masse en un clic.

**Les lignes invalides d'un import remontent** dans `lignes_ignorees`, avec la
raison. Montre-les — un import qui avale silencieusement six lignes est pire
qu'un import qui échoue.

**L'e-mail n'est modifiable que si l'élève ne s'est jamais connecté.** Après, le
compte est rattaché : changer l'adresse le laisserait connecté sous une
identité qui n'existe plus. Le serveur refuse et explique quoi faire — relaie
le message tel quel.

**Un élève ajouté peut se connecter immédiatement.** Aucun délai, aucune
validation. Dis-le dans l'interface, sinon on croira qu'il faut attendre.

### Le journal

Chaque action d'administration est enregistrée dans `journal_admin` : qui, quoi,
quand, sur qui. Plusieurs enseignants auront les droits — il faut pouvoir
répondre à « qui a désactivé cet élève ? ». Prévois un écran de consultation,
même minimal.

---

## 12. Sécurité — ce qui est déjà couvert, et ce qui reste à faire

Le modèle est dans les migrations, pas dans le code applicatif. Concrètement :

- Un élève ne lit que ses propres lignes. Les classements passent par des
  fonctions `security definer` qui ne renvoient que prénom, initiale, classe,
  avatar et valeur.
- Une partie enregistrée est définitive : aucune politique UPDATE ni DELETE sur
  `sessions_jeu`.
- Une seule participation par défi, garantie par la clé primaire.
- Les badges ne peuvent pas être attribués depuis le client.
- Un élève ne peut modifier que son avatar — un trigger restaure les autres
  champs s'il tente autre chose.
- Un compte créé avec une adresse absente de `eleves` ou `profs` n'a accès à
  rien. C'est la barrière d'entrée.

**Sur la triche :** dans un jeu qui tourne dans le navigateur, on ne peut pas
l'empêcher. Un élève dégourdi verra les réponses. On limite les dégâts (une
seule participation, score plafonné par le nombre de questions) et on assume :
**ces défis ne comptent dans aucune évaluation.** Ne pas surinvestir sur ce
sujet.

---

## 13. Avant la mise en production

Ces points relèvent de l'administrateur, pas du code — mais l'app ne fonctionne
pas sans eux.

- [ ] **SMTP obligatoire.** Le service mail intégré de Supabase est limité à
      2 messages/heure et n'envoie qu'aux membres du projet : la connexion des
      élèves ne marchera pas sans SMTP personnalisé. Utiliser un compte dédié
      du Google Workspace de l'établissement (`smtp.gmail.com:587` + mot de
      passe d'application). Contrainte forte : **les élèves ne reçoivent que du
      domaine `saintho.fr`.**
- [ ] Remonter la limite d'envoi dans Supabase (30/heure par défaut).
- [ ] Projet Supabase créé dans une **région européenne** (RGPD).
- [ ] `*.supabase.co` autorisé dans Jamf.
- [ ] Réveil hebdomadaire de la base (mise en pause après 7 jours d'inactivité
      sur l'offre gratuite — les vacances scolaires suffisent à déclencher ça).
      La requête doit toucher la base, pas seulement l'URL du projet.
- [ ] Registre RGPD de l'établissement mis à jour, familles informées.
- [ ] **Rentrée échelonnée** : une ou deux classes par jour, pas 300 élèves le
      même matin. Ça lisse les envois de mails et laisse le temps de corriger.
- [ ] Test de charge : simuler une classe entière terminant simultanément avant
      la première vraie séance.

---

## 14. Le contexte que les chiffres ne disent pas

Si la première séance avec 28 iPads part en vrille — reconnexions, lenteurs,
résultats perdus — les collègues n'y reviendront pas, et le projet meurt là.
C'est le vrai risque, plus que n'importe quel bug.

D'où l'ordre des lots : quelque chose de **solide et honnête** d'abord, les
fonctionnalités impressionnantes ensuite. Mieux vaut quatre modes qui marchent
vraiment qu'un défi de classe spectaculaire qui plante devant une classe.

Et le principe qui vaut pour tout le reste : **si une donnée n'existe pas, il
faut l'écrire.** Pas de faux classements, pas de badges décoratifs, pas de
compteur qui simule. L'ancienne version affichait des élèves inventés dans les
classements et des records à zéro dans le profil — c'est ce qui l'a rendue
inutilisable en vrai.
