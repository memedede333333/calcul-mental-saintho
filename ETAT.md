# Où on en est — document de référence

> **Point d'entrée du projet.** À lire en premier, à chaque reprise et à chaque
> nouveau chat. Les autres documents sont des références vers lesquelles
> celui-ci renvoie.
>
> Dernière mise à jour : **27 août 2026**

---

## 1. Le projet en trois phrases

Application d'entraînement au calcul mental (tables de multiplication) pour
**tout le collège Saint-Honoré d'Eylau, de la 6ᵉ à la 3ᵉ**, sur iPad gérés par
MDM Jamf et à la maison.

Front React/Vite sur Vercel, base Supabase (PostgreSQL, Francfort).
Déploiement par `git push`.

**Public : des élèves de 11 à 15 ans, sur écran tactile.** Chaque décision
d'interface se juge à cette aune.

---

## 2. État au 27 août 2026

| Chantier | État |
|---|---|
| Base de données, sécurité, logique métier | ✅ 11 migrations, 60 cas de test |
| Client API (`frontend/src/api.js`) | ✅ écrit, 28 appels RPC vérifiés |
| Connexion MCP Supabase ↔ Antigravity | ✅ opérationnelle (OAuth) |
| Migrations appliquées sur la base de dev | ✅ 11 migrations + seed, vérifié |
| `@supabase/supabase-js` installé | ✅ |
| `frontend/.env.local` | ✅ (projet `lkukdlspcgqtiimvwlsd`) |
| Types TypeScript (`database.ts`) | ✅ générés, 10 tables + 40 RPC |
| Écrans React — Lot 0 (démarrage, connexion, accueils) | ✅ App.jsx, Login.jsx, Home.jsx |
| Écrans React — Étape 2 (enregistrement des parties solo) | ✅ Practice.jsx, Challenges.jsx (libre, sprint, sans faute, chrono, montée) |
| Écrans React — Étape 3 (profil, classements) | ✅ Profile.jsx, Leaderboards.jsx |
| Écrans React — Étapes 4-7 (défis de classe, prof, admin) | ⬜ à faire |
| Application OAuth Google (mode Interne) | ⬜ à faire par l'administrateur |
| Google activé dans Supabase + URLs de retour | ⬜ à faire par l'administrateur |
| Modèle d'e-mail + SMTP (secours, non urgent) | ⬜ plus tard |
| `*.supabase.co` autorisé dans Jamf | ⬜ à faire par l'administrateur |
| Nom définitif de l'application | ⬜ en cours de choix |

**Projet Supabase de développement** : `calcul-mental-dev`,
référence `lkukdlspcgqtiimvwlsd`, région Francfort, PostgreSQL 17.
Il n'existe **aucune base de production** à ce jour.

---

## 3. Les décisions prises, et pourquoi

> **Cette section est la plus importante du document.** Chaque ligne a été
> tranchée après discussion. Ne pas les inverser sans en parler — et si l'on
> pense qu'une est mauvaise, argumenter contre la raison indiquée, pas contre
> la décision seule.

### Architecture

**Supabase remplace Google Apps Script + Sheets.**
Apps Script plafonne à 30 exécutions simultanées pour tout le collège, n'a ni
transactions ni verrous, et relisait des onglets entiers à chaque requête. Une
classe de 28 qui termine un contre-la-montre en même temps suffisait à le
saturer.

**`src/api.js` est le point de passage unique.**
Aucun écran n'appelle Supabase directement. C'est cette règle qui a permis de
remplacer tout le backend sans toucher aux écrans ; elle doit tenir.

**Le front n'écrit jamais dans les tables, seulement via les fonctions RPC.**
Le serveur valide et calcule. Un élève ne doit pas pouvoir fabriquer un score,
s'attribuer un badge ou rejouer un défi.

### Connexion

**Google Sign-In est le chemin principal ; le code par e-mail, un secours.**
*(Décidé le 27/08, en remplacement du tout-e-mail.)*
Les élèves utilisent déjà leur compte Google scolaire dans Safari pour les
Google Forms. Sur un iPad avec session Google ouverte, se connecter est **une
tape**. Surtout, cela retire le SMTP Workspace de la liste des préalables à la
rentrée — c'était le dernier point bloquant.
L'objection MDM ne tenait pas : le blocage porte sur `script.google.com`, pas
sur `accounts.google.com`, forcément autorisé puisque les élèves ouvrent leur
Gmail sur ces iPads.

**Jamais de lien magique par e-mail.**
Sur iPad, un lien reçu par mail s'ouvre dans le navigateur interne de l'app Mail :
la session atterrit au mauvais endroit et l'élève reste déconnecté dans Safari.
La redirection Google, elle, revient dans le **même** navigateur — le problème
ne se pose pas. Pour le secours par e-mail, on envoie donc un **code**, jamais
un lien.

**L'authentification n'autorise pas.**
Google prouve qui est la personne ; c'est la présence de son adresse dans
`eleves` ou `profs` qui lui donne accès. Une adresse inconnue obtient une session
valide et accès à rien. La liste d'élèves reste donc indispensable — et elle
seule porte la classe, que Google ne connaît pas.

**Le mode démo est retiré.**
Les élèves étant pré-inscrits, « essayer sans compte » n'est plus un cas
d'usage. Et une interface qui fonctionne pendant que tous les appels serveur
échouent est exactement le défaut qu'on élimine. Pour une démonstration : un
vrai compte de la base de dev.

**Les élèves ne s'inscrivent pas — ils sont pré-inscrits par import.**
Une adresse absente de la table `eleves` n'a accès à rien, même avec un compte
créé. C'est la barrière d'entrée du système, elle est en base, pas dans
l'interface.

### Pédagogie et équité

**Tables jusqu'à 20, pondérées par difficulté réelle.**
Sans pondération, l'élève qui choisit les tables de 2 et 5 en aligne deux fois
plus que celui qui travaille 13×17 : le classement récompenserait le choix de
la facilité. À score égal de 20 bonnes réponses : 82 points sur les tables de 2
et 5, 201 sur celles de 7 et 9.

**Trois paliers — Découverte (≤10), Confirmé (≤12), Expert (≤20).**
La pondération seule condamnerait les 6ᵉ au bas du tableau. Le palier d'une
partie est **déduit** de la plus haute table jouée : personne ne le choisit,
donc personne ne peut se ranger dans un palier facile.

**Le plafond de tables se débloque par la Montée des tables.**
Franchir la table 10 ouvre la 11. Ça donne enfin un rôle à ce mode, et garantit
qu'un 6ᵉ ne tombe jamais sur 17×18 par accident.

**Portée « ma classe » par défaut.**
La comparaison de proximité motive ; l'exposition à l'échelle du collège écrase.
Portées disponibles : ma classe · mon niveau (tous les 6ᵉ) · le collège.

**Le palier « tous » est une vitrine, pas un classement par défaut.**
« Les records du collège » — on ne s'y situe pas, on l'admire. En défaut, on
retomberait sur l'effet qu'on cherche à éviter : les mêmes toujours en tête.

**Les élèves sont affichés « Alice D. » — prénom et initiale.**
Le rôle d'un classement est de motiver, pas d'identifier. Le nom de famille
n'ajoute pas de motivation, seulement de l'identifiabilité — sur 350 mineurs.
*(Discuté, et retenu volontairement ; l'argument inverse — « ils se connaissent
déjà » — a été pesé.)*

**Classement d'équipes disponible : 6ᵉA contre 6ᵉB, en moyenne par élève.**
À cet âge l'émulation collective fonctionne souvent mieux que l'exposition
individuelle : personne n'est exposé en bas de tableau, et un élève faible qui
s'entraîne fait gagner sa classe.

### Défis

**Asynchrone, jamais temps réel.**
Faire interroger le serveur par 28 iPads toutes les 2 secondes, c'est 1 680
requêtes en deux minutes. En quasi-instantané : 56. Trente fois moins.

**Aucun mécanisme de départ synchronisé.**
Le « c'est parti » du professeur fait le travail. Comme tout le monde démarre
ensemble, chacun termine à quelques secondes d'écart et voit les autres
arriver : l'effet ressenti est celui d'un direct, sans rien construire.

**Seuls Sprint et Contre-la-montre sont jouables en défi à code.**
Sans faute et Montée produisent des écarts de durée trop grands — un élève
solide tient cinq minutes, un autre s'arrête en vingt secondes. Ces deux modes
alimentent les classements permanents.

**Les élèves peuvent créer leurs propres défis**, sans passer par un professeur.
5 défis ouverts maximum, 24 h de validité, jamais au-dessus de leur niveau
débloqué.

**Aucun champ de texte libre, nulle part.**
Pas de nom de défi, pas de message, pas de pseudo. Dès qu'on laisse des
collégiens écrire du texte que d'autres verront, il faut modérer — et personne
au collège n'aura le temps de le faire. Les avatars sont une liste fermée
d'emojis pour la même raison.

**Sur la triche** : impossible à empêcher dans un jeu qui tourne dans un
navigateur. On limite (une seule participation, score plafonné par le nombre de
questions, écriture impossible après coup) et surtout **ces défis ne comptent
dans aucune évaluation**. C'est ce dernier point qui dégonfle le problème.

### Enseignants et administration

**Un enseignant voit et gère TOUTES les classes**, pas seulement les siennes.
Les affectations changent chaque année, un professeur remplace un collègue,
échange un service. Un cloisonnement serait périmé en permanence et chaque
« je ne vois pas ma classe » remonterait à l'administrateur. Quatre professeurs
qui se croisent tous les jours n'ont pas besoin de cloisons — ils ont besoin
d'un journal, et il existe.
`profs.classes[]` survit comme **raccourci d'affichage**, sans effet sur les
droits.

**Deux rôles seulement : `prof` et `admin`. Pas de matrice de droits.**
À cette échelle, la traçabilité vaut mieux que la prévention rigide. Neuf fois
sur dix, la vraie demande derrière « il faudrait des permissions » est
« il faudrait savoir qui a fait quoi » — et le journal y répond.
Aucune limite de nombre, ni de profs ni d'admins.

**Le serveur refuse de retirer le dernier administrateur actif.**
Sans ce verrou, une fausse manœuvre enfermerait tout le monde dehors et il
faudrait passer par la console Supabase. Prévoir au moins deux administrateurs
en production : un seul est un point de défaillance unique le jour d'une
absence.

**On ne supprime jamais un élève en cours d'année — on le désactive.**
Supprimer effacerait ses sessions en cascade : les classements de sa classe
changeraient rétroactivement et les défis auxquels il a participé deviendraient
incohérents. La suppression définitive appartient à la fin de scolarité (RGPD).

**L'import de rentrée ne désactive personne.**
Un élève absent du fichier est seulement signalé. Désactiver en masse sur la foi
d'un export raté couperait l'accès à tout un niveau un lundi matin.

**L'e-mail d'un élève n'est modifiable que s'il ne s'est jamais connecté.**
Après, le compte est rattaché : changer l'adresse le laisserait connecté sous
une identité qui n'existe plus.

**Les enseignants jouent aussi**, dans une table séparée, avec un classement
visible d'eux seuls. Deux tables sans intersection : un professeur ne peut pas
apparaître dans un classement d'élèves, même par erreur de filtre.

### Méthode

**Le jeu de démonstration (`seed.sql`) ne va que dans la base de dev.**
La production démarre vide. Ce n'est pas du contenu, c'est un instrument de
mesure : sans données, on ne distingue pas « ça marche mais c'est vide » de
« c'est cassé ». C'est grâce à lui qu'un bug de points à zéro a été trouvé
avant la mise en service.

**`./supabase/tests/run.sh` passe avant chaque commit.**
57 cas, dont une dizaine de tentatives de contournement qui doivent toutes
échouer. Toute ligne `ECHEC` est une régression de sécurité.

**Aucune donnée en dur qui simule du vrai contenu.**
Si une donnée n'existe pas, on l'écrit. C'est le défaut qui rendait la version
précédente trompeuse : faux classements, records à zéro.

**Aucune ressource chargée depuis un domaine externe.**
Les iPads sont filtrés par MDM. Polices hébergées dans le projet. La seule chose
que l'application contacte doit être Supabase.

**La refonte visuelle vient APRÈS la mise en fonctionnement.**
L'application a déjà un système visuel cohérent et implémenté. Concevoir
maintenant reviendrait à redessiner des écrans dont le comportement n'est pas
fixé. Condition pour que ce soit indolore : **utiliser les variables CSS
existantes**, jamais de couleurs en dur.

---

## 4. Les autres documents

| Fichier | Contenu |
|---|---|
| `ANTIGRAVITY_BRIEF.md` | Le cadrage complet : architecture, règles, lots de travail |
| `ECRANS.md` | Les 19 écrans, un par un : appels, contenus, états |
| `SUPABASE_PAS_A_PAS.md` | Mise en route Supabase, MCP, Google OAuth, comptes |
| `NOM_ET_MARQUE.md` | Check-list de bascule du nom — les 14 endroits à changer, dont 6 hors du code |
| `JOURNAL.md` | L'historique : ce qui a été fait, décidé, constaté, étape par étape |
| `PROMPT_ANTIGRAVITY.md` | Le message de démarrage à coller dans un chat neuf |
| `docs/ecrans-et-defis.html` | Les maquettes visuelles élève et professeur |
| `archive/` | ⚠️ Ancienne architecture Apps Script — **périmé, ne pas suivre** |

---

## 5. Ce qui reste à faire

### Pour l'agent

Voir `ECRANS.md`, section « Ordre de construction ». En résumé :

1. Appliquer les migrations, charger le seed, lancer les tests
2. Installer `@supabase/supabase-js`, créer `.env.local`
3. Démarrage, connexion, écrans d'accueil
4. Brancher les quatre modes solo existants — débloque profil, records, badges,
   classements d'un coup
5. Défis à code
6. Suivi de classe
7. Administration
8. Finitions : hors-ligne, confettis, hooks

### Pour l'administrateur — indispensable avant la rentrée

- [ ] **Modèle d'e-mail OTP** : *Authentication › Email Templates › Magic Link*,
      remplacer `{{ .ConfirmationURL }}` par `{{ .Token }}`.
      **Sans ça, la connexion envoie un lien et ne fonctionne pas sur iPad.**
- [ ] **SMTP Google Workspace.** Le service intégré de Supabase est plafonné à
      2 messages/heure et n'envoie qu'aux membres du projet : aucun élève ne
      recevrait son code. Compte dédié + mot de passe d'application, puis
      remonter la limite d'envoi (30/heure par défaut).
      Contrainte : les élèves ne reçoivent que du domaine `saintho.fr`.
- [ ] **Autoriser `*.supabase.co` dans Jamf** — le wildcard, pas l'adresse
      exacte : elle changerait si le projet change.
- [ ] **Créer la base de production**, région européenne, avec un réveil
      hebdomadaire (l'offre gratuite suspend après 7 jours d'inactivité).
- [ ] **Prévenir le DPO / la direction** : données de mineurs, registre de
      traitement, information des familles. Mentionner qu'un enseignant accède
      aux données de maîtrise de tout le collège.
- [ ] **Échelonner la rentrée** : une ou deux classes par jour, jamais 300
      élèves le même matin.
- [ ] **Trancher le nom** de l'application — il apparaît dans `branding.js`, le
      manifeste et le modèle d'e-mail. Autant le faire avant que les écrans ne
      soient codés.

---

## 6. Reprendre dans un nouveau chat

Colle ceci :

> Lis `ETAT.md` à la racine du dépôt, puis `ANTIGRAVITY_BRIEF.md` et `ECRANS.md`. Ignore le dossier `archive/`, il contient une architecture abandonnée. Dis-moi ensuite où en est le projet selon toi et ce que tu proposes comme prochaine étape.

### La discipline à tenir

À **chaque étape franchie**, deux gestes :

1. **Ajouter une entrée dans `JOURNAL.md`** — fait / décidé / constaté /
   ensuite. Le modèle est en tête du fichier. En marquant clairement ce qui est
   validé, et par qui.
2. **Mettre à jour ce document** — le tableau du §2 toujours, le registre des
   décisions du §3 si un choix de conception a été pris.

Le journal raconte, `ETAT.md` fait foi. C'est ce qui permet de changer de chat,
d'outil ou de personne sans rien reperdre.
