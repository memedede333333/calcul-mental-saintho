# matHo — refonte visuelle et ergonomique

Tu conçois l'interface de **matHo**, une application d'entraînement aux tables
de multiplication utilisée par 350 collégiens de 11 à 15 ans, sur iPad, en
classe. Elle fonctionne déjà : tous les écrans existent et le comportement est
fixé. Ce que je te demande, c'est **le design et l'ergonomie**, entièrement.

Le mot d'ordre : **simple, sobre, moderne, efficace.** Pas de décoration
gratuite. Mais quand un élève réussit, **ça doit péter.**

## Ce sur quoi je veux vraiment que tu réfléchisses

**Le pavé numérique.** C'est l'écran le plus vu de toute l'application : un
élève y passe des centaines de questions. Où poser les chiffres pour qu'on
tape vite et juste, sur un iPad tenu en portrait, posé sur une table ? Quelle
taille de touche, quel espacement, quelle zone de validation, où mettre
l'effacement ? Une erreur de frappe due à la mise en page est une erreur de
calcul volée à l'élève.

**Les moments de fête.** Une bonne réponse, une série qui monte, un défi gagné,
un badge décroché, une table débloquée. Aujourd'hui c'est plat. Je veux que ça
se voie, que ça s'entende presque — sans ralentir celui qui enchaîne les
questions. Trouve le bon dosage entre célébration et rythme.

**Le reste de l'ergonomie**, librement : hiérarchie, tailles, respiration,
navigation, ce qu'on voit d'abord.

## Les écrans à traiter en priorité

1. **La partie en cours** — la question, le pavé, le chronomètre, la série
2. **L'accueil élève** — quatre modes de jeu, l'accès aux défis
3. **La fin de partie** — score, points gagnés, badges, célébration
4. **Le classement d'un défi** — le podium, les noms, les temps
5. **« Ma classe »** — l'écran professeur : une barre par table, quatre
   couleurs, un bouton d'action

## Le point de départ

Le logo est joint : un « 56 » bleu marine, deux mains bleu ciel, des carrés de
couleur, le mot **matHo** en deux bleus. **Pars de son univers** — mais si tu
trouves mieux, propose-le et explique pourquoi en deux phrases.

La palette actuelle, si elle te sert :

```
marine   #1B2A4A     or       #C9A227     ivoire   #FAF6EE
menthe   #00C9A7     corail   #FF5A5F     jaune    (sun)
ciel     #4DA8DA     violet   #8B6FC0     bordure  #E8E2D8
```

Polices : **Baloo 2** pour les titres et les nombres, **Nunito** pour le texte.

## Les contraintes, non négociables

1. **Portrait.** C'est l'orientation de référence. Le paysage doit rester
   lisible, pas être la cible.
2. **Aucune ressource extérieure.** Les iPads sont filtrés par un MDM : pas de
   Google Fonts, pas de bibliothèque d'icônes, pas d'image récupérée en ligne.
   Les polices sont des fichiers du projet. Les icônes sont des emojis ou du
   SVG écrit à la main.
3. **Les couleurs passent par des variables CSS**, jamais en dur.
4. **Écran tactile, en classe.** Cibles larges, contrastes qui tiennent sous un
   néon, **aucune interaction au survol**.
5. **11 à 15 ans.** Ni bébé, ni corporate.

## Les 19 écrans — `ECRANS.md`

Le document `ECRANS.md` est joint. Il décrit **l'intention** de chaque écran :
ce qu'il doit permettre, ce qu'il affiche, et surtout **les états qu'il ne doit
pas oublier** — chargement, erreur, liste vide, refus. C'est là que tu trouveras
ce qu'une capture ne montre pas.

Deux avertissements sur ce document :

- Il a été écrit **avant** que l'application ne soit construite. Là où il
  diverge des captures d'écran, **ce sont les captures qui disent vrai.**
- Il ne décrit pas les écrans ajoutés depuis. Les voici, en une ligne chacun :

| Écran | Ce qu'il fait |
|---|---|
| **Annonce du défi** | avant la première question : « 📚 Travail de classe — Défi de M. Desjardins — 6A », ou « 🎮 Défi de Lou A. ». L'élève doit savoir de qui vient le défi avant de jouer |
| **Mes défis** (professeur) | la liste de ses défis, avec pour chacun « 2 / 27 de la 6A ont joué » |
| **Ma classe** (professeur) | une barre par table, quatre couleurs, le bouton de défi ciblé, le bouton « Découvrir », et l'état « Rien ne coince dans cette classe » |
| **Confirmation avant un défi** | « La table 15 dépasse le niveau atteint par 12 élèves sur 27 — lancer quand même ? » |
| **Compte non reconnu** | affiche l'adresse Google avec laquelle on est connecté, et un bouton pour changer de compte |
| **Reprendre un défi** | un bandeau sur l'accueil élève quand un défi a été rejoint puis interrompu |

Tu n'as **pas** le code, et c'est volontaire : je veux que tu conçoives ce que
ces écrans devraient être, pas que tu redessines ce qu'ils sont. Si une
information te manque pour décider, demande-la.

## Ce qu'on a observé sur un vrai iPad

- Le pavé de l'application s'affiche bien, le clavier iOS n'apparaît pas, la
  page ne zoome pas. **Le socle est sain, tu pars d'une base qui marche.**
- L'application tourne en plein écran depuis l'écran d'accueil, sans barre
  d'adresse.
- En paysage, le contenu occupe le tiers haut de l'écran et laisse une grande
  zone vide. **C'est une des raisons pour lesquelles le portrait est la cible.**
- Un élève qui ferme l'application reste connecté en la rouvrant.

Ce qui n'a **pas** encore été observé, et qui reste donc à ta charge : personne
n'a regardé un élève s'en servir sans explication. Si une de tes propositions
repose sur une hypothèse d'usage, dis-le, qu'on aille la vérifier.

## Ce que j'attends

Des maquettes des cinq écrans, en portrait, avec les états importants (une
bonne réponse, une mauvaise, une fin de partie réussie). Et pour le pavé
numérique, dis-moi **pourquoi** tu l'as posé là — c'est la décision qui
compte le plus.
