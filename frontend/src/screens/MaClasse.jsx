import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { maitriseClasse, listeClasses } from '../api';

/**
 * MaClasse — L'écran qui décide de l'adoption en salle des profs.
 *
 * Affiche, pour une classe choisie, une barre horizontale par table avec
 * QUATRE segments :
 *   vert   (var(--mint))   = élèves qui maîtrisent
 *   jaune  (var(--sun))    = en cours
 *   rouge  (var(--coral))  = en difficulté
 *   gris   (var(--border)) = n'ont pas encore travaillé cette table
 *
 * Le gris est le segment le plus important : c'est le travail qui n'a pas
 * eu lieu. Une table à 100 % de maîtrise et 30 % de couverture n'est PAS
 * acquise — ne la présente jamais en vert plein.
 *
 * PIÈGE — Deux dénominateurs différents :
 *   eleves_total  = ceux qui ont DÉJÀ travaillé la table
 *   eleves_classe = l'effectif de la classe (constant)
 * Ne jamais afficher « X sur eleves_total » en le présentant comme un
 * ratio de classe. « 18 sur 20 » dans une classe de 27 est faux.
 *
 * Tri : table la plus faible en premier, pas l'ordre numérique.
 * Un prof ouvre cet écran pour trouver le problème, pas pour lire un
 * tableau.
 *
 * Le bouton en bas « Lancer un défi sur les tables X et Y » est pré-
 * rempli avec les 2-3 tables les plus faibles.
 */

export default function MaClasse({ onBack, onLancerDefi }) {
    const [classes, setClasses] = useState([]);
    const [selectedClasse, setSelectedClasse] = useState(null);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);

    // Charger la liste des classes au montage
    useEffect(() => {
        (async () => {
            const res = await listeClasses();
            if (res.ok && res.data?.length) {
                // Favorites d'abord, puis par nom
                const sorted = [...res.data].sort((a, b) => {
                    if (a.est_favorite !== b.est_favorite) return b.est_favorite ? 1 : -1;
                    return a.classe.localeCompare(b.classe);
                });
                setClasses(sorted);
                setSelectedClasse(sorted[0].classe);
            } else {
                setLoading(false);
            }
        })();
    }, []);

    // Charger la maîtrise quand la classe change
    useEffect(() => {
        if (!selectedClasse) return;
        setLoading(true);
        setErreur(null);
        (async () => {
            const res = await maitriseClasse(selectedClasse);
            if (res.ok) {
                setData(res.data || []);
            } else {
                setErreur(res.error || 'Impossible de charger la maîtrise.');
            }
            setLoading(false);
        })();
    }, [selectedClasse]);

    // Effectif de la classe (constant sur toutes les lignes)
    const effectif = data.length > 0 ? (data[0].eleves_classe || 0) : 0;

    // Tables triées par faiblesse : la plus faible en premier
    // Score de faiblesse = (eleves_verts / eleves_classe) pondéré par la couverture
    // Une table non travaillée du tout = score 0 (la pire)
    const tablesSorted = useMemo(() => {
        if (!data.length) return [];
        return [...data].sort((a, b) => {
            // Score = verts / effectif (0 = pire, 1 = meilleur)
            const scoreA = effectif > 0 ? (a.eleves_verts / effectif) : 0;
            const scoreB = effectif > 0 ? (b.eleves_verts / effectif) : 0;
            return scoreA - scoreB;
        });
    }, [data, effectif]);

    // Tables jamais travaillées = tables de 2 à 20 absentes de `data`
    const tablesPresentes = useMemo(() => new Set(data.map(d => d.table_n)), [data]);
    const tablesAbsentes = useMemo(() => {
        const abs = [];
        for (let i = 2; i <= 20; i++) {
            if (!tablesPresentes.has(i)) abs.push(i);
        }
        return abs;
    }, [tablesPresentes]);

    // Tables les plus faibles pour le bouton défi (2 ou 3)
    const tablesDefi = useMemo(() => {
        // Tables absentes d'abord (personne ne les a travaillées)
        // puis les tables présentes triées par faiblesse
        const candidates = [
            ...tablesAbsentes.slice(0, 3),
            ...tablesSorted.map(d => d.table_n),
        ];
        // Dédupliquer et limiter à 3
        const seen = new Set();
        const result = [];
        for (const t of candidates) {
            if (!seen.has(t) && result.length < 3) {
                seen.add(t);
                result.push(t);
            }
        }
        return result.sort((a, b) => a - b);
    }, [tablesAbsentes, tablesSorted]);

    if (!classes.length && !loading) {
        return (
            <div className="screen-enter" style={{ textAlign: 'center', padding: 40 }}>
                <span style={{ fontSize: 48 }}>🏫</span>
                <h2 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', marginTop: 12 }}>
                    Aucune classe trouvée
                </h2>
                <p style={{ color: 'var(--text-soft)', fontWeight: 600, fontSize: 14, marginTop: 8 }}>
                    Les classes apparaissent dès qu'un élève s'est connecté.
                </p>
                <button className="btn-back" style={{ marginTop: 16 }} onClick={onBack}>‹ Retour</button>
            </div>
        );
    }

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)' }}>
                    🗺 Ma classe
                </h1>
            </div>

            {/* Sélecteur de classe */}
            <div style={{
                display: 'flex', gap: 8, flexWrap: 'wrap',
                justifyContent: 'center', marginBottom: 16,
            }}>
                {classes.map(c => (
                    <button
                        key={c.classe}
                        className={`chip ${selectedClasse === c.classe ? 'chip--active' : ''}`}
                        onClick={() => setSelectedClasse(c.classe)}
                        style={{
                            padding: '8px 16px', fontSize: 14, fontWeight: 700,
                            background: selectedClasse === c.classe
                                ? 'var(--navy)' : 'var(--bg-card)',
                            color: selectedClasse === c.classe ? '#fff' : 'var(--text)',
                            border: selectedClasse === c.classe
                                ? '2px solid var(--navy)' : '2px solid var(--border)',
                            borderRadius: 12, cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        {c.classe}
                        {c.est_favorite && ' ★'}
                        <span style={{
                            fontSize: 11, marginLeft: 4, opacity: 0.7,
                        }}>
                            ({c.eleves_actifs})
                        </span>
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <div className="spinner" />
                </div>
            ) : erreur ? (
                <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                    <p style={{ color: 'var(--coral)', fontWeight: 700 }}>{erreur}</p>
                </div>
            ) : (
                <>
                    {/* Résumé */}
                    <div className="card" style={{ padding: '12px 16px', marginBottom: 14 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>
                            {selectedClasse} — {effectif} élève{effectif !== 1 ? 's' : ''} actif{effectif !== 1 ? 's' : ''}
                        </p>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)', marginTop: 2 }}>
                            {data.length} table{data.length !== 1 ? 's' : ''} travaillée{data.length !== 1 ? 's' : ''} sur 19
                            {tablesAbsentes.length > 0 && ` · ${tablesAbsentes.length} jamais ouvertes`}
                        </p>
                    </div>

                    {/* Légende */}
                    <div style={{
                        display: 'flex', gap: 12, justifyContent: 'center',
                        marginBottom: 12, fontSize: 11, fontWeight: 700,
                        color: 'var(--text-soft)',
                    }}>
                        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--mint)', marginRight: 4, verticalAlign: 'middle' }} />Maîtrisé</span>
                        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--sun)', marginRight: 4, verticalAlign: 'middle' }} />En cours</span>
                        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--coral)', marginRight: 4, verticalAlign: 'middle' }} />Difficulté</span>
                        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--border)', marginRight: 4, verticalAlign: 'middle' }} />Pas travaillé</span>
                    </div>

                    {/* Tables jamais travaillées en premier (gris plein) */}
                    {tablesAbsentes.map(t => (
                        <TableBar
                            key={t}
                            tableN={t}
                            verts={0} jaunes={0} rouges={0}
                            total={0} effectif={effectif}
                            jamaisTravaillee
                        />
                    ))}

                    {/* Tables travaillées, triées par faiblesse */}
                    {tablesSorted.map(d => (
                        <TableBar
                            key={d.table_n}
                            tableN={d.table_n}
                            verts={d.eleves_verts}
                            jaunes={d.eleves_jaunes}
                            rouges={d.eleves_rouges}
                            total={d.eleves_total}
                            effectif={effectif}
                            tauxMaitrise={d.taux_maitrise}
                            tauxCouverture={d.taux_couverture}
                        />
                    ))}

                    {/* Le bouton qui fait tout */}
                    {tablesDefi.length > 0 && effectif > 0 && (
                        <button
                            className="btn btn--gold"
                            style={{
                                width: '100%', fontSize: 16, padding: '16px 24px',
                                marginTop: 20,
                            }}
                            onClick={() => onLancerDefi?.(tablesDefi, selectedClasse)}
                        >
                            ⚔️ Lancer un défi sur les tables {tablesDefi.join(', ')}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

/* ===================== BARRE D'UNE TABLE ===================== */

function TableBar({ tableN, verts, jaunes, rouges, total, effectif, tauxMaitrise, tauxCouverture, jamaisTravaillee }) {
    const nonTravaille = effectif - total;
    // Largeurs en pourcentage de l'effectif
    const pVerts = effectif > 0 ? (verts / effectif) * 100 : 0;
    const pJaunes = effectif > 0 ? (jaunes / effectif) * 100 : 0;
    const pRouges = effectif > 0 ? (rouges / effectif) * 100 : 0;
    const pGris = effectif > 0 ? (nonTravaille / effectif) * 100 : 100;

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 6, padding: '6px 0',
        }}>
            {/* Label */}
            <div style={{
                minWidth: 48, textAlign: 'right',
                fontWeight: 800, fontSize: 14,
                color: jamaisTravaillee ? 'var(--text-soft)' : 'var(--navy)',
                fontFamily: 'var(--font-display)',
            }}>
                × {tableN}
            </div>

            {/* Barre */}
            <div style={{
                flex: 1, height: 28, borderRadius: 8,
                display: 'flex', overflow: 'hidden',
                background: 'var(--border)',
            }}>
                {!jamaisTravaillee && (
                    <>
                        {pVerts > 0 && (
                            <div style={{
                                width: `${pVerts}%`, background: 'var(--mint)',
                                transition: 'width 0.3s',
                            }} />
                        )}
                        {pJaunes > 0 && (
                            <div style={{
                                width: `${pJaunes}%`, background: 'var(--sun)',
                                transition: 'width 0.3s',
                            }} />
                        )}
                        {pRouges > 0 && (
                            <div style={{
                                width: `${pRouges}%`, background: 'var(--coral)',
                                transition: 'width 0.3s',
                            }} />
                        )}
                        {/* Le gris = élèves n'ayant pas travaillé : le reste de la barre via background */}
                    </>
                )}
            </div>

            {/* Texte résumé */}
            <div style={{
                minWidth: 100, textAlign: 'right', fontSize: 12, fontWeight: 700,
                color: jamaisTravaillee ? 'var(--text-soft)' : 'var(--text)',
                lineHeight: 1.3,
            }}>
                {jamaisTravaillee ? (
                    <span style={{ fontStyle: 'italic', color: 'var(--text-soft)' }}>
                        Pas travaillée
                    </span>
                ) : (
                    <>
                        <div>{verts} / {effectif} maîtrisent</div>
                        {total < effectif && (
                            <div style={{ fontSize: 10, color: 'var(--text-soft)', fontWeight: 600 }}>
                                {total} l'ont travaillée
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
