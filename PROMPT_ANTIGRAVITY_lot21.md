# Lot 21 — les trois écrans qui restent, et la migration 28

Maquettes **22, 23 et 24** de `docs/design/matHo-refonte-v9.dc.html`.
Avec la migration 28, qui **renomme des colonnes** : le serveur et le front
doivent changer dans le même commit.

---

## 1. D'abord : appliquer la migration 28

Fichier : **`supabase/migrations/20260908160000_populations_classements.sql`**.
Écrit et testé — **146 cas verts**. Tu ne le modifies pas.

Mêmes interdits que d'habitude : **jamais `run.sh`**, **jamais `seed.sql`**,
**ce fichier seulement**. Puis régénère `frontend/src/types/database.ts`.

### Elle supprime et recrée trois fonctions

`classement_classes` et `liste_classes` changent de **colonnes de retour**.
PostgreSQL refuse un `create or replace` dans ce cas — il faut un `drop`, et
il est dans le fichier. C'est la troisième migration de suite où ce piège se
présente : une signature n'est pas modifiable en place.

### Vérifier

```sql
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='classement_classes') as sig_classes,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='liste_classes') as sig_liste,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname in ('ma_place_progression','entete_classe')) as nouvelles;
```

Attendu : **`sig_classes = 1`**, **`sig_liste = 1`**, **`nouvelles = 2`**.

---

## 2. Ce qui change de nom, et pourquoi

Le mot **« actif »** voulait dire **trois choses différentes** dans la base :

| Où | Ce que ça comptait vraiment |
|---|---|
| `eleves.actif` | pas désactivé |
| `classement_classes.eleves_actifs` | **a joué** sur la période |
| `liste_classes.eleves_actifs` | pas désactivé |

Le sélecteur de classes de la maquette 24 et l'en-tête de la **même maquette**
auraient affiché deux nombres portant le même nom et comptant deux choses
différentes. C'est la famille de bugs qui a frappé cinq fois ce projet.

**Les nouveaux noms :**

```
classement_classes :  eleves_actifs → ont_joue
                      eleves_total  → inscrits
                      points_moyens → points_par_inscrit
liste_classes      :  eleves_actifs → inscrits
```

**Le calcul de `points_par_inscrit` ne change pas d'un iota** : c'est bien la
somme des points divisée par l'effectif **inscrit**, jamais par ceux qui ont
joué. C'est la décision d'`ETAT.md` §3 — une classe où trois élèves jouent
beaucoup ne doit pas passer devant une classe où tout le monde s'y met.

**La maquette 23 écrit « pts / élève actif ». C'est la maquette qui a tort.**
Le libellé à l'écran devient **« points par élève inscrit »**.

### Les quatre endroits à corriger dans le front

- `Leaderboards.jsx` l. 105, 113, 115, 422, 424
- `MaClasse.jsx` l. 183
- `Admin.jsx` l. 208
- `types/database.ts` (régénéré)

Et **le mot « actif » disparaît de tous les écrans** quand il parle de
quelqu'un qui joue. On écrit **« 24 ont joué · 28 inscrits »**. « Actif » ne
reste que pour le statut d'un compte, dans l'écran Administration :
« Actif / Désactivé ».

---

## 3. Ce que la migration ajoute

### `ma_place_progression(periode, portee, palier)`

```
rang · points · classes_total · rang_au_dessus · points_au_dessus · ecart_au_dessus
```

Une seule ligne : la tienne. Elle existe parce que
`classement_progression()` finit par `limit p_limite` — un élève 18ᵉ sur 350
n'est **pas** dans le résultat, et l'écran ne pouvait donc ni afficher sa place
ni calculer l'écart.

Elle réutilise **exactement le même corps de requête** que
`classement_progression` : mêmes CTE, même tri, mêmes filtres. Deux calculs
séparés du même classement finiraient par diverger d'une place, et l'élève
verrait deux rangs sur le même écran (cas de test 139).

**`ecart_au_dessus` est calculé par le serveur.** Ne soustrais rien.

**Zéro ligne = l'élève n'a pas joué sur la période.** L'écran affiche son état
vide ; il n'invente pas un rang.

### `entete_classe(classe, periode)`

```json
{ "classe": "6A", "inscrits": 27, "ont_joue": 24,
  "plafond_commun": 10, "plafond_max": 12 }
```

`ont_joue` est un **sous-ensemble strict** de `inscrits`. Ne jamais afficher
l'un sans l'autre, jamais de pourcentage entre les deux.

**Deux enveloppes à ajouter dans `api.js` :**

```js
export async function maPlaceProgression(periode = 'semaine', portee = 'classe', palier = null) {
    return rpc('ma_place_progression', {
        p_periode: periode, p_portee: portee, p_palier: palier,
    });
}

export async function enteteClasse(classe, periode = 'semaine') {
    return rpc('entete_classe', { p_classe: classe, p_periode: periode });
}
```

---

## 4. Maquette 22 — Classements, Progression

Onglets **Progression · Records · Classes**, plus **Profs** qui n'apparaît que
pour un enseignant connecté. Filtres **Cette semaine · Ce mois · Tout**, et
portée **Collège · Ma classe**.

Podium des trois premiers, puis la liste.

**Le point neuf : la ligne de l'élève reste visible en bas**, épinglée, même
quand il fait défiler :

> **18** 🦊 Lou A. *(toi)* — **228** · *42 points de la 17ᵉ place*

Les trois nombres viennent de `maPlaceProgression()` : `rang`, `points`,
`ecart_au_dessus`. Si la fonction ne renvoie rien, la ligne épinglée
n'apparaît pas et l'écran dit « Tu n'as pas encore joué cette semaine ».

Si l'élève est **dans** la liste affichée, ne le montre pas deux fois : la
ligne épinglée n'apparaît que lorsqu'il est au-delà de la limite.

---

## 5. Maquette 23 — Classements, Classes, et l'état vide

Le classement des classes, la sienne surlignée :

> **1 — 6ᵉ B** *(ma classe)* · 24 ont joué · 28 inscrits · **342** points par élève inscrit

**L'état vide, le lundi matin** — c'est la moitié de l'intérêt de cet écran :

> **Personne n'a encore joué cette semaine**
> Sois le premier. Une seule partie suffit pour apparaître ici.
> **Jouer une partie** · *Ou regarde le classement du mois ›*

Cet état se déclenche quand `classement_classes()` renvoie **zéro ligne**, pas
quand tous les scores sont à zéro. Ne le devine pas autrement.

---

## 6. Maquette 24 — Ma classe, pilotage enseignant

L'écran existe déjà (`MaClasse.jsx`). Ce que la maquette ajoute :

**L'en-tête**, avec le sélecteur de classes puis, en une ligne :
> 24 ont joué · 27 inscrits · plafond commun : table 10

Les quatre nombres viennent de `enteteClasse()`. Le sélecteur vient de
`listeClasses()`, dont la colonne s'appelle maintenant `inscrits`.

**L'encadré des tables fragiles** :
> **Tables 7 et 8 — les plus fragiles**
> 14 élèves en rouge ou en jaune sur la 7, 12 sur la 8.
> **Lancer un défi** — *tables 7 et 8 pré-cochées*

Les nombres viennent de `maitriseClasse()` : `eleves_jaunes + eleves_rouges`.
Le **tri** se fait sur `(eleves_jaunes + eleves_rouges) / eleves_classe`
décroissant — la part de la **classe** en difficulté. Jamais sur
`taux_maitrise`, dont le dénominateur n'est que ceux qui ont déjà travaillé la
table : une table qu'un seul élève a vue et réussie afficherait 100 % et
passerait première.

**Les jauges par table** : `maitriseClasse()` renvoie déjà `taux_maitrise` et
`taux_couverture` — ce sont les « 42 % » et « couvert 85 % » de la maquette.
Écris les deux libellés en toutes lettres, ils ne comptent pas la même chose.

**La liste des élèves**, avec les filtres *Sous le plafond · Inactifs · Tous*,
vient de `listeEleves(classe)`.

**Le bouton « Ouvrir la table 10 »** relève le plafond de **toute la classe**,
via `definirPlafondClasse`. La maquette écrit « à 3 élèves » : ce n'est pas
possible et ce n'est pas voulu — Aymeri a tranché, le plafond se relève par
classe. Écris **« Ouvrir la table 10 à toute la classe »**.

---

## 7. Ce qu'il faut voir à l'écran

- [ ] La requête du §1 renvoie **1, 1, 2**.
- [ ] Le mot « actif » n'apparaît plus nulle part pour parler de quelqu'un qui
      joue — cherche-le dans tout `frontend/src/`.
- [ ] Maquette 22 : avec un compte classé au-delà de la limite, la ligne
      épinglée montre le rang, les points et l'écart. Avec un compte dans la
      liste, elle n'apparaît pas en double.
- [ ] Avec un compte qui n'a pas joué de la semaine : pas de rang inventé,
      l'état vide s'affiche.
- [ ] Maquette 23 : l'état vide apparaît quand le classement est vide.
- [ ] Maquette 24 : l'en-tête montre les deux nombres et le plafond commun ;
      les tables fragiles sont triées sur la part de la classe en difficulté.
- [ ] `npm run build` vert, `check-tokens` vert.

---

## 8. Le commit

**D'abord les documents, ensuite le commit** — et c'est la cinquième fois :

- **`JOURNAL.md`** : ton entrée va **tout en haut du fichier**. Relis les cinq
  lignes qui suivent l'en-tête pour le vérifier avant de commiter.
- **`ETAT.md`** : la ligne « Dernière mise à jour » **en premier** — **28
  migrations, 146 cas** — puis le §3, où tu écris que le mot « actif » couvrait
  trois populations et ce qu'il est devenu, et le §5.

```
git add -A
git commit -m "Lot 21 : migration 28, classements et Ma classe sur les maquettes 22 a 24"
git push
```

---

## Ce que tu ne fais pas

- Tu ne changes **aucun calcul** : la migration 28 ne renomme que des colonnes
  et ajoute deux fonctions.
- Tu ne divises jamais les points par `ont_joue`.
- Tu ne soustrais pas l'écart au classement toi-même.
