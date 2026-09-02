# Nom et marque — check-list de bascule

> **À quoi sert ce document.** Le nom de l'application n'est pas encore choisi.
> Quand il le sera, il faudra le changer à **une quinzaine d'endroits**, dont la
> moitié ne sont pas dans le code. Ce fichier les liste tous, vérifiés un par un
> dans les fichiers réels le 28/08/2026.
>
> On le déroule une fois, on coche, et on l'archive.

---

## 1. Le nom n'est pas une chaîne, c'en est trois

Il faut trancher les **trois** en même temps, sinon la bascule sera à refaire.

| Forme | Longueur | Où ça se voit |
|---|---|---|
| **Nom complet** | libre | écran de connexion, onglet du navigateur, écran Google |
| **Nom court** | **12 caractères maximum** | **sous l'icône, sur l'écran d'accueil de l'iPad** |
| **Monogramme** | 2 à 3 lettres | pastille affichée si le logo ne charge pas |

⚠️ **Le nom court est la chaîne la plus vue de tout le projet.** 350 élèves la
lisent chaque jour sous l'icône, sans jamais ouvrir l'application. iOS tronque
au-delà d'une douzaine de caractères — « Calcul Mental Saintho » deviendrait
« Calcul Ment… ». Choisis-le en le regardant sur un vrai iPad, pas sur un écran
d'ordinateur.

Valeurs actuelles : `matHo` · `matHo` · `mH`

---

## 2. Dans le code — 8 endroits

Un seul commit, fait par Antigravity.

| # | Fait | Fichier | Ce qu'on change |
|---|:---:|---|---|
| 1 | [x] | `frontend/src/branding.js` | `appName`, `shortName`, `monogram`, `logoPath`, et l'en-tête du fichier |
| 2 | [x] | `frontend/public/manifest.json` | `name`, `short_name`, `description`, `icons[].src` |
| 3 | [x] | `frontend/index.html` | `<title>`, `meta description`, `rel="icon"`, `rel="apple-touch-icon"` |
| 4 | [x] | `frontend/index.html` | **ajouter** `<meta name="apple-mobile-web-app-title" content="matHo">` |
| 5 | [x] | `frontend/package.json` | `"name"` (`"matho"`) |
| 6 | [x] | `frontend/src/api.js` | l'en-tête de commentaire, ligne 2 |
| 7 | [x] | `frontend/src/styles/index.css` | l'en-tête de commentaire, ligne 2 |
| 8 | [x] | `frontend/public/logo-saintho.png` | remplacé par `matho-logo.png`, `matho-icone-*.png`, `matho-favicon-32.png` |

**Vérification après coup :**

```bash
cd frontend
grep -rn "Calcul Mental Saintho\|Saintho Maths\|logo-saintho" src public index.html package.json
```

Ne doit plus rien renvoyer. `frontend/dist/` peut encore contenir l'ancien nom :
c'est le build précédent, il sera écrasé au prochain `npm run build`.

---

## 3. Hors du code — 6 endroits, un par un

Ceux-là ne se committent pas. C'est Aymeri, dans six interfaces différentes.

| # | Où | Quoi | Qui le voit |
|---|---|---|---|
| 1 | **Jamf School** → le Web Clip poussé sur les iPads | **le libellé sous l'icône** | ⚠️ **les 350 élèves, tous les jours** |
| 2 | [Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding) | « Nom de l'application » | tout élève qui se connecte : *« … souhaite accéder à votre compte »* |
| 3 | Vercel → Settings → General | nom du projet, et le sous-domaine `*.vercel.app` | dans l'URL, si tu changes le sous-domaine |
| 4 | Supabase → Settings → General | nom du projet (`calcul mental dev`) | toi seul |
| 5 | Supabase → Auth → Email Templates | objet et corps du mail de code | seulement si le secours e-mail est un jour activé |
| 6 | GitHub → le dépôt | description, et éventuellement le nom | toi et Antigravity |

⚠️ **Le Web Clip Jamf est le plus important et le plus facile à oublier.** Il
n'est lié à rien : changer le nom dans le code ne le met pas à jour. Il faut
rééditer le profil de configuration et le repousser sur les appareils.

---

## 4. Ce qu'il ne faut **pas** changer

| | Pourquoi |
|---|---|
| La **référence du projet Supabase** (`lkukdlspcgqtiimvwlsd`) | Immuable. Elle est dans l'URL de l'API, dans `.env.local` et dans l'URI de redirection Google. Y toucher est impossible ; la renommer côté interface ne la change pas. |
| L'**URL du dépôt Git** | Renommer un dépôt GitHub casse les `git remote` locaux, celui d'Antigravity comme le tien. Si tu y tiens vraiment, fais-le en dernier et relance `git remote set-url` des deux côtés. |
| Le **nom des tables et des fonctions SQL** | `eleves`, `defis`, `enregistrer_session`… n'ont jamais porté le nom du produit. Rien à faire. |
| Le **domaine `saintho.fr`** | C'est le domaine de l'établissement, pas celui de l'application. |

---

## 5. Deux corrections à faire pendant la bascule

**a) [x] Il manque `apple-mobile-web-app-title`.**
Fait : `<meta name="apple-mobile-web-app-title" content="matHo" />` posé dans `frontend/index.html`.

**b) [x] `branding.js` contient encore `authMode: 'pin'`.**
Fait : ligne supprimée.

---

## 6. La procédure, le jour J

1. [x] Trancher les **trois formes** du nom (§1) : `matHo` · `matHo` · `mH`
2. [x] Fichiers logo et icônes créés et placés dans `frontend/public/`
3. [x] Antigravity fait les **8 changements de code** (§2)
4. [ ] `npm run build`, déploiement Vercel, et on ouvre l'app pour vérifier :
   onglet du navigateur, écran de connexion, écran Google
5. [ ] **Ajouter à l'écran d'accueil sur un iPad de test** et regarder le libellé
   sous l'icône — c'est le seul test qui compte pour le nom court
6. [ ] Aymeri fait les **6 changements hors code** (§3), Jamf en dernier
7. [ ] Repousser le Web Clip et vérifier sur un iPad d'élève

---

*Dernière vérification des chemins de fichiers : 28/08/2026.*
