import React from 'react';

/**
 * Home — Écran d'accueil avec les 3 grandes cartes de mode + accès rapides
 */
export default function Home({ onGo, user }) {
    return (
        <div className="screen-enter">
            {/* Bienvenue */}
            {user && (
                <div className="card" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
                    <span style={{ fontSize: 36 }}>{user.avatar_emoji || '🎯'}</span>
                    <div>
                        <p className="font-display" style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>
                            Salut {user.prénom || user.nom || 'Champion'} !
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 700 }}>
                            {user.classe || ''} — Prêt pour les tables ?
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
                <button className="btn btn--ghost" style={{ flex: 1, fontSize: 15, padding: '12px 16px' }} onClick={() => onGo('leaderboards')}>
                    🏆 Classements
                </button>
                <button className="btn btn--ghost" style={{ flex: 1, fontSize: 15, padding: '12px 16px' }} onClick={() => onGo('profile')}>
                    👤 Profil
                </button>
            </div>

            {/* Admin (démo: toujours visible) */}
            <button
                className="btn btn--ghost"
                style={{ width: '100%', marginTop: 10, fontSize: 14, padding: '10px 16px', color: 'var(--text-soft)' }}
                onClick={() => onGo('admin')}
            >
                ⚙️ Administration
            </button>
        </div>
    );
}
