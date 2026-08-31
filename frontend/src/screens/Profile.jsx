import React, { useState, useEffect, useCallback } from 'react';
import { monProfil, monProfilProf, mesTablesFaibles, changerAvatar, listeClasses, definirMesClasses } from '../api';
import { masteryColor, cleFait } from '../logic/mastery';

/**
 * Profile — Aiguille vers ProfileEleve ou ProfileProf selon identite.type
 */
export default function Profile({ onBack, identite, estProf, onLogout, onReviser, onGo }) {
    const isProf = estProf || identite?.type === 'prof';
    if (isProf) {
        return <ProfileProf onBack={onBack} onLogout={onLogout} onGo={onGo} />;
    }
    return <ProfileEleve onBack={onBack} identite={identite} onLogout={onLogout} onReviser={onReviser} />;
}

/* ===================================================================
 * PROFIL ENSEIGNANT
 * ================================================================= */
function ProfileProf({ onBack, onLogout, onGo }) {
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);
    const [profil, setProfil] = useState(null);
    const [records, setRecords] = useState(null);
    const [rang, setRang] = useState(null);
    const [allClasses, setAllClasses] = useState([]);
    const [editingClasses, setEditingClasses] = useState(false);
    const [selectedClasses, setSelectedClasses] = useState([]);
    const [savingClasses, setSavingClasses] = useState(false);
    const [msgClasses, setMsgClasses] = useState('');

    const charger = useCallback(async () => {
        setLoading(true);
        setErreur(null);
        const res = await monProfilProf();
        if (!res.ok) {
            setErreur(res.error || 'Impossible de charger le profil enseignant.');
            setLoading(false);
            return;
        }
        const d = res.data;
        setProfil(d.profil);
        setRecords(d.records);
        setRang(d.rang_salle_des_profs);
        setSelectedClasses(d.profil?.classes || []);

        const cRes = await listeClasses();
        if (cRes.ok && cRes.data) {
            setAllClasses(cRes.data);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        charger();
    }, [charger]);

    const handleSaveClasses = async () => {
        setSavingClasses(true);
        setMsgClasses('');
        const res = await definirMesClasses(selectedClasses);
        if (res.ok) {
            setProfil(prev => ({ ...prev, classes: selectedClasses }));
            setEditingClasses(false);
            setMsgClasses('✅ Classes enregistrées');
            setTimeout(() => setMsgClasses(''), 3000);
        } else {
            setMsgClasses(`❌ ${res.error || "Erreur d'enregistrement"}`);
        }
        setSavingClasses(false);
    };

    const toggleClass = (c) => {
        setSelectedClasses(prev =>
            prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
        );
    };

    if (loading) {
        return (
            <div className="screen-enter" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: '50vh', gap: 16,
            }}>
                <div className="spinner" />
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                    Chargement du profil…
                </p>
            </div>
        );
    }

    if (erreur) {
        return (
            <div className="screen-enter" style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--coral)', fontWeight: 700, fontSize: 16 }}>{erreur}</p>
                <button className="btn btn--ghost" style={{ marginTop: 16 }} onClick={onBack}>
                    ‹ Retour
                </button>
            </div>
        );
    }

    const nbSessions = records?.nb_sessions || 0;

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            {/* 1. Identité */}
            <div className="card" style={{ textAlign: 'center', marginBottom: 14, padding: '20px 16px' }}>
                <div style={{ fontSize: 56, marginBottom: 8 }}>
                    👨‍🏫
                </div>
                <h2 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>
                    {profil?.nom || 'Professeur'}
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 10 }}>
                    {profil?.email || ''}
                </p>
                <span
                    className={`chip${profil?.est_admin ? ' chip--gold' : ''}`}
                    style={{ fontSize: 12, height: 28, padding: '0 14px' }}
                >
                    {profil?.est_admin ? '👑 Administrateur' : '📚 Enseignant'}
                </span>
            </div>

            {/* 2. Mes parties */}
            <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800 }}>
                        🎮 Mes parties
                    </h3>
                    {rang && (
                        <span className="chip chip--gold" style={{ fontSize: 12, fontWeight: 800 }}>
                            🏅 {rang}ᵉ en salle des profs
                        </span>
                    )}
                </div>

                {nbSessions === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                        <p style={{ color: 'var(--text-soft)', fontWeight: 600, fontSize: 14, marginBottom: 14 }}>
                            Tu n'as pas encore joué.
                        </p>
                        <button
                            className="btn btn--mint"
                            style={{ fontSize: 15, padding: '10px 24px' }}
                            onClick={() => onGo?.('play')}
                        >
                            🚀 S'entraîner
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="stat-grid" style={{ marginBottom: 14 }}>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--mint-dk)' }}>
                                    {records?.points_total || 0}
                                </span>
                                <span className="stat__label">
                                    💰 Points total {records?.points_semaine > 0 ? `(+${records.points_semaine} 7j)` : ''}
                                </span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--navy)' }}>
                                    {records?.nb_sessions || 0}
                                </span>
                                <span className="stat__label">📊 Parties jouées</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--coral)' }}>
                                    {records?.meilleure_serie || 0}
                                </span>
                                <span className="stat__label">🔥 Meilleure série</span>
                            </div>
                            {records?.meilleur_sprint > 0 && (
                                <div className="stat">
                                    <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>
                                        {records.meilleur_sprint}s
                                    </span>
                                    <span className="stat__label">⚡ Meilleur sprint</span>
                                </div>
                            )}
                            {records?.meilleur_chrono > 0 && (
                                <div className="stat">
                                    <span className="stat__value" style={{ color: 'var(--gold)' }}>
                                        {records.meilleur_chrono}
                                    </span>
                                    <span className="stat__label">⏱️ Meilleur chrono</span>
                                </div>
                            )}
                            {records?.plus_haute_table > 0 && (
                                <div className="stat">
                                    <span className="stat__value" style={{ color: 'var(--purple)' }}>
                                        {records.plus_haute_table}
                                    </span>
                                    <span className="stat__label">🏔️ Plus haute table</span>
                                </div>
                            )}
                        </div>
                        <button
                            className="btn btn--mint"
                            style={{ width: '100%', fontSize: 14, padding: '10px 16px' }}
                            onClick={() => onGo?.('play')}
                        >
                            🚀 S'entraîner
                        </button>
                    </>
                )}
            </div>

            {/* 3. Mes classes habituelles */}
            <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800 }}>
                        🗺 Mes classes habituelles
                    </h3>
                    {!editingClasses && (
                        <button
                            className="btn btn--ghost"
                            style={{ fontSize: 13, padding: '6px 12px' }}
                            onClick={() => {
                                setSelectedClasses(profil?.classes || []);
                                setEditingClasses(true);
                            }}
                        >
                            ✏️ Modifier
                        </button>
                    )}
                </div>

                {msgClasses && (
                    <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: msgClasses.startsWith('❌') ? 'var(--coral)' : 'var(--mint-dk)' }}>
                        {msgClasses}
                    </p>
                )}

                {!editingClasses ? (
                    profil?.classes?.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {profil.classes.map(c => (
                                <span key={c} className="chip chip--mint" style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px' }}>
                                    {c}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-soft)', fontSize: 13, fontWeight: 600 }}>
                            Aucune classe favorite. Tu les vois toutes.
                        </p>
                    )
                ) : (
                    <div>
                        <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 10 }}>
                            Sélectionne tes classes favorites :
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                            {allClasses.length === 0 ? (
                                <p style={{ fontSize: 12, color: 'var(--text-soft)' }}>Aucune classe disponible</p>
                            ) : (
                                allClasses.map(cl => {
                                    const code = cl.classe;
                                    const selected = selectedClasses.includes(code);
                                    return (
                                        <button
                                            key={code}
                                            type="button"
                                            onClick={() => toggleClass(code)}
                                            className={`chip ${selected ? 'chip--mint' : ''}`}
                                            style={{
                                                fontSize: 13,
                                                fontWeight: 700,
                                                padding: '6px 12px',
                                                cursor: 'pointer',
                                                border: selected ? '2px solid var(--mint)' : '2px solid var(--border)',
                                                background: selected ? 'var(--mint-lt)' : 'var(--surface)',
                                            }}
                                        >
                                            {selected ? '✓ ' : ''}{code}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                className="btn btn--mint"
                                style={{ flex: 1, fontSize: 13, padding: '8px 14px' }}
                                disabled={savingClasses}
                                onClick={handleSaveClasses}
                            >
                                {savingClasses ? 'Enregistrement…' : 'Enregistrer'}
                            </button>
                            <button
                                className="btn btn--ghost"
                                style={{ flex: 1, fontSize: 13, padding: '8px 14px' }}
                                disabled={savingClasses}
                                onClick={() => setEditingClasses(false)}
                            >
                                Annuler
                            </button>
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

/* ===================================================================
 * PROFIL ÉLÈVE
 * ================================================================= */
const BADGE_DEFS = {
    streak_10: { emoji: '🔥', name: 'Flamme', desc: 'Série de 10 sans faute' },
    streak_20: { emoji: '🔥🔥', name: 'Brasier', desc: 'Série de 20 sans faute' },
    streak_30: { emoji: '🌋', name: 'Volcan', desc: 'Série de 30 sans faute' },
    streak_50: { emoji: '☄️', name: 'Météore', desc: 'Série de 50 sans faute' },
    streak_100: { emoji: '💫', name: 'Légende', desc: 'Série de 100 sans faute' },
    speed_3s: { emoji: '⚡', name: 'Rapide', desc: 'Moyenne < 3s / question' },
    speed_2s: { emoji: '⚡⚡', name: 'Éclair', desc: 'Moyenne < 2s / question' },
    days_3: { emoji: '📅', name: 'Régulier', desc: '3 jours cette semaine' },
    days_7: { emoji: '🗓', name: 'Assidu', desc: '7 jours cette semaine' },
    climb_10: { emoji: '🧗', name: 'Grimpeur', desc: 'Table 10 en Montée' },
    climb_12: { emoji: '🧗‍♂️', name: 'Alpiniste', desc: 'Table 12 en Montée' },
    climb_15: { emoji: '🏔', name: 'Sommet', desc: 'Table 15 en Montée' },
    climb_20: { emoji: '🏔🏔', name: 'Légende des tables', desc: 'Table 20 en Montée' },
};

const AVATAR_OPTIONS = ['🎯', '🌟', '🚀', '⚡', '🌈', '🦋', '🎸', '🌸', '🐱', '🐶', '🦊', '🐻', '🎨', '⚽', '🏀', '🎮', '📚', '🧪', '🔬', '🎵'];

const PALIER_STYLE = {
    decouverte: { label: 'Découverte', emoji: '🌱', color: 'var(--sky)', bg: 'rgba(77, 168, 218, 0.12)' },
    confirme:   { label: 'Confirmé',   emoji: '⭐', color: 'var(--navy)', bg: 'rgba(26, 35, 75, 0.10)' },
    expert:     { label: 'Expert',     emoji: '🏆', color: 'var(--gold)', bg: 'rgba(201, 162, 39, 0.12)' },
};

function ProfileEleve({ onBack, identite, onLogout, onReviser }) {
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);
    const [profil, setProfil] = useState(null);
    const [records, setRecords] = useState(null);
    const [maitrise, setMaitrise] = useState({});
    const [badges, setBadges] = useState([]);
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [avatar, setAvatar] = useState(identite?.profil?.avatar_emoji || '🎯');
    const [showMastery, setShowMastery] = useState(true);
    const [tablesFaibles, setTablesFaibles] = useState(null);
    const [progression, setProgression] = useState(null);

    // --- Chargement du profil ---
    useEffect(() => {
        let annule = false;
        async function charger() {
            setLoading(true);
            setErreur(null);
            const res = await monProfil();
            if (annule) return;
            if (!res.ok) {
                setErreur(res.error || 'Impossible de charger le profil.');
                setLoading(false);
                return;
            }
            const d = res.data;
            setProfil(d.profil);
            setRecords(d.records);
            setMaitrise(d.maitrise || {});
            setBadges(d.badges || []);
            setProgression(d.progression || null);
            setAvatar(d.profil?.avatar_emoji || '🎯');
            setLoading(false);

            // Charger les tables faibles en arrière-plan
            const tf = await mesTablesFaibles();
            if (!annule && tf.ok) {
                setTablesFaibles(tf.data || []);
            }
        }
        charger();
        return () => { annule = true; };
    }, []);

    // --- Changement d'avatar ---
    const handleAvatar = useCallback(async (emoji) => {
        setAvatar(emoji);
        setShowAvatarPicker(false);
        await changerAvatar(emoji);
    }, []);

    // --- Réviser les cases rouges ---
    const handleReviser = useCallback(() => {
        if (tablesFaibles && tablesFaibles.length > 0) {
            onReviser(tablesFaibles);
        }
    }, [tablesFaibles, onReviser]);

    // --- Chargement ---
    if (loading) {
        return (
            <div className="screen-enter" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: '50vh', gap: 16,
            }}>
                <div className="spinner" />
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                    Chargement du profil…
                </p>
            </div>
        );
    }

    if (erreur) {
        return (
            <div className="screen-enter" style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--coral)', fontWeight: 700, fontSize: 16 }}>{erreur}</p>
                <button className="btn btn--ghost" style={{ marginTop: 16 }} onClick={onBack}>
                    ‹ Retour
                </button>
            </div>
        );
    }

    const plafond = profil?.plafond_tables || 10;
    const palierKey = profil?.palier || 'decouverte';
    const palier = PALIER_STYLE[palierKey] || PALIER_STYLE.decouverte;

    // Grille dimensionnée sur le plafond (1..plafond × 1..plafond)
    const gridTables = [];
    for (let i = 1; i <= plafond; i++) gridTables.push(i);

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            {/* Carte identité */}
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
                                onClick={() => handleAvatar(a)}
                            >
                                {a}
                            </button>
                        ))}
                    </div>
                )}

                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800 }}>
                    {profil?.prenom} {profil?.nom}
                </h2>
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                    {profil?.classe || ''} — {profil?.email || ''}
                </p>

                {/* Palier */}
                <span style={{
                    display: 'inline-block', padding: '6px 16px', borderRadius: 20,
                    fontWeight: 800, fontSize: 14,
                    color: palier.color, background: palier.bg,
                    border: `2px solid ${palier.color}`,
                }}>
                    {palier.emoji} {palier.label}
                </span>
                <p style={{ color: 'var(--text-soft)', fontSize: 12, fontWeight: 600, marginTop: 6 }}>
                    Tables débloquées : 1 à {plafond}
                </p>
            </div>

            {/* ===== Cette semaine ===== */}
            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
                    📈 Cette semaine
                </h3>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 12 }}>
                    Le classement repart à zéro chaque lundi — tout le monde a sa chance.
                </p>

                {progression ? (
                    <>
                        {/* Score principal */}
                        <div style={{
                            textAlign: 'center', marginBottom: 14, padding: '16px 0',
                            background: 'linear-gradient(135deg, rgba(201,162,39,0.10), rgba(201,162,39,0.03))',
                            borderRadius: 14,
                        }}>
                            <div className="font-display" style={{ fontSize: 36, fontWeight: 800, color: 'var(--gold)' }}>
                                {progression.total ?? 0}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-soft)' }}>
                                Score de progression
                            </div>
                        </div>

                        {/* Composantes */}
                        <div className="stat-grid">
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--navy)' }}>
                                    {progression.points_jeu ?? 0}
                                </span>
                                <span className="stat__label">🎮 Points de jeu</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>
                                    +{progression.bonus_jours ?? 0}
                                </span>
                                <span className="stat__label">📅 {progression.jours_actifs ?? 0} jour{(progression.jours_actifs ?? 0) > 1 ? 's' : ''} actif{(progression.jours_actifs ?? 0) > 1 ? 's' : ''}</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--mint-dk)' }}>
                                    +{progression.bonus_vertes ?? 0}
                                </span>
                                <span className="stat__label">🟢 {progression.cases_vertes ?? 0} case{(progression.cases_vertes ?? 0) > 1 ? 's' : ''} verte{(progression.cases_vertes ?? 0) > 1 ? 's' : ''}</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="stat-grid">
                        <div className="stat">
                            <span className="stat__value" style={{ color: 'var(--mint)' }}>
                                {records?.points_semaine || 0}
                            </span>
                            <span className="stat__label">📈 Points semaine</span>
                        </div>
                        <div className="stat">
                            <span className="stat__value" style={{ color: 'var(--sky)' }}>
                                {records?.jours_actifs_7j || 0}
                            </span>
                            <span className="stat__label">📅 Jours actifs (7j)</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ===== Depuis toujours ===== */}
            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
                    🏆 Depuis toujours
                </h3>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 12 }}>
                    Tes records personnels — ça ne recule jamais.
                </p>
                <div className="stat-grid">
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--coral)' }}>
                            {records?.meilleure_serie || 0}
                        </span>
                        <span className="stat__label">🔥 Meilleure série</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>
                            {records?.meilleur_chrono || 0}
                        </span>
                        <span className="stat__label">⏱ Score 2 min</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--purple)' }}>
                            {records?.plus_haute_table || 0}
                        </span>
                        <span className="stat__label">🧗 Plus haute table</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--navy)' }}>
                            {records?.nb_sessions || 0}
                        </span>
                        <span className="stat__label">📊 Sessions jouées</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--gold)' }}>
                            {records?.points_total || 0}
                        </span>
                        <span className="stat__label">💰 Points total</span>
                    </div>
                </div>
            </div>

            {/* Badges */}
            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
                    🏅 Mes badges
                </h3>

                {/* Badges obtenus */}
                {badges.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                        {badges.map(id => {
                            const badge = BADGE_DEFS[id];
                            if (!badge) return null;
                            return (
                                <div key={id} className="anim-pop" style={{
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
                {Object.keys(BADGE_DEFS).some(id => !badges.includes(id)) && (
                    <>
                        <p style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 8 }}>
                            À débloquer :
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {Object.entries(BADGE_DEFS)
                                .filter(([id]) => !badges.includes(id))
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
                    </>
                )}
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
                            style={{ gridTemplateColumns: `30px repeat(${gridTables.length}, 1fr)` }}
                        >
                            <div className="mastery-grid-hdr">×</div>
                            {gridTables.map(c => (
                                <div key={c} className="mastery-grid-hdr">{c}</div>
                            ))}
                            {gridTables.map(r => (
                                <React.Fragment key={r}>
                                    <div className="mastery-grid-hdr">{r}</div>
                                    {gridTables.map(c => {
                                        const key = cleFait(r, c);
                                        return (
                                            <div
                                                key={c}
                                                className="mastery-grid-cell"
                                                style={{ background: masteryColor(maitrise[key]) }}
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

                        {/* Bouton « Réviser mes cases rouges » */}
                        <div style={{ textAlign: 'center', marginTop: 14 }}>
                            {tablesFaibles === null ? (
                                <p style={{ fontSize: 13, color: 'var(--text-soft)' }}>Chargement…</p>
                            ) : tablesFaibles.length === 0 ? (
                                <p style={{
                                    fontSize: 15, fontWeight: 700, color: 'var(--mint)',
                                    padding: '10px 0',
                                }}>
                                    Aucune case rouge — bravo ! 🎉
                                </p>
                            ) : (
                                <button
                                    className="btn btn--coral"
                                    style={{ fontSize: 16, padding: '12px 24px' }}
                                    onClick={handleReviser}
                                >
                                    Réviser mes cases rouges 🔴
                                </button>
                            )}
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
