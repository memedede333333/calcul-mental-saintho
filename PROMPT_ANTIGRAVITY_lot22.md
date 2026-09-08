# Lot 22 — le code projeté, l'accueil professeur, et rejoindre un défi

Maquettes **26, 27, 33 et 34** de `docs/design/matHo-refonte-v10.dc.html`.
**Aucune migration.** Tout existe côté serveur, j'ai vérifié chaque appel.

> **Ton découpage est bon, avec un seul changement : l'écran 28 (Mes défis
> passés) passe au lot 23.** Il affiche « 18 ont rejoint · 16 ont terminé »,
> or `mes_defis()` renvoie `participants`, `participants_classe` et `attendus`
> — pas `rejoints`, qui est arrivé avec la migration 25 et n'a jamais été
> ajouté là. Plutôt que d'appeler `avancementDefi()` une fois par ligne, je
> l'ajoute à `mes_defis` dans la migration 29, qui part avec le lot 23. Un
> écran ne se coupe pas en deux entre deux lots.

---

## 1. Écran 26 — le code projeté en 1280 × 720

Tu as déjà codé cet écran au lot 17 (maquette 9). Ce qui change ici :

- **plein écran, 1280 × 720**, pensé pour un vidéoprojecteur ;
- un bouton **« ‹ Quitter »** discret, en haut à gauche ;
- le libellé **« REJOINDRE AVEC LE CODE »** en capitales au-dessus des cases.

Le passage en `Layout` large touche `App.jsx`, donc **tous** les écrans.
**Commite-le séparément des trois autres écrans de ce lot**, pour qu'une
régression de mise en page se corrige par un seul `git revert`.

Rien d'autre ne change : le compteur vient toujours de `rejoints`, les avatars
de `presentsDefi()`, et le rafraîchissement reste à 3,5 s.

---

## 2. Écran 27 — l'accueil professeur

En tête : le nom, puis **« Administrateur · 6ᵉA, 6ᵉB, 5ᵉC »**. Les deux
viennent de `monProfilProf()` : `profil.role` et `profil.classes`.

Écris **« Administrateur »** ou **« Professeur »** selon `role`. Les classes
sont un **raccourci d'affichage** (`ETAT.md` §3) : elles n'ouvrent aucun droit,
un enseignant voit toutes les classes. Ne laisse pas entendre le contraire.

### L'encadré d'alerte

> **18 élèves de 6ᵉA bloquent sur la table de 7**
> Un défi ciblé maintenant vaut mieux qu'une révision générale.
> **Lancer ›**

Ce nombre vient de `maitriseClasse(classe)` : **`eleves_jaunes +
eleves_rouges`** pour la table retenue, et la table retenue est celle qui a la
plus grande part de `(eleves_jaunes + eleves_rouges) / eleves_classe`.

**C'est exactement le calcul de l'écran 24 (Ma classe).** Les deux écrans
doivent désigner la même table le même jour. Si tu écris deux tris différents,
un professeur lira « table 7 » sur son accueil et « table 8 » dans Ma classe,
et il ne saura pas lequel croire. **Mets ce calcul dans une seule fonction
partagée** et appelle-la des deux endroits.

Ne trie jamais sur `taux_maitrise` : son dénominateur n'est que les élèves qui
ont déjà travaillé la table. Une table qu'un seul élève a vue et réussie
afficherait 100 % et passerait première.

La classe retenue est la première de `profil.classes`. Si le professeur n'a
aucune classe favorite, **l'encadré ne s'affiche pas** — il n'invente pas une
classe.

### Le reste de l'écran

Six entrées : **Lancer un défi · Ma classe · Classements · S'entraîner ·
Mes défis passés · Profil**, plus **Administration** si `est_admin`, et
**Se déconnecter**.

« Mes défis passés — 4 défis · le dernier avant-hier » vient de `mesDefis()` :
la longueur de la liste et le `cree_le` du premier. La fonction renvoie tout,
sans pagination — compter dedans est légitime.

---

## 3. Écran 33 — saisir le code

Cinq cases, un clavier de lettres à l'écran, le curseur avance tout seul.
« 3 lettres sur 5 · le curseur avance tout seul ».

**Un point que la maquette n'a pas vu : trois lettres ne peuvent jamais
apparaître dans un code.** `generer_code_defi()` (`schema.sql` l. 277) utilise
l'alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — **pas de I, pas de L, pas de O**,
parce qu'elles se confondent avec 1 et 0 quand on lit un code au fond d'une
salle.

Le clavier de la maquette affiche pourtant A à Z en entier. Un élève qui tape
un I perdra son essai sur une lettre qui n'existe pas. **Retire I, L et O du
clavier**, et ajoute les chiffres 2 à 9, qui eux sont bien dans l'alphabet.

Le bouton « Valider le code » s'active à cinq caractères, comme sur la maquette.

---

## 4. Écran 34 — défi trouvé, et les deux refus

`rejoindreDefi(code)` renvoie déjà tout ce qu'il faut.

### Quand ça marche

> **Défi trouvé** — U E W T R
> Créé par **M. Desjardins** · Sprint · 20 questions · 3 s · tables 6, 7, 8, 9
> Classe 6ᵉA · **18 ont déjà joué**
> **C'est parti** — *Seul ton premier essai compte au classement.*

Tout vient de la réponse (`auteur_nom`, `origine`, `type`, `tables`,
`duree_s`, `questions`, `classe`) **sauf « 18 ont déjà joué »** : appelle
`avancementDefi(defi_id)` juste après et prends **`termines`**. N'écris pas
« ont rejoint » si tu affiches `termines`, et l'inverse : ce sont deux
populations, elles ont deux noms.

### Les deux refus — garde-les distincts

La maquette fond « code inconnu » et « défi expiré » en un seul message. **Ne
le fais pas.** Le serveur renvoie deux raisons différentes, et elles appellent
deux gestes différents chez l'élève :

| `raison` | Ce que l'élève doit lire | Ce qu'il fait |
|---|---|---|
| `inconnu` | « Ce code n'existe pas. Vérifie les lettres. » | il relit le tableau |
| `ferme` | « Ce défi est terminé. » | il arrête de chercher |
| `deja_joue` | « Tu as déjà joué ce défi. » | il va voir le classement |

Le message est **dans la réponse** (`message`) : affiche-le, ne le réécris pas.

Pour « Ton résultat est enregistré : 18 sur 20 en 1 min 04 », la réponse
`deja_joue` porte le `defi_id` : appelle `classementDefi(defi_id)` et prends la
ligne où `est_moi` est vrai.

---

## 5. Ce qu'il faut voir à l'écran

- [ ] Écran 26 en 1280 × 720 : le code se lit à trois mètres, « Quitter »
      ramène à l'accueil, et **aucun autre écran n'a bougé** (vérifie l'accueil
      élève et une partie après le changement de `Layout`).
- [ ] Écran 27 : la table annoncée dans l'encadré est **la même** que celle que
      Ma classe met en tête. Teste avec une classe où deux tables sont proches.
- [ ] Un professeur sans classe favorite ne voit pas d'encadré d'alerte.
- [ ] Écran 33 : les touches I, L et O n'existent pas ; les chiffres 2 à 9 sont
      là.
- [ ] Écran 34 : teste les trois refus avec un vrai code inconnu, un défi
      expiré, et un défi déjà joué. Les trois messages sont différents.
- [ ] `npm run build` vert, `check-tokens` vert.

---

## 6. Le commit

**D'abord les documents.** L'entrée de `JOURNAL.md` va sous le titre
**`## Entrées`**, en première position — le mode d'emploi est en tête du
fichier, il le dit maintenant explicitement.

```
git add -A
git commit -m "Lot 22 : code projete plein ecran, accueil professeur, rejoindre un defi"
git push
```

Puis `ETAT.md` : la ligne « Dernière mise à jour » d'abord, et le §5.

---

## Ce que tu ne fais pas

- **L'écran 28**, qui passe au lot 23 avec la migration 29.
- **Les écrans 29 à 32 et 35, 36** : lots 23 et 24.
- Aucune migration, aucun nouvel appel serveur.
