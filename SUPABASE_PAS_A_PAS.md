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

Dans Antigravity, projet ouvert :

1. Bouton **…** en haut du panneau agent › **MCP Servers**
2. Soit tu installes **Supabase** depuis le MCP Store intégré, soit
   **Manage MCP Servers › View raw config** et tu colles le contenu de ton
   `.agents/mcp_config.json`
3. Attends que le serveur passe en **connecté**

Si rien ne se connecte : le plus souvent c'est une virgule ou un guillemet
manquant dans le JSON, ou le jeton mal collé.

---

## Partie 3 — Avec Antigravity, une instruction à la fois

Ne colle pas tout d'un coup. Attends que chaque étape soit finie et vérifiée.

### 3.1 — Vérifier la connexion

> Vérifie ta connexion au projet Supabase via MCP. Liste-moi les tables existantes et dis-moi dans quelle région le projet est hébergé.

*Attendu :* aucune table (base vide), région européenne. S'il ne voit rien,
le problème est dans la partie 2, pas dans le code.

### 3.2 — Appliquer le schéma

> Applique les quatre migrations de `supabase/migrations/` dans l'ordre, sur la base de dev. Ne modifie aucun fichier : applique-les telles quelles. Ensuite, liste-moi les tables créées et confirme que RLS est activé sur chacune.

*Attendu :* 7 tables — `eleves`, `profs`, `defis`, `defis_participants`,
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

## Partie 4 — Le piège : code à 6 chiffres, pas lien magique

**À faire à la main dans le tableau de bord. Antigravity ne peut pas.**

Par défaut, Supabase envoie un **lien magique** cliquable. Sur iPad, ce lien
s'ouvre dans le navigateur interne de l'app Mail : la session atterrit au
mauvais endroit et l'élève se retrouve déconnecté dans l'application. C'est le
grand classique du mobile, et ça rendrait la connexion inutilisable en classe.

### Corriger le modèle d'e-mail

**Authentication › Email Templates › Magic Link.**

Remplace le contenu par un texte qui utilise `{{ .Token }}` au lieu de
`{{ .ConfirmationURL }}` :

```html
<h2>Ton code de connexion</h2>
<p>Salut !</p>
<p>Voici ton code personnel :</p>
<p style="font-size:36px; font-weight:800; letter-spacing:10px;">{{ .Token }}</p>
<p>Il est valable une heure. Ne le partage avec personne.</p>
```

C'est cette seule variable qui fait basculer du lien vers le code.

### Côté application

Le front doit appeler `signInWithOtp()` pour l'envoi, puis `verifyOtp()` avec
le code saisi et le type `email`. À préciser à Antigravity au Lot 0.

### Bon à savoir

- Un code est demandable **une fois toutes les 60 secondes** par élève
- Il expire au bout d'**une heure**
- Réglable dans *Authentication › Sign In / Providers › Email › Email OTP expiration*

### Et le SMTP

Tant que tu n'as pas branché le SMTP Google Workspace, **seules les adresses
des membres du projet Supabase reçoivent les e-mails**, à raison de 2 par
heure. C'est suffisant pour développer et tester avec ton propre compte.

Avant d'ouvrir aux élèves, il faut impérativement le vrai SMTP — voir
`DEMARRAGE.md`.

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
| Modèle d'e-mail OTP | Toi |
| SMTP Workspace (avant la rentrée) | Toi |
