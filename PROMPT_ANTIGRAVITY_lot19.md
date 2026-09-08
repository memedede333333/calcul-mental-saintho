# Lot 19 — la grille de l'élève doit bouger après sa partie

Le lot 18 est bon : la règle est au serveur, le chronomètre est dans les six
quiz, les défis relaient `p_faits`. J'ai tout relu dans le code.

Mais il a ouvert un trou, et **c'est mon lot 18 qui te l'a fait ouvrir** :
je t'ai demandé de supprimer `updateMastery()` sans dire ce qui le remplaçait.

---

## 1. Le défaut

`maitrise` est chargée **une seule fois**, à la connexion — `App.jsx` l. 102.
Jusqu'au lot 18, `Practice.jsx` compensait localement : après chaque partie il
faisait `setMastery(prev => ({...prev, ...maitriseSortie}))`. Cette ligne a
disparu, et rien ne l'a remplacée.

Résultat, aujourd'hui :

- Un élève termine une partie, ouvre sa grille : **rien n'a changé.**
- Il rejoue : `buildWeights()` repose les mêmes questions avec les mêmes poids,
  en ignorant ce qu'il vient d'apprendre.
- Ça dure jusqu'à ce qu'il se déconnecte et se reconnecte.

La grille est la seule récompense visible du travail. Elle est figée.

Le même trou existait déjà pour les modes de `Challenges.jsx` et pour les
défis, qui n'avaient jamais eu de compensation locale.

---

## 2. La correction, côté serveur : migration 27

Fichier : **`supabase/migrations/20260904200000_maitrise_renvoyee.sql`**.
Écrit et testé — **137 cas verts**.

`enregistrer_session` renvoie maintenant, dans son résultat, une clé
**`maitrise`** : le niveau **à jour** des **seuls faits touchés par la partie**.

```json
{
  "session_id": "...", "points": 82, "palier": "confirme",
  "plafond_tables": 10, "nouveaux_badges": [],
  "maitrise": { "7_8": 3, "6_9": 1, "4_7": 2 }
}
```

Pas toute la grille — quelques cases, dans la réponse d'un appel qui avait lieu
de toute façon. Aucun second appel, aucune règle dans l'écran.

`terminer_defi` relaie la même clé : sans ça, la grille d'un élève qui ne joue
que des défis en classe ne bougerait pas de la séance.

### Applique-la d'abord

Même méthode et mêmes interdits que les fois précédentes : **jamais
`run.sh`**, **jamais `seed.sql`**, **n'applique que ce fichier**. Puis régénère
`frontend/src/types/database.ts`.

Vérification :

```sql
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='enregistrer_session') as sig_session,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='terminer_defi') as sig_defi;
```

Attendu : **1 et 1**. Cette migration ne change pas les signatures, donc si l'un
des deux vaut 2, c'est un reste de la migration 26 — arrête-toi et remonte-le.

---

## 3. La correction, côté front

Le niveau vient du serveur. **L'écran ne recalcule rien, il pose ce qu'il
reçoit.**

### a) Faire remonter la maîtrise jusqu'à `App.jsx`

C'est `App.jsx` qui détient `maitrise` et l'envoie à `Practice` et `Challenges`.
C'est donc lui qui doit la mettre à jour. Ajoute-lui un gestionnaire :

```js
const handleMaitriseMaj = useCallback((maj) => {
    if (!maj || typeof maj !== 'object') return;
    setMaitrise(prev => ({ ...prev, ...maj }));
}, []);
```

et passe-le en prop à `Practice` **et** à `Challenges`.

### b) L'appeler aux trois endroits où une partie se termine

- **`Practice.jsx`**, dans le `.then(res => ...)` de `handleDone` : quand
  `res.ok`, appelle le gestionnaire avec `res.data?.maitrise`.
- **`Challenges.jsx`**, dans `handleDone` (modes solo) : pareil.
- **`Challenges.jsx`**, dans `envoyerDefi` : la réponse de `terminerDefi` porte
  la même clé.

Et fais-le aussi **dans l'état local** de `Practice` (`setMastery`), pour que la
grille affichée à l'écran de résultats soit à jour tout de suite, sans attendre
un re-rendu du parent.

### c) Ce que tu ne fais pas

- **Tu ne recalcules aucun niveau dans le front.** Ni `construireMaitrise`, ni
  rien qui lui ressemble. Le seul chiffre qui entre dans la grille est celui que
  le serveur a renvoyé.
- **Tu ne rappelles pas `monProfil()`** après une partie. C'est un appel entier
  pour trois cases, et il crée une course avec l'écran de résultats.
- **Tu ne touches pas à la file d'attente hors-ligne.** Une partie mise en file
  ne renvoie rien : la grille bougera au prochain chargement, c'est normal et
  c'est acceptable.

---

## 4. Ce qu'il faut voir à l'écran

- [ ] La requête du §2 renvoie **1 et 1**.
- [ ] Joue une partie libre, réponds vite et juste **deux fois** sur la même
      table, puis **ouvre ta grille sans recharger la page** : la case est verte.
- [ ] Rejoue immédiatement : les questions ne reviennent plus avec le même
      poids qu'avant — un fait passé au vert doit se raréfier.
- [ ] Fais la même chose **depuis un défi** : joue-le, puis ouvre la grille. Elle
      doit avoir bougé. C'est le cas qui n'a jamais marché.
- [ ] Réponds **faux** sur une case verte : elle passe au rouge dans la grille,
      tout de suite.
- [ ] `npm run build` vert, `check-tokens` vert.

---

## 5. Le commit

```
git add -A
git commit -m "Lot 19 : migration 27 appliquee, la grille se met a jour apres chaque partie"
git push
```

Puis les deux documents, comme d'habitude :

- **`JOURNAL.md`** : une entrée **en haut** du fichier.
- **`ETAT.md`** : la ligne « Dernière mise à jour » **d'abord** — **27
  migrations, 137 cas** — puis le §3, où tu notes que le serveur renvoie
  désormais la maîtrise des faits touchés, et pourquoi (la grille était figée
  jusqu'à la reconnexion).
