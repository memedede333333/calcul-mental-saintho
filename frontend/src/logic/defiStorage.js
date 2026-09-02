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
