import React from 'react';

/**
 * Home — Écran d'accueil
 *
 * Reçoit `identite` (réponse brute de quiSuisJe), pas un objet aplati.
 * Deux rendus :
 *   - élève : les 5 destinations + accès rapides
 *   - prof  : placeholder « en construction » + boutons utiles
 *
 * Le bouton Administration n'apparaît QUE si estAdmin === true.
 */
export default function Home({ onGo, identite, estProf, estAdmin, onLogout }) {
    const profil = identite?.profil;

    // ==================== ACCUEIL PROFESSEUR ====================
    if (estProf) {
        return (
            <div className="screen-enter">
                {/* Bienvenue prof */}
                <div className="card" style={{
                    marginBottom: 14, display: 'flex',
                    alignItems: 'center', gap: 14, padding: '16px 20px',
                }}>
                    <span style={{ fontSize: 36 }}>👨‍🏫</span>
                    <div>
                        <p className="font-display" style={{
                            fontWeight: 800, fontSize: 18, lineHeight: 1.2,
                        }}>
                            Bonjour {profil?.nom || 'Professeur'}
                        </p>
                        <p style={{
                            fontSize: 13, color: 'var(--text-soft)', fontWeight: 700,
                        }}>
                            {estAdmin ? 'Administrateur' : 'Enseignant'}
                        </p>
                    </div>
                </div>

                {/* Placeholder — en construction */}
                <div className="card" style={{
                    textAlign: 'center', padding: '32px 20px',
                    marginBottom: 14,
                }}>
                    <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>🏗️</span>
                    <h2 className="font-display" style={{
                        fontSize: 20, fontWeight: 800, color: 'var(--navy)',
                        marginBottom: 8,
                    }}>
                        Accueil enseignant
                    </h2>
                    <p style={{
                        color: 'var(--text-soft)', fontWeight: 600,
                        fontSize: 14, lineHeight: 1.5,
                    }}>
                        Le lancement de défis et le suivi de classe arrivent
                        dans les prochaines étapes.
                    </p>
                </div>

                {/* Boutons disponibles */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    <button
                        className="btn btn--ghost"
                        style={{ flex: 1, fontSize: 15, padding: '12px 16px' }}
                        onClick={() => onGo('leaderboards')}
                    >
                        🏆 Classements
                    </button>
                    <button
                        className="btn btn--ghost"
                        style={{ flex: 1, fontSize: 15, padding: '12px 16px' }}
                        onClick={() => onGo('profile')}
                    >
                        👤 Profil
                    </button>
                </div>

                {estAdmin && (
                    <button
                        className="btn btn--ghost"
                        style={{
                            width: '100%', marginBottom: 10,
                            fontSize: 14, padding: '10px 16px',
                            color: 'var(--text-soft)',
                        }}
                        onClick={() => onGo('admin')}
                    >
                        ⚙️ Administration
                    </button>
                )}

                <button
                    className="btn btn--ghost"
                    style={{
                        width: '100%', fontSize: 13, padding: '10px 16px',
                        color: 'var(--coral)',
                    }}
                    onClick={onLogout}
                >
                    Se déconnecter
                </button>
            </div>
        );
    }

    // ==================== ACCUEIL ÉLÈVE ====================
    return (
        <div className="screen-enter">
            {/* Bienvenue */}
            {profil && (
                <div className="card" style={{
                    marginBottom: 14, display: 'flex',
                    alignItems: 'center', gap: 14, padding: '16px 20px',
                }}>
                    <span style={{ fontSize: 36 }}>
                        {profil.avatar_emoji || '🎯'}
                    </span>
                    <div>
                        <p className="font-display" style={{
                            fontWeight: 800, fontSize: 18, lineHeight: 1.2,
                        }}>
                            Salut {profil.prenom || profil.nom || 'Champion'} !
                        </p>
                        <p style={{
                            fontSize: 13, color: 'var(--text-soft)', fontWeight: 700,
                        }}>
                            {profil.classe || ''} — Prêt pour les tables ?
                        </p>
                    </div>
                </div>
            )}

            {/* Cartes de mode */}
            <button className="mode-card mode-card--learn" onClick={() => onGo('learn')}>
                <span className="mode-card__emoji">📘</span>
                <span>
                    <div className="mode-card__title">Apprendre</div>
                    <div className="mode-card__desc">Groupes, tableaux, barres et astuces</div>
                </span>
            </button>

            <button className="mode-card mode-card--practice" onClick={() => onGo('play')}>
                <span className="mode-card__emoji">🚀</span>
                <span>
                    <div className="mode-card__title">S'entraîner</div>
                    <div className="mode-card__desc">Quiz adaptatif avec indices et maîtrise</div>
                </span>
            </button>

            <button className="mode-card mode-card--challenge" onClick={() => onGo('challenges')}>
                <span className="mode-card__emoji">⚔️</span>
                <span>
                    <div className="mode-card__title">Défis</div>
                    <div className="mode-card__desc">Défie tes camarades de classe !</div>
                </span>
            </button>

            {/* Accès rapides */}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button
                    className="btn btn--ghost"
                    style={{ flex: 1, fontSize: 15, padding: '12px 16px' }}
                    onClick={() => onGo('leaderboards')}
                >
                    🏆 Classements
                </button>
                <button
                    className="btn btn--ghost"
                    style={{ flex: 1, fontSize: 15, padding: '12px 16px' }}
                    onClick={() => onGo('profile')}
                >
                    👤 Profil
                </button>
            </div>
        </div>
    );
}
