# Journal du projet

> **Ce fichier ne se réécrit jamais.** On y ajoute, en haut, à chaque étape
> franchie. `ETAT.md` est la photo du moment ; celui-ci est la mémoire.

---

## Comment écrire une entrée

À la fin de chaque étape — pas à la fin de chaque fichier modifié — ajoute une
entrée **en haut** de la section « Entrées », sur ce modèle :

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

# Entrées

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
