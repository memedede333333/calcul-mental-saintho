# Les écrans, un par un

> Pour Antigravity. Complément du `ANTIGRAVITY_BRIEF.md`, à lire après lui.
> Les maquettes visuelles sont dans `docs/ecrans-et-defis.html`.

---

## Comment lire ce document

Ces consignes décrivent **l'intention**, pas les pixels. Elles disent ce que
l'écran doit permettre, ce qu'il doit appeler, et quels états il ne doit pas
oublier.

**Tu peux ajuster.** Si tu vois une meilleure façon de faire, propose-la et
explique pourquoi — en une ou deux phrases, avant de coder. Tu es celui qui voit
le résultat à l'écran ; ce document a été écrit sans jamais l'avoir vu tourner.

En revanche, deux catégories ne s'ajustent pas sans validation explicite :

- Ce qui est marqué **⚠️ NON NÉGOCIABLE** — sécurité, données de mineurs,
  ou décision pédagogique déjà tranchée après discussion
- Les appels serveur : les fonctions existent, elles sont testées. Si l'une te
  paraît manquer, **signale-le, ne la contourne pas** en écrivant dans les
  tables.

---

## Règles valables sur tous les écrans

### Les couleurs viennent des variables existantes

Une refonte visuelle est prévue **après** la mise en fonctionnement. Elle sera
indolore si tu utilises `var(--navy)`, `var(--gold)`, `var(--mint)`,
`var(--coral)`, `var(--sky)`, `var(--surface)`, `var(--border)` — et douloureuse
si tu écris `#C9A227` en dur.

Même chose pour les classes existantes : `.card`, `.btn`, `.chip`, `.pill`,
`.mode-card`, `.stat`, `.progress-bar`, `.anim-pop`, `.anim-shake`. Réutilise
avant d'inventer.

### Trois états à ne jamais oublier

Chaque écran qui charge des données en a **trois**, pas un :

| État | Ce qu'il faut afficher |
|---|---|
| **Chargement** | Un indicateur. Pas un écran blanc. |
| **Vide** | Une phrase qui explique. « Personne n'a encore joué cette semaine — sois le premier ! » et non un tableau vide. |
| **Erreur** | Le message renvoyé par le serveur, tel quel. Il est écrit en français, pour être lu par un élève. |

L'écran vide est celui qu'on oublie, et c'est celui que verront les premiers
utilisateurs le jour de la mise en service : la base sera vierge.

### Interface tactile, élèves de 11 à 15 ans

Zones de frappe d'au moins 44 pixels. Pas de survol comme seule indication.
Le texte des messages d'erreur doit être compréhensible par un 6ᵉ : « Ce code
n'existe pas. Vérifie les lettres. » et non « Erreur 404 ».

### ⚠️ NON NÉGOCIABLE — aucun champ de texte libre

Nulle part. Pas de nom de défi, pas de message, pas de pseudo, pas de commentaire.
Un défi est identifié par son code. Les avatars sont une liste fermée d'emojis.

Dès qu'on laisse des collégiens écrire du texte que d'autres verront, il faut
modérer — et personne au collège n'aura le temps de le faire.

---

# CÔTÉ ÉLÈVE

## 1. Démarrage de l'application

**Le premier écran n'est pas le login.** C'est un écran de chargement, le temps
de savoir si une session existe déjà.

```
sessionActive()  →  faux : écran de connexion
                 →  vrai : quiSuisJe()  →  'eleve'   : accueil élève
                                        →  'prof'    : accueil prof
                                        →  'inconnu' : écran « compte non reconnu »
```

Appelle aussi `viderFile()` à ce moment : s'il reste des parties en attente
d'une session précédente, elles partent maintenant.

**⚠️ Le cas `inconnu`** : un compte a été créé mais l'adresse n'est ni dans
`eleves` ni dans `profs`. C'est la barrière d'entrée qui fonctionne, pas un bug.
Affiche le message renvoyé (« Ce compte n'est pas reconnu. Demande à ton
professeur. ») avec un bouton de déconnexion. **Ne renvoie pas au login en
boucle** — l'élève retaperait son adresse indéfiniment.

**Pourquoi c'est important** : aujourd'hui, l'app oublie l'élève à chaque
rechargement. Sur iPad, Safari décharge les onglets en arrière-plan. En classe,
ça veut dire des reconnexions toutes les dix minutes.

### ⚠️ `quiSuisJe()` ne renvoie pas la même forme selon le type

C'est la source d'erreur la plus probable de tout le Lot 0.

```js
// élève
{ type: 'eleve',
  profil: { id, prenom, nom, classe, avatar_emoji,
            plafond_tables, tables_autorisees } }

// prof
{ type: 'prof', admin: true|false,
  profil: { id, nom, email, role, classes } }
//                  ↑ pas de prenom, pas de classe, pas d'avatar

// inconnu
{ type: 'inconnu', message: "..." }
//                  ↑ pas de profil du tout
```

**N'aplatis pas ces trois formes en un seul objet `user`.** Un écran qui lit
`user.prenom` planterait pour un professeur, et `user.profil.quoi-que-ce-soit`
planterait pour un compte inconnu.

Garde la réponse telle quelle et dérive depuis elle :

```js
const [identite, setIdentite] = useState(null);
const estProf  = identite?.type === 'prof';
const estAdmin = identite?.admin === true;
```

Chaque écran reçoit `identite` et choisit ses champs selon le type.

*(Au passage : le champ s'écrit `prenom`, sans accent. L'ancien code utilisait
`prénom` — c'est un vrai bug, pas une coquette.)*

### Un placeholder honnête n'est pas une donnée en dur

Un écran « Accueil enseignant — en construction » est parfaitement acceptable :
il ne simule rien, il annonce ce qu'il est. La règle « aucune donnée en dur »
vise les **fausses données qui se font passer pour vraies** — de faux
classements, des records inventés — pas les écrans assumés comme inachevés.

### Ce qu'il faut vérifier avant de dire que c'est fini

- Démarrage **sans session** → écran de connexion
- Connexion **élève** (`alice.dupont@demo.saintho.fr` du seed) → accueil élève
- Connexion **professeur** (`prof.demo@demo.saintho.fr`) → l'accueil **ne
  plante pas**, et le bouton Administration apparaît (ce compte est `admin`)
- **Adresse non pré-inscrite** → écran « compte non reconnu », et le bouton de
  déconnexion fonctionne réellement
- **Rechargement de page** → la session est restaurée, on ne revient pas au
  login

## 2. Connexion

**Un bouton principal, un lien de secours.**

### Le bouton — « Se connecter avec Google »

En grand, au centre. Appelle `connexionGoogle()`.

Cette fonction **ne renvoie pas un utilisateur connecté** : elle redirige le
navigateur vers Google. La session est récupérée au retour, et c'est le
démarrage de l'application (écran 1) qui constate la connexion. Ne cherche pas
à enchaîner sur `quiSuisJe()` juste après l'appel : la page aura changé.

Les élèves utilisent déjà ce compte dans Safari pour les Google Forms. Sur un
iPad où la session Google est ouverte, c'est une tape.

### Le lien de secours — masqué par défaut

Sous le bouton, discret : « Je n'arrive pas à me connecter avec Google ».
Il ouvre le parcours en deux étapes :

**Étape 1** — un champ e-mail, bouton « Recevoir mon code » → `demanderCode(email)`
**Étape 2** — « Un code à 6 chiffres a été envoyé à … » → `verifierCode(email, code)`

Sur le champ du code :
- `inputMode="numeric"`, `maxLength={6}`
- **`autoComplete="one-time-code"`** — sur iPad, Safari propose alors le code
  directement au-dessus du clavier. L'élève tape une fois au lieu de six.

Le lien « Je n'ai rien reçu » doit être **désactivé pendant 60 secondes**, avec
un compte à rebours visible : Supabase refuse une seconde demande avant une
minute. Un élève qui clique et reçoit une erreur pense que c'est cassé.

⚠️ **Ce secours ne fonctionne que si le SMTP Workspace est configuré**, ce qui
n'est pas encore le cas. **Garde-le derrière un drapeau désactivable** (une
constante en haut du fichier suffit) : un secours qui échoue silencieusement est
pire que pas de secours.

### Après une connexion réussie, quel que soit le chemin

Appelle `quiSuisJe()`. ⚠️ **Traite le cas `inconnu` ici aussi**, pas seulement
au démarrage : c'est juste après une première connexion réussie qu'il se produit
le plus souvent — une adresse absente de la table `eleves`. Route vers le même
écran « compte non reconnu », avec un bouton de déconnexion.

### Supprimé

- Le code PIN à 4 chiffres et le « première connexion 3333 »
- Le repli en mode démo sur erreur serveur — **c'était le défaut le plus
  dangereux** : une panne se transformait en connexion réussie avec de fausses
  données
- Le mode démo tout court : les élèves étant pré-inscrits, « essayer sans
  compte » n'est plus un cas d'usage. Pour une démonstration, on utilise un vrai
  compte de la base de dev.

## 3. Accueil élève

Cinq destinations : Apprendre · S'entraîner · Défis · Classements · Profil.
Voir les maquettes.

En-tête : prénom, classe, avatar.
Si `partiesEnAttente() > 0`, un bandeau discret : « 2 résultats en attente
d'envoi ». Discret — pas une alerte rouge, ce n'est pas grave.

## 4. Sélecteur de tables

L'écran le plus travaillé de la partie élève, parce qu'il conditionne la
qualité de l'entraînement.

**Trois raccourcis en haut**, qui seront plus utilisés que les cases :

- **Mes tables faibles** → `mesTablesFaibles()`, qui lit la grille de maîtrise
  et renvoie les 4 tables les plus ratées
- **Toutes mes tables** → tout jusqu'au plafond
- **Les classiques** → 1 à 10

**Puis les cases, regroupées** — vingt cases en vrac sur un iPad, c'est illisible :

```
Les faciles      1  2  5  10
Le cœur          3  4  6  7  8  9
Au-delà de 10    11  12
Les grandes 🔒   13 … 20     (grisées au-dessus du plafond)
```

Le plafond vient de `quiSuisJe().profil.plafond_tables`. Au-dessus, les cases
sont grisées avec « Débloque-les en Montée des tables ».

**Affiche la valeur en points de la sélection** (« ×2,4 »). L'élève comprend
vite que travailler dur rapporte plus — c'est exactement le comportement
recherché. La difficulté de chaque table est lisible dans
`difficulte_operande`.

**⚠️ Décision pédagogique tranchée** : ne propose jamais de sélection vide, et
ne présélectionne pas les tables faciles par défaut. Le défaut, c'est « mes
tables faibles ».

## 5. Écran de jeu

Il existe et il fonctionne. Trois corrections :

- **Les tables choisies doivent arriver jusqu'ici.** Aujourd'hui
  `ChallengeConfig` laisse choisir puis `SprintPlay` utilise `[2..10]` en dur.
- **Pondérer le tirage par la maîtrise.** `Challenges.jsx` importe déjà
  `buildWeights` depuis `logic/mastery.js` et ne s'en sert jamais. Un fait
  « rouge » doit revenir bien plus souvent qu'un fait « vert ». **C'est le
  meilleur rapport valeur/effort de tout le projet.**
- **Corriger les écouteurs clavier** : quatre `useEffect` sans tableau de
  dépendances réattachent les écouteurs à chaque rendu.
  ⚠️ N'ajoute pas simplement `[]` — les fonctions capturent l'état courant et
  un tableau vide figerait des valeurs périmées. Utilise une ref sur le
  gestionnaire.

## 6. Fin de partie

Appelle `enregistrerSession({...})` avec, en plus du score, l'objet `maitrise` :
`{"7_8": 1, "6_9": 3}` — 1 rouge, 2 jaune, 3 vert. C'est lui qui alimente la
grille et la pondération. Sans lui, tout le moteur pédagogique reste inerte.

Le retour contient `nouveaux_badges` : à célébrer, c'est le moment.

**⚠️ Confettis uniquement en cas de réussite.** Aujourd'hui ils se déclenchent
même quand un élève échoue après deux bonnes réponses. C'est vexant.

Si `enregistrerSession` renvoie `enAttente: true`, le réseau est coupé : la
partie est sauvegardée localement et repartira toute seule. Dis-le calmement,
ne bloque pas l'écran.

**⚠️ Bug de hooks à corriger** : `ChallengeResults` fait `if (!result) return
null;` **avant** son `useEffect`. Déplace la garde après tous les hooks.

## 7. Défis — accueil

Deux zones :

**Rejoindre** — le champ code à 5 lettres. Il existe déjà mais **le bouton n'a
aucune action attachée**. Branche-le sur `rejoindreDefi(code)`.

⚠️ Trois refus distincts, à traiter séparément :

| `raison` | Message | Suite |
|---|---|---|
| `inconnu` | « Ce code n'existe pas. Vérifie les lettres. » | rester sur le champ |
| `ferme` | « Ce défi est terminé. » | proposer autre chose |
| `deja_joue` | « Tu as déjà participé. » | **proposer de voir le classement** |

Un message unique laisserait l'élève bloqué sans savoir s'il doit retaper ou
passer à autre chose.

**Les cinq modes.** ⚠️ Seuls **Sprint** et **Contre-la-montre** sont proposables
en défi à code — Sans faute et Montée produisent des écarts de durée trop grands
pour un usage simultané. Le serveur refuse les autres de toute façon.

Aujourd'hui, le mode « Défi de classe » **retombe silencieusement sur un Sprint
solo** : l'élève croit jouer contre sa classe et joue seul. C'est le bug le plus
trompeur du projet.

## 8. Défi — le classement qui se remplit

L'écran manquant, et le plus satisfaisant à construire.

Après `terminerDefi()`, affiche `classementDefi(defiId)` et abonne-toi avec
`suivreDefi(defiId, callback)`. Ajoute `avancementDefi()` pour le compteur
« 18 / 27 ont terminé ».

L'élève voit son rang, puis les autres arriver. Comme toute la classe démarre
en même temps — le professeur a dit « c'est parti » — l'effet ressenti est celui
d'un direct, **sans qu'aucun mécanisme temps réel n'ait été construit**.

N'oublie pas de te désabonner en quittant l'écran : `suivreDefi` renvoie la
fonction pour ça.

## 9. Classements

Deux onglets, trois filtres.

**Progression** (par défaut) → `classementProgression()`
**Records** → `classementRecords()` — catégories : série · chrono · sprint · montée

| Filtre | Valeurs | Défaut |
|---|---|---|
| Période | semaine · mois · année · toujours | semaine |
| Portée | ma classe · mon niveau (tous les 6ᵉ) · le collège | **ma classe** |
| Palier | Découverte · Confirmé · Expert · tous | celui de l'élève |

**⚠️ « Ma classe » par défaut** : la comparaison de proximité motive,
l'exposition à l'échelle du collège écrase.

**⚠️ Le palier `tous`** est un **tableau d'honneur** — « les records du
collège » — à présenter comme une vitrine, jamais comme classement par défaut.
Sinon les mêmes sont toujours en tête et les plus fragiles toujours en bas.

Il existe aussi `classementClasses()` : 6ᵉA contre 6ᵉB, en moyenne par élève.
À cet âge l'émulation collective fonctionne souvent mieux que l'exposition
individuelle — mets-le en avant.

**⚠️ Les élèves sont affichés « Alice D. »** — prénom et initiale. Décision
prise après discussion : le rôle d'un classement est de motiver, pas
d'identifier. Le serveur ne renvoie de toute façon rien d'autre.

## 10. Profil

`monProfil()` en un seul appel : profil, records, grille de maîtrise, badges.
Supprime toutes les données en dur.

La grille 15×15 est la pièce maîtresse. Sous elle, un bouton **« Réviser mes
cases rouges »** qui lance une partie sur `mesTablesFaibles()`. C'est le fil
rouge du projet : la grille n'est pas un tableau décoratif, elle pilote
l'entraînement.

Changement d'avatar via `changerAvatar(emoji)`, liste fermée.

---

# CÔTÉ PROFESSEUR

## 11. Accueil prof

**« Lancer un défi » en très gros**, en haut. C'est ce qui sera utilisé
plusieurs fois par semaine ; ça doit être à **deux tapes** de l'accueil, jamais
enfoui dans un menu.

En dessous : « Ma classe », « Jouer » (les mêmes modes que les élèves), et
« Administration » **uniquement si** `quiSuisJe().admin` est vrai.

Plus la liste des défis récents avec leur taux de participation.

## 12. Mode classe — créer un défi

Trois choix : le mode (Sprint ou Contre-la-montre), les tables, la classe.
Puis `creerDefi()`.

Le sélecteur de classe vient de `listeClasses()` — les favorites en premier.
⚠️ **Un enseignant voit toutes les classes**, pas seulement les siennes. Les
favorites sont un raccourci d'affichage, pas une restriction.

## 13. Le code projeté

Un écran plein, fond navy, **le code en très grand** — lisible depuis le fond de
la salle. En dessous, « Saisissez ce code dans Défis », et le compteur de
participants qui monte.

C'est l'écran qu'on projette au vidéoprojecteur. Pense-le pour être vu à cinq
mètres, pas tenu dans la main.

## 14. Classement en direct

`classementDefi()` + `suivreDefi()` + `avancementDefi()`.
Bouton « Clore le défi ».

C'est le même écran que celui de l'élève, en version projetable. Mutualise si
tu peux.

## 15. Ma classe — la maîtrise agrégée

**⚠️ L'écran qui décide de l'adoption par tes collègues.** Soigne-le.

`maitriseClasse(classe)` renvoie, par table, le nombre d'élèves en vert, jaune,
rouge, et le taux de maîtrise. Affiche-le en barres horizontales, trié pour que
**ce qui coince saute aux yeux**.

Et surtout : un bouton **« Lancer un défi sur les tables 7 et 8 »** juste en
dessous, pré-rempli avec les tables les plus faibles.

Un professeur de mathématiques qui lit « 18 élèves sur 27 bloquent sur la table
de 7 » puis lance un défi ciblé **en une tape** a une raison concrète de rouvrir
l'outil la semaine suivante. Sans lui, l'application reste un jeu que les élèves
font chez eux — ou pas.

## 16. Le classement de la salle des profs

`classementProfs()`. **⚠️ Invisible pour les élèves** — le serveur ne renvoie
rien à un compte élève, mais ne mets pas non plus d'entrée de menu visible côté
élève.

Nom complet ici : entre adultes qui se connaissent, « M. D. » n'aurait pas de
sens.

Quand un prof joue, appelle `enregistrerSessionProf()` et non
`enregistrerSession()`. Même écran de jeu, seule la fonction d'enregistrement
change, selon ce qu'a répondu `quiSuisJe()`.

---

# ADMINISTRATION

Réservée aux comptes `admin`. Utilisée deux fois par an — sois fonctionnel,
pas spectaculaire.

## 17. Élèves

Liste avec recherche et filtre par classe. Pour chaque élève : nom, classe,
plafond, s'il s'est déjà connecté.

**Actions** : ajouter (`ajouterEleve`), corriger (`modifierEleve`), désactiver
(`desactiverEleve`, avec motif), réactiver (`reactiverEleve`).

**⚠️ Aucun bouton « Supprimer ».** Seulement « Désactiver ». Supprimer
effacerait les sessions en cascade : les classements de la classe changeraient
rétroactivement et les défis deviendraient incohérents.

**Import CSV** (`importerEleves`) — colonnes email, nom, prénom, classe.

⚠️ Le retour contient **deux listes à afficher, ne les avale pas** :
`lignes_ignorees` (lignes invalides, avec la raison) et
`actifs_absents_du_fichier`.

L'import ne désactive jamais personne. Affiche les absents et laisse
l'administrateur décider **au cas par cas**. Ne propose pas de désactivation en
masse en un clic : un export raté couperait l'accès à tout un niveau un lundi
matin.

**Suivi de rentrée** : `elevesSansConnexion()`, avec un bouton pour renvoyer un
code. C'est la question des deux premières semaines.

**Plafond par classe** : `definirPlafondClasse(classe, n)`. Une action pour
toute la classe.

## 18. Comptes enseignants

`listeProfs`, `creerProf`, `modifierProf`, `desactiverProf`.
Deux rôles : prof et admin. Aucune limite de nombre.

⚠️ Le serveur **refuse de retirer le dernier administrateur actif** —
rétrogradation comme désactivation. Relaie son message tel quel : il explique
quoi faire.

## 19. Journal

`journalAdmin()` — qui a fait quoi, quand. Une liste chronologique suffit.

Avec plusieurs enseignants ayant les droits, il faut pouvoir répondre à « qui a
désactivé cet élève ? ».

---

# Ordre de construction suggéré

1. **Démarrage + connexion + accueils** — sans ça, rien n'est testable
2. **Enregistrement des parties** — débloque d'un coup profil, records, badges,
   classements ; les quatre modes existent déjà
3. **Profil et classements** — beaucoup de valeur, peu d'effort, tout est prêt
4. **Défis à code** — le cœur de l'usage en classe
5. **Ma classe** — l'écran qui décide de l'adoption
6. **Administration** — indispensable mais peu utilisé
7. **Finitions** — hors-ligne, confettis, hooks

Après chaque étape, dis ce que tu as fait et ce que tu constates. Ne les
enchaîne pas sans t'arrêter.

---

# Ce qui vient après

Une **refonte visuelle** est prévue une fois l'application fonctionnelle et
testée. Elle sera indolore si tu as utilisé les variables CSS existantes, et
douloureuse sinon. C'est la seule contrainte de style qui compte vraiment.
