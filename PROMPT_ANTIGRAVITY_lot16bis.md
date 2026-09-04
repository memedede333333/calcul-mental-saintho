# Lot 16 bis — interruption : deux défauts dans le chargement de l'accueil élève

Le lot 16 est bon sur les trois points corrigés. Ce qui suit vient d'ailleurs :
de la façon dont `Home.jsx` traite l'état « le serveur n'a pas encore répondu ».
C'est une interruption parce que la maquette 9 va se poser sur cet écran, et
parce que le premier défaut touche tous les élèves à chaque ouverture.

---

## 1. « En cours de chargement » est lu comme « zéro partie jouée »

`Home.jsx` l. 296-297 :

```js
const nbSessions = isPremierJourPreview ? 0
  : (userData ? (userData.records?.nb_sessions ?? 0)
             : (isStudentPreview || isPlafond15Preview ? 14 : 0));
const estPremierJour = isPremierJourPreview || (!estProf && (nbSessions === 0));
```

`userData` vaut `null` jusqu'au retour de `monProfil()`. Pendant tout ce temps
`nbSessions` vaut 0, donc `estPremierJour` vaut `true`, donc le `return` de la
l. 309 part : **l'écran 16 s'affiche.**

Deux conséquences :

- **À chaque ouverture, chaque élève voit d'abord « Ta grille est vide ».** En
  classe, trente iPad sur le même wifi, ce n'est pas un clignotement : c'est une
  seconde ou deux pendant lesquelles un élève qui joue depuis un mois lit qu'il
  n'a jamais joué.
- **Si `monProfil()` échoue, il y reste.** Le `.catch(() => {})` de la l. 104
  avale l'erreur sans rien poser. `userData` reste `null` pour toujours, l'élève
  est bloqué sur l'écran du premier jour, grille vide, Sprint et
  Contre-la-montre grisés — pour une coupure réseau de deux secondes.

C'est la règle 3 du projet dans une autre robe : une réponse serveur absente
est lue comme une valeur, et l'erreur va dans le sens rassurant.

**Ce qu'il faut : trois états, pas deux.**

- `userData === null` **et** aucune erreur → **chargement**. On n'affiche ni
  l'écran 15 ni l'écran 16. Un squelette, ou l'en-tête seul avec le prénom (il
  vient de `identite`, il est déjà là). Surtout pas une grille vide.
- `userData` chargé **et** `records.nb_sessions === 0` → écran 16.
- `userData` chargé, `nb_sessions > 0` → écran 15.

Et le `catch` doit poser un état d'erreur, pas rien : l'élève doit lire
« Connexion perdue — réessaie » avec un bouton, pas un faux profil vide. Même
chose pour le `catch` de `mesTablesFaibles`.

---

## 2. L'action du jour se replie sur un calcul local

`Home.jsx` l. 551 :

```js
const tableActionJour = weakTable || (isStudentPreview ? 9 : (tablesRouges[0] || plafond));
```

`weakTable` vient de `mesTablesFaibles(1)`. Quand il est absent — pas encore
répondu, liste vide, appel en échec — l'écran prend `tablesRouges[0]`, une table
qu'il a calculée lui-même l. 517-533.

Or les deux ne répondent pas à la même question. Le serveur pondère un rouge à 3
et un orange à 1 ; `tablesRouges[0]` ne regarde que les rouges et prend la plus
petite. Une table à deux rouges passera devant une table à six oranges. Le
libellé, lui, reste « Ta table la plus faible » dans les deux cas — donc l'écran
affirme une chose que le serveur n'a pas dite, et personne ne peut savoir en
regardant laquelle des deux il a sous les yeux.

**Tant que `weakTable` est absent, il n'y a pas d'action du jour.** Pas de
repli : on masque le bloc « AUJOURD'HUI », ou on affiche « Choisis ton mode »
sans le nommer « ta table la plus faible ». Un écran qui ne sait pas se tait.

---

## 3. Détail — les aperçus sont ouverts aux élèves

`?preview=eleve`, `?preview=plafond15` et `?preview=premierjour` (l. 175-176)
sont lus dans l'URL sans vérifier `estProf`. Un élève qui tape l'adresse voit
Lou, 1240 points et une grille fabriquée par `getMockMaitrise`. Ça ne casse rien
— ses vraies données reprennent dès que `monProfil()` répond — mais ces trois
drapeaux doivent être conditionnés à `estProf`, et le générateur de fausses
données n'a rien à faire dans le paquet envoyé aux élèves.

---

## Ce qu'il faut voir à l'écran

- [ ] Ouvre l'accueil avec un compte élève ayant déjà joué : **à aucun moment**
      « Ta grille est vide » n'apparaît, même une fraction de seconde.
- [ ] Coupe le réseau, recharge : un message d'erreur avec un bouton, pas
      l'écran du premier jour.
- [ ] Avec un vrai compte neuf (`nb_sessions = 0`) : l'écran 16, comme
      aujourd'hui.
- [ ] Le bloc « AUJOURD'HUI » n'apparaît qu'une fois `mesTablesFaibles` revenu.
- [ ] `?preview=eleve` avec un compte élève : rien ne change pour lui.
