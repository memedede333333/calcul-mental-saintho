# matHo — passe de correction sur les maquettes

Merci pour la première proposition : la structure est bonne et je la garde.
Le pavé en bas plein cadre, l'ordre 1-2-3, le ⌫ isolé à droite, la barre de
compte à rebours par question, la mosaïque comme motif unique du système, les
trois intensités de fête — tout ça est acquis, n'y reviens pas.

Ce message ne demande que des corrections. Elles sont de trois ordres :
la palette, les icônes, et trois chiffres faux.

---

## 0. Cette fois, tu as le code

Je joins `CODE_POUR_CLAUDE_DESIGN.md` : l'application telle qu'elle tourne
aujourd'hui. Lis d'abord son en-tete, il explique comment s'en servir. En deux
phrases : **`api.js` dit la verite** sur ce que le serveur renvoie — c'est la
que tu verifies qu'un chiffre existe avant de l'afficher ; **les ecrans sont un
inventaire** de ce qui existe (les filtres du classement, les etats vides, les
messages d'erreur, les ecrans intermediaires), pas un modele a suivre. La mise
en page actuelle est laide, c'est pour ca qu'on te la confie : **une horreur
dans le code n'est jamais une contrainte.**

---

## 1. La palette — elle ne vient pas du logo

C'est ma faute : la palette que je t'ai donnée dans le premier brief datait
d'avant le logo. Tu l'as suivie fidèlement, mais elle est fausse.

Voici les couleurs **relevées au pixel dans le logo** :

```
indigo     #20226B    le « 56 », le « Ho », les cadres
bleu ciel  #23A4D9    les mains, le « mat » — c'est la couleur vedette
rouge      #E02020    un des cinq carrés
orange     #F38E1A    un des cinq carrés
vert       #018F4B    un des cinq carrés
ivoire     #FAF6EE    le fond
```

Cinq carrés de couleur, pas six : **rouge, orange, vert, bleu ciel, indigo.**

### Ce qu'il faut changer

- `--navy` **`#1B2A4A` → `#20226B`.** Ton navy est un bleu-gris ; celui du
  logo est un indigo violacé. C'est la couleur la plus présente de tous les
  écrans, l'écart se voit partout.
- **Le bleu ciel `#23A4D9` devient la couleur d'action principale.** Bouton
  « Lancer un défi », bouton « Rejoindre », « Reprendre », barres de
  progression. Aujourd'hui il ne sert presque à rien alors que c'est la
  signature du logo — les deux mains, et la moitié du mot.
- **`--gold` et `--violet` disparaissent.** L'or n'existe nulle part dans le
  logo, et c'est aujourd'hui la couleur du plus gros bouton de chaque écran.
  Une seule exception, si tu la juges nécessaire : la **1ʳᵉ marche du podium**,
  dans un doré dérivé de l'orange `#F38E1A` — un podium sans or ne se lit pas.
- `--coral` → le rouge du logo ; `--mint` → le vert du logo ; `--sun` → l'orange
  du logo (celui-là était déjà presque juste).

### Une nuance, et elle compte

Le rouge `#E02020` est franc — trop dur pour signaler à un collégien qu'il
s'est trompé. Je maintiens ce que tu as écrit : *« l'erreur d'un collégien est
une quasi-réussite, on ne la punit pas. »*

Donc **deux valeurs du même rouge, pas deux couleurs différentes** :

- le rouge franc pour les barres de « Ma classe » — c'est de la donnée lue par
  un professeur, elle doit être lisible ;
- une **version pâlie du même ton** pour l'erreur de l'élève.

Le corail actuel est plus rose que le rouge du logo : c'est une autre teinte,
pas une nuance. C'est ce qui fait la différence entre une palette et un
assortiment.

### Et le contraste

La carte blanche de la question se détache à peine du fond ivoire. Sur un iPad
mat, sous un néon de salle de classe, vu de biais par un élève assis, cet écart
disparaît. Donne aux cartes une **ombre portée franche** ou une bordure —
plutôt que d'assombrir le fond, qui est celui du logo.

---

## 2. Les icônes

Il faut séparer deux usages que les maquettes confondent.

**Les avatars — 🦊 🐼 🐢 🐙 🦉 🐝 — sont justes, garde-les.** Ils existent
déjà en base, l'élève choisit le sien, et c'est une identité personnelle **sans
une lettre de texte libre** — ce qui est une contrainte absolue du projet.

**Les icônes de mode et de navigation — ⚡ 🎯 ⏱️ 🏋️ 📚 🏆 🗺️ — sont à
refaire.** Sept emojis, sept styles de dessin, sept palettes qui ne sont pas la
nôtre, alignés dans des cartes identiques : ça fait planche d'autocollants. Et
🏋️ pour « Montée » ou 🗺️ pour « Ma grille », personne ne les décode.

**Dessine-les en SVG à la main**, en indigo et bleu ciel, trait épais et
arrondi comme les mains du logo. Sept dessins : Sprint, Sans faute,
Contre-la-montre, Montée, Apprendre, Classements, Ma grille. Plus le ⌫ du pavé.

Le fichier actuel ne contient **aucun `<svg>`** — tout est emoji ou texte. Il
en faut, et ils doivent être dans le fichier, pas appelés depuis une
bibliothèque : les iPads sont filtrés, aucune ressource extérieure n'arrive.

L'emoji reste pour les avatars et pour la fête.

---

## 3. Trois chiffres qui ne peuvent pas exister

J'ai vérifié dans le code du serveur. Deux de tes chiffres que je croyais
inventés sont exacts — le calcul « premier coup / rattrapée à ½ point » et la
répartition « 18 sur 27 ont terminé, 9 jouent encore ». Bravo, c'est
précisément là qu'on se trompe d'habitude.

Trois sont faux :

**a) Le bandeau de reprise ment.** Il dit « *tu t'es arrêté à la question 6* ».
C'est impossible : les réponses déjà données ne sont stockées nulle part.
L'élève **recommence le défi depuis le début** — et c'est le comportement
correct, sa première tentative n'a jamais été enregistrée. Écris seulement :
« Défi UEWTR en cours · Contre-la-montre · 6ᵉA ».

**b) « Ma classe » mélange deux unités dans la même colonne.** On lit, l'une
sous l'autre : « 18 bloquent », « 14 bloquent », « 8 bloquent », « 4 bloquent »,
puis « 78 % maîtrisé », « 85 % maîtrisé ». Or *bloquent* compte des élèves sur
les 27 de la classe, tandis que *% maîtrisé* ne compte que ceux qui ont déjà
travaillé la table. Deux dénominateurs différents, alignés verticalement,
invitent le professeur à les comparer — et il aura tort. **Une seule unité par
colonne.**

**c) « 24 ont joué cette semaine ».** Ce chiffre n'existe pas côté serveur.
Soit tu l'enlèves, soit tu le signales comme à créer — on ne laisse jamais
l'écran déduire une population.

---

## 4. Les tailles

Les cadres sont figés à 834 × 1194 et les valeurs sont en pixels durs. C'est
normal pour une maquette, mais l'application tournera aussi sur un iPad de
820 de large et sur un iPad mini de 744.

Donc, pour le pavé et pour la question, **donne-moi la règle en plus de la
valeur** : quelle proportion de la hauteur le pavé occupe, quelle taille
minimale de touche on ne descend jamais, ce qui se comprime en premier quand
l'écran est plus court. C'est cette règle-là que le développeur codera, pas les
132 px.

---

## 5. Si tu as le temps, trois écrans de plus

Tu les avais proposés, et ils existent bien dans l'application. Ils éviteront
que le développeur les invente :

- **le sélecteur de tables** (avant une partie, avec les tables non ouvertes) ;
- **l'annonce du défi** (« 📚 Travail de classe — Défi de M. Desjardins — 6ᵉA »),
  vue juste avant la première question ;
- **le code projeté au tableau** — l'écran que le professeur montre à la classe,
  vu du fond de la salle.

---


---

## 6. L'administration — a ne pas oublier

Le code joint contient `Admin.jsx` : la gestion des eleves, des enseignants,
l'import de rentree et le journal. Ce n'est pas un ecran d'eleve, et il ne doit
surtout pas etre festif. Mais il ne doit pas etre neglige pour autant :

- il est utilise par **deux ou trois adultes**, quelques fois par an, dont une
  fois qui compte vraiment — **l'import des 350 eleves a la rentree**, au format
  `email, nom, prenom, classe`. A ce moment-la, l'ecran doit rendre une erreur
  de fichier evidente AVANT d'ecrire quoi que ce soit, dire combien de lignes
  vont etre creees et combien mises a jour, et ne jamais laisser croire qu'un
  import a marche quand il a echoue a moitie.
- c'est aussi l'endroit ou on vient chercher **pourquoi un compte ne marche
  pas**. La liste des eleves et le journal doivent se lire vite : qui s'est
  deja connecte, qui est rattache, qui ne l'est pas.

Donc : **sobre, dense, lisible** — l'oppose des ecrans eleves. Meme palette,
meme typographie, mais tableaux serres, pas de grosses cartes, pas
d'animation. Une maquette suffit : la liste des eleves avec l'import ouvert.

---

**Ne refais pas la mise en page.** Palette, icones, les trois chiffres, la
regle de tailles, et l'administration. Le reste est bon.
