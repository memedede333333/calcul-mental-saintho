# matHo — les écrans 11 à 14

Les quatre nouveaux écrans sont bons, et deux d'entre eux changent le produit,
pas seulement son aspect.

L'accueil qui dit d'abord **où en est l'élève**, puis lui propose **une action
du jour** avant de le laisser choisir : c'est mieux qu'un mur de quatre modes à
égalité. Un collégien de 11 ans devant quatre boutons identiques prend toujours
le même, ou aucun.

L'emplacement « Défi de classe » à **hauteur constante**, dont seuls le contenu
et la couleur changent, avec le champ de code visible en permanence parce que
c'est le geste que le professeur demande à voix haute : c'est juste, et la
raison que tu en donnes est meilleure que le dessin.

Et « des constats, jamais des compliments » — on la tient.

Ce message ne contient que des **faits vérifiés dans la base**, des **problèmes
constatés**, et des **questions**. Les décisions de conception sont les tiennes.

---

## 1. Ce que j'ai vérifié côté serveur

**Bonne nouvelle, tes chiffres existent.** J'avais un doute sur trois d'entre
eux, j'ai lu les fonctions :

- **« +6 cette semaine »** — `progression_detail` renvoie `cases_vertes` : le
  nombre de cases passées au vert depuis le début de la semaine. Servi par
  `mon_profil`. Rien à écrire.
- **« 41 cases vertes », « 19 cases rouges »** — la grille complète est envoyée
  dans le même appel. On compte dedans, ce n'est pas une population déduite.
- **« La Montée · palier 12 sur 15 »** — le plafond et le palier existent.

**Trois chiffres, en revanche, n'existent pas.**

- **« environ 4 minutes »** — aucune estimation de durée nulle part. Soit on
  l'enlève, soit il faut la calculer à partir de la vitesse moyenne de l'élève,
  ce qui est possible mais demande une migration. Ton choix, mais dis-le.
- **« sur 144 »** — 144, c'est 12 × 12. Un élève au plafond 15 a 225 cases, au
  plafond 20 il en a 400. Le dénominateur doit suivre son plafond.
- **« Reçu il y a 20 minutes »** — voir le point 3, c'est le vrai sujet.

**Et une erreur de fait :** l'écran de connexion dit « celle en
**@saint-honore.fr** ». Le domaine du collège est **@saintho.fr**. Un élève qui
lit ça cherchera une adresse qui n'existe pas.

---

## 2. Trois portes ont disparu de l'accueil

J'ai comparé ta maquette 12 à l'accueil actuel, ligne à ligne. Tous les modes
sont là — Sprint, Sans faute, Chrono, la Montée, Apprendre, Classements, le
code. Trois choses n'y sont plus.

**a) Défier un copain.** Un élève peut créer un défi : l'application lui donne
un code à cinq lettres et lui dit « Donne ce code à tes copains ». Le défi vit
24 heures. Ta maquette n'offre que « Rejoindre ». C'est une des rares choses de
l'application qui soit purement sociale, et à 12 ans c'est souvent ce qui fait
qu'on y revient.

**b) Se déconnecter.** C'est aujourd'hui dans l'écran Profil. Or ta maquette
rebaptise cette porte « Voir ma grille en grand › ». Les iPads sont partagés et
passent de main en main en classe : un élève qui veut se déconnecter ne
cliquera pas sur « voir ma grille ».

**c) Le profil lui-même.** Derrière cette porte il n'y a pas que la grille : il
y a aussi les badges et le choix de l'avatar. Étiquetée « grille », elle cache
les deux tiers de ce qu'elle contient.

**Où tu les remets, c'est toi qui vois.** Deux remarques factuelles pour
t'aider, et rien de plus :

- **Ces trois gestes sont rares.** On joue à chaque session ; on rejoint un défi
  souvent ; on crée un défi, on change d'avatar et on se déconnecte de temps en
  temps. Une fréquence basse peut justifier un deuxième écran — les deux écrans
  qui les contiennent existent déjà (`Profil` et `Défis`), il n'y a rien à
  construire, seulement à nommer.
- **Ce qui alourdit l'accueil n'est pas sa longueur, c'est le nombre de portes
  qui mènent à la même chose.** Un élève qui veut jouer en a aujourd'hui sept :
  l'action du jour, quatre modes, la Montée, le défi. Sept choix pour une seule
  intention.

Et un retour d'expérience, à prendre ou à laisser : **les fenêtres qui s'ouvrent
par-dessus l'écran se sont mal passées sur ce projet.** Sur iPad, un élève de
11 ans ne trouve pas toujours comment les refermer, et le clavier iOS s'y
comporte mal. On a déjà écarté les modales pour les célébrations. Si tu as
besoin d'un second niveau, un écran plein avec un « ‹ Retour » toujours au même
endroit a mieux marché ici.

---

## 3. L'état 2 du bloc défi — une décision de produit, pas de dessin

« Un défi t'attend — code déjà rempli, l'élève n'a plus qu'à partir. »

**Ça n'existe pas aujourd'hui.** Un élève ne reçoit rien : il tape un code que
le professeur annonce à voix haute. Pour que l'application sache qu'un défi
l'attend, il faut une nouvelle fonction serveur. **Je peux l'écrire**, ce n'est
pas un obstacle — c'est probablement la meilleure idée du lot, parce qu'elle
supprime le moment le plus fragile d'une séance : trente élèves qui recopient
cinq lettres au tableau.

Mais elle pose une question que je ne veux pas trancher à ta place.

**Dans la base, un défi d'élève porte lui aussi le nom d'une classe** — celle de
son créateur. Donc si la règle est « liste les défis ouverts de ma classe que je
n'ai pas encore joués », **les défis entre copains apparaîtront chez les 27
élèves de la classe**, au même titre que ceux du professeur. Un élève a droit à
5 défis ouverts simultanément : 27 × 5, cela fait jusqu'à 135 défis en attente
dans le bloc.

Deux façons de s'en sortir, et il y en a sûrement d'autres :

- **Seuls les défis de professeur remontent.** Le bloc reste du travail de
  classe — ce que ton dessin dit déjà en écrivant « Défi de M. Desjardins ».
  Les défis entre copains continuent par le code, qui reste visible en
  permanence. Un défi entre copains redevient ce qu'il est : un geste adressé à
  quelqu'un qu'on a choisi.
- **Tout remonte, mais l'affichage trie.** Le défi du professeur d'abord, les
  défis d'élèves ensuite et repliés. Il faut alors décider ce qu'on montre quand
  il y en a douze.

**Dis-moi laquelle, ou une troisième.** J'écris la fonction en conséquence.

Deux contraintes de fait, quelle que soit ta réponse :

- **Un défi déjà joué doit disparaître du bloc**, sinon l'élève qui a terminé
  lundi le voit toute la semaine (un défi de professeur vit 7 jours).
- **Le bloc doit annoncer les tables** — ta maquette le fait déjà, « Sprint ·
  tables 6 à 9 ». C'est nécessaire : un défi de professeur peut porter sur des
  tables que l'élève n'a pas encore débloquées, et l'application l'autorise
  volontairement. Aujourd'hui il n'y arrive que s'il tape le code ; demain
  l'accueil le lui propose.

---

## 4. Ce que je te demande

1. Le domaine corrigé : **@saintho.fr**.
2. « environ 4 minutes » : enlevé, ou dis-moi qu'on le calcule.
3. Le dénominateur de la grille qui suit le plafond de l'élève.
4. Les trois portes manquantes, remises où tu juges.
5. Ta réponse sur l'état 2 : quels défis remontent.

Le reste des écrans 11 à 14 est validé — y compris l'animation d'entrée, dont
je note seulement qu'elle doit être ignorée quand l'iPad est réglé sur
« réduire les animations », et qu'un élève reste connecté d'une fois sur
l'autre : elle sera donc vue rarement. À toi de dire si ça change quelque chose
à ce que tu proposes.
