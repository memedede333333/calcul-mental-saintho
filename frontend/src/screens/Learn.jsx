import React, { useState } from 'react';

/**
 * Learn — Écran 35 : Apprendre les tables
 * 
 * Deux idées maîtresses de la méthode CPA :
 * 1. Carte commutativité : 7 × 8 = 8 × 7, avec rotation des mêmes ronds.
 *    « Une case apprise, c'est deux réponses. »
 * 2. Carte coupure en deux : décomposition dynamique selon la table :
 *    - ≤ 5 et 10 : pas de découpe (la carte ne s'affiche pas)
 *    - 6 à 9 : 5 + (n - 5)
 *    - ≥ 11 : 10 + (n - 10)
 * 
 * Sélecteur de tables borné par profil.plafond_tables (jamais 12 en dur).
 * Sélecteur de multiplicateur 1 à 10.
 * Aucun enregistrement : cet écran ne compte pas de points, ne modifie pas la maîtrise.
 */
export default function Learn({ onBack, onGo, profil }) {
    const plafond = Math.max(10, Math.min(20, Number(profil?.plafond_tables || 10)));

    // Liste des tables autorisées pour l'élève (de 2 à plafond)
    const tablesDisponibles = [];
    for (let t = 2; t <= plafond; t++) {
        tablesDisponibles.push(t);
    }

    const [table, setTable] = useState(7);
    const [focus, setFocus] = useState(8);
    const [isFlipped, setIsFlipped] = useState(false);

    // Multiplicateurs 1 à 10
    const multiplicateurs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // Règle de décomposition dynamique (« La coupure en deux »)
    let decoup = null;
    if (table > 5 && table !== 10) {
        if (table >= 6 && table <= 9) {
            const base = 5;
            const reste = table - 5;
            decoup = {
                base,
                reste,
                texte: `Les tables de 5 et de 2 sont les plus faciles. Toutes les autres se ramènent à elles : <b>${table}, c'est 5 plus ${reste}</b>.`,
            };
        } else if (table >= 11) {
            const base = 10;
            const reste = table - 10;
            decoup = {
                base,
                reste,
                texte: `La table de 10 est la plus simple. Toutes les grandes tables se ramènent à elle : <b>${table}, c'est 10 plus ${reste}</b>.`,
            };
        }
    }

    // Orientation de la commutativité
    const leftRows = !isFlipped ? table : focus;
    const leftCols = !isFlipped ? focus : table;
    const rightRows = !isFlipped ? focus : table;
    const rightCols = !isFlipped ? table : focus;

    // Calcul de la taille optimale des ronds pour ne jamais déborder
    const maxDimension = Math.max(table, focus, 10);
    const dotSize = maxDimension > 12 ? 14 : maxDimension > 9 ? 16 : 19;
    const dotGap = maxDimension > 12 ? 4 : 6;

    // Passer au fait suivant
    const handleSuivant = () => {
        setFocus((prev) => (prev < 10 ? prev + 1 : 1));
    };

    // Lancer la partie en mode libre sur cette seule table
    const handleTesterLibre = () => {
        onGo?.('play', {
            mode: 'libre',
            tables: [table],
            length: 20,
            timer: 0,
        });
    };

    return (
        <div
            className="screen-enter"
            style={{
                width: '100%',
                maxWidth: '834px',
                margin: '0 auto',
                padding: '16px 20px 40px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
            }}
        >
            {/* En-tête avec bouton retour */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <button
                    type="button"
                    onClick={onBack}
                    style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '16px',
                        background: 'var(--surface)',
                        boxShadow: '0 4px 12px rgba(32, 34, 107, .08)',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flex: 'none',
                    }}
                    title="Retour à l'accueil"
                >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="M15 5 8 12l7 7" stroke="var(--indigo)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <h2 style={{ margin: 0, font: '700 32px var(--titre)', color: 'var(--indigo)' }}>
                    Apprendre
                </h2>
            </div>

            {/* Sélecteur de table (haut, 2 à plafond) */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {tablesDisponibles.map((t) => {
                    const isSelected = t === table;
                    return (
                        <button
                            key={t}
                            type="button"
                            onClick={() => {
                                setTable(t);
                                setIsFlipped(false);
                            }}
                            style={{
                                width: '58px',
                                height: '58px',
                                borderRadius: '16px',
                                background: isSelected ? 'var(--indigo)' : 'var(--surface)',
                                color: isSelected ? '#FFFFFF' : 'var(--gris)',
                                boxShadow: isSelected ? '0 4px 14px rgba(32, 34, 107, 0.25)' : '0 3px 10px rgba(32, 34, 107, .07)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                font: '700 25px var(--titre)',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {t}
                        </button>
                    );
                })}
            </div>

            {/* Sélecteur de multiplicateur (1 à 10) */}
            <div style={{ display: 'flex', gap: '8px' }}>
                {multiplicateurs.map((m) => {
                    const isSelected = m === focus;
                    return (
                        <button
                            key={m}
                            type="button"
                            onClick={() => setFocus(m)}
                            style={{
                                flex: 1,
                                height: '52px',
                                borderRadius: '13px',
                                background: isSelected ? 'var(--ciel)' : 'var(--surface)',
                                color: isSelected ? '#FFFFFF' : 'var(--gris)',
                                boxShadow: isSelected ? '0 4px 14px rgba(35, 164, 217, 0.25)' : '0 3px 10px rgba(32, 34, 107, .07)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                font: '700 20px var(--titre)',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {m}
                        </button>
                    );
                })}
            </div>

            {/* Carte du haut : La commutativité */}
            <div
                style={{
                    background: 'var(--surface)',
                    borderRadius: '24px',
                    boxShadow: '0 8px 20px rgba(32, 34, 107, .09)',
                    padding: '24px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '16px',
                }}
            >
                {/* Expression */}
                <div style={{ font: '700 56px var(--titre)', color: 'var(--indigo)' }}>
                    {table} <span style={{ color: 'var(--gris)' }}>×</span> {focus} <span style={{ color: 'var(--gris)' }}>=</span> {table * focus}
                </div>

                {/* Grille et permutation */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '24px',
                        width: '100%',
                        flexWrap: 'wrap',
                    }}
                >
                    {/* Grille active (gauche) */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${leftCols}, ${dotSize}px)`,
                                gap: `${dotGap}px`,
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                        >
                            {Array.from({ length: leftRows * leftCols }).map((_, i) => (
                                <div
                                    key={i}
                                    style={{
                                        width: `${dotSize}px`,
                                        height: `${dotSize}px`,
                                        borderRadius: '50%',
                                        background: 'var(--ciel)',
                                        transition: 'transform 0.2s ease',
                                    }}
                                />
                            ))}
                        </div>
                        <div style={{ font: '600 16px var(--texte)', color: 'var(--gris)' }}>
                            {leftRows} rangées de {leftCols}
                        </div>
                    </div>

                    {/* Bouton Faire tourner */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '9px', flex: 'none' }}>
                        <button
                            type="button"
                            onClick={() => setIsFlipped((f) => !f)}
                            style={{
                                width: '64px',
                                height: '64px',
                                borderRadius: '20px',
                                background: '#F3F4F8',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'transform 0.3s ease, background 0.15s ease',
                                transform: isFlipped ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}
                            title="Faire tourner pour voir la commutativité"
                        >
                            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                                <path d="M4 9h13a3.5 3.5 0 0 1 0 7h-3" stroke="var(--indigo)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M7 6 4 9l3 3" stroke="var(--indigo)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M20 15H7a3.5 3.5 0 0 1 0-7h3" stroke="var(--ciel)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="m17 18 3-3-3-3" stroke="var(--ciel)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <div
                            style={{
                                font: '700 15px var(--texte)',
                                color: 'var(--ciel)',
                                textAlign: 'center',
                                maxWidth: '78px',
                                cursor: 'pointer',
                            }}
                            onClick={() => setIsFlipped((f) => !f)}
                        >
                            Faire tourner
                        </div>
                    </div>

                    {/* Grille fantôme (droite) */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '10px',
                            opacity: 0.4,
                            cursor: 'pointer',
                        }}
                        onClick={() => setIsFlipped((f) => !f)}
                    >
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${rightCols}, ${dotSize}px)`,
                                gap: `${dotGap}px`,
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                        >
                            {Array.from({ length: rightRows * rightCols }).map((_, i) => (
                                <div
                                    key={i}
                                    style={{
                                        width: `${dotSize}px`,
                                        height: `${dotSize}px`,
                                        borderRadius: '50%',
                                        background: 'var(--ciel)',
                                    }}
                                />
                            ))}
                        </div>
                        <div style={{ font: '600 16px var(--texte)', color: 'var(--gris)' }}>
                            {rightRows} rangées de {rightCols}
                        </div>
                    </div>
                </div>

                {/* Encart explicatif en bas de carte */}
                <div
                    style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        background: 'var(--ciel-pale)',
                        borderRadius: '16px',
                        padding: '16px 22px',
                        font: '600 18px var(--texte)',
                        color: 'var(--indigo)',
                        textAlign: 'center',
                    }}
                >
                    Autant de ronds dans les deux sens : <b>{table} × {focus} = {focus} × {table}</b>. Une case apprise, c'est deux réponses.
                </div>
            </div>

            {/* Carte du bas : La coupure en deux (affichée selon la règle) */}
            {decoup && (
                <div
                    style={{
                        background: 'var(--surface)',
                        borderRadius: '24px',
                        boxShadow: '0 8px 20px rgba(32, 34, 107, .09)',
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                    }}
                >
                    <div style={{ font: '700 23px var(--titre)', color: 'var(--indigo)' }}>
                        La coupure en deux
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '14px',
                            flexWrap: 'wrap',
                        }}
                    >
                        {/* Bloc A (base, bleu) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${focus}, ${dotSize}px)`,
                                    gap: `${dotGap}px`,
                                }}
                            >
                                {Array.from({ length: decoup.base * focus }).map((_, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            width: `${dotSize}px`,
                                            height: `${dotSize}px`,
                                            borderRadius: '50%',
                                            background: 'var(--ciel)',
                                        }}
                                    />
                                ))}
                            </div>
                            <div style={{ font: '700 17px var(--texte)', color: 'var(--ciel)', textAlign: 'center' }}>
                                {decoup.base} × {focus} = {decoup.base * focus}
                            </div>
                        </div>

                        {/* Signe + */}
                        <div style={{ font: '700 34px var(--titre)', color: 'var(--gris)' }}>+</div>

                        {/* Bloc B (reste, orange) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${focus}, ${dotSize}px)`,
                                    gap: `${dotGap}px`,
                                }}
                            >
                                {Array.from({ length: decoup.reste * focus }).map((_, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            width: `${dotSize}px`,
                                            height: `${dotSize}px`,
                                            borderRadius: '50%',
                                            background: 'var(--orange)',
                                        }}
                                    />
                                ))}
                            </div>
                            <div style={{ font: '700 17px var(--texte)', color: '#8A5A10', textAlign: 'center' }}>
                                {decoup.reste} × {focus} = {decoup.reste * focus}
                            </div>
                        </div>

                        {/* Signe = */}
                        <div style={{ font: '700 34px var(--titre)', color: 'var(--gris)' }}>=</div>

                        {/* Résultat final */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <div style={{ font: '700 56px var(--titre)', color: 'var(--indigo)' }}>
                                {table * focus}
                            </div>
                            <div style={{ font: '600 16px var(--texte)', color: 'var(--gris)', textAlign: 'center' }}>
                                {decoup.base * focus} + {decoup.reste * focus}
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            font: '600 17px/1.5 var(--texte)',
                            color: 'var(--gris)',
                        }}
                        dangerouslySetInnerHTML={{ __html: decoup.texte }}
                    />
                </div>
            )}

            {/* Boutons d'action du bas */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                    type="button"
                    onClick={handleTesterLibre}
                    style={{
                        flex: 2,
                        height: '84px',
                        borderRadius: '24px',
                        background: 'var(--ciel)',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        font: '700 22px var(--texte)',
                        color: '#FFFFFF',
                        cursor: 'pointer',
                        boxShadow: '0 8px 24px rgba(35, 164, 217, 0.28)',
                    }}
                >
                    Tester la table de {table} en libre
                </button>
                <button
                    type="button"
                    onClick={handleSuivant}
                    style={{
                        flex: 1,
                        height: '84px',
                        borderRadius: '24px',
                        background: 'var(--surface)',
                        boxShadow: '0 8px 20px rgba(32, 34, 107, .09)',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        font: '700 20px var(--texte)',
                        color: 'var(--indigo)',
                        cursor: 'pointer',
                    }}
                >
                    Fait suivant ›
                </button>
            </div>
        </div>
    );
}
