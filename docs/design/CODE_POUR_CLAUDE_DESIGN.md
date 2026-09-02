# matHo — le code actuel de l'application

Voici le code de l'application telle qu'elle tourne aujourd'hui. Tu ne l'avais
pas pour la premiere passe, et c'etait volontaire : je voulais que tu concoives
ce que ces ecrans DEVRAIENT etre, pas que tu redessines ce qu'ils sont. Cette
etape-la est faite. Maintenant tu en as besoin, pour trois raisons precises.

## Comment lire ce fichier

**1. `api.js` est le seul document qui dit la verite.** C'est le point de
passage unique vers le serveur : une quarantaine d'appels, et pour chacun,
exactement ce que la base renvoie. Si un chiffre n'est pas la, il n'existe pas
et aucun ecran ne peut l'afficher. Trois des chiffres de ta premiere passe
etaient dans ce cas.

**2. Les ecrans (`screens/`) sont un INVENTAIRE, pas un modele.** Ils te disent
ce qui existe : quels filtres, quels boutons, quels etats vides, quels messages
d'erreur, quels ecrans intermediaires. Ils ne te disent pas ce qui est bien.
La mise en page actuelle est laide et c'est pour ca qu'on te paie. **Une
horreur dans le code n'est jamais une contrainte.**

**3. Les composants (`components/`) sont exactement les pieces que tu
redessines** : le pave numerique, les cases de saisie, la grille de maitrise,
l'anneau du chronometre.

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
- **Portrait, tactile, 11 a 15 ans, salle de classe sous neon.**

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

    // — Palette Saintho —
    colors: {
        // Couleurs principales Saintho
        navyDeep: '#1B2A4A',   // Bleu marine profond (fond, texte)
        navyMid: '#2D4A7A',   // Bleu marine moyen
        gold: '#C9A227',   // Or/doré (accents premium)
        goldLight: '#E4C65A',   // Or clair
        ivory: '#FAF6EE',   // Ivoire (fond clair)
        ivoryWarm: '#F5EFE3',   // Ivoire chaud

        // Accents gamification
        coral: '#FF5A5F',   // Corail (action, erreur)
        coralDark: '#E04347',   // Corail foncé
        mint: '#00C9A7',   // Menthe (réussite)
        mintDark: '#00A88A',   // Menthe foncé
        sky: '#4DA8DA',   // Ciel (apprentissage)
        skyDark: '#3A8FBE',   // Ciel foncé
        purple: '#8B6FC0',   // Violet (indices, spécial)
        purpleDark: '#6F55A0',   // Violet foncé

        // Utilitaires
        surface: '#FFFFFF',
        surfaceAlt: '#F7F4F0',
        textPrimary: '#1B2A4A',
        textSecondary: '#6B7B9A',
        border: '#E8E2D8',
        shadow: 'rgba(27, 42, 74, 0.12)',
    },

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

    const goHome = useCallback(() => { setScreen('home'); setTablesADemarrer(null); }, []);

    // --- Navigation vers Practice avec des tables pré-sélectionnées ---
    // Utilisé par Profile → « Réviser mes cases rouges »
    const goPlayWithTables = useCallback((tables) => {
        setTablesADemarrer(tables);
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
                        background: 'linear-gradient(135deg, var(--navy), var(--navy-mid))',
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
                    onGo={setScreen}
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


## styles/index.css — le CSS actuel

`frontend/src/styles/index.css`

```css
/* ========================================================================
   matHo — Design System
   Palette Saintho premium : bleu marine, or, ivoire
   ======================================================================== */

/* ── Polices locales ──────────────────────────────────────────────────── */
/* Fichiers dans public/fonts/ — aucune requête vers fonts.googleapis.com
   ni fonts.gstatic.com. Les iPads MDM du collège filtrent ces domaines. */

@font-face {
  font-family: 'Baloo 2';
  font-style: normal;
  font-weight: 500 800;
  font-display: swap;
  src: url('/fonts/baloo2-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
    U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212,
    U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 400 800;
  font-display: swap;
  src: url('/fonts/nunito-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
    U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212,
    U+2215, U+FEFF, U+FFFD;
}

/* ── Reset & Base ─────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* Couleurs Saintho */
  --navy: #1B2A4A;
  --navy-mid: #2D4A7A;
  --navy-light: #3D5A8A;
  --gold: #C9A227;
  --gold-light: #E4C65A;
  --gold-glow: rgba(201, 162, 39, 0.25);
  --ivory: #FAF6EE;
  --ivory-warm: #F5EFE3;

  /* Accents gamification */
  --coral: #FF5A5F;
  --coral-dk: #E04347;
  --mint: #00C9A7;
  --mint-dk: #00A88A;
  --sky: #4DA8DA;
  --sky-dk: #3A8FBE;
  --purple: #8B6FC0;
  --purple-dk: #6F55A0;
  --sun: #F0B429;
  --sun-dk: #D69E1D;
  --gold-dk: #A8861F;
  --navy-dk: #101B33;

  /* Surfaces */
  --surface: #FFFFFF;
  --surface-alt: #F7F4F0;
  --surface-glass: rgba(255, 255, 255, 0.75);
  --border: #E8E2D8;
  --shadow: rgba(27, 42, 74, 0.10);
  --shadow-md: rgba(27, 42, 74, 0.14);
  --shadow-lg: rgba(27, 42, 74, 0.20);

  /* Texte */
  --text: #1B2A4A;
  --text-soft: #6B7B9A;
  --text-muted: #9AA5B8;

  /* Typo */
  --font-display: 'Baloo 2', system-ui, sans-serif;
  --font-body: 'Nunito', system-ui, sans-serif;

  /* Espacement & Rayons */
  --radius-sm: 12px;
  --radius-md: 18px;
  --radius-lg: 24px;
  --radius-xl: 32px;
  --radius-full: 999px;
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
}

body {
  font-family: var(--font-body);
  color: var(--text);
  background: linear-gradient(160deg, var(--ivory) 0%, var(--ivory-warm) 50%, #EDE6D8 100%);
  min-height: 100dvh;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Touch et iPad */
input, textarea, select, button { touch-action: manipulation; }
.game-zone { user-select: none; -webkit-user-select: none; touch-action: manipulation; }

/* ── Utilitaires de typo ──────────────────────────────────────────────── */
.font-display { font-family: var(--font-display); }
.font-body { font-family: var(--font-body); }

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
  border-radius: var(--radius-sm);
  object-fit: contain;
}

.app-header-monogram {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--navy), var(--navy-mid));
  color: var(--gold);
  font-family: var(--font-display);
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
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(20px, 6vw, 28px);
  line-height: 1.1;
  color: var(--navy);
  letter-spacing: -0.5px;
}

.app-baseline {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-soft);
  margin-top: 2px;
}

/* ── Cards ────────────────────────────────────────────────────────────── */
.card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 22px;
  box-shadow: 0 8px 32px var(--shadow), 0 2px 8px var(--shadow);
  border: 1px solid rgba(232, 226, 216, 0.5);
  backdrop-filter: blur(8px);
}

.card-glass {
  background: var(--surface-glass);
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
  border-radius: var(--radius-lg);
  padding: 22px 24px;
  margin-top: 14px;
  color: #fff;
  box-shadow: 0 8px 28px var(--shadow-md);
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

.mode-card:hover { transform: translateY(-3px); box-shadow: 0 12px 36px var(--shadow-lg); }
.mode-card:active { transform: translateY(0) scale(0.985); }

.mode-card--learn { background: linear-gradient(135deg, var(--sky), var(--sky-dk)); }
.mode-card--practice { background: linear-gradient(135deg, var(--coral), var(--coral-dk)); }
.mode-card--challenge { background: linear-gradient(135deg, var(--gold), var(--sun-dk)); }

.mode-card__emoji { font-size: 44px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)); }
.mode-card__title { font-family: var(--font-display); font-weight: 800; font-size: 24px; line-height: 1.1; }
.mode-card__desc { font-weight: 700; opacity: 0.92; font-size: 14px; margin-top: 3px; }

/* ── Buttons ──────────────────────────────────────────────────────────── */
.btn {
  font-family: var(--font-display);
  font-weight: 700;
  border: none;
  cursor: pointer;
  border-radius: var(--radius-md);
  padding: 14px 22px;
  font-size: 18px;
  color: #fff;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
  position: relative;
  overflow: hidden;
}

.btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(255,255,255,0.12) 0%, transparent 50%);
  pointer-events: none;
}

.btn:active { transform: scale(0.96); }
.btn:disabled { opacity: 0.45; cursor: default; }

.btn--coral { background: var(--coral); box-shadow: 0 6px 18px rgba(255, 90, 95, 0.35); }
.btn--mint { background: var(--mint); box-shadow: 0 6px 18px rgba(0, 201, 167, 0.32); }
.btn--sky { background: var(--sky); box-shadow: 0 6px 18px rgba(77, 168, 218, 0.32); }
.btn--purple { background: var(--purple); box-shadow: 0 6px 18px rgba(139, 111, 192, 0.32); }
.btn--gold { background: var(--gold); box-shadow: 0 6px 18px var(--gold-glow); }
.btn--navy { background: var(--navy); box-shadow: 0 6px 18px rgba(27, 42, 74, 0.32); }
.btn--ghost { background: var(--surface-alt); color: var(--text); box-shadow: none; }
.btn--ghost::after { display: none; }

.btn-back {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-soft);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  padding: 6px 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  transition: color 0.15s ease;
}

.btn-back:hover { color: var(--navy); }
.btn-back:active { transform: scale(0.96); }

/* ── Chips (table selectors) ──────────────────────────────────────────── */
.chips { display: flex; flex-wrap: wrap; gap: 10px; }

.chip {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
  width: 54px;
  height: 54px;
  border-radius: var(--radius-sm);
  border: 2px solid var(--border);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  transition: all 0.12s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chip:active { transform: scale(0.92); }

.chip--sky { background: var(--sky); border-color: var(--sky); color: #fff; }
.chip--coral { background: var(--coral); border-color: var(--coral); color: #fff; }
.chip--gold { background: var(--gold); border-color: var(--gold); color: #fff; }
.chip--navy { background: var(--navy); border-color: var(--navy); color: #fff; }
.chip--purple { background: var(--purple); border-color: var(--purple); color: #fff; }

/* ── Table rows (learn mode) ──────────────────────────────────────────── */
.table-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  border-radius: var(--radius-sm);
  background: var(--surface-alt);
  margin-bottom: 8px;
  cursor: pointer;
  font-family: var(--font-display);
  transition: all 0.12s ease;
}

.table-row:active { transform: scale(0.985); }
.table-row--focus { background: #E4F0FE; outline: 2px solid var(--sky); }
.table-row__expr { font-size: 20px; font-weight: 700; }
.table-row__result { font-size: 24px; font-weight: 800; color: var(--sky-dk); min-width: 54px; text-align: right; }
.table-row__hidden { color: var(--sky); }

/* ── Viz tabs ─────────────────────────────────────────────────────────── */
.viz-tabs { display: flex; gap: 6px; margin: 12px 0; }

.viz-tab {
  flex: 1;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13px;
  border: 2px solid var(--border);
  background: var(--surface);
  color: var(--text-soft);
  border-radius: var(--radius-sm);
  padding: 9px 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.viz-tab--active { background: var(--sky); border-color: var(--sky); color: #fff; }

/* ── CPA Visualizations ───────────────────────────────────────────────── */
/* Array (dots) */
.viz-array { display: grid; gap: 6px; justify-content: center; padding: 6px; }
.viz-dot {
  width: 16px; height: 16px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #7BC4F4, var(--sky-dk));
}

/* Groups */
.viz-groups { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; padding: 10px 0; }
.viz-group {
  display: flex; flex-wrap: wrap; gap: 5px;
  background: #EDF5FF;
  border: 2px dashed var(--sky);
  border-radius: var(--radius-sm);
  padding: 10px;
  justify-content: center;
}
.viz-group-item {
  width: 22px; height: 22px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--gold-light), var(--gold));
}

/* Bar model */
.viz-bar-wrap { padding: 10px 0; }
.viz-bar-row { display: flex; gap: 3px; margin-bottom: 6px; }
.viz-bar-cell {
  flex: 1; height: 36px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display); font-weight: 800; font-size: 14px; color: #fff;
}
.viz-bar-total {
  text-align: center; font-family: var(--font-display); font-weight: 800;
  font-size: 20px; color: var(--text); margin-top: 4px;
}

/* Skip counting */
.viz-skip { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; padding: 8px 0; }
.viz-skip-num {
  font-family: var(--font-display); font-weight: 800; font-size: 20px;
  width: 46px; height: 46px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--surface-alt);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease;
}
.viz-skip-num--hl { background: var(--sky); color: #fff; }

/* Commutative toggle */
.commutative-toggle {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-display); font-weight: 700; font-size: 15px;
  margin: 8px 0; color: var(--text-soft); cursor: pointer;
}
.commutative-toggle input { width: 18px; height: 18px; accent-color: var(--purple); }

/* Tips */
.tip-box {
  background: linear-gradient(135deg, #FFF8E1, #FFF3CD);
  border-left: 4px solid var(--gold);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  padding: 14px 18px;
  margin-top: 14px;
  font-weight: 700;
  font-size: 14px;
  line-height: 1.6;
}
.tip-box b { color: var(--sun-dk); }

/* ── Mastery Grid ─────────────────────────────────────────────────────── */
.mastery-grid {
  display: grid;
  grid-template-columns: 30px repeat(15, 1fr);
  gap: 2px;
  font-size: 10px;
  font-family: var(--font-display);
  font-weight: 700;
}

.mastery-grid-hdr {
  display: flex; align-items: center; justify-content: center;
  color: var(--text-soft); font-size: 10px;
}

.mastery-grid-cell {
  aspect-ratio: 1;
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  font-size: 8px;
  color: #fff;
  transition: background 0.3s ease;
}

/* ── Keypad ────────────────────────────────────────────────────────────── */
.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 16px;
}

.key {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 28px;
  border: none;
  cursor: pointer;
  border-radius: var(--radius-md);
  padding: 20px 0;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 4px 0 var(--border);
  transition: transform 0.06s ease, box-shadow 0.06s ease;
  min-height: 64px;
}

.key:active { transform: translateY(4px); box-shadow: 0 0px 0 var(--border); }

.key--go {
  background: var(--mint);
  color: #fff;
  box-shadow: 0 4px 0 var(--mint-dk);
}

.key--del {
  background: #FFE7DE;
  color: var(--coral-dk);
  box-shadow: 0 4px 0 #F6CFC2;
}

.key--hint {
  background: #F0E8FF;
  color: var(--purple);
  box-shadow: 0 4px 0 #D9CBF0;
  font-size: 20px;
}

/* ── Question display ─────────────────────────────────────────────────── */
.question-text {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(44px, 14vw, 68px);
  text-align: center;
  letter-spacing: -1px;
  color: var(--navy);
}

.answer-box {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 42px;
  text-align: center;
  min-height: 66px;
  line-height: 66px;
  border-radius: var(--radius-md);
  background: var(--surface-alt);
  margin-top: 6px;
  transition: background 0.15s ease, color 0.15s ease;
}

.answer-box--correct { background: #D1FAE5; color: var(--mint-dk); }
.answer-box--wrong { background: #FFE0E7; color: var(--coral-dk); }

/* ── Digit Boxes (modèle à cases) ──────────────────────────────────── */
.digit-boxes { margin-top: 10px; min-height: 60px; }

.digit-box {
  width: 52px; height: 58px;
  font-family: var(--font-display);
  font-weight: 800; font-size: 28px;
  text-align: center; line-height: 58px;
  border-radius: 12px;
  background: var(--surface-alt);
  border: 2.5px solid var(--border);
  color: var(--navy);
  transition: border-color 0.15s ease, background 0.15s ease;
}
.digit-box--active {
  border-color: var(--gold);
  box-shadow: 0 0 0 3px var(--gold-glow);
}
.digit-box--correct {
  background: #D1FAE5; border-color: var(--mint); color: var(--mint-dk);
}
.digit-box--wrong {
  background: #FFE0E7; border-color: var(--coral); color: var(--coral-dk);
}
.digit-box--reveal {
  background: #E8F5E9; border-color: var(--mint); color: var(--mint-dk);
}

/* Question timer bar (chrono par question) */
.question-timer {
  height: 4px; border-radius: 2px;
  background: var(--border); margin-top: 8px; overflow: hidden;
}
.question-timer__fill {
  display: block; height: 100%; border-radius: 2px;
  background: var(--gold);
  transition: width linear;
}
.question-timer__fill--warn { background: var(--coral); }

.caret {
  display: inline-block;
  width: 3px;
  height: 40px;
  vertical-align: -6px;
  background: var(--text-soft);
  margin-left: 2px;
  animation: blink 1s steps(1) infinite;
}

.hint-box {
  background: #F0E8FF;
  border-radius: var(--radius-sm);
  padding: 14px 18px;
  margin-top: 12px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
  color: var(--purple-dk);
  text-align: center;
  line-height: 1.6;
}

/* ── Pills / Tags ─────────────────────────────────────────────────────── */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 16px;
  padding: 8px 16px;
  border-radius: var(--radius-full);
  background: var(--surface);
  box-shadow: 0 2px 8px var(--shadow);
}

/* ── Progress bar ─────────────────────────────────────────────────────── */
.progress-bar {
  height: 10px;
  border-radius: 8px;
  background: var(--surface-alt);
  overflow: hidden;
}

.progress-bar__fill {
  display: block;
  height: 100%;
  border-radius: 8px;
  background: linear-gradient(90deg, var(--gold-light), var(--gold));
  transition: width 0.3s ease;
}

.progress-bar__fill--warn {
  background: linear-gradient(90deg, var(--coral), var(--coral-dk));
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
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 15px;
  color: var(--text);
}

.timer-ring--warn .timer-ring__text { color: var(--coral-dk); }
.timer-ring--warn circle.timer-ring__fg { stroke: var(--coral); }

/* ── Stats grid (résultats) ───────────────────────────────────────────── */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 18px 0;
}

.stat {
  background: var(--surface-alt);
  border-radius: var(--radius-md);
  padding: 16px 8px;
  text-align: center;
}

.stat__value {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 800;
  display: block;
}

.stat__label {
  font-weight: 700;
  font-size: 12px;
  color: var(--text-soft);
  margin-top: 4px;
}

/* ── Stars ─────────────────────────────────────────────────────────────── */
.stars { font-size: 48px; letter-spacing: 8px; text-align: center; }
.stars__filled { color: var(--gold); }
.stars__empty { color: var(--border); }

/* ── Streak badge ─────────────────────────────────────────────────────── */
.streak-badge {
  font-family: var(--font-display);
  font-weight: 800;
  transition: transform 0.2s ease;
}

.streak-badge--milestone { animation: streak-pop 0.5s ease; }

/* ── Feedback word ────────────────────────────────────────────────────── */
.feedback-word {
  font-family: var(--font-display);
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
  border: 3px solid var(--border);
  border-top-color: var(--gold);
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

.anim-pop { animation: pop 0.4s ease; }
.anim-shake { animation: shake 0.45s ease; }

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

```


## components/Keypad.jsx — le pave numerique

`frontend/src/components/Keypad.jsx`

```jsx
import React from 'react';

/**
 * Keypad — Pavé numérique custom optimisé iPad
 * Boutons ≥ 64px, pas de clavier natif iOS
 *
 * Dernière rangée : ⌫ · 0 (élargi sur 2 colonnes).
 * Pas de touche ✓ — la saisie à cases juge dès la dernière case remplie.
 */
export default function Keypad({ onPress, onDelete, disabled = false }) {
    return (
        <div className="keypad game-zone">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button
                    key={n}
                    className="key"
                    onClick={() => !disabled && onPress(String(n))}
                    disabled={disabled}
                >
                    {n}
                </button>
            ))}
            <button
                className="key key--del"
                onClick={() => !disabled && onDelete()}
                disabled={disabled}
            >
                ⌫
            </button>
            <button
                className="key key--zero"
                onClick={() => !disabled && onPress('0')}
                disabled={disabled}
                style={{ gridColumn: 'span 2' }}
            >
                0
            </button>
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
            }, 250);
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
            }, 250);
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
                <circle cx="28" cy="28" r={r} fill="none" stroke="#E8E2D8" strokeWidth="5" />
                <circle
                    className="timer-ring__fg"
                    cx="28" cy="28" r={r}
                    fill="none"
                    stroke="var(--sky)"
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

/**
 * MasteryGrid — Grille de maîtrise 15×15 (symétrique)
 * Rouge → Jaune → Vert, Gris = non testé
 */
export default function MasteryGrid({ mastery, tables, onClose }) {
    const range = tables || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="card" style={{ maxWidth: 460, width: '100%' }} onClick={e => e.stopPropagation()}>
                <h3 className="font-display" style={{ fontWeight: 800, fontSize: 20, marginBottom: 12 }}>
                    🗺 Grille de maîtrise
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
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 14, fontSize: 12, fontWeight: 700 }}>
                    <span>🔴 À revoir</span>
                    <span>🟡 En cours</span>
                    <span>🟢 Maîtrisé</span>
                    <span>⬜ Pas testé</span>
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


## screens/Home.jsx — l'accueil eleve et prof

`frontend/src/screens/Home.jsx`

```jsx
import React, { useState, useEffect } from 'react';
import { rejoindreDefi } from '../api';
import { lireDefiEnCours, sauvegarderDefiEnCours, effacerDefiEnCours } from '../logic/defiStorage';

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

    // ==================== ACCUEIL PROFESSEUR ====================
    if (estProf) {
        return (
            <div className="screen-enter">
                {/* Bienvenue prof */}
                <div className="card" style={{
                    marginBottom: 14, display: 'flex',
                    alignItems: 'center', gap: 14, padding: '16px 20px',
                }}>
                    <span style={{ fontSize: 36 }}>👨‍🏫</span>
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
                    <span className="mode-card__emoji">⚔️</span>
                    <span>
                        <div className="mode-card__title">Lancer un défi</div>
                        <div className="mode-card__desc">Sprint ou Contre-la-montre pour vos classes</div>
                    </span>
                </button>

                <button
                    className="btn btn--ghost"
                    style={{ fontSize: 13, padding: '8px 16px', marginTop: -4, marginBottom: 4 }}
                    onClick={() => onGo('mes-defis')}
                >
                    📋 Mes défis passés
                </button>

                <button className="mode-card mode-card--practice" onClick={() => onGo('play')}>
                    <span className="mode-card__emoji">🚀</span>
                    <span>
                        <div className="mode-card__title">S'entraîner</div>
                        <div className="mode-card__desc">Jouez vous aussi — Salle des profs</div>
                    </span>
                </button>

                <button className="mode-card" onClick={() => onGo('classe')} style={{
                    background: 'linear-gradient(135deg, var(--sky), var(--sky-dk))',
                }}>
                    <span className="mode-card__emoji">🗺</span>
                    <span>
                        <div className="mode-card__title">Ma classe</div>
                        <div className="mode-card__desc">Maîtrise agrégée — qui bloque, sur quoi</div>
                    </span>
                </button>

                <button className="mode-card mode-card--learn" onClick={() => onGo('leaderboards')}>
                    <span className="mode-card__emoji">🏆</span>
                    <span>
                        <div className="mode-card__title">Classements</div>
                        <div className="mode-card__desc">Progression, records, classes et Salle des profs</div>
                    </span>
                </button>

                {/* Accès rapides */}
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                    <button
                        className="btn btn--ghost"
                        style={{ flex: 1, fontSize: 15, padding: '12px 16px' }}
                        onClick={() => onGo('profile')}
                    >
                        👤 Profil
                    </button>
                    {estAdmin && (
                        <button
                            className="btn btn--ghost"
                            style={{ flex: 1, fontSize: 15, padding: '12px 16px' }}
                            onClick={() => onGo('admin')}
                        >
                            ⚙️ Administration
                        </button>
                    )}
                </div>

                <button
                    className="btn btn--ghost"
                    style={{
                        width: '100%', fontSize: 13, padding: '10px 16px',
                        color: 'var(--coral)', marginTop: 8,
                    }}
                    onClick={onLogout}
                >
                    Se déconnecter
                </button>
            </div>
        );
    }

    // ==================== ACCUEIL ÉLÈVE ====================
    return (
        <div className="screen-enter">
            {/* Bienvenue */}
            {profil && (
                <div className="card" style={{
                    marginBottom: 14, display: 'flex',
                    alignItems: 'center', gap: 14, padding: '16px 20px',
                }}>
                    <span style={{ fontSize: 36 }}>
                        {profil.avatar_emoji || '🎯'}
                    </span>
                    <div>
                        <p className="font-display" style={{
                            fontWeight: 800, fontSize: 18, lineHeight: 1.2,
                        }}>
                            Salut {profil.prenom || profil.nom || 'Champion'} !
                        </p>
                        <p style={{
                            fontSize: 13, color: 'var(--text-soft)', fontWeight: 700,
                        }}>
                            {profil.classe || ''} — Prêt pour les tables ?
                        </p>
                    </div>
                </div>
            )}

            {/* Erreur serveur si reprise impossible */}
            {erreurReprise && (
                <div className="card" style={{
                    marginBottom: 14, padding: '12px 16px',
                    background: 'rgba(255, 90, 95, 0.08)',
                    border: '1.5px solid var(--coral)',
                    borderRadius: 14, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    gap: 12,
                }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral-dk)', margin: 0 }}>
                        {erreurReprise}
                    </p>
                    <button
                        className="btn btn--ghost"
                        style={{ fontSize: 12, padding: '4px 8px', color: 'var(--text-soft)' }}
                        onClick={() => setErreurReprise(null)}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Bandeau discret de reprise de défi */}
            {!erreurReprise && defiEnCours && (
                <div className="card" style={{
                    marginBottom: 14, padding: '12px 16px',
                    background: 'rgba(201, 162, 39, 0.08)',
                    border: '1.5px solid var(--gold)',
                    borderRadius: 14, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    gap: 12,
                }}>
                    <div>
                        <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginBottom: 2 }}>
                            ⚔️ Tu as un défi en cours
                        </p>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', margin: 0 }}>
                            {defiEnCours.auteur_nom ? `Défi de ${defiEnCours.auteur_nom}` : 'Défi'} — code {defiEnCours.code}
                        </p>
                    </div>
                    <button
                        className="btn btn--gold"
                        style={{
                            fontSize: 13, padding: '8px 16px',
                            fontWeight: 800, flexShrink: 0,
                        }}
                        disabled={loadingReprise}
                        onClick={handleReprendre}
                    >
                        {loadingReprise ? '…' : 'Reprendre'}
                    </button>
                </div>
            )}

            {/* Cartes de mode */}
            <button className="mode-card mode-card--learn" onClick={() => onGo('learn')}>
                <span className="mode-card__emoji">📘</span>
                <span>
                    <div className="mode-card__title">Apprendre</div>
                    <div className="mode-card__desc">Groupes, tableaux, barres et astuces</div>
                </span>
            </button>

            <button className="mode-card mode-card--practice" onClick={() => onGo('play')}>
                <span className="mode-card__emoji">🚀</span>
                <span>
                    <div className="mode-card__title">S'entraîner</div>
                    <div className="mode-card__desc">Quiz adaptatif avec indices et maîtrise</div>
                </span>
            </button>

            <button className="mode-card mode-card--challenge" onClick={() => onGo('challenges')}>
                <span className="mode-card__emoji">⚔️</span>
                <span>
                    <div className="mode-card__title">Défis</div>
                    <div className="mode-card__desc">Défie tes camarades de classe !</div>
                </span>
            </button>

            {/* Accès rapides */}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button
                    className="btn btn--ghost"
                    style={{ flex: 1, fontSize: 15, padding: '12px 16px' }}
                    onClick={() => onGo('leaderboards')}
                >
                    🏆 Classements
                </button>
                <button
                    className="btn btn--ghost"
                    style={{ flex: 1, fontSize: 15, padding: '12px 16px' }}
                    onClick={() => onGo('profile')}
                >
                    👤 Profil
                </button>
            </div>
        </div>
    );
}

```


## screens/Practice.jsx — la partie en cours

`frontend/src/screens/Practice.jsx`

```jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ALL_TABLES, PRAISE, newQuestion, makeHint } from '../logic/questions';
import { updateMastery, buildWeights, construireErreurs, construireMaitrise, cleFait } from '../logic/mastery';
import { enregistrerSession, enregistrerSessionProf } from '../api';
import Keypad from '../components/Keypad';
import TimerRing from '../components/TimerRing';
import MasteryGrid from '../components/MasteryGrid';

/**
 * Practice — Mode S'entraîner complet
 * Phases : setup → quiz → results
 *
 * Modèle à cases (28/08) : autant de cases que de chiffres dans la
 * réponse. Dès que la dernière est remplie, le système juge.
 * En entraînement libre : pas de chrono par question, 3 tentatives max.
 */

const DEFAULT_TABLES = [2, 3, 4, 5];

export default function Practice({ onBack, identite, estProf, onPlafondChange, tablesInitiales, maitrise: maitriseProp }) {
    const [phase, setPhase] = useState(tablesInitiales?.length ? 'quiz' : 'setup');
    const [picked, setPicked] = useState(tablesInitiales?.length ? tablesInitiales : DEFAULT_TABLES);
    const [length, setLength] = useState(10);
    const [timer, setTimer] = useState(0);
    const [result, setResult] = useState(null);
    const [serverResult, setServerResult] = useState(null);
    const [showGrid, setShowGrid] = useState(false);
    const [mastery, setMastery] = useState(maitriseProp || {});

    // Sync quand la prop maitrise arrive/change
    useEffect(() => { if (maitriseProp) setMastery(maitriseProp); }, [maitriseProp]);

    const handleDone = useCallback((r) => {
        // r contient : { score, scorePremierEssai, answered, maxStreak, resultats, seconds, timerMode }
        const maitriseSortie = construireMaitrise(r.resultats);
        // Merge session mastery into local
        setMastery(prev => ({ ...prev, ...maitriseSortie }));
        setResult(r);
        setServerResult(null);
        setPhase('results');

        const mode = r.timerMode ? 'countdown' : 'libre';
        const erreurs = construireErreurs(r.resultats);

        const session = {
            mode,
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
                // Un enseignant n'a pas de plafond : le champ n'existe
                // que pour les élèves. Sans ce cas, la valeur de repli
                // le bloque à 10.
                const np = res.data?.plafond_tables;
                const currentPlafond = estProf ? 20 : (identite?.profil?.plafond_tables || 10);
                if (np && np !== currentPlafond) {
                    onPlafondChange?.(np);
                }
            } else {
                setServerResult({ erreur: res.error, enAttente: res.enAttente });
            }
        }).catch(() => {});
    }, [picked, estProf, identite, onPlafondChange]);

    const start = (tables, len) => {
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
                    picked={picked} setPicked={setPicked}
                    length={length} setLength={setLength}
                    timer={timer} setTimer={setTimer}
                    onStart={() => setPhase('quiz')}
                    onShowGrid={() => setShowGrid(true)}
                    plafond={estProf ? 20 : (identite?.profil?.plafond_tables || 10)}
                />
            </>
        );
    }

    if (phase === 'quiz') {
        return (
            <Quiz
                tables={picked.length ? picked : ALL_TABLES.slice(0, 10)}
                length={timer > 0 ? 0 : length}
                timer={timer}
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
            onReplay={() => { setServerResult(null); setPhase('quiz'); }}
            onReviewErrors={(tables) => start(tables, 10)}
            onHome={onBack}
            onSetup={() => setPhase('setup')}
        />
    );
}

/* ===================== SETUP ===================== */

function Setup({ onBack, picked, setPicked, length, setLength, timer, setTimer, onStart, onShowGrid, plafond }) {
    const unlocked = ALL_TABLES.filter(t => t <= plafond);
    const toggle = (t) => {
        if (t > plafond) return;
        setPicked(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
    };
    const allUnlocked = unlocked.every(t => picked.includes(t));
    const timerOn = timer > 0;
    const hasLocked = ALL_TABLES.some(t => t > plafond);

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            {/* Sélection des tables */}
            <div className="card">
                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800 }}>Choisis tes tables</h2>
                <div className="chips" style={{ margin: '14px 0' }}>
                    {ALL_TABLES.map(t => {
                        const locked = t > plafond;
                        return (
                            <button
                                key={t}
                                className={`chip${picked.includes(t) ? ' chip--coral' : ''}`}
                                style={{
                                    opacity: locked ? 0.4 : 1,
                                    cursor: locked ? 'not-allowed' : 'pointer',
                                }}
                                onClick={() => toggle(t)}
                                title={locked ? 'Débloque en Montée des tables' : ''}
                            >
                                {locked ? `🔒 ${t}` : t}
                            </button>
                        );
                    })}
                </div>
                <button
                    className="btn btn--ghost"
                    style={{ fontSize: 15, padding: '10px 16px' }}
                    onClick={() => setPicked(allUnlocked ? [] : [...unlocked])}
                >
                    {allUnlocked ? 'Tout décocher' : 'Tout choisir'}
                </button>
                {hasLocked && (
                    <p style={{
                        textAlign: 'center', fontSize: 13, color: 'var(--text-soft)',
                        fontWeight: 600, marginTop: 8,
                    }}>
                        Débloque les tables suivantes avec la Montée des tables 🧗
                    </p>
                )}
            </div>

            {/* Nombre de questions */}
            <div className="card" style={{ marginTop: 14 }}>
                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
                    Combien de questions ?
                </h2>
                <div style={{ display: 'flex', gap: 10, opacity: timerOn ? 0.35 : 1, pointerEvents: timerOn ? 'none' : 'auto' }}>
                    {[{ v: 10, l: '10' }, { v: 20, l: '20' }, { v: 40, l: '40' }, { v: 0, l: '∞' }].map(o => (
                        <button
                            key={o.v}
                            onClick={() => setLength(o.v)}
                            className={`chip${length === o.v && !timerOn ? ' chip--coral' : ''}`}
                            style={{ flex: 1, width: 'auto' }}
                        >
                            {o.l}
                        </button>
                    ))}
                </div>
                {timerOn && (
                    <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-soft)', marginTop: 8 }}>
                        Le chrono remplace le nombre de questions
                    </p>
                )}
            </div>

            {/* Chrono */}
            <div className="card" style={{ marginTop: 14 }}>
                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
                    ⏱ Chrono
                </h2>
                <div style={{ display: 'flex', gap: 10 }}>
                    {[{ v: 0, l: 'Non' }, { v: 60, l: '1 min' }, { v: 120, l: '2 min' }, { v: 180, l: '3 min' }].map(o => (
                        <button
                            key={o.v}
                            onClick={() => setTimer(o.v)}
                            className={`chip${timer === o.v ? ' chip--coral' : ''}`}
                            style={{ flex: 1, width: 'auto', fontSize: 16 }}
                        >
                            {o.l}
                        </button>
                    ))}
                </div>
            </div>

            {/* Boutons Go + Grille */}
            <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
                <button
                    className="btn btn--coral"
                    style={{ flex: 1, fontSize: 22, padding: 16 }}
                    disabled={picked.length === 0}
                    onClick={onStart}
                >
                    C'est parti ! 🚀
                </button>
                <button
                    className="btn btn--purple"
                    style={{ padding: '16px 18px', fontSize: 20 }}
                    onClick={onShowGrid}
                    title="Grille de maîtrise"
                >
                    🗺
                </button>
            </div>
            {picked.length === 0 && (
                <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-soft)', marginTop: 8 }}>
                    Choisis au moins une table.
                </p>
            )}
        </div>
    );
}

/* ===================== QUIZ — Modèle à cases ===================== */

function Quiz({ tables, length, timer, mastery, onQuit, onDone }) {
    const weights = useMemo(() => buildWeights(tables, mastery), [tables, mastery]);

    const [sessionWeights, setSessionWeights] = useState(weights);
    const [q, setQ] = useState(() => newQuestion(tables, null, weights));
    const [digits, setDigits] = useState(() => Array(String(q.answer).length).fill(''));
    const [answered, setAnswered] = useState(0);
    const [score, setScore] = useState(0);
    const [scorePremierEssai, setScorePremierEssai] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const [remaining, setRemaining] = useState(timer);
    const [showHint, setShowHint] = useState(false);

    // Per-question state
    const [premierEssai, setPremierEssai] = useState(true);
    const [attempts, setAttempts] = useState(0);
    const [responseStart, setResponseStart] = useState(null); // temps après 1ère touche

    const lockRef = useRef(false);
    const resultatsRef = useRef([]); // { a, b, result: 'premier'|'rattrape'|'jamais' }
    const startRef = useRef(Date.now());
    // Les compteurs vivent dans des refs, pas seulement dans l'état.
    // Une closure capturée par un setTimeout lit l'état du rendu
    // précédent : à la dernière question, le score partirait
    // amputé d'une unité. C'est arrivé, ne le refais pas.
    const scoreRef = useRef(0);
    const scorePremierRef = useRef(0);
    const answeredRef = useRef(0);
    const maxStreakRef = useRef(0);
    const streakRef = useRef(0);
    const timedOut = useRef(false);
    const endless = length === 0;
    const hasTimer = timer > 0;
    const numDigits = String(q.answer).length;

    // Global timer countdown
    useEffect(() => {
        if (!hasTimer) return;
        const id = setInterval(() => {
            setRemaining(r => {
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
                                seconds: timer, timerMode: true
                            });
                        }, 0);
                    }
                    return 0;
                }
                return r - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [hasTimer, timer, onDone]);

    const finish = useCallback(() => {
        onDone({
            score: scoreRef.current, scorePremierEssai: scorePremierRef.current,
            answered: endless ? answeredRef.current : length,
            maxStreak: maxStreakRef.current,
            resultats: resultatsRef.current,
            seconds: Math.round((Date.now() - startRef.current) / 1000), timerMode: hasTimer
        });
    }, [length, endless, hasTimer, onDone]);

    // Advance to next question
    const nextQuestion = useCallback(() => {
        lockRef.current = false;
        setFb('idle'); setWord(''); setShowHint(false);
        setPremierEssai(true); setAttempts(0); setResponseStart(null);
        const newQ = newQuestion(tables, q, sessionWeights);
        setQ(newQ);
        setDigits(Array(String(newQ.answer).length).fill(''));
    }, [tables, q, sessionWeights]);

    // Record result and move on
    const recordAndAdvance = useCallback((result) => {
        // Refs d'abord — toujours à jour pour onDone dans le setTimeout
        resultatsRef.current.push({ a: q.a, b: q.b, result });
        answeredRef.current += 1;
        setAnswered(a => a + 1);

        if (result === 'premier') {
            scoreRef.current += 1;
            scorePremierRef.current += 1;
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

        // Update session weights
        const key = cleFait(q.a, q.b);
        setSessionWeights(w => ({
            ...w,
            [key]: Math.min((w[key] || 1) + (result === 'jamais' ? 4 : result === 'rattrape' ? 2 : 0), 8)
        }));

        const delay = result === 'premier' ? 400 : result === 'rattrape' ? 600 : 800;

        setTimeout(() => {
            if (timedOut.current) return;
            if (!endless && answeredRef.current >= length) {
                onDone({
                    score: scoreRef.current,
                    scorePremierEssai: scorePremierRef.current,
                    answered: length,
                    maxStreak: maxStreakRef.current,
                    resultats: resultatsRef.current,
                    seconds: Math.round((Date.now() - startRef.current) / 1000), timerMode: hasTimer
                });
            } else {
                nextQuestion();
            }
        }, delay);
    }, [q, endless, length, hasTimer, onDone, nextQuestion]);

    // When digit boxes are complete (last digit filled)
    const handleComplete = useCallback((value) => {
        if (lockRef.current || timedOut.current) return;
        const ok = value === q.answer;
        const att = attempts + 1;
        setAttempts(att);

        if (ok) {
            lockRef.current = true;
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            // Show response time in libre mode
            if (!hasTimer && responseStart) {
                const dt = ((Date.now() - responseStart) / 1000).toFixed(1);
                setWord(`✓ ${dt} s`);
            }
            const result = premierEssai ? 'premier' : 'rattrape';
            recordAndAdvance(result);
        } else {
            // Wrong
            setPremierEssai(false);
            setFb('wrong');

            // En entraînement libre : après 3 tentatives, montrer la réponse
            if (!hasTimer && att >= 3) {
                lockRef.current = true;
                setWord(`${q.a} × ${q.b} = ${q.answer}`);
                // Show answer in the boxes
                setTimeout(() => {
                    setFb('reveal');
                    setDigits(String(q.answer).split(''));
                }, 300);
                setTimeout(() => {
                    recordAndAdvance('jamais');
                }, 1800); // 300ms shake + 1500ms reveal
                return;
            }

            // Reset boxes after shake
            setTimeout(() => {
                setFb('idle');
                setWord('');
                setDigits(Array(numDigits).fill(''));
            }, 300);
        }
    }, [q, attempts, premierEssai, hasTimer, responseStart, numDigits, recordAndAdvance]);

    // Digit input handlers
    const press = useCallback((d) => {
        if (lockRef.current || (fb !== 'idle')) return;
        setDigits(prev => {
            const idx = prev.findIndex(x => x === '');
            if (idx === -1) return prev;
            // First key → record start time
            if (idx === 0 && prev.every(x => x === '')) {
                setResponseStart(Date.now());
            }
            const next = [...prev];
            next[idx] = d;
            // Last digit filled → trigger completion
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

    // Physical keyboard
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

    const pct = endless ? 0 : (answered / length) * 100;
    const timerPct = hasTimer ? remaining / timer : 1;
    const timerWarn = hasTimer && remaining <= 10;
    const streakMilestone = [10, 20, 30, 50, 100].includes(streak) && fb === 'correct';

    const activeIndex = digits.findIndex(d => d === '');

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>

            {/* Barre de stats */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="pill">⭐ {score}</span>
                <span className={`pill streak-badge${streakMilestone ? ' streak-badge--milestone' : ''}`}
                    style={streak >= 10 ? { background: 'linear-gradient(135deg, var(--gold-light), var(--gold))', color: '#fff' } : undefined}
                >
                    🔥 {streak}
                </span>
                {hasTimer ? (
                    <TimerRing seconds={remaining} total={timer} warn={timerWarn} />
                ) : (
                    <span className="pill">{endless ? `# ${answered}` : `${answered}/${length}`}</span>
                )}
            </div>

            {/* Barre de progression */}
            {!endless && !hasTimer && (
                <div className="progress-bar" style={{ marginBottom: 16 }}>
                    <i className="progress-bar__fill" style={{ width: `${pct}%` }} />
                </div>
            )}
            {hasTimer && (
                <div className="progress-bar" style={{ marginBottom: 16 }}>
                    <i
                        className={`progress-bar__fill${timerWarn ? ' progress-bar__fill--warn' : ''}`}
                        style={{ width: `${timerPct * 100}%`, transition: 'width 1s linear' }}
                    />
                </div>
            )}

            {/* Question + Cases */}
            <div className={`card${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>

                {/* Digit boxes */}
                <div className="digit-boxes" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
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

                <div
                    className="feedback-word"
                    style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}
                >
                    {word}
                </div>
                {showHint && fb === 'idle' && (
                    <div className="hint-box">💡 {makeHint(q.a, q.b)}</div>
                )}
            </div>

            {/* Pavé numérique */}
            <Keypad
                onPress={press}
                onDelete={del}
                disabled={lockRef.current}
            />

            {/* Boutons sous le pavé */}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                {!showHint && fb === 'idle' && (
                    <button
                        className="btn btn--ghost"
                        style={{ flex: 1, fontSize: 15 }}
                        onClick={() => setShowHint(true)}
                    >
                        💡 Indice
                    </button>
                )}
                {endless && !hasTimer && (
                    <button className="btn btn--ghost" style={{ flex: 1 }} onClick={finish}>
                        Terminer
                    </button>
                )}
            </div>
        </div>
    );
}

/* ===================== RESULTS ===================== */

function Results({ result, serverResult, onReplay, onReviewErrors, onHome, onSetup }) {
    if (!result) return null;
    const { score, scorePremierEssai, answered, maxStreak, resultats, seconds, timerMode } = result;
    const rattrapees = score - (scorePremierEssai || 0);
    const pct = answered ? Math.round(((scorePremierEssai || score) / answered) * 100) : 0;
    const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 50 ? 1 : 0;
    const msg = stars === 3 ? 'Champion des tables ! 🏆'
        : stars === 2 ? 'Très bien joué !'
            : stars === 1 ? 'Bon début, continue !'
                : 'On retente ? Tu vas y arriver !';

    // Tables à revoir (tout ce qui n'est pas premier coup)
    const wrongTables = [...new Set(
        (resultats || []).filter(r => r.result !== 'premier').map(r => r.a)
    )].sort((a, b) => a - b);

    // Erreurs détaillées pour affichage
    const erreurs = (resultats || []).filter(r => r.result === 'jamais');

    const badges = serverResult?.nouveaux_badges || [];
    const enAttente = serverResult?.enAttente;

    useEffect(() => {
        if (pct >= 70) {
            import('canvas-confetti').then(mod => {
                const fire = mod.default;
                fire({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#C9A227', '#4DA8DA', '#00C9A7', '#FF5A5F'] });
            }).catch(() => { });
        }
    }, [pct]);

    return (
        <div className="screen-enter">
            <div className="card" style={{ textAlign: 'center' }}>
                {/* Étoiles */}
                <div className="stars">
                    {'★'.repeat(stars).padEnd(3, '☆').split('').map((s, i) => (
                        <span key={i} className={s === '★' ? 'stars__filled' : 'stars__empty'}>{s}</span>
                    ))}
                </div>

                <h2 className="font-display" style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>{msg}</h2>

                {/* Deux chiffres — premier coup + rattrapées */}
                <div style={{
                    background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)',
                    padding: '16px 12px', margin: '14px 0',
                }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--mint-dk)' }}>
                        {scorePremierEssai ?? score} / {answered}
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

                {/* Stats */}
                <div className="stat-grid">
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--coral)' }}>{maxStreak}</span>
                        <span className="stat__label">Meilleure série</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>
                            {timerMode
                                ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
                                : `${seconds}s`}
                        </span>
                        <span className="stat__label">{timerMode ? 'Chrono' : 'Temps total'}</span>
                    </div>
                </div>

                {/* Moyenne par question */}
                {answered > 0 && (
                    <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-soft)', marginBottom: 14 }}>
                        ⚡ {(seconds / answered).toFixed(1)}s par question en moyenne
                    </p>
                )}

                {/* Erreurs à revoir */}
                {erreurs.length > 0 && (
                    <div style={{
                        textAlign: 'left', background: 'var(--surface-alt)',
                        borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16
                    }}>
                        <p className="font-display" style={{ fontWeight: 800, marginBottom: 8 }}>Jamais trouvées :</p>
                        {erreurs.map((e, i) => (
                            <div key={i} style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                                {e.a} × {e.b} = <b style={{ color: 'var(--mint-dk)' }}>{e.a * e.b}</b>
                            </div>
                        ))}
                    </div>
                )}

                {/* Badges débloqués */}
                {badges.length > 0 && (
                    <div style={{
                        textAlign: 'center', background: 'linear-gradient(135deg, #FFF8E1, #FFF0C0)',
                        borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16,
                        border: '2px solid var(--gold)',
                    }}>
                        <p className="font-display" style={{ fontWeight: 800, marginBottom: 8, color: 'var(--gold)' }}>
                            🏅 Nouveau{badges.length > 1 ? 'x' : ''} badge{badges.length > 1 ? 's' : ''} !
                        </p>
                        {badges.map((b, i) => (
                            <div key={i} className="anim-pop" style={{
                                fontSize: 18, fontWeight: 700, marginBottom: 4,
                            }}>
                                {b.emoji || '🏅'} {b.nom || b}
                            </div>
                        ))}
                    </div>
                )}

                {/* Partie sauvegardée hors-ligne */}
                {enAttente && (
                    <p style={{
                        fontSize: 13, color: 'var(--text-soft)', fontWeight: 600,
                        textAlign: 'center', marginBottom: 14,
                    }}>
                        📡 Résultat en attente d'envoi — il partira dès que le réseau sera de retour.
                    </p>
                )}

                {/* Boutons d'action */}
                <button className="btn btn--mint" style={{ width: '100%', marginBottom: 10 }} onClick={onReplay}>
                    Rejouer 🔄
                </button>
                {wrongTables.length > 0 && (
                    <button
                        className="btn btn--coral"
                        style={{ width: '100%', marginBottom: 10 }}
                        onClick={() => onReviewErrors(wrongTables)}
                    >
                        Réviser mes erreurs ({wrongTables.join(', ')})
                    </button>
                )}
                <button className="btn btn--ghost" style={{ width: '100%', marginBottom: 10 }} onClick={onSetup}>
                    Changer de tables
                </button>
                <button className="btn-back" style={{ marginTop: 4 }} onClick={onHome}>‹ Accueil</button>
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
                        style={{ fontSize: 13, padding: '4px 12px', color: 'var(--text-soft)' }}
                        onClick={() => onGo?.('mes-defis')}
                    >
                        📋 Mes défis passés
                    </button>
                </div>
            </div>

            {CHALLENGE_TYPES.map(type => (
                <button
                    key={type.id}
                    className="mode-card"
                    style={{
                        background: `linear-gradient(135deg, var(${type.color}), var(${type.color}-dk))`,
                        marginTop: 10,
                    }}
                    onClick={() => onSelect(type)}
                >
                    <span className="mode-card__emoji">{type.emoji}</span>
                    <span>
                        <div className="mode-card__title" style={{ fontSize: 20 }}>
                            {type.name}
                            {type.shareable && (
                                <span style={{
                                    fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.3)',
                                    borderRadius: 8, padding: '2px 8px', marginLeft: 8, verticalAlign: 'middle',
                                }}>
                                    👥 En défi
                                </span>
                            )}
                        </div>
                        <div className="mode-card__desc">{type.desc}</div>
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
                <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                    📋 Règles
                </h3>
                {type.id === 'sprint' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>20 questions, 3s par question</li>
                        <li>1er essai = 1 pt, rattrapé = ½ pt</li>
                        <li>⚡ Le plus rapide gagne — chaque erreur ajoute 3 secondes</li>
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
                        🏫 Classe du défi
                    </h3>
                    <div className="chips">
                        {classes.map(c => (
                            <button
                                key={c.classe}
                                className={`chip${selectedClasse === c.classe ? ' chip--navy' : ''}`}
                                onClick={() => setSelectedClasse(c.classe)}
                            >
                                {c.classe}{c.est_favorite ? ' ⭐' : ''}
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
        <div className="digit-boxes" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
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
            setTimeout(advanceOrDone, 400);
        } else {
            setPremierEssai(false);
            setFb('wrong');
            setTimeout(() => {
                setFb('idle'); setWord('');
                setDigits(Array(numDigits).fill(''));
            }, 300);
        }
    }, [digits]);

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="pill">{isDefi ? '⚔️ Défi' : '⚡ Sprint'}</span>
                <span className="pill">{answered}/{total}</span>
                <span className="pill">⭐ {score}</span>
            </div>
            <div className="progress-bar" style={{ marginBottom: 16 }}>
                <i className="progress-bar__fill" style={{ width: `${(answered / total) * 100}%` }} />
            </div>
            <div className={`card${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
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
            }, 400);
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
                    background: 'linear-gradient(135deg, var(--gold-light), var(--gold))',
                    color: '#fff', fontSize: 20, padding: '8px 28px',
                }}>
                    🔥 {streak}
                </span>
            </div>
            <div className={`card${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
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
            setTimeout(advanceQuestion, 250);
        } else {
            setPremierEssai(false);
            setFb('wrong');
            setTimeout(() => {
                setFb('idle'); setWord('');
                setDigits(Array(numDigits).fill(''));
            }, 300);
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
            <div className={`card${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
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
                    setLevelMsg(`Table ${nextTable} ! 🧗`);
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

        const delay = result === 'premier' ? 400 : 800;
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
            }, 300);
        }
    }, [digits]);

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="pill" style={{ background: 'var(--purple)', color: '#fff' }}>
                    🧗 Table {currentTable}
                </span>
                <span className="pill">{questionsInLevel}/5</span>
                <span className="pill" style={{ color: 'var(--mint-dk)' }}>✅ {correctInLevel}</span>
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

            <div className={`card${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
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
                mod.default({
                    particleCount: 100, spread: 70, origin: { y: 0.6 },
                    colors: ['#C9A227', '#4DA8DA', '#00C9A7', '#FF5A5F']
                });
            }).catch(() => { });
        }
    }, [isSuccess]);

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
                        {result.scorePremierEssai ?? result.score} / {result.answered}
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
                        textAlign: 'center', background: 'linear-gradient(135deg, #FFF8E1, #FFF0C0)',
                        borderRadius: 'var(--radius-md)', padding: 16, marginTop: 16, marginBottom: 16,
                        border: '2px solid var(--gold)',
                    }}>
                        <p className="font-display" style={{ fontWeight: 800, marginBottom: 8, color: 'var(--gold)' }}>
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
                        textAlign: 'center', background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)',
                        borderRadius: 'var(--radius-md)', padding: 16, marginTop: 16, marginBottom: 16,
                        border: '2px solid var(--mint)',
                    }}>
                        <p className="font-display" style={{ fontWeight: 800, fontSize: 20, color: 'var(--mint-dk)' }}>
                            🔓 Table {nouveauPlafond} débloquée !
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
                        📡 Résultat en attente d'envoi — il partira dès que le réseau sera de retour.
                    </p>
                )}

                <button className="btn btn--gold" style={{ width: '100%', marginTop: 16, marginBottom: 10 }} onClick={onReplay}>
                    Relancer ⚔️
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
                background: 'linear-gradient(135deg, var(--navy), var(--navy-dk))',
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
                    <span style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>
                        👥 {nbParticipants}
                    </span>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: 14, marginTop: 4 }}>
                        participant{nbParticipants !== 1 ? 's' : ''} {nbParticipants > 0 ? '' : 'pour le moment'}
                    </p>
                </div>
            </div>

            <button
                className="btn btn--gold"
                style={{ width: '100%', maxWidth: 500, fontSize: 20, padding: 16, marginTop: 20 }}
                onClick={onStart}
            >
                📊 Voir le classement
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
                    ? 'linear-gradient(135deg, var(--sky), var(--sky-dk))'
                    : 'linear-gradient(135deg, var(--gold), var(--gold-dk, #8a6d10))',
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
                        fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 8,
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
                                ? 'rgba(77,168,218,0.12)' : 'rgba(201,162,39,0.12)',
                            color: origine === 'prof'
                                ? 'var(--sky-dk)' : 'var(--gold-dk, #8a6d10)',
                        }}>
                            {origine === 'prof' ? '📚 Travail de classe' : '🎮 Défi amical'}
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
                                <span style={{ fontSize: 20 }}>{entry.avatar || '🎯'}</span>
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
    { id: 'progression', label: '📈 Progression' },
    { id: 'records', label: '🏆 Records' },
    { id: 'classes', label: '🏫 Classes' },
];

const RECORD_CATS = [
    { id: 'serie', label: '🔥 Série', unit: 'sans faute' },
    { id: 'chrono', label: '⏱ Chrono', unit: 'pts / 2 min' },
    { id: 'sprint', label: '🏃 Sprint', unit: 's' },
    { id: 'montee', label: '🧗 Montée', unit: 'table' },
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
    { id: 'decouverte', label: '🌱 Découverte' },
    { id: 'confirme', label: '⭐ Confirmé' },
    { id: 'expert', label: '🏆 Expert' },
    { id: 'tous', label: '🌟 Tous' },
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
            ? [{ id: 'classes', label: '🏫 Classes' },
               { id: 'profs',   label: '🎓 Salle des profs' }]
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
                            avatar: '🏫',
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
                <h1 className="font-display" style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)' }}>
                    🏆 Classements
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
                    <p style={{ fontSize: 40, marginBottom: 8 }}>🏜</p>
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
                        <p style={{ fontSize: 40, marginBottom: 8 }}>🏜</p>
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
                            💡 Le classement repart à zéro chaque lundi — tout le monde a sa chance.
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
    const colors = { 1: 'var(--gold)', 2: '#B0B0B0', 3: '#CD7F32' };

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
                background: `linear-gradient(to top, ${colors[position]}, ${colors[position]}44)`,
                borderRadius: '12px 12px 0 0',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                marginTop: 6,
            }}>
                <span style={{ fontSize: 24 }}>{medals[position]}</span>
                <span className="font-display" style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>
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
            borderBottom: isLast ? 'none' : '1px solid var(--border)',
            background: estMoi
                ? 'linear-gradient(135deg, rgba(201,162,39,0.12), rgba(201,162,39,0.05))'
                : index < 3 ? 'rgba(201, 162, 39, 0.04)' : 'transparent',
            borderRadius: estMoi || index < 3 ? 8 : 0,
            border: estMoi ? '2px solid var(--gold)' : 'none',
        }}>
            <span className="font-display" style={{
                fontWeight: 800, fontSize: 18, width: 28, textAlign: 'center',
                color: index === 0 ? 'var(--gold)' : index === 1 ? '#A0A0A0' : index === 2 ? '#CD7F32' : 'var(--text-soft)',
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
                <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)' }}>
                    🗺 Ma classe
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
                                ? 'var(--navy)' : 'var(--bg-card)',
                            color: selectedClasse === c.classe ? '#fff' : 'var(--text)',
                            border: selectedClasse === c.classe
                                ? '2px solid var(--navy)' : '2px solid var(--border)',
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
                            ⚔️ Lancer un défi sur {tablesDefi.length === 1 ? 'la table' : 'les tables'} {tablesDefi.join(', ')}
                        </button>
                    ) : rienNeCoince ? (
                        <div className="card" style={{
                            padding: '14px 18px', marginTop: 8,
                            background: 'rgba(0, 201, 167, 0.08)',
                            border: '2px solid var(--mint)',
                            borderRadius: 14, textAlign: 'center',
                        }}>
                            <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>
                                ✅ Rien ne coince dans cette classe.
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
                            🔍 Découvrir les tables {tablesDecouverte.join(', ')}
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
                {!dansPlafond && <span style={{ fontSize: 10 }}> 🔒</span>}
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
    sprint: { emoji: '⚡', label: 'Sprint' },
    countdown: { emoji: '⏱', label: 'Contre-la-montre' },
    flawless: { emoji: '🎯', label: 'Sans faute' },
    climb: { emoji: '🧗', label: 'Montée' },
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
                <div style={{ fontSize: 40 }}>📋</div>
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
                    <p style={{ fontSize: 40, marginBottom: 8 }}>🏜</p>
                    <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                        Aucun défi créé pour le moment.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {defis.map(d => {
                        const typeInfo = TYPE_LABELS[d.type] || { emoji: '❓', label: d.type };
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
                                    <span>{typeInfo.emoji} {typeInfo.label}</span>
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
                                            ? 'rgba(77,168,218,0.12)' : 'rgba(201,162,39,0.12)',
                                        color: d.origine === 'prof'
                                            ? 'var(--sky-dk)' : 'var(--gold-dk, #8a6d10)',
                                    }}>
                                        {d.origine === 'prof' ? '📚 Travail de classe' : '🎮 Défi amical'}
                                    </span>
                                    {d.auteur_nom && (
                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)', marginLeft: 6 }}>
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


## screens/Profile.jsx — profil, badges, avatar

`frontend/src/screens/Profile.jsx`

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { monProfil, monProfilProf, mesTablesFaibles, changerAvatar, listeClasses, definirMesClasses } from '../api';
import { masteryColor, cleFait } from '../logic/mastery';

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
                            style={{ fontSize: 15, padding: '10px 24px' }}
                            onClick={() => onGo?.('play')}
                        >
                            🚀 S'entraîner
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="stat-grid" style={{ marginBottom: 14 }}>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--mint-dk)' }}>
                                    {records?.points_total || 0}
                                </span>
                                <span className="stat__label">
                                    💰 Points total {records?.points_semaine > 0 ? `(+${records.points_semaine} 7j)` : ''}
                                </span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--navy)' }}>
                                    {records?.nb_sessions || 0}
                                </span>
                                <span className="stat__label">📊 Parties jouées</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--coral)' }}>
                                    {records?.meilleure_serie || 0}
                                </span>
                                <span className="stat__label">🔥 Meilleure série</span>
                            </div>
                            {records?.meilleur_sprint > 0 && (
                                <div className="stat">
                                    <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>
                                        {records.meilleur_sprint}s
                                    </span>
                                    <span className="stat__label">⚡ Meilleur sprint</span>
                                </div>
                            )}
                            {records?.meilleur_chrono > 0 && (
                                <div className="stat">
                                    <span className="stat__value" style={{ color: 'var(--gold)' }}>
                                        {records.meilleur_chrono}
                                    </span>
                                    <span className="stat__label">⏱️ Meilleur chrono</span>
                                </div>
                            )}
                            {records?.plus_haute_table > 0 && (
                                <div className="stat">
                                    <span className="stat__value" style={{ color: 'var(--purple)' }}>
                                        {records.plus_haute_table}
                                    </span>
                                    <span className="stat__label">🏔️ Plus haute table</span>
                                </div>
                            )}
                        </div>
                        <button
                            className="btn btn--mint"
                            style={{ width: '100%', fontSize: 14, padding: '10px 16px' }}
                            onClick={() => onGo?.('play')}
                        >
                            🚀 S'entraîner
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

const AVATAR_OPTIONS = ['🎯', '🌟', '🚀', '⚡', '🌈', '🦋', '🎸', '🌸', '🐱', '🐶', '🦊', '🐻', '🎨', '⚽', '🏀', '🎮', '📚', '🧪', '🔬', '🎵'];

const PALIER_STYLE = {
    decouverte: { label: 'Découverte', emoji: '🌱', color: 'var(--sky)', bg: 'rgba(77, 168, 218, 0.12)' },
    confirme:   { label: 'Confirmé',   emoji: '⭐', color: 'var(--navy)', bg: 'rgba(26, 35, 75, 0.10)' },
    expert:     { label: 'Expert',     emoji: '🏆', color: 'var(--gold)', bg: 'rgba(201, 162, 39, 0.12)' },
};

function ProfileEleve({ onBack, identite, onLogout, onReviser }) {
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);
    const [profil, setProfil] = useState(null);
    const [records, setRecords] = useState(null);
    const [maitrise, setMaitrise] = useState({});
    const [badges, setBadges] = useState([]);
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [avatar, setAvatar] = useState(identite?.profil?.avatar_emoji || '🎯');
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
            setAvatar(d.profil?.avatar_emoji || '🎯');
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
                    📈 Cette semaine
                </h3>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 12 }}>
                    Le classement repart à zéro chaque lundi — tout le monde a sa chance.
                </p>

                {progression ? (
                    <>
                        {/* Score principal */}
                        <div style={{
                            textAlign: 'center', marginBottom: 14, padding: '16px 0',
                            background: 'linear-gradient(135deg, rgba(201,162,39,0.10), rgba(201,162,39,0.03))',
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
                                <span className="stat__label">🎮 Points de jeu</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>
                                    +{progression.bonus_jours ?? 0}
                                </span>
                                <span className="stat__label">📅 {progression.jours_actifs ?? 0} jour{(progression.jours_actifs ?? 0) > 1 ? 's' : ''} actif{(progression.jours_actifs ?? 0) > 1 ? 's' : ''}</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--mint-dk)' }}>
                                    +{progression.bonus_vertes ?? 0}
                                </span>
                                <span className="stat__label">🟢 {progression.cases_vertes ?? 0} case{(progression.cases_vertes ?? 0) > 1 ? 's' : ''} verte{(progression.cases_vertes ?? 0) > 1 ? 's' : ''}</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="stat-grid">
                        <div className="stat">
                            <span className="stat__value" style={{ color: 'var(--mint)' }}>
                                {records?.points_semaine || 0}
                            </span>
                            <span className="stat__label">📈 Points semaine</span>
                        </div>
                        <div className="stat">
                            <span className="stat__value" style={{ color: 'var(--sky)' }}>
                                {records?.jours_actifs_7j || 0}
                            </span>
                            <span className="stat__label">📅 Jours actifs (7j)</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ===== Depuis toujours ===== */}
            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
                    🏆 Depuis toujours
                </h3>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 12 }}>
                    Tes records personnels — ça ne recule jamais.
                </p>
                <div className="stat-grid">
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--coral)' }}>
                            {records?.meilleure_serie || 0}
                        </span>
                        <span className="stat__label">🔥 Meilleure série</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>
                            {records?.meilleur_chrono || 0}
                        </span>
                        <span className="stat__label">⏱ Score 2 min</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--purple)' }}>
                            {records?.plus_haute_table || 0}
                        </span>
                        <span className="stat__label">🧗 Plus haute table</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--navy)' }}>
                            {records?.nb_sessions || 0}
                        </span>
                        <span className="stat__label">📊 Sessions jouées</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--gold)' }}>
                            {records?.points_total || 0}
                        </span>
                        <span className="stat__label">💰 Points total</span>
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
                                    background: 'linear-gradient(135deg, rgba(201,162,39,0.15), rgba(201,162,39,0.05))',
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
                    <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800 }}>
                        🗺 Grille de maîtrise
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
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10, fontSize: 11, fontWeight: 700 }}>
                            <span>🔴 À revoir</span>
                            <span>🟡 En cours</span>
                            <span>🟢 Maîtrisé</span>
                            <span>⬜ Pas testé</span>
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
                                    Aucune case rouge — bravo ! 🎉
                                </p>
                            ) : (
                                <button
                                    className="btn btn--coral"
                                    style={{ fontSize: 16, padding: '12px 24px' }}
                                    onClick={handleReviser}
                                >
                                    Réviser mes cases rouges 🔴
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
                        {hide ? '👁 Montrer' : '🙈 Cacher'}
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
                    🔢 Comptage par sauts de {table}
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
                    👁 Visualiser {a} × {b} = {a * b}
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
                    <b>💡 Astuce × {table} :</b> {TIPS[table]}
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
                        background: 'linear-gradient(135deg, var(--navy), var(--navy-mid))',
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
                                '⏳ Redirection…'
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
                                    📧 Adresse e-mail scolaire
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
                                {loading ? '⏳ Envoi…' : '📧 Recevoir mon code'}
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
                                disabled={loading}
                                style={{ width: '100%', fontSize: 17, padding: 14 }}
                            >
                                {loading ? '⏳ Vérification…' : 'Valider'}
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
            color: 'var(--coral)', fontWeight: 700, fontSize: 14,
            textAlign: 'center', marginBottom: 14,
            background: 'var(--coral-bg, #FFF0F0)', borderRadius: 12,
            padding: '10px 14px',
        }}>
            {children}
        </p>
    );
}

/** Icône Google simplifiée en SVG inline — aucune dépendance externe */
function GoogleIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
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
    '#4DA8DA', '#FF5A5F', '#00C9A7', '#F0B429', '#8B6FC0',
    '#FF8C42', '#E04347', '#3A8FBE', '#00A88A', '#D69E1D',
    '#5B8DEF', '#FF6B9D', '#2DD4BF', '#FBBF24', '#A78BFA'
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
    if (val === undefined || val === null) return '#E8E2D8'; // non testé → gris doux
    if (val >= 3) return '#00C9A7';   // maîtrisé → menthe
    if (val >= 2) return '#F0B429';   // en cours → or
    return '#FF5A5F';                 // à revoir → corail
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


## screens/Admin.jsx — l'administration : eleves, enseignants, import, journal

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
        { id: 'eleves', label: '📋 Élèves' },
        ...(estAdmin ? [
            { id: 'profs', label: '👩‍🏫 Enseignants' },
            { id: 'import', label: '📥 Import' },
            { id: 'journal', label: '📜 Journal' },
        ] : []),
    ];

    const currentClassInfo = classes.find(c => c.classe === selectedClass);

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800, color: 'var(--navy)' }}>
                    ⚙️ Administration
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
                        📐 Plafond de tables — {selectedClass}
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
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
            borderBottom: '1px solid var(--border)',
            opacity: eleve.actif === false ? 0.5 : 1,
        }}>
            <span style={{ fontSize: 22 }}>{eleve.avatar_emoji || '👤'}</span>
            <div style={{ flex: 1 }}>
                <p className="font-display" style={{ fontWeight: 700, fontSize: 14 }}>
                    {prenom} {nom}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                    {email}
                    {!dejaConnecte && (
                        <span style={{ marginLeft: 6, color: 'var(--coral)', fontWeight: 700 }}>
                            ⏳ compte Google pas encore rattaché
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: busy ? 0.4 : 1 }}
                onClick={onToggle}
                disabled={busy}
                title={eleve.actif === false ? 'Réactiver' : 'Désactiver'}
            >
                {eleve.actif === false ? '♻️' : '⛔'}
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
                    👩‍🏫 Enseignants — {profs.filter(p => p.actif).length} actif{profs.filter(p => p.actif).length > 1 ? 's' : ''}
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
                        <div key={p.prof_id} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
                            borderBottom: '1px solid var(--border)',
                        }}>
                            <span style={{ fontSize: 22 }}>👤</span>
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
                                    {p.role === 'admin' ? '👑 admin' : '📚 prof'}
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
                                    <option value="prof">📚 Prof</option>
                                    <option value="admin">👑 Admin</option>
                                </select>
                            )}
                            {!estMoi && (
                                <button
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: busy === p.prof_id ? 0.4 : 1 }}
                                    onClick={() => handleToggle(p)}
                                    disabled={busy === p.prof_id}
                                    title="Désactiver"
                                >
                                    ⛔
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
                    style={{ flex: 1, height: 38, fontSize: 14 }} onClick={() => setRole('prof')}>📚 Prof</button>
                <button className={`chip${role === 'admin' ? ' chip--navy' : ''}`}
                    style={{ flex: 1, height: 38, fontSize: 14 }} onClick={() => setRole('admin')}>👑 Admin</button>
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
                📥 Import de rentrée
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
                                <div style={{ background: '#FFF8F0', borderRadius: 10, padding: 10, marginTop: 8, border: '1px solid #FFE0C0' }}>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral-dk)', marginBottom: 4 }}>
                                        ⚠️ {result.lignes_ignorees.length} ligne{result.lignes_ignorees.length > 1 ? 's' : ''} ignorée{result.lignes_ignorees.length > 1 ? 's' : ''}
                                    </p>
                                    {result.lignes_ignorees.slice(0, 10).map((l, i) => (
                                        <p key={i} style={{ fontSize: 11, color: 'var(--text-soft)' }}>{l.raison}: {l.email || '(vide)'}</p>
                                    ))}
                                </div>
                            )}
                            {result.actifs_absents_du_fichier?.length > 0 && (
                                <div style={{ background: '#FFF3E0', borderRadius: 10, padding: 10, marginTop: 8, border: '1px solid #FFE0C0' }}>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: '#E67E00', marginBottom: 4 }}>
                                        ℹ️ {result.actifs_absents_du_fichier.length} élève{result.actifs_absents_du_fichier.length > 1 ? 's' : ''} actif{result.actifs_absents_du_fichier.length > 1 ? 's' : ''} absent{result.actifs_absents_du_fichier.length > 1 ? 's' : ''} du fichier
                                    </p>
                                    <p style={{ fontSize: 11, color: 'var(--text-soft)' }}>
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
                    🔧 Rattachement des comptes Google
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
                📜 Journal d'administration
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
