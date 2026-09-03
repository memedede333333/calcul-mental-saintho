# matHo — retour sur les écrans 11 à 14

Tu as maintenant **tout le code** en pièce jointe : le client API, le système
visuel, les onze écrans, **les vingt-quatre migrations SQL** et `ECRANS.md`.
Avec le SQL tu peux vérifier toi-même ce que la base calcule, sans me le
demander et sans me croire sur parole.

Ce message ne contient que des faits et des questions. **Les décisions de
conception sont les tiennes**, y compris celles où j'aurais un avis.

---

## 1. Quatre chiffres, vérifiables dans les pièces jointes

**Trois existent.**

- **« +6 cette semaine »** — `progression_detail` (migration
  `20260828100000_score_progression.sql`) renvoie `cases_vertes` : le nombre de
  cases passées au niveau 3 depuis le début de la semaine. Servi par
  `mon_profil`.
- **« 41 cases vertes », « 19 cases rouges »** — `mon_profil` renvoie la clé
  `maitrise`, la grille complète de l'élève, fait par fait.
- **« palier 12 sur 15 »** — `plafond_tables` et `palier_de_plafond`.

**Un n'existe pas.**

- **« environ 4 minutes »** — aucune estimation de durée dans le SQL. Les
  éléments pour la calculer sont là (`sessions_jeu.duree_s`,
  `nb_questions`), mais rien ne le fait aujourd'hui. Si tu la gardes, dis-le :
  j'écris la fonction.

**Et deux erreurs de fait.**

- L'écran de connexion écrit **@saint-honore.fr**. Le domaine du collège est
  **@saintho.fr**.
- **« 41 cases vertes sur 144 »** — 144 = 12 × 12. `plafond_tables` va jusqu'à
  20 : un élève au plafond 15 a 225 cases, au plafond 20 il en a 400. Le
  dénominateur dépend de l'élève.

---

## 2. Inventaire : ce qui existe dans l'application et n'est pas dans ta maquette 12

Sans commentaire de ma part. Tout est vérifiable dans les fichiers joints.

| Ce qui existe | Où, dans le code |
|---|---|
| Un élève **crée** un défi et obtient un code : « Donne ce code à tes copains ». Le défi vit 24 h, 5 ouverts au maximum. | `creer_defi` (migration 21) ; `Challenges.jsx` l. 184 et l. 1525 |
| **Se déconnecter** | `Profile.jsx` l. 744 (branche élève) |
| **Choix de l'avatar** et **badges** | `Profile.jsx`, branche `ProfileEleve` |
| La grille en grand | `Profile.jsx` / `MasteryGrid.jsx` |

Dans ta maquette 12, la porte vers `Profil` est intitulée « Voir ma grille en
grand › », et il n'y a pas de porte vers la création de défi.

Trois faits pour décider :

- **Fréquence** : jouer, à chaque session ; rejoindre un défi de classe,
  plusieurs fois par semaine en période de défi ; créer un défi, changer
  d'avatar, se déconnecter, quelques fois par mois.
- **Les iPads sont partagés** et passent de main en main entre les classes.
- **Nombre d'entrées vers une partie dans ta maquette 12** : sept — l'action du
  jour, les quatre modes, la Montée, le défi.

---

## 3. L'état 2 du bloc défi — ce qu'il faudrait construire

« Un défi t'attend — code déjà rempli. »

**Ça n'existe pas.** Aujourd'hui un élève ne reçoit rien : il tape un code que
le professeur annonce à voix haute. `mes_defis` ne liste que les défis qu'on a
**créés**. Il faut une nouvelle fonction serveur. **Je l'écris** dès que tu as
tranché le point ci-dessous.

**Le fait qui décide.** Dans `public.defis` (schéma, l. 62), un défi a une
colonne `classe`. Pour un défi de professeur, c'est la classe visée. Pour un
défi d'élève, `creer_defi` y met **la classe du créateur**. Un défi entre
copains porte donc, en base, exactement la même étiquette de classe qu'un défi
de professeur.

Conséquence chiffrée : si la règle est « les défis ouverts de ma classe que je
n'ai pas joués », un élève peut avoir **jusqu'à 5 défis ouverts** et une classe
compte **27 élèves** — soit jusqu'à 135 défis remontant dans le bloc, en plus de
ceux du professeur.

Deux façons de trancher, il y en a d'autres :

- seuls les défis de professeur remontent ;
- tout remonte et l'affichage trie.

**Deux contraintes de fait, quelle que soit ta réponse :**

- Un défi **déjà joué** doit disparaître du bloc : un défi de professeur vit
  7 jours (`creer_defi`), un défi d'élève 24 h.
- Un défi de professeur peut porter sur des tables que l'élève n'a pas
  débloquées — c'est volontaire (migration 21, « le défi fait autorité »).
  Aujourd'hui il n'y arrive qu'en tapant le code ; avec l'état 2, l'accueil le
  lui proposera.

---

## 4. Deux faits observés sur ce projet, sans recommandation

- **Les fenêtres qui s'ouvrent par-dessus l'écran** (modales) ont été retirées
  des célébrations en septembre : sur iPad, des élèves de 11 ans ne les
  refermaient pas, et le clavier iOS se comportait mal avec.
- **L'animation d'entrée** ne sera vue que rarement : un élève qui ferme
  l'application reste connecté en la rouvrant (constaté sur iPad, test E5). Et
  elle devra être ignorée quand l'iPad est réglé sur « réduire les animations ».

---

## 5. Ce que j'attends de toi

Les écrans 11 à 14, corrigés des deux erreurs de fait, et ta réponse sur
l'état 2. Le reste — où vont les portes, faut-il alléger l'accueil, un second
écran ou non — **c'est ta décision, et je la suivrai.**
