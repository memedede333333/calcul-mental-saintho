/**
 * Calcul Mental Saintho — Fichier de branding centralisé
 * 
 * MODIFIER CE FICHIER POUR CHANGER LE NOM, LA BASELINE,
 * LE LOGO OU LES COULEURS DE L'APPLICATION.
 * Aucun autre fichier ne doit contenir ces valeurs en dur.
 */

const branding = {
    // — Identité —
    appName: 'Calcul Mental Saintho',
    baseline: 'Le défi des tables — Collège Saint-Honoré d\'Eylau',
    shortName: 'Saintho Maths',
    logoPath: '/logo-saintho.png',
    monogram: 'SHE',   // Fallback si logo absent

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

    // — Auth mode (google | pin) —
    authMode: 'pin',
};

export default branding;
