import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    classementProgression,
    classementRecords,
    classementClasses,
    classementProfs,
} from '../api';

/**
 * Leaderboards — Classements
 *
 * Deux onglets : Progression (défaut), Records.
 * Trois filtres : portée, période, palier.
 * Plus : classement inter-classes et salle des profs (si prof).
 *
 * RÈGLES :
 * - Le tri est fait en SQL — ne pas re-trier côté client.
 * - Les noms sont anonymisés en base (« Alice D. ») — ne pas reconstruire.
 * - Chaque ligne porte `est_moi` pour surligner l'élève.
 */

const ONGLETS = [
    { id: 'progression', label: '📈 Progression' },
    { id: 'records', label: '🏆 Records' },
    { id: 'classes', label: '🏫 Classes' },
];

const RECORD_CATS = [
    { id: 'serie', label: '🔥 Série', unit: 'sans faute' },
    { id: 'chrono', label: '⏱ Chrono', unit: 'pts / 2 min' },
    { id: 'sprint', label: '🏃 Sprint', unit: 's' },
    { id: 'montee', label: '🧗 Montée', unit: 'table' },
];

const PERIODES = [
    { id: 'semaine', label: 'Semaine',  suffixe: 'cette semaine' },
    { id: 'mois',    label: 'Mois',     suffixe: 'ce mois' },
    { id: 'annee',   label: 'Année',    suffixe: 'cette année' },
    { id: 'tout',    label: 'Toujours', suffixe: '' },
];

const PORTEES = [
    { id: 'classe', label: 'Ma classe' },
    { id: 'niveau', label: 'Mon niveau' },
    { id: 'college', label: 'Le collège' },
];

const PALIERS = [
    { id: null, label: 'Mon palier' },
    { id: 'decouverte', label: '🌱 Découverte' },
    { id: 'confirme', label: '⭐ Confirmé' },
    { id: 'expert', label: '🏆 Expert' },
    { id: 'tous', label: '🌟 Tous' },
];

export default function Leaderboards({ onBack, identite, estProf }) {
    const [onglet, setOnglet] = useState(estProf ? 'classes' : 'progression');
    const [periode, setPeriode] = useState('semaine');
    const [portee, setPortee] = useState('classe');
    const [palier, setPalier] = useState(null);
    const [recordCat, setRecordCat] = useState('serie');
    const [niveauClasse, setNiveauClasse] = useState(null);
    const [niveauxDisponibles, setNiveauxDisponibles] = useState([]);

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);

    // Onglets visibles — un prof ne voit pas Progression ni Records
    // (eleve_courant() vaut null pour lui, ces classements seraient vides)
    const onglets = useMemo(() => (
        estProf
            ? [{ id: 'classes', label: '🏫 Classes' },
               { id: 'profs',   label: '🎓 Salle des profs' }]
            : [...ONGLETS]
    ), [estProf]);

    // --- Chargement des données ---
    useEffect(() => {
        let annule = false;
        async function charger() {
            setLoading(true);
            setErreur(null);
            let res;

            try {
                if (onglet === 'progression') {
                    res = await classementProgression({ periode, portee, palier });
                } else if (onglet === 'records') {
                    res = await classementRecords({ categorie: recordCat, periode, portee, palier });
                } else if (onglet === 'classes') {
                    res = await classementClasses({ periode, niveau: niveauClasse });
                } else if (onglet === 'profs') {
                    res = await classementProfs({ periode });
                }

                if (annule) return;
                if (!res?.ok) {
                    setErreur(res?.error || 'Impossible de charger le classement.');
                    setData([]);
                } else {
                    let rows = res.data || [];
                    // classement_classes renvoie des colonnes différentes :
                    // rang, classe, eleves_actifs, eleves_total, points_moyens, est_ma_classe
                    // On normalise vers la forme attendue par PodiumCard et LeaderboardRow.
                    if (onglet === 'classes') {
                        rows = rows.map(r => ({
                            rang: r.rang,
                            nom_affiche: r.classe,
                            classe: r.classe,
                            avatar: '🏫',
                            valeur: r.points_moyens ?? 0,
                            est_moi: r.est_ma_classe === true,
                            eleves_actifs: r.eleves_actifs ?? 0,
                            eleves_total: r.eleves_total ?? 0,
                        }));
                    }
                    setData(rows);
                    // Déduire les niveaux disponibles des classes renvoyées
                    if (onglet === 'classes' && niveauClasse === null && rows.length) {
                        const niveaux = [...new Set(
                            rows.map(r => (r.classe || '')[0]).filter(Boolean)
                        )].sort();
                        setNiveauxDisponibles(niveaux);
                    }
                }
            } catch {
                if (!annule) setErreur('Erreur réseau.');
            }
            if (!annule) setLoading(false);
        }
        charger();
        return () => { annule = true; };
    }, [onglet, periode, portee, palier, recordCat, niveauClasse]);

    const showFilters = !estProf && (onglet === 'progression' || onglet === 'records');
    const currentRecordCat = RECORD_CATS.find(c => c.id === recordCat) || RECORD_CATS[0];

    // Unité d'affichage selon le contexte — le score porte toujours sa période
    const periodeInfo = PERIODES.find(p => p.id === periode) || PERIODES[0];
    const unit = onglet === 'records' ? currentRecordCat.unit
               : onglet === 'progression' ? (periodeInfo.suffixe ? `pts ${periodeInfo.suffixe}` : 'pts')
               : onglet === 'classes' ? (periodeInfo.suffixe ? `pts / élève ${periodeInfo.suffixe}` : 'pts / élève')
               : 'pts';

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <h1 className="font-display" style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)' }}>
                    🏆 Classements
                </h1>
            </div>

            {/* Onglets principaux */}
            <div className="viz-tabs" style={{ marginBottom: 10 }}>
                {onglets.map(t => (
                    <button
                        key={t.id}
                        className={`viz-tab${onglet === t.id ? ' viz-tab--active' : ''}`}
                        onClick={() => setOnglet(t.id)}
                        style={{ fontSize: 13 }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Sous-catégories Records */}
            {onglet === 'records' && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto' }}>
                    {RECORD_CATS.map(c => (
                        <button
                            key={c.id}
                            className={`chip${recordCat === c.id ? ' chip--coral' : ''}`}
                            style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
                            onClick={() => setRecordCat(c.id)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Filtres */}
            {showFilters && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {/* Portée */}
                    <div style={{ display: 'flex', gap: 4 }}>
                        {PORTEES.map(p => (
                            <button
                                key={p.id}
                                className={`chip${portee === p.id ? ' chip--navy' : ''}`}
                                style={{ flex: 1, width: 'auto', fontSize: 12, height: 36 }}
                                onClick={() => setPortee(p.id)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Période */}
                    <div style={{ display: 'flex', gap: 4 }}>
                        {PERIODES.map(p => (
                            <button
                                key={p.id}
                                className={`chip${periode === p.id ? ' chip--gold' : ''}`}
                                style={{ flex: 1, width: 'auto', fontSize: 12, height: 36 }}
                                onClick={() => setPeriode(p.id)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Palier */}
                    <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
                        {PALIERS.map(p => (
                            <button
                                key={p.id ?? 'mon'}
                                className={`chip${palier === p.id ? ' chip--purple' : ''}`}
                                style={{ fontSize: 11, padding: '6px 10px', whiteSpace: 'nowrap' }}
                                onClick={() => setPalier(p.id)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Période pour classes et profs */}
            {(onglet === 'classes' || onglet === 'profs') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {PERIODES.map(p => (
                            <button
                                key={p.id}
                                className={`chip${periode === p.id ? ' chip--gold' : ''}`}
                                style={{ flex: 1, width: 'auto', fontSize: 12, height: 36 }}
                                onClick={() => setPeriode(p.id)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Filtre par niveau (Classes uniquement) */}
                    {onglet === 'classes' && niveauxDisponibles.length > 0 && (
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button
                                className={`chip${niveauClasse === null ? ' chip--navy' : ''}`}
                                style={{ flex: 1, width: 'auto', fontSize: 12, height: 36 }}
                                onClick={() => setNiveauClasse(null)}
                            >
                                Tous
                            </button>
                            {niveauxDisponibles.map(n => (
                                <button
                                    key={n}
                                    className={`chip${niveauClasse === n ? ' chip--navy' : ''}`}
                                    style={{ flex: 1, width: 'auto', fontSize: 12, height: 36 }}
                                    onClick={() => setNiveauClasse(n)}
                                >
                                    {n}ᵉ
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Contenu */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                    <div className="spinner" />
                </div>
            ) : erreur ? (
                <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                    <p style={{ color: 'var(--coral)', fontWeight: 700 }}>{erreur}</p>
                </div>
            ) : data.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                    <p style={{ fontSize: 40, marginBottom: 8 }}>🏜</p>
                    <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 15 }}>
                        Aucun résultat pour ces filtres.
                    </p>
                    <p style={{ color: 'var(--text-soft)', fontSize: 13, marginTop: 4 }}>
                        Joue quelques parties pour apparaître ici !
                    </p>
                </div>
            ) : (() => {
                const topValue = data[0]?.valeur ?? data[0]?.points ?? data[0]?.moyenne ?? 0;
                if (topValue === 0) return (
                    <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                        <p style={{ fontSize: 40, marginBottom: 8 }}>🏜</p>
                        <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 15 }}>
                            Aucun résultat pour ces filtres.
                        </p>
                        <p style={{ color: 'var(--text-soft)', fontSize: 13, marginTop: 4 }}>
                            Joue quelques parties pour apparaître ici !
                        </p>
                    </div>
                );
                return (
                <>
                    {/* Podium top 3 */}
                    {data.length >= 3 && (
                        <div style={{
                            display: 'flex', justifyContent: 'center',
                            alignItems: 'flex-end', gap: 10, marginBottom: 16,
                        }}>
                            <PodiumCard entry={data[1]} position={2} unit={unit} />
                            <PodiumCard entry={data[0]} position={1} unit={unit} />
                            <PodiumCard entry={data[2]} position={3} unit={unit} />
                        </div>
                    )}

                    {/* Liste complète */}
                    <div className="card">
                        {data.map((entry, i) => (
                            <LeaderboardRow
                                key={entry.id || entry.rang || i}
                                entry={entry}
                                index={i}
                                unit={unit}
                                isLast={i === data.length - 1}
                                onglet={onglet}
                            />
                        ))}
                    </div>

                    {/* Phrase de motivation — le classement se réinitialise */}
                    {(onglet === 'progression' || onglet === 'classes') && periode === 'semaine' && (
                        <p style={{
                            textAlign: 'center', fontSize: 12, fontWeight: 600,
                            color: 'var(--text-soft)', marginTop: 12, fontStyle: 'italic',
                        }}>
                            💡 Le classement repart à zéro chaque lundi — tout le monde a sa chance.
                        </p>
                    )}
                </>
                );
            })()}
        </div>
    );
}

/* ===================== PODIUM ===================== */

function PodiumCard({ entry, position, unit }) {
    const heights = { 1: 100, 2: 75, 3: 60 };
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const colors = { 1: 'var(--podium)', 2: 'var(--gris)', 3: 'var(--orange)' };

    const name = entry.nom_affiche || entry.classe || '—';
    const avatar = entry.avatar_emoji || entry.avatar || '';
    const value = entry.valeur ?? entry.points ?? entry.moyenne ?? 0;

    return (
        <div style={{ textAlign: 'center', width: 90 }}>
            {avatar && <span style={{ fontSize: 32 }}>{avatar}</span>}
            <p className="font-display" style={{
                fontWeight: 700, fontSize: 12, marginTop: 4,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
                {name}
            </p>
            <div style={{
                height: heights[position],
                background: colors[position],
                borderRadius: '12px 12px 0 0',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                marginTop: 6,
            }}>
                <span style={{ fontSize: 24 }}>{medals[position]}</span>
                <span className="font-display" style={{ fontWeight: 800, fontSize: 18, color: 'var(--action-texte)' }}>
                    {value}
                </span>
            </div>
        </div>
    );
}

/* ===================== ROW ===================== */

function LeaderboardRow({ entry, index, unit, isLast, onglet }) {
    const estMoi = entry.est_moi === true;
    const rang = entry.rang ?? (index + 1);
    const name = entry.nom_affiche || entry.classe || '—';
    const avatar = entry.avatar_emoji || entry.avatar || '';
    const value = entry.valeur ?? entry.points ?? entry.moyenne ?? 0;
    const classe = entry.classe || '';

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 8px',
            borderBottom: isLast ? 'none' : '1px solid var(--bordure)',
            background: estMoi
                ? 'var(--ciel-pale)'
                : index < 3 ? 'var(--ivoire)' : 'transparent',
            borderRadius: estMoi || index < 3 ? 8 : 0,
            border: estMoi ? '2px solid var(--action)' : 'none',
        }}>
            <span className="font-display" style={{
                fontWeight: 800, fontSize: 18, width: 28, textAlign: 'center',
                color: index === 0 ? 'var(--podium)' : index === 1 ? 'var(--gris)' : index === 2 ? 'var(--orange)' : 'var(--gris)',
            }}>
                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : rang}
            </span>
            {avatar && <span style={{ fontSize: 28 }}>{avatar}</span>}
            <div style={{ flex: 1 }}>
                <p className="font-display" style={{ fontWeight: 700, fontSize: 15 }}>
                    {estMoi ? `${name} (toi)` : name}
                </p>
                {/* Pour les classements d'élèves, on affiche la classe */}
                {onglet !== 'classes' && classe && (
                    <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{classe}</p>
                )}
                {/* Pour le classement des classes, afficher le nombre d'élèves actifs */}
                {onglet === 'classes' && entry.eleves_actifs != null && (
                    <p style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>
                        {entry.eleves_actifs} / {entry.eleves_total} élève{entry.eleves_total > 1 ? 's' : ''} {entry.eleves_actifs > 1 ? 'ont' : 'a'} joué
                    </p>
                )}
            </div>
            <span className="font-display" style={{
                fontWeight: 800, fontSize: 20,
                color: estMoi ? 'var(--gold)' : 'var(--navy)',
            }}>
                {value}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>{unit}</span>
        </div>
    );
}
