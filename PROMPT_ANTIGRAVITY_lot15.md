# Lot 15 — l'entraînement libre

Quatre écrans, **front uniquement, aucune migration**. Ils sont dans
`docs/design/matHo-refonte-v5.dc.html`, numérotés 18 à 21.

C'est le mode qui manquait. Aujourd'hui un élève n'a que trois modes jouables,
et **les trois sont contraints** : Sprint (3 s par question), Contre-la-montre
(2 min), Sans faute (une erreur et c'est fini). Il n'existe aucun endroit où il
puisse choisir ses tables, prendre son temps, se tromper et recommencer.

Or les élèves recevront l'accès **avant le cours**, pour jouer chez eux. Un
collégien seul devant son iPad, sans professeur, avec pour seule porte d'entrée
un Sprint à 3 secondes sur des tables qu'il ne connaît pas : il ferme et il n'y
revient pas.

---

## 0. Le mode existe déjà. Il n'est simplement pas donné à l'élève.

Ne crée pas de mode. `sessions_jeu.mode` accepte déjà `libre`, et
`Practice.jsx` l. 61 enregistre en `libre` dès que le mode n'est ni `sprint` ni
`countdown`.

Le bouton existe aussi : `Home.jsx` **l. 106**, `onGo('play')` sans paramètres.
Il est dans la branche **professeur** (« S'entraîner — Jouez vous aussi »).
L'élève ne l'a pas.

**Première chose à faire, et elle prend une minute :** donner la même entrée à
l'élève. Ensuite seulement, les quatre écrans.

---

## 1. Écran 18 — l'entrée du mode

Quatre départs possibles, et c'est le serveur qui les remplit :

| Choix | D'où vient le chiffre |
|---|---|
| **Mes N cases rouges** | comptées dans la grille que `monProfil()` renvoie (clé `maitrise`, niveau 1) |
| **Mes tables** | ouvre l'écran 21 |
| **Tout mélangé** | les tables jusqu'au `plafond_tables` de l'élève |
| **Ma dernière** | la plus haute table de son plafond |

**Deux corrections par rapport à la maquette.**

`« Ma dernière — table de 10, ouverte hier »` : **« ouverte hier » n'existe
pas.** `plafond_tables` est un entier sans historique — on ne sait pas quand une
table a été ouverte. Écris seulement « table de 10 ».

Le bloc « Ce que ce mode fait de tes erreurs », en trois points, **se code tel
quel** : c'est de la logique de jeu, dans le navigateur.

1. Erreur → la bonne réponse s'affiche, l'élève la retape.
2. Le même fait revient **trois questions plus tard**.
3. S'il l'a, il revient **une dernière fois vers la fin**.

C'est nouveau : aujourd'hui `buildWeights` (dans `logic/mastery.js`) donne
seulement un poids de tirage plus fort aux faits rouges. Ici, c'est une reprise
**programmée**, à position fixe dans la partie. Garde `buildWeights` pour le
tirage initial, et ajoute la file de reprise par-dessus.

---

## 2. Écran 19 — pendant la partie

Tout est mesurable dans le navigateur : le temps par question, la moyenne
courante, la liste « à retravailler ».

**Aucun chrono qui contraint.** Le temps s'affiche, il ne fait jamais sauter une
question. C'est la définition du mode.

---

## 3. Écran 20 — la fin de partie

**Attention, deux phrases de cette maquette ne doivent pas être écrites
maintenant.**

- « **0,7 s de moins que la semaine dernière** » — cette comparaison n'existe
  pas côté serveur. Aucune fonction ne renvoie la moyenne par question de la
  semaine précédente. Je l'écris, elle arrivera plus tard. **Retire la ligne**,
  ne la remplace pas par une approximation.
- « Une case ne passe au vert qu'après **deux réussites d'affilée sous les
  3 secondes** » — **ce n'est pas la règle en vigueur**. Aujourd'hui,
  `construireMaitrise` dans `logic/mastery.js` applique : premier coup → vert,
  rattrapé → orange, jamais trouvé → rouge. **Le temps n'entre nulle part.**

  Écrire cette phrase à l'écran alors que le serveur applique une autre règle,
  c'est mentir à l'élève sur son propre fonctionnement. J'écris la migration qui
  introduit le seuil de temps ; **en attendant, décris la règle actuelle** :
  « Une case passe au vert quand tu trouves du premier coup. »

Le reste de l'écran se code : « 20 questions », « 8 reprises », « 3 cases
gagnées » (différence entre la grille d'avant et celle d'après), et le détail
par fait avec les temps **de cette partie**.

---

## 4. Écran 21 — le choix des tables

**Une erreur à corriger.** La maquette écrit « Sur 3 tables cochées, 21 cases
sur 30 ». 30 = 3 tables × 10 multiplicateurs. Or `MasteryGrid.jsx` l. 10 dessine
une grille **carrée** : pour un élève au plafond 15, une table fait 15 cases,
pas 10. Le total doit se calculer sur le plafond de l'élève, jamais sur 10.

C'est la même erreur que le « sur 144 » corrigé au lot précédent. Elle revient
parce qu'elle est naturelle : **ne code jamais un dénominateur en dur.**

Le reste est juste : « Mes 3 tables faibles » vient de `mesTablesFaibles(3)`,
déjà appelée dans `Practice.jsx` l. 163. Les pastilles sous chaque chiffre se
comptent dans la grille.

---

## 5. Ce qu'il faut voir à l'écran

- [ ] Depuis l'accueil **élève**, un bouton « S'entraîner » mène à l'écran 18.
- [ ] Une partie libre s'enregistre bien avec `mode: 'libre'` — vérifie dans
      `sessions_jeu` après avoir joué.
- [ ] Je me trompe sur 7 × 9 : la bonne réponse s'affiche, je la retape, et
      **7 × 9 revient trois questions plus tard**, puis une dernière fois vers
      la fin.
- [ ] Aucune question ne saute toute seule, quel que soit le temps passé.
- [ ] Aucun dénominateur en dur : coche 3 tables avec un compte au plafond 10,
      puis avec un compte au plafond 15, et vérifie que le total change.
- [ ] La phrase sur le passage au vert décrit **la règle actuelle**, pas celle
      des 3 secondes.
- [ ] Aucune comparaison avec « la semaine dernière ».
- [ ] `npm run build` vert, aucune couleur en dur hors `tokens.css`, aucun
      `var()` orphelin.

---

## Ce que tu ne changes pas

`logic/mastery.js` — ni `construireMaitrise`, ni `updateMastery`. La règle de
maîtrise change bientôt, mais elle changera **des deux côtés en même temps**,
dans un lot à part. Si tu la modifies ici, la grille de l'élève et ce que le
serveur enregistre divergeront sans message d'erreur.
