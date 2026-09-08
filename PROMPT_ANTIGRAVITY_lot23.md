# Lot 23 — les profils et les classements (écrans 28 à 32)

Cinq écrans de `docs/design/matHo-refonte-v10.dc.html`, et **deux migrations**.

> **Attention à la numérotation.** Dans ton dernier message tu as décalé les
> écrans : la modale d'avatar enseignant n'est pas l'écran 28, elle fait partie
> de l'écran **36** (lot 24), et l'écran **29 est le profil ÉLÈVE**, qui avait
> disparu de ta liste. La bonne correspondance :
>
> | | |
> |---|---|
> | **28** | Mes défis passés (`MesDefis.jsx`) |
> | **29** | Profil **élève** (`Profile.jsx`) |
> | **30** | Profil **enseignant** (`Profile.jsx`) |
> | **31** | Classements — Records (`Leaderboards.jsx`) |
> | **32** | Classements — Salle des profs (`Leaderboards.jsx`) |

---

## 1. D'abord : appliquer les migrations 29 et 30

Dans cet ordre :

1. **`supabase/migrations/20260908210000_salle_des_profs.sql`**
2. **`supabase/migrations/20260908230000_profil_et_place_records.sql`**

Écrites et testées ensemble — **167 cas verts**. Tu ne les modifies pas.

Mêmes interdits : **jamais `run.sh`**, **jamais `seed.sql`**, **ces deux
fichiers seulement**. Puis régénère `frontend/src/types/database.ts`.

La 29 **supprime et recrée** `classement_profs` et `mes_defis` : leur retour
change de forme, et `create or replace` ne sait pas faire ça.

### Vérifier

```sql
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='profs'
      and column_name='avatar_emoji') as colonne_avatar,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname in
      ('initiales_de','changer_avatar_prof','entete_salle_des_profs','ma_place_records')) as nouvelles,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='classement_profs') as sig_profs,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='mes_defis') as sig_defis;
```

Attendu : **`colonne_avatar = 1`**, **`nouvelles = 4`**, **`sig_profs = 1`**,
**`sig_defis = 1`**.

### Quatre enveloppes à ajouter dans `api.js`

```js
export async function entetteSalleDesProfs(periode = 'mois') {
    return rpc('entete_salle_des_profs', { p_periode: periode });
}

export async function maPlaceRecords(categorie = 'serie', periode = 'tout',
                                     portee = 'classe', palier = null) {
    return rpc('ma_place_records', {
        p_categorie: categorie, p_periode: periode,
        p_portee: portee, p_palier: palier,
    });
}

export async function changerAvatarProf(emoji) {
    return rpc('changer_avatar_prof', { p_emoji: emoji });
}
```

(La quatrième, `initiales_de`, n'est jamais appelée depuis le front : les
initiales arrivent déjà calculées dans les réponses.)

---

## 2. Écran 28 — Mes défis passés

`mesDefis()` renvoie maintenant **`rejoints`** à côté de **`participants`**.

> **F C 7 X Q** — En cours · expire dans 18 h
> Sprint · 20 questions · Tables 6, 7, 8, 9 · Classe 6ᵉA
> **18 ont rejoint · 16 ont terminé**
> *Voir le podium* · *Projeter au tableau*

**Deux populations, deux verbes, jamais l'un sans l'autre.** `rejoints` = ont
saisi le code, `participants` = ont **terminé**. Ne les soustrais pas : sur un
défi créé avant la migration 25 la table de présences est vide et la différence
serait négative.

Les onglets **En cours / Terminés** se font sur `encore_ouvert`, que la
fonction renvoie déjà. « expire dans 18 h » se calcule sur `expire_le`.

**« Projeter au tableau »** ouvre l'écran 26, déjà livré au lot 22.

**L'état vide** est dans la maquette, garde-le : « Aucun défi en cours — Lance
un défi à ta classe ou à tes amis pour commencer. »

---

## 3. Écran 29 — Profil élève

Tout vient de `monProfil()`, complété par la migration 30.

### Les quatre comptes de la grille

> 42 sues · 31 justes mais lentes · 21 à revoir · 6 pas encore vues

**Même règle de symétrie que l'accueil** : on compte les **cases affichées**,
pour chaque couple (r, c) de `1..plafond`, en lisant `maitrise[cleFait(r,c)]`.
Niveau 3 = sues, 2 = justes mais lentes, 1 = à revoir, absent = pas encore vues.

**Les quatre nombres doivent faire exactement `plafond × plafond`.** C'est ta
vérification : s'ils ne tombent pas juste, tu comptes les entrées au lieu des
cases.

### Les quatre tuiles

`records.points_total`, `records.jours_actifs`, `records.nb_sessions`,
`records.meilleure_serie`.

**`jours_actifs` est nouveau et compte TOUS les jours joués.** Ne le confonds
pas avec `jours_actifs_7j`, qui est une fenêtre glissante de sept jours : deux
populations, deux noms, et le libellé « jours d'entraînement » désigne le
premier.

### Les records

`meilleur_sprint` (nouveau, en secondes), `meilleur_chrono`, `meilleure_serie`,
`plus_haute_table`.

**« Montée des tables — débloquée le 3 septembre »** vient de
`profil.plafond_atteint_le`. Cette date n'est stockée nulle part : elle est
**déduite** de la première partie de Montée ayant produit le plafond actuel.
**Quand elle vaut `null`, tu n'écris aucune date** — l'élève est encore au
plafond de départ, il n'a rien débloqué. Pas de « depuis toujours », pas de
date de création de compte.

### L'avatar

« Change d'avatar quand tu veux — c'est le seul réglage à toi. » C'est exact et
c'est la phrase à garder. `changerAvatar` reste inchangé.

---

## 4. Écran 30 — Profil enseignant

`monProfilProf()` renvoie maintenant `avatar_emoji`, `initiales`, et les
chiffres du mois : `points_mois`, `parties_mois`, `sprint_mois`.

La maquette annonce « Salle des profs · **ce mois** » : utilise ces trois-là,
pas le total.

**Les classes favorites** : `listeClasses()` (colonne **`inscrits`** depuis la
migration 28) et `definirMesClasses()`. La phrase de la maquette dit à quoi ça
sert — « vos classes favorites apparaissent en tête des sélecteurs » — garde-la,
c'est un raccourci d'affichage et **ça n'a aucun effet sur les droits** : un
enseignant voit toutes les classes.

**L'avatar de l'enseignant** : `changerAvatarProf(emoji)`, ou
`changerAvatarProf(null)` pour revenir aux initiales. La modale elle-même est
l'écran 36, au lot 24 — ici, l'avatar s'affiche seulement, avec les initiales
en repli.

---

## 5. Écran 31 — Classements, Records

Quatre catégories : **Sprint · temps**, **Chrono · score**, **Sans faute ·
série**, **Montée · table**. Elles existent toutes les quatre dans
`classementRecords(p_categorie)` : `'sprint'`, `'chrono'`, `'serie'`,
`'montee'`. Rien à ajouter.

**Le Sprint se classe sur le temps le plus COURT.** Le serveur le trie déjà
dans le bon sens ; ne le retrie pas.

**La ligne épinglée**, comme sur l'écran 22 :

> **12** 🦊 Lou A. *(toi)* — **1 min 02** · *3 secondes de moins et tu passes 11ᵉ*

Elle vient de `maPlaceRecords(categorie, periode, portee, palier)` :
`rang`, `valeur`, `ecart_au_dessus`.

**`ecart_au_dessus` est toujours positif** et se lit « ce qu'il te manque » :
des secondes à retrancher pour le Sprint, des points ou des tables à gagner
ailleurs. **Ne le calcule pas toi-même** — une soustraction dans l'écran
afficherait un nombre négatif une fois sur deux, selon le sens du tri.

Zéro ligne = l'élève n'a pas de record dans cette catégorie : pas de ligne
épinglée, pas de rang inventé.

**Le filtre de palier** et sa phrase : « Les records ne se comparent qu'à
plafond égal — un élève au plafond 20 a plus de faits à retenir. » Garde-la,
elle explique une règle que personne ne devinerait.

---

## 6. Écran 32 — Salle des profs

`classementProfs(categorie, periode, limite)` renvoie maintenant, **après** les
six colonnes du contrat commun : `initiales`, `role`, `points`,
`meilleur_sprint`.

> **Collègue · Rôle · Points · Sprint**
> 1 🦉 M. Dupont — Professeur — 650 — 44 s
> 4 🦊 M. Desjardins *(vous)* — Administrateur — 441 — 52 s

- **`avatar` vaut `null` quand le collègue a choisi ses initiales.** Tu affiches
  alors `initiales`. **Jamais d'emoji par défaut** : `null` est un choix, pas un
  trou.
- **`points` et `meilleur_sprint` sont là quelle que soit la catégorie triée** :
  les deux colonnes s'affichent en un seul appel.
- **Pas de matière.** La maquette écrit « Maths · 6ᵉ, 5ᵉ » ; il n'y a pas de
  colonne `matiere` et il n'y en aura pas — quatorze adultes, un champ que
  personne ne remplirait, et une matière périmée affichée comme un fait vaut
  moins que rien. Écris le **rôle** : « Professeur » ou « Administrateur ».

**Le pied de l'écran** : « 14 collègues ont un compte · 9 ont joué ce mois ».
Les deux nombres viennent de `entetteSalleDesProfs(periode)` — `inscrits` et
`ont_joue`. **Ne les fabrique pas** en comptant `listeProfs()` d'un côté et les
lignes du classement de l'autre : ce sont deux appels, deux instants, et c'est
exactement ce qui a produit cinq bugs ici.

L'onglet **Profs** n'apparaît que pour un enseignant connecté.

---

## 7. Une correction du lot 22

`JoinChallenge.jsx` l. 256 :

```js
`Ton résultat est enregistré : ${moiResult.score} sur ${moiResult.questions || 20} en …`
```

`classement_defi` ne renvoie **pas** de champ `questions` : `moiResult.questions`
est toujours `undefined`, et l'écran affiche donc **« sur 20 » en dur** à tous
les élèves, y compris sur un défi de 15 questions.

Supprime le dénominateur : « Ton résultat est enregistré : 17 points, en
1 min 02. » Le score seul est juste.

---

## 8. Ce qu'il faut voir à l'écran

- [ ] La requête du §1 renvoie **1, 4, 1, 1**.
- [ ] Écran 29 : les quatre comptes de la grille additionnés font exactement
      `plafond × plafond`. Teste au plafond 10 **et** au plafond 15.
- [ ] Écran 29 : un élève qui n'a jamais fait de Montée n'a **aucune date** sous
      « Montée des tables ».
- [ ] Écran 31 : avec un compte classé au-delà de la limite, la ligne épinglée
      montre le rang et l'écart. Vérifie sur **Sprint** : l'écart doit être
      positif et se lire « 3 secondes de moins », pas « −3 ».
- [ ] Écran 32 : un collègue sans emoji affiche ses initiales, pas un emoji par
      défaut. Change ton avatar, recharge : il suit.
- [ ] Écran 28 : un défi rejoint mais non terminé montre « 1 a rejoint · 0 ont
      terminé », et aucun nombre négatif sur un vieux défi.
- [ ] `npm run build` vert, `check-tokens` vert.

---

## 9. Le commit

**D'abord les documents, ensuite le commit :**

- **`JOURNAL.md`** : ton entrée va **tout en haut de la section « Entrées »**,
  juste sous ce titre.
- **`ETAT.md`** : la ligne « Dernière mise à jour » **en premier** — **30
  migrations, 167 cas** — puis le §3 et le §5.

```
git add -A
git commit -m "Lot 23 : migrations 29 et 30, profils et classements (ecrans 28 a 32)"
git push
```

---

## Ce que tu ne fais pas

- **L'écran 35 (Apprendre) et l'écran 36 (les modales)** : ils sont au lot 24.
- Tu ne recalcules aucun rang, aucun écart, aucune population : tout vient du
  serveur.
