# Recette — les tests que le code ne peut pas faire

> À faire **avant** de livrer quoi que ce soit à des élèves. Chaque test ici
> existe parce qu'aucune relecture ni aucun test automatique ne peut le
> remplacer : il faut deux personnes, un vrai iPad, ou les deux.
>
> Les 90 cas de `supabase/tests/run.sh` prouvent que le serveur se comporte
> bien. Ils ne prouvent rien sur ce qui se passe entre deux iPads, ni sur ce
> qu'un élève voit.

---

## Avant de commencer — 5 minutes

| | |
|---|---|
| **Matériel** | 2 iPads du parc (pas un Mac), sur le Wi-Fi du collège |
| **Personnes** | toi + un collègue, en même temps, ~25 minutes |
| **Comptes** | 1 compte enseignant (le tien) + **2 comptes élèves de la même classe** |
| **Base** | celle de **développement** — il n'y en a pas d'autre |

**À noter avant de commencer, tu en auras besoin :**

- [ ] Classe des deux élèves de test : `__________`
- [ ] Effectif affiché pour cette classe : `______`
- [ ] Plafond de tables de l'élève 1 : `______`  · de l'élève 2 : `______`
      *(visible sur son profil, ou dans Administration)*

Si les deux élèves ne sont pas dans la même classe, arrête-toi ici : le
compteur « 3 sur 27 ont terminé » n'aura aucun sens et le test B non plus.
Corrige la classe dans Administration d'abord.

---

## TEST A — Le défi à deux comptes

*C'est le dernier test fonctionnel du projet. Il vérifie ce que personne n'a
jamais vu : deux élèves dans le même défi, en même temps.*

**A1.** Sur ton compte enseignant : *Lancer un défi* → **Sprint** → coche les
tables **2, 3, 4** → choisis la classe des deux élèves → **Créer un défi**.
→ ✅ *Attendu :* un code de 5 lettres s'affiche.

**A2.** Note le code : `__________`

**A3.** Les **deux élèves entrent le code en même temps** et attendent l'écran
qui annonce le défi.
→ ✅ *Attendu :* chacun voit **« 📚 Défi de [ton nom] — [la classe] »** avant la
première question. Pas « 🎮 Défi de … ».
→ ❌ *À signaler :* un nom affiché « — », un tiret, ou l'écran sauté.

**A4.** Tu dis « c'est parti ». **Les deux jouent en même temps.** Demande à
l'un de répondre vite et à l'autre lentement, pour créer un écart.

**A5.** Quand les deux ont fini, chacun regarde le classement du défi.
→ ✅ *Attendu :* les **deux noms** apparaissent, dans le bon ordre (le plus
rapide en tête à score égal), chacun **une seule fois**.
→ ❌ *À signaler :* un élève absent, un élève en double, un ordre incohérent.

**A6.** Regarde le compteur d'avancement.
→ ✅ *Attendu :* **« 2 sur [effectif de la classe] ont terminé »** — l'effectif
que tu as noté en tête, pas 2, pas 27 si la classe en compte 24.
→ ❌ *À signaler :* n'importe quel autre nombre. **C'est le bug qui est revenu
quatre fois dans ce projet** — note les deux nombres tels quels.

**A7.** Un des deux élèves ressaisit le **même code**.
→ ✅ *Attendu :* refus, avec un message lisible du genre « Tu as déjà participé
à ce défi ».
→ ❌ *À signaler :* s'il peut rejouer.

**A8.** Chaque élève va sur son profil.
→ ✅ *Attendu :* ses points ont augmenté, et le nombre affiché sur le profil est
**le même** que celui du classement.

---

## TEST B — Le défi au-dessus du plafond *(nouveau, migration 21)*

*Ce qu'on vient de construire, et que personne n'a encore vu à l'écran. Avant,
l'élève jouait deux minutes et perdait son score.*

**B0.** Reprends le plafond de l'élève 1 noté plus haut. Choisis une table
**strictement au-dessus** : par exemple plafond 10 → prends la table **15**.
Table choisie : `______`

**B1.** Sur ton compte enseignant : *Lancer un défi* → **Sprint** → coche
**uniquement cette table** → choisis la classe → **Créer un défi**.
→ ✅ *Attendu :* **un avertissement s'affiche avant la création** :
« ⚠️ X élèves sur Y n'ont pas encore débloqué la table 15 — lancer quand
même ? », avec deux boutons.
→ ❌ *À signaler :* aucun avertissement, ou un seul nombre au lieu de deux.

**B2.** Note les deux nombres : `____ sur ____`
→ ✅ *Attendu :* le second est l'effectif de la classe noté en tête.

**B3.** **Sans fermer l'avertissement**, coche une table de plus (la 2, par
exemple).
→ ✅ *Attendu :* **l'avertissement disparaît** et le bouton « Créer un défi »
revient. C'est voulu : changer la sélection annule la validation précédente.
→ ❌ *À signaler :* si l'avertissement reste affiché.

**B4.** Décoche la 2, reviens à la seule table haute, clique « Créer », puis
**« Lancer quand même »**.
→ ✅ *Attendu :* le défi est créé, un code s'affiche.

**B5.** L'élève 1 (celui dont le plafond est trop bas) entre le code et **joue
le défi jusqu'au bout**.
→ ✅ *Attendu :* **son score s'enregistre normalement.** C'est tout l'objet de
la migration 21.
→ ❌ *À signaler :* un message parlant de table non débloquée à la fin.
**C'est le test le plus important de cette page.**

**B6.** L'élève 1 retourne sur son profil.
→ ✅ *Attendu :* son **plafond de tables n'a pas changé** — toujours la valeur
notée en tête. Jouer une table haute en défi ne débloque rien.
→ ❌ *À signaler :* si le plafond a monté.

**B7.** L'élève 1 va dans *S'entraîner* et essaie de cocher lui-même la table
haute.
→ ✅ *Attendu :* elle est **verrouillée** (cadenas). L'anti-triche du jeu solo
est intact.

---

## TEST C — L'écran « Ma classe »

*Le seul écran fait pour les professeurs. C'est lui qui décidera de l'adoption
en salle des profs.*

**C1.** Compte enseignant → **Ma classe** → choisis la classe de test.
→ ✅ *Attendu :* l'en-tête indique le bon effectif, et **toutes** les tables
apparaissent — celles travaillées en haut, celles jamais abordées sous
« Pas encore abordées ».

**C2.** Regarde l'ordre des tables travaillées.
→ ✅ *Attendu :* les tables où **le moins d'élèves de la classe** maîtrisent
sont en haut. Une table qu'un seul élève a ouverte ne doit **pas** apparaître
comme la mieux acquise.
→ ❌ *À signaler :* si une table à peine ouverte se retrouve en bas de liste
comme si elle était acquise.

**C3.** Regarde une barre en détail.
→ ✅ *Attendu :* le texte à droite dit « X / [effectif] maîtrisent » et, en
dessous, « N sans trace ». Les deux nombres doivent être cohérents avec
l'effectif.

**C4.** Clique **« ⚔️ Lancer un défi sur les tables … »**.
→ ✅ *Attendu :* l'écran de création s'ouvre avec ces tables déjà cochées et la
bonne classe sélectionnée.

**C5.** Reviens, clique **« 🔍 Découvrir les tables … »**.
→ ✅ *Attendu :* même chose, avec des tables non abordées. Si elles dépassent
le plafond de certains élèves, l'avertissement du test B doit apparaître à la
création.

---

## TEST D — Aucune ressource extérieure *(à faire sur un Mac)*

*Les iPads sont filtrés par MDM. Une seule requête vers un domaine non autorisé
et l'application se dégrade sans prévenir.*

**D1.** Sur un Mac, ouvre l'application dans Safari. Menu **Développement →
Afficher l'inspecteur web** → onglet **Réseau**. Recharge la page.
→ ✅ *Attendu :* **toutes** les requêtes vont vers l'adresse de l'application ou
vers `…supabase.co`. Rien vers `fonts.googleapis.com` ni `fonts.gstatic.com`.
→ ❌ *À signaler :* n'importe quel autre domaine, avec son nom.

**D2.** Regarde les titres à l'écran (« Ma classe », « S'entraîner »).
→ ✅ *Attendu :* une police **ronde et épaisse** (Baloo 2), pas la police
système d'Apple. Si tout ressemble à un réglage d'iPhone, les polices locales
ne sont pas chargées.

---

## TEST E — Le vrai contexte : l'iPad

*Rien de ce qui suit ne se voit sur un Mac.*

**E1.** L'application ouverte en plein écran depuis l'écran d'accueil (Web
Clip), pas dans un onglet Safari.
→ ✅ *Attendu :* pas de barre d'adresse, pas de bouton retour du navigateur.
→ *Note :* l'icône sera générique tant que le logo n'existe pas — c'est connu.

**E2.** Pendant une partie, tape une réponse.
→ ✅ *Attendu :* le pavé numérique de l'application, **pas le clavier iPad**.
La page ne se déplace pas, ne zoome pas.

**E3.** Tourne l'iPad en portrait puis en paysage pendant une partie.
→ ✅ *Attendu :* rien ne se coupe, le chronomètre continue.

**E4.** Verrouille l'iPad 30 secondes en pleine partie, puis déverrouille.
→ ✅ *Attendu :* dis-moi simplement **ce qui se passe** — ce cas n'a jamais été
traité, et il arrivera en classe tous les jours.

**E5.** Ferme complètement l'application, rouvre-la.
→ ✅ *Attendu :* l'élève est toujours connecté, sans repasser par Google.

**E6.** Le plus important, et le seul qui ne se coche pas : **regarde ton
collègue s'en servir sans rien lui expliquer.** Note chaque fois qu'il hésite,
cherche un bouton, ou fait autre chose que ce que tu attendais. Ces
hésitations valent plus que toute la liste ci-dessus.

---

## Ce que tu me remontes

Une seule liste, pas un test à la fois — un lot, un message, dans les deux
sens. Pour chaque anomalie :

1. **Le numéro du test** (A6, B5…)
2. **Ce que tu as vu**, mot pour mot si c'est un message à l'écran
3. **Les nombres exacts** s'il y en a — jamais « le compte était faux »
4. Qui était connecté : professeur, élève 1, élève 2

Et dis-moi aussi ce qui est passé au vert : un test qui réussit est une
information, et c'est ce qui permet de dire que le projet est prêt.
