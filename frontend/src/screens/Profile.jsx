import React, { useState } from 'react';
import { masteryColor } from '../logic/mastery';
import { ALL_TABLES } from '../logic/questions';

/**
 * Profile — Profil élève (Phase 6)
 * Avatar, records, badges, grille de maîtrise 15×15
 */

// Définitions des badges
const BADGE_DEFS = {
    streak_10: { emoji: '🔥', name: 'Flamme', desc: 'Série de 10 sans faute' },
    streak_20: { emoji: '🔥🔥', name: 'Brasier', desc: 'Série de 20 sans faute' },
    streak_30: { emoji: '🌋', name: 'Volcan', desc: 'Série de 30 sans faute' },
    streak_50: { emoji: '☄️', name: 'Météore', desc: 'Série de 50 sans faute' },
    streak_100: { emoji: '💫', name: 'Légende', desc: 'Série de 100 sans faute' },
    table_master: { emoji: '🗺', name: 'Maître', desc: 'Toute une table en vert' },
    speed_3s: { emoji: '⚡', name: 'Rapide', desc: 'Moyenne < 3s / question' },
    speed_2s: { emoji: '⚡⚡', name: 'Éclair', desc: 'Moyenne < 2s / question' },
    days_3: { emoji: '📅', name: 'Régulier', desc: '3 jours de suite' },
    days_7: { emoji: '🗓', name: 'Assidu', desc: '7 jours de suite' },
    defi_1: { emoji: '🏆', name: 'Challenger', desc: '1er défi gagné' },
    defi_5: { emoji: '🏆🏆', name: 'Champion', desc: '5 défis gagnés' },
    defi_20: { emoji: '👑', name: 'Roi des défis', desc: '20 défis gagnés' },
    climb_10: { emoji: '🧗', name: 'Grimpeur', desc: 'Table 10 en Montée' },
    climb_12: { emoji: '🧗‍♂️', name: 'Alpiniste', desc: 'Table 12 en Montée' },
    climb_15: { emoji: '🏔', name: 'Sommet', desc: 'Table 15 en Montée' },
};

const AVATAR_OPTIONS = ['🎯', '🌟', '🚀', '⚡', '🌈', '🦋', '🎸', '🌸', '🐱', '🐶', '🦊', '🐻', '🎨', '⚽', '🏀', '🎮', '📚', '🧪', '🔬', '🎵'];

export default function Profile({ onBack, user, onLogout }) {
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [avatar, setAvatar] = useState(user?.avatar_emoji || '🎯');
    const [showMastery, setShowMastery] = useState(false);
    const [mastery] = useState({}); // Chargé depuis le serveur en production

    // Badges démo
    const userBadges = ['streak_10', 'speed_3s', 'days_3'];

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            {/* Carte profil */}
            <div className="card" style={{ textAlign: 'center', marginBottom: 14 }}>
                <div
                    style={{ fontSize: 64, cursor: 'pointer', marginBottom: 8 }}
                    onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                    title="Changer d'avatar"
                >
                    {avatar}
                </div>

                {showAvatarPicker && (
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
                        marginBottom: 14, padding: 12, background: 'var(--surface-alt)', borderRadius: 16,
                    }}>
                        {AVATAR_OPTIONS.map(a => (
                            <button
                                key={a}
                                style={{
                                    fontSize: 28, background: avatar === a ? 'var(--gold-light)' : 'transparent',
                                    border: 'none', borderRadius: 10, padding: 6, cursor: 'pointer',
                                }}
                                onClick={() => { setAvatar(a); setShowAvatarPicker(false); }}
                            >
                                {a}
                            </button>
                        ))}
                    </div>
                )}

                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800 }}>
                    {user?.prénom} {user?.nom}
                </h2>
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                    {user?.classe || ''} — {user?.email || ''}
                </p>
            </div>

            {/* Records */}
            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
                    📊 Mes records
                </h3>
                <div className="stat-grid">
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--coral)' }}>0</span>
                        <span className="stat__label">🔥 Meilleure série</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>0</span>
                        <span className="stat__label">⏱ Score 2min</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--purple)' }}>0</span>
                        <span className="stat__label">🧗 Plus haute table</span>
                    </div>
                </div>
            </div>

            {/* Badges */}
            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
                    🏅 Mes badges
                </h3>

                {/* Badges obtenus */}
                {userBadges.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                        {userBadges.map(id => {
                            const badge = BADGE_DEFS[id];
                            if (!badge) return null;
                            return (
                                <div key={id} style={{
                                    background: 'linear-gradient(135deg, rgba(201,162,39,0.15), rgba(201,162,39,0.05))',
                                    borderRadius: 14, padding: '10px 14px', textAlign: 'center', minWidth: 80,
                                    border: '1px solid var(--gold-light)',
                                }}>
                                    <div style={{ fontSize: 28 }}>{badge.emoji}</div>
                                    <p className="font-display" style={{ fontWeight: 700, fontSize: 12, marginTop: 4 }}>{badge.name}</p>
                                    <p style={{ fontSize: 10, color: 'var(--text-soft)' }}>{badge.desc}</p>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Badges non obtenus */}
                <p style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 8 }}>
                    À débloquer :
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(BADGE_DEFS)
                        .filter(([id]) => !userBadges.includes(id))
                        .map(([id, badge]) => (
                            <div key={id} style={{
                                background: 'var(--surface-alt)', borderRadius: 12, padding: '8px 12px',
                                textAlign: 'center', minWidth: 70, opacity: 0.5,
                            }}>
                                <div style={{ fontSize: 22, filter: 'grayscale(1)' }}>{badge.emoji}</div>
                                <p style={{ fontSize: 10, fontWeight: 600, marginTop: 2 }}>{badge.name}</p>
                            </div>
                        ))
                    }
                </div>
            </div>

            {/* Grille de maîtrise */}
            <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800 }}>
                        🗺 Grille de maîtrise
                    </h3>
                    <button
                        className="btn btn--ghost"
                        style={{ fontSize: 13, padding: '8px 12px' }}
                        onClick={() => setShowMastery(!showMastery)}
                    >
                        {showMastery ? 'Masquer' : 'Afficher'}
                    </button>
                </div>

                {showMastery && (
                    <div style={{ marginTop: 12 }}>
                        <div
                            className="mastery-grid"
                            style={{ gridTemplateColumns: `30px repeat(${ALL_TABLES.length}, 1fr)` }}
                        >
                            <div className="mastery-grid-hdr">×</div>
                            {ALL_TABLES.map(c => (
                                <div key={c} className="mastery-grid-hdr">{c}</div>
                            ))}
                            {ALL_TABLES.map(r => (
                                <React.Fragment key={r}>
                                    <div className="mastery-grid-hdr">{r}</div>
                                    {ALL_TABLES.map(c => {
                                        const key = `${Math.min(r, c)}_${Math.max(r, c)}`;
                                        return (
                                            <div
                                                key={c}
                                                className="mastery-grid-cell"
                                                style={{ background: masteryColor(mastery[key]) }}
                                                title={`${r}×${c} = ${r * c}`}
                                            />
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10, fontSize: 11, fontWeight: 700 }}>
                            <span>🔴 À revoir</span>
                            <span>🟡 En cours</span>
                            <span>🟢 Maîtrisé</span>
                            <span>⬜ Pas testé</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Déconnexion */}
            <button
                className="btn btn--ghost"
                style={{ width: '100%', fontSize: 15, color: 'var(--coral)' }}
                onClick={onLogout}
            >
                Se déconnecter
            </button>
        </div>
    );
}
