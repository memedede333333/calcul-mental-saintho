import React, { useState, useEffect, useMemo } from 'react';
import {
    classementProgression,
    maPlaceProgression,
    classementRecords,
    maPlaceRecords,
    classementClasses,
    classementProfs,
    entetteSalleDesProfs,
} from '../api';
import { IconClassements } from '../components/Icons';

/**
 * Leaderboards — Écrans 22 (Progression), 23 (Classes), 31 (Records) et 32 (Salle des profs)
 */

const ONGLETS_ELEVE = [
    { id: 'progression', label: 'Progression' },
    { id: 'records', label: 'Records' },
    { id: 'classes', label: 'Classes' },
];

const ONGLETS_PROF = [
    { id: 'progression', label: 'Progression' },
    { id: 'records', label: 'Records' },
    { id: 'classes', label: 'Classes' },
    { id: 'profs', label: 'Profs' },
];

const RECORD_CATS = [
    { id: 'sprint', label: 'Sprint · temps' },
    { id: 'chrono', label: 'Chrono · score' },
    { id: 'serie', label: 'Sans faute · série' },
    { id: 'montee', label: 'Montée · table' },
];

const PERIODES = [
    { id: 'semaine', label: 'Cette semaine' },
    { id: 'mois', label: 'Ce mois' },
    { id: 'tout', label: 'Tout' },
];

const PERIODES_PROFS = [
    { id: 'mois', label: 'Ce mois' },
    { id: 'semaine', label: 'Cette semaine' },
    { id: 'tout', label: 'Tout' },
];

function formaterTempsSprint(sec) {
    if (sec == null) return '—';
    const s = Math.round(Number(sec));
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m} min ${String(r).padStart(2, '0')}`;
}

function formaterValeurRecord(val, cat) {
    if (val == null) return '—';
    if (cat === 'sprint') return formaterTempsSprint(val);
    if (cat === 'montee') return `Table ${Math.round(val)}`;
    return `${Math.round(val)}`;
}

export default function Leaderboards({ onBack, identite, estProf, onGo }) {
    const [onglet, setOnglet] = useState(estProf ? 'classes' : 'progression');
    const [periode, setPeriode] = useState('semaine');
    const [portee, setPortee] = useState('college');
    const [palier, setPalier] = useState(null); // 'decouverte' | 'confirme' | 'expert' | null
    const [recordCat, setRecordCat] = useState('sprint');
    const [profTri, setProfTri] = useState('points'); // 'points' | 'parties'
    const [niveauClasse, setNiveauClasse] = useState(null);
    const [niveauxDisponibles, setNiveauxDisponibles] = useState([]);

    const [data, setData] = useState([]);
    const [maPlace, setMaPlace] = useState(null);
    const [enteteProfs, setEnteteProfs] = useState(null);
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);

    const onglets = estProf ? ONGLETS_PROF : ONGLETS_ELEVE;

    // Réinitialiser la période par défaut selon l'onglet
    useEffect(() => {
        if (onglet === 'profs') {
            setPeriode('mois');
        } else if (onglet === 'progression' || onglet === 'classes') {
            setPeriode('semaine');
        } else if (onglet === 'records') {
            setPeriode('tout');
        }
    }, [onglet]);

    // Chargement des données
    useEffect(() => {
        let annule = false;
        async function charger() {
            setLoading(true);
            setErreur(null);
            let res;
            let resPlace = null;
            let resEntete = null;

            try {
                if (onglet === 'progression') {
                    const promises = [
                        classementProgression({ periode, portee, palier, limite: 20 }),
                    ];
                    if (!estProf) {
                        promises.push(maPlaceProgression(periode, portee, palier));
                    }
                    const [resProg, resPl] = await Promise.all(promises);
                    res = resProg;
                    resPlace = resPl;
                } else if (onglet === 'records') {
                    const palierParam = recordCat === 'montee' ? null : palier;
                    const promises = [
                        classementRecords({ categorie: recordCat, periode, portee, palier: palierParam, limite: 20 }),
                    ];
                    if (!estProf) {
                        promises.push(maPlaceRecords(recordCat, periode, portee, palierParam));
                    }
                    const [resRec, resPl] = await Promise.all(promises);
                    res = resRec;
                    resPlace = resPl;
                } else if (onglet === 'classes') {
                    res = await classementClasses({ periode, niveau: niveauClasse });
                } else if (onglet === 'profs') {
                    const [resP, resEnt] = await Promise.all([
                        classementProfs(profTri, periode, 20),
                        entetteSalleDesProfs(periode),
                    ]);
                    res = resP;
                    resEntete = resEnt;
                }

                if (annule) return;

                if (!res?.ok) {
                    setErreur(res?.error || 'Impossible de charger le classement.');
                    setData([]);
                    setMaPlace(null);
                } else {
                    let rows = res.data || [];
                    if (onglet === 'classes') {
                        rows = rows.map(r => ({
                            rang: r.rang,
                            nom_affiche: r.classe,
                            classe: r.classe,
                            avatar: null,
                            valeur: r.points_par_inscrit ?? 0,
                            est_moi: r.est_ma_classe === true,
                            ont_joue: r.ont_joue ?? 0,
                            inscrits: r.inscrits ?? 0,
                        }));
                        if (niveauClasse === null && rows.length) {
                            const niveaux = [...new Set(
                                rows.map(r => (r.classe || '')[0]).filter(Boolean)
                            )].sort();
                            setNiveauxDisponibles(niveaux);
                        }
                    }
                    setData(rows);

                    if (resPlace?.ok && resPlace.data?.length) {
                        setMaPlace(resPlace.data[0]);
                    } else {
                        setMaPlace(null);
                    }

                    if (resEntete?.ok) {
                        setEnteteProfs(resEntete.data);
                    }
                }
            } catch {
                if (!annule) {
                    setErreur('Erreur réseau.');
                    setData([]);
                    setMaPlace(null);
                }
            }
            if (!annule) setLoading(false);
        }

        charger();
        return () => { annule = true; };
    }, [onglet, periode, portee, palier, recordCat, profTri, niveauClasse, estProf]);

    // Podium (top 3) et reste (4+) pour progression et records
    const podiumEntries = data.slice(0, 3);
    const listEntries = data.slice(3);

    const estDansLaListeAffichee = data.some(r => r.est_moi);

    const monPrenom = identite?.prenom || identite?.profil?.prenom || 'Moi';
    const monNom = identite?.nom || identite?.profil?.nom || '';
    const monInitiale = monNom ? monNom[0] + '.' : '';
    const monAvatar = identite?.avatar_emoji || identite?.profil?.avatar_emoji || '🦊';

    return (
        <div className="screen-enter" style={{ maxWidth: 834, margin: '0 auto', paddingBottom: 32 }}>
            {/* Bouton retour */}
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            {/* Titre */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <h1 className="font-display" style={{ fontSize: 32, fontWeight: 700, color: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <IconClassements size={28} color="var(--indigo)" actionColor="var(--action)" /> Classements
                </h1>
            </div>

            {/* Onglets principaux */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {onglets.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setOnglet(t.id)}
                        style={{
                            flex: 1, height: 56, borderRadius: 16,
                            background: onglet === t.id ? 'var(--indigo)' : 'var(--surface)',
                            color: onglet === t.id ? '#ffffff' : 'var(--gris)',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                            border: 'none', cursor: 'pointer',
                            boxShadow: onglet === t.id ? 'none' : '0 3px 10px rgba(32, 34, 107, 0.07)',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* =====================================================================
             * CAS ONGLET PROFS (Écran 32)
             * ===================================================================== */}
            {onglet === 'profs' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Bannière "Entre collègues" */}
                    <div style={{
                        background: 'var(--indigo)', borderRadius: 24, padding: 24,
                        display: 'flex', alignItems: 'center', gap: 18,
                    }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 17px)', gap: 5, flexShrink: 0 }}>
                            <div style={{ width: 17, height: 17, borderRadius: 4, background: 'var(--rouge)' }} />
                            <div style={{ width: 17, height: 17, borderRadius: 4, background: 'var(--orange)' }} />
                            <div style={{ width: 17, height: 17, borderRadius: 4, background: 'var(--vert)' }} />
                            <div style={{ width: 17, height: 17, borderRadius: 4, background: 'var(--orange)' }} />
                            <div style={{ width: 17, height: 17, borderRadius: 4, background: 'var(--ciel)' }} />
                            <div style={{ width: 17, height: 17, borderRadius: 4, background: 'var(--rouge)' }} />
                            <div style={{ width: 17, height: 17, borderRadius: 4, background: 'var(--vert)' }} />
                            <div style={{ width: 17, height: 17, borderRadius: 4, background: 'var(--ciel)' }} />
                            <div style={{ width: 17, height: 17, borderRadius: 4, background: 'var(--orange)' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div className="font-display" style={{ fontSize: 25, fontWeight: 700, color: '#fff' }}>
                                Entre collègues
                            </div>
                            <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.4, fontWeight: 600, color: 'var(--indigo-clair)' }}>
                                Ce classement ne sort pas de la salle des profs. Il ne compte que vos propres parties.
                            </div>
                        </div>
                    </div>

                    {/* Filtres Profs */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {PERIODES_PROFS.map(p => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => setPeriode(p.id)}
                                style={{
                                    padding: '10px 18px', borderRadius: 999,
                                    background: periode === p.id ? 'var(--indigo)' : 'var(--surface)',
                                    color: periode === p.id ? '#fff' : 'var(--gris)',
                                    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 15,
                                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                                    boxShadow: periode === p.id ? 'none' : '0 3px 10px rgba(32, 34, 107, 0.07)',
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                        <div style={{ width: 2, height: 26, background: 'var(--bordure)', margin: '0 4px' }} />
                        <button
                            type="button"
                            onClick={() => setProfTri('points')}
                            style={{
                                padding: '10px 18px', borderRadius: 999,
                                background: profTri === 'points' ? 'var(--indigo)' : 'var(--surface)',
                                color: profTri === 'points' ? '#fff' : 'var(--gris)',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 15,
                                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                                boxShadow: profTri === 'points' ? 'none' : '0 3px 10px rgba(32, 34, 107, 0.07)',
                            }}
                        >
                            Points
                        </button>
                        <button
                            type="button"
                            onClick={() => setProfTri('parties')}
                            style={{
                                padding: '10px 18px', borderRadius: 999,
                                background: profTri === 'parties' ? 'var(--indigo)' : 'var(--surface)',
                                color: profTri === 'parties' ? '#fff' : 'var(--gris)',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 15,
                                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                                boxShadow: profTri === 'parties' ? 'none' : '0 3px 10px rgba(32, 34, 107, 0.07)',
                            }}
                        >
                            Parties
                        </button>
                    </div>

                    {/* Tableau des collègues */}
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '50px 0' }}>
                            <div className="spinner" style={{ margin: '0 auto 12px' }} />
                        </div>
                    ) : erreur ? (
                        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                            <p style={{ color: 'var(--rouge)', fontWeight: 700 }}>{erreur}</p>
                        </div>
                    ) : (
                        <div style={{
                            background: 'var(--surface)', borderRadius: 24,
                            boxShadow: 'var(--ombre-carte)', padding: '8px 24px',
                            display: 'flex', flexDirection: 'column',
                        }}>
                            {/* En-tête des colonnes */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: '36px 44px 1fr 118px 84px 86px',
                                padding: '14px 0', borderBottom: '2px solid var(--surface-alt)',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 12,
                                color: 'var(--gris)', letterSpacing: '0.08em', textTransform: 'uppercase',
                                alignItems: 'center',
                            }}>
                                <span />
                                <span />
                                <span>Collègue</span>
                                <span>Rôle</span>
                                <span style={{ textAlign: 'right' }}>Points</span>
                                <span style={{ textAlign: 'right' }}>Sprint</span>
                            </div>

                            {/* Lignes */}
                            {data.map((row, idx) => {
                                const isMoi = row.est_moi === true;
                                const isLast = idx === data.length - 1;
                                return (
                                    <div
                                        key={idx}
                                        style={{
                                            display: 'grid', gridTemplateColumns: '36px 44px 1fr 118px 84px 86px',
                                            alignItems: 'center', padding: '15px 0',
                                            borderBottom: isLast ? 'none' : '2px solid var(--surface-alt)',
                                            background: isMoi ? 'var(--ciel-pale)' : 'transparent',
                                            borderRadius: isMoi ? 12 : 0,
                                            paddingLeft: isMoi ? 8 : 0,
                                            paddingRight: isMoi ? 8 : 0,
                                        }}
                                    >
                                        <span className="font-display" style={{
                                            fontWeight: 700, fontSize: 20,
                                            color: isMoi ? 'var(--action)' : 'var(--gris)',
                                        }}>
                                            {row.rang}
                                        </span>

                                        <div>
                                            {row.avatar ? (
                                                <span style={{ fontSize: 26 }}>{row.avatar}</span>
                                            ) : (
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: 8,
                                                    background: 'var(--surface-alt)', color: 'var(--indigo)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 13,
                                                }}>
                                                    {row.initiales || 'P'}
                                                </div>
                                            )}
                                        </div>

                                        <span style={{
                                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19,
                                            color: 'var(--indigo)', minWidth: 0, overflow: 'hidden',
                                            textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8,
                                        }}>
                                            {row.nom_affiche}
                                            {isMoi && <span style={{ color: 'var(--action)', marginLeft: 6 }}>(vous)</span>}
                                        </span>

                                        <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                                            {row.role === 'admin' ? 'Administrateur' : 'Professeur'}
                                        </span>

                                        <span className="font-display" style={{ textAlign: 'right', fontWeight: 700, fontSize: 21, color: 'var(--indigo)' }}>
                                            {row.points ?? 0}
                                        </span>

                                        <span style={{ textAlign: 'right', fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 16, color: 'var(--gris)' }}>
                                            {row.meilleur_sprint ? formaterTempsSprint(row.meilleur_sprint) : '—'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pied de l'écran salle des profs */}
                    <div style={{
                        background: 'var(--surface)', borderRadius: 24,
                        boxShadow: 'var(--ombre-carte)', padding: 22,
                        display: 'flex', alignItems: 'center', gap: 16,
                    }}>
                        <div style={{ width: 10, alignSelf: 'stretch', borderRadius: 5, background: 'var(--action)', flexShrink: 0 }} />
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.45, fontWeight: 600, color: 'var(--gris)' }}>
                            <strong>{enteteProfs?.inscrits ?? 0} collègues ont un compte · {enteteProfs?.ont_joue ?? 0} ont joué {periode === 'mois' ? 'ce mois' : periode === 'semaine' ? 'cette semaine' : ''}.</strong> Un professeur qui a fait le Sprint sait combien 3 secondes sont courtes — c'est le meilleur argument devant une classe.
                        </div>
                    </div>

                    {/* Bouton pour aller voir les classements élèves */}
                    <button
                        type="button"
                        onClick={() => setOnglet('classes')}
                        style={{
                            height: 70, borderRadius: 22, background: 'var(--surface)',
                            boxShadow: 'var(--ombre-carte)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19,
                            color: 'var(--indigo)', border: 'none', cursor: 'pointer', marginTop: 8,
                        }}
                    >
                        Voir les classements élèves
                    </button>
                </div>
            )}

            {/* =====================================================================
             * CAS ONGLET RECORDS (Écran 31)
             * ===================================================================== */}
            {onglet === 'records' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Sous-catégories Records */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {RECORD_CATS.map(c => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => setRecordCat(c.id)}
                                style={{
                                    padding: '10px 16px', borderRadius: 999,
                                    background: recordCat === c.id ? 'var(--indigo)' : 'var(--surface)',
                                    color: recordCat === c.id ? '#fff' : 'var(--gris)',
                                    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 15,
                                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                                    boxShadow: recordCat === c.id ? 'none' : '0 3px 10px rgba(32, 34, 107, 0.07)',
                                }}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>

                    {/* Ligne 2 de filtres : Portée & Palier */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => setPortee('college')}
                            style={{
                                padding: '10px 16px', borderRadius: 999,
                                background: portee === 'college' ? 'var(--indigo)' : 'var(--surface)',
                                color: portee === 'college' ? '#fff' : 'var(--gris)',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 15,
                                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                                boxShadow: portee === 'college' ? 'none' : '0 3px 10px rgba(32, 34, 107, 0.07)',
                            }}
                        >
                            Le collège
                        </button>
                        <button
                            type="button"
                            onClick={() => setPortee('classe')}
                            style={{
                                padding: '10px 16px', borderRadius: 999,
                                background: portee === 'classe' ? 'var(--indigo)' : 'var(--surface)',
                                color: portee === 'classe' ? '#fff' : 'var(--gris)',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 15,
                                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                                boxShadow: portee === 'classe' ? 'none' : '0 3px 10px rgba(32, 34, 107, 0.07)',
                            }}
                        >
                            Ma classe
                        </button>

                        {/* Palier uniquement si pas mode Montée */}
                        {recordCat !== 'montee' && (
                            <>
                                <div style={{ width: 2, height: 26, background: 'var(--bordure)', margin: '0 4px' }} />
                                <button
                                    type="button"
                                    onClick={() => setPalier('decouverte')}
                                    style={{
                                        padding: '10px 16px', borderRadius: 999,
                                        background: (palier === 'decouverte' || palier === null) ? 'var(--indigo)' : 'var(--surface)',
                                        color: (palier === 'decouverte' || palier === null) ? '#fff' : 'var(--gris)',
                                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 15,
                                        border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                                        boxShadow: (palier === 'decouverte' || palier === null) ? 'none' : '0 3px 10px rgba(32, 34, 107, 0.07)',
                                    }}
                                >
                                    Découverte ≤10
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPalier('confirme')}
                                    style={{
                                        padding: '10px 16px', borderRadius: 999,
                                        background: palier === 'confirme' ? 'var(--indigo)' : 'var(--surface)',
                                        color: palier === 'confirme' ? '#fff' : 'var(--gris)',
                                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 15,
                                        border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                                        boxShadow: palier === 'confirme' ? 'none' : '0 3px 10px rgba(32, 34, 107, 0.07)',
                                    }}
                                >
                                    Confirmé ≤12
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPalier('expert')}
                                    style={{
                                        padding: '10px 16px', borderRadius: 999,
                                        background: palier === 'expert' ? 'var(--indigo)' : 'var(--surface)',
                                        color: palier === 'expert' ? '#fff' : 'var(--gris)',
                                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 15,
                                        border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                                        boxShadow: palier === 'expert' ? 'none' : '0 3px 10px rgba(32, 34, 107, 0.07)',
                                    }}
                                >
                                    Expert ≤20
                                </button>
                            </>
                        )}
                    </div>

                    {/* Explication de palier */}
                    <div style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                        Les records ne se comparent qu'à plafond égal — un élève au plafond 20 a plus de faits à retenir.
                    </div>

                    {/* Données / Podium / Liste */}
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '50px 0' }}>
                            <div className="spinner" style={{ margin: '0 auto 12px' }} />
                        </div>
                    ) : erreur ? (
                        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                            <p style={{ color: 'var(--rouge)', fontWeight: 700 }}>{erreur}</p>
                        </div>
                    ) : data.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                            <p style={{ color: 'var(--indigo)', fontWeight: 700, fontSize: 17, fontFamily: 'var(--titre)' }}>
                                Aucun record enregistré pour le moment
                            </p>
                            <p style={{ color: 'var(--gris)', fontSize: 14, marginTop: 6, fontFamily: 'var(--texte)', fontWeight: 600 }}>
                                Joue une partie pour inscrire le premier record !
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Podium Top 3 */}
                            {podiumEntries.length >= 2 && (
                                <div style={{
                                    padding: '16px 12px 0', display: 'flex',
                                    alignItems: 'flex-end', justifyContent: 'center', gap: 12, marginBottom: 8,
                                }}>
                                    {/* 2e (Gauche) */}
                                    {podiumEntries[1] && (
                                        <div style={{ flex: 1, maxWidth: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                                            <div style={{
                                                width: 64, height: 64, borderRadius: 22,
                                                background: 'var(--surface)', boxShadow: '0 3px 10px rgba(32, 34, 107, 0.07)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
                                            }}>
                                                {podiumEntries[1].avatar_emoji || podiumEntries[1].avatar || '🐼'}
                                            </div>
                                            <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18, color: 'var(--indigo)', textAlign: 'center' }}>
                                                {podiumEntries[1].nom_affiche || '—'}
                                            </span>
                                            {podiumEntries[1].classe && (
                                                <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                                                    {podiumEntries[1].classe}
                                                </span>
                                            )}
                                            <div style={{
                                                width: '100%', height: 104, borderRadius: '20px 20px 0 0',
                                                background: '#C9CEE0', display: 'flex', flexDirection: 'column',
                                                alignItems: 'center', justifyContent: 'center', gap: 1,
                                            }}>
                                                <span className="font-display" style={{ fontWeight: 700, fontSize: 26, color: '#fff' }}>2</span>
                                                <span className="font-display" style={{ fontWeight: 700, fontSize: 19, color: '#fff' }}>
                                                    {formaterValeurRecord(podiumEntries[1].valeur, recordCat)}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* 1er (Centre) */}
                                    {podiumEntries[0] && (
                                        <div style={{ flex: 1, maxWidth: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                                            <div style={{
                                                width: 78, height: 78, borderRadius: 22,
                                                background: 'var(--ciel-pale)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40,
                                            }}>
                                                {podiumEntries[0].avatar_emoji || podiumEntries[0].avatar || '⚡'}
                                            </div>
                                            <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 20, color: 'var(--indigo)', textAlign: 'center' }}>
                                                {podiumEntries[0].nom_affiche || '—'}
                                            </span>
                                            {podiumEntries[0].classe && (
                                                <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                                                    {podiumEntries[0].classe}
                                                </span>
                                            )}
                                            <div style={{
                                                width: '100%', height: 148, borderRadius: '20px 20px 0 0',
                                                background: 'var(--action)', display: 'flex', flexDirection: 'column',
                                                alignItems: 'center', justifyContent: 'center', gap: 1,
                                            }}>
                                                <span className="font-display" style={{ fontWeight: 700, fontSize: 34, color: '#fff' }}>1</span>
                                                <span className="font-display" style={{ fontWeight: 700, fontSize: 25, color: '#fff' }}>
                                                    {formaterValeurRecord(podiumEntries[0].valeur, recordCat)}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* 3e (Droite) */}
                                    {podiumEntries[2] && (
                                        <div style={{ flex: 1, maxWidth: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                                            <div style={{
                                                width: 64, height: 64, borderRadius: 22,
                                                background: 'var(--surface)', boxShadow: '0 3px 10px rgba(32, 34, 107, 0.07)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
                                            }}>
                                                {podiumEntries[2].avatar_emoji || podiumEntries[2].avatar || '🐢'}
                                            </div>
                                            <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18, color: 'var(--indigo)', textAlign: 'center' }}>
                                                {podiumEntries[2].nom_affiche || '—'}
                                            </span>
                                            {podiumEntries[2].classe && (
                                                <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                                                    {podiumEntries[2].classe}
                                                </span>
                                            )}
                                            <div style={{
                                                width: '100%', height: 80, borderRadius: '20px 20px 0 0',
                                                background: '#D8CDBE', display: 'flex', flexDirection: 'column',
                                                alignItems: 'center', justifyContent: 'center', gap: 1,
                                            }}>
                                                <span className="font-display" style={{ fontWeight: 700, fontSize: 26, color: '#fff' }}>3</span>
                                                <span className="font-display" style={{ fontWeight: 700, fontSize: 19, color: '#fff' }}>
                                                    {formaterValeurRecord(podiumEntries[2].valeur, recordCat)}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Lignes 4+ */}
                            {listEntries.length > 0 && (
                                <div style={{
                                    background: 'var(--surface)', borderRadius: 24,
                                    boxShadow: 'var(--ombre-carte)', padding: '8px 22px',
                                    display: 'flex', flexDirection: 'column',
                                }}>
                                    {listEntries.map((row, idx) => {
                                        const rang = row.rang ?? (idx + 4);
                                        const isLast = idx === listEntries.length - 1;
                                        return (
                                            <div
                                                key={idx}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 16,
                                                    padding: '15px 0', borderBottom: isLast ? 'none' : '2px solid var(--surface-alt)',
                                                }}
                                            >
                                                <span className="font-display" style={{ width: 36, fontWeight: 700, fontSize: 21, color: 'var(--gris)' }}>
                                                    {rang}
                                                </span>
                                                <span style={{ fontSize: 27 }}>{row.avatar || '🐙'}</span>
                                                <span style={{ flex: 1, fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 20, color: 'var(--indigo)' }}>
                                                    {row.nom_affiche}
                                                </span>
                                                {row.classe && (
                                                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 16, color: 'var(--gris)' }}>
                                                        {row.classe}
                                                    </span>
                                                )}
                                                <span className="font-display" style={{ width: 70, textAlign: 'right', fontWeight: 700, fontSize: 21, color: 'var(--indigo)' }}>
                                                    {formaterValeurRecord(row.valeur, recordCat)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Ligne épinglée pour l'élève connecté */}
                            {!estProf && maPlace && (!estDansLaListeAffichee || maPlace.rang > 3) && (
                                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{
                                        background: 'var(--ciel-pale)', border: '3px solid var(--action)',
                                        borderRadius: 22, padding: '20px 22px', display: 'flex',
                                        alignItems: 'center', gap: 16,
                                    }}>
                                        <span className="font-display" style={{ width: 36, fontWeight: 700, fontSize: 24, color: 'var(--action)' }}>
                                            {maPlace.rang}
                                        </span>
                                        <span style={{ fontSize: 30 }}>{monAvatar}</span>
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                            <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 21, color: 'var(--indigo)' }}>
                                                {monPrenom} {monInitiale} <span style={{ color: 'var(--action)' }}>(toi)</span>
                                            </span>
                                            <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 15, color: 'var(--gris)' }}>
                                                {maPlace.rang === 1 ? 'Tu es en tête ! Bravo.' : (
                                                    maPlace.rang_au_dessus ? (
                                                        recordCat === 'sprint'
                                                            ? `${maPlace.ecart_au_dessus} ${maPlace.ecart_au_dessus > 1 ? 'secondes' : 'seconde'} de moins et tu passes ${maPlace.rang_au_dessus}ᵉ`
                                                            : recordCat === 'chrono'
                                                            ? `${maPlace.ecart_au_dessus} ${maPlace.ecart_au_dessus > 1 ? 'points' : 'point'} de plus et tu passes ${maPlace.rang_au_dessus}ᵉ`
                                                            : recordCat === 'serie'
                                                            ? `${maPlace.ecart_au_dessus} sans faute de plus et tu passes ${maPlace.rang_au_dessus}ᵉ`
                                                            : `${maPlace.ecart_au_dessus} table de plus et tu passes ${maPlace.rang_au_dessus}ᵉ`
                                                    ) : null
                                                )}
                                            </span>
                                        </div>
                                        <span className="font-display" style={{ fontWeight: 700, fontSize: 24, color: 'var(--indigo)' }}>
                                            {formaterValeurRecord(maPlace.valeur, recordCat)}
                                        </span>
                                    </div>
                                    <div style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 15, color: 'var(--gris)', textAlign: 'center' }}>
                                        Ta ligne reste visible quand la liste défile.
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* =====================================================================
             * CAS ONGLET PROGRESSION (Écran 22) OU CLASSES (Écran 23)
             * ===================================================================== */}
            {(onglet === 'progression' || onglet === 'classes') && (
                <>
                    {/* Filtres de période et portée pour Progression et Classes */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {PERIODES.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setPeriode(p.id)}
                                    style={{
                                        padding: '8px 16px', borderRadius: 999,
                                        background: periode === p.id ? 'var(--indigo)' : 'var(--surface)',
                                        color: periode === p.id ? '#ffffff' : 'var(--gris)',
                                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 14,
                                        border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                                        boxShadow: periode === p.id ? 'none' : '0 1px 4px rgba(48,59,122,.06)',
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {/* Portée pour Progression */}
                        {!estProf && onglet === 'progression' && (
                            <div style={{
                                marginLeft: 'auto', display: 'flex', gap: 4,
                                background: 'var(--surface-alt)', padding: 4, borderRadius: 999,
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setPortee('college')}
                                    style={{
                                        padding: '6px 14px', borderRadius: 999,
                                        background: portee === 'college' ? 'var(--surface)' : 'transparent',
                                        color: portee === 'college' ? 'var(--indigo)' : 'var(--gris)',
                                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 13,
                                        border: 'none', cursor: 'pointer',
                                    }}
                                >
                                    Collège
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPortee('classe')}
                                    style={{
                                        padding: '6px 14px', borderRadius: 999,
                                        background: portee === 'classe' ? 'var(--surface)' : 'transparent',
                                        color: portee === 'classe' ? 'var(--indigo)' : 'var(--gris)',
                                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 13,
                                        border: 'none', cursor: 'pointer',
                                    }}
                                >
                                    Ma classe
                                </button>
                            </div>
                        )}

                        {/* Niveaux pour Classes */}
                        {onglet === 'classes' && niveauxDisponibles.length > 0 && (
                            <div style={{
                                marginLeft: 'auto', display: 'flex', gap: 4,
                                background: 'var(--surface-alt)', padding: 4, borderRadius: 999,
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setNiveauClasse(null)}
                                    style={{
                                        padding: '6px 12px', borderRadius: 999,
                                        background: niveauClasse === null ? 'var(--surface)' : 'transparent',
                                        color: niveauClasse === null ? 'var(--indigo)' : 'var(--gris)',
                                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 13,
                                        border: 'none', cursor: 'pointer',
                                    }}
                                >
                                    Tous
                                </button>
                                {niveauxDisponibles.map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setNiveauClasse(n)}
                                        style={{
                                            padding: '6px 12px', borderRadius: 999,
                                            background: niveauClasse === n ? 'var(--surface)' : 'transparent',
                                            color: niveauClasse === n ? 'var(--indigo)' : 'var(--gris)',
                                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 13,
                                            border: 'none', cursor: 'pointer',
                                        }}
                                    >
                                        {n}ᵉ
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Données / Podium / Liste */}
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '60px 0' }}>
                            <div className="spinner" style={{ margin: '0 auto 12px' }} />
                            <span style={{ fontFamily: 'var(--texte)', color: 'var(--gris)', fontWeight: 600 }}>
                                Chargement du classement…
                            </span>
                        </div>
                    ) : erreur ? (
                        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                            <p style={{ color: 'var(--rouge)', fontWeight: 700 }}>{erreur}</p>
                        </div>
                    ) : data.length === 0 ? (
                        <div style={{
                            background: 'var(--surface)', borderRadius: 24,
                            boxShadow: 'var(--ombre-carte)', padding: '36px 24px',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            gap: 14, textAlign: 'center', margin: '14px 0',
                        }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 22px)', gap: 6 }}>
                                {Array.from({ length: 9 }).map((_, i) => (
                                    <div key={i} style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--bordure)' }} />
                                ))}
                            </div>
                            <div className="font-display" style={{ fontSize: 24, fontWeight: 700, color: 'var(--indigo)' }}>
                                Personne n'a encore joué cette semaine
                            </div>
                            <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.45, color: 'var(--gris)', maxWidth: 480 }}>
                                Sois le premier. Une seule partie suffit pour apparaître ici.
                            </div>
                            <button
                                type="button"
                                style={{
                                    height: 52, padding: '0 28px', fontSize: 17, fontWeight: 700, marginTop: 4,
                                    background: 'var(--action)', color: 'var(--action-texte)', borderRadius: 16, border: 'none',
                                    cursor: 'pointer',
                                }}
                                onClick={() => onGo ? onGo('play') : null}
                            >
                                Jouer une partie
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Podium (Maquette 22) si onglet != classes */}
                            {onglet !== 'classes' && podiumEntries.length >= 2 && (
                                <div style={{
                                    padding: '16px 12px 0', display: 'flex',
                                    alignItems: 'flex-end', justifyContent: 'center', gap: 12, marginBottom: 18,
                                }}>
                                    {/* 2e (Gauche) */}
                                    {podiumEntries[1] && (
                                        <div style={{ flex: 1, maxWidth: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 32 }}>{podiumEntries[1].avatar_emoji || podiumEntries[1].avatar || '🐝'}</span>
                                            <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 15, color: 'var(--indigo)', textAlign: 'center' }}>
                                                {podiumEntries[1].nom_affiche || podiumEntries[1].classe}
                                            </span>
                                            {podiumEntries[1].classe && (
                                                <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 13, color: 'var(--gris)' }}>
                                                    {podiumEntries[1].classe}
                                                </span>
                                            )}
                                            <div style={{
                                                width: '100%', height: 96, borderRadius: '18px 18px 0 0',
                                                background: 'var(--gris-inerte)', display: 'flex', flexDirection: 'column',
                                                alignItems: 'center', justifyContent: 'center', gap: 2,
                                            }}>
                                                <span className="font-display" style={{ fontWeight: 700, fontSize: 26, color: '#ffffff' }}>2</span>
                                                <span className="font-display" style={{ fontWeight: 700, fontSize: 18, color: '#ffffff' }}>{podiumEntries[1].valeur ?? podiumEntries[1].points ?? 0}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* 1er (Centre) */}
                                    {podiumEntries[0] && (
                                        <div style={{ flex: 1, maxWidth: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 40 }}>{podiumEntries[0].avatar_emoji || podiumEntries[0].avatar || '⚡'}</span>
                                            <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17, color: 'var(--indigo)', textAlign: 'center' }}>
                                                {podiumEntries[0].nom_affiche || podiumEntries[0].classe}
                                            </span>
                                            {podiumEntries[0].classe && (
                                                <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 13, color: 'var(--gris)' }}>
                                                    {podiumEntries[0].classe}
                                                </span>
                                            )}
                                            <div style={{
                                                width: '100%', height: 136, borderRadius: '18px 18px 0 0',
                                                background: 'var(--action)', display: 'flex', flexDirection: 'column',
                                                alignItems: 'center', justifyContent: 'center', gap: 2,
                                            }}>
                                                <span className="font-display" style={{ fontWeight: 700, fontSize: 32, color: 'var(--action-texte)' }}>1</span>
                                                <span className="font-display" style={{ fontWeight: 700, fontSize: 22, color: 'var(--action-texte)' }}>{podiumEntries[0].valeur ?? podiumEntries[0].points ?? 0}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* 3e (Droite) */}
                                    {podiumEntries[2] && (
                                        <div style={{ flex: 1, maxWidth: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 32 }}>{podiumEntries[2].avatar_emoji || podiumEntries[2].avatar || '🦁'}</span>
                                            <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 15, color: 'var(--indigo)', textAlign: 'center' }}>
                                                {podiumEntries[2].nom_affiche || podiumEntries[2].classe}
                                            </span>
                                            {podiumEntries[2].classe && (
                                                <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 13, color: 'var(--gris)' }}>
                                                    {podiumEntries[2].classe}
                                                </span>
                                            )}
                                            <div style={{
                                                width: '100%', height: 76, borderRadius: '18px 18px 0 0',
                                                background: 'var(--bordure)', display: 'flex', flexDirection: 'column',
                                                alignItems: 'center', justifyContent: 'center', gap: 2,
                                            }}>
                                                <span className="font-display" style={{ fontWeight: 700, fontSize: 22, color: 'var(--indigo)' }}>3</span>
                                                <span className="font-display" style={{ fontWeight: 700, fontSize: 16, color: 'var(--indigo)' }}>{podiumEntries[2].valeur ?? podiumEntries[2].points ?? 0}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TABLEAU DES LIGNES */}
                            <div style={{
                                background: 'var(--surface)', borderRadius: 20,
                                boxShadow: 'var(--ombre-carte)', padding: '6px 18px',
                            }}>
                                {(onglet !== 'classes' && podiumEntries.length >= 2 ? listEntries : data).map((entry, idx) => {
                                    const estMoi = entry.est_moi === true;
                                    const rang = entry.rang ?? (idx + 1);
                                    const name = entry.nom_affiche || entry.classe || '—';
                                    const avatar = entry.avatar_emoji || entry.avatar || '';
                                    const val = entry.valeur ?? entry.points ?? 0;
                                    const isLast = idx === (onglet !== 'classes' && podiumEntries.length >= 2 ? listEntries.length - 1 : data.length - 1);

                                    return (
                                        <div
                                            key={idx}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 14,
                                                padding: '14px 0', borderBottom: isLast ? 'none' : '1px solid var(--bordure)',
                                            }}
                                        >
                                            <span className="font-display" style={{
                                                fontWeight: 700, fontSize: 20, width: 34,
                                                color: rang === 1 ? 'var(--action)' : 'var(--gris)',
                                                textAlign: 'center',
                                            }}>
                                                {rang}
                                            </span>

                                            {avatar && <span style={{ fontSize: 26 }}>{avatar}</span>}

                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16, color: 'var(--indigo)' }}>
                                                    {name}
                                                    {estMoi && (
                                                        <span style={{ color: 'var(--action)', marginLeft: 6, fontWeight: 700, fontSize: 13 }}>
                                                            {onglet === 'classes' ? '(ma classe)' : '(toi)'}
                                                        </span>
                                                    )}
                                                </span>

                                                {/* Pour le classement des élèves, afficher la classe */}
                                                {onglet !== 'classes' && entry.classe && (
                                                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 13, color: 'var(--gris)' }}>
                                                        {entry.classe}
                                                    </span>
                                                )}

                                                {/* Pour le classement des classes : "24 ont joué · 28 inscrits" */}
                                                {onglet === 'classes' && entry.ont_joue != null && (
                                                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 13, color: 'var(--gris)' }}>
                                                        {entry.ont_joue} ont joué · {entry.inscrits} inscrits
                                                    </span>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                                                <span className="font-display" style={{ fontWeight: 700, fontSize: 22, color: 'var(--indigo)' }}>
                                                    {val}
                                                </span>
                                                {onglet === 'classes' && (
                                                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 12, color: 'var(--gris)' }}>
                                                        points par élève inscrit
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* LIGNE ÉPINGLÉE DE L'ÉLÈVE pour Progression */}
                            {onglet === 'progression' && !estDansLaListeAffichee && maPlace && (
                                <div style={{
                                    position: 'sticky', bottom: 12, marginTop: 12,
                                    background: 'var(--ciel-pale)', border: '2px solid var(--action)',
                                    borderRadius: 20, padding: '14px 18px', display: 'flex',
                                    alignItems: 'center', gap: 14, boxShadow: 'var(--ombre-carte)',
                                }}>
                                    <span style={{ width: 34, fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 24, color: 'var(--action)', textAlign: 'center' }}>
                                        {maPlace.rang}
                                    </span>
                                    <span style={{ fontSize: 28 }}>{monAvatar}</span>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16, color: 'var(--indigo)' }}>
                                            {monPrenom} {monInitiale} <span style={{ color: 'var(--action)', fontWeight: 700 }}>(toi)</span>
                                        </span>
                                        {maPlace.ecart_au_dessus != null && maPlace.rang_au_dessus != null ? (
                                            <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 13, color: 'var(--gris)' }}>
                                                {maPlace.ecart_au_dessus} points de la {maPlace.rang_au_dessus}ᵉ place
                                            </span>
                                        ) : (
                                            <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 13, color: 'var(--gris)' }}>
                                                {maPlace.points} points
                                            </span>
                                        )}
                                    </div>
                                    <span className="font-display" style={{ fontWeight: 700, fontSize: 24, color: 'var(--indigo)' }}>
                                        {maPlace.points}
                                    </span>
                                </div>
                            )}

                            {/* Règle hebdomadaire en bas */}
                            {periode === 'semaine' && (
                                <p style={{
                                    textAlign: 'center', fontSize: 12, fontWeight: 600,
                                    fontFamily: 'var(--texte)', color: 'var(--gris)', marginTop: 16,
                                }}>
                                    Le classement repart à zéro chaque lundi — tout le monde a sa chance.
                                </p>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}
