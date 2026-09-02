Lot relu à `601999a` : la reformulation de l'avertissement et l'encart « Rien ne coince » sont corrects, et le diagnostic du point 1 est concluant — **les compteurs de « Mes défis » étaient justes**, `participants_tous` égale `sessions_enregistrees` sur les huit défis. Rien à corriger de ce côté.

Mais le nouveau branchement laisse passer le cas exact de la classe qui a servi au test. Trois points.

---

**1. Le filtre `dans_le_plafond_commun` doit disparaître du bouton défi.**

Dans la classe 31, voici ce que ton code produit aujourd'hui :

| table | verts / effectif | dans_le_plafond_commun |
|---|---|---|
| 11 | 1 / 2 | **false** (cadenas) |
| 2 à 10 | 2 / 2 | true |

`tablesQuiCoincent` exige `dans_le_plafond_commun && verts < classe` : la 11 est écartée par le plafond, les autres par la maîtrise. Résultat : liste vide. Et `toutMaitrise` est **false** puisque la 11 n'est pas maîtrisée. On tombe donc sur la troisième branche — **« Pas encore assez de données pour un défi ciblé »** — dans une classe qui a travaillé dix tables. C'est faux, et c'est ce que le professeur verra demain.

→ **Retire `dans_le_plafond_commun` du filtre.** Ne garde que `travaillee && eleves_verts < eleves_classe`.

La raison de fond : depuis la migration 21, le plafond commun **n'interdit plus rien**. Un défi au-dessus du plafond est jouable et le score s'enregistre, et l'écran de confirmation dit au professeur combien d'élèves sont concernés et où s'arrête le plus faible. Le filtre était la précaution d'avant la 21 ; le garder revient maintenant à **cacher au professeur la seule table qui coince**, ce qui est l'inverse exact de la raison d'être de cet écran.

Après ce changement, la classe 31 propose « Lancer un défi sur la table 11 », le professeur voit l'avertissement, et il tranche. C'est le comportement attendu.

Garde `dans_le_plafond_commun` pour ce qu'il fait déjà bien : le cadenas sur la barre.

---

**2. L'application s'ouvre en portrait.** Décision d'Aymeri.

Dans `frontend/public/manifest.json`, passe `"orientation": "any"` à `"orientation": "portrait"`.

**Ne me dis pas que c'est verrouillé pour autant.** Ce champ est respecté par Chrome et Android ; Safari sur iPad l'a longtemps ignoré et je n'ai pas trouvé de source à jour disant le contraire. Le vrai test dure dix secondes et Aymeri a l'iPad : ajouter l'application à l'écran d'accueil, l'ouvrir, tourner la tablette. Dis-moi simplement que le champ est posé — c'est lui qui vérifiera.

Ce qui compte davantage, et qui sera fait à la passe visuelle : **le portrait devient la cible de conception**, le paysage doit rester lisible sans être privilégié. Ne code rien de plus aujourd'hui — pas de message « tourne ton iPad », pas de blocage CSS.

---

**3. La table 1 ne devrait pas être proposée.**

Un défi joué hier portait sur `[2,3,6,7,8,9,10,1,4,5]` — la table 1 en fait partie, parce que `ALL_TABLES` commence à 1 et que `availableTables` la laisse passer. Or `maitrise_classe()` génère les tables **à partir de 2** : le travail sur la table 1 n'apparaît nulle part sur « Ma classe ». Un élève peut donc travailler une table que son professeur ne verra jamais.

Ce n'est pas une faille — la table 1 pèse 0,15 en difficulté, elle rapporte donc structurellement moins, il n'y a rien à y gagner. C'est une incohérence : deux écrans qui ne comptent pas les mêmes tables.

→ Dans `ChallengeConfig`, `availableTables` part de **2**. Aligne l'écran sur la base, pas l'inverse. Vérifie au passage que la Montée des tables (`ALL_TABLES.slice(1)`, ligne ~1257) n'est pas affectée — elle démarre déjà à 2.

---

**À voir à l'écran :** la classe 31 propose maintenant un défi sur la table 11 et affiche l'avertissement à la création · une classe entièrement à jour affiche toujours « Rien ne coince » · une classe sans aucune table travaillée affiche toujours « Pas encore assez de données » · la table 1 n'est plus cochable.
