# Lot 24 — Apprendre les tables, et les quatre modales

Les deux derniers écrans de `docs/design/matHo-refonte-v10.dc.html` : **35** et
**36**. **Aucune migration** — mais une fonction serveur écrite il y a une
semaine n'a jamais été branchée, et c'est la moitié de ce lot.

Après celui-ci, les 36 maquettes sont dans le code.

---

## 1. Écran 35 — Apprendre les tables

`Learn.jsx` existe déjà (216 lignes) avec trois visualisations : groupes,
tableau, barres. La maquette garde l'idée et resserre le propos autour de
**deux** idées, une par carte. Le reste est du bruit pour un enfant de 11 ans.

### La carte du haut — la commutativité

> **7 × 8 = 56**
> 7 rangées de 8 · *Faire tourner* · 8 rangées de 7
> Autant de ronds dans les deux sens : **7 × 8 = 8 × 7**.
> Une case apprise, c'est deux réponses.

Le bouton « Faire tourner » retourne la grille de points : 7 rangées de 8
deviennent 8 rangées de 7, **les mêmes ronds**, réarrangés. L'animation est le
message : si les ronds disparaissaient et réapparaissaient, l'enfant verrait
deux objets différents au lieu d'un seul retourné.

La phrase « une case apprise, c'est deux réponses » n'est pas un slogan : c'est
exactement pourquoi la grille de maîtrise est symétrique, et pourquoi
`cleFait(a, b)` range toujours le plus petit d'abord.

### La carte du bas — la coupure en deux

> **La coupure en deux**
> 5 × 8 = 40 **+** 2 × 8 = 16 **=** 56
> Les tables de 5 et de 2 sont les plus faciles. Toutes les autres se ramènent
> à elles : **7, c'est 5 plus 2**.

La décomposition dépend de la table choisie. Écris-la comme une **règle**, pas
comme une table de correspondance :

- table ≤ 5 → pas de découpe, la carte ne s'affiche pas ;
- table 6 à 9 → `5 + (n − 5)` ;
- table 10 → pas de découpe non plus, c'est déjà la plus facile ;
- table 11 et 12 → `10 + (n − 10)`.

Une liste écrite à la main serait fausse le jour où quelqu'un ajoutera la
table 13.

### Les deux sélecteurs

La rangée du haut choisit **la table** (2 à 12 dans la maquette), celle du
dessous **le multiplicateur** (1 à 10).

**La borne haute vient de `plafond_tables`**, pas d'un 12 en dur : un élève
Expert doit pouvoir apprendre la table de 15. Un élève ne voit que ce qu'il a
débloqué — sinon l'écran lui montre du travail qu'il n'a pas le droit de jouer.

### Les deux boutons du bas

- **« Tester la table de 7 en libre »** lance une partie libre sur cette seule
  table : `onGo('play', { mode: 'libre', tables: [7], length: 20, timer: 0 })`.
- **« Fait suivant › »** passe au multiplicateur suivant.

### Ce que cet écran n'enregistre pas

**Rien.** `Apprendre` ne joue pas, ne compte pas de points, ne touche pas à la
maîtrise. Le mode `apprentissage` existe dans `sessions_jeu.mode`, mais cet
écran-là ne l'utilise pas : on n'apprend pas en étant noté. Si tu es tenté
d'appeler `enregistrerSession` ici, ne le fais pas.

---

## 2. Écran 36 — les quatre modales

Toutes sur un **voile indigo à 55 %**, fermables au clic sur le voile et par
Échap. Un composant commun pour le voile et le cadre, quatre contenus.

### a) Choisir mon avatar — élève

> **Choisir mon avatar** — *C'est le seul réglage qui t'appartient.*
> 🦊 🦁 🐼 🐨 🐢 🐙 🦉 🐝
> *Annuler* · **Enregistrer mon avatar**

`changerAvatar(emoji)`. Liste fermée d'emojis, **aucun champ de saisie** — c'est
la règle du projet, et c'est aussi pourquoi les avatars existent : donner une
identité sans une lettre de texte libre.

### b) Changer la classe d'un élève — enseignant

> **Changer la classe d'Alice D. ?** — Classe actuelle : 6ᵉA
> Nouvelle classe : *(la liste des classes)*
> Cette modification sera enregistrée au journal d'audit avec votre nom et
> l'heure.
> *Annuler* · **Valider le changement**

`modifierEleve(id, { classe })`, et la liste vient de `listeClasses()`.

**Garde la phrase sur le journal d'audit.** Elle est vraie — la fonction écrit
dans `journal_admin` — et c'est elle qui rend le geste sérieux sans le rendre
effrayant.

### c) Désactiver l'accès — enseignant

> **Désactiver l'accès d'Alice D. ?** — 6ᵉA · dernière connexion hier
> **Ses résultats sont conservés.** Sa grille, ses points et ses records
> restent en base et réapparaîtront si vous la réactivez. Seule la connexion
> est bloquée. Rien n'est supprimé.
> *Annuler* · **Désactiver l'accès**

`desactiverEleve(id, motif)`. Le texte de la maquette dit exactement ce que fait
le serveur — recopie-le mot pour mot. C'est la décision d'`ETAT.md` §3 : on ne
supprime jamais un élève en cours d'année, parce que supprimer effacerait ses
sessions en cascade et changerait rétroactivement les classements de sa classe.

`derniere_connexion` vient de `listeEleves`.

### d) L'aperçu d'import — et c'est le morceau du lot

> **Aperçu de l'import — 6ᵉ 3**
> `eleves-rentree-2026.csv` · 350 lignes lues · **rien n'est encore écrit**
>
> **312** créations · **34** mises à jour · **4** ignorées · **6** absents du fichier
>
> | Ligne | Nom | E-mail | Classe | Statut |
> |---|---|---|---|---|
> | 45 | ABADIE Lou | l.abadie@saintho.fr | 6ᵉ 3 | Prêt |
> | 46 | BERTIN Sacha | s.bertin@saintho.fr | 6ᵉ 3 | Mise à jour |
> | 47 | DUPONT Mathis | m.dupont.college | 6ᵉ 3 | **E-mail sans @** |
> | 49 | DIALLO Nour | n.diallo@saintho.fr | — | **Classe vide** |
>
> *5 lignes sur 350*

**`apercu_import_eleves(p_eleves jsonb)` existe depuis la migration 24, elle est
testée, et elle n'est appelée nulle part.** Il n'y a même pas d'enveloppe dans
`api.js`. Ajoute-la :

```js
export async function apercuImportEleves(eleves) {
    return rpc('apercu_import_eleves', { p_eleves: eleves });
}
```

Elle renvoie : `lignes_lues`, `creations`, `mises_a_jour`, `dont_reactivations`,
`ignorees`, `lignes_ignorees` (avec `ligne` et `raison`), et
`actifs_absents_du_fichier`.

**Trois règles sur ces compteurs**, et elles ne sont pas décoratives :

1. **`creations + mises_a_jour + ignorees = lignes_lues`, exactement.** C'est
   une propriété du serveur, vérifiée par le cas de test 106. Ton écran peut
   l'afficher tel quel : il n'a rien à recalculer, et surtout rien à déduire par
   soustraction.
2. **`dont_reactivations` est un SOUS-ENSEMBLE de `mises_a_jour`.** Le mot
   « dont » est dans le nom pour qu'on ne l'additionne jamais aux autres.
3. **`actifs_absents_du_fichier` porte sur la BASE, pas sur le fichier.** C'est
   une autre population : jamais de fraction entre elle et les trois premières.
   Et l'import ne désactive personne — il signale, c'est tout.

**Les raisons de rejet viennent du serveur**, dans `lignes_ignorees[].raison` :
« e-mail manquant », « e-mail invalide — … », « prenom manquant »,
« nom manquant », « classe vide », « e-mail deja present ligne 20 ». Affiche-les
telles quelles. N'en réécris aucune et n'en invente pas : elles sont écrites
**une seule fois**, dans `valider_lignes_import`, partagée par l'aperçu et par
l'import réel. C'est ce qui garantit qu'un aperçu ne ment pas.

**« Rien n'est encore écrit »** est la phrase la plus importante de cette
modale. `apercu_import_eleves` est en lecture seule ; c'est `importerEleves` qui
écrit, et seulement quand le professeur valide. Le bouton de validation doit
être séparé et explicite.

---

## 3. Ce qu'il faut voir à l'écran

- [ ] Écran 35 : avec un compte au plafond 15, le sélecteur de tables va
      jusqu'à 15. Avec un compte au plafond 10, il s'arrête à 10.
- [ ] « Faire tourner » réarrange **les mêmes ronds** — ils ne disparaissent pas.
- [ ] La coupure en deux ne s'affiche pas pour les tables 2, 3, 4, 5 et 10.
- [ ] Écran 35 : joue avec, puis regarde ton profil — **aucun point, aucune
      partie, aucune case de la grille n'a bougé**.
- [ ] Modale d'import : charge un fichier avec une ligne sans arobase et une
      ligne sans classe. Les deux raisons affichées sont **celles du serveur**,
      et les trois compteurs additionnés font le nombre de lignes lues.
- [ ] Ferme l'aperçu sans valider : **rien n'a changé en base**.
- [ ] Les quatre modales se ferment au clic sur le voile et par Échap.
- [ ] `npm run build` vert, `check-tokens` vert.

---

## 4. Le commit

**D'abord les documents :**

- **`JOURNAL.md`** : ton entrée **tout en haut de la section « Entrées »**.
- **`ETAT.md`** : la ligne « Dernière mise à jour » **en premier**. Et cette
  fois, écris-y que **les 36 maquettes sont dans le code** — c'est un jalon, pas
  une ligne de plus.

```
git add -A
git commit -m "Lot 24 : Apprendre les tables et les quatre modales, 36 maquettes livrees"
git push
```

---

## Ce que tu ne fais pas

- Aucune migration : les six fonctions de ce lot existent toutes.
- `Apprendre` n'enregistre rien.
- Aucun champ de texte libre nulle part.
