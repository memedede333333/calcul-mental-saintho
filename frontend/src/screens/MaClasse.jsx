import React, { useState, useEffect, useMemo } from 'react';
import { maitriseClasse, listeClasses } from '../api';

/**
 * MaClasse — L'écran qui décide de l'adoption en salle des profs.
 *
 * Le serveur renvoie UNE LIGNE PAR TABLE existant pour cette classe,
 * travaillée ou non. L'écran ne fabrique plus la liste, ne la complète
 * plus, ne la borne plus. Une table absente du retour n'existe pas
 * pour cette classe.
 *
 * Colonnes serveur (migration 20) :
 *   travaillee             — au moins un élève l'a rencontrée
 *   dans_le_plafond_commun — TOUS les élèves de la classe y ont droit
 *   eleves_verts/jaunes/rouges/total — ceux qui ont travaillé
 *   eleves_sans_trace      — effectif - total (calculé par le serveur)
 *   eleves_classe          — effectif actif de la classe
 *   taux_maitrise          — % verts parmi ceux qui ont travaillé
 *   taux_couverture        — % de la classe qui l'a travaillée
 *
 * Deux blocs :
 *   1. Tables travaillées, triées par taux_maitrise croissant
 *   2. Tables pas encore abordées (travaillee = false)
 *
 * Bouton défi : candidates = travaillee=true ET dans_le_plafond_commun=true,
 * triées par taux_maitrise croissant, les 2-3 premières.
 * Jamais de table non travaillée en candidate.
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

    // Bloc 1 : tables travaillées, triées par eleves_verts/eleves_classe
    // croissant, départagé par taux_couverture décroissant.
    // taux_maitrise (verts/total) est trompeur : une table vue par 1 élève
    // sur 27 peut afficher 100 % si cet élève l'a réussie.
    const tablesTravaillees = useMemo(() => {
        return data
            .filter(d => d.travaillee)
            .sort((a, b) => {
                const ec = a.eleves_classe || 1; // même valeur partout
                const ratioA = a.eleves_verts / ec;
                const ratioB = b.eleves_verts / ec;
                if (ratioA !== ratioB) return ratioA - ratioB;
                // À ratio égal, la plus couverte en premier :
                // c'est un rattrapage, pas une découverte.
                return (b.taux_couverture ?? 0) - (a.taux_couverture ?? 0);
            });
    }, [data]);

    // Bloc 2 : tables pas encore abordées
    const tablesNonAbordees = useMemo(() => {
        return data.filter(d => !d.travaillee);
    }, [data]);

    // Tables qui coincent : au moins un élève en jaune ou en rouge sur une table travaillée.
    const tablesQuiCoincent = useMemo(() => {
        return tablesTravaillees
            .filter(d => (d.eleves_jaunes + d.eleves_rouges) > 0);
    }, [tablesTravaillees]);

    // Candidates pour le bouton défi de rattrapage :
    // Triées par la part de la CLASSE en difficulté décroissante ((jaunes + rouges) / eleves_classe).
    // On retient les 2 ou 3 premières, ordonnées pour l'affichage (a - b).
    const tablesDefi = useMemo(() => {
        return [...tablesQuiCoincent]
            .sort((a, b) => {
                const ecA = a.eleves_classe || 1;
                const ecB = b.eleves_classe || 1;
                const diffA = (a.eleves_jaunes + a.eleves_rouges) / ecA;
                const diffB = (b.eleves_jaunes + b.eleves_rouges) / ecB;
                if (diffA !== diffB) return diffB - diffA;
                return a.table_n - b.table_n;
            })
            .slice(0, 3)
            .map(d => d.table_n)
            .sort((a, b) => a - b);
    }, [tablesQuiCoincent]);

    // Rien ne coince : au moins une table travaillée, et aucun élève en jaune ou en rouge.
    const rienNeCoince = useMemo(() => {
        return tablesTravaillees.length > 0 && tablesQuiCoincent.length === 0;
    }, [tablesTravaillees, tablesQuiCoincent]);

    // Tables non abordées pour le bouton découverte (pas de filtre par plafond)
    const tablesDecouverte = useMemo(() => {
        return tablesNonAbordees
            .slice(0, 3)
            .map(d => d.table_n)
            .sort((a, b) => a - b);
    }, [tablesNonAbordees]);

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
                        onClick={() => setSelectedClasse(c.classe)}
                        style={{
                            padding: '8px 16px', fontSize: 14, fontWeight: 700,
                            background: selectedClasse === c.classe
                                ? 'var(--indigo)' : 'var(--surface)',
                            color: selectedClasse === c.classe ? 'var(--action-texte)' : 'var(--indigo-encre)',
                            border: selectedClasse === c.classe
                                ? '2px solid var(--indigo)' : '2px solid var(--bordure)',
                            borderRadius: 12, cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        {c.classe}
                        {c.est_favorite && ' ★'}
                        <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.7 }}>
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
                            {tablesTravaillees.length} table{tablesTravaillees.length !== 1 ? 's' : ''} travaillée{tablesTravaillees.length !== 1 ? 's' : ''}
                            {tablesNonAbordees.length > 0 && ` · ${tablesNonAbordees.length} pas encore abordée${tablesNonAbordees.length !== 1 ? 's' : ''}`}
                        </p>
                    </div>

                    {/* Légende */}
                    <div style={{
                        display: 'flex', gap: 12, justifyContent: 'center',
                        marginBottom: 12, fontSize: 11, fontWeight: 700,
                        color: 'var(--text-soft)',
                    }}>
                        <Legend color="var(--mint)" label="Maîtrisé" />
                        <Legend color="var(--sun)" label="En cours" />
                        <Legend color="var(--coral)" label="Difficulté" />
                        <Legend color="var(--border)" label="Pas travaillé" />
                    </div>

                    {/* Bloc 1 : Tables travaillées, triées par faiblesse */}
                    {tablesTravaillees.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            {tablesTravaillees.map(d => (
                                <TableBar
                                    key={d.table_n}
                                    tableN={d.table_n}
                                    verts={d.eleves_verts}
                                    jaunes={d.eleves_jaunes}
                                    rouges={d.eleves_rouges}
                                    sansTrace={d.eleves_sans_trace}
                                    effectif={d.eleves_classe}
                                    tauxMaitrise={d.taux_maitrise}
                                    dansPlafond={d.dans_le_plafond_commun}
                                />
                            ))}
                        </div>
                    )}

                    {/* Bloc 2 : Tables pas encore abordées */}
                    {tablesNonAbordees.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <h3 style={{
                                fontSize: 13, fontWeight: 800, color: 'var(--text-soft)',
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                marginBottom: 8,
                            }}>
                                Pas encore abordées
                            </h3>
                            {tablesNonAbordees.map(d => (
                                <TableBar
                                    key={d.table_n}
                                    tableN={d.table_n}
                                    verts={0} jaunes={0} rouges={0}
                                    sansTrace={d.eleves_sans_trace}
                                    effectif={d.eleves_classe}
                                    jamaisTravaillee
                                    dansPlafond={d.dans_le_plafond_commun}
                                />
                            ))}
                        </div>
                    )}

                    {/* Bouton défi de rattrapage ou message si rien ne coince */}
                    {tablesDefi.length > 0 ? (
                        <button
                            className="btn btn--gold"
                            style={{
                                width: '100%', fontSize: 16, padding: '16px 24px',
                                marginTop: 8,
                            }}
                            onClick={() => onLancerDefi?.(tablesDefi, selectedClasse)}
                        >
                            ⚔️ Lancer un défi sur {tablesDefi.length === 1 ? 'la table' : 'les tables'} {tablesDefi.join(', ')}
                        </button>
                    ) : rienNeCoince ? (
                        <div className="card" style={{
                            padding: '14px 18px', marginTop: 8,
                            background: 'rgba(0, 201, 167, 0.08)',
                            border: '2px solid var(--mint)',
                            borderRadius: 14, textAlign: 'center',
                        }}>
                            <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>
                                ✅ Rien ne coince dans cette classe.
                            </p>
                            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)', lineHeight: 1.4 }}>
                                Aucun élève n'est en difficulté sur les tables travaillées. Le bouton « Découvrir » ci-dessous ouvre les tables suivantes.
                            </p>
                        </div>
                    ) : (
                        <button
                            className="btn btn--ghost"
                            disabled
                            style={{
                                width: '100%', fontSize: 14, padding: '14px 24px',
                                marginTop: 8, opacity: 0.5, cursor: 'default',
                            }}
                        >
                            Pas encore assez de données pour un défi ciblé
                        </button>
                    )}

                    {/* Bouton découverte — tables non abordées */}
                    {tablesDecouverte.length > 0 && (
                        <button
                            className="btn btn--ghost"
                            style={{
                                width: '100%', fontSize: 14, padding: '14px 24px',
                                marginTop: 8,
                            }}
                            onClick={() => onLancerDefi?.(tablesDecouverte, selectedClasse)}
                        >
                            🔍 Découvrir les tables {tablesDecouverte.join(', ')}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

/* ===================== LÉGENDE ===================== */

function Legend({ color, label }) {
    return (
        <span>
            <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: 3,
                background: color, marginRight: 4, verticalAlign: 'middle',
            }} />
            {label}
        </span>
    );
}

/* ===================== BARRE D'UNE TABLE ===================== */

function TableBar({ tableN, verts, jaunes, rouges, sansTrace, effectif, tauxMaitrise, jamaisTravaillee, dansPlafond }) {
    // Largeurs en pourcentage de l'effectif
    const pVerts = effectif > 0 ? (verts / effectif) * 100 : 0;
    const pJaunes = effectif > 0 ? (jaunes / effectif) * 100 : 0;
    const pRouges = effectif > 0 ? (rouges / effectif) * 100 : 0;
    // Le gris = le reste de la barre via background

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 6, padding: '6px 0',
            opacity: dansPlafond ? 1 : 0.55,
        }}>
            {/* Label */}
            <div style={{
                minWidth: 48, textAlign: 'right',
                fontWeight: 800, fontSize: 14,
                color: jamaisTravaillee ? 'var(--text-soft)' : 'var(--navy)',
                fontFamily: 'var(--font-display)',
            }}>
                × {tableN}
                {!dansPlafond && <span style={{ fontSize: 10 }}> 🔒</span>}
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
                        {/* Le gris restant = élèves sans trace — via background de la barre */}
                    </>
                )}
            </div>

            {/* Texte résumé */}
            <div style={{
                minWidth: 110, textAlign: 'right', fontSize: 12, fontWeight: 700,
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
                        {sansTrace > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--text-soft)', fontWeight: 600 }}>
                                {sansTrace} sans trace
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
