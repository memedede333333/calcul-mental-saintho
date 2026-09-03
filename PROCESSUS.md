# Le processus — qui fait quoi, et dans quel ordre

> Ce fichier fait foi. Il ne change plus. S'il doit changer, on le modifie ici
> et nulle part ailleurs.

## Les trois rôles

| Qui | Fait | Ne fait pas |
|---|---|---|
| **Claude Design** | Conçoit les écrans. **Décide** de la mise en page, de la hiérarchie, de ce qui va où. | N'écrit pas de React, ne décide pas du SQL. |
| **Claude (chat)** | Écrit le SQL et les migrations, les teste, relit le code d'Antigravity, rédige les messages. Donne des **faits vérifiés**, pas des orientations de design. | N'écrit pas de React. N'impose pas de choix de conception. |
| **Antigravity** | Écrit le React. C'est lui qui voit le résultat à l'écran. | N'écrit pas le SQL, ne redessine pas. |
| **Aymeri** | Relaie, décide, teste sur iPad, applique les migrations. | — |

---

## Claude Design

**Une seule conversation, jamais deux.** Le canevas des maquettes vit dans la
conversation : en ouvrir une autre crée un second canevas, et les deux
divergent. On a déjà eu le cas avec `.dc.html` v1 et v2.

### Au début d'une passe de conception

```
cd ~/Documents/Calcul\ mental
python3 outils/paquet_claude_design.py
```

Le script écrit `docs/design/CODE_POUR_CLAUDE_DESIGN.md` : le client API, le
système visuel, les onze écrans, **les migrations SQL** et `ECRANS.md`. Tout ce
qu'il faut pour qu'il vérifie lui-même ce que la base calcule.

Puis, dans la conversation Claude Design :

1. joindre `docs/design/CODE_POUR_CLAUDE_DESIGN.md`
2. joindre le logo si c'est la première fois
3. coller le message du moment

### Pendant une passe

**On ne regénère pas le paquet.** Un paquet qui change au milieu d'une
conversation est pire qu'un paquet périmé : il ne sait plus quelle version il a
lue.

Pour un simple retour, un message suffit — **aucune pièce jointe**.

### Ce que le message contient, et rien d'autre

- des **faits vérifiés dans le code**, avec le nom du fichier et la ligne ;
- ce que le serveur renvoie et ce qu'il ne renvoie pas ;
- les **erreurs de fait** (un domaine faux, un dénominateur en dur) ;
- les **questions** ouvertes.

Pas de recommandation de conception. Pas d'option écrite pour convaincre. S'il
manque une information pour décider, on la lui donne — on ne décide pas à sa
place.

---

## Antigravity

**Il travaille dans le dépôt.** On ne lui joint jamais de fichier : on lui dit
lequel lire.

1. Le message est écrit dans un fichier à la racine :
   `PROMPT_ANTIGRAVITY_lotNN.md`, commité et poussé.
2. On lui dit une phrase : « `git pull`, puis lis `PROMPT_ANTIGRAVITY_lotNN.md`. »
3. Il rend son travail **en envois** — pas un seul rapport à la fin. Un lot qui
   touche onze écrans ne se relit pas d'un bloc.
4. À chaque envoi il donne : les captures, ce qui a résisté, ce qu'il a décidé
   seul, et **avec quel compte regarder chaque écran** (`Home.jsx` contient
   l'accueil élève ET l'accueil professeur ; `Challenges.jsx` en contient
   plusieurs).

### Les contrôles avant chaque commit

- `npm run build` sans erreur ;
- aucune couleur en dur hors `tokens.css` ;
- **aucun `var()` ne pointe vers une variable qui n'existe pas** — c'est le
  contrôle qui manquait le 3 septembre : 279 appels morts, aucune erreur, un
  tiers du CSS évaporé en silence.

### Ce qu'il ne fait jamais

- lancer `supabase/tests/run.sh` contre Supabase : le script détruit et recrée
  une base ;
- écrire du SQL directement dans l'éditeur Supabase : tout passe par une
  migration versionnée.

---

## Claude (chat)

- Écrit les migrations, les teste sur une base locale reconstruite depuis zéro,
  **n'affirme jamais le comportement d'une fonction sans l'avoir exécutée**.
- Toute modification du SQL ajoute un cas à `supabase/tests/01_scenario.sql`,
  et le scénario complet doit repasser au vert.
- Vérifie les rapports d'Antigravity **dans le code, pas dans le rapport**.
- Ne commite pas : donne la commande.
- Met à jour `ETAT.md` (la date d'en-tête en premier), `JOURNAL.md`, et
  resynchronise `claude/ETAT.md` dans les connaissances du projet.

---

## L'ordre entre les trois

Les trois ne travaillent jamais sur le même écran en même temps.

```
Claude Design dessine  →  Claude relit et écrit le SQL  →  Antigravity code
        ↑                                                        │
        └──────────────── ce qui a résisté à l'écran ────────────┘
```

Pendant que Claude Design réfléchit à un écran, Antigravity en code un autre.
Aymeri, lui, avance sur ce qui ne dépend d'aucun des trois : la base de
production, l'import des 350 élèves, Jamf, le RGPD.
