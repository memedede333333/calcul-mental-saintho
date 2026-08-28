/**
 * Maîtrise — gestion des niveaux de maîtrise par fait
 * Niveaux : -2 (très faible) → 0 (neutre) → +4 (maîtrisé)
 */

/**
 * Couleur de maîtrise (pour la grille 15×15)
 */
export function masteryColor(val) {
    if (val === undefined || val === null) return '#E8E2D8'; // non testé → gris doux
    if (val >= 3) return '#00C9A7';   // maîtrisé → menthe
    if (val >= 1) return '#F0B429';   // en cours → or
    if (val >= 0) return '#FFB0C0';   // fragile → rose
    return '#FF5A5F';                  // à revoir → corail
}

/**
 * Met à jour la map de maîtrise locale après un quiz
 * @param {object} prev — maîtrise précédente { "3_7": 2, ... }
 * @param {object[]} wrong — questions ratées [{ a, b }, ...]
 * @param {object[]} right — questions réussies [{ a, b }, ...]
 * @returns {object} — nouvelle maîtrise
 */
export function updateMastery(prev, wrong, right) {
    const m = { ...prev };
    for (const w of wrong) {
        const key = `${Math.min(w.a, w.b)}_${Math.max(w.a, w.b)}`;
        m[key] = Math.max((m[key] || 0) - 1, -2);
    }
    for (const r of right) {
        const key = `${Math.min(r.a, r.b)}_${Math.max(r.a, r.b)}`;
        m[key] = Math.min((m[key] || 0) + 1, 4);
    }
    return m;
}

/**
 * Construit les poids adaptatifs depuis les données de maîtrise
 */
export function buildWeights(tables, mastery, maxMultiplier = 10) {
    const w = {};
    for (const t of tables) {
        for (let m = 1; m <= maxMultiplier; m++) {
            const key = `${Math.min(t, m)}_${Math.max(t, m)}`;
            const val = mastery[key];
            if (val === undefined) w[key] = 2;     // inconnu → priorité moyenne
            else if (val <= 0) w[key] = 4;          // faible → haute priorité
            else if (val <= 2) w[key] = 2;          // en apprentissage
            else w[key] = 1;                        // maîtrisé → basse
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
 * Les composants de quiz produisent :
 *   - wrong : [{ a, b, answer, given }]
 *   - right : [{ a, b }]
 * ================================================================= */

/** Clé normalisée : le plus petit d'abord. */
export function cleFait(a, b) {
    return `${Math.min(a, b)}_${Math.max(a, b)}`;
}

/**
 * Construit la liste plate d'erreurs pour le serveur.
 * Dédupliquée : une table ratée deux fois n'apparaît qu'une fois.
 */
export function construireErreurs(wrong) {
    return [...new Set(wrong.map(w => cleFait(w.a, w.b)))];
}

/**
 * Construit la map de maîtrise pour le serveur.
 *
 * Règle : chaque fait vu dans la partie reçoit un niveau :
 *   - 3 (vert)   : toujours réussi
 *   - 2 (jaune)  : réussi au moins une fois, raté au moins une fois
 *   - 1 (rouge)  : toujours raté
 */
export function construireMaitrise(wrong, right) {
    const bons = new Set();
    const mauvais = new Set();

    for (const r of right) bons.add(cleFait(r.a, r.b));
    for (const w of wrong) mauvais.add(cleFait(w.a, w.b));

    const m = {};
    for (const k of bons) {
        m[k] = mauvais.has(k) ? 2 : 3;   // vu en bon ET en mauvais → jaune
    }
    for (const k of mauvais) {
        if (!bons.has(k)) m[k] = 1;       // jamais réussi → rouge
    }
    return m;
}
