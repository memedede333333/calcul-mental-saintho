import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { mesDefis } from '../api';
import { DefiLeaderboard } from './Challenges';
import { formaterDuree } from '../logic/duree';

/**
 * MesDefis — Écran 28 : Mes défis passés
 *
 * Affichage selon la maquette v10 (Écran 28) :
 * - En-tête avec bouton retour, titre « Mes défis » et badge du nombre total.
 * - Filtre par onglets : « En cours · X » et « Terminés · Y ».
 * - Pour chaque carte :
 *   - Code en grand lettrage espacé (34px display).
 *   - Statut : « En cours · expire dans X h » ou « Terminé ».
 *   - Chips : Mode / questions, Tables, Classe, Date relative.
 *   - Double population : « X ont rejoint · Y ont terminé » (jamais l'un sans l'autre).
 *   - Jauge bicolore (terminés en vert, rejoints seuls en ciel).
 *   - Boutons : « Voir le podium » et « Projeter au tableau ».
 * - État vide : grille de 9 pastilles colorées, texte et bouton « Lancer un défi ».
 */

const TYPE_LABELS = {
    sprint: { label: 'Sprint' },
    countdown: { label: 'Contre-la-montre' },
    flawless: { label: 'Sans faute' },
    climb: { label: 'Montée' },
};

function formatTempsRestant(expireLe) {
    if (!expireLe) return 'bientôt';
    const diffMs = new Date(expireLe).getTime() - Date.now();
    if (diffMs <= 0) return '0 min';
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH >= 1) return `${diffH} h`;
    const diffMin = Math.max(1, Math.floor(diffMs / 60000));
    return `${diffMin} min`;
}

function formatDateRelative(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const estAujourdhui = d.toDateString() === now.toDateString();
    const hier = new Date(now);
    hier.setDate(now.getDate() - 1);
    const estHier = d.toDateString() === hier.toDateString();
    const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (estAujourdhui) return `Aujourd'hui à ${heure}`;
    if (estHier) return `Hier à ${heure}`;
    return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${heure}`;
}

function formaterTemps(tempsS) {
    if (tempsS == null) return '';
    const total = Math.round(Number(tempsS));
    const m = Math.floor(total / 60);
    const sec = total % 60;
    if (m > 0) return `${m} min ${sec < 10 ? '0' : ''}${sec}`;
    return `${sec} s`;
}

function formatTables(tables) {
    if (!tables || !tables.length) return 'Toutes tables';
    if (tables.length === 1) return `Table de ${tables[0]}`;
    if (tables.length > 4 && tables.every((t, i) => i === 0 || t === tables[i - 1] + 1)) {
        return `Tables ${tables[0]} à ${tables[tables.length - 1]}`;
    }
    return `Tables ${tables.join(', ')}`;
}

export default function MesDefis({ onBack, estProf, onGo }) {
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);
    const [defis, setDefis] = useState([]);
    const [tab, setTab] = useState('en_cours'); // 'en_cours' | 'termines'
    const [selectedDefi, setSelectedDefi] = useState(null);

    const charger = useCallback(async () => {
        setLoading(true);
        setErreur(null);
        const res = await mesDefis();
        if (res.ok) {
            setDefis(res.data || []);
        } else {
            setErreur(res.error || 'Impossible de charger les défis.');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        charger();
    }, [charger]);

    const nbEnCours = useMemo(() => defis.filter(d => d.encore_ouvert).length, [defis]);
    const nbTermines = useMemo(() => defis.filter(d => !d.encore_ouvert).length, [defis]);

    const defisAffiches = useMemo(() => {
        return defis.filter(d => tab === 'en_cours' ? d.encore_ouvert : !d.encore_ouvert);
    }, [defis, tab]);

    // Affichage du podium / classement d'un défi
    if (selectedDefi) {
        return (
            <DefiLeaderboard
                defiId={selectedDefi.defi_id}
                defiInfo={selectedDefi}
                result={null}
                type={null}
                estProf={estProf}
                envoiDefi={null}
                onRetry={null}
                onHome={() => setSelectedDefi(null)}
                onBack={() => setSelectedDefi(null)}
            />
        );
    }

    if (loading) {
        return (
            <div className="screen-enter" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: '50vh', gap: 16,
            }}>
                <div className="spinner" />
                <p style={{ color: 'var(--gris)', fontWeight: 700, fontSize: 16, fontFamily: 'var(--texte)' }}>
                    Chargement de vos défis…
                </p>
            </div>
        );
    }

    if (erreur) {
        return (
            <div className="screen-enter" style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--rouge)', fontWeight: 700, fontSize: 16, fontFamily: 'var(--texte)' }}>
                    {erreur}
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
                    <button
                        onClick={charger}
                        style={{
                            height: 48, padding: '0 20px', borderRadius: 14,
                            background: 'var(--action)', color: 'var(--action-texte)',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                            border: 'none', cursor: 'pointer',
                        }}
                    >
                        Réessayer
                    </button>
                    <button
                        onClick={onBack}
                        style={{
                            height: 48, padding: '0 20px', borderRadius: 14,
                            background: 'var(--surface)', border: '2px solid var(--bordure)',
                            color: 'var(--indigo)', fontFamily: 'var(--texte)',
                            fontWeight: 700, fontSize: 16, cursor: 'pointer',
                        }}
                    >
                        ‹ Retour
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* 1. Header (Écran 28) */}
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
                    Mes défis
                </h2>
                <div className="font-display" style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 700, color: 'var(--gris)' }}>
                    {defis.length}
                </div>
            </div>

            {/* 2. Onglets En cours / Terminés */}
            <div style={{ display: 'flex', gap: 10 }}>
                <button
                    type="button"
                    onClick={() => setTab('en_cours')}
                    style={{
                        padding: '11px 20px', borderRadius: 999,
                        background: tab === 'en_cours' ? 'var(--indigo)' : 'var(--surface)',
                        color: tab === 'en_cours' ? 'var(--action-texte)' : 'var(--gris)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                        border: 'none', cursor: 'pointer',
                        boxShadow: tab === 'en_cours' ? 'none' : '0 3px 10px rgba(32, 34, 107, 0.07)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    En cours · {nbEnCours}
                </button>
                <button
                    type="button"
                    onClick={() => setTab('termines')}
                    style={{
                        padding: '11px 20px', borderRadius: 999,
                        background: tab === 'termines' ? 'var(--indigo)' : 'var(--surface)',
                        color: tab === 'termines' ? 'var(--action-texte)' : 'var(--gris)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                        border: 'none', cursor: 'pointer',
                        boxShadow: tab === 'termines' ? 'none' : '0 3px 10px rgba(32, 34, 107, 0.07)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    Terminés · {nbTermines}
                </button>
            </div>

            {/* 3. Liste des défis ou État vide */}
            {defisAffiches.length === 0 ? (
                <div style={{
                    background: 'var(--surface)', borderRadius: 24,
                    boxShadow: 'var(--ombre-carte)', padding: '36px 24px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 14, textAlign: 'center', marginTop: 8,
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 20px)', gap: 6, flexShrink: 0 }}>
                        <div style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--rouge)' }} />
                        <div style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--orange)' }} />
                        <div style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--vert)' }} />
                        <div style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--orange)' }} />
                        <div style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--ciel)' }} />
                        <div style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--rouge)' }} />
                        <div style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--vert)' }} />
                        <div style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--ciel)' }} />
                        <div style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--orange)' }} />
                    </div>
                    <div className="font-display" style={{ fontSize: 24, fontWeight: 700, color: 'var(--indigo)' }}>
                        {tab === 'en_cours' ? 'Aucun défi en cours' : 'Aucun défi terminé'}
                    </div>
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 17, lineHeight: 1.45, fontWeight: 600, color: 'var(--gris)', maxWidth: 520 }}>
                        Lance un défi à ta classe ou à tes amis pour commencer.
                    </div>
                    <button
                        type="button"
                        onClick={() => onGo ? onGo('challenges') : onBack?.()}
                        style={{
                            height: 64, padding: '0 32px', borderRadius: 20,
                            background: 'var(--action)', color: 'var(--action-texte)',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19,
                            border: 'none', cursor: 'pointer', marginTop: 8,
                            boxShadow: '0 4px 14px rgba(35, 164, 217, 0.25)',
                        }}
                    >
                        Lancer un défi
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {defisAffiches.map(d => {
                        const typeInfo = TYPE_LABELS[d.type] || { label: d.type };
                        const rejoints = d.rejoints || 0;
                        const participants = d.participants || 0;
                        const attendus = d.attendus || Math.max(rejoints, participants, 1);
                        const pctTermine = Math.min(100, Math.round((participants / attendus) * 100));
                        const pctRejointsSeuls = Math.min(100 - pctTermine, Math.max(0, Math.round(((rejoints - participants) / attendus) * 100)));

                        return (
                            <div
                                key={d.defi_id}
                                style={{
                                    background: 'var(--surface)', borderRadius: 24,
                                    boxShadow: 'var(--ombre-carte)', padding: 24,
                                    display: 'flex', flexDirection: 'column', gap: 16,
                                }}
                            >
                                {/* Ligne supérieure : Code & Statut */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                                    <div
                                        className="font-display"
                                        style={{
                                            fontSize: 34, fontWeight: 700, color: 'var(--indigo)',
                                            letterSpacing: '0.2em',
                                        }}
                                    >
                                        {d.code}
                                    </div>
                                    <div style={{
                                        marginLeft: 'auto', display: 'flex', alignItems: 'center',
                                        gap: 8, padding: '8px 16px', borderRadius: 999,
                                        background: d.encore_ouvert ? 'var(--vert-pale)' : 'var(--surface-alt)',
                                    }}>
                                        <div style={{
                                            width: 11, height: 11, borderRadius: 4,
                                            background: d.encore_ouvert ? 'var(--vert)' : 'var(--gris-inerte)',
                                        }} />
                                        <span style={{
                                            fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 700,
                                            color: d.encore_ouvert ? 'var(--vert)' : 'var(--gris)',
                                        }}>
                                            {d.encore_ouvert ? `En cours · expire dans ${formatTempsRestant(d.expire_le)}` : 'Terminé'}
                                        </span>
                                    </div>
                                </div>

                                {/* Ligne des tags / chips */}
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {!d.je_suis_createur && d.auteur_nom && (
                                        <span style={{
                                            background: 'var(--ciel-pale)', padding: '8px 14px', borderRadius: 10,
                                            fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 700, color: 'var(--indigo)',
                                        }}>
                                            Par {d.auteur_nom}
                                        </span>
                                    )}
                                    {d.je_suis_createur && (
                                        <span style={{
                                            background: 'var(--surface-alt)', padding: '8px 14px', borderRadius: 10,
                                            fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 700, color: 'var(--indigo)',
                                        }}>
                                            Créé par moi
                                        </span>
                                    )}
                                    <span style={{
                                        background: 'var(--surface-alt)', padding: '8px 14px', borderRadius: 10,
                                        fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)',
                                    }}>
                                        {typeInfo.label} · {d.type === 'countdown' ? formaterDuree(d.duree_s) : `${d.nb_questions} questions`}
                                    </span>
                                    <span style={{
                                        background: 'var(--surface-alt)', padding: '8px 14px', borderRadius: 10,
                                        fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)',
                                    }}>
                                        {formatTables(d.tables)}
                                    </span>
                                    {d.classe && (
                                        <span style={{
                                            background: 'var(--surface-alt)', padding: '8px 14px', borderRadius: 10,
                                            fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)',
                                        }}>
                                            Classe {d.classe}
                                        </span>
                                    )}
                                    <span style={{
                                        background: 'var(--surface-alt)', padding: '8px 14px', borderRadius: 10,
                                        fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)',
                                    }}>
                                        {formatDateRelative(d.cree_le)}
                                    </span>
                                </div>

                                {/* Mon résultat personnel si j'ai joué */}
                                {d.j_ai_joue && d.mon_score != null && (
                                    <div style={{
                                        background: 'var(--surface-alt)', borderRadius: 16, padding: '12px 18px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        border: '1px solid var(--bordure)',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontSize: 20 }}>⚡</span>
                                            <span style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 700, color: 'var(--indigo)' }}>
                                                {d.type === 'countdown' ? (
                                                    <>
                                                        Ton résultat : <b style={{ color: 'var(--action)' }}>
                                                            {d.mon_score} {d.mon_score === 1 ? 'bonne réponse' : 'bonnes réponses'}
                                                        </b>
                                                        {d.mon_temps_s != null && ` en ${formaterTemps(d.mon_temps_s)}`}
                                                    </>
                                                ) : (
                                                    <>
                                                        Ton résultat : <b style={{ color: 'var(--action)' }}>
                                                            {d.mon_score} sur {d.nb_questions}
                                                        </b>
                                                        {d.mon_temps_s != null && ` · ${formaterTemps(d.mon_temps_s)}`}
                                                    </>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Populations : rejoints et participants (DEUX POPULATIONS, DEUX VERBES) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                    <div style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--indigo)' }}>
                                        {rejoints} ont rejoint · <b>{participants} ont terminé</b>
                                    </div>
                                    <div style={{
                                        height: 8, borderRadius: 999, background: 'var(--surface-alt)',
                                        overflow: 'hidden', display: 'flex',
                                    }}>
                                        <div style={{ width: `${pctTermine}%`, background: 'var(--vert)', transition: 'width 0.3s ease' }} />
                                        <div style={{ width: `${pctRejointsSeuls}%`, background: 'var(--ciel)', transition: 'width 0.3s ease' }} />
                                    </div>
                                </div>

                                {/* Boutons d'action : Voir le podium / Projeter au tableau */}
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedDefi(d)}
                                        style={{
                                            flex: 1, height: 66, borderRadius: 18,
                                            background: 'var(--surface)', border: '2px solid var(--bordure)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
                                            color: 'var(--indigo)', cursor: 'pointer',
                                        }}
                                    >
                                        Voir le podium
                                    </button>
                                    {d.je_suis_createur && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (onGo) {
                                                    onGo('challenges', { projecteurDefi: d });
                                                } else {
                                                    setSelectedDefi(d);
                                                }
                                            }}
                                            style={{
                                                flex: 1, height: 66, borderRadius: 18,
                                                background: 'var(--action)', border: 'none',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
                                                color: 'var(--action-texte)', cursor: 'pointer',
                                                boxShadow: '0 4px 14px rgba(35, 164, 217, 0.25)',
                                            }}
                                        >
                                            Projeter au tableau
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
