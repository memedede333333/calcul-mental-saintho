# Lot 14 — les mises en page, sur les maquettes

Le lot 13 a donné à l'application les bonnes couleurs, les bonnes polices, les
bonnes icônes et un vrai pavé numérique. Il n'a pas touché aux mises en page —
c'est moi qui te l'avais interdit, et j'ai eu tort. Résultat : l'application est
l'ancienne, repeinte.

**Ce lot-ci fait l'inverse : tu suis les maquettes.**

La référence est `docs/design/matHo-refonte-v2.dc.html`. Dix maquettes en
portrait. Tu les reproduis : la structure, les proportions, la hiérarchie,
l'ordre des blocs, les libellés. Ce n'est plus une source d'inspiration, c'est
le modèle.

---

## 0. D'abord, réparer. `git pull` avant tout.

**La casse, et elle est de mon fait.** En supprimant l'ancien `:root`
d'`index.css` tu as retiré une trentaine de variables ; ma consigne n'en nommait
que six. Les 21 autres étaient encore appelées **279 fois**. Un `var()` qui
pointe vers une variable inexistante ne lève **aucune erreur** — ni au build, ni
dans la console : la propriété est simplement ignorée. Des couleurs de texte,
des bordures, des fonds, des polices et des rayons ont disparu en silence à
travers toute l'application. Les barres de « Ma classe » étaient toujours là,
juste invisibles.

**C'est réparé dans `tokens.css`** : un bloc « Pont de compatibilité » en fin de
fichier redonne un sens aux 21 noms. Deux alias y sont marqués « ATTENTION » et
demandent ton œil.

### 0.1 Le contrôle qui manquait

Ajoute-le à ta recette, définitivement. Mon `grep` sur `#hex` passait au vert
**précisément parce que** les couleurs avaient été remplacées par des noms
morts : il mesurait la mauvaise chose.

> Aucun `var()` du code ne doit pointer vers une variable qui n'est définie ni
> dans `tokens.css`, ni dans le fichier qui l'utilise.

Écris-toi un petit script et lance-le avant chaque commit.

### 0.2 Les couleurs détournées

Trois corrections, et la première n'est pas cosmétique.

**Le rouge est devenu la couleur d'action.** « C'est parti ! », les tables
sélectionnées, « 10 » questions, « Non » chrono, la carte « S'entraîner » : tout
est rouge. Or un élève apprend dans sa grille que rouge veut dire « raté ». Lui
dire au même moment que rouge veut dire « vas-y », c'est casser le seul code
couleur qu'il doit retenir.

- `.btn--coral`, `.chip--coral`, `.mode-card--practice` → `var(--action)`.
- Le rouge n'apparaît plus **que** sur une erreur ou une donnée « à revoir ».

**Le vert aussi.** Le bouton « + Ajouter » de l'administration est vert, alors
que le vert veut dire « maîtrisé ». → `var(--action)`.

**Les dégradés décoratifs disparaissent.** `.mode-card--challenge` va du bleu à
l'orange : c'est l'or qu'on a supprimé qui revient par la fenêtre. Les maquettes
n'ont aucun dégradé. Aplats unis partout.

---

## 1. Les trois garde-fous

Ils tiennent en trois lignes, et ils ne réduisent en rien ce que tu copies.

**a) Un chiffre que le serveur ne renvoie pas ne s'affiche pas.** La maquette
n'a pas eu accès à la base. Avant d'afficher un nombre, vérifie qu'il existe
dans `api.js`. S'il n'existe pas : soit tu l'enlèves, soit tu me le signales
pour qu'on écrive la migration. Tu ne le calcules jamais dans l'écran.

**b) Les tailles sont relatives.** Les cadres de la maquette sont figés à
834 × 1194. C'est une planche de dessin, pas une contrainte. L'application
tourne aussi sur un iPad de 820 et un iPad mini de 744. Proportions, `clamp()`,
planchers — comme pour le pavé.

**c) Pas de fausse barre d'état.** Le « 22:46 · Wi-Fi · 18 % » en haut de chaque
cadre fait partie du dessin de l'iPad, pas de la page.

Et toujours : aucune ressource extérieure, aucun `:hover` sauf sur l'écran
d'administration, aucun champ de texte libre nulle part.

---

## 2. Les écrans, et où ils sont

| Maquette | Fichier React | Ce que le serveur impose |
|---|---|---|
| **1 · Partie en cours** (3 états) | `Practice.jsx` | la barre de compte à rebours par question est obligatoire — sans elle, la question qui saute passe pour un bug |
| **2 · Accueil élève** | `Home.jsx` | le bandeau de reprise dit « le défi reprend à la première question » et **aucun numéro de question** |
| **3 · Fin de partie** | `Practice.jsx` | `score`, `premier_essai`, `rattrapees`, `points`, `nouveaux_badges` viennent tous d'`enregistrer_session` |
| **4 · Classement d'un défi** | `Challenges.jsx` | « 18 / 27 ont terminé » + « 9 jouent encore » : deux populations nommées, jamais une fraction inventée |
| **5 · Ma classe** | `MaClasse.jsx` | une seule unité par colonne — des élèves sur 27, jamais de pourcentage. Les six compteurs viennent de `maitrise_classe()` |
| **6 · Accueil professeur** | `Home.jsx` | l'encart « 18 élèves de 6ᵉA bloquent sur la table de 7 » vient de `maitrise_classe()` |
| **7 · Sélecteur de tables** | `Practice.jsx` | « Mes 3 tables faibles » = `mes_tables_faibles()`. Les tables au-dessus du plafond sont fermées, pas cachées |
| **8 · Annonce du défi** | `Challenges.jsx` | l'auteur et l'origine viennent d'`auteur_defi()` |
| **9 · Code projeté** | `Challenges.jsx` | « 18 connectés » = `classement_defi()` + le temps réel sur `defis_participants` |
| **10 · Administration** | `Admin.jsx` | **en paysage**, sobre et dense. Le survol souris y est autorisé |

**Quatre écrans n'ont pas de maquette** : `Login.jsx`, `Profile.jsx`,
`Learn.jsx`, `MesDefis.jsx`, et le classement général de `Leaderboards.jsx`.
Tu leur appliques le **même système** — mêmes cartes, mêmes rayons, mêmes
ombres, même hiérarchie de titres — sans rien inventer de nouveau.

---

## 3. En trois envois, pas un seul

Un lot qui touche onze écrans d'un coup ne se relit pas. On vient d'en avoir la
démonstration. Donc trois envois, avec des captures à chaque fois.

**Envoi A — ce que voit l'élève.** Maquettes 1, 2, 3, 7.
C'est 90 % du temps passé dans l'application. Commence par là.

**Envoi B — les défis.** Maquettes 4, 8, 9.

**Envoi C — le professeur.** Maquettes 5, 6, 10, plus les quatre écrans sans
maquette.

À chaque envoi : les captures des écrans concernés, ce qui a résisté, et ce que
tu as dû décider seul. Et le contrôle du 0.1 au vert.

---

## 4. Ce que tu ne changes pas

La logique métier, les appels RPC, la navigation entre écrans. Ce lot ne touche
qu'à ce qui se voit.

Et si une maquette contredit ce que renvoie le serveur : **c'est le serveur qui
a raison**, et tu me le signales au lieu de le contourner.
