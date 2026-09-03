# matHo — le code actuel de l'application

> Genere le 2026-09-03 — depuis le commit `ddf5bf9 Retour a Claude Design sur les ecrans 11 a 14`.
> Ne pas modifier a la main : relancer `python3 outils/paquet_claude_design.py`.

## Comment lire ce fichier

**1. `api.js` est le seul document qui dit la verite.** C'est le point de
passage unique vers le serveur : une quarantaine d'appels, et pour chacun
exactement ce que la base renvoie. Si un chiffre n'y est pas, il n'existe pas
et aucun ecran ne peut l'afficher.

**2. `tokens.css` est le systeme visuel en vigueur** — couleurs du logo, rayons,
ombres, tailles, durees, et la regle du pave numerique. C'est la seule source
de verite des couleurs : aucun ecran n'en ecrit en dur.

**3. Les ecrans sont un INVENTAIRE, pas un modele.** Ils disent ce qui existe :
quels filtres, quels boutons, quels etats vides, quels messages d'erreur. Ils
ne disent pas ce qui est bien. **Une horreur dans le code n'est jamais une
contrainte.**

## Les regles qui ne se voient pas dans le code

- **Aucun champ de texte libre, nulle part.** Pas de nom de defi, pas de
  message, pas de pseudo, pas de commentaire. Moderer du texte ecrit par 350
  collegiens est impossible pour l'etablissement. C'est absolu.
- **Aucune ressource exterieure.** Les iPads sont filtres par un MDM : pas de
  Google Fonts, pas de bibliotheque d'icones, pas d'image en ligne. Polices =
  fichiers du projet, icones = emoji ou SVG ecrit a la main.
- **Un ecran ne fabrique jamais une population.** Si un affichage a besoin d'un
  chiffre, c'est le serveur qui l'envoie. Cinq bugs de ce projet viennent d'un
  ratio deduit dans l'ecran — et l'erreur va toujours dans le sens rassurant.
- **Portrait, tactile, 11 a 15 ans, salle de classe sous neon.** Sauf l'ecran
  d'administration, qui s'utilise sur un Mac, en paysage.

---


## api.js — LE CONTRAT AVEC LE SERVEUR (a lire en premier)

`frontend/src/api.js`

```js
/**
 * matHo — Client API
 * ===================================================================
 *
 * POINT DE PASSAGE UNIQUE entre l'application et Supabase.
 * Aucun écran n'importe `supabase` directement. Tout passe par ici.
 *
 * Cette règle a déjà sauvé le projet une fois : elle a permis de
 * remplacer tout le backend Google Apps Script sans toucher aux
 * écrans. Elle doit tenir.
 *
 * DEUXIÈME RÈGLE : on n'écrit jamais dans les tables.
 * Toutes les écritures passent par les fonctions RPC définies dans
 * `supabase/migrations/`. Le serveur valide et calcule — un élève ne
 * doit pas pouvoir fabriquer un score, s'attribuer un badge ou
 * rejouer un défi. Les politiques RLS bloquent de toute façon
 * l'écriture directe, mais autant que le code dise la même chose.
 * ===================================================================
 */

import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
    throw new Error(
        "Configuration Supabase manquante. Crée `frontend/.env.local` avec " +
        "VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY."
    );
}

export const supabase = createClient(URL, ANON, {
    auth: {
        persistSession: true,     // la session survit au rechargement de page
        autoRefreshToken: true,   // ...et à une matinée de cours
        // ⚠️ DOIT rester à true : c'est ce qui permet de récupérer la session
        // au retour de Google. Le mettre à false casse la connexion OAuth
        // sans message d'erreur — on revient sur le login, en boucle.
        detectSessionInUrl: true,
    },
});

/* ===================================================================
 * Appel générique
 *
 * Deux formes d'échec remontent du serveur, il faut traiter les deux :
 *
 *   1. Une EXCEPTION SQL — « Score incohérent », « Tu as déjà
 *      participé ». Elle arrive dans `error.message`, en français,
 *      rédigée pour être lue par un élève. On la relaie telle quelle.
 *
 *   2. Un RETOUR SOUPLE — `{ok: false, raison, message}`. Utilisé
 *      quand l'échec est prévisible et qu'on veut le distinguer :
 *      code inconnu / défi fermé / déjà joué.
 * ================================================================= */

async function rpc(nom, params = {}) {
    const { data, error } = await supabase.rpc(nom, params);

    if (error) {
        console.error(`RPC ${nom} :`, error);
        return { ok: false, error: messageLisible(error) };
    }
    // Retour souple : la fonction a répondu, mais avec un refus motivé
    if (data && typeof data === 'object' && data.ok === false) {
        return { ok: false, error: data.message, message: data.message, raison: data.raison, data };
    }
    return { ok: true, data };
}

/**
 * Les messages d'erreur du serveur sont déjà écrits en français et
 * destinés à l'utilisateur. On ne les réécrit pas — on se contente de
 * traduire les cas techniques que personne ne peut comprendre.
 */
function messageLisible(error) {
    const m = error?.message || '';
    if (/JWT|not authenticated|session/i.test(m)) {
        return 'Ta session a expiré. Reconnecte-toi.';
    }
    if (/Failed to fetch|NetworkError|fetch failed/i.test(m)) {
        return 'Pas de connexion. Vérifie le wifi.';
    }
    if (/permission denied|42501/i.test(m)) {
        return "Tu n'as pas les droits pour faire ça.";
    }
    return m || 'Une erreur est survenue.';
}

/* ===================================================================
 * AUTHENTIFICATION
 *
 * DEUX CHEMINS, et un seul est mis en avant.
 *
 *   1. GOOGLE — le bouton principal. Les élèves ont tous un compte
 *      Google scolaire, qu'ils utilisent déjà dans Safari pour les
 *      Google Forms. Sur un iPad où la session Google est ouverte,
 *      c'est UNE TAPE. Rien à taper, rien à attendre, aucun mail.
 *
 *   2. CODE PAR E-MAIL — le secours, en lien discret. Utile à la
 *      maison sur un ordinateur sans session Google scolaire, ou en
 *      cas de panne Google.
 *      ⚠️ Ne fonctionne QUE si le SMTP Workspace est configuré : le
 *      service intégré de Supabase plafonne à 2 messages/heure et
 *      n'écrit qu'aux membres du projet. Tant que ce n'est pas fait,
 *      garde ce lien masqué — un secours qui échoue est pire que pas
 *      de secours.
 *
 * SURTOUT PAS de lien magique par e-mail : sur iPad il s'ouvre dans le
 * navigateur interne de l'app Mail, la session atterrit au mauvais
 * endroit, et l'élève reste déconnecté dans Safari. La redirection
 * Google, elle, revient dans le MÊME navigateur — le problème ne se
 * pose pas.
 *
 * Pour le secours, le modèle d'e-mail Supabase doit utiliser
 * {{ .Token }} et non {{ .ConfirmationURL }}. Voir
 * SUPABASE_PAS_A_PAS.md.
 *
 * DANS LES DEUX CAS, l'authentification ne donne AUCUN droit : elle
 * prouve seulement qui est la personne. C'est la présence de son
 * adresse dans la table `eleves` ou `profs` qui l'autorise. Une
 * adresse inconnue obtient une session valide et accès à rien —
 * `quiSuisJe()` renvoie alors le type `inconnu`.
 * ================================================================= */

/**
 * Connexion par le compte Google de l'établissement.
 *
 * `hd: 'saintho.fr'` limite le sélecteur de compte au domaine du
 * collège : un élève connecté à son Gmail personnel sur l'iPad ne le
 * verra pas proposé. À combiner avec l'application OAuth déclarée en
 * mode « Interne » dans Google Cloud Console, qui ferme la porte en
 * amont.
 *
 * Cette fonction NE RETOURNE PAS un utilisateur connecté : elle
 * redirige le navigateur vers Google. La session est récupérée au
 * retour, grâce à `detectSessionInUrl`. C'est donc `App.jsx` qui
 * constate la connexion au montage suivant, pas cet appel.
 */
export async function connexionGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin,
            queryParams: {
                hd: 'saintho.fr',
                prompt: 'select_account',
            },
        },
    });
    return error ? { ok: false, error: messageLisible(error) } : { ok: true };
}

/**
 * `shouldCreateUser: true` est indispensable : un élève n'existe pas
 * encore dans `auth.users` avant sa première connexion. Le compte est
 * créé, puis rattaché automatiquement à sa fiche par un trigger.
 *
 * Quelqu'un d'extérieur peut donc créer un compte — mais si son
 * adresse n'est ni dans `eleves` ni dans `profs`, `quiSuisJe()`
 * renvoie `inconnu` et il n'a accès à rien. C'est la barrière
 * d'entrée, elle est en base, pas dans l'interface.
 */
export async function demanderCode(email) {
    const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true },
    });
    if (error) {
        // Supabase limite à une demande par minute et par adresse
        if (/rate|60 seconds|too many/i.test(error.message)) {
            return { ok: false, error: 'Attends une minute avant de redemander un code.' };
        }
        return { ok: false, error: messageLisible(error) };
    }
    return { ok: true };
}

export async function verifierCode(email, code) {
    const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: 'email',
    });
    if (error) {
        if (/expired/i.test(error.message)) {
            return { ok: false, error: 'Ce code a expiré. Demandes-en un nouveau.' };
        }
        if (/invalid|token/i.test(error.message)) {
            return { ok: false, error: 'Code incorrect. Vérifie les chiffres.' };
        }
        return { ok: false, error: messageLisible(error) };
    }
    return { ok: true, data };
}

export async function seDeconnecter() {
    await supabase.auth.signOut();
    return { ok: true };
}

/** Y a-t-il une session valide ? À appeler au démarrage de l'app. */
export async function sessionActive() {
    const { data } = await supabase.auth.getSession();
    return !!data?.session;
}

/** Adresse e-mail du compte connecté (s'il y en a un). */
export async function emailSession() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.email || null;
}

/**
 * Qui est connecté : un élève, un prof, ou personne de reconnu.
 *
 * À APPELER EN PREMIER après la connexion — c'est cette réponse qui
 * décide de l'écran d'accueil. Le troisième cas, `inconnu`, doit être
 * traité proprement : compte créé mais adresse absente des tables.
 * Afficher le message, ne pas boucler sur le login.
 */
export async function quiSuisJe() {
    return rpc('qui_suis_je');
}

/* ===================================================================
 * PROFIL ÉLÈVE
 * ================================================================= */

/** Profil, records, grille de maîtrise et badges, en un seul appel. */
export async function monProfil() {
    return rpc('mon_profil');
}

/** Le profil d'un enseignant — ses parties, ses records, son rang. */
export async function monProfilProf() {
    return rpc('mon_profil_prof');
}

/** Les 4 tables les plus ratées — alimente « Mes tables faibles ». */
export async function mesTablesFaibles(combien = 4) {
    return rpc('mes_tables_faibles', { p_combien: combien });
}

/**
 * L'avatar est le SEUL champ qu'un élève peut modifier lui-même.
 * Un trigger en base restaure tous les autres s'il tente autre chose —
 * inutile d'essayer de contourner, et inutile de le vérifier ici.
 */
export async function changerAvatar(emoji) {
    const { data: me } = await supabase.auth.getUser();
    if (!me?.user) return { ok: false, error: 'Session expirée.' };

    const { error } = await supabase
        .from('eleves')
        .update({ avatar_emoji: emoji })
        .eq('user_id', me.user.id);

    return error ? { ok: false, error: messageLisible(error) } : { ok: true };
}

/* ===================================================================
 * ENREGISTRER UNE PARTIE
 * ================================================================= */

/**
 * @param {object} s
 * @param {string}   s.mode            libre|apprentissage|sprint|flawless|countdown|climb
 * @param {number[]} s.tables          tables jouées
 * @param {number}   s.nbQuestions
 * @param {number}   s.score
 * @param {string[]} s.erreurs         faits ratés, ex. ["7_8", "6_9"]
 * @param {number}   s.dureeS
 * @param {number}   s.serieMax
 * @param {number}   s.sansFauteMax
 * @param {number}   [s.plusHauteTable]
 * @param {object}   [s.maitrise]      {"7_8": 2, "6_9": 1} — 1 rouge, 2 jaune, 3 vert
 * @param {string}   [s.defiId]
 */
export async function enregistrerSession(s) {
    const params = {
        p_mode: s.mode,
        p_tables: s.tables ?? [],
        p_nb_questions: s.nbQuestions ?? 0,
        p_score: s.score ?? 0,
        p_erreurs: s.erreurs ?? [],
        p_duree_s: s.dureeS ?? 0,
        p_serie_max: s.serieMax ?? 0,
        p_sans_faute_max: s.sansFauteMax ?? 0,
        p_plus_haute_table: s.plusHauteTable ?? null,
        p_maitrise: s.maitrise ?? {},
        p_defi_id: s.defiId ?? null,
        p_score_premier_essai: s.scorePremierEssai ?? null,
    };

    const r = await rpc('enregistrer_session', params);

    // Réseau coupé : on met de côté plutôt que de perdre la partie.
    if (!r.ok && estPanneReseau(r.error)) {
        mettreEnAttente('enregistrer_session', params);
        return { ok: true, enAttente: true, data: { nouveaux_badges: [] } };
    }
    return r;
}

/** Une partie jouée par un enseignant — table et classement séparés. */
export async function enregistrerSessionProf(s) {
    return rpc('enregistrer_session_prof', {
        p_mode: s.mode,
        p_tables: s.tables ?? [],
        p_nb_questions: s.nbQuestions ?? 0,
        p_score: s.score ?? 0,
        p_duree_s: s.dureeS ?? 0,
        p_serie_max: s.serieMax ?? 0,
        p_sans_faute_max: s.sansFauteMax ?? 0,
        p_plus_haute_table: s.plusHauteTable ?? null,
        p_score_premier_essai: s.scorePremierEssai ?? null,
    });
}

/* ===================================================================
 * FILE D'ATTENTE HORS-LIGNE
 *
 * Le wifi d'un collège tombe. Sans ce filet, une coupure en fin de
 * partie perd le résultat sans un mot, et l'élève a joué deux minutes
 * pour rien — le genre de chose qui fait abandonner un outil.
 *
 * ⚠️ Ceci n'enfreint PAS la règle « pas de localStorage pour les
 * données de jeu ». C'est un TAMPON D'ENVOI, pas une source de
 * vérité : rien n'est jamais lu depuis cette file pour être affiché.
 * Le serveur reste seul juge des scores et des classements.
 * ================================================================= */

const FILE = 'saintho_file_envoi';

function estPanneReseau(msg = '') {
    return /connexion|réseau|network|fetch|wifi/i.test(msg);
}

function lireFile() {
    try { return JSON.parse(localStorage.getItem(FILE) || '[]'); }
    catch { return []; }
}

function ecrireFile(f) {
    try { localStorage.setItem(FILE, JSON.stringify(f)); } catch { /* quota, mode privé */ }
}

function mettreEnAttente(fonction, params) {
    const f = lireFile();
    f.push({ fonction, params, le: Date.now() });
    // Au-delà de 50, quelque chose ne va pas : on garde les plus récentes.
    ecrireFile(f.slice(-50));
    signaler();
}

/** Combien de parties attendent d'être envoyées ? Pour l'indicateur. */
export function partiesEnAttente() {
    return lireFile().length;
}

/**
 * Rejoue la file. À appeler au démarrage et au retour du réseau.
 * S'arrête à la première erreur pour préserver l'ordre des parties.
 */
export async function viderFile() {
    let f = lireFile();
    if (!f.length) return { ok: true, envoyees: 0 };

    // ⚠️ GARDE-FOU : sans session, chaque RPC est refusée pour cause de
    // permission — et un refus de permission n'est PAS une panne réseau.
    // La boucle ci-dessous jetterait alors les parties une par une, en
    // silence. On sort avant : la file attend la prochaine connexion.
    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session) return { ok: true, envoyees: 0, restantes: f.length };

    let envoyees = 0;
    while (f.length) {
        const { error } = await supabase.rpc(f[0].fonction, f[0].params);
        if (error) {
            if (estPanneReseau(error.message)) break;   // toujours hors-ligne
            f.shift();                                   // refus définitif : on jette
            continue;
        }
        f.shift();
        envoyees++;
    }
    ecrireFile(f);
    signaler();
    return { ok: true, envoyees, restantes: f.length };
}

const ecouteurs = new Set();
function signaler() { ecouteurs.forEach(fn => fn(partiesEnAttente())); }

/** S'abonner au compteur de parties en attente. Renvoie la fonction de désabonnement. */
export function surFileChangee(fn) {
    ecouteurs.add(fn);
    return () => ecouteurs.delete(fn);
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { viderFile(); });
}

/* ===================================================================
 * DÉFIS
 *
 * Seuls Sprint et Contre-la-montre sont jouables en défi : Sans faute
 * et Montée produisent des écarts de durée trop grands pour un usage
 * simultané en classe. Le serveur le refuse de toute façon.
 * ================================================================= */

export async function creerDefi({ type, tables, nbQuestions = 20, dureeS = null, classe = null }) {
    return rpc('creer_defi', {
        p_type: type,
        p_tables: tables,
        p_nb_questions: nbQuestions,
        p_duree_s: dureeS,
        p_classe: classe,
    });
}

/**
 * Trois refus DISTINCTS, et l'interface doit les distinguer :
 *   'inconnu'    → « Ce code n'existe pas. Vérifie les lettres. »
 *   'ferme'      → « Ce défi est terminé. »
 *   'deja_joue'  → « Tu as déjà participé. » + proposer de voir le classement
 *
 * Un message unique du genre « erreur » laisserait l'élève bloqué sans
 * savoir s'il doit retaper le code ou passer à autre chose.
 */
export async function rejoindreDefi(code) {
    return rpc('rejoindre_defi', { p_code: code.trim().toUpperCase() });
}

export async function terminerDefi({ defiId, score, tempsS, erreurs = 0, detail = {}, maitrise = {}, scorePremierEssai = null }) {
    return rpc('terminer_defi', {
        p_defi_id: defiId,
        p_score: score,
        p_temps_s: tempsS,
        p_erreurs: erreurs,
        p_detail: detail,
        p_maitrise: maitrise,
        p_score_premier_essai: scorePremierEssai,
    });
}

export async function classementDefi(defiId) {
    return rpc('classement_defi', { p_defi_id: defiId });
}

/** « 18 / 27 ont terminé ». `attendus` vaut null si le défi n'a pas de classe. */
export async function avancementDefi(defiId) {
    return rpc('avancement_defi', { p_defi_id: defiId });
}

/**
 * Le classement se remplit tout seul pendant que les autres terminent.
 * C'est ce qui donne l'impression du direct — sans qu'aucun mécanisme
 * temps réel n'ait été construit : tout le monde démarre ensemble
 * parce que le professeur a dit « c'est parti ».
 *
 * Renvoie la fonction de désabonnement — à appeler en quittant l'écran,
 * sinon les abonnements s'accumulent.
 */
export function suivreDefi(defiId, onChangement) {
    const canal = supabase
        .channel(`defi:${defiId}`)
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'defis_participants',
              filter: `defi_id=eq.${defiId}` },
            () => onChangement())
        .subscribe();

    return () => { supabase.removeChannel(canal); };
}

/** Les défis que j'ai créés (prof ou élève), du plus récent au plus ancien, expirés compris. */
export async function mesDefis({ limite = 20 } = {}) {
    return rpc('mes_defis', { p_limite: limite });
}

/* ===================================================================
 * CLASSEMENTS
 *
 * Trois filtres combinables :
 *   periode : 'semaine' | 'mois' | 'annee' | 'tout'
 *   portee  : 'classe' | 'niveau' (tous les 6ᵉ) | 'college'
 *   palier  : 'decouverte' | 'confirme' | 'expert' | 'tous' | null
 *
 * `palier: null` = le palier de l'élève, c'est le bon défaut.
 * `palier: 'tous'` = tableau d'honneur du collège — une vitrine des
 * records, jamais le classement par défaut : sinon les mêmes sont
 * toujours en tête et les plus fragiles toujours en bas.
 *
 * `portee: 'classe'` PAR DÉFAUT : la comparaison de proximité motive,
 * l'exposition à l'échelle du collège écrase.
 * ================================================================= */

export async function classementProgression({ periode = 'semaine', portee = 'classe', palier = null, limite = 20 } = {}) {
    return rpc('classement_progression', {
        p_periode: periode, p_portee: portee, p_palier: palier, p_limite: limite,
    });
}

/** categorie : 'serie' | 'chrono' | 'sprint' | 'montee' | 'points' */
export async function classementRecords({ categorie = 'serie', periode = 'tout', portee = 'classe', palier = null, limite = 20 } = {}) {
    return rpc('classement_records', {
        p_categorie: categorie, p_periode: periode, p_portee: portee,
        p_palier: palier, p_limite: limite,
    });
}

/** 6ᵉA contre 6ᵉB — en moyenne par élève, pour ne pas avantager les classes nombreuses. */
export async function classementClasses({ periode = 'semaine', niveau = null } = {}) {
    return rpc('classement_classes', { p_periode: periode, p_niveau: niveau });
}

/** Le classement de la salle des profs — invisible pour les élèves. */
export async function classementProfs({ categorie = 'points', periode = 'tout', limite = 20 } = {}) {
    return rpc('classement_profs', {
        p_categorie: categorie, p_periode: periode, p_limite: limite,
    });
}

/* ===================================================================
 * ENSEIGNANT — suivi de classe
 * ================================================================= */

/** « 18 élèves sur 27 bloquent sur la table de 7 » — l'écran qui décide de l'adoption. */
export async function maitriseClasse(classe) {
    return rpc('maitrise_classe', { p_classe: classe });
}

/** Toutes les classes, avec effectifs. `est_favorite` = raccourci de l'enseignant. */
export async function listeClasses() {
    return rpc('liste_classes');
}

/** Avant de créer un défi : combien d'élèves n'ont pas la plus haute table choisie. */
export async function apercuDefiClasse(classe, tables) {
    return rpc('apercu_defi_classe', { p_classe: classe, p_tables: tables });
}

/** Mes classes habituelles — un raccourci d'affichage, aucun effet sur les droits. */
export async function definirMesClasses(classes) {
    return rpc('definir_mes_classes', { p_classes: classes });
}

/* ===================================================================
 * ADMINISTRATION DES ÉLÈVES
 * ================================================================= */

/**
 * Import de rentrée.
 * @param {Array<{email,nom,prenom,classe}>} eleves
 *
 * ⚠️ Le retour contient DEUX listes à afficher, ne les avale pas :
 *   `lignes_ignorees`            → lignes invalides, avec la raison
 *   `actifs_absents_du_fichier`  → élèves en base absents du fichier
 *
 * L'import ne désactive JAMAIS personne. Ces absents sont signalés
 * pour que l'administrateur décide au cas par cas. Ne propose pas de
 * désactivation en masse en un clic : un export raté couperait
 * l'accès à tout un niveau un lundi matin.
 */
export async function importerEleves(eleves) {
    return rpc('importer_eleves', { p_eleves: eleves });
}

/** Rejoue le rattachement pour toutes les fiches orphelines. Réservé admin. */
export async function reparerRattachements() {
    return rpc('reparer_rattachements');
}

/** L'élève arrive en novembre. Il peut se connecter dans la minute. */
export async function ajouterEleve({ email, nom, prenom, classe }) {
    return rpc('ajouter_eleve', {
        p_email: email, p_nom: nom, p_prenom: prenom, p_classe: classe,
    });
}

/**
 * ⚠️ L'e-mail n'est modifiable que si l'élève ne s'est JAMAIS connecté.
 * Après, le compte est rattaché : changer l'adresse le laisserait
 * connecté sous une identité qui n'existe plus. Le serveur refuse et
 * explique quoi faire — relaie son message tel quel.
 */
export async function modifierEleve(eleveId, { email = null, nom = null, prenom = null, classe = null } = {}) {
    return rpc('modifier_eleve', {
        p_eleve_id: eleveId, p_email: email, p_nom: nom,
        p_prenom: prenom, p_classe: classe,
    });
}

/**
 * On ne SUPPRIME jamais un élève en cours d'année, on le désactive.
 * Supprimer effacerait ses sessions en cascade : les classements de sa
 * classe changeraient rétroactivement et les défis auxquels il a
 * participé deviendraient incohérents.
 *
 * Aucun bouton « Supprimer » dans l'interface d'administration.
 */
export async function desactiverEleve(eleveId, motif = null) {
    return rpc('desactiver_eleve', { p_eleve_id: eleveId, p_motif: motif });
}

export async function reactiverEleve(eleveId) {
    return rpc('reactiver_eleve', { p_eleve_id: eleveId });
}

/**
 * « Mes 5ᵉ sont prêts pour les tables jusqu'à 12 » — une seule action.
 * Ne redescend jamais le plafond d'un élève qui a débloqué plus haut
 * par la Montée des tables : ce serait lui reprendre ce qu'il a gagné.
 */
export async function definirPlafondClasse(classe, plafond) {
    return rpc('definir_plafond_classe', { p_classe: classe, p_plafond: plafond });
}

/** Qui n'a jamais réussi à se connecter — la question des deux premières semaines. */
export async function elevesSansConnexion(classe = null) {
    return rpc('eleves_sans_connexion', { p_classe: classe });
}

/** Les élèves d'une classe — actifs ET désactivés. */
export async function listeEleves(classe = null) {
    return rpc('liste_eleves', { p_classe: classe });
}

/* ===================================================================
 * COMPTES ENSEIGNANTS  (administrateur uniquement)
 * ================================================================= */

export async function listeProfs() {
    return rpc('liste_profs');
}

/** role : 'prof' | 'admin'. Aucune limite de nombre, ni de profs ni d'admins. */
export async function creerProf({ email, nom, role = 'prof', classes = [] }) {
    return rpc('creer_prof', {
        p_email: email, p_nom: nom, p_role: role, p_classes: classes,
    });
}

/**
 * ⚠️ Le serveur refuse de retirer le DERNIER administrateur actif —
 * rétrogradation comme désactivation. Sans ce verrou, une fausse
 * manœuvre enfermerait tout le monde dehors et il faudrait passer par
 * la console Supabase. Relaie le message d'erreur tel quel.
 */
export async function modifierProf(profId, { nom = null, role = null, classes = null } = {}) {
    return rpc('modifier_prof', {
        p_prof_id: profId, p_nom: nom, p_role: role, p_classes: classes,
    });
}

export async function desactiverProf(profId) {
    return rpc('desactiver_prof', { p_prof_id: profId });
}

/** Le journal d'administration : qui a fait quoi, quand. Lisible par les enseignants. */
export async function journalAdmin(limite = 100) {
    const { data, error } = await supabase
        .from('journal_admin')
        .select('*')
        .order('fait_le', { ascending: false })
        .limit(limite);
    return error ? { ok: false, error: messageLisible(error) } : { ok: true, data };
}

/* ===================================================================
 * Regroupement par défaut, pour les écrans qui préfèrent `api.xxx()`
 * ================================================================= */

export const api = {
    // connexion
    connexionGoogle, demanderCode, verifierCode,
    seDeconnecter, sessionActive, quiSuisJe, emailSession,
    // élève
    monProfil, monProfilProf, mesTablesFaibles, changerAvatar,
    enregistrerSession, enregistrerSessionProf,
    // hors-ligne
    partiesEnAttente, viderFile, surFileChangee,
    // défis
    creerDefi, rejoindreDefi, terminerDefi,
    classementDefi, avancementDefi, suivreDefi, mesDefis,
    // classements
    classementProgression, classementRecords, classementClasses, classementProfs,
    // enseignant
    maitriseClasse, listeClasses, definirMesClasses, apercuDefiClasse,
    // administration
    importerEleves, ajouterEleve, modifierEleve, reparerRattachements,
    desactiverEleve, reactiverEleve, definirPlafondClasse, elevesSansConnexion, listeEleves,
    listeProfs, creerProf, modifierProf, desactiverProf, journalAdmin,
};

export default api;

```


## styles/tokens.css — LE SYSTEME VISUEL EN VIGUEUR

`frontend/src/styles/tokens.css`

```css
/* =====================================================================
   matHo — les jetons de style
   ---------------------------------------------------------------------
   Extrait de la maquette « matHo - Refonte v2 » (docs/design/).
   C'est le SEUL endroit ou une couleur, un rayon, une ombre ou une
   taille de texte est ecrite en dur. Partout ailleurs, on utilise une
   variable. Une couleur en dur dans un composant, c'est une couleur
   qu'on oubliera de changer.

   Les couleurs viennent du logo, relevees au pixel dans
   frontend/public/matho-logo.png — pas d'une palette inventee.
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. Les polices — fichiers locaux, jamais une URL
   Les iPads passent par un filtre MDM : aucune requete vers
   fonts.googleapis.com n'aboutira. Les .woff2 sont dans le depot.
   --------------------------------------------------------------------- */
@font-face {
  font-family: 'Baloo 2';
  src: url('/fonts/baloo2-variable.woff2') format('woff2-variations');
  font-weight: 400 800;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
    U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212,
    U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: 'Nunito';
  src: url('/fonts/nunito-variable.woff2') format('woff2-variations');
  font-weight: 200 1000;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
    U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212,
    U+2215, U+FEFF, U+FFFD;
}

:root {
  /* -------------------------------------------------------------------
     2. Les couleurs du logo
     ------------------------------------------------------------------- */
  --indigo:        #20226B;  /* le « 56 », le « Ho », les cadres */
  --indigo-encre:  #1A1C55;  /* le texte courant */
  --indigo-doux:   #3A3F86;  /* texte secondaire sur fond clair */
  --ciel:          #23A4D9;  /* les mains, le « mat » — COULEUR D'ACTION */
  --ciel-pale:     #DDF0FA;
  --vert:          #018F4B;  /* maitrise */
  --vert-pale:     #DDEFE4;
  --rouge:         #E02020;  /* a revoir — donnee lue par un professeur */
  --rouge-pale:    #FBE3E3;
  --rouge-doux:    #E4736F;  /* l'erreur de l'eleve : le MEME rouge, adouci */
  --orange:        #F38E1A;  /* en cours */
  --orange-pale:   #FBE8D2;
  --podium:        #E8A33A;  /* la 1re marche, derivee de l'orange */

  --ivoire:        #FAF6EE;  /* le fond des ecrans */
  --surface:       #FFFFFF;  /* les cartes */
  --bordure:       #E4DED2;
  --gris:          #6E7391;  /* texte tertiaire, libelles */
  --gris-inerte:   #D8D2C6;  /* une table pas travaillee, un bouton eteint */

  /* -------------------------------------------------------------------
     3. Les roles — a preferer aux couleurs brutes dans les composants
     Ecrire var(--action) plutot que var(--ciel) : le jour ou l'action
     change de couleur, il y a un seul endroit a toucher.
     ------------------------------------------------------------------- */
  --action:            var(--ciel);
  --action-texte:      #FFFFFF;
  --succes:            var(--vert);
  --erreur-eleve:      var(--rouge-doux);
  --erreur-donnee:     var(--rouge);
  --attention:         var(--orange);

  /* -------------------------------------------------------------------
     4. La mosaique du logo — cinq carres, dans cet ordre
     Sert de barre de serie, de cases de la grille, et de confettis.
     C'est le SEUL motif decoratif du systeme : ne pas en ajouter un
     deuxieme.
     ------------------------------------------------------------------- */
  --mosaique-1: var(--rouge);
  --mosaique-2: var(--orange);
  --mosaique-3: var(--vert);
  --mosaique-4: var(--ciel);
  --mosaique-5: var(--indigo);

  /* -------------------------------------------------------------------
     5. Les polices
     ------------------------------------------------------------------- */
  --titre: 'Baloo 2', 'Nunito', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif;
  --texte: 'Nunito', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif;

  /* Les tailles de la maquette. Les grands nombres (la question, le
     score de fin de partie) sont en clamp() : ils cedent avant le pave.
     Voir la regle de compression, plus bas. */
  --t-question:  clamp(88px, 14vh, 116px);
  --t-score:     clamp(52px, 10vh, 72px);
  --t-touche:    clamp(34px, 4.6vh, 44px);   /* le chiffre d'une touche */
  --t-titre:     26px;
  --t-sous:      22px;
  --t-corps:     17px;
  --t-libelle:   15px;
  --t-petit:     14px;
  --t-minuscule: 13px;

  /* -------------------------------------------------------------------
     6. Rayons, ombres, espacements
     ------------------------------------------------------------------- */
  --r-carte:   26px;
  --r-touche:  24px;
  --r-bouton:  46px;
  --r-pastille: 999px;
  --r-case:    12px;   /* une case de la grille de maitrise */
  --r-carre:   4px;    /* un carre de la mosaique */

  --ombre-carte:  0 8px 20px rgba(32, 34, 107, .10);
  --ombre-douce:  0 6px 16px rgba(32, 34, 107, .08);
  --ombre-action: 0 8px 20px rgba(35, 164, 217, .28);
  /* Anneau de reponse : bonne, puis mauvaise. */
  --anneau-juste: 0 0 0 4px var(--vert-pale),  0 8px 22px rgba(32, 34, 107, .10);
  --anneau-faux:  0 0 0 4px var(--rouge-pale), 0 8px 22px rgba(32, 34, 107, .10);

  --e-1: 4px;
  --e-2: 8px;
  --e-3: 12px;
  --e-4: 16px;
  --e-5: 22px;
  --e-6: 34px;

  /* -------------------------------------------------------------------
     7. Le pave numerique — la decision d'ergonomie du projet
     L'iPad est pose a plat : le doigt part du bord bas. Le pave occupe
     donc le bas, plein cadre, et la question se contente du tiers haut.
     Ces valeurs ne sont pas decoratives, elles sont la regle :
       — le pave prend 44 % de la hauteur utile, quel que soit l'ecran ;
       — une touche ne descend JAMAIS sous 88 px de haut, 96 px de large ;
       — la gouttiere doublee du ⌫ ne se comprime jamais : c'est elle
         qui empeche de le taper a la place du 0.
     ------------------------------------------------------------------- */
  --pave-part:        44%;   /* de la hauteur utile */
  --pave-gouttiere:   16px;
  --pave-gouttiere-effacement: 32px;
  --touche-h-min:     88px;
  --touche-l-min:     96px;
  --touche-del-bg:    #F1ECE2; /* le ⌫ posé en creux, jamais en rouge */

  /* -------------------------------------------------------------------
     8. Les durees — la fete ne doit jamais faire attendre
     ------------------------------------------------------------------- */
  --d-juste:  180ms;   /* les cases passent au vert, la suite arrive pendant */
  --d-faux:   200ms;   /* tremblement, puis les cases se vident */
  --d-palier: 300ms;   /* la mosaique pulse une fois */
}

/* ---------------------------------------------------------------------
   9. Ce que le tactile impose
   Aucun etat de survol nulle part : un doigt ne survole pas, et sur iOS
   un :hover reste colle apres le relachement. Tout retour se fait au
   :active ou par une classe posee en JavaScript.
   --------------------------------------------------------------------- */
* { -webkit-tap-highlight-color: transparent; }

button, [role='button'] {
  touch-action: manipulation;      /* pas de zoom sur double-tape */
  user-select: none;
  -webkit-user-select: none;
}

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}

/* ---------------------------------------------------------------------
   10. Pont de compatibilite — a vider ecran par ecran
   ---------------------------------------------------------------------
   POURQUOI CE BLOC EXISTE.
   L'ancien `:root` d'index.css definissait une trentaine de variables.
   La consigne de la section 2 n'en nommait que six : les 21 autres ont
   disparu alors que le code les appelait encore — 279 fois. Or un
   `var(--inexistante)` ne provoque AUCUNE erreur : ni au build, ni dans
   la console. La propriete est simplement ignoree. Des couleurs de
   texte, des bordures, des fonds, des polices et des rayons se sont
   donc evapores en silence a travers toute l'application. Les barres de
   « Ma classe », peintes en var(--mint), var(--sun) et var(--coral),
   etaient toujours la — juste invisibles.

   Ce bloc redonne un sens a ces 21 noms. Ce n'est PAS la solution
   definitive : chaque ecran doit finir par appeler les roles de la
   section 3 plutot que ces alias. On le vide au fur et a mesure, et le
   jour ou il est vide, on le supprime.

   DEUX ALIAS DEMANDENT UNE RELECTURE A L'OEIL, marques ci-dessous.
   --------------------------------------------------------------------- */
:root {
  /* Encre et surfaces */
  --navy:         var(--indigo);
  --navy-mid:     var(--indigo-doux);
  --navy-dk:      var(--indigo-encre);
  --text:         var(--indigo-encre);
  --text-soft:    var(--gris);
  --border:       var(--bordure);
  --surface-alt:  var(--ivoire);

  /* Les trois couleurs de la maitrise */
  --mint:         var(--vert);
  --mint-dk:      var(--vert);
  --mint-lt:      var(--vert-pale);
  --sun:          var(--orange);

  /* ATTENTION — `--coral` servait a DEUX choses dans l'ancienne palette :
     la donnee « a revoir » (les barres de Ma classe) et un simple accent
     decoratif (boutons, pastilles). On l'aligne ici sur la DONNEE, parce
     qu'un chiffre faux est plus grave qu'un bouton terne. Les boutons et
     pastilles qui s'en servaient comme accent passent a var(--action) :
     voir `.btn--coral` et `.chip--coral` dans index.css. */
  --coral:        var(--rouge);
  --coral-dk:     var(--rouge);

  --sky:          var(--ciel);
  --sky-dk:       var(--ciel);

  /* ATTENTION — l'or a ete supprime de la marque : il n'existe pas dans
     le logo. On le remplace par la couleur d'action. Seule exception, a
     remettre a la main : la 1re marche du podium, qui garde
     var(--podium). */
  --gold:         var(--action);
  --gold-light:   var(--ciel-pale);

  /* Le violet a ete supprime lui aussi. */
  --purple:       var(--indigo-doux);

  /* Polices et rayons */
  --font-display: var(--titre);
  --font-body:    var(--texte);
  --radius-md:    var(--r-case);
}

```


## styles/index.css — le CSS des ecrans

`frontend/src/styles/index.css`

```css
@import './tokens.css';

/* ========================================================================
   matHo — Styles complémentaires
   ======================================================================== */

/* ── Reset & Base ─────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
}

body {
  font-family: var(--texte);
  color: var(--indigo-encre);
  background: linear-gradient(160deg, var(--ivoire) 0%, var(--ivoire) 50%, var(--bordure) 100%);
  min-height: 100dvh;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Touch et iPad */
input, textarea, select, button { touch-action: manipulation; }
.game-zone { user-select: none; -webkit-user-select: none; touch-action: manipulation; }

/* ── Utilitaires de typo ──────────────────────────────────────────────── */
.font-display { font-family: var(--titre); }
.font-body { font-family: var(--texte); }

/* ── App Shell ────────────────────────────────────────────────────────── */
.app-root {
  display: flex;
  justify-content: center;
  padding: 16px 14px 48px;
  min-height: 100dvh;
}

.app-stage {
  width: 100%;
  max-width: 560px;
}

/* ── Header ───────────────────────────────────────────────────────────── */
.app-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0 16px;
}

.app-header-logo {
  width: 48px;
  height: 48px;
  border-radius: var(--r-case);
  object-fit: contain;
}

.app-header-monogram {
  width: 48px;
  height: 48px;
  border-radius: var(--r-case);
  background: linear-gradient(135deg, var(--indigo), var(--indigo-doux));
  color: var(--action);
  font-family: var(--titre);
  font-weight: 800;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 1px;
}

.app-header-text {
  flex: 1;
}

.app-title {
  font-family: var(--titre);
  font-weight: 800;
  font-size: clamp(20px, 6vw, 28px);
  line-height: 1.1;
  color: var(--indigo);
  letter-spacing: -0.5px;
}

.app-baseline {
  font-size: 12px;
  font-weight: 700;
  color: var(--gris);
  margin-top: 2px;
}

/* ── Cards ────────────────────────────────────────────────────────────── */
.card {
  background: var(--surface);
  border-radius: var(--r-carte);
  padding: 22px;
  box-shadow: 0 8px 32px var(--ombre-douce), 0 2px 8px var(--ombre-douce);
  border: 1px solid rgba(232, 226, 216, 0.5);
  backdrop-filter: blur(8px);
}

.card-glass {
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.5);
}

/* ── Mode Cards (Accueil) ─────────────────────────────────────────────── */
.mode-card {
  display: flex;
  gap: 16px;
  align-items: center;
  width: 100%;
  text-align: left;
  border: none;
  cursor: pointer;
  border-radius: var(--r-carte);
  padding: 22px 24px;
  margin-top: 14px;
  color: var(--action-texte);
  box-shadow: 0 8px 28px var(--ombre-douce);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  position: relative;
  overflow: hidden;
}

.mode-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(255,255,255,0.15) 0%, transparent 60%);
  pointer-events: none;
}

.mode-card:active { transform: translateY(0) scale(0.985); }

.mode-card--learn { background: var(--surface); color: var(--indigo); border: 1px solid var(--bordure); }
.mode-card--practice { background: var(--surface); color: var(--indigo); border: 1px solid var(--bordure); }
.mode-card--challenge { background: var(--surface); color: var(--indigo); border: 1px solid var(--bordure); }

.mode-card__emoji { font-size: 44px; line-height: 1; }
.mode-card__title { font-family: var(--titre); font-weight: 800; font-size: 24px; line-height: 1.1; color: var(--indigo); }
.mode-card__desc { font-weight: 700; opacity: 0.92; font-size: 14px; margin-top: 3px; color: var(--gris); }

/* ── Buttons ──────────────────────────────────────────────────────────── */
.btn {
  font-family: var(--titre);
  font-weight: 700;
  border: none;
  cursor: pointer;
  border-radius: var(--r-touche);
  padding: 14px 22px;
  font-size: 18px;
  color: var(--action-texte);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
  position: relative;
}

.btn:active { transform: scale(0.96); }
.btn:disabled { opacity: 0.45; cursor: default; }

.btn--coral { background: var(--action); box-shadow: 0 6px 18px var(--ombre-douce); }
.btn--mint { background: var(--action); box-shadow: 0 6px 18px var(--ombre-douce); }
.btn--sky { background: var(--action); box-shadow: 0 6px 18px var(--ombre-douce); }
.btn--purple { background: var(--indigo-doux); box-shadow: 0 6px 18px var(--ombre-douce); }
.btn--gold { background: var(--action); box-shadow: 0 6px 18px var(--ombre-douce); }
.btn--navy { background: var(--indigo); box-shadow: 0 6px 18px var(--ombre-douce); }
.btn--ghost { background: var(--ivoire); color: var(--indigo-encre); box-shadow: none; border: 1px solid var(--bordure); }

.btn-back {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--gris);
  font-family: var(--titre);
  font-weight: 700;
  font-size: 16px;
  padding: 6px 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  transition: color 0.15s ease;
}

.btn-back:active { transform: scale(0.96); }

/* ── Chips (table selectors) ──────────────────────────────────────────── */
.chips { display: flex; flex-wrap: wrap; gap: 10px; }

.chip {
  font-family: var(--titre);
  font-weight: 700;
  font-size: 20px;
  width: 54px;
  height: 54px;
  border-radius: var(--r-case);
  border: 2px solid var(--bordure);
  background: var(--surface);
  color: var(--indigo-encre);
  cursor: pointer;
  transition: all 0.12s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chip:active { transform: scale(0.92); }

.chip--sky { background: var(--action); border-color: var(--action); color: var(--action-texte); }
.chip--coral { background: var(--action); border-color: var(--action); color: var(--action-texte); }
.chip--gold { background: var(--action); border-color: var(--action); color: var(--action-texte); }
.chip--navy { background: var(--indigo); border-color: var(--indigo); color: var(--action-texte); }
.chip--purple { background: var(--indigo-doux); border-color: var(--indigo-doux); color: var(--action-texte); }

/* ── Table rows (learn mode) ──────────────────────────────────────────── */
.table-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  border-radius: var(--r-case);
  background: var(--ivoire);
  margin-bottom: 8px;
  cursor: pointer;
  font-family: var(--titre);
  transition: all 0.12s ease;
}

.table-row:active { transform: scale(0.985); }
.table-row--focus { background: var(--ciel-pale); outline: 2px solid var(--action); }
.table-row__expr { font-size: 20px; font-weight: 700; }
.table-row__result { font-size: 24px; font-weight: 800; color: var(--action); min-width: 54px; text-align: right; }
.table-row__hidden { color: var(--action); }

/* ── Viz tabs ─────────────────────────────────────────────────────────── */
.viz-tabs { display: flex; gap: 6px; margin: 12px 0; }

.viz-tab {
  flex: 1;
  font-family: var(--titre);
  font-weight: 700;
  font-size: 13px;
  border: 2px solid var(--bordure);
  background: var(--surface);
  color: var(--gris);
  border-radius: var(--r-case);
  padding: 9px 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.viz-tab--active { background: var(--action); border-color: var(--action); color: var(--action-texte); }

/* ── CPA Visualizations ───────────────────────────────────────────────── */
/* Array (dots) */
.viz-array { display: grid; gap: 6px; justify-content: center; padding: 6px; }
.viz-dot {
  width: 16px; height: 16px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--ciel), var(--action));
}

/* Groups */
.viz-groups { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; padding: 10px 0; }
.viz-group {
  display: flex; flex-wrap: wrap; gap: 5px;
  background: var(--ciel-pale);
  border: 2px dashed var(--action);
  border-radius: var(--r-case);
  padding: 10px;
  justify-content: center;
}
.viz-group-item {
  width: 22px; height: 22px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--orange-pale), var(--action));
}

/* Bar model */
.viz-bar-wrap { padding: 10px 0; }
.viz-bar-row { display: flex; gap: 3px; margin-bottom: 6px; }
.viz-bar-cell {
  flex: 1; height: 36px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--titre); font-weight: 800; font-size: 14px; color: var(--action-texte);
}
.viz-bar-total {
  text-align: center; font-family: var(--titre); font-weight: 800;
  font-size: 20px; color: var(--indigo-encre); margin-top: 4px;
}

/* Skip counting */
.viz-skip { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; padding: 8px 0; }
.viz-skip-num {
  font-family: var(--titre); font-weight: 800; font-size: 20px;
  width: 46px; height: 46px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--r-case);
  background: var(--ivoire);
  color: var(--indigo-encre);
  cursor: pointer;
  transition: all 0.15s ease;
}
.viz-skip-num--hl { background: var(--action); color: var(--action-texte); }

/* Commutative toggle */
.commutative-toggle {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--titre); font-weight: 700; font-size: 15px;
  margin: 8px 0; color: var(--gris); cursor: pointer;
}
.commutative-toggle input { width: 18px; height: 18px; accent-color: var(--indigo-doux); }

/* Tips */
.tip-box {
  background: linear-gradient(135deg, var(--orange-pale), var(--orange-pale));
  border-left: 4px solid var(--action);
  border-radius: 0 var(--r-case) var(--r-case) 0;
  padding: 14px 18px;
  margin-top: 14px;
  font-weight: 700;
  font-size: 14px;
  line-height: 1.6;
}
.tip-box b { color: var(--orange); }

/* ── Mastery Grid ─────────────────────────────────────────────────────── */
.mastery-grid {
  display: grid;
  grid-template-columns: 30px repeat(15, 1fr);
  gap: 2px;
  font-size: 10px;
  font-family: var(--titre);
  font-weight: 700;
}

.mastery-grid-hdr {
  display: flex; align-items: center; justify-content: center;
  color: var(--gris); font-size: 10px;
}

.mastery-grid-cell {
  aspect-ratio: 1;
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  font-size: 8px;
  color: var(--action-texte);
  transition: background 0.3s ease;
}

/* ── Keypad ────────────────────────────────────────────────────────────── */
/* ── Keypad (Section 4 : Pavé tactile optimisé iPad) ──────────────────── */
.keypad {
  display: flex;
  flex-direction: column;
  gap: var(--pave-gouttiere);
  width: 100%;
  height: var(--pave-part);
  min-height: calc(4 * var(--touche-h-min) + 3 * var(--pave-gouttiere));
  margin-top: auto;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.keypad__row {
  display: flex;
  gap: var(--pave-gouttiere);
  flex: 1;
}

.keypad__row--bottom {
  gap: var(--pave-gouttiere-effacement); /* 32 px incompressible */
}

.key {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--titre);
  font-weight: 700;
  font-size: var(--t-touche);
  min-height: var(--touche-h-min); /* 88px */
  min-width: var(--touche-l-min); /* 96px */
  border-radius: var(--r-touche);
  background: var(--surface);
  color: var(--indigo-encre);
  border: none;
  box-shadow: 0 4px 12px rgba(32, 34, 107, 0.08);
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 0.06s ease, background-color 0.06s ease;
}

.key:active {
  transform: scale(0.96);
  background: var(--ciel-pale);
}

.key--zero {
  flex: 2; /* Deux colonnes au centre-bas */
}

.key--del {
  flex: 1;
  background: var(--touche-del-bg); /* posé en creux, jamais en rouge */
  color: var(--indigo-doux);
  box-shadow: none;
  border: 1px solid rgba(32, 34, 107, 0.06);
}

.key--del:active {
  transform: scale(0.96);
  background: var(--bordure);
}

/* ── Question display & ordre de compression ─────────────────────────── */
.game-zone {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  justify-content: space-between;
}

.card--question {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: clamp(20px, 3vh, 34px) 34px; /* Compression 1 : 34 -> 20px */
  margin: clamp(10px, 1.5vh, 20px) 0;
  background: var(--surface);
  border-radius: var(--r-carte);
  box-shadow: 0 8px 22px var(--ombre-douce);
}

.question-text {
  font-family: var(--titre);
  font-weight: 700;
  font-size: var(--t-question); /* Compression 2 : clamp(88px, 14vh, 116px) */
  line-height: 1;
  text-align: center;
  letter-spacing: -1px;
  color: var(--indigo);
}

.answer-box {
  font-family: var(--titre);
  font-weight: 800;
  font-size: 42px;
  text-align: center;
  min-height: 66px;
  line-height: 66px;
  border-radius: var(--r-touche);
  background: var(--ivoire);
  margin-top: 6px;
  transition: background 0.15s ease, color 0.15s ease;
}

.answer-box--correct { background: var(--vert-pale); color: var(--succes); }
.answer-box--wrong { background: var(--rouge-pale); color: var(--erreur-eleve); }

/* ── Digit Boxes (modèle à cases) ──────────────────────────────────── */
.digit-boxes {
  display: flex;
  gap: 14px;
  justify-content: center;
  margin-top: 6px;
}

.digit-box {
  width: clamp(86px, 10vw, 104px);
  height: clamp(104px, 12vh, 126px); /* Compression 3 : 126 -> 104px */
  font-family: var(--titre);
  font-weight: 700;
  font-size: clamp(58px, 8vh, 76px);
  text-align: center;
  line-height: clamp(104px, 12vh, 126px);
  border-radius: var(--r-touche);
  background: var(--surface);
  border: 3px solid var(--bordure);
  color: var(--indigo-encre);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.digit-box--active {
  border-color: var(--action);
  box-shadow: 0 0 0 3px var(--ciel-pale);
}

.digit-box--correct {
  background: var(--vert-pale);
  border-color: var(--succes);
  color: var(--succes);
}

.digit-box--wrong {
  background: var(--rouge-pale);
  border-color: var(--erreur-eleve);
  color: var(--erreur-eleve);
}

.digit-box--reveal {
  background: var(--vert-pale);
  border-color: var(--succes);
  color: var(--succes);
}

/* ── Paliers de compression d'écran (Section 4 du Lot 13) ───────────────
   Ordre strict quand la hauteur utile se réduit :
   1. Marges verticales de la carte question (34 -> 20 px)
   2. Chiffre de la question (116 -> 88 px, jamais moins)
   3. Cases de saisie (126 -> 104 px)
   4. Barre de série : jauge masquée ou réduite
   Le pavé ne bouge qu'en dernier recours.
   ──────────────────────────────────────────────────────────────────────── */
@media (max-height: 950px) {
  /* Étape 1 : tassement des marges de la carte */
  .card--question {
    padding: 20px 24px;
    margin: 8px 0;
    gap: 12px;
  }
}

@media (max-height: 850px) {
  /* Étape 2 : réduction de la question au plancher 88px */
  .question-text {
    font-size: 88px;
  }
  /* Étape 3 : cases de saisie au plancher 104px */
  .digit-box {
    height: 104px;
    line-height: 104px;
    font-size: 58px;
    width: 88px;
  }
  /* Étape 4 : barre de série passe en compteur compact */
  .progress-bar {
    height: 6px;
  }
}

/* Question timer bar (chrono par question) */
.question-timer {
  height: 4px; border-radius: 2px;
  background: var(--bordure); margin-top: 8px; overflow: hidden;
}
.question-timer__fill {
  display: block; height: 100%; border-radius: 2px;
  background: var(--action);
  transition: width linear;
}
.question-timer__fill--warn { background: var(--erreur-eleve); }

.caret {
  display: inline-block;
  width: 3px;
  height: 40px;
  vertical-align: -6px;
  background: var(--gris);
  margin-left: 2px;
  animation: blink 1s steps(1) infinite;
}

.hint-box {
  background: var(--ciel-pale);
  border-radius: var(--r-case);
  padding: 14px 18px;
  margin-top: 12px;
  font-family: var(--titre);
  font-weight: 700;
  font-size: 15px;
  color: var(--indigo-doux);
  text-align: center;
  line-height: 1.6;
}

/* ── Pills / Tags ─────────────────────────────────────────────────────── */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--titre);
  font-weight: 800;
  font-size: 16px;
  padding: 8px 16px;
  border-radius: var(--r-pastille);
  background: var(--surface);
  box-shadow: 0 2px 8px var(--ombre-douce);
}

/* ── Progress bar ─────────────────────────────────────────────────────── */
.progress-bar {
  height: 10px;
  border-radius: 8px;
  background: var(--ivoire);
  overflow: hidden;
}

.progress-bar__fill {
  display: block;
  height: 100%;
  border-radius: 8px;
  background: linear-gradient(90deg, var(--orange-pale), var(--action));
  transition: width 0.3s ease;
}

.progress-bar__fill--warn {
  background: linear-gradient(90deg, var(--erreur-eleve), var(--erreur-eleve));
}

/* ── Timer Ring ───────────────────────────────────────────────────────── */
.timer-ring {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.timer-ring svg { transform: rotate(-90deg); }

.timer-ring__text {
  position: absolute;
  font-family: var(--titre);
  font-weight: 800;
  font-size: 15px;
  color: var(--indigo-encre);
}

.timer-ring--warn .timer-ring__text { color: var(--erreur-eleve); }
.timer-ring--warn circle.timer-ring__fg { stroke: var(--erreur-eleve); }

/* ── Stats grid (résultats) ───────────────────────────────────────────── */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 18px 0;
}

.stat {
  background: var(--ivoire);
  border-radius: var(--r-touche);
  padding: 16px 8px;
  text-align: center;
}

.stat__value {
  font-family: var(--titre);
  font-size: 28px;
  font-weight: 800;
  display: block;
}

.stat__label {
  font-weight: 700;
  font-size: 12px;
  color: var(--gris);
  margin-top: 4px;
}

/* ── Stars ─────────────────────────────────────────────────────────────── */
.stars { font-size: 48px; letter-spacing: 8px; text-align: center; }
.stars__filled { color: var(--action); }
.stars__empty { color: var(--bordure); }

/* ── Streak badge ─────────────────────────────────────────────────────── */
.streak-badge {
  font-family: var(--titre);
  font-weight: 800;
  transition: transform 0.2s ease;
}

.streak-badge--milestone { animation: streak-pop 0.5s ease; }

/* ── Feedback word ────────────────────────────────────────────────────── */
.feedback-word {
  font-family: var(--titre);
  font-weight: 800;
  text-align: center;
  font-size: 22px;
  height: 30px;
  line-height: 30px;
}

/* ── Modal overlay ────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(27, 42, 74, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

/* ── Spinner (loading screen) ─────────────────────────────────────────── */
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--bordure);
  border-top-color: var(--action);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Screen transitions ───────────────────────────────────────────────── */
.screen-enter { animation: screen-fade 0.25s ease; }

/* ── Animations ───────────────────────────────────────────────────────── */
@keyframes blink { 50% { opacity: 0; } }

@keyframes screen-fade {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.08); }
  100% { transform: scale(1); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-10px); }
  40% { transform: translateX(9px); }
  60% { transform: translateX(-7px); }
  80% { transform: translateX(5px); }
}

@keyframes streak-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}

.anim-pop { animation: pop var(--d-juste) ease; }
.anim-shake { animation: shake var(--d-faux) ease; }
.streak-badge--milestone { animation: streak-pop var(--d-palier) ease; }

/* ── Reduced motion ───────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .anim-pop, .anim-shake, .screen-enter, .spinner,
  .mode-card, .btn, .key, .streak-badge--milestone {
    animation: none !important;
    transition: none !important;
  }
}

/* ── Responsive ───────────────────────────────────────────────────────── */
@media (min-width: 768px) {
  .app-stage { max-width: 640px; }
  .key { padding: 22px 0; font-size: 30px; }
}

@media (min-width: 1024px) {
  .app-stage { max-width: 720px; }
}

/* ── Exception :hover réservée à l'écran d'administration (Mac + souris) ─ */
.admin-row {
  transition: background-color 0.15s ease;
  border-radius: 8px;
}
.admin-row:hover {
  background-color: var(--ciel-pale);
}

```


## branding.js

`frontend/src/branding.js`

```js
/**
 * matHo — Fichier de branding centralisé
 * 
 * MODIFIER CE FICHIER POUR CHANGER LE NOM, LA BASELINE,
 * LE LOGO OU LES COULEURS DE L'APPLICATION.
 * Aucun autre fichier ne doit contenir ces valeurs en dur.
 */

const branding = {
    // — Identité —
    appName: 'matHo',
    baseline: 'Le défi des tables — Collège Saint-Honoré d\'Eylau',
    shortName: 'matHo',
    logoPath: '/matho-logo.png',
    monogram: 'mH',   // Fallback si logo absent

    // — Note : Les couleurs et le design system sont définis dans tokens.css —

    // — Typographie —
    fonts: {
        display: "'Baloo 2', system-ui, sans-serif",  // Titres, nombres, boutons
        body: "'Nunito', system-ui, sans-serif",    // Texte courant
    },

};

export default branding;

```


## App.jsx — la navigation

`frontend/src/App.jsx`

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Login from './screens/Login';
import Home from './screens/Home';
import Learn from './screens/Learn';
import Practice from './screens/Practice';
import Challenges from './screens/Challenges';
import Leaderboards from './screens/Leaderboards';
import Profile from './screens/Profile';
import Admin from './screens/Admin';
import MesDefis from './screens/MesDefis';
import MaClasse from './screens/MaClasse';
import { sessionActive, quiSuisJe, seDeconnecter, viderFile, monProfil, emailSession } from './api';
import { effacerDefiEnCours } from './logic/defiStorage';
import branding from './branding';

/**
 * App — Routeur principal + restauration de session
 *
 * Au montage :
 *   sessionActive()  →  faux : login
 *                    →  vrai : quiSuisJe()  →  eleve / prof : ready
 *                                           →  inconnu      : écran dédié
 *
 * L'objet `identite` est stocké tel que renvoyé par quiSuisJe() :
 *   - { type: 'eleve', profil: { id, prenom, nom, classe, ... } }
 *   - { type: 'prof', admin: bool, profil: { id, nom, email, ... } }
 *   - { type: 'inconnu', message: "..." }
 *
 * On ne l'aplatit JAMAIS en un seul objet — chaque écran lit les
 * champs selon le type.
 */
export default function App() {
    // identite : réponse brute de quiSuisJe(), null tant que pas chargée
    const [identite, setIdentite] = useState(null);
    // appState : loading | login | inconnu | erreur | ready
    const [appState, setAppState] = useState('loading');
    const [erreurMessage, setErreurMessage] = useState('');
    const [screen, setScreen] = useState('home');
    const [tablesADemarrer, setTablesADemarrer] = useState(null);
    // Pré-remplissage depuis "Ma classe" : { tables: [7,8], classe: '6A' }
    const [defiPreConfig, setDefiPreConfig] = useState(null);
    const [maitrise, setMaitrise] = useState({});
    // Adresse e-mail du compte connecté si non reconnu
    const [sessionEmail, setSessionEmail] = useState(null);

    const estProf = identite?.type === 'prof';
    const estAdmin = identite?.admin === true;

    // --- Restauration de session au montage ---
    useEffect(() => {
        let annule = false;

        async function demarrer() {
            try {
                const actif = await sessionActive();
                if (annule) return;

                if (!actif) {
                    setAppState('login');
                    return;
                }

                // Session présente → identifier l'utilisateur
                const res = await quiSuisJe();
                if (annule) return;

                if (!res.ok) {
                    // Session valide mais serveur injoignable : ne PAS
                    // envoyer au login, sinon boucle de redirection Google.
                    setErreurMessage(res.error || 'Le serveur ne répond pas.');
                    setAppState('erreur');
                    return;
                }

                traiterIdentite(res.data);
            } catch (e) {
                if (!annule) {
                    setErreurMessage('Le serveur ne répond pas. Vérifie ta connexion.');
                    setAppState('erreur');
                }
            }
        }

        demarrer();
        return () => { annule = true; };
    }, []);

    // --- Traitement centralisé de la réponse quiSuisJe ---
    function traiterIdentite(data) {
        setIdentite(data);
        if (data.type === 'eleve' || data.type === 'prof') {
            setScreen('home');
            setAppState('ready');
            // Vider la file d'attente hors-ligne maintenant qu'on a une
            // session identifiée — pas avant, sinon viderFile() jette
            // les parties faute de permission.
            viderFile().catch(() => {});
            // Charger la grille de maîtrise — un seul appel, réutilisée
            // par Practice et Challenges pour pondérer les tirages.
            if (data.type === 'eleve') {
                monProfil().then(res => {
                    if (res.ok && res.data?.maitrise) {
                        setMaitrise(res.data.maitrise);
                    }
                }).catch(() => {});
            }
        } else {
            // type === 'inconnu' ou inattendu
            emailSession().then(em => setSessionEmail(em)).catch(() => {});
            setAppState('inconnu');
        }
    }

    // --- Rafraîchir l'identité après un changement de rôle ---
    const refreshIdentite = useCallback(async () => {
        const res = await quiSuisJe();
        if (res.ok) {
            setIdentite(res.data);
            // Si le compte n'est plus admin/prof, revenir à l'accueil
            if (res.data.type !== 'prof' && res.data.type !== 'eleve') {
                setScreen('home');
            }
        }
    }, []);

    // --- Réessayer après erreur serveur ---
    const handleReessayer = useCallback(async () => {
        setAppState('loading');
        setErreurMessage('');
        try {
            const res = await quiSuisJe();
            if (!res.ok) {
                setErreurMessage(res.error || 'Le serveur ne répond pas.');
                setAppState('erreur');
                return;
            }
            traiterIdentite(res.data);
        } catch {
            setErreurMessage('Le serveur ne répond pas. Vérifie ta connexion.');
            setAppState('erreur');
        }
    }, []);

    // --- Déconnexion ---
    const handleDeconnexion = useCallback(async () => {
        if (identite?.profil?.id) {
            effacerDefiEnCours(identite.profil.id);
        }
        await seDeconnecter();
        setIdentite(null);
        setSessionEmail(null);
        setScreen('home');
        setAppState('login');
    }, [identite]);

    // --- Callback pour Login ---
    // Reçoit la réponse brute de quiSuisJe() après connexion réussie
    const handleIdentite = useCallback((data) => {
        traiterIdentite(data);
    }, []);

    const [practiceConfig, setPracticeConfig] = useState(null);

    const goHome = useCallback(() => {
        setScreen('home');
        setTablesADemarrer(null);
        setPracticeConfig(null);
    }, []);

    const handleGo = useCallback((scr, opts) => {
        if (scr === 'play') {
            setPracticeConfig(opts || null);
        }
        if (scr === 'challenges' && opts?.mode) {
            setDefiPreConfig({ type: opts.mode });
        }
        setScreen(scr);
    }, []);

    // --- Navigation vers Practice avec des tables pré-sélectionnées ---
    // Utilisé par Profile → « Réviser mes cases rouges »
    const goPlayWithTables = useCallback((tables) => {
        setTablesADemarrer(tables);
        setPracticeConfig(null);
        setScreen('play');
    }, []);

    // --- Mise à jour du plafond après une Montée réussie ---
    const handlePlafondChange = useCallback((nouveauPlafond) => {
        setIdentite(prev => {
            if (!prev?.profil) return prev;
            return {
                ...prev,
                profil: { ...prev.profil, plafond_tables: nouveauPlafond },
            };
        });
    }, []);

    // ====================== RENDU ======================

    // 1. Chargement
    if (appState === 'loading') {
        return (
            <Layout showHeader={false}>
                <div className="screen-enter" style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    minHeight: '60vh', gap: 20,
                }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: 16,
                        background: 'var(--indigo)',
                        color: 'var(--gold)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-display)', fontWeight: 800,
                        fontSize: 24, letterSpacing: 2,
                    }}>
                        {branding.monogram}
                    </div>
                    <div className="spinner" aria-label="Chargement" />
                    <p style={{
                        color: 'var(--text-soft)', fontWeight: 700,
                        fontSize: 14,
                    }}>
                        Chargement…
                    </p>
                </div>
            </Layout>
        );
    }

    // 2. Login
    if (appState === 'login') {
        return (
            <Layout showHeader={false}>
                <Login onIdentite={handleIdentite} />
            </Layout>
        );
    }

    // 3. Erreur serveur (session valide mais serveur injoignable)
    if (appState === 'erreur') {
        return (
            <Layout showHeader={false}>
                <div className="screen-enter" style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    minHeight: '60vh', gap: 16, textAlign: 'center',
                    padding: '0 24px',
                }}>
                    <span style={{ fontSize: 56 }}>📡</span>
                    <h2 className="font-display" style={{
                        fontSize: 22, fontWeight: 800, color: 'var(--navy)',
                    }}>
                        Le serveur ne répond pas
                    </h2>
                    <p style={{
                        color: 'var(--text-soft)', fontWeight: 600,
                        fontSize: 15, lineHeight: 1.5, maxWidth: 340,
                    }}>
                        {erreurMessage}
                    </p>
                    <button
                        className="btn btn--navy"
                        style={{ marginTop: 8, fontSize: 16, padding: '14px 32px' }}
                        onClick={handleReessayer}
                    >
                        Réessayer
                    </button>
                    <button
                        className="btn btn--ghost"
                        style={{ fontSize: 14, padding: '10px 24px', color: 'var(--coral)' }}
                        onClick={handleDeconnexion}
                    >
                        Se déconnecter
                    </button>
                </div>
            </Layout>
        );
    }

    // 4. Compte non reconnu
    if (appState === 'inconnu') {
        return (
            <Layout showHeader={false}>
                <div className="screen-enter" style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    minHeight: '60vh', gap: 16, textAlign: 'center',
                    padding: '0 24px',
                }}>
                    <span style={{ fontSize: 56 }}>🔒</span>
                    <h2 className="font-display" style={{
                        fontSize: 22, fontWeight: 800, color: 'var(--navy)',
                    }}>
                        Compte non reconnu
                    </h2>
                    <p style={{
                        color: 'var(--text-soft)', fontWeight: 600,
                        fontSize: 15, lineHeight: 1.5, maxWidth: 340,
                    }}>
                        {identite?.message || "Ce compte n'est pas reconnu. Demande à ton professeur."}
                    </p>

                    {sessionEmail && (
                        <div className="card" style={{
                            padding: '14px 18px',
                            background: 'var(--surface-alt)',
                            border: '2px solid var(--border)',
                            borderRadius: 14,
                            maxWidth: 360,
                            width: '100%',
                            textAlign: 'center',
                        }}>
                            <p style={{
                                fontSize: 13, fontWeight: 800, color: 'var(--navy)',
                                wordBreak: 'break-all',
                            }}>
                                Connecté avec : {sessionEmail}
                            </p>
                            <p style={{
                                fontSize: 11, fontStyle: 'italic', color: 'var(--text-soft)',
                                marginTop: 6, lineHeight: 1.4,
                            }}>
                                Ce n'est pas ton adresse ? Déconnecte-toi et reconnecte-toi avec ton compte du collège.
                            </p>
                        </div>
                    )}

                    <button
                        className="btn btn--coral"
                        style={{ marginTop: 8, fontSize: 15, padding: '14px 28px' }}
                        onClick={handleDeconnexion}
                    >
                        Se déconnecter et changer de compte
                    </button>
                </div>
            </Layout>
        );
    }

    // 4. Application (ready)
    return (
        <Layout showHeader={screen === 'home'}>
            {screen === 'home' && (
                <Home
                    onGo={handleGo}
                    identite={identite}
                    estProf={estProf}
                    estAdmin={estAdmin}
                    onLogout={handleDeconnexion}
                    onReprendreDefi={(rejointDefi) => {
                        setDefiPreConfig({ rejointDefi });
                        setScreen('challenges');
                    }}
                />
            )}
            {screen === 'learn' && <Learn onBack={goHome} />}
            {screen === 'play' && (
                <Practice
                    onBack={goHome}
                    identite={identite}
                    estProf={estProf}
                    onPlafondChange={handlePlafondChange}
                    tablesInitiales={tablesADemarrer}
                    maitrise={maitrise}
                    config={practiceConfig}
                />
            )}
            {screen === 'challenges' && (
                <Challenges onBack={goHome} identite={identite} estProf={estProf} onPlafondChange={handlePlafondChange} maitrise={maitrise} onGo={setScreen} defiPreConfig={defiPreConfig} clearPreConfig={() => setDefiPreConfig(null)} />
            )}
            {screen === 'mes-defis' && (
                <MesDefis onBack={goHome} estProf={estProf} />
            )}
            {screen === 'classe' && (
                <MaClasse
                    onBack={goHome}
                    onLancerDefi={(tables, classe) => {
                        setDefiPreConfig({ tables, classe });
                        setScreen('challenges');
                    }}
                />
            )}
            {screen === 'leaderboards' && (
                <Leaderboards onBack={goHome} identite={identite} estProf={estProf} />
            )}
            {screen === 'profile' && (
                <Profile
                    onBack={goHome}
                    identite={identite}
                    estProf={estProf}
                    onLogout={handleDeconnexion}
                    onReviser={goPlayWithTables}
                    onGo={setScreen}
                />
            )}
            {screen === 'admin' && estAdmin && (
                <Admin onBack={goHome} identite={identite} onIdentiteChange={refreshIdentite} />
            )}
        </Layout>
    );
}

```


## components/Icons.jsx — les icones dessinees

`frontend/src/components/Icons.jsx`

```jsx
import React from 'react';

/**
 * matHo — Les icônes dessinées à la main (issues de la maquette v2)
 * Remplacent les emojis des 4 modes et des boutons d'action.
 * Aucune bibliothèque externe : tout est vectoriel SVG pur.
 */

export function IconSprint({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M24 4 10 25h9l-2 15 15-22h-9z" fill={actionColor} stroke={color} strokeWidth="3" strokeLinejoin="round" />
        </svg>
    );
}

export function IconSansFaute({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <circle cx="22" cy="22" r="17" stroke={color} strokeWidth="3.4" />
            <circle cx="22" cy="22" r="9" stroke={actionColor} strokeWidth="3.4" />
            <circle cx="22" cy="22" r="2.6" fill={color} />
        </svg>
    );
}

export function IconChrono({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <circle cx="22" cy="25" r="15" stroke={color} strokeWidth="3.4" />
            <path d="M22 16v9l6 4" stroke={actionColor} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 5h10M22 5v5" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
        </svg>
    );
}

export function IconMontee({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M5 37h9v-9h9v-9h9v-9h7" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M32 4h8v8" stroke={actionColor} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconApprendre({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M22 12C18 8 12 7 6 8v25c6-1 12 0 16 4 4-4 10-5 16-4V8c-6-1-12 0-16 4z" stroke={color} strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M22 12v25" stroke={actionColor} strokeWidth="3.2" />
        </svg>
    );
}

export function IconClassements({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <rect x="4" y="24" width="11" height="15" rx="2.5" stroke={color} strokeWidth="3.2" />
            <rect x="16.5" y="13" width="11" height="26" rx="2.5" stroke={actionColor} strokeWidth="3.2" />
            <rect x="29" y="29" width="11" height="10" rx="2.5" stroke={color} strokeWidth="3.2" />
        </svg>
    );
}

export function IconMaGrille({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <rect x="5" y="5" width="11" height="11" rx="2.5" fill={actionColor} />
            <rect x="18" y="5" width="11" height="11" rx="2.5" stroke={color} strokeWidth="3" />
            <rect x="31" y="5" width="8" height="11" rx="2.5" stroke={color} strokeWidth="3" />
            <rect x="5" y="18" width="11" height="11" rx="2.5" stroke={color} strokeWidth="3" />
            <rect x="18" y="18" width="11" height="11" rx="2.5" fill={color} />
            <rect x="31" y="18" width="8" height="11" rx="2.5" stroke={color} strokeWidth="3" />
            <rect x="5" y="31" width="11" height="8" rx="2.5" stroke={color} strokeWidth="3" />
            <rect x="18" y="31" width="11" height="8" rx="2.5" stroke={color} strokeWidth="3" />
        </svg>
    );
}

export function IconEffacer({ size = 32, color = 'var(--indigo-doux)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M17.5 10h20a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4h-20L5.5 24z" stroke={color} strokeWidth="3.4" strokeLinejoin="round" />
            <path d="M21 19l10 10M31 19 21 29" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
        </svg>
    );
}

export function IconDefisPasses({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M9 8h26a2 2 0 0 1 2 2v26a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" stroke={color} strokeWidth="3.2" />
            <path d="M14 17h16M14 24h16M14 31h9" stroke={actionColor} strokeWidth="3.2" strokeLinecap="round" />
        </svg>
    );
}

export function IconCheck({ size = 24, color = 'var(--action-texte)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M5 12.5 10 17.5 19 7" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconCadenas({ size = 24, color = 'var(--gris-inerte)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.5" stroke={color} strokeWidth="2.4" />
            <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
        </svg>
    );
}

export function IconDocument({ size = 24, color = 'var(--indigo)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M6 20h12a2 2 0 0 0 2-2V9l-5-5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" stroke={color} strokeWidth="2" />
            <path d="M14 4v5h5" stroke={color} strokeWidth="2" />
        </svg>
    );
}

export function IconAdmin({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke={actionColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconProf({ size = 36, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <circle cx="22" cy="14" r="8" stroke={color} strokeWidth="3.2" />
            <path d="M7 38c0-7 7-12 15-12s15 5 15 12" stroke={color} strokeWidth="3.2" strokeLinecap="round" />
            <path d="M14 13h16M22 6v14" stroke={actionColor} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
    );
}

export function IconAmpoule({ size = 24, color = 'var(--indigo-doux)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M9 21h6M12 3a6 6 0 0 1 4 10.5V17a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-3.5A6 6 0 0 1 12 3Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconRefresh({ size = 24, color = 'var(--indigo)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M1 4v6h6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconSignal({ size = 24, color = 'var(--gris)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconEnvelope({ size = 24, color = 'var(--indigo)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <rect x="2" y="4" width="20" height="16" rx="2" stroke={color} strokeWidth="2" />
            <path d="M22 7l-10 7L2 7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconLock({ size = 24, color = 'var(--gris-inerte)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <rect x="5" y="11" width="14" height="10" rx="2" stroke={color} strokeWidth="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function IconSablier({ size = 24, color = 'var(--gris)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M6 2h12M6 22h12M6 2v5l6 5-6 5v5M18 2v5l-6 5 6 5v5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/**
 * Sélecteur d'icône pour les modes de jeu
 */
export function ModeIcon({ mode, size = 36, color, actionColor, ...props }) {
    switch (mode) {
        case 'sprint':
            return <IconSprint size={size} color={color} actionColor={actionColor} {...props} />;
        case 'perfect':
        case 'sans-faute':
            return <IconSansFaute size={size} color={color} actionColor={actionColor} {...props} />;
        case 'countdown':
        case 'chrono':
        case 'contre-la-montre':
            return <IconChrono size={size} color={color} actionColor={actionColor} {...props} />;
        case 'climb':
        case 'montee':
            return <IconMontee size={size} color={color} actionColor={actionColor} {...props} />;
        case 'learn':
        case 'apprendre':
            return <IconApprendre size={size} color={color} actionColor={actionColor} {...props} />;
        case 'leaderboards':
        case 'classements':
            return <IconClassements size={size} color={color} actionColor={actionColor} {...props} />;
        case 'profile':
        case 'grille':
        case 'ma-grille':
            return <IconMaGrille size={size} color={color} actionColor={actionColor} {...props} />;
        default:
            return <IconSprint size={size} color={color} actionColor={actionColor} {...props} />;
    }
}

```


## components/Keypad.jsx — le pave numerique

`frontend/src/components/Keypad.jsx`

```jsx
import React from 'react';
import { IconEffacer } from './Icons';

/**
 * Keypad — Pavé numérique tactile optimisé iPad (Section 4 du Lot 13)
 *
 * Règles :
 * - Ordre 1-2-3 en haut (automatisé chez un collégien)
 * - Le 0 occupe deux colonnes au centre-bas (le chiffre le plus tapé)
 * - Le ⌫ est isolé en bas à droite, séparé par une gouttière de 32 px
 *   incompressible, posé en creux et jamais en rouge.
 * - Touches ≥ 88 px de haut et 96 px de large.
 */
export default function Keypad({ onPress, onDelete, disabled = false }) {
    return (
        <div className="keypad game-zone">
            <div className="keypad__row">
                <button type="button" className="key" onClick={() => !disabled && onPress('1')} disabled={disabled}>1</button>
                <button type="button" className="key" onClick={() => !disabled && onPress('2')} disabled={disabled}>2</button>
                <button type="button" className="key" onClick={() => !disabled && onPress('3')} disabled={disabled}>3</button>
            </div>
            <div className="keypad__row">
                <button type="button" className="key" onClick={() => !disabled && onPress('4')} disabled={disabled}>4</button>
                <button type="button" className="key" onClick={() => !disabled && onPress('5')} disabled={disabled}>5</button>
                <button type="button" className="key" onClick={() => !disabled && onPress('6')} disabled={disabled}>6</button>
            </div>
            <div className="keypad__row">
                <button type="button" className="key" onClick={() => !disabled && onPress('7')} disabled={disabled}>7</button>
                <button type="button" className="key" onClick={() => !disabled && onPress('8')} disabled={disabled}>8</button>
                <button type="button" className="key" onClick={() => !disabled && onPress('9')} disabled={disabled}>9</button>
            </div>
            <div className="keypad__row keypad__row--bottom">
                <button type="button" className="key key--zero" onClick={() => !disabled && onPress('0')} disabled={disabled}>0</button>
                <button
                    type="button"
                    className="key key--del"
                    onClick={() => !disabled && onDelete()}
                    disabled={disabled}
                    aria-label="Effacer"
                >
                    <IconEffacer size={38} color="var(--indigo-doux)" />
                </button>
            </div>
        </div>
    );
}

```


## components/DigitBoxes.jsx — les cases de saisie

`frontend/src/components/DigitBoxes.jsx`

```jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';

/**
 * DigitBoxes — Saisie à cases
 *
 * Autant de cases que de chiffres dans la réponse.
 * Dès que la dernière case est remplie, onComplete(valeur) est appelé.
 * Le composant ne connaît PAS la bonne réponse — il sait juste combien
 * de chiffres afficher. C'est le parent qui juge.
 *
 * Props :
 *   numDigits       nombre de cases
 *   onComplete      (value: number) => void — quand toutes les cases sont remplies
 *   onFirstKey      () => void — à la toute première touche (démarre le chrono)
 *   disabled        boolean
 *   fb              'idle' | 'correct' | 'wrong' | 'reveal'
 *   revealDigits    string[] | null — chiffres à afficher (pour montrer la bonne réponse)
 */
export default function DigitBoxes({ numDigits, onComplete, onFirstKey, disabled, fb, revealDigits }) {
    const [digits, setDigits] = useState(() => Array(numDigits).fill(''));
    const hasTyped = useRef(false);
    const completeCalled = useRef(false);

    // Reset quand la question change (numDigits change)
    useEffect(() => {
        setDigits(Array(numDigits).fill(''));
        hasTyped.current = false;
        completeCalled.current = false;
    }, [numDigits]);

    // Quand fb passe à 'wrong', vider après le shake (200ms)
    useEffect(() => {
        if (fb === 'wrong') {
            const id = setTimeout(() => {
                setDigits(Array(numDigits).fill(''));
                completeCalled.current = false;
            }, 200);
            return () => clearTimeout(id);
        }
    }, [fb, numDigits]);

    const activeIndex = digits.findIndex(d => d === '');

    const addDigit = useCallback((d) => {
        if (disabled || fb !== 'idle') return;
        setDigits(prev => {
            const idx = prev.findIndex(x => x === '');
            if (idx === -1) return prev; // toutes remplies
            if (!hasTyped.current) {
                hasTyped.current = true;
                onFirstKey?.();
            }
            const next = [...prev];
            next[idx] = d;

            // Dernière case remplie → onComplete
            if (idx === numDigits - 1 && !completeCalled.current) {
                completeCalled.current = true;
                // Appel différé pour que le state se mette à jour avant
                setTimeout(() => {
                    onComplete(parseInt(next.join(''), 10));
                }, 0);
            }
            return next;
        });
    }, [disabled, fb, numDigits, onComplete, onFirstKey]);

    const removeDigit = useCallback(() => {
        if (disabled || fb !== 'idle') return;
        setDigits(prev => {
            // Trouve le dernier chiffre rempli
            let idx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i] !== '') { idx = i; break; }
            }
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = '';
            completeCalled.current = false;
            return next;
        });
    }, [disabled, fb]);

    // Expose addDigit/removeDigit pour Keypad (via ref pas nécessaire, on utilise les props)
    // Le Keypad appelle directement onPress/onDelete qui sont câblés dans le parent

    const displayDigits = revealDigits || digits;

    return (
        <div
            className={`digit-boxes${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}
            style={{ display: 'flex', gap: 8, justifyContent: 'center' }}
        >
            {displayDigits.map((d, i) => (
                <div
                    key={i}
                    className={[
                        'digit-box',
                        i === activeIndex && fb === 'idle' ? 'digit-box--active' : '',
                        fb === 'correct' ? 'digit-box--correct' : '',
                        fb === 'wrong' ? 'digit-box--wrong' : '',
                        fb === 'reveal' ? 'digit-box--reveal' : '',
                    ].filter(Boolean).join(' ')}
                >
                    {d || (i === activeIndex && fb === 'idle' ? <span className="caret" /> : '')}
                </div>
            ))}
        </div>
    );
}

/**
 * Hook utilitaire pour gérer DigitBoxes depuis un composant quiz.
 * Retourne { digits, addDigit, removeDigit, resetDigits } et gère le lifecycle.
 */
export function useDigitBoxes(numDigits, onComplete, onFirstKey, fb, disabled) {
    const [digits, setDigits] = useState(() => Array(numDigits).fill(''));
    const hasTyped = useRef(false);
    const completeCalled = useRef(false);

    // Reset quand la question change
    useEffect(() => {
        setDigits(Array(numDigits).fill(''));
        hasTyped.current = false;
        completeCalled.current = false;
    }, [numDigits]);

    // Après erreur, vider
    useEffect(() => {
        if (fb === 'wrong') {
            const id = setTimeout(() => {
                setDigits(Array(numDigits).fill(''));
                completeCalled.current = false;
            }, 200);
            return () => clearTimeout(id);
        }
    }, [fb, numDigits]);

    const addDigit = useCallback((d) => {
        if (disabled || (fb !== 'idle' && fb !== 'reveal')) return;
        setDigits(prev => {
            const idx = prev.findIndex(x => x === '');
            if (idx === -1) return prev;
            if (!hasTyped.current) {
                hasTyped.current = true;
                onFirstKey?.();
            }
            const next = [...prev];
            next[idx] = d;
            if (idx === numDigits - 1 && !completeCalled.current) {
                completeCalled.current = true;
                setTimeout(() => onComplete(parseInt(next.join(''), 10)), 0);
            }
            return next;
        });
    }, [disabled, fb, numDigits, onComplete, onFirstKey]);

    const removeDigit = useCallback(() => {
        if (disabled || fb !== 'idle') return;
        setDigits(prev => {
            let idx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i] !== '') { idx = i; break; }
            }
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = '';
            completeCalled.current = false;
            return next;
        });
    }, [disabled, fb]);

    const resetDigits = useCallback(() => {
        setDigits(Array(numDigits).fill(''));
        hasTyped.current = false;
        completeCalled.current = false;
    }, [numDigits]);

    const showAnswer = useCallback((answer) => {
        const ansStr = String(answer);
        setDigits(ansStr.split(''));
    }, []);

    return { digits, addDigit, removeDigit, resetDigits, showAnswer, activeIndex: digits.findIndex(d => d === '') };
}

```


## components/TimerRing.jsx — le chronometre

`frontend/src/components/TimerRing.jsx`

```jsx
import React from 'react';

/**
 * TimerRing — Anneau SVG animé pour le chronomètre
 * Devient rouge quand il reste < 10s
 */
export default function TimerRing({ seconds, total, warn }) {
    const r = 22;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - seconds / total);
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    return (
        <span className={`timer-ring${warn ? ' timer-ring--warn' : ''}`}>
            <svg width="56" height="56" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r={r} fill="none" stroke="var(--bordure)" strokeWidth="5" />
                <circle
                    className="timer-ring__fg"
                    cx="28" cy="28" r={r}
                    fill="none"
                    stroke="var(--action)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
            </svg>
            <span className="timer-ring__text">{fmt(seconds)}</span>
        </span>
    );
}

```


## components/MasteryGrid.jsx — la grille de maitrise

`frontend/src/components/MasteryGrid.jsx`

```jsx
import React from 'react';
import { masteryColor } from '../logic/mastery';
import { IconMaGrille } from './Icons';

/**
 * MasteryGrid — Grille de maîtrise 15×15 (symétrique)
 * Rouge → Jaune → Vert, Gris = non testé
 */
export default function MasteryGrid({ mastery, tables, onClose }) {
    const range = tables || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="card" style={{ maxWidth: 460, width: '100%' }} onClick={e => e.stopPropagation()}>
                <h3 className="font-display" style={{ fontWeight: 800, fontSize: 20, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconMaGrille size={22} color="var(--indigo)" actionColor="var(--ciel)" /> Grille de maîtrise
                </h3>
                <div
                    className="mastery-grid"
                    style={{ gridTemplateColumns: `30px repeat(${range.length}, 1fr)` }}
                >
                    <div className="mastery-grid-hdr">×</div>
                    {range.map(c => (
                        <div key={c} className="mastery-grid-hdr">{c}</div>
                    ))}
                    {range.map(r => (
                        <React.Fragment key={r}>
                            <div className="mastery-grid-hdr">{r}</div>
                            {range.map(c => {
                                const key = `${Math.min(r, c)}_${Math.max(r, c)}`;
                                return (
                                    <div
                                        key={c}
                                        className="mastery-grid-cell"
                                        style={{ background: masteryColor(mastery[key]) }}
                                        title={`${r}×${c} = ${r * c}`}
                                    >
                                        {range.length <= 10 ? r * c : ''}
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 14, fontSize: 12, fontWeight: 700, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--rouge)', display: 'inline-block' }} />
                        À revoir
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--orange)', display: 'inline-block' }} />
                        En cours
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--vert)', display: 'inline-block' }} />
                        Maîtrisé
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--gris-inerte)', display: 'inline-block' }} />
                        Pas testé
                    </span>
                </div>
                <button className="btn btn--ghost" style={{ width: '100%', marginTop: 14 }} onClick={onClose}>
                    Fermer
                </button>
            </div>
        </div>
    );
}

```


## components/Layout.jsx

`frontend/src/components/Layout.jsx`

```jsx
import React, { useState } from 'react';
import branding from '../branding';

/**
 * Layout — Shell commun de l'application
 * Header avec logo (ou monogramme fallback), titre, baseline
 */
export default function Layout({ children, showHeader = true }) {
    const [logoError, setLogoError] = useState(false);

    return (
        <div className="app-root">
            <div className="app-stage">
                {showHeader && (
                    <header className="app-header">
                        {!logoError ? (
                            <img
                                src={branding.logoPath}
                                alt={branding.appName}
                                className="app-header-logo"
                                onError={() => setLogoError(true)}
                            />
                        ) : (
                            <div className="app-header-monogram">{branding.monogram}</div>
                        )}
                        <div className="app-header-text">
                            <h1 className="app-title">{branding.appName}</h1>
                            <p className="app-baseline">{branding.baseline}</p>
                        </div>
                    </header>
                )}
                {children}
            </div>
        </div>
    );
}

```


## screens/Home.jsx — accueil eleve ET accueil professeur

`frontend/src/screens/Home.jsx`

```jsx
import React, { useState, useEffect } from 'react';
import { rejoindreDefi } from '../api';
import { lireDefiEnCours, sauvegarderDefiEnCours, effacerDefiEnCours } from '../logic/defiStorage';
import { IconSprint, IconSansFaute, IconChrono, IconMontee, IconApprendre, IconClassements, IconMaGrille, IconDefisPasses, IconAdmin, IconProf } from '../components/Icons';

/**
 * Home — Écran d'accueil
 *
 * Reçoit `identite` (réponse brute de quiSuisJe), pas un objet aplati.
 * Deux rendus :
 *   - élève : les 5 destinations + accès rapides + bandeau reprise défi
 *   - prof  : placeholder « en construction » + boutons utiles
 *
 * Le bouton Administration n'apparaît QUE si estAdmin === true.
 */
export default function Home({ onGo, identite, estProf, estAdmin, onLogout, onReprendreDefi }) {
    const profil = identite?.profil;
    const idUtilisateur = profil?.id;

    const [defiEnCours, setDefiEnCours] = useState(() => {
        return (!estProf && idUtilisateur) ? lireDefiEnCours(idUtilisateur) : null;
    });
    const [loadingReprise, setLoadingReprise] = useState(false);
    const [erreurReprise, setErreurReprise] = useState(null);

    useEffect(() => {
        if (!estProf && idUtilisateur) {
            setDefiEnCours(lireDefiEnCours(idUtilisateur));
        } else {
            setDefiEnCours(null);
        }
        setErreurReprise(null);
    }, [idUtilisateur, estProf]);

    const handleReprendre = async () => {
        if (!defiEnCours?.code) return;
        setLoadingReprise(true);
        setErreurReprise(null);
        const res = await rejoindreDefi(defiEnCours.code);
        setLoadingReprise(false);

        if (res.ok) {
            // Mettre à jour avec les informations fraîches du serveur
            sauvegarderDefiEnCours(idUtilisateur, {
                code: defiEnCours.code,
                defi_id: res.data.defi_id,
                type: res.data.type,
                classe: res.data.classe,
                auteur_nom: res.data.auteur_nom,
                rejoint_le: Date.now(),
            });
            onReprendreDefi?.(res.data);
        } else {
            // Échec (expiré, fermé, déjà joué...) : effacer l'entrée et afficher le message tel quel
            effacerDefiEnCours(idUtilisateur);
            setDefiEnCours(null);
            setErreurReprise(res.message || res.error || 'Ce défi n\'est plus disponible.');
        }
    };

    const isStudentPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === 'eleve';

    // ==================== ACCUEIL PROFESSEUR ====================
    if (estProf && !isStudentPreview) {
        return (
            <div className="screen-enter">
                {/* Bienvenue prof */}
                <div className="card" style={{
                    marginBottom: 14, display: 'flex',
                    alignItems: 'center', gap: 14, padding: '16px 20px',
                }}>
                    <IconProf size={40} color="var(--indigo)" actionColor="var(--ciel)" />
                    <div>
                        <p className="font-display" style={{
                            fontWeight: 800, fontSize: 18, lineHeight: 1.2,
                        }}>
                            Bonjour {profil?.nom || 'Professeur'}
                        </p>
                        <p style={{
                            fontSize: 13, color: 'var(--text-soft)', fontWeight: 700,
                        }}>
                            {estAdmin ? 'Administrateur' : 'Enseignant'}
                        </p>
                    </div>
                </div>

                {/* Cartes de mode */}
                <button className="mode-card mode-card--challenge" onClick={() => onGo('challenges')}>
                    <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                        <IconSprint size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                    </span>
                    <span>
                        <div className="mode-card__title">Lancer un défi</div>
                        <div className="mode-card__desc">Sprint ou Contre-la-montre pour vos classes</div>
                    </span>
                </button>

                <button
                    className="btn btn--ghost"
                    style={{ fontSize: 13, padding: '8px 16px', marginTop: -4, marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => onGo('mes-defis')}
                >
                    <IconDefisPasses size={18} color="var(--indigo)" actionColor="var(--ciel)" /> Mes défis passés
                </button>

                <button className="mode-card mode-card--practice" onClick={() => onGo('play')}>
                    <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                        <IconSansFaute size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                    </span>
                    <span>
                        <div className="mode-card__title">S'entraîner</div>
                        <div className="mode-card__desc">Jouez vous aussi — Salle des profs</div>
                    </span>
                </button>

                <button className="mode-card" onClick={() => onGo('classe')} style={{
                    background: 'var(--indigo)',
                }}>
                    <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                        <IconMaGrille size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                    </span>
                    <span>
                        <div className="mode-card__title">Ma classe</div>
                        <div className="mode-card__desc" style={{ color: 'rgba(255,255,255,0.75)' }}>Maîtrise agrégée — qui bloque, sur quoi</div>
                    </span>
                </button>

                <button className="mode-card mode-card--learn" onClick={() => onGo('leaderboards')}>
                    <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                        <IconClassements size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                    </span>
                    <span>
                        <div className="mode-card__title">Classements</div>
                        <div className="mode-card__desc">Progression, records, classes et Salle des profs</div>
                    </span>
                </button>

                {/* Accès rapides */}
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                    <button
                        className="btn btn--ghost"
                        style={{ flex: 1, fontSize: 15, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                        onClick={() => onGo('profile')}
                    >
                        <IconMaGrille size={18} color="var(--indigo)" actionColor="var(--ciel)" /> Profil
                    </button>
                    {estAdmin && (
                        <button
                            className="btn btn--ghost"
                            style={{ flex: 1, fontSize: 15, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                            onClick={() => onGo('admin')}
                        >
                            <IconAdmin size={18} color="var(--indigo)" actionColor="var(--ciel)" /> Administration
                        </button>
                    )}
                </div>

                <button
                    className="btn btn--ghost"
                    style={{
                        width: '100%', fontSize: 13, padding: '10px 16px',
                        color: 'var(--gris)', marginTop: 8,
                    }}
                    onClick={onLogout}
                >
                    Se déconnecter
                </button>
            </div>
        );
    }

    // ==================== ACCUEIL ÉLÈVE (Maquette 2) ====================
    const [pointsTotal, setPointsTotal] = useState(0);
    const [joinCode, setJoinCode] = useState('');
    const [joinLoading, setJoinLoading] = useState(false);
    const [joinError, setJoinError] = useState(null);

    useEffect(() => {
        if (!estProf && idUtilisateur) {
            import('../api').then(({ monProfil }) => {
                monProfil().then(res => {
                    if (res.ok && res.data?.records) {
                        setPointsTotal(res.data.records.points_total || res.data.progression?.total || 0);
                    }
                }).catch(() => {});
            });
        }
    }, [estProf, idUtilisateur]);

    const handleJoinDirect = async () => {
        if (joinCode.length < 5) return;
        setJoinLoading(true);
        setJoinError(null);
        const res = await rejoindreDefi(joinCode);
        setJoinLoading(false);

        if (res.ok) {
            sauvegarderDefiEnCours(idUtilisateur, {
                code: joinCode,
                defi_id: res.data.defi_id,
                type: res.data.type,
                classe: res.data.classe,
                auteur_nom: res.data.auteur_nom,
                rejoint_le: Date.now(),
            });
            onReprendreDefi?.(res.data);
        } else {
            setJoinError(res.message || res.error || 'Code invalide ou défi expiré.');
        }
    };

    const studentProfil = profil?.prenom ? profil : (isStudentPreview ? { prenom: 'Lou', classe: '6ᵉA', avatar_emoji: '🦊', plafond_tables: 10 } : profil);
    const studentPoints = pointsTotal || (isStudentPreview ? 1240 : 0);
    const plafond = studentProfil?.plafond_tables || 10;
    const palierLabel = plafond <= 5 ? 'Découverte' : plafond <= 10 ? 'Confirmé' : 'Expert';

    const typeLabels = {
        sprint: 'Sprint',
        flawless: 'Sans faute',
        countdown: 'Contre-la-montre',
        climb: 'Montée des tables',
    };

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Header élève */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <div style={{
                        width: 78, height: 78, borderRadius: 24,
                        background: 'var(--ciel-pale)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 44,
                    }}>
                        {studentProfil?.avatar_emoji || '🦊'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div className="font-display" style={{ fontSize: 34, fontWeight: 700, color: 'var(--indigo)' }}>
                            {studentProfil?.prenom || studentProfil?.nom || 'Élève'}
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 19, fontWeight: 600, color: 'var(--gris)' }}>
                            {studentProfil?.classe ? `${studentProfil.classe} · ` : ''}{palierLabel}
                        </div>
                    </div>
                </div>

                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--surface)', borderRadius: 999,
                    padding: '12px 22px', boxShadow: '0 6px 16px rgba(32,34,107,.08)',
                }}>
                    <span className="font-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--indigo)' }}>
                        {studentPoints.toLocaleString('fr-FR')}
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 600, color: 'var(--gris)' }}>
                        pts
                    </span>
                </div>
            </div>

            {/* Erreur serveur si reprise impossible */}
            {erreurReprise && (
                <div style={{
                    padding: '12px 18px',
                    background: 'var(--ciel-pale)',
                    border: '1.5px solid var(--action)',
                    borderRadius: 18, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    gap: 12,
                }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--indigo)', margin: 0 }}>
                        {erreurReprise}
                    </p>
                    <button
                        className="btn btn--ghost"
                        style={{ fontSize: 13, padding: '4px 8px', color: 'var(--gris)', border: 'none' }}
                        onClick={() => setErreurReprise(null)}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* 2. Bandeau discret de reprise de défi */}
            {!erreurReprise && defiEnCours && (
                <div style={{
                    background: 'var(--indigo)', borderRadius: 26,
                    padding: '22px 26px', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    gap: 18,
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div className="font-display" style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>
                            Défi {defiEnCours.code} en cours
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 600, color: '#B9C6DD' }}>
                            {typeLabels[defiEnCours.type] || 'Défi'} · {defiEnCours.classe || profil?.classe || 'Classe'} · le défi reprend à la première question
                        </div>
                    </div>
                    <button
                        style={{
                            background: 'var(--action)', color: '#fff',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 21,
                            padding: '16px 26px', borderRadius: 999, border: 'none',
                            cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                        disabled={loadingReprise}
                        onClick={handleReprendre}
                    >
                        {loadingReprise ? '…' : 'Reprendre'}
                    </button>
                </div>
            )}

            {/* 3. Section Jouer (Grille 2x2 des 4 modes) */}
            <div style={{ padding: '10px 0 0' }}>
                <div style={{
                    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                    color: 'var(--gris)', letterSpacing: '0.14em',
                    textTransform: 'uppercase', marginBottom: 14,
                }}>
                    Jouer
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                    {/* Sprint */}
                    <button
                        onClick={() => onGo('play', { mode: 'sprint', length: 20, timer: 3 })}
                        style={{
                            background: 'var(--surface)', borderRadius: 26, padding: 26,
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)', border: 'none',
                            display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <IconSprint size={40} color="var(--indigo)" actionColor="var(--action)" />
                            <span className="font-display" style={{ fontSize: 27, fontWeight: 700, color: 'var(--indigo)' }}>
                                Sprint
                            </span>
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 17, lineHeight: 1.4, color: 'var(--gris)', fontWeight: 600 }}>
                            20 questions, 3 s chacune
                        </div>
                    </button>

                    {/* Sans faute */}
                    <button
                        onClick={() => onGo('play', { mode: 'flawless', length: 20, timer: 0 })}
                        style={{
                            background: 'var(--surface)', borderRadius: 26, padding: 26,
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)', border: 'none',
                            display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <IconSansFaute size={40} color="var(--indigo)" actionColor="var(--action)" />
                            <span className="font-display" style={{ fontSize: 27, fontWeight: 700, color: 'var(--indigo)' }}>
                                Sans faute
                            </span>
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 17, lineHeight: 1.4, color: 'var(--gris)', fontWeight: 600 }}>
                            Zéro erreur, pas de chrono
                        </div>
                    </button>

                    {/* Contre-la-montre */}
                    <button
                        onClick={() => onGo('play', { mode: 'countdown', length: 0, timer: 120 })}
                        style={{
                            background: 'var(--surface)', borderRadius: 26, padding: 26,
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)', border: 'none',
                            display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <IconChrono size={40} color="var(--indigo)" actionColor="var(--action)" />
                            <span className="font-display" style={{ fontSize: 27, fontWeight: 700, color: 'var(--indigo)' }}>
                                Contre-la-montre
                            </span>
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 17, lineHeight: 1.4, color: 'var(--gris)', fontWeight: 600 }}>
                            2 min, un max de bonnes
                        </div>
                    </button>

                    {/* Montée */}
                    <button
                        onClick={() => onGo('challenges', { mode: 'climb' })}
                        style={{
                            background: 'var(--surface)', borderRadius: 26, padding: 26,
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)', border: 'none',
                            display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <IconMontee size={40} color="var(--indigo)" actionColor="var(--action)" />
                            <span className="font-display" style={{ fontSize: 27, fontWeight: 700, color: 'var(--indigo)' }}>
                                Montée
                            </span>
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 17, lineHeight: 1.4, color: 'var(--gris)', fontWeight: 600 }}>
                            Palier {plafond} · débloque la {plafond + 1}
                        </div>
                    </button>
                </div>
            </div>

            {/* 4. Section Défi de classe */}
            <div>
                <div style={{
                    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                    color: 'var(--gris)', letterSpacing: '0.14em',
                    textTransform: 'uppercase', marginBottom: 14,
                }}>
                    Défi de classe
                </div>
                <div style={{
                    background: 'var(--surface)', borderRadius: 26,
                    padding: '22px 24px', boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                    display: 'flex', alignItems: 'center', gap: 16,
                }}>
                    <input
                        type="text"
                        value={joinCode}
                        onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-HJ-KM-NP-Z2-9]/g, '').slice(0, 5))}
                        placeholder="CODE"
                        style={{
                            flex: 1, height: 86, borderRadius: 20,
                            border: '3px dashed var(--bordure)',
                            fontFamily: 'var(--texte)', fontWeight: 700,
                            fontSize: 30, color: '#B9B0A0',
                            letterSpacing: '0.34em', textAlign: 'center',
                            outline: 'none', background: 'var(--surface)',
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') handleJoinDirect(); }}
                    />
                    <button
                        style={{
                            height: 86, padding: '0 34px', borderRadius: 20,
                            background: 'var(--action)', color: '#fff',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 25,
                            border: 'none', cursor: 'pointer',
                            opacity: joinCode.length < 5 || joinLoading ? 0.6 : 1,
                        }}
                        disabled={joinCode.length < 5 || joinLoading}
                        onClick={handleJoinDirect}
                    >
                        {joinLoading ? '…' : 'Rejoindre'}
                    </button>
                </div>
                {joinError && (
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--rouge)', marginTop: 8, textAlign: 'center' }}>
                        {joinError}
                    </p>
                )}
            </div>

            {/* 5. Accès rapides / boutons du bas */}
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                <button
                    style={{
                        flex: 1, height: 104, background: 'var(--surface)',
                        borderRadius: 24, boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                        border: 'none',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 4,
                        cursor: 'pointer',
                    }}
                    onClick={() => onGo('learn')}
                >
                    <IconApprendre size={32} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19, color: 'var(--indigo)' }}>
                        Apprendre
                    </span>
                </button>
                <button
                    style={{
                        flex: 1, height: 104, background: 'var(--surface)',
                        borderRadius: 24, boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                        border: 'none',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 4,
                        cursor: 'pointer',
                    }}
                    onClick={() => onGo('leaderboards')}
                >
                    <IconClassements size={32} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19, color: 'var(--indigo)' }}>
                        Classements
                    </span>
                </button>
                <button
                    style={{
                        flex: 1, height: 104, background: 'var(--surface)',
                        borderRadius: 24, boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                        border: 'none',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 4,
                        cursor: 'pointer',
                    }}
                    onClick={() => onGo('profile')}
                >
                    <IconMaGrille size={32} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19, color: 'var(--indigo)' }}>
                        Ma grille
                    </span>
                </button>
            </div>
        </div>
    );
}

```


## screens/Practice.jsx — selecteur, partie, fin de partie

`frontend/src/screens/Practice.jsx`

```jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ALL_TABLES, PRAISE, newQuestion, makeHint } from '../logic/questions';
import { updateMastery, buildWeights, construireErreurs, construireMaitrise, cleFait } from '../logic/mastery';
import { enregistrerSession, enregistrerSessionProf } from '../api';
import Keypad from '../components/Keypad';
import TimerRing from '../components/TimerRing';
import MasteryGrid from '../components/MasteryGrid';
import { IconCadenas, IconSprint, IconSansFaute, IconChrono, IconMontee, IconMaGrille, IconAmpoule } from '../components/Icons';

/**
 * Practice — Modes de jeu élève (Maquettes 1, 3, 7)
 * Phases : setup (Maquette 7) → quiz (Maquette 1) → results (Maquette 3)
 */

const DEFAULT_TABLES = [2, 3, 4, 5];

const MODE_INFO = {
    sprint: { name: 'Sprint', icon: IconSprint, desc: '20 questions, 3 s chacune', defaultLen: 20, qTimer: 3 },
    flawless: { name: 'Sans faute', icon: IconSansFaute, desc: 'Zéro erreur, pas de chrono', defaultLen: 20, qTimer: 0 },
    countdown: { name: 'Contre-la-montre', icon: IconChrono, desc: '2 min, un max de bonnes', defaultLen: 0, qTimer: 0, globalTimer: 120 },
    libre: { name: 'S\'entraîner', icon: IconSansFaute, desc: 'Entraînement libre', defaultLen: 10, qTimer: 0 },
};

export default function Practice({
    onBack,
    identite,
    estProf,
    onPlafondChange,
    tablesInitiales,
    maitrise: maitriseProp,
    config,
}) {
    const plafond = estProf ? 20 : (identite?.profil?.plafond_tables || 10);
    const mode = config?.mode || 'sprint';
    const modeMeta = MODE_INFO[mode] || MODE_INFO.sprint;

    const initialLength = config?.length !== undefined ? config.length : (modeMeta.defaultLen || 20);
    const initialGlobalTimer = mode === 'countdown' ? (config?.timer || modeMeta.globalTimer || 120) : 0;
    const questionDuration = mode === 'sprint' ? (config?.timer || modeMeta.qTimer || 3) : 0;

    const [phase, setPhase] = useState(tablesInitiales?.length ? 'quiz' : 'setup');
    const [picked, setPicked] = useState(tablesInitiales?.length ? tablesInitiales : DEFAULT_TABLES.filter(t => t <= plafond));
    const [length, setLength] = useState(initialLength);
    const [globalTimer, setGlobalTimer] = useState(initialGlobalTimer);
    const [result, setResult] = useState(null);
    const [serverResult, setServerResult] = useState(null);
    const [showGrid, setShowGrid] = useState(false);
    const [mastery, setMastery] = useState(maitriseProp || {});

    useEffect(() => {
        if (maitriseProp) setMastery(maitriseProp);
    }, [maitriseProp]);

    const handleDone = useCallback((r) => {
        const maitriseSortie = construireMaitrise(r.resultats);
        setMastery(prev => ({ ...prev, ...maitriseSortie }));
        setResult(r);
        setServerResult(null);
        setPhase('results');

        const sessionMode = mode === 'countdown' ? 'countdown' : (mode === 'sprint' ? 'sprint' : 'libre');
        const erreurs = construireErreurs(r.resultats);

        const session = {
            mode: sessionMode,
            tables: picked,
            nbQuestions: r.answered,
            score: r.score,
            scorePremierEssai: r.scorePremierEssai,
            erreurs,
            dureeS: r.seconds,
            serieMax: r.maxStreak,
            sansFauteMax: r.maxStreak,
            plusHauteTable: null,
            maitrise: maitriseSortie,
        };

        const enregistrer = estProf ? enregistrerSessionProf : enregistrerSession;
        enregistrer(session).then(res => {
            if (res.ok) {
                setServerResult(res.data);
                const np = res.data?.plafond_tables;
                const currentPlafond = estProf ? 20 : (identite?.profil?.plafond_tables || 10);
                if (np && np !== currentPlafond) {
                    onPlafondChange?.(np);
                }
            } else {
                setServerResult({ erreur: res.error, enAttente: res.enAttente });
            }
        }).catch(() => {});
    }, [picked, estProf, identite, onPlafondChange, mode]);

    const startWithTables = (tables, len) => {
        setPicked(tables);
        setLength(len);
        setPhase('quiz');
    };

    if (phase === 'setup') {
        return (
            <>
                {showGrid && <MasteryGrid mastery={mastery} onClose={() => setShowGrid(false)} />}
                <Setup
                    onBack={onBack}
                    picked={picked}
                    setPicked={setPicked}
                    mode={mode}
                    onStart={() => setPhase('quiz')}
                    onShowGrid={() => setShowGrid(true)}
                    plafond={plafond}
                    mastery={mastery}
                />
            </>
        );
    }

    if (phase === 'quiz') {
        return (
            <Quiz
                tables={picked.length ? picked : ALL_TABLES.slice(0, 10)}
                length={globalTimer > 0 ? 0 : length}
                globalTimer={globalTimer}
                questionDuration={questionDuration}
                mode={mode}
                mastery={mastery}
                onQuit={() => setPhase('setup')}
                onDone={handleDone}
            />
        );
    }

    return (
        <Results
            result={result}
            serverResult={serverResult}
            mode={mode}
            onReplay={() => { setServerResult(null); setPhase('quiz'); }}
            onReviewErrors={(tables) => startWithTables(tables, 10)}
            onHome={onBack}
            onSetup={() => setPhase('setup')}
        />
    );
}

/* =========================================================================
   MAQUETTE 7 — Sélecteur de tables
   ========================================================================= */

function Setup({ onBack, picked, setPicked, mode, onStart, onShowGrid, plafond, mastery }) {
    const ModeIcon = MODE_INFO[mode]?.icon || IconSprint;
    const modeName = MODE_INFO[mode]?.name || 'Sprint';
    const unlocked = ALL_TABLES.filter(t => t <= plafond);
    const maxTableShown = Math.max(12, Math.min(20, plafond + 1));
    const tablesToDisplay = ALL_TABLES.filter(t => t <= maxTableShown);

    const toggle = (t) => {
        if (t > plafond) return;
        setPicked(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
    };

    const handleTablesFaibles = async () => {
        try {
            const { mesTablesFaibles } = await import('../api');
            const res = await mesTablesFaibles(3);
            if (res.ok && res.data?.length) {
                setPicked(res.data.filter(t => t <= plafond));
                return;
            }
        } catch {}
        // Repli : les 3 dernières tables débloquées
        setPicked(unlocked.slice(-3));
    };

    const handleSelectAll = () => setPicked([...unlocked]);
    const handleClear = () => setPicked([]);

    const getTableMasteryColor = (t) => {
        let green = 0, red = 0, total = 0;
        for (let m = 1; m <= 10; m++) {
            const k = cleFait(t, m);
            if (mastery[k] !== undefined) {
                total++;
                if (mastery[k] >= 2) green++;
                else if (mastery[k] === 0) red++;
            }
        }
        if (total === 0) return 'var(--bordure)';
        if (red > 0 || (green / total < 0.4)) return 'var(--rouge)';
        if (green / total >= 0.8) return 'var(--vert)';
        return 'var(--orange)';
    };

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Navigation haute */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px 0' }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 20,
                        color: 'var(--indigo-doux)', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                >
                    ‹ Retour
                </button>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--ciel-pale)', padding: '8px 18px', borderRadius: 999,
                }}>
                    <ModeIcon size={22} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18, color: 'var(--indigo)' }}>
                        {modeName}
                    </span>
                </div>
            </div>

            {/* 2. Titre & sous-titre */}
            <div style={{ padding: '6px 4px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2 className="font-display" style={{ margin: 0, fontSize: 36, fontWeight: 800, color: 'var(--indigo)' }}>
                    Sur quelles tables ?
                </h2>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--gris)' }}>
                    Tes tables sont ouvertes jusqu'à la {plafond}. La {plafond + 1} se débloque par la Montée.
                </div>
            </div>

            {/* 3. Boutons d'action rapides */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                <button
                    onClick={handleTablesFaibles}
                    style={{
                        background: 'var(--indigo)', color: 'var(--action-texte)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                        padding: '12px 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    }}
                >
                    Mes 3 tables faibles
                </button>
                <button
                    onClick={handleSelectAll}
                    style={{
                        background: 'var(--surface)', color: 'var(--indigo)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                        padding: '12px 20px', borderRadius: 999,
                        boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)', cursor: 'pointer',
                    }}
                >
                    Tout sélectionner
                </button>
                <button
                    onClick={handleClear}
                    style={{
                        background: 'var(--surface)', color: 'var(--indigo)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                        padding: '12px 20px', borderRadius: 999,
                        boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)', cursor: 'pointer',
                    }}
                >
                    Effacer
                </button>
            </div>

            {/* 4. Légende */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '4px 4px 0', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--indigo-doux)' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--rouge)' }} /> À revoir
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--indigo-doux)' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--orange)' }} /> En cours
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--indigo-doux)' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--vert)' }} /> Maîtrisé
                </div>
            </div>

            {/* 5. Grille des tables (3 colonnes) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 4 }}>
                {tablesToDisplay.map(t => {
                    const locked = t > plafond;
                    const selected = picked.includes(t);
                    const barColor = getTableMasteryColor(t);

                    if (locked) {
                        return (
                            <div
                                key={t}
                                style={{
                                    height: 124, borderRadius: 24, background: '#F2EDE3',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    justifyContent: 'center', gap: 6, cursor: 'not-allowed',
                                }}
                            >
                                <IconCadenas size={24} color="#9A93A8" />
                                <span className="font-display" style={{ fontSize: 34, fontWeight: 700, color: '#B3ACBE' }}>
                                    {t}
                                </span>
                            </div>
                        );
                    }

                    return (
                        <div
                            key={t}
                            onClick={() => toggle(t)}
                            style={{
                                height: 124, borderRadius: 24, cursor: 'pointer',
                                background: selected ? 'var(--action)' : 'var(--surface)',
                                boxShadow: selected ? '0 8px 20px rgba(35,164,217,.28)' : 'var(--ombre-douce)',
                                border: selected ? 'none' : '1px solid var(--bordure)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', gap: 8, position: 'relative',
                                transition: 'all 0.12s ease',
                            }}
                        >
                            <span className="font-display" style={{
                                fontSize: 44, fontWeight: 700,
                                color: selected ? 'var(--action-texte)' : 'var(--indigo)',
                            }}>
                                {t}
                            </span>
                            <span style={{
                                width: 52, height: 8, borderRadius: 4,
                                background: selected ? 'rgba(255,255,255,0.7)' : barColor,
                            }} />
                            {selected && (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', top: 10, right: 10 }}>
                                    <path d="M5 12.5 10 17.5 19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 6. Bouton C'est parti ! */}
            <div style={{ marginTop: 10, marginBottom: 10 }}>
                <button
                    disabled={picked.length === 0}
                    onClick={onStart}
                    style={{
                        width: '100%', height: 76, borderRadius: 24,
                        background: 'var(--action)', color: 'var(--action-texte)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 24,
                        border: 'none', cursor: picked.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: picked.length === 0 ? 0.45 : 1,
                        boxShadow: 'var(--ombre-douce)',
                    }}
                >
                    C'est parti !
                </button>
            </div>
        </div>
    );
}

/* =========================================================================
   MAQUETTE 1 — Partie en cours (saisie, juste, faux)
   ========================================================================= */

function Quiz({ tables, length, globalTimer, questionDuration, mode, mastery, onQuit, onDone }) {
    const weights = useMemo(() => buildWeights(tables, mastery), [tables, mastery]);
    const ModeIcon = MODE_INFO[mode]?.icon || IconSprint;
    const modeName = MODE_INFO[mode]?.name || 'Sprint';

    const [sessionWeights, setSessionWeights] = useState(weights);
    const [q, setQ] = useState(() => newQuestion(tables, null, weights));
    const [digits, setDigits] = useState(() => Array(String(q.answer).length).fill(''));
    const [answered, setAnswered] = useState(0);
    const [score, setScore] = useState(0);
    const [scorePremierEssai, setScorePremierEssai] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [recentResults, setRecentResults] = useState([]); // Derniers résultats pour la mosaïque (max 5)
    const [fb, setFb] = useState('idle'); // 'idle' | 'correct' | 'wrong' | 'reveal'
    const [word, setWord] = useState('');
    const [remainingGlobal, setRemainingGlobal] = useState(globalTimer);
    const [questionTimeLeft, setQuestionTimeLeft] = useState(questionDuration);
    const [showHint, setShowHint] = useState(false);

    const [premierEssai, setPremierEssai] = useState(true);
    const [attempts, setAttempts] = useState(0);

    const lockRef = useRef(false);
    const resultatsRef = useRef([]);
    const startRef = useRef(Date.now());
    const scoreRef = useRef(0);
    const scorePremierRef = useRef(0);
    const answeredRef = useRef(0);
    const maxStreakRef = useRef(0);
    const streakRef = useRef(0);
    const timedOut = useRef(false);
    const questionTimerRef = useRef(null);

    const endless = length === 0;
    const hasGlobalTimer = globalTimer > 0;
    const hasQuestionTimer = questionDuration > 0;
    const numDigits = String(q.answer).length;

    // Timer global (Contre-la-montre)
    useEffect(() => {
        if (!hasGlobalTimer) return;
        const id = setInterval(() => {
            setRemainingGlobal(r => {
                if (r <= 1) {
                    clearInterval(id);
                    if (!timedOut.current) {
                        timedOut.current = true;
                        setTimeout(() => {
                            onDone({
                                score: scoreRef.current,
                                scorePremierEssai: scorePremierRef.current,
                                answered: answeredRef.current,
                                maxStreak: maxStreakRef.current,
                                resultats: resultatsRef.current,
                                seconds: globalTimer, timerMode: true,
                            });
                        }, 0);
                    }
                    return 0;
                }
                return r - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [hasGlobalTimer, globalTimer, onDone]);

    // Timer par question (Sprint : 3 s)
    useEffect(() => {
        if (!hasQuestionTimer || fb !== 'idle') return;
        setQuestionTimeLeft(questionDuration);
        const startTime = Date.now();
        const interval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const left = Math.max(0, questionDuration - elapsed);
            setQuestionTimeLeft(left);
            if (left <= 0) {
                clearInterval(interval);
                handleQuestionTimeout();
            }
        }, 50);
        questionTimerRef.current = interval;
        return () => clearInterval(interval);
    }, [q, hasQuestionTimer, questionDuration, fb]);

    const handleQuestionTimeout = useCallback(() => {
        if (lockRef.current || timedOut.current) return;
        lockRef.current = true;
        setFb('wrong');
        setWord('Temps écoulé !');
        setTimeout(() => {
            recordAndAdvance('jamais');
        }, 400);
    }, []);

    // Prochaine question
    const nextQuestion = useCallback(() => {
        lockRef.current = false;
        setFb('idle');
        setWord('');
        setShowHint(false);
        setPremierEssai(true);
        setAttempts(0);
        const newQ = newQuestion(tables, q, sessionWeights);
        setQ(newQ);
        setDigits(Array(String(newQ.answer).length).fill(''));
    }, [tables, q, sessionWeights]);

    // Enregistrement du résultat et progression
    const recordAndAdvance = useCallback((res) => {
        resultatsRef.current.push({ a: q.a, b: q.b, result: res });
        answeredRef.current += 1;
        setAnswered(a => a + 1);

        setRecentResults(prev => [...prev.slice(-4), res]);

        if (res === 'premier') {
            scoreRef.current += 1;
            scorePremierRef.current += 1;
            setScore(s => s + 1);
            setScorePremierEssai(s => s + 1);
            streakRef.current += 1;
            if (streakRef.current > maxStreakRef.current) maxStreakRef.current = streakRef.current;
            setStreak(streakRef.current);
            setMaxStreak(maxStreakRef.current);
        } else if (res === 'rattrape') {
            scoreRef.current += 1;
            setScore(s => s + 1);
            streakRef.current = 0;
            setStreak(0);
        } else {
            streakRef.current = 0;
            setStreak(0);
        }

        const key = cleFait(q.a, q.b);
        setSessionWeights(w => ({
            ...w,
            [key]: Math.min((w[key] || 1) + (res === 'jamais' ? 4 : res === 'rattrape' ? 2 : 0), 8)
        }));

        const delay = (res === 'premier' || res === 'rattrape') ? 180 : 200;

        setTimeout(() => {
            if (timedOut.current) return;
            if (!endless && answeredRef.current >= length) {
                onDone({
                    score: scoreRef.current,
                    scorePremierEssai: scorePremierRef.current,
                    answered: length,
                    maxStreak: maxStreakRef.current,
                    resultats: resultatsRef.current,
                    seconds: Math.round((Date.now() - startRef.current) / 1000),
                    timerMode: hasGlobalTimer,
                });
            } else {
                nextQuestion();
            }
        }, delay);
    }, [q, endless, length, hasGlobalTimer, onDone, nextQuestion]);

    // Soumission automatique à la dernière case
    const handleComplete = useCallback((value) => {
        if (lockRef.current || timedOut.current) return;
        const ok = value === q.answer;
        const att = attempts + 1;
        setAttempts(att);

        if (ok) {
            lockRef.current = true;
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            const res = premierEssai ? 'premier' : 'rattrape';
            recordAndAdvance(res);
        } else {
            setPremierEssai(false);
            setFb('wrong');
            const remainingSec = hasQuestionTimer ? questionTimeLeft.toFixed(1) : null;
            setWord(remainingSec && parseFloat(remainingSec) > 0 ? `Presque — il te reste ${remainingSec} s` : 'Presque !');

            setTimeout(() => {
                if (att >= 2 && mode !== 'sprint') {
                    // 2 erreurs consécutives en mode non-sprint
                    recordAndAdvance('jamais');
                } else {
                    setFb('idle');
                    setDigits(Array(numDigits).fill(''));
                }
            }, 200);
        }
    }, [q, attempts, premierEssai, hasQuestionTimer, questionTimeLeft, numDigits, recordAndAdvance, mode]);

    const press = useCallback((d) => {
        if (lockRef.current || fb !== 'idle') return;
        setDigits(prev => {
            const idx = prev.findIndex(x => x === '');
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = d;
            if (idx === numDigits - 1) {
                setTimeout(() => handleComplete(parseInt(next.join(''), 10)), 0);
            }
            return next;
        });
    }, [fb, numDigits, handleComplete]);

    const del = useCallback(() => {
        if (lockRef.current || fb !== 'idle') return;
        setDigits(prev => {
            let idx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i] !== '') { idx = i; break; }
            }
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = '';
            return next;
        });
    }, [fb]);

    // Clavier physique
    useEffect(() => {
        const h = (e) => {
            if (e.key >= '0' && e.key <= '9') { e.preventDefault(); press(parseInt(e.key, 10)); }
            else if (e.key === 'Backspace') { e.preventDefault(); del(); }
            else if (e.key === 'Escape') { onQuit(); }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [press, del, onQuit]);

    const activeIndex = digits.findIndex(d => d === '');
    const currentQuestionNum = Math.min(answered + 1, length || answered + 1);
    const progressPct = length > 0 ? (answered / length) * 100 : 0;
    const questionPct = hasQuestionTimer ? (questionTimeLeft / questionDuration) * 100 : 100;

    // Palette mosaïque pour les 5 derniers résultats
    const mosaicColors = {
        premier: 'var(--vert)',
        rattrape: 'var(--orange)',
        jamais: 'var(--rouge)',
    };

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', boxSizing: 'border-box' }}>
            {/* Top Bar : Quitter + Badge mode */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px 0' }}>
                <button
                    onClick={onQuit}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 20,
                        color: 'var(--indigo-doux)',
                    }}
                >
                    ‹ Quitter
                </button>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--ciel-pale)', padding: '8px 18px', borderRadius: 999,
                }}>
                    <ModeIcon size={20} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17, color: 'var(--indigo)' }}>
                        {modeName}
                    </span>
                </div>
            </div>

            {/* Barre de progression & Compteur Série Mosaïque */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 4px 0' }}>
                <div className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--indigo)', whiteSpace: 'nowrap' }}>
                    {currentQuestionNum}<span style={{ color: 'var(--gris)', fontSize: 18, fontWeight: 600 }}> / {length || '∞'}</span>
                </div>
                <div style={{ flex: 1, height: 10, borderRadius: 999, background: 'var(--bordure)', overflow: 'hidden' }}>
                    <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--indigo)', borderRadius: 999, transition: 'width 0.2s ease' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 12px)', gap: 4 }}>
                        {[0, 1, 2, 3, 4].map(i => {
                            const res = recentResults[i];
                            const bg = res ? mosaicColors[res] : 'var(--bordure)';
                            return (
                                <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: bg }} />
                            );
                        })}
                    </div>
                    <span className="font-display" style={{
                        fontSize: 22, fontWeight: 800,
                        color: fb === 'correct' ? 'var(--vert)' : streak > 0 ? 'var(--indigo)' : 'var(--gris)',
                    }}>
                        {streak}
                    </span>
                </div>
            </div>

            {/* Carte Question + Cases de saisie */}
            <div style={{ position: 'relative', marginTop: 14 }}>
                {/* Floating confetti when correct */}
                {fb === 'correct' && (
                    <>
                        <div style={{ position: 'absolute', top: -10, left: 24, width: 18, height: 18, borderRadius: 4, background: 'var(--rouge)', transform: 'rotate(18deg)', zIndex: 3 }} />
                        <div style={{ position: 'absolute', top: 26, left: -8, width: 16, height: 16, borderRadius: 4, background: 'var(--orange)', transform: 'rotate(-12deg)', zIndex: 3 }} />
                        <div style={{ position: 'absolute', top: -14, right: 70, width: 18, height: 18, borderRadius: 4, background: 'var(--action)', transform: 'rotate(24deg)', zIndex: 3 }} />
                        <div style={{ position: 'absolute', top: 38, right: -10, width: 20, height: 20, borderRadius: 5, background: 'var(--vert)', transform: 'rotate(-20deg)', zIndex: 3 }} />
                    </>
                )}

                <div
                    className={fb === 'wrong' ? 'anim-shake' : ''}
                    style={{
                        background: 'var(--surface)', borderRadius: 32, padding: '26px 24px 30px',
                        boxShadow: fb === 'correct'
                            ? '0 0 0 4px var(--vert-pale), 0 8px 22px rgba(32,34,107,.10)'
                            : fb === 'wrong'
                                ? '0 0 0 4px var(--rouge-pale), 0 8px 22px rgba(32,34,107,.10)'
                                : '0 6px 16px rgba(32,34,107,.08)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
                        position: 'relative', border: '1px solid var(--bordure)',
                        transition: 'box-shadow 0.15s ease',
                    }}
                >
                    {/* Floating +1 on correct */}
                    {fb === 'correct' && (
                        <div style={{
                            position: 'absolute', top: 20, right: 24,
                            background: 'var(--vert)', color: '#fff',
                            fontFamily: 'var(--titre)', fontWeight: 800, fontSize: 24,
                            padding: '4px 16px', borderRadius: 999,
                        }}>
                            +1
                        </div>
                    )}

                    {/* Question text */}
                    <div className="question-text font-display" style={{
                        color: 'var(--indigo)', letterSpacing: '0.02em', margin: 0,
                    }}>
                        {q.a} <span style={{ color: 'var(--gris)' }}>×</span> {q.b}
                    </div>

                    {/* Barre de compte à rebours par question */}
                    {hasQuestionTimer && (
                        <div style={{ width: '100%', height: 8, borderRadius: 999, background: 'var(--bordure)', overflow: 'hidden' }}>
                            <div style={{
                                width: `${questionPct}%`, height: '100%',
                                background: fb === 'correct' ? 'var(--vert)' : 'var(--action)',
                                borderRadius: 999, transition: 'width 0.05s linear',
                            }} />
                        </div>
                    )}

                    {/* Cases de saisie */}
                    <div style={{ display: 'flex', gap: 14 }}>
                        {digits.map((d, i) => {
                            const isCurrent = i === activeIndex && fb === 'idle';
                            const isCorrect = fb === 'correct';
                            const isWrong = fb === 'wrong';

                            return (
                                <div
                                    key={i}
                                    style={{
                                        width: 96, height: 116, borderRadius: 22,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 72,
                                        background: isCorrect ? 'var(--vert)' : isWrong ? 'var(--rouge-pale)' : (d ? 'var(--surface)' : '#F6F2EA'),
                                        border: isCorrect ? 'none' : isWrong ? '4px solid var(--rouge-doux)' : (isCurrent ? '4px solid var(--action)' : '4px solid var(--bordure)'),
                                        color: isCorrect ? '#fff' : isWrong ? 'var(--rouge-doux)' : 'var(--indigo)',
                                        transition: 'all 0.1s ease',
                                    }}
                                >
                                    {d || (isCurrent ? <div style={{ width: 4, height: 50, background: 'var(--indigo-doux)', borderRadius: 2 }} className="caret" /> : '')}
                                </div>
                            );
                        })}
                    </div>

                    {/* Feedback text */}
                    {word && (
                        <div style={{
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
                            color: fb === 'wrong' ? 'var(--rouge-doux)' : 'var(--vert)',
                        }}>
                            {word}
                        </div>
                    )}

                    {showHint && fb === 'idle' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--indigo-doux)', fontWeight: 600 }}>
                            <IconAmpoule size={18} color="var(--indigo-doux)" /> {makeHint(q.a, q.b)}
                        </div>
                    )}
                </div>
            </div>

            <div style={{ flex: 1 }} />

            {/* Pavé numérique */}
            <div style={{ paddingBottom: 16 }}>
                <Keypad onPress={press} onDelete={del} disabled={lockRef.current} />
            </div>
        </div>
    );
}

/* =========================================================================
   MAQUETTE 3 — Fin de partie
   ========================================================================= */

function Results({ result, serverResult, mode, onReplay, onReviewErrors, onHome, onSetup }) {
    if (!result) return null;
    const { score, scorePremierEssai, answered, maxStreak, resultats, seconds } = result;
    const modeName = MODE_INFO[mode]?.name || 'Sprint';

    const premierCount = serverResult?.premier_essai ?? (scorePremierEssai ?? score);
    const rattrapees = serverResult?.rattrapees ?? (score - premierCount);
    const pointsGagnes = serverResult?.points ?? score;
    const badges = serverResult?.nouveaux_badges || [];

    const vitesseMoyenne = answered > 0 ? (seconds / answered).toFixed(1).replace('.', ',') : '0';

    // Tables avec erreurs
    const wrongTables = [...new Set(
        (resultats || []).filter(r => r.result !== 'premier').map(r => r.a)
    )].sort((a, b) => a - b);

    // Faits travaillés lors de cette session
    const faitsTravailles = useMemo(() => {
        const vus = new Map();
        (resultats || []).forEach(r => {
            const label = `${r.a}×${r.b}`;
            vus.set(label, r.result);
        });
        return Array.from(vus.entries());
    }, [resultats]);

    const nbVertes = faitsTravailles.filter(([_, res]) => res === 'premier').length;

    // Déclenchement confettis
    useEffect(() => {
        import('canvas-confetti').then(mod => {
            const fire = mod.default;
            const style = getComputedStyle(document.documentElement);
            const colors = ['--mosaique-1', '--mosaique-2', '--mosaique-3', '--mosaique-4', '--mosaique-5']
                .map(v => style.getPropertyValue(v).trim())
                .filter(Boolean);
            fire({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: colors.length ? colors : undefined });
        }).catch(() => {});
    }, []);

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
            {/* Confettis décoratifs statiques */}
            <div style={{ position: 'absolute', top: 20, left: 30, width: 22, height: 22, borderRadius: 5, background: 'var(--rouge)', transform: 'rotate(16deg)' }} />
            <div style={{ position: 'absolute', top: 60, right: 40, width: 18, height: 18, borderRadius: 4, background: 'var(--action)', transform: 'rotate(-22deg)' }} />
            <div style={{ position: 'absolute', top: 120, left: 60, width: 16, height: 16, borderRadius: 4, background: 'var(--orange)', transform: 'rotate(34deg)' }} />
            <div style={{ position: 'absolute', top: 10, right: 120, width: 14, height: 14, borderRadius: 3, background: 'var(--vert)', transform: 'rotate(-10deg)' }} />

            {/* En-tête Score */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 10 }}>
                <div style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 22, color: 'var(--vert)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {modeName.toUpperCase()} TERMINÉ
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span className="font-display" style={{ fontSize: 120, fontWeight: 800, color: 'var(--indigo)', lineHeight: 1 }}>
                        {premierCount}
                    </span>
                    <span className="font-display" style={{ fontSize: 44, fontWeight: 800, color: 'var(--gris)' }}>
                        / {answered}
                    </span>
                </div>
                <div style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 20, color: 'var(--indigo-doux)' }}>
                    du premier coup
                </div>
                {rattrapees > 0 && (
                    <div style={{
                        marginTop: 4, background: 'var(--orange-pale)', color: '#8A5A10',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                        padding: '8px 20px', borderRadius: 999,
                    }}>
                        {rattrapees} rattrapée{rattrapees > 1 ? 's' : ''} au 2ᵉ essai · ½ pt chacune
                    </div>
                )}
            </div>

            {/* 3 Cartes de statistiques */}
            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <div style={{
                    flex: 1, background: 'var(--surface)', borderRadius: 22, padding: '16px 12px',
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                    <span className="font-display" style={{ fontSize: 34, fontWeight: 800, color: 'var(--vert)' }}>
                        +{pointsGagnes}
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                        points
                    </span>
                </div>
                <div style={{
                    flex: 1, background: 'var(--surface)', borderRadius: 22, padding: '16px 12px',
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                    <span className="font-display" style={{ fontSize: 34, fontWeight: 800, color: 'var(--indigo)' }}>
                        {maxStreak}
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                        meilleure série
                    </span>
                </div>
                <div style={{
                    flex: 1, background: 'var(--surface)', borderRadius: 22, padding: '16px 12px',
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                    <span className="font-display" style={{ fontSize: 34, fontWeight: 800, color: 'var(--indigo)' }}>
                        {vitesseMoyenne} s
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                        par question
                    </span>
                </div>
            </div>

            {/* Nouveau badge débloqué */}
            {badges.length > 0 && (
                <div style={{
                    background: 'var(--indigo)', borderRadius: 26, padding: '20px 22px',
                    display: 'flex', alignItems: 'center', gap: 18,
                }}>
                    <div style={{
                        width: 72, height: 72, borderRadius: 20, background: 'var(--orange)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, flexShrink: 0,
                    }}>
                        🏅
                    </div>
                    <div>
                        <div style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 14, color: 'var(--orange)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                            Nouveau badge
                        </div>
                        <div className="font-display" style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 2 }}>
                            {badges[0]?.nom || badges[0]}
                        </div>
                    </div>
                </div>
            )}

            {/* Carte : Ta grille a bougé */}
            {faitsTravailles.length > 0 && (
                <div style={{
                    background: 'var(--surface)', borderRadius: 26, padding: '20px 22px',
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                    display: 'flex', flexDirection: 'column', gap: 14,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--indigo)' }}>
                            Ta grille a bougé
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                            {nbVertes} case{nbVertes > 1 ? 's passent' : ' passe'} au vert
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {faitsTravailles.slice(0, 8).map(([fait, res], i) => {
                            const bg = res === 'premier' ? 'var(--vert)' : res === 'rattrape' ? 'var(--orange)' : 'var(--rouge)';
                            const txt = res === 'rattrape' ? '#4A3706' : '#fff';
                            return (
                                <div
                                    key={i}
                                    style={{
                                        width: 58, height: 58, borderRadius: 14, background: bg,
                                        color: txt, fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 18,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    {fait}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Boutons d'action inférieurs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4, marginBottom: 12 }}>
                <button
                    onClick={onReplay}
                    style={{
                        height: 74, borderRadius: 24, background: 'var(--action)',
                        color: 'var(--action-texte)', fontFamily: 'var(--texte)', fontWeight: 700,
                        fontSize: 22, border: 'none', cursor: 'pointer', boxShadow: 'var(--ombre-douce)',
                    }}
                >
                    Rejouer un {modeName}
                </button>
                <div style={{ display: 'flex', gap: 12 }}>
                    {wrongTables.length > 0 && (
                        <button
                            onClick={() => onReviewErrors(wrongTables)}
                            style={{
                                flex: 2, height: 68, borderRadius: 22,
                                background: 'var(--rouge-pale)', color: '#8E2C30',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                                border: 'none', cursor: 'pointer',
                            }}
                        >
                            Réviser mes {wrongTables.length} cases rouges
                        </button>
                    )}
                    <button
                        onClick={onHome}
                        style={{
                            flex: 1, height: 68, borderRadius: 22,
                            background: '#F1ECE2', color: 'var(--indigo-doux)',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
                            border: 'none', cursor: 'pointer',
                        }}
                    >
                        Accueil
                    </button>
                </div>
            </div>
        </div>
    );
}

```


## screens/Challenges.jsx — les defis (le plus gros)

`frontend/src/screens/Challenges.jsx`

```jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { newQuestion, PRAISE, makeHint, ALL_TABLES } from '../logic/questions';
import { buildWeights, construireErreurs, construireMaitrise, cleFait } from '../logic/mastery';
import {
    enregistrerSession, enregistrerSessionProf,
    creerDefi, rejoindreDefi, terminerDefi,
    classementDefi, avancementDefi, suivreDefi,
    listeClasses, apercuDefiClasse,
} from '../api';
import Keypad from '../components/Keypad';
import TimerRing from '../components/TimerRing';
import { ModeIcon, IconDefisPasses, IconCadenas, IconDocument, IconClassements } from '../components/Icons';
import { sauvegarderDefiEnCours, effacerDefiEnCours } from '../logic/defiStorage';

/**
 * Challenges — Mode Défis
 * 4 types jouables : Sprint, Sans faute, Contre-la-montre, Montée
 * + Défi de classe (à implémenter)
 *
 * Modèle à cases (28/08) : autant de cases que de chiffres dans la
 * réponse. Chrono par question (3s) sauf Sans faute.
 * Scoring : premier essai / rattrapé / jamais.
 */

const QUESTION_TIMER = 3; // secondes par question

const CHALLENGE_TYPES = [
    {
        id: 'sprint', emoji: '⚡', name: 'Sprint',
        desc: '20 questions — le plus rapide gagne !',
        color: '--coral', questions: 20, shareable: true,
    },
    {
        id: 'flawless', emoji: '🎯', name: 'Sans faute',
        desc: 'Zéro erreur — la première te stoppe',
        color: '--gold',
    },
    {
        id: 'countdown', emoji: '⏱', name: 'Contre-la-montre',
        desc: '2 minutes — max de bonnes réponses',
        color: '--sky', timer: 120, shareable: true,
    },
    {
        id: 'climb', emoji: '🧗', name: 'Montée des tables',
        desc: 'Palier par palier, de la table 2 à 20',
        color: '--purple',
    },
];

export default function Challenges({ onBack, identite, estProf, onPlafondChange, maitrise: maitriseProp, onGo, defiPreConfig, clearPreConfig }) {
    const [phase, setPhase] = useState('select');
    const [challengeType, setChallengeType] = useState(null);
    const [joinCode, setJoinCode] = useState('');
    const [selectedTables, setSelectedTables] = useState([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const [result, setResult] = useState(null);
    const [serverResult, setServerResult] = useState(null);
    // Défi partagé : info renvoyée par rejoindreDefi() ou creerDefi()
    const [defiInfo, setDefiInfo] = useState(null);
    // État d'envoi du résultat de défi : { etat: 'en_cours' | 'ok' | 'echec', message?, payload? }
    const [envoiDefi, setEnvoiDefi] = useState(null);
    // Classe pré-sélectionnée depuis MaClasse
    const [preSelectedClasse, setPreSelectedClasse] = useState(null);

    const plafond = identite?.profil?.plafond_tables || (estProf ? 20 : 10);

    // Pré-remplissage depuis MaClasse (config) ou reprise de défi (intro)
    useEffect(() => {
        if (defiPreConfig?.rejointDefi) {
            const d = defiPreConfig.rejointDefi;
            const type = CHALLENGE_TYPES.find(t => t.id === d.type) || CHALLENGE_TYPES[0];
            setDefiInfo(d);
            setChallengeType(type);
            setSelectedTables(d.tables || [2, 3, 4, 5]);
            setPhase('defi-intro');
            clearPreConfig?.();
        } else if (defiPreConfig) {
            const sprintType = CHALLENGE_TYPES.find(t => t.id === 'sprint') || CHALLENGE_TYPES[0];
            setChallengeType(sprintType);
            setSelectedTables(defiPreConfig.tables || [2, 3, 4, 5]);
            setPreSelectedClasse(defiPreConfig.classe || null);
            setPhase('config');
            clearPreConfig?.();
        }
    }, [defiPreConfig, clearPreConfig]);

    // --- Fin de partie SOLO ---
    const handleDone = useCallback((r) => {
        setResult(r);
        setServerResult(null);
        setPhase('results');

        const mode = challengeType?.id || 'sprint';
        const maitrise = construireMaitrise(r.resultats || []);
        const erreurs = construireErreurs(r.resultats || []);

        let tables = selectedTables;
        if (mode === 'climb') {
            const maxT = Math.max(2, r.highestTable || 2);
            tables = [];
            for (let i = 2; i <= maxT; i++) tables.push(i);
        }

        const session = {
            mode,
            tables,
            nbQuestions: r.answered || 0,
            score: r.score || 0,
            scorePremierEssai: r.scorePremierEssai ?? null,
            erreurs,
            dureeS: Math.round(r.time || 0),
            serieMax: r.maxStreak || 0,
            sansFauteMax: mode === 'flawless' ? (r.maxStreak || 0) : (r.maxStreak || 0),
            plusHauteTable: mode === 'climb' ? (r.highestTable || null) : null,
            maitrise,
        };

        const enregistrer = estProf ? enregistrerSessionProf : enregistrerSession;
        enregistrer(session).then(res => {
            if (res.ok) {
                setServerResult(res.data);
                const np = res.data?.plafond_tables;
                if (np && np !== plafond) onPlafondChange?.(np);
            } else {
                setServerResult({ erreur: res.error, enAttente: res.enAttente });
            }
        }).catch(() => {});
    }, [challengeType, selectedTables, estProf, plafond, onPlafondChange]);

    // --- Fin de partie DÉFI : terminerDefi() seul (pas enregistrerSession) ---
    const envoyerDefi = useCallback(async (payload) => {
        setEnvoiDefi({ etat: 'en_cours' });
        const res = await terminerDefi(payload);
        if (res.ok) {
            effacerDefiEnCours(identite?.profil?.id);
        }
        setEnvoiDefi(res.ok
            ? { etat: 'ok' }
            : { etat: 'echec', message: res.error, payload }
        );
    }, [identite]);

    const handleDoneDefi = useCallback((r) => {
        setResult(r);
        setPhase('defi-results');

        const maitrise = construireMaitrise(r.resultats || []);
        const payload = {
            defiId: defiInfo.defi_id,
            score: r.score || 0,
            tempsS: Math.round(r.time || 0),
            erreurs: (r.answered || 0) - (r.score || 0),
            maitrise,
            scorePremierEssai: r.scorePremierEssai ?? null,
        };
        envoyerDefi(payload);
    }, [defiInfo, envoyerDefi]);

    // --- Rejoindre un défi ---
    const handleJoin = useCallback(async (code) => {
        const res = await rejoindreDefi(code);
        if (!res.ok) return res; // { ok: false, raison, message }
        // Succès : on a les questions figées
        const d = res.data;
        const type = CHALLENGE_TYPES.find(t => t.id === d.type) || CHALLENGE_TYPES[0];
        setDefiInfo(d);
        setChallengeType(type);
        setSelectedTables(d.tables || [2,3,4,5]);
        // Sauvegarder dans localStorage pour reprise en cas de rechargement/fermeture
        sauvegarderDefiEnCours(identite?.profil?.id, {
            code: code.trim().toUpperCase(),
            defi_id: d.defi_id,
            type: d.type,
            classe: d.classe,
            auteur_nom: d.auteur_nom,
            rejoint_le: Date.now(),
        });
        // On passe par un écran d'annonce — l'élève doit savoir
        // de qui est le défi avant de jouer.
        setPhase('defi-intro');
        return res;
    }, [identite]);

    // --- Créer un défi ---
    const handleCreateDefi = useCallback(async (type, tables, classe) => {
        const res = await creerDefi({ type: type.id, tables, classe });
        if (!res.ok) return res;
        setDefiInfo({ defi_id: res.data.defi_id, code: res.data.code, type: type.id, tables });
        setChallengeType(type);
        setPhase('defi-code');
        return res;
    }, []);

    // --- PHASES ---

    if (phase === 'select') {
        return (
            <ChallengeSelect
                onBack={onBack}
                onSelect={(type) => { setChallengeType(type); setPhase('config'); }}
                joinCode={joinCode}
                setJoinCode={setJoinCode}
                onJoin={handleJoin}
                onViewDefi={(defiId) => {
                    setDefiInfo({ defi_id: defiId });
                    setPhase('defi-leaderboard');
                }}
                estProf={estProf}
                onGo={onGo}
            />
        );
    }

    if (phase === 'config') {
        return (
            <ChallengeConfig
                type={challengeType}
                tables={selectedTables}
                setTables={setSelectedTables}
                plafond={plafond}
                estProf={estProf}
                onBack={() => { setPreSelectedClasse(null); setPhase('select'); }}
                onStart={(tables) => {
                    if (tables) setSelectedTables(tables);
                    setPhase('play');
                }}
                onCreateDefi={handleCreateDefi}
                initialClasse={preSelectedClasse}
            />
        );
    }

    if (phase === 'play') {
        return (
            <ChallengePlay
                type={challengeType}
                tables={selectedTables}
                maitrise={maitriseProp}
                onQuit={() => setPhase('select')}
                onDone={handleDone}
            />
        );
    }

    if (phase === 'defi-intro') {
        return (
            <DefiIntro
                defiInfo={defiInfo}
                challengeType={challengeType}
                onStart={() => setPhase('defi-play')}
                onBack={() => setPhase('select')}
            />
        );
    }

    if (phase === 'defi-play') {
        return (
            <ChallengePlay
                type={challengeType}
                tables={selectedTables}
                maitrise={null}
                defiQuestions={defiInfo?.questions}
                defiDureeS={defiInfo?.duree_s}
                onQuit={() => setPhase('select')}
                onDone={handleDoneDefi}
            />
        );
    }

    if (phase === 'defi-code') {
        return (
            <DefiCodeScreen
                defiInfo={defiInfo}
                estProf={estProf}
                onStart={() => setPhase('defi-leaderboard')}
                onBack={() => setPhase('select')}
            />
        );
    }

    if (phase === 'defi-results' || phase === 'defi-leaderboard') {
        return (
            <DefiLeaderboard
                defiId={defiInfo?.defi_id}
                result={result}
                type={challengeType}
                estProf={estProf}
                envoiDefi={envoiDefi}
                onRetry={() => envoiDefi?.payload && envoyerDefi(envoiDefi.payload)}
                onHome={() => { setDefiInfo(null); setEnvoiDefi(null); setPhase('select'); }}
                onBack={onBack}
            />
        );
    }

    // phase === 'results' (solo)
    return (
        <ChallengeResults
            type={challengeType}
            result={result}
            serverResult={serverResult}
            ancienPlafond={plafond}
            onReplay={() => { setServerResult(null); setPhase('play'); }}
            onHome={() => setPhase('select')}
            onBack={onBack}
        />
    );
}

/* ===================== SELECT ===================== */

function ChallengeSelect({ onBack, onSelect, joinCode, setJoinCode, onJoin, onViewDefi, estProf, onGo }) {
    const [joinError, setJoinError] = useState(null);
    const [joinLoading, setJoinLoading] = useState(false);
    const [joinDefiId, setJoinDefiId] = useState(null); // for deja_joue → show leaderboard

    const handleJoin = async () => {
        if (joinCode.length < 5) return;
        setJoinError(null);
        setJoinLoading(true);
        try {
            const res = await onJoin(joinCode);
            if (!res.ok) {
                const raison = res.data?.raison || res.raison || 'inconnu';
                if (raison === 'deja_joue') {
                    setJoinDefiId(res.data?.defi_id || null);
                    setJoinError('Tu as déjà participé à ce défi.');
                } else if (raison === 'ferme') {
                    setJoinError('Ce défi est terminé.');
                } else {
                    setJoinError("Ce code n'existe pas. Vérifie les lettres.");
                }
            }
        } catch {
            setJoinError('Erreur réseau.');
        }
        setJoinLoading(false);
    };

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <h1 className="font-display" style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)' }}>
                    ⚔️ Défis
                </h1>
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                    Choisis ton type de défi
                </p>
            </div>

            {/* Rejoindre un défi */}
            <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                        type="text"
                        maxLength={5}
                        value={joinCode}
                        autoCapitalize="characters"
                        onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-HJ-KM-NP-Z2-9]/g, '').slice(0, 5))}
                        placeholder="CODE à 5 lettres"
                        style={{
                            flex: 1, padding: '12px 16px', borderRadius: 14,
                            border: '2px solid var(--border)', fontSize: 20,
                            fontFamily: 'var(--font-display)', textAlign: 'center',
                            letterSpacing: 6, textTransform: 'uppercase', outline: 'none',
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
                    />
                    <button
                        className="btn btn--gold"
                        disabled={joinCode.length < 5 || joinLoading}
                        style={{ padding: '12px 20px', fontSize: 16, whiteSpace: 'nowrap' }}
                        onClick={handleJoin}
                    >
                        {joinLoading ? '⏳' : 'Rejoindre'}
                    </button>
                </div>
                {joinError && (
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral)', marginTop: 8, textAlign: 'center' }}>
                        {joinError}
                        {joinDefiId && (
                            <button
                                className="btn btn--ghost"
                                style={{ fontSize: 12, marginLeft: 8, padding: '4px 10px' }}
                                onClick={() => onViewDefi?.(joinDefiId)}
                            >
                                Voir le classement
                            </button>
                        )}
                    </p>
                )}
                <div style={{ textAlign: 'center', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <button
                        className="btn btn--ghost"
                        style={{ fontSize: 13, padding: '4px 12px', color: 'var(--gris)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() => onGo?.('mes-defis')}
                    >
                        <IconDefisPasses size={16} color="var(--indigo)" actionColor="var(--ciel)" /> Mes défis passés
                    </button>
                </div>
            </div>

            {CHALLENGE_TYPES.map(type => (
                <button
                    key={type.id}
                    className="mode-card"
                    style={{
                        background: 'var(--surface)',
                        color: 'var(--indigo-encre)',
                        border: '2px solid var(--bordure)',
                        boxShadow: '0 8px 20px rgba(32,34,107,.08)',
                        marginTop: 10,
                    }}
                    onClick={() => onSelect(type)}
                >
                    <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ModeIcon mode={type.id} size={40} color="var(--indigo)" actionColor="var(--ciel)" />
                    </span>
                    <span>
                        <div className="mode-card__title" style={{ fontSize: 20, color: 'var(--indigo)' }}>
                            {type.name}
                            {type.shareable && (
                                <span style={{
                                    fontSize: 11, fontWeight: 700, background: 'var(--ciel-pale)', color: 'var(--indigo)',
                                    borderRadius: 8, padding: '2px 8px', marginLeft: 8, verticalAlign: 'middle',
                                }}>
                                    En défi
                                </span>
                            )}
                        </div>
                        <div className="mode-card__desc" style={{ color: 'var(--gris)' }}>{type.desc}</div>
                    </span>
                </button>
            ))}
        </div>
    );
}

/* ===================== CONFIG ===================== */

function ChallengeConfig({ type, tables, setTables, plafond, estProf, onBack, onStart, onCreateDefi, initialClasse }) {
    const isClimb = type.id === 'climb';
    const isShareable = type.shareable === true;
    const availableTables = ALL_TABLES.filter(t => t >= 2 && t <= Math.max(10, plafond));
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState(null);
    const [classes, setClasses] = useState([]);
    const [selectedClasse, setSelectedClasse] = useState(initialClasse || null);
    // Confirmation avant création quand des élèves sont hors plafond
    const [confirmInfo, setConfirmInfo] = useState(null);

    // Load classes for prof defi creation
    useEffect(() => {
        if (estProf && isShareable) {
            listeClasses().then(res => {
                if (res.ok && res.data) {
                    setClasses(res.data);
                    // Pré-sélection : initialClasse si fournie, sinon la première
                    if (!selectedClasse && res.data.length > 0) {
                        setSelectedClasse(res.data[0].classe);
                    }
                }
            });
        }
    }, [estProf, isShareable]);

    // Toute modification de tables ou de classe annule le consentement
    // précédent : le prof repasse par la vérification.
    useEffect(() => {
        setConfirmInfo(null);
    }, [tables, selectedClasse]);

    const toggle = (t) => {
        if (t > plafond) return;
        setTables(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
    };

    // Étape 1 : vérifier si des élèves sont hors plafond (prof uniquement)
    const handleCreate = async () => {
        if (tables.length === 0) return;
        setCreating(true);
        setCreateError(null);
        setConfirmInfo(null);

        // Pour un prof avec une classe, vérifier le plafond
        if (estProf && selectedClasse) {
            const apercu = await apercuDefiClasse(selectedClasse, tables);
            if (apercu.ok && apercu.data?.eleves_hors_plafond > 0) {
                setConfirmInfo(apercu.data);
                setCreating(false);
                return;
            }
        }

        // Pas de problème de plafond → créer directement
        await doCreate();
    };

    // Étape 2 : créer le défi (appelé directement ou après confirmation)
    const doCreate = async () => {
        setCreating(true);
        setConfirmInfo(null);
        const res = await onCreateDefi(type, tables, estProf ? selectedClasse : null);
        if (!res.ok) {
            setCreateError(res.error || res.data?.message || 'Impossible de créer le défi.');
            setCreating(false);
        }
    };

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Retour</button>

            <div className="card" style={{ textAlign: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 48 }}>{type.emoji}</span>
                <h2 className="font-display" style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>
                    {type.name}
                </h2>
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                    {type.desc}
                </p>
            </div>

            {!isClimb && (
                <div className="card" style={{ marginBottom: 14 }}>
                    <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>
                        Tables du défi
                    </h3>
                    <div className="chips">
                        {availableTables.map(t => {
                            const locked = t > plafond;
                            return (
                                <button
                                    key={t}
                                    className={`chip${tables.includes(t) ? ' chip--gold' : ''}`}
                                    style={{
                                        opacity: locked ? 0.4 : 1,
                                        cursor: locked ? 'not-allowed' : 'pointer'
                                    }}
                                    onClick={() => toggle(t)}
                                    title={locked ? 'Débloque en Montée des tables' : ''}
                                >
                                    {locked ? `🔒 ${t}` : t}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconDocument size={18} color="var(--indigo)" /> Règles
                </h3>
                {type.id === 'sprint' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>20 questions, 3s par question</li>
                        <li>1er essai = 1 pt, rattrapé = ½ pt</li>
                        <li>Le plus rapide gagne — chaque erreur ajoute 3 secondes</li>
                    </ul>
                )}
                {type.id === 'flawless' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>Questions en flux continu</li>
                        <li>La première erreur t'arrête !</li>
                        <li>Pas de chrono par question</li>
                    </ul>
                )}
                {type.id === 'countdown' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>2 minutes chrono, 3s par question</li>
                        <li>1er essai = 1 pt, rattrapé = ½ pt</li>
                        <li>Maximum de points !</li>
                    </ul>
                )}
                {type.id === 'climb' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>Commence à la table 2, 3s par question</li>
                        <li>5 questions par palier, ≥4 justes pour passer</li>
                        <li>Débloque les tables supérieures !</li>
                    </ul>
                )}
            </div>

            {/* Classe selector for prof defi creation */}
            {estProf && isShareable && classes.length > 0 && (
                <div className="card" style={{ marginBottom: 14 }}>
                    <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                        Classe du défi
                    </h3>
                    <div className="chips">
                        {classes.map(c => (
                            <button
                                key={c.classe}
                                className={`chip${selectedClasse === c.classe ? ' chip--navy' : ''}`}
                                onClick={() => setSelectedClasse(c.classe)}
                            >
                                {c.classe}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <button
                className="btn btn--gold"
                style={{ width: '100%', fontSize: 22, padding: 16 }}
                disabled={!isClimb && tables.length === 0}
                onClick={() => onStart(tables)}
            >
                Jouer seul ⚔️
            </button>

            {isShareable && (
                <>
                    {/* Message de confirmation si des élèves sont hors plafond */}
                    {confirmInfo && (
                        <div className="card" style={{
                            marginTop: 10, padding: '16px 20px',
                            border: '2px solid var(--sun)',
                            background: 'rgba(201,162,39,0.08)',
                        }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>
                                ⚠️ La table {confirmInfo.table_max} dépasse le niveau atteint par {confirmInfo.eleves_hors_plafond} élève{confirmInfo.eleves_hors_plafond > 1 ? 's' : ''} sur {confirmInfo.eleves_classe}.
                            </p>
                            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)', marginBottom: 12, lineHeight: 1.5 }}>
                                {confirmInfo.plafond_commun ? `Le plus faible de la classe s'arrête à la table ${confirmInfo.plafond_commun}. ` : ''}Le défi reste jouable par tous et leur score sera enregistré — ils découvriront simplement une table qu'ils n'ont pas encore débloquée par la Montée des tables.
                            </p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    className="btn btn--gold"
                                    style={{ flex: 1, fontSize: 14, padding: 12 }}
                                    onClick={doCreate}
                                    disabled={creating}
                                >
                                    {creating ? '⏳ Création…' : 'Lancer quand même'}
                                </button>
                                <button
                                    className="btn btn--ghost"
                                    style={{ flex: 1, fontSize: 14, padding: 12 }}
                                    onClick={() => setConfirmInfo(null)}
                                >
                                    Annuler
                                </button>
                            </div>
                        </div>
                    )}

                    {!confirmInfo && (
                        <button
                            className="btn btn--navy"
                            style={{ width: '100%', fontSize: 18, padding: 14, marginTop: 10 }}
                            disabled={tables.length === 0 || creating}
                            onClick={handleCreate}
                        >
                            {creating ? '⏳ Création…' : '👥 Créer un défi'}
                        </button>
                    )}
                    {createError && (
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral)', marginTop: 8, textAlign: 'center' }}>
                            {createError}
                        </p>
                    )}
                </>
            )}
        </div>
    );
}

/* ===================== PLAY ===================== */

function ChallengePlay({ type, tables, maitrise, defiQuestions, defiDureeS, onQuit, onDone }) {
    const activeTables = tables && tables.length > 0 ? tables : [2, 3, 4, 5, 6, 7, 8, 9, 10];

    if (type.id === 'sprint') return <SprintPlay tables={activeTables} maitrise={maitrise} defiQuestions={defiQuestions} onQuit={onQuit} onDone={onDone} />;
    if (type.id === 'flawless') return <FlawlessPlay tables={activeTables} maitrise={maitrise} onQuit={onQuit} onDone={onDone} />;
    if (type.id === 'countdown') return <CountdownPlay tables={activeTables} maitrise={maitrise} defiQuestions={defiQuestions} defiDureeS={defiDureeS} onQuit={onQuit} onDone={onDone} />;
    if (type.id === 'climb') return <ClimbPlay onQuit={onQuit} onDone={onDone} />;
    return <SprintPlay tables={activeTables} maitrise={maitrise} defiQuestions={defiQuestions} onQuit={onQuit} onDone={onDone} />;
}

/* ================================================================
 * Shared hook for digit-box quiz logic with per-question timer.
 *
 * Returns everything needed to render a quiz with digit boxes,
 * a question timer bar, and first-attempt scoring.
 * ================================================================ */

function useQuizEngine({ tables, maitrise, hasQuestionTimer, defiQuestions }) {
    // En mode défi, les questions sont figées — pas de buildWeights, pas de newQuestion
    const isDefi = Array.isArray(defiQuestions) && defiQuestions.length > 0;
    const weights = useMemo(() => isDefi ? null : buildWeights(tables, maitrise || {}), [tables, maitrise, isDefi]);
    const defiIndex = useRef(0);

    const makeDefiQ = (idx) => {
        const dq = defiQuestions[idx] || defiQuestions[0];
        return { a: dq.a, b: dq.b, answer: dq.a * dq.b };
    };

    const [q, setQ] = useState(() => isDefi ? makeDefiQ(0) : newQuestion(tables, null, weights));
    const [digits, setDigits] = useState(() => Array(String(q.answer).length).fill(''));
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const [premierEssai, setPremierEssai] = useState(true);
    const [qTimerActive, setQTimerActive] = useState(false);
    const [qTimerExpired, setQTimerExpired] = useState(false);
    const lockRef = useRef(false);
    const resultatsRef = useRef([]);
    const qTimerRef = useRef(null);

    // ── Compteurs : refs pour la logique, état pour l'affichage ──
    // Une closure capturée par un setTimeout lit l'état du rendu
    // précédent : à la dernière question, le score partirait
    // amputé d'une unité. Les refs sont la seule source de vérité
    // que onDone doit lire.
    const scoreRef = useRef(0);
    const premierRef = useRef(0);
    const answeredRef = useRef(0);
    const maxStreakRef = useRef(0);
    const streakRef = useRef(0);
    const [score, setScore] = useState(0);
    const [scorePremierEssai, setScorePremierEssai] = useState(0);
    const [answered, setAnswered] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);

    const numDigits = String(q.answer).length;

    // Question timer (3s from first keypress)
    useEffect(() => {
        if (!hasQuestionTimer || !qTimerActive || qTimerExpired) return;
        qTimerRef.current = setTimeout(() => {
            setQTimerExpired(true);
        }, QUESTION_TIMER * 1000);
        return () => clearTimeout(qTimerRef.current);
    }, [hasQuestionTimer, qTimerActive, qTimerExpired]);

    const resetQuestion = useCallback((newQ) => {
        lockRef.current = false;
        setFb('idle'); setWord('');
        setPremierEssai(true);
        setQTimerActive(false); setQTimerExpired(false);
        clearTimeout(qTimerRef.current);
        setQ(newQ);
        setDigits(Array(String(newQ.answer).length).fill(''));
    }, []);

    /** Enregistre le résultat d'une question. Met à jour refs ET état.
     *  Retourne les valeurs à jour (post-incrément) pour la logique appelante. */
    const recordResult = useCallback((result) => {
        resultatsRef.current.push({ a: q.a, b: q.b, result });
        answeredRef.current += 1;
        setAnswered(a => a + 1);

        if (result === 'premier') {
            scoreRef.current += 1;
            premierRef.current += 1;
            setScore(s => s + 1);
            setScorePremierEssai(s => s + 1);
            streakRef.current += 1;
            if (streakRef.current > maxStreakRef.current) maxStreakRef.current = streakRef.current;
            setStreak(streakRef.current);
            setMaxStreak(maxStreakRef.current);
        } else if (result === 'rattrape') {
            scoreRef.current += 1;
            setScore(s => s + 1);
            streakRef.current = 0;
            setStreak(0);
        } else {
            streakRef.current = 0;
            setStreak(0);
        }

        return {
            answered: answeredRef.current,
            score: scoreRef.current,
            premier: premierRef.current,
            maxStreak: maxStreakRef.current,
        };
    }, [q]);

    const press = useCallback((d) => {
        if (lockRef.current || fb !== 'idle') return;
        setDigits(prev => {
            const idx = prev.findIndex(x => x === '');
            if (idx === -1) return prev;
            if (idx === 0 && prev.every(x => x === '') && hasQuestionTimer) {
                setQTimerActive(true);
            }
            const next = [...prev];
            next[idx] = d;
            return next;
        });
    }, [fb, hasQuestionTimer]);

    const del = useCallback(() => {
        if (lockRef.current || fb !== 'idle') return;
        setDigits(prev => {
            let idx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i] !== '') { idx = i; break; }
            }
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = '';
            return next;
        });
    }, [fb]);

    // Keyboard handler
    const onKeyRef = useRef();
    onKeyRef.current = (e) => {
        if (e.key >= '0' && e.key <= '9') press(e.key);
        else if (e.key === 'Backspace') del();
    };
    useEffect(() => {
        const handler = (e) => onKeyRef.current?.(e);
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    /** Avance à la question suivante dans la liste figée du défi.
     *  Renvoie false si la liste est épuisée. */
    const nextDefiQuestion = useCallback(() => {
        if (!isDefi) return true;
        defiIndex.current += 1;
        if (defiIndex.current >= defiQuestions.length) return false; // exhausted
        resetQuestion(makeDefiQ(defiIndex.current));
        return true;
    }, [isDefi, defiQuestions, resetQuestion]);

    return {
        q, digits, setDigits, fb, setFb, word, setWord,
        premierEssai, setPremierEssai,
        score, scorePremierEssai, answered, streak, maxStreak,
        scoreRef, premierRef, answeredRef, maxStreakRef,
        qTimerActive, qTimerExpired, setQTimerExpired, setQTimerActive,
        lockRef, resultatsRef, numDigits, weights,
        resetQuestion, recordResult, press, del,
        qTimerRef,
        isDefi, nextDefiQuestion,
    };
}

// Render digit boxes inline (used by all play modes)
function renderDigitBoxes(digits, fb, numDigits) {
    const activeIndex = digits.findIndex(d => d === '');
    return (
        <div className="digit-boxes">
            {digits.map((d, i) => (
                <div
                    key={i}
                    className={[
                        'digit-box',
                        i === activeIndex && fb === 'idle' ? 'digit-box--active' : '',
                        fb === 'correct' ? 'digit-box--correct' : '',
                        fb === 'wrong' ? 'digit-box--wrong' : '',
                        fb === 'reveal' ? 'digit-box--reveal' : '',
                    ].filter(Boolean).join(' ')}
                >
                    {d || (i === activeIndex && fb === 'idle' ? <span className="caret" /> : '')}
                </div>
            ))}
        </div>
    );
}

// Render question timer bar
function renderQuestionTimer(active, expired) {
    if (!active && !expired) return null;
    return (
        <div className="question-timer" style={{ marginTop: 8 }}>
            <i
                className={`question-timer__fill${expired ? ' question-timer__fill--warn' : ''}`}
                style={{
                    width: expired ? '0%' : (active ? '0%' : '100%'),
                    transition: active && !expired ? `width ${QUESTION_TIMER}s linear` : 'none',
                }}
                ref={(el) => {
                    // Force reflow to trigger transition
                    if (el && active && !expired) {
                        el.style.width = '100%';
                        el.getBoundingClientRect();
                        el.style.width = '0%';
                    }
                }}
            />
        </div>
    );
}
/* --- Sprint : 20 questions, 3s/question --- */
function SprintPlay({ tables, maitrise, defiQuestions, onQuit, onDone }) {
    const total = defiQuestions?.length || 20;
    const engine = useQuizEngine({ tables, maitrise, hasQuestionTimer: true, defiQuestions });
    const { q, digits, setDigits, fb, setFb, word, setWord, premierEssai, setPremierEssai,
        qTimerActive, qTimerExpired, lockRef, resultatsRef, numDigits, weights,
        score, answered,
        scoreRef, premierRef, answeredRef, maxStreakRef,
        resetQuestion, recordResult, press, del,
        isDefi, nextDefiQuestion } = engine;

    const startRef = useRef(Date.now());

    const advanceOrDone = useCallback(() => {
        if (answeredRef.current >= total) {
            onDone({
                answered: total,
                score: scoreRef.current,
                scorePremierEssai: premierRef.current,
                maxStreak: maxStreakRef.current,
                resultats: resultatsRef.current,
                time: (Date.now() - startRef.current) / 1000,
            });
        } else if (isDefi) {
            nextDefiQuestion();
        } else {
            resetQuestion(newQuestion(tables, q, weights));
        }
    }, [tables, q, weights, onDone, resetQuestion, isDefi, nextDefiQuestion, total]);

    // Handle question timer expiry → show answer then advance
    useEffect(() => {
        if (!qTimerExpired || lockRef.current) return;
        lockRef.current = true;
        setFb('reveal');
        setDigits(String(q.answer).split(''));
        setWord(`${q.a} × ${q.b} = ${q.answer}`);
        recordResult('jamais');
        const id = setTimeout(advanceOrDone, 800);
        return () => clearTimeout(id);
    }, [qTimerExpired]);

    // Handle digit completion
    useEffect(() => {
        if (fb !== 'idle' || lockRef.current) return;
        const allFilled = digits.every(d => d !== '') && digits.length === numDigits;
        if (!allFilled) return;

        const value = parseInt(digits.join(''), 10);
        const ok = value === q.answer;

        if (ok) {
            lockRef.current = true;
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            recordResult(premierEssai ? 'premier' : 'rattrape');
            setTimeout(advanceOrDone, 180);
        } else {
            setPremierEssai(false);
            setFb('wrong');
            setTimeout(() => {
                setFb('idle'); setWord('');
                setDigits(Array(numDigits).fill(''));
            }, 200);
        }
    }, [digits]);

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ModeIcon mode="sprint" size={18} /> {isDefi ? 'Défi' : 'Sprint'}
                </span>
                <span className="pill">{answered}/{total}</span>
                <span className="pill">⭐ {score}</span>
            </div>
            <div className="progress-bar" style={{ marginBottom: 16 }}>
                <i className="progress-bar__fill" style={{ width: `${(answered / total) * 100}%` }} />
            </div>
            <div className={`card card--question${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>
                {renderDigitBoxes(digits, fb, numDigits)}
                {renderQuestionTimer(qTimerActive, qTimerExpired)}
                <div className="feedback-word" style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}>
                    {word}
                </div>
            </div>
            <Keypad onPress={press} onDelete={del} />
        </div>
    );
}

/* --- Sans faute : première erreur → fin, pas de chrono question --- */
function FlawlessPlay({ tables, maitrise, onQuit, onDone }) {
    const engine = useQuizEngine({ tables, maitrise, hasQuestionTimer: false });
    const { q, digits, setDigits, fb, setFb, word, setWord,
        lockRef, resultatsRef, numDigits, weights,
        streak, scoreRef, premierRef, answeredRef, maxStreakRef,
        resetQuestion, recordResult, press, del } = engine;

    const startRef = useRef(Date.now());

    // Handle digit completion — Sans faute : first complete answer decides
    useEffect(() => {
        if (fb !== 'idle' || lockRef.current) return;
        const allFilled = digits.every(d => d !== '') && digits.length === numDigits;
        if (!allFilled) return;

        const value = parseInt(digits.join(''), 10);
        const ok = value === q.answer;

        if (ok) {
            lockRef.current = true;
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            recordResult('premier');
            setTimeout(() => {
                resetQuestion(newQuestion(tables, q, weights));
            }, 180);
        } else {
            // Game over
            lockRef.current = true;
            setFb('wrong');
            setWord(`${q.a} × ${q.b} = ${q.answer}`);
            recordResult('jamais');
            setTimeout(() => {
                const s = scoreRef.current; // = nombre de bonnes avant l'erreur
                onDone({
                    streak: s, score: s, scorePremierEssai: s,
                    answered: answeredRef.current,
                    maxStreak: maxStreakRef.current,
                    time: (Date.now() - startRef.current) / 1000,
                    lastQuestion: `${q.a}×${q.b}`,
                    resultats: resultatsRef.current,
                });
            }, 1200);
        }
    }, [digits]);

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <span className="pill" style={{
                    background: 'var(--orange)',
                    color: 'var(--action-texte)', fontSize: 20, padding: '8px 28px',
                }}>
                    🔥 {streak}
                </span>
            </div>
            <div className={`card card--question${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>
                {renderDigitBoxes(digits, fb, numDigits)}
                <div className="feedback-word" style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}>
                    {word}
                </div>
            </div>
            <Keypad onPress={press} onDelete={del} />
        </div>
    );
}

/* --- Contre-la-montre : 2 min, 3s/question --- */
function CountdownPlay({ tables, maitrise, defiQuestions, defiDureeS, onQuit, onDone }) {
    const duration = defiDureeS || 120;
    const engine = useQuizEngine({ tables, maitrise, hasQuestionTimer: true, defiQuestions });
    const { q, digits, setDigits, fb, setFb, word, setWord, premierEssai, setPremierEssai,
        qTimerActive, qTimerExpired, lockRef, resultatsRef, numDigits, weights,
        score,
        scoreRef, premierRef, answeredRef, maxStreakRef,
        resetQuestion, recordResult, press, del,
        isDefi, nextDefiQuestion } = engine;

    const [remaining, setRemaining] = useState(duration);
    const timedOut = useRef(false);

    const finishGame = useCallback(() => {
        if (timedOut.current) return;
        timedOut.current = true;
        onDone({
            score: scoreRef.current,
            scorePremierEssai: premierRef.current,
            answered: answeredRef.current,
            maxStreak: maxStreakRef.current,
            time: duration, resultats: resultatsRef.current,
        });
    }, [onDone, duration]);

    // Global countdown
    useEffect(() => {
        const id = setInterval(() => {
            setRemaining(r => {
                if (r <= 1) {
                    clearInterval(id);
                    setTimeout(finishGame, 0);
                    return 0;
                }
                return r - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [finishGame]);

    const advanceQuestion = useCallback(() => {
        if (timedOut.current) return;
        if (isDefi) {
            const hasMore = nextDefiQuestion();
            if (!hasMore) finishGame(); // 120 questions épuisées
        } else {
            resetQuestion(newQuestion(tables, q, weights));
        }
    }, [tables, q, weights, resetQuestion, isDefi, nextDefiQuestion, finishGame]);

    // Question timer expiry
    useEffect(() => {
        if (!qTimerExpired || lockRef.current || timedOut.current) return;
        lockRef.current = true;
        setFb('reveal');
        setDigits(String(q.answer).split(''));
        setWord(`${q.a} × ${q.b} = ${q.answer}`);
        recordResult('jamais');
        const id = setTimeout(advanceQuestion, 800);
        return () => clearTimeout(id);
    }, [qTimerExpired]);

    // Digit completion
    useEffect(() => {
        if (fb !== 'idle' || lockRef.current || timedOut.current) return;
        const allFilled = digits.every(d => d !== '') && digits.length === numDigits;
        if (!allFilled) return;

        const value = parseInt(digits.join(''), 10);
        const ok = value === q.answer;

        if (ok) {
            lockRef.current = true;
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            recordResult(premierEssai ? 'premier' : 'rattrape');
            setTimeout(advanceQuestion, 180);
        } else {
            setPremierEssai(false);
            setFb('wrong');
            setTimeout(() => {
                setFb('idle'); setWord('');
                setDigits(Array(numDigits).fill(''));
            }, 200);
        }
    }, [digits]);

    const timerWarn = remaining <= 10;

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="pill">{isDefi ? '⚔️ Défi' : '⭐'} {score}</span>
                <TimerRing seconds={remaining} total={duration} warn={timerWarn} />
            </div>
            <div className="progress-bar" style={{ marginBottom: 16 }}>
                <i
                    className={`progress-bar__fill${timerWarn ? ' progress-bar__fill--warn' : ''}`}
                    style={{ width: `${(remaining / duration) * 100}%`, transition: 'width 1s linear' }}
                />
            </div>
            <div className={`card card--question${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>
                {renderDigitBoxes(digits, fb, numDigits)}
                {renderQuestionTimer(qTimerActive, qTimerExpired)}
                <div className="feedback-word" style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}>
                    {word}
                </div>
            </div>
            <Keypad onPress={press} onDelete={del} />
        </div>
    );
}

/* --- Montée des tables : palier par palier, 3s/question --- */
function ClimbPlay({ onQuit, onDone }) {
    const [currentTable, setCurrentTable] = useState(2);
    const [questionsInLevel, setQuestionsInLevel] = useState(0);
    const [correctInLevel, setCorrectInLevel] = useState(0);
    const [levelMsg, setLevelMsg] = useState('');

    const engine = useQuizEngine({ tables: [currentTable], maitrise: {}, hasQuestionTimer: true });
    const { q, digits, setDigits, fb, setFb, word, setWord, premierEssai, setPremierEssai,
        qTimerActive, qTimerExpired, lockRef, resultatsRef, numDigits,
        scoreRef, premierRef, answeredRef, maxStreakRef,
        resetQuestion, recordResult, press, del } = engine;

    const startRef = useRef(Date.now());

    const handleLevelEnd = useCallback((nextQ, nextCorrect) => {
        if (nextQ >= 5) {
            if (nextCorrect >= 4) {
                const nextTable = currentTable + 1;
                if (nextTable > 20) {
                    onDone({
                        highestTable: 20,
                        score: scoreRef.current,
                        scorePremierEssai: premierRef.current,
                        answered: answeredRef.current,
                        maxStreak: maxStreakRef.current,
                        time: (Date.now() - startRef.current) / 1000,
                        perfect: true, resultats: resultatsRef.current,
                    });
                } else {
                    setCurrentTable(nextTable);
                    setQuestionsInLevel(0); setCorrectInLevel(0);
                    setLevelMsg(`Table ${nextTable} !`);
                    setTimeout(() => setLevelMsg(''), 1500);
                    resetQuestion(newQuestion([nextTable], null, null));
                }
            } else {
                onDone({
                    highestTable: currentTable - 1,
                    score: scoreRef.current,
                    scorePremierEssai: premierRef.current,
                    answered: answeredRef.current,
                    maxStreak: maxStreakRef.current,
                    time: (Date.now() - startRef.current) / 1000,
                    perfect: false, resultats: resultatsRef.current,
                });
            }
            return true;
        }
        return false;
    }, [currentTable, onDone, resetQuestion]);

    const recordAndAdvance = useCallback((result) => {
        recordResult(result); // refs updated synchronously
        const nextQ = questionsInLevel + 1;
        const nextCorrect = correctInLevel + (result !== 'jamais' ? 1 : 0);
        setQuestionsInLevel(nextQ);
        setCorrectInLevel(nextCorrect);

        const delay = result === 'premier' ? 180 : 800;
        setTimeout(() => {
            if (!handleLevelEnd(nextQ, nextCorrect)) {
                resetQuestion(newQuestion([currentTable], q, null));
            }
        }, delay);
    }, [q, questionsInLevel, correctInLevel, currentTable, handleLevelEnd, resetQuestion, recordResult]);

    // Question timer expiry
    useEffect(() => {
        if (!qTimerExpired || lockRef.current) return;
        lockRef.current = true;
        setFb('reveal');
        setDigits(String(q.answer).split(''));
        setWord(`${q.a} × ${q.b} = ${q.answer}`);
        recordAndAdvance('jamais');
    }, [qTimerExpired]);

    // Digit completion
    useEffect(() => {
        if (fb !== 'idle' || lockRef.current) return;
        const allFilled = digits.every(d => d !== '') && digits.length === numDigits;
        if (!allFilled) return;

        const value = parseInt(digits.join(''), 10);
        const ok = value === q.answer;

        if (ok) {
            lockRef.current = true;
            setFb('correct');
            setWord('✓');
            recordAndAdvance(premierEssai ? 'premier' : 'rattrape');
        } else {
            setPremierEssai(false);
            setFb('wrong');
            setTimeout(() => {
                setFb('idle'); setWord('');
                setDigits(Array(numDigits).fill(''));
            }, 200);
        }
    }, [digits]);

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="pill" style={{ background: 'var(--indigo-doux)', color: 'var(--action-texte)' }}>
                    Table {currentTable}
                </span>
                <span className="pill">{questionsInLevel}/5</span>
                <span className="pill" style={{ color: 'var(--succes)' }}>{correctInLevel} justes</span>
            </div>

            <div style={{ display: 'flex', gap: 3, marginBottom: 16 }}>
                {ALL_TABLES.slice(1).map(t => (
                    <div key={t} style={{
                        flex: 1, height: 8, borderRadius: 4,
                        background: t < currentTable ? 'var(--mint)' : t === currentTable ? 'var(--gold)' : 'var(--border)',
                        transition: 'background 0.3s',
                    }} />
                ))}
            </div>

            {levelMsg && (
                <div className="font-display anim-pop" style={{
                    textAlign: 'center', fontSize: 24, fontWeight: 800, color: 'var(--gold)',
                    marginBottom: 12
                }}>
                    {levelMsg}
                </div>
            )}

            <div className={`card card--question${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>
                {renderDigitBoxes(digits, fb, numDigits)}
                {renderQuestionTimer(qTimerActive, qTimerExpired)}
                <div className="feedback-word" style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}>
                    {word}
                </div>
            </div>
            <Keypad onPress={press} onDelete={del} />
        </div>
    );
}

/* ===================== RESULTS ===================== */

function ChallengeResults({ type, result, serverResult, ancienPlafond, onReplay, onHome, onBack }) {
    const badges = serverResult?.nouveaux_badges || [];
    const enAttente = serverResult?.enAttente;
    const nouveauPlafond = serverResult?.plafond_tables || null;

    const isSuccess = useMemo(() => {
        if (!result) return false;
        if (type.id === 'sprint') return (result.scorePremierEssai || 0) >= 16;
        if (type.id === 'flawless') return (result.streak || 0) >= 10;
        if (type.id === 'countdown') return (result.score || 0) >= 15;
        if (type.id === 'climb') return (result.highestTable || 0) >= 10 || result.perfect;
        return false;
    }, [type.id, result]);

    useEffect(() => {
        if (isSuccess) {
            import('canvas-confetti').then(mod => {
                const style = getComputedStyle(document.documentElement);
                const colors = ['--mosaique-1', '--mosaique-2', '--mosaique-3', '--mosaique-4', '--mosaique-5']
                    .map(v => style.getPropertyValue(v).trim())
                    .filter(Boolean);
                mod.default({
                    particleCount: 100, spread: 70, origin: { y: 0.6 },
                    colors: colors.length ? colors : undefined,
                });
            }).catch(() => { });
        }
    }, [isSuccess]);

    const targetScore = result ? (result.scorePremierEssai ?? result.score ?? 0) : 0;
    const [countScore, setCountScore] = useState(0);
    useEffect(() => {
        if (targetScore <= 0) return;
        let cur = 0;
        const step = Math.max(16, Math.floor(600 / targetScore));
        const id = setInterval(() => {
            cur += 1;
            setCountScore(cur);
            if (cur >= targetScore) clearInterval(id);
        }, step);
        return () => clearInterval(id);
    }, [targetScore]);

    if (!result) return null;

    const rattrapees = (result.score || 0) - (result.scorePremierEssai || 0);

    return (
        <div className="screen-enter">
            <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 64, marginBottom: 8 }}>
                    {isSuccess ? '🏆' : '💪'}
                </div>

                <h2 className="font-display" style={{ fontSize: 26, fontWeight: 800 }}>
                    {type.id === 'sprint' && `Sprint terminé !`}
                    {type.id === 'flawless' && `Série de ${result.streak || result.maxStreak} !`}
                    {type.id === 'countdown' && `${result.score} points !`}
                    {type.id === 'climb' && (result.perfect ? 'Toutes les tables maîtrisées ! 🎉' : `Table ${result.highestTable} atteinte !`)}
                </h2>

                {/* Deux chiffres — premier coup + rattrapées */}
                <div style={{
                    background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)',
                    padding: '16px 12px', margin: '14px 0',
                }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--mint-dk)' }}>
                        {countScore} / {result.answered}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-soft)' }}>
                        du premier coup
                    </div>
                    {rattrapees > 0 && (
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sun)', marginTop: 4 }}>
                            +{rattrapees} rattrapée{rattrapees > 1 ? 's' : ''} au 2ᵉ essai
                        </div>
                    )}
                </div>

                <div className="stat-grid" style={{ marginTop: 16 }}>
                    {type.id === 'sprint' && (
                        <div className="stat">
                            <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>{result.time?.toFixed(1)}s</span>
                            <span className="stat__label">Temps total</span>
                        </div>
                    )}
                    {type.id === 'flawless' && (
                        <>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--gold)' }}>🔥 {result.streak || result.maxStreak}</span>
                                <span className="stat__label">Sans faute</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--coral)' }}>{result.lastQuestion}</span>
                                <span className="stat__label">Stoppé par</span>
                            </div>
                        </>
                    )}
                    {type.id === 'countdown' && (
                        <div className="stat">
                            <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>{result.answered}</span>
                            <span className="stat__label">Questions</span>
                        </div>
                    )}
                    {type.id === 'climb' && (
                        <div className="stat">
                            <span className="stat__value" style={{ color: 'var(--purple)' }}>🧗 {result.highestTable}</span>
                            <span className="stat__label">Plus haute table</span>
                        </div>
                    )}
                </div>

                {badges.length > 0 && (
                    <div style={{
                        textAlign: 'center', background: 'var(--orange-pale)',
                        borderRadius: 'var(--r-touche)', padding: 16, marginTop: 16, marginBottom: 16,
                        border: '2px solid var(--orange)',
                    }}>
                        <p className="font-display" style={{ fontWeight: 800, marginBottom: 8, color: 'var(--orange)' }}>
                            🏅 Nouveau{badges.length > 1 ? 'x' : ''} badge{badges.length > 1 ? 's' : ''} !
                        </p>
                        {badges.map((b, i) => (
                            <div key={i} className="anim-pop" style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                                {b.emoji || '🏅'} {b.nom || b}
                            </div>
                        ))}
                    </div>
                )}

                {type.id === 'climb' && nouveauPlafond && ancienPlafond && nouveauPlafond > ancienPlafond && (
                    <div className="anim-pop" style={{
                        textAlign: 'center', background: 'var(--vert-pale)',
                        borderRadius: 'var(--r-touche)', padding: 16, marginTop: 16, marginBottom: 16,
                        border: '2px solid var(--vert)',
                    }}>
                        <p className="font-display" style={{ fontWeight: 800, fontSize: 20, color: 'var(--succes)' }}>
                            Table {nouveauPlafond} débloquée !
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 600, marginTop: 4 }}>
                            Tu peux maintenant t'entraîner sur la table {nouveauPlafond} en mode libre.
                        </p>
                    </div>
                )}

                {enAttente && (
                    <p style={{
                        fontSize: 13, color: 'var(--text-soft)', fontWeight: 600,
                        textAlign: 'center', marginTop: 14, marginBottom: 14,
                    }}>
                        Résultat en attente d'envoi — il partira dès que le réseau sera de retour.
                    </p>
                )}

                <button className="btn btn--gold" style={{ width: '100%', marginTop: 16, marginBottom: 10 }} onClick={onReplay}>
                    Relancer
                </button>
                <button className="btn btn--ghost" style={{ width: '100%', marginBottom: 10 }} onClick={onHome}>
                    Autres défis
                </button>
                <button className="btn-back" onClick={onBack}>‹ Accueil</button>
            </div>
        </div>
    );
}

/* ===================== DEFI CODE SCREEN ===================== */

function DefiCodeScreen({ defiInfo, estProf, onStart, onBack }) {
    const [avancement, setAvancement] = useState(null);

    // Compteur de participants en temps réel
    useEffect(() => {
        if (!defiInfo?.defi_id) return;

        // Charger une première fois
        avancementDefi(defiInfo.defi_id).then(res => {
            if (res.ok) setAvancement(res.data);
        });

        // S'abonner aux changements
        const unsub = suivreDefi(defiInfo.defi_id, () => {
            avancementDefi(defiInfo.defi_id).then(res => {
                if (res.ok) setAvancement(res.data);
            });
        });

        return unsub;
    }, [defiInfo?.defi_id]);

    const nbParticipants = avancement?.termines || 0;

    return (
        <div className="screen-enter" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: '70vh', textAlign: 'center',
        }}>
            <button className="btn-back" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
                ‹ Retour
            </button>

            <div style={{
                background: 'var(--indigo)',
                borderRadius: 24, padding: estProf ? '48px 32px' : '32px 24px',
                width: '100%', maxWidth: 500, marginTop: 24,
            }}>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: estProf ? 20 : 16, marginBottom: 12 }}>
                    {estProf ? 'Saisissez ce code dans Défis' : 'Donne ce code à tes copains'}
                </p>

                <div className="font-display" style={{
                    fontSize: estProf ? 80 : 56, fontWeight: 900, color: 'var(--gold)',
                    letterSpacing: 12, userSelect: 'all',
                }}>
                    {defiInfo?.code || '?????'}
                </div>

                <div style={{
                    marginTop: 20, padding: '12px 0',
                    borderTop: '1px solid rgba(255,255,255,0.15)',
                }}>
                    <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--action-texte)' }}>
                        {nbParticipants}
                    </span>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: 14, marginTop: 4 }}>
                        participant{nbParticipants !== 1 ? 's' : ''} {nbParticipants > 0 ? '' : 'pour le moment'}
                    </p>
                </div>
            </div>

            <button
                className="btn btn--gold"
                style={{ width: '100%', maxWidth: 500, fontSize: 20, padding: 16, marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onClick={onStart}
            >
                <IconClassements size={20} color="var(--indigo)" /> Voir le classement
            </button>

            <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginTop: 12 }}>
                {estProf ? 'Le défi expire dans 7 jours.' : 'Le défi expire dans 24 heures.'}
            </p>
        </div>
    );
}

/* ===================== DEFI INTRO ===================== */
/* Écran d'annonce : qui a créé ce défi ? Un élève n'aborde pas un
   travail prescrit comme un jeu entre copains — c'est le seul moment
   où on peut le lui dire. */

function DefiIntro({ defiInfo, challengeType, onStart, onBack }) {
    const origine = defiInfo?.origine || null;
    const auteurNom = defiInfo?.auteur_nom || null;
    const classeDefi = defiInfo?.classe || null;
    const typeLabel = challengeType?.name || defiInfo?.type || '';
    const typeEmoji = challengeType?.emoji || '⚔️';

    return (
        <div className="screen-enter" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: '70vh', textAlign: 'center',
            padding: '0 24px',
        }}>
            <div style={{
                background: origine === 'prof'
                    ? 'var(--action)'
                    : 'var(--orange)',
                borderRadius: 24, padding: '40px 32px',
                width: '100%', maxWidth: 420,
            }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>
                    {origine === 'prof' ? '📚' : '🎮'}
                </div>
                <div style={{
                    fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.8)',
                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
                }}>
                    {origine === 'prof' ? 'Travail de classe' : 'Défi amical'}
                </div>
                {auteurNom && (
                    <h2 className="font-display" style={{
                        fontSize: 22, fontWeight: 800, color: 'var(--action-texte)', marginBottom: 8,
                    }}>
                        Défi de {auteurNom}
                    </h2>
                )}
                {classeDefi && origine === 'prof' && (
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                        {classeDefi}
                    </p>
                )}
                <p style={{
                    fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)',
                    marginTop: 12,
                }}>
                    {typeEmoji} {typeLabel}
                </p>
            </div>

            <button
                className="btn btn--gold"
                style={{ width: '100%', maxWidth: 420, fontSize: 20, padding: 16, marginTop: 24 }}
                onClick={onStart}
            >
                C'est parti !
            </button>

            <button className="btn-back" style={{ marginTop: 12 }} onClick={onBack}>
                ‹ Retour
            </button>
        </div>
    );
}

/* ===================== DEFI LEADERBOARD ===================== */

export function DefiLeaderboard({ defiId, result, type, estProf, envoiDefi, onRetry, onHome, onBack }) {
    const [classement, setClassement] = useState([]);
    const [avancement, setAvancement] = useState(null);
    const [loading, setLoading] = useState(true);

    const charger = useCallback(async () => {
        const [cls, adv] = await Promise.all([
            classementDefi(defiId),
            avancementDefi(defiId),
        ]);
        if (cls.ok) setClassement(cls.data || []);
        if (adv.ok) setAvancement(adv.data);
        setLoading(false);
    }, [defiId]);

    useEffect(() => {
        charger();

        // Temps réel : recharger le classement à chaque nouveau participant
        const unsub = suivreDefi(defiId, charger);
        return unsub; // Désabonnement propre — pas d'accumulation de canaux
    }, [defiId, charger]);

    const termines = avancement?.termines || classement.length;
    const terminesClasse = avancement?.termines_classe ?? null;
    const attendus = avancement?.attendus ?? null;
    const origine = avancement?.origine || null;
    const auteurNom = avancement?.auteur_nom || null;
    const classeDefi = avancement?.classe || null;

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onHome}>‹ Défis</button>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 48 }}>🏆</div>
                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800 }}>
                    Classement du défi
                </h2>

                {/* Origine + auteur */}
                {origine && (
                    <div style={{ marginBottom: 8 }}>
                        <span style={{
                            fontSize: 12, fontWeight: 800,
                            padding: '3px 10px', borderRadius: 6,
                            background: origine === 'prof'
                                ? 'var(--ciel-pale)' : 'var(--orange-pale)',
                            color: origine === 'prof'
                                ? 'var(--action)' : 'var(--orange)',
                        }}>
                            {origine === 'prof' ? 'Travail de classe' : 'Défi amical'}
                        </span>
                        {auteurNom && (
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-soft)', marginTop: 4 }}>
                                Défi de {auteurNom}{classeDefi ? ` — ${classeDefi}` : ''}
                            </div>
                        )}
                    </div>
                )}

                {/* Avancement */}
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                    {attendus != null
                        ? `${terminesClasse ?? 0} / ${attendus} de la ${classeDefi} ont terminé`
                        : `${termines} participant${termines !== 1 ? 's' : ''}`
                    }
                </p>
                {attendus != null && termines > (terminesClasse ?? 0) && (
                    <p style={{ color: 'var(--text-soft)', fontWeight: 600, fontSize: 12 }}>
                        + {termines - (terminesClasse ?? 0)} d'autres classes
                    </p>
                )}
            </div>

            {/* Résultat personnel si vient de jouer */}
            {result && (
                <div className="card" style={{ marginBottom: 14, textAlign: 'center' }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--gold)' }}>
                        {result.score || 0} {type?.id === 'sprint' ? 'pts' : 'pts'}
                    </div>
                    {type?.id === 'sprint' && (
                        <div style={{ fontSize: 14, color: 'var(--text-soft)', fontWeight: 600 }}>
                            en {result.time?.toFixed(1)}s
                        </div>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 600, marginTop: 4 }}>
                        {result.scorePremierEssai ?? result.score} / {result.answered} du premier coup
                    </div>
                </div>
            )}

            {/* État d'envoi du résultat */}
            {envoiDefi?.etat === 'en_cours' && (
                <div className="card" style={{
                    marginBottom: 14, textAlign: 'center', padding: '14px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}>
                    <div className="spinner" style={{ width: 18, height: 18 }} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-soft)' }}>
                        Enregistrement de ta partie…
                    </span>
                </div>
            )}
            {envoiDefi?.etat === 'echec' && (
                <div style={{
                    background: 'rgba(255,90,95,0.08)', border: '2px solid var(--coral)',
                    borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 14,
                    textAlign: 'center',
                }}>
                    <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--coral-dk)', marginBottom: 8 }}>
                        Ta partie n'a pas été enregistrée — {envoiDefi.message || 'erreur inconnue'}
                    </p>
                    <button className="btn btn--coral" style={{ fontSize: 14, padding: '8px 20px' }} onClick={onRetry}>
                        Réessayer
                    </button>
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <div className="spinner" />
                </div>
            ) : classement.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                    <p style={{ fontSize: 48 }}>🏜</p>
                    <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                        Personne n'a encore terminé — le classement se remplira tout seul.
                    </p>
                </div>
            ) : (
                <div className="card">
                    {classement.map((entry, i) => {
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
                        return (
                            <div
                                key={entry.eleve_id || i}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 8px',
                                    borderBottom: i < classement.length - 1 ? '1px solid var(--border)' : 'none',
                                    background: entry.est_moi ? 'rgba(201,162,39,0.08)' : 'transparent',
                                    borderRadius: entry.est_moi ? 10 : 0,
                                }}
                            >
                                <span style={{
                                    fontSize: medal ? 22 : 16, fontWeight: 800, minWidth: 32, textAlign: 'center',
                                    color: entry.est_moi ? 'var(--gold)' : 'var(--text-soft)',
                                }}>
                                    {medal || entry.rang || i + 1}
                                </span>
                                <span style={{ fontSize: 20 }}>{entry.avatar || '🦊'}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{
                                        fontWeight: entry.est_moi ? 800 : 700, fontSize: 15,
                                        color: entry.est_moi ? 'var(--navy)' : 'var(--text)',
                                    }}>
                                        {entry.nom_affiche || 'Anonyme'}
                                        {entry.est_moi && ' (toi)'}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>
                                        {entry.classe || ''}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--gold)' }}>
                                        {entry.score} pts
                                    </div>
                                    {entry.temps_s != null && (
                                        <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>
                                            {Number(entry.temps_s).toFixed(1)}s
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn--ghost" style={{ width: '100%' }} onClick={onHome}>
                    Autres défis
                </button>
                <button className="btn-back" onClick={onBack}>‹ Accueil</button>
            </div>
        </div>
    );
}

```


## screens/Leaderboards.jsx — les classements ET LEURS FILTRES

`frontend/src/screens/Leaderboards.jsx`

```jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    classementProgression,
    classementRecords,
    classementClasses,
    classementProfs,
} from '../api';
import { IconClassements } from '../components/Icons';

/**
 * Leaderboards — Classements
 *
 * Deux onglets : Progression (défaut), Records.
 * Trois filtres : portée, période, palier.
 * Plus : classement inter-classes et salle des profs (si prof).
 *
 * RÈGLES :
 * - Le tri est fait en SQL — ne pas re-trier côté client.
 * - Les noms sont anonymisés en base (« Alice D. ») — ne pas reconstruire.
 * - Chaque ligne porte `est_moi` pour surligner l'élève.
 */

const ONGLETS = [
    { id: 'progression', label: 'Progression' },
    { id: 'records', label: 'Records' },
    { id: 'classes', label: 'Classes' },
];

const RECORD_CATS = [
    { id: 'serie', label: 'Série', unit: 'sans faute' },
    { id: 'chrono', label: 'Chrono', unit: 'pts / 2 min' },
    { id: 'sprint', label: 'Sprint', unit: 's' },
    { id: 'montee', label: 'Montée', unit: 'table' },
];

const PERIODES = [
    { id: 'semaine', label: 'Semaine',  suffixe: 'cette semaine' },
    { id: 'mois',    label: 'Mois',     suffixe: 'ce mois' },
    { id: 'annee',   label: 'Année',    suffixe: 'cette année' },
    { id: 'tout',    label: 'Toujours', suffixe: '' },
];

const PORTEES = [
    { id: 'classe', label: 'Ma classe' },
    { id: 'niveau', label: 'Mon niveau' },
    { id: 'college', label: 'Le collège' },
];

const PALIERS = [
    { id: null, label: 'Mon palier' },
    { id: 'decouverte', label: 'Découverte' },
    { id: 'confirme', label: 'Confirmé' },
    { id: 'expert', label: 'Expert' },
    { id: 'tous', label: 'Tous' },
];

export default function Leaderboards({ onBack, identite, estProf }) {
    const [onglet, setOnglet] = useState(estProf ? 'classes' : 'progression');
    const [periode, setPeriode] = useState('semaine');
    const [portee, setPortee] = useState('classe');
    const [palier, setPalier] = useState(null);
    const [recordCat, setRecordCat] = useState('serie');
    const [niveauClasse, setNiveauClasse] = useState(null);
    const [niveauxDisponibles, setNiveauxDisponibles] = useState([]);

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);

    // Onglets visibles — un prof ne voit pas Progression ni Records
    // (eleve_courant() vaut null pour lui, ces classements seraient vides)
    const onglets = useMemo(() => (
        estProf
            ? [{ id: 'classes', label: 'Classes' },
               { id: 'profs',   label: 'Salle des profs' }]
            : [...ONGLETS]
    ), [estProf]);

    // --- Chargement des données ---
    useEffect(() => {
        let annule = false;
        async function charger() {
            setLoading(true);
            setErreur(null);
            let res;

            try {
                if (onglet === 'progression') {
                    res = await classementProgression({ periode, portee, palier });
                } else if (onglet === 'records') {
                    res = await classementRecords({ categorie: recordCat, periode, portee, palier });
                } else if (onglet === 'classes') {
                    res = await classementClasses({ periode, niveau: niveauClasse });
                } else if (onglet === 'profs') {
                    res = await classementProfs({ periode });
                }

                if (annule) return;
                if (!res?.ok) {
                    setErreur(res?.error || 'Impossible de charger le classement.');
                    setData([]);
                } else {
                    let rows = res.data || [];
                    // classement_classes renvoie des colonnes différentes :
                    // rang, classe, eleves_actifs, eleves_total, points_moyens, est_ma_classe
                    // On normalise vers la forme attendue par PodiumCard et LeaderboardRow.
                    if (onglet === 'classes') {
                        rows = rows.map(r => ({
                            rang: r.rang,
                            nom_affiche: r.classe,
                            classe: r.classe,
                            avatar: null,
                            valeur: r.points_moyens ?? 0,
                            est_moi: r.est_ma_classe === true,
                            eleves_actifs: r.eleves_actifs ?? 0,
                            eleves_total: r.eleves_total ?? 0,
                        }));
                    }
                    setData(rows);
                    // Déduire les niveaux disponibles des classes renvoyées
                    if (onglet === 'classes' && niveauClasse === null && rows.length) {
                        const niveaux = [...new Set(
                            rows.map(r => (r.classe || '')[0]).filter(Boolean)
                        )].sort();
                        setNiveauxDisponibles(niveaux);
                    }
                }
            } catch {
                if (!annule) setErreur('Erreur réseau.');
            }
            if (!annule) setLoading(false);
        }
        charger();
        return () => { annule = true; };
    }, [onglet, periode, portee, palier, recordCat, niveauClasse]);

    const showFilters = !estProf && (onglet === 'progression' || onglet === 'records');
    const currentRecordCat = RECORD_CATS.find(c => c.id === recordCat) || RECORD_CATS[0];

    // Unité d'affichage selon le contexte — le score porte toujours sa période
    const periodeInfo = PERIODES.find(p => p.id === periode) || PERIODES[0];
    const unit = onglet === 'records' ? currentRecordCat.unit
               : onglet === 'progression' ? (periodeInfo.suffixe ? `pts ${periodeInfo.suffixe}` : 'pts')
               : onglet === 'classes' ? (periodeInfo.suffixe ? `pts / élève ${periodeInfo.suffixe}` : 'pts / élève')
               : 'pts';

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <h1 className="font-display" style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <IconClassements size={24} color="var(--indigo)" actionColor="var(--ciel)" /> Classements
                </h1>
            </div>

            {/* Onglets principaux */}
            <div className="viz-tabs" style={{ marginBottom: 10 }}>
                {onglets.map(t => (
                    <button
                        key={t.id}
                        className={`viz-tab${onglet === t.id ? ' viz-tab--active' : ''}`}
                        onClick={() => setOnglet(t.id)}
                        style={{ fontSize: 13 }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Sous-catégories Records */}
            {onglet === 'records' && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto' }}>
                    {RECORD_CATS.map(c => (
                        <button
                            key={c.id}
                            className={`chip${recordCat === c.id ? ' chip--coral' : ''}`}
                            style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
                            onClick={() => setRecordCat(c.id)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Filtres */}
            {showFilters && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {/* Portée */}
                    <div style={{ display: 'flex', gap: 4 }}>
                        {PORTEES.map(p => (
                            <button
                                key={p.id}
                                className={`chip${portee === p.id ? ' chip--navy' : ''}`}
                                style={{ flex: 1, width: 'auto', fontSize: 12, height: 36 }}
                                onClick={() => setPortee(p.id)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Période */}
                    <div style={{ display: 'flex', gap: 4 }}>
                        {PERIODES.map(p => (
                            <button
                                key={p.id}
                                className={`chip${periode === p.id ? ' chip--gold' : ''}`}
                                style={{ flex: 1, width: 'auto', fontSize: 12, height: 36 }}
                                onClick={() => setPeriode(p.id)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Palier */}
                    <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
                        {PALIERS.map(p => (
                            <button
                                key={p.id ?? 'mon'}
                                className={`chip${palier === p.id ? ' chip--purple' : ''}`}
                                style={{ fontSize: 11, padding: '6px 10px', whiteSpace: 'nowrap' }}
                                onClick={() => setPalier(p.id)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Période pour classes et profs */}
            {(onglet === 'classes' || onglet === 'profs') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {PERIODES.map(p => (
                            <button
                                key={p.id}
                                className={`chip${periode === p.id ? ' chip--gold' : ''}`}
                                style={{ flex: 1, width: 'auto', fontSize: 12, height: 36 }}
                                onClick={() => setPeriode(p.id)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Filtre par niveau (Classes uniquement) */}
                    {onglet === 'classes' && niveauxDisponibles.length > 0 && (
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button
                                className={`chip${niveauClasse === null ? ' chip--navy' : ''}`}
                                style={{ flex: 1, width: 'auto', fontSize: 12, height: 36 }}
                                onClick={() => setNiveauClasse(null)}
                            >
                                Tous
                            </button>
                            {niveauxDisponibles.map(n => (
                                <button
                                    key={n}
                                    className={`chip${niveauClasse === n ? ' chip--navy' : ''}`}
                                    style={{ flex: 1, width: 'auto', fontSize: 12, height: 36 }}
                                    onClick={() => setNiveauClasse(n)}
                                >
                                    {n}ᵉ
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Contenu */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                    <div className="spinner" />
                </div>
            ) : erreur ? (
                <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                    <p style={{ color: 'var(--coral)', fontWeight: 700 }}>{erreur}</p>
                </div>
            ) : data.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                    <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 15 }}>
                        Aucun résultat pour ces filtres.
                    </p>
                    <p style={{ color: 'var(--text-soft)', fontSize: 13, marginTop: 4 }}>
                        Joue quelques parties pour apparaître ici !
                    </p>
                </div>
            ) : (() => {
                const topValue = data[0]?.valeur ?? data[0]?.points ?? data[0]?.moyenne ?? 0;
                if (topValue === 0) return (
                    <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                        <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 15 }}>
                            Aucun résultat pour ces filtres.
                        </p>
                        <p style={{ color: 'var(--text-soft)', fontSize: 13, marginTop: 4 }}>
                            Joue quelques parties pour apparaître ici !
                        </p>
                    </div>
                );
                return (
                <>
                    {/* Podium top 3 */}
                    {data.length >= 3 && (
                        <div style={{
                            display: 'flex', justifyContent: 'center',
                            alignItems: 'flex-end', gap: 10, marginBottom: 16,
                        }}>
                            <PodiumCard entry={data[1]} position={2} unit={unit} />
                            <PodiumCard entry={data[0]} position={1} unit={unit} />
                            <PodiumCard entry={data[2]} position={3} unit={unit} />
                        </div>
                    )}

                    {/* Liste complète */}
                    <div className="card">
                        {data.map((entry, i) => (
                            <LeaderboardRow
                                key={entry.id || entry.rang || i}
                                entry={entry}
                                index={i}
                                unit={unit}
                                isLast={i === data.length - 1}
                                onglet={onglet}
                            />
                        ))}
                    </div>

                    {/* Phrase de motivation — le classement se réinitialise */}
                    {(onglet === 'progression' || onglet === 'classes') && periode === 'semaine' && (
                        <p style={{
                            textAlign: 'center', fontSize: 12, fontWeight: 600,
                            color: 'var(--text-soft)', marginTop: 12, fontStyle: 'italic',
                        }}>
                            Le classement repart à zéro chaque lundi — tout le monde a sa chance.
                        </p>
                    )}
                </>
                );
            })()}
        </div>
    );
}

/* ===================== PODIUM ===================== */

function PodiumCard({ entry, position, unit }) {
    const heights = { 1: 100, 2: 75, 3: 60 };
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const colors = { 1: 'var(--podium)', 2: 'var(--gris)', 3: 'var(--orange)' };

    const name = entry.nom_affiche || entry.classe || '—';
    const avatar = entry.avatar_emoji || entry.avatar || '';
    const value = entry.valeur ?? entry.points ?? entry.moyenne ?? 0;

    return (
        <div style={{ textAlign: 'center', width: 90 }}>
            {avatar && <span style={{ fontSize: 32 }}>{avatar}</span>}
            <p className="font-display" style={{
                fontWeight: 700, fontSize: 12, marginTop: 4,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
                {name}
            </p>
            <div style={{
                height: heights[position],
                background: colors[position],
                borderRadius: '12px 12px 0 0',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                marginTop: 6,
            }}>
                <span style={{ fontSize: 24 }}>{medals[position]}</span>
                <span className="font-display" style={{ fontWeight: 800, fontSize: 18, color: 'var(--action-texte)' }}>
                    {value}
                </span>
            </div>
        </div>
    );
}

/* ===================== ROW ===================== */

function LeaderboardRow({ entry, index, unit, isLast, onglet }) {
    const estMoi = entry.est_moi === true;
    const rang = entry.rang ?? (index + 1);
    const name = entry.nom_affiche || entry.classe || '—';
    const avatar = entry.avatar_emoji || entry.avatar || '';
    const value = entry.valeur ?? entry.points ?? entry.moyenne ?? 0;
    const classe = entry.classe || '';

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 8px',
            borderBottom: isLast ? 'none' : '1px solid var(--bordure)',
            background: estMoi
                ? 'var(--ciel-pale)'
                : index < 3 ? 'var(--ivoire)' : 'transparent',
            borderRadius: estMoi || index < 3 ? 8 : 0,
            border: estMoi ? '2px solid var(--action)' : 'none',
        }}>
            <span className="font-display" style={{
                fontWeight: 800, fontSize: 18, width: 28, textAlign: 'center',
                color: index === 0 ? 'var(--podium)' : index === 1 ? 'var(--gris)' : index === 2 ? 'var(--orange)' : 'var(--gris)',
            }}>
                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : rang}
            </span>
            {avatar && <span style={{ fontSize: 28 }}>{avatar}</span>}
            <div style={{ flex: 1 }}>
                <p className="font-display" style={{ fontWeight: 700, fontSize: 15 }}>
                    {estMoi ? `${name} (toi)` : name}
                </p>
                {/* Pour les classements d'élèves, on affiche la classe */}
                {onglet !== 'classes' && classe && (
                    <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{classe}</p>
                )}
                {/* Pour le classement des classes, afficher le nombre d'élèves actifs */}
                {onglet === 'classes' && entry.eleves_actifs != null && (
                    <p style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>
                        {entry.eleves_actifs} / {entry.eleves_total} élève{entry.eleves_total > 1 ? 's' : ''} {entry.eleves_actifs > 1 ? 'ont' : 'a'} joué
                    </p>
                )}
            </div>
            <span className="font-display" style={{
                fontWeight: 800, fontSize: 20,
                color: estMoi ? 'var(--gold)' : 'var(--navy)',
            }}>
                {value}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>{unit}</span>
        </div>
    );
}

```


## screens/MaClasse.jsx — l'ecran professeur

`frontend/src/screens/MaClasse.jsx`

```jsx
import React, { useState, useEffect, useMemo } from 'react';
import { maitriseClasse, listeClasses } from '../api';
import { IconMaGrille, IconSprint, IconCadenas } from '../components/Icons';

/**
 * MaClasse — L'écran qui décide de l'adoption en salle des profs.
 *
 * Le serveur renvoie UNE LIGNE PAR TABLE existant pour cette classe,
 * travaillée ou non. L'écran ne fabrique plus la liste, ne la complète
 * plus, ne la borne plus. Une table absente du retour n'existe pas
 * pour cette classe.
 *
 * Colonnes serveur (migration 20) :
 *   travaillee             — au moins un élève l'a rencontrée
 *   dans_le_plafond_commun — TOUS les élèves de la classe y ont droit
 *   eleves_verts/jaunes/rouges/total — ceux qui ont travaillé
 *   eleves_sans_trace      — effectif - total (calculé par le serveur)
 *   eleves_classe          — effectif actif de la classe
 *   taux_maitrise          — % verts parmi ceux qui ont travaillé
 *   taux_couverture        — % de la classe qui l'a travaillée
 *
 * Deux blocs :
 *   1. Tables travaillées, triées par taux_maitrise croissant
 *   2. Tables pas encore abordées (travaillee = false)
 *
 * Bouton défi : candidates = travaillee=true ET dans_le_plafond_commun=true,
 * triées par taux_maitrise croissant, les 2-3 premières.
 * Jamais de table non travaillée en candidate.
 */

export default function MaClasse({ onBack, onLancerDefi }) {
    const [classes, setClasses] = useState([]);
    const [selectedClasse, setSelectedClasse] = useState(null);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);

    // Charger la liste des classes au montage
    useEffect(() => {
        (async () => {
            const res = await listeClasses();
            if (res.ok && res.data?.length) {
                // Favorites d'abord, puis par nom
                const sorted = [...res.data].sort((a, b) => {
                    if (a.est_favorite !== b.est_favorite) return b.est_favorite ? 1 : -1;
                    return a.classe.localeCompare(b.classe);
                });
                setClasses(sorted);
                setSelectedClasse(sorted[0].classe);
            } else {
                setLoading(false);
            }
        })();
    }, []);

    // Charger la maîtrise quand la classe change
    useEffect(() => {
        if (!selectedClasse) return;
        setLoading(true);
        setErreur(null);
        (async () => {
            const res = await maitriseClasse(selectedClasse);
            if (res.ok) {
                setData(res.data || []);
            } else {
                setErreur(res.error || 'Impossible de charger la maîtrise.');
            }
            setLoading(false);
        })();
    }, [selectedClasse]);

    // Effectif de la classe (constant sur toutes les lignes)
    const effectif = data.length > 0 ? (data[0].eleves_classe || 0) : 0;

    // Bloc 1 : tables travaillées, triées par eleves_verts/eleves_classe
    // croissant, départagé par taux_couverture décroissant.
    // taux_maitrise (verts/total) est trompeur : une table vue par 1 élève
    // sur 27 peut afficher 100 % si cet élève l'a réussie.
    const tablesTravaillees = useMemo(() => {
        return data
            .filter(d => d.travaillee)
            .sort((a, b) => {
                const ec = a.eleves_classe || 1; // même valeur partout
                const ratioA = a.eleves_verts / ec;
                const ratioB = b.eleves_verts / ec;
                if (ratioA !== ratioB) return ratioA - ratioB;
                // À ratio égal, la plus couverte en premier :
                // c'est un rattrapage, pas une découverte.
                return (b.taux_couverture ?? 0) - (a.taux_couverture ?? 0);
            });
    }, [data]);

    // Bloc 2 : tables pas encore abordées
    const tablesNonAbordees = useMemo(() => {
        return data.filter(d => !d.travaillee);
    }, [data]);

    // Tables qui coincent : au moins un élève en jaune ou en rouge sur une table travaillée.
    const tablesQuiCoincent = useMemo(() => {
        return tablesTravaillees
            .filter(d => (d.eleves_jaunes + d.eleves_rouges) > 0);
    }, [tablesTravaillees]);

    // Candidates pour le bouton défi de rattrapage :
    // Triées par la part de la CLASSE en difficulté décroissante ((jaunes + rouges) / eleves_classe).
    // On retient les 2 ou 3 premières, ordonnées pour l'affichage (a - b).
    const tablesDefi = useMemo(() => {
        return [...tablesQuiCoincent]
            .sort((a, b) => {
                const ecA = a.eleves_classe || 1;
                const ecB = b.eleves_classe || 1;
                const diffA = (a.eleves_jaunes + a.eleves_rouges) / ecA;
                const diffB = (b.eleves_jaunes + b.eleves_rouges) / ecB;
                if (diffA !== diffB) return diffB - diffA;
                return a.table_n - b.table_n;
            })
            .slice(0, 3)
            .map(d => d.table_n)
            .sort((a, b) => a - b);
    }, [tablesQuiCoincent]);

    // Rien ne coince : au moins une table travaillée, et aucun élève en jaune ou en rouge.
    const rienNeCoince = useMemo(() => {
        return tablesTravaillees.length > 0 && tablesQuiCoincent.length === 0;
    }, [tablesTravaillees, tablesQuiCoincent]);

    // Tables non abordées pour le bouton découverte (pas de filtre par plafond)
    const tablesDecouverte = useMemo(() => {
        return tablesNonAbordees
            .slice(0, 3)
            .map(d => d.table_n)
            .sort((a, b) => a - b);
    }, [tablesNonAbordees]);

    if (!classes.length && !loading) {
        return (
            <div className="screen-enter" style={{ textAlign: 'center', padding: 40 }}>
                <span style={{ fontSize: 48 }}>🏫</span>
                <h2 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', marginTop: 12 }}>
                    Aucune classe trouvée
                </h2>
                <p style={{ color: 'var(--text-soft)', fontWeight: 600, fontSize: 14, marginTop: 8 }}>
                    Les classes apparaissent dès qu'un élève s'est connecté.
                </p>
                <button className="btn-back" style={{ marginTop: 16 }} onClick={onBack}>‹ Retour</button>
            </div>
        );
    }

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <IconMaGrille size={22} color="var(--indigo)" actionColor="var(--ciel)" /> Ma classe
                </h1>
            </div>

            {/* Sélecteur de classe */}
            <div style={{
                display: 'flex', gap: 8, flexWrap: 'wrap',
                justifyContent: 'center', marginBottom: 16,
            }}>
                {classes.map(c => (
                    <button
                        key={c.classe}
                        onClick={() => setSelectedClasse(c.classe)}
                        style={{
                            padding: '8px 16px', fontSize: 14, fontWeight: 700,
                            background: selectedClasse === c.classe
                                ? 'var(--indigo)' : 'var(--surface)',
                            color: selectedClasse === c.classe ? 'var(--action-texte)' : 'var(--indigo-encre)',
                            border: selectedClasse === c.classe
                                ? '2px solid var(--indigo)' : '2px solid var(--bordure)',
                            borderRadius: 12, cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        {c.classe}
                        {c.est_favorite && ' ★'}
                        <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.7 }}>
                            ({c.eleves_actifs})
                        </span>
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <div className="spinner" />
                </div>
            ) : erreur ? (
                <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                    <p style={{ color: 'var(--coral)', fontWeight: 700 }}>{erreur}</p>
                </div>
            ) : (
                <>
                    {/* Résumé */}
                    <div className="card" style={{ padding: '12px 16px', marginBottom: 14 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>
                            {selectedClasse} — {effectif} élève{effectif !== 1 ? 's' : ''} actif{effectif !== 1 ? 's' : ''}
                        </p>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)', marginTop: 2 }}>
                            {tablesTravaillees.length} table{tablesTravaillees.length !== 1 ? 's' : ''} travaillée{tablesTravaillees.length !== 1 ? 's' : ''}
                            {tablesNonAbordees.length > 0 && ` · ${tablesNonAbordees.length} pas encore abordée${tablesNonAbordees.length !== 1 ? 's' : ''}`}
                        </p>
                    </div>

                    {/* Légende */}
                    <div style={{
                        display: 'flex', gap: 12, justifyContent: 'center',
                        marginBottom: 12, fontSize: 11, fontWeight: 700,
                        color: 'var(--text-soft)',
                    }}>
                        <Legend color="var(--mint)" label="Maîtrisé" />
                        <Legend color="var(--sun)" label="En cours" />
                        <Legend color="var(--coral)" label="Difficulté" />
                        <Legend color="var(--border)" label="Pas travaillé" />
                    </div>

                    {/* Bloc 1 : Tables travaillées, triées par faiblesse */}
                    {tablesTravaillees.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            {tablesTravaillees.map(d => (
                                <TableBar
                                    key={d.table_n}
                                    tableN={d.table_n}
                                    verts={d.eleves_verts}
                                    jaunes={d.eleves_jaunes}
                                    rouges={d.eleves_rouges}
                                    sansTrace={d.eleves_sans_trace}
                                    effectif={d.eleves_classe}
                                    tauxMaitrise={d.taux_maitrise}
                                    dansPlafond={d.dans_le_plafond_commun}
                                />
                            ))}
                        </div>
                    )}

                    {/* Bloc 2 : Tables pas encore abordées */}
                    {tablesNonAbordees.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <h3 style={{
                                fontSize: 13, fontWeight: 800, color: 'var(--text-soft)',
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                marginBottom: 8,
                            }}>
                                Pas encore abordées
                            </h3>
                            {tablesNonAbordees.map(d => (
                                <TableBar
                                    key={d.table_n}
                                    tableN={d.table_n}
                                    verts={0} jaunes={0} rouges={0}
                                    sansTrace={d.eleves_sans_trace}
                                    effectif={d.eleves_classe}
                                    jamaisTravaillee
                                    dansPlafond={d.dans_le_plafond_commun}
                                />
                            ))}
                        </div>
                    )}

                    {/* Bouton défi de rattrapage ou message si rien ne coince */}
                    {tablesDefi.length > 0 ? (
                        <button
                            className="btn btn--gold"
                            style={{
                                width: '100%', fontSize: 16, padding: '16px 24px',
                                marginTop: 8,
                            }}
                            onClick={() => onLancerDefi?.(tablesDefi, selectedClasse)}
                        >
                            <IconSprint size={18} color="var(--action-texte)" /> Lancer un défi sur {tablesDefi.length === 1 ? 'la table' : 'les tables'} {tablesDefi.join(', ')}
                        </button>
                    ) : rienNeCoince ? (
                        <div className="card" style={{
                            padding: '14px 18px', marginTop: 8,
                            background: 'rgba(0, 201, 167, 0.08)',
                            border: '2px solid var(--mint)',
                            borderRadius: 14, textAlign: 'center',
                        }}>
                            <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>
                                Rien ne coince dans cette classe.
                            </p>
                            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)', lineHeight: 1.4 }}>
                                Aucun élève n'est en difficulté sur les tables travaillées. Le bouton « Découvrir » ci-dessous ouvre les tables suivantes.
                            </p>
                        </div>
                    ) : (
                        <button
                            className="btn btn--ghost"
                            disabled
                            style={{
                                width: '100%', fontSize: 14, padding: '14px 24px',
                                marginTop: 8, opacity: 0.5, cursor: 'default',
                            }}
                        >
                            Pas encore assez de données pour un défi ciblé
                        </button>
                    )}

                    {/* Bouton découverte — tables non abordées */}
                    {tablesDecouverte.length > 0 && (
                        <button
                            className="btn btn--ghost"
                            style={{
                                width: '100%', fontSize: 14, padding: '14px 24px',
                                marginTop: 8,
                            }}
                            onClick={() => onLancerDefi?.(tablesDecouverte, selectedClasse)}
                        >
                            Découvrir les tables {tablesDecouverte.join(', ')}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

/* ===================== LÉGENDE ===================== */

function Legend({ color, label }) {
    return (
        <span>
            <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: 3,
                background: color, marginRight: 4, verticalAlign: 'middle',
            }} />
            {label}
        </span>
    );
}

/* ===================== BARRE D'UNE TABLE ===================== */

function TableBar({ tableN, verts, jaunes, rouges, sansTrace, effectif, tauxMaitrise, jamaisTravaillee, dansPlafond }) {
    // Largeurs en pourcentage de l'effectif
    const pVerts = effectif > 0 ? (verts / effectif) * 100 : 0;
    const pJaunes = effectif > 0 ? (jaunes / effectif) * 100 : 0;
    const pRouges = effectif > 0 ? (rouges / effectif) * 100 : 0;
    // Le gris = le reste de la barre via background

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 6, padding: '6px 0',
            opacity: dansPlafond ? 1 : 0.55,
        }}>
            {/* Label */}
            <div style={{
                minWidth: 48, textAlign: 'right',
                fontWeight: 800, fontSize: 14,
                color: jamaisTravaillee ? 'var(--text-soft)' : 'var(--navy)',
                fontFamily: 'var(--font-display)',
            }}>
                × {tableN}
                {!dansPlafond && <span style={{ marginLeft: 4 }}><IconCadenas size={11} color="var(--gris-inerte)" /></span>}
            </div>

            {/* Barre */}
            <div style={{
                flex: 1, height: 28, borderRadius: 8,
                display: 'flex', overflow: 'hidden',
                background: 'var(--border)',
            }}>
                {!jamaisTravaillee && (
                    <>
                        {pVerts > 0 && (
                            <div style={{
                                width: `${pVerts}%`, background: 'var(--mint)',
                                transition: 'width 0.3s',
                            }} />
                        )}
                        {pJaunes > 0 && (
                            <div style={{
                                width: `${pJaunes}%`, background: 'var(--sun)',
                                transition: 'width 0.3s',
                            }} />
                        )}
                        {pRouges > 0 && (
                            <div style={{
                                width: `${pRouges}%`, background: 'var(--coral)',
                                transition: 'width 0.3s',
                            }} />
                        )}
                        {/* Le gris restant = élèves sans trace — via background de la barre */}
                    </>
                )}
            </div>

            {/* Texte résumé */}
            <div style={{
                minWidth: 110, textAlign: 'right', fontSize: 12, fontWeight: 700,
                color: jamaisTravaillee ? 'var(--text-soft)' : 'var(--text)',
                lineHeight: 1.3,
            }}>
                {jamaisTravaillee ? (
                    <span style={{ fontStyle: 'italic', color: 'var(--text-soft)' }}>
                        Pas travaillée
                    </span>
                ) : (
                    <>
                        <div>{verts} / {effectif} maîtrisent</div>
                        {sansTrace > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--text-soft)', fontWeight: 600 }}>
                                {sansTrace} sans trace
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

```


## screens/MesDefis.jsx

`frontend/src/screens/MesDefis.jsx`

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { mesDefis } from '../api';
import { DefiLeaderboard } from './Challenges';
import { IconDefisPasses, ModeIcon } from '../components/Icons';

/**
 * MesDefis — La porte de retour vers les défis passés.
 *
 * Un prof crée un défi, note le code, quitte l'écran — et n'a plus
 * AUCUN moyen d'y revenir. Cet écran liste les défis créés, et un
 * clic ouvre DefiLeaderboard pour voir le classement en temps réel.
 *
 * Accessible côté prof (accueil) ET côté élève (écran Défis).
 */

const TYPE_LABELS = {
    sprint: { label: 'Sprint' },
    countdown: { label: 'Contre-la-montre' },
    flawless: { label: 'Sans faute' },
    climb: { label: 'Montée' },
};

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const jour = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${jour} à ${heure}`;
}

export default function MesDefis({ onBack, estProf }) {
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);
    const [defis, setDefis] = useState([]);
    // Quand on ouvre le classement d'un défi
    const [selectedDefi, setSelectedDefi] = useState(null);

    const charger = useCallback(async () => {
        setLoading(true);
        setErreur(null);
        const res = await mesDefis();
        if (res.ok) {
            setDefis(res.data || []);
        } else {
            setErreur(res.error || 'Impossible de charger les défis.');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        charger();
    }, [charger]);

    // Si on regarde le classement d'un défi
    if (selectedDefi) {
        return (
            <DefiLeaderboard
                defiId={selectedDefi.defi_id}
                result={null}
                type={null}
                estProf={estProf}
                envoiDefi={null}
                onRetry={null}
                onHome={() => setSelectedDefi(null)}
                onBack={() => setSelectedDefi(null)}
            />
        );
    }

    if (loading) {
        return (
            <div className="screen-enter" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: '50vh', gap: 16,
            }}>
                <div className="spinner" />
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                    Chargement des défis…
                </p>
            </div>
        );
    }

    if (erreur) {
        return (
            <div className="screen-enter" style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--coral)', fontWeight: 700, fontSize: 16 }}>{erreur}</p>
                <button className="btn btn--ghost" style={{ marginTop: 16 }} onClick={charger}>
                    Réessayer
                </button>
                <button className="btn-back" style={{ marginTop: 12 }} onClick={onBack}>
                    ‹ Retour
                </button>
            </div>
        );
    }

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Retour</button>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                    <IconDefisPasses size={40} color="var(--indigo)" actionColor="var(--ciel)" />
                </div>
                <h2 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>
                    Mes défis
                </h2>
                <p style={{ color: 'var(--text-soft)', fontWeight: 600, fontSize: 13 }}>
                    {defis.length === 0
                        ? 'Tu n\'as pas encore créé de défi.'
                        : `${defis.length} défi${defis.length > 1 ? 's' : ''}`
                    }
                </p>
            </div>

            {defis.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                    <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                        Aucun défi créé pour le moment.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {defis.map(d => {
                        const typeInfo = TYPE_LABELS[d.type] || { label: d.type };
                        const ouvert = d.encore_ouvert;
                        return (
                            <button
                                key={d.defi_id}
                                className="card"
                                onClick={() => setSelectedDefi(d)}
                                style={{
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    border: ouvert ? '2px solid var(--mint)' : '2px solid var(--border)',
                                    opacity: ouvert ? 1 : 0.6,
                                    padding: '14px 16px',
                                    transition: 'transform 0.1s',
                                }}
                            >
                                {/* Code en gros, display, lettrage espacé */}
                                <div style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 26,
                                    fontWeight: 900,
                                    letterSpacing: '0.2em',
                                    color: ouvert ? 'var(--navy)' : 'var(--text-soft)',
                                    marginBottom: 6,
                                }}>
                                    {d.code}
                                </div>

                                {/* Type + classe + date */}
                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
                                    fontSize: 13, fontWeight: 600, color: 'var(--text-soft)',
                                    marginBottom: 6,
                                }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <ModeIcon mode={d.type} size={16} color="var(--indigo)" /> {typeInfo.label}
                                    </span>
                                    {d.classe && (
                                        <span className="chip" style={{
                                            fontSize: 11, padding: '2px 8px', height: 'auto',
                                        }}>
                                            {d.classe}
                                        </span>
                                    )}
                                    <span>· {formatDate(d.cree_le)}</span>
                                </div>

                                {/* Origine */}
                                <div style={{ marginBottom: 6 }}>
                                    <span style={{
                                        fontSize: 11, fontWeight: 800,
                                        padding: '2px 8px', borderRadius: 6,
                                        background: d.origine === 'prof'
                                            ? 'var(--ciel-pale)' : 'var(--orange-pale)',
                                        color: d.origine === 'prof'
                                            ? 'var(--action)' : 'var(--orange)',
                                    }}>
                                        {d.origine === 'prof' ? 'Travail de classe' : 'Défi amical'}
                                    </span>
                                    {d.auteur_nom && (
                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gris)', marginLeft: 6 }}>
                                            Défi de {d.auteur_nom}
                                        </span>
                                    )}
                                </div>

                                {/* Participants + état */}
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                }}>
                                    <div>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                                            {d.attendus != null
                                                ? `${d.participants_classe ?? 0} / ${d.attendus} de la ${d.classe} ont joué`
                                                : `${d.participants} ${d.participants === 1 ? 'a joué' : 'ont joué'}`
                                            }
                                        </span>
                                        {d.attendus != null && d.participants > (d.participants_classe ?? 0) && (
                                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-soft)' }}>
                                                + {d.participants - (d.participants_classe ?? 0)} d'autres classes
                                            </div>
                                        )}
                                    </div>
                                    {!ouvert && (
                                        <span style={{
                                            fontSize: 11, fontWeight: 800,
                                            color: 'var(--text-soft)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                        }}>
                                            terminé
                                        </span>
                                    )}
                                    {ouvert && (
                                        <span style={{
                                            fontSize: 11, fontWeight: 800,
                                            color: 'var(--mint-dk)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                        }}>
                                            en cours
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

```


## screens/Profile.jsx — profil, badges, avatar, deconnexion

`frontend/src/screens/Profile.jsx`

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { monProfil, monProfilProf, mesTablesFaibles, changerAvatar, listeClasses, definirMesClasses } from '../api';
import { masteryColor, cleFait } from '../logic/mastery';
import { IconSansFaute, IconMaGrille } from '../components/Icons';

/**
 * Profile — Aiguille vers ProfileEleve ou ProfileProf selon identite.type
 */
export default function Profile({ onBack, identite, estProf, onLogout, onReviser, onGo }) {
    const isProf = estProf || identite?.type === 'prof';
    if (isProf) {
        return <ProfileProf onBack={onBack} onLogout={onLogout} onGo={onGo} />;
    }
    return <ProfileEleve onBack={onBack} identite={identite} onLogout={onLogout} onReviser={onReviser} />;
}

/* ===================================================================
 * PROFIL ENSEIGNANT
 * ================================================================= */
function ProfileProf({ onBack, onLogout, onGo }) {
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);
    const [profil, setProfil] = useState(null);
    const [records, setRecords] = useState(null);
    const [rang, setRang] = useState(null);
    const [allClasses, setAllClasses] = useState([]);
    const [editingClasses, setEditingClasses] = useState(false);
    const [selectedClasses, setSelectedClasses] = useState([]);
    const [savingClasses, setSavingClasses] = useState(false);
    const [msgClasses, setMsgClasses] = useState('');

    const charger = useCallback(async () => {
        setLoading(true);
        setErreur(null);
        const res = await monProfilProf();
        if (!res.ok) {
            setErreur(res.error || 'Impossible de charger le profil enseignant.');
            setLoading(false);
            return;
        }
        const d = res.data;
        setProfil(d.profil);
        setRecords(d.records);
        setRang(d.rang_salle_des_profs);
        setSelectedClasses(d.profil?.classes || []);

        const cRes = await listeClasses();
        if (cRes.ok && cRes.data) {
            setAllClasses(cRes.data);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        charger();
    }, [charger]);

    const handleSaveClasses = async () => {
        setSavingClasses(true);
        setMsgClasses('');
        const res = await definirMesClasses(selectedClasses);
        if (res.ok) {
            setProfil(prev => ({ ...prev, classes: selectedClasses }));
            setEditingClasses(false);
            setMsgClasses('✅ Classes enregistrées');
            setTimeout(() => setMsgClasses(''), 3000);
        } else {
            setMsgClasses(`❌ ${res.error || "Erreur d'enregistrement"}`);
        }
        setSavingClasses(false);
    };

    const toggleClass = (c) => {
        setSelectedClasses(prev =>
            prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
        );
    };

    if (loading) {
        return (
            <div className="screen-enter" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: '50vh', gap: 16,
            }}>
                <div className="spinner" />
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                    Chargement du profil…
                </p>
            </div>
        );
    }

    if (erreur) {
        return (
            <div className="screen-enter" style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--coral)', fontWeight: 700, fontSize: 16 }}>{erreur}</p>
                <button className="btn btn--ghost" style={{ marginTop: 16 }} onClick={onBack}>
                    ‹ Retour
                </button>
            </div>
        );
    }

    const nbSessions = records?.nb_sessions || 0;

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            {/* 1. Identité */}
            <div className="card" style={{ textAlign: 'center', marginBottom: 14, padding: '20px 16px' }}>
                <div style={{ fontSize: 56, marginBottom: 8 }}>
                    👨‍🏫
                </div>
                <h2 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>
                    {profil?.nom || 'Professeur'}
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 10 }}>
                    {profil?.email || ''}
                </p>
                <span
                    className={`chip${profil?.est_admin ? ' chip--gold' : ''}`}
                    style={{ fontSize: 12, height: 28, padding: '0 14px' }}
                >
                    {profil?.est_admin ? '👑 Administrateur' : '📚 Enseignant'}
                </span>
            </div>

            {/* 2. Mes parties */}
            <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800 }}>
                        🎮 Mes parties
                    </h3>
                    {rang && (
                        <span className="chip chip--gold" style={{ fontSize: 12, fontWeight: 800 }}>
                            🏅 {rang}ᵉ en salle des profs
                        </span>
                    )}
                </div>

                {nbSessions === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                        <p style={{ color: 'var(--text-soft)', fontWeight: 600, fontSize: 14, marginBottom: 14 }}>
                            Tu n'as pas encore joué.
                        </p>
                        <button
                            className="btn btn--mint"
                            style={{ fontSize: 15, padding: '10px 24px', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                            onClick={() => onGo?.('play')}
                        >
                            <IconSansFaute size={20} color="var(--action-texte)" actionColor="var(--action-texte)" /> S'entraîner
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="stat-grid" style={{ marginBottom: 14 }}>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--succes)' }}>
                                    {records?.points_total || 0}
                                </span>
                                <span className="stat__label">
                                    Points total {records?.points_semaine > 0 ? `(+${records.points_semaine} 7j)` : ''}
                                </span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--indigo)' }}>
                                    {records?.nb_sessions || 0}
                                </span>
                                <span className="stat__label">Parties jouées</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--erreur-eleve)' }}>
                                    {records?.meilleure_serie || 0}
                                </span>
                                <span className="stat__label">Meilleure série</span>
                            </div>
                            {records?.meilleur_sprint > 0 && (
                                <div className="stat">
                                    <span className="stat__value" style={{ color: 'var(--action)' }}>
                                        {records.meilleur_sprint}s
                                    </span>
                                    <span className="stat__label">Meilleur sprint</span>
                                </div>
                            )}
                            {records?.meilleur_chrono > 0 && (
                                <div className="stat">
                                    <span className="stat__value" style={{ color: 'var(--orange)' }}>
                                        {records.meilleur_chrono}
                                    </span>
                                    <span className="stat__label">Meilleur chrono</span>
                                </div>
                            )}
                            {records?.plus_haute_table > 0 && (
                                <div className="stat">
                                    <span className="stat__value" style={{ color: 'var(--indigo-doux)' }}>
                                        {records.plus_haute_table}
                                    </span>
                                    <span className="stat__label">Plus haute table</span>
                                </div>
                            )}
                        </div>
                        <button
                            className="btn btn--mint"
                            style={{ width: '100%', fontSize: 14, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                            onClick={() => onGo?.('play')}
                        >
                            <IconSansFaute size={18} color="var(--action-texte)" actionColor="var(--action-texte)" /> S'entraîner
                        </button>
                    </>
                )}
            </div>

            {/* 3. Mes classes habituelles */}
            <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800 }}>
                        🗺 Mes classes habituelles
                    </h3>
                    {!editingClasses && (
                        <button
                            className="btn btn--ghost"
                            style={{ fontSize: 13, padding: '6px 12px' }}
                            onClick={() => {
                                setSelectedClasses(profil?.classes || []);
                                setEditingClasses(true);
                            }}
                        >
                            ✏️ Modifier
                        </button>
                    )}
                </div>

                {msgClasses && (
                    <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: msgClasses.startsWith('❌') ? 'var(--coral)' : 'var(--mint-dk)' }}>
                        {msgClasses}
                    </p>
                )}

                {!editingClasses ? (
                    profil?.classes?.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {profil.classes.map(c => (
                                <span key={c} className="chip chip--mint" style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px' }}>
                                    {c}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-soft)', fontSize: 13, fontWeight: 600 }}>
                            Aucune classe favorite. Tu les vois toutes.
                        </p>
                    )
                ) : (
                    <div>
                        <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 10 }}>
                            Sélectionne tes classes favorites :
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                            {allClasses.length === 0 ? (
                                <p style={{ fontSize: 12, color: 'var(--text-soft)' }}>Aucune classe disponible</p>
                            ) : (
                                allClasses.map(cl => {
                                    const code = cl.classe;
                                    const selected = selectedClasses.includes(code);
                                    return (
                                        <button
                                            key={code}
                                            type="button"
                                            onClick={() => toggleClass(code)}
                                            className={`chip ${selected ? 'chip--mint' : ''}`}
                                            style={{
                                                fontSize: 13,
                                                fontWeight: 700,
                                                padding: '6px 12px',
                                                cursor: 'pointer',
                                                border: selected ? '2px solid var(--mint)' : '2px solid var(--border)',
                                                background: selected ? 'var(--mint-lt)' : 'var(--surface)',
                                            }}
                                        >
                                            {selected ? '✓ ' : ''}{code}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                className="btn btn--mint"
                                style={{ flex: 1, fontSize: 13, padding: '8px 14px' }}
                                disabled={savingClasses}
                                onClick={handleSaveClasses}
                            >
                                {savingClasses ? 'Enregistrement…' : 'Enregistrer'}
                            </button>
                            <button
                                className="btn btn--ghost"
                                style={{ flex: 1, fontSize: 13, padding: '8px 14px' }}
                                disabled={savingClasses}
                                onClick={() => setEditingClasses(false)}
                            >
                                Annuler
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Déconnexion */}
            <button
                className="btn btn--ghost"
                style={{ width: '100%', fontSize: 15, color: 'var(--coral)' }}
                onClick={onLogout}
            >
                Se déconnecter
            </button>
        </div>
    );
}

/* ===================================================================
 * PROFIL ÉLÈVE
 * ================================================================= */
const BADGE_DEFS = {
    streak_10: { emoji: '🔥', name: 'Flamme', desc: 'Série de 10 sans faute' },
    streak_20: { emoji: '🔥🔥', name: 'Brasier', desc: 'Série de 20 sans faute' },
    streak_30: { emoji: '🌋', name: 'Volcan', desc: 'Série de 30 sans faute' },
    streak_50: { emoji: '☄️', name: 'Météore', desc: 'Série de 50 sans faute' },
    streak_100: { emoji: '💫', name: 'Légende', desc: 'Série de 100 sans faute' },
    speed_3s: { emoji: '⚡', name: 'Rapide', desc: 'Moyenne < 3s / question' },
    speed_2s: { emoji: '⚡⚡', name: 'Éclair', desc: 'Moyenne < 2s / question' },
    days_3: { emoji: '📅', name: 'Régulier', desc: '3 jours cette semaine' },
    days_7: { emoji: '🗓', name: 'Assidu', desc: '7 jours cette semaine' },
    climb_10: { emoji: '🧗', name: 'Grimpeur', desc: 'Table 10 en Montée' },
    climb_12: { emoji: '🧗‍♂️', name: 'Alpiniste', desc: 'Table 12 en Montée' },
    climb_15: { emoji: '🏔', name: 'Sommet', desc: 'Table 15 en Montée' },
    climb_20: { emoji: '🏔🏔', name: 'Légende des tables', desc: 'Table 20 en Montée' },
};

const AVATAR_OPTIONS = ['🦊', '🐼', '🐢', '🐙', '🦉', '🐝'];

const PALIER_STYLE = {
    decouverte: { label: 'Découverte', emoji: '🌱', color: 'var(--action)', bg: 'var(--ciel-pale)' },
    confirme:   { label: 'Confirmé',   emoji: '⭐', color: 'var(--indigo)', bg: 'var(--ciel-pale)' },
    expert:     { label: 'Expert',     emoji: '👑', color: 'var(--podium)', bg: 'var(--orange-pale)' },
};

function ProfileEleve({ onBack, identite, onLogout, onReviser }) {
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);
    const [profil, setProfil] = useState(null);
    const [records, setRecords] = useState(null);
    const [maitrise, setMaitrise] = useState({});
    const [badges, setBadges] = useState([]);
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [avatar, setAvatar] = useState(identite?.profil?.avatar_emoji || '🦊');
    const [showMastery, setShowMastery] = useState(true);
    const [tablesFaibles, setTablesFaibles] = useState(null);
    const [progression, setProgression] = useState(null);

    // --- Chargement du profil ---
    useEffect(() => {
        let annule = false;
        async function charger() {
            setLoading(true);
            setErreur(null);
            const res = await monProfil();
            if (annule) return;
            if (!res.ok) {
                setErreur(res.error || 'Impossible de charger le profil.');
                setLoading(false);
                return;
            }
            const d = res.data;
            setProfil(d.profil);
            setRecords(d.records);
            setMaitrise(d.maitrise || {});
            setBadges(d.badges || []);
            setProgression(d.progression || null);
            setAvatar(d.profil?.avatar_emoji || '🦊');
            setLoading(false);

            // Charger les tables faibles en arrière-plan
            const tf = await mesTablesFaibles();
            if (!annule && tf.ok) {
                setTablesFaibles(tf.data || []);
            }
        }
        charger();
        return () => { annule = true; };
    }, []);

    // --- Changement d'avatar ---
    const handleAvatar = useCallback(async (emoji) => {
        setAvatar(emoji);
        setShowAvatarPicker(false);
        await changerAvatar(emoji);
    }, []);

    // --- Réviser les cases rouges ---
    const handleReviser = useCallback(() => {
        if (tablesFaibles && tablesFaibles.length > 0) {
            onReviser(tablesFaibles);
        }
    }, [tablesFaibles, onReviser]);

    // --- Chargement ---
    if (loading) {
        return (
            <div className="screen-enter" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: '50vh', gap: 16,
            }}>
                <div className="spinner" />
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                    Chargement du profil…
                </p>
            </div>
        );
    }

    if (erreur) {
        return (
            <div className="screen-enter" style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--coral)', fontWeight: 700, fontSize: 16 }}>{erreur}</p>
                <button className="btn btn--ghost" style={{ marginTop: 16 }} onClick={onBack}>
                    ‹ Retour
                </button>
            </div>
        );
    }

    const plafond = profil?.plafond_tables || 10;
    const palierKey = profil?.palier || 'decouverte';
    const palier = PALIER_STYLE[palierKey] || PALIER_STYLE.decouverte;

    // Grille dimensionnée sur le plafond (1..plafond × 1..plafond)
    const gridTables = [];
    for (let i = 1; i <= plafond; i++) gridTables.push(i);

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            {/* Carte identité */}
            <div className="card" style={{ textAlign: 'center', marginBottom: 14 }}>
                <div
                    style={{ fontSize: 64, cursor: 'pointer', marginBottom: 8 }}
                    onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                    title="Changer d'avatar"
                >
                    {avatar}
                </div>

                {showAvatarPicker && (
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
                        marginBottom: 14, padding: 12, background: 'var(--surface-alt)', borderRadius: 16,
                    }}>
                        {AVATAR_OPTIONS.map(a => (
                            <button
                                key={a}
                                style={{
                                    fontSize: 28, background: avatar === a ? 'var(--gold-light)' : 'transparent',
                                    border: 'none', borderRadius: 10, padding: 6, cursor: 'pointer',
                                }}
                                onClick={() => handleAvatar(a)}
                            >
                                {a}
                            </button>
                        ))}
                    </div>
                )}

                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800 }}>
                    {profil?.prenom} {profil?.nom}
                </h2>
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                    {profil?.classe || ''} — {profil?.email || ''}
                </p>

                {/* Palier */}
                <span style={{
                    display: 'inline-block', padding: '6px 16px', borderRadius: 20,
                    fontWeight: 800, fontSize: 14,
                    color: palier.color, background: palier.bg,
                    border: `2px solid ${palier.color}`,
                }}>
                    {palier.emoji} {palier.label}
                </span>
                <p style={{ color: 'var(--text-soft)', fontSize: 12, fontWeight: 600, marginTop: 6 }}>
                    Tables débloquées : 1 à {plafond}
                </p>
            </div>

            {/* ===== Cette semaine ===== */}
            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
                    Cette semaine
                </h3>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 12 }}>
                    Le classement repart à zéro chaque lundi — tout le monde a sa chance.
                </p>

                {progression ? (
                    <>
                        {/* Score principal */}
                        <div style={{
                            textAlign: 'center', marginBottom: 14, padding: '16px 0',
                            background: 'var(--orange-pale)',
                            borderRadius: 14,
                        }}>
                            <div className="font-display" style={{ fontSize: 36, fontWeight: 800, color: 'var(--gold)' }}>
                                {progression.total ?? 0}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-soft)' }}>
                                Score de progression
                            </div>
                        </div>

                        {/* Composantes */}
                        <div className="stat-grid">
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--navy)' }}>
                                    {progression.points_jeu ?? 0}
                                </span>
                                <span className="stat__label">Points de jeu</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>
                                    +{progression.bonus_jours ?? 0}
                                </span>
                                <span className="stat__label">{progression.jours_actifs ?? 0} jour{(progression.jours_actifs ?? 0) > 1 ? 's' : ''} actif{(progression.jours_actifs ?? 0) > 1 ? 's' : ''}</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--mint-dk)' }}>
                                    +{progression.bonus_vertes ?? 0}
                                </span>
                                <span className="stat__label">{progression.cases_vertes ?? 0} case{(progression.cases_vertes ?? 0) > 1 ? 's' : ''} verte{(progression.cases_vertes ?? 0) > 1 ? 's' : ''}</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="stat-grid">
                        <div className="stat">
                            <span className="stat__value" style={{ color: 'var(--mint)' }}>
                                {records?.points_semaine || 0}
                            </span>
                            <span className="stat__label">Points semaine</span>
                        </div>
                        <div className="stat">
                            <span className="stat__value" style={{ color: 'var(--sky)' }}>
                                {records?.jours_actifs_7j || 0}
                            </span>
                            <span className="stat__label">Jours actifs (7j)</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ===== Depuis toujours ===== */}
            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
                    Depuis toujours
                </h3>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 12 }}>
                    Tes records personnels — ça ne recule jamais.
                </p>
                <div className="stat-grid">
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--coral)' }}>
                            {records?.meilleure_serie || 0}
                        </span>
                        <span className="stat__label">Meilleure série</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>
                            {records?.meilleur_chrono || 0}
                        </span>
                        <span className="stat__label">Score 2 min</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--purple)' }}>
                            {records?.plus_haute_table || 0}
                        </span>
                        <span className="stat__label">Plus haute table</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--navy)' }}>
                            {records?.nb_sessions || 0}
                        </span>
                        <span className="stat__label">Sessions jouées</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--gold)' }}>
                            {records?.points_total || 0}
                        </span>
                        <span className="stat__label">Points total</span>
                    </div>
                </div>
            </div>

            {/* Badges */}
            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
                    🏅 Mes badges
                </h3>

                {/* Badges obtenus */}
                {badges.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                        {badges.map(id => {
                            const badge = BADGE_DEFS[id];
                            if (!badge) return null;
                            return (
                                <div key={id} className="anim-pop" style={{
                                    background: 'var(--orange-pale)',
                                    borderRadius: 14, padding: '10px 14px', textAlign: 'center', minWidth: 80,
                                    border: '1px solid var(--gold-light)',
                                }}>
                                    <div style={{ fontSize: 28 }}>{badge.emoji}</div>
                                    <p className="font-display" style={{ fontWeight: 700, fontSize: 12, marginTop: 4 }}>{badge.name}</p>
                                    <p style={{ fontSize: 10, color: 'var(--text-soft)' }}>{badge.desc}</p>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Badges non obtenus */}
                {Object.keys(BADGE_DEFS).some(id => !badges.includes(id)) && (
                    <>
                        <p style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 8 }}>
                            À débloquer :
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {Object.entries(BADGE_DEFS)
                                .filter(([id]) => !badges.includes(id))
                                .map(([id, badge]) => (
                                    <div key={id} style={{
                                        background: 'var(--surface-alt)', borderRadius: 12, padding: '8px 12px',
                                        textAlign: 'center', minWidth: 70, opacity: 0.5,
                                    }}>
                                        <div style={{ fontSize: 22, filter: 'grayscale(1)' }}>{badge.emoji}</div>
                                        <p style={{ fontSize: 10, fontWeight: 600, marginTop: 2 }}>{badge.name}</p>
                                    </div>
                                ))
                            }
                        </div>
                    </>
                )}
            </div>

            {/* Grille de maîtrise */}
            <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <IconMaGrille size={22} color="var(--indigo)" actionColor="var(--ciel)" /> Grille de maîtrise
                    </h3>
                    <button
                        className="btn btn--ghost"
                        style={{ fontSize: 13, padding: '8px 12px' }}
                        onClick={() => setShowMastery(!showMastery)}
                    >
                        {showMastery ? 'Masquer' : 'Afficher'}
                    </button>
                </div>

                {showMastery && (
                    <div style={{ marginTop: 12 }}>
                        <div
                            className="mastery-grid"
                            style={{ gridTemplateColumns: `30px repeat(${gridTables.length}, 1fr)` }}
                        >
                            <div className="mastery-grid-hdr">×</div>
                            {gridTables.map(c => (
                                <div key={c} className="mastery-grid-hdr">{c}</div>
                            ))}
                            {gridTables.map(r => (
                                <React.Fragment key={r}>
                                    <div className="mastery-grid-hdr">{r}</div>
                                    {gridTables.map(c => {
                                        const key = cleFait(r, c);
                                        return (
                                            <div
                                                key={c}
                                                className="mastery-grid-cell"
                                                style={{ background: masteryColor(maitrise[key]) }}
                                                title={`${r}×${c} = ${r * c}`}
                                            />
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10, fontSize: 11, fontWeight: 700, flexWrap: 'wrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rouge)', display: 'inline-block' }} />
                                À revoir
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', display: 'inline-block' }} />
                                En cours
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--vert)', display: 'inline-block' }} />
                                Maîtrisé
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gris-inerte)', display: 'inline-block' }} />
                                Pas testé
                            </span>
                        </div>

                        {/* Bouton « Réviser mes cases rouges » */}
                        <div style={{ textAlign: 'center', marginTop: 14 }}>
                            {tablesFaibles === null ? (
                                <p style={{ fontSize: 13, color: 'var(--text-soft)' }}>Chargement…</p>
                            ) : tablesFaibles.length === 0 ? (
                                <p style={{
                                    fontSize: 15, fontWeight: 700, color: 'var(--mint)',
                                    padding: '10px 0',
                                }}>
                                    Aucune case rouge — bravo !
                                </p>
                            ) : (
                                <button
                                    className="btn btn--coral"
                                    style={{ fontSize: 16, padding: '12px 24px' }}
                                    onClick={handleReviser}
                                >
                                    Réviser mes cases rouges
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Déconnexion */}
            <button
                className="btn btn--ghost"
                style={{ width: '100%', fontSize: 15, color: 'var(--coral)' }}
                onClick={onLogout}
            >
                Se déconnecter
            </button>
        </div>
    );
}

```


## screens/Learn.jsx

`frontend/src/screens/Learn.jsx`

```jsx
import React, { useState, useEffect } from 'react';
import { ALL_TABLES, TIPS, BAR_COLORS } from '../logic/questions';

/**
 * Learn — Mode Apprendre (méthode Singapour / CPA)
 * Tables 1-15, CPA visualisations, skip counting, commutativité, astuces
 * Conservé et étendu depuis le prototype
 */
const LEARN_TABLES = ALL_TABLES; // 1 à 15

export default function Learn({ onBack }) {
    const [table, setTable] = useState(2);
    const [focus, setFocus] = useState(3);
    const [hide, setHide] = useState(false);
    const [revealed, setRevealed] = useState({});
    const [viz, setViz] = useState('groups');
    const [flipped, setFlipped] = useState(false);
    const multipliers = table <= 10 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

    useEffect(() => setRevealed({}), [table, hide]);

    const reveal = (m) => {
        setFocus(m);
        if (hide) setRevealed(r => ({ ...r, [m]: true }));
    };

    const a = flipped ? focus : table;
    const b = flipped ? table : focus;

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            {/* Sélecteur de table */}
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h2 className="font-display" style={{ fontSize: 26, fontWeight: 800 }}>
                        Table de {table}
                    </h2>
                    <button
                        className="btn btn--ghost"
                        style={{ fontSize: 14, padding: '8px 14px' }}
                        onClick={() => setHide(h => !h)}
                    >
                        {hide ? 'Montrer' : 'Cacher'}
                    </button>
                </div>
                <div className="chips" style={{ margin: '14px 0 4px' }}>
                    {LEARN_TABLES.map(t => (
                        <button
                            key={t}
                            className={`chip${t === table ? ' chip--sky' : ''}`}
                            onClick={() => { setTable(t); setFocus(3); setFlipped(false); }}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {/* Liste de la table */}
            <div className="card" style={{ marginTop: 14 }}>
                {multipliers.map(m => {
                    const show = !hide || revealed[m];
                    return (
                        <div
                            key={m}
                            className={`table-row${m === focus ? ' table-row--focus' : ''}`}
                            onClick={() => reveal(m)}
                        >
                            <span className="table-row__expr">{table} × {m}</span>
                            <span className={`table-row__result${show ? '' : ' table-row__hidden'}`}>
                                {show ? table * m : '?'}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Comptage par sauts */}
            <div className="card" style={{ marginTop: 14 }}>
                <p className="font-display" style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
                    Comptage par sauts de {table}
                </p>
                <div className="viz-skip">
                    {multipliers.map(m => (
                        <span
                            key={m}
                            className={`viz-skip-num${m <= focus ? ' viz-skip-num--hl' : ''}`}
                            onClick={() => reveal(m)}
                        >
                            {table * m}
                        </span>
                    ))}
                </div>
                <p className="font-display" style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-soft)', marginTop: 4 }}>
                    Touche un nombre pour explorer
                </p>
            </div>

            {/* Visualisation CPA */}
            <div className="card" style={{ marginTop: 14 }}>
                <p className="font-display" style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>
                    Visualiser {a} × {b} = {a * b}
                </p>

                {/* Toggle commutativité */}
                <label className="commutative-toggle" onClick={() => setFlipped(f => !f)}>
                    <input type="checkbox" checked={flipped} readOnly />
                    Commutativité : {table}×{focus} = {focus}×{table}
                </label>

                {/* Onglets de visualisation */}
                <div className="viz-tabs">
                    <button className={`viz-tab${viz === 'groups' ? ' viz-tab--active' : ''}`} onClick={() => setViz('groups')}>
                        Groupes
                    </button>
                    <button className={`viz-tab${viz === 'array' ? ' viz-tab--active' : ''}`} onClick={() => setViz('array')}>
                        Tableau
                    </button>
                    <button className={`viz-tab${viz === 'bar' ? ' viz-tab--active' : ''}`} onClick={() => setViz('bar')}>
                        Barre
                    </button>
                </div>

                {viz === 'groups' && <GroupsViz a={a} b={b} />}
                {viz === 'array' && <ArrayViz cols={a} rows={b} />}
                {viz === 'bar' && <BarViz a={a} b={b} />}
            </div>

            {/* Astuce */}
            {TIPS[table] && (
                <div className="tip-box">
                    <b>Astuce × {table} :</b> {TIPS[table]}
                </div>
            )}
        </div>
    );
}

/* --- Visualisations CPA --- */

function GroupsViz({ a, b }) {
    // Adapter la taille pour les tables > 10
    const itemSize = a > 8 || b > 8 ? 16 : 22;
    const groups = [];
    for (let g = 0; g < a; g++) {
        const items = [];
        for (let i = 0; i < b; i++) {
            items.push(
                <span
                    key={i}
                    className="viz-group-item"
                    style={itemSize !== 22 ? { width: itemSize, height: itemSize } : undefined}
                />
            );
        }
        groups.push(
            <div key={g} className="viz-group" style={{ maxWidth: Math.min(b, 5) * (itemSize + 8) + 20 }}>
                {items}
            </div>
        );
    }
    return (
        <div>
            <div className="viz-groups">{groups}</div>
            <p className="font-display" style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-soft)', marginTop: 4 }}>
                {a} groupe{a > 1 ? 's' : ''} de {b} = {a * b}
            </p>
        </div>
    );
}

function ArrayViz({ cols, rows }) {
    const dots = [];
    for (let i = 0; i < cols * rows; i++) dots.push(i);
    // Adapter la taille pour les tables > 10
    const size = cols > 10 ? 10 : cols > 8 ? 12 : 16;
    return (
        <div>
            <div className="viz-array" style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)` }}>
                {dots.map(i => (
                    <span key={i} className="viz-dot" style={{ width: size, height: size }} />
                ))}
            </div>
            <p className="font-display" style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-soft)', marginTop: 4 }}>
                {rows} ligne{rows > 1 ? 's' : ''} × {cols} colonne{cols > 1 ? 's' : ''} = {cols * rows}
            </p>
        </div>
    );
}

function BarViz({ a, b }) {
    const rows = [];
    for (let r = 0; r < a; r++) {
        const cells = [];
        for (let c = 0; c < b; c++) {
            cells.push(
                <div
                    key={c}
                    className="viz-bar-cell"
                    style={{ background: BAR_COLORS[r % BAR_COLORS.length], fontSize: b > 10 ? 10 : 14 }}
                >
                    {b <= 12 ? c + 1 + r * b : ''}
                </div>
            );
        }
        rows.push(<div key={r} className="viz-bar-row">{cells}</div>);
    }
    return (
        <div className="viz-bar-wrap">
            {rows}
            <div className="viz-bar-total">{a} × {b} = {a * b}</div>
        </div>
    );
}

```


## screens/Login.jsx — connexion et compte non reconnu

`frontend/src/screens/Login.jsx`

```jsx
import React, { useState, useEffect, useRef } from 'react';
import branding from '../branding';
import { connexionGoogle, demanderCode, verifierCode, quiSuisJe } from '../api';

/**
 * Passer à true quand le SMTP Workspace sera configuré.
 * Tant que false, le lien de secours par e-mail n'apparaît pas.
 */
const SECOURS_EMAIL_ACTIF = false;

/**
 * Login — Écran de connexion
 *
 * Trois états :
 *   'principal'  →  bouton Google + lien de secours (si SMTP configuré)
 *   'email'      →  secours OTP : saisie de l'adresse e-mail
 *   'code'       →  secours OTP : saisie du code à 6 chiffres
 *
 * Après connexion réussie (Google ou OTP), on appelle quiSuisJe()
 * et on remonte le résultat à App.jsx via onIdentite(data).
 * Le cas 'inconnu' est traité par App.jsx, pas ici.
 */
export default function Login({ onIdentite }) {
    const [etape, setEtape] = useState('principal');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [logoError, setLogoError] = useState(false);

    // Compte à rebours pour "Redemander un code"
    const [cooldown, setCooldown] = useState(0);
    const cooldownRef = useRef(null);

    useEffect(() => {
        return () => {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
        };
    }, []);

    function demarrerCooldown() {
        setCooldown(60);
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        cooldownRef.current = setInterval(() => {
            setCooldown(prev => {
                if (prev <= 1) {
                    clearInterval(cooldownRef.current);
                    cooldownRef.current = null;
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }

    // ---- Connexion Google ----
    const handleGoogle = async () => {
        setError('');
        setLoading(true);
        const res = await connexionGoogle();
        // Si erreur (rare : navigateur bloque le popup, etc.)
        if (!res.ok) {
            setError(res.error);
            setLoading(false);
        }
        // Si ok : la page redirige, on ne revient pas ici
    };

    // ---- Secours OTP : demander un code ----
    const handleDemanderCode = async (e) => {
        e.preventDefault();
        const emailTrimme = email.trim();
        if (!emailTrimme) {
            setError('Entre ton adresse e-mail scolaire.');
            return;
        }
        setLoading(true);
        setError('');

        const res = await demanderCode(emailTrimme);
        setLoading(false);

        if (res.ok) {
            setEtape('code');
            setCode('');
            demarrerCooldown();
        } else {
            setError(res.error);
        }
    };

    // ---- Secours OTP : vérifier le code ----
    const handleVerifierCode = async (e) => {
        e.preventDefault();
        const codeTrimme = code.trim();
        if (codeTrimme.length < 6) {
            setError('Le code contient 6 chiffres.');
            return;
        }
        setLoading(true);
        setError('');

        const res = await verifierCode(email.trim(), codeTrimme);
        if (!res.ok) {
            setError(res.error);
            setLoading(false);
            return;
        }

        // Connexion réussie → quiSuisJe
        const qui = await quiSuisJe();
        setLoading(false);

        if (!qui.ok) {
            setError(qui.error || 'Impossible de charger ton profil.');
            return;
        }

        // Remonter à App.jsx — y compris le cas 'inconnu'
        onIdentite(qui.data);
    };

    // ---- Redemander un code ----
    const handleRedemander = async () => {
        if (cooldown > 0) return;
        setLoading(true);
        setError('');
        const res = await demanderCode(email.trim());
        setLoading(false);
        if (res.ok) {
            demarrerCooldown();
        } else {
            setError(res.error);
        }
    };

    // ====================== RENDU ======================

    return (
        <div className="screen-enter" style={{ paddingTop: 32 }}>
            {/* Logo + titre */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
                {!logoError ? (
                    <img
                        src={branding.logoPath}
                        alt={branding.appName}
                        style={{
                            width: 80, height: 80, borderRadius: 16,
                            objectFit: 'contain', marginBottom: 12,
                        }}
                        onError={() => setLogoError(true)}
                    />
                ) : (
                    <div style={{
                        width: 80, height: 80, borderRadius: 16,
                        margin: '0 auto 12px',
                        background: 'var(--indigo)',
                        color: 'var(--gold)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-display)', fontWeight: 800,
                        fontSize: 24, letterSpacing: 2,
                    }}>
                        {branding.monogram}
                    </div>
                )}
                <h1 className="font-display" style={{
                    fontSize: 'clamp(24px, 7vw, 34px)', fontWeight: 800,
                    color: 'var(--navy)', letterSpacing: -0.5, lineHeight: 1.1,
                }}>
                    {branding.appName}
                </h1>
                <p style={{
                    color: 'var(--text-soft)', fontWeight: 700,
                    fontSize: 14, marginTop: 4,
                }}>
                    {branding.baseline}
                </p>
            </div>

            {/* Card de connexion */}
            <div className="card">

                {/* ========== ÉTAT PRINCIPAL ========== */}
                {etape === 'principal' && (
                    <>
                        <h2 className="font-display" style={{
                            fontSize: 22, fontWeight: 800,
                            marginBottom: 20, textAlign: 'center',
                        }}>
                            Connexion
                        </h2>

                        {/* Message d'erreur */}
                        {error && <ErreurMsg>{error}</ErreurMsg>}

                        {/* Bouton Google — le chemin principal */}
                        <button
                            className="btn btn--navy"
                            disabled={loading}
                            onClick={handleGoogle}
                            style={{
                                width: '100%', fontSize: 18, padding: 16,
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: 10,
                            }}
                        >
                            {loading ? (
                                'Redirection…'
                            ) : (
                                <>
                                    <GoogleIcon />
                                    Se connecter avec Google
                                </>
                            )}
                        </button>

                        <p style={{
                            fontSize: 12, color: 'var(--text-soft)',
                            fontWeight: 600, textAlign: 'center', marginTop: 12,
                        }}>
                            Utilise ton compte <b style={{ color: 'var(--navy)' }}>@saintho.fr</b>
                        </p>

                        {/* Lien de secours — uniquement si SMTP configuré */}
                        {SECOURS_EMAIL_ACTIF && (
                            <div style={{ textAlign: 'center', marginTop: 20 }}>
                                <button
                                    style={{
                                        background: 'none', border: 'none',
                                        cursor: 'pointer', color: 'var(--text-soft)',
                                        fontWeight: 600, fontSize: 13,
                                        textDecoration: 'underline',
                                    }}
                                    onClick={() => {
                                        setEtape('email');
                                        setError('');
                                    }}
                                >
                                    Je n'arrive pas à me connecter avec Google
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* ========== SECOURS : SAISIE EMAIL ========== */}
                {etape === 'email' && (
                    <>
                        <h2 className="font-display" style={{
                            fontSize: 20, fontWeight: 800,
                            marginBottom: 16, textAlign: 'center',
                        }}>
                            Connexion par e-mail
                        </h2>

                        {error && <ErreurMsg>{error}</ErreurMsg>}

                        <form onSubmit={handleDemanderCode}>
                            <div style={{ marginBottom: 14 }}>
                                <label style={{
                                    fontWeight: 700, fontSize: 14,
                                    color: 'var(--text-soft)',
                                    display: 'block', marginBottom: 6,
                                }}>
                                    Adresse e-mail scolaire
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="prenom.nom@saintho.fr"
                                    autoComplete="email"
                                    autoFocus
                                    style={champStyle}
                                    onFocus={e => e.target.style.borderColor = 'var(--sky)'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn btn--navy"
                                disabled={loading}
                                style={{ width: '100%', fontSize: 17, padding: 14 }}
                            >
                                {loading ? 'Envoi…' : 'Recevoir mon code'}
                            </button>
                        </form>

                        <div style={{ textAlign: 'center', marginTop: 14 }}>
                            <button
                                style={lienStyle}
                                onClick={() => {
                                    setEtape('principal');
                                    setError('');
                                }}
                            >
                                ← Retour à la connexion Google
                            </button>
                        </div>
                    </>
                )}

                {/* ========== SECOURS : SAISIE CODE 6 CHIFFRES ========== */}
                {etape === 'code' && (
                    <>
                        <h2 className="font-display" style={{
                            fontSize: 20, fontWeight: 800,
                            marginBottom: 8, textAlign: 'center',
                        }}>
                            Vérifie tes mails
                        </h2>

                        <p style={{
                            fontSize: 14, color: 'var(--text-soft)',
                            fontWeight: 600, textAlign: 'center',
                            marginBottom: 16, lineHeight: 1.4,
                        }}>
                            Un code à 6 chiffres a été envoyé à{' '}
                            <b style={{ color: 'var(--navy)' }}>{email.trim()}</b>
                        </p>

                        {error && <ErreurMsg>{error}</ErreurMsg>}

                        <form onSubmit={handleVerifierCode}>
                            <div style={{ marginBottom: 14 }}>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    autoComplete="one-time-code"
                                    value={code}
                                    onChange={e => setCode(
                                        e.target.value.replace(/\D/g, '').slice(0, 6)
                                    )}
                                    placeholder="• • • • • •"
                                    autoFocus
                                    style={{
                                        ...champStyle,
                                        fontSize: 28, textAlign: 'center',
                                        letterSpacing: 10,
                                        fontFamily: 'var(--font-display)',
                                    }}
                                    onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn btn--navy"
                                disabled={loading || codeOtp.length < 6}
                                style={{ width: '100%', fontSize: 17, padding: 14 }}
                            >
                                {loading ? 'Vérification…' : 'Valider'}
                            </button>
                        </form>

                        {/* Redemander un code — avec cooldown */}
                        <div style={{
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', gap: 8, marginTop: 14,
                        }}>
                            <button
                                style={{
                                    ...lienStyle,
                                    opacity: cooldown > 0 ? 0.5 : 1,
                                    cursor: cooldown > 0 ? 'default' : 'pointer',
                                }}
                                disabled={cooldown > 0}
                                onClick={handleRedemander}
                            >
                                {cooldown > 0
                                    ? `Redemander un code (${cooldown}s)`
                                    : 'Je n\'ai rien reçu — redemander'}
                            </button>

                            <button
                                style={lienStyle}
                                onClick={() => {
                                    setEtape('email');
                                    setCode('');
                                    setError('');
                                }}
                            >
                                Changer d'adresse
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ====================== Composants utilitaires ======================

function ErreurMsg({ children }) {
    return (
        <p style={{
            color: 'var(--erreur-eleve)', fontWeight: 700, fontSize: 14,
            textAlign: 'center', marginBottom: 14,
            background: 'var(--rouge-pale)', borderRadius: 12,
            padding: '10px 14px',
        }}>
            {children}
        </p>
    );
}

/** Icône Google simplifiée — servie depuis public/google-icon.svg */
function GoogleIcon() {
    return (
        <img src="/google-icon.svg" width="20" height="20" alt="Google" style={{ flexShrink: 0 }} />
    );
}

// ====================== Styles partagés ======================

const champStyle = {
    width: '100%', padding: '14px 16px', borderRadius: 14,
    border: '2px solid var(--border)', fontSize: 16,
    fontFamily: 'var(--font-body)', outline: 'none',
    transition: 'border-color 0.2s',
};

const lienStyle = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-soft)', fontWeight: 600, fontSize: 13,
    textDecoration: 'underline',
};

```


## screens/Admin.jsx — eleves, enseignants, import, journal

`frontend/src/screens/Admin.jsx`

```jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { masteryColor } from '../logic/mastery';
import {
    listeClasses, ajouterEleve, modifierEleve, desactiverEleve, reactiverEleve,
    definirPlafondClasse, listeEleves,
    listeProfs, creerProf, modifierProf, desactiverProf,
    importerEleves, reparerRattachements, journalAdmin,
} from '../api.js';
import { IconProf, IconDocument, IconAdmin } from '../components/Icons';

/**
 * Admin — Dashboard enseignant / administrateur
 *
 * Onglets visibles :
 *   - Élèves          (tout enseignant)
 *   - Enseignants      (admin seulement)
 *   - Import           (admin seulement)
 *   - Journal          (admin seulement)
 *
 * Les classes viennent de listeClasses(), jamais d'une constante.
 */

export default function Admin({ onBack, identite, onIdentiteChange }) {
    const estAdmin = identite?.admin === true;
    const [tab, setTab] = useState('eleves');
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState('');
    const [loading, setLoading] = useState(true);

    // Charger les classes au montage
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            const res = await listeClasses();
            if (cancelled) return;
            if (res.ok && res.data) {
                setClasses(res.data);
                if (res.data.length > 0 && !selectedClass) {
                    setSelectedClass(res.data[0].classe);
                }
            }
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    const refreshClasses = useCallback(async () => {
        const res = await listeClasses();
        if (res.ok && res.data) setClasses(res.data);
    }, []);

    const tabs = [
        { id: 'eleves', label: 'Élèves' },
        ...(estAdmin ? [
            { id: 'profs', label: 'Enseignants' },
            { id: 'import', label: 'Import' },
            { id: 'journal', label: 'Journal' },
        ] : []),
    ];

    const currentClassInfo = classes.find(c => c.classe === selectedClass);

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800, color: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <IconAdmin size={26} color="var(--indigo)" /> Administration
                </h1>
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 13 }}>
                    {identite?.nom || 'Enseignant'}{estAdmin ? ' — admin' : ''}
                </p>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <div className="spinner" />
                </div>
            ) : (
                <>
                    {/* Sélecteur de classe */}
                    {classes.length > 0 && (tab === 'eleves') && (
                        <div className="chips" style={{ justifyContent: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                            {classes.map(c => (
                                <button
                                    key={c.classe}
                                    className={`chip${c.classe === selectedClass ? ' chip--navy' : ''}`}
                                    style={{ minWidth: 50, height: 42, fontSize: 16 }}
                                    onClick={() => setSelectedClass(c.classe)}
                                >
                                    {c.classe}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Onglets */}
                    <div className="viz-tabs" style={{ marginBottom: 14 }}>
                        {tabs.map(t => (
                            <button
                                key={t.id}
                                className={`viz-tab${tab === t.id ? ' viz-tab--active' : ''}`}
                                onClick={() => setTab(t.id)}
                                style={{ fontSize: 13 }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {tab === 'eleves' && (
                        <ElevesTab
                            selectedClass={selectedClass}
                            classInfo={currentClassInfo}
                            onRefresh={refreshClasses}
                            estAdmin={estAdmin}
                        />
                    )}
                    {tab === 'profs' && estAdmin && <ProfsTab identite={identite} onIdentiteChange={onIdentiteChange} />}
                    {tab === 'import' && estAdmin && <ImportTab onRefresh={refreshClasses} />}
                    {tab === 'journal' && estAdmin && <JournalTab />}
                </>
            )}
        </div>
    );
}

/* ===================== ÉLÈVES ===================== */

function ElevesTab({ selectedClass, classInfo, onRefresh, estAdmin }) {
    const [eleves, setEleves] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [showInactifs, setShowInactifs] = useState(false);
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(null); // eleveId en cours d'action

    // Plafond
    const [plafondEnCours, setPlafondEnCours] = useState(false);

    const charger = useCallback(async () => {
        if (!selectedClass) return;
        setLoading(true);
        // On charge la liste des élèves sans connexion pour cette classe
        const res = await listeEleves(selectedClass);
        if (res.ok && res.data) {
            setEleves(res.data);
        }
        setLoading(false);
    }, [selectedClass]);

    useEffect(() => { charger(); }, [charger]);

    const handleToggleActif = async (eleve) => {
        // Confirmation avant désactivation
        if (eleve.actif !== false) {
            const ok = window.confirm(`Désactiver ${eleve.prenom || ''} ${eleve.nom || ''} ? L'élève ne pourra plus se connecter.`);
            if (!ok) return;
        }
        setBusy(eleve.eleve_id);
        setMsg('');
        const res = eleve.actif
            ? await desactiverEleve(eleve.eleve_id)
            : await reactiverEleve(eleve.eleve_id);
        if (!res.ok) setMsg(`❌ ${res.error}`);
        else {
            setMsg(eleve.actif ? '✅ Élève désactivé' : '✅ Élève réactivé');
            await charger();
            await onRefresh();
        }
        setBusy(null);
    };

    const handlePlafond = async (plafond) => {
        setPlafondEnCours(true);
        setMsg('');
        const res = await definirPlafondClasse(selectedClass, plafond);
        if (res.ok) {
            setMsg(`✅ Plafond de ${selectedClass} → tables 1-${plafond}`);
            await onRefresh();
        } else {
            setMsg(`❌ ${res.error}`);
        }
        setPlafondEnCours(false);
    };

    const actifs = eleves.filter(e => e.actif !== false);
    const inactifs = eleves.filter(e => e.actif === false);

    if (!selectedClass) {
        return (
            <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                <p style={{ color: 'var(--text-soft)', fontWeight: 700 }}>
                    Aucune classe disponible. Importez des élèves pour commencer.
                </p>
            </div>
        );
    }

    return (
        <div>
            {/* Info classe */}
            <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800 }}>
                        Classe {selectedClass} — {classInfo?.eleves_actifs ?? actifs.length} élève{(classInfo?.eleves_actifs ?? actifs.length) > 1 ? 's' : ''} actif{(classInfo?.eleves_actifs ?? actifs.length) > 1 ? 's' : ''}
                    </h3>
                    <button className="btn btn--mint" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => setShowAdd(!showAdd)}>
                        + Ajouter
                    </button>
                </div>

                {showAdd && <AddStudentForm selectedClass={selectedClass} onDone={async () => { setShowAdd(false); await charger(); await onRefresh(); }} />}

                {msg && (
                    <p style={{ fontSize: 12, fontWeight: 700, padding: '6px 0', color: msg.startsWith('❌') ? 'var(--coral)' : 'var(--mint-dk)' }}>
                        {msg}
                    </p>
                )}

                {loading ? (
                    <div style={{ textAlign: 'center', padding: 20 }}>
                        <div className="spinner" />
                    </div>
                ) : actifs.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-soft)', fontWeight: 600, padding: 20 }}>
                        Aucun élève actif dans cette classe. Utilisez « + Ajouter » ou l'onglet Import.
                    </p>
                ) : (
                    actifs.map(s => (
                        <StudentRow
                            key={s.eleve_id}
                            eleve={s}
                            busy={busy === s.eleve_id}
                            onToggle={() => handleToggleActif(s)}
                        />
                    ))
                )}

                {/* Inactifs repliés */}
                {inactifs.length > 0 && (
                    <>
                        <button
                            className="btn btn--ghost"
                            style={{ width: '100%', marginTop: 10, fontSize: 12 }}
                            onClick={() => setShowInactifs(!showInactifs)}
                        >
                            {showInactifs ? '▾' : '▸'} {inactifs.length} élève{inactifs.length > 1 ? 's' : ''} inactif{inactifs.length > 1 ? 's' : ''}
                        </button>
                        {showInactifs && inactifs.map(s => (
                            <StudentRow
                                key={s.eleve_id}
                                eleve={s}
                                busy={busy === s.eleve_id}
                                onToggle={() => handleToggleActif(s)}
                            />
                        ))}
                    </>
                )}
            </div>

            {/* Plafond de tables */}
            {estAdmin && (
                <div className="card" style={{ marginBottom: 14 }}>
                    <h3 className="font-display" style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
                        Plafond de tables — {selectedClass}
                    </h3>
                    <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 10 }}>
                        Relève le plafond quand la classe est prête. Ne redescend jamais un élève qui a débloqué plus haut.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {[10, 12, 15, 20].map(n => (
                            <button
                                key={n}
                                className="chip"
                                style={{ flex: 1, width: 'auto', fontSize: 15, height: 46 }}
                                disabled={plafondEnCours}
                                onClick={() => handlePlafond(n)}
                            >
                                1-{n}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function StudentRow({ eleve, busy, onToggle }) {
    const nom = eleve.nom || '';
    const prenom = eleve.prenom || '';
    const email = eleve.email || '';
    const dejaConnecte = eleve.deja_connecte === true;
    const nbSessions = eleve.nb_sessions ?? 0;

    return (
        <div className="admin-row" style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
            borderBottom: '1px solid var(--border)',
            opacity: eleve.actif === false ? 0.5 : 1,
        }}>
            <span style={{ fontSize: 22 }}>{eleve.avatar_emoji || '🦊'}</span>
            <div style={{ flex: 1 }}>
                <p className="font-display" style={{ fontWeight: 700, fontSize: 14 }}>
                    {prenom} {nom}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                    {email}
                    {!dejaConnecte && (
                        <span style={{ marginLeft: 6, color: 'var(--coral)', fontWeight: 700 }}>
                            compte Google pas encore rattaché
                        </span>
                    )}
                    {dejaConnecte && nbSessions === 0 && (
                        <span style={{ marginLeft: 6, color: 'var(--text-soft)', fontWeight: 600 }}>
                            ◻︎ compte rattaché — n'a pas encore joué
                        </span>
                    )}
                    {dejaConnecte && nbSessions > 0 && (
                        <span style={{ marginLeft: 6, color: 'var(--text-soft)', fontWeight: 600 }}>
                            · {nbSessions} partie{nbSessions > 1 ? 's' : ''}
                        </span>
                    )}
                </p>
            </div>
            <button
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '4px 8px', fontWeight: 700, color: eleve.actif === false ? 'var(--succes)' : 'var(--coral)', opacity: busy ? 0.4 : 1 }}
                onClick={onToggle}
                disabled={busy}
            >
                {eleve.actif === false ? 'Réactiver' : 'Désactiver'}
            </button>
        </div>
    );
}

function AddStudentForm({ selectedClass, onDone }) {
    const [nom, setNom] = useState('');
    const [prenom, setPrenom] = useState('');
    const [email, setEmail] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    const handleAdd = async () => {
        if (!nom.trim() || !prenom.trim() || !email.trim()) {
            setMsg('❌ Tous les champs sont obligatoires.');
            return;
        }
        setBusy(true);
        setMsg('');
        const res = await ajouterEleve({
            email: email.trim(),
            nom: nom.trim(),
            prenom: prenom.trim(),
            classe: selectedClass,
        });
        if (res.ok) {
            await onDone();
        } else {
            setMsg(`❌ ${res.error}`);
            setBusy(false);
        }
    };

    return (
        <div style={{ background: 'var(--surface-alt)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input placeholder="Prénom" value={prenom} onChange={e => setPrenom(e.target.value)}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)' }} />
                <input placeholder="Nom" value={nom} onChange={e => setNom(e.target.value)}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)' }} />
            </div>
            <input placeholder="Email Google" value={email} onChange={e => setEmail(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '2px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', marginBottom: 8 }} />
            {msg && <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral)', marginBottom: 6 }}>{msg}</p>}
            <button className="btn btn--mint" style={{ width: '100%', fontSize: 14, padding: 10 }} onClick={handleAdd} disabled={busy}>
                {busy ? '⏳...' : "Ajouter l'élève"}
            </button>
        </div>
    );
}

/* ===================== ENSEIGNANTS (admin) ===================== */

function ProfsTab({ identite, onIdentiteChange }) {
    const [profs, setProfs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(null);

    const monId = identite?.profil?.id || null;

    const charger = useCallback(async () => {
        setLoading(true);
        const res = await listeProfs();
        if (res.ok && res.data) setProfs(res.data);
        setLoading(false);
    }, []);

    useEffect(() => { charger(); }, [charger]);

    const handleToggle = async (prof) => {
        if (prof.prof_id === monId) return; // impossible de se désactiver soi-même
        const ok = window.confirm(`Désactiver ${prof.nom} ? Ce compte enseignant ne pourra plus se connecter.`);
        if (!ok) return;
        setBusy(prof.prof_id);
        setMsg('');
        if (prof.actif) {
            const res = await desactiverProf(prof.prof_id);
            if (res.ok) {
                setMsg('✅ Enseignant désactivé');
                await charger();
                onIdentiteChange?.();
            } else {
                setMsg(`❌ ${res.error}`);
            }
        }
        setBusy(null);
    };

    const handleRoleChange = async (prof, newRole) => {
        if (prof.prof_id === monId) return; // interdit de se changer soi-même
        const action = newRole === 'admin'
            ? `Donner les droits d'administrateur à ${prof.nom} ?`
            : `Retirer les droits d'administrateur à ${prof.nom} ?`;
        const ok = window.confirm(action);
        if (!ok) return;
        setBusy(prof.prof_id);
        setMsg('');
        const res = await modifierProf(prof.prof_id, { role: newRole });
        if (res.ok) {
            setMsg(`✅ ${prof.nom} → ${newRole}`);
            await charger();
            onIdentiteChange?.();
        } else {
            // Messages de la base : "Impossible : c'est le dernier administrateur actif."
            // "Réservé à l'administrateur" etc. — on les affiche tels quels
            setMsg(`❌ ${res.error}`);
        }
        setBusy(null);
    };

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800 }}>
                    Enseignants — {profs.filter(p => p.actif).length} actif{profs.filter(p => p.actif).length > 1 ? 's' : ''}
                </h3>
                <button className="btn btn--mint" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => setShowAdd(!showAdd)}>
                    + Ajouter
                </button>
            </div>

            {showAdd && <AddProfForm onDone={async () => { setShowAdd(false); await charger(); }} />}

            {msg && (
                <p style={{ fontSize: 12, fontWeight: 700, padding: '6px 0', color: msg.startsWith('❌') ? 'var(--coral)' : 'var(--mint-dk)' }}>
                    {msg}
                </p>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" /></div>
            ) : profs.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-soft)', fontWeight: 600, padding: 20 }}>
                    Aucun enseignant trouvé.
                </p>
            ) : (
                profs.filter(p => p.actif).map(p => {
                    const estMoi = p.prof_id === monId;
                    return (
                        <div key={p.prof_id} className="admin-row" style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
                            borderBottom: '1px solid var(--border)',
                        }}>
                            <IconProf size={22} color="var(--indigo)" />
                            <div style={{ flex: 1 }}>
                                <p className="font-display" style={{ fontWeight: 700, fontSize: 14 }}>
                                    {p.nom}{estMoi && <span style={{ color: 'var(--text-soft)', fontWeight: 600 }}> (toi)</span>}
                                </p>
                                <p style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                                    {p.email}
                                    {p.classes?.length > 0 && ` — ${p.classes.join(', ')}`}
                                </p>
                            </div>
                            {estMoi ? (
                                /* Étiquette non cliquable pour soi-même */
                                <span
                                    className={`chip${p.role === 'admin' ? ' chip--gold' : ''}`}
                                    style={{ fontSize: 11, height: 28, minWidth: 60, cursor: 'default', pointerEvents: 'none' }}
                                >
                                    {p.role === 'admin' ? 'Admin' : 'Prof'}
                                </span>
                            ) : (
                                /* Menu déroulant pour les autres */
                                <select
                                    value={p.role}
                                    disabled={busy === p.prof_id}
                                    onChange={(e) => handleRoleChange(p, e.target.value)}
                                    style={{
                                        fontSize: 13, fontWeight: 700, padding: '6px 10px',
                                        borderRadius: 10, border: '2px solid var(--border)',
                                        background: p.role === 'admin' ? 'var(--gold-light)' : 'var(--surface)',
                                        color: 'var(--navy)', cursor: 'pointer',
                                        fontFamily: 'var(--font-body)',
                                    }}
                                >
                                    <option value="prof">Prof</option>
                                    <option value="admin">Admin</option>
                                </select>
                            )}
                            {!estMoi && (
                                <button
                                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '4px 8px', fontWeight: 700, color: 'var(--coral)', opacity: busy === p.prof_id ? 0.4 : 1 }}
                                    onClick={() => handleToggle(p)}
                                    disabled={busy === p.prof_id}
                                >
                                    Désactiver
                                </button>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}

function AddProfForm({ onDone }) {
    const [nom, setNom] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('prof');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    const handleAdd = async () => {
        if (!nom.trim() || !email.trim()) { setMsg('❌ Nom et email requis.'); return; }
        setBusy(true); setMsg('');
        const res = await creerProf({ email: email.trim(), nom: nom.trim(), role });
        if (res.ok) { await onDone(); }
        else { setMsg(`❌ ${res.error}`); setBusy(false); }
    };

    return (
        <div style={{ background: 'var(--surface-alt)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input placeholder="Nom" value={nom} onChange={e => setNom(e.target.value)}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)' }} />
                <input placeholder="Email Google" value={email} onChange={e => setEmail(e.target.value)}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button className={`chip${role === 'prof' ? ' chip--navy' : ''}`}
                    style={{ flex: 1, height: 38, fontSize: 14 }} onClick={() => setRole('prof')}>Prof</button>
                <button
                    type="button"
                    className={`btn ${role === 'admin' ? 'btn--gold' : 'btn--ghost'}`}
                    style={{ flex: 1, height: 38, fontSize: 14 }} onClick={() => setRole('admin')}>Admin</button>
            </div>
            {msg && <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral)', marginBottom: 6 }}>{msg}</p>}
            <button className="btn btn--mint" style={{ width: '100%', fontSize: 14, padding: 10 }} onClick={handleAdd} disabled={busy}>
                {busy ? '⏳...' : "Ajouter l'enseignant"}
            </button>
        </div>
    );
}

/* ===================== IMPORT (admin) ===================== */

function ImportTab({ onRefresh }) {
    const [csv, setCsv] = useState('');
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef(null);

    const handleFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setCsv(ev.target.result);
        reader.readAsText(file);
    };

    const handleImport = async () => {
        if (!csv.trim()) return;
        setBusy(true); setResult(null);

        // Parse CSV : email, nom, prenom, classe
        const lines = csv.trim().split('\n').filter(l => l.trim());
        const eleves = [];
        for (const line of lines) {
            const parts = line.split(/[,;\t]/).map(s => s.trim());
            if (parts.length < 4) continue;
            // Skip header
            if (parts[0].toLowerCase() === 'email') continue;
            eleves.push({ email: parts[0], nom: parts[1], prenom: parts[2], classe: parts[3] });
        }

        if (eleves.length === 0) {
            setResult({ ok: false, error: 'Aucun élève trouvé. Format : email, nom, prénom, classe' });
            setBusy(false);
            return;
        }

        const res = await importerEleves(eleves);
        setResult(res.ok ? res.data : { error: res.error });
        if (res.ok) await onRefresh();
        setBusy(false);
    };

    return (
        <div className="card">
            <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                Import de rentrée
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 12 }}>
                Fichier CSV : <b>email, nom, prénom, classe</b> — un élève par ligne.
                L'import ne désactive jamais personne.
            </p>

            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile}
                style={{ marginBottom: 10, fontSize: 13 }} />

            {csv && (
                <div style={{ background: 'var(--surface-alt)', borderRadius: 10, padding: 10, marginBottom: 10, maxHeight: 150, overflow: 'auto' }}>
                    <pre style={{ fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                        {csv.slice(0, 1000)}{csv.length > 1000 ? '\n…' : ''}
                    </pre>
                </div>
            )}

            <button className="btn btn--gold" style={{ width: '100%', fontSize: 14, padding: 12 }}
                onClick={handleImport} disabled={busy || !csv.trim()}>
                {busy ? '⏳ Import en cours…' : "Lancer l'import"}
            </button>

            {result && (
                <div style={{ marginTop: 14 }}>
                    {result.error ? (
                        <p style={{ color: 'var(--coral)', fontWeight: 700, fontSize: 13 }}>❌ {result.error}</p>
                    ) : (
                        <>
                            <div style={{ background: 'var(--surface-alt)', borderRadius: 10, padding: 12, border: '1px solid var(--border)' }}>
                                <p style={{ color: 'var(--navy)', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                                    ✅ Import terminé
                                </p>
                                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                                    {result.crees ?? 0} élève{(result.crees ?? 0) > 1 ? 's' : ''} créé{(result.crees ?? 0) > 1 ? 's' : ''}, {result.mis_a_jour ?? 0} mis à jour.
                                    {' '}
                                    {(result.rattaches ?? 0) > 0
                                        ? `${result.rattaches} ${(result.rattaches ?? 0) > 1 ? 'avaient' : 'avait'} déjà un compte Google : ${(result.rattaches ?? 0) > 1 ? 'ils ont été rattachés' : 'il a été rattaché'}.`
                                        : 'Aucun compte Google préexistant à rattacher.'}
                                </p>
                            </div>
                            {result.lignes_ignorees?.length > 0 && (
                                <div style={{ background: 'var(--orange-pale)', borderRadius: 10, padding: 10, marginTop: 8, border: '1px solid var(--bordure)' }}>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--erreur-eleve)', marginBottom: 4 }}>
                                        ⚠️ {result.lignes_ignorees.length} ligne{result.lignes_ignorees.length > 1 ? 's' : ''} ignorée{result.lignes_ignorees.length > 1 ? 's' : ''}
                                    </p>
                                    {result.lignes_ignorees.slice(0, 10).map((l, i) => (
                                        <p key={i} style={{ fontSize: 11, color: 'var(--gris)' }}>{l.raison}: {l.email || '(vide)'}</p>
                                    ))}
                                </div>
                            )}
                            {result.actifs_absents_du_fichier?.length > 0 && (
                                <div style={{ background: 'var(--orange-pale)', borderRadius: 10, padding: 10, marginTop: 8, border: '1px solid var(--bordure)' }}>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)', marginBottom: 4 }}>
                                        ℹ️ {result.actifs_absents_du_fichier.length} élève{result.actifs_absents_du_fichier.length > 1 ? 's' : ''} actif{result.actifs_absents_du_fichier.length > 1 ? 's' : ''} absent{result.actifs_absents_du_fichier.length > 1 ? 's' : ''} du fichier
                                    </p>
                                    <p style={{ fontSize: 11, color: 'var(--gris)' }}>
                                        Vérifiez au cas par cas — l'import ne les a pas désactivés.
                                    </p>
                                    {result.actifs_absents_du_fichier.slice(0, 10).map((e, i) => (
                                        <p key={i} style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 2 }}>
                                            {e.prenom} {e.nom} ({e.classe})
                                        </p>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Section Réparation des rattachements */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <h4 className="font-display" style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
                    Rattachement des comptes Google
                </h4>
                <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 10 }}>
                    À lancer après chaque import ou si un élève s'est connecté avant la création de sa fiche.
                </p>
                <RepairButton onRefresh={onRefresh} />
            </div>
        </div>
    );
}

/* ===================== JOURNAL (admin) ===================== */

function JournalTab() {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            const res = await journalAdmin(200);
            if (cancelled) return;
            if (res.ok && res.data) setEntries(res.data);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    return (
        <div className="card">
            <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
                Journal d'administration
            </h3>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" /></div>
            ) : entries.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-soft)', fontWeight: 600, padding: 20 }}>
                    Aucune entrée dans le journal.
                </p>
            ) : (
                <div style={{ maxHeight: 500, overflow: 'auto' }}>
                    {entries.map((e, i) => (
                        <div key={e.id || i} style={{
                            padding: '8px 4px', borderBottom: '1px solid var(--border)',
                            fontSize: 12,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ fontWeight: 700, color: 'var(--navy)' }}>
                                    {e.action} → {e.cible}
                                </span>
                                <span style={{ color: 'var(--text-soft)', fontSize: 11 }}>
                                    {new Date(e.fait_le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            {e.detail && (
                                <p style={{ color: 'var(--text-soft)', fontSize: 11 }}>
                                    {typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)}
                                </p>
                            )}
                            <p style={{ color: 'var(--text-soft)', fontSize: 10, fontStyle: 'italic' }}>
                                par {e.fait_par_nom || e.fait_par || '—'}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function RepairButton({ onRefresh }) {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    const handleRepair = async () => {
        setBusy(true);
        setMsg('');
        const res = await reparerRattachements();
        if (res.ok) {
            const count = res.data?.rattaches ?? 0;
            if (count > 0) {
                setMsg(`✅ ${count} fiche${count > 1 ? 's' : ''} rattachée${count > 1 ? 's' : ''} à leur compte Google`);
            } else {
                setMsg('ℹ️ Aucune fiche à rattacher');
            }
            if (onRefresh) await onRefresh();
        } else {
            setMsg(`❌ ${res.error || 'Erreur lors du rattachement.'}`);
        }
        setBusy(false);
    };

    return (
        <div>
            <button
                className="btn btn--navy"
                style={{ width: '100%', fontSize: 13, padding: 10 }}
                onClick={handleRepair}
                disabled={busy}
            >
                {busy ? '⏳ Recherche des comptes…' : '🔄 Réparer les rattachements'}
            </button>
            {msg && (
                <p style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginTop: 8,
                    textAlign: 'center',
                    color: msg.startsWith('❌') ? 'var(--coral)' : msg.startsWith('✅') ? 'var(--mint-dk)' : 'var(--text-soft)',
                }}>
                    {msg}
                </p>
            )}
        </div>
    );
}

```


## logic/questions.js

`frontend/src/logic/questions.js`

```js
/**
 * Logique de questions adaptatives — Tables 1 à 15
 * 
 * Inclut : génération pondérée, indices stratégiques, astuces TIPS
 */

// Tables disponibles
export const ALL_TABLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

// Mots d'encouragement
export const PRAISE = [
    'Bravo !', 'Super !', 'Génial !', 'Parfait !', 'Bien vu !',
    'Champion !', 'Excellent !', 'Impressionnant !', 'Continue !', 'Top !'
];

// Couleurs pour les barres (visualisation)
export const BAR_COLORS = [
    'var(--ciel)', 'var(--erreur-eleve)', 'var(--vert)', 'var(--orange)', 'var(--indigo-doux)',
    'var(--orange)', 'var(--erreur-eleve)', 'var(--action)', 'var(--vert)', 'var(--podium)',
    'var(--ciel)', 'var(--erreur-eleve)', 'var(--vert)', 'var(--orange)', 'var(--indigo)'
];

/**
 * Astuces mentales par table (méthode Singapour)
 */
export const TIPS = {
    2: 'Multiplier par 2 = doubler le nombre. Ex : 7×2 = 7+7 = 14',
    3: 'Astuce : double + une fois. Ex : 3×6 = 2×6 + 6 = 12+6 = 18',
    4: 'Multiplier par 4 = doubler deux fois. Ex : 4×7 = 2×7 = 14, puis 2×14 = 28',
    5: 'Multiplier par 5 : divise par 2 puis ×10. Ex : 5×8 = 8÷2 × 10 = 40',
    6: '×6 = ×5 + une fois. Ex : 6×7 = 5×7 + 7 = 35+7 = 42',
    7: '×7 = ×5 + ×2. Ex : 7×8 = 5×8 + 2×8 = 40+16 = 56',
    8: '×8 = doubler 3 fois. Ex : 8×6 = 2×6=12, 2×12=24, 2×24=48',
    9: 'Astuce des doigts : baisse le doigt n°N. Ex : 9×4 → baisse doigt 4 → 3|6 = 36',
    10: 'Ajoute un zéro ! Ex : 10×7 = 70',
    11: 'Jusqu\'à 9 : double le chiffre ! 11×3 = 33. Au-delà : somme au milieu. 11×12 → 1(1+2)2 = 132',
    12: '×12 = ×10 + ×2. Ex : 12×7 = 70 + 14 = 84',
    13: '×13 = ×10 + ×3. Ex : 13×6 = 60 + 18 = 78',
    14: '×14 = ×10 + ×4. Ex : 14×5 = 50 + 20 = 70',
    15: '×15 = ×10 + moitié ×10. Ex : 15×6 = 60 + 30 = 90',
};

/**
 * Génère un indice stratégique pour a × b (jamais la réponse brute)
 */
export function makeHint(a, b) {
    const ans = a * b;
    if (a === 1 || b === 1) return `Tout nombre × 1 = lui-même → ${ans}`;
    if (a === 10 || b === 10) { const o = a === 10 ? b : a; return `${o} × 10 = ajoute un 0 → ${ans}`; }
    if (a === 2 || b === 2) { const o = a === 2 ? b : a; return `Double de ${o} → ${o}+${o} = ${ans}`; }
    if (a === 5 || b === 5) { const o = a === 5 ? b : a; return `${o} × 5 = la moitié de ${o}×10 → ${ans}`; }
    if (a === 9 || b === 9) { const o = a === 9 ? b : a; return `${o} × 9 = ${o}×10 − ${o} = ${o * 10}−${o} = ${ans}`; }
    if (a === 4 || b === 4) { const o = a === 4 ? b : a; return `${o} × 4 = double de double → 2×${o}=${2 * o}, 2×${2 * o}=${ans}`; }
    if (a === 11 || b === 11) {
        const o = a === 11 ? b : a;
        if (o <= 9) return `${o} × 11 = double le chiffre → ${ans}`;
        return `${o} × 11 = ${o}×10 + ${o} = ${o * 10}+${o} = ${ans}`;
    }
    if (a === 12 || b === 12) { const o = a === 12 ? b : a; return `${o} × 12 = ${o}×10 + ${o}×2 = ${o * 10}+${o * 2} = ${ans}`; }
    if (a === 15 || b === 15) { const o = a === 15 ? b : a; return `${o} × 15 = ${o}×10 + moitié de ${o * 10} = ${o * 10}+${o * 5} = ${ans}`; }
    if (a === 13 || b === 13) { const o = a === 13 ? b : a; return `${o} × 13 = ${o}×10 + ${o}×3 = ${o * 10}+${o * 3} = ${ans}`; }
    if (a === 14 || b === 14) { const o = a === 14 ? b : a; return `${o} × 14 = ${o}×10 + ${o}×4 = ${o * 10}+${o * 4} = ${ans}`; }
    // Fallback : décomposition simple
    const small = Math.min(a, b), big = Math.max(a, b);
    return `${small} × ${big} = ${small}×${big - 1} + ${small} = ${small * (big - 1)}+${small} = ${ans}`;
}

/**
 * Sélection adaptative d'une question pondérée par la maîtrise
 * @param {number[]} tables — Tables sélectionnées
 * @param {object|null} prev — Question précédente (éviter les répétitions)
 * @param {object} weights — { "3_7": 4, ... } poids par fait
 * @param {number} maxMultiplier — Multiplicateur max (10 pour tables classiques, 15 pour étendues)
 */
export function newQuestion(tables, prev, weights, maxMultiplier = 10) {
    const pool = [];
    for (const t of tables) {
        for (let m = 1; m <= maxMultiplier; m++) {
            const key = `${Math.min(t, m)}_${Math.max(t, m)}`;
            const w = (weights && weights[key]) || 1;
            for (let i = 0; i < w; i++) pool.push({ a: t, b: m, answer: t * m });
        }
    }
    if (pool.length === 0) {
        return { a: 2, b: 3, answer: 6 }; // fallback
    }
    let q, tries = 0;
    do {
        q = pool[Math.floor(Math.random() * pool.length)];
        tries++;
    } while (prev && q.a === prev.a && q.b === prev.b && tries < 15);
    return q;
}

```


## logic/mastery.js

`frontend/src/logic/mastery.js`

```js
/**
 * Maîtrise — échelle serveur unifiée
 *
 * UNE SEULE ÉCHELLE dans tout le projet : celle du serveur.
 *   undefined = jamais vu · 1 = rouge · 2 = jaune · 3 = vert
 *
 * La base stocke ces valeurs dans `maitrise.niveau`,
 * `construireMaitrise()` les produit, et `masteryColor()`
 * les affiche. Pas de deuxième grille locale.
 */

/** Clé normalisée : le plus petit d'abord. */
export function cleFait(a, b) {
    return `${Math.min(a, b)}_${Math.max(a, b)}`;
}

/**
 * Couleur de maîtrise — échelle serveur (1/2/3).
 */
export function masteryColor(val) {
    if (val === undefined || val === null) return 'var(--gris-inerte)'; // non testé → gris inerte
    if (val >= 3) return 'var(--vert)';         // maîtrisé → vert
    if (val >= 2) return 'var(--orange)';       // en cours → orange
    return 'var(--rouge)';                     // à revoir → rouge
}

/**
 * Poids adaptatifs depuis les données de maîtrise serveur.
 * Un fait rouge doit revenir bien plus souvent qu'un fait vert.
 * C'est le meilleur rapport valeur/effort du projet (ECRANS.md).
 */
export function buildWeights(tables, maitrise, maxMultiplier = 20) {
    const w = {};
    for (const t of tables) {
        for (let m = 1; m <= maxMultiplier; m++) {
            const key = cleFait(t, m);
            const v = maitrise?.[key];
            // undefined=jamais vu → 3 (priorité moyenne-haute),
            // 1=rouge → 5 (haute), 2=jaune → 3, 3=vert → 1 (basse)
            w[key] = v === undefined ? 3 : v === 1 ? 5 : v === 2 ? 3 : 1;
        }
    }
    return w;
}

/* ===================================================================
 * Fonctions de conversion pour enregistrerSession()
 *
 * Le serveur attend :
 *   - erreurs : ["7_8", "6_9"] — clés normalisées (petit_grand)
 *   - maitrise : {"7_8": 1, "6_9": 3} — 1 rouge, 2 jaune, 3 vert
 *
 * Les composants de quiz produisent un tableau de résultats :
 *   - { a, b, result: 'premier' | 'rattrape' | 'jamais' }
 * ================================================================= */

/**
 * Construit la liste plate d'erreurs pour le serveur.
 * Dédupliquée : une table ratée deux fois n'apparaît qu'une fois.
 * "Erreur" = jamais trouvé du premier coup (rattrape compte aussi).
 */
export function construireErreurs(resultats) {
    return [...new Set(
        resultats
            .filter(r => r.result !== 'premier')
            .map(r => cleFait(r.a, r.b))
    )];
}

/**
 * Construit la map de maîtrise pour le serveur.
 *
 * Règle (migration 12, 28/08) :
 *   - premier coup → 3 (vert)
 *   - rattrapé     → 2 (jaune)
 *   - jamais trouvé → 1 (rouge)
 *
 * Si un fait apparaît plusieurs fois, on garde le pire résultat.
 */
export function construireMaitrise(resultats) {
    const m = {};
    const niveauDe = { premier: 3, rattrape: 2, jamais: 1 };
    for (const r of resultats) {
        const key = cleFait(r.a, r.b);
        const n = niveauDe[r.result] || 1;
        // Garder le pire (le plus bas)
        if (m[key] === undefined || n < m[key]) {
            m[key] = n;
        }
    }
    return m;
}

/**
 * Met à jour la maîtrise locale en session (après chaque question).
 * Écrit directement le niveau serveur : 3/2/1.
 */
export function updateMastery(prev, a, b, result) {
    const key = cleFait(a, b);
    const niveauDe = { premier: 3, rattrape: 2, jamais: 1 };
    const n = niveauDe[result] || 1;
    const existing = prev[key];
    // Garder le pire résultat de la session
    if (existing === undefined || n < existing) {
        return { ...prev, [key]: n };
    }
    return prev;
}

```


## logic/defiStorage.js

`frontend/src/logic/defiStorage.js`

```js
/**
 * defiStorage.js — Persistance locale du dernier défi rejoint
 *
 * Permet à un élève de retrouver son défi s'il quitte ou ferme l'application
 * sans avoir noté le code (session préservée mais état React perdu).
 *
 * RÈGLES :
 * 1. Clé scopée par identifiant utilisateur : matho.defi_en_cours.${idUtilisateur}
 * 2. Chaque accès localStorage est enveloppé dans try / catch (mode privé Safari)
 * 3. Effacement :
 *    - quand terminer_defi réussit
 *    - à la déconnexion
 *    - si le serveur refuse la reprise (fermé, expiré, déjà joué...)
 *    - si rejoint_le remonte à plus de 7 jours (durée de vie maximale d'un défi)
 */

const PREFIXE_CLE = 'matho.defi_en_cours.';
const DUREE_MAX_MS = 7 * 24 * 3600 * 1000; // 7 jours

export function sauvegarderDefiEnCours(idUtilisateur, defi) {
    if (!idUtilisateur || !defi?.code) return;
    try {
        const valeur = {
            code: defi.code.trim().toUpperCase(),
            defi_id: defi.defi_id,
            type: defi.type,
            classe: defi.classe || null,
            auteur_nom: defi.auteur_nom || null,
            rejoint_le: defi.rejoint_le || Date.now(),
        };
        localStorage.setItem(`${PREFIXE_CLE}${idUtilisateur}`, JSON.stringify(valeur));
    } catch (e) {
        // En navigation privée ou avec stockage bloqué, continuer sans planter
    }
}

export function lireDefiEnCours(idUtilisateur) {
    if (!idUtilisateur) return null;
    try {
        const brut = localStorage.getItem(`${PREFIXE_CLE}${idUtilisateur}`);
        if (!brut) return null;
        const val = JSON.parse(brut);
        if (!val || !val.code) return null;

        // Périmé après 7 jours
        if (val.rejoint_le && Date.now() - val.rejoint_le > DUREE_MAX_MS) {
            effacerDefiEnCours(idUtilisateur);
            return null;
        }
        return val;
    } catch (e) {
        return null;
    }
}

export function effacerDefiEnCours(idUtilisateur) {
    if (!idUtilisateur) return;
    try {
        localStorage.removeItem(`${PREFIXE_CLE}${idUtilisateur}`);
    } catch (e) {
        // Ignorer
    }
}

```


---

# Les migrations SQL — ce que la base calcule

Dans l'ordre d'application. La derniere version d'une fonction
est celle qui compte : une meme fonction peut etre reecrite
plusieurs fois au fil des migrations.


## 20260826090000_schema.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho — Schéma de base
-- Migration 1/3 : tables, contraintes, index
-- =====================================================================
--
-- Conventions :
--   - Tout est en français (noms de tables et colonnes) pour rester
--     cohérent avec le front existant et lisible par les enseignants.
--   - Les élèves sont PRÉ-INSCRITS par import. Un compte Supabase Auth
--     est rattaché automatiquement à la première connexion (voir trigger).
--     Conséquence : quelqu'un qui créerait un compte sans être dans la
--     table `eleves` n'a accès à RIEN. C'est notre barrière d'entrée.
--   - Les colonnes marquées [PALIER 3] ne sont pas utilisées aujourd'hui.
--     Elles existent pour éviter une migration si on ajoute plus tard le
--     départ synchronisé / la salle d'attente en direct.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ÉLÈVES
-- ---------------------------------------------------------------------
create table public.eleves (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users(id) on delete set null,
  email           text not null unique,
  nom             text not null,
  prenom          text not null,
  classe          text not null,
  avatar_emoji    text not null default '🎯',
  -- tables de multiplication autorisées pour cet élève
  tables_autorisees smallint[] not null default '{1,2,3,4,5,6,7,8,9,10}',
  actif           boolean not null default true,
  cree_le         timestamptz not null default now(),
  derniere_connexion timestamptz
);

comment on column public.eleves.user_id is
  'NULL tant que l''élève ne s''est jamais connecté. Rempli automatiquement par le trigger de rattachement.';

create index eleves_classe_idx on public.eleves (classe) where actif;
create index eleves_user_idx   on public.eleves (user_id);

-- ---------------------------------------------------------------------
-- ENSEIGNANTS
-- ---------------------------------------------------------------------
create table public.profs (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid unique references auth.users(id) on delete set null,
  email    text not null unique,
  nom      text not null,
  role     text not null default 'prof' check (role in ('prof', 'admin')),
  -- classes dont ce prof a la charge ; un admin voit tout
  classes  text[] not null default '{}',
  actif    boolean not null default true,
  cree_le  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- DÉFIS
-- Un défi = un jeu de questions figé + un code court.
-- Utilisé pour les modes 'sprint' et 'countdown' (comparatif en classe).
-- ---------------------------------------------------------------------
create table public.defis (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  type          text not null check (type in ('sprint', 'countdown')),
  -- créateur : soit un prof, soit un élève (défi entre copains)
  cree_par_prof  uuid references public.profs(id)  on delete set null,
  cree_par_eleve uuid references public.eleves(id) on delete set null,
  classe        text,
  tables        smallint[] not null,
  -- [{"a":7,"b":8}, ...] — LES MÊMES pour tous les participants
  questions     jsonb not null,
  duree_s       integer,             -- uniquement pour 'countdown'
  statut        text not null default 'ouvert' check (statut in ('ouvert', 'ferme')),
  demarre_le    timestamptz,         -- [PALIER 3] départ synchronisé
  expire_le     timestamptz not null default now() + interval '7 days',
  cree_le       timestamptz not null default now(),

  constraint defis_un_createur check (
    (cree_par_prof is not null) <> (cree_par_eleve is not null)
  ),
  constraint defis_questions_non_vide check (jsonb_array_length(questions) > 0)
);

create index defis_code_idx   on public.defis (code) where statut = 'ouvert';
create index defis_classe_idx on public.defis (classe, cree_le desc);

-- ---------------------------------------------------------------------
-- PARTICIPATIONS AUX DÉFIS
-- La clé primaire (defi_id, eleve_id) garantit UNE SEULE participation
-- par élève et par défi. Impossible à contourner côté client.
-- ---------------------------------------------------------------------
create table public.defis_participants (
  defi_id     uuid not null references public.defis(id)  on delete cascade,
  eleve_id    uuid not null references public.eleves(id) on delete cascade,
  score       integer  not null,
  temps_s     numeric(8,2) not null,
  erreurs     integer  not null default 0,
  detail      jsonb    not null default '{}',
  termine_le  timestamptz not null default now(),
  primary key (defi_id, eleve_id)
);

create index defis_participants_classement_idx
  on public.defis_participants (defi_id, score desc, temps_s asc);

-- ---------------------------------------------------------------------
-- SESSIONS DE JEU
-- Toute partie terminée atterrit ici, défi ou pas.
-- C'est la source unique des records, des classements et des badges.
-- ---------------------------------------------------------------------
create table public.sessions_jeu (
  id            uuid primary key default gen_random_uuid(),
  eleve_id      uuid not null references public.eleves(id) on delete cascade,
  defi_id       uuid references public.defis(id) on delete set null,
  mode          text not null check (mode in
                  ('libre', 'apprentissage', 'sprint', 'flawless', 'countdown', 'climb')),
  tables        smallint[] not null default '{}',
  nb_questions  integer not null default 0,
  score         integer not null default 0,
  -- ["3_7", "8_9"] — les faits ratés, pour alimenter la maîtrise
  erreurs       jsonb   not null default '[]',
  duree_s       numeric(8,2) not null default 0,
  serie_max     integer not null default 0,
  sans_faute_max integer not null default 0,
  plus_haute_table smallint,
  cree_le       timestamptz not null default now()
);

create index sessions_eleve_idx on public.sessions_jeu (eleve_id, cree_le desc);
create index sessions_date_idx  on public.sessions_jeu (cree_le desc);
create index sessions_mode_idx  on public.sessions_jeu (mode, cree_le desc);

-- ---------------------------------------------------------------------
-- MAÎTRISE (grille 15×15)
-- Un "fait" est normalisé : min_max, ex. 3×7 et 7×3 → '3_7'
-- niveau : 0 = pas testé, 1 = à revoir, 2 = en cours, 3 = maîtrisé
-- ---------------------------------------------------------------------
create table public.maitrise (
  eleve_id      uuid not null references public.eleves(id) on delete cascade,
  fait          text not null,
  niveau        smallint not null default 0 check (niveau between 0 and 3),
  nb_vues       integer not null default 0,
  nb_reussites  integer not null default 0,
  derniere_vue  timestamptz not null default now(),
  primary key (eleve_id, fait)
);

create index maitrise_revision_idx on public.maitrise (eleve_id, niveau, derniere_vue);

-- ---------------------------------------------------------------------
-- BADGES
-- ---------------------------------------------------------------------
create table public.badges (
  eleve_id   uuid not null references public.eleves(id) on delete cascade,
  badge_id   text not null,
  obtenu_le  timestamptz not null default now(),
  primary key (eleve_id, badge_id)
);

-- =====================================================================
-- RATTACHEMENT AUTOMATIQUE À LA PREMIÈRE CONNEXION
-- Quand un compte Supabase Auth est créé, on cherche l'email dans
-- `eleves` puis dans `profs` et on renseigne user_id.
-- Si l'email n'existe nulle part : le compte est créé mais n'a accès
-- à rien (toutes les politiques RLS s'appuient sur ce rattachement).
-- =====================================================================
create or replace function public.rattacher_compte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Signale au trigger de protection de `eleves` (migration 2) qu'il
  -- s'agit d'un rattachement système et non d'une modification par un
  -- élève. Portée : la transaction courante uniquement.
  perform set_config('app.rattachement_en_cours', 'on', true);

  update public.eleves
     set user_id = new.id,
         derniere_connexion = now()
   where lower(email) = lower(new.email)
     and user_id is null;

  update public.profs
     set user_id = new.id
   where lower(email) = lower(new.email)
     and user_id is null;

  perform set_config('app.rattachement_en_cours', 'off', true);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.rattacher_compte();

-- =====================================================================
-- HELPERS D'IDENTITÉ
-- Utilisés par toutes les politiques RLS. Un élève désactivé renvoie
-- NULL et perd donc tout accès automatiquement.
-- =====================================================================
create or replace function public.eleve_courant()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.eleves
   where user_id = auth.uid() and actif
   limit 1;
$$;

create or replace function public.prof_courant()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.profs
   where user_id = auth.uid() and actif
   limit 1;
$$;

create or replace function public.est_prof()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profs where user_id = auth.uid() and actif
  );
$$;

-- ⚠️ IMPORTANT — pourquoi ce helper existe.
-- Une politique RLS sur `profs` ne doit JAMAIS contenir une
-- sous-requête `select ... from profs` : PostgreSQL réapplique alors la
-- politique sur cette sous-requête, à l'infini
-- ("infinite recursion detected in policy for relation profs").
-- Cette fonction est `security definer` : elle s'exécute avec les
-- droits de son propriétaire, qui possède la table et contourne donc
-- RLS. C'est ce qui casse la boucle.
-- Règle générale : dans une politique, interroger une table protégée
-- passe toujours par une fonction `security definer`.
create or replace function public.est_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profs
     where user_id = auth.uid() and actif and role = 'admin'
  );
$$;

-- Un prof voit-il cette classe ? (un admin voit tout)
create or replace function public.prof_voit_classe(p_classe text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profs
     where user_id = auth.uid()
       and actif
       and (role = 'admin' or p_classe = any(classes))
  );
$$;

-- =====================================================================
-- GÉNÉRATION DES CODES DE DÉFI
-- 5 caractères, alphabet sans ambiguïté visuelle :
-- pas de I / 1 / L, pas de O / 0. Un code doit pouvoir être lu au
-- tableau et recopié sans erreur par un élève de 6e.
-- =====================================================================
create or replace function public.generer_code_defi()
returns text
language plpgsql
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidat text;
  essais   int := 0;
begin
  loop
    candidat := '';
    for i in 1..5 loop
      candidat := candidat || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from public.defis where code = candidat);

    essais := essais + 1;
    if essais > 50 then
      raise exception 'Impossible de générer un code de défi unique';
    end if;
  end loop;

  return candidat;
end;
$$;

```


## 20260826090100_rls.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho — Sécurité
-- Migration 2/3 : Row Level Security
-- =====================================================================
--
-- PRINCIPE DIRECTEUR
-- Les tables sont fermées par défaut. Un élève ne peut lire QUE ses
-- propres lignes. Il n'a jamais accès en lecture directe à la table
-- `eleves` des autres — sinon il récupérerait les emails de tout le
-- collège, ce qui serait un problème RGPD.
--
-- Les classements ont pourtant besoin d'afficher les noms des autres.
-- Ils sont donc servis par des fonctions `security definer`
-- (migration 3/3) qui ne renvoient QUE : prénom, initiale du nom,
-- classe, avatar, valeur. Jamais l'email, jamais l'identifiant.
--
-- Règle à retenir : on n'ouvre jamais une table pour faire un
-- classement. On écrit une fonction qui renvoie le strict nécessaire.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DROITS DE TABLE
-- Supabase accorde par défaut tous les droits au rôle `authenticated`
-- sur les nouvelles tables de `public`. On les redéfinit explicitement :
-- RLS filtre les LIGNES, ces GRANT limitent les OPÉRATIONS possibles.
-- Les deux se cumulent — ceinture et bretelles.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.eleves   to authenticated; -- RLS restreint aux admins sauf avatar
grant select, insert, update, delete on public.profs    to authenticated; -- RLS restreint aux admins
grant select, update                 on public.defis    to authenticated; -- création via RPC uniquement
grant select                         on public.defis_participants to authenticated;
grant select, insert                 on public.sessions_jeu to authenticated;
grant select, insert, update, delete on public.maitrise to authenticated;
grant select                         on public.badges   to authenticated;

-- Volontairement absents :
--   INSERT sur badges              → attribution par le serveur seul
--   INSERT sur defis_participants  → passe par terminer_defi()
--   DELETE sur sessions_jeu        → une partie enregistrée est définitive

alter table public.eleves              enable row level security;
alter table public.profs               enable row level security;
alter table public.defis               enable row level security;
alter table public.defis_participants  enable row level security;
alter table public.sessions_jeu        enable row level security;
alter table public.maitrise            enable row level security;
alter table public.badges              enable row level security;

-- ---------------------------------------------------------------------
-- ELEVES
-- ---------------------------------------------------------------------

-- L'élève lit sa propre fiche.
create policy eleves_lecture_soi on public.eleves
  for select to authenticated
  using (id = public.eleve_courant());

-- Le prof lit les fiches des classes dont il a la charge.
create policy eleves_lecture_prof on public.eleves
  for select to authenticated
  using (public.prof_voit_classe(classe));

-- L'élève peut modifier son avatar, rien d'autre.
-- (le WITH CHECK vérifie l'état APRÈS modification : les champs
--  sensibles doivent être identiques à ce qu'ils étaient)
create policy eleves_maj_avatar on public.eleves
  for update to authenticated
  using  (id = public.eleve_courant())
  with check (id = public.eleve_courant());

-- Seul un admin crée, importe ou désactive des élèves.
create policy eleves_admin_tout on public.eleves
  for all to authenticated
  using (public.est_admin())
  with check (public.est_admin());

-- Verrou complémentaire : un élève ne peut pas s'auto-promouvoir ni
-- changer de classe via l'API. Seul l'avatar est modifiable par lui.
create or replace function public.eleves_champs_proteges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rattachement automatique du compte à la première connexion :
  -- c'est le système qui écrit, pas l'élève. Voir `rattacher_compte()`.
  if coalesce(current_setting('app.rattachement_en_cours', true), 'off') = 'on' then
    return new;
  end if;

  -- un admin fait ce qu'il veut
  if public.est_admin() then
    return new;
  end if;

  new.email             := old.email;
  new.nom               := old.nom;
  new.prenom            := old.prenom;
  new.classe            := old.classe;
  new.tables_autorisees := old.tables_autorisees;
  new.actif             := old.actif;
  new.user_id           := old.user_id;
  return new;
end;
$$;

create trigger eleves_protection
  before update on public.eleves
  for each row execute function public.eleves_champs_proteges();

-- ---------------------------------------------------------------------
-- PROFS — lecture réservée aux profs, écriture aux admins
-- ---------------------------------------------------------------------
create policy profs_lecture on public.profs
  for select to authenticated
  using (public.est_prof());

create policy profs_admin on public.profs
  for all to authenticated
  using (public.est_admin())
  with check (public.est_admin());

-- ---------------------------------------------------------------------
-- SESSIONS DE JEU
-- ---------------------------------------------------------------------

-- L'élève lit son historique.
create policy sessions_lecture_soi on public.sessions_jeu
  for select to authenticated
  using (eleve_id = public.eleve_courant());

-- L'élève enregistre ses propres parties, et seulement les siennes.
create policy sessions_insert_soi on public.sessions_jeu
  for insert to authenticated
  with check (eleve_id = public.eleve_courant());

-- Aucune politique UPDATE ni DELETE : une partie enregistrée est
-- définitive. Un élève ne peut pas retoucher son score après coup.

-- Le prof consulte les sessions de ses classes.
create policy sessions_lecture_prof on public.sessions_jeu
  for select to authenticated
  using (exists (
    select 1 from public.eleves e
     where e.id = sessions_jeu.eleve_id
       and public.prof_voit_classe(e.classe)));

-- ---------------------------------------------------------------------
-- MAÎTRISE — strictement personnelle (+ lecture prof pour le suivi)
-- ---------------------------------------------------------------------
create policy maitrise_soi on public.maitrise
  for all to authenticated
  using      (eleve_id = public.eleve_courant())
  with check (eleve_id = public.eleve_courant());

create policy maitrise_lecture_prof on public.maitrise
  for select to authenticated
  using (exists (
    select 1 from public.eleves e
     where e.id = maitrise.eleve_id
       and public.prof_voit_classe(e.classe)));

-- ---------------------------------------------------------------------
-- BADGES — lecture seule côté client, attribution par le serveur
-- ---------------------------------------------------------------------
create policy badges_lecture_soi on public.badges
  for select to authenticated
  using (eleve_id = public.eleve_courant());

create policy badges_lecture_prof on public.badges
  for select to authenticated
  using (exists (
    select 1 from public.eleves e
     where e.id = badges.eleve_id
       and public.prof_voit_classe(e.classe)));

-- Pas de politique INSERT : les badges sont attribués exclusivement
-- par la fonction `enregistrer_session` (security definer).
-- Un élève ne peut pas s'auto-décerner un badge.

-- ---------------------------------------------------------------------
-- DÉFIS
-- ---------------------------------------------------------------------

-- Tout élève connecté peut lire un défi ouvert et non expiré.
-- Nécessaire pour rejoindre par code. Le contenu (questions) n'est
-- pas sensible : c'est une liste de multiplications.
create policy defis_lecture on public.defis
  for select to authenticated
  using (
    statut = 'ouvert'
    and expire_le > now()
  );

-- Le prof relit tous ses défis, y compris fermés.
create policy defis_lecture_prof on public.defis
  for select to authenticated
  using (public.est_prof());

-- Création et fermeture : par les fonctions RPC uniquement
-- (migration 3/3). Pas d'INSERT direct depuis le client, sinon un
-- élève pourrait fabriquer un défi avec ses propres questions.
create policy defis_prof_gestion on public.defis
  for update to authenticated
  using (public.est_prof())
  with check (public.est_prof());

-- ---------------------------------------------------------------------
-- PARTICIPATIONS
-- ---------------------------------------------------------------------

-- L'élève lit sa propre participation (pour savoir s'il a déjà joué).
-- Le classement complet passe par `classement_defi()`.
create policy participants_lecture_soi on public.defis_participants
  for select to authenticated
  using (eleve_id = public.eleve_courant());

create policy participants_lecture_prof on public.defis_participants
  for select to authenticated
  using (public.est_prof());

-- Pas d'INSERT direct : tout passe par `terminer_defi()`, qui valide
-- que le défi est ouvert et calcule le score côté serveur.

```


## 20260826090200_api.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho — API
-- Migration 3/3 : fonctions RPC (défis, sessions, classements)
-- =====================================================================
--
-- Le front n'écrit JAMAIS directement dans les tables. Il appelle ces
-- fonctions. Deux raisons :
--   1. Le serveur valide (défi ouvert ? déjà joué ? score cohérent ?)
--   2. Les classements ne renvoient que des champs publics — jamais
--      d'email ni d'identifiant.
--
-- Nom d'affichage : "Alice D." (prénom + initiale). C'est suffisant
-- pour qu'un élève se reconnaisse, et ça évite d'afficher l'état civil
-- complet de 300 mineurs sur un écran de classement.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Nom public d'un élève
-- ---------------------------------------------------------------------
create or replace function public.nom_public(p_prenom text, p_nom text)
returns text
language sql immutable
as $$
  select p_prenom || ' ' || upper(left(p_nom, 1)) || '.';
$$;

-- ---------------------------------------------------------------------
-- Bornes d'une période
-- 'semaine' | 'mois' | 'annee' | 'tout'
-- L'année scolaire démarre au 1er septembre, pas au 1er janvier.
-- ---------------------------------------------------------------------
create or replace function public.debut_periode(p_periode text)
returns timestamptz
language sql stable
as $$
  select case p_periode
    when 'semaine' then date_trunc('week', now())
    when 'mois'    then date_trunc('month', now())
    when 'annee'   then
      case when extract(month from now()) >= 9
           then make_timestamptz(extract(year from now())::int,     9, 1, 0, 0, 0)
           else make_timestamptz(extract(year from now())::int - 1, 9, 1, 0, 0, 0)
      end
    else '-infinity'::timestamptz
  end;
$$;

-- =====================================================================
-- ENREGISTRER UNE PARTIE
-- Appelée à la fin de CHAQUE partie, défi ou pas.
-- Met à jour la maîtrise, attribue les badges, renvoie les nouveautés.
-- =====================================================================
create or replace function public.enregistrer_session(
  p_mode            text,
  p_tables          smallint[],
  p_nb_questions    integer,
  p_score           integer,
  p_erreurs         jsonb    default '[]',
  p_duree_s         numeric  default 0,
  p_serie_max       integer  default 0,
  p_sans_faute_max  integer  default 0,
  p_plus_haute_table smallint default null,
  p_maitrise        jsonb    default '{}',   -- {"3_7": 2, "8_9": 3}
  p_defi_id         uuid     default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve      uuid := public.eleve_courant();
  v_session_id uuid;
  v_fait       text;
  v_niveau     smallint;
  v_nouveaux   text[] := '{}';
  v_badge      text;
  v_seuil      integer;
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu. Reconnecte-toi.'
      using errcode = '42501';
  end if;

  -- Garde-fou de cohérence : un score ne peut pas dépasser le nombre
  -- de questions posées. Empêche un score fantaisiste envoyé à la main.
  if p_score > greatest(p_nb_questions, 0) then
    raise exception 'Score incohérent';
  end if;

  insert into public.sessions_jeu (
    eleve_id, defi_id, mode, tables, nb_questions, score,
    erreurs, duree_s, serie_max, sans_faute_max, plus_haute_table)
  values (
    v_eleve, p_defi_id, p_mode, coalesce(p_tables, '{}'), p_nb_questions, p_score,
    coalesce(p_erreurs, '[]'), p_duree_s, p_serie_max, p_sans_faute_max, p_plus_haute_table)
  returning id into v_session_id;

  -- ---- Maîtrise -----------------------------------------------------
  for v_fait, v_niveau in
    select key, value::text::smallint from jsonb_each(coalesce(p_maitrise, '{}'))
  loop
    insert into public.maitrise (eleve_id, fait, niveau, nb_vues, nb_reussites, derniere_vue)
    values (v_eleve, v_fait, v_niveau, 1, case when v_niveau >= 2 then 1 else 0 end, now())
    on conflict (eleve_id, fait) do update
      set niveau       = excluded.niveau,
          nb_vues      = public.maitrise.nb_vues + 1,
          nb_reussites = public.maitrise.nb_reussites
                         + case when excluded.niveau >= 2 then 1 else 0 end,
          derniere_vue = now();
  end loop;

  -- ---- Badges de série ----------------------------------------------
  foreach v_seuil in array array[10, 20, 30, 50, 100] loop
    if p_sans_faute_max >= v_seuil then
      v_badge := 'streak_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  -- ---- Badges de montée ---------------------------------------------
  foreach v_seuil in array array[10, 12, 15] loop
    if coalesce(p_plus_haute_table, 0) >= v_seuil then
      v_badge := 'climb_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  -- ---- Badges de vitesse --------------------------------------------
  if p_nb_questions >= 10 and p_duree_s > 0 then
    if p_duree_s / p_nb_questions < 2 then
      insert into public.badges (eleve_id, badge_id) values (v_eleve, 'speed_2s')
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || 'speed_2s'::text; end if;
    elsif p_duree_s / p_nb_questions < 3 then
      insert into public.badges (eleve_id, badge_id) values (v_eleve, 'speed_3s')
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || 'speed_3s'::text; end if;
    end if;
  end if;

  -- ---- Badges de régularité (jours consécutifs) ----------------------
  declare
    v_jours integer;
  begin
    select count(distinct date_trunc('day', cree_le))
      into v_jours
      from public.sessions_jeu
     where eleve_id = v_eleve
       and cree_le > now() - interval '7 days';

    foreach v_seuil in array array[3, 7] loop
      if v_jours >= v_seuil then
        v_badge := 'days_' || v_seuil;
        insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
        on conflict do nothing;
        if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
      end if;
    end loop;
  end;

  return jsonb_build_object(
    'session_id',      v_session_id,
    'nouveaux_badges', to_jsonb(v_nouveaux)
  );
end;
$$;

-- =====================================================================
-- CRÉER UN DÉFI
-- Les questions sont générées ICI, une fois, et figées. Tous les
-- participants auront exactement la même série.
-- =====================================================================
create or replace function public.creer_defi(
  p_type    text,                       -- 'sprint' | 'countdown'
  p_tables  smallint[],
  p_nb_questions integer default 20,
  p_duree_s integer default null,       -- requis pour 'countdown'
  p_classe  text    default null,
  p_expire_dans interval default '7 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve     uuid := public.eleve_courant();
  v_prof      uuid := public.prof_courant();
  v_questions jsonb := '[]';
  v_a smallint; v_b smallint;
  v_code text;
  v_id   uuid;
  v_n    integer;
begin
  if v_eleve is null and v_prof is null then
    raise exception 'Compte non reconnu.' using errcode = '42501';
  end if;

  if p_type not in ('sprint', 'countdown') then
    raise exception 'Seuls les modes Sprint et Contre-la-montre peuvent être joués en défi.';
  end if;

  if array_length(p_tables, 1) is null then
    raise exception 'Choisis au moins une table.';
  end if;

  -- Pour le contre-la-montre on prépare une réserve large : personne
  -- ne sait combien de questions il aura le temps de faire.
  v_n := case when p_type = 'countdown' then 120 else p_nb_questions end;

  for i in 1..v_n loop
    v_a := p_tables[1 + floor(random() * array_length(p_tables, 1))::int];
    v_b := 1 + floor(random() * 10)::int;
    v_questions := v_questions || jsonb_build_object('a', v_a, 'b', v_b);
  end loop;

  v_code := public.generer_code_defi();

  insert into public.defis (
    code, type, cree_par_prof, cree_par_eleve, classe,
    tables, questions, duree_s, expire_le)
  values (
    v_code, p_type, v_prof,
    case when v_prof is null then v_eleve end,
    -- Sans classe explicite, on prend celle du créateur : c'est ce qui
    -- permet au compteur « 18 / 28 ont terminé » de connaître l'effectif.
    coalesce(p_classe, (select classe from public.eleves where id = v_eleve)),
    p_tables, v_questions,
    case when p_type = 'countdown' then coalesce(p_duree_s, 120) end,
    now() + p_expire_dans)
  returning id into v_id;

  return jsonb_build_object('defi_id', v_id, 'code', v_code, 'type', p_type);
end;
$$;

-- =====================================================================
-- REJOINDRE UN DÉFI PAR SON CODE
-- Renvoie trois erreurs DISTINCTES — c'est important pour l'élève :
-- "code inconnu", "défi terminé", "tu as déjà joué".
-- =====================================================================
create or replace function public.rejoindre_defi(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve uuid := public.eleve_courant();
  v_defi  public.defis%rowtype;
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu.' using errcode = '42501';
  end if;

  select * into v_defi from public.defis
   where code = upper(trim(p_code));

  if not found then
    return jsonb_build_object('ok', false, 'raison', 'inconnu',
      'message', 'Ce code n''existe pas. Vérifie les lettres.');
  end if;

  if v_defi.statut = 'ferme' or v_defi.expire_le < now() then
    return jsonb_build_object('ok', false, 'raison', 'ferme',
      'message', 'Ce défi est terminé.');
  end if;

  if exists (select 1 from public.defis_participants
              where defi_id = v_defi.id and eleve_id = v_eleve) then
    return jsonb_build_object('ok', false, 'raison', 'deja_joue',
      'message', 'Tu as déjà participé à ce défi.',
      'defi_id', v_defi.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'defi_id',   v_defi.id,
    'type',      v_defi.type,
    'tables',    to_jsonb(v_defi.tables),
    'duree_s',   v_defi.duree_s,
    'questions', v_defi.questions
  );
end;
$$;

-- =====================================================================
-- TERMINER UN DÉFI
-- Enregistre la participation ET la session de jeu en une seule fois.
-- La clé primaire (defi_id, eleve_id) empêche toute seconde tentative.
-- =====================================================================
create or replace function public.terminer_defi(
  p_defi_id  uuid,
  p_score    integer,
  p_temps_s  numeric,
  p_erreurs  integer default 0,
  p_detail   jsonb   default '{}',
  p_maitrise jsonb   default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve uuid := public.eleve_courant();
  v_defi  public.defis%rowtype;
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu.' using errcode = '42501';
  end if;

  select * into v_defi from public.defis where id = p_defi_id;
  if not found then
    raise exception 'Défi introuvable.';
  end if;

  if v_defi.statut = 'ferme' or v_defi.expire_le < now() then
    raise exception 'Ce défi est déjà terminé.';
  end if;

  begin
    insert into public.defis_participants (
      defi_id, eleve_id, score, temps_s, erreurs, detail)
    values (p_defi_id, v_eleve, p_score, p_temps_s, p_erreurs, p_detail);
  exception when unique_violation then
    raise exception 'Tu as déjà participé à ce défi.';
  end;

  perform public.enregistrer_session(
    p_mode           => v_defi.type,
    p_tables         => v_defi.tables,
    p_nb_questions   => p_score + p_erreurs,
    p_score          => p_score,
    p_duree_s        => p_temps_s,
    p_sans_faute_max => 0,
    p_maitrise       => p_maitrise,
    p_defi_id        => p_defi_id
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- CLASSEMENT D'UN DÉFI
-- C'est LUI qui produit l'effet « quasi-direct » : l'élève qui vient de
-- finir le rappelle toutes les 5 s (ou s'abonne en Realtime) et regarde
-- les autres arriver.
--
-- Tri : score décroissant, puis temps croissant.
-- Pour le sprint, le temps est pénalisé de +3 s par erreur.
-- =====================================================================
create or replace function public.classement_defi(p_defi_id uuid)
returns table (
  rang         bigint,
  nom_affiche  text,
  classe       text,
  avatar       text,
  score        integer,
  temps_s      numeric,
  est_moi      boolean
)
language sql
security definer
set search_path = public
as $$
  with participations as (
    select p.eleve_id, p.score, p.erreurs,
           e.prenom, e.nom, e.classe, e.avatar_emoji,
           d.type,
           -- Sprint : le classement se fait au temps, pénalisé de +3 s
           -- par erreur (règle affichée aux élèves avant la partie).
           case when d.type = 'sprint'
                then p.temps_s + 3 * p.erreurs
                else p.temps_s
           end as temps_classement
      from public.defis_participants p
      join public.eleves e on e.id = p.eleve_id
      join public.defis  d on d.id = p.defi_id
     where p.defi_id = p_defi_id
  )
  select row_number() over (
           order by
             -- Sprint : le plus rapide gagne.
             -- Contre-la-montre : le meilleur score gagne, le temps
             -- ne départage que les ex æquo.
             case when type = 'sprint' then temps_classement else -score end asc,
             temps_classement asc
         )                                          as rang,
         public.nom_public(prenom, nom)             as nom_affiche,
         classe,
         avatar_emoji                               as avatar,
         score,
         round(temps_classement, 1)                 as temps_s,
         eleve_id = public.eleve_courant()          as est_moi
    from participations
   order by rang;
$$;

-- Combien d'élèves ont terminé ? (pour le compteur « 18/28 »)
create or replace function public.avancement_defi(p_defi_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'termines', (select count(*) from public.defis_participants where defi_id = p_defi_id),
    -- `attendus` vaut NULL si le défi n'est rattaché à aucune classe :
    -- le front doit alors afficher « 12 ont terminé » sans dénominateur.
    'attendus', (select case when d.classe is null then null else
                   (select count(*) from public.eleves e
                     where e.actif and e.classe = d.classe) end
                   from public.defis d where d.id = p_defi_id)
  );
$$;

-- =====================================================================
-- CLASSEMENT « RECORDS » (performance brute)
-- categorie : 'serie' | 'chrono' | 'sprint' | 'montee'
-- periode   : 'semaine' | 'mois' | 'annee' | 'tout'
-- portee    : 'college' | 'classe'
-- =====================================================================
create or replace function public.classement_records(
  p_categorie text default 'serie',
  p_periode   text default 'tout',
  p_portee    text default 'college',
  p_limite    integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,
  classe      text,
  avatar      text,
  valeur      numeric,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe from public.eleves where id = public.eleve_courant()
  ),
  base as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           case p_categorie
             when 'serie'  then max(s.sans_faute_max)::numeric
             when 'chrono' then max(s.score) filter (where s.mode = 'countdown')::numeric
             when 'montee' then max(s.plus_haute_table)::numeric
             when 'sprint' then min(s.duree_s + 3 * jsonb_array_length(s.erreurs))
                                 filter (where s.mode = 'sprint')
           end as valeur
      from public.eleves e
      join public.sessions_jeu s on s.eleve_id = e.id
     where e.actif
       and s.cree_le >= public.debut_periode(p_periode)
       and (p_portee = 'college'
            or e.classe = (select classe from moi))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  )
  select row_number() over (
           order by case when p_categorie = 'sprint' then valeur end asc nulls last,
                    case when p_categorie <> 'sprint' then valeur end desc nulls last
         ) as rang,
         public.nom_public(prenom, nom),
         classe,
         avatar_emoji,
         round(valeur, 1),
         id = public.eleve_courant()
    from base
   where valeur is not null
   order by rang
   limit p_limite;
$$;

-- =====================================================================
-- CLASSEMENT « PROGRESSION »
-- C'est le classement mis en avant par défaut. Il récompense le
-- travail fourni, pas le niveau de départ — un élève fragile qui
-- s'entraîne régulièrement peut être premier.
--
-- FORMULE (à ajuster librement après observation en classe) :
--     points = somme des scores de la période
--            + 10 × nombre de jours d'activité distincts
--            +  5 × nombre de faits passés en vert sur la période
-- =====================================================================
create or replace function public.classement_progression(
  p_periode text default 'semaine',
  p_portee  text default 'college',
  p_limite  integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,
  classe      text,
  avatar      text,
  points      integer,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe from public.eleves where id = public.eleve_courant()
  ),
  bornes as (select public.debut_periode(p_periode) as depuis),
  activite as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           coalesce(sum(s.score), 0)                                as pts_score,
           count(distinct date_trunc('day', s.cree_le))             as jours
      from public.eleves e
      left join public.sessions_jeu s
             on s.eleve_id = e.id
            and s.cree_le >= (select depuis from bornes)
     where e.actif
       and (p_portee = 'college' or e.classe = (select classe from moi))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  ),
  verts as (
    select eleve_id, count(*) as nb
      from public.maitrise
     where niveau = 3
       and derniere_vue >= (select depuis from bornes)
     group by eleve_id
  )
  select row_number() over (order by
           (a.pts_score + 10 * a.jours + 5 * coalesce(v.nb, 0)) desc) as rang,
         public.nom_public(a.prenom, a.nom),
         a.classe,
         a.avatar_emoji,
         (a.pts_score + 10 * a.jours + 5 * coalesce(v.nb, 0))::integer as points,
         a.id = public.eleve_courant()
    from activite a
    left join verts v on v.eleve_id = a.id
   where (a.pts_score + 10 * a.jours + 5 * coalesce(v.nb, 0)) > 0
   order by rang
   limit p_limite;
$$;

-- =====================================================================
-- MON PROFIL — tout ce qu'affiche l'écran Profil, en un seul appel
-- =====================================================================
create or replace function public.mon_profil()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profil', (select to_jsonb(x) from (
        select id, prenom, nom, classe, avatar_emoji, tables_autorisees, email
          from public.eleves where id = public.eleve_courant()) x),
    'records', (select jsonb_build_object(
        'meilleure_serie',   coalesce(max(sans_faute_max), 0),
        'meilleur_chrono',   coalesce(max(score) filter (where mode = 'countdown'), 0),
        'plus_haute_table',  coalesce(max(plus_haute_table), 0),
        'nb_sessions',       count(*))
        from public.sessions_jeu where eleve_id = public.eleve_courant()),
    'maitrise', (select coalesce(jsonb_object_agg(fait, niveau), '{}')
        from public.maitrise where eleve_id = public.eleve_courant()),
    'badges', (select coalesce(jsonb_agg(badge_id), '[]')
        from public.badges where eleve_id = public.eleve_courant())
  );
$$;

-- =====================================================================
-- DROITS D'EXÉCUTION
-- =====================================================================
grant execute on function
  public.enregistrer_session(text, smallint[], integer, integer, jsonb, numeric,
                             integer, integer, smallint, jsonb, uuid),
  public.creer_defi(text, smallint[], integer, integer, text, interval),
  public.rejoindre_defi(text),
  public.terminer_defi(uuid, integer, numeric, integer, jsonb, jsonb),
  public.classement_defi(uuid),
  public.avancement_defi(uuid),
  public.classement_records(text, text, text, integer),
  public.classement_progression(text, text, integer),
  public.mon_profil()
to authenticated;

-- Realtime : le classement d'un défi se met à jour tout seul chez les
-- élèves qui ont fini. C'est tout ce qu'il faut pour l'effet « direct ».
alter publication supabase_realtime add table public.defis_participants;

```


## 20260826090300_difficulte.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho — Difficulté et paliers
-- Migration 4/4 : tables jusqu'à 20, pondération, équité des classements
-- =====================================================================
--
-- LE PROBLÈME
-- L'app couvre désormais tout le collège, de la 6e à la 3e, avec des
-- tables allant jusqu'à 20. Si le classement compte simplement les
-- bonnes réponses, l'élève qui choisit les tables de 2 et 5 en aligne
-- deux fois plus que celui qui travaille 13×17. Le classement
-- récompense alors le choix de la facilité — exactement l'inverse de
-- ce qu'on veut.
--
-- LA RÉPONSE, EN DEUX TEMPS
--
--   1. PONDÉRATION — chaque fait vaut un nombre de points fonction de
--      sa difficulté réelle. 2×5 rapporte peu, 17×13 rapporte beaucoup.
--      Corrige le choix de facilité À L'INTÉRIEUR d'un même niveau.
--
--   2. PALIERS — on ne compare pas une 6e travaillant jusqu'à 10 avec
--      un 3e travaillant jusqu'à 20. Trois classements séparés.
--      Corrige l'écart ENTRE niveaux.
--
-- Les deux sont nécessaires : la pondération seule condamnerait les 6e
-- au bas du tableau, les paliers seuls laisseraient tricher sur le
-- choix des tables à l'intérieur d'un palier.
--
-- Dans un DÉFI, aucune correction n'est nécessaire : tout le monde a
-- exactement les mêmes questions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DIFFICULTÉ D'UN OPÉRANDE
--
-- Les valeurs ci-dessous ne sortent pas d'un chapeau : elles reflètent
-- ce qui rend un fait multiplicatif coûteux à récupérer en mémoire.
-- Une table qui repose sur une RÈGLE (×1, ×10, ×11 jusqu'à 9) est
-- quasi gratuite. Une table qui repose sur une ASTUCE (×2 doubler,
-- ×5 compter, ×4 doubler deux fois, ×9 complément à 10, ×20 doubler
-- puis ×10) est peu coûteuse. Les tables sans motif — 6, 7, 8 dans les
-- classiques, 13/14/17/19 au-delà — coûtent une vraie mémorisation.
-- 17 est la plus chère : nombre premier, aucun raccourci.
--
-- Un prof peut ajuster une ligne sans toucher au code.
-- ---------------------------------------------------------------------
create table public.difficulte_operande (
  n       smallint primary key check (n between 1 and 20),
  poids   numeric(3,2) not null check (poids > 0),
  raison  text not null
);

insert into public.difficulte_operande (n, poids, raison) values
  ( 1, 0.15, 'Règle : le nombre lui-même'),
  (10, 0.25, 'Règle : ajouter un zéro'),
  ( 2, 0.45, 'Astuce : doubler'),
  (20, 0.50, 'Astuce : doubler puis ajouter un zéro'),
  ( 5, 0.55, 'Astuce : compter de 5 en 5, moitié de la table de 10'),
  (11, 0.65, 'Règle : chiffre répété jusqu''à 9'),
  ( 3, 0.85, 'Table courte, apprise tôt'),
  ( 4, 0.95, 'Astuce : doubler deux fois'),
  ( 9, 1.00, 'Astuce : complément à 10, somme des chiffres'),
  ( 6, 1.25, 'Peu de motifs'),
  ( 8, 1.30, 'Peu de motifs'),
  (12, 1.35, 'Au-delà des tables classiques, encore courante'),
  ( 7, 1.45, 'La plus difficile des tables classiques'),
  (15, 1.50, 'Astuce : ×10 plus la moitié'),
  (14, 1.85, 'Aucun motif'),
  (13, 1.90, 'Aucun motif'),
  (16, 1.95, 'Aucun motif'),
  (18, 2.00, 'Aucun motif'),
  (19, 2.10, 'Astuce possible : ×20 moins le nombre'),
  (17, 2.20, 'Nombre premier, aucun raccourci');

grant select on public.difficulte_operande to authenticated;
-- Lecture ouverte : ce ne sont pas des données personnelles, et le
-- front s'en sert pour afficher la valeur en points d'une table.
alter table public.difficulte_operande enable row level security;
create policy difficulte_lecture on public.difficulte_operande
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- Poids d'un fait, poids moyen d'un ensemble de tables
-- ---------------------------------------------------------------------
create or replace function public.poids_fait(p_a smallint, p_b smallint)
returns numeric
language sql stable
as $$
  select coalesce(
    (select da.poids * db.poids
       from public.difficulte_operande da, public.difficulte_operande db
      where da.n = p_a and db.n = p_b),
    1.0);
$$;

-- Poids moyen d'une sélection de tables, en supposant le second
-- opérande tiré uniformément entre 1 et 10.
create or replace function public.poids_moyen(p_tables smallint[])
returns numeric
language sql stable
as $$
  select coalesce(
    (select avg(da.poids * db.poids)
       from unnest(p_tables) t
       join public.difficulte_operande da on da.n = t
      cross join public.difficulte_operande db
      where db.n between 1 and 10),
    1.0);
$$;

-- ---------------------------------------------------------------------
-- PALIERS
--   découverte : jusqu'à la table 10   — 6e / 5e
--   confirmé   : jusqu'à la table 12   — 5e / 4e
--   expert     : jusqu'à la table 20   — 4e / 3e et volontaires
-- Le palier d'une partie est déduit de la plus haute table jouée :
-- personne ne le choisit, donc personne ne peut se placer dans un
-- palier facile en jouant dur (ou l'inverse).
-- ---------------------------------------------------------------------
create or replace function public.palier_tables(p_tables smallint[])
returns text
language sql immutable
as $$
  select case
    when p_tables is null or array_length(p_tables, 1) is null then 'decouverte'
    when (select max(x) from unnest(p_tables) x) <= 10 then 'decouverte'
    when (select max(x) from unnest(p_tables) x) <= 12 then 'confirme'
    else 'expert'
  end;
$$;

-- ---------------------------------------------------------------------
-- Colonnes dérivées sur les sessions
-- ---------------------------------------------------------------------
alter table public.sessions_jeu
  add column points  integer not null default 0,
  add column palier  text    not null default 'decouverte';

comment on column public.sessions_jeu.points is
  'Score pondéré par la difficulté des tables jouées (×10 pour rester entier). C''est cette valeur qui alimente les classements, pas `score`.';

create index sessions_palier_idx on public.sessions_jeu (palier, cree_le desc);

-- ---------------------------------------------------------------------
-- Plafond de tables par élève
-- Le prof le règle par classe ; la Montée des tables le relève
-- automatiquement quand l'élève franchit un palier. Un élève ne peut
-- donc pas tomber sur du 17×18 sans l'avoir mérité.
-- ---------------------------------------------------------------------
alter table public.eleves
  add column plafond_tables smallint not null default 10
    check (plafond_tables between 5 and 20);

comment on column public.eleves.plafond_tables is
  'Table la plus haute que l''élève peut sélectionner. Défaut 10 (6e/5e), à monter à 12 puis 20. Relevé automatiquement par le mode Montée.';

-- Valeurs de départ raisonnables selon le niveau de classe
update public.eleves set plafond_tables =
  case when classe ~ '^6' then 10
       when classe ~ '^5' then 12
       else 15 end;

-- =====================================================================
-- MISE À JOUR DE enregistrer_session
-- Calcule les points pondérés, le palier, et relève le plafond quand
-- l'élève progresse en Montée des tables.
-- =====================================================================
create or replace function public.enregistrer_session(
  p_mode            text,
  p_tables          smallint[],
  p_nb_questions    integer,
  p_score           integer,
  p_erreurs         jsonb    default '[]',
  p_duree_s         numeric  default 0,
  p_serie_max       integer  default 0,
  p_sans_faute_max  integer  default 0,
  p_plus_haute_table smallint default null,
  p_maitrise        jsonb    default '{}',
  p_defi_id         uuid     default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve      uuid := public.eleve_courant();
  v_session_id uuid;
  v_fait       text;
  v_niveau     smallint;
  v_nouveaux   text[] := '{}';
  v_badge      text;
  v_seuil      integer;
  v_points     integer;
  v_palier     text;
  v_plafond    smallint;
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu. Reconnecte-toi.' using errcode = '42501';
  end if;

  if p_score > greatest(p_nb_questions, 0) then
    raise exception 'Score incohérent';
  end if;

  -- Un élève ne peut pas envoyer une partie sur des tables au-dessus de
  -- son plafond : ce serait le moyen simple de gonfler ses points.
  select plafond_tables into v_plafond from public.eleves where id = v_eleve;
  if p_tables is not null
     and (select max(x) from unnest(p_tables) x) > v_plafond then
    raise exception 'Tables au-delà de ton niveau débloqué';
  end if;

  v_points := round(p_score * public.poids_moyen(p_tables) * 10);
  v_palier := public.palier_tables(p_tables);

  insert into public.sessions_jeu (
    eleve_id, defi_id, mode, tables, nb_questions, score,
    erreurs, duree_s, serie_max, sans_faute_max, plus_haute_table,
    points, palier)
  values (
    v_eleve, p_defi_id, p_mode, coalesce(p_tables, '{}'), p_nb_questions, p_score,
    coalesce(p_erreurs, '[]'), p_duree_s, p_serie_max, p_sans_faute_max,
    p_plus_haute_table, v_points, v_palier)
  returning id into v_session_id;

  -- ---- Déblocage par la Montée des tables ----------------------------
  -- Franchir la table N en Montée débloque la table N+1 en entraînement.
  if p_mode = 'climb' and coalesce(p_plus_haute_table, 0) >= v_plafond then
    update public.eleves
       set plafond_tables = least(20, coalesce(p_plus_haute_table, 0) + 1)
     where id = v_eleve
       and plafond_tables < least(20, coalesce(p_plus_haute_table, 0) + 1);
  end if;

  -- ---- Maîtrise -----------------------------------------------------
  for v_fait, v_niveau in
    select key, value::text::smallint from jsonb_each(coalesce(p_maitrise, '{}'))
  loop
    insert into public.maitrise (eleve_id, fait, niveau, nb_vues, nb_reussites, derniere_vue)
    values (v_eleve, v_fait, v_niveau, 1, case when v_niveau >= 2 then 1 else 0 end, now())
    on conflict (eleve_id, fait) do update
      set niveau       = excluded.niveau,
          nb_vues      = public.maitrise.nb_vues + 1,
          nb_reussites = public.maitrise.nb_reussites
                         + case when excluded.niveau >= 2 then 1 else 0 end,
          derniere_vue = now();
  end loop;

  -- ---- Badges -------------------------------------------------------
  foreach v_seuil in array array[10, 20, 30, 50, 100] loop
    if p_sans_faute_max >= v_seuil then
      v_badge := 'streak_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  foreach v_seuil in array array[10, 12, 15, 20] loop
    if coalesce(p_plus_haute_table, 0) >= v_seuil then
      v_badge := 'climb_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  if p_nb_questions >= 10 and p_duree_s > 0 then
    if p_duree_s / p_nb_questions < 2 then
      insert into public.badges (eleve_id, badge_id) values (v_eleve, 'speed_2s')
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || 'speed_2s'::text; end if;
    elsif p_duree_s / p_nb_questions < 3 then
      insert into public.badges (eleve_id, badge_id) values (v_eleve, 'speed_3s')
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || 'speed_3s'::text; end if;
    end if;
  end if;

  declare v_jours integer;
  begin
    select count(distinct date_trunc('day', cree_le)) into v_jours
      from public.sessions_jeu
     where eleve_id = v_eleve and cree_le > now() - interval '7 days';
    foreach v_seuil in array array[3, 7] loop
      if v_jours >= v_seuil then
        v_badge := 'days_' || v_seuil;
        insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
        on conflict do nothing;
        if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
      end if;
    end loop;
  end;

  return jsonb_build_object(
    'session_id',      v_session_id,
    'points',          v_points,
    'palier',          v_palier,
    'plafond_tables',  (select plafond_tables from public.eleves where id = v_eleve),
    'nouveaux_badges', to_jsonb(v_nouveaux)
  );
end;
$$;

-- =====================================================================
-- CLASSEMENTS — filtrés par palier, calculés sur les points pondérés
-- =====================================================================
drop function if exists public.classement_progression(text, text, integer);

create or replace function public.classement_progression(
  p_periode text default 'semaine',
  p_portee  text default 'classe',      -- 'classe' par défaut : voir §brief
  p_palier  text default null,          -- NULL = le palier de l'élève
  p_limite  integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,
  classe      text,
  avatar      text,
  points      integer,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe, plafond_tables from public.eleves where id = public.eleve_courant()
  ),
  cible as (
    select coalesce(p_palier,
      case when (select plafond_tables from moi) <= 10 then 'decouverte'
           when (select plafond_tables from moi) <= 12 then 'confirme'
           else 'expert' end) as palier,
      public.debut_periode(p_periode) as depuis
  ),
  activite as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           coalesce(sum(s.points), 0)                    as pts,
           count(distinct date_trunc('day', s.cree_le))  as jours
      from public.eleves e
      left join public.sessions_jeu s
             on s.eleve_id = e.id
            and s.cree_le >= (select depuis from cible)
            and s.palier   = (select palier from cible)
     where e.actif
       and (p_portee = 'college' or e.classe = (select classe from moi))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  ),
  verts as (
    select eleve_id, count(*) as nb from public.maitrise
     where niveau = 3 and derniere_vue >= (select depuis from cible)
     group by eleve_id
  )
  select row_number() over (order by
           (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0)) desc)  as rang,
         public.nom_public(a.prenom, a.nom),
         a.classe,
         a.avatar_emoji,
         (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0))::integer as points,
         a.id = public.eleve_courant()
    from activite a
    left join verts v on v.eleve_id = a.id
   where (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0)) > 0
   order by rang
   limit p_limite;
$$;

drop function if exists public.classement_records(text, text, text, integer);

create or replace function public.classement_records(
  p_categorie text default 'serie',   -- serie | chrono | sprint | montee | points
  p_periode   text default 'tout',
  p_portee    text default 'classe',
  p_palier    text default null,
  p_limite    integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,
  classe      text,
  avatar      text,
  valeur      numeric,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe, plafond_tables from public.eleves where id = public.eleve_courant()
  ),
  cible as (
    select coalesce(p_palier,
      case when (select plafond_tables from moi) <= 10 then 'decouverte'
           when (select plafond_tables from moi) <= 12 then 'confirme'
           else 'expert' end) as palier
  ),
  base as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           case p_categorie
             when 'serie'  then max(s.sans_faute_max)::numeric
             when 'chrono' then max(s.points) filter (where s.mode = 'countdown')::numeric
             when 'montee' then max(s.plus_haute_table)::numeric
             when 'points' then sum(s.points)::numeric
             when 'sprint' then min(s.duree_s + 3 * jsonb_array_length(s.erreurs))
                                 filter (where s.mode = 'sprint')
           end as valeur
      from public.eleves e
      join public.sessions_jeu s on s.eleve_id = e.id
     where e.actif
       and s.cree_le >= public.debut_periode(p_periode)
       -- « montee » ignore le palier : c'est justement le classement
       -- qui montre jusqu'où chacun est allé, tous niveaux confondus.
       and (p_categorie = 'montee' or s.palier = (select palier from cible))
       and (p_portee = 'college' or e.classe = (select classe from moi))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  )
  select row_number() over (
           order by case when p_categorie = 'sprint' then valeur end asc nulls last,
                    case when p_categorie <> 'sprint' then valeur end desc nulls last
         ) as rang,
         public.nom_public(prenom, nom),
         classe,
         avatar_emoji,
         round(valeur, 1),
         id = public.eleve_courant()
    from base
   where valeur is not null
   order by rang
   limit p_limite;
$$;

-- =====================================================================
-- LES TABLES QUE JE RATE
-- Alimente le bouton « Mes tables faibles » du sélecteur : plutôt que
-- de demander à un élève de 6e de savoir ce qu'il doit réviser, on le
-- lui propose. Les faits rouges d'abord, les plus anciens ensuite.
-- =====================================================================
create or replace function public.mes_tables_faibles(p_combien integer default 4)
returns smallint[]
language sql
security definer
set search_path = public
as $$
  select coalesce(array_agg(t order by score_faiblesse desc), '{}')::smallint[]
    from (
      select split_part(m.fait, '_', 2)::smallint as t,
             sum(case m.niveau when 1 then 3 when 2 then 1 else 0 end) as score_faiblesse
        from public.maitrise m
        join public.eleves e on e.id = m.eleve_id
       where m.eleve_id = public.eleve_courant()
         and split_part(m.fait, '_', 2)::smallint <= e.plafond_tables
       group by 1
      having sum(case m.niveau when 1 then 3 when 2 then 1 else 0 end) > 0
       order by 2 desc
       limit p_combien
    ) x;
$$;

-- =====================================================================
-- CRÉER UN DÉFI — plafonné au niveau du créateur
-- =====================================================================
create or replace function public.creer_defi(
  p_type    text,
  p_tables  smallint[],
  p_nb_questions integer default 20,
  p_duree_s integer default null,
  p_classe  text    default null,
  p_expire_dans interval default '7 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve     uuid := public.eleve_courant();
  v_prof      uuid := public.prof_courant();
  v_questions jsonb := '[]';
  v_a smallint; v_b smallint;
  v_code text; v_id uuid; v_n integer;
  v_ouverts integer;
begin
  if v_eleve is null and v_prof is null then
    raise exception 'Compte non reconnu.' using errcode = '42501';
  end if;

  if p_type not in ('sprint', 'countdown') then
    raise exception 'Seuls les modes Sprint et Contre-la-montre peuvent être joués en défi.';
  end if;

  if array_length(p_tables, 1) is null then
    raise exception 'Choisis au moins une table.';
  end if;

  -- Un élève ne crée pas de défi au-dessus de son propre plafond,
  -- et pas plus de 5 défis ouverts à la fois (anti-spam).
  if v_prof is null then
    if (select max(x) from unnest(p_tables) x)
       > (select plafond_tables from public.eleves where id = v_eleve) then
      raise exception 'Tables au-delà de ton niveau débloqué';
    end if;

    select count(*) into v_ouverts from public.defis
     where cree_par_eleve = v_eleve and statut = 'ouvert' and expire_le > now();
    if v_ouverts >= 5 then
      raise exception 'Tu as déjà 5 défis en cours. Attends qu''ils se terminent.';
    end if;
  end if;

  v_n := case when p_type = 'countdown' then 120 else p_nb_questions end;

  for i in 1..v_n loop
    v_a := p_tables[1 + floor(random() * array_length(p_tables, 1))::int];
    v_b := 1 + floor(random() * 10)::int;
    v_questions := v_questions || jsonb_build_object('a', v_a, 'b', v_b);
  end loop;

  v_code := public.generer_code_defi();

  insert into public.defis (
    code, type, cree_par_prof, cree_par_eleve, classe,
    tables, questions, duree_s, expire_le)
  values (
    v_code, p_type, v_prof,
    case when v_prof is null then v_eleve end,
    coalesce(p_classe, (select classe from public.eleves where id = v_eleve)),
    p_tables, v_questions,
    case when p_type = 'countdown' then coalesce(p_duree_s, 120) end,
    -- Un défi créé par un élève vit 24 h ; un défi de prof, une semaine.
    now() + case when v_prof is null then interval '24 hours' else p_expire_dans end)
  returning id into v_id;

  return jsonb_build_object(
    'defi_id', v_id, 'code', v_code, 'type', p_type,
    'palier', public.palier_tables(p_tables));
end;
$$;

-- =====================================================================
-- VUE ENSEIGNANT — la maîtrise agrégée d'une classe
-- « 18 élèves sur 27 bloquent sur la table de 7 » : c'est CE chiffre
-- qui fait qu'un prof de maths rouvre l'outil la semaine suivante.
-- =====================================================================
create or replace function public.maitrise_classe(p_classe text)
returns table (
  table_n      smallint,
  eleves_verts integer,
  eleves_jaunes integer,
  eleves_rouges integer,
  eleves_total integer,
  taux_maitrise numeric
)
language sql
security definer
set search_path = public
as $$
  select t::smallint,
         count(*) filter (where niv = 3)::integer,
         count(*) filter (where niv = 2)::integer,
         count(*) filter (where niv = 1)::integer,
         count(*)::integer,
         round(100.0 * count(*) filter (where niv = 3) / nullif(count(*), 0), 0)
    from (
      select split_part(m.fait, '_', 2)::smallint as t,
             m.eleve_id,
             max(m.niveau) as niv
        from public.maitrise m
        join public.eleves e on e.id = m.eleve_id
       where e.classe = p_classe and e.actif
         and public.prof_voit_classe(p_classe)
       group by 1, 2
    ) x
   group by t
   order by t;
$$;

grant execute on function
  public.poids_fait(smallint, smallint),
  public.poids_moyen(smallint[]),
  public.palier_tables(smallint[]),
  public.mes_tables_faibles(integer),
  public.maitrise_classe(text),
  public.classement_records(text, text, text, text, integer),
  public.classement_progression(text, text, text, integer)
to authenticated;

```


## 20260826090400_portee_niveau.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 5/5 : classement par niveau scolaire
-- =====================================================================
--
-- Il manquait une portée. Les classements offraient « ma classe » et
-- « tout le collège », plus trois paliers de difficulté — mais rien
-- pour « tous les 6ᵉ ».
--
-- Or c'est le périmètre le plus naturel pour un élève : il connaît les
-- autres 6ᵉ, il les croise à la récréation, et la comparaison entre
-- classes d'un même niveau est ce qui fait vraiment marcher l'émulation.
--
-- ⚠️ NE PAS CONFONDRE avec les paliers :
--
--   niveau scolaire  6ᵉ / 5ᵉ / 4ᵉ / 3ᵉ        → l'âge de l'élève
--   palier           Découverte / Confirmé /   → la difficulté des
--                    Expert                      tables qu'il travaille
--
-- Un 6ᵉ et un 4ᵉ peuvent tous deux être en Découverte. Un 6ᵉ précoce
-- peut être en Expert. Les deux axes sont indépendants et se combinent.
--
-- Le niveau est déduit du premier caractère de la classe : « 6A » → 6.
-- =====================================================================

create or replace function public.niveau_scolaire(p_classe text)
returns text
language sql immutable
as $$
  select nullif(substring(coalesce(p_classe, '') from '^[0-9]'), '');
$$;

comment on function public.niveau_scolaire(text) is
  'Niveau scolaire deduit du nom de classe : 6A -> 6. NULL si le format ne commence pas par un chiffre.';

-- ---------------------------------------------------------------------
-- CLASSEMENT PROGRESSION — ajout de la portée 'niveau'
-- p_portee : 'classe' | 'niveau' | 'college'
-- ---------------------------------------------------------------------
create or replace function public.classement_progression(
  p_periode text default 'semaine',
  p_portee  text default 'classe',
  p_palier  text default null,
  p_limite  integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,
  classe      text,
  avatar      text,
  points      integer,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe, plafond_tables from public.eleves where id = public.eleve_courant()
  ),
  cible as (
    select coalesce(p_palier,
      case when (select plafond_tables from moi) <= 10 then 'decouverte'
           when (select plafond_tables from moi) <= 12 then 'confirme'
           else 'expert' end) as palier,
      public.debut_periode(p_periode) as depuis
  ),
  activite as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           coalesce(sum(s.points), 0)                    as pts,
           count(distinct date_trunc('day', s.cree_le))  as jours
      from public.eleves e
      left join public.sessions_jeu s
             on s.eleve_id = e.id
            and s.cree_le >= (select depuis from cible)
            and s.palier   = (select palier from cible)
     where e.actif
       and (p_portee = 'college'
            or (p_portee = 'niveau'
                and public.niveau_scolaire(e.classe)
                  = public.niveau_scolaire((select classe from moi)))
            or (p_portee = 'classe' and e.classe = (select classe from moi)))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  ),
  verts as (
    select eleve_id, count(*) as nb from public.maitrise
     where niveau = 3 and derniere_vue >= (select depuis from cible)
     group by eleve_id
  )
  select row_number() over (order by
           (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0)) desc)  as rang,
         public.nom_public(a.prenom, a.nom),
         a.classe,
         a.avatar_emoji,
         (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0))::integer as points,
         a.id = public.eleve_courant()
    from activite a
    left join verts v on v.eleve_id = a.id
   where (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0)) > 0
   order by rang
   limit p_limite;
$$;

-- ---------------------------------------------------------------------
-- CLASSEMENT RECORDS — ajout de la portée 'niveau'
-- ---------------------------------------------------------------------
create or replace function public.classement_records(
  p_categorie text default 'serie',
  p_periode   text default 'tout',
  p_portee    text default 'classe',
  p_palier    text default null,
  p_limite    integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,
  classe      text,
  avatar      text,
  valeur      numeric,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe, plafond_tables from public.eleves where id = public.eleve_courant()
  ),
  cible as (
    select coalesce(p_palier,
      case when (select plafond_tables from moi) <= 10 then 'decouverte'
           when (select plafond_tables from moi) <= 12 then 'confirme'
           else 'expert' end) as palier
  ),
  base as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           case p_categorie
             when 'serie'  then max(s.sans_faute_max)::numeric
             when 'chrono' then max(s.points) filter (where s.mode = 'countdown')::numeric
             when 'montee' then max(s.plus_haute_table)::numeric
             when 'points' then sum(s.points)::numeric
             when 'sprint' then min(s.duree_s + 3 * jsonb_array_length(s.erreurs))
                                 filter (where s.mode = 'sprint')
           end as valeur
      from public.eleves e
      join public.sessions_jeu s on s.eleve_id = e.id
     where e.actif
       and s.cree_le >= public.debut_periode(p_periode)
       and (p_categorie = 'montee' or s.palier = (select palier from cible))
       and (p_portee = 'college'
            or (p_portee = 'niveau'
                and public.niveau_scolaire(e.classe)
                  = public.niveau_scolaire((select classe from moi)))
            or (p_portee = 'classe' and e.classe = (select classe from moi)))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  )
  select row_number() over (
           order by case when p_categorie = 'sprint' then valeur end asc nulls last,
                    case when p_categorie <> 'sprint' then valeur end desc nulls last
         ) as rang,
         public.nom_public(prenom, nom),
         classe,
         avatar_emoji,
         round(valeur, 1),
         id = public.eleve_courant()
    from base
   where valeur is not null
   order by rang
   limit p_limite;
$$;

-- ---------------------------------------------------------------------
-- CLASSEMENT DES CLASSES
-- Un classement d'équipes, en plus des classements individuels.
--
-- À cet âge, l'émulation collective marche souvent mieux que
-- l'exposition individuelle : personne n'est exposé en bas de tableau,
-- et un élève faible qui s'entraîne fait gagner sa classe.
--
-- Le total est ramené à une MOYENNE par élève actif, sinon une classe
-- de 30 écrase mécaniquement une classe de 24.
-- ---------------------------------------------------------------------
create or replace function public.classement_classes(
  p_periode text default 'semaine',
  p_niveau  text default null      -- '6' | '5' | '4' | '3' ; NULL = tout le collège
)
returns table (
  rang            bigint,
  classe          text,
  eleves_actifs   integer,
  eleves_total    integer,
  points_moyens   integer,
  est_ma_classe   boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (select classe from public.eleves where id = public.eleve_courant()),
  bornes as (select public.debut_periode(p_periode) as depuis),
  par_classe as (
    select e.classe,
           count(distinct e.id)                                   as total,
           count(distinct s.eleve_id)                             as actifs,
           coalesce(sum(s.points), 0)                             as pts
      from public.eleves e
      left join public.sessions_jeu s
             on s.eleve_id = e.id
            and s.cree_le >= (select depuis from bornes)
     where e.actif
       and (p_niveau is null or public.niveau_scolaire(e.classe) = p_niveau)
     group by e.classe
  )
  select row_number() over (order by (pts / greatest(total, 1)) desc) as rang,
         classe,
         actifs::integer,
         total::integer,
         (pts / greatest(total, 1))::integer                      as points_moyens,
         classe = (select classe from moi)                        as est_ma_classe
    from par_classe
   where total > 0
   order by rang;
$$;

grant execute on function
  public.niveau_scolaire(text),
  public.classement_classes(text, text),
  public.classement_records(text, text, text, text, integer),
  public.classement_progression(text, text, text, integer)
to authenticated;

```


## 20260826090500_palier_tous.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 6/6 : palier « tous » — le tableau d'honneur du collège
-- =====================================================================
--
-- Jusqu'ici, tout classement etait enferme dans un palier : un 6e ne
-- voyait jamais les performances des Experts. C'est le bon reglage par
-- defaut — on ne classe pas une 6e face a un 3e — mais il manquait le
-- cas inverse.
--
-- `p_palier = 'tous'` desactive le filtre. On obtient alors les
-- meilleures performances du college, tous niveaux confondus.
--
-- USAGE : c'est un TABLEAU D'HONNEUR, pas un classement ou l'on se
-- situe. Personne ne s'attend a ce qu'un 6e detienne le record. A
-- afficher comme une vitrine (« les records du college »), jamais
-- comme le classement par defaut — sinon on retombe exactement sur
-- l'effet qu'on cherche a eviter : les memes toujours en tete, et les
-- plus fragiles toujours en bas.
--
-- Rappel des valeurs acceptees :
--   p_palier : 'decouverte' | 'confirme' | 'expert' | 'tous' | NULL
--              (NULL = le palier de l'eleve, comportement par defaut)
--   p_portee : 'classe' | 'niveau' | 'college'
-- =====================================================================

create or replace function public.classement_progression(
  p_periode text default 'semaine',
  p_portee  text default 'classe',
  p_palier  text default null,
  p_limite  integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,
  classe      text,
  avatar      text,
  points      integer,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe, plafond_tables from public.eleves where id = public.eleve_courant()
  ),
  cible as (
    select coalesce(p_palier,
      case when (select plafond_tables from moi) <= 10 then 'decouverte'
           when (select plafond_tables from moi) <= 12 then 'confirme'
           else 'expert' end) as palier,
      public.debut_periode(p_periode) as depuis
  ),
  activite as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           coalesce(sum(s.points), 0)                    as pts,
           count(distinct date_trunc('day', s.cree_le))  as jours
      from public.eleves e
      left join public.sessions_jeu s
             on s.eleve_id = e.id
            and s.cree_le >= (select depuis from cible)
            and ((select palier from cible) = 'tous'
                 or s.palier = (select palier from cible))
     where e.actif
       and (p_portee = 'college'
            or (p_portee = 'niveau'
                and public.niveau_scolaire(e.classe)
                  = public.niveau_scolaire((select classe from moi)))
            or (p_portee = 'classe' and e.classe = (select classe from moi)))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  ),
  verts as (
    select eleve_id, count(*) as nb from public.maitrise
     where niveau = 3 and derniere_vue >= (select depuis from cible)
     group by eleve_id
  )
  select row_number() over (order by
           (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0)) desc)  as rang,
         public.nom_public(a.prenom, a.nom),
         a.classe,
         a.avatar_emoji,
         (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0))::integer as points,
         a.id = public.eleve_courant()
    from activite a
    left join verts v on v.eleve_id = a.id
   where (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0)) > 0
   order by rang
   limit p_limite;
$$;

create or replace function public.classement_records(
  p_categorie text default 'serie',
  p_periode   text default 'tout',
  p_portee    text default 'classe',
  p_palier    text default null,
  p_limite    integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,
  classe      text,
  avatar      text,
  valeur      numeric,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe, plafond_tables from public.eleves where id = public.eleve_courant()
  ),
  cible as (
    select coalesce(p_palier,
      case when (select plafond_tables from moi) <= 10 then 'decouverte'
           when (select plafond_tables from moi) <= 12 then 'confirme'
           else 'expert' end) as palier
  ),
  base as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           case p_categorie
             when 'serie'  then max(s.sans_faute_max)::numeric
             when 'chrono' then max(s.points) filter (where s.mode = 'countdown')::numeric
             when 'montee' then max(s.plus_haute_table)::numeric
             when 'points' then sum(s.points)::numeric
             when 'sprint' then min(s.duree_s + 3 * jsonb_array_length(s.erreurs))
                                 filter (where s.mode = 'sprint')
           end as valeur
      from public.eleves e
      join public.sessions_jeu s on s.eleve_id = e.id
     where e.actif
       and s.cree_le >= public.debut_periode(p_periode)
       -- « montee » ignore toujours le palier : c'est le classement qui
       -- montre jusqu'ou chacun est alle, tous niveaux confondus.
       and (p_categorie = 'montee'
            or (select palier from cible) = 'tous'
            or s.palier = (select palier from cible))
       and (p_portee = 'college'
            or (p_portee = 'niveau'
                and public.niveau_scolaire(e.classe)
                  = public.niveau_scolaire((select classe from moi)))
            or (p_portee = 'classe' and e.classe = (select classe from moi)))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  )
  select row_number() over (
           order by case when p_categorie = 'sprint' then valeur end asc nulls last,
                    case when p_categorie <> 'sprint' then valeur end desc nulls last
         ) as rang,
         public.nom_public(prenom, nom),
         classe,
         avatar_emoji,
         round(valeur, 1),
         id = public.eleve_courant()
    from base
   where valeur is not null
   order by rang
   limit p_limite;
$$;

grant execute on function
  public.classement_records(text, text, text, text, integer),
  public.classement_progression(text, text, text, integer)
to authenticated;

```


## 20260827080000_administration.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 7 : administration des élèves
-- =====================================================================
--
-- Ce qui manquait : la vie courante d'un fichier d'élèves dans un
-- établissement. L'import de rentrée existait dans le brief mais pas
-- dans le code, et tout le reste n'était nulle part :
--
--   · un élève arrive en novembre           → ajouter_eleve()
--   · une adresse est mal orthographiee      → modifier_eleve()
--   · un élève part au 2e trimestre          → desactiver_eleve()
--   · il revient, ou c'était une erreur      → reactiver_eleve()
--   · une classe passe aux tables de 12      → definir_plafond_classe()
--   · qui n'a jamais réussi à se connecter ? → eleves_sans_connexion()
--
-- Deux principes de conception :
--
-- 1. ON NE SUPPRIME JAMAIS UN ELEVE en cours d'année. On le désactive.
--    Supprimer ferait disparaître ses sessions par cascade, ce qui
--    fausserait rétroactivement tous les classements de sa classe et
--    l'historique des défis auxquels il a participé. La suppression
--    définitive appartient à la fin de scolarité (RGPD), pas à la
--    gestion courante.
--
-- 2. TOUT EST TRACE. Plusieurs enseignants auront les droits ; il faut
--    pouvoir répondre à « qui a désactivé cet élève, et quand ? ».
-- =====================================================================

-- ---------------------------------------------------------------------
-- JOURNAL D'ADMINISTRATION
-- ---------------------------------------------------------------------
create table public.journal_admin (
  id           bigserial primary key,
  acteur_email text not null,
  action       text not null,
  cible        text,
  detail       jsonb not null default '{}',
  fait_le      timestamptz not null default now()
);

create index journal_admin_date_idx on public.journal_admin (fait_le desc);
create index journal_admin_cible_idx on public.journal_admin (cible);

alter table public.journal_admin enable row level security;
grant select on public.journal_admin to authenticated;

create policy journal_lecture_prof on public.journal_admin
  for select to authenticated using (public.est_prof());

-- Aucune politique d'écriture : seules les fonctions ci-dessous écrivent.

create or replace function public.journaliser(
  p_action text, p_cible text, p_detail jsonb default '{}')
returns void
language sql security definer set search_path = public
as $$
  insert into public.journal_admin (acteur_email, action, cible, detail)
  values (coalesce(
            (select email from public.profs where user_id = auth.uid()),
            (select email from public.eleves where user_id = auth.uid()),
            'inconnu'),
          p_action, p_cible, p_detail);
$$;

-- ---------------------------------------------------------------------
-- Plafond de tables par défaut, déduit du niveau
-- ---------------------------------------------------------------------
create or replace function public.plafond_par_defaut(p_classe text)
returns smallint
language sql immutable
as $$
  select case substring(coalesce(p_classe,'') from '^[0-9]')
           when '6' then 10
           when '5' then 12
           when '4' then 15
           when '3' then 15
           else 10
         end::smallint;
$$;

-- ---------------------------------------------------------------------
-- Le prof peut-il administrer cette classe ?
-- Un admin peut tout ; un prof, seulement ses classes.
-- ---------------------------------------------------------------------
create or replace function public.peut_administrer_classe(p_classe text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.est_admin() or public.prof_voit_classe(p_classe);
$$;

-- =====================================================================
-- IMPORT DE RENTREE
-- Reçoit un tableau JSON : [{"email","nom","prenom","classe"}, ...]
--
-- Comportement volontairement PRUDENT :
--   · élève présent dans le fichier   → créé, ou mis à jour et réactivé
--   · élève ABSENT du fichier         → laissé tel quel, JAMAIS désactivé
--
-- Désactiver en masse sur la foi d'un fichier serait le meilleur moyen
-- de couper l'accès à tout un niveau parce qu'un export s'est mal passé.
-- La fonction renvoie donc la liste des élèves actifs absents du
-- fichier : à l'administrateur de décider quoi en faire.
-- =====================================================================
create or replace function public.importer_eleves(p_eleves jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crees      int := 0;
  v_maj        int := 0;
  v_ignores    jsonb := '[]';
  v_absents    jsonb;
  e            jsonb;
  v_email      text;
  v_existe     boolean;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  if jsonb_typeof(p_eleves) <> 'array' then
    raise exception 'Le format attendu est un tableau JSON';
  end if;

  for e in select * from jsonb_array_elements(p_eleves) loop
    v_email := lower(trim(e->>'email'));

    -- Lignes inexploitables : on les signale plutôt que de les avaler
    if v_email is null or v_email = ''
       or e->>'nom' is null or e->>'prenom' is null or e->>'classe' is null
       or v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
      v_ignores := v_ignores || jsonb_build_object(
        'ligne', e, 'raison', 'email invalide ou champ manquant');
      continue;
    end if;

    select true into v_existe from public.eleves where lower(email) = v_email;

    if v_existe then
      update public.eleves
         set nom    = e->>'nom',
             prenom = e->>'prenom',
             classe = e->>'classe',
             actif  = true
       where lower(email) = v_email;
      v_maj := v_maj + 1;
    else
      insert into public.eleves (email, nom, prenom, classe, plafond_tables)
      values (v_email, e->>'nom', e->>'prenom', e->>'classe',
              public.plafond_par_defaut(e->>'classe'));
      v_crees := v_crees + 1;
    end if;
    v_existe := null;
  end loop;

  -- Qui est actif en base mais absent du fichier ?
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', email, 'nom', nom, 'prenom', prenom, 'classe', classe)), '[]')
    into v_absents
    from public.eleves
   where actif
     and lower(email) not in (
       select lower(trim(x->>'email')) from jsonb_array_elements(p_eleves) x
        where x->>'email' is not null);

  perform public.journaliser('import_eleves', null, jsonb_build_object(
    'crees', v_crees, 'mis_a_jour', v_maj,
    'ignores', jsonb_array_length(v_ignores),
    'absents_du_fichier', jsonb_array_length(v_absents)));

  return jsonb_build_object(
    'crees', v_crees,
    'mis_a_jour', v_maj,
    'lignes_ignorees', v_ignores,
    'actifs_absents_du_fichier', v_absents
  );
end;
$$;

-- =====================================================================
-- AJOUT A L'UNITE — l'élève qui arrive en cours d'année
-- Accessible aussi au professeur, pour ses classes : sinon tout passe
-- par l'administrateur et l'élève attend.
-- =====================================================================
create or replace function public.ajouter_eleve(
  p_email  text,
  p_nom    text,
  p_prenom text,
  p_classe text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_id    uuid;
  v_actif boolean;
begin
  if not public.peut_administrer_classe(p_classe) then
    raise exception 'Tu ne peux ajouter un eleve que dans tes classes'
      using errcode = '42501';
  end if;

  if v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
    raise exception 'Adresse e-mail invalide : %', p_email;
  end if;

  select id, actif into v_id, v_actif
    from public.eleves where lower(email) = v_email;

  if v_id is not null then
    if v_actif then
      return jsonb_build_object('ok', false, 'raison', 'existe_deja',
        'message', 'Cet eleve existe deja et il est actif.', 'eleve_id', v_id);
    end if;
    update public.eleves
       set actif = true, nom = p_nom, prenom = p_prenom, classe = p_classe
     where id = v_id;
    perform public.journaliser('reactivation_via_ajout', v_email, '{}');
    return jsonb_build_object('ok', true, 'reactive', true, 'eleve_id', v_id,
      'message', 'Cet eleve existait deja, desactive. Il a ete reactive.');
  end if;

  insert into public.eleves (email, nom, prenom, classe, plafond_tables)
  values (v_email, p_nom, p_prenom, p_classe, public.plafond_par_defaut(p_classe))
  returning id into v_id;

  perform public.journaliser('ajout_eleve', v_email,
    jsonb_build_object('classe', p_classe));

  return jsonb_build_object('ok', true, 'reactive', false, 'eleve_id', v_id,
    'message', 'Eleve ajoute. Il peut se connecter immediatement.');
end;
$$;

-- =====================================================================
-- CORRECTION D'UNE FICHE
--
-- ⚠️ L'adresse e-mail ne peut être corrigée QUE si l'élève ne s'est
-- jamais connecté. Une fois le compte rattaché, changer l'adresse
-- laisserait l'élève connecté sous une identité qui n'existe plus, et
-- les codes partiraient à la mauvaise boîte. Dans ce cas : désactiver
-- l'ancienne fiche, en créer une nouvelle.
-- =====================================================================
create or replace function public.modifier_eleve(
  p_eleve_id uuid,
  p_email    text default null,
  p_nom      text default null,
  p_prenom   text default null,
  p_classe   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ancien public.eleves%rowtype;
  v_email  text := lower(trim(p_email));
begin
  select * into v_ancien from public.eleves where id = p_eleve_id;
  if not found then raise exception 'Eleve introuvable'; end if;

  if not public.peut_administrer_classe(v_ancien.classe) then
    raise exception 'Tu ne peux modifier que les eleves de tes classes'
      using errcode = '42501';
  end if;

  if p_classe is not null and not public.peut_administrer_classe(p_classe) then
    raise exception 'Tu ne peux pas deplacer un eleve vers une classe qui n''est pas la tienne'
      using errcode = '42501';
  end if;

  if p_email is not null and v_email <> lower(v_ancien.email) then
    if v_ancien.user_id is not null then
      raise exception 'Impossible : cet eleve s''est deja connecte. Desactive cette fiche et cree-en une nouvelle.';
    end if;
    if v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
      raise exception 'Adresse e-mail invalide : %', p_email;
    end if;
  end if;

  update public.eleves
     set email  = coalesce(v_email, email),
         nom    = coalesce(p_nom, nom),
         prenom = coalesce(p_prenom, prenom),
         classe = coalesce(p_classe, classe),
         plafond_tables = case
           when p_classe is not null and p_classe <> v_ancien.classe
                and plafond_tables = public.plafond_par_defaut(v_ancien.classe)
           then public.plafond_par_defaut(p_classe)
           else plafond_tables end
   where id = p_eleve_id;

  perform public.journaliser('modification_eleve', v_ancien.email,
    jsonb_build_object('avant', jsonb_build_object(
      'email', v_ancien.email, 'nom', v_ancien.nom,
      'prenom', v_ancien.prenom, 'classe', v_ancien.classe)));

  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- DEPART ET RETOUR
-- =====================================================================
create or replace function public.desactiver_eleve(p_eleve_id uuid, p_motif text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_e public.eleves%rowtype;
begin
  select * into v_e from public.eleves where id = p_eleve_id;
  if not found then raise exception 'Eleve introuvable'; end if;
  if not public.peut_administrer_classe(v_e.classe) then
    raise exception 'Reserve aux enseignants de cette classe' using errcode = '42501';
  end if;

  update public.eleves set actif = false where id = p_eleve_id;
  perform public.journaliser('desactivation', v_e.email,
    jsonb_build_object('motif', p_motif, 'classe', v_e.classe));

  return jsonb_build_object('ok', true,
    'message', 'Eleve desactive. Ses resultats sont conserves.');
end;
$$;

create or replace function public.reactiver_eleve(p_eleve_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_e public.eleves%rowtype;
begin
  select * into v_e from public.eleves where id = p_eleve_id;
  if not found then raise exception 'Eleve introuvable'; end if;
  if not public.peut_administrer_classe(v_e.classe) then
    raise exception 'Reserve aux enseignants de cette classe' using errcode = '42501';
  end if;

  update public.eleves set actif = true where id = p_eleve_id;
  perform public.journaliser('reactivation', v_e.email, '{}');
  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- PLAFOND DE TABLES D'UNE CLASSE
-- « Mes 5e sont prets pour les tables jusqu'a 12 » — une seule action.
-- Ne redescend jamais le plafond d'un eleve qui a debloque plus haut
-- par la Montee des tables : ce serait lui retirer ce qu'il a gagne.
-- =====================================================================
create or replace function public.definir_plafond_classe(
  p_classe text, p_plafond smallint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not public.peut_administrer_classe(p_classe) then
    raise exception 'Reserve aux enseignants de cette classe' using errcode = '42501';
  end if;
  if p_plafond < 5 or p_plafond > 20 then
    raise exception 'Le plafond doit etre compris entre 5 et 20';
  end if;

  update public.eleves
     set plafond_tables = greatest(plafond_tables, p_plafond)
   where classe = p_classe and actif and plafond_tables < p_plafond;
  get diagnostics v_n = row_count;

  perform public.journaliser('plafond_classe', p_classe,
    jsonb_build_object('plafond', p_plafond, 'eleves_modifies', v_n));

  return jsonb_build_object('ok', true, 'eleves_modifies', v_n,
    'message', v_n || ' eleve(s) peuvent desormais aller jusqu''a la table ' || p_plafond);
end;
$$;

-- =====================================================================
-- SUIVI DE RENTREE
-- Qui n'a jamais reussi a se connecter ? La question qu'on se pose
-- pendant les deux premieres semaines, et qui evite de decouvrir en
-- decembre que six eleves n'ont jamais ouvert leur boite scolaire.
-- =====================================================================
create or replace function public.eleves_sans_connexion(p_classe text default null)
returns table (
  eleve_id uuid, email text, nom text, prenom text, classe text, cree_le timestamptz
)
language sql security definer set search_path = public
as $$
  select e.id, e.email, e.nom, e.prenom, e.classe, e.cree_le
    from public.eleves e
   where e.actif
     and e.user_id is null
     and (p_classe is null or e.classe = p_classe)
     and public.peut_administrer_classe(e.classe)
   order by e.classe, e.nom, e.prenom;
$$;

grant execute on function
  public.plafond_par_defaut(text),
  public.peut_administrer_classe(text),
  public.importer_eleves(jsonb),
  public.ajouter_eleve(text, text, text, text),
  public.modifier_eleve(uuid, text, text, text, text),
  public.desactiver_eleve(uuid, text),
  public.reactiver_eleve(uuid),
  public.definir_plafond_classe(text, smallint),
  public.eleves_sans_connexion(text)
to authenticated;

```


## 20260827090000_comptes_profs.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 8 : comptes enseignants, et fin du cloisonnement par classe
-- =====================================================================
--
-- DEUX DECISIONS, PRISES LE 27 AOUT 2026
--
-- 1. UN ENSEIGNANT VOIT TOUTES LES CLASSES.
--
--    Le cloisonnement `profs.classes[]` disparaît en tant que
--    permission. Motif : les affectations changent chaque année, un
--    professeur remplace un collègue, échange un service. Le champ
--    serait périmé en permanence, et chaque « je ne vois pas ma
--    classe » remonterait à l'administrateur.
--
--    L'établissement compte quatre professeurs de mathématiques qui se
--    croisent tous les jours. A cette échelle, la traçabilité vaut
--    mieux que le cloisonnement : tout est journalisé, tout est
--    réversible, et personne ne peut supprimer un élève.
--
--    `profs.classes[]` SURVIT, mais comme simple RACCOURCI — « mes
--    classes habituelles », pour ouvrir directement la bonne. Vide par
--    défaut : on voit alors la liste complète. Rien à maintenir.
--
--    Note RGPD : un enseignant accède donc aux données de maîtrise de
--    tout le collège. C'est proportionné — données pédagogiques,
--    collègues du même établissement, intérêt éducatif légitime — mais
--    à mentionner au registre de traitement.
--
-- 2. DEUX ROLES, PAS DE MATRICE DE DROITS.
--
--    `prof`  : tout le pédagogique + la gestion des élèves
--    `admin` : en plus, l'import de rentrée et les comptes enseignants
--
--    Un enseignant peut être administrateur : c'est le même compte, le
--    rôle vaut `admin`, et il garde toutes les capacités d'un prof.
-- =====================================================================

comment on column public.profs.classes is
  'Classes habituelles — RACCOURCI d''affichage uniquement, ne donne aucun droit. Vide = voit la liste complète.';

-- ---------------------------------------------------------------------
-- Les deux verrous de permission s'ouvrent à tous les enseignants.
--
-- On garde volontairement les MEMES NOMS de fonction : toutes les
-- politiques RLS des migrations 2 et 7 les appellent, elles suivent
-- donc automatiquement sans être réécrites.
-- ---------------------------------------------------------------------
create or replace function public.prof_voit_classe(p_classe text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.est_prof();
$$;

comment on function public.prof_voit_classe(text) is
  'Depuis le 27/08/2026 : tout enseignant voit toutes les classes. Le parametre est conserve pour ne pas reecrire les politiques RLS.';

create or replace function public.peut_administrer_classe(p_classe text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.est_prof();
$$;

-- =====================================================================
-- COMPTES ENSEIGNANTS
-- Quatre professeurs : la saisie à la main suffit, pas besoin d'import.
-- =====================================================================

create or replace function public.creer_prof(
  p_email   text,
  p_nom     text,
  p_role    text default 'prof',
  p_classes text[] default '{}'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_id    uuid;
  v_actif boolean;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;
  if p_role not in ('prof', 'admin') then
    raise exception 'Role inconnu : % (attendu prof ou admin)', p_role;
  end if;
  if v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
    raise exception 'Adresse e-mail invalide : %', p_email;
  end if;

  select id, actif into v_id, v_actif from public.profs where lower(email) = v_email;

  if v_id is not null then
    if v_actif then
      return jsonb_build_object('ok', false, 'raison', 'existe_deja',
        'message', 'Ce compte enseignant existe deja.', 'prof_id', v_id);
    end if;
    update public.profs
       set actif = true, nom = p_nom, role = p_role, classes = coalesce(p_classes, '{}')
     where id = v_id;
    perform public.journaliser('reactivation_prof', v_email,
      jsonb_build_object('role', p_role));
    return jsonb_build_object('ok', true, 'reactive', true, 'prof_id', v_id,
      'message', 'Ce compte existait, desactive. Il a ete reactive.');
  end if;

  insert into public.profs (email, nom, role, classes)
  values (v_email, p_nom, p_role, coalesce(p_classes, '{}'))
  returning id into v_id;

  perform public.journaliser('creation_prof', v_email,
    jsonb_build_object('role', p_role, 'nom', p_nom));

  return jsonb_build_object('ok', true, 'reactive', false, 'prof_id', v_id,
    'message', 'Compte cree. Il peut se connecter immediatement avec son adresse.');
end;
$$;

-- ---------------------------------------------------------------------
-- Modifier un compte enseignant
--
-- ⚠️ GARDE-FOU : il doit toujours rester AU MOINS UN administrateur
-- actif. Sans ce verrou, une fausse manœuvre — se retrograder soi-meme
-- quand on est seul admin — enfermerait tout le monde dehors, et il
-- faudrait passer par la console Supabase pour s'en sortir.
-- ---------------------------------------------------------------------
create or replace function public.nb_admins_actifs()
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::integer from public.profs where role = 'admin' and actif;
$$;

create or replace function public.modifier_prof(
  p_prof_id uuid,
  p_nom     text default null,
  p_role    text default null,
  p_classes text[] default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_p public.profs%rowtype;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  select * into v_p from public.profs where id = p_prof_id;
  if not found then raise exception 'Compte enseignant introuvable'; end if;

  if p_role is not null and p_role not in ('prof', 'admin') then
    raise exception 'Role inconnu : %', p_role;
  end if;

  if p_role = 'prof' and v_p.role = 'admin' and v_p.actif
     and public.nb_admins_actifs() <= 1 then
    raise exception 'Impossible : c''est le dernier administrateur actif. Nomme d''abord un autre administrateur.';
  end if;

  update public.profs
     set nom     = coalesce(p_nom, nom),
         role    = coalesce(p_role, role),
         classes = coalesce(p_classes, classes)
   where id = p_prof_id;

  perform public.journaliser('modification_prof', v_p.email,
    jsonb_build_object('avant', jsonb_build_object('nom', v_p.nom, 'role', v_p.role)));

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.desactiver_prof(p_prof_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_p public.profs%rowtype;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  select * into v_p from public.profs where id = p_prof_id;
  if not found then raise exception 'Compte enseignant introuvable'; end if;

  if v_p.role = 'admin' and v_p.actif and public.nb_admins_actifs() <= 1 then
    raise exception 'Impossible : c''est le dernier administrateur actif. Nomme d''abord un autre administrateur.';
  end if;

  update public.profs set actif = false where id = p_prof_id;
  perform public.journaliser('desactivation_prof', v_p.email, '{}');

  return jsonb_build_object('ok', true,
    'message', 'Compte desactive. Il n''a plus acces a l''application.');
end;
$$;

-- ---------------------------------------------------------------------
-- Chaque enseignant règle SES propres raccourcis de classe.
-- Pas besoin d'être administrateur : ce ne sont que des favoris.
-- ---------------------------------------------------------------------
create or replace function public.definir_mes_classes(p_classes text[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_id uuid := public.prof_courant();
begin
  if v_id is null then
    raise exception 'Reserve aux enseignants' using errcode = '42501';
  end if;
  update public.profs set classes = coalesce(p_classes, '{}') where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- La liste des enseignants, pour l'écran d'administration
-- ---------------------------------------------------------------------
create or replace function public.liste_profs()
returns table (
  prof_id   uuid,
  email     text,
  nom       text,
  role      text,
  classes   text[],
  actif     boolean,
  connecte  boolean
)
language sql security definer set search_path = public
as $$
  select p.id, p.email, p.nom, p.role, p.classes, p.actif,
         p.user_id is not null
    from public.profs p
   where public.est_prof()
   order by p.actif desc, p.role, p.nom;
$$;

-- ---------------------------------------------------------------------
-- Toutes les classes existantes, avec leurs effectifs
-- Sert au sélecteur de classe : plus d'affectation figée, on choisit.
-- ---------------------------------------------------------------------
create or replace function public.liste_classes()
returns table (
  classe        text,
  niveau        text,
  eleves_actifs integer,
  est_favorite  boolean
)
language sql security definer set search_path = public
as $$
  select e.classe,
         public.niveau_scolaire(e.classe),
         count(*)::integer,
         e.classe = any(coalesce(
           (select classes from public.profs where user_id = auth.uid()), '{}'))
    from public.eleves e
   where e.actif and public.est_prof()
   group by e.classe
   order by e.classe;
$$;

grant execute on function
  public.creer_prof(text, text, text, text[]),
  public.modifier_prof(uuid, text, text, text[]),
  public.desactiver_prof(uuid),
  public.definir_mes_classes(text[]),
  public.nb_admins_actifs(),
  public.liste_profs(),
  public.liste_classes()
to authenticated;

```


## 20260827100000_profs_joueurs.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 9 : les enseignants jouent aussi
-- =====================================================================
--
-- Un professeur qui pratique lui-même l'outil le comprend mieux, sait
-- de quoi il parle en classe, et peut se mesurer à ses collègues.
--
-- CHOIX DE CONCEPTION : une table SEPAREE, `sessions_profs`.
--
-- On aurait pu ajouter une colonne `prof_id` à `sessions_jeu`. Ce
-- serait une erreur : toutes les fonctions de classement, la maîtrise,
-- les badges, les défis reposent sur `eleve_id` et sont testés. Y
-- introduire une seconde identité, c'est ouvrir la porte à ce qu'un
-- professeur apparaisse un jour dans un classement d'élèves à cause
-- d'un oubli de filtre.
--
-- Deux tables, aucune intersection possible. Le code existant n'est
-- pas touché d'une ligne.
--
-- Les parties des enseignants ne donnent ni badges ni grille de
-- maîtrise : c'est pour le plaisir et l'émulation entre collègues, pas
-- un dispositif de remédiation.
-- =====================================================================

create table public.sessions_profs (
  id            uuid primary key default gen_random_uuid(),
  prof_id       uuid not null references public.profs(id) on delete cascade,
  mode          text not null check (mode in
                  ('libre', 'sprint', 'flawless', 'countdown', 'climb')),
  tables        smallint[] not null default '{}',
  nb_questions  integer not null default 0,
  score         integer not null default 0,
  duree_s       numeric(8,2) not null default 0,
  serie_max     integer not null default 0,
  sans_faute_max integer not null default 0,
  plus_haute_table smallint,
  points        integer not null default 0,
  cree_le       timestamptz not null default now()
);

create index sessions_profs_idx on public.sessions_profs (prof_id, cree_le desc);

alter table public.sessions_profs enable row level security;
grant select, insert on public.sessions_profs to authenticated;

-- Les scores des enseignants ne sont visibles QUE des enseignants.
-- Aucun élève ne peut lire cette table, ni par requête directe ni par
-- classement : il n'existe aucune fonction qui l'expose aux élèves.
create policy sessions_profs_lecture on public.sessions_profs
  for select to authenticated using (public.est_prof());

create policy sessions_profs_insert on public.sessions_profs
  for insert to authenticated with check (prof_id = public.prof_courant());

-- ---------------------------------------------------------------------
-- Enregistrer une partie d'enseignant
-- Aucun plafond de tables : un adulte joue ce qu'il veut, jusqu'a 20.
-- ---------------------------------------------------------------------
create or replace function public.enregistrer_session_prof(
  p_mode            text,
  p_tables          smallint[],
  p_nb_questions    integer,
  p_score           integer,
  p_duree_s         numeric  default 0,
  p_serie_max       integer  default 0,
  p_sans_faute_max  integer  default 0,
  p_plus_haute_table smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof   uuid := public.prof_courant();
  v_id     uuid;
  v_points integer;
begin
  if v_prof is null then
    raise exception 'Reserve aux enseignants' using errcode = '42501';
  end if;
  if p_score > greatest(p_nb_questions, 0) then
    raise exception 'Score incoherent';
  end if;

  v_points := round(p_score * public.poids_moyen(p_tables) * 10);

  insert into public.sessions_profs (
    prof_id, mode, tables, nb_questions, score, duree_s,
    serie_max, sans_faute_max, plus_haute_table, points)
  values (
    v_prof, p_mode, coalesce(p_tables, '{}'), p_nb_questions, p_score, p_duree_s,
    p_serie_max, p_sans_faute_max, p_plus_haute_table, v_points)
  returning id into v_id;

  return jsonb_build_object('session_id', v_id, 'points', v_points);
end;
$$;

-- ---------------------------------------------------------------------
-- LE CLASSEMENT DE LA SALLE DES PROFS
-- Reserve aux enseignants — la fonction ne renvoie rien a un eleve.
--
-- Contrairement au classement des eleves, on affiche le nom COMPLET :
-- entre adultes qui se connaissent, « M. D. » n'aurait aucun sens.
-- ---------------------------------------------------------------------
create or replace function public.classement_profs(
  p_categorie text default 'points',   -- points | serie | chrono | sprint | montee
  p_periode   text default 'tout',
  p_limite    integer default 20
)
returns table (
  rang     bigint,
  nom      text,
  valeur   numeric,
  parties  integer,
  est_moi  boolean
)
language sql
security definer
set search_path = public
as $$
  select row_number() over (
           order by case when p_categorie = 'sprint' then v end asc nulls last,
                    case when p_categorie <> 'sprint' then v end desc nulls last) as rang,
         nom, round(v, 1), parties, moi
    from (
      select p.nom,
             case p_categorie
               when 'points' then sum(s.points)::numeric
               when 'serie'  then max(s.sans_faute_max)::numeric
               when 'chrono' then max(s.points) filter (where s.mode = 'countdown')::numeric
               when 'montee' then max(s.plus_haute_table)::numeric
               when 'sprint' then min(s.duree_s) filter (where s.mode = 'sprint')
             end                                  as v,
             count(*)::integer                    as parties,
             p.id = public.prof_courant()         as moi
        from public.profs p
        join public.sessions_profs s on s.prof_id = p.id
       where p.actif
         and public.est_prof()          -- verrou : rien pour un eleve
         and s.cree_le >= public.debut_periode(p_periode)
       group by p.id, p.nom
    ) x
   where v is not null
   order by rang
   limit p_limite;
$$;

-- =====================================================================
-- QUI SUIS-JE ?
--
-- Il manquait la brique la plus basique : au demarrage, l'application
-- n'avait aucun moyen de savoir si la personne connectee est un eleve
-- ou un enseignant, donc quel ecran d'accueil afficher.
--
-- `mon_profil()` ne repond que pour les eleves et renvoyait null a un
-- professeur. A appeler en premier, juste apres la connexion.
-- =====================================================================
create or replace function public.qui_suis_je()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case
    when public.eleve_courant() is not null then
      jsonb_build_object(
        'type', 'eleve',
        'profil', (select to_jsonb(x) from (
            select id, prenom, nom, classe, avatar_emoji, plafond_tables,
                   tables_autorisees
              from public.eleves where id = public.eleve_courant()) x))
    when public.prof_courant() is not null then
      jsonb_build_object(
        'type', 'prof',
        'admin', public.est_admin(),
        'profil', (select to_jsonb(x) from (
            select id, nom, email, role, classes
              from public.profs where id = public.prof_courant()) x))
    else
      -- Compte cree mais absent des tables : c'est la barriere d'entree.
      -- L'ecran doit dire de contacter son professeur, pas planter.
      jsonb_build_object('type', 'inconnu',
        'message', 'Ce compte n''est pas reconnu. Demande a ton professeur.')
  end;
$$;

grant execute on function
  public.enregistrer_session_prof(text, smallint[], integer, integer, numeric, integer, integer, smallint),
  public.classement_profs(text, text, integer),
  public.qui_suis_je()
to authenticated;

```


## 20260827110000_montee_reelle.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 10 : la montee des tables ne se gagne qu'en Montee
-- =====================================================================
--
-- CONSTAT (revue de l'etape 2, 27 aout 2026)
--
-- `enregistrer_session()` accordait les badges `climb_10`, `climb_12`,
-- `climb_15`, `climb_20` des que `p_plus_haute_table` atteignait le
-- seuil — quel que soit le mode.
--
-- Or le front envoie, en entrainement libre comme en defi, la plus
-- grande table COCHEE dans le selecteur. Un eleve qui coche la table 10
-- et repond a trois questions decrochait donc `climb_10`, sans avoir
-- jamais joue la Montee. Le badge le plus symbolique du jeu devenait le
-- plus facile a obtenir.
--
-- Meme raisonnement pour la colonne `sessions_jeu.plus_haute_table`,
-- qui alimente le classement « montee » : elle enregistrait un choix de
-- selecteur, pas une performance.
--
-- CORRECTIF : la valeur n'est retenue que si `p_mode = 'climb'`.
-- On corrige EN BASE et pas seulement dans le front : un client peut
-- toujours mentir, la base non.
--
-- Rien d'autre ne change dans la fonction.
-- =====================================================================

create or replace function public.enregistrer_session(
  p_mode            text,
  p_tables          smallint[],
  p_nb_questions    integer,
  p_score           integer,
  p_erreurs         jsonb    default '[]',
  p_duree_s         numeric  default 0,
  p_serie_max       integer  default 0,
  p_sans_faute_max  integer  default 0,
  p_plus_haute_table smallint default null,
  p_maitrise        jsonb    default '{}',
  p_defi_id         uuid     default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve      uuid := public.eleve_courant();
  v_session_id uuid;
  v_fait       text;
  v_niveau     smallint;
  v_nouveaux   text[] := '{}';
  v_badge      text;
  v_seuil      integer;
  v_points     integer;
  v_palier     text;
  v_plafond    smallint;
  v_montee     smallint;   -- table atteinte EN MONTEE, null ailleurs
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu. Reconnecte-toi.' using errcode = '42501';
  end if;

  if p_score > greatest(p_nb_questions, 0) then
    raise exception 'Score incohérent';
  end if;

  -- Un élève ne peut pas envoyer une partie sur des tables au-dessus de
  -- son plafond : ce serait le moyen simple de gonfler ses points.
  select plafond_tables into v_plafond from public.eleves where id = v_eleve;
  if p_tables is not null
     and (select max(x) from unnest(p_tables) x) > v_plafond then
    raise exception 'Tu n''as pas encore debloque la table %. Passe par la Montee des tables.',
      (select max(x) from unnest(p_tables) x)
      using errcode = 'P0001';
  end if;

  -- Seule la Montee des tables temoigne d'une table « atteinte ».
  -- Ailleurs, `p_plus_haute_table` n'est que la plus grande table cochee
  -- dans le selecteur — la retenir distribuerait les badges climb_* a
  -- qui coche 10 en entrainement libre.
  v_montee := case when p_mode = 'climb' then p_plus_haute_table else null end;

  v_points := round(p_score * public.poids_moyen(p_tables) * 10);
  v_palier := public.palier_tables(p_tables);

  insert into public.sessions_jeu (
    eleve_id, defi_id, mode, tables, nb_questions, score,
    erreurs, duree_s, serie_max, sans_faute_max, plus_haute_table,
    points, palier)
  values (
    v_eleve, p_defi_id, p_mode, coalesce(p_tables, '{}'), p_nb_questions, p_score,
    coalesce(p_erreurs, '[]'), p_duree_s, p_serie_max, p_sans_faute_max,
    v_montee, v_points, v_palier)
  returning id into v_session_id;

  -- ---- Déblocage par la Montée des tables ----------------------------
  -- Franchir la table N en Montée débloque la table N+1 en entraînement.
  if coalesce(v_montee, 0) >= v_plafond then
    update public.eleves
       set plafond_tables = least(20, coalesce(v_montee, 0) + 1)
     where id = v_eleve
       and plafond_tables < least(20, coalesce(v_montee, 0) + 1);
  end if;

  -- ---- Maîtrise -----------------------------------------------------
  for v_fait, v_niveau in
    select key, value::text::smallint from jsonb_each(coalesce(p_maitrise, '{}'))
  loop
    insert into public.maitrise (eleve_id, fait, niveau, nb_vues, nb_reussites, derniere_vue)
    values (v_eleve, v_fait, v_niveau, 1, case when v_niveau >= 2 then 1 else 0 end, now())
    on conflict (eleve_id, fait) do update
      set niveau       = excluded.niveau,
          nb_vues      = public.maitrise.nb_vues + 1,
          nb_reussites = public.maitrise.nb_reussites
                         + case when excluded.niveau >= 2 then 1 else 0 end,
          derniere_vue = now();
  end loop;

  -- ---- Badges -------------------------------------------------------
  foreach v_seuil in array array[10, 20, 30, 50, 100] loop
    if p_sans_faute_max >= v_seuil then
      v_badge := 'streak_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  foreach v_seuil in array array[10, 12, 15, 20] loop
    if coalesce(v_montee, 0) >= v_seuil then
      v_badge := 'climb_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  if p_nb_questions >= 10 and p_duree_s > 0 then
    if p_duree_s / p_nb_questions < 2 then
      insert into public.badges (eleve_id, badge_id) values (v_eleve, 'speed_2s')
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || 'speed_2s'::text; end if;
    elsif p_duree_s / p_nb_questions < 3 then
      insert into public.badges (eleve_id, badge_id) values (v_eleve, 'speed_3s')
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || 'speed_3s'::text; end if;
    end if;
  end if;

  declare v_jours integer;
  begin
    select count(distinct date_trunc('day', cree_le)) into v_jours
      from public.sessions_jeu
     where eleve_id = v_eleve and cree_le > now() - interval '7 days';
    foreach v_seuil in array array[3, 7] loop
      if v_jours >= v_seuil then
        v_badge := 'days_' || v_seuil;
        insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
        on conflict do nothing;
        if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
      end if;
    end loop;
  end;

  return jsonb_build_object(
    'session_id',      v_session_id,
    'points',          v_points,
    'palier',          v_palier,
    'plafond_tables',  (select plafond_tables from public.eleves where id = v_eleve),
    'nouveaux_badges', to_jsonb(v_nouveaux)
  );
end;
$$;

```


## 20260827120000_profil_complet.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 11 : `mon_profil()` renvoie enfin le plafond et les points
-- =====================================================================
--
-- CONSTAT (avant l'etape 3, 27 aout 2026)
--
-- L'ecran Profil doit afficher trois choses que `mon_profil()` ne
-- renvoyait pas :
--
--   * le PLAFOND de tables reellement debloque
--   * le PALIER (Decouverte / Confirme / Expert), qui en decoule
--   * le TOTAL DE POINTS ponderes
--
-- Pire : la fonction renvoyait `tables_autorisees`, une colonne
-- FOSSILE. Elle vaut 1..10 pour tout le monde depuis le premier jour,
-- un trigger de protection interdit sa modification, et rien ne la met
-- a jour. Un eleve Expert ayant debloque la table 17 y lisait encore
-- « 1 a 10 ». Un ecran construit dessus aurait ete faux sans que
-- personne ne comprenne pourquoi.
--
-- C'est `plafond_tables` qui fait foi, et elle seule.
--
-- `tables_autorisees` est conservee — la supprimer casserait les types
-- generes et `qui_suis_je()` — mais elle est marquee comme obsolete et
-- ne doit servir a AUCUN affichage.
-- =====================================================================

comment on column public.eleves.tables_autorisees is
  'OBSOLETE — vestige de la version Google Sheets. Figee a 1..10, protegee en ecriture, jamais mise a jour. Ne rien afficher a partir de cette colonne : le plafond reel est `plafond_tables`.';

-- ---------------------------------------------------------------------
-- Le palier d'un eleve, deduit de son plafond.
-- Une seule definition, partagee par le profil et les classements.
-- ---------------------------------------------------------------------
create or replace function public.palier_de_plafond(p_plafond smallint)
returns text
language sql immutable
as $$
  select case when coalesce(p_plafond, 10) <= 10 then 'decouverte'
              when coalesce(p_plafond, 10) <= 12 then 'confirme'
              else 'expert' end;
$$;

comment on function public.palier_de_plafond(smallint) is
  'Decouverte <= 10, Confirme <= 12, Expert au-dela. Le palier n''est jamais saisi : il se deduit du plafond debloque.';

-- ---------------------------------------------------------------------
-- Profil complet, en un seul appel.
-- ---------------------------------------------------------------------
create or replace function public.mon_profil()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profil', (select to_jsonb(x) from (
        select id, prenom, nom, classe, avatar_emoji, email,
               plafond_tables,
               public.palier_de_plafond(plafond_tables) as palier,
               tables_autorisees   -- OBSOLETE, ne rien afficher avec
          from public.eleves where id = public.eleve_courant()) x),
    'records', (select jsonb_build_object(
        'meilleure_serie',   coalesce(max(sans_faute_max), 0),
        'meilleur_chrono',   coalesce(max(score) filter (where mode = 'countdown'), 0),
        -- Depuis la migration 10, cette colonne n'est renseignee qu'en
        -- mode Montee : elle designe donc une table VRAIMENT atteinte.
        'plus_haute_table',  coalesce(max(plus_haute_table), 0),
        'nb_sessions',       count(*),
        'points_total',      coalesce(sum(points), 0),
        'points_semaine',    coalesce(sum(points)
                               filter (where cree_le >= public.debut_periode('semaine')), 0),
        'jours_actifs_7j',   (select count(distinct date_trunc('day', cree_le))
                                from public.sessions_jeu
                               where eleve_id = public.eleve_courant()
                                 and cree_le > now() - interval '7 days'))
        from public.sessions_jeu where eleve_id = public.eleve_courant()),
    'maitrise', (select coalesce(jsonb_object_agg(fait, niveau), '{}')
        from public.maitrise where eleve_id = public.eleve_courant()),
    'badges', (select coalesce(jsonb_agg(badge_id), '[]')
        from public.badges where eleve_id = public.eleve_courant())
  );
$$;

grant execute on function public.palier_de_plafond(smallint) to authenticated;
grant execute on function public.mon_profil() to authenticated;

```


## 20260828080000_premier_essai.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 12 : la reponse trouvee du premier coup vaut plus
-- =====================================================================
--
-- POURQUOI (decide avec Aymeri le 28 aout 2026)
--
-- La saisie passe a un modele a CASES : autant de cases que de chiffres
-- dans la reponse. Des que la derniere case est remplie, le systeme
-- juge. Si c'est faux, les cases se vident et l'eleve peut reessayer
-- tant que le compte a rebours de la question tourne.
--
-- Il fallait alors decider ce que vaut une reponse rattrapee.
--
--   * Ne rien accorder etait un piege : chercher coutait des secondes
--     pour zero point, alors qu'abandonner ne coutait rien. Le jeu
--     aurait appris a renoncer.
--
--   * Accorder le point entier effacait toute difference entre savoir
--     ses tables et les retrouver en tatonnant — or c'est exactement
--     la difference que le classement doit montrer.
--
-- REGLE RETENUE, la meme partout :
--
--   trouve du premier coup  ->  1 point
--   rattrape               ->  1/2 point
--   jamais trouve          ->  0
--
-- Chercher rapporte donc toujours plus qu'abandonner, et l'automatisme
-- reste mieux paye que le tatonnement. C'est la ponderation par table,
-- appliquee un cran plus fin.
--
-- COMPATIBILITE : `p_score_premier_essai` vaut null par defaut, et est
-- alors traite comme egal a `p_score`. Les parties mises en attente
-- hors ligne par l'ancien client remontent donc sans etre penalisees.
-- =====================================================================

alter table public.sessions_jeu
  add column if not exists score_premier_essai integer not null default 0;

comment on column public.sessions_jeu.score_premier_essai is
  'Reponses justes des la premiere saisie complete. Les autres reussites sont des rattrapages et valent un demi-point.';

alter table public.sessions_profs
  add column if not exists score_premier_essai integer not null default 0;

-- ---------------------------------------------------------------------
-- Une seule definition du calcul, partagee eleves / enseignants.
-- ---------------------------------------------------------------------
create or replace function public.points_session(
  p_score              integer,
  p_score_premier      integer,
  p_tables             smallint[]
)
returns integer
language sql immutable
as $$
  select round(
    (coalesce(p_score_premier, p_score)
     + 0.5 * (p_score - coalesce(p_score_premier, p_score)))
    * public.poids_moyen(p_tables) * 10
  )::integer;
$$;

comment on function public.points_session(integer, integer, smallint[]) is
  'Premier coup = 1 point, rattrapage = 1/2, le tout multiplie par le poids moyen des tables. p_score_premier null => tout compte comme premier coup (ancien client).';

drop function if exists public.enregistrer_session(
  text, smallint[], integer, integer, jsonb, numeric,
  integer, integer, smallint, jsonb, uuid);

create or replace function public.enregistrer_session(
  p_mode            text,
  p_tables          smallint[],
  p_nb_questions    integer,
  p_score           integer,
  p_erreurs         jsonb    default '[]',
  p_duree_s         numeric  default 0,
  p_serie_max       integer  default 0,
  p_sans_faute_max  integer  default 0,
  p_plus_haute_table smallint default null,
  p_maitrise        jsonb    default '{}',
  p_defi_id         uuid     default null,
  p_score_premier_essai integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve      uuid := public.eleve_courant();
  v_session_id uuid;
  v_fait       text;
  v_niveau     smallint;
  v_nouveaux   text[] := '{}';
  v_badge      text;
  v_seuil      integer;
  v_points     integer;
  v_palier     text;
  v_plafond    smallint;
  v_montee     smallint;
  v_premier    integer := coalesce(p_score_premier_essai, p_score);
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu. Reconnecte-toi.' using errcode = '42501';
  end if;

  if p_score > greatest(p_nb_questions, 0) then
    raise exception 'Score incohérent';
  end if;

  -- Un rattrapage ne peut pas exister sans reussite : le nombre de
  -- reponses trouvees du premier coup est borne par le total.
  if v_premier > p_score or v_premier < 0 then
    raise exception 'Score du premier essai incohérent';
  end if;

  select plafond_tables into v_plafond from public.eleves where id = v_eleve;
  if p_tables is not null
     and (select max(x) from unnest(p_tables) x) > v_plafond then
    raise exception 'Tu n''as pas encore debloque la table %. Passe par la Montee des tables.',
      (select max(x) from unnest(p_tables) x)
      using errcode = 'P0001';
  end if;

  -- Seule la Montee des tables temoigne d'une table « atteinte ».
  v_montee := case when p_mode = 'climb' then p_plus_haute_table else null end;

  v_points := public.points_session(p_score, v_premier, p_tables);
  v_palier := public.palier_tables(p_tables);

  insert into public.sessions_jeu (
    eleve_id, defi_id, mode, tables, nb_questions, score, score_premier_essai,
    erreurs, duree_s, serie_max, sans_faute_max, plus_haute_table,
    points, palier)
  values (
    v_eleve, p_defi_id, p_mode, coalesce(p_tables, '{}'), p_nb_questions, p_score, v_premier,
    coalesce(p_erreurs, '[]'), p_duree_s, p_serie_max, p_sans_faute_max,
    v_montee, v_points, v_palier)
  returning id into v_session_id;

  if coalesce(v_montee, 0) >= v_plafond then
    update public.eleves
       set plafond_tables = least(20, coalesce(v_montee, 0) + 1)
     where id = v_eleve
       and plafond_tables < least(20, coalesce(v_montee, 0) + 1);
  end if;

  -- ---- Maitrise ------------------------------------------------------
  -- Le front envoie desormais 3 = juste du premier coup, 2 = rattrape,
  -- 1 = jamais trouve. La grille distingue donc l'automatisme du
  -- tatonnement, ce qu'elle ne faisait pas avant.
  for v_fait, v_niveau in
    select key, value::text::smallint from jsonb_each(coalesce(p_maitrise, '{}'))
  loop
    insert into public.maitrise (eleve_id, fait, niveau, nb_vues, nb_reussites, derniere_vue)
    values (v_eleve, v_fait, v_niveau, 1, case when v_niveau >= 2 then 1 else 0 end, now())
    on conflict (eleve_id, fait) do update
      set niveau       = excluded.niveau,
          nb_vues      = public.maitrise.nb_vues + 1,
          nb_reussites = public.maitrise.nb_reussites
                         + case when excluded.niveau >= 2 then 1 else 0 end,
          derniere_vue = now();
  end loop;

  -- ---- Badges --------------------------------------------------------
  foreach v_seuil in array array[10, 20, 30, 50, 100] loop
    if p_sans_faute_max >= v_seuil then
      v_badge := 'streak_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  foreach v_seuil in array array[10, 12, 15, 20] loop
    if coalesce(v_montee, 0) >= v_seuil then
      v_badge := 'climb_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  if p_nb_questions >= 10 and p_duree_s > 0 then
    if p_duree_s / p_nb_questions < 2 then
      insert into public.badges (eleve_id, badge_id) values (v_eleve, 'speed_2s')
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || 'speed_2s'::text; end if;
    elsif p_duree_s / p_nb_questions < 3 then
      insert into public.badges (eleve_id, badge_id) values (v_eleve, 'speed_3s')
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || 'speed_3s'::text; end if;
    end if;
  end if;

  declare v_jours integer;
  begin
    select count(distinct date_trunc('day', cree_le)) into v_jours
      from public.sessions_jeu
     where eleve_id = v_eleve and cree_le > now() - interval '7 days';
    foreach v_seuil in array array[3, 7] loop
      if v_jours >= v_seuil then
        v_badge := 'days_' || v_seuil;
        insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
        on conflict do nothing;
        if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
      end if;
    end loop;
  end;

  return jsonb_build_object(
    'session_id',      v_session_id,
    'points',          v_points,
    'palier',          v_palier,
    'score',           p_score,
    'premier_essai',   v_premier,
    'rattrapees',      p_score - v_premier,
    'plafond_tables',  (select plafond_tables from public.eleves where id = v_eleve),
    'nouveaux_badges', to_jsonb(v_nouveaux)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Meme regle pour les enseignants.
-- ---------------------------------------------------------------------
drop function if exists public.enregistrer_session_prof(
  text, smallint[], integer, integer, numeric, integer, integer, smallint);

create or replace function public.enregistrer_session_prof(
  p_mode            text,
  p_tables          smallint[],
  p_nb_questions    integer,
  p_score           integer,
  p_duree_s         numeric  default 0,
  p_serie_max       integer  default 0,
  p_sans_faute_max  integer  default 0,
  p_plus_haute_table smallint default null,
  p_score_premier_essai integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof    uuid := public.prof_courant();
  v_id      uuid;
  v_points  integer;
  v_premier integer := coalesce(p_score_premier_essai, p_score);
begin
  if v_prof is null then
    raise exception 'Reserve aux enseignants' using errcode = '42501';
  end if;
  if p_score > greatest(p_nb_questions, 0) then
    raise exception 'Score incoherent';
  end if;
  if v_premier > p_score or v_premier < 0 then
    raise exception 'Score du premier essai incoherent';
  end if;

  v_points := public.points_session(p_score, v_premier, p_tables);

  insert into public.sessions_profs (
    prof_id, mode, tables, nb_questions, score, score_premier_essai, duree_s,
    serie_max, sans_faute_max, plus_haute_table, points)
  values (
    v_prof, p_mode, coalesce(p_tables, '{}'), p_nb_questions, p_score, v_premier, p_duree_s,
    p_serie_max, p_sans_faute_max, p_plus_haute_table, v_points)
  returning id into v_id;

  return jsonb_build_object('session_id', v_id, 'points', v_points,
    'score', p_score, 'premier_essai', v_premier, 'rattrapees', p_score - v_premier);
end;
$$;

grant execute on function
  public.points_session(integer, integer, smallint[]),
  public.enregistrer_session(text, smallint[], integer, integer, jsonb, numeric,
                             integer, integer, smallint, jsonb, uuid, integer),
  public.enregistrer_session_prof(text, smallint[], integer, integer, numeric,
                                  integer, integer, smallint, integer)
to authenticated;

```


## 20260828100000_score_progression.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 13 : un seul score de progression, nomme et explicable
-- =====================================================================
--
-- CONSTAT (premiers tests reels, 28 aout 2026)
--
-- Lou voit « 193 Points total » sur son profil et « 1243 pts » au
-- classement. Les deux nombres sont justes, mais ils ne mesurent pas la
-- meme chose — et rien ne le dit. Un eleve conclut a un bug.
--
--   profil      = somme des points de jeu
--   classement  = points de jeu + 100 par jour actif + 50 par case verte
--
-- Cette formule composee est volontaire : elle recompense la regularite
-- et la maitrise, pas seulement le volume joue. Mais elle n'avait ni nom
-- ni definition partagee — elle vivait recopiee dans une seule requete.
--
-- CE QUE FAIT CETTE MIGRATION
--
--   1. `score_progression()` : UNE definition, lisible, avec ses trois
--      composantes exposees separement pour que l'ecran puisse les
--      afficher au lieu de sortir un nombre magique.
--   2. `classement_progression()` s'en sert.
--   3. `mon_profil()` renvoie le meme score, avec son detail.
--
-- Les coefficients restent modifiables ici, en un seul endroit.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Les trois composantes, et leur poids.
--
-- ⚠️ Rapport d'echelle a garder en tete : une partie de 20 bonnes
-- reponses sur des tables difficiles vaut environ 200 points de jeu.
-- Une case verte en vaut 50. Vingt cases vertes pesent donc autant que
-- cinq parties. C'est un choix pedagogique — la maitrise compte plus que
-- le volume — mais il se regle ici et nulle part ailleurs.
-- ---------------------------------------------------------------------
create or replace function public.progression_detail(
  p_eleve  uuid,
  p_depuis timestamptz
)
returns table (
  points_jeu    integer,
  jours_actifs  integer,
  cases_vertes  integer,
  bonus_jours   integer,
  bonus_vertes  integer,
  total         integer
)
language sql stable security definer set search_path = public
as $$
  with j as (
    select coalesce(sum(points), 0)::integer                    as pts,
           count(distinct date_trunc('day', cree_le))::integer  as jours
      from public.sessions_jeu
     where eleve_id = p_eleve and cree_le >= p_depuis
  ),
  v as (
    select count(*)::integer as nb
      from public.maitrise
     where eleve_id = p_eleve and niveau = 3 and derniere_vue >= p_depuis
  )
  select j.pts, j.jours, v.nb,
         100 * j.jours,
         50  * v.nb,
         j.pts + 100 * j.jours + 50 * v.nb
    from j, v;
$$;

comment on function public.progression_detail(uuid, timestamptz) is
  'Score de progression et ses trois composantes. Definition unique, partagee par le classement et le profil : les deux ecrans ne peuvent plus diverger.';

-- ---------------------------------------------------------------------
-- Le classement s'aligne sur la definition partagee.
-- ---------------------------------------------------------------------
create or replace function public.classement_progression(
  p_periode text default 'semaine',
  p_portee  text default 'classe',
  p_palier  text default null,
  p_limite  integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,
  classe      text,
  avatar      text,
  points      integer,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe, plafond_tables from public.eleves where id = public.eleve_courant()
  ),
  cible as (
    select coalesce(p_palier, public.palier_de_plafond(
             (select plafond_tables from moi))) as palier,
           public.debut_periode(p_periode)      as depuis
  ),
  concernes as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
      from public.eleves e
     where e.actif
       and (p_portee = 'college'
            or (p_portee = 'niveau'
                and public.niveau_scolaire(e.classe)
                  = public.niveau_scolaire((select classe from moi)))
            or (p_portee = 'classe' and e.classe = (select classe from moi)))
  ),
  -- Le filtre par palier porte sur les PARTIES jouees a ce palier :
  -- un eleve n'apparait au palier Confirme que s'il y a joue.
  joue as (
    select c.id,
           coalesce((select sum(s.points) from public.sessions_jeu s
                      where s.eleve_id = c.id
                        and s.cree_le >= (select depuis from cible)
                        and ((select palier from cible) = 'tous'
                             or s.palier = (select palier from cible))), 0) as pts_palier
      from concernes c
  ),
  score as (
    select c.id, c.prenom, c.nom, c.classe, c.avatar_emoji,
           j.pts_palier,
           (select total from public.progression_detail(
              c.id, (select depuis from cible))) as total
      from concernes c join joue j on j.id = c.id
  )
  select row_number() over (order by total desc) as rang,
         public.nom_public(prenom, nom),
         classe, avatar_emoji, total,
         id = public.eleve_courant()
    from score
   where pts_palier > 0          -- a joue au palier demande
     and total > 0
   order by rang
   limit p_limite;
$$;

-- ---------------------------------------------------------------------
-- Le profil affiche le MEME nombre que le classement, avec son detail.
-- ---------------------------------------------------------------------
create or replace function public.mon_profil()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profil', (select to_jsonb(x) from (
        select id, prenom, nom, classe, avatar_emoji, email,
               plafond_tables,
               public.palier_de_plafond(plafond_tables) as palier,
               tables_autorisees   -- OBSOLETE, ne rien afficher avec
          from public.eleves where id = public.eleve_courant()) x),
    'records', (select jsonb_build_object(
        'meilleure_serie',   coalesce(max(sans_faute_max), 0),
        'meilleur_chrono',   coalesce(max(score) filter (where mode = 'countdown'), 0),
        'plus_haute_table',  coalesce(max(plus_haute_table), 0),
        'nb_sessions',       count(*),
        'points_total',      coalesce(sum(points), 0),
        'points_semaine',    coalesce(sum(points)
                               filter (where cree_le >= public.debut_periode('semaine')), 0),
        'jours_actifs_7j',   (select count(distinct date_trunc('day', cree_le))
                                from public.sessions_jeu
                               where eleve_id = public.eleve_courant()
                                 and cree_le > now() - interval '7 days'))
        from public.sessions_jeu where eleve_id = public.eleve_courant()),
    -- Le score qui fait foi au classement, avec ses trois composantes.
    -- Meme periode que le classement par defaut : la semaine.
    'progression', (select to_jsonb(p) from public.progression_detail(
        public.eleve_courant(), public.debut_periode('semaine')) p),
    'maitrise', (select coalesce(jsonb_object_agg(fait, niveau), '{}')
        from public.maitrise where eleve_id = public.eleve_courant()),
    'badges', (select coalesce(jsonb_agg(badge_id), '[]')
        from public.badges where eleve_id = public.eleve_courant())
  );
$$;

grant execute on function
  public.progression_detail(uuid, timestamptz),
  public.classement_progression(text, text, text, integer),
  public.mon_profil()
to authenticated;

```


## 20260828120000_defi_premier_essai.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 14 : les defis comptent le premier essai, comme le reste
-- =====================================================================
--
-- CONSTAT (avant d'ecrire le lot des defis)
--
-- `terminer_defi()` appelle `enregistrer_session()` sans lui passer
-- `p_score_premier_essai`. La base le traite alors comme « tout trouve
-- du premier coup » — c'est la compatibilite prevue pour les parties
-- remontees hors ligne par l'ancien client.
--
-- Consequence : en defi, un eleve qui rattrape dix reponses touche
-- autant de points qu'un eleve qui les a toutes trouvees du premier
-- coup. C'est exactement le trou qu'on a ferme pour l'entrainement
-- libre, rouvert par une autre porte.
--
-- Le classement DU DEFI n'est pas concerne : il trie au score puis au
-- temps, et un rattrapage coute deja des secondes. Ce sont les points
-- qui alimentent le classement Progression qui etaient gonfles.
--
-- On ajoute le parametre et on le fait suivre. Il vaut null par defaut :
-- un client qui ne l'envoie pas se comporte comme avant.
-- =====================================================================

drop function if exists public.terminer_defi(uuid, integer, numeric, integer, jsonb, jsonb);

create or replace function public.terminer_defi(
  p_defi_id  uuid,
  p_score    integer,
  p_temps_s  numeric,
  p_erreurs  integer default 0,
  p_detail   jsonb   default '{}',
  p_maitrise jsonb   default '{}',
  p_score_premier_essai integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve uuid := public.eleve_courant();
  v_defi  public.defis%rowtype;
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu.' using errcode = '42501';
  end if;

  select * into v_defi from public.defis where id = p_defi_id;
  if not found then
    raise exception 'Défi introuvable.';
  end if;

  if v_defi.statut = 'ferme' or v_defi.expire_le < now() then
    raise exception 'Ce défi est déjà terminé.';
  end if;

  begin
    insert into public.defis_participants (
      defi_id, eleve_id, score, temps_s, erreurs, detail)
    values (p_defi_id, v_eleve, p_score, p_temps_s, p_erreurs, p_detail);
  exception when unique_violation then
    raise exception 'Tu as déjà participé à ce défi.';
  end;

  perform public.enregistrer_session(
    p_mode           => v_defi.type,
    p_tables         => v_defi.tables,
    p_nb_questions   => p_score + p_erreurs,
    p_score          => p_score,
    p_duree_s        => p_temps_s,
    p_sans_faute_max => 0,
    p_maitrise       => p_maitrise,
    p_defi_id        => p_defi_id,
    p_score_premier_essai => p_score_premier_essai
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function
  public.terminer_defi(uuid, integer, numeric, integer, jsonb, jsonb, integer)
to authenticated;

```


## 20260828140000_liste_eleves.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 15 : lister les eleves d'une classe
-- =====================================================================
--
-- CONSTAT (premiers tests de l'ecran Administration)
--
-- L'ecran affiche « Classe 31 — 1 eleve actif » puis, juste en dessous,
-- « Aucun eleve actif dans cette classe ». Les deux viennent de sources
-- differentes :
--
--   le compteur  ->  liste_classes()        : compte TOUS les actifs
--   la liste     ->  eleves_sans_connexion(): ne renvoie que ceux qui
--                                             ne se sont JAMAIS connectes
--
-- Un eleve qui se connecte disparait donc de la liste de son propre
-- professeur. C'est le seul cas ou l'ecran se contredit lui-meme.
--
-- La cause est un manque : aucune fonction ne listait simplement les
-- eleves d'une classe. `eleves_sans_connexion()` etait la plus proche,
-- elle a ete prise par defaut.
--
-- Cette migration comble le trou. `eleves_sans_connexion()` reste : elle
-- repond a une autre question — « qui n'a pas encore mis le pied dans
-- l'application ? » — utile a la rentree, mais ce n'est pas une liste
-- de classe.
-- =====================================================================

create or replace function public.liste_eleves(p_classe text default null)
returns table (
  eleve_id          uuid,
  email             text,
  prenom            text,
  nom               text,
  classe            text,
  avatar_emoji      text,
  plafond_tables    smallint,
  palier            text,
  actif             boolean,
  deja_connecte     boolean,
  derniere_connexion timestamptz,
  nb_sessions       integer,
  points_semaine    integer
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.email, e.prenom, e.nom, e.classe, e.avatar_emoji,
         e.plafond_tables,
         public.palier_de_plafond(e.plafond_tables),
         e.actif,
         e.user_id is not null,
         e.derniere_connexion,
         coalesce(s.n, 0)::integer,
         coalesce(s.pts_semaine, 0)::integer
    from public.eleves e
    left join lateral (
      select count(*) as n,
             sum(points) filter (
               where cree_le >= public.debut_periode('semaine')) as pts_semaine
        from public.sessions_jeu where eleve_id = e.id
    ) s on true
   where public.est_prof()                 -- verrou : rien pour un eleve
     and (p_classe is null or e.classe = p_classe)
   -- Les eleves desactives passent en dernier, mais restent visibles :
   -- c'est ce qui permet de les reactiver.
   order by e.actif desc, e.nom, e.prenom;
$$;

comment on function public.liste_eleves(text) is
  'Les eleves d''une classe (ou tous si p_classe est null), actifs ET desactives. C''est CETTE fonction que l''ecran Administration doit utiliser — pas eleves_sans_connexion(), qui repond a la question « qui n''a jamais ouvert l''application ? ».';

grant execute on function public.liste_eleves(text) to authenticated;

```


## 20260828160000_profil_prof.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 16 : un profil pour les enseignants, et un refus honnete
-- =====================================================================
--
-- CONSTAT (verifie en executant la fonction, pas en la lisant)
--
-- `mon_profil()` appelee par un ENSEIGNANT ne leve aucune erreur. Elle
-- renvoie un succes :
--
--   { "profil": null, "records": { tout a 0 }, "progression": { 0 } }
--
-- Le front croit donc avoir un profil valide. Il affiche zero partout,
-- « Decouverte » et « Tables debloquees : 1 a 10 » — des informations
-- FAUSSES au sujet de la personne connectee. Le garde-fou d'erreur du
-- front ne se declenche jamais, puisqu'il n'y a pas d'erreur.
--
-- C'est la regle qu'on s'est fixee des le premier jour : une donnee
-- inventee qui se fait passer pour vraie.
--
-- DEUX CORRECTIFS
--
--   1. `mon_profil()` REFUSE explicitement un non-eleve. Une fonction
--      qui s'appelle « mon profil » ne doit pas renvoyer un profil vide
--      a quelqu'un qui a un profil ailleurs.
--
--   2. `mon_profil_prof()` est creee, symetrique, alimentee par
--      `sessions_profs`. Les enseignants peuvent jouer depuis la
--      migration 9 ; il leur manquait l'ecran qui montre leurs propres
--      resultats.
-- =====================================================================

create or replace function public.mon_profil()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case when public.eleve_courant() is null then
    jsonb_build_object('ok', false, 'raison', 'pas_un_eleve',
      'message', 'Ce profil est reserve aux eleves.')
  else
  jsonb_build_object(
    'profil', (select to_jsonb(x) from (
        select id, prenom, nom, classe, avatar_emoji, email,
               plafond_tables,
               public.palier_de_plafond(plafond_tables) as palier,
               tables_autorisees   -- OBSOLETE, ne rien afficher avec
          from public.eleves where id = public.eleve_courant()) x),
    'records', (select jsonb_build_object(
        'meilleure_serie',   coalesce(max(sans_faute_max), 0),
        'meilleur_chrono',   coalesce(max(score) filter (where mode = 'countdown'), 0),
        'plus_haute_table',  coalesce(max(plus_haute_table), 0),
        'nb_sessions',       count(*),
        'points_total',      coalesce(sum(points), 0),
        'points_semaine',    coalesce(sum(points)
                               filter (where cree_le >= public.debut_periode('semaine')), 0),
        'jours_actifs_7j',   (select count(distinct date_trunc('day', cree_le))
                                from public.sessions_jeu
                               where eleve_id = public.eleve_courant()
                                 and cree_le > now() - interval '7 days'))
        from public.sessions_jeu where eleve_id = public.eleve_courant()),
    'progression', (select to_jsonb(p) from public.progression_detail(
        public.eleve_courant(), public.debut_periode('semaine')) p),
    'maitrise', (select coalesce(jsonb_object_agg(fait, niveau), '{}')
        from public.maitrise where eleve_id = public.eleve_courant()),
    'badges', (select coalesce(jsonb_agg(badge_id), '[]')
        from public.badges where eleve_id = public.eleve_courant()))
  end;
$$;

-- ---------------------------------------------------------------------
-- Le profil d'un enseignant.
--
-- Volontairement plus sobre que celui d'un eleve : ni palier, ni grille
-- de maitrise, ni badges. Un adulte qui joue le fait pour comprendre
-- l'outil et se mesurer a ses collegues, pas pour etre remedie.
-- ---------------------------------------------------------------------
create or replace function public.mon_profil_prof()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case when public.prof_courant() is null then
    jsonb_build_object('ok', false, 'raison', 'pas_un_prof',
      'message', 'Ce profil est reserve aux enseignants.')
  else
  jsonb_build_object(
    'profil', (select to_jsonb(x) from (
        select id, nom, email, role, classes,
               role = 'admin' as est_admin
          from public.profs where id = public.prof_courant()) x),
    'records', (select jsonb_build_object(
        'nb_sessions',      count(*),
        'points_total',     coalesce(sum(points), 0),
        'points_semaine',   coalesce(sum(points)
                              filter (where cree_le >= public.debut_periode('semaine')), 0),
        'meilleure_serie',  coalesce(max(sans_faute_max), 0),
        'meilleur_chrono',  coalesce(max(score) filter (where mode = 'countdown'), 0),
        'meilleur_sprint',  coalesce(min(duree_s) filter (where mode = 'sprint'), 0),
        'plus_haute_table', coalesce(max(plus_haute_table), 0))
        from public.sessions_profs where prof_id = public.prof_courant()),
    -- Sa place dans la salle des profs, s'il a joue.
    'rang_salle_des_profs', (
        select rang from public.classement_profs('points', 'tout', 100)
         where est_moi limit 1))
  end;
$$;

grant execute on function public.mon_profil(), public.mon_profil_prof()
to authenticated;

```


## 20260831090000_mes_defis.sql

```sql
-- =====================================================================
-- MIGRATION 17 — « MES DÉFIS » + un nom dans la salle des profs
--
-- Deux trous decouverts en utilisant l'application, pas en la lisant.
--
-- 1. UN DEFI DE PROF EST UN OBJET SANS RETOUR.
--    Le professeur cree un defi, note le code, quitte l'ecran... et il
--    n'a plus AUCUN moyen d'y revenir. Le seul point d'entree vers le
--    classement d'un defi est le champ « Rejoindre un defi », et
--    `rejoindre_defi()` leve une exception si l'appelant n'est pas un
--    eleve (c'est voulu : un prof ne joue pas le defi de sa classe).
--    Resultat : le prof lance le defi le lundi et ne verra jamais le
--    resultat. C'est precisement le moment ou l'outil devait servir.
--
--    `mes_defis()` rend la liste des defis que j'ai crees, avec le
--    nombre de participants et l'effectif attendu. C'est la porte de
--    retour manquante — pour les profs comme pour les eleves.
--
-- 2. « — (toi) 51 pts » DANS LA SALLE DES PROFS.
--    `classement_profs()` renvoyait une colonne `nom`, alors que les
--    trois autres classements renvoient `nom_affiche`. Le composant
--    d'affichage lit `nom_affiche` et retombe sur son tiret par defaut.
--    On aligne le contrat plutot que d'ajouter une exception de plus
--    cote React : quatre classements, quatre fois les memes colonnes.
--    (Le nom reste le nom COMPLET — entre adultes qui se connaissent,
--    « M. D. » n'aurait aucun sens. Seul le nom de la colonne change.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SALLE DES PROFS — meme contrat que les autres classements
-- ---------------------------------------------------------------------
-- Le type de retour change : `create or replace` ne suffit pas.
drop function if exists public.classement_profs(text, text, integer);

create function public.classement_profs(
  p_categorie text default 'points',   -- points | serie | chrono | sprint | montee
  p_periode   text default 'tout',
  p_limite    integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,     -- nom COMPLET : ce sont des collegues
  classe      text,     -- toujours null, present pour l'uniformite
  avatar      text,     -- toujours null, present pour l'uniformite
  valeur      numeric,
  parties     integer,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  select row_number() over (
           order by case when p_categorie = 'sprint' then v end asc nulls last,
                    case when p_categorie <> 'sprint' then v end desc nulls last) as rang,
         nom, null::text, null::text, round(v, 1), parties, moi
    from (
      select p.nom,
             case p_categorie
               when 'points' then sum(s.points)::numeric
               when 'serie'  then max(s.sans_faute_max)::numeric
               when 'chrono' then max(s.points) filter (where s.mode = 'countdown')::numeric
               when 'montee' then max(s.plus_haute_table)::numeric
               when 'sprint' then min(s.duree_s) filter (where s.mode = 'sprint')
             end                                  as v,
             count(*)::integer                    as parties,
             p.id = public.prof_courant()         as moi
        from public.profs p
        join public.sessions_profs s on s.prof_id = p.id
       where p.actif
         and public.est_prof()          -- verrou : rien pour un eleve
         and s.cree_le >= public.debut_periode(p_periode)
       group by p.id, p.nom
    ) x
   where v is not null
   order by rang
   limit p_limite;
$$;

-- ---------------------------------------------------------------------
-- 2. MES DEFIS — la porte de retour
--
-- Un prof voit les defis qu'il a crees ; un eleve, les siens.
-- On renvoie les defis EXPIRES aussi : le resultat d'un defi de lundi
-- se regarde le mardi, quand il est ferme. C'est meme le cas normal.
-- ---------------------------------------------------------------------
create index if not exists defis_createur_prof_idx
  on public.defis (cree_par_prof, cree_le desc)
  where cree_par_prof is not null;

create index if not exists defis_createur_eleve_idx
  on public.defis (cree_par_eleve, cree_le desc)
  where cree_par_eleve is not null;

create or replace function public.mes_defis(p_limite integer default 20)
returns table (
  defi_id         uuid,
  code            text,
  type            text,
  classe          text,
  tables          smallint[],
  cree_le         timestamptz,
  expire_le       timestamptz,
  encore_ouvert   boolean,
  participants    integer,
  attendus        integer
)
language sql
security definer
set search_path = public
as $$
  select d.id,
         d.code,
         d.type,
         d.classe,
         d.tables,
         d.cree_le,
         d.expire_le,
         (d.statut = 'ouvert' and d.expire_le > now())      as encore_ouvert,
         (select count(*)::integer from public.defis_participants p
           where p.defi_id = d.id)                          as participants,
         -- Un denominateur n'a de sens que pour un defi DE PROF adresse
         -- a une classe : « 18 / 27 ont termine ». Pour un defi entre
         -- copains, l'effectif de la classe n'est pas la cible — trois
         -- amis sur 27 ne sont pas « 3 / 27 ». Dans ce cas, null, et
         -- l'interface affiche « 3 ont joue » sans denominateur.
         (select case when d.cree_par_prof is null or d.classe is null
                      then null else
            (select count(*)::integer from public.eleves e
              where e.actif and e.classe = d.classe) end)    as attendus
    from public.defis d
   where (public.prof_courant()  is not null and d.cree_par_prof  = public.prof_courant())
      or (public.eleve_courant() is not null and d.cree_par_eleve = public.eleve_courant())
   order by d.cree_le desc
   limit p_limite;
$$;

grant execute on function
  public.classement_profs(text, text, integer),
  public.mes_defis(integer)
to authenticated;

comment on function public.mes_defis(integer) is
  'Les defis crees par l''utilisateur courant (prof ou eleve), du plus recent au plus ancien, expires compris. Seule porte de retour vers le classement d''un defi passe.';

-- ---------------------------------------------------------------------
-- 3. MEME REGLE POUR `avancement_defi()`
--
-- L'ecran de classement d'un defi affichait « 1 / 27 ont termine » a un
-- eleve qui avait defie deux copains. Le denominateur ne vaut que pour
-- un defi de prof adresse a une classe entiere.
-- ---------------------------------------------------------------------
create or replace function public.avancement_defi(p_defi_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'termines', (select count(*) from public.defis_participants
                  where defi_id = p_defi_id),
    'attendus', (select case
                   when d.cree_par_prof is null or d.classe is null then null
                   else (select count(*) from public.eleves e
                          where e.actif and e.classe = d.classe)
                 end
                   from public.defis d where d.id = p_defi_id)
  );
$$;

```


## 20260831210000_origine_defi.sql

```sql
-- =====================================================================
-- MIGRATION 18 — L'ORIGINE DU DEFI, ET UN DENOMINATEUR QUI COMPTE JUSTE
--
-- 1. « 2 / 1 ONT TERMINE ».
--    C'est ce qu'affiche l'ecran « Mes defis » sur la base reelle, et
--    c'est un defaut de la migration 17 : `participants` comptait TOUS
--    les joueurs, `attendus` comptait les eleves de la classe visee.
--    Deux populations differentes au numerateur et au denominateur.
--    Le defi 379S4 vise la 31 (un eleve actif) ; Lou (31) et Adeliya
--    (32) l'ont joue. D'ou 2 / 1.
--
--    On ne restreint PAS la participation a la classe visee : faire
--    jouer la 31 contre la 32 est une demande explicite, et c'est ce
--    qui rend les defis interessants. On compte donc les deux choses
--    separement : combien d'eleves DE LA CLASSE ont joue (sur son
--    effectif), et combien de joueurs au total.
--
-- 2. UN DEFI DE PROF ET UN DEFI D'ELEVE NE PESENT PAS PAREIL.
--    Memes points — un point mesure l'effort de celui qui repond, pas
--    le grade de celui qui a cree le defi. Mais pas le meme statut :
--    un defi de prof est du travail prescrit, le seul qu'on puisse
--    evoquer en classe ou cocher « fait / pas fait ». La base sait
--    deja les distinguer (`cree_par_prof` XOR `cree_par_eleve`) ;
--    il manquait l'etiquette a l'ecran.
--
--    `origine` ('prof' | 'eleve') et `auteur_nom`. Le nom d'un
--    professeur est complet — les eleves connaissent leur prof. Le nom
--    d'un eleve passe par `nom_public()`, comme partout ailleurs :
--    « Lou A. », jamais le nom de famille entier.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Qui a cree ce defi ? Une seule definition, utilisee par les trois
-- fonctions ci-dessous — pour qu'elles ne puissent jamais diverger.
-- ---------------------------------------------------------------------
create or replace function public.auteur_defi(p_defi_id uuid)
returns table (origine text, auteur_nom text)
language sql
stable
security definer
set search_path = public
as $$
  select case when d.cree_par_prof is not null then 'prof' else 'eleve' end,
         coalesce(
           (select p.nom from public.profs p where p.id = d.cree_par_prof),
           (select public.nom_public(e.prenom, e.nom)
              from public.eleves e where e.id = d.cree_par_eleve))
    from public.defis d
   where d.id = p_defi_id;
$$;

-- ---------------------------------------------------------------------
-- MES DEFIS — trois compteurs au lieu de deux, et l'origine
-- ---------------------------------------------------------------------
drop function if exists public.mes_defis(integer);

create function public.mes_defis(p_limite integer default 20)
returns table (
  defi_id             uuid,
  code                text,
  type                text,
  classe              text,
  tables              smallint[],
  cree_le             timestamptz,
  expire_le           timestamptz,
  encore_ouvert       boolean,
  origine             text,      -- 'prof' | 'eleve'
  auteur_nom          text,
  participants        integer,   -- tous les joueurs, toutes classes
  participants_classe integer,   -- ceux de la classe visee (null si aucune)
  attendus            integer    -- effectif de la classe visee (null sinon)
)
language sql
security definer
set search_path = public
as $$
  select d.id,
         d.code,
         d.type,
         d.classe,
         d.tables,
         d.cree_le,
         d.expire_le,
         (d.statut = 'ouvert' and d.expire_le > now()),
         a.origine,
         a.auteur_nom,
         (select count(*)::integer from public.defis_participants p
           where p.defi_id = d.id),
         -- Meme population que `attendus` : sans quoi on affiche « 2 / 1 ».
         case when d.cree_par_prof is null or d.classe is null then null else
           (select count(*)::integer
              from public.defis_participants p
              join public.eleves e on e.id = p.eleve_id
             where p.defi_id = d.id and e.classe = d.classe) end,
         -- Un denominateur n'a de sens que pour un defi DE PROF adresse a
         -- une classe. Trois amis sur 27 ne sont pas « 3 / 27 ».
         case when d.cree_par_prof is null or d.classe is null then null else
           (select count(*)::integer from public.eleves e
             where e.actif and e.classe = d.classe) end
    from public.defis d
    cross join lateral public.auteur_defi(d.id) a
   where (public.prof_courant()  is not null and d.cree_par_prof  = public.prof_courant())
      or (public.eleve_courant() is not null and d.cree_par_eleve = public.eleve_courant())
   order by d.cree_le desc
   limit p_limite;
$$;

-- ---------------------------------------------------------------------
-- AVANCEMENT — l'en-tete de l'ecran de classement d'un defi
-- Meme correction de population, plus l'origine et l'auteur.
-- ---------------------------------------------------------------------
create or replace function public.avancement_defi(p_defi_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'origine',         a.origine,
    'auteur_nom',      a.auteur_nom,
    'classe',          d.classe,
    'termines',        (select count(*) from public.defis_participants p
                         where p.defi_id = d.id),
    'termines_classe', case when d.cree_par_prof is null or d.classe is null
                            then null else
                         (select count(*) from public.defis_participants p
                            join public.eleves e on e.id = p.eleve_id
                           where p.defi_id = d.id and e.classe = d.classe) end,
    'attendus',        case when d.cree_par_prof is null or d.classe is null
                            then null else
                         (select count(*) from public.eleves e
                           where e.actif and e.classe = d.classe) end
  )
    from public.defis d
    cross join lateral public.auteur_defi(d.id) a
   where d.id = p_defi_id;
$$;

-- ---------------------------------------------------------------------
-- REJOINDRE — l'eleve doit savoir DE QUI est le defi avant de jouer.
-- « Defi de M. Desjardins » et « Defi de Lou A. » ne s'abordent pas de
-- la meme facon, et c'est le seul moment ou on peut le lui dire.
-- ---------------------------------------------------------------------
create or replace function public.rejoindre_defi(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve uuid := public.eleve_courant();
  v_defi  public.defis%rowtype;
  v_a     record;
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu.' using errcode = '42501';
  end if;

  select * into v_defi from public.defis
   where code = upper(trim(p_code));

  if not found then
    return jsonb_build_object('ok', false, 'raison', 'inconnu',
      'message', 'Ce code n''existe pas. Vérifie les lettres.');
  end if;

  if v_defi.statut = 'ferme' or v_defi.expire_le < now() then
    return jsonb_build_object('ok', false, 'raison', 'ferme',
      'message', 'Ce défi est terminé.');
  end if;

  if exists (select 1 from public.defis_participants
              where defi_id = v_defi.id and eleve_id = v_eleve) then
    return jsonb_build_object('ok', false, 'raison', 'deja_joue',
      'message', 'Tu as déjà participé à ce défi.',
      'defi_id', v_defi.id);
  end if;

  select * into v_a from public.auteur_defi(v_defi.id);

  return jsonb_build_object(
    'ok', true,
    'defi_id',    v_defi.id,
    'type',       v_defi.type,
    'tables',     to_jsonb(v_defi.tables),
    'duree_s',    v_defi.duree_s,
    'questions',  v_defi.questions,
    'origine',    v_a.origine,
    'auteur_nom', v_a.auteur_nom,
    'classe',     v_defi.classe
  );
end;
$$;

grant execute on function
  public.auteur_defi(uuid),
  public.mes_defis(integer)
to authenticated;

comment on function public.mes_defis(integer) is
  'Les defis crees par l''utilisateur courant, du plus recent au plus ancien, expires compris. `participants` compte tous les joueurs ; `participants_classe` et `attendus` comptent la meme population — les eleves de la classe visee — pour que le ratio affiche ait un sens.';

```


## 20260901080000_maitrise_classe_effectif.sql

```sql
-- =====================================================================
-- MIGRATION 19 — « 18 ELEVES SUR 27 », ET SUR 27 POUR DE VRAI
--
-- `maitrise_classe()` renvoyait `eleves_total` : le nombre d'eleves
-- ayant DEJA TRAVAILLE cette table. Pas l'effectif de la classe.
--
-- Affiche tel quel, cela donne « 18 sur 20 » dans une classe de 27 :
-- flatteur et faux. Les neuf eleves qui n'ont jamais ouvert la table de
-- 7 disparaissent du denominateur — or ce sont precisement ceux dont le
-- professeur doit s'occuper.
--
-- C'est la troisieme fois en deux jours qu'un ratio melange deux
-- populations (voir migrations 17 et 18). On ajoute donc la colonne
-- plutot que de laisser l'ecran la deviner : `eleves_classe`, l'effectif
-- actif de la classe, identique sur toutes les lignes.
--
-- On garde `eleves_total` : « 20 eleves ont travaille cette table, 18 la
-- maitrisent » reste une information utile. Ce sont deux phrases
-- differentes, et l'ecran doit pouvoir dire les deux.
--
-- `taux_maitrise` reste calcule sur ceux qui ont travaille la table :
-- c'est un taux de reussite, pas un taux de couverture. Un nouveau
-- `taux_couverture` dit combien de la classe s'y est mise.
-- =====================================================================

drop function if exists public.maitrise_classe(text);

create function public.maitrise_classe(p_classe text)
returns table (
  table_n        smallint,
  eleves_verts   integer,
  eleves_jaunes  integer,
  eleves_rouges  integer,
  eleves_total   integer,   -- ceux qui ont DEJA TRAVAILLE cette table
  eleves_classe  integer,   -- effectif actif de la classe (constante)
  taux_maitrise  numeric,   -- % de verts parmi ceux qui l'ont travaillee
  taux_couverture numeric   -- % de la classe qui l'a travaillee
)
language sql
security definer
set search_path = public
as $$
  with effectif as (
    select count(*)::integer as n
      from public.eleves e
     where e.classe = p_classe and e.actif
  )
  select t::smallint,
         count(*) filter (where niv = 3)::integer,
         count(*) filter (where niv = 2)::integer,
         count(*) filter (where niv = 1)::integer,
         count(*)::integer,
         (select n from effectif),
         round(100.0 * count(*) filter (where niv = 3) / nullif(count(*), 0), 0),
         round(100.0 * count(*) / nullif((select n from effectif), 0), 0)
    from (
      select split_part(m.fait, '_', 2)::smallint as t,
             m.eleve_id,
             max(m.niveau) as niv
        from public.maitrise m
        join public.eleves e on e.id = m.eleve_id
       where e.classe = p_classe and e.actif
         and public.prof_voit_classe(p_classe)
       group by 1, 2
    ) x
   group by t
   order by t;
$$;

grant execute on function public.maitrise_classe(text) to authenticated;

comment on function public.maitrise_classe(text) is
  'Maitrise agregee d''une classe, table par table. ATTENTION : `eleves_total` compte ceux qui ont deja travaille la table, `eleves_classe` est l''effectif. Ne jamais afficher un vert sur `eleves_total` en le presentant comme un ratio de classe.';

```


## 20260901090000_tables_de_la_classe.sql

```sql
-- =====================================================================
-- MIGRATION 20 — LES TABLES QUI EXISTENT POUR CETTE CLASSE
--
-- L'ecran « Ma classe » propose un bouton « Lancer un defi sur les
-- tables les plus faibles ». Voici ce qu'il fait aujourd'hui :
--
--   const candidates = [
--       ...tablesAbsentes.slice(0, 3),      // tables JAMAIS ouvertes
--       ...tablesSorted.map(d => d.table_n),
--   ];
--
-- Les tables jamais ouvertes passent EN PREMIER. Le professeur croit
-- lancer un rattrapage sur ce qui bloque ; il lance une decouverte sur
-- ce qui n'a pas encore ete aborde. Ce n'est pas la meme action
-- pedagogique, et ce n'est pas ce qu'annonce le bouton.
--
-- Pire : `tablesAbsentes` est calcule cote React comme « 2 a 20 moins
-- ce que la fonction renvoie ». Dans une 6e plafonnee a 10, les tables
-- 11 a 20 sont donc toutes « jamais ouvertes », et le bouton propose
-- 11, 12, 13. Un defi de prof n'a AUCUN plafond de tables (voir
-- `creer_defi`) : la classe recevrait donc un defi sur des tables
-- qu'aucun de ses eleves n'a le droit de travailler.
--
-- La cause est la meme que les trois bugs de ratio precedents : l'ecran
-- fabrique lui-meme une population que le serveur ne lui a pas donnee.
-- On arrete. `maitrise_classe()` renvoie desormais UNE LIGNE PAR TABLE
-- QUI EXISTE POUR CETTE CLASSE, travaillee ou non, avec de quoi
-- distinguer les trois cas sans aucun calcul cote React :
--
--   travaillee = false            → « jamais ouverte », gris plein
--   travaillee = true, verts bas  → « ca coince », cible du defi
--   dans_le_plafond_commun        → jouable par TOUS les eleves
-- =====================================================================

drop function if exists public.maitrise_classe(text);

create function public.maitrise_classe(p_classe text)
returns table (
  table_n                smallint,
  travaillee             boolean,  -- au moins un eleve l'a rencontree
  dans_le_plafond_commun boolean,  -- tous les eleves de la classe y ont droit
  eleves_verts           integer,
  eleves_jaunes          integer,
  eleves_rouges          integer,
  eleves_sans_trace      integer,  -- effectif - travailleurs, calcule ICI
  eleves_total           integer,  -- ceux qui ont DEJA travaille la table
  eleves_classe          integer,  -- effectif actif de la classe
  taux_maitrise          numeric,  -- % de verts parmi les travailleurs
  taux_couverture        numeric   -- % de la classe qui l'a travaillee
)
language sql
security definer
set search_path = public
as $$
  with classe as (
    select count(*)::integer            as effectif,
           -- Plafond COMMUN : la plus haute table que TOUT LE MONDE peut
           -- travailler. C'est la seule borne sure pour un defi adresse
           -- a la classe entiere.
           min(e.plafond_tables)        as plafond_commun,
           -- Plafond le plus haut atteint dans la classe : borne de
           -- l'affichage, pour ne pas masquer le travail des plus avances.
           max(e.plafond_tables)        as plafond_max
      from public.eleves e
     where e.classe = p_classe and e.actif
  ),
  -- Une ligne par table existante pour cette classe, meme vide.
  toutes as (
    select generate_series(2, greatest(coalesce((select plafond_max from classe), 10), 2))::smallint as t
     where public.prof_voit_classe(p_classe)
  ),
  travail as (
    select split_part(m.fait, '_', 2)::smallint as t,
           m.eleve_id,
           max(m.niveau) as niv
      from public.maitrise m
      join public.eleves e on e.id = m.eleve_id
     where e.classe = p_classe and e.actif
     group by 1, 2
  ),
  agrege as (
    select t,
           count(*) filter (where niv = 3)::integer as verts,
           count(*) filter (where niv = 2)::integer as jaunes,
           count(*) filter (where niv = 1)::integer as rouges,
           count(*)::integer                        as total
      from travail
     group by t
  )
  select tt.t,
         coalesce(a.total, 0) > 0,
         tt.t <= coalesce((select plafond_commun from classe), 0),
         coalesce(a.verts, 0),
         coalesce(a.jaunes, 0),
         coalesce(a.rouges, 0),
         (select effectif from classe) - coalesce(a.total, 0),
         coalesce(a.total, 0),
         (select effectif from classe),
         round(100.0 * coalesce(a.verts, 0) / nullif(a.total, 0), 0),
         round(100.0 * coalesce(a.total, 0)
               / nullif((select effectif from classe), 0), 0)
    from toutes tt
    left join agrege a on a.t = tt.t
   order by tt.t;
$$;

grant execute on function public.maitrise_classe(text) to authenticated;

comment on function public.maitrise_classe(text) is
  'Maitrise agregee d''une classe : UNE LIGNE PAR TABLE existant pour cette classe (jusqu''au plus haut plafond de ses eleves), travaillee ou non — l''ecran ne doit plus fabriquer la liste des tables ni soustraire quoi que ce soit. Populations : `eleves_verts/jaunes/rouges/total` comptent les eleves AYANT TRAVAILLE la table ; `eleves_sans_trace` et `eleves_classe` comptent la classe. `taux_maitrise` se rapporte a `eleves_total`, `taux_couverture` a `eleves_classe`. `dans_le_plafond_commun` = table jouable par TOUS les eleves actifs : c''est la seule borne sure pour un defi de classe.';

```


## 20260901100000_defi_fait_autorisation.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 21 : le defi fait autorisation
-- =====================================================================
--
-- CONSTAT (relecture du 1er septembre 2026, verifie en base)
--
--   prof -> creer_defi('sprint','{15}')   -> code W2NEZ
--   Alice (plafond 12) -> rejoindre_defi  -> ok: true, questions livrees
--   Alice enregistre  -> REFUS : « Tu n'as pas encore debloque la table 15. »
--
-- `creer_defi` n'impose aucun plafond de tables a un professeur ;
-- `enregistrer_session` en impose un a l'eleve. Entre les deux, l'eleve
-- joue les vingt questions puis voit son score refuse. Elle n'a rien
-- fait de mal : c'est le prof qui a choisi les tables.
--
-- DECISION (Aymeri, 1er septembre 2026)
--
-- Le plafond est un ANTI-TRICHE, pas une limite de programme. La
-- migration 10 le dit elle-meme : sans lui, cocher une table haute
-- serait « le moyen simple de gonfler ses points ». Il empeche un eleve
-- de CHOISIR des tables trop hautes en solo. Un defi de prof n'est pas
-- un choix d'eleve, c'est du travail prescrit — et un prof de 3e qui
-- veut faire travailler la table de 15 a sa classe a le droit d'avoir
-- raison. Ce n'est pas a un mecanisme de jeu de lui opposer un veto.
--
-- Donc : le defi fait autorisation. `enregistrer_session` accepte les
-- tables du defi auquel l'eleve a REELLEMENT participe, et strictement
-- rien d'autre. Son refus reste entier pour tout le reste — l'anti-
-- triche du jeu solo n'est pas touche.
--
-- CE QUI REND CE CHOIX SUR
--
-- 1. Les trois conditions de la levee sont relues EN BASE, jamais tirees
--    d'un parametre : le defi existe, l'eleve est deja dans
--    `defis_participants`, et les tables demandees sont exactement
--    celles de la ligne `defis`. Un p_defi_id invente ne donne rien.
-- 2. `terminer_defi` passe deja `p_tables => v_defi.tables` : le client
--    ne choisit pas les tables d'un defi, il les recoit.
-- 3. La migration 10 garantit qu'une table haute jouee hors mode Montee
--    ne debloque rien : `plus_haute_table` n'est retenue que si
--    `p_mode = 'climb'`, et un defi est 'sprint' ou 'countdown'. Un defi
--    sur la 15 ne fera donc monter le plafond de personne.
--
-- ET LE PROF N'APPREND RIEN APRES COUP
--
-- `creer_defi` renvoie desormais `eleves_hors_plafond` et
-- `eleves_classe` — les deux populations, jamais l'une sans l'autre —
-- et `apercu_defi_classe()` permet de poser la question AVANT de creer :
-- « 12 eleves sur 27 n'ont pas encore debloque la table 15, lancer
-- quand meme ? ». Le prof decide en connaissance de cause ; l'ecran ne
-- calcule rien, il affiche ce que le serveur lui donne.
--
-- NUMEROTATION : la 19 avait ete datee dans le futur (20260901080000
-- appliquee a 00:00) et la 20 a du la depasser. Cette migration porte
-- 20260901100000 pour la meme raison — pas l'heure reelle de son
-- ecriture, mais la premiere heure disponible au-dessus de la 20. La
-- dette se resorbe d'elle-meme des que l'horloge passe 10 h.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. enregistrer_session : le plafond cede devant un defi, et rien d'autre
-- ---------------------------------------------------------------------
drop function if exists public.enregistrer_session(
  text, smallint[], integer, integer, jsonb, numeric,
  integer, integer, smallint, jsonb, uuid, integer);

create or replace function public.enregistrer_session(
  p_mode            text,
  p_tables          smallint[],
  p_nb_questions    integer,
  p_score           integer,
  p_erreurs         jsonb    default '[]',
  p_duree_s         numeric  default 0,
  p_serie_max       integer  default 0,
  p_sans_faute_max  integer  default 0,
  p_plus_haute_table smallint default null,
  p_maitrise        jsonb    default '{}',
  p_defi_id         uuid     default null,
  p_score_premier_essai integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve      uuid := public.eleve_courant();
  v_session_id uuid;
  v_fait       text;
  v_niveau     smallint;
  v_nouveaux   text[] := '{}';
  v_badge      text;
  v_seuil      integer;
  v_points     integer;
  v_palier     text;
  v_plafond    smallint;
  v_montee     smallint;
  v_premier    integer := coalesce(p_score_premier_essai, p_score);
  v_defi_ok    boolean;
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu. Reconnecte-toi.' using errcode = '42501';
  end if;

  if p_score > greatest(p_nb_questions, 0) then
    raise exception 'Score incohérent';
  end if;

  -- Un rattrapage ne peut pas exister sans reussite : le nombre de
  -- reponses trouvees du premier coup est borne par le total.
  if v_premier > p_score or v_premier < 0 then
    raise exception 'Score du premier essai incohérent';
  end if;

  select plafond_tables into v_plafond from public.eleves where id = v_eleve;

  -- ---- LE DEFI FAIT AUTORISATION (migration 21) ----------------------
  -- Le plafond est un anti-triche, pas une limite de programme : il
  -- empeche un eleve de CHOISIR des tables trop hautes pour gonfler ses
  -- points (voir migration 10). Un defi de prof n'est pas un choix
  -- d'eleve, c'est du travail prescrit. On leve donc le plafond — mais
  -- seulement si les TROIS conditions tiennent, toutes relues en base,
  -- aucune tiree d'un parametre que le client controle seul :
  --   1. la session est rattachee a un defi qui existe,
  --   2. l'eleve figure DEJA parmi ses participants (il a joue : c'est
  --      `terminer_defi` qui insere la ligne, avant d'appeler ici),
  --   3. les tables demandees sont EXACTEMENT celles du defi, ni plus
  --      ni moins.
  -- Un client qui invente un p_defi_id, ou qui ajoute une table a celles
  -- du defi, ne gagne rien : il retombe sur le refus habituel.
  v_defi_ok := false;
  if p_defi_id is not null then
    -- Une partie de defi ne s'enregistre qu'UNE fois. `terminer_defi`
    -- est deja protege par la cle primaire de `defis_participants`,
    -- mais un appel direct a `enregistrer_session` avec le meme
    -- p_defi_id ne l'etait pas : verifie en base, la session comptait
    -- une seconde fois. Le trou existait avant cette migration ; elle
    -- en augmente la valeur (les tables d'un defi de prof peuvent
    -- desormais etre plus lourdes que le plafond), donc on le ferme ici.
    if exists (select 1 from public.sessions_jeu
                where eleve_id = v_eleve and defi_id = p_defi_id) then
      raise exception 'Tu as deja enregistre ce defi.' using errcode = 'P0001';
    end if;

    select true into v_defi_ok
      from public.defis d
      join public.defis_participants dp
        on dp.defi_id = d.id and dp.eleve_id = v_eleve
     where d.id = p_defi_id
       and coalesce(p_tables, '{}'::smallint[]) @> d.tables
       and coalesce(p_tables, '{}'::smallint[]) <@ d.tables;
    v_defi_ok := coalesce(v_defi_ok, false);
  end if;

  if not v_defi_ok
     and p_tables is not null
     and (select max(x) from unnest(p_tables) x) > v_plafond then
    raise exception 'Tu n''as pas encore debloque la table %. Passe par la Montee des tables.',
      (select max(x) from unnest(p_tables) x)
      using errcode = 'P0001';
  end if;

  -- Seule la Montee des tables temoigne d'une table « atteinte ».
  v_montee := case when p_mode = 'climb' then p_plus_haute_table else null end;

  v_points := public.points_session(p_score, v_premier, p_tables);
  v_palier := public.palier_tables(p_tables);

  insert into public.sessions_jeu (
    eleve_id, defi_id, mode, tables, nb_questions, score, score_premier_essai,
    erreurs, duree_s, serie_max, sans_faute_max, plus_haute_table,
    points, palier)
  values (
    v_eleve, p_defi_id, p_mode, coalesce(p_tables, '{}'), p_nb_questions, p_score, v_premier,
    coalesce(p_erreurs, '[]'), p_duree_s, p_serie_max, p_sans_faute_max,
    v_montee, v_points, v_palier)
  returning id into v_session_id;

  if coalesce(v_montee, 0) >= v_plafond then
    update public.eleves
       set plafond_tables = least(20, coalesce(v_montee, 0) + 1)
     where id = v_eleve
       and plafond_tables < least(20, coalesce(v_montee, 0) + 1);
  end if;

  -- ---- Maitrise ------------------------------------------------------
  -- Le front envoie desormais 3 = juste du premier coup, 2 = rattrape,
  -- 1 = jamais trouve. La grille distingue donc l'automatisme du
  -- tatonnement, ce qu'elle ne faisait pas avant.
  for v_fait, v_niveau in
    select key, value::text::smallint from jsonb_each(coalesce(p_maitrise, '{}'))
  loop
    insert into public.maitrise (eleve_id, fait, niveau, nb_vues, nb_reussites, derniere_vue)
    values (v_eleve, v_fait, v_niveau, 1, case when v_niveau >= 2 then 1 else 0 end, now())
    on conflict (eleve_id, fait) do update
      set niveau       = excluded.niveau,
          nb_vues      = public.maitrise.nb_vues + 1,
          nb_reussites = public.maitrise.nb_reussites
                         + case when excluded.niveau >= 2 then 1 else 0 end,
          derniere_vue = now();
  end loop;

  -- ---- Badges --------------------------------------------------------
  foreach v_seuil in array array[10, 20, 30, 50, 100] loop
    if p_sans_faute_max >= v_seuil then
      v_badge := 'streak_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  foreach v_seuil in array array[10, 12, 15, 20] loop
    if coalesce(v_montee, 0) >= v_seuil then
      v_badge := 'climb_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  if p_nb_questions >= 10 and p_duree_s > 0 then
    if p_duree_s / p_nb_questions < 2 then
      insert into public.badges (eleve_id, badge_id) values (v_eleve, 'speed_2s')
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || 'speed_2s'::text; end if;
    elsif p_duree_s / p_nb_questions < 3 then
      insert into public.badges (eleve_id, badge_id) values (v_eleve, 'speed_3s')
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || 'speed_3s'::text; end if;
    end if;
  end if;

  declare v_jours integer;
  begin
    select count(distinct date_trunc('day', cree_le)) into v_jours
      from public.sessions_jeu
     where eleve_id = v_eleve and cree_le > now() - interval '7 days';
    foreach v_seuil in array array[3, 7] loop
      if v_jours >= v_seuil then
        v_badge := 'days_' || v_seuil;
        insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
        on conflict do nothing;
        if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
      end if;
    end loop;
  end;

  return jsonb_build_object(
    'session_id',      v_session_id,
    'points',          v_points,
    'palier',          v_palier,
    'score',           p_score,
    'premier_essai',   v_premier,
    'rattrapees',      p_score - v_premier,
    'plafond_tables',  (select plafond_tables from public.eleves where id = v_eleve),
    'nouveaux_badges', to_jsonb(v_nouveaux)
  );
end;
$$;

comment on function public.enregistrer_session(
  text, smallint[], integer, integer, jsonb, numeric,
  integer, integer, smallint, jsonb, uuid, integer) is
  'Enregistre une partie et met a jour maitrise, badges et points. Le plafond de tables de l''eleve est verifie SAUF si la session est rattachee a un defi auquel il participe deja et dont les tables sont exactement p_tables : le defi fait autorisation (migration 21). Le plafond reste un anti-triche pour tout choix libre de tables.';


-- ---------------------------------------------------------------------
-- 2. creer_defi : ne refuse pas, mais dit combien d'eleves sont concernes
-- ---------------------------------------------------------------------

create or replace function public.creer_defi(
  p_type    text,
  p_tables  smallint[],
  p_nb_questions integer default 20,
  p_duree_s integer default null,
  p_classe  text    default null,
  p_expire_dans interval default '7 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve     uuid := public.eleve_courant();
  v_prof      uuid := public.prof_courant();
  v_questions jsonb := '[]';
  v_a smallint; v_b smallint;
  v_code text; v_id uuid; v_n integer;
  v_ouverts integer;
  v_classe  text;
  v_max     smallint;
  v_effectif integer;
  v_hors    integer;
begin
  if v_eleve is null and v_prof is null then
    raise exception 'Compte non reconnu.' using errcode = '42501';
  end if;

  if p_type not in ('sprint', 'countdown') then
    raise exception 'Seuls les modes Sprint et Contre-la-montre peuvent être joués en défi.';
  end if;

  if array_length(p_tables, 1) is null then
    raise exception 'Choisis au moins une table.';
  end if;

  -- Un élève ne crée pas de défi au-dessus de son propre plafond,
  -- et pas plus de 5 défis ouverts à la fois (anti-spam).
  if v_prof is null then
    if (select max(x) from unnest(p_tables) x)
       > (select plafond_tables from public.eleves where id = v_eleve) then
      raise exception 'Tables au-delà de ton niveau débloqué';
    end if;

    select count(*) into v_ouverts from public.defis
     where cree_par_eleve = v_eleve and statut = 'ouvert' and expire_le > now();
    if v_ouverts >= 5 then
      raise exception 'Tu as déjà 5 défis en cours. Attends qu''ils se terminent.';
    end if;
  end if;

  v_n := case when p_type = 'countdown' then 120 else p_nb_questions end;

  for i in 1..v_n loop
    v_a := p_tables[1 + floor(random() * array_length(p_tables, 1))::int];
    v_b := 1 + floor(random() * 10)::int;
    v_questions := v_questions || jsonb_build_object('a', v_a, 'b', v_b);
  end loop;

  -- La classe visee, resolue UNE fois : c'est elle qui sert a la fois de
  -- denominateur au compteur « 18 / 27 ont termine » et de population au
  -- compteur d'eleves hors plafond ci-dessous. Deux compteurs, une seule
  -- population, nommee ici.
  v_classe := coalesce(p_classe,
                       (select classe from public.eleves where id = v_eleve));

  v_code := public.generer_code_defi();

  insert into public.defis (
    code, type, cree_par_prof, cree_par_eleve, classe,
    tables, questions, duree_s, expire_le)
  values (
    v_code, p_type, v_prof,
    case when v_prof is null then v_eleve end,
    v_classe,
    p_tables, v_questions,
    case when p_type = 'countdown' then coalesce(p_duree_s, 120) end,
    -- Un défi créé par un élève vit 24 h ; un défi de prof, une semaine.
    now() + case when v_prof is null then interval '24 hours' else p_expire_dans end)
  returning id into v_id;

  -- Combien d'eleves de la classe visee n'ont pas ces tables debloquees.
  -- Le defi PART quand meme (migration 21 : le defi fait autorisation) ;
  -- ce chiffre sert a le dire au professeur, pas a lui opposer un veto.
  -- On renvoie les DEUX populations : « 12 » seul ne veut rien dire.
  v_max := (select max(x) from unnest(p_tables) x);
  select count(*), count(*) filter (where e.plafond_tables < v_max)
    into v_effectif, v_hors
    from public.eleves e
   where e.classe = v_classe and e.actif;

  return jsonb_build_object(
    'defi_id', v_id, 'code', v_code, 'type', p_type,
    'palier', public.palier_tables(p_tables),
    'classe', v_classe,
    'table_max', v_max,
    'eleves_classe', coalesce(v_effectif, 0),
    'eleves_hors_plafond', coalesce(v_hors, 0));
end;
$$;

comment on function public.creer_defi(text, smallint[], integer, integer, text, interval) is
  'Cree un defi. Un eleve reste plafonne a son propre niveau debloque ; un professeur ne l''est pas. Renvoie `eleves_hors_plafond` ET `eleves_classe` — populations : les deux comptent les eleves ACTIFS de `classe`, le premier ceux dont plafond_tables < table_max. Le defi part quand meme : ce chiffre sert a informer le professeur, pas a lui opposer un veto.';


-- ---------------------------------------------------------------------
-- 3. apercu_defi_classe : poser la question AVANT de creer
-- ---------------------------------------------------------------------
create or replace function public.apercu_defi_classe(
  p_classe text,
  p_tables smallint[]
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'classe',              p_classe,
    'table_max',           (select max(x) from unnest(p_tables) x),
    'eleves_classe',       count(*),
    'eleves_hors_plafond', count(*) filter (
                             where e.plafond_tables
                                 < (select max(x) from unnest(p_tables) x)))
    from public.eleves e
   where e.classe = p_classe
     and e.actif
     and public.prof_voit_classe(p_classe);
$$;

grant execute on function public.apercu_defi_classe(text, smallint[]) to authenticated;

comment on function public.apercu_defi_classe(text, smallint[]) is
  'Avant de creer un defi de classe : combien d''eleves n''ont pas encore debloque la plus haute table choisie. Populations : `eleves_classe` et `eleves_hors_plafond` comptent tous deux les eleves ACTIFS de `p_classe` — jamais un ratio dont les deux cotes viendraient d''ensembles differents. Reserve aux enseignants (prof_voit_classe) : un eleve obtient 0 partout.';

```


## 20260901170000_rattachement_tardif.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 22 : le rattachement ne peut plus arriver trop tard
-- =====================================================================
--
-- CONSTAT (1er septembre 2026, remonte par Aymeri, reproduit en base)
--
-- Une eleve ajoutee depuis l'ecran Administration apparait bien dans la
-- liste, et se voit pourtant refuser l'acces sur son iPad :
-- « Ce compte n'est pas reconnu. Demande a ton professeur. »
--
-- CAUSE
--
-- `eleves.user_id` n'est renseigne QUE par le trigger
-- `on_auth_user_created`, qui se declenche a la CREATION du compte
-- Supabase Auth — c'est-a-dire a la toute premiere connexion Google de
-- la personne. Le trigger cherche alors son adresse dans `eleves` et
-- dans `profs`.
--
-- Si la personne s'est connectee AVANT que sa fiche existe, le trigger
-- n'a rien trouve, et plus rien ne le rattrape ensuite : creer la fiche
-- apres coup ne renseigne pas `user_id`. Or toutes les politiques RLS et
-- `eleve_courant()` reposent sur `user_id = auth.uid()`. L'eleve reste
-- donc bloquee POUR TOUJOURS, sans que rien ne le signale — sa fiche est
-- normale a l'ecran.
--
-- Reproduit sur base neuve :
--
--   fiche creee AVANT le compte Google  -> qui_suis_je() = 'eleve'
--   compte Google cree AVANT la fiche   -> qui_suis_je() = 'inconnu'
--                                          eleves.user_id = null
--
-- POURQUOI CELA COMPTE MAINTENANT
--
-- A la rentree, 350 eleves sont importes d'un coup. Il suffit qu'un
-- eleve ait ouvert l'application une fois avant l'import — par
-- curiosite, parce qu'un camarade lui a montre, parce qu'une classe a
-- ete testee avant les autres — pour qu'il soit ecarte definitivement.
-- Et l'echelonnement de la rentree, prevu classe par classe, rend ce
-- cas probable plutot qu'exceptionnel.
--
-- LE CORRECTIF
--
-- On arrete de dependre d'un evenement unique. Le rattachement devient
-- une operation qu'on peut REJOUER, et on la rejoue a chaque fois qu'une
-- adresse entre dans le systeme :
--
--   * `rattacher_par_email()` — helper interne, non expose au client :
--     rattache une fiche a un compte Auth existant, si et seulement si
--     ce compte n'appartient encore a personne.
--   * `ajouter_eleve`, `importer_eleves` et `modifier_eleve` l'appellent.
--   * `reparer_rattachements()` — reserve a l'administrateur, rejouable
--     a volonte, pour les fiches deja creees. C'est le bouton a actionner
--     apres chaque import de rentree.
--   * Et une passe de reparation immediate, ci-dessous, qui debloque les
--     fiches actuellement orphelines — dont celle qui a revele le defaut.
--
-- CE QUI NE CHANGE PAS
--
-- La barriere d'entree tient : un compte Google dont l'adresse n'est
-- dans aucune table n'obtient toujours rien. Et un compte Auth deja
-- rattache a quelqu'un ne peut pas etre repris par une autre fiche —
-- c'est la condition `not exists` ci-dessous, sans laquelle une fiche
-- creee avec l'adresse d'un administrateur lui volerait son compte.
--
-- NUMEROTATION : 20260901170000, l'heure reelle d'ecriture. La dette
-- laissee par la 19 (datee dans le futur) est resorbee : il est 17 h.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Le helper — interne, jamais expose a un client
-- ---------------------------------------------------------------------
create or replace function public.rattacher_par_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_uid   uuid;
begin
  if v_email is null or v_email = '' then
    return null;
  end if;

  -- Le compte Auth doit exister ET n'appartenir a personne. Sans cette
  -- seconde condition, creer une fiche avec l'adresse d'un collegue
  -- deja inscrit lui prendrait son compte.
  select u.id into v_uid
    from auth.users u
   where lower(u.email) = v_email
     and not exists (select 1 from public.eleves e where e.user_id = u.id)
     and not exists (select 1 from public.profs  p where p.user_id = u.id)
   limit 1;

  if v_uid is null then
    return null;
  end if;

  -- Meme signal que le trigger : c'est un rattachement systeme, pas une
  -- modification de fiche par un eleve.
  perform set_config('app.rattachement_en_cours', 'on', true);

  update public.eleves set user_id = v_uid
   where lower(email) = v_email and user_id is null;

  update public.profs  set user_id = v_uid
   where lower(email) = v_email and user_id is null;

  perform set_config('app.rattachement_en_cours', 'off', true);

  return v_uid;
end;
$$;

-- Volontairement NON accorde a `authenticated` : ce helper lit
-- `auth.users`. Il n'est appele que depuis des fonctions `security
-- definer` dont l'acces est deja controle.
revoke all on function public.rattacher_par_email(text) from public, anon, authenticated;

comment on function public.rattacher_par_email(text) is
  'Rattache la fiche eleve ou prof portant cette adresse au compte Supabase Auth de meme adresse, s''il en existe un ET qu''il n''appartient encore a personne. Renvoie l''user_id rattache, ou null. Rejouable sans effet de bord. Complete le trigger on_auth_user_created, qui ne se declenche qu''a la creation du compte : une fiche creee APRES la premiere connexion resterait sinon orpheline pour toujours.';


-- ---------------------------------------------------------------------
-- 2. Le bouton de l'administrateur — a actionner apres chaque import
-- ---------------------------------------------------------------------
create or replace function public.reparer_rattachements()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repares int := 0;
  r         record;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  for r in select email from public.eleves where user_id is null loop
    if public.rattacher_par_email(r.email) is not null then
      v_repares := v_repares + 1;
    end if;
  end loop;

  for r in select email from public.profs where user_id is null loop
    if public.rattacher_par_email(r.email) is not null then
      v_repares := v_repares + 1;
    end if;
  end loop;

  perform public.journaliser('reparer_rattachements', null,
    jsonb_build_object('rattaches', v_repares));

  return jsonb_build_object('rattaches', v_repares);
end;
$$;

grant execute on function public.reparer_rattachements() to authenticated;

comment on function public.reparer_rattachements() is
  'Rejoue le rattachement pour toutes les fiches sans user_id : celles dont le compte Google existait deja avant la creation de la fiche. Reserve a l''administrateur, sans effet de bord, a lancer apres chaque import de rentree. Renvoie le nombre de fiches rattachees.';


-- ---------------------------------------------------------------------
-- 3. Les points d'entree appellent le helper
--
-- Les deux fonctions sont reprises TELLES QUELLES de la migration 7 ;
-- seul l'appel a `rattacher_par_email` est ajoute. Rien d'autre de leur
-- comportement ne change.
-- ---------------------------------------------------------------------

create or replace function public.ajouter_eleve(
  p_email  text,
  p_nom    text,
  p_prenom text,
  p_classe text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_id    uuid;
  v_actif boolean;
begin
  if not public.peut_administrer_classe(p_classe) then
    raise exception 'Tu ne peux ajouter un eleve que dans tes classes'
      using errcode = '42501';
  end if;

  if v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
    raise exception 'Adresse e-mail invalide : %', p_email;
  end if;

  select id, actif into v_id, v_actif
    from public.eleves where lower(email) = v_email;

  if v_id is not null then
    if v_actif then
      return jsonb_build_object('ok', false, 'raison', 'existe_deja',
        'message', 'Cet eleve existe deja et il est actif.', 'eleve_id', v_id);
    end if;
    update public.eleves
       set actif = true, nom = p_nom, prenom = p_prenom, classe = p_classe
     where id = v_id;
    perform public.rattacher_par_email(v_email);   -- migration 22
    perform public.journaliser('reactivation_via_ajout', v_email, '{}');
    return jsonb_build_object('ok', true, 'reactive', true, 'eleve_id', v_id,
      'message', 'Cet eleve existait deja, desactive. Il a ete reactive.');
  end if;

  insert into public.eleves (email, nom, prenom, classe, plafond_tables)
  values (v_email, p_nom, p_prenom, p_classe, public.plafond_par_defaut(p_classe))
  returning id into v_id;

  -- MIGRATION 22 — si cette personne s'est deja connectee avant que sa
  -- fiche existe, son compte Auth est deja la et le trigger
  -- `on_auth_user_created` ne se declenchera plus jamais pour elle.
  -- On rattache maintenant, sinon jamais.
  perform public.rattacher_par_email(v_email);

  perform public.journaliser('ajout_eleve', v_email,
    jsonb_build_object('classe', p_classe));

  return jsonb_build_object('ok', true, 'reactive', false, 'eleve_id', v_id,
    'message', 'Eleve ajoute. Il peut se connecter immediatement.');
end;
$$;

create or replace function public.importer_eleves(p_eleves jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crees      int := 0;
  v_maj        int := 0;
  v_rattaches  int := 0;
  v_ignores    jsonb := '[]';
  v_absents    jsonb;
  e            jsonb;
  v_email      text;
  v_existe     boolean;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  if jsonb_typeof(p_eleves) <> 'array' then
    raise exception 'Le format attendu est un tableau JSON';
  end if;

  for e in select * from jsonb_array_elements(p_eleves) loop
    v_email := lower(trim(e->>'email'));

    -- Lignes inexploitables : on les signale plutôt que de les avaler
    if v_email is null or v_email = ''
       or e->>'nom' is null or e->>'prenom' is null or e->>'classe' is null
       or v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
      v_ignores := v_ignores || jsonb_build_object(
        'ligne', e, 'raison', 'email invalide ou champ manquant');
      continue;
    end if;

    select true into v_existe from public.eleves where lower(email) = v_email;

    if v_existe then
      update public.eleves
         set nom    = e->>'nom',
             prenom = e->>'prenom',
             classe = e->>'classe',
             actif  = true
       where lower(email) = v_email;
      v_maj := v_maj + 1;
    else
      insert into public.eleves (email, nom, prenom, classe, plafond_tables)
      values (v_email, e->>'nom', e->>'prenom', e->>'classe',
              public.plafond_par_defaut(e->>'classe'));
      v_crees := v_crees + 1;
    end if;
    -- MIGRATION 22 — rejoue pour chaque ligne, creee comme mise a jour :
    -- la rentree echelonnee garantit que des eleves auront ouvert
    -- l'application avant l'import de leur classe.
    if public.rattacher_par_email(v_email) is not null then
      v_rattaches := v_rattaches + 1;
    end if;

    v_existe := null;
  end loop;

  -- Qui est actif en base mais absent du fichier ?
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', email, 'nom', nom, 'prenom', prenom, 'classe', classe)), '[]')
    into v_absents
    from public.eleves
   where actif
     and lower(email) not in (
       select lower(trim(x->>'email')) from jsonb_array_elements(p_eleves) x
        where x->>'email' is not null);

  perform public.journaliser('import_eleves', null, jsonb_build_object(
    'crees', v_crees, 'mis_a_jour', v_maj, 'rattaches', v_rattaches,
    'ignores', jsonb_array_length(v_ignores),
    'absents_du_fichier', jsonb_array_length(v_absents)));

  return jsonb_build_object(
    'crees', v_crees,
    'mis_a_jour', v_maj,
    'rattaches', v_rattaches,
    'lignes_ignorees', v_ignores,
    'actifs_absents_du_fichier', v_absents
  );
end;
$$;

comment on function public.importer_eleves(jsonb) is
  'Import de rentree. Ne desactive personne : un eleve absent du fichier est seulement signale dans `actifs_absents_du_fichier`. Populations : `crees` + `mis_a_jour` comptent les lignes retenues du FICHIER ; `actifs_absents_du_fichier` compte les eleves ACTIFS de la BASE absents du fichier — deux ensembles differents, jamais a rapprocher en fraction. `rattaches` compte les fiches reliees a un compte Google preexistant (migration 22).';


-- ---------------------------------------------------------------------
-- 4. La passe de reparation immediate
-- Debloque les fiches actuellement orphelines, dont celle qui a revele
-- le defaut. Idempotente : la rejouer ne fait rien de plus.
-- ---------------------------------------------------------------------
do $$
declare
  r  record;
  n  int := 0;
begin
  for r in select email from public.eleves where user_id is null loop
    if public.rattacher_par_email(r.email) is not null then n := n + 1; end if;
  end loop;
  for r in select email from public.profs where user_id is null loop
    if public.rattacher_par_email(r.email) is not null then n := n + 1; end if;
  end loop;
  raise notice 'Migration 22 : % fiche(s) rattachee(s) a un compte existant.', n;
end $$;

```


## 20260902100000_plafond_lisible.sql

```sql
-- =====================================================================
-- Calcul Mental Saintho
-- Migration 23 : dire le plafond avec les mots du professeur
-- =====================================================================
--
-- CONSTAT (2 septembre 2026, recette d'Aymeri)
--
-- L'avertissement affiche : « 1 eleve sur 2 n'a pas encore debloque la
-- table 15 — lancer quand meme ? »
--
-- Aymeri le lit et le croit faux : « les 2 eleves de la 31 ne l'ont pas
-- fait ». Verification faite, **le compteur est juste** : dans cette
-- classe un eleve a un plafond de 10 et l'autre de 15. Un seul est donc
-- au-dessous de 15.
--
-- Ce qui est faux, c'est le MOT. « Debloque » designe `plafond_tables`,
-- un mecanisme que le professeur ne voit nomme nulle part : ni sur
-- « Ma classe », ni sur une fiche eleve, ni dans l'aide. Lui lit
-- « debloque » et comprend « travaille » — et sur cet ecran-la, les
-- deux eleves n'ont effectivement jamais travaille la table 15.
--
-- Deux notions distinctes, un seul mot pour les dire :
--
--   plafond_tables  = jusqu'ou l'eleve a le DROIT d'aller
--                     (gagne par la Montee des tables)
--   maitrise        = ce qu'il a effectivement TRAVAILLE
--
-- Un chiffre juste que personne ne sait lire ne vaut pas mieux qu'un
-- chiffre faux : dans les deux cas le professeur decide sur une
-- comprehension erronee. C'est la meme famille que les bugs de
-- population, transposee au vocabulaire.
--
-- LE CORRECTIF
--
-- La fonction renvoie de quoi ecrire une phrase qui se suffit a
-- elle-meme, sans jargon et avec son point de repere :
--
--   « La table 15 depasse le niveau atteint par 1 eleve sur 2.
--     Le plus bas de la classe s'arrete a la table 10. »
--
-- `plafond_commun` (le plus bas de la classe) est ce point de repere.
-- `plafond_max` complete le tableau pour l'ecran qui voudrait le dire.
-- Aucun compteur existant ne change de sens.
--
-- NUMEROTATION : 20260902100000, l'heure reelle d'ecriture.
-- =====================================================================

create or replace function public.apercu_defi_classe(
  p_classe text,
  p_tables smallint[]
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'classe',              p_classe,
    'table_max',           (select max(x) from unnest(p_tables) x),
    -- Populations : les trois compteurs ci-dessous portent TOUS sur les
    -- eleves ACTIFS de `p_classe`. Aucun ne se rapporte a ceux qui ont
    -- travaille la table — c'est une autre population, et c'est
    -- precisement la confusion que cette migration corrige.
    'eleves_classe',       count(*),
    'eleves_hors_plafond', count(*) filter (
                             where e.plafond_tables
                                 < (select max(x) from unnest(p_tables) x)),
    -- Le point de repere : le plafond le plus bas de la classe. C'est
    -- lui qui permet d'ecrire « le plus bas de la classe s'arrete a la
    -- table 10 » au lieu d'un « debloque » que personne ne sait lire.
    'plafond_commun',      min(e.plafond_tables),
    'plafond_max',         max(e.plafond_tables))
    from public.eleves e
   where e.classe = p_classe
     and e.actif
     and public.prof_voit_classe(p_classe);
$$;

grant execute on function public.apercu_defi_classe(text, smallint[]) to authenticated;

comment on function public.apercu_defi_classe(text, smallint[]) is
  'Avant de creer un defi de classe : combien d''eleves n''ont pas atteint la plus haute table choisie, et ou s''arrete le plus faible. Populations : `eleves_classe`, `eleves_hors_plafond`, `plafond_commun` et `plafond_max` portent TOUS sur les eleves ACTIFS de `p_classe` — jamais sur ceux qui ont travaille la table, qui sont une autre population. `plafond_tables` est un DROIT gagne par la Montee des tables, pas une trace de travail : ne jamais l''afficher avec le mot « travaille ». Reserve aux enseignants (prof_voit_classe) : un eleve obtient 0 partout.';

```


## 20260903080000_apercu_import.sql

```sql
-- ---------------------------------------------------------------------
-- Migration 24 : l'import de rentree se regarde avant de s'executer
--
-- Le probleme, tel qu'il est apparu en dessinant l'ecran d'administration.
-- `importer_eleves` ecrit. Il n'existait aucun moyen de savoir ce qu'un
-- fichier allait produire avant qu'il ne l'ait produit. Or c'est la seule
-- operation du projet ou une erreur coute une soiree : 350 lignes, une
-- colonne decalee, et personne ne s'en apercoit avant que les eleves ne
-- se connectent.
--
-- Trois manques, et un defaut.
--
-- 1. Aucun apercu. On ne peut pas dire « voila ce qui serait ecrit ».
-- 2. Une seule raison pour tous les rejets : « email invalide ou champ
--    manquant ». L'administrateur qui recoit ca doit rouvrir son tableur
--    et chercher lui-meme.
-- 3. Aucune distinction entre une mise a jour et une REACTIVATION. Un
--    eleve desactive en juin qui reapparait dans le fichier de septembre
--    redevient actif en silence. C'est le bon comportement, mais il doit
--    se voir.
--
-- Le defaut, lui, est plus serieux : DEUX LIGNES DU MEME FICHIER portant
-- le meme e-mail etaient traitees deux fois. La premiere creait la fiche,
-- la seconde la mettait a jour — et `crees` + `mis_a_jour` comptaient
-- deux fois un seul eleve. Un doublon dans un export de vie scolaire
-- n'a rien d'exceptionnel. Desormais la seconde occurrence est rejetee,
-- en disant a quelle ligne se trouve la premiere.
--
-- LA REGLE DE CONSTRUCTION. L'apercu et l'import ne redisent pas les
-- memes regles chacun de leur cote : ils appellent tous les deux
-- `valider_lignes_import`. Deux copies des regles, c'est deux copies qui
-- divergent au premier correctif, et un apercu qui ment est pire que
-- pas d'apercu du tout.
--
-- POPULATIONS. `creations`, `mises_a_jour` et `ignorees` partitionnent
-- les lignes du FICHIER : leur somme fait exactement le nombre de lignes.
-- `dont_reactivations` est un SOUS-ENSEMBLE de `mises_a_jour` — le mot
-- « dont » est dans le nom pour qu'on ne l'additionne jamais au reste.
-- `actifs_absents_du_fichier` porte sur la BASE, pas sur le fichier :
-- c'est une autre population, jamais a rapprocher en fraction.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. La validation, ecrite une seule fois
--
-- Renvoie un tableau, une entree par ligne du fichier, dans l'ordre :
--   { ligne, index, email, nom, prenom, classe,
--     statut : 'creation' | 'mise_a_jour' | 'reactivation' | 'ignoree',
--     raison : text (seulement si ignoree),
--     rattachable : boolean }
--
-- `ligne` reprend le champ `ligne` de l'objet s'il existe (le front
-- connait le numero de ligne reel de son CSV, en-tete comprise), sinon
-- la position dans le tableau. C'est ce numero qui est affiche a
-- l'administrateur : lui donner un index decale de un serait lui faire
-- chercher la mauvaise ligne dans son tableur.
-- ---------------------------------------------------------------------
create or replace function public.valider_lignes_import(p_eleves jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res      jsonb := '[]';
  e          jsonb;
  v_idx      int;
  v_ligne    int;
  v_email    text;
  v_statut   text;
  v_raison   text;
  v_existe   boolean;
  v_actif    boolean;
  v_vus      jsonb := '{}';   -- email -> numero de ligne de la 1re occurrence
  v_rattach  boolean;
  v_brut     text;
begin
  if jsonb_typeof(p_eleves) <> 'array' then
    raise exception 'Le format attendu est un tableau JSON';
  end if;

  v_idx := 0;
  for e in select * from jsonb_array_elements(p_eleves) loop
    v_idx    := v_idx + 1;
    -- Le front peut porter son propre numero de ligne (son CSV a une
    -- en-tete). On ne le croit que s'il est vraiment un entier : un
    -- numero fantaisiste ferait chercher la mauvaise ligne.
    v_brut   := e->>'ligne';
    v_ligne  := case when v_brut ~ '^[0-9]+$' then v_brut::int else v_idx end;
    v_email  := lower(trim(coalesce(e->>'email', '')));
    v_statut := null;
    v_raison := null;
    v_rattach := false;
    v_existe := null;
    v_actif  := null;

    -- Les rejets, du plus grossier au plus fin. Une seule raison par
    -- ligne : celle qui est la plus utile a corriger en premier.
    if v_email = '' then
      v_raison := 'e-mail manquant';
    elsif v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
      v_raison := 'e-mail invalide — ' || v_email;
    elsif coalesce(trim(e->>'prenom'), '') = '' then
      v_raison := 'prenom manquant';
    elsif coalesce(trim(e->>'nom'), '') = '' then
      v_raison := 'nom manquant';
    elsif coalesce(trim(e->>'classe'), '') = '' then
      v_raison := 'classe vide';
    elsif jsonb_exists(v_vus, v_email) then
      v_raison := 'e-mail deja present ligne ' || (v_vus->>v_email);
    end if;

    if v_raison is not null then
      v_statut := 'ignoree';
    else
      v_vus := v_vus || jsonb_build_object(v_email, v_ligne::text);

      select true, actif into v_existe, v_actif
        from public.eleves where lower(email) = v_email;

      if not coalesce(v_existe, false) then
        v_statut := 'creation';
      elsif coalesce(v_actif, true) then
        v_statut := 'mise_a_jour';
      else
        v_statut := 'reactivation';
      end if;

      -- Un compte Google existe-t-il deja pour cet e-mail, sans fiche ?
      -- (migration 22 : la rentree est echelonnee, des eleves ouvrent
      -- l'application avant que leur classe ne soit importee.)
      select exists (
        select 1 from auth.users u
         where lower(u.email) = v_email
           and not exists (select 1 from public.eleves x where x.user_id = u.id)
           and not exists (select 1 from public.profs  p where p.user_id = u.id)
      ) into v_rattach;
    end if;

    v_res := v_res || jsonb_build_object(
      'ligne',       v_ligne,
      'index',       v_idx,
      'email',       nullif(v_email, ''),
      'nom',         e->>'nom',
      'prenom',      e->>'prenom',
      'classe',      e->>'classe',
      'statut',      v_statut,
      'raison',      v_raison,
      'rattachable', v_rattach
    );
  end loop;

  return v_res;
end;
$$;

comment on function public.valider_lignes_import(jsonb) is
  'Regles de validation d''un fichier d''import, ecrites UNE SEULE FOIS : apercu_import_eleves et importer_eleves l''appellent tous les deux. N''ecrit rien. Statut par ligne : creation | mise_a_jour | reactivation | ignoree. Un e-mail en double dans le fichier est ignore a partir de la SECONDE occurrence, en nommant la ligne de la premiere.';

revoke all on function public.valider_lignes_import(jsonb) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. L'apercu : ce que le fichier ferait, sans rien ecrire
-- ---------------------------------------------------------------------
create or replace function public.apercu_import_eleves(p_eleves jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lignes   jsonb;
  v_absents  jsonb;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  v_lignes := public.valider_lignes_import(p_eleves);

  select coalesce(jsonb_agg(jsonb_build_object(
           'email', email, 'nom', nom, 'prenom', prenom, 'classe', classe)
           order by classe, nom, prenom), '[]')
    into v_absents
    from public.eleves
   where actif
     and lower(email) not in (
       select lower(trim(x->>'email')) from jsonb_array_elements(p_eleves) x
        where x->>'email' is not null);

  return jsonb_build_object(
    'lignes_lues',        jsonb_array_length(p_eleves),
    'creations',          (select count(*) from jsonb_array_elements(v_lignes) l
                            where l->>'statut' = 'creation'),
    'mises_a_jour',       (select count(*) from jsonb_array_elements(v_lignes) l
                            where l->>'statut' in ('mise_a_jour', 'reactivation')),
    'dont_reactivations', (select count(*) from jsonb_array_elements(v_lignes) l
                            where l->>'statut' = 'reactivation'),
    'ignorees',           (select count(*) from jsonb_array_elements(v_lignes) l
                            where l->>'statut' = 'ignoree'),
    'rattachables',       (select count(*) from jsonb_array_elements(v_lignes) l
                            where (l->>'rattachable')::boolean),
    'lignes_ignorees',    (select coalesce(jsonb_agg(l order by (l->>'index')::int), '[]')
                             from jsonb_array_elements(v_lignes) l
                            where l->>'statut' = 'ignoree'),
    'actifs_absents_du_fichier', v_absents
  );
end;
$$;

comment on function public.apercu_import_eleves(jsonb) is
  'Ce que le fichier PRODUIRAIT. N''ecrit rien, ne journalise rien : on peut l''appeler autant de fois qu''on veut. Memes populations et memes noms que importer_eleves, aux memes regles (fonction de validation commune), pour que l''ecran affiche avant exactement ce qu''il affichera apres. `dont_reactivations` est un sous-ensemble de `mises_a_jour`, jamais a additionner. `actifs_absents_du_fichier` porte sur la BASE, pas sur le fichier.';

grant execute on function public.apercu_import_eleves(jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 3. L'import, reecrit sur la validation commune
--
-- Le texte d'origine (migration 22) est repris tel quel ; seule la
-- boucle change, pour lire le statut au lieu de le recalculer. Les
-- garde-fous, la journalisation et la forme du retour ne bougent pas —
-- sauf `dont_reactivations`, ajoute, et `lignes_ignorees` qui porte
-- maintenant une raison exploitable.
-- ---------------------------------------------------------------------
create or replace function public.importer_eleves(p_eleves jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crees      int := 0;
  v_maj        int := 0;
  v_reac       int := 0;
  v_rattaches  int := 0;
  v_ignores    jsonb := '[]';
  v_absents    jsonb;
  v_lignes     jsonb;
  l            jsonb;
  v_email      text;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  if jsonb_typeof(p_eleves) <> 'array' then
    raise exception 'Le format attendu est un tableau JSON';
  end if;

  -- Memes regles que l'apercu, parce que c'est la meme fonction.
  v_lignes := public.valider_lignes_import(p_eleves);

  for l in select * from jsonb_array_elements(v_lignes) loop
    if l->>'statut' = 'ignoree' then
      v_ignores := v_ignores || l;
      continue;
    end if;

    v_email := l->>'email';

    if l->>'statut' = 'creation' then
      insert into public.eleves (email, nom, prenom, classe, plafond_tables)
      values (v_email, l->>'nom', l->>'prenom', l->>'classe',
              public.plafond_par_defaut(l->>'classe'));
      v_crees := v_crees + 1;
    else
      update public.eleves
         set nom    = l->>'nom',
             prenom = l->>'prenom',
             classe = l->>'classe',
             actif  = true
       where lower(email) = v_email;
      v_maj := v_maj + 1;
      if l->>'statut' = 'reactivation' then
        v_reac := v_reac + 1;
      end if;
    end if;

    -- MIGRATION 22 — rejoue pour chaque ligne, creee comme mise a jour :
    -- la rentree echelonnee garantit que des eleves auront ouvert
    -- l'application avant l'import de leur classe.
    if public.rattacher_par_email(v_email) is not null then
      v_rattaches := v_rattaches + 1;
    end if;
  end loop;

  -- Qui est actif en base mais absent du fichier ?
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', email, 'nom', nom, 'prenom', prenom, 'classe', classe)
           order by classe, nom, prenom), '[]')
    into v_absents
    from public.eleves
   where actif
     and lower(email) not in (
       select lower(trim(x->>'email')) from jsonb_array_elements(p_eleves) x
        where x->>'email' is not null);

  perform public.journaliser('import_eleves', null, jsonb_build_object(
    'crees', v_crees, 'mis_a_jour', v_maj, 'dont_reactivations', v_reac,
    'rattaches', v_rattaches,
    'ignores', jsonb_array_length(v_ignores),
    'absents_du_fichier', jsonb_array_length(v_absents)));

  return jsonb_build_object(
    'crees', v_crees,
    'mis_a_jour', v_maj,
    'dont_reactivations', v_reac,
    'rattaches', v_rattaches,
    'lignes_ignorees', v_ignores,
    'actifs_absents_du_fichier', v_absents
  );
end;
$$;

comment on function public.importer_eleves(jsonb) is
  'Import de rentree. Ne desactive personne : un eleve absent du fichier est seulement signale dans `actifs_absents_du_fichier`. Populations : `crees` + `mis_a_jour` + le nombre de `lignes_ignorees` font exactement le nombre de lignes du FICHIER ; `dont_reactivations` est un SOUS-ENSEMBLE de `mis_a_jour` (eleves desactives redevenus actifs), jamais a additionner ; `actifs_absents_du_fichier` compte les eleves ACTIFS de la BASE absents du fichier — une autre population, jamais a rapprocher en fraction. `rattaches` compte les fiches reliees a un compte Google preexistant (migration 22). Un e-mail en double dans le fichier n''est traite qu''une fois : les occurrences suivantes sont ignorees (migration 24). Memes regles que apercu_import_eleves, par construction.';

grant execute on function public.importer_eleves(jsonb) to authenticated;

```


---

# ECRANS.md — l'intention de chaque ecran

Ecrit AVANT la construction. La ou il diverge du code,
c'est le code qui dit ce qui est, et ce document ce qui
etait vise.

# Les écrans, un par un

> Pour Antigravity. Complément du `ANTIGRAVITY_BRIEF.md`, à lire après lui.
> Les maquettes visuelles sont dans `docs/ecrans-et-defis.html`.

---

## Comment lire ce document

Ces consignes décrivent **l'intention**, pas les pixels. Elles disent ce que
l'écran doit permettre, ce qu'il doit appeler, et quels états il ne doit pas
oublier.

**Tu peux ajuster.** Si tu vois une meilleure façon de faire, propose-la et
explique pourquoi — en une ou deux phrases, avant de coder. Tu es celui qui voit
le résultat à l'écran ; ce document a été écrit sans jamais l'avoir vu tourner.

En revanche, deux catégories ne s'ajustent pas sans validation explicite :

- Ce qui est marqué **⚠️ NON NÉGOCIABLE** — sécurité, données de mineurs,
  ou décision pédagogique déjà tranchée après discussion
- Les appels serveur : les fonctions existent, elles sont testées. Si l'une te
  paraît manquer, **signale-le, ne la contourne pas** en écrivant dans les
  tables.

---

## Règles valables sur tous les écrans

### Les couleurs viennent des variables existantes

Une refonte visuelle est prévue **après** la mise en fonctionnement. Elle sera
indolore si tu utilises `var(--navy)`, `var(--gold)`, `var(--mint)`,
`var(--coral)`, `var(--sky)`, `var(--surface)`, `var(--border)` — et douloureuse
si tu écris `#C9A227` en dur.

Même chose pour les classes existantes : `.card`, `.btn`, `.chip`, `.pill`,
`.mode-card`, `.stat`, `.progress-bar`, `.anim-pop`, `.anim-shake`. Réutilise
avant d'inventer.

### Trois états à ne jamais oublier

Chaque écran qui charge des données en a **trois**, pas un :

| État | Ce qu'il faut afficher |
|---|---|
| **Chargement** | Un indicateur. Pas un écran blanc. |
| **Vide** | Une phrase qui explique. « Personne n'a encore joué cette semaine — sois le premier ! » et non un tableau vide. |
| **Erreur** | Le message renvoyé par le serveur, tel quel. Il est écrit en français, pour être lu par un élève. |

L'écran vide est celui qu'on oublie, et c'est celui que verront les premiers
utilisateurs le jour de la mise en service : la base sera vierge.

### Interface tactile, élèves de 11 à 15 ans

Zones de frappe d'au moins 44 pixels. Pas de survol comme seule indication.
Le texte des messages d'erreur doit être compréhensible par un 6ᵉ : « Ce code
n'existe pas. Vérifie les lettres. » et non « Erreur 404 ».

### ⚠️ NON NÉGOCIABLE — aucun champ de texte libre

Nulle part. Pas de nom de défi, pas de message, pas de pseudo, pas de commentaire.
Un défi est identifié par son code. Les avatars sont une liste fermée d'emojis.

Dès qu'on laisse des collégiens écrire du texte que d'autres verront, il faut
modérer — et personne au collège n'aura le temps de le faire.

---

# CÔTÉ ÉLÈVE

## 1. Démarrage de l'application

**Le premier écran n'est pas le login.** C'est un écran de chargement, le temps
de savoir si une session existe déjà.

```
sessionActive()  →  faux : écran de connexion
                 →  vrai : quiSuisJe()  →  'eleve'   : accueil élève
                                        →  'prof'    : accueil prof
                                        →  'inconnu' : écran « compte non reconnu »
```

Appelle aussi `viderFile()` à ce moment : s'il reste des parties en attente
d'une session précédente, elles partent maintenant.

**⚠️ Le cas `inconnu`** : un compte a été créé mais l'adresse n'est ni dans
`eleves` ni dans `profs`. C'est la barrière d'entrée qui fonctionne, pas un bug.
Affiche le message renvoyé (« Ce compte n'est pas reconnu. Demande à ton
professeur. ») avec un bouton de déconnexion. **Ne renvoie pas au login en
boucle** — l'élève retaperait son adresse indéfiniment.

**Pourquoi c'est important** : aujourd'hui, l'app oublie l'élève à chaque
rechargement. Sur iPad, Safari décharge les onglets en arrière-plan. En classe,
ça veut dire des reconnexions toutes les dix minutes.

### ⚠️ `quiSuisJe()` ne renvoie pas la même forme selon le type

C'est la source d'erreur la plus probable de tout le Lot 0.

```js
// élève
{ type: 'eleve',
  profil: { id, prenom, nom, classe, avatar_emoji,
            plafond_tables, tables_autorisees } }

// prof
{ type: 'prof', admin: true|false,
  profil: { id, nom, email, role, classes } }
//                  ↑ pas de prenom, pas de classe, pas d'avatar

// inconnu
{ type: 'inconnu', message: "..." }
//                  ↑ pas de profil du tout
```

**N'aplatis pas ces trois formes en un seul objet `user`.** Un écran qui lit
`user.prenom` planterait pour un professeur, et `user.profil.quoi-que-ce-soit`
planterait pour un compte inconnu.

Garde la réponse telle quelle et dérive depuis elle :

```js
const [identite, setIdentite] = useState(null);
const estProf  = identite?.type === 'prof';
const estAdmin = identite?.admin === true;
```

Chaque écran reçoit `identite` et choisit ses champs selon le type.

*(Au passage : le champ s'écrit `prenom`, sans accent. L'ancien code utilisait
`prénom` — c'est un vrai bug, pas une coquette.)*

### Un placeholder honnête n'est pas une donnée en dur

Un écran « Accueil enseignant — en construction » est parfaitement acceptable :
il ne simule rien, il annonce ce qu'il est. La règle « aucune donnée en dur »
vise les **fausses données qui se font passer pour vraies** — de faux
classements, des records inventés — pas les écrans assumés comme inachevés.

### Ce qu'il faut vérifier avant de dire que c'est fini

- Démarrage **sans session** → écran de connexion
- Connexion **élève** (`alice.dupont@demo.saintho.fr` du seed) → accueil élève
- Connexion **professeur** (`prof.demo@demo.saintho.fr`) → l'accueil **ne
  plante pas**, et le bouton Administration apparaît (ce compte est `admin`)
- **Adresse non pré-inscrite** → écran « compte non reconnu », et le bouton de
  déconnexion fonctionne réellement
- **Rechargement de page** → la session est restaurée, on ne revient pas au
  login

## 2. Connexion

**Un bouton principal, un lien de secours.**

### Le bouton — « Se connecter avec Google »

En grand, au centre. Appelle `connexionGoogle()`.

Cette fonction **ne renvoie pas un utilisateur connecté** : elle redirige le
navigateur vers Google. La session est récupérée au retour, et c'est le
démarrage de l'application (écran 1) qui constate la connexion. Ne cherche pas
à enchaîner sur `quiSuisJe()` juste après l'appel : la page aura changé.

Les élèves utilisent déjà ce compte dans Safari pour les Google Forms. Sur un
iPad où la session Google est ouverte, c'est une tape.

### Le lien de secours — masqué par défaut

Sous le bouton, discret : « Je n'arrive pas à me connecter avec Google ».
Il ouvre le parcours en deux étapes :

**Étape 1** — un champ e-mail, bouton « Recevoir mon code » → `demanderCode(email)`
**Étape 2** — « Un code à 6 chiffres a été envoyé à … » → `verifierCode(email, code)`

Sur le champ du code :
- `inputMode="numeric"`, `maxLength={6}`
- **`autoComplete="one-time-code"`** — sur iPad, Safari propose alors le code
  directement au-dessus du clavier. L'élève tape une fois au lieu de six.

Le lien « Je n'ai rien reçu » doit être **désactivé pendant 60 secondes**, avec
un compte à rebours visible : Supabase refuse une seconde demande avant une
minute. Un élève qui clique et reçoit une erreur pense que c'est cassé.

⚠️ **Ce secours ne fonctionne que si le SMTP Workspace est configuré**, ce qui
n'est pas encore le cas. **Garde-le derrière un drapeau désactivable** (une
constante en haut du fichier suffit) : un secours qui échoue silencieusement est
pire que pas de secours.

### Après une connexion réussie, quel que soit le chemin

Appelle `quiSuisJe()`. ⚠️ **Traite le cas `inconnu` ici aussi**, pas seulement
au démarrage : c'est juste après une première connexion réussie qu'il se produit
le plus souvent — une adresse absente de la table `eleves`. Route vers le même
écran « compte non reconnu », avec un bouton de déconnexion.

### Supprimé

- Le code PIN à 4 chiffres et le « première connexion 3333 »
- Le repli en mode démo sur erreur serveur — **c'était le défaut le plus
  dangereux** : une panne se transformait en connexion réussie avec de fausses
  données
- Le mode démo tout court : les élèves étant pré-inscrits, « essayer sans
  compte » n'est plus un cas d'usage. Pour une démonstration, on utilise un vrai
  compte de la base de dev.

## 3. Accueil élève

Cinq destinations : Apprendre · S'entraîner · Défis · Classements · Profil.
Voir les maquettes.

En-tête : prénom, classe, avatar.
Si `partiesEnAttente() > 0`, un bandeau discret : « 2 résultats en attente
d'envoi ». Discret — pas une alerte rouge, ce n'est pas grave.

## 4. Sélecteur de tables

L'écran le plus travaillé de la partie élève, parce qu'il conditionne la
qualité de l'entraînement.

**Trois raccourcis en haut**, qui seront plus utilisés que les cases :

- **Mes tables faibles** → `mesTablesFaibles()`, qui lit la grille de maîtrise
  et renvoie les 4 tables les plus ratées
- **Toutes mes tables** → tout jusqu'au plafond
- **Les classiques** → 1 à 10

**Puis les cases, regroupées** — vingt cases en vrac sur un iPad, c'est illisible :

```
Les faciles      1  2  5  10
Le cœur          3  4  6  7  8  9
Au-delà de 10    11  12
Les grandes 🔒   13 … 20     (grisées au-dessus du plafond)
```

Le plafond vient de `quiSuisJe().profil.plafond_tables`. Au-dessus, les cases
sont grisées avec « Débloque-les en Montée des tables ».

**Affiche la valeur en points de la sélection** (« ×2,4 »). L'élève comprend
vite que travailler dur rapporte plus — c'est exactement le comportement
recherché. La difficulté de chaque table est lisible dans
`difficulte_operande`.

**⚠️ Décision pédagogique tranchée** : ne propose jamais de sélection vide, et
ne présélectionne pas les tables faciles par défaut. Le défaut, c'est « mes
tables faibles ».

## 5. Écran de jeu

Il existe et il fonctionne. Trois corrections :

- **Les tables choisies doivent arriver jusqu'ici.** Aujourd'hui
  `ChallengeConfig` laisse choisir puis `SprintPlay` utilise `[2..10]` en dur.
- **Pondérer le tirage par la maîtrise.** `Challenges.jsx` importe déjà
  `buildWeights` depuis `logic/mastery.js` et ne s'en sert jamais. Un fait
  « rouge » doit revenir bien plus souvent qu'un fait « vert ». **C'est le
  meilleur rapport valeur/effort de tout le projet.**
- **Corriger les écouteurs clavier** : quatre `useEffect` sans tableau de
  dépendances réattachent les écouteurs à chaque rendu.
  ⚠️ N'ajoute pas simplement `[]` — les fonctions capturent l'état courant et
  un tableau vide figerait des valeurs périmées. Utilise une ref sur le
  gestionnaire.

### La saisie — modèle à cases, décidé le 28/08

⚠️ **Ce modèle remplace entièrement la validation automatique précédente.**
`estReponseExacte()`, le délai d'inactivité et la touche ✓ comme validation
disparaissent. Ne cherche pas à concilier les deux.

#### Le principe

**Autant de cases que de chiffres dans la réponse.** 7 × 8 → deux cases.
12 × 9 → trois cases. 3 × 3 → une case. Le nombre vient de **la réponse**,
pas des tables cochées.

Dès que la dernière case est remplie, le système juge. Pas de validation
manuelle, pas de délai à régler, aucune ambiguïté sur « est-ce fini ? » —
c'est ce point qui bloquait tout le reste.

*Oui, cela indique le nombre de chiffres attendu. C'est assumé : avec les
tables de 1 à 10, trois cases ne peuvent signifier que 100. L'indice est
négligeable, le gain d'ergonomie ne l'est pas.*

#### Quand c'est faux

Les cases passent en rouge et tremblent ~200 ms, **puis se vident**.
L'élève réécrit. Il apprend son erreur à l'instant où il la commet — c'est
tout l'intérêt, les erreurs des collégiens étant des quasi-réussites
(48 au lieu de 49, 55 au lieu de 56).

`⌫` efface **le dernier chiffre** — il ne sert qu'à rattraper une faute de
frappe avant que la dernière case ne soit remplie. Le retour à zéro après une
erreur est automatique.

#### Le chrono par question

| Mode | Chrono question | Rattrapage |
|---|---|---|
| Sprint · Chrono · Montée | **3 s** | oui, dans les 3 s |
| Sans faute | **aucun** | non, par nature |
| Entraînement libre | **aucun** | oui, sans limite |

⚠️ **Le compte à rebours part à la première touche, jamais à l'affichage.**
Réfléchir doit rester gratuit : c'est déjà le chrono général qui punit
l'hésitation. Une fois que l'élève commence à taper, il est engagé.

Le compte à rebours **doit se voir** — une barre fine sous la question qui se
vide. Sans elle, la question qui saute paraît arbitraire et l'élève croit à un
bug ; avec elle, c'est une tension de jeu.

En **Sans faute**, pas de chrono par question : ce mode récompense la
précision, pas la vitesse. La première réponse complète décide, une erreur met
fin à la partie — il n'y a donc pas de rattrapage possible, par définition.

En **entraînement libre**, pas de chrono non plus, mais affiche le temps
**après** chaque réponse (« ✓ 2,4 s ») et une moyenne en fin de partie. Jamais
en compte à rebours pendant que l'élève cherche : ce mode existe pour qu'il n'y
ait pas de pression.

#### Ce que vaut une réponse — la règle de points

| | Points | Grille |
|---|---|---|
| Juste du **premier coup** | **1** | 🟢 vert |
| **Rattrapé** dans le délai | **½** | 🟡 jaune |
| Jamais trouvé | 0 | 🔴 rouge |

**⚠️ Le demi-point n'est pas un détail, c'est ce qui empêche le jeu
d'apprendre à renoncer.** Si un rattrapage ne rapportait rien, chercher
coûterait des secondes pour zéro point alors qu'abandonner ne coûterait rien :
sous chrono, la meilleure stratégie deviendrait de laisser filer. Avec le demi-
point, chercher est toujours payant, et l'automatisme reste mieux payé que le
tâtonnement.

Le calcul est **en base** (`points_session()`, migration 12). Le front envoie
deux nombres : `score` (toutes les réussites) et `scorePremierEssai`. Il ne
calcule aucun point lui-même.

Une série (« sans faute ») se casse sur **tout premier essai raté**, y compris
s'il est rattrapé ensuite.

#### L'écran de fin doit montrer les deux chiffres

> **18 / 20** du premier coup
> *2 rattrapées au 2ᵉ essai*

Sans ça l'élève se sent volé. Avec, il comprend immédiatement ce qui sépare le
vert du jaune dans sa grille — c'est la meilleure explication qu'on puisse lui
en donner.

*(Reporté à la phase visuelle : un agencement paysage avec la question à
gauche et le pavé à droite, pour raccourcir le trajet du doigt sur un iPad
posé à plat.)*

## 6. Fin de partie

Appelle `enregistrerSession({...})` avec, en plus du score, l'objet `maitrise` :
`{"7_8": 1, "6_9": 3}` — 1 rouge, 2 jaune, 3 vert. C'est lui qui alimente la
grille et la pondération. Sans lui, tout le moteur pédagogique reste inerte.

Le retour contient `nouveaux_badges` : à célébrer, c'est le moment.

**⚠️ Confettis uniquement en cas de réussite.** Aujourd'hui ils se déclenchent
même quand un élève échoue après deux bonnes réponses. C'est vexant.

Si `enregistrerSession` renvoie `enAttente: true`, le réseau est coupé : la
partie est sauvegardée localement et repartira toute seule. Dis-le calmement,
ne bloque pas l'écran.

**⚠️ Bug de hooks à corriger** : `ChallengeResults` fait `if (!result) return
null;` **avant** son `useEffect`. Déplace la garde après tous les hooks.

## 7. Défis — accueil

Deux zones :

**Rejoindre** — le champ code à 5 lettres. Il existe déjà mais **le bouton n'a
aucune action attachée**. Branche-le sur `rejoindreDefi(code)`.

⚠️ Trois refus distincts, à traiter séparément :

| `raison` | Message | Suite |
|---|---|---|
| `inconnu` | « Ce code n'existe pas. Vérifie les lettres. » | rester sur le champ |
| `ferme` | « Ce défi est terminé. » | proposer autre chose |
| `deja_joue` | « Tu as déjà participé. » | **proposer de voir le classement** |

Un message unique laisserait l'élève bloqué sans savoir s'il doit retaper ou
passer à autre chose.

**Les cinq modes.** ⚠️ Seuls **Sprint** et **Contre-la-montre** sont proposables
en défi à code — Sans faute et Montée produisent des écarts de durée trop grands
pour un usage simultané. Le serveur refuse les autres de toute façon.

Aujourd'hui, le mode « Défi de classe » **retombe silencieusement sur un Sprint
solo** : l'élève croit jouer contre sa classe et joue seul. C'est le bug le plus
trompeur du projet.

## 8. Défi — le classement qui se remplit

L'écran manquant, et le plus satisfaisant à construire.

Après `terminerDefi()`, affiche `classementDefi(defiId)` et abonne-toi avec
`suivreDefi(defiId, callback)`. Ajoute `avancementDefi()` pour le compteur
« 18 / 27 ont terminé ».

L'élève voit son rang, puis les autres arriver. Comme toute la classe démarre
en même temps — le professeur a dit « c'est parti » — l'effet ressenti est celui
d'un direct, **sans qu'aucun mécanisme temps réel n'ait été construit**.

N'oublie pas de te désabonner en quittant l'écran : `suivreDefi` renvoie la
fonction pour ça.

## 9. Classements

Deux onglets, trois filtres.

**Progression** (par défaut) → `classementProgression()`
**Records** → `classementRecords()` — catégories : série · chrono · sprint · montée

| Filtre | Valeurs | Défaut |
|---|---|---|
| Période | semaine · mois · année · toujours | semaine |
| Portée | ma classe · mon niveau (tous les 6ᵉ) · le collège | **ma classe** |
| Palier | Découverte · Confirmé · Expert · tous | celui de l'élève |

**⚠️ « Ma classe » par défaut** : la comparaison de proximité motive,
l'exposition à l'échelle du collège écrase.

**⚠️ Le palier `tous`** est un **tableau d'honneur** — « les records du
collège » — à présenter comme une vitrine, jamais comme classement par défaut.
Sinon les mêmes sont toujours en tête et les plus fragiles toujours en bas.

Il existe aussi `classementClasses()` : 6ᵉA contre 6ᵉB, en moyenne par élève.
À cet âge l'émulation collective fonctionne souvent mieux que l'exposition
individuelle — mets-le en avant.

**⚠️ Les élèves sont affichés « Alice D. »** — prénom et initiale. Décision
prise après discussion : le rôle d'un classement est de motiver, pas
d'identifier. Le serveur ne renvoie de toute façon rien d'autre.

## 10. Profil

`monProfil()` en un seul appel : profil, records, grille de maîtrise, badges.
Supprime toutes les données en dur.

### ⚠️ Deux pièges dans la réponse de `monProfil()`

**N'affiche JAMAIS `profil.tables_autorisees`.** C'est une colonne fossile de
la version Google Sheets : figée à 1..10 pour tout le monde, protégée en
écriture, jamais mise à jour. Un élève Expert ayant débloqué la table 17 y lit
encore « 1 à 10 ». Le plafond réel est **`profil.plafond_tables`**, et lui
seul. La base porte maintenant un commentaire SQL « OBSOLETE » sur cette
colonne.

**Le palier ne se calcule pas côté front.** `profil.palier` le donne déjà
(`decouverte` / `confirme` / `expert`), déduit du plafond par la fonction
`palier_de_plafond()`. Une seule définition, en base — ne la recopie pas.

`records` contient aussi `points_total`, `points_semaine` et `jours_actifs_7j`.
Et depuis la migration 10, `records.plus_haute_table` désigne une table
**vraiment atteinte en Montée**, plus une case cochée dans un sélecteur.

### La grille de maîtrise

La grille est la pièce maîtresse. **Dimensionne-la sur `plafond_tables`**, pas
sur une taille fixe : un élève de Découverte voit 10×10, un Expert jusqu'à
20×20. Montrer 400 cases grises à un 6ᵉ, c'est lui montrer tout ce qu'il ne
sait pas.

⚠️ *À trancher* : `ALL_TABLES` s'arrête à 15 dans `logic/questions.js`, alors
que le plafond monte à 20 et qu'il existe un badge `climb_20`. Il faut aligner
— probablement étendre `ALL_TABLES` à 20. Signale-le si tu vois une raison de
faire autrement. Sous elle, un bouton **« Réviser mes
cases rouges »** qui lance une partie sur `mesTablesFaibles()`. C'est le fil
rouge du projet : la grille n'est pas un tableau décoratif, elle pilote
l'entraînement.

Changement d'avatar via `changerAvatar(emoji)`, liste fermée.

---

# CÔTÉ PROFESSEUR

## 11. Accueil prof

**« Lancer un défi » en très gros**, en haut. C'est ce qui sera utilisé
plusieurs fois par semaine ; ça doit être à **deux tapes** de l'accueil, jamais
enfoui dans un menu.

En dessous : « Ma classe », « Jouer » (les mêmes modes que les élèves), et
« Administration » **uniquement si** `quiSuisJe().admin` est vrai.

Plus la liste des défis récents avec leur taux de participation.

## 12. Mode classe — créer un défi

Trois choix : le mode (Sprint ou Contre-la-montre), les tables, la classe.
Puis `creerDefi()`.

Le sélecteur de classe vient de `listeClasses()` — les favorites en premier.
⚠️ **Un enseignant voit toutes les classes**, pas seulement les siennes. Les
favorites sont un raccourci d'affichage, pas une restriction.

## 13. Le code projeté

Un écran plein, fond navy, **le code en très grand** — lisible depuis le fond de
la salle. En dessous, « Saisissez ce code dans Défis », et le compteur de
participants qui monte.

C'est l'écran qu'on projette au vidéoprojecteur. Pense-le pour être vu à cinq
mètres, pas tenu dans la main.

## 14. Classement en direct

`classementDefi()` + `suivreDefi()` + `avancementDefi()`.
Bouton « Clore le défi ».

C'est le même écran que celui de l'élève, en version projetable. Mutualise si
tu peux.

## 15. Ma classe — la maîtrise agrégée

**⚠️ L'écran qui décide de l'adoption par tes collègues.** Soigne-le.

`maitriseClasse(classe)` renvoie, par table, le nombre d'élèves en vert, jaune,
rouge, et le taux de maîtrise. Affiche-le en barres horizontales, trié pour que
**ce qui coince saute aux yeux**.

Et surtout : un bouton **« Lancer un défi sur les tables 7 et 8 »** juste en
dessous, pré-rempli avec les tables les plus faibles.

Un professeur de mathématiques qui lit « 18 élèves sur 27 bloquent sur la table
de 7 » puis lance un défi ciblé **en une tape** a une raison concrète de rouvrir
l'outil la semaine suivante. Sans lui, l'application reste un jeu que les élèves
font chez eux — ou pas.

## 16. Le classement de la salle des profs

`classementProfs()`. **⚠️ Invisible pour les élèves** — le serveur ne renvoie
rien à un compte élève, mais ne mets pas non plus d'entrée de menu visible côté
élève.

Nom complet ici : entre adultes qui se connaissent, « M. D. » n'aurait pas de
sens.

Quand un prof joue, appelle `enregistrerSessionProf()` et non
`enregistrerSession()`. Même écran de jeu, seule la fonction d'enregistrement
change, selon ce qu'a répondu `quiSuisJe()`.

---

# ADMINISTRATION

Réservée aux comptes `admin`. Utilisée deux fois par an — sois fonctionnel,
pas spectaculaire.

## 17. Élèves

Liste avec recherche et filtre par classe. Pour chaque élève : nom, classe,
plafond, s'il s'est déjà connecté.

**Actions** : ajouter (`ajouterEleve`), corriger (`modifierEleve`), désactiver
(`desactiverEleve`, avec motif), réactiver (`reactiverEleve`).

**⚠️ Aucun bouton « Supprimer ».** Seulement « Désactiver ». Supprimer
effacerait les sessions en cascade : les classements de la classe changeraient
rétroactivement et les défis deviendraient incohérents.

**Import CSV** (`importerEleves`) — colonnes email, nom, prénom, classe.

⚠️ Le retour contient **deux listes à afficher, ne les avale pas** :
`lignes_ignorees` (lignes invalides, avec la raison) et
`actifs_absents_du_fichier`.

L'import ne désactive jamais personne. Affiche les absents et laisse
l'administrateur décider **au cas par cas**. Ne propose pas de désactivation en
masse en un clic : un export raté couperait l'accès à tout un niveau un lundi
matin.

**Suivi de rentrée** : `elevesSansConnexion()`, avec un bouton pour renvoyer un
code. C'est la question des deux premières semaines.

**Plafond par classe** : `definirPlafondClasse(classe, n)`. Une action pour
toute la classe.

## 18. Comptes enseignants

`listeProfs`, `creerProf`, `modifierProf`, `desactiverProf`.
Deux rôles : prof et admin. Aucune limite de nombre.

⚠️ Le serveur **refuse de retirer le dernier administrateur actif** —
rétrogradation comme désactivation. Relaie son message tel quel : il explique
quoi faire.

## 19. Journal

`journalAdmin()` — qui a fait quoi, quand. Une liste chronologique suffit.

Avec plusieurs enseignants ayant les droits, il faut pouvoir répondre à « qui a
désactivé cet élève ? ».

---

# Ordre de construction suggéré

1. **Démarrage + connexion + accueils** — sans ça, rien n'est testable
2. **Enregistrement des parties** — débloque d'un coup profil, records, badges,
   classements ; les quatre modes existent déjà
3. **Profil et classements** — beaucoup de valeur, peu d'effort, tout est prêt
4. **Défis à code** — le cœur de l'usage en classe
5. **Ma classe** — l'écran qui décide de l'adoption
6. **Administration** — indispensable mais peu utilisé
7. **Finitions** — hors-ligne, confettis, hooks

Après chaque étape, dis ce que tu as fait et ce que tu constates. Ne les
enchaîne pas sans t'arrêter.

---

# Ce qui vient après

Une **refonte visuelle** est prévue une fois l'application fonctionnelle et
testée. Elle sera indolore si tu as utilisé les variables CSS existantes, et
douloureuse sinon. C'est la seule contrainte de style qui compte vraiment.
