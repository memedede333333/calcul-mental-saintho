# Lot 17 — le code projeté, les élèves nommés, et deux finitions

Ce lot ouvre la **maquette 9** et complète l'écran 17.

**Il commence par une tâche qui n'est pas du React : appliquer la migration 25
sur la base de développement.** C'est le §1. Tout le reste en dépend — les
écrans appellent des fonctions qui n'existent pas encore côté serveur.

---

## 1. D'abord : appliquer la migration 25

Le fichier : **`supabase/migrations/20260904090000_presences_defi.sql`**.
Il est écrit et testé — scénario complet vert, 121 cas, aucune ligne « ECHEC ».
Tu ne le modifies pas. Tu l'appliques tel quel sur la base de développement
`calcul-mental-dev`.

Utilise le moyen dont tu disposes déjà : CLI Supabase liée au projet, MCP
Supabase, ou `psql` avec la chaîne de connexion. **Si tu n'as accès à aucun,
dis-le et arrête-toi là** — Aymeri le fera dans l'éditeur SQL du tableau de
bord. Ne devine pas un identifiant, ne crée pas de compte, ne demande pas de
mot de passe dans un fichier.

### Trois interdits

1. **Ne lance JAMAIS `supabase/tests/run.sh`.** Ce script SUPPRIME une base et
   la reconstruit. Lancé contre `calcul-mental-dev`, il efface les comptes de
   bêta et toutes les données de recette. Il ne sert qu'à une base locale
   jetable.
2. **N'applique JAMAIS `supabase/seed.sql`.** Ce sont des élèves de
   démonstration.
3. **N'applique que ce fichier-là.** Les migrations 1 à 24 sont déjà passées.

### Vérifier que c'est passé

```sql
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='defis_presences') as table_creee,
  (select count(*) from information_schema.routines
    where routine_schema='public'
      and routine_name in ('presents_defi','eleves_hors_plafond')) as fonctions_creees;
```

Attendu : **`table_creee = 1`** et **`fonctions_creees = 2`**.

Deux erreurs possibles, et ce qu'elles veulent dire :

- `policy "presences_lecture_soi" ... already exists` → la migration est **déjà
  passée**. Rien à faire, continue.
- `function ... does not exist` → une migration antérieure manque sur cette
  base. **Arrête-toi et remonte le message**, ne tente pas de la réparer.

### Puis régénère les types

`frontend/src/types/database.ts` doit refléter les nouvelles fonctions.

---

## 2. Ce que la migration 25 ajoute

Trois choses, et une seule idée : **un écran ne fabrique pas une population,
il en reçoit une.**

### `avancement_defi(defi_id)` — trois compteurs de plus

```
rejoints         ont saisi le code
termines         ont fini la partie          (inchangé)
en_cours         ont rejoint et n'ont pas fini
rejoints_classe  les mêmes, restreints à la classe du défi
termines_classe  idem                        (inchangé)
attendus         les élèves ACTIFS de la classe    (inchangé)
```

`en_cours` est **compté**, pas soustrait. N'écris jamais
`rejoints - termines` : pour un défi créé avant la migration 25 la table de
présences est vide alors que les participants existent, et la soustraction
donne un nombre négatif. Le serveur, lui, compte les présents sans
participation — il donne 0, ce qui est vrai.

### `presents_defi(defi_id)` — les prénoms

```
eleve_id · prenom · avatar_emoji · classe · rejoint_le · a_termine · est_moi
```

Dans l'ordre d'arrivée. Sa longueur égale toujours `rejoints`. `a_termine`
t'évite de rapprocher deux listes toi-même : c'est lui qui dit si l'avatar doit
être grisé.

### `eleves_hors_plafond(classe, tables)` — les noms de l'écran 17

```
eleve_id · prenom · nom · plafond_tables
```

Même prédicat exactement que le compteur `eleves_hors_plafond` de
`apercu_defi_classe`. La longueur de la liste égale toujours le compteur.

### Et une règle qui change

`enregistrer_session` **refuse une partie à zéro question**. Le front ne
l'appelle déjà plus dans ce cas ; si un chemin l'appelle quand même, tu
recevras une erreur au lieu d'un enregistrement silencieux. C'est voulu.

**Deux enveloppes à ajouter dans `api.js`** (`avancementDefi` existe déjà) :

```js
export async function presentsDefi(defiId) {
    return rpc('presents_defi', { p_defi_id: defiId });
}

export async function elevesHorsPlafond(classe, tables) {
    return rpc('eleves_hors_plafond', { p_classe: classe, p_tables: tables });
}
```

---

## 3. Maquette 9 — le code projeté au tableau

C'est le seul écran de l'application qui n'est pas regardé par une personne
mais par trente. Il est conçu pour être **lu du fond de la salle** : 1280 × 720,
tout en grand, aucune information secondaire.

Ce qu'il contient, de haut en bas :

> **matHo** (logo)
> Défi de M. Desjardins · 6ᵉA · Sprint, tables 6 à 9
> **18 connectés**
>
> **Rejoindre avec le code**
> **U E W T R** ← cinq cases, énormes
>
> 🦊 🐼 🐢 🐙 🦉 🐝
> Lou, Inès, Malo, Agathe, Sacha, Nour + 12 autres
>
> *Le classement s'affichera ici à la fin*

Points d'exécution :

- **Le code fait cinq caractères**, alphabet sans ambiguïté visuelle : ni I ni 1
  ni L, ni O ni 0 (`schema.sql` l. 277). Une case par caractère.
- **« 18 connectés » vient de `rejoints`**, jamais d'un `.length` sur une liste
  tronquée à l'affichage.
- **Les avatars et les prénoms viennent de `presentsDefi`**, dans l'ordre rendu
  par le serveur — c'est l'ordre d'arrivée, et c'est ce qui fait que la classe
  se voit se remplir. N'ordonne pas alphabétiquement.
- **« + 12 autres »** est un reste d'affichage : `rejoints` moins le nombre de
  prénoms que tu montres. Ce n'est pas une population, c'est le débordement
  d'une ligne — ne l'appelle jamais autrement à l'écran.
- **Rafraîchis toutes les 3 à 5 secondes** tant que le défi est ouvert. Un
  professeur regarde cet écran justement pour voir les élèves arriver ; s'il
  faut recharger la page, l'écran ne sert à rien. Arrête le rafraîchissement
  quand le composant est démonté, sinon il tourne toute la journée.
- **À la fin**, la zone du bas laisse la place à `classementDefi`. Même
  identifiant de défi, aucun nouvel appel à inventer.

---

## 4. Écran 17 — le bouton « Voir qui »

Il attendait cette migration. `elevesHorsPlafond(classe, tables)` renvoie les
noms. Sous l'avertissement, à côté de « Ouvrir la table de X à toute la
classe › » :

> *Voir qui ›* → **Alice Dupont** (jusqu'à 10) · **Zoé Nouvelle** (jusqu'à 10) · …

Le nombre de noms doit **toujours** être égal au compteur affiché au-dessus.
S'ils diffèrent un jour, c'est que quelqu'un a filtré la liste dans l'écran :
ne filtre pas.

**Ne parle jamais de « travail » à propos de ces élèves.** `plafond_tables` est
un droit gagné par la Montée des tables, pas une trace de travail. « n'a pas
encore la table de 13 » est juste ; « n'a pas travaillé la table de 13 » est
faux et désigne une autre population.

---

## 5. Une finition du lot 16 bis

`Home.jsx` : `setProfileError(res.error || res.message || 'Impossible de
charger ton profil.')`. `res.error` peut contenir un message Postgres en
anglais. Un collégien lira `permission denied for function mon_profil`.

Écris une phrase fixe à l'écran — « Connexion perdue. Appuie sur Réessayer. » —
et envoie le détail dans `console.error`, où il sert à quelqu'un.

## 6. Ce qu'il faut voir à l'écran

- [ ] Crée un défi de classe, ouvre la maquette 9, fais rejoindre un élève
      depuis un autre navigateur : **le compteur et l'avatar apparaissent seuls,
      sans recharger**.
- [ ] Fais terminer cet élève : son avatar se grise, `en_cours` retombe à 0,
      `rejoints` reste à 1.
- [ ] Ouvre la maquette 9 sur un défi **créé avant** la migration 25 (il en
      existe dans la base de dev) : `rejoints` vaut 0, `en_cours` vaut 0, et
      **aucun nombre négatif nulle part**.
- [ ] Le code s'affiche en cinq cases, lisible à trois mètres de l'écran.
- [ ] Écran 17, 6ᵉA, tables jusqu'à 12 : le nombre de noms sous « Voir qui »
      est **exactement** le nombre annoncé au-dessus.
- [ ] Coupe le réseau au chargement de l'accueil élève : le message est en
      français et ne contient aucun mot anglais.
- [ ] La requête de vérification du §1 renvoie `table_creee = 1` et
      `fonctions_creees = 2`.
- [ ] `npm run build` vert, `check-tokens` vert, aucune couleur en dur hors
      `tokens.css`.

---

## Ce que tu ne fais pas

- **Tu ne lances pas `run.sh`** et tu n'appliques pas `seed.sql`. Voir le §1.
- **Tu ne touches pas à `logic/mastery.js`** : la règle de maîtrise change dans
  un lot à part, serveur et front en même temps.
- Aucun nouvel appel serveur en dehors des deux enveloppes du §2.

---

## 7. Le commit — c'est toi qui le fais

Quand tout est vert, commite **et pousse**. Le dépôt contient déjà des fichiers
modifiés qui font partie de ce lot et qui ne sont pas encore commités :
`ETAT.md`, `JOURNAL.md`, `supabase/tests/01_scenario.sql`,
`supabase/migrations/20260904090000_presences_defi.sql` et ce fichier-ci.
Prends-les avec tes propres modifications.

```
git add -A
git commit -m "Lot 17 : migration 25 appliquee, maquette 9, bouton Voir qui, ETAT et JOURNAL a jour"
git push
```

Avant de pousser, les trois contrôles habituels : `npm run build` vert,
`node frontend/scripts/check-tokens.mjs` vert, aucune couleur en dur hors
`tokens.css`.

Et ajoute une entrée en tête de `JOURNAL.md` sur ce que tu as fait — fait /
décidé / constaté / ensuite. Le modèle est en tête du fichier.
