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

**Le dénominateur suit le plafond de l'élève, et la grille est symétrique.**
Corrigé le 4 septembre — la première version de ce paragraphe était fausse, lis
celle-ci.

`MasteryGrid.jsx` dessine une grille **carrée** de `plafond × plafond` cases
(l. 19), mais la clé qu'elle lit est `min(r,c)_max(r,c)` (l. 29) : **4×7 et 7×4
sont la même entrée**. Conséquence : au plafond 10, la grille montre **100
cases** et la clé `maitrise` contient au plus **55 entrées**. Compter les
entrées et diviser par 100, c'est diviser le score de l'élève par deux, tous
les jours, sans que personne s'en aperçoive.

La règle, donc : **on compte les cases affichées, pas les entrées.** Pour chaque
couple (r, c) de `1..plafond`, on lit `maitrise[min_max]` et on compte. Le
dénominateur est `plafond × plafond`. Le nombre annoncé est alors exactement ce
que l'élève voit quand il ouvre la grille juste à côté — c'est tout l'intérêt de
la phrase.

Niveau 3 = vert, 2 = orange, 1 = rouge, absent = jamais vue.

**Et il faut passer `tables` à `MasteryGrid`.** Personne ne le fait aujourd'hui :
`Practice.jsx` l. 86 l'appelle sans, donc `range` retombe sur le `[1..10]` par
défaut de la l. 9. Un élève au plafond 15 voit une grille de 10 — c'est un défaut
existant, corrige-le au passage aux deux endroits.

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

**Le déclenchement de cet écran est UNE condition, pas deux** :
`monProfil().records.nb_sessions === 0`. Rien d'autre.

Ne le croise pas avec « `maitrise` vide » : deux conditions sur la même question,
ce sont deux conditions qui finiront par se contredire — une partie restée dans
la file hors-ligne, une session vide enregistrée avant la migration 25, et
l'élève se retrouve devant un écran qui ne correspond ni à l'un ni à l'autre.
Une seule source, `nb_sessions`, qui répond à la vraie question : as-tu déjà
joué ?

**Le déverrouillage** est la même condition passée à 1 : après **une partie
terminée**, quel qu'en soit le score. Écris-la à un seul endroit : on pourrait
vouloir l'enlever après observation en classe, et ça doit tenir en une ligne.

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
> **Ouvrir la table de 9 à toute la classe ›**

**Pas de bouton « Voir qui » dans ce lot.** La maquette le propose, et il est
juste — mais `apercu_defi_classe` ne renvoie que quatre compteurs, aucun nom.
Le reconstituer avec `listeEleves` donnerait une liste fausse : cette fonction
est ouverte à `est_prof()`, c'est-à-dire à **tous** les professeurs et **toutes**
les classes, alors que le compteur juste au-dessus est filtré par
`prof_voit_classe`. On afficherait des noms sous un compteur qui dit zéro.
J'écris la fonction serveur dans la migration 25 ; le bouton arrivera avec.

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
- [ ] **La symétrie** : ouvre la grille en grand, compte les vertes à l'oeil,
      compare au nombre annoncé au-dessus. Ils doivent être égaux. S'ils sont
      dans un rapport de 1 à 2, tu comptes les entrées au lieu des cases.
- [ ] Un compte au plafond 15 voit une grille de 15 lignes, pas de 10.
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
- **Le bouton « Voir qui »** de l'écran 17 : il attend la migration 25 aussi.
- **`logic/mastery.js`** : la règle de maîtrise ne change pas dans ce lot.
- Aucun nouvel appel serveur : les cinq fonctions utilisées ici existent toutes.
