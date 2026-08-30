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
