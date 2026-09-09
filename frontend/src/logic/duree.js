/**
 * Formatage centralisé des durées (Lot 26).
 * Règle générale :
 * - en-dessous de 60s : "X s" (ex: "30 s", "45 s")
 * - multiple exact de 60s : "X min" (ex: "1 min", "2 min")
 * - au-delà avec reste : "X min Y" (ex: "1 min 30")
 */
export function formaterDuree(secondes) {
    if (secondes == null || isNaN(secondes)) return '';
    const s = Math.round(Number(secondes));
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (r === 0) return `${m} min`;
    return `${m} min ${r}`;
}
