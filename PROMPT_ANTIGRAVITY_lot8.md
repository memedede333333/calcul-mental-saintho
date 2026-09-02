Retours de recette sur iPad. Quatre points, dont un diagnostic à faire **avant** de coder.

---

**Point 0 — Applique la migration 23.** `supabase/migrations/20260902100000_plafond_lisible.sql`, déjà dans le dépôt. Via MCP, sans la modifier, puis régénère `database.ts`. `apercu_defi_classe` renvoie désormais aussi `plafond_commun` (le plus bas de la classe) et `plafond_max`. Tests : 99 cas, 0 ECHEC.

---

**Point 1 — Diagnostic, avant tout code.** Le professeur a créé 7 défis pour la classe 31 et l'écran « Mes défis » annonce, pour cinq d'entre eux, moins de participants qu'il ne croit en avoir eus. Le SQL de `mes_defis` sépare correctement les populations (migration 18) : je ne trouve rien à redire au code, il faut donc regarder les faits. Exécute et rends-moi les résultats bruts, sans les interpréter :

```sql
select d.code,
       d.cree_le,
       d.type,
       d.classe,
       d.tables,
       (select count(*) from public.defis_participants p where p.defi_id = d.id)
         as participants_tous,
       (select count(*) from public.defis_participants p
          join public.eleves e on e.id = p.eleve_id
         where p.defi_id = d.id and e.classe = d.classe)
         as participants_de_la_classe,
       (select string_agg(e.prenom || ' ' || left(e.nom,1) || '. (' || e.classe || ')', ', ')
          from public.defis_participants p
          join public.eleves e on e.id = p.eleve_id
         where p.defi_id = d.id)
         as qui_a_joue,
       (select count(*) from public.sessions_jeu s where s.defi_id = d.id)
         as sessions_enregistrees
  from public.defis d
 where d.classe = '31'
 order by d.cree_le desc;
```

Ce qui m'intéresse est l'écart éventuel entre `participants_tous` et `sessions_enregistrees` : une session sans participant, ou l'inverse, désignerait un abandon en cours de partie mal traité. **Ne code rien sur ce point avant ma réponse.**

---

**Point 2 — L'avertissement dit un chiffre juste avec un mot faux. Tu peux coder.**

L'écran affiche « ⚠️ 1 élève sur 2 n'a pas encore débloqué la table 15 ». **Le compteur est juste** : dans cette classe un élève a un plafond de 10, l'autre de 15. Mais le professeur l'a lu comme « 1 élève sur 2 n'a pas travaillé cette table » — et il a eu raison de s'en étonner, puisque sur « Ma classe » la table 15 est marquée « Pas travaillée » pour les deux.

Deux notions différentes, un seul mot pour les dire : `plafond_tables` est un **droit** gagné par la Montée des tables ; la maîtrise est une **trace de travail**. Le professeur ne voit le mot « débloqué » défini nulle part.

→ Remplace le texte de l'encart de confirmation par une phrase qui se suffit à elle-même, avec son point de repère :

> ⚠️ **La table 15 dépasse le niveau atteint par 1 élève sur 2.**
> Le plus faible de la classe s'arrête à la table 10. Le défi reste jouable par tous et leur score sera enregistré — ils découvriront simplement une table qu'ils n'ont pas encore débloquée par la Montée des tables.

Les nombres viennent tous de `apercu_defi_classe` : `eleves_hors_plafond`, `eleves_classe`, `table_max`, `plafond_commun`. **N'en calcule aucun.** Et si `plafond_commun` est absent (classe vide), n'affiche pas la deuxième phrase plutôt que d'écrire un tiret.

---

**Point 3 — « Ma classe » propose un rattrapage là où il n'y a rien à rattraper. Tu peux coder.**

Capture de la classe 31 : les tables 2 à 10 sont toutes à « 2 / 2 maîtrisent », la 11 à « 1 / 2 ». Et le bouton propose **« ⚔️ Lancer un défi sur les tables 2, 3, 4 »** — trois tables que toute la classe maîtrise. Le tri n'est pas en cause : à égalité parfaite il faut bien que trois tables sortent. C'est le **bouton** qui affirme quelque chose que les données ne disent pas.

→ Si aucune table travaillée n'a d'élève en difficulté ou sans trace — c'est-à-dire si, pour toutes les candidates, `eleves_verts === eleves_classe` — remplace le bouton par un message neutre :

> ✅ **Rien ne coince dans cette classe.** Toutes les tables travaillées sont maîtrisées par tout le monde. Le bouton « Découvrir » ci-dessous ouvre les tables suivantes.

Le bouton « Découvrir » reste, lui : il a du sens dans ce cas précis. La règle est la même que partout ailleurs : **un écran ne recommande que ce que les données soutiennent.**

---

**À voir à l'écran :** l'avertissement avec ses trois nombres et sa phrase de repère · une classe entièrement à jour qui n'affiche plus de faux rattrapage · une classe où une table coince, où le bouton revient normalement.
