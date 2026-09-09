# Lot 25 — le clavier physique est fermé quand le temps compte

**Front uniquement, aucune migration.** Petit lot, mais une décision de fond :
il faut la mettre au bon endroit pour pouvoir la changer en une ligne plus tard.

---

## 1. Pourquoi

Un clavier physique est nettement plus rapide qu'un doigt sur une vitre. Dans
les modes où le **temps** fait le score, un élève sur l'ordinateur familial le
soir bat un élève sur son iPad sans avoir mieux appris ses tables. Les
classements sont le moteur de motivation du projet : ils doivent comparer des
choses comparables.

C'est le même raisonnement que le palier — *« les records ne se comparent qu'à
plafond égal »* — appliqué au mode d'entrée.

**Ce n'est pas une mesure anti-triche**, et il ne faut pas l'écrire comme ça.
`ETAT.md` §3 le dit : la triche est impossible à empêcher dans un navigateur, et
ce qui dégonfle le sujet est que ces défis ne comptent dans aucune évaluation.
C'est une mesure d'**équité**, ce qui est une raison différente et suffisante.

**Aymeri a tranché : fermé pour tout le monde, sans réglage.** Les dérogations
par élève — PAI, difficulté motrice — viendront plus tard si le besoin apparaît.
N'anticipe pas : pas de colonne en base, pas d'interrupteur dans Admin.

---

## 2. Où, exactement — trois modes, pas deux

| Mode | Ce qui fait le score | Clavier |
|---|---|---|
| **Sprint** (`sprint`) | le temps | **fermé** |
| **Contre-la-montre** (`countdown`) | le temps | **fermé** |
| **Montée des tables** (`climb`) | 3 s par question | **fermé** |
| Sans faute (`flawless`) | la série, pas le temps | ouvert |
| Libre (`libre`) | rien n'est classé | ouvert |
| Apprendre | n'enregistre rien | ouvert |

**La Montée est dans la liste, et c'est le point qu'on rate facilement.** Elle
a un chronomètre de trois secondes par question (`Challenges.jsx` l. 1481) :
qui tape vite survit plus longtemps, monte plus haut, et **débloque son plafond
de tables**. C'est le mode où la vitesse a la conséquence la plus durable.

**Les défis sont couverts automatiquement** : `creer_defi` n'accepte que
`sprint` et `countdown`, un défi est donc toujours dans un mode fermé.

---

## 3. La règle vit à UN seul endroit

Crée `frontend/src/logic/saisie.js` :

```js
/**
 * Le clavier physique est fermé là où le TEMPS fait le score : un clavier
 * est plus rapide qu'un doigt, et les classements doivent comparer des
 * choses comparables.
 *
 * Ce n'est pas de l'anti-triche — c'est contournable en dix secondes par
 * qui sait ouvrir la console. C'est de l'équité.
 *
 * Fermé pour tout le monde, décision d'Aymeri du 9 septembre 2026. Les
 * dérogations par élève (PAI, difficulté motrice) viendront ici, et nulle
 * part ailleurs, si le besoin apparaît.
 */
export const MODES_SANS_CLAVIER = ['sprint', 'countdown', 'climb'];

export function clavierAutorise(mode) {
    return !MODES_SANS_CLAVIER.includes(mode);
}
```

Les trois écouteurs appellent `clavierAutorise(mode)`. Aucun d'eux ne réécrit
la liste des modes : le jour où on ouvre le clavier à un élève, il y a **une**
signature à changer.

---

## 4. Les trois écouteurs, et deux pièges

### a) `Challenges.jsx` l. 1125-1134 — le moteur partagé

`useQuizEngine` ne reçoit pas le mode : il reçoit `hasQuestionTimer`.

**Ne te sers pas de `hasQuestionTimer` pour décider.** Il se trouve qu'il vaut
`true` exactement pour nos trois modes, mais c'est une coïncidence : le jour où
quelqu'un ajoutera un chronomètre à Sans faute, le clavier s'y fermerait tout
seul sans que personne l'ait décidé. Deux décisions différentes, deux drapeaux
différents.

**Passe `mode` en propriété** à `useQuizEngine`, depuis les quatre appels
(l. 1198, 1290, 1361, 1481) et depuis le quiz de défi, où c'est le `type` du
défi.

### b) `Practice.jsx` l. 1836-1844 — le quiz solo chronométré

Le composant connaît déjà son `mode`. Mais **attention** :

```js
else if (e.key === 'Escape') { onQuit(); }
```

**La touche Échap doit rester active dans tous les cas.** Elle ne fait gagner
aucune seconde, et c'est la sortie de secours de l'écran. Ne ferme que les
**chiffres et Retour arrière**.

### c) `Practice.jsx` l. 1036-1042 — le mode libre

**Tu n'y touches pas.** Le mode libre n'est classé nulle part.

### Et deux écouteurs qui restent ouverts

`JoinChallenge.jsx` l. 136 (la saisie du code) et `Modals.jsx` l. 17 (Échap
pour fermer). Ni l'un ni l'autre n'est une partie.

---

## 5. Ce qu'on dit à l'élève, et où

Un enfant qui appuie sur une touche et ne voit rien se passer croit que
l'application est cassée. Il faut le prévenir — mais **avant** la partie, jamais
pendant.

Une ligne discrète sur l'écran de préparation des trois modes concernés :

> Sur cette partie, on répond au doigt — pour que tout le monde soit à égalité.

**Rien pendant la partie.** Un message qui apparaît au milieu d'une question de
trois secondes coûte à l'élève exactement les secondes qu'on est en train de
mesurer. Le silence est le bon comportement une fois la partie lancée.

---

## 6. Ce qui change pour les professeurs

Ils passent par les mêmes composants : leur entraînement en Sprint,
Contre-la-montre et Montée perd aussi le clavier. C'est cohérent — la salle des
profs a un classement au temps entre collègues.

**Aymeri garde le clavier en mode libre et en Sans faute** pour ses recettes.

---

## 7. Ce qu'il faut voir à l'écran

- [ ] Sprint, Contre-la-montre, Montée : les chiffres du clavier **ne font
      rien**, le pavé tactile fonctionne normalement.
- [ ] Dans ces trois modes, **Échap quitte toujours** la partie.
- [ ] Sans faute et Libre : le clavier fonctionne comme avant.
- [ ] Un défi rejoint par un code : clavier fermé pendant la partie, mais **la
      saisie du code au clavier fonctionne toujours** sur l'écran d'avant.
- [ ] La phrase du §5 apparaît sur l'écran de préparation des trois modes, et
      **nulle part pendant** la partie.
- [ ] Les modales se ferment toujours par Échap.
- [ ] `npm run build` vert, `check-tokens` vert.

---

## 8. Le commit

Aucun test SQL ne protège cette règle — elle est entièrement dans le front.
Sa seule trace durable est écrite, alors écris-la bien :

- **`JOURNAL.md`** : entrée **tout en haut de la section « Entrées »**, avec la
  raison (équité, pas anti-triche) et le fait que les dérogations par élève sont
  remises à plus tard.
- **`ETAT.md` §3** : une décision, avec sa raison et la mention des trois modes
  — dont la Montée, et pourquoi elle en fait partie.

```
git add -A
git commit -m "Lot 25 : clavier physique ferme dans les trois modes chronometres"
git push
```

---

## Ce que tu ne fais pas

- **Aucune migration, aucune colonne, aucun interrupteur.** La dérogation par
  élève viendra si le besoin apparaît, pas avant.
- Tu ne fermes pas le clavier en Sans faute, en Libre, ni dans Apprendre.
- Tu ne touches pas à Échap.
