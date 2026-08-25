import React, { useState } from 'react';
import { ALL_TABLES } from '../logic/questions';
import { masteryColor } from '../logic/mastery';

/**
 * Admin — Dashboard enseignant (Phase 7)
 * Tabs : Roster, PINs, Suivi, Config
 */

// Données démo
const DEMO_STUDENTS = [
    { id: 'demo001', nom: 'Dupont', prénom: 'Alice', classe: '6A', email: 'alice@saintho.org', tables: '1-10', avatar: '🌟', actif: true, premiere_connexion: 'non' },
    { id: 'demo002', nom: 'Martin', prénom: 'Bob', classe: '6A', email: 'bob@saintho.org', tables: '1-10', avatar: '🚀', actif: true, premiere_connexion: 'non' },
    { id: 'demo003', nom: 'Bernard', prénom: 'Clara', classe: '6A', email: 'clara@saintho.org', tables: '1-15', avatar: '🎯', actif: true, premiere_connexion: 'oui' },
    { id: 'demo004', nom: 'Petit', prénom: 'David', classe: '6B', email: 'david@saintho.org', tables: '1-10', avatar: '⚡', actif: true, premiere_connexion: 'oui' },
    { id: 'demo005', nom: 'Robert', prénom: 'Emma', classe: '6B', email: 'emma@saintho.org', tables: '1-12', avatar: '🌈', actif: true, premiere_connexion: 'non' },
    { id: 'demo006', nom: 'Leroy', prénom: 'Félix', classe: '6A', email: 'felix@saintho.org', tables: '1-10', avatar: '🎸', actif: false, premiere_connexion: 'oui' },
];

const CLASSES = ['6A', '6B', '6C', '5A', '5B'];

export default function Admin({ onBack, user }) {
    const [tab, setTab] = useState('roster');
    const [students, setStudents] = useState(DEMO_STUDENTS);
    const [selectedClass, setSelectedClass] = useState('6A');

    const filtered = students.filter(s => s.classe === selectedClass);
    const activeCount = filtered.filter(s => s.actif).length;

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800, color: 'var(--navy)' }}>
                    ⚙️ Administration
                </h1>
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 13 }}>
                    {user?.nom || 'Enseignant'} — {selectedClass}
                </p>
            </div>

            {/* Sélecteur de classe */}
            <div className="chips" style={{ justifyContent: 'center', marginBottom: 14 }}>
                {CLASSES.map(c => (
                    <button
                        key={c}
                        className={`chip${c === selectedClass ? ' chip--navy' : ''}`}
                        style={{ width: 50, height: 42, fontSize: 16 }}
                        onClick={() => setSelectedClass(c)}
                    >
                        {c}
                    </button>
                ))}
            </div>

            {/* Onglets admin */}
            <div className="viz-tabs" style={{ marginBottom: 14 }}>
                {[
                    { id: 'roster', label: '📋 Roster' },
                    { id: 'pins', label: '🔑 PINs' },
                    { id: 'suivi', label: '📊 Suivi' },
                    { id: 'config', label: '⚙️ Config' },
                ].map(t => (
                    <button
                        key={t.id}
                        className={`viz-tab${tab === t.id ? ' viz-tab--active' : ''}`}
                        onClick={() => setTab(t.id)}
                        style={{ fontSize: 13 }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'roster' && (
                <RosterTab
                    students={filtered}
                    activeCount={activeCount}
                    selectedClass={selectedClass}
                    setStudents={setStudents}
                    allStudents={students}
                />
            )}
            {tab === 'pins' && <PinsTab students={filtered} selectedClass={selectedClass} />}
            {tab === 'suivi' && <SuiviTab students={filtered} selectedClass={selectedClass} />}
            {tab === 'config' && <ConfigTab selectedClass={selectedClass} />}
        </div>
    );
}

/* ===================== ROSTER ===================== */

function RosterTab({ students, activeCount, selectedClass, setStudents, allStudents }) {
    const [showAdd, setShowAdd] = useState(false);
    const [newNom, setNewNom] = useState('');
    const [newPrenom, setNewPrenom] = useState('');
    const [newEmail, setNewEmail] = useState('');

    const toggleActive = (id) => {
        setStudents(all => all.map(s => s.id === id ? { ...s, actif: !s.actif } : s));
    };

    const addStudent = () => {
        if (!newNom.trim() || !newPrenom.trim()) return;
        const id = `new_${Date.now()}`;
        const newS = {
            id, nom: newNom.trim(), prénom: newPrenom.trim(),
            email: newEmail.trim() || `${newPrenom.toLowerCase()}.${newNom.toLowerCase()}@saintho.org`,
            classe: selectedClass, tables: '1-10', avatar: '🎯', actif: true, premiere_connexion: 'oui',
        };
        setStudents(all => [...all, newS]);
        setNewNom(''); setNewPrenom(''); setNewEmail(''); setShowAdd(false);
    };

    return (
        <div>
            <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800 }}>
                        Classe {selectedClass} — {activeCount} élève{activeCount > 1 ? 's' : ''} actif{activeCount > 1 ? 's' : ''}
                    </h3>
                    <button className="btn btn--mint" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => setShowAdd(!showAdd)}>
                        + Ajouter
                    </button>
                </div>

                {showAdd && (
                    <div style={{ background: 'var(--surface-alt)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <input placeholder="Prénom" value={newPrenom} onChange={e => setNewPrenom(e.target.value)}
                                style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)' }} />
                            <input placeholder="Nom" value={newNom} onChange={e => setNewNom(e.target.value)}
                                style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)' }} />
                        </div>
                        <input placeholder="Email (optionnel)" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '2px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', marginBottom: 8 }} />
                        <button className="btn btn--mint" style={{ width: '100%', fontSize: 14, padding: 10 }} onClick={addStudent}>
                            Ajouter l'élève
                        </button>
                    </div>
                )}

                {students.map(s => (
                    <div key={s.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
                        borderBottom: '1px solid var(--border)', opacity: s.actif ? 1 : 0.5,
                    }}>
                        <span style={{ fontSize: 24 }}>{s.avatar}</span>
                        <div style={{ flex: 1 }}>
                            <p className="font-display" style={{ fontWeight: 700, fontSize: 14 }}>
                                {s.prénom} {s.nom}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--text-soft)' }}>{s.email}</p>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-soft)', background: 'var(--surface-alt)', padding: '4px 8px', borderRadius: 8 }}>
                            ×{s.tables}
                        </span>
                        <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}
                            onClick={() => toggleActive(s.id)}
                            title={s.actif ? 'Désactiver' : 'Réactiver'}
                        >
                            {s.actif ? '✅' : '⛔'}
                        </button>
                    </div>
                ))}

                {students.length === 0 && (
                    <p style={{ textAlign: 'center', color: 'var(--text-soft)', fontWeight: 600, padding: 20 }}>
                        Aucun élève dans cette classe. Utilise « + Ajouter » pour en créer.
                    </p>
                )}
            </div>
        </div>
    );
}

function PinsTab({ students, selectedClass }) {
    const [resetting, setResetting] = useState(null);
    const [resetMsg, setResetMsg] = useState({});

    const handleResetPin = async (student) => {
        setResetting(student.id);
        setResetMsg({});
        try {
            const { api } = await import('../api.js');
            const result = await api.adminResetPin(student.email);
            setResetMsg({ [student.id]: result.ok ? '✅ Nouveau code envoyé !' : '❌ ' + (result.error || 'Erreur') });
        } catch {
            setResetMsg({ [student.id]: '✅ Code réinitialisé (démo)' });
        }
        setResetting(null);
    };

    return (
        <div className="card">
            <div style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800 }}>
                    🔑 Codes — {selectedClass}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginTop: 4 }}>
                    Les codes sont envoyés par email. Utilise « Réinitialiser » pour en générer un nouveau.
                </p>
            </div>

            {/* Info première connexion */}
            <div style={{
                background: '#EBF5FF', borderRadius: 12, padding: 14, marginBottom: 14,
                border: '1px solid #C0DAFF',
            }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
                    ℹ️ Code de première connexion : <b>3333</b>
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginTop: 4 }}>
                    Chaque élève tape 3333 lors de sa première connexion. Un code personnel unique lui est alors envoyé par email.
                </p>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 800, fontFamily: 'var(--font-display)' }}>Élève</th>
                        <th style={{ textAlign: 'center', padding: '8px 4px', fontWeight: 800, fontFamily: 'var(--font-display)' }}>Statut</th>
                        <th style={{ textAlign: 'center', padding: '8px 4px', fontWeight: 800, fontFamily: 'var(--font-display)' }}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {students.filter(s => s.actif).map(s => (
                        <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 4px' }}>
                                <span style={{ fontSize: 18, marginRight: 6 }}>{s.avatar}</span>
                                <span style={{ fontWeight: 600 }}>{s.prénom} {s.nom}</span>
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-soft)' }}>{s.email}</span>
                            </td>
                            <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                                <span style={{
                                    padding: '4px 10px', borderRadius: 8,
                                    background: s.premiere_connexion === 'oui' ? '#FFF3E0' : '#E8FFF0',
                                    color: s.premiere_connexion === 'oui' ? '#E67E00' : 'var(--mint-dk)',
                                }}>
                                    {s.premiere_connexion === 'oui' ? '⏳ En attente' : '✅ Activé'}
                                </span>
                            </td>
                            <td style={{ textAlign: 'center', padding: '10px 4px' }}>
                                <button
                                    className="btn btn--ghost"
                                    disabled={resetting === s.id}
                                    style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
                                    onClick={() => handleResetPin(s)}
                                >
                                    {resetting === s.id ? '⏳...' : '🔄 Réinitialiser'}
                                </button>
                                {resetMsg[s.id] && (
                                    <p style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: 'var(--mint-dk)' }}>
                                        {resetMsg[s.id]}
                                    </p>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <p style={{ fontSize: 12, color: 'var(--text-soft)', textAlign: 'center', marginTop: 14, fontWeight: 600 }}>
                💡 Quand tu réinitialises un code, l'ancien ne fonctionne plus. Le nouveau est envoyé par mail à l'élève.
            </p>
        </div>
    );
}

/* ===================== SUIVI ===================== */

function SuiviTab({ students, selectedClass }) {
    const [view, setView] = useState('heatmap'); // heatmap | stats

    return (
        <div>
            <div className="viz-tabs" style={{ marginBottom: 12 }}>
                <button className={`viz-tab${view === 'heatmap' ? ' viz-tab--active' : ''}`} onClick={() => setView('heatmap')}>
                    🗺 Heatmap
                </button>
                <button className={`viz-tab${view === 'stats' ? ' viz-tab--active' : ''}`} onClick={() => setView('stats')}>
                    📊 Statistiques
                </button>
            </div>

            {view === 'heatmap' && <ClassHeatmap students={students} selectedClass={selectedClass} />}
            {view === 'stats' && <ClassStats students={students} selectedClass={selectedClass} />}
        </div>
    );
}

function ClassHeatmap({ students, selectedClass }) {
    const activeStudents = students.filter(s => s.actif);
    // Maîtrise agrégée de la classe (démo : rempli aléatoirement)
    const range = ALL_TABLES.slice(0, 10); // Tables 1-10

    return (
        <div className="card">
            <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                Maîtrise de la classe {selectedClass}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 12 }}>
                Moyenne sur {activeStudents.length} élèves actifs
            </p>

            <div
                className="mastery-grid"
                style={{ gridTemplateColumns: `80px repeat(${range.length}, 1fr)` }}
            >
                {/* Header */}
                <div className="mastery-grid-hdr" style={{ fontSize: 11 }}>Élève</div>
                {range.map(c => (
                    <div key={c} className="mastery-grid-hdr">{c}</div>
                ))}

                {/* Lignes par élève */}
                {activeStudents.map(s => (
                    <React.Fragment key={s.id}>
                        <div className="mastery-grid-hdr" style={{ fontSize: 10, textAlign: 'left', justifyContent: 'flex-start' }}>
                            {s.avatar} {s.prénom.slice(0, 6)}
                        </div>
                        {range.map(t => {
                            // Simuler une maîtrise aléatoire pour la démo
                            const seed = (s.id.charCodeAt(4) + t * 7) % 5;
                            const level = seed > 3 ? 3 : seed > 1 ? 2 : seed > 0 ? 1 : 0;
                            return (
                                <div
                                    key={t}
                                    className="mastery-grid-cell"
                                    style={{ background: masteryColor(level), fontSize: 0 }}
                                    title={`${s.prénom}: table ${t} — niveau ${level}`}
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
    );
}

function ClassStats({ students, selectedClass }) {
    const activeStudents = students.filter(s => s.actif);

    return (
        <div className="card">
            <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>
                Statistiques — {selectedClass}
            </h3>

            <div className="stat-grid">
                <div className="stat">
                    <span className="stat__value" style={{ color: 'var(--navy)' }}>{activeStudents.length}</span>
                    <span className="stat__label">Élèves actifs</span>
                </div>
                <div className="stat">
                    <span className="stat__value" style={{ color: 'var(--mint-dk)' }}>73%</span>
                    <span className="stat__label">Taux moyen</span>
                </div>
                <div className="stat">
                    <span className="stat__value" style={{ color: 'var(--coral)' }}>×7, ×8</span>
                    <span className="stat__label">Tables difficiles</span>
                </div>
            </div>

            <h4 className="font-display" style={{ fontSize: 16, fontWeight: 800, marginTop: 16, marginBottom: 10 }}>
                🏆 Top de la classe
            </h4>
            {activeStudents.slice(0, 5).map((s, i) => (
                <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px',
                    borderBottom: '1px solid var(--border)',
                }}>
                    <span className="font-display" style={{ fontWeight: 800, fontSize: 16, width: 24, textAlign: 'center', color: i < 3 ? 'var(--gold)' : 'var(--text-soft)' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </span>
                    <span style={{ fontSize: 22 }}>{s.avatar}</span>
                    <p className="font-display" style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>
                        {s.prénom} {s.nom}
                    </p>
                    <span className="font-display" style={{ fontWeight: 800, color: 'var(--mint-dk)', fontSize: 16 }}>
                        {Math.floor(60 + Math.random() * 35)}%
                    </span>
                </div>
            ))}

            <h4 className="font-display" style={{ fontSize: 16, fontWeight: 800, marginTop: 16, marginBottom: 10 }}>
                ⚠️ Élèves en difficulté
            </h4>
            <div style={{ background: '#FFF8F0', borderRadius: 12, padding: 14, border: '1px solid #FFE0C0' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--coral-dk)' }}>
                    2 élèves en dessous de 50% de maîtrise
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginTop: 4 }}>
                    💡 Conseil : assigner une révision ciblée sur les tables 7 et 8
                </p>
            </div>
        </div>
    );
}

/* ===================== CONFIG ===================== */

function ConfigTab({ selectedClass }) {
    const [authMode, setAuthMode] = useState('pin');
    const [maxTable, setMaxTable] = useState(10);
    const [defiEnabled, setDefiEnabled] = useState(true);

    return (
        <div>
            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
                    🔐 Mode d'authentification
                </h3>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className={`chip${authMode === 'pin' ? ' chip--navy' : ''}`} style={{ flex: 1, width: 'auto', fontSize: 14, height: 44 }} onClick={() => setAuthMode('pin')}>
                        🔑 PIN
                    </button>
                    <button className={`chip${authMode === 'google' ? ' chip--navy' : ''}`} style={{ flex: 1, width: 'auto', fontSize: 14, height: 44 }} onClick={() => setAuthMode('google')}>
                        🔗 Google
                    </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginTop: 8 }}>
                    {authMode === 'pin'
                        ? '✅ Mode PIN : pas de dépendance Google, compatible MDM strict'
                        : '⚠️ Mode Google : nécessite le whitelisting des domaines Google dans Jamf'}
                </p>
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
                    📐 Tables autorisées — {selectedClass}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 10 }}>
                    Les élèves ne verront que les tables 1 à {maxTable}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                    {[10, 12, 15].map(n => (
                        <button
                            key={n}
                            className={`chip${maxTable === n ? ' chip--gold' : ''}`}
                            style={{ flex: 1, width: 'auto', fontSize: 16, height: 50 }}
                            onClick={() => setMaxTable(n)}
                        >
                            1-{n}
                        </button>
                    ))}
                </div>
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
                    ⚔️ Défis
                </h3>
                <label className="commutative-toggle" onClick={() => setDefiEnabled(!defiEnabled)}>
                    <input type="checkbox" checked={defiEnabled} readOnly />
                    Activer les défis entre élèves
                </label>
                {!defiEnabled && (
                    <p style={{ fontSize: 12, color: 'var(--coral)', fontWeight: 700, marginTop: 6 }}>
                        Les élèves ne pourront pas créer ni rejoindre de défis
                    </p>
                )}
            </div>

            <div className="card">
                <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
                    🗄 Base de données
                </h3>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn--ghost" style={{ flex: 1, fontSize: 13, padding: 12 }}>
                        📥 Exporter CSV
                    </button>
                    <button className="btn btn--ghost" style={{ flex: 1, fontSize: 13, padding: 12, color: 'var(--coral)' }}>
                        🗑 RAZ année
                    </button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, marginTop: 8, textAlign: 'center' }}>
                    La RAZ supprime toutes les sessions et remet la maîtrise à zéro
                </p>
            </div>
        </div>
    );
}
