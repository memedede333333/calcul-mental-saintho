import React, { useState } from 'react';

/**
 * Leaderboards — Classements (Phase 6)
 * 3 tableaux : Séries sans faute, Vitesse, Points de la semaine
 * Par classe / général, semaine / all-time
 */

// Données démo pour l'affichage local (remplacé par l'API en production)
const DEMO_DATA = {
    streak: [
        { rank: 1, name: 'Alice D.', avatar: '🌟', classe: '6A', value: 47 },
        { rank: 2, name: 'Clara B.', avatar: '🎯', classe: '6A', value: 35 },
        { rank: 3, name: 'David P.', avatar: '⚡', classe: '6B', value: 28 },
        { rank: 4, name: 'Emma R.', avatar: '🌈', classe: '6B', value: 22 },
        { rank: 5, name: 'Bob M.', avatar: '🚀', classe: '6A', value: 18 },
        { rank: 6, name: 'Léa F.', avatar: '🦋', classe: '6A', value: 15 },
        { rank: 7, name: 'Hugo L.', avatar: '🎸', classe: '6B', value: 12 },
        { rank: 8, name: 'Inès C.', avatar: '🌸', classe: '6A', value: 10 },
    ],
    speed: [
        { rank: 1, name: 'David P.', avatar: '⚡', classe: '6B', value: 42 },
        { rank: 2, name: 'Alice D.', avatar: '🌟', classe: '6A', value: 38 },
        { rank: 3, name: 'Bob M.', avatar: '🚀', classe: '6A', value: 35 },
        { rank: 4, name: 'Clara B.', avatar: '🎯', classe: '6A', value: 31 },
        { rank: 5, name: 'Emma R.', avatar: '🌈', classe: '6B', value: 27 },
    ],
    points: [
        { rank: 1, name: 'Clara B.', avatar: '🎯', classe: '6A', value: 284 },
        { rank: 2, name: 'Alice D.', avatar: '🌟', classe: '6A', value: 256 },
        { rank: 3, name: 'David P.', avatar: '⚡', classe: '6B', value: 198 },
        { rank: 4, name: 'Bob M.', avatar: '🚀', classe: '6A', value: 175 },
        { rank: 5, name: 'Emma R.', avatar: '🌈', classe: '6B', value: 142 },
    ],
};

const TABS = [
    { id: 'streak', emoji: '🔥', label: 'Séries', unit: 'sans faute' },
    { id: 'speed', emoji: '⏱', label: 'Vitesse', unit: 'pts / 2min' },
    { id: 'points', emoji: '🏆', label: 'Points', unit: 'pts' },
];

export default function Leaderboards({ onBack, user }) {
    const [tab, setTab] = useState('streak');
    const [scope, setScope] = useState('all'); // 'all' | classe
    const [period, setPeriod] = useState('week');

    const currentTab = TABS.find(t => t.id === tab);
    const data = DEMO_DATA[tab] || [];
    const filtered = scope === 'all' ? data : data.filter(d => d.classe === (user?.classe || '6A'));

    // Position de l'utilisateur
    const userRank = data.length + 1; // Simulé hors top

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <h1 className="font-display" style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)' }}>
                    🏆 Classements
                </h1>
            </div>

            {/* Onglets de classement */}
            <div className="viz-tabs" style={{ marginBottom: 10 }}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        className={`viz-tab${tab === t.id ? ' viz-tab--active' : ''}`}
                        onClick={() => setTab(t.id)}
                        style={{ fontSize: 14 }}
                    >
                        {t.emoji} {t.label}
                    </button>
                ))}
            </div>

            {/* Filtres */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                    <button
                        className={`chip${scope === 'all' ? ' chip--navy' : ''}`}
                        style={{ flex: 1, width: 'auto', fontSize: 13, height: 40 }}
                        onClick={() => setScope('all')}
                    >
                        Collège
                    </button>
                    <button
                        className={`chip${scope === 'classe' ? ' chip--navy' : ''}`}
                        style={{ flex: 1, width: 'auto', fontSize: 13, height: 40 }}
                        onClick={() => setScope('classe')}
                    >
                        Ma classe
                    </button>
                </div>
                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                    <button
                        className={`chip${period === 'week' ? ' chip--gold' : ''}`}
                        style={{ flex: 1, width: 'auto', fontSize: 13, height: 40 }}
                        onClick={() => setPeriod('week')}
                    >
                        Semaine
                    </button>
                    <button
                        className={`chip${period === 'all-time' ? ' chip--gold' : ''}`}
                        style={{ flex: 1, width: 'auto', fontSize: 13, height: 40 }}
                        onClick={() => setPeriod('all-time')}
                    >
                        All-time
                    </button>
                </div>
            </div>

            {/* Podium top 3 */}
            {filtered.length >= 3 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 10, marginBottom: 16 }}>
                    {/* 2e place */}
                    <PodiumCard entry={filtered[1]} position={2} unit={currentTab.unit} />
                    {/* 1ere place */}
                    <PodiumCard entry={filtered[0]} position={1} unit={currentTab.unit} />
                    {/* 3e place */}
                    <PodiumCard entry={filtered[2]} position={3} unit={currentTab.unit} />
                </div>
            )}

            {/* Liste */}
            <div className="card">
                {filtered.map((entry, i) => (
                    <div
                        key={i}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 8px',
                            borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                            background: i < 3 ? 'rgba(201, 162, 39, 0.05)' : 'transparent',
                            borderRadius: i < 3 ? 8 : 0,
                        }}
                    >
                        <span className="font-display" style={{
                            fontWeight: 800, fontSize: 18, width: 28, textAlign: 'center',
                            color: i === 0 ? 'var(--gold)' : i === 1 ? '#A0A0A0' : i === 2 ? '#CD7F32' : 'var(--text-soft)',
                        }}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : entry.rank}
                        </span>
                        <span style={{ fontSize: 28 }}>{entry.avatar}</span>
                        <div style={{ flex: 1 }}>
                            <p className="font-display" style={{ fontWeight: 700, fontSize: 15 }}>{entry.name}</p>
                            <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{entry.classe}</p>
                        </div>
                        <span className="font-display" style={{ fontWeight: 800, fontSize: 20, color: 'var(--navy)' }}>
                            {entry.value}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>{currentTab.unit}</span>
                    </div>
                ))}

                {/* Position de l'utilisateur si hors top */}
                {user && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '14px 8px', marginTop: 8,
                        background: 'linear-gradient(135deg, rgba(201,162,39,0.1), rgba(201,162,39,0.05))',
                        borderRadius: 12, border: '2px solid var(--gold)',
                    }}>
                        <span className="font-display" style={{ fontWeight: 800, fontSize: 16, width: 28, textAlign: 'center', color: 'var(--text-soft)' }}>
                            {userRank}
                        </span>
                        <span style={{ fontSize: 28 }}>{user.avatar_emoji || '🎯'}</span>
                        <div style={{ flex: 1 }}>
                            <p className="font-display" style={{ fontWeight: 700, fontSize: 15 }}>
                                Toi ({user.prénom || user.nom || 'Moi'})
                            </p>
                            <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{user.classe || ''}</p>
                        </div>
                        <span className="font-display" style={{ fontWeight: 800, fontSize: 20, color: 'var(--gold)' }}>
                            0
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

function PodiumCard({ entry, position, unit }) {
    const heights = { 1: 100, 2: 75, 3: 60 };
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const colors = { 1: 'var(--gold)', 2: '#B0B0B0', 3: '#CD7F32' };

    return (
        <div style={{ textAlign: 'center', width: 90 }}>
            <span style={{ fontSize: 32 }}>{entry.avatar}</span>
            <p className="font-display" style={{ fontWeight: 700, fontSize: 12, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.name}
            </p>
            <div style={{
                height: heights[position],
                background: `linear-gradient(to top, ${colors[position]}, ${colors[position]}44)`,
                borderRadius: '12px 12px 0 0',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                marginTop: 6,
            }}>
                <span style={{ fontSize: 24 }}>{medals[position]}</span>
                <span className="font-display" style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>
                    {entry.value}
                </span>
            </div>
        </div>
    );
}
