# Message de démarrage pour Antigravity

> Copie tout ce qui est entre les deux lignes et colle-le dans un chat neuf.
>
> **État au 31 août 2026** — l'application **fonctionne** : 17 migrations
> appliquées sur `calcul-mental-dev` (Francfort), 72 cas de test verts, tous
> les écrans construits, connexion Google validée en conditions réelles avec
> de vrais comptes. Ce message n'est plus un message de démarrage : c'est un
> message de **reprise**. Ne le lis pas comme une invitation à reconstruire.

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

Le backend Apps Script + Google Sheets a été remplacé par **Supabase**. Tout
est en place et tourne.

**Ce qui est écrit, testé, appliqué — et qu'il ne faut pas refaire :**

- **17 migrations** dans `supabase/migrations/` — schéma, sécurité RLS,
  fonctions métier, pondération des tables, défis, comptes enseignants,
  administration, score de progression
- **`frontend/src/api.js`** — client Supabase complet, ~45 appels RPC vérifiés
  un par un contre les migrations
- **`supabase/tests/run.sh`** — **72 cas** de vérification, tous verts
- **Tous les écrans**, élève et enseignant, y compris les défis à code avec
  classement en temps réel
- **La connexion Google** en mode « Interne » sur `saintho.fr`, validée avec de
  vrais comptes élèves et enseignants

**Ce qui reste :** deux écrans (« Mes défis », « Ma classe »), quelques
corrections, et la passe visuelle une fois le nom choisi. Le détail est dans
`ETAT.md` §5.

## Ce que tu ne fais pas

- **Tu ne conçois aucun schéma de base de données.** Il existe. Tu appliques les
  migrations telles quelles, sans en modifier une ligne. Si quelque chose te
  paraît manquer, tu le signales — tu ne l'ajoutes pas de ta propre initiative.
- **Tu ne réécris pas `api.js`.** Tu l'utilises. S'il manque une fonction,
  ajoute-la ; ne recommence pas le module.
- **Tu ne touches jamais à la production.** Elle n'existe pas encore, et quand
  elle existera c'est un humain qui déploiera.

## Premières étapes, dans l'ordre

1. Confirme que tu vois le projet Supabase via MCP, et **liste les migrations
   appliquées**. Attendu : 17, la dernière étant `20260831090000_mes_defis`.
2. Vérifie que `frontend/.env.local` existe et que Git l'ignore. Régénère les
   types TypeScript — le contrat de `classement_profs()` a changé le 31 août.
3. Lance `./supabase/tests/run.sh`. Attendu : aucune ligne `ECHEC`, et
   plusieurs `OK : refusé` — ce sont les tentatives de triche qui échouent
   comme prévu.
4. Lance l'application et connecte-toi. **Ton compte Google personnel ne
   pourra jamais s'authentifier** : l'audience OAuth est « Interne », limitée
   au domaine `saintho.fr`. C'est voulu. Demande à Aymeri de tester à ta
   place plutôt que de réessayer.

**Arrête-toi là et fais-moi un point** en disant ce que tu as constaté sur la
base — pas ce que tu as déduit du code.

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
- **La connexion se fait par Google** (bouton principal), le code par e-mail
  n'est qu'un secours masqué tant que le SMTP n'est pas configuré. Voir
  `ECRANS.md` écran 2.
- **Les élèves ne s'inscrivent pas.** Ils sont pré-inscrits par import. Une
  adresse absente de la table `eleves` n'a accès à rien, même avec un compte
  créé. C'est la barrière d'entrée, ne la contourne pas.
- **N'affirme jamais le comportement d'une fonction SQL sans l'avoir
  exécutée.** C'est l'erreur qui a coûté le plus cher à ce projet : « cette
  fonction lève une erreur pour un professeur » — elle renvoyait un succès
  avec un profil nul, et un enseignant voyait « Découverte, tables 1 à 10 ».
  La base est à un appel MCP de distance. Exécute, colle le résultat.
- **Vérifie les colonnes une par une contre la définition SQL** avant de dire
  qu'un écran est fait. Deux bugs identiques ont déjà été livrés ainsi
  (`classe` puis `nom` au lieu de `nom_affiche`), chacun visible à l'œil nu
  sur la première capture d'écran.
- **N'abandonne jamais silencieusement un point d'une consigne.** Quand un
  message en contient plusieurs, reprends-les un par un dans ton rapport, y
  compris pour dire « pas fait, parce que… ».
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

> Continue le projet Calcul Mental. Relis `ETAT.md` (§2 et §5), puis les trois dernières entrées de `JOURNAL.md`, dis-moi où tu en es, et reprends à l'étape suivante. Rappels : `./supabase/tests/run.sh` avant chaque commit ; jamais de schéma inventé — le SQL vient de Claude ; jamais de couleur en dur ; et n'affirme rien du comportement d'une fonction SQL sans l'avoir exécutée.
