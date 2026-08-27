# Message de démarrage pour Antigravity

> Copie tout ce qui est entre les deux lignes et colle-le dans le chat
> d'Antigravity, projet ouvert.
> État au 27 août 2026 : le MCP Supabase est connecté, les fichiers sont
> en place, la base de dev est vide.

---

Tu reprends le projet **Calcul Mental Saintho**, une application d'entraînement aux tables de multiplication pour les élèves de 6ᵉ à 3ᵉ du Collège Saint-Honoré d'Eylau, utilisée sur iPad.

**Avant toute chose : lis `ANTIGRAVITY_BRIEF.md` en entier.** Puis `SUPABASE_PAS_A_PAS.md`. Ils remplacent tout ce qui se trouve dans `archive/` — ces documents-là décrivent une architecture abandonnée, ignore-les complètement.

## Où on en est

- Le backend Google Apps Script + Google Sheets est **supprimé**, remplacé par Supabase
- Le front React/Vite existant est abouti et **doit être conservé**
- Le serveur MCP Supabase est **déjà connecté** — projet `calcul-mental-dev`, région Francfort, base vide
- Le schéma, la sécurité et les fonctions API sont **déjà écrits et testés** : six migrations dans `supabase/migrations/`

## Ce que tu ne fais pas

**Tu ne conçois aucun schéma de base de données.** Il existe. Tu appliques les six migrations dans l'ordre, telles quelles, sans en modifier une ligne. Si quelque chose te paraît manquer, tu le signales — tu ne le rajoutes pas de ton initiative.

Tu ne touches jamais à la production. Les fichiers de `supabase/migrations/` sont la seule façon de modifier le schéma, et c'est un humain qui déploie.

## Ordre de travail

**1. Vérifier.** Confirme que tu vois le projet Supabase et qu'il est vide.

**2. Appliquer.** Les six migrations, puis `supabase/seed.sql` (données de démonstration — base de dev **uniquement**, jamais en production).

**3. Tester.** Lance `./supabase/tests/run.sh`. Toute ligne contenant `ECHEC` est une régression de sécurité. Il doit y avoir zéro `ECHEC` et trois messages `OK : refusé` — ce sont les tentatives de triche qui échouent comme prévu.

**4. Brancher le front.** Récupère l'URL du projet et la clé anon via MCP, écris-les dans `frontend/.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), vérifie que ce fichier est bien ignoré par Git. Génère les types TypeScript depuis le schéma.

**5. Réécrire `src/api.js`** sur `@supabase/supabase-js`, en gardant les mêmes noms de fonctions qu'aujourd'hui quand c'est possible.

**6. Suivre les lots** du brief (§6), dans l'ordre, sans en sauter.

Après chaque étape, dis-moi ce que tu as fait et ce que tu constates. Ne les enchaîne pas sans t'arrêter.

## Règles qui ne se négocient pas

- **`src/api.js` est le point de passage unique.** Aucun écran n'appelle Supabase directement.
- **Le front n'écrit jamais dans les tables.** Il appelle les fonctions RPC. Le serveur valide et calcule — un élève ne doit pas pouvoir fabriquer un score, s'attribuer un badge, ou rejouer un défi.
- **`./supabase/tests/run.sh` passe avant chaque commit.** Quand tu ajoutes une fonction ou une politique, ajoute le cas de test correspondant.
- **Aucune donnée en dur qui simule du vrai contenu.** Si une donnée n'existe pas, on l'écrit. C'est le défaut qui rendait la version précédente trompeuse : faux classements, records à zéro.
- **Données d'élèves mineurs** : jamais d'e-mail dans un écran de classement, et **aucun champ de texte libre nulle part** dans l'application — pas de nom de défi, pas de message, pas de pseudo. Sinon il faudrait modérer, et personne au collège n'en aura le temps.
- **Aucune police ni ressource chargée depuis un domaine externe.** Les iPads sont filtrés par MDM : héberge les polices dans le projet. La seule chose que l'application contacte doit être Supabase.
- **Les élèves ne s'inscrivent pas.** Ils sont pré-inscrits par import CSV. Une adresse absente de la table `eleves` n'a accès à rien, même avec un compte créé. C'est la barrière d'entrée, ne la contourne pas.

## Ce dont tu as besoin de moi

Donne-moi **en un seul message** la liste complète de ce qu'il te faut — accès, réglages, décisions. Je réponds une fois, puis tu travailles seul.

Commence par lire le brief, puis dis-moi ce que tu constates sur la base.

---

## Pour les sessions suivantes

> Continue le projet Calcul Mental Saintho. Relis `ANTIGRAVITY_BRIEF.md`, dis-moi où tu en es dans les lots (§6), et reprends au suivant. Rappel : `./supabase/tests/run.sh` avant chaque commit, jamais de production, jamais de schéma inventé.
