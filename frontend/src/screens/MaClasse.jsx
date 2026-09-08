import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    maitriseClasse,
    enteteClasse,
    listeClasses,
    listeEleves,
    definirPlafondClasse,
} from '../api';
import { IconMaGrille, IconSprint } from '../components/Icons';
import { trierTablesFragiles } from '../logic/classeStats';

/**
 * MaClasse — Pilotage enseignant (Maquette 24)
 *
 * RÈGLES PROJET (Lot 21) :
 * - L'en-tête appelle `enteteClasse(selectedClasse)` et affiche :
 *   « {ont_joue} ont joué · {inscrits} inscrits · plafond commun : table {plafond_commun} ».
 * - Les nombres viennent d'`enteteClasse()` et de `listeClasses()` (inscrits).
 * - Le mot « actif » est banni pour parler de quelqu'un qui joue.
 * - Tri des tables fragiles sur `(eleves_jaunes + eleves_rouges) / eleves_classe` décroissant.
 * - Les jauges affichent à la fois le taux de maîtrise et le taux de couverture en toutes lettres.
 * - La liste des élèves vient de `listeEleves(classe)` avec filtres : Sous le plafond · Inactifs · Tous.
 * - Bouton de relèvement du plafond : « Ouvrir la table X à toute la classe ».
 */

export default function MaClasse({ onBack, onLancerDefi }) {
    const [classes, setClasses] = useState([]);
    const [selectedClasse, setSelectedClasse] = useState(null);
    const [entete, setEntete] = useState(null);
    const [maitrise, setMaitrise] = useState([]);
    const [eleves, setEleves] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);

    // Filtre des élèves : 'sous_plafond' | 'inactifs' | 'tous'
    const [filtreEleves, setFiltreEleves] = useState('sous_plafond');
    // Voir plus de tables
    const [voirToutesTables, setVoirToutesTables] = useState(false);
    const [actionEnCours, setActionEnCours] = useState(false);

    // 1. Charger la liste des classes au montage
    useEffect(() => {
        (async () => {
            const res = await listeClasses();
            if (res.ok && res.data?.length) {
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

    // 2. Charger les données de la classe sélectionnée
    const rechargerClasse = useCallback(async () => {
        if (!selectedClasse) return;
        setLoading(true);
        setErreur(null);

        const [resEntete, resMaitrise, resEleves] = await Promise.all([
            enteteClasse(selectedClasse),
            maitriseClasse(selectedClasse),
            listeEleves(selectedClasse),
        ]);

        if (resEntete.ok) setEntete(resEntete.data);
        if (resMaitrise.ok) setMaitrise(resMaitrise.data || []);
        if (resEleves.ok) setEleves(resEleves.data || []);

        if (!resEntete.ok && !resMaitrise.ok) {
            setErreur(resMaitrise.error || resEntete.error || 'Erreur lors du chargement de la classe.');
        }

        setLoading(false);
    }, [selectedClasse]);

    useEffect(() => {
        rechargerClasse();
    }, [rechargerClasse]);

    // Tri des tables fragiles :
    // (eleves_jaunes + eleves_rouges) / eleves_classe décroissant (fonction partagée)
    const tablesTriees = useMemo(() => {
        return trierTablesFragiles(maitrise);
    }, [maitrise]);

    // Tables les plus fragiles pour le défi
    const tablesFragiles = useMemo(() => {
        return tablesTriees.filter(d => (d.eleves_jaunes + d.eleves_rouges) > 0);
    }, [tablesTriees]);

    const tablesDefi = useMemo(() => {
        return tablesFragiles
            .slice(0, 2)
            .map(d => d.table_n)
            .sort((a, b) => a - b);
    }, [tablesFragiles]);

    // Tables affichées dans la liste (6 premières ou toutes)
    const tablesAffichees = useMemo(() => {
        if (voirToutesTables) return tablesTriees;
        return tablesTriees.slice(0, 6);
    }, [tablesTriees, voirToutesTables]);

    // Filtrage des élèves
    const plafondCommun = entete?.plafond_commun ?? 10;

    const elevesFiltres = useMemo(() => {
        return eleves.filter(e => {
            if (filtreEleves === 'sous_plafond') {
                return (e.plafond_tables || 10) < plafondCommun || !e.actif;
            }
            if (filtreEleves === 'inactifs') {
                return !e.actif;
            }
            return true; // 'tous'
        });
    }, [eleves, filtreEleves, plafondCommun]);

    // Prochain plafond pour ouverture collective
    const prochainPlafond = useMemo(() => {
        if (plafondCommun < 10) return 10;
        if (plafondCommun < 12) return 12;
        if (plafondCommun < 15) return 15;
        if (plafondCommun < 20) return 20;
        return null;
    }, [plafondCommun]);

    const handleOuvrirProchainPlafond = async () => {
        if (!prochainPlafond || !selectedClasse) return;
        const ok = window.confirm(`Ouvrir la table ${prochainPlafond} à toute la classe ${selectedClasse} ?`);
        if (!ok) return;

        setActionEnCours(true);
        const res = await definirPlafondClasse(selectedClasse, prochainPlafond);
        if (res.ok) {
            await rechargerClasse();
        } else {
            alert(`Erreur : ${res.error || 'Impossible de relever le plafond.'}`);
        }
        setActionEnCours(false);
    };

    if (!classes.length && !loading) {
        return (
            <div className="screen-enter" style={{ textAlign: 'center', padding: 40 }}>
                <span style={{ fontSize: 48 }}>🏫</span>
                <h2 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--indigo)', marginTop: 12 }}>
                    Aucune classe trouvée
                </h2>
                <p style={{ color: 'var(--gris)', fontWeight: 600, fontSize: 14, marginTop: 8 }}>
                    Les classes apparaissent dès qu'un élève s'est connecté.
                </p>
                <button className="btn-back" style={{ marginTop: 16 }} onClick={onBack}>‹ Retour</button>
            </div>
        );
    }

    return (
        <div className="screen-enter" style={{ maxWidth: 834, margin: '0 auto', paddingBottom: 32 }}>
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            {/* En-tête : titre et sélecteur de classe */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
                <h1 className="font-display" style={{ margin: 0, fontSize: 32, fontWeight: 700, color: 'var(--indigo)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconMaGrille size={28} color="var(--indigo)" actionColor="var(--action)" /> Ma classe
                </h1>

                {/* Sélecteur de classes */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {classes.map(c => {
                        const estActive = selectedClasse === c.classe;
                        return (
                            <button
                                key={c.classe}
                                onClick={() => setSelectedClasse(c.classe)}
                                style={{
                                    padding: '10px 18px', borderRadius: 999,
                                    background: estActive ? 'var(--indigo)' : 'var(--surface)',
                                    color: estActive ? '#ffffff' : 'var(--gris)',
                                    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 15,
                                    border: estActive ? 'none' : '1px solid var(--bordure)',
                                    boxShadow: estActive ? 'none' : '0 2px 8px rgba(48,59,122,.08)',
                                    cursor: 'pointer', whiteSpace: 'nowrap',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                {c.classe}{c.est_favorite ? ' ★' : ''}
                            </button>
                        );
                    })}
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <div className="spinner" style={{ margin: '0 auto 12px' }} />
                    <span style={{ fontFamily: 'var(--texte)', color: 'var(--gris)', fontWeight: 600 }}>
                        Chargement des données de la classe…
                    </span>
                </div>
            ) : erreur ? (
                <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                    <p style={{ color: 'var(--rouge)', fontWeight: 700 }}>{erreur}</p>
                </div>
            ) : (
                <>
                    {/* En-tête de classe (Maquette 24) */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 16 }}>
                        <span className="font-display" style={{ fontWeight: 700, fontSize: 28, color: 'var(--indigo)' }}>
                            {selectedClasse}
                        </span>
                        <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 16, color: 'var(--gris)' }}>
                            {entete?.ont_joue ?? 0} ont joué · {entete?.inscrits ?? 0} inscrits · plafond commun : table {plafondCommun}
                        </span>
                    </div>

                    {/* Encadré des tables les plus fragiles (Maquette 24) */}
                    {tablesFragiles.length > 0 && tablesDefi.length > 0 && (
                        <div style={{
                            background: 'var(--action)', borderRadius: 24, padding: 22,
                            display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20,
                            boxShadow: 'var(--ombre-action)', color: '#ffffff',
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                                <div className="font-display" style={{ fontWeight: 700, fontSize: 22, color: '#ffffff' }}>
                                    Table{tablesDefi.length > 1 ? 's' : ''} {tablesDefi.join(' et ')} — {tablesDefi.length > 1 ? 'les plus fragiles' : 'la plus fragile'}
                                </div>
                                <div style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 15, color: 'var(--ciel-pale)' }}>
                                    {tablesFragiles[0] && (
                                        <span>
                                            {tablesFragiles[0].eleves_jaunes + tablesFragiles[0].eleves_rouges} élève{(tablesFragiles[0].eleves_jaunes + tablesFragiles[0].eleves_rouges) > 1 ? 's' : ''} en rouge ou en jaune sur la {tablesFragiles[0].table_n}
                                        </span>
                                    )}
                                    {tablesFragiles[1] && (
                                        <span>, {tablesFragiles[1].eleves_jaunes + tablesFragiles[1].eleves_rouges} sur la {tablesFragiles[1].table_n}</span>
                                    )}.
                                </div>
                            </div>

                            <button
                                onClick={() => onLancerDefi?.(tablesDefi, selectedClasse)}
                                style={{
                                    height: 64, padding: '0 20px', borderRadius: 18,
                                    background: 'var(--surface)', border: 'none', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    justifyContent: 'center', gap: 1, flex: 'none',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                }}
                            >
                                <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17, color: 'var(--action)', whiteSpace: 'nowrap' }}>
                                    Lancer un défi
                                </span>
                                <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 12, color: 'var(--gris)', whiteSpace: 'nowrap' }}>
                                    table{tablesDefi.length > 1 ? 's' : ''} {tablesDefi.join(' et ')} pré‑cochée{tablesDefi.length > 1 ? 's' : ''}
                                </span>
                            </button>
                        </div>
                    )}

                    {/* Section Maîtrise par table */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 13, color: 'var(--gris)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                Maîtrise par table
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--texte)', fontSize: 13, color: 'var(--gris)', fontWeight: 600 }}>
                                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--vert)' }} /> vert
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--texte)', fontSize: 13, color: 'var(--gris)', fontWeight: 600 }}>
                                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--orange)' }} /> jaune
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--texte)', fontSize: 13, color: 'var(--gris)', fontWeight: 600 }}>
                                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--rouge)' }} /> rouge
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--texte)', fontSize: 13, color: 'var(--gris)', fontWeight: 600 }}>
                                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--bordure)' }} /> sans trace
                            </div>
                        </div>

                        {/* Carte des jauges */}
                        <div style={{
                            background: 'var(--surface)', borderRadius: 24,
                            boxShadow: 'var(--ombre-carte)', padding: '20px 22px',
                            display: 'flex', flexDirection: 'column', gap: 14,
                            border: '1px solid var(--bordure)',
                        }}>
                            {tablesAffichees.map(d => {
                                const ec = d.eleves_classe || entete?.inscrits || 1;
                                const pVert = Math.min(100, (d.eleves_verts / ec) * 100);
                                const pJaune = Math.min(100, (d.eleves_jaunes / ec) * 100);
                                const pRouge = Math.min(100, (d.eleves_rouges / ec) * 100);
                                const pSansTrace = Math.max(0, 100 - (pVert + pJaune + pRouge));

                                const maitrisePct = Math.round(d.taux_maitrise ?? 0);
                                const couvertPct = Math.round(d.taux_couverture ?? 0);

                                return (
                                    <div key={d.table_n} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <div style={{ width: 44, fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 20, color: 'var(--indigo)' }}>
                                            × {d.table_n}
                                        </div>
                                        <div style={{
                                            flex: 1, height: 26, borderRadius: 8,
                                            overflow: 'hidden', display: 'flex', background: 'var(--bordure)',
                                        }}>
                                            {pVert > 0 && <div style={{ width: `${pVert}%`, background: 'var(--vert)' }} />}
                                            {pJaune > 0 && <div style={{ width: `${pJaune}%`, background: 'var(--orange)' }} />}
                                            {pRouge > 0 && <div style={{ width: `${pRouge}%`, background: 'var(--rouge)' }} />}
                                            {pSansTrace > 0 && <div style={{ width: `${pSansTrace}%`, background: 'var(--bordure)' }} />}
                                        </div>
                                        <div style={{ width: 50, textAlign: 'right', fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 17, color: maitrisePct < 50 ? 'var(--rouge)' : maitrisePct < 80 ? 'var(--orange)' : 'var(--vert)' }}>
                                            {maitrisePct}%
                                        </div>
                                        <div style={{ width: 110, textAlign: 'right', fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 13, color: 'var(--gris)' }}>
                                            couvert {couvertPct} %
                                        </div>
                                    </div>
                                );
                            })}

                            {tablesTriees.length > 6 && (
                                <button
                                    onClick={() => setVoirToutesTables(!voirToutesTables)}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 14,
                                        color: 'var(--action)', textAlign: 'left', padding: '6px 0 0',
                                    }}
                                >
                                    {voirToutesTables ? 'Replier les tables ‹' : `Voir les ${tablesTriees.length - 6} autres tables ›`}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Section Les Élèves (Maquette 24) */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                            <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 13, color: 'var(--gris)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                Les élèves
                            </span>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                {[
                                    { id: 'sous_plafond', label: 'Sous le plafond' },
                                    { id: 'inactifs', label: 'Désactivés' },
                                    { id: 'tous', label: 'Tous' },
                                ].map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setFiltreEleves(f.id)}
                                        style={{
                                            padding: '8px 16px', borderRadius: 999,
                                            background: filtreEleves === f.id ? 'var(--indigo)' : 'var(--surface)',
                                            color: filtreEleves === f.id ? '#ffffff' : 'var(--gris)',
                                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 13,
                                            border: filtreEleves === f.id ? 'none' : '1px solid var(--bordure)',
                                            boxShadow: filtreEleves === f.id ? 'none' : '0 2px 6px rgba(48,59,122,.06)',
                                            cursor: 'pointer', whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Liste des élèves */}
                        <div style={{
                            background: 'var(--surface)', borderRadius: 24,
                            boxShadow: 'var(--ombre-carte)', padding: '8px 20px',
                            display: 'flex', flexDirection: 'column',
                            border: '1px solid var(--bordure)',
                        }}>
                            {elevesFiltres.length === 0 ? (
                                <div style={{ padding: 24, textAlign: 'center', fontFamily: 'var(--texte)', color: 'var(--gris)', fontWeight: 600 }}>
                                    Aucun élève dans cette catégorie.
                                </div>
                            ) : (
                                elevesFiltres.map((e, idx) => {
                                    const estSousPlafond = (e.plafond_tables || 10) < plafondCommun;
                                    const estDernier = idx === elevesFiltres.length - 1;

                                    return (
                                        <div
                                            key={e.eleve_id}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 14,
                                                padding: '14px 0', borderBottom: estDernier ? 'none' : '1px solid var(--bordure)',
                                                opacity: e.actif ? 1 : 0.6,
                                            }}
                                        >
                                            <span style={{ fontSize: 26, opacity: e.actif ? 1 : 0.45 }}>
                                                {e.avatar_emoji || '👤'}
                                            </span>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16, color: e.actif ? 'var(--indigo)' : 'var(--gris)' }}>
                                                    {e.prenom} {e.nom}
                                                </span>
                                                <span style={{
                                                    fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 13,
                                                    color: !e.deja_connecte ? 'var(--rouge)' : 'var(--gris)',
                                                }}>
                                                    {!e.deja_connecte ? 'jamais connecté' : (e.derniere_connexion ? `vu ${formatDateRelative(e.derniere_connexion)}` : 'connecté')}
                                                </span>
                                            </div>

                                            <span style={{
                                                padding: '6px 12px', borderRadius: 8,
                                                background: estSousPlafond ? 'var(--rouge-pale)' : 'var(--vert-pale)',
                                                color: estSousPlafond ? 'var(--rouge)' : 'var(--vert)',
                                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 14,
                                                whiteSpace: 'nowrap',
                                            }}>
                                                table {e.plafond_tables || 10}
                                            </span>

                                            <span style={{ width: 80, textAlign: 'right', fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                                                {e.points_semaine ?? 0} pts
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Boutons d'action en bas (Maquette 24) */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                        {prochainPlafond && (
                            <button
                                type="button"
                                onClick={handleOuvrirProchainPlafond}
                                disabled={actionEnCours}
                                style={{
                                    flex: 1, height: 64, borderRadius: 18,
                                    background: 'var(--surface)', border: '1px solid var(--bordure)',
                                    boxShadow: 'var(--ombre-carte)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                                    color: 'var(--indigo)', cursor: 'pointer',
                                }}
                            >
                                {actionEnCours ? 'Mise à jour…' : `Ouvrir la table ${prochainPlafond} à toute la classe`}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onBack}
                            style={{
                                flex: 1, height: 64, borderRadius: 18,
                                background: 'var(--surface)', border: '1px solid var(--bordure)',
                                boxShadow: 'var(--ombre-carte)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                                color: 'var(--indigo)', cursor: 'pointer',
                            }}
                        >
                            ‹ Retour
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

function formatDateRelative(dateStr) {
    if (!dateStr) return 'jamais';
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now - d;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays === 0) {
        if (diffHours < 1) return "à l'instant";
        return `il y a ${diffHours} h`;
    }
    if (diffDays === 1) return 'hier';
    if (diffDays < 7) return `il y a ${diffDays} j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
