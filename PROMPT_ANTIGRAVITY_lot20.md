# Lot 20 — l'écran Administration (maquette 25)

**Un seul écran, aucune migration.** Tout ce qu'il affiche existe déjà côté
serveur — j'ai vérifié chaque appel.

Les maquettes 22, 23 et 24 attendent la migration 28, qui est en cours
d'écriture. Ne les commence pas.

Référence : **`docs/design/matHo-refonte-v9.dc.html`**, écran
« 25 · Administration — Élèves, Enseignants, Journal ».

> Au passage : `v8.dc.html` et `v9.dc.html` sont **strictement identiques**
> (même empreinte), de même que les trois exports « autonome » v6, v8 et v9.
> Il n'y a qu'une seule version réelle. Travaille sur **v9**.

---

## 1. Ce que la maquette demande

Format **paysage**, à rebours du portrait imposé partout ailleurs : cet écran
s'utilise sur un Mac, pas sur un iPad tenu debout. C'est une décision du projet
(`ETAT.md` §3), ne la remets pas en portrait.

Trois zones :

**La colonne de gauche**, fond indigo, trois entrées :
- **Élèves — 347**
- **Enseignants — 14**
- **Journal d'audit**

**La zone centrale**, selon l'entrée choisie :
- filtres par classe (« Toutes », « 6ᵉ 1 », « 5ᵉ 1 »…), recherche, bouton
  « Importer une classe » ;
- un tableau : avatar, Nom, Classe, Plafond, Statut, Actions ;
- les actions par ligne : **Classe** (changer la classe) et
  **Désactiver / Réactiver** ;
- en pied de tableau : « 7 lignes sur 347 · trié par prénom ».

**Le journal d'audit** : type de changement, objet, date et auteur.
> Changement de classe · Lou Audran · 6ᵉ 1 → 5ᵉ 1 · 04/09 14:30 · prof@saintho.fr

Avec la phrase qui explique pourquoi il existe :
> Le journal ne s'efface pas. Chaque changement de classe, plafond, rôle ou
> statut y est écrit avec son auteur. C'est ce qui permet de répondre à
> « qui a fait ça ».

---

## 2. Les appels — tout existe

| Ce que l'écran montre | Ce que tu appelles |
|---|---|
| La liste des élèves | `listeEleves(classe)` — `classe = null` pour toutes |
| Changer la classe d'un élève | `modifierEleve(id, { classe })` |
| Désactiver / réactiver | `desactiverEleve(id, motif)` / `reactiverEleve(id)` |
| Les enseignants | `listeProfs()` |
| Le journal | `journalAdmin(limite)` |
| Importer une classe | l'écran d'import existe déjà — tu y renvoies, tu ne le refais pas |

`listeEleves` renvoie déjà tout ce que le tableau affiche : `prenom`, `nom`,
`classe`, `avatar_emoji`, `plafond_tables`, `palier`, `actif`, `deja_connecte`,
`derniere_connexion`, `nb_sessions`, `points_semaine`.

**Les élèves désactivés sont dans la liste**, rangés en dernier. C'est voulu :
c'est ce qui permet de les réactiver. Ne les filtre pas.

---

## 3. Les deux compteurs de la colonne de gauche

« Élèves 347 » et « 7 lignes sur 347 ».

`liste_eleves()` renvoie la liste **complète**, sans limite ni pagination :
compter dedans donne le bon nombre, et c'est légitime. Deux conditions, qui
sont la règle du projet :

1. **347 = tous les élèves, actifs et désactivés.** Si tu veux afficher les
   deux, écris les deux : « 347 inscrits · 12 désactivés ». Jamais un seul
   nombre dont on ne sait pas ce qu'il compte.
2. **Le jour où quelqu'un ajoutera une pagination à `liste_eleves`, ce
   comptage deviendra faux sans prévenir.** Mets un commentaire d'une ligne
   au-dessus, disant que le total vient de la longueur de la liste et que ça
   ne tient que tant que la fonction renvoie tout.

Et le mot **« actif » est interdit à l'écran.** Dans la base, `eleves.actif`
veut dire « pas désactivé » ; sur les écrans de classement il voudra dire « a
joué ». Deux sens pour un mot, c'est un bug qui attend. Écris **« Actif /
Désactivé »** pour le statut du compte — jamais « actif » pour parler de
quelqu'un qui joue.

---

## 4. Trois règles de fond à ne pas casser

**On ne supprime jamais un élève.** La maquette écrit la raison, garde-la à
l'écran : « On ne supprime jamais un élève en cours d'année. On le désactive :
ses résultats restent, son accès s'arrête. » Aucun bouton « Supprimer » nulle
part.

**Désactiver demande une confirmation**, avec le nom de l'élève dans la
question. C'est le geste le plus lourd de cet écran.

**La recherche ne stocke rien.** Le projet interdit tout champ de texte libre —
la raison est qu'on ne peut pas modérer ce que 350 collégiens écrivent. Une
recherche qui filtre la liste déjà chargée, côté écran, sans rien envoyer ni
enregistrer, ne tombe pas sous cette règle. Mais elle doit rester exactement
ça : un filtre local, jamais une valeur qu'on envoie au serveur ou qu'on garde.

---

## 5. Ce qu'il faut voir à l'écran

- [ ] Le tableau montre les élèves **désactivés** en fin de liste, avec un
      bouton « Réactiver ».
- [ ] Changer la classe d'un élève, puis ouvrir le journal : le changement y
      est, avec le bon auteur et la bonne heure.
- [ ] Désactiver un élève demande confirmation et nomme l'élève.
- [ ] Le mot « actif » n'apparaît nulle part pour parler de quelqu'un qui joue.
- [ ] En paysage sur un écran de Mac, rien ne déborde ; en portrait sur iPad,
      c'est lisible même si ce n'est pas la cible.
- [ ] `npm run build` vert, `check-tokens` vert, aucune couleur en dur hors
      `tokens.css`.

---

## 6. Le commit

**D'abord les deux documents, ensuite le commit.** Trois fois de suite ton
entrée de journal s'est glissée au milieu du fichier :

- **`JOURNAL.md`** : ton entrée va **tout en haut du fichier**, avant l'entrée
  la plus récente. Vérifie-le en relisant les cinq premières lignes après
  l'en-tête.
- **`ETAT.md`** : la ligne « Dernière mise à jour » **en premier**, puis le §5.

```
git add -A
git commit -m "Lot 20 : ecran Administration sur la maquette 25"
git push
```

---

## Ce que tu ne fais pas

- **Les maquettes 22, 23 et 24** : elles attendent la migration 28.
- **Aucune migration**, aucun nouvel appel serveur : les six fonctions du §2
  existent toutes.
