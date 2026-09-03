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

    // — Note : Les couleurs et le design system sont définis dans tokens.css —

    // — Typographie —
    fonts: {
        display: "'Baloo 2', system-ui, sans-serif",  // Titres, nombres, boutons
        body: "'Nunito', system-ui, sans-serif",    // Texte courant
    },

};

export default branding;
