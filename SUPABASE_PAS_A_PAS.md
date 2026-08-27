# Supabase — mise en route pas à pas

> À faire une seule fois. Compte 20 minutes en tout.
> Les parties 1 et 2 sont pour toi. La partie 3 se fait avec Antigravity,
> une instruction à la fois. La partie 4 est le piège à ne pas rater.

---

## Partie 1 — Créer le projet et récupérer deux valeurs

*Dans le navigateur. Antigravity ne peut pas faire cette partie : elle
demande d'être connecté avec ton compte.*

### 1.1 — Le projet

Sur **supabase.com**, connecte-toi puis **New project** :

| Champ | Valeur |
|---|---|
| Name | `calcul-mental-dev` |
| Database Password | génère-en un, **note-le** — il ne se réaffiche jamais |
| Region | **Paris** ou **Frankfurt** — une région européenne, c'est un point RGPD |
| Plan | Free |

La création prend une à deux minutes.

### 1.2 — Le Reference ID

**Project Settings › General › Reference ID.** Une vingtaine de lettres.

Tu peux aussi le lire dans l'URL du tableau de bord :
`supabase.com/dashboard/project/`**`<c'est ça>`**

### 1.3 — Le jeton d'accès personnel

Ton avatar en haut à droite › **Account Settings** › **Access Tokens** ›
**Generate new token**. Nomme-le `antigravity`.

⚠️ Il ne s'affiche **qu'une fois**. Copie-le tout de suite.

C'est l'équivalent d'un mot de passe : il ne doit jamais être collé dans une
fenêtre de chat, ni committé. Le `.gitignore` du projet le protège déjà.

### 1.4 — Remplir la configuration

Dans le Terminal :

```bash
cd ~/Documents/"Calcul mental"
cp .agents/mcp_config.example.json .agents/mcp_config.json
open -e .agents/mcp_config.json
```

Remplace `<REF_PROJET_DEV>` par le Reference ID et `<TOKEN>` par le jeton.
Garde les guillemets. Enregistre (⌘S), ferme.

Vérifie que le jeton est bien ignoré par Git :

```bash
git check-ignore -v .agents/mcp_config.json
```

Ça doit répondre quelque chose. Si la commande ne renvoie rien, **arrête-toi**
et signale-le : le jeton risquerait de partir sur GitHub.

---

## Partie 2 — Brancher Antigravity sur Supabase

**C'est le chemin qui fonctionne, testé le 26 août 2026.**

1. Dans Antigravity : bouton **…** en haut du panneau agent › **MCP Servers**
2. Installe **Supabase** depuis le MCP Store intégré
3. Sur la fiche du serveur, clique sur **Authenticate** (à droite de
   « Configure ») — une fenêtre de navigateur s'ouvre
4. Autorise l'accès à ton compte Supabase
5. Reviens dans Antigravity, clique **Refresh**

Le serveur doit alors afficher un nombre d'outils au lieu de l'erreur
« Unauthorized ».

### Ce qu'il faut savoir

Ce serveur est la version **hébergée** : il ne lit pas
`.agents/mcp_config.json`, il fonctionne par autorisation navigateur.

En contrepartie, cette autorisation donne accès à **tout le compte
Supabase**, pas à un seul projet. Sans conséquence tant qu'il n'y a que la
base de développement — **à revoir impérativement le jour où la base de
production existera**, pour que l'agent ne puisse pas l'atteindre.

Le fichier `.agents/mcp_config.example.json` décrit la version locale
(npx + jeton personnel), qui permet de limiter l'agent à un seul projet.
C'est la solution de repli à ressortir à ce moment-là.

## Partie 3 — Avec Antigravity, une instruction à la fois

Ne colle pas tout d'un coup. Attends que chaque étape soit finie et vérifiée.

### 3.1 — Vérifier la connexion

> Vérifie ta connexion au projet Supabase via MCP. Liste-moi les tables existantes et dis-moi dans quelle région le projet est hébergé.

*Attendu :* aucune table (base vide), région européenne. S'il ne voit rien,
le problème est dans la partie 2, pas dans le code.

### 3.2 — Appliquer le schéma

> Applique les neuf migrations de `supabase/migrations/` dans l'ordre, sur la base de dev. Ne modifie aucun fichier : applique-les telles quelles. Ensuite, liste-moi les tables créées et confirme que RLS est activé sur chacune.

*Attendu :* 9 tables (dont `difficulte_operande` et `journal_admin`) — `eleves`, `profs`, `defis`, `defis_participants`,
`sessions_jeu`, `maitrise`, `badges` — plus `difficulte_operande`. RLS activé
partout.

### 3.3 — Charger les données de démonstration

> Charge `supabase/seed.sql`. Confirme-moi le nombre d'élèves et de sessions créés.

*Attendu :* 8 élèves, 2 profs, 35 sessions.

### 3.4 — Lancer les tests

> Lance `./supabase/tests/run.sh` contre la base de dev et montre-moi la sortie complète. Toute ligne contenant ECHEC est une régression de sécurité.

*Attendu :* aucune ligne `ECHEC`. Trois messages `OK : refusé` — ce sont les
tentatives de triche qui échouent comme prévu.

### 3.5 — Récupérer les clés pour le front

> Récupère l'URL du projet et la clé anon via MCP, et écris-les dans `frontend/.env.local` sous les noms `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. Vérifie que `.env.local` est bien dans le `.gitignore`.

La clé anon est publique par nature — c'est la RLS qui protège les données,
pas le secret de cette clé.

### 3.6 — Réécrire le client API

> Réécris `frontend/src/api.js` sur `@supabase/supabase-js`, en gardant les mêmes noms de fonctions qu'aujourd'hui quand c'est possible. Toutes les écritures passent par les fonctions RPC de la migration 3, jamais par un accès direct aux tables. Génère aussi les types TypeScript depuis le schéma.

### 3.7 — La suite

À partir de là, suis les lots du `ANTIGRAVITY_BRIEF.md` (§6). Le Lot 0 est
presque terminé : il reste la restauration de session au démarrage.

---

## Partie 4 — Connexion Google (le chemin principal)

**À faire dans le navigateur, une seule fois. Antigravity ne peut pas.**

Les élèves ont tous un compte Google scolaire qu'ils utilisent déjà dans Safari
pour les Google Forms. Sur un iPad où la session est ouverte, se connecter
devient **une tape** — sans mail, sans code, sans attente.

### 4.1 — Déclarer l'application dans Google Cloud Console

Sur [console.cloud.google.com](https://console.cloud.google.com), avec ton
compte administrateur Workspace.

**a. Créer ou choisir un projet** — nommé par exemple `calcul-mental-saintho`.

**b. Écran de consentement OAuth**
*APIs et services › Écran de consentement OAuth*

| Champ | Valeur |
|---|---|
| Type d'utilisateur | **Interne** ⚠️ |
| Nom de l'application | Calcul Mental Saintho |
| E-mail d'assistance | ton adresse |
| Domaine autorisé | `saintho.fr` |

⚠️ **« Interne » est le réglage important.** Il limite la connexion aux comptes
du Workspace `saintho.fr` : un Gmail personnel ne peut même pas aller au bout du
parcours. C'est la porte fermée en amont.

**c. Créer les identifiants**
*APIs et services › Identifiants › Créer › ID client OAuth*

- Type : **Application Web**
- URI de redirection autorisés :
  `https://lkukdlspcgqtiimvwlsd.supabase.co/auth/v1/callback`

Note l'**ID client** et le **code secret**. Le secret ne se réaffiche pas ;
si tu le perds, on en régénère un.

### 4.2 — Déclarer Google dans Supabase

*Authentication › Sign In / Providers › Google* → activer, coller l'ID client et
le code secret, enregistrer.

### 4.3 — Autoriser les adresses de retour

*Authentication › URL Configuration*

| Champ | Valeur |
|---|---|
| Site URL | `https://calcul-mental-saintho.vercel.app` |
| Redirect URLs | ajouter `http://localhost:5173/**` |

⚠️ **Le `localhost` est indispensable pour développer.** Sans lui, la connexion
échoue en local avec une erreur de redirection — et on cherche longtemps.

### 4.4 — Vérifier

Depuis l'application : bouton « Se connecter avec Google » → le sélecteur de
compte n'affiche que les adresses `@saintho.fr` → retour dans l'app, connecté.

---

## Partie 5 — Le secours par e-mail (optionnel, plus tard)

Un lien discret « Je n'arrive pas à me connecter avec Google » ouvre l'ancien
parcours : adresse, puis code à 6 chiffres reçu par mail.

⚠️ **Garde ce lien masqué tant que les deux points ci-dessous ne sont pas
faits.** Un secours qui échoue silencieusement est pire que pas de secours.

Ce n'est plus un préalable à la rentrée — c'est du confort, pour l'élève à la
maison sur un ordinateur sans session Google scolaire, ou en cas de panne
Google.

### 5.1 — Le modèle d'e-mail : code, pas lien

*Authentication › Email Templates › Magic Link*

Par défaut, Supabase envoie un **lien cliquable**. Sur iPad, ce lien s'ouvre
dans le navigateur interne de l'app Mail : la session atterrit au mauvais
endroit et l'élève reste déconnecté dans Safari.

Remplace le contenu par un texte qui utilise `{{ .Token }}` :

```html
<h2>Ton code de connexion</h2>
<p>Voici ton code personnel :</p>
<p style="font-size:36px; font-weight:800; letter-spacing:10px;">{{ .Token }}</p>
<p>Il est valable une heure. Ne le partage avec personne.</p>
```

C'est cette seule variable qui fait basculer du lien vers le code.

### 5.2 — Le SMTP Workspace

Le service intégré de Supabase plafonne à **2 messages par heure** et n'écrit
qu'aux membres du projet : aucun élève ne recevrait rien.

- Compte dédié dans ton Workspace, par exemple `calcul-mental@saintho.fr`
- Validation en deux étapes activée, puis un **mot de passe d'application**
- Dans Supabase : `smtp.gmail.com`, port `587`, l'adresse et ce mot de passe
- Remonter la limite d'envoi (30/heure par défaut)

Contrainte connue : les élèves ne reçoivent que du domaine `saintho.fr`.

### Bon à savoir

- Un code est demandable **une fois toutes les 60 secondes** par élève
- Il expire au bout d'**une heure**

---

## Récapitulatif

| Étape | Qui |
|---|---|
| Créer le projet, région européenne | Toi |
| Générer le jeton d'accès | Toi |
| Remplir `mcp_config.json` | Toi |
| Installer le MCP dans Antigravity | Toi |
| Appliquer migrations, seed, tests | Antigravity |
| Clés du front, réécriture d'`api.js` | Antigravity |
| Déclarer l'application Google (mode Interne) | Toi |
| Activer Google dans Supabase + URLs de retour | Toi |
| Modèle d'e-mail + SMTP (secours, plus tard) | Toi |
