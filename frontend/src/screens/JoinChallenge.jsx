import React, { useState, useEffect, useCallback } from 'react';
import { rejoindreDefi, avancementDefi, classementDefi } from '../api';
import { clavierAutorise } from '../logic/saisie';
import { formaterDuree } from '../logic/duree';

/**
 * JoinChallenge — Écrans 33 & 34 (Refonte v10)
 *
 * Écran 33 : Saisie du code à 5 caractères.
 * - Clavier virtuel 31 touches (alphabet ABCDEFGHJKMNPQRSTUVWXYZ23456789, sans I, L, O)
 *   organisé en 4 rangées équilibrées de 8 touches avec la touche effacer ⌫.
 * - Écouteur clavier physique pour saisie instantanée sur Mac / iPad avec clavier.
 * - Le curseur avance automatiquement.
 * - Bouton « Valider le code » s'active à 5 caractères.
 *
 * Écran 34 : Défi trouvé (« C'est parti ») et les trois refus distincts :
 * - inconnu : « Ce code ne correspond à aucun défi » + Bouton Ressaisir.
 * - ferme : « Ce défi est terminé » + Bouton Ressaisir.
 * - deja_joue : « Tu as déjà joué ce défi » + score/temps + Bouton « Voir le classement ».
 */

const KEYBOARD_ROWS = [
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    ['J', 'K', 'M', 'N', 'P', 'Q', 'R', 'S'],
    ['T', 'U', 'V', 'W', 'X', 'Y', 'Z', '⌫'],
    ['2', '3', '4', '5', '6', '7', '8', '9'],
];

const ALLOWED_CHARS = new Set('ABCDEFGHJKMNPQRSTUVWXYZ23456789'.split(''));

function formaterTemps(tempsS) {
    if (!tempsS && tempsS !== 0) return '';
    const m = Math.floor(tempsS / 60);
    const s = Math.round(tempsS % 60);
    if (m === 0) return `${s} s`;
    return `${m} min ${s < 10 ? '0' : ''}${s}`;
}

function formatTablesLabel(tbls) {
    if (!tbls || !tbls.length) return 'Toutes les tables';
    const sorted = [...tbls].sort((a, b) => a - b);
    if (sorted.length > 2) {
        const isContiguous = sorted.every((t, i) => i === 0 || t === sorted[i - 1] + 1);
        if (isContiguous) {
            return `tables ${sorted[0]} à ${sorted[sorted.length - 1]}`;
        }
    }
    if (sorted.length === 1) return `table de ${sorted[0]}`;
    return `tables ${sorted.slice(0, -1).join(', ')} et ${sorted[sorted.length - 1]}`;
}

export default function JoinChallenge({ onBack, onStartDefi, onViewDefi }) {
    const [code, setCode] = useState('');
    const [status, setStatus] = useState('saisie'); // 'saisie' | 'valide' | 'inconnu' | 'ferme' | 'deja_joue'
    const [defiData, setDefiData] = useState(null);
    const [moiResult, setMoiResult] = useState(null);
    const [loading, setLoading] = useState(false);

    // --- Gestion des touches virtuelles ---
    const handleKeyTap = useCallback((key) => {
        if (key === '⌫') {
            setCode(prev => prev.slice(0, -1));
            setStatus('saisie');
        } else if (ALLOWED_CHARS.has(key) && code.length < 5) {
            setCode(prev => (prev + key).slice(0, 5));
            setStatus('saisie');
        }
    }, [code.length]);

    // --- Validation du code ---
    const handleValider = useCallback(async () => {
        if (code.length < 5 || loading) return;
        setLoading(true);
        try {
            const res = await rejoindreDefi(code);
            if (res.ok && res.data) {
                const d = res.data;
                let termines = 0;
                try {
                    const resAvance = await avancementDefi(d.defi_id);
                    if (resAvance.ok && resAvance.data) {
                        termines = resAvance.data.termines ?? 0;
                    }
                } catch {
                    // Repli propre
                }
                setDefiData({ ...d, code: code.trim().toUpperCase(), termines });
                setStatus('valide');
            } else {
                const raison = res.data?.raison || res.raison || 'inconnu';
                if (raison === 'deja_joue') {
                    const defiId = res.data?.defi_id || res.defi_id;
                    let moi = null;
                    if (defiId) {
                        try {
                            const resClassement = await classementDefi(defiId);
                            if (resClassement.ok && Array.isArray(resClassement.data)) {
                                moi = resClassement.data.find(r => r.est_moi) || null;
                            }
                        } catch {}
                    }
                    setMoiResult(moi);
                    setDefiData({ defi_id: defiId, code: code.trim().toUpperCase(), ...(res.data || {}) });
                    setStatus('deja_joue');
                } else if (raison === 'ferme') {
                    setStatus('ferme');
                } else {
                    setStatus('inconnu');
                }
            }
        } catch {
            setStatus('inconnu');
        } finally {
            setLoading(false);
        }
    }, [code, loading]);

    // --- Écouteur clavier physique (iPad Magic Keyboard, Mac, PC) ---
    useEffect(() => {
        function handleKeyDown(e) {
            if (status !== 'saisie') return;
            if (e.key === 'Backspace') {
                e.preventDefault();
                setCode(prev => prev.slice(0, -1));
            } else if (e.key === 'Enter') {
                if (code.length === 5) {
                    e.preventDefault();
                    handleValider();
                }
            } else {
                const upper = e.key.toUpperCase();
                if (ALLOWED_CHARS.has(upper) && code.length < 5) {
                    e.preventDefault();
                    setCode(prev => (prev + upper).slice(0, 5));
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [code, status, handleValider]);

    const handleRessaisir = () => {
        setStatus('saisie');
        setCode('');
    };

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: '80vh' }}>
            {/* Barre haute : retour + titre */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 8 }}>
                <button
                    onClick={onBack}
                    style={{
                        width: 52, height: 52, borderRadius: 16, background: 'var(--surface)',
                        boxShadow: 'var(--ombre-carte)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0,
                    }}
                    title="Retour"
                >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="M15 5 8 12l7 7" stroke="var(--indigo)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <h2 className="font-display" style={{ margin: 0, fontSize: 32, fontWeight: 700, color: 'var(--indigo)' }}>
                    Rejoindre un défi
                </h2>
            </div>

            {/* Sous-titre indicatif */}
            <div style={{ fontFamily: 'var(--texte)', fontSize: 19, lineHeight: 1.45, fontWeight: 600, color: 'var(--gris)' }}>
                Saisis le code à 5 lettres affiché au tableau, ou donné par un ami.
            </div>

            {/* ÉCRAN 34 : Défi trouvé (succès) */}
            {status === 'valide' && defiData && (
                <div style={{
                    background: 'var(--ciel)', borderRadius: 28, padding: '30px clamp(16px, 3vw, 30px)',
                    display: 'flex', flexDirection: 'column', gap: 22, boxShadow: 'var(--ombre-carte)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                            width: 54, height: 54, borderRadius: 17, background: 'rgba(255, 255, 255, 0.22)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                <path d="M5 12.5 10 17.5 19 7" stroke="var(--action-texte)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <div className="font-display" style={{ fontSize: 30, fontWeight: 700, color: 'var(--action-texte)' }}>
                                Défi trouvé
                            </div>
                            <div style={{ fontFamily: 'var(--texte)', fontSize: 18, fontWeight: 600, color: 'var(--ciel-pale)', letterSpacing: '0.18em' }}>
                                {code.split('').join(' ')}
                            </div>
                        </div>
                    </div>

                    <div style={{
                        background: 'rgba(255, 255, 255, 0.14)', borderRadius: 20, padding: 22,
                        display: 'flex', flexDirection: 'column', gap: 14,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={{ width: 130, fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--ciel-pale)' }}>Créé par</span>
                            <span style={{ fontFamily: 'var(--texte)', fontSize: 21, fontWeight: 700, color: 'var(--action-texte)' }}>{defiData.auteur_nom || 'Professeur'}</span>
                        </div>
                        <div style={{ height: 2, background: 'rgba(255, 255, 255, 0.16)' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={{ width: 130, fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--ciel-pale)' }}>Mode</span>
                            <span style={{ fontFamily: 'var(--texte)', fontSize: 21, fontWeight: 700, color: 'var(--action-texte)' }}>
                                {defiData.type === 'countdown'
                                    ? `Contre‑la‑montre · ${formaterDuree(defiData.duree_s || 60)}`
                                    : `Sprint · ${Array.isArray(defiData.questions) ? defiData.questions.length : (typeof defiData.questions === 'number' ? defiData.questions : 20)} questions`}
                            </span>
                        </div>
                        <div style={{ height: 2, background: 'rgba(255, 255, 255, 0.16)' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={{ width: 130, fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--ciel-pale)' }}>Tables</span>
                            <span style={{ fontFamily: 'var(--texte)', fontSize: 21, fontWeight: 700, color: 'var(--action-texte)' }}>{formatTablesLabel(defiData.tables)}</span>
                        </div>
                        <div style={{ height: 2, background: 'rgba(255, 255, 255, 0.16)' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={{ width: 130, fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--ciel-pale)' }}>Classe</span>
                            <span style={{ fontFamily: 'var(--texte)', fontSize: 21, fontWeight: 700, color: 'var(--action-texte)' }}>
                                {defiData.classe ? `${String(defiData.classe).replace(/([0-9]+)e?([A-Z])/i, '$1ᵉ$2')} · ` : ''}{defiData.termines} ont déjà joué
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={() => onStartDefi?.(defiData)}
                        style={{
                            height: 88, borderRadius: 26, background: 'var(--vert)', border: 'none',
                            color: 'var(--action-texte)', fontFamily: 'var(--texte)', fontWeight: 700,
                            fontSize: 28, cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        C'est parti
                    </button>
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--ciel-pale)', textAlign: 'center' }}>
                        Seul ton premier essai compte au classement.
                    </div>
                    {!clavierAutorise(defiData?.type) && (
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 14, fontWeight: 600, color: 'var(--ciel-pale)', textAlign: 'center', opacity: 0.9 }}>
                            Sur cette partie, on répond au doigt — pour que tout le monde soit à égalité.
                        </div>
                    )}
                </div>
            )}

            {/* ÉCRAN 34 : Refus — Déjà joué */}
            {status === 'deja_joue' && (
                <div style={{
                    background: 'var(--surface)', borderRadius: 24, boxShadow: 'var(--ombre-carte)',
                    padding: 24, display: 'flex', alignItems: 'center', gap: 18,
                }}>
                    <div style={{ width: 10, alignSelf: 'stretch', borderRadius: 5, background: 'var(--orange)', flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                        <div className="font-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--indigo)' }}>
                            Tu as déjà joué ce défi
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--gris)' }}>
                            {moiResult
                                ? `Ton résultat est enregistré : ${moiResult.score} point${moiResult.score > 1 ? 's' : ''}, en ${formaterTemps(moiResult.temps_s)}.`
                                : 'Ton résultat est déjà enregistré pour ce défi.'}
                        </div>
                    </div>
                    <button
                        onClick={() => onViewDefi?.(defiData?.defi_id)}
                        style={{
                            marginLeft: 'auto', height: 60, padding: '0 22px', borderRadius: 17,
                            background: 'var(--ciel)', color: 'var(--action-texte)', border: 'none',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', flexShrink: 0,
                        }}
                    >
                        Voir le classement
                    </button>
                </div>
            )}

            {/* ÉCRAN 34 : Refus — Code inconnu */}
            {status === 'inconnu' && (
                <div style={{
                    background: 'var(--surface)', borderRadius: 24, boxShadow: 'var(--ombre-carte)',
                    padding: 24, display: 'flex', alignItems: 'center', gap: 18,
                }}>
                    <div style={{ width: 10, alignSelf: 'stretch', borderRadius: 5, background: 'var(--rouge)', flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                        <div className="font-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--indigo)' }}>
                            Ce code ne correspond à aucun défi
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--gris)' }}>
                            Vérifie les lettres au tableau — un défi expire 24 h après sa création.
                        </div>
                    </div>
                    <button
                        onClick={handleRessaisir}
                        style={{
                            marginLeft: 'auto', height: 60, padding: '0 22px', borderRadius: 17,
                            background: 'var(--surface)', border: '2px solid var(--bordure)',
                            color: 'var(--indigo)', fontFamily: 'var(--texte)', fontWeight: 700,
                            fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center',
                            whiteSpace: 'nowrap', flexShrink: 0,
                        }}
                    >
                        Ressaisir
                    </button>
                </div>
            )}

            {/* ÉCRAN 34 : Refus — Défi fermé / expiré */}
            {status === 'ferme' && (
                <div style={{
                    background: 'var(--surface)', borderRadius: 24, boxShadow: 'var(--ombre-carte)',
                    padding: 24, display: 'flex', alignItems: 'center', gap: 18,
                }}>
                    <div style={{ width: 10, alignSelf: 'stretch', borderRadius: 5, background: 'var(--rouge)', flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                        <div className="font-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--indigo)' }}>
                            Ce défi est terminé
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--gris)' }}>
                            Ce défi est fermé ou a expiré. Demande un nouveau code à ton professeur.
                        </div>
                    </div>
                    <button
                        onClick={handleRessaisir}
                        style={{
                            marginLeft: 'auto', height: 60, padding: '0 22px', borderRadius: 17,
                            background: 'var(--surface)', border: '2px solid var(--bordure)',
                            color: 'var(--indigo)', fontFamily: 'var(--texte)', fontWeight: 700,
                            fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center',
                            whiteSpace: 'nowrap', flexShrink: 0,
                        }}
                    >
                        Ressaisir
                    </button>
                </div>
            )}

            {/* ÉCRAN 33 : Les 5 cases de saisie */}
            <div style={{ display: 'flex', gap: 14, paddingTop: 10 }}>
                {[0, 1, 2, 3, 4].map(idx => {
                    const isActive = idx === code.length && status === 'saisie';
                    const char = code[idx] || '';
                    return (
                        <div
                            key={idx}
                            className="font-display"
                            style={{
                                flex: 1, aspectRatio: '1 / 1.28',
                                background: 'var(--surface)', borderRadius: 22,
                                border: isActive ? '4px solid var(--ciel)' : '4px solid var(--bordure)',
                                boxShadow: isActive ? '0 0 0 5px var(--ciel-pale)' : 'none',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 'clamp(36px, 6.5vw, 68px)', fontWeight: 700,
                                color: 'var(--indigo)', transition: 'border-color 0.2s, box-shadow 0.2s',
                            }}
                        >
                            {char}
                        </div>
                    );
                })}
            </div>

            <div style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--gris)', textAlign: 'center' }}>
                {code.length} {code.length > 1 ? 'lettres' : 'lettre'} sur 5 · le curseur avance tout seul
            </div>

            <div style={{ flex: 1 }} />

            {/* ÉCRAN 33 : Clavier virtuel 31 touches (sans I, L, O, avec 2-9 et ⌫) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 10 }}>
                {KEYBOARD_ROWS.map((row, rIdx) => (
                    <div key={rIdx} style={{ display: 'flex', gap: 8 }}>
                        {row.map(k => {
                            const isBackspace = k === '⌫';
                            return (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => handleKeyTap(k)}
                                    style={{
                                        flex: 1, height: 'clamp(54px, 7.5vh, 88px)',
                                        background: isBackspace ? 'var(--ivoire)' : 'var(--surface)',
                                        borderRadius: 16,
                                        boxShadow: isBackspace ? 'none' : '0 4px 12px rgba(32, 34, 107, 0.08)',
                                        border: isBackspace ? '1px solid var(--bordure)' : 'none',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontFamily: 'var(--titre)', fontWeight: 700,
                                        fontSize: isBackspace ? 26 : 'clamp(20px, 3.2vw, 32px)',
                                        color: isBackspace ? 'var(--gris)' : 'var(--indigo)',
                                        cursor: 'pointer', padding: 0,
                                        userSelect: 'none',
                                        transition: 'transform 0.08s ease, background 0.1s ease',
                                    }}
                                    onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.94)'; }}
                                    onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                                    onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                                >
                                    {isBackspace ? (
                                        <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
                                            <path d="M17.5 12h20a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4h-20L6.5 24z" stroke="var(--gris)" strokeWidth="3.2" strokeLinejoin="round" />
                                            <path d="M21 19l10 10M31 19 21 29" stroke="var(--gris)" strokeWidth="3.2" strokeLinecap="round" />
                                        </svg>
                                    ) : k}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Bouton de validation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 24 }}>
                <button
                    type="button"
                    onClick={handleValider}
                    disabled={code.length < 5 || loading}
                    style={{
                        height: 84, borderRadius: 24,
                        background: code.length === 5 ? 'var(--ciel)' : 'var(--bordure)',
                        color: code.length === 5 ? 'var(--action-texte)' : 'var(--gris-inerte)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 24,
                        border: 'none', cursor: code.length === 5 ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: code.length === 5 ? 'var(--ombre-carte)' : 'none',
                        transition: 'background 0.2s, color 0.2s',
                    }}
                >
                    {loading ? 'Recherche en cours…' : 'Valider le code'}
                </button>
                <div style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)', textAlign: 'center' }}>
                    Le bouton s'active quand les 5 lettres sont saisies.
                </div>
            </div>
        </div>
    );
}
