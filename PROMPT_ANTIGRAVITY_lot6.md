Lot relu dans le code. Migration 22 et `01_scenario.sql` intacts (empreintes vérifiées), bouton de réparation correct, onglet Import bien réservé à l'administrateur, résultat d'import qui présente ses trois nombres sans les additionner. Rien à corriger là-dessus.

**Et ta trouvaille du point 3 est juste, et importante.** `StudentRow` lit `eleve.connecte`, une propriété que `liste_eleves` ne renvoie pas — elle s'appelle `deja_connecte`. Donc `undefined !== false` vaut `true`, et le badge « jamais connecté » **ne s'est jamais affiché pour personne**. Bien vu : je ne l'avais pas repéré.

---

**Point 1 — Le diagnostic d'abord, avant tout code.** La passe de réparation n'a rattaché **0 fiche**. Cela veut dire que l'élève bloquée en recette ce matin ne l'était pas pour la raison qu'on a corrigée. Il faut savoir laquelle avant d'aller plus loin. Exécute ces deux requêtes via MCP sur la base de dev et rends-moi les résultats bruts, sans les interpréter :

```sql
-- 1. Sa fiche, et le compte Google qui porterait la même adresse
select e.email, e.actif, e.classe, e.user_id,
       u.id as compte_meme_adresse, u.email as adresse_du_compte
  from public.eleves e
  left join auth.users u on lower(u.email) = lower(e.email)
 where e.email ilike '%cheurlin%' or e.nom ilike '%cheurlin%'
    or e.prenom ilike '%agathe%';

-- 2. Les comptes Google qui n'appartiennent à personne
select u.id, u.email, u.created_at
  from auth.users u
 where not exists (select 1 from public.eleves e where e.user_id = u.id)
   and not exists (select 1 from public.profs  p where p.user_id = u.id)
 order by u.created_at desc;
```

La requête 2 est la décisive. Trois lectures possibles, et elles mènent à trois corrections différentes :

- **Un compte y figure avec une adresse proche mais pas identique** à celle de la fiche (faute de frappe, mauvais domaine, ou un compte Google personnel utilisé au lieu du compte scolaire) → c'est une erreur de saisie, pas un défaut du code.
- **Aucun compte orphelin, et la fiche a bien un `user_id`** → elle s'est connectée sur l'iPad avec **un autre compte Google** que celui rattaché. Safari sur iPad garde parfois une session Google différente de celle du Mac.
- **La fiche a `actif = false`** → `eleve_courant()` exige `actif`, donc elle est refusée exactement de la même manière. Ce serait le troisième message identique pour une cause différente.

**Ne code rien tant que je n'ai pas ces résultats.**

**Point 2 — Le badge de la liste des élèves. Décision, tu peux coder.** Trois états, et surtout : **le mot « connecté » disparaît**. L'écran ne sait pas si quelqu'un s'est connecté ; il sait si un compte Google est rattaché à la fiche, et combien de parties ont été jouées. Ce sont deux faits distincts, chacun avec sa propre source, et l'écran n'en déduit aucun troisième.

| Condition | Ce qui s'affiche |
|---|---|
| `deja_connecte === false` | `⏳ compte Google pas encore rattaché` |
| `deja_connecte === true` et `nb_sessions === 0` | `◻︎ compte rattaché — n'a pas encore joué` |
| `deja_connecte === true` et `nb_sessions > 0` | rien de particulier : le nombre de parties suffit |

Et lis bien **`eleve.deja_connecte`**, pas `eleve.connecte`.

Pourquoi ce changement de mots : « jamais connecté » était une **déduction**, et elle était fausse. L'élève bloquée ce matin s'était connectée — l'écran aurait affirmé le contraire. `deja_connecte` ne dit qu'une chose, que la fiche a un compte rattaché. Le libellé doit dire cette chose-là, pas ce qu'on en conclut. C'est la règle du §3 d'`ETAT.md` appliquée à un texte au lieu d'un chiffre.

**À voir à l'écran :** une fiche créée à l'instant → `⏳ compte Google pas encore rattaché` · une fiche rattachée par le bouton de réparation → `◻︎ compte rattaché — n'a pas encore joué` · un élève qui a joué → ni l'un ni l'autre.
