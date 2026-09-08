import React, { useState, useEffect, useMemo } from 'react';
import {
    classementProgression,
    maPlaceProgression,
    classementRecords,
    classementClasses,
    classementProfs,
} from '../api';
import { IconClassements } from '../components/Icons';

/**
 * Leaderboards — Classements (Maquettes 22 et 23)
 *
 * Onglets : Progression · Records · Classes · Profs (si prof connecté).
 *
 * RÈGLES PROJET (Lot 21) :
 * - Migration 28 : classement_classes renvoie ont_joue, inscrits, points_par_inscrit.
 * - Le mot « actif » est rigoureusement banni quand il parle de quelqu'un qui joue.
 *   On écrit « 24 ont joué · 28 inscrits » et « points par élève inscrit ».
 * - Maquette 22 : si l'élève est au-delà de la limite, sa ligne reste épinglée en bas
 *   avec rang, points, et écart (`maPlaceProgression`). Si l'élève est déjà dans la liste,
 *   aucune duplication.
 * - Maquette 23 : état vide quand `classement_classes` renvoie zéro ligne.
 */

const ONGLETS = [
    { id: 'progression', label: 'Progression' },
    { id: 'records', label: 'Records' },
    { id: 'classes', label: 'Classes' },
];

const RECORD_CATS = [
    { id: 'serie', label: 'Série', unit: 'sans faute' },
    { id: 'chrono', label: 'Chrono', unit: 'pts / 2 min' },
    { id: 'sprint', label: 'Sprint', unit: 's' },
    { id: 'montee', label: 'Montée', unit: 'table' },
];

const PERIODES = [
    { id: 'semaine', label: 'Cette semaine' },
    { id: 'mois', label: 'Ce mois' },
    { id: 'tout', label: 'Tout' },
];

const PORTEES = [
    { id: 'college', label: 'Collège' },
    { id: 'classe', label: 'Ma classe' },
];

export default function Leaderboards({ onBack, identite, estProf, onGo }) {
    const [onglet, setOnglet] = useState(estProf ? 'classes' : 'progression');
    const [periode, setPeriode] = useState('semaine');
    const [portee, setPortee] = useState('college');
    const [palier, setPalier] = useState(null);
    const [recordCat, setRecordCat] = useState('serie');
    const [niveauClasse, setNiveauClasse] = useState(null);
    const [niveauxDisponibles, setNiveauxDisponibles] = useState([]);

    const [data, setData] = useState([]);
    const [maPlace, setMaPlace] = useState(null);
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);

    // Onglets visibles — un prof ne voit pas Progression ni Records
    const onglets = useMemo(() => (
        estProf
            ? [{ id: 'classes', label: 'Classes' },
               { id: 'profs', label: 'Profs' }]
            : [...ONGLETS]
    ), [estProf]);

    // Chargement des données
    useEffect(() => {
        let annule = false;
        async function charger() {
            setLoading(true);
            setErreur(null);
            let res;
            let resPlace = null;

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
                    res = await classementRecords({ categorie: recordCat, periode, portee, palier, limite: 20 });
                } else if (onglet === 'classes') {
                    res = await classementClasses({ periode, niveau: niveauClasse });
                } else if (onglet === 'profs') {
                    res = await classementProfs({ periode, limite: 20 });
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
    }, [onglet, periode, portee, palier, recordCat, niveauClasse, estProf]);

    const currentRecordCat = RECORD_CATS.find(c => c.id === recordCat) || RECORD_CATS[0];
    const unit = onglet === 'records' ? currentRecordCat.unit
               : onglet === 'classes' ? 'points par élève inscrit'
               : 'pts';

    // Podium (top 3) et reste (4+)
    const podiumEntries = data.slice(0, 3);
    const listEntries = data.slice(3);

    // L'élève figure-t-il dans les données affichées ?
    const estDansLaListeAffichee = data.some(r => r.est_moi);

    // Nom et avatar de l'élève connecté
    const monPrenom = identite?.prenom || identite?.profil?.prenom || 'Moi';
    const monNom = identite?.nom || identite?.profil?.nom || '';
    const monInitiale = monNom ? monNom[0] + '.' : '';
    const monAvatar = identite?.avatar_emoji || identite?.profil?.avatar_emoji || '🦊';

    return (
        <div className="screen-enter" style={{ maxWidth: 834, margin: '0 auto', paddingBottom: 32 }}>
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <h1 className="font-display" style={{ fontSize: 32, fontWeight: 700, color: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <IconClassements size={28} color="var(--indigo)" actionColor="var(--action)" /> Classements
                </h1>
            </div>

            {/* Onglets principaux */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {onglets.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setOnglet(t.id)}
                        style={{
                            flex: 1, height: 50, borderRadius: 14,
                            background: onglet === t.id ? 'var(--indigo)' : 'var(--surface)',
                            color: onglet === t.id ? '#ffffff' : 'var(--gris)',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                            border: onglet === t.id ? 'none' : '1px solid var(--bordure)',
                            boxShadow: onglet === t.id ? 'none' : '0 2px 8px rgba(48,59,122,.08)',
                            cursor: 'pointer', transition: 'all 0.15s ease',
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Note Enseignants pour l'onglet Profs */}
            {estProf && onglet === 'profs' && (
                <div style={{ fontSize: 13, fontFamily: 'var(--texte)', color: 'var(--gris)', fontWeight: 600, marginBottom: 10, textAlign: 'center' }}>
                    L'onglet « Profs » n'apparaît que pour un enseignant connecté.
                </div>
            )}

            {/* Filtres de période et portée */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                {/* Périodes */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {PERIODES.map(p => (
                        <button
                            key={p.id}
                            onClick={() => setPeriode(p.id)}
                            style={{
                                padding: '8px 16px', borderRadius: 999,
                                background: periode === p.id ? 'var(--indigo)' : 'var(--surface)',
                                color: periode === p.id ? '#ffffff' : 'var(--gris)',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 14,
                                border: periode === p.id ? 'none' : '1px solid var(--bordure)',
                                cursor: 'pointer', whiteSpace: 'nowrap',
                                boxShadow: periode === p.id ? 'none' : '0 1px 4px rgba(48,59,122,.06)',
                            }}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* Portée (Progression & Records pour élèves) */}
                {!estProf && (onglet === 'progression' || onglet === 'records') && (
                    <div style={{
                        marginLeft: 'auto', display: 'flex', gap: 4,
                        background: 'var(--ivoire)', padding: 4, borderRadius: 999,
                        border: '1px solid var(--bordure)',
                    }}>
                        {PORTEES.map(pt => (
                            <button
                                key={pt.id}
                                onClick={() => setPortee(pt.id)}
                                style={{
                                    padding: '6px 14px', borderRadius: 999,
                                    background: portee === pt.id ? 'var(--surface)' : 'transparent',
                                    color: portee === pt.id ? 'var(--indigo)' : 'var(--gris)',
                                    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 13,
                                    border: 'none', cursor: 'pointer',
                                    boxShadow: portee === pt.id ? '0 1px 4px rgba(48,59,122,.1)' : 'none',
                                }}
                            >
                                {pt.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Niveaux pour Classes */}
                {onglet === 'classes' && niveauxDisponibles.length > 0 && (
                    <div style={{
                        marginLeft: 'auto', display: 'flex', gap: 4,
                        background: 'var(--ivoire)', padding: 4, borderRadius: 999,
                        border: '1px solid var(--bordure)',
                    }}>
                        <button
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

            {/* Sous-catégories Records */}
            {onglet === 'records' && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
                    {RECORD_CATS.map(c => (
                        <button
                            key={c.id}
                            className={`chip${recordCat === c.id ? ' chip--coral' : ''}`}
                            style={{ fontSize: 13, padding: '6px 14px', whiteSpace: 'nowrap' }}
                            onClick={() => setRecordCat(c.id)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Contenu principal */}
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
                /* ÉTAT VIDE (Maquette 23 pour classes, ou générique) */
                onglet === 'classes' ? (
                    <div style={{
                        background: 'var(--surface)', borderRadius: 24,
                        boxShadow: 'var(--ombre-carte)', padding: '36px 24px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        gap: 14, textAlign: 'center', margin: '14px 0', border: '1px solid var(--bordure)',
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
                            className="btn btn--gold"
                            style={{ height: 52, padding: '0 28px', fontSize: 17, fontWeight: 700, marginTop: 4 }}
                            onClick={() => onGo ? onGo('play') : null}
                        >
                            Jouer une partie
                        </button>
                        <button
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontFamily: 'var(--texte)', fontSize: 14, fontWeight: 600,
                                color: 'var(--action)', marginTop: 4,
                            }}
                            onClick={() => setPeriode('mois')}
                        >
                            Ou regarde le classement du mois ›
                        </button>
                    </div>
                ) : (
                    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                        <p style={{ color: 'var(--indigo)', fontWeight: 700, fontSize: 17, fontFamily: 'var(--titre)' }}>
                            Tu n'as pas encore joué cette semaine
                        </p>
                        <p style={{ color: 'var(--gris)', fontSize: 14, marginTop: 6, fontFamily: 'var(--texte)', fontWeight: 600 }}>
                            Joue une partie en mode Libre ou relève un défi pour apparaître ici !
                        </p>
                        <button
                            className="btn btn--gold"
                            style={{ marginTop: 16, fontSize: 15, padding: '10px 20px' }}
                            onClick={() => onGo ? onGo('play') : null}
                        >
                            Jouer une partie
                        </button>
                    </div>
                )
            ) : (
                <>
                    {/* PODIUM (Maquette 22) si plus de 2 participants et onglet != classes */}
                    {onglet !== 'classes' && podiumEntries.length >= 2 ? (
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
                    ) : null}

                    {/* TABLEAU DES LIGNES (4+ si podium, ou tous pour classes) */}
                    <div style={{
                        background: 'var(--surface)', borderRadius: 20,
                        boxShadow: 'var(--ombre-carte)', padding: '6px 18px',
                        border: '1px solid var(--bordure)',
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

                    {/* SÉPARATEUR si l'élève est au-delà */}
                    {onglet === 'progression' && !estDansLaListeAffichee && maPlace && (
                        <div style={{ padding: '16px 0 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 1, height: 1, background: 'var(--bordure)' }} />
                            <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 13, color: 'var(--gris)' }}>
                                rangs {data.length + 1} à {maPlace.rang - 1}
                            </span>
                            <div style={{ flex: 1, height: 1, background: 'var(--bordure)' }} />
                        </div>
                    )}

                    {/* LIGNE ÉPINGLÉE DE L'ÉLÈVE (Maquette 22) */}
                    {onglet === 'progression' && !estDansLaListeAffichee && maPlace && (
                        <div style={{
                            position: 'sticky', bottom: 12, marginTop: 12,
                            background: 'var(--rouge-pale)', border: '2px solid var(--action)',
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
                    {(onglet === 'progression' || onglet === 'classes') && periode === 'semaine' && (
                        <p style={{
                            textAlign: 'center', fontSize: 12, fontWeight: 600,
                            fontFamily: 'var(--texte)', color: 'var(--gris)', marginTop: 16,
                        }}>
                            Le classement repart à zéro chaque lundi — tout le monde a sa chance.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
