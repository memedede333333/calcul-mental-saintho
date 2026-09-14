/**
 * Logique client du couvre-feu (Matho)
 *
 * RÈGLES PROJET :
 * - Le couvre-feu est piloté par le serveur Supabase (maintenant, en_cours, prochaine_bascule).
 * - En mode hors-ligne ou si le réseau est coupé, l'iPad utilise la configuration stockée
 *   dans localStorage pour continuer à interdire les nouvelles parties la nuit.
 * - Le message ne contient pas l'heure de reprise en dur : elle vient dynamiquement de heure_fin.
 * - Aucune partie en cours n'est coupée brutalement : le couvre-feu bloque les nouveaux départs.
 */

const STORAGE_KEY = 'matho_couvre_feu_config';

const DEFAUT_CONFIG = {
    actif: true,
    heure_debut: '21:30',
    heure_fin: '07:30',
    message: "C'est l'heure de dormir. L'entraînement est en pause pour la nuit.",
};

export function lireCouvreFeuLocal() {
    try {
        const str = localStorage.getItem(STORAGE_KEY);
        if (str) {
            const parsed = JSON.parse(str);
            // Retirer impérativement les champs d'état calculés (en_cours, maintenant, prochaine_bascule)
            // pour que le repli hors-ligne recalcule toujours à partir de l'heure courante (et soigne les iPads
            // ayant déjà stocké l'ancienne valeur).
            const { en_cours, maintenant, prochaine_bascule, ...cleanConfig } = parsed;
            return { ...DEFAUT_CONFIG, ...cleanConfig };
        }
    } catch {}
    return DEFAUT_CONFIG;
}

export function sauvegarderCouvreFeuLocal(data) {
    if (!data) return;
    try {
        const { actif, heure_debut, heure_fin, message } = data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ actif, heure_debut, heure_fin, message }));
    } catch {}
}

/**
 * Détermine si le couvre-feu est actuellement en cours.
 * En ligne : utilise `couvreFeuData.en_cours` fourni par le serveur.
 * Hors-ligne : calcule par rapport à l'heure locale de l'appareil.
 */
export function estEnCouvreFeu(couvreFeuData) {
    const config = couvreFeuData || lireCouvreFeuLocal();
    if (!config || !config.actif) return false;

    // Si la donnée serveur porte `en_cours`, on lui fait confiance
    if (typeof config.en_cours === 'boolean') {
        return config.en_cours;
    }

    // Secours hors-ligne : calcul sur l'horloge locale de l'iPad
    const [hDeb, mDeb] = (config.heure_debut || '21:30').split(':').map(Number);
    const [hFin, mFin] = (config.heure_fin || '07:30').split(':').map(Number);

    const now = new Date();
    const minutesCourantes = now.getHours() * 60 + now.getMinutes();
    const debutMin = hDeb * 60 + mDeb;
    const finMin = hFin * 60 + mFin;

    if (debutMin > finMin) {
        // Le créneau franchit minuit (ex: 21h30 -> 07h30)
        return minutesCourantes >= debutMin || minutesCourantes < finMin;
    } else {
        // Créneau dans la même journée (ex: 13h00 -> 14h00)
        return minutesCourantes >= debutMin && minutesCourantes < finMin;
    }
}

/**
 * Formate l'heure de reprise pour l'affichage (ex: "07:30" -> "7h30" ou "07:30").
 */
export function formaterHeureReprise(heureFin) {
    if (!heureFin) return '07:30';
    const clean = heureFin.replace(':', 'h');
    return clean.startsWith('0') ? clean.slice(1) : clean;
}
