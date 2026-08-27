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
