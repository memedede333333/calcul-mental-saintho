**Point 0 — Applique la migration 21 avant tout le reste.**
Fichier : `supabase/migrations/20260901100000_defi_fait_autorisation.sql` (déjà dans le dépôt, commit `17cb97d`). Applique-la via MCP sur la base de dev, **sans la modifier**. Puis régénère `frontend/src/types/database.ts`. Confirme-moi que `apercu_defi_classe` existe et que `creer_defi` renvoie bien `eleves_hors_plafond` et `eleves_classe`. Les six points qui suivent en dépendent — ne commence pas avant.

**1. Le tri de « Ma classe » — le point important.** Le bloc 1 et le bouton défi se trient sur `taux_maitrise`, dont le dénominateur est `eleves_total` : ceux qui ont *déjà travaillé* la table, pas la classe. Vérifié en base, classe de 6 élèves :

```
 table | verts | total | sans_trace | taux_maitrise | taux_couverture
     4 |     2 |     5 |          1 |            40 |              83
     6 |     1 |     1 |          5 |           100 |              17
```

La table 6 finit **dernière**, donc présentée comme la mieux acquise de la classe — alors que cinq élèves sur six ne l'ont jamais ouverte. Un seul l'a vue, il a réussi, et 100 % d'un échantillon de un suffit à la classer première. `travaillee` est un seuil à **un** élève : il dit que quelqu'un a vu la table, pas que la classe l'a travaillée.
→ Trie sur **`eleves_verts / eleves_classe` croissant**, départagé par **`taux_couverture` décroissant**. Le bouton défi utilise le même ordre.

**2. `MaClasse.jsx` ligne 218**, bloc 2 : `sansTrace={d.eleves_sans_trace}`, pas `d.eleves_classe`. La valeur coïncide aujourd'hui, mais l'écran ne déduit pas.

**3. `MaClasse.jsx` ligne 278** : `pGris` est calculé sans jamais être utilisé. Supprime-le — reste de la soustraction retirée.

**4. « Lancer un défi » : la confirmation AVANT création.** Un défi de prof au-dessus du plafond des élèves est désormais jouable **et enregistrable** — plus de score perdu au bout de deux minutes de jeu. En échange, le prof doit savoir ce qu'il fait.

- Avant de créer, appelle `apercu_defi_classe(p_classe, p_tables)` → `{classe, table_max, eleves_classe, eleves_hors_plafond}`. Si `eleves_hors_plafond > 0`, affiche **« 12 élèves sur 27 n'ont pas encore débloqué la table 15 — lancer quand même ? »** et attends la confirmation.
- `creer_defi` renvoie les mêmes champs, pour l'écran qui suit la création.
- **N'invente aucun des deux nombres.** Ils viennent du serveur ensemble ; « 12 » seul ne veut rien dire.

**5. Second bouton « Découvrir les tables non abordées »** sur « Ma classe ». Candidates = `travaillee = false`. **Ne le borne pas toi-même** : depuis la migration 21, `dans_le_plafond_commun` sert à afficher le cadenas et à alimenter le message du point 4 — pas à filtrer. Le serveur tranche, l'écran affiche.

**6. Les polices, en local.** `index.html` charge Baloo 2 et Nunito depuis `fonts.googleapis.com`, et aucun fichier de police n'est dans le projet. Les iPads du collège sont filtrés par MDM : ces domaines ne seront pas autorisés, et toute l'application basculera en police système. `ETAT.md` §3 l'interdit déjà — la règle n'avait simplement jamais été appliquée.
→ Télécharge les `.woff2` de **Baloo 2** (500, 600, 700, 800) et **Nunito** (400, 600, 700, 800), mets-les dans `frontend/public/fonts/`, déclare-les en `@font-face` dans `src/styles/index.css` au-dessus des variables `--font-display` / `--font-body`, et **supprime les trois `<link>` de `index.html`** (lignes 12 à 14). Vérifie ensuite qu'aucune requête ne sort vers un domaine autre que Supabase.

**À voir à l'écran avant de dire que c'est fini :** une classe où une table n'a été vue que par un élève — elle ne doit plus remonter en tête · un défi de prof sur une table hors plafond joué jusqu'au bout par un élève plafonné — le score doit s'enregistrer · le message de confirmation avec ses deux nombres · l'onglet Réseau du navigateur sans aucun appel hors Supabase.
