# Démarrage — passer la main à Antigravity

> Sept étapes, une petite heure la première fois. Rien ici n'est urgent
> ou irréversible : tout se fait sur une base de **développement**, la
> production n'existe pas encore.

---

## 1. Déposer les fichiers dans le dépôt

Décompresse l'archive à la racine de `calcul-mental-saintho`. Tu dois obtenir :

```
ANTIGRAVITY_BRIEF.md          ← le cadrage complet, c'est LE document
DEMARRAGE.md                  ← ce fichier
PROMPT_ANTIGRAVITY.md         ← le message à coller dans Antigravity
docs/ecrans-et-defis.html     ← les maquettes élève et prof
supabase/migrations/*.sql     ← 4 migrations, déjà testées
supabase/seed.sql             ← 8 élèves fictifs (dev uniquement)
supabase/tests/run.sh         ← vérification de bout en bout
.agents/mcp_config.example.json
```

## 2. Protéger le jeton d'accès

Ajoute cette ligne à ton `.gitignore` **avant** de committer quoi que ce soit :

```
.agents/mcp_config.json
```

Le fichier `.example.json` reste dans Git, celui qui contient ton jeton n'y va jamais.

## 3. Créer le projet Supabase de développement

Sur [supabase.com](https://supabase.com), nouveau projet :

- **Nom** : `calcul-mental-dev`
- **Région** : une région européenne — Paris ou Francfort *(ça compte pour le RGPD)*
- Note le mot de passe de la base, tu ne le reverras pas

Puis récupère deux choses :

- **Reference ID** — Project Settings › General
- **Un jeton d'accès personnel** — ton avatar en haut à droite › Access Tokens › Generate

## 4. Remplir la configuration MCP

Copie l'exemple et remplace les deux valeurs :

```bash
cp .agents/mcp_config.example.json .agents/mcp_config.json
```

Remplace `<REF_PROJET_DEV>` et `<TOKEN>` par ce que tu viens de récupérer.

## 5. Brancher Antigravity sur Supabase

Dans Antigravity : bouton **…** en haut du panneau agent › **MCP Servers**.

Soit tu installes Supabase depuis le **MCP Store** intégré, soit tu passes par
**Manage MCP Servers › View raw config** et tu colles le contenu de ton
`mcp_config.json`.

Vérifie que le serveur apparaît comme connecté avant de continuer.

## 6. Committer

```bash
git add .
git commit -m "Bascule vers Supabase : schéma, sécurité, API et cadrage"
git push
```

## 7. Lancer Antigravity

Ouvre le projet, et colle le contenu de `PROMPT_ANTIGRAVITY.md` dans le chat.

---

## Ce qu'Antigravity va te demander

Il a pour consigne de te réclamer tout en **une seule fois**, au début. Prépare
tes réponses :

| Il demande | Tu réponds |
|---|---|
| La référence du projet Supabase | Déjà dans `mcp_config.json` |
| Le SMTP pour les e-mails | *« Pas encore — travaille avec des comptes de test »* |
| L'accès GitHub / Vercel | Via l'OAuth des serveurs MCP, ou un jeton |
| L'autorisation Jamf | *« Je m'en occupe avant la mise en production »* |
| Le déploiement en production | *« Jamais toi. C'est moi qui lance `supabase db push` »* |

## Ce que tu fais, toi, avant la rentrée

Ces points ne concernent pas Antigravity — ils sont à toi, et l'application ne
fonctionnera pas sans eux.

- [ ] **Le SMTP Google Workspace.** Sans lui, aucun élève ne reçoit son code :
      le service intégré de Supabase est plafonné à 2 messages par heure et
      n'envoie qu'aux membres du projet. Crée un compte dédié
      (`calcul-mental@saintho.fr`), active la validation en deux étapes, génère
      un mot de passe d'application, renseigne-le dans Supabase, et remonte la
      limite d'envoi (30/heure par défaut).
- [ ] **Autoriser `*.supabase.co` dans Jamf.**
- [ ] **Créer le projet Supabase de production**, en région européenne, avec un
      réveil hebdomadaire automatique.
- [ ] **Prévenir le DPO / la direction** : données de mineurs, registre de
      traitement, information des familles.
- [ ] **Échelonner la rentrée** : une ou deux classes par jour, pas 300 élèves
      le même matin.

---

## Vérifier que tout va bien

Le test est ton filet de sécurité. Il rejoue les quatre migrations depuis zéro
et déroule 25 cas — dont cinq tentatives de triche qui doivent toutes échouer :

```bash
./supabase/tests/run.sh
```

Toute ligne contenant `ECHEC` signale une régression de sécurité. Si tu ne dois
retenir qu'une consigne à répéter à Antigravity, c'est celle-là.

## Si ça coince

| Symptôme | Cause probable |
|---|---|
| Antigravity ne voit pas la base | `mcp_config.json` mal rempli, ou serveur non connecté |
| `infinite recursion detected in policy` | Une politique interroge sa propre table — voir §5 du brief |
| Aucun e-mail ne part | SMTP non configuré (voir plus haut) |
| Le projet Supabase est « paused » | Plus de 7 jours d'inactivité — un clic pour le réveiller |
