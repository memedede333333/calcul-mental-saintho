# Lot 18 — la maîtrise devient une règle de temps

C'est le lot le plus délicat du projet : il change **ce que veut dire une case
verte** pour 350 élèves, et il touche le serveur et le front en même temps.
Lis tout avant de commencer.

---

## 1. D'abord : appliquer la migration 26

Le fichier : **`supabase/migrations/20260904140000_maitrise_au_temps.sql`**.
Écrit et testé — scénario complet vert, **129 cas**, aucune ligne « ECHEC ».
Tu ne le modifies pas.

Applique-le sur `calcul-mental-dev` avec le moyen dont tu disposes (connecteur
MCP Supabase, CLI liée, `psql`). Si tu n'as accès à aucun, dis-le et arrête-toi
là.

### Les trois interdits, inchangés

1. **Jamais `supabase/tests/run.sh`.** Ce script SUPPRIME une base et la
   reconstruit. Contre `calcul-mental-dev`, il effacerait les comptes de bêta.
2. **Jamais `supabase/seed.sql`.**
3. **N'applique que ce fichier.** Les migrations 1 à 25 sont déjà passées.

### Un point d'attention particulier à cette migration

Elle **supprime** l'ancienne signature de `enregistrer_session` avant de créer
la nouvelle. C'est indispensable : ajouter un paramètre avec une valeur par
défaut ne remplace pas une fonction, il en crée une **seconde**, et PostgreSQL
refuse alors tout appel par noms d'arguments — `function ... is not unique`.
Or `rpc()` appelle toujours par noms. Sans ce `drop`, plus une seule partie ne
s'enregistrerait. Le `drop` est dans le fichier, ne le retire pas.

### Vérifier

```sql
select
  public.seuil_reponse_rapide() as seuil_ms,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='maitrise'
      and column_name in ('serie_rapide','dernier_temps_ms')) as colonnes,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='enregistrer_session') as nb_signatures;
```

Attendu : **`seuil_ms = 3000`**, **`colonnes = 2`**, **`nb_signatures = 1`**.

Si `nb_signatures` vaut 2, le `drop` n'est pas passé : arrête-toi et remonte-le,
l'application ne fonctionnera pas.

Puis **régénère `frontend/src/types/database.ts`**.

---

## 2. Ce que la règle devient

Avant, la règle vivait dans `logic/mastery.js` : premier coup → vert, rattrapé →
orange, jamais trouvé → rouge. Elle mesurait la bonne réponse. Un élève qui
trouve 7×8 en huit secondes en comptant sur ses doigts obtenait le même vert que
celui qui répond sans réfléchir — alors que les tables se travaillent justement
pour ne plus avoir à réfléchir.

**La nouvelle règle, décidée par Aymeri, et elle est maintenant DANS LE
SERVEUR :**

| | |
|---|---|
| **vert (3)** | deux réponses justes d'affilée, du premier coup, chacune sous **3 000 ms** |
| **orange (2)** | juste mais lent, ou rattrapé, ou une seule réussite rapide pour l'instant |
| **rouge (1)** | faux |

Le niveau **est** l'état de la série. Conséquence à connaître et à ne pas
« corriger » : **un fait déjà vert répondu lentement redescend en orange.**
C'est voulu — sinon le vert ne dit plus « je la sais », il dit « je l'ai su une
fois ». Deux réponses rapides le remontent.

Le seuil est écrit à **un seul endroit**, `seuil_reponse_rapide()`. Ne le
recopie nulle part dans le front. Aucun écran n'a besoin de le connaître : le
serveur renvoie déjà des niveaux.

---

## 3. Ce que le front doit envoyer

`enregistrerSession()` reçoit un nouveau paramètre, **`p_faits`** — un
**tableau**, dans l'**ordre** des réponses, une entrée par question répondue :

```json
[
  {"fait": "7_8", "juste": true,  "premier": true,  "temps_ms": 2400},
  {"fait": "6_9", "juste": false, "premier": false, "temps_ms": 5100},
  {"fait": "7_8", "juste": true,  "premier": true,  "temps_ms": 900}
]
```

- `fait` : la clé normalisée, `cleFait(a, b)` — inchangée.
- `juste` : la réponse a fini par être trouvée dans cette question.
- `premier` : trouvée **du premier coup**, sans reprise.
- `temps_ms` : le temps entre l'affichage de la question et la **première**
  frappe validée, en millisecondes.

**Un tableau, pas une map.** Une série ne se calcule pas sur un résumé, et un
même fait posé deux fois dans la partie doit compter deux fois, dans l'ordre —
c'est ce qui permet à un élève de finir vert sur une table qu'il avait ratée en
début de partie. `construireMaitrise()`, qui gardait « le pire résultat de la
session », **disparaît** : elle écrasait exactement cette progression.

### Le chronomètre par question

`Practice.jsx` a déjà un `responseStart` (l. 444) mais il ne sert qu'à
l'affichage. Il faut :

- le poser **à l'affichage de la question**, pas à la première frappe — sinon un
  élève qui réfléchit dix secondes avant de taper mesure zéro ;
- le lire **à la validation de la réponse** ;
- le faire dans **les quatre composants de quiz**, pas seulement un : Sprint,
  Sans faute, Contre-la-montre, Montée, plus `LibreQuiz` et le quiz de défi.
  Un composant qui n'envoie pas `temps_ms` produira des élèves qui ne passent
  jamais au vert, et personne ne saura pourquoi.

Si un composant ne peut vraiment pas mesurer le temps, **n'envoie pas
`temps_ms` du tout pour ces entrées** : le serveur les traitera comme lentes,
c'est-à-dire orange. Ne mets jamais une valeur inventée.

### Ce qui disparaît et ce qui reste

- `construireMaitrise()` : **supprimée**.
- `updateMastery()` : **supprimée** — la maîtrise affichée en cours de partie
  n'est plus calculable côté écran, puisque la règle dépend d'une série stockée
  en base. Si un écran montrait une couleur pendant la partie, il montre
  maintenant la couleur d'**avant** la partie, et elle se met à jour au retour
  du serveur.
- `construireErreurs()` : **reste**, `p_erreurs` ne change pas.
- `masteryColor()` et `buildWeights()` : **restent inchangées**, elles lisent
  `niveau` et le niveau garde le même sens 1/2/3.

---

## 4. Une phrase à écrire quelque part pour l'élève

La règle change sous les pieds des élèves. Il faut qu'elle soit dite une fois,
en clair, là où ils voient la grille — dans la légende de `MasteryGrid`, sous
« À revoir · En cours · Maîtrisé · Pas testé » :

> Une case devient verte quand tu réponds juste **deux fois de suite, sans
> hésiter**.

Pas de « 3 secondes » à l'écran : un enfant qui connaît le seuil compte au lieu
de répondre. Et pas d'explication ailleurs — une phrase, à l'endroit où la
question se pose.

---

## 5. Ce qu'il faut voir à l'écran

- [ ] La requête de vérification du §1 renvoie `seuil_ms = 3000`,
      `colonnes = 2`, **`nb_signatures = 1`**.
- [ ] Joue une partie libre, réponds **vite et juste** sur la même table deux
      fois : la case passe au vert. Une seule fois : elle est orange.
- [ ] Réponds **juste mais lentement** sur une case verte : elle redescend en
      orange. Deux réponses rapides la remontent.
- [ ] Réponds **faux** sur une case verte : elle passe au rouge.
- [ ] Fais la même vérification dans **chacun** des modes — Sprint, Sans faute,
      Contre-la-montre, Montée, Libre, et un défi. Un mode qui n'envoie pas
      `temps_ms` ne fera jamais de vert : c'est le défaut le plus probable de ce
      lot, et il est invisible sans ce test.
- [ ] La légende de la grille porte la phrase du §4.
- [ ] `npm run build` vert, `check-tokens` vert.

---

## Ce que tu ne fais pas

- **Tu ne lances pas `run.sh`**, tu n'appliques pas `seed.sql`, tu n'appliques
  que la migration 26.
- **Tu ne recopies pas le seuil de 3 secondes dans le front.** Il est au
  serveur, et nulle part ailleurs.
- **Tu ne « corriges » pas la redescente du vert vers l'orange.** C'est la règle,
  pas un bug.

---

## 6. Le commit

Quand tout est vert :

```
git add -A
git commit -m "Lot 18 : migration 26 appliquee, maitrise au temps de reponse"
git push
```

Avant de pousser : `npm run build` vert, `node frontend/scripts/check-tokens.mjs`
vert, aucune couleur en dur hors `tokens.css`.

Et **mets à jour les deux documents de référence** — c'est une étape franchie,
pas un détail :

- **`JOURNAL.md`** : une entrée **en haut** du fichier (fait / décidé /
  constaté / ensuite). En haut, pas au milieu.
- **`ETAT.md`** : la ligne « Dernière mise à jour » **d'abord** — 26 migrations,
  129 cas — puis le §3, où tu ajoutes la nouvelle règle de maîtrise et sa
  raison, et le §5, où tu coches la ligne correspondante.
