**Interruption — ça bloque la recette.** Une élève ajoutée depuis l'écran Administration apparaît bien dans la liste et se voit refuser l'accès sur iPad : « Ce compte n'est pas reconnu. Demande à ton professeur. »

**La cause, reproduite sur base neuve.** `eleves.user_id` n'est renseigné QUE par le trigger `on_auth_user_created`, qui se déclenche à la **création** du compte Supabase Auth — c'est-à-dire à la toute première connexion Google. Si la personne s'est connectée AVANT que sa fiche existe, le trigger n'a rien trouvé, et plus rien ne le rattrape : créer la fiche ensuite ne renseigne pas `user_id`. Or `eleve_courant()` et toutes les politiques RLS reposent dessus.

```
fiche créée AVANT le compte Google  →  qui_suis_je() = 'eleve'
compte Google créé AVANT la fiche   →  qui_suis_je() = 'inconnu', user_id = null
```

L'élève est bloquée **définitivement**, et rien ne le signale : sa fiche est normale à l'écran. À la rentrée échelonnée classe par classe, ce cas est probable plutôt qu'exceptionnel.

---

**Point 0 — Applique la migration 22.** Fichier `supabase/migrations/20260901170000_rattachement_tardif.sql`, déjà dans le dépôt. Applique-la via MCP **sans la modifier**, puis régénère `database.ts`. Elle contient une passe de réparation immédiate : dis-moi combien de fiches elle a rattachées (`NOTICE` en fin d'exécution).

Elle apporte :

- `rattacher_par_email()` — helper interne, **non exposé au client**, à ne pas appeler depuis le front.
- `reparer_rattachements()` — réservé à l'administrateur, rejouable, renvoie `{rattaches: n}`.
- `ajouter_eleve` et `importer_eleves` rattachent désormais à chaque passage. `importer_eleves` renvoie en plus `rattaches`.

**Point 1 — Un bouton « Réparer les rattachements » dans l'onglet Administration.** Visible pour l'administrateur seulement. Il appelle `reparer_rattachements()` et affiche le retour : « 4 fiches rattachées à leur compte Google » ou « Aucune fiche à rattacher ». C'est le geste à faire après chaque import de rentrée.

**Point 2 — Le résultat de l'import doit montrer `rattaches`.** `importer_eleves` renvoie maintenant `crees`, `mis_a_jour` et `rattaches`. Affiche les trois. **Ne les additionne pas et n'en déduis rien** : `rattaches` recoupe les deux autres, ce n'est pas une troisième catégorie disjointe. Une phrase par nombre, chacune avec sa population :
> « 27 élèves créés, 3 mis à jour. 5 avaient déjà un compte Google : ils ont été rattachés. »

**Point 3 — Dans la liste des élèves, distinguer trois états, pas deux.** Aujourd'hui l'écran oppose « s'est connecté » à « ne s'est jamais connecté » sur la seule valeur `user_id is not null`. Après la migration 22 ce raccourci reste vrai, mais dis-moi si l'écran affiche quelque part un texte du genre « ne s'est jamais connecté » alors que la fiche vient seulement d'être créée — c'est le message qui a masqué le défaut pendant tout le test d'aujourd'hui. **Ne code rien pour ce point sans me répondre d'abord** : je veux savoir ce que l'écran dit exactement avant de décider.

**À voir à l'écran :** le bouton de réparation qui renvoie un nombre · le résultat d'import avec ses trois nombres · et, si tu peux le fabriquer sur la base de dev, une fiche créée après son compte Google qui entre bien dans l'application.

**Tests :** 95 cas, 0 ECHEC, `run.sh` rejoué de bout en bout. Les cinq nouveaux (91-95) couvrent : fiche créée après le compte · import qui rattrape · bouton de réparation et son refus à un non-administrateur · impossibilité de reprendre le compte de quelqu'un d'autre · et la barrière d'entrée toujours fermée pour un compte Google sans fiche.
