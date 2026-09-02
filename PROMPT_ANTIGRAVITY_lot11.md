**Le nom est tranché : `matHo`.** Contraction de *mathématiques* et de *Saintho*. C'est la bascule de marque décrite dans `NOM_ET_MARQUE.md` — suis ce fichier, il est à jour, et coche les cases au fur et à mesure.

**Respecte la casse à la lettre près : `matHo`** — m minuscule, H majuscule, o minuscule. C'est la forme du logo. Ne l'écris jamais « Matho », « MATHO » ni « matHO », nulle part, pas même dans un commentaire.

**Les fichiers d'image sont déjà en place**, je les ai découpés dans le logo et écrits dans `frontend/public/` — tu n'as rien à générer :

| fichier | usage |
|---|---|
| `matho-icone-180.png` | `apple-touch-icon` — l'icône sur l'écran d'accueil de l'iPad |
| `matho-icone-192.png` et `matho-icone-512.png` | les deux entrées `icons` du manifeste |
| `matho-favicon-32.png` | `rel="icon"` |
| `matho-logo.png` | le logo **complet, avec le mot** — pour l'écran de connexion et l'en-tête |

Les quatre icônes ne contiennent **que la marque**, sans le mot « matHo » : à 60 pixels sur un écran d'accueil, le mot est illisible et écrase le reste. Le logo complet reste pour les endroits où il a la place de respirer.

---

**1. `frontend/src/branding.js`**

```js
appName:   'matHo',
baseline:  'Le défi des tables — Collège Saint-Honoré d\'Eylau',
shortName: 'matHo',
logoPath:  '/matho-logo.png',
monogram:  'mH',
```

Et corrige l'en-tête de commentaire du fichier, qui dit encore « Calcul Mental Saintho ».

**Supprime aussi la ligne `authMode: 'pin'`.** Elle n'est lue nulle part — j'ai vérifié — et elle affirme le contraire de ce que fait l'application, qui se connecte par Google. Une valeur morte qui ment est pire qu'une valeur absente : le prochain qui la lira en tirera une conclusion fausse.

**2. `frontend/public/manifest.json`**

`name` et `short_name` à `matHo`, la `description` avec le nouveau nom, et **deux** entrées d'icônes :

```json
"icons": [
  { "src": "/matho-icone-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/matho-icone-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
]
```

Retire `"purpose": "any maskable"` : une icône *maskable* doit prévoir une zone de sécurité que celle-ci n'a pas, et Android lui rognerait les coins en plein dans le « 56 ».

**3. `frontend/index.html`** — `<title>`, `meta description`, `rel="icon"` vers `/matho-favicon-32.png`, `rel="apple-touch-icon"` vers `/matho-icone-180.png`, et **ajoute** :

```html
<meta name="apple-mobile-web-app-title" content="matHo" />
```

Cette balise décide du libellé sous l'icône sur l'écran d'accueil de l'iPad. Sans elle, iOS prend le `<title>`, qui est plus long et sera tronqué.

**4. `frontend/package.json`** → `"name": "matho"` (minuscules, c'est la règle npm).

**5. Les deux en-têtes de commentaire** : `frontend/src/api.js` ligne 2 et `frontend/src/styles/index.css` ligne 2.

**6. Cherche ce qui reste.** `grep -ri "calcul mental saintho\|saintho maths\|logo-saintho" frontend/` doit ne plus rien renvoyer. Le nom du **collège** — « Collège Saint-Honoré d'Eylau » — reste, lui : c'est l'établissement, pas l'application.

**7. Supprime `frontend/public/logo-saintho.png` de toute référence.** Le fichier n'a jamais existé : trois balises pointaient dessus et renvoyaient 404 à chaque chargement. Vérifie dans l'onglet Réseau qu'il n'y a plus aucun 404.

---

**À voir à l'écran :** l'écran de connexion avec le logo complet et « matHo » · l'en-tête de l'application · aucune requête en 404 · et, après déploiement, l'application ajoutée à l'écran d'accueil d'un iPad avec la bonne icône et le libellé « matHo ».

**Ne touche à rien d'autre.** La refonte visuelle viendra plus tard, avec Claude Design : ce lot ne change que le nom et les images, pas la mise en page.
