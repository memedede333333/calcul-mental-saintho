> ⚠️ **DOCUMENT ARCHIVÉ — NE PAS SUIVRE**
>
> Ce document décrit l'architecture Google Apps Script + Google Sheets,
> **abandonnée le 26 août 2026**. Il est conservé pour mémoire uniquement.
>
> Le document de référence est `ANTIGRAVITY_BRIEF.md` à la racine du dépôt.

---

# PROMPT ANTIGRAVITY — CALCUL MENTAL SAINTHO

## 🎯 Mission

Construire **Calcul Mental Saintho**, une application web de maîtrise des tables de multiplication (tables 1 à 15) pour les élèves du Collège Saint-Honoré d'Eylau (Paris 16e).

**Le nom, la baseline, le logo et la palette sont centralisés dans un fichier de branding unique** (`frontend/src/branding.js` ou équivalent : `{ appName, baseline, logoPath, colors }`) : changer le nom de l'application doit se faire en éditant UNE seule valeur, sans toucher au reste du code (y compris le manifest PWA, généré depuis ce fichier). Nom par défaut : « Calcul Mental Saintho ». L'application est conçue pour les tables de multiplication mais l'architecture (modes, défis, classements) doit rester extensible à d'autres types de calcul mental (additions, compléments à 100, etc.) sans refonte. Les élèves apprennent, s'entraînent et **se défient entre eux** en calcul mental, sur **iPads gérés par MDM (Jamf School)** avec navigation internet restreinte aux domaines whitelistés.

L'application existe déjà sous forme de prototype React mono-fichier (fourni en annexe : `tables-multiplication.jsx`). **Règle absolue : aucune fonctionnalité du prototype ne doit être supprimée ou dégradée.** Tout doit être conservé, amélioré, et étendu selon ce cahier des charges.

---

## 🏗 Architecture imposée

### Vue d'ensemble

```
iPad (Safari/PWA)
   │  HTTPS — UN SEUL domaine whitelisté dans Jamf
   ▼
Vercel : calcul-mental-saintho.vercel.app (exemple)
   ├── Frontend statique (React + Vite, PWA)
   └── /api/* → Vercel Serverless Functions (proxy)
          │  fetch server-side avec clé secrète partagée
          ▼
Google Apps Script Web App (déployé "exécuter en tant que moi")
          │
          ▼
Google Sheet (base de données)
```

### Contraintes MDM critiques

- Les iPads **ne peuvent PAS** atteindre `script.google.com` ni aucun domaine `*.google.com` en navigation. Le MDM bloque par domaine.
- **Tout le trafic iPad doit passer par le domaine Vercel uniquement.** Le proxy Vercel relaie vers le GAS depuis le serveur (le MDM ne voit jamais cet appel).
- Le proxy est un simple relais : il ajoute un header `X-Proxy-Secret` (variable d'environnement Vercel) que le GAS vérifie, pour empêcher tout appel direct au GAS. Il transmet le body JSON tel quel et renvoie la réponse. ~30-50 lignes. Prévoir timeout 25s et gestion d'erreur propre (le GAS peut être lent au cold start).
- `accounts.google.com` (pour Sign in with Google) **sera peut-être bloqué aussi** → d'où le double système d'auth ci-dessous.

### Stack

- **Frontend** : React 18 + Vite, déployé sur Vercel. PWA (manifest + service worker) pour installation plein écran sur iPad. Pas de framework CSS lourd : CSS custom ou Tailwind, au choix, mais le rendu doit être exactement celui décrit dans la section Design.
- **Proxy** : Vercel Serverless Functions (`/api/gas.js` ou équivalent).
- **Backend** : Google Apps Script Web App, code versionné dans le repo (`/gas/`) avec instructions de déploiement via clasp. Une seule fonction `doPost(e)` qui route par `action`.
- **Base de données** : Google Sheet (structure imposée ci-dessous).
- **Repo** : GitHub, monorepo `frontend/` + `api/` + `gas/` + `docs/`.

---

## 🔐 Authentification — double système

### Plan A (prioritaire) : Sign in with Google

- Google Identity Services (GIS) côté client, bouton "Se connecter avec mon compte Saintho".
- Le frontend obtient un **ID token JWT** (pas de refresh token, pas de scope au-delà de l'identité).
- Le JWT est envoyé au GAS (via le proxy) qui :
  1. Vérifie la signature du token (endpoint tokeninfo de Google appelé côté GAS, ou vérification de l'audience + expiration),
  2. Vérifie que le domaine email = domaine Google Workspace de l'école (variable de config `ALLOWED_DOMAIN`),
  3. Crée/retrouve le profil élève dans le Sheet,
  4. Renvoie un **token de session applicatif** (UUID + expiration 12h, stocké dans le Sheet onglet `Sessions_Auth`), utilisé pour tous les appels suivants.
- Les élèves sont déjà connectés à leur compte école sur les iPads → connexion en un tap.

### Plan B (fallback, DOIT être opérationnel) : Roster + code PIN

- Bascule par simple flag de configuration (`AUTH_MODE = "google" | "pin"` dans la config frontend ET dans le Sheet onglet `Config`).
- L'onglet `Eleves` du Sheet contient le roster (email, nom, prénom, classe) pré-rempli par l'enseignant.
- L'élève saisit son email école (ou le choisit dans une liste par classe) + un **code PIN à 4 chiffres** attribué par l'enseignant (colonne du roster, généré en masse par une fonction GAS utilitaire).
- Même mécanisme de token de session ensuite.
- L'interface de login doit être **identique en apparence** dans les deux modes (seul le mécanisme change), pour que la bascule soit invisible.

⚠️ Si le Plan A s'avère une usine à gaz (blocage MDM de `accounts.google.com`, problèmes de vérification JWT côté GAS), on assume le Plan B sans regret. Les deux doivent être codés et testables dès la V1.

---

## 📊 Modèle de données — Google Sheet

Onglets (le GAS crée la structure automatiquement au premier lancement si absente, via une fonction `setupSheet()`) :

| Onglet | Colonnes |
|---|---|
| `Config` | clé, valeur (AUTH_MODE, ALLOWED_DOMAIN, admins initiaux, tables actives par défaut, durées défis, barème points, etc.) |
| `Profs` | email, nom, rôle (admin/prof), classes_affectees |
| `Journal_Admin` | date, email_acteur, action, détail |
| `Eleves` | id, email, nom, prénom, classe, pin (mode B), tables_autorisees (ex: "1-10" ou "1-15"), avatar_emoji, actif (oui/non), date_creation, derniere_connexion |
| `Sessions_Auth` | token, eleve_id, expiration |
| `Sessions_Jeu` | id, eleve_id, date, mode (libre/chrono/defi), tables, nb_questions, score, erreurs (JSON compact), duree_s, serie_max, sans_faute_max |
| `Maitrise` | eleve_id, fait (ex: "3_7"), niveau (-2 à +4), derniere_vue |
| `Records` | eleve_id, meilleure_serie_sans_faute, meilleur_score_1min, meilleur_score_2min, meilleur_score_3min, plus_haute_table_montee |
| `Defis` | id, code_court (5 car.), type, createur_id, classe, statut (ouvert/en_cours/termine), questions (JSON, générées serveur), participants (JSON: id → {score, temps, serie}), date_creation, date_expiration |
| `Badges` | eleve_id, badge_id, date_obtention |
| `Classements_Cache` | type, periode, classe, données (JSON), date_calcul (recalculé max toutes les 5 min) |

**Performance GAS** : minimiser les lectures/écritures Sheet (batch avec `getValues`/`setValues`, cache via `CacheService` pour les classements et profils, LockService pour les écritures concurrentes sur les défis). Objectif : réponse API < 2s en usage normal.

---

## 🔌 API GAS (via proxy `/api/gas`)

Toutes les requêtes : `POST` JSON `{ action, token?, payload }`. Réponses : `{ ok: true, data }` ou `{ ok: false, error }`.

Actions minimales :
- `login_google` (payload: idToken) / `login_pin` (payload: email, pin) → { sessionToken, profil }
- `get_profile` → profil + records + badges + maîtrise
- `save_session` (payload: résultats de partie) → met à jour Sessions_Jeu, Maitrise, Records, Badges ; renvoie les badges nouvellement gagnés
- `get_leaderboards` (payload: classe, type, periode) → classements (depuis le cache)
- `create_challenge` (payload: type, params) → { defi, code_court } — **les questions sont générées côté GAS** (anti-triche : même série pour tous les participants)
- `join_challenge` (payload: code_court) → defi + questions
- `submit_challenge` (payload: defi_id, résultats) → classement du défi mis à jour (horodatage serveur pour le temps de référence)
- `get_class_challenges` → défis ouverts de ma classe
- `teacher_*` / `admin_*` : actions d'administration (protégées par l'onglet `Profs` : vérification du rôle et du périmètre de classes ; journalisation automatique dans `Journal_Admin`)

---

## 🧠 Fonctionnalités — TOUT le prototype conservé + extensions

### 1. Mode Apprendre (méthode Singapour / CPA) — conservé intégralement

- Sélecteur de table **1 à 15** (les tables 11-15 apparaissent selon `tables_autorisees` du profil ; l'enseignant peut les débloquer par élève ou par classe).
- Liste des 10 (ou 15) faits de la table, mode "Cacher" pour l'auto-test par tap.
- **Comptage par sauts** interactif (les multiples s'illuminent jusqu'au fait sélectionné).
- **3 visualisations CPA** commutables par onglets :
  - **Groupes** (concret) : N groupes en pointillés contenant M jetons,
  - **Tableau/Array** (imagé) : grille de points lignes × colonnes,
  - **Barre** (abstrait) : modèle en barres numéroté, couleurs par rangée.
- **Toggle commutativité** : inverse a×b ↔ b×a et la visualisation pivote.
- **Astuces mentales par table** (×2 doubler, ×4 doubler deux fois, ×5 moitié×10, ×6 = ×5+1 fois, ×7 = ×5+×2, ×8 doubler trois fois, ×9 = ×10−1 fois + astuce des doigts, ×10 zéro). **Ajouter des astuces pour 11 à 15** : ×11 (chiffres répétés jusqu'à 9, puis astuce de la somme au milieu), ×12 = ×10+×2, ×15 = ×10+moitié, ×13/×14 par décomposition ×10+×3/×4.
- Pour les visualisations avec tables >10 : adapter la densité des points/cellules pour rester lisible sur iPad.

### 2. Mode S'entraîner (solo) — conservé + amélioré

- Sélection des tables (multi-choix), nombre de questions **10 / 20 / 40 / ∞**, chrono optionnel **1 / 2 / 3 min** (le chrono remplace le nombre de questions).
- **Compteur de progression permanent et bien visible : « 3/40 »**, s'incrémentant à chaque réponse, + barre de progression. En chrono : questions répondues + anneau de temps restant (rouge sous 10s).
- **Quiz adaptatif** : pondération des questions par niveau de maîtrise (faits faibles ×4, inconnus ×2, maîtrisés ×1), boost immédiat des faits ratés dans la session (+3, plafond 8), et **persistance de la maîtrise par élève** dans le Sheet → l'adaptativité survit entre sessions et appareils.
- **Indices stratégiques** (bouton 💡) : décomposition intelligente selon le fait (jamais la réponse brute) — reprendre la fonction `makeHint` du prototype et l'étendre aux tables 11-15.
- **Série sans faute en vedette** : compteur 🔥 visible en permanence, qui grossit/anime aux paliers 10, 20, 30, 50, 100. Record personnel sauvegardé et affiché. Une erreur remet à zéro.
- Feedback immédiat : animation pop (bonne réponse, 700ms) / shake + correction affichée (erreur, 1500ms). En mode chrono/défi : transitions accélérées à ~250ms.
- Écran de résultats : étoiles (≥90% = 3, ≥70% = 2, ≥50% = 1), stats (score, meilleure série, série sans faute, temps, moyenne s/question en chrono), liste des erreurs avec la réponse donnée, bouton **« Réviser mes erreurs »** (relance ciblée sur les tables ratées).
- **Grille de maîtrise 15×15** (rouge → jaune → vert, gris = non testé), accessible depuis le profil et le setup. Symétrique (3×7 = 7×3 = même cellule).

### 3. Mode Défis (nouveau — cœur social de l'app)

Cinq types de défis. Chaque défi = questions **générées côté serveur** (mêmes pour tous), code court à 5 caractères à partager, ou visible dans « Défis de ma classe ». Horodatage côté serveur au démarrage et à la soumission.

1. **⚡ Sprint** — 20 questions identiques ; classement = temps total + pénalité (+3s par erreur).
2. **🎯 Sans faute** — questions en flux ; la première erreur arrête le joueur ; gagne la plus longue série.
3. **⏱ Contre-la-montre** — 2 minutes ; gagne le plus de bonnes réponses (les erreurs déduisent 1 point, plancher 0).
4. **🧗 Montée des tables** — paliers : table 2 → 3 → … → 15 ; chaque palier = 5 questions avec ≥4 justes pour passer ; gagne le plus haut palier (départage au temps).
5. **👥 Défi de classe** — créé par l'enseignant ; toute la classe, mêmes questions, classement en direct (polling léger toutes les 5-10s, pas de websocket).

Écran de résultat de défi : podium animé, comparatif question par question avec l'adversaire (Sprint), confettis pour le gagnant.

### 4. Classements

- **Par classe** et **général collège**, période **semaine** (reset lundi 00h, calculé à la volée sur les données de la semaine) et **tous les temps**.
- **Trois tableaux distincts** pour ne décourager personne :
  1. 🔥 **Meilleures séries sans faute**
  2. ⏱ **Vitesse** (meilleur score en contre-la-montre 2 min)
  3. 🏆 **Points de la semaine** (points gagnés en sessions + défis : barème simple, ex. 1pt/bonne réponse, bonus défis)
- Affichage : top 10 + « ta position » toujours visible même hors top 10. Avatars emoji choisis par les élèves.

### 5. Badges

Paliers de série sans faute (10/20/30/50/100), tables maîtrisées (toute une table en vert), assiduité (3 jours de suite, 7 jours), défis gagnés (1/5/20), montée (atteindre table 10/12/15), vitesse (moyenne < 3s puis < 2s par question). Notification visuelle sympa à l'obtention (pas de spam).

### 6. Espace d'administration multi-profs (rôles)

Deux rôles, gérés dans l'onglet `Profs` du Sheet (email, nom, rôle, classes_affectees) :

- **Admin** : accès total. Gère les autres profs (ajout/retrait, affectation de classes), les paramètres globaux (mode d'auth A/B, barème de points, durées des défis, message d'accueil, période de reset des classements), et voit toutes les classes. Consulte un **journal des actions d'administration** (onglet `Journal_Admin` : qui, quoi, quand) alimenté automatiquement par le GAS pour toute action d'écriture admin/prof.
- **Prof** : accès limité à ses classes affectées.

Fonctionnalités du tableau de bord (selon rôle) :
- **Roster élèves** : import (collage CSV/liste), ajout/modification, affectation de classe, réinitialisation de PIN individuel, génération des PIN en masse (mode B), désactivation d'un compte.
- **Tables autorisées** : par classe ou par élève.
- **Défis de classe** : création, clôture anticipée, suppression.
- **Modération** : remise à zéro d'un record suspect, suppression d'une session aberrante (anti-triche manuelle).
- **Suivi pédagogique** : heatmap de maîtrise agrégée par classe (quels faits posent problème), liste des élèves avec dernière activité, records et progression, export CSV des sessions.

Côté API : toutes les actions `teacher_*` et `admin_*` vérifient le rôle ET le périmètre de classes de l'appelant. La liste initiale des admins est amorcée dans `Config` (emails), puis la gestion se fait depuis l'interface.

---

## ⌨️ Ergonomie de saisie — priorité absolue (mode course)

Les élèves se chronomètrent entre eux : **chaque dixième de seconde de friction de saisie est inacceptable.**

- **Pavé numérique custom plein écran**, boutons ≥ 64px de côté, espacés, zone morte anti-double-tap. Jamais le clavier iOS natif (pas d'`<input>` focusable ; gestion du clavier physique en bonus pour desktop).
- **Validation automatique intelligente (activée par défaut, désactivable dans les réglages)** : la réponse est validée automatiquement dès que la saisie atteint le nombre de chiffres de la bonne réponse **ou** dès qu'aucune réponse plausible plus longue n'existe. Exemples : question 3×4 (réponse 12, 2 chiffres) → validation auto au 2e chiffre saisi ; question 5×2 (réponse 10) → si l'élève tape "1" puis "0", validation auto ; s'il tape "7" (1 chiffre, mais la réponse en a 2), attendre le 2e chiffre ou le ✓. Le bouton ✓ reste toujours présent en fallback.
- `touch-action: manipulation` partout, viewport verrouillé (pas de zoom, pas de scroll élastique), `user-select: none` sur les zones de jeu.
- **Retour haptique** (`navigator.vibrate` si dispo — noter que Safari iOS ne le supporte pas : prévoir un flash visuel très rapide + son optionnel court en remplacement, avec toggle son on/off persistant).
- Transitions entre questions : 700ms en mode apprentissage/libre, **250ms max en mode chrono et défi**.
- Correction d'erreur : bouton ⌫ large, et **swipe gauche sur la zone de réponse = effacer tout** (geste rapide).
- Cible : un élève entraîné doit pouvoir répondre à une question en < 2 secondes tout compris.

---

## 🎨 Design — identité Saintho

- **Nom affiché : celui du fichier de branding** (défaut « Calcul Mental Saintho ») — header avec le logo du collège (fichier attendu : `/public/logo-saintho.png`, prévoir un fallback élégant — monogramme "SHE" stylisé — si le fichier est absent).
- Baseline : *« Le défi des tables — Collège Saint-Honoré d'Eylau »*.
- **Palette** : partir de l'identité Saintho — **bleu marine profond (#1B2A4A env.), or/doré (#C9A227 env.), ivoire (#FAF6EE)** — avec des accents vifs pour la gamification (corail pour l'action, menthe pour la réussite, ciel pour l'apprentissage). Le prototype actuel est pastel/enfantin : monter en gamme vers un rendu **premium et moderne** adapté à des collégiens (11-15 ans), pas maternelle.
- Typographie : une display ronde et impactante pour les chiffres et titres (type Baloo 2, Clash Display ou équivalent), une sans lisible pour le texte (Nunito, Inter).
- Effets : cartes avec ombres douces et profondeur, glassmorphism léger sur les overlays, micro-animations soignées (pop, shake, pulse de série), **confettis sur records et victoires de défis**, transitions de pages fluides. `prefers-reduced-motion` respecté.
- Mode compact paysage ET portrait iPad, responsive jusqu'au desktop (le prof projettera au TBI).
- Écran d'accueil : logo + titre + 3 grandes cartes (Apprendre / S'entraîner / Défis) + accès profil, classements, réglages.
- Tout en **français**, ton encourageant, jamais culpabilisant sur l'erreur (l'erreur affiche la stratégie, pas juste « faux »).

---

## 📦 Livrables attendus

1. **Monorepo GitHub** structuré : `frontend/` (React+Vite), `api/` (fonctions Vercel), `gas/` (code Apps Script + config clasp), `docs/`.
2. **README** complet : installation, variables d'environnement (`GAS_URL`, `PROXY_SECRET`, `GOOGLE_CLIENT_ID`, `AUTH_MODE`), déploiement Vercel pas-à-pas, déploiement GAS pas-à-pas (avec clasp ET manuellement via l'éditeur), création du Sheet (automatique via `setupSheet()`), création du Client ID OAuth (mode A), génération des PIN (mode B).
3. **Documentation Jamf** (`docs/mdm.md`) : le(s) domaine(s) exact(s) à whitelister (domaine Vercel ; + `accounts.google.com` et domaines GIS si mode A), et procédure de test sur un iPad pilote.
4. **Données de démo** : script GAS pour peupler le Sheet avec une classe fictive et des données de test.
5. **Plan de tests manuels** (`docs/tests.md`) : parcours élève complet, parcours défi à 2 appareils, parcours enseignant, test de bascule AUTH_MODE.

## 🚦 Ordre de développement suggéré

1. Squelette monorepo + proxy Vercel + GAS `doPost` minimal + `setupSheet()` → prouver la chaîne iPad→Vercel→GAS→Sheet.
2. Auth (B d'abord car sans dépendance externe, puis A).
3. Portage/amélioration du mode S'entraîner (avec compteur x/40, sans-faute, saisie optimisée) + persistance maîtrise.
4. Mode Apprendre (portage CPA + tables 11-15 + nouvelles astuces).
5. Défis (Sprint et Contre-la-montre d'abord, puis Sans faute, Montée, Classe).
6. Classements + badges + profil.
7. Espace d'administration (rôles admin/prof, roster, journal).
8. Polish design final, PWA, confettis, sons.

## ⚠️ Règles d'or

- **Ne jamais dégrader une fonctionnalité du prototype** sans validation explicite.
- Aucun secret dans le code client (le `PROXY_SECRET` vit uniquement dans les env Vercel et les Script Properties du GAS).
- Le GAS ne fait confiance à rien : validation de session sur chaque action, validation des payloads.
- Anti-triche raisonnable (questions serveur, horodatage serveur, plafonds de plausibilité sur les temps soumis) sans paranoïa excessive : c'est un collège, pas un casino.
- Performances : l'app doit rester fluide sur des iPads de plusieurs générations ; bundle initial < 300KB gzippé si possible, lazy-loading des écrans secondaires.
- Code commenté en français, lisible par un enseignant-développeur qui maintiendra le projet en Google Apps Script et React.

---

## 📎 Annexe

Joindre au contexte Antigravity le fichier `tables-multiplication.jsx` (prototype existant) comme référence fonctionnelle : logique adaptative (`newQuestion` pondérée), génération d'indices (`makeHint`), astuces (`TIPS`), visualisations CPA (GroupsViz, ArrayViz, BarViz), grille de maîtrise, chrono avec anneau SVG, écrans et enchaînements. Le comportement de référence doit être reproduit puis surpassé.
