/**
 * Le clavier physique est fermé là où le TEMPS fait le score : un clavier
 * est plus rapide qu'un doigt, et les classements doivent comparer des
 * choses comparables.
 *
 * Ce n'est pas de l'anti-triche — c'est contournable en dix secondes par
 * qui sait ouvrir la console. C'est de l'équité.
 *
 * Fermé pour tout le monde, décision d'Aymeri du 9 septembre 2026. Les
 * dérogations par élève (PAI, difficulté motrice) viendront ici, et nulle
 * part ailleurs, si le besoin apparaît.
 */
export const MODES_SANS_CLAVIER = ['sprint', 'countdown', 'climb'];

export function clavierAutorise(mode) {
    return !MODES_SANS_CLAVIER.includes(mode);
}
