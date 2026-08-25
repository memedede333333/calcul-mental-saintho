# Calcul Mental Saintho

Application de maîtrise des tables de multiplication (1-15) pour le Collège Saint-Honoré d'Eylau (Paris 16e). Méthode Singapour : comprendre, visualiser, maîtriser.

## 📁 Structure du projet

```
frontend/         → React 18 + Vite (PWA)
  src/
    branding.js   → Nom, couleurs, logo (source unique)
    api.js        → Client API vers le proxy
    components/   → Composants réutilisables (Keypad, TimerRing, MasteryGrid)
    screens/      → Écrans (Home, Learn, Practice)
    logic/        → Logique métier (questions, maîtrise)
    styles/       → Design system CSS
  public/         → Logo, manifest PWA
api/              → Vercel Serverless Functions (proxy → GAS)
gas/              → Google Apps Script (backend + base de données)
docs/             → Documentation Jamf MDM, plan de tests
```

## 🚀 Installation et lancement local

### Prérequis
- Node.js 18+
- npm

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Variables d'environnement (Vercel)
| Variable | Description |
|---|---|
| `GAS_URL` | URL de la Web App Google Apps Script déployée |
| `PROXY_SECRET` | Secret partagé entre le proxy Vercel et le GAS |
| `GOOGLE_CLIENT_ID` | (Plan A) Client ID OAuth pour Sign in with Google |

### Déploiement Vercel
```bash
# Depuis la racine du projet
vercel
```

## 🔧 Déploiement Google Apps Script

### Méthode 1 : Éditeur Apps Script (recommandé pour démarrer)
1. Créer un Google Sheet
2. Extensions > Apps Script
3. Copier-coller le contenu de `gas/Code.gs`
4. Définir les propriétés du script :
   - `PROXY_SECRET` : la même valeur que dans Vercel
   - `ALLOWED_DOMAIN` : domaine Google Workspace (ex: `saintho.org`)
5. Déployer > Nouvelle deployment > Application Web
   - Exécuter en tant que : Moi
   - Accès : Tout le monde
6. Copier l'URL de déploiement → c'est la valeur de `GAS_URL`

### Méthode 2 : clasp
```bash
npm install -g @google/clasp
clasp login
cd gas
clasp create --type sheets
clasp push
clasp deploy
```

### Initialisation de la base de données
Exécuter `setupSheet()` depuis l'éditeur Apps Script pour créer automatiquement tous les onglets avec les en-têtes.

Pour les données de démo : exécuter `populateDemo()`.

### Génération des PIN (Mode B)
Exécuter `generatePinsForClass('6A')` depuis l'éditeur pour générer les PIN à 4 chiffres.

## 🔐 Authentification

### Plan A : Sign in with Google
Les élèves se connectent avec leur compte Google Workspace école. Nécessite un Client ID OAuth.

### Plan B : Roster + PIN
L'enseignant importe le roster des élèves et attribue des codes PIN à 4 chiffres. Pas de dépendance externe.

Bascule via `AUTH_MODE` dans l'onglet `Config` du Sheet (`google` ou `pin`).

## 📱 Configuration Jamf MDM

Voir `docs/mdm.md` pour les domaines à whitelister.

## ✅ Tests

Voir `docs/tests.md` pour le plan de tests manuels.
