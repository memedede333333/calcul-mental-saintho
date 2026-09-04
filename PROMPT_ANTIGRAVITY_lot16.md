# Lot 16 — l'accueil élève, le premier jour, et la création de défi

Trois écrans de `docs/design/matHo-refonte-v5.dc.html` : **15, 16 et 17**.
Front uniquement, **aucune migration**. Tout ce qu'ils affichent existe déjà
côté serveur — j'ai vérifié chaque appel.

La maquette 9 (code projeté) attend la migration 25, qui est en cours
d'écriture. Ne la commence pas.

---

## 1. Écran 15 — l'accueil élève, corrigé sur l'API

C'est le remplacement de la maquette 2 que tu as déjà codée. Quatre différences,
et elles ne sont pas cosmétiques.

### a) La grille passe en haut, et remplace le bouton du bas

Sous le prénom, avant tout le reste :

> **34 cases vertes sur 100**
> Tes tables vont jusqu'à 10. Il te reste 21 cases rouges, toutes dans les
> tables de 7, 8 et 9.
> *Voir ma grille en grand ›*

Le bouton « Ma grille » du bas disparaît : ce lien le remplace.

**Le dénominateur suit le plafond de l'élève.** `MasteryGrid.jsx` l. 10 dessine
une grille **carrée** : un plafond de 10 fait 100 cases, un plafond de 15 en
fait 225. Aucun 100 ni 144 en dur.

Le comptage se fait dans la clé `maitrise` que `monProfil()` renvoie déjà —
niveau 3 = vert, 1 = rouge. C'est la grille complète, pas un échantillon :
compter dedans est légitime.

### b) Six modes, pas quatre

`sessions_jeu.mode` accepte `libre`, `apprentissage`, `sprint`, `flawless`,
`countdown`, `climb`. La maquette 15 les liste tous les six :

| Mode | Sous-titre |
|---|---|
| Sprint | 3 s par question |
| Sans faute | zéro erreur |
| Contre-la-montre | 2 minutes |
| Montée | palier N |
| **Libre** | sans contrainte |
| **Apprendre** | sans score |

« Libre » est l'entrée que tu as ajoutée au lot 15 : elle rentre dans la grille
des modes au lieu d'être une carte à part au-dessus.

### c) L'action du jour

> **Reprendre la table de 9**
> Ta table la plus faible · Sans faute · 20 questions

La table vient de **`mesTablesFaibles(1)`** — le serveur sait déjà quelles
tables sont les plus ratées. **Ne la calcule pas dans l'écran** en comptant les
rouges : ce serait une population fabriquée, et le serveur pondère autrement
(voir `mes_tables_faibles`, migration `20260826090300_difficulte.sql` l. 441 :
un rouge pèse 3, un orange 1).

### d) La file hors-ligne — c'est un vrai défaut, pas une décoration

> *1 partie en attente d'envoi — elle partira au retour du wifi.*

**`partiesEnAttente()` et `surFileChangee()` existent dans `api.js` et ne sont
appelées nulle part.** Vérifie-le toi-même : zéro occurrence dans les écrans.

Aujourd'hui, un élève qui joue dans un couloir sans wifi voit sa partie
disparaître et croit l'avoir perdue. Une ligne discrète en bas de l'accueil
suffit, abonnée à `surFileChangee()` pour disparaître toute seule quand la file
se vide.

---

## 2. Écran 16 — le tout premier jour

**C'est l'écran que 350 élèves verront le même matin**, et c'est celui qu'on
dessine en dernier d'habitude. La base ne sait rien d'eux : pas de grille, pas
de points, pas de table faible.

Il se déclenche quand la grille est vide (`maitrise` vide) **et** qu'aucune
session n'existe.

- **La grille vide est montrée**, en gris, avec sa légende — elle explique
  l'outil à la place d'un texte de bienvenue :
  > **Ta grille est vide**
  > Chaque case est une multiplication. Elles se colorent au fur et à mesure :
  > rouge, orange, puis verte quand tu la sais.
- **Une seule action ouverte** : une partie libre sur les tables 2 à 5, sans
  chrono.
- **Les modes chronométrés sont grisés**, avec la raison écrite :
  > Les autres modes s'ouvrent après cette partie — ils ont besoin de savoir ce
  > que tu sais.
- **Le choix de l'avatar est proposé là** : « C'est la seule chose que tu peux
  changer toi-même. » C'est exact — `changerAvatar` est la seule écriture
  autorisée à un élève sur sa propre fiche (RLS, `eleves_maj_avatar`).

**Le déverrouillage** se fait après **une partie terminée**, quel qu'en soit le
score. Écris-le en une seule condition, à un seul endroit : on pourrait vouloir
l'enlever après observation en classe, et ça doit tenir en une ligne.

---

## 3. Écran 17 — créer un défi, avec l'avertissement de classe

Cet écran existe déjà dans `Challenges.jsx`. Ce que la maquette ajoute est **la
troisième fonction écrite et jamais affichée**.

`apercuDefiClasse(classe, tables)` est appelée l. 490 mais son résultat n'est
pas montré au professeur. La maquette le met **juste au-dessus du bouton** :

> **4 élèves de 6ᵉA n'ont pas encore la table de 9**
> Ils pourront jouer le défi — les questions au-delà de leur plafond ne
> compteront pas contre eux. Tu peux aussi retirer la table de 9, ou leur ouvrir
> la 9 en une action.
> **Ouvrir la table de 9 à toute la classe ›**   ·   *Voir qui ›*

**Les deux nombres viennent tous les deux du serveur** : `eleves_hors_plafond`
et `eleves_classe`. Ne calcule ni l'un ni l'autre, et ne les rapproche jamais en
pourcentage — ce sont les mêmes élèves actifs de la classe, comptés deux fois
différemment.

L'action « Ouvrir la table à toute la classe » appelle **`definirPlafondClasse`**,
qui existe (`Admin.jsx` l. 179). Elle ne redescend jamais un élève qui a
débloqué plus haut : c'est écrit dans la fonction.

Et la maquette précise, à juste titre : **Sans faute et Montée ne sont pas
proposés en défi** — `creer_defi` refuse tout ce qui n'est pas `sprint` ou
`countdown`. Écris la raison à l'écran plutôt que de griser sans explication.

---

## 4. Un principe qui traverse les trois écrans

Claude Design insiste, et il a raison : **l'emplacement du défi de classe ne
bouge jamais.** Même position, même hauteur, qu'il y ait un défi ou non. Seuls
son contenu et sa couleur changent.

L'ordre est toujours le même : **nom, grille, emplacement défi, action du jour,
modes, Montée.** Si le bandeau pousse le reste vers le bas les jours de défi,
l'élève ne mémorise jamais où se trouve quoi.

Et le champ de code reste visible en permanence, même quand il ne sert pas :
c'est le geste que le professeur demande à voix haute, il ne doit jamais être à
chercher.

---

## 5. Ce qu'il faut voir à l'écran

- [ ] Le compte de cases change selon le plafond : teste avec un compte au
      plafond 10 puis au plafond 15, le total doit passer de 100 à 225.
- [ ] Les six modes sont présents, et « Libre » n'est plus une carte à part.
- [ ] L'action du jour vient de `mesTablesFaibles(1)` — pas d'un comptage local.
- [ ] Coupe le wifi, joue une partie, rebranche : la ligne « 1 partie en attente
      d'envoi » apparaît puis disparaît toute seule.
- [ ] Avec un compte neuf (aucune session, grille vide), c'est l'écran 16 qui
      s'affiche, et une seule action est cliquable.
- [ ] Après une partie libre terminée, les autres modes s'ouvrent.
- [ ] Sur l'écran 17, choisis la 6ᵉA et les tables 7-8-9 : l'avertissement
      apparaît avec les deux nombres, et « Ouvrir la table à toute la classe »
      appelle bien `definirPlafondClasse`.
- [ ] `npm run build` vert, aucune couleur en dur hors `tokens.css`, aucun
      `var()` orphelin.

---

## Ce que tu ne fais pas

- **La maquette 9** (code projeté) : elle attend la migration 25.
- **`logic/mastery.js`** : la règle de maîtrise ne change pas dans ce lot.
- Aucun nouvel appel serveur : les cinq fonctions utilisées ici existent toutes.
