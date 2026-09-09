# Lot 26 — le résultat d'un défi ne doit plus jamais se perdre

Front uniquement, **aucune migration**. Trois parties : un diagnostic à me
renvoyer, deux corrections certaines, et une chose qui attend ce diagnostic.

---

## 1. D'ABORD : trois questions, et tu me renvoies les réponses

Ne code rien avant d'avoir fait ça. Deux de ces réponses décident de la suite.

### a) La durée est-elle bien enregistrée en base ?

```sql
select code, type, duree_s, nb_questions, cree_le
  from defis order by cree_le desc limit 5;
```

Aymeri a créé un défi à **30 secondes**, la partie a bien duré 30 secondes,
mais deux écrans affichent « 2 min ». `creer_defi` fait
`coalesce(p_duree_s, 120)` : si la colonne contient 30, le problème est
uniquement à l'affichage (§3). Si elle contient 120, c'est que `p_duree_s`
n'est jamais arrivé, et il faut chercher dans la chaîne d'appel.

### b) Les deux parties du défi ont-elles été enregistrées ?

```sql
select s.cree_le, e.prenom, s.mode, s.nb_questions, s.score,
       s.points, s.palier, s.defi_id is not null as via_defi
  from sessions_jeu s join eleves e on e.id = s.eleve_id
 where s.cree_le > now() - interval '6 hours'
 order by s.cree_le desc;
```

Lou et Agathe ont terminé, **sans aucune erreur affichée**, et Lou apparaît
bien première au classement du défi — mais rien n'apparaît dans les
classements généraux.

- Si cette requête **ne renvoie rien** : `terminer_defi` a inséré la
  participation sans que la session soit écrite. Les deux étant dans la même
  transaction, ce serait anormal, et il faudra comprendre comment.
- Si elle renvoie **les deux parties avec des points** : l'écriture va bien,
  le problème est dans la **lecture**. Passe au point (c).

### c) Que demande exactement l'écran Classements ?

Lis `Leaderboards.jsx` et dis-moi, pour un élève au plafond 10 qui ouvre
l'onglet Progression :

- quelle valeur de **`p_palier`** part au serveur (`null`, `'tous'`, ou un
  palier précis) ;
- quelle valeur de **`p_portee`** ;
- et quelle **période** par défaut.

`classement_progression` filtre sur le palier des PARTIES jouées : une partie
sur les tables 2 à 10 est rangée en `decouverte`. Si l'écran demande un autre
palier, ou une portée qui exclut l'élève, la partie existe en base et
n'apparaît nulle part. C'est mon hypothèse principale, mais je ne peux pas la
vérifier d'ici — c'est du code d'écran.

**Renvoie-moi ces trois réponses avant de continuer.**

---

## 2. La file d'attente pour les défis — à faire quoi qu'il arrive

C'est le vrai sujet de ce lot.

`enregistrerSession` protège les parties solo (`api.js` l. 306) : si le réseau
tombe, la partie est mise de côté et rejouée plus tard. **`terminerDefi` n'a
rien.** Un défi terminé pendant un hoquet de wifi est **perdu**.

L'asymétrie est vicieuse : une partie jouée seul dans sa chambre est protégée,
un défi joué **en classe devant tout le monde** ne l'est pas. C'est le moment
où ça compte le plus, et c'est exactement ce qui est arrivé deux fois à Lou.

### La bonne nouvelle : la file est déjà générique

`mettreEnAttente(fonction, params)` stocke le **nom de la RPC**, et
`viderFile()` fait `supabase.rpc(f[0].fonction, f[0].params)`. Elle n'a rien de
spécifique à `enregistrer_session`. Il suffit d'écrire dans `terminerDefi` le
même repli que dans `enregistrerSession` :

```js
const r = await rpc('terminer_defi', params);
if (!r.ok && estPanneReseau(r.error)) {
    mettreEnAttente('terminer_defi', params);
    return { ok: true, enAttente: true, data: { maitrise: {} } };
}
return r;
```

### Pourquoi rejouer plus tard est sans danger

`defis_participants` a une clé primaire `(defi_id, eleve_id)`, et
`enregistrer_session` refuse explicitement une seconde session sur le même
`p_defi_id` (migration 21). Un résultat rejoué deux fois est refusé par le
serveur, pas dupliqué. Et `viderFile` jette une entrée définitivement refusée
au lieu de boucler.

### Ce que l'élève voit — et c'est un choix, pas un détail

**Ne lui dis pas que c'est enregistré.** Écris la vérité :

> Ton résultat est gardé sur l'iPad. Il partira dès que le wifi revient.

Il ne verra pas son nom au classement tout de suite, et il ne faut pas qu'il
croie à un bug. La ligne « X partie(s) en attente d'envoi » de l'accueil
(`partiesEnAttente`) couvre déjà ce cas : elle comptera aussi les défis.

### Une limite acceptée, à écrire dans le code

Un défi expire au bout de 24 h. Si l'iPad reste hors-ligne jusqu'au lendemain,
`terminer_defi` refusera « Ce défi est déjà terminé » et la file jettera
l'entrée. Le résultat est alors perdu pour de bon.

**C'est assumé** : le cas est rare, et fabriquer une exception au délai
d'expiration coûterait plus cher que ce qu'elle sauve. Mets-le en commentaire
au-dessus du repli, pour que personne ne le « corrige » sans savoir.

---

## 3. La durée affichée — deux chaînes en dur

Si la requête (a) confirme que la base contient bien 30 :

**`JoinChallenge.jsx` l. 211** : `'Contre‑la‑montre · 2 min'` est écrit en dur
et ne lit jamais `defiData.duree_s`.

**`Challenges.jsx` l. 46** : `CHALLENGE_TYPES` porte
`desc: '2 minutes — max de bonnes réponses'` et `timer: 120`.

La cause de fond : **la durée a deux domiciles**. `CHALLENGE_TYPES.timer` la
traite comme une constante du *mode*, alors qu'elle est devenue une propriété
du *défi*. Le moteur de jeu lit la bonne, les récapitulatifs lisent l'autre.

Donc :

- les deux écrans lisent `duree_s` **du défi** ;
- `CHALLENGE_TYPES` ne garde qu'un **défaut**, renommé pour qu'on ne s'y trompe
  plus (`dureeParDefaut` plutôt que `timer`), et sa `desc` ne mentionne plus de
  durée du tout — c'est l'écran qui l'écrit, à partir de la vraie valeur ;
- le formatage passe par **une seule fonction**. Il en existe déjà deux copies,
  `Challenges.jsx` l. 703 et l. 1920, avec la même cascade `30 / 60 / 90`
  écrite à la main. Mets-en une seule dans `logic/`, et écris-la comme une
  règle : le jour où quelqu'un ajoute 45 secondes, elle doit dire « 45 s » et
  non « 1 min ».

**Et pendant que tu y es** : `Challenges.jsx` l. 225 range `duree_s: 3` pour un
Sprint — ce sont les secondes par question, pas la durée de la partie. Même
champ, deux significations. Sépare-les.

---

## 4. Ce qui attend ton diagnostic

Je tiens en réserve une migration qui corrige la lenteur de
`classement_progression` : j'ai mesuré **277 ms** sur une base locale à 328
élèves, contre 2 ms pour `classement_classes` et 5 ms pour
`classement_records`. La fonction appelle `progression_detail()` une fois par
élève — 328 appels, deux agrégats chacun.

Je ne l'écris pas avant tes réponses, parce que si le « rien au classement »
vient de cette fonction, la lenteur et le bug sont au même endroit et se
corrigent ensemble.

---

## 5. Ce qu'il faut voir à l'écran

- [ ] Coupe le wifi juste avant la dernière réponse d'un défi, termine, puis
      rebranche : le résultat part tout seul et l'élève apparaît au classement
      du défi.
- [ ] Pendant l'attente, l'élève lit qu'il est **gardé sur l'iPad**, pas qu'il
      est enregistré.
- [ ] La ligne « partie(s) en attente » de l'accueil compte bien le défi.
- [ ] Rejoue le même défi une fois en ligne : le serveur refuse, rien n'est
      dupliqué au classement.
- [ ] Crée un défi à 30 s : les deux écrans de récapitulatif affichent
      **30 secondes**, et la partie dure 30 secondes.
- [ ] Crée un défi à 1 min 30 : les écrans affichent **1 min 30**.
- [ ] `npm run build` vert, `check-tokens` vert.

---

## 6. Le commit

`JOURNAL.md` en haut de la section « Entrées », `ETAT.md` §3 pour la file
d'attente des défis et sa limite des 24 h.

```
git add -A
git commit -m "Lot 26 : file d attente pour les defis, duree affichee lue du defi"
git push
```

---

## Ce que tu ne fais pas

- Aucune migration : tout est dans le front.
- Tu ne touches pas à `classement_progression` : elle attend ton diagnostic.
- Tu ne fais pas croire à l'élève qu'un résultat en attente est enregistré.
