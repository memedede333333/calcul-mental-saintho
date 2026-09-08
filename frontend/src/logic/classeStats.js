/**
 * Logique partagée d'analyse des tables fragiles d'une classe
 * Utilisée à la fois par MaClasse (Écran 24) et Home Enseignant (Écran 27).
 *
 * RÈGLE D'OR : Le tri se fait TOUJOURS sur (eleves_jaunes + eleves_rouges) / eleves_classe décroissant.
 * Ne JAMAIS trier sur taux_maitrise (qui ne compte que les élèves ayant déjà travaillé la table).
 */

export function trierTablesFragiles(maitriseList) {
    if (!maitriseList || !Array.isArray(maitriseList) || !maitriseList.length) return [];
    return [...maitriseList].sort((a, b) => {
        const ecA = a.eleves_classe || 1;
        const ecB = b.eleves_classe || 1;
        const diffA = ((a.eleves_jaunes || 0) + (a.eleves_rouges || 0)) / ecA;
        const diffB = ((b.eleves_jaunes || 0) + (b.eleves_rouges || 0)) / ecB;
        if (diffA !== diffB) return diffB - diffA;
        return a.table_n - b.table_n;
    });
}

export function tablePlusFragileClasse(maitriseList) {
    const triees = trierTablesFragiles(maitriseList);
    const fragile = triees.find(d => ((d.eleves_jaunes || 0) + (d.eleves_rouges || 0)) > 0);
    if (!fragile) return null;
    return {
        table_n: fragile.table_n,
        nb_bloquent: (fragile.eleves_jaunes || 0) + (fragile.eleves_rouges || 0),
        eleves_classe: fragile.eleves_classe || 0,
        eleves_jaunes: fragile.eleves_jaunes || 0,
        eleves_rouges: fragile.eleves_rouges || 0,
    };
}
