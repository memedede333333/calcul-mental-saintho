/**
 * Calcul Mental Saintho — Client API
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
        persistSession: true,      // la session survit au rechargement de page
        autoRefreshToken: true,    // ...et à une matinée de cours
        detectSessionInUrl: false, // on n'utilise pas les liens magiques
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
        return { ok: false, error: data.message, raison: data.raison, data };
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
 * AUTHENTIFICATION — code à 6 chiffres reçu par e-mail
 *
 * Surtout PAS de lien magique : sur iPad, le lien s'ouvre dans le
 * navigateur interne de l'app Mail, la session atterrit au mauvais
 * endroit, et l'élève reste déconnecté dans Safari sans comprendre
 * pourquoi. Le code voyage dans la tête de l'élève, aucun navigateur
 * ne peut se tromper.
 *
 * Côté Supabase, cela suppose que le modèle d'e-mail « Magic Link »
 * utilise {{ .Token }} et non {{ .ConfirmationURL }}. Voir
 * SUPABASE_PAS_A_PAS.md, partie 4.
 * ================================================================= */

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

export async function terminerDefi({ defiId, score, tempsS, erreurs = 0, detail = {}, maitrise = {} }) {
    return rpc('terminer_defi', {
        p_defi_id: defiId,
        p_score: score,
        p_temps_s: tempsS,
        p_erreurs: erreurs,
        p_detail: detail,
        p_maitrise: maitrise,
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
    demanderCode, verifierCode, seDeconnecter, sessionActive, quiSuisJe,
    // élève
    monProfil, mesTablesFaibles, changerAvatar,
    enregistrerSession, enregistrerSessionProf,
    // hors-ligne
    partiesEnAttente, viderFile, surFileChangee,
    // défis
    creerDefi, rejoindreDefi, terminerDefi,
    classementDefi, avancementDefi, suivreDefi,
    // classements
    classementProgression, classementRecords, classementClasses, classementProfs,
    // enseignant
    maitriseClasse, listeClasses, definirMesClasses,
    // administration
    importerEleves, ajouterEleve, modifierEleve,
    desactiverEleve, reactiverEleve, definirPlafondClasse, elevesSansConnexion,
    listeProfs, creerProf, modifierProf, desactiverProf, journalAdmin,
};

export default api;
