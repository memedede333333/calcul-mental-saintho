# Message de démarrage pour Antigravity

> Copie tout ce qui est entre les deux lignes et colle-le dans un chat neuf.
>
> **État au 27 août 2026** — le serveur MCP Supabase est connecté (projet
> `calcul-mental-dev`, Francfort), la base est **encore vide**, tous les
> fichiers sont dans le dépôt, rien n'a été appliqué ni installé.

---

Tu reprends le projet **Calcul Mental Saintho** : une application
d'entraînement aux tables de multiplication pour les élèves de 6ᵉ à 3ᵉ du
Collège Saint-Honoré d'Eylau, utilisée sur iPad.

## Lis ces documents avant toute chose

1. **`ETAT.md`** — **commence par celui-là** : où on en est, et surtout les
   décisions déjà prises avec leur justification. Ne les inverse pas sans en
   parler.
2. **`ANTIGRAVITY_BRIEF.md`** — le cadrage complet
3. **`ECRANS.md`** — les consignes écran par écran
4. **`SUPABASE_PAS_A_PAS.md`** — la mise en route

Ignore complètement le dossier `archive/` : il contient l'ancienne architecture
Google Apps Script, abandonnée. Ces documents sont périmés et contradictoires
avec ce qu'on fait maintenant.

## Où on en est

Le backend Apps Script + Google Sheets a été remplacé par **Supabase**. Le front
React/Vite existant est abouti et **doit être conservé**.

**Ce qui est déjà écrit, testé, et qu'il ne faut pas refaire :**

- **9 migrations** dans `supabase/migrations/` — schéma, sécurité RLS, fonctions
  métier, pondération des tables, gestion des élèves et des comptes enseignants
- **`frontend/src/api.js`** — client Supabase complet, 38 fonctions, les 28
  appels RPC vérifiés un par un contre les migrations
- **`supabase/tests/run.sh`** — 57 cas de vérification

**Ce qui n'est pas fait :** absolument tous les écrans. C'est ton travail.

## Ce que tu ne fais pas

- **Tu ne conçois aucun schéma de base de données.** Il existe. Tu appliques les
  migrations telles quelles, sans en modifier une ligne. Si quelque chose te
  paraît manquer, tu le signales — tu ne l'ajoutes pas de ta propre initiative.
- **Tu ne réécris pas `api.js`.** Tu l'utilises. S'il manque une fonction,
  ajoute-la ; ne recommence pas le module.
- **Tu ne touches jamais à la production.** Elle n'existe pas encore, et quand
  elle existera c'est un humain qui déploiera.

## Premières étapes, dans l'ordre

1. Confirme que tu vois le projet Supabase et qu'il est vide.
2. `cd frontend && npm install @supabase/supabase-js` — il n'est pas installé.
3. Applique les **9 migrations** dans l'ordre.
4. Charge `supabase/seed.sql` — données de démonstration, base de dev
   **uniquement**, jamais en production.
5. Lance `./supabase/tests/run.sh`. Attendu : aucune ligne `ECHEC`, et plusieurs
   messages `OK : refusé` — ce sont les tentatives de triche qui échouent comme
   prévu.
6. Récupère l'URL du projet et la clé anon via MCP, écris-les dans
   `frontend/.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), et
   vérifie que ce fichier est ignoré par Git. Génère les types TypeScript.

**Arrête-toi là et fais-moi un point.** N'enchaîne pas sur les écrans.

## À chaque étape franchie, tu tiens le journal

Ajoute une entrée en haut de `JOURNAL.md` — le modèle est en tête du fichier :

- **Fait** — ce qui fonctionne maintenant et ne fonctionnait pas avant
- **Décidé** — les choix de conception, en marquant clairement lesquels sont
  ✅ validés par moi et lesquels sont ⏳ proposés en attente
- **Constaté** — ce qui a surpris, cassé, ou ne s'est pas passé comme prévu.
  C'est la rubrique la plus utile : un bug contourné sans trace revient
  toujours.
- **Ensuite** — la prochaine étape

Puis mets à jour le tableau d'état de `ETAT.md` (§2), et son registre des
décisions (§3) si un choix a été tranché.

Une entrée par **étape**, pas par fichier modifié. C'est ce qui permet de
changer de chat sans rien reperdre.

Ensuite on suivra l'ordre de construction proposé à la fin de `ECRANS.md`.

## Les règles qui ne se négocient pas

- **`src/api.js` est le point de passage unique.** Aucun écran n'appelle
  Supabase directement.
- **Le front n'écrit jamais dans les tables.** Il appelle les fonctions RPC. Le
  serveur valide et calcule — un élève ne doit pas pouvoir fabriquer un score,
  s'attribuer un badge ou rejouer un défi.
- **`./supabase/tests/run.sh` passe avant chaque commit.** Quand tu ajoutes une
  fonction ou une politique, ajoute le cas de test correspondant.
- **Aucune donnée en dur qui simule du vrai contenu.** Si une donnée n'existe
  pas, on l'écrit. C'est le défaut qui rendait la version précédente trompeuse :
  faux classements, records à zéro.
- **Données d'élèves mineurs** : jamais d'e-mail dans un écran de classement, et
  **aucun champ de texte libre nulle part** — pas de nom de défi, pas de
  message, pas de pseudo. Sinon il faudrait modérer, et personne au collège n'en
  aura le temps.
- **Aucune ressource chargée depuis un domaine externe.** Les iPads sont filtrés
  par MDM : héberge les polices dans le projet. La seule chose que l'application
  contacte doit être Supabase.
- **Les élèves ne s'inscrivent pas.** Ils sont pré-inscrits par import. Une
  adresse absente de la table `eleves` n'a accès à rien, même avec un compte
  créé. C'est la barrière d'entrée, ne la contourne pas.
- **Utilise les variables CSS existantes** (`var(--navy)`, `var(--gold)`…),
  jamais de couleurs en dur : une refonte visuelle est prévue après la mise en
  fonctionnement.

## Tu peux discuter les consignes

`ECRANS.md` décrit l'intention, pas les pixels. Si tu vois une meilleure façon
de faire, propose-la et explique pourquoi en une ou deux phrases avant de coder.
Tu es celui qui voit le résultat à l'écran ; ces consignes ont été écrites sans
jamais avoir vu l'application tourner.

Seules les lignes marquées ⚠️ **NON NÉGOCIABLE** demandent ma validation
explicite.

## Ce dont tu as besoin de moi

Donne-moi **en un seul message** la liste complète de ce qu'il te faut — accès,
réglages, décisions. Je réponds une fois, puis tu travailles.

Commence par `ETAT.md`, puis les autres, puis dis-moi ce que tu constates sur la
base.

---

## Pour les sessions suivantes

> Continue le projet Calcul Mental Saintho. Relis `ANTIGRAVITY_BRIEF.md` et `ECRANS.md`, dis-moi où tu en es, et reprends à l'étape suivante. Rappel : `./supabase/tests/run.sh` avant chaque commit, jamais de schéma inventé, jamais de couleur en dur.
