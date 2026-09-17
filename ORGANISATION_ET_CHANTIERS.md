# Organisation du Projet et Feuilles de Route — matHo

*Document de référence — Mis à jour le 16 septembre 2026*

---

## 1. Ce qui est Fait, Validé et en Production (Sanctuarisé)

L'application est **en production officielle** au collège Saint-Honoré d'Eylau depuis le vendredi 11/12 septembre 2026.

| Domaine | Réalisation | État |
| :--- | :--- | :--- |
| **Déploiement iPads** | Webclips déployés via Jamf, domaines autorisés (`*.supabase.co`, `accounts.google.fr`). Pas besoin de RGPD supplémentaire (validé). | 🟢 En production |
| **Authentification** | Connexion Google SSO `@saintho.fr` pour les **313 élèves** et les **6 enseignants**. Rôles protégés. | 🟢 En production |
| **Couvre-feu nocturne** | Interdiction d'enregistrement la nuit (paramétrable par l'admin), message bienveillant. | 🟢 En production |
| **Défis élèves & Coupe-circuit** | Migration 48. Bouton « Défier un ami 👥 » actif pour les élèves. Interrupteur d'arrêt d'urgence par niveau (6e, 5e, 4e, 3e) ou global dans le panneau Admin. | 🟢 En production |
| **Fiche élève détaillée** | Migration 49. Temps de réaction pur vs cadence, historique complet des défis joués avec badges, participants et classements. | 🟢 En production |
| **Salle des profs (Solo)** | Migration 9 et 29. Table dédiée `sessions_profs` étanche. Classement des profs entre collègues sur les modes solo (Sprint, Points, Série...). | 🟢 En production |
| **Sauvegardes automatiques** | Ping quotidien à 5h17 UTC (GitHub Actions) + dumps complets hebdomadaires vers Google Drive. | 🟢 Opérationnel |

---

## 2. Décisions d'Architecture sur la Base de Test & Staging

### Historique des échanges :
* **Projet Étiquettes Livres (modèle)** : Présence de deux classeurs étanches (Prod et Test) avec scripts miroirs (`push_prod.sh` et `push_test.sh`).
* **Calcul Mental (matHo)** :
  * Le 14 septembre, l'idée d'un environnement lourd en local (Docker / OrbStack sur Mac) a été écartée pour éviter l'usine à gaz technique.
  * Avec 313 élèves actifs en continu sur la base distante Supabase (`lkukdlspcgqtiimvwlsd`), tester de nouvelles fonctionnalités complexes directement en production présente un risque.
  * **Décision retenue** : Mettre en place une **production de test / staging** légère et étanche :
    1. Un **second projet Supabase gratuit** miroir (ex: `matho-test`), recevant les mêmes 49 migrations.
    2. Une URL de prévisualisation (Vercel ou similaire) permettant de tester sur iPad réel sans impacter les vrais élèves.

---

## 3. Architecture des « Défis Profs »

### Existant :
* Pour les modes **solo** (Sprint, etc.), les profs ont **déjà leur table étanche** (`sessions_profs`) distincte de celle des élèves (`sessions_jeu`). Leurs scores n'apparaissent que dans la **Salle des profs**.
* Pour les **défis à plusieurs (codes à 5 lettres)** : les tables `defis_presences` et `defis_participants` ont été conçues à l'origine avec `eleve_id NOT NULL`. Un compte professeur tentant de rejoindre un code défi reçoit actuellement `« Compte non reconnu »`.

### Chantier à venir :
* Permettre aux professeurs de se défier entre collègues (ex: en salle des profs ou par défi de niveau).
* Garantir l'étanchéité absolue : aucun enseignant dans un classement d'élèves, aucun élève dans un classement de professeurs.
* Réalisation et tests validés d'abord sur la base de test avant déploiement en production.

---

## 4. Feuille de Route Prioritaire

1. **Étape 1 : Mise en place de la production de test**
   - Créer le projet Supabase miroir.
   - Pousser le schéma (les 49 migrations) et initialiser les données de démo (`supabase/tests/01_scenario.sql`).
   - Disposer d'une URL de test accessible sur iPad.

2. **Étape 2 : Cadrage et réalisation des Défis Profs**
   - Cadrer l'usage (défis entre profs uniquement, ou possibilité pour un prof de jouer le défi de sa classe sans fausser le podium élève).
   - Rédiger la migration SQL avec tests automatisés.
   - Valider sur la base de test, puis appliquer en production.
