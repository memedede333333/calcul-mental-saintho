# Où on en est — document de référence

> **Point d'entrée du projet.** À lire en premier, à chaque reprise et à chaque
> nouveau chat. Les autres documents sont des références vers lesquelles
> celui-ci renvoie.
>
> Dernière mise à jour : **1er septembre 2026** — 20 migrations, 82 cas de test verts.
>
> *(Cette ligne se met à jour **en premier**, avant tout le reste du document.
> Elle a menti une fois : le §2 était daté du 31 et l'en-tête du 27, et un chat
> neuf a eu raison de s'en méfier.)*

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

## 2. État au 31 août 2026 — le code est terminé

### Ce qui est fait

| Chantier | État |
|---|---|
| Base de données, sécurité, logique métier | ✅ **20 migrations**, 82 cas de test verts |
| Client API (`frontend/src/api.js`) | ✅ point de passage unique, ~45 appels RPC |
| Types TypeScript (`database.ts`) | ✅ régénérés à chaque migration |
| **Connexion Google (mode Interne)** | ✅ **configurée et validée en conditions réelles** |
| Comptes réels inscrits | ✅ 2 enseignants, 2 élèves de bêta |
| Écrans élève — démarrage, connexion, accueil | ✅ |
| Écrans élève — apprendre, s'entraîner, profil, classements | ✅ |
| Écrans élève — les 5 modes de défi | ✅ |
| **Défis partagés** — code, questions figées, classement temps réel | ✅ |
| Écrans enseignant — accueil, profil, s'entraîner, lancer un défi | ✅ |
| Écran Administration — élèves, enseignants, import, journal | ✅ |
| Données de démonstration nettoyées de la base de dev | ✅ |

### Ce qui n'a pas encore été éprouvé

| | Pourquoi |
|---|---|
| ⬜ **Un défi joué à deux comptes simultanés** | Exige deux personnes en même temps — aucune relecture ne le remplace. C'est le dernier test fonctionnel du projet. |
| ⬜ **Un usage réel en classe** | 24 iPads sur un même point d'accès. Rien ne prédit ce qui s'y passera. |
| ⬜ **Écran « Ma classe »** (maîtrise agrégée) | Assumé « en construction ». `maitrise_classe()` existe en base et est testée : il ne manque que la grille. C'est le seul écran fait pour les professeurs — celui qui décidera de l'adoption en salle des profs. |
| ✅ **Écran « Mes défis »** | Livré par Antigravity le 31 août, points d'entrée côté prof et côté élève. Reste à voir en usage. |
| ✅ **Origine du défi affichée** (prof / élève) | Migration 18 + écran `DefiIntro` livrés le 31 août. Reste à voir en usage. |

### Ce qui reste avant la rentrée — hors code

| | Qui |
|---|---|
| ⬜ **Choisir le nom** — 3 formes, voir `NOM_ET_MARQUE.md` | Aymeri. **Bloque la passe visuelle.** |
| ⬜ Logo, dans ses trois tailles | Aymeri |
| ⬜ Passe visuelle avec Claude Design | après le nom |
| ⬜ Base de **production** (projet Supabase séparé, région EU) | migrations seules, **aucun seed** |
| ⬜ Import de rentrée des 350 élèves | onglet Import, format `email, nom, prénom, classe` |
| ⬜ `*.supabase.co` autorisé dans Jamf | Aymeri |
| ⬜ Web Clip Jamf — libellé et icône | après le nom |
| ⬜ RGPD : registre de traitement, DPO, direction | Aymeri |
| ⬜ SMTP Workspace (secours e-mail, non urgent) | facultatif |

**Projet Supabase de développement** : `calcul-mental-dev`,
référence `lkukdlspcgqtiimvwlsd`, région Francfort, PostgreSQL 17.
Il n'existe **aucune base de production** à ce jour.

### Comment on en est arrivé là

Le code a été écrit par Antigravity, relu systématiquement contre le SQL, et
corrigé à chaque lot. Ce que la relecture a attrapé, et qu'aucun `npm run build`
n'aurait vu :

- des badges de Montée distribués sans monter
- une colonne fossile affichant « tables 1 à 10 » à un élève Expert
- le profil et le classement montrant deux nombres différents pour la même chose
- le 20/20 rendu littéralement inatteignable par une closure périmée
- un écran Administration peuplé de six élèves inventés
- deux variables CSS manquantes rendant deux cartes illisibles
- une règle de points qui rendait l'abandon plus rentable que l'effort
- un profil enseignant affichant « Découverte, tables 1 à 10 » à un adulte
- un défi de professeur sans aucun chemin de retour : code noté, écran quitté,
  résultat jamais revu — c'est-à-dire le moment même où l'outil devait servir
- le nom du professeur affiché « — » dans la salle des profs (`nom` au lieu de
  `nom_affiche` : **deuxième fois** que ce type d'écart de contrat frappe)
- « 1 / 27 ont terminé » pour un défi lancé à deux copains

**Trois de ces défauts ont été trouvés par Aymeri en utilisant l'application, un
par Antigravity relisant le SQL.** La relecture croisée n'est pas une formalité :
c'est elle qui a fait la qualité de ce projet.

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

**Défi d'élève et défi de professeur : mêmes points, statuts différents.**
*(31 août 2026.)* Un point mesure l'effort de celui qui répond, pas le grade de
celui qui a créé le défi. Si un défi de professeur rapportait davantage, les
défis entre copains mourraient en trois semaines — or ce sont eux qui font
qu'un élève ouvre l'application à 19 h sans qu'on le lui demande. Ce qui change
est le **statut** : un défi de professeur est du travail prescrit, le seul
qu'on puisse évoquer en classe ou cocher « fait / pas fait ». La base sait déjà
les distinguer (`cree_par_prof` XOR `cree_par_eleve`) ; il manque l'étiquette à
l'écran. Garde-fous côté élève, déjà en place et suffisants : plafond de
tables, 5 défis ouverts, 24 h, une seule participation par défi (clé primaire),
et des points pondérés par la difficulté des tables — bourrer les tables de 2
rapporte structurellement moins.

**Le dénominateur n'appartient qu'aux défis de professeur.**
« 18 / 27 ont terminé » a un sens pour une classe entière. Trois amis sur 27 ne
sont pas « 3 / 27 » : pour un défi d'élève, on affiche « 3 ont joué », sans
dénominateur.

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

### Contrat des fonctions

**Toutes les fonctions de classement renvoient les mêmes colonnes** —
`rang, nom_affiche, classe, avatar, valeur, est_moi` — même quand deux d'entre
elles sont toujours nulles. *(31 août 2026, après le deuxième bug de ce type :
`classe` au lieu de `nom_affiche` dans l'onglet Classes, puis `nom` au lieu de
`nom_affiche` dans la salle des profs.)* Le coût d'une colonne vide est nul ;
le coût d'une exception à retenir côté React est un bug par écran. Une
exception au contrat se paie une fois par écran, pour toujours.

**Toute fonction qui renvoie un ratio nomme ses deux populations.**
*(1er septembre 2026, après le troisième bug identique en deux jours.)*
Migration 17 : « 2 / 1 ont terminé » — numérateur tous les joueurs,
dénominateur les élèves d'une classe. Migration 19 : « 18 sur 20 » dans une
classe de 27 — dénominateur les élèves ayant déjà travaillé la table. À chaque
fois, deux populations différentes de part et d'autre de la barre de fraction,
et à chaque fois l'erreur va dans le sens rassurant : elle **efface les élèves
qui n'ont rien fait**. Donc : le `comment on function` dit de quelle population
chaque compteur est tiré, et une fonction qui renvoie un dénominateur renvoie
aussi le numérateur qui lui correspond — jamais deux compteurs que l'écran
devra apparier lui-même.

**Et l'écran ne fabrique aucune population.** *(1er septembre 2026, quatrième
occurrence.)* L'écran « Ma classe » calculait lui-même la liste des tables
« jamais travaillées » comme « 2 à 20 moins ce que renvoie la fonction » — donc
les tables 11 à 20 dans une 6ᵉ plafonnée à 10 — et le bouton « lancer un défi
sur les tables les plus faibles » les proposait en premier. Un professeur
croyait faire du rattrapage et lançait une découverte sur des tables hors de
portée. Une liste que l'écran devine est une population inventée : elle vient
du serveur, ou elle n'existe pas.

**Une migration se numérote à l'heure où on l'écrit, jamais plus tard.**
*(1er septembre 2026.)* La migration 19 porte l'horodatage `20260901080000`
alors qu'elle a été appliquée à 00:00 : elle est datée dans le futur. Toute
migration créée avant 8 h ce matin-là aurait porté un numéro inférieur — elle
serait passée **après** la 19 sur la base de développement, et **avant** elle
sur une base de production reconstruite depuis zéro. Deux bases qui divergent
sans un seul message d'erreur. On ne renomme pas la 19, déjà appliquée : on
retient que **la suivante doit dépasser `20260901080000`**.

### Méthode

**Le jeu de démonstration (`seed.sql`) ne va que dans la base de dev.**
La production démarre vide. Ce n'est pas du contenu, c'est un instrument de
mesure : sans données, on ne distingue pas « ça marche mais c'est vide » de
« c'est cassé ». C'est grâce à lui qu'un bug de points à zéro a été trouvé
avant la mise en service.

**`./supabase/tests/run.sh` passe avant chaque commit.**
82 cas, dont une dizaine de tentatives de contournement qui doivent toutes
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
| `PROMPT_ANTIGRAVITY.md` | Le message de démarrage à coller dans **Antigravity** |
| `docs/PROJET_CLAUDE.md` | Les instructions à coller dans le projet Claude — voir §6 |
| `docs/ecrans-et-defis.html` | Les maquettes visuelles élève et professeur |
| `archive/` | ⚠️ Ancienne architecture Apps Script — **périmé, ne pas suivre** |

---

## 5. Ce qui reste à faire

### Pour l'agent

**Les quatre lots de construction sont terminés** (`ANTIGRAVITY_BRIEF.md` §6 :
fondations, modes solo, défis, finitions). Ce qui reste n'est plus du montage
mais de la correction et deux écrans manquants, par ordre de valeur :

1. ✅ **« Mes défis »** et **la salle des profs** — livrés le 31 août.
2. ✅ **Origine du défi à l'écran** et ratio de classe corrigé — livrés le
   31 août (commit `0d3b557`). Un écran `DefiIntro` annonce désormais
   « 📚 Défi de M. Desjardins — 6A » ou « 🎮 Défi de Lou A. » avant la
   première question.
3. **« Ma classe »** — la grille de maîtrise agrégée, écran 15 de `ECRANS.md`.
   **C'est le lot en cours.** `maitrise_classe(p_classe)` existe depuis la
   migration 4, complétée par la migration 19 (`eleves_classe`,
   `taux_couverture`) : le dénominateur est enfin l'effectif de la classe et
   non le nombre d'élèves ayant déjà travaillé la table.
   *Recommandation : avant la rentrée.* Tout le reste de l'application est
   fait pour les élèves ; c'est le seul écran qui donne une raison à un
   professeur de maths de rouvrir l'outil la semaine suivante.
4. Passe visuelle, **après** le choix du nom.

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

### Le message à coller

> Le dossier « Calcul mental » est connecté. Lis `ETAT.md` à la racine, puis
> `ANTIGRAVITY_BRIEF.md` et `ECRANS.md`, et les trois dernières entrées de
> `JOURNAL.md`. Ignore `archive/` : c'est l'ancienne architecture Apps Script,
> abandonnée. Le partage du travail est fixe : **moi (Claude) je fais la
> conception, le SQL et la relecture ; Antigravity écrit le React**, parce
> qu'il voit le résultat à l'écran. Aymeri relaie les messages entre nous.
> Dis-moi ensuite où en est le projet selon toi et ce que tu proposes comme
> prochaine étape.

### ⚠️ Avant d'ouvrir le nouveau chat — nettoyer le projet Claude

Les connaissances du projet Claude décrivent encore **l'ancienne architecture**
(Google Apps Script + Google Sheets + proxy Vercel). Un chat neuf les lira et
partira faux dès la première réponse. À faire dans claude.ai :

- **Remplacer les instructions du projet** par le texte donné dans
  `docs/PROJET_CLAUDE.md`.
- **Supprimer des connaissances** : `AUDIT_HANDOFF.md`, `code.gs`, `gas.js`,
  `App.jsx`, `Login.jsx`, `Profile.jsx`, `Leaderboards.jsx`, `Challenges.jsx`,
  `api.js`, `claude/DEMARRAGE.md`, `claude/ANTIGRAVITY_BRIEF.md`.
  Tous datent d'avant la bascule vers Supabase, ou sont périmés.
- **Garder** `claude/ETAT.md` — la copie de ce document, tenue à jour.

Le dépôt sur le disque fait foi. Les connaissances du projet ne servent qu'à
donner le contexte quand le dossier n'est pas encore connecté.

### La discipline à tenir

À **chaque étape franchie**, deux gestes :

0. **Corriger la date en tête de ce fichier.** Premier geste, pas dernier.
1. **Ajouter une entrée dans `JOURNAL.md`** — fait / décidé / constaté /
   ensuite. Le modèle est en tête du fichier. En marquant clairement ce qui est
   validé, et par qui.
2. **Mettre à jour ce document** — le tableau du §2 toujours, le registre des
   décisions du §3 si un choix de conception a été pris.

Le journal raconte, `ETAT.md` fait foi. C'est ce qui permet de changer de chat,
d'outil ou de personne sans rien reperdre.
