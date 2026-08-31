# Le projet Claude — instructions et connaissances

> Ce fichier existe pour une seule raison : les instructions du projet Claude
> décrivaient encore, au 31 août 2026, l'architecture **Google Apps Script +
> Google Sheets**, abandonnée depuis. Un chat neuf les lit et part faux dès la
> première réponse. Voici ce qu'il faut mettre à la place.

---

## 1. Les instructions du projet — texte à coller

Dans claude.ai : le projet **Calcul mental saintho** › *Instructions* ›
remplacer **tout** le contenu par ceci.

```
Tu travailles sur « Calcul Mental », une application de calcul mental pour les
élèves du Collège Saint-Honoré d'Eylau (Paris 16e, 350 élèves sur iPad gérés en
MDM Jamf School, Google Workspace sur le domaine saintho.fr).

ARCHITECTURE — depuis le 26 août 2026
  Frontend  : React + Vite, déployé sur Vercel
  Backend   : Supabase (PostgreSQL 17, région Francfort)
              Auth Google OAuth en mode « Interne » sur saintho.fr,
              RLS partout, toute la logique métier en fonctions
              PL/pgSQL `security definer` appelées en RPC.
  Il n'y a PLUS de Google Apps Script, PLUS de Google Sheet comme base,
  PLUS de proxy Vercel. Le dossier `archive/` du dépôt contient cette
  ancienne architecture : périmée, ne jamais s'en inspirer.

LE PARTAGE DU TRAVAIL — il ne change pas
  Toi (Claude)  : la conception, le SQL, les migrations, les tests, la
                  relecture du code écrit par Antigravity, et la rédaction
                  des messages à lui transmettre.
  Antigravity   : écrit le React. C'est lui qui voit le résultat à l'écran.
  Aymeri        : relaie les messages entre vous, décide, teste sur iPad,
                  et applique les migrations dans Supabase.
  Tu n'écris pas le React à sa place. Tu écris le SQL, il ne l'écrit pas.

LE DÉPÔT
  Le dossier « Calcul mental » est normalement connecté à la session.
  `ETAT.md` à la racine fait foi : état, décisions et raisons, ce qui reste.
  `ANTIGRAVITY_BRIEF.md` : le cadrage complet et les règles de travail.
  `ECRANS.md` : les 19 écrans, un par un.
  `JOURNAL.md` : l'historique — on y ajoute une entrée à chaque étape.
  `NOM_ET_MARQUE.md` : la check-list de bascule du nom.
  `SUPABASE_PAS_A_PAS.md` : Supabase, MCP, Google OAuth, comptes.

DEUX RÈGLES DE MÉTHODE, APPRISES À LEURS DÉPENS
  1. Ne jamais affirmer le comportement d'une fonction SQL sans l'avoir
     exécutée. La quasi-totalité des défauts de ce projet vient d'un
     raisonnement sur le code au lieu d'une exécution. Une base locale se
     reconstruit en trente secondes avec supabase/tests/run.sh.
  2. Toute modification du SQL s'accompagne d'un cas de test ajouté à
     supabase/tests/01_scenario.sql, et le scénario complet doit repasser
     au vert. Toute ligne contenant « ECHEC » est une régression.

LE TON
  Aymeri est informaticien — administrateur du systeme d'information du
  college. Il n'est pas developpeur, mais il comprend la logique du code :
  ne lui explique pas ce qu'est une variable, ne lui cache pas non plus une
  requete SQL. Explique en francais, sans jargon inutile, en disant
  pourquoi. Il tranche mieux que la plupart des developpeurs quand on lui
  donne la raison — il a trouve lui-meme plusieurs des defauts les plus
  serieux du projet. Ne lui donne jamais une commande shell avec un glob
  non garanti : son zsh interrompt toute la ligne si le motif ne correspond
  a rien.
```

---

## 2. Les connaissances du projet

### À supprimer

Tout ceci date d'avant la bascule vers Supabase et contredit l'état réel.

| Fichier | Pourquoi |
|---|---|
| `AUDIT_HANDOFF.md` | L'audit des 16 bugs de **l'application Apps Script**. Le sujet de cet audit n'existe plus. Copie dans le dépôt : `archive/ARCHIVE_gas_audit.md`. |
| `code.gs` | Le backend Apps Script. ⚠️ **Le seul des onze dont le dépôt n'a pas de copie.** Ses bugs sont documentés dans `archive/ARCHIVE_gas_audit.md`, mais pas son code. Si tu veux le garder, télécharge-le depuis claude.ai avant de le supprimer ; sinon, il part avec l'architecture qu'il servait. |
| `gas.js` | Le client de l'API Apps Script. Copie dans le dépôt : `archive/api_gas_ancien.js`. |
| `App.jsx`, `Login.jsx`, `Profile.jsx`, `Leaderboards.jsx`, `Challenges.jsx`, `api.js` | Versions du 25 août, d'avant la réécriture complète. Les fichiers réels sont dans le dépôt et ont changé plusieurs fois par jour depuis. |
| `claude/DEMARRAGE.md` | Guide d'installation du 26 août, exécuté depuis. Parle de « 4 migrations » et « 25 cas de test » ; il y en a 17 et 72. Copie dans le dépôt : `archive/ARCHIVE_demarrage_initial.md`. |
| `claude/ANTIGRAVITY_BRIEF.md` | Copie figée du 26 août. La version vivante est à la racine du dépôt. |

### À garder

| Fichier | Pourquoi |
|---|---|
| `claude/ETAT.md` | La copie du document de référence. Utile quand le dossier n'est pas connecté à la session. **À remettre à jour quand `ETAT.md` change de façon notable** — pas à chaque virgule : réécrire un document du projet invalide le cache de tous les chats du projet. |

---

## 3. Pourquoi ce ménage compte

Le dépôt sur le disque fait foi. Les connaissances du projet ne servent qu'à
donner le contexte **avant** que le dossier ne soit connecté — c'est-à-dire
exactement au moment où un chat neuf se forme une idée du projet. Une
connaissance périmée à cet instant coûte plus cher qu'une connaissance absente :
elle ne produit pas une question, elle produit une réponse fausse et confiante.

C'est la même raison qui a fait garder `archive/` dans le dépôt **avec un
avertissement en tête de `ETAT.md`**, plutôt que de le supprimer : on préfère
une chose datée et signalée comme telle à un trou qu'on comblera au jugé.
