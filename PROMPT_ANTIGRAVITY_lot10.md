Les trois points sont corrects dans le code : filtre retiré, `"orientation": "portrait"` posé, `availableTables` part de 2. Rien à reprendre. **Mais rien n'est commité** — les trois fichiers sont encore modifiés dans la copie de travail, donc rien n'est déployé. Aymeri s'en occupe.

Et en relisant le résultat, je vois que **mon critère était mauvais**, pas ton code. Un seul point, front uniquement.

---

**Le critère « ça coince » n'est pas `eleves_verts < eleves_classe`.**

Regarde ce que produit la classe 31 avec le filtre retiré :

| table | verts | jaunes | rouges | sans trace | effectif |
|---|---|---|---|---|---|
| 11 | 1 | 0 | 0 | 1 | 2 |
| 2 à 10 | 2 | 0 | 0 | 0 | 2 |

La table 11 passe le filtre `verts < effectif` — et pourtant **personne n'est en difficulté dessus**. Le seul élève qui l'a travaillée la maîtrise ; l'autre ne l'a jamais ouverte. Le bouton va donc proposer un « rattrapage » sur une table où il n'y a rien à rattraper.

`eleves_verts < eleves_classe` ne dit pas qu'une table est difficile. Il dit qu'elle **n'est pas finie** — ce qui mélange deux choses : des élèves qui échouent, et des élèves qui ne l'ont pas encore rencontrée. Ce sont deux actions pédagogiques différentes, et l'écran les sépare déjà en deux blocs.

→ **Une table coince s'il y a des élèves en jaune ou en rouge dessus** :

```
tablesQuiCoincent = travaillees.filter(d => d.eleves_jaunes + d.eleves_rouges > 0)
```

→ **Et le tri du bouton se fait sur la part de la CLASSE en difficulté**, décroissante :

```
(d.eleves_jaunes + d.eleves_rouges) / d.eleves_classe
```

Pas sur `eleves_total` : une table qu'un seul élève sur vingt-sept peine à faire ne passe pas devant une table où neuf élèves bloquent. Le dénominateur est la classe, comme partout ailleurs.

**Garde le tri d'affichage tel qu'il est** (`eleves_verts / eleves_classe` croissant, `taux_couverture` décroissant en départage). L'ordre des barres montre l'avancement ; le bouton, lui, désigne une difficulté. Deux questions différentes, deux critères — et c'est justement en les confondant que je me suis trompé.

**Conséquence à vérifier :** la classe 31 doit maintenant afficher **« Rien ne coince dans cette classe »**, et c'est la vérité — aucun élève n'est en jaune ni en rouge. Adapte le texte, qui promet aujourd'hui un peu trop :

> ✅ **Rien ne coince dans cette classe.**
> Aucun élève n'est en difficulté sur les tables travaillées. Le bouton « Découvrir » ci-dessous ouvre les tables suivantes.

(Et non plus « toutes les tables travaillées sont maîtrisées par tout le monde », qui est faux ici : la table 11 ne l'est pas.)

La troisième branche — « Pas encore assez de données pour un défi ciblé » — ne doit plus rester que pour une classe **sans aucune table travaillée**. Vérifie que c'est bien le cas.

---

**À voir à l'écran :** la classe 31 affiche « Rien ne coince » · une classe où un élève est en jaune sur une table propose bien le défi sur cette table · une classe neuve, sans aucune partie jouée, affiche « Pas encore assez de données ».
