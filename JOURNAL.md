# Journal du projet

> **Ce fichier ne se réécrit jamais.** On y ajoute, en haut, à chaque étape
> franchie. `ETAT.md` est la photo du moment ; celui-ci est la mémoire.

---

## Comment écrire une entrée

À la fin de chaque étape — pas à la fin de chaque fichier modifié — ajoute une
entrée **en haut** de la section « Entrées », sur ce modèle :

```markdown
## 2026-09-03 — Écrans de connexion et d'accueil

**Fait** — Écran de démarrage avec restauration de session, connexion par code
à 6 chiffres, accueils élève et professeur distincts selon `quiSuisJe()`.

**Décidé** — Le champ code accepte le collage depuis Mail : les élèves copient
le code entier plutôt que de le retaper. ✅ *validé par Aymeri le 03/09*

**Proposé, en attente** — Remplacer les 6 cases séparées par un champ unique :
plus simple sur clavier iPad. ⏳ *à trancher*

**Constaté** — Safari iPad remplit parfois le champ automatiquement avec un
ancien code. Contourné en désactivant l'autocomplétion.

**Ensuite** — Brancher l'enregistrement des parties (étape 4 de `ECRANS.md`).
```

### Les quatre rubriques

| Rubrique | Ce qu'on y met |
|---|---|
| **Fait** | Ce qui fonctionne maintenant et qui ne fonctionnait pas avant |
| **Décidé** | Les choix de conception pris. **Indiquer s'ils sont validés, et par qui.** |
| **Constaté** | Ce qui a surpris, cassé, ou ne s'est pas passé comme prévu |
| **Ensuite** | La prochaine étape |

### Trois règles

**Marque clairement ce qui est validé.** ✅ validé par *qui* et *quand*, ou
⏳ proposé en attente. Une décision prise seul par l'agent et une décision
validée par l'établissement n'ont pas le même poids — et dans six mois,
personne ne s'en souviendra.

**« Constaté » est la rubrique la plus utile.** Les surprises et les
contournements sont ce qu'on oublie en premier et ce qu'on regrette le plus de
ne pas avoir noté. Un bug contourné sans trace revient toujours.

**Répercute dans `ETAT.md`.** Une entrée de journal met à jour le tableau d'état
(§2) et, si une décision de conception a été prise, le registre des décisions
(§3). Le journal raconte, `ETAT.md` fait foi.

---

# Entrées

## 2026-08-27 (soir) — Bascule vers la connexion Google

**Fait**
- `connexionGoogle()` ajoutée dans `api.js` (`signInWithOAuth`, fournisseur
  Google, indice de domaine `hd=saintho.fr`).
- ⚠️ `detectSessionInUrl` **corrigé de `false` à `true`** — il était réglé pour
  le seul parcours par code. Laissé à `false`, la connexion Google échouait
  silencieusement : retour sur le login, en boucle, sans message d'erreur.
- `ECRANS.md` écran 2 réécrit, `SUPABASE_PAS_A_PAS.md` : nouvelle partie 4
  (Google Cloud Console + Supabase), le parcours par e-mail devient la partie 5.

**Décidé**
- **Google Sign-In devient le chemin principal**, le code par e-mail un secours
  discret. ✅ *validé par Aymeri le 27/08*
  Motifs : les élèves utilisent déjà ce compte dans Safari pour les Google
  Forms ; sur un iPad avec session Google ouverte c'est **une tape** au lieu de
  six chiffres à recopier depuis l'app Mail ; et surtout **le SMTP Workspace
  cesse d'être un préalable à la rentrée** — c'était le dernier point bloquant.
  L'objection MDM ne tenait pas : le blocage porte sur `script.google.com`, pas
  sur `accounts.google.com`, forcément déjà autorisé puisque les élèves ouvrent
  leur Gmail sur ces iPads.
- **Le mode démo est retiré**, pas conservé avec un avertissement. Les élèves
  étant pré-inscrits, « essayer sans compte » n'est plus un cas d'usage ; et une
  interface qui fonctionne pendant que tous les appels serveur échouent est
  exactement le défaut qu'on cherche à éliminer. Pour une démonstration : un
  vrai compte de la base de dev. ✅ *validé par Aymeri le 27/08*
- **Le secours par e-mail reste masqué** derrière un drapeau tant que le SMTP
  n'est pas configuré. Un secours qui échoue en silence est pire que pas de
  secours. ✅ *validé par Aymeri*

**Constaté**
- L'authentification Google ne change **rien au schéma**. Le rattachement des
  comptes se fait sur l'adresse e-mail, quel que soit le fournisseur : le
  trigger retrouve l'élève dans la table et le relie. Aucune migration touchée.
- La barrière d'entrée fonctionne à l'identique : une adresse absente des tables
  obtient une session valide et accès à rien — `quiSuisJe()` renvoie `inconnu`.
- ⚠️ **`react-router-dom` a été installé** sans que la raison soit consignée.
  Le brief demande de ne pas ajouter de dépendance sans justification. À motiver
  dans la prochaine entrée, ou à retirer.

**Ensuite** — Configurer l'application OAuth dans Google Cloud Console (mode
« Interne »), l'activer dans Supabase, puis coder l'écran de connexion.

---


## 2026-08-27 — Migrations appliquées, base opérationnelle

**Fait**
- 9 migrations appliquées sur `calcul-mental-dev` via MCP Supabase, dans l'ordre :
  schema → RLS → API → difficulté → portée niveau → palier tous →
  administration → comptes profs → profs joueurs.
- Seed chargé : 2 profs, 8 élèves, 35 sessions, 144 entrées de maîtrise,
  20 poids de difficulté.
- Smoke test réussi : 10 tables RLS activé, paliers et pondérations vérifiés
  (`poids_facile=0.41`, `poids_dur=1.13`, `poids_expert=1.68`).
- `frontend/.env.local` créé avec URL et clé anon du projet de dev.
- Types TypeScript générés (`frontend/src/types/database.ts`), couvrant
  10 tables et 40+ fonctions RPC.
- `ETAT.md` mis à jour.

**Constaté**
- Le script de test `run.sh` est conçu pour un PostgreSQL local avec `psql`
  (metacommandes `\set`, `\gset`, `\echo`). Il ne peut pas tourner tel quel
  via le MCP `execute_sql`. Les vérifications critiques (pondération, paliers,
  compteurs) ont été faites par requête directe. Le test complet de bout en
  bout nécessitera soit un PG local, soit une adaptation du script.

**Ensuite**
- Implémenter la restauration de session dans `App.jsx` (appel
  `quiSuisJe()` au démarrage).
- Coder les écrans de connexion et d'accueil (Lot 0 de `ECRANS.md`).

---

## 2026-08-27 — Client API, administration et documentation

**Fait**
- Migrations 5 à 9 : classement par niveau scolaire et par classe, tableau
  d'honneur du collège, gestion complète des élèves avec journal
  d'administration, comptes enseignants, jeu et classement pour les
  professeurs, fonction `qui_suis_je()`.
- `frontend/src/api.js` réécrit sur Supabase : 38 fonctions, 28 appels RPC
  vérifiés un par un contre les migrations, file d'attente hors-ligne intégrée.
- Documentation : `ECRANS.md` (19 écrans), `ETAT.md` (état + registre des
  décisions), ce journal. `DEMARRAGE.md` archivé, ses étapes étant accomplies.
- Serveur MCP Supabase connecté à Antigravity par autorisation navigateur.

**Décidé**
- Un enseignant voit et gère **toutes les classes**, pas seulement les siennes —
  les affectations changent chaque année. `profs.classes[]` devient un simple
  raccourci d'affichage. ✅ *validé par Aymeri*
- **Deux rôles seulement**, prof et admin, sans matrice de droits : à cette
  échelle la traçabilité vaut mieux que le cloisonnement. Aucune limite de
  nombre. ✅ *validé par Aymeri*
- Les **professeurs peuvent jouer**, dans une table séparée, avec un classement
  visible d'eux seuls. ✅ *validé par Aymeri*
- Les élèves restent affichés **« Alice D. »** — prénom et initiale. L'argument
  inverse (« ils se connaissent déjà ») a été pesé et écarté : le rôle d'un
  classement est de motiver, pas d'identifier. ✅ *validé par Aymeri*
- **Refonte visuelle après** la mise en fonctionnement, à condition d'utiliser
  les variables CSS existantes dès maintenant. ✅ *validé par Aymeri*
- Le **jeu de démonstration est conservé**, base de dev uniquement : sans lui on
  ne distingue pas « ça marche mais c'est vide » de « c'est cassé ».
  ✅ *validé après discussion*

**Constaté**
- Le jeu de démonstration a révélé un bug qui serait passé en production : les
  sessions du seed avaient **zéro point**, faute de passer par la fonction qui
  calcule la pondération. Tous les classements de progression auraient paru
  vides. Corrigé.
- L'entrée Supabase du MCP Store d'Antigravity est la version **hébergée** :
  elle ignore `.agents/mcp_config.json` et fonctionne par bouton
  **Authenticate** (OAuth navigateur). Le fichier de configuration local est
  conservé en solution de repli — il permettrait de limiter l'agent à un seul
  projet, ce que l'OAuth ne fait pas. À ressortir quand la base de production
  existera.
- `@supabase/supabase-js` **n'est pas installé** dans `frontend/package.json`.

**Ensuite** — Appliquer les 9 migrations sur la base de dev, charger le seed,
lancer les tests, puis attaquer les écrans dans l'ordre de `ECRANS.md`.

---

## 2026-08-26 — Bascule vers Supabase et construction du socle

**Fait**
- Audit du projet existant : le front React est abouti, le backend Apps Script
  l'est à moitié — classements factices, profil vide, défis non branchés.
- Migrations 1 à 4 : schéma, sécurité RLS, fonctions métier, tables jusqu'à 20
  avec pondération par difficulté et paliers.
- Harnais de test : 57 cas, dont une dizaine de tentatives de contournement qui
  doivent toutes échouer.
- Repérage de deux failles dans l'ancienne version : la première connexion avec
  le code `3333` permettait de prendre le compte d'un camarade, et l'endpoint
  Apps Script était appelable sans aucune vérification.

**Décidé**
- **Supabase remplace Apps Script + Google Sheets.** Motif : 30 exécutions
  simultanées pour tout le collège, aucune transaction, lecture d'onglets
  entiers à chaque requête. Une classe de 28 suffisait à saturer.
  ✅ *validé par Aymeri*
- **Code à 6 chiffres par e-mail, jamais de lien magique** : sur iPad le lien
  ouvre le navigateur interne de Mail et la session atterrit au mauvais
  endroit. Bénéfice second : rien à filtrer côté MDM. ✅ *validé par Aymeri*
- **Défis asynchrones**, sans départ synchronisé : le « c'est parti » du
  professeur fait le travail. Trente fois moins de requêtes qu'un vrai temps
  réel. ✅ *validé par Aymeri*
- **Aucun champ de texte libre** dans toute l'application — sinon il faudrait
  modérer. ✅ *validé par Aymeri*

**Constaté**
- Trois bugs trouvés par le test des migrations, invisibles à la relecture :
  récursion infinie dans une politique RLS, concaténation de tableau mal typée
  en PL/pgSQL, et un trigger de protection qui annulait le rattachement
  automatique des comptes — plus personne n'aurait pu se connecter.
- L'audit initial classait en « critique » des bugs d'affichage et ne voyait
  aucune des deux failles d'authentification.

**Ensuite** — Compléter la gestion des élèves et des comptes enseignants,
écrire le client API.
