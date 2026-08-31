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

                {/* Cartes de mode */}
                <button className="mode-card mode-card--challenge" onClick={() => onGo('challenges')}>
                    <span className="mode-card__emoji">⚔️</span>
                    <span>
                        <div className="mode-card__title">Lancer un défi</div>
                        <div className="mode-card__desc">Sprint ou Contre-la-montre pour vos classes</div>
                    </span>
                </button>

                <button className="mode-card mode-card--practice" onClick={() => onGo('play')}>
                    <span className="mode-card__emoji">🚀</span>
                    <span>
                        <div className="mode-card__title">S'entraîner</div>
                        <div className="mode-card__desc">Jouez vous aussi — Salle des profs</div>
                    </span>
                </button>

                <button className="mode-card" onClick={() => onGo('classe')} style={{
                    opacity: 0.5, cursor: 'default', pointerEvents: 'none',
                }}>
                    <span className="mode-card__emoji">🗺</span>
                    <span>
                        <div className="mode-card__title">Ma classe</div>
                        <div className="mode-card__desc">Maîtrise agrégée — en construction</div>
                    </span>
                </button>

                <button className="mode-card mode-card--learn" onClick={() => onGo('leaderboards')}>
                    <span className="mode-card__emoji">🏆</span>
                    <span>
                        <div className="mode-card__title">Classements</div>
                        <div className="mode-card__desc">Progression, records, classes et Salle des profs</div>
                    </span>
                </button>

                {/* Accès rapides */}
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                    <button
                        className="btn btn--ghost"
                        style={{ flex: 1, fontSize: 15, padding: '12px 16px' }}
                        onClick={() => onGo('profile')}
                    >
                        👤 Profil
                    </button>
                    {estAdmin && (
                        <button
                            className="btn btn--ghost"
                            style={{ flex: 1, fontSize: 15, padding: '12px 16px' }}
                            onClick={() => onGo('admin')}
                        >
                            ⚙️ Administration
                        </button>
                    )}
                </div>

                <button
                    className="btn btn--ghost"
                    style={{
                        width: '100%', fontSize: 13, padding: '10px 16px',
                        color: 'var(--coral)', marginTop: 8,
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
