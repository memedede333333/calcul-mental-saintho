> ⚠️ **DOCUMENT ARCHIVÉ — NE PAS SUIVRE**
>
> Ce document décrit l'architecture Google Apps Script + Google Sheets,
> **abandonnée le 26 août 2026**. Il est conservé pour mémoire uniquement.
>
> Le document de référence est `ANTIGRAVITY_BRIEF.md` à la racine du dépôt.

---

# 🧮 Calcul Mental Saintho — Audit Complet & Documentation de Reprise

> **Date** : 25 août 2026  
> **Objectif** : Ce document fournit toute l'information nécessaire pour reprendre le développement du projet, corriger les bugs identifiés, et finaliser le déploiement.

---

## 1. Architecture du Projet

```
Calcul mental/
├── frontend/                   # React (Vite)
│   └── src/
│       ├── App.jsx             # Routeur principal (42 lignes)
│       ├── api.js              # Client API → Vercel proxy (76 lignes)
│       ├── branding.js         # Config branding (logo, couleurs)
│       ├── main.jsx            # Point d'entrée React
│       ├── screens/
│       │   ├── Login.jsx       # Connexion email+PIN (282 lignes)
│       │   ├── Home.jsx        # Menu principal (3131 bytes)
│       │   ├── Learn.jsx       # Mode apprentissage (8430 bytes)
│       │   ├── Practice.jsx    # Mode entraînement (22630 bytes)
│       │   ├── Challenges.jsx  # Mode défis (744 lignes)
│       │   ├── Leaderboards.jsx # Classements (212 lignes)
│       │   ├── Profile.jsx     # Profil élève (214 lignes)
│       │   └── Admin.jsx       # Administration (24944 bytes)
│       ├── components/
│       │   ├── Keypad.jsx
│       │   ├── Layout.jsx
│       │   └── TimerRing.jsx
│       ├── logic/
│       │   ├── questions.js    # Génération de questions
│       │   └── mastery.js      # Calcul de maîtrise
│       └── styles/
│           └── index.css       # Design system complet
├── gas/
│   ├── Code.gs                 # Backend Google Apps Script (791 lignes)
│   ├── appsscript.json         # Manifest GAS
│   └── .clasp.json             # Lien vers le projet GAS
├── api/
│   ├── gas.js                  # Vercel serverless proxy (91 lignes)
│   └── test.js                 # Endpoint de diagnostic (61 lignes)
└── vercel.json                 # Config Vercel (rewrites, CORS)
```

### Flux de données

```
iPad élève → Vercel (calcul-mental-saintho.vercel.app)
  → /api/gas (proxy serverless)
    → POST script.google.com (302 redirect)
      → GET script.googleusercontent.com (JSON result)
    ← JSON response
  ← JSON response
← React UI
```

> **CONTRAINTE CRITIQUE** : Les iPads de l'école bloquent `script.google.com` via MDM. Le frontend DOIT être hébergé sur Vercel, et Vercel fait proxy vers GAS. Le redirect 302 de GAS est géré manuellement avec `redirect: 'manual'`.

---

## 2. Configuration & Déploiement

### Vercel
- **URL** : https://calcul-mental-saintho.vercel.app
- **GitHub** : memedede333333/calcul-mental-saintho (auto-deploy on push)
- **Variables d'environnement (production)** :
  - `GAS_URL` = `https://script.google.com/macros/s/AKfycbzDLaXM2mtXiMBPtkN58hjVdZyxIZ6Po3Fj-dn9_AsY9e-w1zwEOrCFRZc0IHqu5zT7og/exec`
  - `PROXY_SECRET` = `Saintho2026-CM!secure` (⚠️ non utilisé actuellement, voir Bug #3)

### Google Apps Script
- **ID projet** : `1Ts8341OaKMX3_IgEzWBdVV4Rjzz4QrNECm2KdMn4rRyG-fRQFhbD-jc9`
- **Déploiement** : Web App, "Exécuter en tant que Moi", "Tout le monde"
- **Script Properties** :
  - `PROXY_SECRET` = `Saintho2026-CM!secure`
  - `ALLOWED_DOMAIN` = `saintho.fr`

### Google Sheet
- **ID** : `1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4`
- **Onglets** : Config, Eleves, Profs, Sessions_Auth, Sessions_Jeu, Records, Badges, Maitrise, Defis, Defis_Participants, Journal_Admin

### Clasp
- `clasp push --force` pousse le code mais NE MET PAS À JOUR le déploiement Web App
- Il faut aller dans l'interface GAS → Déployer → Gérer → ✏️ → "Nouvelle version" → Déployer
- `clasp deploy` crée un NOUVEAU déploiement (URL différente) avec accès "Moi uniquement"

---

## 3. BUGS IDENTIFIÉS — Liste Exhaustive

### 🔴 CRITIQUES

#### Bug #1 — Première connexion auto-login sans vérification du nouveau PIN
**Fichier** : `gas/Code.gs` lignes 211-243, `frontend/src/screens/Login.jsx` lignes 38-48  
**Symptôme** : L'utilisateur entre email + 3333 → un nouveau PIN est généré et envoyé par email → MAIS l'utilisateur est connecté immédiatement (session créée) sans jamais avoir à entrer le nouveau PIN reçu.  
**Attendu** : L'utilisateur devrait recevoir le PIN par mail, PUIS devoir reconnecter avec ce nouveau PIN.  
**Cause** : `Code.gs` `loginPin()` crée un `sessionToken` dans le flux firstLogin (ligne 227-230) et le renvoie avec `firstLogin: true`. Le frontend affiche le message 3 secondes puis appelle `onLogin()` automatiquement (ligne 46).  
**Fix suggéré** : Ne PAS créer de session lors de la première connexion. Renvoyer `{ok: true, firstLogin: true, message: "..."}` SANS sessionToken. Le frontend doit rediriger vers le formulaire de login pour forcer la saisie du nouveau PIN.

#### Bug #2 — Fallback silencieux vers le mode démo sur erreur
**Fichier** : `frontend/src/screens/Login.jsx` lignes 54-65  
**Symptôme** : Si l'API renvoie une erreur réseau (timeout, 502...), le `catch` crée un profil local "démo" et connecte l'utilisateur comme si de rien n'était. L'utilisateur pense être connecté normalement mais utilise des données locales fictives.  
**Cause** : Le `catch` dans `handleLogin` génère un faux profil à partir de l'email saisi.  
**Fix suggéré** : Afficher un message d'erreur dans le `catch` au lieu de créer une session démo. Le mode démo devrait être uniquement accessible via le bouton "Mode démo (sans compte)".

#### Bug #3 — PROXY_SECRET non synchronisé
**Fichier** : `gas/Code.gs` ligne 20, `api/gas.js` ligne 44  
**Symptôme** : Le secret dans les Script Properties de GAS ne correspond pas à celui dans Vercel.  
**Cause** : Les properties du script sont runtime, mais la valeur `Saintho2026-CM!secure` ne correspondait pas. Le fix actuel a été de RETIRER le `_secret` du body dans le proxy (ligne 44). Cela signifie que l'API GAS est actuellement accessible sans aucune protection par secret.  
**Fix suggéré** : Resynchroniser les secrets OU supprimer complètement la logique de secret dans `Code.gs` puisque le proxy Vercel fait déjà office de barrière.

#### Bug #4 — Classements 100% hardcodés avec données démo
**Fichier** : `frontend/src/screens/Leaderboards.jsx` lignes 10-35, 49  
**Symptôme** : Les classements affichent toujours les mêmes données fictives (Alice D., Clara B., David P...) indépendamment des vrais résultats.  
**Cause** : `DEMO_DATA` est hardcodé et utilisé directement (`const data = DEMO_DATA[tab]`). L'API `getLeaderboards` existe dans `api.js` mais n'est JAMAIS appelée dans le composant.  
**Cause côté backend** : `computeLeaderboard()` dans `Code.gs` (ligne 719-722) est un stub qui renvoie `{ entries: [] }`.  
**Fix** : Implémenter `computeLeaderboard()` et appeler `api.getLeaderboards()` dans le composant avec un `useEffect`.

#### Bug #5 — Profil avec badges et records hardcodés
**Fichier** : `frontend/src/screens/Profile.jsx` lignes 36-39, 89-101  
**Symptôme** : Les badges affichés sont toujours `['streak_10', 'speed_3s', 'days_3']` (hardcodés). Les records sont tous à 0 (hardcodés).  
**Cause** : `mastery` est `useState({})` jamais peuplé. `userBadges` est une constante locale. L'API `getProfile()` existe mais n'est jamais appelée.  
**Fix** : Appeler `api.getProfile()` dans un `useEffect` et utiliser les données réelles pour les badges, records et maîtrise.

### 🟡 IMPORTANTS

#### Bug #6 — Défis multiplayer = stubs
**Fichier** : `gas/Code.gs` lignes 726-740  
**Symptôme** : Créer/rejoindre/soumettre un défi renvoie `"Défis bientôt disponibles"`.  
**Cause** : Les 4 fonctions de défi (`createChallenge`, `joinChallenge`, `submitChallenge`, `getClassChallenges`) sont des stubs vides.  
**Impact** : Le bouton "Rejoindre" et le mode "Défi de classe" ne font rien.  
**Fix** : Implémenter les fonctions côté GAS utilisant les onglets `Defis` et `Defis_Participants`.

#### Bug #7 — Tables de défi hardcodées, config ignorée
**Fichier** : `frontend/src/screens/Challenges.jsx` lignes 266, 345, 419  
**Symptôme** : L'écran de configuration permet de sélectionner des tables, mais les composants de jeu (SprintPlay, FlawlessPlay, CountdownPlay) utilisent toujours `[2,3,4,5,6,7,8,9,10]` en dur.  
**Cause** : La prop `tables` de ChallengeConfig n'est pas transmise à ChallengePlay.  
**Fix** : Passer les tables sélectionnées en prop à travers la chaîne `Config → Play → *Play`.

#### Bug #8 — `ALLOWED_DOMAIN` fallback incorrect
**Fichier** : `gas/Code.gs` ligne 21  
**Symptôme** : Le domaine par défaut (fallback) est `saintho.org` au lieu de `saintho.fr`.  
**Impact** : Si la Script Property n'est pas définie, la connexion Google rejettera les emails @saintho.fr.  
**Fix** : Changer `'saintho.org'` en `'saintho.fr'`.

#### Bug #9 — Pas de déconnexion côté serveur
**Fichier** : `frontend/src/screens/Profile.jsx` ligne 207, `frontend/src/api.js`  
**Symptôme** : "Se déconnecter" efface le state React et le localStorage, mais la session reste dans `Sessions_Auth` côté GAS.  
**Impact** : Accumulation de sessions dans le Google Sheet. Pas de vrai logout côté serveur.  
**Fix** : Ajouter une action `logout` dans `Code.gs` qui supprime la ligne dans `Sessions_Auth`.

#### Bug #10 — Résultats de défi non sauvegardés
**Fichier** : `frontend/src/screens/Challenges.jsx` composant `ChallengeResults`  
**Symptôme** : Après un défi (Sprint, Sans faute, etc.), les résultats sont affichés localement mais JAMAIS envoyés au serveur.  
**Cause** : `api.saveSession()` n'est appelée nulle part dans Challenges.jsx.  
**Fix** : Appeler `api.saveSession()` dans `onDone` avec les résultats du défi.

#### Bug #11 — Changement d'avatar non persisté
**Fichier** : `frontend/src/screens/Profile.jsx` ligne 67  
**Symptôme** : L'avatar change visuellement mais n'est pas sauvegardé dans le Google Sheet.  
**Fix** : Ajouter un appel API pour mettre à jour le profil côté serveur.

### 🟢 MINEURS

#### Bug #12 — `useEffect` sans tableau de dépendances dans les défis
**Fichier** : `frontend/src/screens/Challenges.jsx` lignes 308-316, 381-389, 480-488, 583-591  
**Symptôme** : Les event listeners clavier sont réattachés à chaque render, ce qui peut causer des problèmes de performance et des doubles inputs.  
**Fix** : Ajouter les bonnes dépendances ou utiliser des refs.

#### Bug #13 — Hook `useEffect` après un `return` conditionnel
**Fichier** : `frontend/src/screens/Challenges.jsx` ligne 639-649  
**Symptôme** : `ChallengeResults` fait `if (!result) return null;` AVANT le `useEffect` pour les confetti. C'est une violation des Rules of Hooks de React.  
**Fix** : Déplacer le guard après tous les hooks.

#### Bug #14 — `populateDemo()` utilise `@saintho.org`
**Fichier** : `gas/Code.gs` lignes 773-777  
**Symptôme** : Les emails de démo sont en `@demo.saintho.org` au lieu de `@saintho.fr`.  
**Impact** : Mineur (données de test), mais crée de la confusion.

#### Bug #15 — `generatePinsForClass()` écrit dans une colonne 'pin' qui n'existe pas
**Fichier** : `gas/Code.gs` lignes 744-761  
**Symptôme** : Cette fonction cherche une colonne `pin` dans le sheet Eleves, mais le système utilise `pin_hash` et `pin_salt`.  
**Impact** : La fonction est inutilisable en l'état.

#### Bug #16 — Le mode Practice ne sauvegarde probablement pas non plus
**Fichier** : `frontend/src/screens/Practice.jsx`  
**Impact** : Les sessions d'entraînement ne sont peut-être pas envoyées au serveur (à vérifier, le fichier fait 22k, non audité en détail).

---

## 4. Code Source Complet

### 4.1 Backend — `gas/Code.gs` (791 lignes)

Le fichier est trop long pour être inclus in extenso. Voici les fonctions clés :

| Fonction | Ligne | Description | État |
|----------|-------|-------------|------|
| `doGet` | 25 | Diagnostic GET (debug) | ✅ Fonctionne |
| `doPost` | 36 | Routeur principal | ✅ Fonctionne |
| `loginPin` | 182 | Auth email+PIN | 🔴 Bug #1 (auto-login) |
| `forgotPin` | 275 | Reset PIN par mail | ✅ OK |
| `adminResetPin` | 320 | Reset PIN admin | ✅ OK |
| `sendPinEmail` | 367 | Envoi PIN par mail | ✅ OK |
| `loginGoogle` | 406 | OAuth Google | ⚠️ Non testé |
| `validateSession` | 466 | Check token | ✅ OK |
| `getProfile` | 496 | Profil complet | ✅ OK |
| `saveSession` | 526 | Sauvegarde session jeu | ✅ OK |
| `getLeaderboards` | 703 | Classements | 🔴 Stub vide |
| `createChallenge` | 726 | Créer un défi | 🔴 Stub |
| `joinChallenge` | 730 | Rejoindre un défi | 🔴 Stub |
| `submitChallenge` | 734 | Soumettre résultat défi | 🔴 Stub |
| `getClassChallenges` | 738 | Défis de classe | 🔴 Stub |
| `computeLeaderboard` | 719 | Calcul classement | 🔴 Stub |

### 4.2 Proxy Vercel — `api/gas.js`

```javascript
// POST vers GAS avec gestion manuelle du redirect 302
const response = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),  // ⚠️ _secret retiré (Bug #3)
    redirect: 'manual',  // CRITIQUE: GAS fait un 302
});
// Si 302 : GET sur l'URL de redirect → JSON result
```

### 4.3 Client API — `frontend/src/api.js`

- Toutes les requêtes passent par `POST /api/gas`
- Token de session stocké dans `localStorage` (clé: `saintho_token`)
- Actions: `login_pin`, `forgot_pin`, `admin_reset_pin`, `get_profile`, `save_session`, `get_leaderboards`, `create_challenge`, `join_challenge`, `submit_challenge`, `get_class_challenges`

---

## 5. Google Sheet — Structure des Données

### Onglet `Eleves`
| Colonne | Description |
|---------|-------------|
| id | UUID court (8 chars) |
| email | prenom.nom@saintho.fr |
| nom | Nom de famille |
| prénom | Prénom |
| classe | Ex: 6A, 6B, 5A... |
| pin_hash | SHA-256(salt + ':' + pin) |
| pin_salt | UUID 16 chars |
| premiere_connexion | 'oui' ou 'non' |
| tables_autorisees | Ex: '1-10' |
| avatar_emoji | Emoji avatar |
| actif | 'oui' ou 'non' |
| date_creation | ISO timestamp |
| derniere_connexion | ISO timestamp |

### Onglet `Sessions_Auth`
| token | user_id | email | expiration |

### Onglet `Sessions_Jeu`
| session_id | user_id | date | mode | tables | nb_questions | score | erreurs | duree_s | serie_max | sans_faute_max |

### Onglet `Records`
| user_id | meilleure_serie | score_60s | score_120s | score_180s | ... |

### Onglet `Badges`
| user_id | badge_id | date_obtention |

### Onglet `Maitrise`
| user_id | fait (ex: '3_7') | niveau | derniere_maj |

### Onglet `Defis` (non implémenté)
| defi_id | createur_id | type | date_creation | code_court | status | questions_json | config_json |

### Onglet `Defis_Participants` (non implémenté)
| defi_id | user_id | date_soumission | resultats_json | score | temps |

### Onglet `Profs`
| email | nom | role | classes |

---

## 6. Priorités Recommandées

### Phase 1 — Corrections Critiques (urgentes)
1. **Bug #1** : Corriger le flux de première connexion (ne pas auto-login)
2. **Bug #2** : Supprimer le fallback démo silencieux dans Login.jsx
3. **Bug #3** : Décider et implémenter la stratégie de sécurité du proxy
4. **Bug #8** : Corriger le domaine fallback `saintho.org` → `saintho.fr`

### Phase 2 — Intégration Données Réelles
5. **Bug #4** : Implémenter `computeLeaderboard()` et connecter les classements à l'API
6. **Bug #5** : Connecter le profil à l'API (`getProfile()`)
7. **Bug #10** : Sauvegarder les résultats de défis
8. **Bug #7** : Passer les tables sélectionnées aux composants de jeu

### Phase 3 — Fonctionnalités Manquantes
9. **Bug #6** : Implémenter le système de défis en ligne (create, join, submit)
10. **Bug #9** : Ajouter un vrai logout côté serveur
11. **Bug #11** : Persistance du changement d'avatar

### Phase 4 — Qualité de Code
12. **Bug #12** : Corriger les useEffect sans dépendances
13. **Bug #13** : Corriger la violation des Rules of Hooks
14. **Bug #14-16** : Nettoyage des fonctions obsolètes

---

## 7. Commandes Utiles

```bash
# Frontend
cd frontend && npm run dev       # Dev local
cd frontend && npm run build     # Build production

# GAS
cd gas && npx clasp push --force # Push code vers GAS
cd gas && npx clasp deploy       # Créer un nouveau déploiement
cd gas && npx clasp open         # Ouvrir l'éditeur GAS

# Vercel
git push                         # Auto-deploy
vercel env ls production         # Voir les variables
vercel logs                      # Voir les logs

# Test API directement
curl -s -X POST "https://calcul-mental-saintho.vercel.app/api/gas" \
  -H "Content-Type: application/json" \
  -d '{"action":"login_pin","payload":{"email":"prenom.nom@saintho.fr","pin":"3333"}}'

# Diagnostic
curl -s "https://calcul-mental-saintho.vercel.app/api/test"
```
