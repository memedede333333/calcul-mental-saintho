import React from 'react';

/**
 * matHo — Les icônes dessinées à la main (issues de la maquette v2)
 * Remplacent les emojis des 4 modes et des boutons d'action.
 * Aucune bibliothèque externe : tout est vectoriel SVG pur.
 */

export function IconSprint({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M24 4 10 25h9l-2 15 15-22h-9z" fill={actionColor} stroke={color} strokeWidth="3" strokeLinejoin="round" />
        </svg>
    );
}

export function IconSansFaute({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <circle cx="22" cy="22" r="17" stroke={color} strokeWidth="3.4" />
            <circle cx="22" cy="22" r="9" stroke={actionColor} strokeWidth="3.4" />
            <circle cx="22" cy="22" r="2.6" fill={color} />
        </svg>
    );
}

export function IconChrono({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <circle cx="22" cy="25" r="15" stroke={color} strokeWidth="3.4" />
            <path d="M22 16v9l6 4" stroke={actionColor} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 5h10M22 5v5" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
        </svg>
    );
}

export function IconMontee({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M5 37h9v-9h9v-9h9v-9h7" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M32 4h8v8" stroke={actionColor} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconApprendre({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M22 12C18 8 12 7 6 8v25c6-1 12 0 16 4 4-4 10-5 16-4V8c-6-1-12 0-16 4z" stroke={color} strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M22 12v25" stroke={actionColor} strokeWidth="3.2" />
        </svg>
    );
}

export function IconClassements({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <rect x="4" y="24" width="11" height="15" rx="2.5" stroke={color} strokeWidth="3.2" />
            <rect x="16.5" y="13" width="11" height="26" rx="2.5" stroke={actionColor} strokeWidth="3.2" />
            <rect x="29" y="29" width="11" height="10" rx="2.5" stroke={color} strokeWidth="3.2" />
        </svg>
    );
}

export function IconMaGrille({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <rect x="5" y="5" width="11" height="11" rx="2.5" fill={actionColor} />
            <rect x="18" y="5" width="11" height="11" rx="2.5" stroke={color} strokeWidth="3" />
            <rect x="31" y="5" width="8" height="11" rx="2.5" stroke={color} strokeWidth="3" />
            <rect x="5" y="18" width="11" height="11" rx="2.5" stroke={color} strokeWidth="3" />
            <rect x="18" y="18" width="11" height="11" rx="2.5" fill={color} />
            <rect x="31" y="18" width="8" height="11" rx="2.5" stroke={color} strokeWidth="3" />
            <rect x="5" y="31" width="11" height="8" rx="2.5" stroke={color} strokeWidth="3" />
            <rect x="18" y="31" width="11" height="8" rx="2.5" stroke={color} strokeWidth="3" />
        </svg>
    );
}

export function IconEffacer({ size = 32, color = 'var(--indigo-doux)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M17.5 10h20a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4h-20L5.5 24z" stroke={color} strokeWidth="3.4" strokeLinejoin="round" />
            <path d="M21 19l10 10M31 19 21 29" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
        </svg>
    );
}

export function IconDefisPasses({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M9 8h26a2 2 0 0 1 2 2v26a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" stroke={color} strokeWidth="3.2" />
            <path d="M14 17h16M14 24h16M14 31h9" stroke={actionColor} strokeWidth="3.2" strokeLinecap="round" />
        </svg>
    );
}

export function IconCheck({ size = 24, color = 'var(--action-texte)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M5 12.5 10 17.5 19 7" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconCadenas({ size = 24, color = 'var(--gris-inerte)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.5" stroke={color} strokeWidth="2.4" />
            <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
        </svg>
    );
}

export function IconDocument({ size = 24, color = 'var(--indigo)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M6 20h12a2 2 0 0 0 2-2V9l-5-5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" stroke={color} strokeWidth="2" />
            <path d="M14 4v5h5" stroke={color} strokeWidth="2" />
        </svg>
    );
}

export function IconAdmin({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke={actionColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconProf({ size = 36, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <circle cx="22" cy="14" r="8" stroke={color} strokeWidth="3.2" />
            <path d="M7 38c0-7 7-12 15-12s15 5 15 12" stroke={color} strokeWidth="3.2" strokeLinecap="round" />
            <path d="M14 13h16M22 6v14" stroke={actionColor} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
    );
}

export function IconAmpoule({ size = 24, color = 'var(--indigo-doux)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M9 21h6M12 3a6 6 0 0 1 4 10.5V17a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-3.5A6 6 0 0 1 12 3Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconRefresh({ size = 24, color = 'var(--indigo)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M1 4v6h6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconSignal({ size = 24, color = 'var(--gris)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconEnvelope({ size = 24, color = 'var(--indigo)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <rect x="2" y="4" width="20" height="16" rx="2" stroke={color} strokeWidth="2" />
            <path d="M22 7l-10 7L2 7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconLock({ size = 24, color = 'var(--gris-inerte)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <rect x="5" y="11" width="14" height="10" rx="2" stroke={color} strokeWidth="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function IconSablier({ size = 24, color = 'var(--gris)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} {...props}>
            <path d="M6 2h12M6 22h12M6 2v5l6 5-6 5v5M18 2v5l-6 5 6 5v5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconLibre({ size = 24, color = 'var(--indigo)', actionColor = 'var(--ciel)', ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }} {...props}>
            <rect x="6" y="6" width="14" height="14" rx="3.5" stroke={color} strokeWidth="3.2" />
            <rect x="24" y="6" width="14" height="14" rx="3.5" fill={actionColor} />
            <rect x="6" y="24" width="14" height="14" rx="3.5" fill={actionColor} />
            <rect x="24" y="24" width="14" height="14" rx="3.5" stroke={color} strokeWidth="3.2" />
        </svg>
    );
}

/**
 * Sélecteur d'icône pour les modes de jeu
 */
export function ModeIcon({ mode, size = 36, color, actionColor, ...props }) {
    switch (mode) {
        case 'sprint':
            return <IconSprint size={size} color={color} actionColor={actionColor} {...props} />;
        case 'perfect':
        case 'sans-faute':
        case 'flawless':
            return <IconSansFaute size={size} color={color} actionColor={actionColor} {...props} />;
        case 'countdown':
        case 'chrono':
        case 'contre-la-montre':
            return <IconChrono size={size} color={color} actionColor={actionColor} {...props} />;
        case 'climb':
        case 'montee':
            return <IconMontee size={size} color={color} actionColor={actionColor} {...props} />;
        case 'libre':
        case 'entrainement':
            return <IconLibre size={size} color={color} actionColor={actionColor} {...props} />;
        case 'learn':
        case 'apprendre':
            return <IconApprendre size={size} color={color} actionColor={actionColor} {...props} />;
        case 'leaderboards':
        case 'classements':
            return <IconClassements size={size} color={color} actionColor={actionColor} {...props} />;
        case 'profile':
        case 'grille':
        case 'ma-grille':
            return <IconMaGrille size={size} color={color} actionColor={actionColor} {...props} />;
        default:
            return <IconLibre size={size} color={color} actionColor={actionColor} {...props} />;
    }
}
