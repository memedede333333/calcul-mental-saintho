import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { monProfil, monProfilProf, changerAvatar, changerAvatarProf, listeClasses, definirMesClasses } from '../api';
import { cleFait } from '../logic/mastery';
import MasteryGrid from '../components/MasteryGrid';
import { IconSprint, IconChrono, IconSansFaute, IconMontee } from '../components/Icons';
import { ModalAvatar } from '../components/Modals';

/**
 * Profile — Aiguille vers ProfileEleve (Écran 29) ou ProfileProf (Écran 30)
 */
export default function Profile({ onBack, identite, estProf, onLogout, onGo }) {
    const isProf = estProf || identite?.type === 'prof';
    if (isProf) {
        return <ProfileProf onBack={onBack} onLogout={onLogout} onGo={onGo} />;
    }
    return <ProfileEleve onBack={onBack} identite={identite} onLogout={onLogout} onGo={onGo} />;
}

const AVATAR_OPTIONS = ['🦊', '🦁', '🐼', '🐨', '🐢', '🐙', '🦉', '🐝'];

function formaterDateSimple(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

/* ===================================================================
 * ÉCRAN 30 — PROFIL ENSEIGNANT
 * ================================================================= */
function ProfileProf({ onBack, onLogout, onGo }) {
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);
    const [profil, setProfil] = useState(null);
    const [records, setRecords] = useState(null);
    const [allClasses, setAllClasses] = useState([]);
    const [editingClasses, setEditingClasses] = useState(false);
    const [selectedClasses, setSelectedClasses] = useState([]);
    const [savingClasses, setSavingClasses] = useState(false);
    const [showAvatarPickerProf, setShowAvatarPickerProf] = useState(false);

    const handleChangerAvatarProf = async (emoji) => {
        setProfil(p => ({ ...p, avatar_emoji: emoji }));
        await changerAvatarProf(emoji);
    };

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
        const res = await definirMesClasses(selectedClasses);
        if (res.ok) {
            setProfil(prev => ({ ...prev, classes: selectedClasses }));
            setEditingClasses(false);
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
                <p style={{ color: 'var(--gris)', fontWeight: 700, fontSize: 16, fontFamily: 'var(--texte)' }}>
                    Chargement du profil…
                </p>
            </div>
        );
    }

    if (erreur) {
        return (
            <div className="screen-enter" style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--rouge)', fontWeight: 700, fontSize: 16, fontFamily: 'var(--texte)' }}>{erreur}</p>
                <button
                    onClick={onBack}
                    style={{
                        marginTop: 16, height: 48, padding: '0 20px', borderRadius: 14,
                        background: 'var(--surface)', border: '2px solid var(--bordure)',
                        color: 'var(--indigo)', fontFamily: 'var(--texte)',
                        fontWeight: 700, fontSize: 16, cursor: 'pointer',
                    }}
                >
                    ‹ Retour
                </button>
            </div>
        );
    }

    const mesClasses = profil?.classes || [];

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 24 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 8 }}>
                <button
                    type="button"
                    onClick={onBack}
                    style={{
                        width: 52, height: 52, borderRadius: 16,
                        background: 'var(--surface)',
                        boxShadow: '0 4px 12px rgba(32, 34, 107, 0.08)',
                        border: 'none', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                    }}
                >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="M15 5L8 12l7 7" stroke="var(--indigo)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <h2 className="font-display" style={{ margin: 0, fontSize: 32, fontWeight: 700, color: 'var(--indigo)' }}>
                    Mon profil
                </h2>
            </div>

            {/* 1. Carte Identité */}
            <div style={{
                background: 'var(--surface)', borderRadius: 24,
                boxShadow: 'var(--ombre-carte)', padding: 26,
                display: 'flex', alignItems: 'center', gap: 22,
            }}>
                <div
                    onClick={() => setShowAvatarPickerProf(true)}
                    style={{
                        width: 104, height: 104, borderRadius: 32,
                        background: 'var(--surface-alt)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 40,
                        color: 'var(--indigo)', flexShrink: 0,
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease',
                    }}
                    title="Changer d'avatar (emoji ou initiales)"
                >
                    {profil?.avatar_emoji ? (
                        <span style={{ fontSize: 52 }}>{profil.avatar_emoji}</span>
                    ) : (
                        profil?.initiales || 'P'
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                    <div className="font-display" style={{ fontSize: 34, fontWeight: 700, color: 'var(--indigo)' }}>
                        {profil?.nom || 'Professeur'}
                    </div>
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 600, color: 'var(--gris)' }}>
                        {profil?.email || ''}
                    </div>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'var(--vert-pale)', padding: '9px 18px',
                        borderRadius: 999, alignSelf: 'flex-start',
                    }}>
                        <div style={{ width: 11, height: 11, borderRadius: 4, background: 'var(--vert)' }} />
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 700, color: 'var(--vert)' }}>
                            {profil?.est_admin ? 'Compte enseignant et administrateur' : 'Compte enseignant'}
                        </span>
                    </div>
                </div>
            </div>

            {/* 2. Carte Mes classes habituelles */}
            <div style={{
                background: 'var(--surface)', borderRadius: 24,
                boxShadow: 'var(--ombre-carte)', padding: 26,
                display: 'flex', flexDirection: 'column', gap: 16,
            }}>
                <div className="font-display" style={{ fontSize: 23, fontWeight: 700, color: 'var(--indigo)' }}>
                    Mes classes habituelles
                </div>
                <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.45, fontWeight: 600, color: 'var(--gris)' }}>
                    Vos classes favorites apparaissent en tête des sélecteurs de défi et de maîtrise.
                </div>

                {!editingClasses ? (
                    <>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {mesClasses.length === 0 ? (
                                <span style={{ fontFamily: 'var(--texte)', fontSize: 15, color: 'var(--gris-inerte)' }}>
                                    Aucune classe favorite sélectionnée
                                </span>
                            ) : (
                                mesClasses.map(c => (
                                    <div
                                        key={c}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 9,
                                            background: 'var(--indigo)', padding: '12px 20px',
                                            borderRadius: 999,
                                        }}
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                            <path d="M5 12.5L10 17.5L19 7" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        <span style={{ fontFamily: 'var(--texte)', fontSize: 18, fontWeight: 700, color: '#fff' }}>
                                            {c}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setEditingClasses(true)}
                            style={{
                                height: 66, borderRadius: 18, background: 'var(--surface)',
                                border: '2px solid var(--bordure)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
                                color: 'var(--indigo)', cursor: 'pointer',
                            }}
                        >
                            Modifier mes favoris
                        </button>
                    </>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {allClasses.map(cl => {
                                const code = cl.classe;
                                const isSel = selectedClasses.includes(code);
                                return (
                                    <button
                                        key={code}
                                        type="button"
                                        onClick={() => toggleClass(code)}
                                        style={{
                                            padding: '12px 20px', borderRadius: 999,
                                            background: isSel ? 'var(--indigo)' : 'var(--surface-alt)',
                                            color: isSel ? '#fff' : 'var(--gris)',
                                            border: 'none', fontFamily: 'var(--texte)',
                                            fontWeight: 700, fontSize: 18, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                        }}
                                    >
                                        {isSel && (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                                <path d="M5 12.5L10 17.5L19 7" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                        {code}
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button
                                type="button"
                                onClick={handleSaveClasses}
                                disabled={savingClasses}
                                style={{
                                    flex: 1, height: 56, borderRadius: 16,
                                    background: 'var(--action)', color: 'var(--action-texte)',
                                    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                                    border: 'none', cursor: 'pointer',
                                }}
                            >
                                {savingClasses ? 'Enregistrement…' : 'Enregistrer'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedClasses(profil?.classes || []);
                                    setEditingClasses(false);
                                }}
                                style={{
                                    height: 56, padding: '0 24px', borderRadius: 16,
                                    background: 'var(--surface)', border: '2px solid var(--bordure)',
                                    color: 'var(--indigo)', fontFamily: 'var(--texte)',
                                    fontWeight: 700, fontSize: 17, cursor: 'pointer',
                                }}
                            >
                                Annuler
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 3. Carte Mon entraînement */}
            <div style={{
                background: 'var(--surface)', borderRadius: 24,
                boxShadow: 'var(--ombre-carte)', padding: 26,
                display: 'flex', flexDirection: 'column', gap: 18,
            }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <span className="font-display" style={{ fontSize: 23, fontWeight: 700, color: 'var(--indigo)' }}>
                        Mon entraînement
                    </span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--gris)' }}>
                        Salle des profs · ce mois
                    </span>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{
                        flex: 1, background: 'var(--surface)', borderRadius: 24,
                        boxShadow: 'var(--ombre-carte)', padding: 20,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}>
                        <span className="font-display" style={{ fontSize: 36, fontWeight: 700, color: 'var(--indigo)' }}>
                            {records?.points_mois ?? 0}
                        </span>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)', textAlign: 'center' }}>
                            points
                        </span>
                    </div>
                    <div style={{
                        flex: 1, background: 'var(--surface)', borderRadius: 24,
                        boxShadow: 'var(--ombre-carte)', padding: 20,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}>
                        <span className="font-display" style={{ fontSize: 36, fontWeight: 700, color: 'var(--indigo)' }}>
                            {records?.parties_mois ?? 0}
                        </span>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)', textAlign: 'center' }}>
                            parties jouées
                        </span>
                    </div>
                    <div style={{
                        flex: 1, background: 'var(--surface)', borderRadius: 24,
                        boxShadow: 'var(--ombre-carte)', padding: 20,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}>
                        <span className="font-display" style={{ fontSize: 36, fontWeight: 700, color: 'var(--indigo)' }}>
                            {records?.sprint_mois ? `${Math.round(records.sprint_mois)} s` : '—'}
                        </span>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)', textAlign: 'center' }}>
                            meilleur sprint
                        </span>
                    </div>
                </div>

                <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.45, fontWeight: 600, color: 'var(--gris)' }}>
                    Vos résultats n'apparaissent que dans la Salle des profs. Ils ne sont jamais mêlés aux classements des élèves.
                </div>

                <button
                    type="button"
                    onClick={() => onGo ? onGo('practice') : onBack?.()}
                    style={{
                        height: 76, borderRadius: 20, background: 'var(--action)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 12, border: 'none', cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(35, 164, 217, 0.25)',
                    }}
                >
                    <svg width="28" height="28" viewBox="0 0 44 44" fill="none">
                        <path d="M24 4L10 25h9l-2 15 15-22h-9z" fill="#fff" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontFamily: 'var(--texte)', fontSize: 21, fontWeight: 700, color: '#fff' }}>
                        S'entraîner maintenant
                    </span>
                </button>
            </div>

            {/* Bouton Se déconnecter */}
            <button
                type="button"
                onClick={onLogout}
                style={{
                    padding: '24px 0 12px', background: 'none', border: 'none',
                    fontFamily: 'var(--texte)', fontSize: 18, fontWeight: 600,
                    color: 'var(--gris)', cursor: 'pointer', textAlign: 'center',
                }}
            >
                Se déconnecter
            </button>

            {showAvatarPickerProf && (
                <ModalAvatar
                    initialAvatar={profil?.avatar_emoji}
                    estProf={true}
                    initiales={profil?.initiales}
                    onClose={() => setShowAvatarPickerProf(false)}
                    onSave={handleChangerAvatarProf}
                />
            )}
        </div>
    );
}

/* ===================================================================
 * ÉCRAN 29 — PROFIL ÉLÈVE
 * ================================================================= */
function ProfileEleve({ onBack, identite, onLogout, onGo }) {
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);
    const [profil, setProfil] = useState(null);
    const [records, setRecords] = useState(null);
    const [maitrise, setMaitrise] = useState({});
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [avatar, setAvatar] = useState(identite?.profil?.avatar_emoji || '🦊');
    const [showGrid, setShowGrid] = useState(false);

    const charger = useCallback(async () => {
        setLoading(true);
        setErreur(null);
        const res = await monProfil();
        if (!res.ok) {
            setErreur(res.error || 'Impossible de charger le profil.');
            setLoading(false);
            return;
        }
        const d = res.data;
        setProfil(d.profil);
        setRecords(d.records);
        setMaitrise(d.maitrise || {});
        setAvatar(d.profil?.avatar_emoji || '🦊');
        setLoading(false);
    }, []);

    useEffect(() => {
        charger();
    }, [charger]);

    const handleChangerAvatar = async (emoji) => {
        setAvatar(emoji);
        setShowAvatarPicker(false);
        await changerAvatar(emoji);
    };

    const plafond = profil?.plafond_tables || 10;
    const totalCases = plafond * plafond;

    // Règle de symétrie : on compte chaque case affichée (r, c) de 1..plafond
    // Niveau 3 = sues, 2 = justes mais lentes, 1 = à revoir, absent/0 = pas encore vues
    let nbSues = 0;
    let nbLentes = 0;
    let nbARevoir = 0;
    let nbNonVues = 0;

    for (let r = 1; r <= plafond; r++) {
        for (let c = 1; c <= plafond; c++) {
            const key = cleFait(r, c);
            const val = maitrise?.[key] || 0;
            if (val >= 3) {
                nbSues++;
            } else if (val === 2) {
                nbLentes++;
            } else if (val === 1) {
                nbARevoir++;
            } else {
                nbNonVues++;
            }
        }
    }

    const pctSues = (nbSues / totalCases) * 100;
    const pctLentes = (nbLentes / totalCases) * 100;
    const pctARevoir = (nbARevoir / totalCases) * 100;

    if (loading) {
        return (
            <div className="screen-enter" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: '50vh', gap: 16,
            }}>
                <div className="spinner" />
                <p style={{ color: 'var(--gris)', fontWeight: 700, fontSize: 16, fontFamily: 'var(--texte)' }}>
                    Chargement du profil…
                </p>
            </div>
        );
    }

    if (erreur) {
        return (
            <div className="screen-enter" style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--rouge)', fontWeight: 700, fontSize: 16, fontFamily: 'var(--texte)' }}>{erreur}</p>
                <button
                    onClick={onBack}
                    style={{
                        marginTop: 16, height: 48, padding: '0 20px', borderRadius: 14,
                        background: 'var(--surface)', border: '2px solid var(--bordure)',
                        color: 'var(--indigo)', fontFamily: 'var(--texte)',
                        fontWeight: 700, fontSize: 16, cursor: 'pointer',
                    }}
                >
                    ‹ Retour
                </button>
            </div>
        );
    }

    const palierNom = plafond <= 10 ? 'Découverte' : plafond <= 12 ? 'Confirmé' : 'Expert';
    const nomAffiche = `${profil?.prenom || ''} ${profil?.nom ? profil.nom.charAt(0) + '.' : ''}`.trim() || 'Élève';

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 24 }}>
            {/* Modal de grille de maîtrise en grand */}
            {showGrid && (
                <MasteryGrid
                    mastery={maitrise}
                    tables={Array.from({ length: plafond }, (_, i) => i + 1)}
                    onClose={() => setShowGrid(false)}
                />
            )}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 8 }}>
                <button
                    type="button"
                    onClick={onBack}
                    style={{
                        width: 52, height: 52, borderRadius: 16,
                        background: 'var(--surface)',
                        boxShadow: '0 4px 12px rgba(32, 34, 107, 0.08)',
                        border: 'none', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                    }}
                >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="M15 5L8 12l7 7" stroke="var(--indigo)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <h2 className="font-display" style={{ margin: 0, fontSize: 32, fontWeight: 700, color: 'var(--indigo)' }}>
                    Mon profil
                </h2>
            </div>

            {/* 1. Carte Identité & Avatar */}
            <div style={{
                background: 'var(--surface)', borderRadius: 24,
                boxShadow: 'var(--ombre-carte)', padding: 26,
                display: 'flex', alignItems: 'center', gap: 22, position: 'relative',
            }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                        width: 114, height: 114, borderRadius: '50%',
                        background: '#FFFFFF', boxShadow: '0 8px 22px rgba(32, 34, 107, 0.13)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 60,
                    }}>
                        {avatar}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowAvatarPicker(p => !p)}
                        title="Changer d'avatar"
                        style={{
                            position: 'absolute', bottom: -2, right: -2,
                            width: 42, height: 42, borderRadius: 14,
                            background: 'var(--action)', border: '4px solid #FFFFFF',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                        }}
                    >
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                            <path d="M4 20h4L20 8l-4-4L4 16z" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
                        </svg>
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="font-display" style={{ fontSize: 38, fontWeight: 700, color: 'var(--indigo)' }}>
                            {nomAffiche}
                        </span>
                        {profil?.classe && (
                            <span style={{
                                background: 'var(--surface-alt)', padding: '6px 15px',
                                borderRadius: 999, fontFamily: 'var(--texte)',
                                fontWeight: 700, fontSize: 17, color: 'var(--gris)',
                            }}>
                                {profil.classe}
                            </span>
                        )}
                    </div>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'var(--ciel-pale)', padding: '9px 18px',
                        borderRadius: 999, alignSelf: 'flex-start',
                    }}>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 700, color: 'var(--indigo)' }}>
                            Palier {palierNom} · plafond table {plafond}
                        </span>
                    </div>
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                        Change d'avatar quand tu veux — c'est le seul réglage à toi.
                    </div>
                </div>
            </div>

            {/* Modale Choisir mon avatar (Écran 36a) */}
            {showAvatarPicker && (
                <ModalAvatar
                    initialAvatar={avatar}
                    onClose={() => setShowAvatarPicker(false)}
                    onSave={handleChangerAvatar}
                />
            )}

            {/* 2. Carte Grille de maîtrise (les 4 comptes vérifiés) */}
            <div style={{
                background: 'var(--surface)', borderRadius: 24,
                boxShadow: 'var(--ombre-carte)', padding: 24,
                display: 'flex', flexDirection: 'column', gap: 14,
            }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <span className="font-display" style={{ fontSize: 24, fontWeight: 700, color: 'var(--indigo)' }}>
                        {nbSues} cases vertes sur {totalCases}
                    </span>
                    <button
                        type="button"
                        onClick={() => setShowGrid(true)}
                        style={{
                            marginLeft: 'auto', background: 'none', border: 'none',
                            fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600,
                            color: 'var(--action)', cursor: 'pointer', padding: 0,
                        }}
                    >
                        Voir ma grille ›
                    </button>
                </div>

                <div style={{
                    height: 16, borderRadius: 999, background: 'var(--surface-alt)',
                    overflow: 'hidden', display: 'flex',
                }}>
                    <div style={{ width: `${pctSues}%`, background: 'var(--vert)', transition: 'width 0.3s ease' }} />
                    <div style={{ width: `${pctLentes}%`, background: 'var(--orange)', transition: 'width 0.3s ease' }} />
                    <div style={{ width: `${pctARevoir}%`, background: 'var(--rouge)', transition: 'width 0.3s ease' }} />
                </div>

                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                        <span style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--vert)' }} />
                        {nbSues} sues
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                        <span style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--orange)' }} />
                        {nbLentes} justes mais lentes
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                        <span style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--rouge)' }} />
                        {nbARevoir} à revoir
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                        <span style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--bordure)' }} />
                        {nbNonVues} pas encore vues
                    </span>
                </div>
            </div>

            {/* 3. Les quatre tuiles de statistiques */}
            <div style={{ display: 'flex', gap: 12 }}>
                <div style={{
                    flex: 1, background: 'var(--surface)', borderRadius: 24,
                    boxShadow: 'var(--ombre-carte)', padding: 20,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                    <span className="font-display" style={{ fontSize: 36, fontWeight: 700, color: 'var(--indigo)' }}>
                        {records?.points_total ? records.points_total.toLocaleString('fr-FR') : 0}
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)', textAlign: 'center' }}>
                        points
                    </span>
                </div>
                <div style={{
                    flex: 1, background: 'var(--surface)', borderRadius: 24,
                    boxShadow: 'var(--ombre-carte)', padding: 20,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                    <span className="font-display" style={{ fontSize: 36, fontWeight: 700, color: 'var(--indigo)' }}>
                        {records?.jours_actifs ?? 0}
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)', textAlign: 'center' }}>
                        jours d'entraînement
                    </span>
                </div>
                <div style={{
                    flex: 1, background: 'var(--surface)', borderRadius: 24,
                    boxShadow: 'var(--ombre-carte)', padding: 20,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                    <span className="font-display" style={{ fontSize: 36, fontWeight: 700, color: 'var(--indigo)' }}>
                        {records?.nb_sessions ?? 0}
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)', textAlign: 'center' }}>
                        parties jouées
                    </span>
                </div>
                <div style={{
                    flex: 1, background: 'var(--surface)', borderRadius: 24,
                    boxShadow: 'var(--ombre-carte)', padding: 20,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                    <span className="font-display" style={{ fontSize: 36, fontWeight: 700, color: 'var(--indigo)' }}>
                        {records?.meilleure_serie ?? 0}
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)', textAlign: 'center' }}>
                        meilleure série
                    </span>
                </div>
            </div>

            {/* 4. Carte Mes records */}
            <div style={{
                background: 'var(--surface)', borderRadius: 24,
                boxShadow: 'var(--ombre-carte)', padding: '8px 24px',
                display: 'flex', flexDirection: 'column',
            }}>
                <div className="font-display" style={{ padding: '18px 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--indigo)' }}>
                    Mes records
                </div>
                <div style={{ height: 2, background: 'var(--surface-alt)' }} />

                {/* Sprint */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 0' }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 15, background: 'var(--surface-alt)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <IconSprint size={26} color="var(--indigo)" actionColor="var(--action)" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 20, fontWeight: 700, color: 'var(--indigo)' }}>
                            Sprint
                        </span>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                            20 questions, sans faute
                        </span>
                    </div>
                    <div className="font-display" style={{ marginLeft: 'auto', fontSize: 27, fontWeight: 700, color: 'var(--indigo)', whiteSpace: 'nowrap' }}>
                        {records?.meilleur_sprint ? `${Math.round(records.meilleur_sprint)} s` : '—'}
                    </div>
                </div>
                <div style={{ height: 2, background: 'var(--surface-alt)' }} />

                {/* Contre-la-montre */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 0' }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 15, background: 'var(--surface-alt)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <IconChrono size={26} color="var(--indigo)" actionColor="var(--action)" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 20, fontWeight: 700, color: 'var(--indigo)' }}>
                            Contre‑la‑montre
                        </span>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                            bonnes réponses en 60 s
                        </span>
                    </div>
                    <div className="font-display" style={{ marginLeft: 'auto', fontSize: 27, fontWeight: 700, color: 'var(--indigo)', whiteSpace: 'nowrap' }}>
                        {records?.meilleur_chrono ? records.meilleur_chrono : '—'}
                    </div>
                </div>
                <div style={{ height: 2, background: 'var(--surface-alt)' }} />

                {/* Sans faute */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 0' }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 15, background: 'var(--surface-alt)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <IconSansFaute size={26} color="var(--indigo)" actionColor="var(--action)" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 20, fontWeight: 700, color: 'var(--indigo)' }}>
                            Sans faute
                        </span>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                            questions d'affilée
                        </span>
                    </div>
                    <div className="font-display" style={{ marginLeft: 'auto', fontSize: 27, fontWeight: 700, color: 'var(--indigo)', whiteSpace: 'nowrap' }}>
                        {records?.meilleure_serie ? records.meilleure_serie : '—'}
                    </div>
                </div>
                <div style={{ height: 2, background: 'var(--surface-alt)' }} />

                {/* Montée des tables */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 0' }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 15, background: 'var(--surface-alt)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <IconMontee size={26} color="var(--indigo)" actionColor="var(--action)" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 20, fontWeight: 700, color: 'var(--indigo)' }}>
                            Montée des tables
                        </span>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                            {profil?.plafond_atteint_le
                                ? `débloquée le ${formaterDateSimple(profil.plafond_atteint_le)}`
                                : ''}
                        </span>
                    </div>
                    <div className="font-display" style={{ marginLeft: 'auto', fontSize: 27, fontWeight: 700, color: 'var(--indigo)', whiteSpace: 'nowrap' }}>
                        Table {records?.plus_haute_table ? Math.max(records.plus_haute_table, plafond) : plafond}
                    </div>
                </div>
            </div>

            {/* Bouton Se déconnecter */}
            <button
                type="button"
                onClick={onLogout}
                style={{
                    padding: '24px 0 12px', background: 'none', border: 'none',
                    fontFamily: 'var(--texte)', fontSize: 18, fontWeight: 600,
                    color: 'var(--gris)', cursor: 'pointer', textAlign: 'center',
                }}
            >
                Se déconnecter
            </button>
        </div>
    );
}
