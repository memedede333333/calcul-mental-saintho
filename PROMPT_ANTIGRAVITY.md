# Message de démarrage pour Antigravity

> Copie tout ce qui est entre les deux lignes et colle-le dans le chat
> d'Antigravity, projet ouvert.

---

Tu reprends le projet **Calcul Mental Saintho**, une application d'entraînement aux tables de multiplication pour les élèves de 6ᵉ à 3ᵉ du Collège Saint-Honoré d'Eylau, utilisée sur iPad.

**Avant toute chose : lis `ANTIGRAVITY_BRIEF.md` en entier.** Il remplace `AUDIT_HANDOFF.md`, qui décrit une architecture abandonnée — ignore complètement ce dernier fichier.

En résumé : le backend Google Apps Script + Google Sheets est supprimé et remplacé par Supabase. Le front React/Vite existant est abouti et doit être conservé. Le schéma de base, les règles de sécurité et les fonctions API sont **déjà écrits et vérifiés** dans `supabase/migrations/` — tu les appliques, tu ne les réécris pas.

Les maquettes des écrans élève et prof sont dans `docs/ecrans-et-defis.html`. Ouvre-les, elles montrent la cible.

**Avant d'écrire la moindre ligne de code, fais deux choses :**

1. Branche-toi toi-même sur les serveurs MCP Supabase, GitHub et Vercel (§3 du brief). Tu es censé travailler en autonomie : le schéma se lit, les logs se consultent, un build qui échoue s'inspecte. N'attends pas qu'on te donne une information que tu peux aller chercher.

2. Donne-moi **en un seul message** la liste complète de ce dont tu as besoin de ma part — accès, jetons, réglages. Je te réponds une fois, puis tu travailles seul.

**Ensuite, attaque le Lot 0 du brief (§6)**, puis les lots suivants dans l'ordre. Ne saute pas de lot.

**Trois règles non négociables :**

- Tu ne touches **jamais** à la base de production. Les fichiers de `supabase/migrations/` sont ta seule façon de modifier le schéma. Le déploiement en production, c'est moi qui le fais.
- `./supabase/tests/run.sh` doit passer avant chaque commit. Toute ligne contenant `ECHEC` est une régression de sécurité. Quand tu ajoutes une fonction ou une politique, ajoute le cas de test correspondant.
- Aucune donnée en dur qui simule du vrai contenu. Si une donnée n'existe pas, on l'écrit. C'est précisément le défaut qui rendait la version précédente trompeuse : elle affichait de faux classements et des records à zéro.

Ce sont des données d'élèves mineurs : jamais d'e-mail affiché dans un classement, et aucun champ de texte libre nulle part dans l'application.

Commence par lire le brief, puis dis-moi ce dont tu as besoin.

---

## Pour les sessions suivantes

Une fois le premier échange fait, tu n'as plus besoin de ce message. Un simple
rappel suffit :

> Continue le projet Calcul Mental Saintho. Relis `ANTIGRAVITY_BRIEF.md`, dis-moi où tu en es dans les lots (§6), et reprends au suivant. Rappel : `./supabase/tests/run.sh` avant chaque commit, jamais de production.
