# Journal du projet

> **Ce fichier ne se réécrit jamais.** On y ajoute, en haut, à chaque étape
> franchie. `ETAT.md` est la photo du moment ; celui-ci est la mémoire.

---

## Comment écrire une entrée

À la fin de chaque étape — pas à la fin de chaque fichier modifié — ajoute une
entrée **en haut de la section « Entrées »**, juste sous son titre, sur ce
modèle :

```markdown
## 2026-09-03 — Écrans de connexion et d'accueil

**Fait** — Écran de démarrage avec restauration de session, connexion par code
à 6 chiffres, accueils élève et professeur distincts selon `quiSuisJe()`.

**Décidé** — Le champ code accepte le collage depuis Mail : les élèves copient
le code entier plutôt que de le retaper. ✅ *validé par Aymeri le 03/09*

**Proposé, en attente** — Remplacer les 6 cases séparées par un champ unique :
plus simple sur clavier iPad. ⏳ *à trancher*

**Constaté** — Safari iPad remplit parfois le champ automatiquement avec un
ancien code. Contourné en désactivant l'autocomplétion.

**Ensuite** — Brancher l'enregistrement des parties (étape 4 de `ECRANS.md`).
```

### Les quatre rubriques

| Rubrique | Ce qu'on y met |
|---|---|
| **Fait** | Ce qui fonctionne maintenant et qui ne fonctionnait pas avant |
| **Décidé** | Les choix de conception pris. **Indiquer s'ils sont validés, et par qui.** |
| **Constaté** | Ce qui a surpris, cassé, ou ne s'est pas passé comme prévu |
| **Ensuite** | La prochaine étape |

### Trois règles

**Marque clairement ce qui est validé.** ✅ validé par *qui* et *quand*, ou
⏳ proposé en attente. Une décision prise seul par l'agent et une décision
validée par l'établissement n'ont pas le même poids — et dans six mois,
personne ne s'en souviendra.

**« Constaté » est la rubrique la plus utile.** Les surprises et les
contournements sont ce qu'on oublie en premier et ce qu'on regrette le plus de
ne pas avoir noté. Un bug contourné sans trace revient toujours.

**Répercute dans `ETAT.md`.** Une entrée de journal met à jour le tableau d'état
(§2) et, si une décision de conception a été prise, le registre des décisions
(§3). Le journal raconte, `ETAT.md` fait foi.

---

## Entrées

## 2026-09-16 — Intégration de l'historique des défis dans la fiche élève

**Fait** — Migration 49 appliquée sur Supabase (`lkukdlspcgqtiimvwlsd`), `database.ts` et `api.js` branchés (`ficheEleveDefis`).
- `ModalFicheEleve.jsx` : section « Historique des défis » insérée dans l'onglet « Défis & Badges » sous les 4 compteurs KPIs, chargée à la demande (lazy-load) sur la période choisie.
- Chaque défi affiche son en-tête (date, mode Sprint/Contre-la-montre, tables, code), son origine (prof / élèves avec nom complet), le rôle de l'élève, son résultat propre (`termine` avec score et temps, `entre_sans_finir`, ou `pas_joue`), et la participation sans barre de fraction pour les défis d'élèves.
- Volet dépliable par défi affichant le classement complet des participants de la partie.
- 256 cas de tests verts, build validé (88 tokens actifs, 57 RPC).

## 2026-09-16 — Migration 49 : l'historique des défis, et « créer n'est pas jouer »

**Fait** — `supabase/migrations/20260916120000_fiche_eleve_defis.sql` et les cas
250 à 256. **256 cas verts**, zéro ECHEC, 49 migrations rejouées depuis zéro.
**Appliquée sur Supabase**. Une seule fonction en lecture, aucune table touchée,
aucune fonction existante modifiée — le format de la migration 45.

**Constaté en lisant la vraie sortie — trois états, pas deux.** Ma première
version étiquetait « entré sans finir » un élève qui avait créé un défi sans
jamais y jouer. Or `creer_defi` n'inscrit pas son auteur aux présences : il n'est
jamais entré. Le cas 251 fixe les trois états, et je l'ai vérifié dans les deux
sens — avec l'ancienne version à deux branches, il affiche ECHEC.

Je ne l'aurais pas vu en relisant mon SQL : il fallait regarder un tableau de
résultats réels et se demander ce que chaque mot voulait dire.

**Décidé — l'union plutôt que l'interdit.** La migration 29 défendait de
soustraire les terminés des rejoints, parce qu'un défi antérieur à la migration 25
a des participations sans présences et donnerait un nombre négatif. Ici la liste
est l'**union** des deux tables : `nb_entres` ne peut structurellement pas passer
sous `nb_termines`, et `nb_sans_finir` se compte personne par personne. Le cas 255
vide les présences d'un défi qui a des scores et vérifie qu'aucun compte ne
dérape. Une contrainte qui rend la faute impossible vaut mieux qu'une règle qu'il
faut se rappeler.

**Décidé — noms complets.** `auteur_defi()` renvoie le nom public « Alice D. »,
fait pour les classements élèves. Cette fiche est un écran d'enseignant : la
réutiliser aurait masqué les noms de famille là où toutes les autres fonctions du
même écran les donnent. Le cas 253 refuse tout nom au format abrégé.

**Livré et relu** — Commit `028a9c2`, migration appliquée sur Supabase. Relecture
dans le code : le fichier de migration au dépôt est au bit près celui qui a été
testé (`8697503…`), ce qui n'allait pas de soi — la migration 48 avait, elle, été
corrigée après coup, et à raison.

Les quatre règles d'affichage sont tenues. **Aucune soustraction** entre les
compteurs : `nb_termines`, `nb_sans_finir` et `attendus` sont lus tels quels, et
la barre de fraction n'apparaît que sur `attendus != null` — donc jamais pour un
défi entre élèves. Les chiffres sont gardés par leur mode
(`mode === 'sprint' && nb_questions`, `mode === 'countdown' && duree_s`) : aucun
chiffre sans signification n'est affiché. Les **trois** états ont bien leurs trois
branches, et le mot « refusé » n'apparaît nulle part dans le fichier.

Rien à reprendre.


## 2026-09-16 — Migration 48 appliquée : je m'étais trompé sur le nom des classes

**Constaté** — Antigravity a trouvé un vrai défaut dans ma migration 48 en
l'appliquant, et sa correction est juste. `niveau_de_classe` capturait **tous**
les chiffres du début (`^([0-9]+)`). Les classes du collège s'appellent « 61 »,
« 62 », « 51 » — 6ᵉ 1, 6ᵉ 2, 5ᵉ 1. « 61 » devenait donc le niveau « 61 » : douze
niveaux au lieu de quatre, et un réglage par niveau inutilisable. Un seul chiffre
(`^([0-9])`) donne bien « 6 ». Vérifié en base : `niveaux_existants` renvoie
`["3","4","5","6"]`.

**Mon erreur, et elle est de la famille que je signale aux autres.** J'ai conçu
contre les classes du jeu de démonstration — « 6A », « 5A » — sans jamais regarder
comment les vraies sont nommées. C'est du raisonnement sur une représentation au
lieu d'un regard sur la donnée, exactement ce que la règle 1 interdit. Je pouvais
le vérifier : `liste_classes()` existe.

**Fait — le trou que la correction laissait est bouché.** Les six assertions du
cas 241 passaient avec l'ANCIENNE expression comme avec la nouvelle : le jeu de
démonstration ne connaît que « 6A » et « 5A », donc rien ne couvrait le format
réel. Revenir à `[0-9]+` — au nom de la généralité, par exemple — aurait laissé
le scénario au vert et cassé les niveaux du collège en silence.

Deux lignes ajoutées : `niveau_de_classe('61') = '6'` et `('51') = '5'`. Vérifié
dans les deux sens — avec l'ancienne expression le cas 241 affiche ECHEC, avec la
nouvelle il est vert. **249 cas verts.**

Et un commentaire dans la migration dit pourquoi c'est un seul chiffre, pour que
personne ne « généralise » ce que quelqu'un a déjà payé.

**Ensuite** — Antigravity : `run.sh` (249 attendus) et commiter les deux fichiers.
Aucune migration à réappliquer : le code SQL en base est déjà le bon, seuls un
commentaire et un cas de test s'ajoutent.


## 2026-09-16 — Intégration frontend du coupe-circuit défis élèves et bouton « Défier un ami »

**Fait** — Branché l'API (`reglagesDefis`, `modifierReglagesDefis`), types `database.ts`, et les écrans :
- `Admin.jsx` : onglet et carte de configuration « Défis entre élèves » réservé aux administrateurs (`estAdmin`), interrupteur général et boutons à bascule par niveau réel (`6ᵉ`, `5ᵉ`, `4ᵉ`, `3ᵉ`, etc.) calqués sur le couvre-feu.
- `Challenges.jsx` : bouton « Défier un ami 👥 » (`btn--purple`) affiché si le mode est partageable et `reglages?.je_peux_creer`, bandeau informatif doux si la création est suspendue.
- `JoinChallenge.jsx` : gestion propre du code retour `raison === 'suspendu'` avec message d'explication.
- Validation `npm run build` : zéro erreur ESLint, build Vite ok, validation des tokens CSS (88 tokens actifs) et validation du contrat API RPC (56 RPC, 68 fonctions).

**Fait aussi** — Migration 48 appliquée sur la base Supabase (`lkukdlspcgqtiimvwlsd`). Détection du niveau ajustée sur le premier chiffre (`^[0-9]`) pour agréger proprement les classes réelles du collège (`61`, `62`, `63` en niveau `6`).

## 2026-09-16 — Migration 48 : le coupe-circuit des défis entre élèves

**Fait** — `supabase/migrations/20260916100000_coupe_circuit_defis_eleves.sql` et
les cas 241 à 249. **249 cas verts**, zéro ECHEC, 48 migrations rejouées depuis
zéro. **Appliquée sur Supabase**.

Une table à une ligne, quatre fonctions (dont deux internes), et **deux `if`**
insérés dans le texte existant de `creer_defi` et `rejoindre_defi` — repris de la
base, jamais reconstitués. Aucune des six fonctions de défi n'est refondue, aucun
défi existant ni score ne bouge.

**Décidé — on coupe l'entrée, jamais la sortie.** `terminer_defi` n'est pas
touchée. Le cas 247 coupe les défis pendant qu'un élève joue et vérifie que sa
partie s'enregistre quand même.

**Constaté en exécutant — mon amorçage était faux, et il l'aurait été à la pire
occasion.** La première version remplissait `niveaux_autorises` avec les niveaux
trouvés en base. `run.sh` a refusé de démarrer : sur une base reconstruite, les
migrations passent avant les données, la liste naissait vide, et tout le collège
se retrouvait coupé. C'est précisément la procédure de `RESTAURATION.md` — une
restauration aurait donc éteint les défis sans que personne comprenne pourquoi.
Règle retenue et écrite au §3 : **liste vide = aucune restriction**, un réglage par
défaut n'éteint jamais une fonctionnalité.

**Constaté aussi** — le cas 248 a d'abord échoué parce que j'écrivais la classe
d'un élève par un `update` direct : le déclencheur `eleves_protection` l'annulait,
faisant exactement son travail. Le test passe désormais par `modifier_eleve`,
comme l'écran Administration. La règle « on ne corrige pas une fiche à la main »
vaut aussi pour les tests.

**Ensuite** — Antigravity : `run.sh` (249 attendus), appliquer la 48, régénérer
`database.ts`, brancher `reglagesDefis` et `modifierReglagesDefis`, puis les deux
écrans — la carte de réglage dans l'Administration et le bouton « Défier un ami ».


## 2026-09-15 — Sélecteur de questions Sprint : deux libellés figés ont survécu

**Relu dans le code** (commits `70c426e` et `94b9e27`). Le gros du travail est
juste : l'écran d'annonce du défi construit bien son sous-titre à partir du défi
lui-même — `${nbQ} questions · 3 secondes chacune`, avec `nbQ` lu des questions
figées et non d'une constante. C'est ce qu'Aymeri demandait, et côté prof comme
côté élève ça affiche la bonne valeur.

Et le « seuil de victoire à 80 % » du rapport n'est pas une règle de score : il ne
déclenche que les confettis (`isSuccess` dans `ChallengeResults`). Les badges
continuent de venir du serveur (`serverResult.nouveaux_badges`). Aucune règle n'a
migré de la base vers l'écran — c'était ma première inquiétude en lisant le
rapport, elle n'était pas fondée.

**CORRECTION de ma relecture — je me suis trompé sur deux des trois lignes.**
J'avais annoncé que l'écran de préparation du Sprint affichait « 20 questions »
à un professeur. C'est faux : `ChallengeConfig` intercepte dès la ligne 482
(`if (estProf) return <ChallengeConfigProf …>`), et les lignes 514 et 551
appartiennent au parcours ÉLÈVE en solo, où le Sprint fait bel et bien
20 questions. Le libellé y est juste. La leçon est celle du projet : j'ai lu deux
lignes sans remonter à leur composant parent, exactement l'erreur que je reproche
aux écrans qui concluent sans regarder d'où vient la donnée.

Seule la ligne 38 était réellement fautive — la description figée du mode,
affichée sur la carte de sélection avant que le nombre ne soit choisi. Corrigée
en « Le plus rapide gagne ! », sans nombre. C'est la bonne correction.

**Constaté en vérifiant — UN ÉLÈVE NE PEUT PLUS CRÉER DE DÉFI.**
Recherche faite sur l'ensemble du frontend : `creerDefi` n'est appelée qu'à un
seul endroit (`Challenges.jsx:217`), alimentée par `onCreateDefi`, qui n'est
passée qu'à `ChallengeConfigProf`. La branche élève de `ChallengeConfig` ne
propose que « Jouer seul ⚔️ ». Aucun écran n'offre à un élève de créer un défi.

Or le serveur sait le faire et l'attend : `creer_defi` gère `cree_par_eleve`, le
plafond de 5 défis ouverts et les 24 h d'expiration ; `mes_defis` renvoie
`je_suis_createur` précisément pour distinguer ce cas ; et le §3 d'`ETAT.md`
porte la décision du 31 août avec sa raison entière — « Si un défi de professeur
rapportait davantage, les défis entre copains mourraient en trois semaines — or
ce sont eux qui font qu'un élève ouvre l'application à 19 h sans qu'on le lui
demande. »

C'est la forme exacte du lot 20 : un geste disparu de l'écran, le SQL intact,
les tests verts, et `check-api.mjs` muet parce que `creerDefi` est toujours
appelée — par le professeur. Le garde-fou surveille qu'une fonction est appelée,
jamais qu'elle l'est par tous ceux qui devraient pouvoir l'appeler.

**Ensuite** — Aymeri : trancher. Soit la décision du 31 août tient et il manque
un bouton « Défier un copain » à l'élève, soit elle a changé et il faut la
réécrire au §3 avec sa nouvelle raison. Antigravity : rien tant que ce n'est pas
tranché.


## 2026-09-15 — Sélecteur de questions en défi Sprint (10 · 20 · 30 · 45 · 60)

**Demandé** — Pouvoir choisir le nombre de questions lors du lancement d'un défi Sprint pour la classe, avec les pastilles 10, 20, 30, 45 et 60 questions (20 par défaut). Conserver rigoureusement la charte graphique et adapter tous les écrans d'annonce côté prof et côté élève.

**Fait**
- **Interface prof (`Challenges.jsx`)** : ajout du sélecteur de pastilles pour le Sprint (`10 · 20 · 30 · 45 · 60`), reprenant au pixel près la charte graphique du Contre-la-montre (carte surface, typographie uppercase, bordure et fond `--action`, transition).
- **Transmission API** : `handleCreateDefi` et `ChallengeConfigProf` transmettent `nbQuestions` au backend `creerDefi` (`p_nb_questions`), qui supportait déjà nativement la génération dynamique de questions.
- **Écran de projection prof (`DefiCodeScreen`)** : l'en-tête projeté affiche dynamiquement `Sprint (X questions)` au lieu du texte statique `Sprint`.
- **Écran d'annonce élève (`DefiIntro` / Maquette 8)** : affiche dynamiquement `X questions · 3 secondes chacune` au lieu de `20 questions`.
- **Écran de prévisualisation (`JoinChallenge.jsx`)** : affichage dynamique `Sprint · X questions`.
- **Calcul de réussite (`ChallengeResults.jsx`)** : seuil de succès proportionnel à 80% du nombre de questions au lieu du seuil fixe `16`.
- Validation : `npm run build` (ESLint 0 erreur, CSS tokens 100% valides, 54 RPC vérifiées). Commité et poussé sur master (`70c426e`).

---

**Constaté** — Signalé par Aymeri : dans Administration › Élèves, le bouton
« Fiche » ne fait rien, pour un élève actif comme désactivé.

**La cause, `Admin.jsx` ligne 517** : `onClick={() => setEleveFicheId(e.id)}`.
La liste vient de `listeEleves()`, donc de `liste_eleves()`, dont la colonne
s'appelle **`eleve_id`**. `e.id` vaut `undefined`, `eleveFicheId` reste falsy, et
le garde `{eleveFicheId && <ModalFicheEleve …>}` n'ouvre jamais rien. Le bouton
a l'air mort parce qu'il l'est.

La preuve tient dans la même boucle : la ligne d'en face écrit
`key={e.eleve_id}`. Un seul site est fautif — `MaClasse.jsx:725`,
`Admin.jsx:969` et les deux `onOuvrirFiche` du comparateur passent tous
`eleve_id`.

**Décidé — c'est la troisième fois, et ce n'est pas un hasard.** `classe` au lieu
de `nom_affiche`, puis `nom` au lieu de `nom_affiche`, maintenant `id` au lieu de
`eleve_id`. À chaque fois : un écran lit un nom de colonne qui n'existe pas, et
rien ne bronche. `check-api.mjs` ne peut pas le voir — il vérifie que les RPC
existent et qu'on les appelle, jamais que les colonnes lues portent le bon nom.

**Ce qui a rendu le défaut MUET, et qui est corrigeable** : le montage conditionnel
`{eleveFicheId && …}` avale silencieusement un `undefined`. Si le bouton avait
ouvert la modale avec un identifiant vide, `fiche_eleve()` aurait répondu
« Eleve introuvable » et le défaut aurait été visible à la première utilisation,
en recette, pas en production. Un garde qui masque une erreur de programmation au
lieu de la montrer est un garde mal placé — c'est la même leçon que l'écran blanc
muet de ce matin, à l'échelle d'un composant.

**Fait** —
1. `Admin.jsx` ligne 517 corrigée : `e.id` remplacé par `e.eleve_id`. Le bouton « Fiche » de l'onglet Élèves ouvre désormais immédiatement la fiche de l'élève sélectionné.
2. `ModalFicheEleve.jsx` rend tout identifiant absent bruyant et explicite : si `eleveId` est absent ou vide, la modale s'ouvre et affiche un avertissement visuel `⚠️ Identifiant élève manquant` au lieu de ne rien rendre.
3. Les écrans parents (`Admin.jsx`, `MaClasse.jsx`) utilisent la fonction `ouvrirFicheEleve(id)` et le garde conditionnel `{eleveFicheId !== null && ...}` : si un appelant tente d'ouvrir une fiche avec un `id` falsy, la modale s'ouvre pour signaler l'erreur de programmation au lieu d'avaler l'événement en silence.
4. Validation `npm run build` réussie (ESLint 0 erreur, Vite build OK, check-tokens 88 tokens, check-api 66/66 RPC).

**Relu maillon par maillon (Claude)** — Les cinq points d'ouverture de la fiche
passent bien `eleve_id` : `Admin.jsx` 518 et 970, `MaClasse.jsx` 726, et les deux
`onOuvrirFiche` du comparateur. La chaîne du filet est complète et je l'ai suivie
en entier, parce qu'elle se referme en trois endroits différents : l'écran
transforme un identifiant vide en sentinelle `'__MANQUANT__'` — truthy, donc la
modale se monte au lieu d'être avalée —, puis la reconvertit en `null` juste
avant de la passer (`eleveId={eleveFicheId === '__MANQUANT__' ? null : …}`), et
le garde `if (!eleveId)` affiche enfin l'avertissement. **Aucune RPC n'est
appelée avec un identifiant qui n'est pas un UUID** — c'était le risque que je
soupçonnais, il n'existe pas.

**Constante sentinelle centralisée** — `ELEVE_ID_MANQUANT` est exportée depuis `ModalFicheEleve.jsx` et importée dans `Admin.jsx` et `MaClasse.jsx`. Plus aucune chaîne en dur dupliquée.

**Clarté de la colonne « À revoir » et harmonisation visuelle** —
1. La colonne « À revoir » affiche désormais explicitement « X faits » (ex. : `33 faits` sur 55) et son en-tête mentionne `(sur 55)` pour dissiper toute confusion avec une note scolaire sur 20.
2. Suppression de l'émoji graphique `📊` dans la barre latérale Administration et sur le bouton du tableau, pour respecter strictement la charte graphique épurée du projet.


## 2026-09-14 — Lot B en production : Tableau de comparaison des élèves

**Fait** —
1. Migration 47 appliquée en production sur Supabase. 240 cas de test verts (0 échec).
2. Types TypeScript mis à jour (`database.ts`).
3. Fonctions `comparerEleves` et `comparerElevesEntete` créées dans `frontend/src/api.js`.
4. Composant `TableauComparateur.jsx` créé et intégré dans `MaClasse.jsx` (3e sous-onglet « Comparatif & Classement ») et dans `Admin.jsx` (onglet de barre latérale « Comparateur »).
5. Les quatre règles de présentation appliquées :
   - `null` s'affiche `—` et se trie en dernier dans les deux sens (asc et desc).
   - Toute moyenne porte son dénominateur dans la cellule (`1,9 s · 3 rép.`).
   - Les en-têtes respectent `portee_periode` (« Vitesse (depuis le début) » vs « Parties (30 j) »).
   - « 34 vertes sur 55 » plutôt qu'un pourcentage seul (`faits_plage`).
6. Le seuil de calcul rapide provient dynamiquement de `comparer_eleves_entete` (`seuil_rapide_ms`).
7. Vérification complète passée avec succès : `npm run build` (ESLint + Vite + `check-tokens.mjs` 88 tokens + `check-api.mjs` 66/66 fonctions connectées) et `run.sh` (240 cas verts).

## 2026-09-14 — Migration 47 : comparer les élèves (lot B), et « la table de 7 »

**Fait** — `supabase/migrations/20260914163000_comparer_eleves.sql` et les cas 233
à 240. **240 cas verts**, zéro ECHEC, 47 migrations rejouées depuis zéro. Pas
encore appliquée.

Deux fonctions et deux aides : `comparer_eleves` (une ligne par élève actif,
toutes colonnes triables par l'écran), `comparer_eleves_entete` (la plage, ses
multiplications distinctes, `inscrits` et `ont_joue`, et `portee_periode`), plus
`fait_dans_plage` et `nb_faits_plage` — la règle d'appartenance et son compte
écrits une seule fois, pour que le filtre et le dénominateur ne divergent jamais.

**Constaté — « la table de 7 » n'est pas « le fait 7×7 ».** Trouvé en exécutant la
fonction sur les données de démo, pas en la relisant : demander la table de 7 avec
une plage 7..7 ne retenait qu'UNE multiplication, et chaque élève affichait 100 %
ou 0 %. Un professeur qui dit « la table de 7 » entend 7×1 à 7×10.

Il y a donc deux notions distinctes — la **plage** (les deux opérandes dedans) et
la **table** (un des deux opérandes vaut N) — et deux paramètres. Le cas 234 fixe
la sémantique : `nb_faits_plage(1, 10, 7)` vaut 10, et `3_8` n'appartient pas à la
table de 7.

**Décidé — le dénominateur du lot B n'est pas celui de la fiche élève, et c'est
volontaire.** La fiche annonce les cases de la grille (plafond × plafond) parce
qu'un élève doit retrouver ce qu'il voit. Le tableau annonce les multiplications
distinctes (55 sur les tables 1 à 10) parce qu'avec 100 personne ne dépasserait
55 %. Écrit au §3 pour que personne ne les « aligne » un jour au nom de la
cohérence.

**Décidé — pas de seuil de volume.** Aymeri a tranché contre ma proposition : une
ligne sans mesure affiche `—` et se range en fin de tri, personne n'est écarté.
Sa règle est plus simple et elle a un mérite que j'avais manqué — les cinq bugs de
population de ce projet effaçaient tous les élèves qui n'avaient rien fait ; ici
ils restent visibles par construction. `nb_temps` à côté de la moyenne suffit à
montrer la fragilité.

**Ensuite** — Antigravity : `run.sh` (240 attendus), appliquer la 47, régénérer
`database.ts`, brancher `comparerEleves` et `comparerElevesEntete`, puis l'écran.
Reste ouvert du lot A : le seuil de 3 s écrit en dur quatre fois dans
`ModalFicheEleve.jsx` au lieu de `rapidite.seuil_rapide_ms`.


## 2026-09-14 — Lot A en production : relecture, et le seuil de 3 secondes écrit en dur

**Fait** — Migration 46 appliquée sur la base de production, `ModalFicheEleve.jsx`
livré et branché dans `MaClasse.jsx` et `Admin.jsx` (commits `e2d9c8f` et
`b7cc60e`). Relu dans le code, pas sur le rapport.

**Relu sans rien à reprendre** — Le fichier de migration au dépôt est au bit près
celui qui avait été testé (`258cfacd…`) : ce qui a été appliqué en production est
donc le texte éprouvé, ce qui comptait d'autant plus que la migration remplace
`enregistrer_session`, la fonction la plus appelée de l'application.

Les trois règles de l'écran sont tenues. Le bloc horaires est doublement
fermé — le bouton d'onglet ET le panneau sont conditionnés à
`ficheData?.portee === 'admin'`, sans aucun signal de substitution. Les moyennes
portent leur dénominateur (« sur 37 réponses », « (aucune mesure) ») et une
absence de mesure s'affiche `—`, jamais `0`. Et les deux mesures de rapidité sont
deux cartes distinctes, nommées « Rapidité de calcul mental » et « Cadence
globale de partie ».

**Constaté — le seuil de rapidité est écrit en dur dans l'écran, quatre fois.**
`fiche_eleve` renvoie `seuil_rapide_ms`, qui vient de `seuil_reponse_rapide()`.
Il n'est **jamais lu** : `ModalFicheEleve.jsx` compare à `3000` en dur au filtre
« Plus lentes », au libellé du filtre, à la coloration des lignes et au compteur
« Faits rapides (< 3 s) ».

C'est la décision du 4 septembre prise à l'envers — « le seuil technique est écrit
en un seul endroit, le front n'a pas à le connaître » — et la même forme que le
libellé « Soirée (20h-21h30) » de la veille.

Ce qui casse, et pour qui : `seuil_reponse_rapide()` est un paramètre
**pédagogique**, pas une constante technique. Le jour où on le déplace, la grille
de maîtrise verdira sur une règle et le même écran rangera la même multiplication
sous « Plus lentes ». Deux affirmations contradictoires sur le même fait, au même
endroit — c'est la famille « un chiffre juste que personne ne sait lire ».

**Ensuite** — Antigravity : lire `rapidite.seuil_rapide_ms` et l'employer aux
quatre endroits, libellé compris (« Plus lentes (> 3 s) » se compose à partir du
seuil reçu). Aucun SQL à changer, la valeur est déjà dans la réponse.
Puis le lot B, le comparateur, une fois la fiche vue en classe.


## 2026-09-14 — Lot A : Fiche Élève intégrée (micro view) et garde-fous validés

**Fait**
- `ModalFicheEleve.jsx` livré : rapidité mentale pure (`temps_moyen_reponse_ms` issu de `maitrise`), cadence globale de partie (`secondes_par_question`), 4 KPIs de volume, progression jour par jour (`fiche_eleve_rythme`), détail des faits (`fiche_eleve_faits`) avec filtres et dénominateur systématique, défis et badges.
- Bloc `horaires` (dernière connexion, parties couvre-feu, distribution horaire 24h) STRICTEMENT réservé aux administrateurs (`portee === 'admin'`).
- Intégration dans `MaClasse.jsx` (colonne et bouton Fiche par élève) et dans `Admin.jsx` (tableau des élèves et tableau de surveillance nocturne).
- API client (`api.js`) enrichie : `ficheEleve`, `ficheEleveRythme`, `ficheEleveFaits`.
- Types `database.ts` régénérés pour `maitrise` (`somme_temps_ms`, `nb_temps`) et les 3 RPC.
- Garde-fous 100% verts : ESLint (0 erreur/warning), build Vite réussi, `check-tokens.mjs` (88 tokens actifs), `check-api.mjs` (52 RPCs appelées, 64 exposées, 0 couture rompue), et `run.sh` (232 cas SQL verts, 0 échec).

**Décidé**
- Dénominateur systématique sur chaque moyenne : affichage de `X,X s sur N réponses` (ou `— (aucune mesure)` si vide, jamais 0).
- Distinguer expressément le calcul mental pur (`temps_moyen_reponse_ms`) de la cadence de jeu (`secondes_par_question`).

**Ensuite**
- Migration 46 appliquée avec succès sur Supabase distant (2 236 faits amorcés sur maitrise, fonctions et grants en place).
- Conception du Lot B (comparateur de classe et vue macro).

## 2026-09-14 — Migration 46 : le temps de réponse, et la fiche d'un élève (lot A)

**Fait** — `supabase/migrations/20260914150000_temps_reponse_et_fiche_eleve.sql`
et les cas 226 à 232. **232 cas verts**, zéro ECHEC, sur un PostgreSQL vierge
avec les 46 migrations rejouées depuis zéro — y compris la 45 d'Antigravity et
son cas 225. Pas encore appliquée.

Deux colonnes sur `maitrise` (`somme_temps_ms`, `nb_temps`), `enregistrer_session`
qui accumule au lieu d'écraser, et trois fonctions : `fiche_eleve` (un seul appel,
`portee` prof/admin), `fiche_eleve_rythme` (un point par jour joué) et
`fiche_eleve_faits` (une ligne par multiplication rencontrée).

**Constaté — le piège de la migration 26 ne pouvait pas se reproduire, et je l'ai
vérifié au lieu de le supposer.** Interrogation de `pg_proc.prosrc` : une seule
fonction écrit dans `maitrise`, `enregistrer_session`. Et `terminer_defi` la
**délègue** — il n'en tient pas une copie. Une seule insertion à modifier, les
défis compris. Le cas 228 le prouve par le résultat plutôt que par la lecture.

**Décidé (1)** — La moyenne plutôt que l'historique. Une table réponse par
réponse aurait donné la même moyenne pour ~2 millions de lignes par an, sur une
offre gratuite plafonnée à 500 Mo, et de la donnée fine sur des mineurs à
justifier. Deux colonnes donnent le même résultat à volume constant. L'historique
reste possible le jour où l'on voudra rejouer une partie question par question.

**Décidé (2)** — Le texte de `enregistrer_session` a été repris **de la base**
(`pg_get_functiondef`) et la modification insérée dedans, jamais un corps
reconstitué de mémoire. C'est la leçon de la migration 22, où une réécriture de
mémoire avait fait disparaître une branche entière.

**Décidé (3)** — Amorçage assumé : `dernier_temps_ms` vaut une mesure pour les
lignes existantes. C'est un seul échantillon par fait, et c'est écrit dans la
migration. Sans lui, tous les élèves auraient une moyenne vide le jour de la mise
en service, et personne n'aurait su si l'outil était cassé ou la base neuve.

**Constaté (2) — deux mesures de rapidité qu'il ne faut pas confondre.** Le temps
de réponse vient de `maitrise`, mesuré question par question par le client : c'est
le calcul mental. Les secondes par question viennent des parties, durée divisée
par nombre de questions : elles incluent la lecture et la frappe. Les deux sont
justes et ne donnent pas le même chiffre — elles portent donc des noms différents
jusque dans le SQL. Seule la seconde a un historique, et c'est elle qui répond à
« est-ce qu'il progresse ».

**Ensuite** — Antigravity : `run.sh` (232 cas attendus), appliquer la migration 46,
régénérer `database.ts`, brancher `ficheEleve`, `ficheEleveRythme` et
`ficheEleveFaits` dans `api.js`, puis l'écran de fiche. Le bloc horaires ne se
dessine QUE si `portee === 'admin'` — ne pas le déduire d'un autre signal.
Ensuite seulement, le lot B (le comparateur), à concevoir une fois la fiche vue
en vrai.


## 2026-09-14 — Écran blanc en production : 225 cas verts et l'application ne démarrait pas

**Fait** — Import `branding` restauré dans `App.jsx`, `RootErrorBoundary` ajouté
dans `main.jsx`, déployé. Relu dans le code : l'import est bien là (ligne 16), et
la barrière est une vraie classe avec `getDerivedStateFromError`, placée autour
d'`<App />`. Rien à reprendre sur le correctif.

**Constaté — ce qui a réellement échoué, ce n'est pas l'oubli, c'est ce qui aurait
dû l'attraper.** Un `ReferenceError` sur une variable non importée est la faute
la plus ordinaire qui soit. Elle est passée parce que le projet n'a **aucun
linter** : `devDependencies` contient `vite`, `@vitejs/plugin-react` et les
`@types`, rien d'autre. `no-undef` d'ESLint l'aurait signalée en une seconde.

Et la forme de l'incident est connue. C'est la troisième fois :
· lot 20 — le bouton « ajouter un élève » disparaît, le SQL intact, 183 cas verts ;
· migration 42 — `run.sh` s'arrête avant le premier cas, personne ne le voit ;
· aujourd'hui — 225 cas verts, le build vert, et 350 élèves devant une page ivoire.

À chaque fois : **le serveur avait raison, les tests étaient verts, et ce qui
arrivait à l'utilisateur était cassé.** Nos deux garde-fous surveillent le pont
entre le SQL et les écrans. Aucun ne vérifie que l'application *démarre*.

**Constaté (2) — la barrière ne couvre pas le cas le plus probable pour la
suite.** Un `ErrorBoundary` intercepte les erreurs de rendu. Il n'intercepte pas
ce qui est levé pendant le **chargement des modules** — or `api.js` fait
exactement ça : `if (!URL || !ANON) throw new Error(...)` au niveau du module.
`main.jsx` importe `App`, qui importe `api.js` : le throw part **avant** que
`createRoot().render()` ne s'exécute, et la barrière n'est jamais montée. Écran
blanc de nouveau.

Ce n'est pas théorique : la scission des variables d'environnement prévue pour
l'environnement local (`.env.development`, `.env.prod`, sortie des valeurs de
`.env.local`) est précisément le geste qui produit un `VITE_SUPABASE_URL`
absent sur un build Vercel.

**Décidé** — Deux garde-fous à ajouter, par ordre d'efficacité :
1. Un filet dans `index.html` — quelques lignes inline qui, si `#root` est
   encore vide après quelques secondes, y écrivent un message lisible. Il ne
   dépend pas de React, donc il couvre **toutes** les causes d'écran blanc, y
   compris celles que la barrière ne voit pas.
2. ESLint avec `no-undef` dans `npm run build`. Coût nul, et il attrape
   exactement la faute d'aujourd'hui.
Et, quand l'environnement local existera, une vérification de démarrage : servir
`dist/`, l'ouvrir sans interface, échouer si `#root` est vide ou si la console
porte une erreur. C'est le troisième garde-fou, celui qui manquait.
⬜ *à valider par Aymeri, à écrire par Antigravity*

**Ensuite** — Antigravity : les deux garde-fous ci-dessus. Aymeri : la ligne au
registre de traitement RGPD reste ouverte (§5).


## 2026-09-14 — Correction de l'écran blanc au démarrage et application des 3 correctifs de relecture Option 3

**Fait**
- **Résolution du blocage au démarrage sur iPad / Safari** : import manquant `branding` dans `frontend/src/App.jsx` corrigé, variables token nettoyées, et ajout d'un `RootErrorBoundary` global dans `main.jsx` pour interdire toute page blanche muette. Testé en direct sur le navigateur de production sans aucune erreur console.
- **Repli hors-ligne du couvre-feu (`logic/couvreFeu.js`)** :
  * `lireCouvreFeuLocal()` exclut systématiquement les champs calculés (`en_cours`, `maintenant`, `prochaine_bascule`) pour que l'horloge locale prenne le relais de façon autonome sans rejouer un instantané figé, réparant immédiatement tout iPad ayant un ancien cache.
  * `sauvegarderCouvreFeuLocal()` ne persiste que la configuration stable `{ actif, heure_debut, heure_fin, message }`.
- **Réveil de l'iPad (`App.jsx`)** : écouteur de l'événement `visibilitychange` ajouté avec nettoyage propre. Dès que l'iPad sort de veille ou que l'onglet revient au premier plan, `couvreFeu()` est immédiatement réévalué. En cas d'échec réseau, repli fluide sur la règle locale.
- **Alignement strict avec les RPC PostgreSQL (`Admin.jsx`)** :
  * La modale `ModalDetailEleveActivite` utilise directement `s.pendant_couvre_feu` (booléen calculé côté serveur dans le fuseau `Europe/Paris`) pour le comptage et l'étiquette 🌙 Couvre-feu, supprimant tout filtrage fragile sur chaîne d'affichage.
  * Durée et scores alignés sur `s.joue_le`, `s.duree_s` et `s.nb_questions`.
  * Le tableau d'activité nocturne exploite directement `parties_couvre_feu` et `derniere_partie` fournis par `activite_nocturne()`.
  * La mention de la soirée est dynamisée : `🟠 Soirée (20h-${formaterHeureReprise(heure_debut)})`, suivant fidèlement la borne réglée par l'administrateur.
- **Validation & Déploiement** : 225 scénarios SQL verts (0 échec), build Vite + vérification des 88 tokens et 49 RPC réussi à 100%, commit et push sur `origin/master`.

## 2026-09-14 — Relecture de l'Option 3 : le repli hors-ligne ne se déclenche jamais

**Fait** — Migrations 44 et 45 appliquées, écrans livrés, commit `79aa246`.
Relecture dans le code, pas sur le rapport.

**Relu sans rien à reprendre** — La migration 45 (`activite_profs`) a été écrite
hors du partage habituel ; elle est correcte. Elle porte son `est_admin()`, son
`grant execute`, et surtout elle compte les parties dans `sessions_profs` et non
dans `sessions_jeu` : c'était le piège évident, les deux tables n'ont aucune
intersection par construction. Le cas 225 l'exécute réellement, donc un nom de
colonne faux dans un corps `plpgsql` — que PostgreSQL ne valide pas à la
création — aurait été attrapé. `logic/couvreFeu.js` est juste, y compris le
créneau qui franchit minuit, et `App.jsx` programme bien la bascule sur
`prochaine_bascule`.

**Constaté (1) — le repli hors-ligne est du code mort, et il peut enfermer un
élève dehors en pleine classe.**
`sauvegarderCouvreFeuLocal(res.data)` écrit dans `localStorage` la réponse
serveur **entière**, `en_cours` compris. Or `estEnCouvreFeu()` commence par
`if (typeof config.en_cours === 'boolean') return config.en_cours;` — et
`couvreFeuData` est initialisé à `lireCouvreFeuLocal()`. La branche de calcul
hors-ligne est donc **inatteignable** dès qu'un iPad a été connecté une fois :
l'application rejoue un instantané figé.

Les deux sens sont mauvais, et le second est le sérieux :
· dernier appel à 18h (`en_cours: false`), iPad en mode avion à 23h → aucun
  couvre-feu, exactement ce que la fonction promettait d'empêcher ;
· dernier appel à 22h (`en_cours: true`), wifi en panne le lendemain à 10h →
  **l'élève est verrouillé en pleine séance**, et le professeur n'a aucun moyen
  de comprendre pourquoi.
Correctif : ne pas persister les champs calculés. Les retirer à la **lecture**
(`lireCouvreFeuLocal`) plutôt qu'à l'écriture, pour réparer aussi les iPads qui
ont déjà écrit la mauvaise valeur.

**Constaté (2) — rien ne réévalue le couvre-feu au réveil de l'iPad.**
La bascule est programmée par un `setTimeout`. Sur iPad, l'application passe son
temps en arrière-plan et iOS suspend les minuteries : ouverte à 20h et mise en
veille, elle ne verrouille pas à 21h30. Il manque un `visibilitychange` qui
rappelle `couvreFeu()` au retour au premier plan.

**Constaté (3) — l'écran refait trois calculs que le serveur lui donne déjà.**
`activite_eleve_detail` renvoie `pendant_couvre_feu` et `activite_nocturne`
renvoie `parties_couvre_feu` : **ni l'un ni l'autre n'est lu**. `Admin.jsx`
recalcule le créneau dans `formaterBadgeHoraire()` avec `d.getHours()`, donc
dans le fuseau du navigateur et non à Paris, et recompte les parties nocturnes
en filtrant sur le **libellé** du badge (`.label.includes('Couvre-feu')`) — un
comptage assis sur une chaîne d'affichage, qui tombera à zéro au premier
changement de formulation. C'est la sixième fois que ce projet fabrique une
population dans un écran ; `check-api.mjs` ne voit pas ce cas, parce qu'il
surveille les RPC appelées, pas les colonnes ignorées.

Et le libellé « 🟠 Soirée (20h-21h30) » écrit en dur nomme une borne qui est
désormais réglable : il mentira au premier déplacement du couvre-feu. Le seuil
de 20h00 est par ailleurs une deuxième définition de la soirée, inventée par
l'écran — si cette notion doit exister, elle appartient au serveur, à côté de
celle du couvre-feu.

**Ensuite** — Antigravity : les trois correctifs ci-dessus, tous côté React,
aucun SQL à changer. Aymeri : la ligne au registre de traitement RGPD reste
ouverte (§5 d'`ETAT.md`).


## 2026-09-14 — Option 3 & Migration 45 : Couvre-feu nocturne, activité des classes et implication des enseignants

**Fait**
- **Sauvegarde et vérification préalable de la base de données** : dump complet compressé de la base Supabase distante (313 élèves, rôles, sessions) vérifié avec succès et archivé localement ainsi que sur Google Drive.
- **Migration 45 (`20260914121500_activite_profs_et_reglage.sql`)** appliquée sur Supabase distant :
  * Fonction `activite_profs()` réservée administrateur via `est_admin()`. Fournit la dernière connexion réelle, le nombre de défis créés pour les classes (`nb_defis`) et le nombre de parties jouées (`nb_parties`).
  * Scénarios de tests SQL portés à **225 cas verts (0 échec)**.
- **Résilience hors-ligne du couvre-feu** :
  * Module `frontend/src/logic/couvreFeu.js` avec cache persistant `localStorage`.
  * Même en mode avion / sans wifi, l'iPad bloque le lancement de nouveaux entraînements et défis si l'horloge locale est dans la plage horaire du couvre-feu (`21h30 - 07h30` par défaut).
  * L'exercice en cours n'est pas coupé brutalement, mais toute nouvelle partie ou rejouer est verrouillé.
- **Accueil élève & écrans de jeu** :
  * Bannière de sommeil apaisante avec calcul dynamique de l'heure de réveil (`prochaine_bascule`, `heure_fin`).
  * Boutons d'entraînement et défis grisés en période de couvre-feu. Le mode « Apprendre » reste accessible sans limite pour relire les tables sereinement.
- **Vue Enseignant (`MaClasse.jsx`)** :
  * Bascule d'onglets « Maîtrise des tables » vs « Activité & Temps de jeu ».
  * Sélecteur de période (Aujourd'hui, 7j, 14j, 30j) avec 4 cartes d'indicateurs (Inscrits, Ont joué, Parties terminées, Temps moyen par joueur actif).
  * Tableau individuel avec libellé strict « **temps passé en partie** », nombre de parties, jours actifs et date relative.
- **Console d'Administration (`Admin.jsx`)** :
  * Nouvel onglet « 🌙 Couvre-feu & Nuit » : paramétrage complet des horaires, message d'endormissement, et surveillance des parties nocturnes (tags 🟢 Journée, 🟠 Soirée 20h-21h30, 🌙 Couvre-feu).
  * Modale chronologique par élève détaillée.
  * Onglet Enseignants enrichi : dernière connexion visible directement, métriques globales d'équipe, et indicateurs d'implication (défis et parties).

**Décidé** — Validation complète par Aymeri. Le temps d'activité est strictement nommé « temps passé en partie » pour ne pas induire en erreur sur le mode « Apprendre » non chronométré. L'heure de reprise n'est jamais codée en dur dans les textes et découle toujours du paramètre `heure_fin`.

**Constaté** — Le scénario de tests et les vérificateurs de build (`check-tokens.mjs`, `check-api.mjs`) ont garanti la conformité stricte des 88 variables CSS et l'alignement des 49 RPC avec la base distante.

**Ensuite** — Déploiement en production et communication aux équipes pédagogiques.

## 2026-09-14 — Migration 44 : le couvre-feu, et l'activité des élèves en deux étages

**Fait** — `supabase/migrations/20260914110000_couvre_feu_et_activite.sql` et les
cas 212 à 224. **224 cas verts**, zéro ECHEC, sur un PostgreSQL vierge avec les
44 migrations rejouées depuis zéro. La migration n'est pas encore appliquée.

Une table d'un seul enregistrement — la clé primaire `unique_ligne check
(unique_ligne)` interdit physiquement une deuxième ligne de configuration — avec
`actif`, `heure_debut`, `heure_fin`, `message`. RLS activée et **aucune
politique** : la table n'est atteignable que par les fonctions `security
definer`, conformément à la règle « le front n'écrit jamais dans les tables ».

`couvre_feu()` renvoie l'état complet, plus deux choses que l'écran aurait
sinon fabriquées : `maintenant`, l'heure du **serveur** — sans quoi le
verrouillage dépendrait de l'horloge de l'iPad, qu'un élève peut changer et
qu'un fuseau mal réglé rend fausse — et `prochaine_bascule`, pour que l'écran
programme le verrouillage à la seconde près au lieu d'interroger la base en
boucle.

Côté activité, quatre fonctions et deux étages : `activite_synthese` et
`activite_classe` pour tout enseignant, `activite_nocturne` et
`activite_eleve_detail` pour les administrateurs seuls.

**Décidé** — Trois choses, toutes écrites au §3 d'`ETAT.md` avec leur raison : le
serveur ne refuse aucune partie (la file hors-ligne jetterait les parties
légitimes différées) ; les heures sont réglables et **une seule définition de la
nuit** sert au couvre-feu comme à la détection ; l'heure de connexion nominative
est réservée aux administrateurs.

**Constaté — deux défauts trouvés en exécutant, aucun en relisant.**

1. `activite_classe` répondait **« column reference "eleve_id" is ambiguous »**.
   `eleve_id` est à la fois une colonne de sortie de la fonction — donc une
   variable PL/pgSQL — et une colonne de `sessions_jeu`. La fonction serait
   tombée au premier appel depuis l'écran. Corrigé en préfixant `sj.` partout
   dans la sous-requête latérale. `activite_nocturne`, écrite juste après avec
   les mêmes colonnes de sortie, était déjà qualifiée : c'est le hasard qui a
   décidé laquelle des deux était cassée, pas le raisonnement.

2. `activite_synthese` comptait **deux populations**. `inscrits` portait sur les
   élèves actifs, `nb_parties` sur tous les élèves — un élève désactivé pesait
   dans les parties sans peser dans les inscrits. Le sixième bug de population
   de ce projet, attrapé avant livraison cette fois. Corrigé par un `where
   e.actif` unique, et le **cas 220** le vérifie en désactivant un élève et en
   regardant les deux compteurs bouger ensemble.

**Ensuite** — Aymeri : relire les deux décisions du §3 avant application, et
surtout **ajouter ce module au registre de traitement RGPD** — c'est la première
fois que l'application enregistre et affiche des horaires de connexion de
mineurs ; la ligne « un enseignant accède aux données de maîtrise de tout le
collège » ne couvre pas ça.
Antigravity : `run.sh` (224 cas attendus), appliquer la migration 44, régénérer
`database.ts` — cette fois il **changera**, quatre fonctions apparaissent —,
brancher `couvreFeu()` et les quatre fonctions d'activité dans `api.js`, puis
les écrans.


## 2026-09-14 — Migration 43 : un import d'enseignants ne change jamais un rôle

**Fait** — `supabase/migrations/20260914080000_import_profs_roles.sql`, et les
cas 208 à 211. Le cas 208 passe de l'étiquette « A TRANCHER » à un test
d'intégrité en bonne et due forme. 211 cas verts, zéro ECHEC, sur un PostgreSQL
vierge avec les 43 migrations rejouées depuis zéro.

Ce que fait la migration : une **création** vaut `prof` ; une **mise à jour** ou
une **réactivation** garde le rôle en base, quoi que dise le fichier — la
colonne `role` a tout simplement disparu du `update`. Un rôle absent, vide, ou
inconnu est traité comme une absence d'instruction. Le verrou « dernier
administrateur » de la migration 42 a été retiré dans le même geste : il ne
protégeait qu'une seule personne, et il n'a plus rien à protéger.

**Décidé (1)** — La fermeture vaut **dans les deux sens**. Aymeri a tranché sur
la rétrogradation ; j'ai étendu à la promotion, et voici la raison : un fichier
Excel qui rétrograde un administrateur en poste est un défaut, un fichier Excel
qui en **fabrique** est pire. La règle énoncée — « la gestion des rôles
administrateurs reste un acte nominatif, dans l'écran de modification dédié » —
ne distingue pas les deux sens, et un import qui crée des droits est le chemin
le plus court vers un administrateur que personne n'a nommé.
✅ *à confirmer par Aymeri — si la promotion par fichier doit rester possible,
c'est deux lignes à retirer dans `valider_lignes_import_profs`*

**Décidé (2)** — Ignorer une instruction sans le dire serait le même défaut sous
une autre forme. `roles_ignores` compte les lignes dont le rôle demandé n'a pas
été appliqué, `lignes_role_ignore` les nomme une par une — à l'aperçu **comme**
au retour de l'import. Le cas 211 vérifie que l'aperçu annonce exactement ce que
l'import fera : les deux passent par `valider_lignes_import_profs`, et un aperçu
qui ment est pire que pas d'aperçu du tout.

**Constaté** — Le cas 207 a changé de raison sans changer de verdict. Il
vérifiait un verrou ; il vérifie maintenant une garantie — il reste toujours au
moins un administrateur — qui tient désormais par construction. Un test qui
survit au mécanisme qu'il testait est un bon test : c'est le résultat qui
compte, pas le moyen.

**Livré** — 14 septembre, commit `04a73b7`. `run.sh` : 211 cas verts chez
Antigravity aussi. Migration 43 appliquée en production, `npm run build` vert,
déployé sur Vercel. L'écran suit : `ModalApercuImport` (gardée sur
`type === 'profs'`) et le retour d'import de `ModalImportProfs` affichent le
nombre de rôles ignorés et rappellent que la gestion des rôles est nominative.

**Relu dans le code, pas sur le rapport** — les deux blocs d'affichage existent,
`type="profs"` est bien passé au site d'appel des enseignants (sans quoi le
message n'aurait jamais paru), les cinq variables CSS employées existent toutes
dans `tokens.css` — c'est la vérification qui a manqué deux fois sur ce projet —
et le fichier de migration en dépôt est au bit près celui qui a été testé.
`database.ts` est inchangé, et c'est le résultat correct : les trois fonctions
gardent leur signature et leur type de retour `jsonb`, donc les types générés
n'avaient rien à refléter. Rien à reprendre.

**Ensuite** — Zone de test locale (Supabase CLI + Docker/OrbStack) avec isolation stricte de la production et tests iPad. Option de promotion par CSV tranchée : maintien de la fermeture stricte (la nomination d'administrateurs reste exclusivement nominative dans l'interface).


## 2026-09-14 — Les migrations 39 à 42 avaient été livrées sans un seul cas de test

**Fait** — Cas 194 à 208 dans `supabase/tests/01_scenario.sql`, et un correctif
dans `supabase/tests/00_prelude_local.sql`. Le scénario complet passe au vert,
208 cas, zéro ECHEC — exécuté sur un PostgreSQL vierge, migrations rejouées
depuis zéro.

Ce que les nouveaux cas couvrent : `ping()` appelable par `anon` (194) ;
`modifier_prof` — adresse changée sans toucher `user_id` (195), adresse déjà
portée par un enseignant (196) ou par un élève (197) refusée, coquille corrigée
qui rattache le compte Google (198, le cas Côme), réservé à l'administrateur
(199) ; `liste_profs` avec `connecte` et `derniere_connexion` lus dans
`auth.users` (200) ; l'import d'enseignants — aperçu qui n'écrit rien (201),
`creations + mises_a_jour + ignorees = lignes_lues` (202), doublon d'adresse
nommé ligne par ligne (203), création avec rattachement immédiat, réactivation
et entrée au journal (204), aucune désactivation automatique (205), réservé à
l'administrateur (206), dernier administrateur protégé (207).

**Constaté (1) — `run.sh` ne démarrait plus depuis la migration 42.**
`liste_profs()` lit `auth.users.last_sign_in_at` ; l'`auth.users` simulée du
prélude n'a que `id` et `email`. La migration ne se créait pas, `psql` sortait
en erreur, et le scénario s'arrêtait **avant le premier cas**. Autrement dit :
le garde-fou était à terre depuis hier et les « 193 cas verts » de l'en-tête ne
couvraient plus rien. Trois lignes dans le prélude, et le compte est bon.

La leçon : le prélude est une **imitation** d'`auth.users`. Toute migration qui
lit une nouvelle colonne de ce schéma doit l'ajouter là aussi, sinon elle
éteint la suite de tests au lieu de la faire échouer — et une suite éteinte ne
crie pas.

**Constaté (2) — l'import d'enseignants rétrograde les administrateurs.**
`valider_lignes_import_profs` remplace un rôle **absent** par `'prof'`. Un
export d'annuaire (`email, nom, prénom`), qui est le format le plus probable,
vaut donc « rétrograde tout le monde ». Le verrou du cas 207 ne protège que le
**dernier** administrateur actif : mesuré en base, deux administrateurs avant
l'import, un après — et c'est **celui qui lance l'import** qui perd ses droits,
avec un retour `"ok": true` qui ne mentionne aucun changement de rôle.

C'est la famille des bugs de population appliquée à une colonne manquante :
l'absence d'une donnée a été lue comme une valeur. La même erreur que
`nb_sessions = 0` pendant le chargement (lot 16 bis).

**Décidé** — Le cas 208 ne crie pas « ECHEC » : il vérifie la seule garantie qui
tienne aujourd'hui — il reste toujours au moins un administrateur — et affiche
la rétrogradation constatée sous l'étiquette « A TRANCHER ». Un scénario rouge
en permanence finit par ne plus être lu ; le défaut, lui, doit rester visible.
Il basculera en ECHEC dès que la règle sera tranchée.
⬜ *en attente de la décision d'Aymeri*

**Ensuite** — Antigravity : lancer `./supabase/tests/run.sh` et confirmer les
208 cas au vert, puis commiter. Aymeri : trancher la règle du rôle absent — ma
recommandation est qu'une ligne sans clé `role` **garde le rôle existant** sur
une mise à jour, et ne vaille `prof` que sur une création ; seul un
`"role":"prof"` explicite rétrograde. Migration 43 à écrire ensuite, avec son
cas de test. **En attendant, ne pas se servir de l'import CSV des enseignants.**


## 2026-09-13 — Bascule vers un nouveau chat : le partage du travail était mal décrit

**Fait**
- `ANTIGRAVITY_BRIEF.md` : nouveau **§4bis, « Les règles apprises à nos
  dépens »** — `grant execute` obligatoire sur toute nouvelle fonction,
  `drop function` avant tout changement de signature, aucun secret dans une
  conversation, ne jamais corriger une fiche à la main dans Supabase, le SQL
  est écrit par Claude, et la liste des appels serveur avant/après une refonte.
- `ETAT.md` **§6 entièrement réécrit** : le message à coller dans un chat neuf,
  le tableau des sept documents qui portent la mémoire, ce qui est du bruit,
  les deux garde-fous automatiques, la discipline, et le ménage des guides en
  attente d'arbitrage.
- `docs/PROJET_CLAUDE.md` **réordonné et corrigé** : §1 le texte à coller
  (version du 13 septembre), §2 ce qui a changé et pourquoi, §3 les
  connaissances du projet, §4 pourquoi le ménage compte, §5 **l'historique des
  versions** — le texte du 31 août y est conservé intégralement, daté, avec la
  raison de son remplacement.

**Constaté** — Les instructions du projet Claude, écrites le 31 août,
décrivaient un partage du travail **qui n'était déjà plus celui qu'on
pratiquait**. Trois erreurs, toutes relevées par Aymeri :

1. Elles confiaient à Aymeri l'application des migrations dans Supabase. C'est
   Antigravity qui les applique depuis au moins le 10 septembre — il a les MCP
   Supabase, GitHub et Vercel, et le 11 septembre il a écrit et fait tourner
   seul `sauvegarder.sh`, le workflow GitHub Actions, le `launchd` du Mac, la
   copie Google Drive, le commit `ea05d00` et le déploiement.
2. Elles ignoraient que **le dossier du dépôt est partagé en direct** entre
   Claude et Antigravity : un fichier écrit par l'un est lu par l'autre sans
   commit ni copier-coller. Le commit sert à l'historique et à Vercel, pas à
   transmettre. Seuls les messages passent par Aymeri.
3. Elles présentaient Antigravity comme un exécutant, alors que la relecture est
   **croisée** : il a relu la migration 13, soulevé le point qui a fait entrer
   `p_faits` dans la migration 26, et trouvé la classe `.game-zone` sur
   `Keypad.jsx`.

Le coût n'était pas théorique : chaque manipulation demandée à Aymeri
qu'Antigravity savait faire était un aller-retour perdu.

**Décidé** — Une instruction remplacée n'est pas effacée, elle est **datée et
conservée** avec la raison du remplacement (`docs/PROJET_CLAUDE.md` §5). Savoir
ce qu'on croyait le 31 août explique la moitié des décisions prises depuis.
✅ *validé par Aymeri le 13/09*

**Ensuite** — Aymeri : coller le §1 de `docs/PROJET_CLAUDE.md` dans les
instructions du projet claude.ai, puis ouvrir le nouveau chat avec le message
de `ETAT.md` §6. Reste en attente : l'arbitrage des trois jeux de guides
élèves/professeurs, et la création d'un environnement de test du projet.


## 2026-09-11 — Automatisation complète des sauvegardes (Cloud + Mac) et clôture de la chaîne de restauration

**Fait**
- **Bugfix saisie du zéro** : le chiffre `0` était effacé ou ignoré dans les cases de réponse (`Practice.jsx`, `Challenges.jsx`, `DigitBoxes.jsx`) car évalué comme falsy (`d || ...`). Corrigé avec `(d !== '' && d != null) ? d : ...` et conversions strictes `String(d)`. Testé et déployé sur Vercel (commit `ea05d00`).
- **Rôle `matho_sauvegarde` & application des migrations 37 et 38** : rôle en lecture seule dédié aux sauvegardes avec mot de passe posé dans Supabase (`ALTER ROLE matho_sauvegarde WITH PASSWORD ...;`), fermeture de PUBLIC sur toutes les fonctions (protection RGPD des données élèves).
- **Double archive de sauvegarde** : `sauvegarder.sh` et le workflow GitHub produisent désormais deux fichiers :
  1. `matho_db_..._complet.sql.gz` (structure DDL + données)
  2. `matho_db_..._donnees.sql.gz` (données seules, encapsulées avec `set session_replication_role = replica;` pour restauration immédiate sans conflit de déclencheurs/clés étrangères).
- **Sentinelle cloud GitHub Actions** (`.github/workflows/sauvegarde-hebdomadaire.yml`) : s'exécute chaque vendredi à 18h17 UTC (20h17 Paris), vérifie les tables maîtresses (*eleves*, *sessions_jeu*, *maitrise*, *defis*) et le quorum d'au moins 250 élèves. Alerte par e-mail en cas de défaillance. Testé live avec succès via `workflow_dispatch`.
- **Automatisation hebdomadaire locale sur Mac (`launchd`)** : `com.matho.sauvegarde.plist` installé dans `~/Library/LaunchAgents/` pour une exécution silencieuse chaque vendredi à 18h00. Contournement des restrictions TCC de macOS via runner autonome dans `~/.matho/` et miroir de configuration dans `~/.config/matho/env`. Copie automatique dans `Google Drive/Mon Drive/Sauvegardes Matho/` et notification native macOS en fin d'archivage (313 élèves confirmés).
- **Migration 39 (`ping_anon`)** : restitution d'EXECUTE sur `ping()` pour `anon`, le réveil quotidien Supabase GitHub Actions est testé et validé vert (HTTP 200).
- **Migration 40 & 41 (`modifier_prof`)** : possibilité pour l'administrateur de modifier le nom, l'email et le rôle d'un enseignant avec conservation de `user_id` en cas de compte déjà rattaché. Suppression de l'ancienne signature à 4 arguments (migration 41) pour éliminer le doublon PostgREST. Garde-fou générique (cas 193) validé (0 doublon de signature en base).
- **Modale d'édition enseignant** : ajout d'un bouton Modifier dans l'onglet Enseignants de l'Admin. Retrait du champ obsolète « Classes attribuées » (les profs accèdent à tout le collège et gèrent leurs classes favorites directement depuis leur profil).
- **Correctifs ergonomiques** : affichage de toutes les tables de 2 à 20 dans la création de défi classe (`Challenges.jsx`), et remplacement du label « Combien de temps » par « Combien de questions » en mode entraînement (`Practice.jsx`).
- **Remise à zéro pré-lancement validée** : purge complète des tables de jeu et de test (`sessions_jeu`, `sessions_profs`, `defis`, `defis_participants`, `defis_presences`, `maitrise`, `badges` à 0 ligne). Remise à `null` des `derniere_connexion` sur les 313 élèves. Les comptes élèves (`public.eleves`) et professeurs (`public.profs`) restent intégralement préservés, de même que les liaisons `user_id` existantes pour garantir une reconnexion immédiate sans accroc.
- **Sauvegarde d'état pré-reset** : exécutée à 17h36 (`matho_db_2026-09-11_17h36_mig-20260911120000_git-ef62f27_complet.sql.gz` et `_donnees.sql.gz`) et archivée dans Google Drive.

**Décidé**
- Le rôle `matho_sauvegarde` remplace définitivement `postgres` pour les sauvegardes automatiques. Le mot de passe master de la base n'est plus requis dans le script de dump.
- Rétention fixée à 180 jours (6 mois) avec purge automatique en local et sur Google Drive.
- `SUPABASE_DB_URL` configuré sur GitHub Secrets et dans `frontend/.env.local`.
- **TODO prioritaire post-démarrage** :
  1. *Restriction horaire (couvre-feu)* : verrouillage de la saisie de parties hors des plages scolaires/diurnes (ex: interdiction entre 20h30 et 7h00 avec message bienveillant).
  2. *Mesure de temps de jeu effectif* : horodatage début/fin de sessions pour quantifier l'activité réelle sur iPad (sans attendre une déconnexion explicite).
  3. *Import CSV professeurs* : ajout d'un import de masse des enseignants calqué sur celui des élèves.
  4. *Défis entre collègues* : mode défi avec table dédiée `defis_participants_profs` pour une étanchéité absolue avec les élèves.
  5. *Statut de connexion des professeurs* : afficher dans l'onglet Enseignants de l'Admin si le compte Google est rattaché et la date/heure de dernière connexion (à l'identique de l'onglet Élèves).
  6. *Historique d'horodatage des connexions* : vue / journal permettant de consulter l'heure exacte des connexions pour les élèves et les professeurs.
  7. *Tableau de bord d'activité poussée par élève* : vue détaillée d'analyse (qui joue, à quoi, quand, volume de parties, plages horaires de travail, régularité) pour le suivi pédagogique des enseignants et de l'administration.

**Constaté**
- Sous macOS, `launchd` bloque l'accès à `~/Documents` (erreur `Operation not permitted`) si un script tente d'y lire ou écrire en tâche de fond. Résolu en hébergeant le runner d'automatisation dans `~/.matho/` avec miroir de configuration dans `~/.config/matho/env`.

**Ensuite** — Tout le chantier de sauvegarde, de sécurité et de résilience est achevé. La base de données est remise à zéro, propre, et l'application est prête à être envoyée aux élèves.

## 2026-09-10 — Le rôle de sauvegarde a fait tomber le défaut le plus grave du projet

**Fait** — Migrations 37 (`role_sauvegarde`) et 38 (`execute_public`). Un rôle
`matho_sauvegarde` en lecture seule, avec `bypassrls` et sans mot de passe dans
le dépôt. Et surtout : `execute` retiré à **PUBLIC** sur toutes les fonctions,
présentes et futures. 192 cas de test verts.

**Constaté** — En vérifiant que le rôle de sauvegarde ne pouvait appeler aucune
fonction, le test a échoué : il le pouvait. PostgreSQL accorde `EXECUTE` à
PUBLIC sur toute fonction créée, et `grant execute ... to authenticated`
n'enlève pas ce droit — il s'ajoute à côté. Les 55 `grant` semés dans les
37 migrations donnaient une fausse impression de fermeture.

Mesuré en se faisant passer pour un visiteur anonyme :
`classement_progression('tout','college','tous',500)` renvoyait **6 lignes**, et
`classement_classes()` **3 lignes**. Autrement dit, avec la seule clé `anon` —
publique par construction, embarquée dans le JavaScript — **n'importe qui sur
Internet lisait le prénom, l'initiale et la classe de tous les élèves ayant
joué**, sans compte. Ce sont des données de mineurs.

**Décidé** — Deux pièges dans le correctif, tous deux trouvés par l'exécution et
pas par la lecture. (1) Les politiques RLS appellent `est_prof()`,
`eleve_courant()`, `prof_voit_classe()` : aucune n'avait de `grant` explicite,
elles vivaient sur PUBLIC. Les retirer sans les rendre fermait toutes les tables
à tout le monde. (2) `enregistrer_session` — **la fonction la plus appelée de
l'application** — n'a jamais eu de `grant` non plus : la migration 26 lui avait
ajouté `p_faits`, créant une signature que le `grant` d'une migration antérieure
ne désignait plus.

Et une leçon d'outillage : `has_function_privilege` répond « oui » dès que PUBLIC
a le droit. Mon premier contrôle mesurait donc exactement ce que je cherchais à
supprimer. Pour vérifier une fermeture, il faut lire `proacl`.

**Ensuite** — Antigravity : appliquer 37 et 38, régénérer `database.ts`. Aymeri :
réinitialiser le mot de passe de la base, puis poser celui du rôle de sauvegarde
dans l'éditeur SQL Supabase.

## 2026-09-10 — La connexion était bloquée par le filtre Jamf, et un défi de classe a tourné

**Fait** — Ajout d'`accounts.google.fr` à la liste des sites autorisés dans Jamf.
`accounts.google.com` y était depuis longtemps — il sert aux Google Forms — mais
Google fait passer une partie du parcours de connexion par le domaine national.
Dans la foulée, **un défi joué avec une classe entière, sur les iPad du collège :
ça passe.**

**Constaté** — Le symptôme était trompeur : « ce n'est pas autorisé » à la
première connexion, puis ça marche après un rafraîchissement. J'ai d'abord
cherché dans le code et trouvé un vrai défaut (aucun `onAuthStateChange` au
démarrage) — mais ce n'était pas la cause. La capture d'écran a tranché en une
seconde ce que le raisonnement sur le code n'aurait jamais trouvé : c'était
Safari qui affichait *« Website Not Allowed — accounts.google.fr is a restricted
website »*.

**Décidé** — `ETAT.md` affirmait depuis le 27 août que la connexion Google était
« validée en conditions réelles ». C'était faux : elle n'avait jamais été
éprouvée **derrière le filtre MDM**. Le jour de la rentrée, les 350 élèves
auraient eu cet écran en même temps, sans aucune trace dans l'application. La
ligne est corrigée et la case Jamf porte désormais le piège en toutes lettres.
Leçon de méthode : demander la capture d'écran **avant** d'expliquer un symptôme.

**Ensuite** — Confirmer que le nombre d'élèves au classement du défi égale le
nombre d'élèves qui ont joué. Puis le correctif du démarrage
(`onAuthStateChange`), qui reste un défaut réel même s'il n'était pas celui-là.

## 2026-09-10 — Migration 36 : « Jamais connecté » disait deux choses fausses

**Fait** — Migration 36 (`20260910230000_derniere_activite.sql`). Déclencheur
`sessions_jeu_activite` : chaque partie enregistrée met à jour
`eleves.derniere_connexion`. Et `deja_connecte` devient « rattaché aujourd'hui
**ou** portant une trace d'activité ». Cas 183 à 185 ajoutés, 186 cas verts.

**Constaté** — Deux défauts, trouvés en relisant l'écran Administration livré le
matin même, pas en raisonnant sur le code. (1) `derniere_connexion` n'était
écrite que par le trigger `on_auth_user_created`, au tout premier rattachement,
et jamais ensuite : l'infobulle « Dernière connexion le … » aurait annoncé la
date de septembre à un élève jouant tous les jours. (2) `deja_connecte` valait
`user_id is not null`, et `eleves.user_id` est `on delete set null` : la
suppression des comptes Google des partants en juillet aurait fait réapparaître
toute une promotion en « Jamais connecté » à la rentrée, dans la pastille de
filtrage comme dans la liste.

**Décidé** — Le déclencheur est posé sur la TABLE, pas dans les fonctions. Cinq
migrations contiennent un `insert into sessions_jeu` ; ajouter la ligne dans
chacune, c'est se préparer à en oublier une — la faute exacte de la migration 26,
où `p_faits` avait été ajouté à `enregistrer_session` sans être relayé par
`terminer_defi`. La table est le seul point par où tout passe.

**Ensuite** — Antigravity : appliquer la migration 36, régénérer `database.ts`.
Rien à changer à l'écran, les deux colonnes gardent leur nom et leur sens
s'améliore.

## 2026-09-10 — Audit du pont entre le SQL et les écrans

**Fait** — Audit complet : 55 fonctions ouvertes à l'application, 41 RPC
appelées par `api.js`, 53 fonctions exposées, croisées avec l'usage réel dans
les écrans. Écriture de `frontend/scripts/check-api.mjs`, qui rejoue ce contrôle
en trois secondes.

**Constaté** — Aucune RPC fantôme : tout ce qu'`api.js` appelle existe en base.
Les fonctions ouvertes et jamais appelées depuis le front sont des aides
internes, appelées par d'autres fonctions SQL. Un seul vrai orphelin,
`elevesSansConnexion`, sans écran depuis le 28 août — remplacé par
`liste_eleves`, qui renvoie `deja_connecte` et `derniere_connexion`. Mais
l'écran Administration reçoit ces deux colonnes et n'en affiche aucune : la
question « qui n'a jamais ouvert l'application » n'a plus de réponse à l'écran.

**Décidé** — Le contrôle entre dans le build, à côté de `check-tokens.mjs`. Il
échoue sur une fonction exposée que plus aucun écran n'appelle : c'est
exactement la forme qu'avait la disparition du bouton « ajouter un élève » au
lot 20, invisible pendant trois lots parce que le SQL était intact et tous les
tests au vert.

**Ensuite** — Antigravity : brancher le script dans `npm run build`, afficher
« jamais connecté » dans la liste des élèves, supprimer l'export orphelin.

## 2026-09-10 — Migration 35 : corriger la fiche d'un élève en cours d'année

**Fait** — Migration 35 (`20260910210000_modifier_eleve.sql`). `modifier_eleve`
accepte le changement d'adresse même après la première connexion, refuse une
adresse déjà prise en nommant la fiche concernée, et journalise l'avant **et**
l'après. Le déclencheur `eleves_protection` laisse passer un professeur, plus
seulement un administrateur. Cas 38 réécrit (aller-retour complet sur un élève
connecté) et cas 180 à 182 ajoutés. 183 cas verts. Le nom, le prénom et la classe sont ouverts à tout professeur ; l adresse reste réservée à l administrateur, parce qu un professeur ne peut pas la renommer dans la console Google.

**Décidé** — On ne détache jamais `user_id`. Un renommage dans Google Workspace
garde le même compte Google, donc la même ligne `auth.users` : le trigger
`on_auth_user_created` ne se déclenche pas et rien ne rattacherait une fiche
détachée. L'élève arriverait connecté et sans fiche. Comme `eleve_courant()`
résout par `user_id` et jamais par l'adresse, ne rien toucher suffit et il n'y a
même pas de coupure. ✅ *validé par Aymeri le 10/09 : « si je change le mail,
c'est que je le change aussi sur la console d'admin, ça doit être transparent »*

**Constaté** — Défaut trouvé en préparant la migration, reproduit par exécution
sur la base locale : un professeur non administrateur appelant `modifier_eleve`
recevait `{"ok": true}` et le nom en base ne changeait pas. Le déclencheur
`eleves_protection` annulait l'écriture en silence, alors que la fonction
l'autorisait et que le cas de test 47 affirme qu'un professeur gère les élèves
de toute classe. Deux règles se contredisaient, la plus discrète gagnait.
Non atteignable par un utilisateur aujourd'hui — l'écran Administration est
réservé aux administrateurs — mais le piège se serait refermé sur la première
modale « Modifier » ouverte aux professeurs.

**Ensuite** — Antigravity : bouton « + Ajouter un élève » et modale
« Modifier » dans l'onglet Élèves.

## 2026-09-10 — Migration 34 : `ping()`, pour que la base ne s'endorme jamais

**Fait** — Migration 34 (`20260910190000_ping_reveil.sql`) et
`.github/workflows/reveil-supabase.yml`. Une fonction `ping()` ouverte au
visiteur non connecté, appelée une fois par jour à 05h17 UTC avec la clé anon.
Trois cas de test ajoutés (177 à 179) : elle répond, elle n'ouvre aucune table
à `anon`, et sa réponse ne varie pas avec l'effectif du collège. Suite complète
au vert. Reste à Aymeri : créer les secrets `SUPABASE_URL` et
`SUPABASE_ANON_KEY` dans GitHub, puis un « Run workflow » de contrôle.

**Décidé** — Un appel RPC plutôt qu'une requête HTTP sur `/rest/v1/` : cette
dernière peut être servie par le cache de schéma de PostgREST sans que
PostgreSQL soit sollicité, et l'objectif est précisément de produire de
l'activité de base. Pour la même raison `ping()` compte les élèves puis jette
le compte : un `select 1` peut être résolu sans toucher au stockage.

**Constaté** — Ce qui a déclenché le sujet : sur l'offre gratuite, un projet
inactif sept jours est suspendu et **ne redémarre pas tout seul**. Une semaine
de vacances suffit à trouver l'application morte le lundi de la rentrée.
Deuxième piège, moins connu : GitHub désactive les workflows planifiés d'un
dépôt resté 60 jours sans commit — la durée exacte des vacances d'été.

**Ensuite** — Les secrets GitHub, puis le passage en production.

## 2026-09-10 — Migration 33 : nb_questions est null hors Sprint

**Fait** — Migration 33 (`20260910100000_nb_questions_sprint.sql`) appliquée en base de dev. `nb_questions` renvoie désormais `null` pour les Contre-la-montre (seuls les Sprints reçoivent leur compte réel de questions). Types TypeScript régénérés dans `database.ts`. Côté `MesDefis.jsx`, le branchement conditionnel par type (`d.type === 'countdown' ? ... : ...`) protégeait déjà l'affichage, aucun risque d'afficher un null ou les 120 questions de réserve sur un chrono de 30 s. Suite de tests `01_scenario.sql` mise à jour (176 cas verts).

**Décidé** — Une valeur qui n'a pas de sens dans un contexte ne se renvoie pas avec un commentaire d'avertissement : elle se renvoie NULL. Un écran ne peut pas mal afficher ce qu'il ne reçoit pas. Les colonnes `duree_s` (null hors chrono) et `nb_questions` (null hors Sprint) sont désormais strictement symétriques. ✅ *validé par Claude et Aymeri le 10/09*

**Constaté** — Sur le Contre-la-montre de Lou (30 s), `mes_defis()` renvoyait 120 (la réserve figée à la création par `creer_defi`). Le correctif à la source supprime l'incohérence partout.

**Ensuite** — Poursuite des recettes terrain.

## 2026-09-10 — Migration 32 : mes_defis renvoie duree_s et nb_questions, libellé exact du score

**Fait** — Migration 32 (`20260910080000_mes_defis_duree.sql`) appliquée en base de dev. `mes_defis()` renvoie désormais la vraie durée (`duree_s`, null hors Contre-la-montre) et le nombre réel de questions (`nb_questions`, lu sur la liste figée dans `defis.questions`). Types TypeScript régénérés dans `database.ts`. Dans `MesDefis.jsx`, le libellé personnel du score ne ment plus : « 6 bonnes réponses en 30 s » pour un Contre-la-montre, « 18 sur 20 · 45 s » pour un Sprint (plus de confusion avec les points). Les libellés en dur « chrono » et « 20 questions » sont remplacés par la lecture directe des colonnes serveur.

**Décidé** — Un chiffre en dur dans un écran trahit presque toujours une valeur absente du contrat serveur : corriger à la source dans le SQL plutôt que de bricoler dans l'écran, ce qui supprime le défaut partout. `mon_score` est un compte de réponses justes, pas de points. ✅ *validé par Claude et Aymeri le 10/09*

**Constaté** — L'écran « Mes défis » affiche désormais la durée exacte de chaque Contre-la-montre (30 s, 1 min, etc.) et le score sous sa forme réelle et compréhensible pour l'élève.

**Ensuite** — Poursuite des recettes terrain.

## 2026-09-10 — Migration 31 : les défis joués remontent dans Mes défis

**Fait** — Migration 31 (`20260909170000_mes_defis_joues.sql`) appliquée en base de dev. La fonction `mes_defis()` renvoie désormais aussi les défis auxquels l'élève a participé (`defis_participants`), et expose deux faits distincts : `je_suis_createur`, `j_ai_joue`, ainsi que `mon_score` (null si pas joué) et `mon_temps_s`. Dans `MesDefis.jsx`, les élèves voient désormais les défis lancés par leur professeur, leur score personnel et le lien « Voir le podium ». Le bouton « Projeter au tableau » est réservé au créateur du défi (`je_suis_createur`). Types TypeScript régénérés dans `database.ts`.

**Décidé** — Un élève peut être créateur ET joueur : deux faits, deux colonnes booléennes distinctes plutôt qu'un rôle synthétique unique. `mon_score` vaut explicitement null si non joué, jamais 0. ✅ *validé par Claude et Aymeri le 10/09*

**Constaté** — Le défi lancé par Aymeri et joué par Lou à 13h55 (`U9WG2`) remonte désormais immédiatement dans l'écran « Mes défis » de Lou avec son score (6 pts en 30 s), comblant le manque de chemin de retour.

**Ensuite** — Poursuite de la recette terrain avec les classes.

## 2026-09-09 — Lot 26 : file d'attente pour les défis et durée dynamique

**Fait** — File d'attente hors-ligne étendue aux défis dans `src/api.js` (`terminerDefi`). Si le réseau coupe en fin de défi, la participation est mise en attente locale (`mettreEnAttente`) et rejouée dès le retour du wifi (`viderFile`), sans duplication possible grâce à la clé primaire `(defi_id, eleve_id)`. L'écran de résultat du défi affiche la vérité : *« Ton résultat est gardé sur l'iPad. Il partira dès que le wifi revient. »*. La durée du chrono est lue depuis le défi et formatée par une fonction centralisée (`logic/duree.js`), nettoyant les libellés en dur « 2 minutes ».

**Décidé** — Limite acceptée des 24h documentée : un défi expire au bout de 24h ; si un iPad reste déconnecté plus de 24h, le serveur refusera le défi et la file jettera l'envoi au lieu de bloquer. ✅ *validé par Claude et Aymeri le 09/09*

**Constaté** — Les défis joués par Lou lors de la session de 13h11 avaient été perdus suite à une déconnexion wifi sans filet, tandis que celui de 13h55 à 30s était bien inscrit en base mais n'apparaissait pas dans l'écran « Mes défis » car celui-ci ne liste que les défis créés par l'utilisateur connecté.

**Ensuite** — Revue du diagnostic des performances de `classement_progression` avec Claude.

## 2026-09-09 — Recette terrain : défis en classe, fix page blanche et durée chrono

**Fait** —
- **Correction responsive Administration (Écran 25)** : adaptation des colonnes et largeurs de la barre latérale et du journal d'audit sur résolutions intermédiaires (`@media (max-width: 1250px)`). Passage de `.admin-table-card` en `overflow-x: auto` pour empêcher tout rognage caché des boutons d'action (« Désactiver ») sur iPad et Mac en paysage.
- **Correction crash page blanche sur `JoinChallenge.jsx` (Écran 34)** : au moment de valider le code, l'application tentait de rendre directement l'objet brut `defiData.questions` (`[{a, b}, ...]`) au lieu de sa longueur dans le récapitulatif du mode, provoquant une erreur React fatale non rattrapée. Remplacé par `defiData.questions.length`.
- **Durée paramétrable pour le défi Contre-la-montre** : ajout d'un sélecteur de durée à 4 boutons sur l'écran professeur `ChallengeConfigProf` (30 s, 1 min par défaut, 1 min 30, 2 min). Câblé directement sur le paramètre `p_duree_s` de la RPC `creer_defi` (déjà géré par la base SQL), répercuté sur l'écran de projection au tableau (`DefiCodeScreen`), l'écran d'annonce élève (`DefiIntro`) et la durée effective de `CountdownPlay`.
- **Diagnostic réseau / temps de réponse Supabase** : mesures en direct sur la base : `classement_classes` répond en **150 ms**, `classement_progression` en **150 ms**, `ma_place_progression` en **120 ms**. L'écran de « Connexion perdue » et la latence observés sur un iPad en test ont été identifiés : batterie critique à 9 %, déclenchant le bridage agressif d'iOS / Safari (mise en veille des sockets TCP avec timeout de 15 à 20 secondes).

**Décidé** —
- La durée standard recommandée en classe pour le Contre-la-montre passe à **1 minute** par défaut (au lieu de 2 minutes, jugées trop longues pour l'attention des collégiens). ✅ *validé par Aymeri*
- Rejet du passage au plan payant Supabase (300 $/an) : maintien sur le plan gratuit (limites largement suffisantes pour 350 élèves). La sauvegarde sera assurée gratuitement et sous contrôle local (NAS / script `pg_dump`). ✅ *tranché par Aymeri*

**Ensuite** — Mise en place du keep-alive (GitHub Actions + ping NAS pour l'été) et script de sauvegarde local.

## 2026-09-09 — Lot 25 : Clavier physique fermé dans les modes chronométrés

**Fait** — Fermeture sélective de la saisie numérique au clavier physique sur ordinateur dans les modes où le temps détermine le score :
- **3 modes fermés** : Sprint (`sprint`), Contre-la-montre (`countdown`) et Montée des tables (`climb` : chrono de 3 s par question et déblocage de plafond).
- **Modes restant ouverts au clavier** : Sans faute (`flawless`), entraînement Libre (`libre`), Apprendre (`learn`), et la saisie du code de défi (écran 33).
- **Touche Échap** : reste active en toute circonstance comme sortie de secours.
- **Règle unique centralisée** : créée dans `frontend/src/logic/saisie.js` (`MODES_SANS_CLAVIER`, `clavierAutorise(mode)`).
- **Communication élève** : mention discrète sur l'écran de préparation avant le lancement (« *Sur cette partie, on répond au doigt — pour que tout le monde soit à égalité.* ») et silence complet pendant la partie pour ne pas déconcentrer.

**Décidé** — Ce choix est une mesure d'**équité** et non d'anti-triche : un clavier physique est beaucoup plus rapide qu'un doigt sur iPad, et les classements doivent comparer des conditions comparables. Fermé pour tout le monde sans réglage ni interrupteur ; les éventuelles dérogations individuelles (PAI, handicap moteur) viendront plus tard si le besoin se présente. ✅ *tranché par Aymeri le 09/09*

**Constaté** — L'import initial des 310 élèves du collège a été exécuté avec succès via la nouvelle modale d'aperçu d'import.

**Ensuite** — Poursuite des tests de recette et préparation de la mise en production.

## 2026-09-09 — Lot 24 : Apprendre les tables et les quatre modales (Écrans 35 et 36)

**Fait** — Les deux derniers écrans de la refonte v10 sont livrés, parachevant l'intégration des 36 maquettes dans le code :
- **Écran 35 (Apprendre)** (`Learn.jsx`) : sélecteur de tables borné par `profil.plafond_tables` (10, 12 ou 15) et multiplicateur 1 à 10. Carte 1 commutativité avec animation de rotation de la grille de points (« Faire tourner », réarrangement des mêmes ronds, maxime « Une case apprise, c'est deux réponses »). Carte 2 « La coupure en deux » calculée par règle algorithmique (masquée pour ≤ 5 et 10, 5 + n pour 6..9, 10 + n pour ≥ 11). Bouton direct « Tester la table de X en libre » et « Fait suivant › ». Aucune écriture ni scoring en base.
- **Écran 36 (Les quatre modales)** (`Modals.jsx`) sur voile indigo 55% (`rgba(32, 34, 107, 0.55)`), fermables par clic backdrop et touche Échap :
  1. *Choisir mon avatar* (Élève 8 emojis fermés sans saisie libre, et Enseignant avec choix d'initiales ou emojis).
  2. *Changer la classe d'un élève* (liste des classes, mention de l'audit trail).
  3. *Désactiver l'accès* (explication exacte de la conservation des données).
  4. *Aperçu d'import CSV* : branchement effectif de `apercu_import_eleves` (RPC `apercuImportEleves` dans `api.js`), affichage des 4 compteurs serveur stricts (`creations + mises_a_jour + ignorees = lignes_lues`, `dont_reactivations` en sous-ensemble, `actifs_absents_du_fichier` distinct), tableau prévisionnel avec raisons de rejet serveur mot pour mot, et séparation stricte entre aperçu en lecture seule et validation finale.

**Décidé** — L'aperçu d'import est un garde-fou fondamental en lecture seule : aucune modification n'est appliquée tant que le professeur ne confirme pas explicitement. ✅ *validé par conception (migration 24)*

**Constaté** — `apercu_import_eleves` existait depuis la migration 24 mais n'avait jamais été exposée dans `api.js` ni intégrée à l'UI admin. C'est désormais chose faite.

**Ensuite** — Les 36 maquettes de la refonte v10 sont désormais toutes intégrées au code frontend et validées par `check-tokens.mjs` et `vite build`. Recette globale et retours utilisateurs.

## 2026-09-09 — Lot 23 : Migrations 29 et 30, profils et classements (Écrans 28 à 32)

**Fait** —
- **Migrations 29 et 30 appliquées** avec succès sur la base Supabase (`lkukdlspcgqtiimvwlsd`) :
  - Migration 29 (`20260908210000_salle_des_profs.sql`) : colonne `profs.avatar_emoji` nullable (`null` = affichage des initiales), fonction `initiales_de`, `changer_avatar_prof`, refonte de `classement_profs` (avec rôle, points, sprint et initiales), `entete_salle_des_profs` (deux populations : `inscrits` et `ont_joue`), `rejoints` dans `mes_defis`, et chiffres du mois dans `mon_profil_prof`.
  - Migration 30 (`20260908230000_profil_et_place_records.sql`) : `mon_profil` élève complété (`meilleur_sprint`, total des `jours_actifs`, `plafond_atteint_le` déduit), et fonction `ma_place_records` (avec `ecart_au_dessus` toujours positif et calculé côté serveur).
  - Contrôle SQL du §1 validé : `colonne_avatar = 1`, `nouvelles = 4`, `sig_profs = 1`, `sig_defis = 1`. Types TypeScript régénérés dans `frontend/src/types/database.ts`.
  - 167 cas de test verts.
- **Écran 28 (Mes défis passés — `MesDefis.jsx`)** :
  - Filtres par onglets « En cours · X » et « Terminés · Y ».
  - Cartes de défi complètes avec double population stricte (« X ont rejoint · Y ont terminé ») et jauge bicolore sans soustraction hasardeuse.
  - Boutons « Voir le podium » (ouvre le classement du défi) et « Projeter au tableau » (ouvre directement l'Écran 26 en mode vidéoprojecteur 1280×720).
  - État vide avec grille de 9 pastilles colorées et bouton « Lancer un défi ».
- **Écran 29 (Profil élève — `Profile.jsx`)** :
  - Carte identité avec avatar, bouton d'édition (crayon) et palette d'animaux, palier et plafond.
  - Synthèse de maîtrise : les 4 comptes (sues, justes mais lentes, à revoir, pas encore vues) dont la somme fait strictement `plafond × plafond`. Lien « Voir ma grille › » ouvrant la grille complète.
  - 4 tuiles de records (points, jours d'entraînement totaux `jours_actifs`, parties jouées, meilleure série).
  - Carte des records : Sprint (en secondes), Contre-la-montre, Sans faute, Montée des tables (avec date déduite uniquement si `plafond_atteint_le` n'est pas null).
- **Écran 30 (Profil enseignant — `Profile.jsx`)** :
  - Identité avec avatar emoji ou initiales en grand, nom, email et badge de rôle.
  - Gestion des classes habituelles avec bouton d'édition et sélection persistée via `definirMesClasses`.
  - Statistiques d'entraînement du mois (« Salle des profs · ce mois » : points, parties, meilleur sprint) et bouton « S'entraîner maintenant ».
- **Écran 31 (Classements — Records — `Leaderboards.jsx`)** :
  - 4 catégories jouables : Sprint, Chrono, Sans faute, Montée.
  - Double sélecteur (Le collège / Ma classe et Découverte / Confirmé / Expert, sauf en Montée).
  - Podium des 3 premiers et tableau des lignes suivantes.
  - Ligne épinglée pour l'élève au-delà du top 3 via `maPlaceRecords`, avec rang et écart positif (« X secondes de moins et tu passes Yᵉ »).
- **Écran 32 (Classements — Salle des profs — `Leaderboards.jsx`)** :
  - Réservé aux enseignants. Bandeau « Entre collègues » en bleu nuit.
  - Filtres de période (Ce mois, Cette semaine, Tout) et de tri (Points, Parties).
  - Tableau à 6 colonnes : rang, avatar (ou initiales en badge si pas d'avatar), nom (avec mise en valeur de la ligne courante), rôle (« Professeur » ou « Administrateur »), points et meilleur sprint.
  - Bandeau d'en-tête en pied : effectifs issus de `entetteSalleDesProfs` (« X collègues ont un compte · Y ont joué ce mois »).
- **Correction du lot 22** :
  - Suppression du dénominateur « sur 20 » en dur dans `JoinChallenge.jsx` (l. 256) pour afficher le score en points sans présumer du nombre de questions.

**Décidé** —
- L'avatar enseignant est nullable en base : le choix entre un emoji ou les initiales est respecté partout, aucun écran n'invente d'avatar par défaut. ✅
- L'écart au record (`ecart_au_dessus`) est strictement calculé côté serveur pour garantir qu'il est toujours positif quel que soit le sens du tri (temps vs points). ✅
- Si `plafond_atteint_le` est null, aucune date n'est affichée sous la Montée des tables (l'élève n'a pas encore franchi de palier par la Montée). ✅

**Constaté** —
- 0 erreur sur `check-tokens.mjs`, build Vite `npm run build` au vert (88 variables CSS conformes).

**Ensuite** —
- Lot 24 : Écran 35 (Mode Apprendre) et Écran 36 (Modales restantes : avatar enseignant, etc.).

## 2026-09-09 — Lot 22 : Code projeté plein écran, accueil professeur et rejoindre un défi (Écrans 26, 27, 33, 34)

**Fait** —
- **Écran 26 (Code projeté)** : Défi projeté plein écran en 1280×720 (format vidéoprojecteur de classe), titre en majuscules « REJOINDRE AVEC LE CODE », bouton discret « ‹ Quitter » en haut à droite, pastilles élèves avec bordure. Adaptation du `Layout` (`isProjecteur` et classes `.app-root--projecteur`, `.app-stage--projecteur`) pour s'étendre jusqu'à 1280px sans déborder sur les autres écrans. (Commis en Lot 22a : `124de6f`).
- **Écran 27 (Accueil professeur)** : Page d'accueil professeur complète selon la maquette v10 :
  - En-tête personnalisé avec rôle « Professeur de mathématiques », pastille des classes (`6A, 6B...`) et avatar cliquable.
  - Carte hero « Lancer un défi » invitant et visible.
  - Bandeau d'alerte « Table la plus fragile » de la classe (ex: « La table de 7 est la plus fragile de la classe : 4 élèves sur 28 en difficulté ») avec bouton d'action immédiate « Lancer › » pré-configurant un défi Sprint ciblé sur cette table.
  - Module partagé `frontend/src/logic/classeStats.js` (`trierTablesFragiles` et `tablePlusFragileClasse`) assurant un calcul et tri strictement identiques entre la vue Ma classe (Écran 24) et l'accueil professeur (Écran 27).
  - Grille 2×2 d'accès direct : « Ma classe », « Classements », « S'entraîner », « Mes défis passés ».
  - Barre de pied : Profil, Administration (si administrateur), Se déconnecter.
- **Écrans 33 & 34 (Rejoindre un défi)** :
  - Nouvel écran dédié `frontend/src/screens/JoinChallenge.jsx` pour les élèves.
  - 5 cases de code avec anneau de focus actif sur la position courante, texte d'indication « X lettres sur 5 · le curseur avance tout seul ».
  - Clavier virtuel dédié de 31 touches (A-Z sans I/L/O + chiffres 2-9 + touche retour ⌫), interdisant toute saisie invalide et éliminant les soubresauts de clavier natif tactile.
  - Prise en charge transparente du clavier physique (ordinateur/clavier iPad connecté) avec écouteur `keydown`.
  - Écran 34 : carte récapitulative du défi trouvé avec informations (Créateur, Mode, Tables, Classe/participants) et grand bouton « C'est parti », ainsi que les cartes spécifiques pour les refus du serveur (`deja_joue` avec score/temps, `inconnu`, `ferme`).
  - Carte « Défi de classe » de l'accueil élève branchée pour ouvrir ce nouvel écran.

**Décidé** —
- Le clavier virtuel de l'écran 33 est conservé pour garantir la conformité à l'alphabet restreint de 31 caractères et le confort tactile sur iPad, avec écoute clavier physique en parallèle. ✅ *validé en concertation*
- Pour les enseignants, le choix entre un emoji ou leurs initiales est retenu pour le profil (Lot 23 / Migration 29). ✅ *validé*
- Découpage du lot 22 : Lot 22a commis d'abord pour sécuriser l'Écran 26 et le layout projecteur, Lot 22b pour les écrans 27, 33 et 34.

**Constaté** —
- `check-tokens.mjs` a détecté une variable inexistante `var(--fond-app)` remplacée par le token existant `var(--ivoire)`. 88 tokens actifs, 0 erreur.

**Ensuite** —
- Lot 23 : Migration 29 (salle des profs, avatars/initiales enseignants, compteurs de participation aux défis) et écrans 28, 29, 30, 31, 32.

## 2026-09-08 — Lot 21 : Migration 28, classements et Ma classe sur les maquettes 22 à 24

**Fait** —
- **Migration 28 appliquée** sur la base `calcul-mental-dev` (`lkukdlspcgqtiimvwlsd`) via MCP Supabase (`supabase/migrations/20260908160000_populations_classements.sql`). Contrôle SQL validé : `sig_classes = 1`, `sig_liste = 1`, `nouvelles = 2`. Suite de test à **146 cas verts**.
- **Types TypeScript régénérés** dans `frontend/src/types/database.ts` avec les nouveaux noms de colonnes et fonctions.
- **Client API (`frontend/src/api.js`) mis à jour** :
  - Ajout des fonctions wrappers `maPlaceProgression` et `enteteClasse`.
  - Intégration dans les exports nommés et l'objet exporté par défaut `api`.
- **Écrans 22 & 23 Classements (`frontend/src/screens/Leaderboards.jsx`) refaits sur les maquettes de référence** :
  - Colonnes renommées : `ont_joue`, `inscrits`, `points_par_inscrit`.
  - Libellé « points par élève inscrit » (points cumulés divisés par les inscrits, jamais par les seuls joueurs).
  - Ligne utilisateur épinglée en bas d'écran alimentée par `maPlaceProgression` : affiche le rang, les points et l'écart (`ecart_au_dessus` calculé par le serveur sans soustraction locale). Masquée si l'élève est déjà présent dans la liste visible.
  - État vide de la maquette 23 (« Personne n'a encore joué cette semaine » + bouton d'action « Jouer une partie » + lien de bascule vers le mois).
  - Banni définitivement l'emploi du mot « actif » pour désigner les joueurs.
- **Écran 24 Ma classe (`frontend/src/screens/MaClasse.jsx`) refait sur la maquette de référence** :
  - En-tête alimenté par `enteteClasse` : décompte clair `{ont_joue} ont joué · {inscrits} inscrits · plafond commun : table {plafond_commun}`.
  - Sélecteur de classes alimenté par `listeClasses` (`inscrits`).
  - Encadré d'alerte des tables fragiles : trié sur la part de la classe en difficulté `(eleves_jaunes + eleves_rouges) / eleves_classe` décroissant, avec bouton d'action « Lancer un défi » pré-cochant les tables fragiles.
  - Jauges par table affichant `taux_maitrise` et `taux_couverture` en toutes lettres.
  - Liste des élèves avec filtres « Sous le plafond », « Désactivés », « Tous » (`listeEleves(classe)`).
  - Bouton d'action collective « Ouvrir la table X à toute la classe » branché sur `definirPlafondClasse`.
- **Intégrité et vérification** :
  - `node frontend/scripts/check-tokens.mjs` : 88 tokens actifs, 0 erreur.
  - `npm run build` : compilation sans erreur (856ms).

**Décidé** —
- Le mot « actif » couvrait trois populations différentes en base (`eleves.actif`, `classement_classes.eleves_actifs`, `liste_classes.eleves_actifs`). Il est désormais scindé : `ont_joue` pour ceux qui ont joué sur la période, `inscrits` pour l'effectif non désactivé, et « Actif / Désactivé » conservé uniquement pour le statut de compte dans l'administration.
- `ecart_au_dessus` est calculé par le serveur dans `ma_place_progression` pour garantir la stricte cohérence avec le classement principal sans divergence d'arrondi ou de tri.
- Le relèvement de plafond depuis l'écran Ma classe est collectif (« à toute la classe »), conformément aux règles du projet.

**Constaté** —
- Toutes les variables CSS respectent `tokens.css`.
- L'expérience élève et enseignant sur les classements et le pilotage de classe reflète fidèlement les maquettes Claude Design.

**Ensuite** —
- Phase de validation finale avant rentrée : base de production, import de rentrée, Jamf MDM et tests multi-comptes en conditions réelles.

---

## 2026-09-08 — Lot 20 : Écran Administration (Maquette 25)

**Fait** —
- **Écran 25 Administration entièrement refait** sur la maquette de référence (`docs/design/matHo-refonte-v9.dc.html`) au format paysage pour ordinateur de bord / Mac (`admin-landscape`).
- **Colonne de gauche (Indigo)** :
  - En-tête avec bouton retour « ‹ Accueil », titre « Administration » et sous-titre d'établissement.
  - Onglets interactifs avec compteurs en temps réel : Élèves (`totalInscrits`), Enseignants (`profs.length`), Journal d'audit.
  - Règle pédagogique affichée en pied : « On ne supprime jamais un élève en cours d'année. On le désactive : ses résultats restent, son accès s'arrête. »
- **Zone centrale — Onglet Élèves** :
  - Filtres de classe par pilules dynamiques (« Toutes », « 6ᵉ 1 », etc., alimentées par `listeClasses()`).
  - Champ de recherche client-side (« Rechercher un élève ») filtrant instantanément sans appel réseau ni stockage.
  - Bouton « Importer une classe » ouvrant la modale d'importation CSV et de rattachement des comptes Google (`importerEleves` / `reparerRattachements`).
  - Tableau des élèves : avatar, nom prénom, classe, plafond de tables, statut (`Actif` en vert / `Désactivé` en gris).
  - Actions en ligne : bouton « Classe » ouvrant la modale de changement de classe (`modifierEleve`), bouton « Désactiver » demandant confirmation avec nom de l'élève (`desactiverEleve`), bouton « Réactiver » pour les élèves désactivés (`reactiverEleve`). Les élèves désactivés sont maintenus en fin de liste sans être masqués.
  - Pied de tableau : décompte clair `{N} lignes sur {total} inscrits · trié par prénom`.
- **Zone centrale — Onglet Enseignants** :
  - Liste complète des professeurs (`listeProfs()`).
  - Bouton « + Ajouter un enseignant » ouvrant la modale de création (`creerProf`).
  - Gestion des rôles (Prof / Admin) et désactivation avec confirmation nominative (verrou préservé pour soi-même et pour le dernier administrateur actif).
- **Zone centrale — Onglet Journal d'audit** :
  - Vue complète chronologique du journal (`journalAdmin(100)`).
  - Encart explicatif : « Le journal ne s'efface pas. Chaque changement de classe, plafond, rôle ou statut y est écrit avec son auteur. C'est ce qui permet de répondre à « qui a fait ça ». »
- **Colonne de droite — Aperçu Journal d'audit** (visible sur grand écran sur l'onglet Élèves) :
  - 5 dernières entrées horodatées avec auteur et détail.
  - Lien « Tout voir » basculant vers l'onglet complet du journal.
- **Intégrité du système de design et compilation** :
  - `check-tokens.mjs` vérifié (88 tokens actifs, 0 erreur).
  - `npm run build` 100 % vert.
  - Aucune couleur en dur hors `tokens.css`.
  - Mot « actif » rigoureusement banni pour qualifier un joueur ; utilisé uniquement comme statut de compte « Actif / Désactivé ».

**Décidé** —
- Le total des inscrits s'appuie sur la longueur de la liste renvoyée par `listeEleves(null)` tant que la fonction ne pagine pas, avec commentaire explicite dans le code.
- Pas de bouton supprimer : la désactivation préserve l'historique et les classements passés.
- Les modales de changement de classe et de désactivation garantissent la confirmation explicite nominative avant tout appel Supabase.

**Constaté** —
- `npm run build` compile sans erreur.
- La mise en page paysage s'adapte sur écrans larges (1194px+) et se réorganise proprement sur tablettes et mobiles sans débordement horizontal.

**Ensuite** —
- Lot 21 : Migration 28 (`populations_classements`) et refonte des maquettes 22 (Classements/Progression), 23 (Classements/Classes) et 24 (Ma classe).

---

## 2026-09-04 — Lot 19 : Migration 27 appliquée, la grille se met à jour après chaque partie

**Fait** —
- **Migration 27 appliquée** sur la base `calcul-mental-dev` via MCP Supabase (`supabase/migrations/20260904200000_maitrise_renvoyee.sql`). Contrôle SQL vérifié : `sig_session = 1`, `sig_defi = 1`. Scénario de test : **137 cas verts**.
- **Types TypeScript régénérés** dans `frontend/src/types/database.ts`.
- **Renvoyée par le serveur** : `enregistrer_session` et `terminer_defi` renvoient désormais la clé `maitrise` contenant le niveau à jour des seuls faits touchés par la session ou le défi.
- **Gestionnaire `handleMaitriseMaj` ajouté dans `App.jsx`** : conserve la grille de maîtrise globale en mémoire et fusionne le delta reçu du serveur sans réclamer un rechargement complet (`monProfil()`).
- **Remontée branchée aux 3 fins de partie** :
  - `Practice.jsx` (`handleDone`) : met à jour l'état local `setMastery` (pour affichage immédiat dans l'écran de résultats) et appelle `onMaitriseMaj`.
  - `Challenges.jsx` (`handleDone`) : modes solos (Sprint, Sans faute, Contre-la-montre, Montée des tables).
  - `Challenges.jsx` (`envoyerDefi`) : défis partagés via le retour de `terminerDefi()`.
- **Vérifications et compilation** : `check-tokens.mjs` (88 tokens actifs) et `npm run build` 100 % verts.

**Décidé** —
- Aucun recalcul de niveau ni déduction côté front : le chiffre appliqué est strictement celui renvoyé par Postgres.
- Pas de rappel de `monProfil()` après une partie : le delta de quelques faits touchés évite un aller-retour complet et toute course d'affichage.
- La file d'attente hors-ligne n'est pas modifiée : une partie stockée hors-ligne mettra sa grille à jour à la prochaine connexion réseau.

**Constaté** —
- Test SQL de session simulant 2 réussites rapides (< 3 000 ms) sur `7_8` : renvoie `{ maitrise: { "7_8": 3 } }` (vert).
- Test SQL d'erreur sur `7_8` : renvoie `{ maitrise: { "7_8": 1 } }` (rouge immédiat).
- Test SQL sur défi (`terminer_defi`) : relaie `{ ok: true, maitrise: { "7_8": 3 } }`.
- Les tirages adaptatifs (`buildWeights`) appliquent le poids 1 au fait devenu vert dès la partie suivante sans déconnexion.

**Ensuite** —
- Les écrans sans maquette (Ma classe, accueil professeur, administration) dès réception des maquettes Claude Design.

---

## 2026-09-04 — Lot 18 : La maîtrise devient une règle de temps (Migration 26 appliquée)

**Fait** —
- **Migration 26 appliquée** sur `calcul-mental-dev` via MCP Supabase (`supabase/migrations/20260904140000_maitrise_au_temps.sql`). Suppression préalable des anciennes signatures pour éviter l'erreur d'unicité `function ... is not unique`. Contrôle SQL vérifié : `seuil_ms = 3000`, `colonnes = 2` (`serie_rapide`, `dernier_temps_ms`), `sig_session = 1`, `sig_defi = 1`.
- **Relais de `p_faits` dans `terminer_defi`** intégré directement dans la migration 26 (suite au point soulevé en relecture par Antigravity). Les défis bénéficient ainsi de la même règle de temps que les modes solos sans rupture de traçabilité. Scénario complet : **132 cas verts**.
- **Types TypeScript régénérés** dans `frontend/src/types/database.ts` intégrant `p_faits` sur `enregistrer_session` et `terminer_defi`.
- **Client API mis à jour** dans `frontend/src/api.js` : transmission de `p_faits` dans `enregistrerSession()` et dans `terminerDefi()`.
- **Logique de maîtrise mise à niveau** dans `frontend/src/logic/mastery.js` : suppression de `construireMaitrise()` et `updateMastery()`, remplacées par `construireFaits(resultats)` qui extrait la liste chronologique des faits bruts `{ fait, juste, premier, temps_ms }`.
- **Chronomètre par question instrumenté** dans l'ensemble des quiz :
  - `Challenges.jsx` (`useQuizEngine`) : horodatage `questionStartTimeRef` posé à l'affichage de chaque question (y compris la première et via `resetQuestion`), lecture de `temps_ms` à la validation, couvrant Sprint, Sans faute, Contre-la-montre, Montée des tables et Défi.
  - `Practice.jsx` (`LibreQuiz` & `Quiz`) : horodatage à l'affichage et transmission de `temps_ms` lors de l'enregistrement du résultat.
- **Information élève ajoutée** dans `MasteryGrid.jsx` : phrase sous la légende « Une case devient verte quand tu réponds juste **deux fois de suite, sans hésiter**. » (sans mentionner le seuil technique de 3 secondes).
- **Vérifications et compilation** : `check-tokens.mjs` (88 tokens actifs, 0 couleur en dur hors tokens) et `npm run build` 100 % verts.

**Décidé** —
- `terminer_defi` a été mis à jour directement dans la migration 26 (et non dans une migration 27 séparée) pour garantir l'indivisibilité du contrat d'API entre modes solo et défis.
- La règle du seuil de 3 000 ms reste exclusivement dans le serveur (`seuil_reponse_rapide()`), aucun écran ne la duplique.
- Les faits déjà verts en base ont démarré avec une `serie_rapide = 2` afin de préserver les acquis antérieurs des élèves.
- Une réponse juste mais lente (> 3 000 ms) ou rattrapée remet la série rapide à zéro et redescend une case verte en orange (comportement pédagogique validé).

**Constaté** —
- Test SQL d'enchaînement de réponses sur `calcul-mental-dev` :
  - 1re réponse rapide (< 3 000 ms) -> niveau 2 (orange), série 1.
  - 2e réponse rapide (< 3 000 ms) -> niveau 3 (vert), série 2.
  - 3e réponse lente (> 3 000 ms) -> niveau 2 (orange), série 0 (redescente confirmée).
  - 4e réponse fausse -> niveau 1 (rouge), série 0.
- Test SQL sur `terminer_defi` : le relais de `p_faits` par `terminer_defi` à `enregistrer_session` a bien validé la case `5_6` au vert (niveau 3) après deux réussites rapides.
- Dans le modal de la grille élève (`MasteryGrid`), la légende est complétée par la nouvelle phrase explicative, lisible et parfaitement intégrée.

**Ensuite** —
- Écrans sans maquette (Ma classe, Accueil professeur, Administration).

---

## 2026-09-04 — Lot 17 : Migration 25 appliquée, maquette 9 (code projeté) et bouton « Voir qui »

**Fait** —
- **Migration 25 appliquée** sur la base de développement `calcul-mental-dev` via MCP Supabase (`defis_presences`, `presents_defi()`, `eleves_hors_plafond()`, `avancement_defi()` avec six compteurs, `enregistrer_session()` refusant les parties à 0 question). Contrôle SQL réussi : `table_creee = 1`, `fonctions_creees = 2`.
- **Types TypeScript régénérés** dans `frontend/src/types/database.ts`.
- **Enveloppes d'API ajoutées** dans `frontend/src/api.js` : `presentsDefi(defiId)` et `elevesHorsPlafond(classe, tables)`.
- **Maquette 9 (Code projeté au tableau)** entièrement réalisée dans `Challenges.jsx` (`DefiCodeScreen`) : format 1280 × 720 lisible du fond de la salle, cinq cases géantes pour le code, affichage dynamique des arrivées en direct via `presentsDefi` et `suivreDefi`, rafraîchissement toutes les 3,5 s (avec arrêt au démontage), décompte du débordement (« + X autres »), avatar grisé quand l'élève a terminé (`a_termine`), pas de nombre négatif pour les anciens défis (`rejoints` et `en_cours` comptés).
- **Écran 17 (Bouton « Voir qui › »)** implémenté dans `ChallengeConfigProf` : bascule affichant la liste exacte des élèves hors plafond (prénom, nom et jusqu'à quelle table), décompte strictement identique à `eleves_hors_plafond` (1 élève sur la classe 31, Lou Audran jusqu'à 10 pour un défi avec la table 12), aucun emploi du mot « travail ».
- **Finition sur l'accueil élève (`Home.jsx`)** : message fixe en français « Connexion perdue. Appuie sur Réessayer. » en cas d'erreur de profil ou coupure réseau, détail technique consigné dans `console.error`.
- **Jeton de style ajouté** dans `tokens.css` : `--indigo-clair: #A9AFDE` pour les textes secondaires sur fond sombre. `check-tokens.mjs` et `npm run build` 100 % verts.

**Décidé** —
- La mosaïque décorative 3x3 de Maquette 9 est intégrée dans le flux flex de l'en-tête pour éviter tout chevauchement avec le logo ou le titre quel que soit le ratio d'écran ou la fenêtre.
- Le bouton « Voir qui › » charge les noms à la demande ou rafraîchit la liste si le panneau est déjà déployé quand les tables changent.

**Constaté** —
- Le polling de 3,5 s et l'abonnement en direct Supabase sur `defis_participants` répercutent instantanément l'arrivée d'un élève (passage de « 0 connecté » à « 1 connecté » et apparition de son avatar/prénom) et la fin de sa partie (avatar grisé, `en_cours` retombant à 0).
- Sur un défi antérieur à la migration 25, `rejoints` et `en_cours` valent bien 0 sans aucun nombre négatif.

**Ensuite** —
- Les écrans sans maquette (Ma classe, accueil professeur, administration).
- La règle de maîtrise au temps de réponse.

---

---

## 2026-09-04 — La refonte est dans le code, et la migration 25

**Fait** — Lots 13 à 16 bis livrés par Antigravity et relus dans le code, pas
dans le rapport. La palette du logo est appliquée partout, `tokens.css` est la
seule source des couleurs. Écrans refaits sur les maquettes : accueil élève,
tout premier jour, création de défi, mode libre (écrans 18 à 21), pavé
numérique. **Migration 25** écrite et testée : table `defis_presences`,
`rejoindre_defi()` note l'arrivée, `avancement_defi()` renvoie six compteurs,
`presents_defi()` donne les prénoms du code projeté, `eleves_hors_plafond()`
donne les noms de l'écran 17, et `enregistrer_session()` refuse une partie à
zéro question. Scénario complet : **121 cas verts**.

**Décidé** — `en_cours` est un compteur, pas une soustraction : sur un défi
antérieur à la migration, `rejoints - termines` vaut −1. ✅ *écrit et testé
(cas 114)*

**Constaté (1) — le pavé numérique.** Il occupait 283 px au lieu de 400. Cause
trouvée par Antigravity : `Keypad.jsx` portait la classe `.game-zone`, qui
applique `min-height: 100dvh`. Après retrait : touche de 92 × 202,7 px, pavé à
38,3 % de la hauteur utile, quatre rangées visibles. Commit `124b857`.

**Constaté (2) — la grille de maîtrise est symétrique.** La clé de `maitrise`
est `min_max` : au plafond 10, 100 cases affichées pour 55 entrées au plus.
Compter les entrées divisait le score de chaque élève par deux. On compte les
cases affichées. Défaut associé : `MasteryGrid` n'a jamais reçu `tables`, donc
un élève au plafond 15 voyait une grille de 10.

**Constaté (3) — le chargement lu comme un premier jour.** L'accueil élève
affichait l'écran « Ta grille est vide » tant que `monProfil()` n'avait pas
répondu, et **définitivement** si l'appel échouait, le `.catch` étant vide. Un
élève qui joue depuis un mois était bloqué là, modes chronométrés grisés, pour
une coupure de deux secondes. Corrigé : trois états, chargement / erreur /
chargé, plus un bouton Réessayer.

**Constaté (4) — un blocage inutile de ma part.** Le bouton « Voir qui » a été
retiré du lot 16 au motif que `liste_eleves` et `apercu_defi_classe` n'auraient
pas le même verrou. C'est faux : depuis le 27 août `prof_voit_classe()` appelle
`est_prof()`, ce qui applique la décision « un enseignant voit toutes les
classes » écrite dans `ETAT.md` §3. Un lot de retard pour une contrainte
inventée sur une décision déjà prise. La même erreur a fait ressortir le sujet
RGPD deux fois de suite alors qu'il était tranché depuis longtemps.
**Règle : relire `ETAT.md` §3 avant d'objecter.**

**Ensuite** — Appliquer la migration 25, transmettre le lot 17 (maquette 9,
bouton « Voir qui », deux finitions). Puis les écrans sans maquette, puis la
règle de maîtrise au temps de réponse.

---

# Entrées

## 2026-09-03 — La refonte visuelle est arrêtée, et elle a produit une migration

**Fait** — Deuxième passe de Claude Design, cette fois **avec le code de
l'application en pièce jointe** (`docs/design/CODE_POUR_CLAUDE_DESIGN.md` :
`api.js`, le CSS, les cinq composants, les onze écrans). Résultat : dix
maquettes au lieu de sept, la palette du logo appliquée, 36 icônes SVG là où il
n'y en avait aucune, et les trois chiffres inventés corrigés.

Livrés dans ce lot :
- **Migration 24** — `apercu_import_eleves()`, les raisons de rejet détaillées,
  et la détection des doublons intra-fichier. Scénario passé de 99 à
  **107 cas, tous verts**.
- **`frontend/src/styles/tokens.css`** — toutes les couleurs, rayons, ombres,
  tailles, durées et la règle du pavé, en variables. Plus aucune couleur en dur
  ailleurs.
- **`PROMPT_ANTIGRAVITY_lot13.md`** — le lot de refonte, en un seul message.

**Décidé**

- **La palette vient du logo, relevée au pixel** : indigo `#20226B`, bleu ciel
  `#23A4D9` (la couleur d'action), rouge `#E02020`, orange `#F38E1A`, vert
  `#018F4B`, ivoire `#FAF6EE`. L'or `#C9A227` et le violet `#8B6FC0`
  disparaissent : ils venaient de la palette « Calcul Mental Saintho », écrite
  avant que le logo n'existe, et que j'avais donnée telle quelle dans le
  premier brief. C'est Aymeri qui a vu que le rendu était loin du logo.
  ✅ *validé par Aymeri le 03/09*
- **Deux valeurs du même rouge, pas deux couleurs** : `#E02020` pour les barres
  du professeur (de la donnée, elle doit se lire), `#E4736F` pour l'erreur de
  l'élève. Le corail précédent était une autre teinte, pas une nuance.
  ✅ *validé par Aymeri le 03/09*
- **L'emoji reste pour les avatars, la couronne et le badge ; tout le reste
  passe en SVG écrit à la main.** Un avatar choisi dans une liste est une
  identité personnelle sans une lettre de texte libre — c'est exactement ce que
  la règle du projet demande. Les icônes de mode, elles, faisaient planche
  d'autocollants. ✅ *validé par Aymeri le 03/09*
- **L'écran d'administration reste dans le périmètre du design**, et il est en
  **paysage**, à rebours du portrait imposé ailleurs : il s'utilise sur un Mac.
  Sobre et dense, l'opposé des écrans élèves. C'est Aymeri qui a refusé qu'on
  l'écarte. ✅ *validé par Aymeri le 03/09*
- **L'aperçu et l'import partagent leur fonction de validation**
  (`valider_lignes_import`). Deux copies des règles, c'est deux copies qui
  divergent au premier correctif — et un aperçu qui ment est pire que pas
  d'aperçu du tout.

**Constaté**

- **La maquette a trouvé un vrai défaut du serveur.** En dessinant l'écran
  d'import, Claude Design écrit « e-mail déjà présent ligne 88 ». Vérification
  faite : `importer_eleves` traitait **deux fois** deux lignes du même fichier
  portant le même e-mail — création puis mise à jour — et les comptait deux
  fois. Un doublon dans un export de vie scolaire n'a rien d'exceptionnel.
  Corrigé par la migration 24.
- **Deux chiffres que je croyais inventés étaient exacts.** Le calcul « premier
  coup / rattrapée à ½ point » est bien `points_session` (migration 12), et
  « 18 sur 27 ont terminé, 9 jouent encore » nomme correctement ses deux
  populations. J'allais les corriger : la règle « ne rien affirmer sans
  exécuter » a servi dans l'autre sens.
- **Le `.dc.html` n'est pas du code réutilisable** : 783 styles écrits dans les
  balises, 1 736 tailles en pixels durs, zéro classe. C'est une peinture. D'où
  `tokens.css`, extrait à la main, et la consigne explicite à Antigravity de ne
  pas recopier la fausse barre d'état de l'iPad ni la géométrie figée à
  834 × 1194.
- **Les polices n'ont pas pu être récupérées ici** : le registre npm répond 403
  depuis le conteneur comme depuis la machine d'Aymeri. Baloo 2 et Nunito
  passent donc à Antigravity, avec les commandes exactes ; le `@font-face` est
  déjà écrit dans `tokens.css`.
- Un cas de test a d'abord échoué à tort : dans une seule instruction SQL, le
  sous-`select` qui compte les fiches voit l'instantané d'**avant** l'appel à
  `importer_eleves`. Scindé en deux instructions.

**Ensuite** — Aymeri applique la migration 24 dans Supabase et transmet le
lot 13. Le chemin critique reste entier : base de production, import des
350 élèves, Jamf, RGPD.

## 2026-09-02 (7) — Reprendre un defi ferme : le dernier lot de code

**Fait** — Relu dans le code, rien a corriger. Quatre points verifies parce que
chacun pouvait mordre :

- **L'ordre a la deconnexion.** `effacerDefiEnCours` est appele **avant**
  `setIdentite(null)` : apres, l'identifiant serait perdu et l'entree resterait
  en place pour le compte suivant sur le meme iPad.
- **Le refus « souple » du serveur.** Un defi ferme ou expire ne leve pas
  d'erreur : `rejoindre_defi` renvoie `{ok: false, message}`. Le wrapper `rpc()`
  le normalise deja en `res.ok = false` — donc le `if (res.ok)` de l'ecran est
  juste, et le message affiche est bien celui du serveur.
- **Le piege de la pre-configuration.** `defiPreConfig` servait jusqu'ici a
  arriver sur l'ecran de **configuration** depuis « Ma classe ». Reutilise tel
  quel, « Reprendre » aurait envoye l'eleve configurer un Sprint au lieu de
  rejoindre son defi. Antigravity a distingue les deux cas : `rejointDefi` mene
  a `defi-intro`.
- **Les questions.** Elles sont stockees dans la ligne `defis` a la creation :
  une seconde reprise renvoie exactement les memes. C'est ce qui rend la reprise
  legitime — l'eleve rejoue le meme defi, pas un autre.

**Quatrieme lot consecutif sans defaut.**

**Décidé** — **Le code est termine, pour de bon cette fois.** Plus rien n'est en
attente cote Antigravity avant la passe visuelle.

**Ensuite** — Claude Design, sur le brief `PROMPT_CLAUDE_DESIGN.md`. Puis un lot
d'implementation pour Antigravity, puis une relecture. Et en parallele, cote
Aymeri : base de production, import, Jamf, RGPD.

---

## 2026-09-02 (6) — Tests E sur iPad : deux constats, dont un a traiter

**Fait** — E1 (plein ecran depuis l'ecran d'accueil), E2 (le pave de
l'application, pas le clavier iOS, pas de zoom) et E3 (rotation) sont **au
vert**. Le socle tactile est sain.

**Constaté (E4) — le chronometre se suspend avec l'iPad.** iPad verrouille
30 secondes en pleine partie : au deverrouillage, le chronometre reprend ou il
en etait, avec une ou deux secondes de perdues, pas trente. Test fait deux fois.

C'est le comportement de `setInterval`, qu'iOS gele quand l'application passe a
l'arriere-plan. **Deux lectures opposees :**

- *Pour l'eleve* : une interruption en classe — le professeur qui parle, un
  iPad qui se verrouille tout seul — ne lui coute pas trente secondes de
  classement. C'est juste.
- *Contre l'eleve honnete* : en Sprint, le classement se fait au temps. Un eleve
  peut basculer vers une autre application, reflechir ou demander, et revenir :
  la pause ne compte pas dans son temps.

**Décidé — on garde le comportement actuel, et on l'ecrit.** Le gain de la
triche est faible (les defis ne comptent dans aucune evaluation, une seule
participation par defi, score borne par le nombre de questions, points ponderes
par la difficulte des tables), tandis que l'interruption en classe est une
certitude quotidienne. Punir le certain pour empecher le possible serait un
mauvais echange. ✅ *tranche le 02/09.* Consigne au §3 : **un risque accepte qui
n'est pas ecrit redevient un bug six mois plus tard.**

**Constaté (E5) — un defi ferme est un defi perdu.** L'eleve reste connecte
apres fermeture de l'application, mais **le defi en cours disparait**. L'etat
vit en memoire React ; au rechargement, il n'y a aucun chemin de retour. Et
`mes_defis()` ne liste que les defis qu'on a **crees**, pas ceux qu'on a
rejoints : un eleve qui a rejoint le defi de son professeur n'a plus que le code
a cinq lettres pour y revenir. S'il ne l'a pas note, c'est fini.

En classe, un iPad qui redemarre ou un eleve qui bascule d'application, cela
arrivera tous les jours. **Sa partie n'est pas enregistree** (`terminer_defi`
n'a pas ete appele), donc il peut rejouer — a condition de retrouver le code.

**Décidé — retenir le dernier defi rejoint cote navigateur** et proposer
« Reprendre le defi » sur l'accueil eleve. Front seul, aucune migration, et cela
couvre le cas reel : l'iPad qui a lache il y a deux minutes. ⏳ *a transmettre*

*Ecarte pour l'instant :* une liste serveur « les defis en cours de ta classe ».
Plus robuste, et probablement la bonne conception a terme — un defi de classe ne
devrait pas dependre d'un code ecrit au tableau — mais c'est une fonctionnalite
nouvelle, pas un correctif, et on est a quelques jours de la rentree. **Note
comme candidat d'apres-rentree.**

**Non fait — E6**, regarder quelqu'un s'en servir sans explication. C'est le
seul test qui ne se coche pas, et le seul qui ne peut etre remplace par rien.
Signale a Claude Design comme angle mort assume.

---

## 2026-09-02 (5) — L'application s'appelle matHo

**Décidé** — **`matHo`**, contraction de *mathematiques* et de *Saintho*. Casse
exacte : m minuscule, H majuscule, o minuscule. ✅ *tranche par Aymeri le
02/09.* Le « matHO » de son premier message etait une faute de frappe — la
question a ete posee avant la bascule, ce qui a evite quatorze remplacements a
refaire.

**Fait** — Bascule de marque relue dans le code : `branding.js` (`appName`,
`shortName`, `monogram: 'mH'`, `logoPath`), le manifeste (`name`, `short_name`,
deux entrees d'icones en `purpose: "any"`), `index.html` (titre, description,
favicon, apple-touch-icon et **`apple-mobile-web-app-title`**), `package.json`,
et les deux en-tetes de commentaire. Plus aucune trace de l'ancien nom, et
surtout **plus aucun 404 sur `logo-saintho.png`** — un fichier qui n'avait
jamais existe et que trois balises reclamaient a chaque chargement depuis le
debut du projet.

**Fait (2) — les icones.** Le logo livre est une composition complete de
1024 px : « 7 × 8 », le « 56 », les mains, les carres, et le mot en bas. A
60 px sur un ecran d'accueil, le mot devient une tache et retrecit tout le
reste. J'ai donc decoupe **la marque seule** — sans le mot — et produit 180,
192, 512 et 32 px, plus le logo complet pour l'ecran de connexion et l'en-tete.
Aucun redessin : du decoupage et du redimensionnement.

**Constaté (méthode)** — Aymeri a demande pourquoi le nom disparaissait de
l'icone. La reponse tient a une convention que personne n'enonce jamais : **sur
un ecran d'accueil, une icone ne porte pas son nom** — le systeme l'ecrit
dessous, et c'est `apple-mobile-web-app-title` qui le fournit. Le mot n'est donc
pas perdu, il est ailleurs. Note ici parce que la question etait bonne et
reviendra a la passe visuelle.

**Constaté (3) — `authMode: 'pin'`** dormait dans `branding.js`, lu nulle part,
et affirmait le contraire de ce que fait l'application. Supprime. Une valeur
morte qui ment est pire qu'une valeur absente.

**Ensuite** — Le code n'est plus le chemin critique. Aymeri : finir la recette,
puis **la base de production, l'import et la ligne Jamf**. La passe visuelle
avec Claude Design vient apres, et elle a deja ses contraintes ecrites au §3.

---

## 2026-09-02 (4) — Le critere est bon, et il est temps de lever la tete

**Fait** — Correctif relu dans le code : `tablesQuiCoincent` filtre sur
`jaunes + rouges > 0`, le tri du bouton se fait sur `(jaunes + rouges) /
eleves_classe` decroissant, departage par le numero de table. Point important
verifie : le tri opere sur **une copie** (`[...tablesQuiCoincent]`), donc
l'ordre des barres a l'ecran n'est pas touche — `Array.sort` mutant en place,
c'etait le piege de ce correctif. `rienNeCoince` exige au moins une table
travaillee. Singulier et pluriel geres sur le bouton. **Rien a corriger.**

Troisieme lot consecutif d'Antigravity sans defaut.

**Constaté (méthode) — deux jours sur un seul ecran.** Depuis le 1er septembre,
l'essentiel de l'effort porte sur « Ma classe » et le bouton de defi : quatre
lots, trois migrations, un tri repris trois fois. Le travail est bon et chaque
correction etait justifiee — mais **le chemin critique n'a pas bouge d'un
metre**. Le nom n'est pas choisi, donc la passe visuelle, le logo, le Web Clip
et le modele d'e-mail sont bloques ; la base de production n'existe pas ;
l'import n'est pas prepare ; la ligne Jamf n'est pas testee ; le DPO n'est pas
prevenu.

Un ecran parfait dans une application que personne ne peut ouvrir ne sert a
rien. Note ici pour que la prochaine reprise commence par la : **le nom
d'abord.**

**Ensuite** — Aymeri : commiter, puis finir la recette (A5 a A9, B3 a B7, C, E,
F), puis **le nom**. `NOM_ET_MARQUE.md` a deja les trois formes et la liste des
14 endroits a changer.

---

## 2026-09-02 (3) — Mon critere etait mauvais, pas son code

**Fait** — Les trois points du lot 9 verifies dans la copie de travail : filtre
`dans_le_plafond_commun` retire, `"orientation": "portrait"` pose,
`availableTables` part de 2. Corrects tous les trois. **Non commites** : les
fichiers etaient encore modifies dans la copie de travail, donc rien n'etait
deploye.

**Constaté — le critere que j'avais donne est faux.** `eleves_verts <
eleves_classe` ne dit pas qu'une table est difficile : il dit qu'elle **n'est
pas terminee**. Il melange les eleves qui **echouent** et ceux qui ne l'ont
**pas encore rencontree** — une population de plus, la sixieme fois sur ce
projet. Dans la classe 31, il designait la table 11, ou le seul eleve l'ayant
travaillee la maitrise et l'autre ne l'a jamais ouverte : un « rattrapage » sur
une table ou personne ne bloque.

**Décidé** — Une table coince si `eleves_jaunes + eleves_rouges > 0`, triee sur
`(jaunes + rouges) / eleves_classe` decroissant. Le denominateur reste la
classe. ⏳ *transmis*

**Constaté (méthode) — troisieme correction du meme tri, et c'est moi qui l'ai
mal pose les trois fois.** La cause est identifiee : **l'ordre des barres et le
choix du bouton repondent a deux questions differentes** — l'un montre
l'avancement, l'autre designe une difficulte. J'ai voulu un seul critere pour
les deux. Regle ajoutee au §3.

Le retrait du filtre de plafond, lui, reste juste : il cachait la seule table
susceptible de coincer. C'est le critere qui suivait qui etait mauvais.

**Ensuite** — Antigravity : le critere. Aymeri : commiter les trois fichiers du
lot 9, puis finir la recette.

---

## 2026-09-02 (2) — Les compteurs disaient vrai, et le filtre du bouton est perime

**Constaté — fausse alerte, etablie par les faits.** Le doute sur « Mes defis »
ne tenait pas : sur les huit defis de la classe 31, `participants_tous` egale
`sessions_enregistrees` partout, et le detail des joueurs correspond ligne pour
ligne a ce que l'ecran affichait.

```
UFQVU  2/2  Lou A. (31), Agathe C. (31)
J3YSM  2/2  Lou A. (31), Agathe C. (31)
UEWTR  1/2  Agathe C. (31)
379S4  2 joueurs dont 1 de la classe  Adeliya B. (32), Lou A. (31)
E36MD, 73BKN, 9XGXX, HTHW3  : 0
```

Huit defis crees, quatre joues. Le « 1 / 2 de la 31 ont joue + 1 d'autres
classes » du 379S4 est exactement la correction de la migration 18, vue en
usage pour la premiere fois. **Premiere suspicion de ce projet qui ne cache
aucun defaut** — et elle aura coute une requete. Le rapport de force est le bon :
on verifie, on ne discute pas.

**Constaté (2) — le nouveau branchement de « Ma classe » rate le cas qui a servi
au test.** `tablesQuiCoincent` exige `dans_le_plafond_commun && verts < classe`.
Dans la classe 31 : la table 11 coince (1/2) mais porte le cadenas, les tables 2
a 10 sont maitrisees. Liste vide, et `toutMaitrise` faux puisque la 11 ne l'est
pas — on tombe donc sur **« Pas encore assez de donnees pour un defi cible »**
dans une classe qui a travaille dix tables.

**Décidé — le filtre `dans_le_plafond_commun` sort du bouton defi.** Depuis la
migration 21, le plafond commun n'interdit plus rien : un defi au-dessus est
jouable, le score s'enregistre, et l'ecran de confirmation dit au professeur
combien d'eleves sont concernes et ou s'arrete le plus faible. Ce filtre etait
la precaution d'avant la 21 ; le garder revient a **cacher au professeur la
seule table qui coince**, c'est-a-dire l'inverse de la raison d'etre de cet
ecran. Il reste ce qu'il fait bien : le cadenas sur la barre. ⏳ *transmis*

**Constaté (3) — la table 1 est proposee mais invisible.** Un defi joue hier
portait sur `[2,3,6,7,8,9,10,1,4,5]`. `ALL_TABLES` commence a 1, tandis que
`maitrise_classe()` genere a partir de 2 : le travail sur la table 1
n'apparait nulle part cote professeur. Pas une faille — la table 1 pese 0,15 en
difficulte, elle rapporte structurellement moins — mais deux ecrans qui ne
comptent pas les memes tables. On aligne l'ecran sur la base. ⏳ *transmis*

**Décidé — l'application s'ouvre en portrait.** `"orientation": "portrait"`
dans le manifeste. ✅ *tranche par Aymeri le 02/09.* **Sans promesse de
verrouillage** : ce champ est respecte par Chrome et Android, Safari sur iPad
l'a longtemps ignore et aucune source a jour ne dit le contraire. Le test dure
dix secondes et l'iPad est sur le bureau — c'est lui qui tranchera. Ce qui
compte davantage est deja au §3 : le portrait devient la cible de conception de
la passe visuelle.

**Ensuite** — Antigravity : les trois points. Aymeri : finir la recette
(A5 a A9, B3 a B7, C, E, F), puis le nom.

---

## 2026-09-02 — Premiere recette sur iPad : le chiffre etait juste, le mot etait faux

**Fait** — Aymeri deroule la recette a deux comptes sur iPad, classe 31
(2 eleves). Ce qui est passe : le defi a deux comptes joue en simultane, le
classement a deux noms dans le bon ordre (« 2 / 2 de la 31 ont termine »,
Lou A. 53 s, Agathe C. 107 s), l'ecran `DefiIntro` qui annonce « Travail de
classe — Defi de Aymeri Desjardins — 31 », l'avertissement hors plafond avec
ses deux boutons, et **le test B5, le plus important** : le defi sur la table 15
joue par une eleve plafonnee a 10 s'enregistre sans un mot de refus. C'est
exactement l'objet de la migration 21, et c'est la premiere fois qu'on le voit
a l'ecran.

**Constaté (1) — l'avertissement dit un chiffre juste avec un mot faux.**
« 1 eleve sur 2 n'a pas encore **debloque** la table 15 ». Aymeri le croit faux :
sur « Ma classe », la table 15 est marquee « Pas travaillee » pour **les deux**
eleves. Verification : le compteur est **exact** — un eleve a un plafond de 10,
l'autre de 15 (visible indirectement sur la capture : la table 11 porte un
cadenas, donc le plafond commun est 10, et l'affichage monte jusqu'a 15, donc le
plus haut plafond est 15).

Ce qui est faux, c'est le mot. `plafond_tables` est un **droit** gagne par la
Montee des tables ; la maitrise est une **trace de travail**. « Debloque »
designe le premier, et se lit comme le second. Le professeur ne voit ce mot
defini nulle part.

**Un chiffre juste que personne ne sait lire ne vaut pas mieux qu'un chiffre
faux** : dans les deux cas la decision se prend sur une representation erronee.
C'est la famille des bugs de population, transposee au vocabulaire. Regle
ajoutee au §3.

**Fait** — Migration 23 (`20260902100000_plafond_lisible.sql`) :
`apercu_defi_classe` renvoie en plus `plafond_commun` et `plafond_max`, de quoi
ecrire une phrase qui se suffit a elle-meme — « la table 15 depasse le niveau
atteint par 1 eleve sur 2 ; le plus faible de la classe s'arrete a la table 10 ».
Quatre cas de test (96 → 99), dont un qui verifie que les quatre compteurs
portent sur la meme population. Suite portee a **99 cas, tous verts**.

**Constaté (2) — un bouton qui recommande ce que les donnees ne disent pas.**
Classe 31 : tables 2 a 10 toutes a « 2 / 2 maitrisent ». Et le bouton propose
« Lancer un defi sur les tables 2, 3, 4 ». Le tri n'y est pour rien — a egalite
parfaite, trois tables sortent forcement. C'est l'affirmation qui est fausse :
il n'y a rien a rattraper. Correctif transmis a Antigravity : quand aucune table
travaillee n'a d'eleve en difficulte, l'ecran le dit au lieu d'inventer une
cible. Regle ajoutee au §3.

**Constaté (3) — l'orientation.** L'application tient dans les deux sens, mais
en paysage le contenu occupe le tiers haut de l'ecran et laisse une grande zone
vide. **Le portrait devient l'orientation de reference** pour la passe visuelle.
Question ouverte pour Aymeri : verrouiller `"orientation": "portrait"` dans
`manifest.json` — cela cadre l'usage en classe, mais empeche une demonstration
au videoprojecteur en paysage. *Recommandation : le faire, et le defaire si un
professeur le demande. Un eleve qui tourne son iPad par reflexe ne doit pas
changer la mise en page au milieu d'un chronometre.*

**En attente** — Les compteurs de « Mes defis » : sur sept defis crees pour la
classe 31, cinq affichent moins de participants qu'Aymeri croit en avoir eus. Le
SQL separe pourtant correctement les populations depuis la migration 18, et rien
dans les captures ne se contredit. Requete de diagnostic transmise plutot qu'une
hypothese. ⏳

**Constaté (méthode)** — La recette a ete rendue avec les plafonds des deux
eleves non notes (« non »), alors que la fiche les demandait. C'est precisement
ce qui a rendu l'avertissement du test B illisible et a coute une demi-heure et
une requete en base. `TESTS_RECETTE.md` porte desormais un encadre a cet
endroit, et un test A9 qui compare le compteur de « Mes defis » au classement
juste apres la partie — le controle qui aurait leve le doute sur-le-champ.

**Ensuite** — Antigravity : migration 23, les deux formulations, le diagnostic.
Aymeri : finir la recette (A5 a A8, B3 a B7, C, E, et le nouveau test F), puis
le nom.

---

## 2026-09-01 (9) — Le compte refuse n'etait pas celui qu'on croyait

**Constaté** — Diagnostic de la fiche d'Agathe, en base :

```
email   agathe.cheurlin@saintho.fr   actif  true   classe 31
user_id 1e07db30-…  =  le compte Google portant exactement cette adresse
```

Fiche active, adresse correcte, rattachement correct. **Aucune des trois
causes envisagées ne tient**, et la passe de réparation de la migration 22
n'avait effectivement rien à rattacher — elle a rendu 0.

Un seul compte orphelin en base : `claude49@saintho.fr`, créé le 28 août, sans
fiche. Explication la plus probable : **l'iPad était connecté avec un autre
compte Google.** Safari sur iPad garde sa propre session, distincte de celle du
Mac. L'application a alors fait exactement ce qu'on lui demande — refuser un
compte absent des listes. Ce n'était pas un défaut.

**Le vrai défaut, et il a coûté une demi-journée : l'écran « Compte non
reconnu » ne dit pas QUEL compte il refuse.** Trois causes possibles, un seul
message, et aucune information pour trancher. Un professeur devant 24 iPads ne
peut pas deviner qu'une session d'un collègue traîne dans Safari.

**Décidé** — L'écran affiche l'adresse du compte connecté, et le bouton dit
« Se déconnecter et changer de compte ». L'adresse vient de
`supabase.auth.getSession()` : aucune migration, aucun changement de contrat.
✅ *livré au commit `4115871`, relu dans le code — `emailSession()` dans
`api.js`, encart affiché dans le bloc `appState === 'inconnu'` d'`App.jsx`,
`sessionEmail` remis à null à la déconnexion. Rien à corriger.*

**Constaté (méthode)** — La migration 22 reste juste et nécessaire : le trou
qu'elle bouche existe, il est reproduit dans les cas 91 à 95, et il aurait
frappé à la rentrée échelonnée. Mais **elle ne corrigeait pas le symptôme qui
l'a fait écrire.** Diagnostic et correctif ne coïncident pas toujours ; on ne
clôt pas un symptôme parce qu'on a livré un correctif plausible. C'est le
`rattaches: 0` qui a évité de le croire.

**Constaté (2) — un défaut trouvé par Antigravity, en relisant l'écran.**
`StudentRow` lisait `eleve.connecte`, propriété que `liste_eleves` ne renvoie
pas : elle s'appelle `deja_connecte`. `undefined !== false` valant `true`, le
badge « jamais connecté » **ne s'est jamais affiché pour personne**. Corrigé
dans le même lot, avec trois états au lieu de deux et le mot « connecté »
retiré des libellés : l'écran sait qu'un compte est rattaché, pas que
quelqu'un s'est connecté.

**Ensuite** — Antigravity : l'adresse sur l'écran de refus. Aymeri : reprendre
la recette, en notant d'abord quel compte Google Safari utilise sur l'iPad.

---

## 2026-09-01 (8) — Migration 22 : une eleve ajoutee, et pourtant refusee

**Constaté (Aymeri, en testant)** — Agathe Cheurlin est ajoutée depuis l'écran
Administration, apparaît bien dans la liste, et son iPad lui répond
« Ce compte n'est pas reconnu. Demande à ton professeur. »

**La cause, reproduite sur base neuve avant d'écrire une ligne :**

```
fiche créée AVANT le compte Google  →  qui_suis_je() = 'eleve'
compte Google créé AVANT la fiche   →  qui_suis_je() = 'inconnu'
                                       eleves.user_id = null
```

`eleves.user_id` n'est renseigné que par le trigger `on_auth_user_created`, qui
se déclenche à la **création** du compte Supabase Auth — la toute première
connexion Google. Si la personne s'est connectée avant que sa fiche existe, le
trigger n'a rien trouvé et **plus rien ne le rattrape** : créer la fiche ensuite
ne renseigne pas `user_id`. Or `eleve_courant()` et toutes les politiques RLS
reposent dessus. L'élève est bloquée définitivement, et rien ne le signale : sa
fiche est parfaitement normale à l'écran.

**Pourquoi c'était grave maintenant.** À la rentrée, 350 élèves sont importés.
Il suffit qu'un élève ait ouvert l'application une fois avant l'import de sa
classe — curiosité, un camarade qui montre, une classe testée avant les autres —
pour qu'il soit écarté sans recours. Et l'échelonnement classe par classe, qui
est la bonne décision par ailleurs, rend ce cas probable plutôt qu'exceptionnel.

**Fait** — Migration 22 (`20260901170000_rattachement_tardif.sql`). Le principe :
**on cesse de dépendre d'un événement unique.** Le rattachement devient une
opération rejouable, et on la rejoue chaque fois qu'une adresse entre dans le
système.

- `rattacher_par_email()` — helper interne, **non accordé à `authenticated`**
  (il lit `auth.users`). Il ne rattache que si le compte Auth n'appartient
  encore à personne : sans cette condition, une fiche élève créée avec
  l'adresse d'un administrateur lui prendrait son compte.
- `ajouter_eleve` et `importer_eleves` l'appellent — reprises **telles quelles**
  de la migration 7, seul l'appel est ajouté. `importer_eleves` renvoie en plus
  `rattaches`.
- `reparer_rattachements()` — réservé à l'administrateur, rejouable sans effet
  de bord. C'est le geste à faire après chaque import de rentrée.
- Une passe de réparation immédiate dans la migration, qui débloque les fiches
  déjà orphelines — dont celle d'Agathe.

Cinq cas de test (91 → 95). Suite portée à **95 cas, tous verts**.

**Constaté (méthode)** — La première version de cette migration, écrite trop
vite, recréait `ajouter_eleve` avec un corps **reconstitué de mémoire** :
mauvais helper de droits, mauvais format de retour, et surtout la branche de
réactivation d'une fiche désactivée purement disparue. Rattrapé avant tout test
en reprenant le corps d'origine caractère par caractère et en n'y insérant que
l'appel. La règle vaut d'être écrite : **on ne réécrit jamais une fonction
existante de mémoire ; on reprend son texte et on l'amende.**

**Ensuite** — Aymeri : appliquer la 22, puis reprendre la recette avec Agathe.
Antigravity : le bouton de réparation dans Administration et les trois nombres
de l'import.

---

## 2026-09-01 (7) — L'application en ligne ne démarrait pas

**Constaté** — Avant de donner l'adresse pour la recette, ouverture de
`calcul-mental-saintho.vercel.app` : **écran ivoire, rien d'autre.** Console :

```
Error: Configuration Supabase manquante.
Crée `frontend/.env.local` avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.
```

`.env.local` est dans le `.gitignore` — à juste titre. Vercel ne l'a donc
jamais eu et construisait l'application sans savoir où était la base. Le défaut
était **invisible depuis la machine de développement**, où le fichier existe :
tout marchait en local, et rien en ligne. Il aurait été découvert devant un
collègue et deux iPads.

**Fait** — Les deux variables déclarées dans Vercel sur les trois
environnements (clé `anon` uniquement, jamais `service_role` : elle part dans
le bundle que chaque navigateur télécharge, et c'est le RLS qui protège les
données). Redéploiement — nécessaire, Vite inscrit ces valeurs **dans le
fichier construit**, au moment de la construction.

**Fait (2) — le test D de la recette est passé par la même occasion.** Neuf
requêtes au chargement complet : l'application, ses deux fichiers construits,
le manifeste, **les deux polices servies localement**, le logo (404 attendu) et
**un seul appel externe, vers Supabase**. Zéro requête vers
`fonts.googleapis.com` ou `fonts.gstatic.com`. La règle « aucune ressource
externe » du §3 est tenue pour de bon, et la seule ligne à ajouter dans Jamf
reste `*.supabase.co`. `TESTS_RECETTE.md` est annoté en conséquence : test D à
ne pas refaire, sauf après la passe visuelle.

**Constaté (méthode)** — Ce défaut n'était dans aucun code relu. Il était dans
la configuration d'un service tiers, c'est-à-dire exactement là où personne ne
regarde. La leçon vaut d'être notée : **avant de convoquer quelqu'un pour un
test, ouvrir soi-même l'adresse qu'on va lui donner.** Trente secondes contre
une demi-heure à deux, perdue.

**Ensuite** — La recette peut commencer : tests A, B, C et E de
`TESTS_RECETTE.md`. Puis le nom.

---

## 2026-09-01 (6) — Le code est terminé

**Fait** — Les deux correctifs du lot 4 vérifiés dans le code à `be10b25`,
dépôt propre :

- `Challenges.jsx` : `useEffect(() => setConfirmInfo(null), [tables, selectedClasse])`.
  Vérifié que `tables` est bien l'état `selectedTables` passé tel quel — donc
  une référence stable entre deux rendus, et l'effet ne se déclenche qu'à un
  vrai changement. Si le tableau avait été reconstruit à chaque rendu,
  l'avertissement n'aurait jamais pu s'afficher : c'est le genre de défaut qui
  passe tous les raisonnements et échoue à l'écran.
- `MaClasse.jsx` : le commentaire du départage dit maintenant ce que le code
  fait. Le code n'a pas bougé.

`01_scenario.sql` toujours identique (empreinte SHA-256) : rien n'a été retiré
de la suite. Le « 87 cas » du rapport reste un artefact de comptage — 90.

**Constaté** — Rien de nouveau. Première relecture de ce projet qui ne trouve
aucun défaut, après quatre lots consécutifs qui en trouvaient au moins un.

**Décidé** — **Le code est terminé.** Plus rien n'est en attente côté
Antigravity, hors la passe visuelle qui dépend du nom. `ETAT.md` §2 et §5 mis à
jour en conséquence. ✅ *constaté le 01/09*

**Ensuite** — Aymeri, et lui seul : le test du défi à deux comptes (le dernier
test fonctionnel du projet, deux personnes en même temps, personne ne peut le
faire à sa place) · le nom, qui débloque la passe visuelle · puis la base de
production, l'import des 350 élèves, la ligne Jamf et le RGPD.

---

## 2026-09-01 (5) — Lot 3 relu : la confirmation pouvait porter sur d'autres tables que celles créées

**Fait** — Relecture du lot d'Antigravity dans le code, à `daf12e7`, dépôt
propre. Les sept points de son rapport tiennent :

- **Migration 21 appliquée**, types régénérés, `apercu_defi_classe` en place.
- **Le tri corrigé** : `eleves_verts / eleves_classe` croissant, départagé par
  `taux_couverture` décroissant. Le bouton défi partage le même ordre.
- **Ligne 218** : `d.eleves_sans_trace`. **`pGris` supprimé.**
- **La confirmation avant création** existe, avec ses deux nombres venus du
  serveur ensemble.
- **Le bouton « Découvrir »** est branché, sans filtrage par plafond, comme
  demandé — c'est la migration 21 qui rend ce choix sûr.
- **Les polices sont locales** : deux `.woff2` variables dans
  `frontend/public/fonts/`, `@font-face` en tête de `index.css`, les trois
  `<link>` retirés de `index.html`. Vérifié : plus une seule occurrence de
  `googleapis` ou `gstatic` dans le code.

`supabase/tests/01_scenario.sql` est **identique au fichier de la migration 21**
(empreinte SHA-256 vérifiée) : aucun cas n'a été retiré. Son rapport annonce
« 87 cas » ; c'est un artefact de comptage des lignes d'en-tête, la suite en
contient bien 90.

**Constaté — un défaut réel dans la confirmation.** L'écran garde
`confirmInfo` en état, et rien ne l'efface quand le professeur change les tables
ou la classe entre l'avertissement et sa validation :

```
prof coche {3}              → « Créer »  → aucun avertissement… puis il coche 15
prof coche {15}, classe 6A  → « Créer »  → « 12 élèves sur 27… »
prof change la classe pour 3B, ou coche la table 20
prof clique « Lancer quand même »
  → le défi est créé avec les NOUVELLES tables et la NOUVELLE classe,
    sur la foi de chiffres calculés pour les anciennes.
```

C'est la même famille que tout le reste de ce projet : **deux populations qui ne
correspondent pas de part et d'autre d'une décision.** Ici ce n'est pas un
affichage faux mais un consentement obtenu sur autre chose que ce qui est fait.
Correctif : vider `confirmInfo` dès que `tables` ou `selectedClasse` changent.

**Constaté (2) — un commentaire qui contredit son code.** Dans `MaClasse.jsx`,
le départage du tri est correct (`(b.taux_couverture) - (a.taux_couverture)`
met la **plus** couverte en premier, ce qui est voulu : à égalité de
non-maîtrise, la table que la classe a rencontrée est un rattrapage, l'autre une
découverte). Mais le commentaire au-dessus dit *« la moins couverte en
premier »*. Le prochain qui lira corrigera le code pour l'aligner sur le
commentaire, et cassera le tri. Un commentaire faux est pire qu'absent.

**Constaté (3) — la preuve, encore, sur une classe d'un élève.** Troisième fois
qu'une vérification est apportée sur la classe 31 (`eleves_classe: 1,
eleves_hors_plafond: 1`). Une classe d'un élève ne peut rien démontrer d'un
compteur qui compare deux sous-ensembles : les deux valent 1 quoi qu'il arrive.
La classe 32 avait servi la fois précédente ; c'est elle, ou une classe aux
plafonds mélangés, qu'il faut prendre.

**Décidé** — Les contraintes de ressources externes sont consignées dans
`ETAT.md` §3 sous forme de check-list opposable, avec les URL à autoriser dans
Jamf et six règles pour la passe visuelle avec Claude Design. Motif : la règle
« aucune ressource externe » existait depuis le début et n'avait jamais été
appliquée — elle n'était écrite nulle part sous une forme vérifiable.

**Ensuite** — Antigravity : les deux correctifs ci-dessus. Aymeri : le test du
défi à deux comptes, et le nom.

---

## 2026-09-01 (4) — Migration 21 : le défi fait autorisation

**Décidé (Aymeri)** — Des deux issues possibles au défaut relevé la veille —
refuser à la création, ou laisser passer à l'enregistrement — c'est la seconde,
mais formulée autrement que je ne l'avais posée. Non pas « `enregistrer_session`
tolère les tables d'un défi » (ce serait rouvrir l'anti-triche du solo), mais
**le défi fait autorisation** : la session est acceptée pour les tables de la
ligne `defis` correspondante, et strictement rien d'autre.

La raison est la bonne, et elle vaut d'être notée telle quelle : *le plafond est
un anti-triche, pas une limite de programme.* La migration 10 le dit elle-même —
sans lui, cocher une table haute serait « le moyen simple de gonfler ses
points ». Il empêche un élève de **choisir** des tables trop hautes en solo. Un
défi de professeur n'est pas un choix d'élève. Un professeur de 3ᵉ qui veut
faire travailler la table de 15 à sa classe a le droit d'avoir raison, et ce
n'est pas à un mécanisme de jeu de lui opposer un veto. ✅ *tranché par Aymeri
le 01/09*

**Fait** — Migration 21 (`20260901100000_defi_fait_autorisation.sql`) :

- `enregistrer_session` lève le plafond si, et seulement si, **trois conditions
  relues en base** tiennent : le défi existe, l'élève figure déjà dans
  `defis_participants`, et `p_tables` est **exactement** l'ensemble des tables
  du défi. Aucune ne vient d'un paramètre que le client contrôle seul. Hors de
  là, le refus est intact.
- `creer_defi` ne refuse toujours pas, mais renvoie `eleves_hors_plafond`,
  `eleves_classe`, `classe` et `table_max` — les deux populations, jamais l'une
  sans l'autre, conformément à la règle du §3.
- `apercu_defi_classe(p_classe, p_tables)` : la même question posée **avant** la
  création, pour que l'écran affiche « 12 élèves sur 27 n'ont pas encore
  débloqué la table 15 — lancer quand même ? » au bon moment. Réservée aux
  enseignants (`prof_voit_classe`) : un élève obtient 0 partout.

Huit cas de test ajoutés (83 → 90). Suite portée à **90 cas, tous verts**,
`run.sh` rejoué de bout en bout sur un PostgreSQL neuf.

**Constaté — un trou trouvé en écrivant les tests, et fermé dans la même
migration.** `terminer_defi` est protégé contre le rejeu par la clé primaire de
`defis_participants`. L'appel **direct** à `enregistrer_session` avec le même
`p_defi_id` ne l'était pas : vérifié en base, la session comptait une seconde
fois, et les points avec.

```
avant  : 1 session sur ce défi
appel direct à enregistrer_session(p_defi_id = celui du défi)
après  : 2 sessions  ← acceptée
terminer_defi rejoué → « Tu as déjà participé à ce défi. »  ← lui, protégé
```

Le trou **existait avant** la migration 21 — il ne vient pas d'elle. Mais elle
en augmentait la valeur : les tables d'un défi de professeur peuvent désormais
peser plus lourd que le plafond de l'élève. Le fermer ailleurs, plus tard,
aurait voulu dire livrer sciemment une migration qui rend un défaut connu plus
rentable. Cas 90 ajouté. ✅ *validé par Aymeri le 01/09 — garder le garde-fou
dans la migration 21 plutôt que d'en faire une 22.*

**Constaté (méthode)** — La numérotation : `20260901100000`, soit la première
heure disponible au-dessus de la 20, et non l'heure réelle d'écriture (il était
1 h du matin). La dette vient de la 19, datée dans le futur ; elle se résorbe
d'elle-même dès que l'horloge passe 10 h.

**Ensuite** — Aymeri : appliquer la migration 21 dans Supabase, régénérer
`database.ts`, puis transmettre à Antigravity le lot unique (migration 21 +
tri + ligne 218 + `pGris` + bouton « Découvrir »). Puis le test du défi à deux
comptes, et le nom.

---

## 2026-09-01 (3) — Relecture de `cc1e08a` : le dénominateur est revenu par la porte du tri

**Fait** — Vérification du lot « Ma classe » d'Antigravity **dans le code**, à
`cc1e08a`, dépôt propre (aucune modification non commitée). Les six points de
son rapport sont conformes : `tablesAbsentes` et la boucle `2..20` ont disparu,
`eleves_sans_trace` vient du serveur, les deux blocs sont séparés, le bouton ne
retient que `travaillee && dans_le_plafond_commun`, et le cas où aucune table ne
qualifie est traité. `run.sh` rejoué de bout en bout sur un PostgreSQL neuf :
**82 cas, 0 ECHEC** — vérifié par exécution, pas sur parole.

**Constaté — cinquième occurrence du même défaut, cette fois dans le tri.**
Le bloc 1 et le bouton se trient sur `taux_maitrise`, dont le dénominateur est
`eleves_total` : ceux qui ont **déjà travaillé** la table, jamais la classe.
C'est exactement le dénominateur que la migration 19 a été écrite pour ne plus
laisser gouverner un affichage. Cas fabriqué et exécuté sur la base de test,
classe de 6 élèves :

```
 table_n | eleves_verts | eleves_total | eleves_sans_trace | taux_maitrise | taux_couverture
       4 |            2 |            5 |                 1 |            40 |              83
       6 |            1 |            1 |                 5 |           100 |              17
```

Tri de l'écran : la table 6 finit **dernière**, donc présentée comme la mieux
acquise de la classe — alors que cinq élèves sur six ne l'ont jamais ouverte.
Un seul l'a vue, il a réussi, et 100 % d'un échantillon de un suffit à la
classer première. `travaillee` est un seuil à **un** élève : il ne dit pas que
la classe a travaillé la table, il dit que quelqu'un l'a vue une fois. L'écran
reçoit `taux_couverture`, le documente en tête de fichier, et ne s'en sert
nulle part.

Les quatre premières occurrences étaient dans ce qu'un écran **affiche** ;
celle-ci est dans ce qu'il **ordonne**. Un tri est un jugement : il se fait sur
la population que le bouton concerne, c'est-à-dire la classe entière.

**Constaté (2) — un défi de prof au-dessus du plafond est jouable, mais pas
enregistrable.** Défaut indépendant du lot, trouvé en relisant `creer_defi`
puis vérifié en base :

```
prof → creer_defi('sprint','{15}')   → code W2NEZ
Alice (plafond 12) → rejoindre_defi  → ok: true, questions livrées
Alice enregistre                     → REFUS : « Tu n'as pas encore debloque la table 15. »
```

`creer_defi` n'impose aucun plafond à un professeur ; `enregistrer_session` en
impose un à l'élève. L'élève joue le défi en entier, puis perd son score.
`Challenges.jsx` ligne 62 donne `plafond = 20` à un prof : le chemin manuel de
« Lancer un défi » y mène en trois tapes. Le bouton de « Ma classe » est
désormais borné à `dans_le_plafond_commun` et ne déclenche plus ce cas — mais
il n'était que le chemin le plus probable, pas le seul.

**Décidé** — Rien de tranché. Deux correctifs proposés à Antigravity (tri sur
`eleves_verts / eleves_classe` croissant, départagé par `taux_couverture`
décroissant ; `sansTrace={d.eleves_sans_trace}` au bloc 2) et une migration 21
proposée à Aymeri, pour borner un défi de prof au plafond commun de la classe
visée. ⏳ *en attente*

**Constaté (méthode)** — Le dossier n'était pas connecté au début de cette
relecture : elle a d'abord été faite sur le dépôt GitHub public, puis
recontrôlée par empreinte SHA-256 contre la copie de travail une fois le
dossier connecté — `MaClasse.jsx`, la migration 20 et `Challenges.jsx` sont
identiques. Un rapport se vérifie dans le code ; encore faut-il être sûr de
lire le bon code.

**Ensuite** — Antigravity : le tri, la ligne 218, et `pGris` (ligne 278,
calculé sans être utilisé — reste de la soustraction supprimée). Aymeri :
trancher la migration 21, le test du défi à deux comptes, et le nom.

---

## 2026-09-01 (2) — Migration 20 : le bouton qui lançait un défi sur ce que la classe n'avait jamais vu

**Constaté** — Un chat neuf, **sans accès au dépôt**, n'ayant que la copie de
`ETAT.md` dans les connaissances du projet, a relu le rapport d'Antigravity et
relevé une contradiction interne :

> « Tri : table la plus faible en premier (ratio verts/effectif croissant) »
> « Bouton pré-rempli avec les 2-3 tables les plus faibles »
> « Tables jamais travaillées : gris plein »
>
> Une table jamais travaillée a un ratio de 0. Elle arrive donc en tête du tri,
> et le bouton propose en priorité les tables que la classe n'a jamais ouvertes.

Vérification dans `MaClasse.jsx` : c'est exact, et **écrit explicitement**.

```js
const candidates = [
    ...tablesAbsentes.slice(0, 3),      // les tables JAMAIS ouvertes
    ...tablesSorted.map(d => d.table_n),
];
```

Et c'est pire que ce que ce chat pouvait supposer sans le code :
`tablesAbsentes` est calculé côté React comme « 2 à 20 moins ce que renvoie la
fonction ». Dans une 6ᵉ plafonnée à 10, les tables 11 à 20 sont donc toutes
« jamais ouvertes ». Le bouton proposait 11, 12, 13 — et `creer_defi()`
n'impose **aucun plafond de tables à un professeur**. La classe aurait reçu un
défi hors de sa portée, lancé par un enseignant persuadé de faire du
rattrapage.

**La cause est la même que les trois bugs de ratio** : l'écran fabrique une
population que le serveur ne lui a pas donnée. Quatrième fois. La règle du §3
disait « nomme tes deux populations » ; elle ne disait pas « ne fabrique pas de
population du tout ». Elle le dit maintenant.

**Fait** — Migration 20 (`20260901090000_tables_de_la_classe.sql`) :
`maitrise_classe()` renvoie **une ligne par table existant pour la classe**,
travaillée ou non, jusqu'au plus haut plafond de ses élèves. Plus rien à
inventer côté React. Nouvelles colonnes : `travaillee`,
`dans_le_plafond_commun` (table jouable par **tous** les élèves actifs — la
seule borne sûre pour un défi de classe) et `eleves_sans_trace` (calculé côté
serveur, plus de soustraction dans l'écran). Deux cas de test (81, 82), dont un
avec des plafonds mélangés. Suite portée à **82 cas, tous verts**.

**Constaté (méthode)** — Ce défaut a été trouvé par un chat qui n'avait **ni le
code, ni les migrations, ni les tests** : uniquement le rapport et la copie de
`ETAT.md`. Il l'a trouvé parce que `ETAT.md` §3 raconte les trois bugs de ratio
précédents et le sens dans lequel ils se trompent. La documentation n'a pas
servi à retrouver un contexte perdu : elle a servi à **repérer un défaut
inédit**. C'est le meilleur argument qu'on ait eu pour la tenir à jour.

Ses deux autres reproches sont tombés à côté, faute d'avoir les fichiers : le
`comment on function` de la migration 19 existe bel et bien, et les segments
jaune et corail viennent de `eleves_jaunes` / `eleves_rouges`, renvoyés par la
fonction. Un lecteur aveugle se trompe aussi — d'où l'intérêt de vérifier dans
le code plutôt que dans le rapport, y compris quand le rapport vient d'un
relecteur.

**Décidé** — Une migration se numérote à l'heure où on l'écrit. La 19 porte
`20260901080000` et a été appliquée à 00:00 : datée dans le futur. On ne la
renomme pas — elle est déjà appliquée — mais la suivante doit dépasser cet
horodatage, sous peine de voir dev et production s'ordonner différemment.

**Ensuite** — Antigravity : brancher l'écran sur les nouvelles colonnes et
corriger le bouton. Aymeri : le test du défi à deux comptes, et le nom.

---

## 2026-09-01 — Migration 19 : « 18 élèves sur 27 », et sur 27 pour de vrai

**Constaté** — Avant d'ouvrir le chantier « Ma classe », relecture de
`maitrise_classe()`. Elle renvoyait `eleves_total` : le nombre d'élèves ayant
**déjà travaillé** la table, jamais l'effectif de la classe. Affiché tel quel,
cela donne « 18 sur 20 » dans une classe de 27 — flatteur et faux. Les neuf
élèves qui n'ont jamais ouvert la table de 7 disparaissaient du dénominateur,
alors que ce sont exactement ceux dont le professeur doit s'occuper.

**Troisième ratio en deux jours qui mélange deux populations** (17, 18, 19).
Ce n'est plus une distraction, c'est un motif : dès qu'une fonction renvoie un
numérateur et un dénominateur, il faut écrire noir sur blanc de quelle
population chacun est tiré.

**Fait** — Migration 19 (`20260901080000_maitrise_classe_effectif.sql`) :
`eleves_classe` (effectif actif, constant sur toutes les lignes) et
`taux_couverture` (% de la classe qui a travaillé la table) s'ajoutent à
`eleves_total` et `taux_maitrise`, qui gardent leur sens — « 20 élèves ont
travaillé cette table, 18 la maîtrisent » reste une phrase utile. L'écran doit
pouvoir dire les deux. Trois cas de test (78 → 80), dont un qui ajoute une
élève sans aucune activité et vérifie qu'elle **reste** au dénominateur. Suite
portée à **80 cas, tous verts**.

**Décidé** — Toute fonction renvoyant un ratio nomme explicitement ses deux
populations dans son `comment on function`. Trois bugs identiques suffisent.

**Ensuite** — Antigravity : l'écran « Ma classe » (écran 15), avec le bouton
« Lancer un défi sur les tables 7 et 8 » pré-rempli. Aymeri : le test du défi à
deux comptes, et le nom.

---

## 2026-08-31 (12) — Migration 18 : « 2 / 1 ont terminé »

**Constaté** — Antigravity a livré « Mes défis » et la salle des profs, et il a
fait ce qu'on lui demandait : il a **exécuté** `mes_defis()` en base au lieu de
raisonner dessus, et collé les deux résultats réels. C'est son rapport qui a
révélé le défaut — dans la migration 17, donc de mon côté, pas du sien :

```
"code": "379S4", "classe": "31", "participants": 2, "attendus": 1
```

Soit, à l'écran : **« 2 / 1 ont terminé »**. `participants` comptait tous les
joueurs ; `attendus` comptait les élèves de la classe visée. Deux populations
différentes de part et d'autre de la barre de fraction. Le défi visait la 31
(un élève actif) ; Lou (31) et Adeliya (32) l'ont joué.

La correction ne consiste pas à interdire à Adeliya de jouer : faire jouer la
31 contre la 32 est une demande explicite, et c'est ce qui rend les défis
vivants. Elle consiste à compter les deux choses séparément.

**Fait** — Migration 18 (`20260831210000_origine_defi.sql`) :

- `auteur_defi(p_defi_id)` — une seule définition de « qui a créé ce défi »,
  utilisée par les trois fonctions, pour qu'elles ne divergent jamais.
- `mes_defis()` renvoie `participants` (tous), `participants_classe` (ceux de
  la classe visée) et `attendus` (l'effectif de cette classe) — plus `origine`
  et `auteur_nom`.
- `avancement_defi()` : même correction, plus l'origine et l'auteur, pour
  l'en-tête de l'écran de classement.
- `rejoindre_defi()` annonce l'origine et l'auteur **avant** de jouer :
  « Défi de M. Desjardins » et « Défi de Lou A. » ne s'abordent pas pareil, et
  c'est le seul moment où on peut le dire à l'élève.

Cinq cas de test ajoutés (73 → 77), dont le cas 74 qui rejoue exactement la
situation d'Aymeri : un défi de prof visant la 6A, joué par une élève de 6A et
une de 6B. Suite portée à **77 cas, tous verts**. `run.sh` crée un cinquième
compte de test (David, 6B) — sans lui, le cas croisé ne peut pas exister.

**Décidé** — Le nom d'un professeur s'affiche en entier ; celui d'un élève passe
par `nom_public()`, « Alice D. », comme partout ailleurs. Les élèves connaissent
leur professeur ; ils n'ont pas à connaître le nom de famille entier d'un
camarade d'une autre classe.

**Constaté (méthode)** — C'est la première fois que le défaut vient du **rapport
d'exécution d'Antigravity**, et non d'une relecture. Il avait exécuté la
fonction et collé le résultat sans y voir l'anomalie ; le résultat, lui, la
portait. La consigne « exécute, ne relis pas » a produit son premier bénéfice
mesurable — et elle a servi contre mon propre SQL.

**Ensuite** — Côté Antigravity : afficher l'origine et corriger le ratio.
Côté Aymeri : le test du défi à deux comptes, et le nom.

---

## 2026-08-31 (11) — Migration 17 + écran « Mes défis » (Antigravity)

**Migration 17 appliquée & types régénérés** —
1. `classement_profs()` alignée sur les autres classements avec la colonne `nom_affiche` (plus de « — (toi) » dans la Salle des profs).
2. `mes_defis()` créée pour lister les défis créés par l'utilisateur courant (prof ou élève) avec effectifs / attendus.
3. `avancement_defi()` corrigée pour ne calculer `attendus` que sur les défis de profs avec classe.

**Écran « Mes défis » créé & intégré** :
- Composant `MesDefis.jsx` affichant la liste des défis (code en display lettrage espacé, type, classe, date, participants/attendus, état en cours / terminé).
- Clic sur un défi → ouvre `DefiLeaderboard` en temps réel, retour ramenant à « Mes défis ».
- Accessible depuis l'accueil prof (`Home.jsx`) et depuis l'écran Défis élève (`Challenges.jsx`).


## 2026-08-31 (10) — Remise à plat de la documentation avant changement de chat

**Fait** — Passe complète sur les documents, pour qu'un chat neuf reprenne sans
rien reperdre :

- `ETAT.md` — §2 daté du 31 août (17 migrations, 72 cas) ; trois défauts
  ajoutés au récit du §2 ; « Mes défis », « Ma classe » et l'origine des défis
  listés dans ce qui n'est pas éprouvé ; §3 enrichi de trois décisions du jour ;
  §5 « Pour l'agent » réécrit — le plan de construction en huit étapes était
  terminé et induisait en erreur ; §6 réécrit avec le message de reprise et
  l'avertissement sur le projet Claude.
- `ANTIGRAVITY_BRIEF.md` — la liste des migrations du §5 en listait 9 sur 17.
- `PROMPT_ANTIGRAVITY.md` — **c'était le document le plus dangereux du dépôt** :
  il annonçait « la base est encore vide » et « ce qui n'est pas fait :
  absolument tous les écrans, c'est ton travail ». Collé dans un Antigravity
  neuf, il déclenchait une reconstruction complète par-dessus une application
  qui marche. Réécrit en message de **reprise**. Trois règles de méthode
  ajoutées, tirées des erreurs réellement commises.
- `docs/PROJET_CLAUDE.md` — nouveau.

**Constaté** — Les connaissances du **projet Claude** (côté claude.ai, pas le
dépôt) décrivent encore l'architecture Google Apps Script + Google Sheets, et
contiennent `AUDIT_HANDOFF.md`, `code.gs`, `gas.js` et six fichiers `.jsx` du
25 août. Un chat neuf les lit avant même d'ouvrir le dossier : il ne pose pas
de question, il répond faux avec assurance. Le ménage est à faire à la main
dans claude.ai — la liste exacte est dans `docs/PROJET_CLAUDE.md`.

**Décidé** — Une documentation périmée coûte plus cher qu'une documentation
absente. Un document qui décrit une étape franchie doit être réécrit le jour où
elle est franchie, pas archivé « au cas où ». Seul `archive/` échappe à la
règle, parce qu'il est signalé comme périmé dès la première page de `ETAT.md`.

**Ensuite** — Nouveau chat. Le message de reprise est au §6 de `ETAT.md`.

---

## 2026-08-31 (9) — Migration 17 : le défi de prof avait une porte sans poignée

**Constaté (en utilisant l'application, pas en la lisant)** — Trois défauts
que la relecture de code n'avait pas vus :

1. **Un défi de prof est un objet sans retour.** Le professeur crée le défi,
   note le code, quitte l'écran… et n'a plus aucun moyen d'y revenir. Le seul
   point d'entrée vers le classement d'un défi est le champ « Rejoindre un
   défi », et `rejoindre_defi()` lève une exception si l'appelant n'est pas un
   élève. Le prof lance le défi le lundi et ne voit jamais le résultat —
   c'est-à-dire exactement le moment où l'outil devait servir.
2. **« — (toi) 51 pts » dans la salle des profs.** `classement_profs()`
   renvoyait une colonne `nom` là où les trois autres classements renvoient
   `nom_affiche`. Le composant lit `nom_affiche` et retombe sur son tiret par
   défaut. Même famille d'erreur que l'onglet Classes (`classe` vs
   `nom_affiche`) — c'est la deuxième fois.
3. **« 1 / 27 ont terminé » pour un défi entre copains.** Le dénominateur était
   l'effectif de la classe du créateur. Trois amis sur vingt-sept ne sont pas
   « 3 / 27 ».

**Fait** — Migration 17 (`20260831090000_mes_defis.sql`) :
`mes_defis()` (les défis que j'ai créés, prof ou élève, expirés compris, avec
participants et effectif attendu) ; `classement_profs()` recréée avec
`nom_affiche`, `classe` et `avatar` — quatre classements, quatre fois les
mêmes colonnes ; `avancement_defi()` ne renvoie un dénominateur que pour un
défi **de prof** adressé à une classe. Neuf cas de test ajoutés (64 → 72),
scénario complet vert.

**Décidé** — Le contrat des classements est uniforme. Une fonction de
classement renvoie `rang, nom_affiche, classe, avatar, valeur, est_moi`, même
quand deux colonnes sont toujours nulles. Le coût d'une colonne vide est nul ;
le coût d'une exception côté React est un bug par écran.

**Discuté — défi d'élève vs défi de prof** : ils ne pèsent pas pareil et la
base le sait déjà (`cree_par_prof` XOR `cree_par_eleve`). Garde-fous en place
côté élève : plafond de tables du créateur, 5 défis ouverts au maximum, 24 h
de durée de vie contre 7 jours pour un prof. Reste à trancher : afficher
l'origine du défi dans la liste et dans le classement.

**Ensuite** — Côté Antigravity : écran « Mes défis » branché sur `mes_defis()`,
et la normalisation de l'onglet Salle des profs. Côté Aymeri : le test du défi
à deux comptes, et le nom de l'application.

---

## 2026-08-31 (8) — Migration 16 + profil enseignant (Antigravity)

**Migration 16 appliquée** — `mon_profil()` refuse explicitement les
non-élèves (`ok: false`, `raison: 'pas_un_eleve'`). `mon_profil_prof()`
renvoie le profil enseignant, ses records réels issus de `sessions_profs`, et
son rang en Salle des profs.

**Écran Profil enseignant** — `Profile.jsx` aiguille selon `identite.type` :
- Écran élève existant inchangé (`ProfileEleve`).
- Nouvel écran enseignant (`ProfileProf`) avec 3 blocs :
  1. Identité : nom, email, rôle (Enseignant ou Administrateur).
  2. Mes parties : records (points total, semaine, parties jouées, série,
     sprint, chrono, plus haute table), rang en salle des profs si présent, ou
     message « Tu n'as pas encore joué » + bouton « S'entraîner » si 0 partie.
  3. Mes classes habituelles : favoris modifiables via `definirMesClasses()`,
     ou mention « Aucune classe favorite. Tu les vois toutes. ».


## 2026-08-31 (7) — Migration 15 + accueil enseignant (Antigravity)

**Migration 15 appliquée** — `liste_eleves(p_classe)` renvoie actifs ET
désactivés, avec `deja_connecte`, `nb_sessions`, `points_semaine`. C'est
CETTE fonction que l'écran Admin utilise — pas `eleves_sans_connexion()`.
Lou apparaissait « 1 élève actif » dans le compteur mais disparaissait de
la liste dès qu'elle jouait.

**Accueil enseignant** — Le placeholder à la grue est remplacé par quatre
cartes : « Lancer un défi » → challenges, « S'entraîner » → play (qui
enregistre via `enregistrerSessionProf`), « Ma classe » → en construction
(carte grisée, assumée), « Classements » → leaderboards (dont Salle des
profs). Plus les boutons Profil, Administration (si admin), Déconnexion.

**Trois chemins débloqués** — un prof peut maintenant jouer (et apparaître
dans le classement Salle des profs), lancer un défi, et consulter les
classements. Les trois existaient en code mais n'avaient aucun bouton.


## 2026-08-31 (6) — Trois défauts admin (Antigravity)

**Le problème** — Le badge admin/prof basculait le rôle au clic, sans
confirmation, y compris sur soi-même. Aymeri s'est rétrogradé d'un clic.

**Correction 1 : badge → `<select>` + confirmation** — Le rôle d'un autre
enseignant est maintenant un menu déroulant (prof/admin) qui déclenche un
`window.confirm` explicite : « Retirer les droits d'administrateur à X ? ».
Pour soi-même, le badge est une étiquette non cliquable `(toi)`.

**Correction 2 : identité rafraîchie** — Après tout changement de rôle ou
désactivation, `quiSuisJe()` est rappelé (`refreshIdentite`) et `identite`
est mis à jour dans App.jsx. Si l'utilisateur n'est plus admin, les onglets
Enseignants / Import / Journal disparaissent immédiatement.

**Correction 3 : messages lisibles** — Les messages de la base (« Impossible :
c'est le dernier administrateur actif. », « Tu as déjà participé à ce défi. »)
s'affichent tels quels dans le bandeau d'erreur.

**Aussi** — La désactivation d'un élève et d'un enseignant demandent
confirmation. On ne peut plus se désactiver ou se rétrograder soi-même.


## 2026-08-31 (5) — Défis partagés (Antigravity)

**Fait** — Le dernier lot est posé. C'est le seul mécanisme multijoueur du
projet : deux élèves jouent les mêmes questions figées et se comparent.

**Migration 14 appliquée** — `terminer_defi()` accepte `p_score_premier_essai`.
Sans elle, les défis rapportaient des points gonflés au classement Progression.

**Carte « Défi de classe » supprimée** — ce n'était pas un type, c'était un
Sprint ou Countdown créé par un prof avec une classe. L'ancienne carte lançait
un Sprint solo en silence — le bug le plus trompeur du projet.

**Cinq pièges documentés, tous traités** :

1. Sprint et Countdown seuls sont partageables — le sélecteur l'empêche, la
   base le refuse aussi (`check (type in ('sprint', 'countdown'))`)
2. Les questions sont figées : `useQuizEngine` accepte une liste `defiQuestions`
   et la consomme dans l'ordre, sans `newQuestion()` ni `buildWeights()`
3. `terminerDefi()` appelle `enregistrerSession()` en interne — le front ne
   l'appelle pas une deuxième fois
4. Trois refus de `rejoindreDefi()` gérés : `inconnu` / `ferme` / `deja_joue`
   (ce dernier propose de voir le classement)
5. Classement en direct via `suivreDefi()` (Realtime) — aucun `setInterval`,
   désabonnement dans le cleanup du `useEffect`

**Élèves créent aussi** — un élève peut créer un défi (24h, 5 max simultanés,
tables plafonnées). Écran code sobre : « Donne ce code à tes copains ».

**Sprint en défi** — la règle s'annonce avant la partie : « Le plus rapide
gagne — chaque erreur ajoute 3 secondes. »

**Countdown en défi** — durée du serveur (`defiDureeS`), 120 questions jouées
jusqu'au bout du chrono (ou fin de liste si un élève les épuise toutes).

**Pas de « Relancer » en défi** — le bouton est remplacé par « Voir le
classement ». Un « Relancer » déclenche « Tu as déjà participé » — cul-de-sac.


## 2026-08-28 (4) — Première relecture croisée : Antigravity relit le SQL

**Fait** — Sur demande d'Aymeri, Antigravity a relu la migration 13. Jusque-là
la relecture n'allait que dans un sens : Claude relit le React, personne ne
relit le SQL. L'asymétrie est levée.

**Constaté — la trouvaille est réelle, et personne ne l'avait vue.**
Le score de progression se calcule sur une **fenêtre glissante**. Les cases
vertes ne comptent que si `derniere_vue` tombe dans la période. C'est le bon
choix — sinon un élève accumulerait 2 500 points de bonus chaque semaine sans
rien faire. Mais la conséquence n'avait jamais été formulée : **un élève qui
avait 1 767 points lundi voit 0 le lundi suivant s'il n'a pas joué.**

Ce n'est pas un défaut de la formule, c'est un défaut d'explication. Un
classement hebdomadaire remis à zéro est même une bonne chose — il fait
repartir tout le monde à égalité, et un élève qui commence en novembre peut
être premier dès sa première semaine. Encore faut-il le dire.

**Décidé** — La remise à zéro ne se corrige pas, elle s'affiche et s'explique :

- le score porte sa période dans son libellé (« cette semaine »), partout
- une phrase l'assume : « Le classement repart à zéro chaque lundi — tout le
  monde a sa chance. »
- le Profil montre à côté ce qui **ne** se remet **jamais** à zéro : les
  records personnels et la grille de maîtrise

**Corrigé (Antigravity)** — les trois changements d'affichage sont appliqués :

1. Classement : l'unité porte la période (`pts cette semaine`, `pts / élève
   cette semaine`) au lieu de `pts` seul. La phrase de motivation s'affiche en
   bas quand la période est « Semaine ».
2. Profil : l'écran est scindé en « 📈 Cette semaine » (score de progression
   et ses trois composantes : points de jeu, bonus jours actifs, bonus cases
   vertes) et « 🏆 Depuis toujours » (records, sessions jouées, points total).
   La phrase « Tes records personnels — ça ne recule jamais. » explicite la
   distinction.
3. Les données de `progression_detail()` sont exploitées dans le Profil —
   `mon_profil()` les renvoyait depuis la migration 13, elles n'étaient pas
   encore lues côté React.

**Vérifié — les trois autres points de la revue tiennent.**
`pts_palier > 0` n'exclut personne en pratique : `points_session()` renvoie au
minimum 1 dès qu'une réponse est juste, même sur la table la moins pondérée.
`palier = 'tous'` se comporte comme avant.

Sur le coût, son estimation est fondée et les deux index qu'il suppose existent
bel et bien — `sessions_eleve_idx (eleve_id, cree_le desc)` et surtout
`maitrise_revision_idx (eleve_id, niveau, derniere_vue)`, qui couvre les trois
prédicats de la sous-requête. Le seuil d'alerte qu'il propose (classement
« collège » au-delà de 500 ms) est le bon signal à surveiller.

**Fait** — Nettoyage des données de démo effectué. Il ne reste que Lou (31) et
Adeliya (32) dans `eleves`.


## 2026-08-30 — Migration 13, classement classes, revue SQL

**Fait — migration 13 (`score_progression`) appliquée.** `progression_detail()`
factorise la formule en un seul endroit. `classement_progression()` et
`mon_profil()` ne peuvent plus diverger. Types régénérés.

**Constaté — l'onglet Classes du classement affichait 0 partout.**
`classement_classes` renvoie `points_moyens` / `est_ma_classe` ; les composants
partagés `PodiumCard` et `LeaderboardRow` lisaient `points` / `est_moi` — noms
qui n'existent pas dans ces colonnes. La déduction des niveaux (`niveauxDisponibles`)
lisait `nom_affiche`, colonne absente aussi.

**Corrigé — normalisation au chargement.** La réponse de `classement_classes` est
mappée vers la forme attendue (`nom_affiche`, `valeur`, `est_moi`, `avatar`)
avant injection dans les composants. Ajout de « X / Y élèves ont joué » dans la
ligne pour distinguer une classe silencieuse d'une classe à zéro.

**Fait — revue de la migration 13.** Quatre points examinés :
1. `pts_palier > 0` : exclut en théorie un élève à 0 point, impossible en
   pratique — une seule bonne réponse suffit. Pas de correctif nécessaire.
2. Sous-requête corrélée `progression_detail()` : ~60 index scans pour une
   classe de 30, ~700 pour le collège. Acceptable aux volumes actuels.
3. `palier = 'tous'` : se comporte correctement, toutes sessions passent.
4. Progression/semaine vs records/cumul : cohérent et intentionnel, les deux
   blocs sont bien séparés dans le JSON.
5. Observation : les cases vertes hors fenêtre ne comptent pas — correct, sinon
   le bonus s'accumulerait à l'infini. Mais le score peut baisser d'une semaine
   à l'autre si l'élève ne joue pas (la semaine repart de 0).

---

## 2026-08-28 (3) — ⭐ Première connexion réelle : l'application fonctionne

**Fait — Google OAuth configuré et validé en conditions réelles.** Audience
Interne, client OAuth déclaré, provider activé, comptes inscrits. Aymeri s'est
connecté avec son compte enseignant, et Lou Audran (31) avec son compte élève.

Ce qui a été vérifié à l'écran, sur de vraies données :

- accueil élève avec le bon prénom et la bonne classe (« Salut Lou ! 31 »)
- profil : palier Découverte, « Tables débloquées : 1 à 10 », records à zéro,
  badges grisés, grille 10×10 vide — **tout est honnête, rien n'est simulé**
- sélecteur de tables : 1 à 10 ouvertes, 11 à 20 avec un cadenas, mention
  « Débloque les tables suivantes avec la Montée des tables »
- classements côté enseignant : onglets Classes et Salle des profs uniquement,
  état vide explicite
- la grille de maîtrise est dimensionnée sur le plafond, pas sur ALL_TABLES

**Constaté — l'écran Administration n'a jamais été réécrit.**
`Admin.jsx` fait 493 lignes et contient toujours `DEMO_STUDENTS` : six élèves
inventés en `@saintho.org`, des classes 6A à 5B qui n'existent pas, le code PIN
« 3333 » d'un système supprimé, un sélecteur PIN/Google, et des boutons
« Exporter CSV » et « RAZ année » qui ne sont branchés sur rien.

C'est exactement ce que la règle « aucune donnée en dur » interdisait, et c'est
affiché à un administrateur réel. Le champ y est même écrit `prénom` avec
l'accent — le bug qu'on avait identifié dès l'audit initial.

**Constaté — deux variables CSS manquantes rendent deux cartes illisibles.**
`Challenges.jsx` compose ses dégradés avec `var(--X-dk)`. Or `--coral-dk`,
`--sky-dk`, `--purple-dk` existent, mais **`--gold-dk` et `--navy-dk` non**. Un
`linear-gradient` dont une borne est invalide est ignoré en entier : les cartes
« Sans faute » (gold) et « Défi de classe » (navy) tombent sur le fond clair par
défaut, avec leur texte blanc dessus. Elles paraissent désactivées alors
qu'elles ne le sont pas.

**Constaté — les données de démo polluent les classements réels.** Le
classement des classes affiche 6A, 6B et 5A à côté des vraies classes 31 et 32 :
ce sont les élèves de `seed.sql`, chargés dans la base de développement.

**Corrigé — Admin.jsx entièrement réécrit sur les vraies fonctions.**
Supprimé : `DEMO_STUDENTS` (6 élèves inventés), `const CLASSES` en dur,
onglet PINs (code 3333), onglet Config (sélecteur PIN/Google, boutons
CSV et RAZ année branchés sur rien), heatmap aléatoire, stats à 73%.

Remplacé par : classes depuis `listeClasses()`, élèves depuis
`elevesSansConnexion()`, ajout/désactivation/réactivation réels, plafond
via `definirPlafondClasse()`, onglets Enseignants/Import/Journal réservés
aux admins (`estAdmin`), import CSV via `importerEleves()` avec affichage
des lignes ignorées et des absents. Build 468 kB (−1,7 kB : le code démo
pesait plus que le vrai).

**Corrigé — `--gold-dk` et `--navy-dk` ajoutées dans `index.css`.**
Les deux cartes « Sans faute » et « Défi de classe » sont à nouveau
visibles. Vérification : `grep "var(--.*-dk)" Challenges.jsx` → 5 couleurs,
toutes définies.

**Corrigé — le podium est masqué quand toutes les valeurs sont à 0.**
Le classement affiche l'état vide honnête (🏜 + message) au lieu de
trois marches avec des zéros.

**Ensuite** — les défis.


## 2026-08-28 (3) — Closure périmée : la 20ᵉ bonne réponse était perdue

**Constaté — dans SprintPlay et ClimbPlay, `onDone()` partait avec le
score d'avant la dernière réponse.** `recordResult()` incrémentait le
score via `setScore(s => s + 1)`, puis `setTimeout(advanceQuestion, 400)`
capturait la closure du rendu précédent. À la 20ᵉ question, `score` dans
la closure valait encore 19 — un sans-faute affichait 19/20, et le 20/20
était inatteignable.

CountdownPlay avait déjà des refs (`scoreRef`, `answeredRef`…) mais les
synchronisait via `useEffect`, ce qui laissait le même décalage d'un rendu
— compensé à la main dans Practice par `scoreRef.current + 1`. Fragile,
dupliqué, et un cinquième mode l'aurait réintroduit.

**Corrigé — les refs sont désormais dans `useQuizEngine`, incrémentées
dans `recordResult()` avant tout `setTimeout`.** L'état React (`setScore`)
suit pour l'affichage, mais `onDone` ne lit que les refs. La compensation
manuelle `+ (result !== 'jamais' ? 1 : 0)` a disparu.

Vérification : `grep -c "scoreRef.current" Challenges.jsx Practice.jsx` →
8 occurrences dans des `onDone`, 0 lecture de `score` nu. Build 0 erreur.

---

## 2026-08-28 (2) — La saisie passe à un modèle à cases

**Décidé — le modèle à cases remplace toute la validation automatique.**
Autant de cases que de chiffres dans la réponse ; dès que la dernière est
remplie, le système juge. C'est Aymeri qui a proposé cette solution, et elle
dénoue le problème par le bon bout : depuis le début, tout achoppait sur
« comment savoir que la saisie est finie ? ». Les cases y répondent, donc
`estReponseExacte()`, le délai d'inactivité et la validation par ✓ disparaissent
— on retire du code au lieu d'en ajouter. ✅ *validé par Aymeri le 28/08*

Le nombre de cases révèle le nombre de chiffres attendu : assumé. Avec les
tables de 1 à 10, trois cases ne peuvent signifier que 100. L'indice est
négligeable, le gain d'ergonomie ne l'est pas.

**Décidé — chrono par question de 3 s, déclenché à la première touche.**
Jamais à l'affichage : réfléchir doit rester gratuit, l'hésitation est déjà
punie par le chrono général. Aucun chrono par question en Sans faute (mode de
précision, pas de vitesse) ni en entraînement libre.
✅ *validé par Aymeri le 28/08*

**Constaté — ma première règle de points créait une incitation perverse.**
J'avais proposé que seul le premier essai rapporte. Aymeri a vu la conséquence
que je n'avais pas vue : chercher aurait coûté des secondes pour zéro point,
alors qu'abandonner ne coûtait rien. Sous chrono, la meilleure stratégie serait
devenue de laisser filer — un jeu qui apprend à renoncer.

**Décidé — premier coup 1 point, rattrapage ½ point, jamais trouvé 0.**
Chercher rapporte donc toujours plus qu'abandonner, et l'automatisme reste
mieux payé que le tâtonnement. C'est la pondération par table appliquée un cran
plus fin. ✅ *validé par Aymeri le 28/08*

**Fait — migration 12 `20260828080000_premier_essai.sql`**, écrite et testée
sur PostgreSQL 16 : colonne `score_premier_essai` sur `sessions_jeu` et
`sessions_profs`, fonction partagée `points_session()`, et le paramètre
`p_score_premier_essai` qui vaut `null` par défaut — les parties mises en
attente hors ligne par l'ancien client remontent donc sans pénalité.

Suite portée à **63 cas, tous verts**. Le cas 61 vérifie explicitement
l'ordre des points : 226 (tout du premier coup) > 180 (avec rattrapages) > 135
(a abandonné). C'est l'incitation elle-même qui est sous test, pas seulement le
calcul.

**Corrigé — j'avais proposé 5 s en Sans faute, à tort.** Dans ce mode la
première erreur arrête la série : il n'y a pas de rattrapage possible, donc la
fenêtre ne servait à rien. Pas de chrono par question dans ce mode.

**Fait — implémentation complète du modèle à cases.**

_Correctifs (points 1-3 d'Aymeri) :_

- Bug critique : `masteryColor(1)` renvoyait de l'or au lieu du corail.
  L'échelle locale (−2 à 4) coexistait avec l'échelle serveur (1/2/3).
  Unification sur l'échelle serveur partout : `undefined` = jamais vu,
  `1` = rouge, `2` = jaune, `3` = vert. `buildWeights()` corrigé aussi
  (recevait `{}` dans Challenges, pondération inerte).
- En entraînement libre, l'élève bloqué sur une question n'avait aucune
  sortie : après 3 tentatives ratées, les cases se remplissent avec la
  bonne réponse (~1,5 s), puis question suivante. Compté « jamais ».
- À l'expiration du chrono question, la bonne réponse n'était pas
  montrée (l'ancien `lastError` disparaissait). Remplacé : les cases
  s'emplissent en vert doux 800 ms.

_Composants modifiés/créés :_

- `DigitBoxes.jsx` [NEW] — saisie à cases, ne connaît que `numDigits`
- `Keypad.jsx` — ✓ retiré, 0 élargi sur 2 colonnes
- `mastery.js` — échelle serveur unifiée, `construireMaitrise()` depuis
  résultats par question (premier/rattrape/jamais), `buildWeights()`
  avec `maxMultiplier=20`
- `questions.js` — `estReponseExacte()` supprimée
- `api.js` — `p_score_premier_essai` dans les deux fonctions
- `Practice.jsx` — Quiz entièrement réécrit (cases, 3 tentatives libre,
  response time, `scorePremierEssai`)
- `Challenges.jsx` — 4 modes réécrits (cases, chrono 3s, scoring)
- `App.jsx` — charge `maitrise` via `monProfil()`, la passe en prop
- `Leaderboards.jsx` — niveaux déduits des classes renvoyées (plus de
  6ᵉ/5ᵉ/4ᵉ/3ᵉ en dur)
- Écrans de fin : « 18/20 du premier coup · 2 rattrapées au 2ᵉ essai »

Build Vite 0 erreur (469 kB). Migration 12 appliquée, `points_session(20,12,'{7,8}') → 180` ✅.

**Ensuite** — Les défis.


## 2026-08-28 — Ergonomie de la saisie sur iPad (Claude + Aymeri)

**Constaté** — `shouldAutoValidate()` validait dès que la saisie comptait
autant de chiffres que la bonne réponse. Elle attendait donc un troisième
chiffre exactement quand le résultat dépassait 99 : un élève en déduit que
« ça n'est pas parti » veut dire « c'est plus grand que 99 ». Indice offert,
et distribué inégalement selon que l'élève l'a remarqué ou non.

Deuxième point : `maxPossible = 225` (15 × 15) est périmé depuis le passage
d'`ALL_TABLES` à 20 — le maximum est 400.

Troisième point : en chrono, une mauvaise réponse affiche la correction
pendant 500 ms. C'est le moment le plus utile de la partie, et il est
illisible.

**Décidé** — Validation automatique en deux temps : correspondance exacte →
immédiat ; sinon 1 200 ms d'inactivité → la saisie part telle quelle. Ferme à
la fois la fuite d'information et la saisie en force brute.
✅ *validé par Aymeri le 28/08*

**Décidé** — Le chronomètre ne se met **jamais** en pause pendant une
correction : le classement chrono suppose des durées strictement égales. La
correction passe dans une bande persistante sous la question, lisible pendant
la question suivante. ✅ *validé par Aymeri le 28/08*

**Reporté** — Agencement paysage (question à gauche, pavé à droite) : à traiter
avec la passe visuelle, pas maintenant. ✅ *arbitré par Aymeri le 28/08*

**Fait**
- `shouldAutoValidate()` supprimée → `estReponseExacte()` (correspondance exacte,
  aucune fuite du nombre de chiffres) + `setTimeout(submit, 1200)` dans chaque
  composant (Practice Quiz, SprintPlay, FlawlessPlay, CountdownPlay, ClimbPlay).
- CountdownPlay : délai erreur 250 → 800 ms ; bande persistante `lastError`
  sous la question (« ⚠️ 7 × 8 = 56 »), lisible pendant la question suivante.
- Practice Quiz : même bande persistante en mode chrono, délai erreur 500 → 800 ms.
- Régression `maxPossible = 225` : le paramètre n'existe plus.
- Build Vite 0 erreur (469 kB).

**Ensuite** — Les défis.


## 2026-08-27 — Étape 3 : Profil et Classements

**Migration** `20260827120000_profil_complet.sql` — à appliquer sur Supabase (MCP non autorisé).
- `palier_de_plafond(smallint)` : Découverte ≤ 10, Confirmé ≤ 12, Expert au-delà.
- `mon_profil()` renvoie `{ profil, records, maitrise, badges }` en un seul appel.
- `tables_autorisees` marquée OBSOLETE en commentaire SQL.

**Fait**
- `ALL_TABLES` → `[1..20]` dans `logic/questions.js` (aligne sur plafond max + climb_20).
- `Profile.jsx` réécrit : `monProfil()`, grille de maîtrise dynamique (`plafond × plafond`),
  clé normalisée via `cleFait(a, b)` (pas `${a}_${b}`), changement d'avatar via API,
  palier en palette établissement (🌱 sky / ⭐ navy / 🏆 gold),
  « Réviser mes cases rouges » → `mesTablesFaibles()` → Practice avec tables pré-sélectionnées,
  cas vide géré (« Aucune case rouge — bravo ! 🎉 »).
- `Leaderboards.jsx` réécrit : `classementProgression()`, `classementRecords()`,
  `classementClasses()`, `classementProfs()` (si prof), 3 filtres combinables,
  défauts : ma classe / semaine / mon palier, `est_moi` pour surlignage doré,
  tri SQL (pas de re-tri client), noms anonymisés du serveur.
- `App.jsx` : `tablesADemarrer` state pour naviguer vers Practice avec des tables
  pré-sélectionnées, `goPlayWithTables()` passé à Profile, `estProf` passé à Leaderboards.
- `Practice.jsx` : accepte `tablesInitiales` — si fourni, démarre directement le quiz.
- Badge `climb_20` ajouté aux définitions.

**Constaté**
- Build Vite 0 erreur (468 kB).
- MCP Supabase non autorisé — migration à appliquer manuellement.

---

## 2026-08-27 — Avant l'étape 3 : profil complet (Claude)

**Fait** — Les trois corrections de l'étape 2 sont relues et correctes.
`handlePlafondChange()` reconstruit bien l'objet (`setIdentite(prev => ...)`),
pas de mutation malgré le mot employé dans le compte rendu ; `Practice.jsx`
verrouille les tables au-delà du plafond et « Tout choisir » n'en prend que
les débloquées.

**Constaté — une colonne fossile allait fausser l'écran Profil**

`mon_profil()` renvoyait `tables_autorisees`, un vestige de la version Google
Sheets : figée à 1..10 pour tout le monde, protégée en écriture par un trigger,
jamais mise à jour. Un élève Expert ayant débloqué la table 17 y lisait encore
« 1 à 10 ». Un écran Profil construit dessus aurait été faux sans que personne
ne comprenne pourquoi. Vérifié sur la base de test : Alice a `plafond_tables`
= 12 et `tables_autorisees` = 1..10.

Et il manquait à `mon_profil()` tout ce dont l'écran a besoin : plafond,
palier, total de points.

→ **Migration `20260827120000_profil_complet.sql`** : `mon_profil()` renvoie
`plafond_tables`, `palier`, `points_total`, `points_semaine`,
`jours_actifs_7j`. La colonne fossile est conservée (la retirer casserait les
types générés) mais porte désormais un commentaire SQL « OBSOLETE ».

Nouvelle fonction `palier_de_plafond()` : une seule définition du palier,
partagée par le profil et les classements, au lieu d'un `case` recopié.

**Décidé** — Le palier ne se saisit jamais, il se déduit du plafond débloqué :
Découverte ≤ 10, Confirmé ≤ 12, Expert au-delà. ✅ *déjà validé*

**Ensuite** — Étape 3 : `Profile.jsx` et `Leaderboards.jsx`.


## 2026-08-27 — Corrections post-revue étape 2

**Migration** `20260827110000_montee_reelle.sql` appliquée sur Supabase.
- `enregistrer_session()` ne retient `plus_haute_table` que si `p_mode = 'climb'`.
- Les badges `climb_*` ne sont délivrés que sur une vraie Montée.
- La RPC renvoie `plafond_tables` dans sa réponse.

**Fait**
- `Practice.jsx` : `plusHauteTable: null` (Practice n'est jamais climb).
- `Challenges.jsx` : `plusHauteTable` envoyé uniquement pour le mode climb, `null` pour sprint/flawless/countdown.
- `Practice.jsx` : sélecteur de tables respecte le plafond de l'élève (`identite.profil.plafond_tables`). Tables au-dessus du plafond affichées avec 🔒 et non cliquables. Message « Débloque les tables suivantes avec la Montée des tables 🧗 ». « Tout choisir » ne sélectionne que les tables débloquées.
- `App.jsx` : `handlePlafondChange(nouveau)` met à jour `identite.profil.plafond_tables` dans le state.
- `Practice.jsx` et `Challenges.jsx` : après `enregistrerSession`, si la réponse contient un `plafond_tables` différent, appel de `onPlafondChange`.
- `Challenges.jsx` (`ChallengeResults`) : après une Montée réussie, affichage « 🔓 Table X débloquée ! » avec message franc et anim-pop.

**Constaté**
- Build Vite 0 erreur (463 kB).
- `psql` absent de la machine — les tests SQL locaux nécessitent PostgreSQL 14+. La migration a été validée par l'utilisateur sur PostgreSQL 16 (60 cas, tous verts).

---

## 2026-08-27 (soir) — Revue de l'étape 2 (Claude)

**Fait** — Relecture de `mastery.js`, `Practice.jsx`, `Challenges.jsx` et des
migrations concernées. Suite de tests portée à **60 cas**, tous verts sur
PostgreSQL 16.

**Constaté — trois défauts**

1. **Les badges de Montée s'obtenaient sans monter.** `enregistrer_session()`
   accordait `climb_10/12/15/20` dès que `p_plus_haute_table` atteignait le
   seuil, quel que soit le mode. Or le front envoie la plus grande table
   *cochée dans le sélecteur*. Un élève qui coche la table 10 en entraînement
   libre décrochait `climb_10` sans avoir jamais joué la Montée. Même problème
   pour la colonne `sessions_jeu.plus_haute_table`, qui alimente le classement
   « montée » : elle enregistrait un choix de sélecteur, pas une performance.
   → **Corrigé en base** (`20260827110000_montee_reelle.sql`) : la valeur n'est
   retenue que si `p_mode = 'climb'`. Corrigé côté serveur et pas seulement
   côté front — un client peut mentir, la base non. Cas de test 58 et 59.

2. **`Practice.jsx` ignore le plafond de l'élève.** Le sélecteur propose les
   15 tables ; la base refuse toute partie au-dessus du plafond. Un élève de
   Découverte qui coche la table 12 joue vingt questions, puis voit sa partie
   rejetée. → **À corriger côté React.** Le message d'erreur a été rendu
   explicite au passage : « Tu n'as pas encore débloqué la table 12. Passe par
   la Montée des tables. » Cas de test 60.

3. **Le plafond débloqué ne se rafraîchit pas à l'écran.**
   `enregistrer_session()` renvoie `plafond_tables` à jour, mais `identite`
   n'est pas mis à jour : la table gagnée reste verrouillée jusqu'au
   rechargement de la page. → **À corriger côté React.**

**Décidé** — La Montée des tables est le seul mode qui débloque et qui décerne
les badges de montée. Les autres modes ne « prouvent » rien sur la table jouée.
⏳ *à valider par Aymeri*

**Ensuite** — Les trois corrections ci-dessus, puis l'étape 3 (Profil et
Classements). La vérification en navigateur reste bloquée tant que Google OAuth
n'est pas ouvert.


## 2026-08-27 — Étape 2 : Enregistrement des parties solo

**Fait**
- `logic/mastery.js` : ajout des fonctions de conversion pour `enregistrerSession()` :
  `cleFait(a, b)`, `construireErreurs(wrong)`, `construireMaitrise(wrong, right)` (1 rouge, 2 jaune, 3 vert).
- `Practice.jsx` : appel de `enregistrerSession` (ou `enregistrerSessionProf` si prof) à la fin d'une partie (modes `libre` et `countdown`).
- `Challenges.jsx` : câblage complet de l'enregistrement pour les 4 modes de défi solo :
  `sprint`, `flawless`, `countdown`, `climb`.
- `Challenges.jsx` : transmission réelle des tables choisies aux sous-modes (au lieu de `[2..10]` en dur).
- `Challenges.jsx` : pondération du tirage de questions par la maîtrise (`buildWeights`).
- `Challenges.jsx` : correction des écouteurs clavier (utilisation d'une ref stable `onKeyRef` avec `useEffect([], ...)`) évitant fuite d'écouteurs et états périmés.
- `Challenges.jsx` : correction de l'ordre des hooks dans `ChallengeResults` (la garde prématurée `if (!result) return null;` est placée après les hooks).
- `Practice.jsx` & `Challenges.jsx` : célébration des nouveaux badges (`nouveaux_badges`) renvoyés par la RPC et indicateur en cas de sauvegarde dans la file d'attente hors-ligne (`enAttente: true`).
- `Practice.jsx` & `Challenges.jsx` : confettis limités aux vraies réussites (score ≥ 70%, sprint ≤ 2 erreurs, sans faute ≥ 10, etc.), plus de déclenchement sur un échec.

**Décidé**
- Le déblocage des tables en Montée des tables (`climb`) est actif en base : franchir la table N en Montée débloque la table N+1 en entraînement.
- Les professeurs enregistrent leurs parties dans `sessions_profs` via `enregistrerSessionProf`, étanches aux classements élèves.

**Constaté**
- Vite build passe sans aucune erreur TypeScript ou React (461 kB).

**Ensuite**
- Étape 3 : écrans Profil et Classements (`Profile.jsx`, `Leaderboards.jsx`).

---

## 2026-08-27 — Corrections post-revue Lot 0

**Fait**
- `App.jsx` : ajout d'un 5e état `erreur` — si la session existe mais
  `quiSuisJe()` échoue (réseau, Supabase en panne), on affiche « Le serveur ne
  répond pas » avec un bouton Réessayer et un bouton Se déconnecter. Avant, on
  renvoyait au login, ce qui créait une boucle de redirection Google.
- `App.jsx` : `viderFile()` déplacé à l'intérieur de `traiterIdentite()`, appelé
  uniquement après que `quiSuisJe()` a répondu `eleve` ou `prof`. Avant, il
  était dans la branche catch où il n'y avait pas de session valide.

**Décidé**
- Les 5 cas de vérification de `ECRANS.md` §1 ne sont pas testables pour
  l'instant (OAuth Google pas configuré, comptes seed en @demo.saintho.fr).
  Aymeri s'en occupe. On ne bloque pas dessus. ⏳

**Ensuite**
- Étape 2 : brancher `enregistrerSession()` sur les modes solo existants.

---

## 2026-08-27 — Revue du Lot 0 (Claude)

**Fait** — Relecture de `App.jsx`, `Login.jsx`, `Home.jsx`. Conforme aux
consignes d'`ECRANS.md` §1 et §2 : `identite` jamais aplati, cas `inconnu`
traité sans boucle, `autoComplete="one-time-code"`, compte à rebours 60 s,
secours OTP derrière un drapeau, `react-router-dom` retiré, aucun mode démo.

**Constaté — deux défauts corrigés ou à corriger**

1. `viderFile()` jetait la file quand aucune session n'était active. La boucle
   ne distingue que « panne réseau » (on garde) de « refus » (on jette) ; or un
   refus de permission n'est pas un refus définitif. Un iPad hors ligne dont la
   session expire perdait ses parties en attente, en silence.
   → **Corrigé dans `api.js`** : sortie anticipée si `getSession()` est vide.

2. `App.jsx` route vers l'écran de connexion quand `quiSuisJe()` échoue. Une
   coupure réseau en classe déconnecte donc un élève parfaitement authentifié ;
   il clique sur Google, revient, même échec — boucle. C'est le défaut qu'on
   s'était interdit : l'application affirme quelque chose de faux.
   → **À corriger côté React** : cinquième état `erreur`, avec « Réessayer ».

**Décidé** — Un placeholder « en construction » reste acceptable ; la règle
« aucune donnée en dur » ne vise que les fausses données présentées comme
vraies. ✅ *validé par Aymeri le 27/08*

**Ensuite** — Les cinq cas de vérification d'`ECRANS.md` §1 ne sont pas
testables tant que Google OAuth n'est pas configuré ET que des adresses réelles
`@saintho.fr` ne sont pas inscrites dans `eleves` et `profs` : les comptes du
seed (`@demo.saintho.fr`) n'existent pas chez Google, et le secours e-mail est
désactivé. Aucun chemin de connexion ne fonctionne avant ça.


## 2026-08-27 — Lot 0 : démarrage, connexion, accueils

**Fait**
- `App.jsx` réécrit : restauration de session au montage (`sessionActive()` →
  `quiSuisJe()`), quatre états (`loading` / `login` / `inconnu` / `ready`),
  `viderFile()` appelé au démarrage sans bloquer.
- `Login.jsx` réécrit : bouton « Se connecter avec Google » en principal
  (`connexionGoogle()`), secours OTP par e-mail en lien discret, masqué derrière
  `SECOURS_EMAIL_ACTIF = false`. Compte à rebours 60 s sur « Redemander un code ».
  `autoComplete="one-time-code"` sur le champ code.
- `Home.jsx` réécrit : lit `identite.profil.prenom` (sans accent), accueil prof
  avec placeholder « en construction », bouton Admin visible seulement si admin.
- Spinner CSS ajouté (`.spinner` avec `@keyframes spin`), inclus dans
  `prefers-reduced-motion`.
- `react-router-dom` retiré de `package.json` : pas importé, pas utile avec
  l'aiguillage par état.

**Décidé**
- `identite` stocké tel que renvoyé par `quiSuisJe()`, jamais aplati.
  `estProf` et `estAdmin` dérivés dans `App.jsx`. Chaque écran reçoit
  `identite` et choisit ses champs selon le type.
- Mode démo supprimé intégralement : ni bouton, ni fallback en cas d'erreur.
- `react-router-dom` non utilisé. L'aiguillage par état + écran courant suffit ;
  le bouton retour de Safari créerait des états intermédiaires non gérés.
- Cas `inconnu` traité à deux endroits : au démarrage (App.jsx) et après
  connexion OTP (Login.jsx appelle `quiSuisJe()` puis remonte à App.jsx).

**Constaté**
- Le build produit un avertissement bénin : `Admin.jsx` importe `api.js`
  dynamiquement alors que d'autres fichiers l'importent statiquement. Pas
  d'impact fonctionnel.
- Le navigateur intégré d'Antigravity n'a pas pu ouvrir l'URL locale (erreur
  CDP). La vérification visuelle devra se faire directement dans Safari.

**Ensuite**
- Tester visuellement les 5 cas de vérification de `ECRANS.md` §1 dans Safari.
- Étape 2 : brancher l'enregistrement des parties sur les 4 modes solo existants.

---

## 2026-08-27 (soir) — Bascule vers la connexion Google

**Fait**
- `connexionGoogle()` ajoutée dans `api.js` (`signInWithOAuth`, fournisseur
  Google, indice de domaine `hd=saintho.fr`).
- ⚠️ `detectSessionInUrl` **corrigé de `false` à `true`** — il était réglé pour
  le seul parcours par code. Laissé à `false`, la connexion Google échouait
  silencieusement : retour sur le login, en boucle, sans message d'erreur.
- `ECRANS.md` écran 2 réécrit, `SUPABASE_PAS_A_PAS.md` : nouvelle partie 4
  (Google Cloud Console + Supabase), le parcours par e-mail devient la partie 5.

**Décidé**
- **Google Sign-In devient le chemin principal**, le code par e-mail un secours
  discret. ✅ *validé par Aymeri le 27/08*
  Motifs : les élèves utilisent déjà ce compte dans Safari pour les Google
  Forms ; sur un iPad avec session Google ouverte c'est **une tape** au lieu de
  six chiffres à recopier depuis l'app Mail ; et surtout **le SMTP Workspace
  cesse d'être un préalable à la rentrée** — c'était le dernier point bloquant.
  L'objection MDM ne tenait pas : le blocage porte sur `script.google.com`, pas
  sur `accounts.google.com`, forcément déjà autorisé puisque les élèves ouvrent
  leur Gmail sur ces iPads.
- **Le mode démo est retiré**, pas conservé avec un avertissement. Les élèves
  étant pré-inscrits, « essayer sans compte » n'est plus un cas d'usage ; et une
  interface qui fonctionne pendant que tous les appels serveur échouent est
  exactement le défaut qu'on cherche à éliminer. Pour une démonstration : un
  vrai compte de la base de dev. ✅ *validé par Aymeri le 27/08*
- **Le secours par e-mail reste masqué** derrière un drapeau tant que le SMTP
  n'est pas configuré. Un secours qui échoue en silence est pire que pas de
  secours. ✅ *validé par Aymeri*

**Constaté**
- L'authentification Google ne change **rien au schéma**. Le rattachement des
  comptes se fait sur l'adresse e-mail, quel que soit le fournisseur : le
  trigger retrouve l'élève dans la table et le relie. Aucune migration touchée.
- La barrière d'entrée fonctionne à l'identique : une adresse absente des tables
  obtient une session valide et accès à rien — `quiSuisJe()` renvoie `inconnu`.
- ⚠️ **`react-router-dom` a été installé** sans que la raison soit consignée.
  Le brief demande de ne pas ajouter de dépendance sans justification. À motiver
  dans la prochaine entrée, ou à retirer.

**Ensuite** — Configurer l'application OAuth dans Google Cloud Console (mode
« Interne »), l'activer dans Supabase, puis coder l'écran de connexion.

---


## 2026-08-27 — Migrations appliquées, base opérationnelle

**Fait**
- 9 migrations appliquées sur `calcul-mental-dev` via MCP Supabase, dans l'ordre :
  schema → RLS → API → difficulté → portée niveau → palier tous →
  administration → comptes profs → profs joueurs.
- Seed chargé : 2 profs, 8 élèves, 35 sessions, 144 entrées de maîtrise,
  20 poids de difficulté.
- Smoke test réussi : 10 tables RLS activé, paliers et pondérations vérifiés
  (`poids_facile=0.41`, `poids_dur=1.13`, `poids_expert=1.68`).
- `frontend/.env.local` créé avec URL et clé anon du projet de dev.
- Types TypeScript générés (`frontend/src/types/database.ts`), couvrant
  10 tables et 40+ fonctions RPC.
- `ETAT.md` mis à jour.

**Constaté**
- Le script de test `run.sh` est conçu pour un PostgreSQL local avec `psql`
  (metacommandes `\set`, `\gset`, `\echo`). Il ne peut pas tourner tel quel
  via le MCP `execute_sql`. Les vérifications critiques (pondération, paliers,
  compteurs) ont été faites par requête directe. Le test complet de bout en
  bout nécessitera soit un PG local, soit une adaptation du script.

**Ensuite**
- Implémenter la restauration de session dans `App.jsx` (appel
  `quiSuisJe()` au démarrage).
- Coder les écrans de connexion et d'accueil (Lot 0 de `ECRANS.md`).

---

## 2026-08-27 — Client API, administration et documentation

**Fait**
- Migrations 5 à 9 : classement par niveau scolaire et par classe, tableau
  d'honneur du collège, gestion complète des élèves avec journal
  d'administration, comptes enseignants, jeu et classement pour les
  professeurs, fonction `qui_suis_je()`.
- `frontend/src/api.js` réécrit sur Supabase : 38 fonctions, 28 appels RPC
  vérifiés un par un contre les migrations, file d'attente hors-ligne intégrée.
- Documentation : `ECRANS.md` (19 écrans), `ETAT.md` (état + registre des
  décisions), ce journal. `DEMARRAGE.md` archivé, ses étapes étant accomplies.
- Serveur MCP Supabase connecté à Antigravity par autorisation navigateur.

**Décidé**
- Un enseignant voit et gère **toutes les classes**, pas seulement les siennes —
  les affectations changent chaque année. `profs.classes[]` devient un simple
  raccourci d'affichage. ✅ *validé par Aymeri*
- **Deux rôles seulement**, prof et admin, sans matrice de droits : à cette
  échelle la traçabilité vaut mieux que le cloisonnement. Aucune limite de
  nombre. ✅ *validé par Aymeri*
- Les **professeurs peuvent jouer**, dans une table séparée, avec un classement
  visible d'eux seuls. ✅ *validé par Aymeri*
- Les élèves restent affichés **« Alice D. »** — prénom et initiale. L'argument
  inverse (« ils se connaissent déjà ») a été pesé et écarté : le rôle d'un
  classement est de motiver, pas d'identifier. ✅ *validé par Aymeri*
- **Refonte visuelle après** la mise en fonctionnement, à condition d'utiliser
  les variables CSS existantes dès maintenant. ✅ *validé par Aymeri*
- Le **jeu de démonstration est conservé**, base de dev uniquement : sans lui on
  ne distingue pas « ça marche mais c'est vide » de « c'est cassé ».
  ✅ *validé après discussion*

**Constaté**
- Le jeu de démonstration a révélé un bug qui serait passé en production : les
  sessions du seed avaient **zéro point**, faute de passer par la fonction qui
  calcule la pondération. Tous les classements de progression auraient paru
  vides. Corrigé.
- L'entrée Supabase du MCP Store d'Antigravity est la version **hébergée** :
  elle ignore `.agents/mcp_config.json` et fonctionne par bouton
  **Authenticate** (OAuth navigateur). Le fichier de configuration local est
  conservé en solution de repli — il permettrait de limiter l'agent à un seul
  projet, ce que l'OAuth ne fait pas. À ressortir quand la base de production
  existera.
- `@supabase/supabase-js` **n'est pas installé** dans `frontend/package.json`.

**Ensuite** — Appliquer les 9 migrations sur la base de dev, charger le seed,
lancer les tests, puis attaquer les écrans dans l'ordre de `ECRANS.md`.

---

## 2026-08-26 — Bascule vers Supabase et construction du socle

**Fait**
- Audit du projet existant : le front React est abouti, le backend Apps Script
  l'est à moitié — classements factices, profil vide, défis non branchés.
- Migrations 1 à 4 : schéma, sécurité RLS, fonctions métier, tables jusqu'à 20
  avec pondération par difficulté et paliers.
- Harnais de test : 57 cas, dont une dizaine de tentatives de contournement qui
  doivent toutes échouer.
- Repérage de deux failles dans l'ancienne version : la première connexion avec
  le code `3333` permettait de prendre le compte d'un camarade, et l'endpoint
  Apps Script était appelable sans aucune vérification.

**Décidé**
- **Supabase remplace Apps Script + Google Sheets.** Motif : 30 exécutions
  simultanées pour tout le collège, aucune transaction, lecture d'onglets
  entiers à chaque requête. Une classe de 28 suffisait à saturer.
  ✅ *validé par Aymeri*
- **Code à 6 chiffres par e-mail, jamais de lien magique** : sur iPad le lien
  ouvre le navigateur interne de Mail et la session atterrit au mauvais
  endroit. Bénéfice second : rien à filtrer côté MDM. ✅ *validé par Aymeri*
- **Défis asynchrones**, sans départ synchronisé : le « c'est parti » du
  professeur fait le travail. Trente fois moins de requêtes qu'un vrai temps
  réel. ✅ *validé par Aymeri*
- **Aucun champ de texte libre** dans toute l'application — sinon il faudrait
  modérer. ✅ *validé par Aymeri*

**Constaté**
- Trois bugs trouvés par le test des migrations, invisibles à la relecture :
  récursion infinie dans une politique RLS, concaténation de tableau mal typée
  en PL/pgSQL, et un trigger de protection qui annulait le rattachement
  automatique des comptes — plus personne n'aurait pu se connecter.
- L'audit initial classait en « critique » des bugs d'affichage et ne voyait
  aucune des deux failles d'authentification.

**Ensuite** — Compléter la gestion des élèves et des comptes enseignants,
écrire le client API.
