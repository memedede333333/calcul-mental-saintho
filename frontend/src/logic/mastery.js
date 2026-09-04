/**
 * Maîtrise — échelle serveur unifiée
 *
 * UNE SEULE ÉCHELLE dans tout le projet : celle du serveur.
 *   undefined = jamais vu · 1 = rouge · 2 = jaune · 3 = vert
 *
 * La base stocke ces valeurs dans `maitrise.niveau`,
 * `construireFaits()` transmet les faits bruts au serveur (migration 26),
 * et `masteryColor()` les affiche. Pas de deuxième grille locale.
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
 * Construit le tableau ordonné des faits bruts pour le serveur (migration 26).
 * Une entrée par question répondue, dans l'ordre chronologique :
 *   { fait: "7_8", juste: boolean, premier: boolean, temps_ms?: number }
 */
export function construireFaits(resultats) {
    if (!Array.isArray(resultats)) return [];
    return resultats.map(r => ({
        fait: cleFait(r.a, r.b),
        juste: r.result === 'premier' || r.result === 'rattrape',
        premier: r.result === 'premier',
        ...(typeof r.temps_ms === 'number' ? { temps_ms: r.temps_ms } : {}),
    }));
}
