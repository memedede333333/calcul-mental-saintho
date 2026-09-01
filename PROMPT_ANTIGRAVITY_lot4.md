Lot 3 relu dans le code à `daf12e7`. Les sept points tiennent : migration 21 appliquée, tri corrigé, ligne 218, `pGris` supprimé, confirmation en place, bouton « Découvrir » branché, polices locales (plus une occurrence de `googleapis`/`gstatic` dans le code). Deux corrections, un seul lot.

**1. La confirmation peut porter sur d'autres tables que celles réellement créées.** `Challenges.jsx` : `confirmInfo` est gardé en état, et rien ne l'efface quand le professeur modifie sa sélection entre l'avertissement et sa validation.

```
prof coche {15}, classe 6A → « Créer »            → « 12 élèves sur 27 n'ont pas débloqué la table 15 »
prof change la classe pour 3B, ou coche la table 20
prof clique « Lancer quand même »
  → défi créé avec les NOUVELLES tables et la NOUVELLE classe,
    sur la foi de chiffres calculés pour les anciennes.
```

Le professeur consent à autre chose que ce qui est fait. C'est la même famille que les quatre bugs de population de ce projet, mais du côté de la décision au lieu de l'affichage.

→ Vide `confirmInfo` dès que `tables` ou `selectedClasse` changent — un `useEffect` avec ces deux dépendances suffit. Le bouton « Créer un défi » réapparaît alors, et le professeur repasse par la vérification. C'est le comportement voulu : toute modification annule le consentement précédent.

**2. Un commentaire qui contredit son code.** `MaClasse.jsx`, départage du tri. Le code est **juste** :

```js
// À ratio égal, la moins couverte en premier      ← FAUX
return (b.taux_couverture ?? 0) - (a.taux_couverture ?? 0);   // ← met la PLUS couverte en premier
```

C'est bien la plus couverte qu'on veut en tête, et pour une raison : à égalité de non-maîtrise, une table que la classe a rencontrée est un **rattrapage**, une table qu'elle a à peine ouverte est une **découverte** — ce ne sont pas la même action pédagogique, et le bouton annonce un rattrapage.

→ Corrige le commentaire, pas le code : « À ratio égal, la plus couverte en premier : c'est un rattrapage, pas une découverte. » Le prochain lecteur aurait aligné le code sur le commentaire et cassé le tri.

**3. Sur tes preuves — remarque de méthode, pas une correction.** Ta vérification du point 0 porte sur la classe 31 : `eleves_classe: 1, eleves_hors_plafond: 1`. C'est la troisième fois qu'une preuve s'appuie sur une classe d'un seul élève. Un compteur qui compare deux sous-ensembles ne peut rien démontrer sur une population de 1 : les deux valent 1 quoi qu'il arrive. Prends la classe 32, ou mieux, une classe aux plafonds mélangés — c'est le seul cas où l'on voit si `eleves_hors_plafond` compte les bons élèves.

**À voir à l'écran avant de dire que c'est fini :** l'avertissement affiché, puis une table ajoutée → l'avertissement disparaît et le bouton « Créer » revient · le même avec un changement de classe · le tri de « Ma classe » inchangé après correction du commentaire.
