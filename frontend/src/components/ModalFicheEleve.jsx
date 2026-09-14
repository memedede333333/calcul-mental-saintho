import React, { useState, useEffect } from 'react';
import { ModalFrame } from './Modals';
import { ficheEleve, ficheEleveRythme, ficheEleveFaits } from '../api';

/**
 * ModalFicheEleve — Fiche détaillée d'un élève (Lot A)
 *
 * RÈGLES DE CONCEPTION STRICTES :
 * 1. Séparation des rôles : le bloc `horaires` ne se dessine QUE si `data.portee === 'admin'`.
 * 2. Rapidité mentale vs Cadence de jeu :
 *    - `temps_moyen_reponse_ms` = calcul mental pur sur les faits (issu de maitrise).
 *    - `secondes_par_question` = cadence de partie (inclut lecture et frappe).
 *    Les deux portent des libellés et explications distincts.
 * 3. Toute moyenne DOIT afficher son dénominateur (ex : « 4,2 s sur 37 réponses »).
 *    Si vide ou non mesuré, la valeur vaut `—` (aucune mesure), JAMAIS 0.
 * 4. Respect absolu des 88 tokens du design system (Baloo 2 / Nunito, var(--indigo), etc.).
 */

const BADGES_INFO = {
    speed_2s: { emoji: '⚡', titre: 'Éclair', desc: 'Moins de 2 s par question en moyenne' },
    speed_3s: { emoji: '⏱️', titre: 'Rapide', desc: 'Moins de 3 s par question en moyenne' },
    climb_10: { emoji: '🏔️', titre: 'Sommet 10', desc: 'A maîtrisé la table de 10' },
    climb_12: { emoji: '🏔️', titre: 'Sommet 12', desc: 'A maîtrisé la table de 12' },
    climb_15: { emoji: '🏔️', titre: 'Sommet 15', desc: 'A maîtrisé la table de 15' },
    climb_20: { emoji: '🏔️', titre: 'Sommet 20', desc: 'A maîtrisé la table de 20' },
    streak_10: { emoji: '🔥', titre: 'Série 10', desc: '10 bonnes réponses consécutives' },
    streak_20: { emoji: '🔥', titre: 'Série 20', desc: '20 bonnes réponses consécutives' },
    streak_50: { emoji: '💥', titre: 'Série 50', desc: '50 bonnes réponses consécutives' },
    days_3: { emoji: '📅', titre: 'Régulier', desc: 'A joué 3 jours consécutifs' },
    days_7: { emoji: '🌟', titre: 'Assidu', desc: 'A joué 7 jours consécutifs' },
};

// Constantes indicatives pour la cadence de partie (secondes par question, lecture et frappe comprises)
const SEUIL_CADENCE_RAPIDE_S = 3;
const SEUIL_CADENCE_MOYENNE_S = 5;

function formatTempsMs(ms) {
    if (ms == null) return '—';
    const s = (ms / 1000).toFixed(1).replace('.', ',');
    return `${s} s`;
}

function formatDuree(sec) {
    if (!sec || sec <= 0) return '0 s';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s} s`;
    if (m < 60) return `${m} min ${s > 0 ? `${s} s` : ''}`.trim();
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm > 0 ? `${rm} min` : ''}`.trim();
}

function formatDateFr(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return dateStr;
    }
}

export function ModalFicheEleve({ eleveId, onClose, initialJours = 30 }) {
    const [jours, setJours] = useState(initialJours);
    const [tab, setTab] = useState('rapidite'); // 'rapidite', 'faits', 'defis', 'horaires'
    const [loading, setLoading] = useState(true);
    const [ficheData, setFicheData] = useState(null);
    const [rythmeData, setRythmeData] = useState([]);
    const [faitsData, setFaitsData] = useState([]);
    const [erreur, setErreur] = useState(null);
    const [filtreFait, setFiltreFait] = useState('tous'); // 'tous', 'fragiles', 'lents', 'maitrises'
    const [rechercheFait, setRechercheFait] = useState('');

    useEffect(() => {
        let isMounted = true;
        async function charger() {
            setLoading(true);
            setErreur(null);
            try {
                const [resFiche, resRythme, resFaits] = await Promise.all([
                    ficheEleve(eleveId, jours),
                    ficheEleveRythme(eleveId, jours),
                    ficheEleveFaits(eleveId),
                ]);

                if (!isMounted) return;

                if (!resFiche.ok) throw new Error(resFiche.error || 'Erreur chargement fiche');
                setFicheData(resFiche.data);

                if (resRythme.ok && Array.isArray(resRythme.data)) {
                    setRythmeData(resRythme.data);
                }
                if (resFaits.ok && Array.isArray(resFaits.data)) {
                    setFaitsData(resFaits.data);
                }
            } catch (err) {
                if (isMounted) setErreur(err.message || 'Impossible de charger la fiche élève.');
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        if (eleveId) {
            charger();
        }
        return () => { isMounted = false; };
    }, [eleveId, jours]);

    const identite = ficheData?.identite;
    const rapidite = ficheData?.rapidite;
    const volume = ficheData?.volume;
    const maitrise = ficheData?.maitrise;
    const defis = ficheData?.defis;
    const badges = ficheData?.badges || [];
    const horaires = ficheData?.horaires;
    const estAdmin = ficheData?.portee === 'admin';
    const seuilRapideMs = rapidite?.seuil_rapide_ms ?? 3000;

    // Faits filtrés
    const faitsFiltres = faitsData.filter((f) => {
        if (rechercheFait.trim()) {
            const clean = rechercheFait.trim().toLowerCase();
            if (!f.fait.toLowerCase().includes(clean)) return false;
        }
        if (filtreFait === 'fragiles') return f.niveau === 1;
        if (filtreFait === 'lents') return (f.temps_moyen_ms ?? 0) >= seuilRapideMs;
        if (filtreFait === 'maitrises') return f.niveau === 3;
        return true;
    });

    return (
        <ModalFrame onClose={onClose} maxWidth={840}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '90vh',
                background: 'var(--surface)',
                color: 'var(--indigo-encre)',
                fontFamily: 'var(--texte)',
            }}>
                {/* ── EN-TÊTE FIXE DE LA MODALE ── */}
                <div style={{
                    padding: '24px 28px 16px',
                    borderBottom: '1px solid var(--bordure)',
                    background: 'var(--ivoire)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{
                                width: 56,
                                height: 56,
                                borderRadius: 'var(--r-touche)',
                                background: 'var(--surface)',
                                border: '1px solid var(--bordure)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 32,
                                boxShadow: 'var(--ombre-douce)',
                            }}>
                                {identite?.avatar_emoji || '👤'}
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <h2 style={{
                                        margin: 0,
                                        fontFamily: 'var(--titre)',
                                        fontWeight: 800,
                                        fontSize: 24,
                                        color: 'var(--indigo)',
                                    }}>
                                        {identite ? `${identite.prenom} ${identite.nom}` : 'Fiche élève'}
                                    </h2>
                                    {identite?.actif === false && (
                                        <span style={{
                                            background: 'var(--rouge-pale)',
                                            color: 'var(--erreur-donnee)',
                                            fontSize: 'var(--t-minuscule)',
                                            fontWeight: 700,
                                            padding: '2px 8px',
                                            borderRadius: 'var(--r-pastille)',
                                        }}>
                                            Désactivé
                                        </span>
                                    )}
                                </div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontSize: 'var(--t-petit)',
                                    color: 'var(--gris)',
                                    fontWeight: 600,
                                    marginTop: 2,
                                }}>
                                    <span>Classe {identite?.classe || '—'}</span>
                                    <span>·</span>
                                    <span>Plafond : table {identite?.plafond_tables || '—'}</span>
                                    {identite?.palier && (
                                        <>
                                            <span>·</span>
                                            <span style={{ color: 'var(--indigo-doux)' }}>Palier {identite.palier}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                background: 'var(--surface)',
                                border: '1px solid var(--bordure)',
                                borderRadius: 'var(--r-pastille)',
                                width: 36,
                                height: 36,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 18,
                                color: 'var(--gris)',
                                boxShadow: 'var(--ombre-douce)',
                            }}
                            title="Fermer"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Ligne Sélecteur de Période & Onglets */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 12,
                    }}>
                        {/* Onglets internes */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => setTab('rapidite')}
                                style={{
                                    border: 'none',
                                    padding: '7px 14px',
                                    borderRadius: 'var(--r-bouton)',
                                    fontFamily: 'var(--texte)',
                                    fontWeight: 700,
                                    fontSize: 'var(--t-minuscule)',
                                    cursor: 'pointer',
                                    background: tab === 'rapidite' ? 'var(--indigo)' : 'var(--surface)',
                                    color: tab === 'rapidite' ? '#ffffff' : 'var(--gris)',
                                    borderWidth: 1,
                                    borderStyle: 'solid',
                                    borderColor: tab === 'rapidite' ? 'var(--indigo)' : 'var(--bordure)',
                                    transition: 'background var(--d-juste)',
                                }}
                            >
                                ⚡ Rapidité & Rythme
                            </button>
                            <button
                                type="button"
                                onClick={() => setTab('faits')}
                                style={{
                                    border: 'none',
                                    padding: '7px 14px',
                                    borderRadius: 'var(--r-bouton)',
                                    fontFamily: 'var(--texte)',
                                    fontWeight: 700,
                                    fontSize: 'var(--t-minuscule)',
                                    cursor: 'pointer',
                                    background: tab === 'faits' ? 'var(--indigo)' : 'var(--surface)',
                                    color: tab === 'faits' ? '#ffffff' : 'var(--gris)',
                                    borderWidth: 1,
                                    borderStyle: 'solid',
                                    borderColor: tab === 'faits' ? 'var(--indigo)' : 'var(--bordure)',
                                    transition: 'background var(--d-juste)',
                                }}
                            >
                                🎯 Multiplications ({faitsData.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setTab('defis')}
                                style={{
                                    border: 'none',
                                    padding: '7px 14px',
                                    borderRadius: 'var(--r-bouton)',
                                    fontFamily: 'var(--texte)',
                                    fontWeight: 700,
                                    fontSize: 'var(--t-minuscule)',
                                    cursor: 'pointer',
                                    background: tab === 'defis' ? 'var(--indigo)' : 'var(--surface)',
                                    color: tab === 'defis' ? '#ffffff' : 'var(--gris)',
                                    borderWidth: 1,
                                    borderStyle: 'solid',
                                    borderColor: tab === 'defis' ? 'var(--indigo)' : 'var(--bordure)',
                                    transition: 'background var(--d-juste)',
                                }}
                            >
                                🏆 Défis & Badges
                            </button>

                            {/* ONGLET RÉSERVÉ STRICTEMENT AUX ADMINS */}
                            {estAdmin && (
                                <button
                                    type="button"
                                    onClick={() => setTab('horaires')}
                                    style={{
                                        border: 'none',
                                        padding: '7px 14px',
                                        borderRadius: 'var(--r-bouton)',
                                        fontFamily: 'var(--texte)',
                                        fontWeight: 700,
                                        fontSize: 'var(--t-minuscule)',
                                        cursor: 'pointer',
                                        background: tab === 'horaires' ? 'var(--indigo)' : 'var(--surface)',
                                        color: tab === 'horaires' ? '#ffffff' : 'var(--gris)',
                                        borderWidth: 1,
                                        borderStyle: 'solid',
                                        borderColor: tab === 'horaires' ? 'var(--indigo)' : 'var(--bordure)',
                                        transition: 'background var(--d-juste)',
                                    }}
                                >
                                    🌙 Nuit & Connexions
                                </button>
                            )}
                        </div>

                        {/* Sélecteur de période glissante */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 'var(--t-minuscule)', color: 'var(--gris)', fontWeight: 600, marginRight: 4 }}>
                                Période :
                            </span>
                            {[7, 14, 30, 90].map((j) => (
                                <button
                                    key={j}
                                    type="button"
                                    onClick={() => setJours(j)}
                                    style={{
                                        border: '1px solid',
                                        borderColor: jours === j ? 'var(--action)' : 'var(--bordure)',
                                        background: jours === j ? 'var(--ciel-pale)' : 'var(--surface)',
                                        color: jours === j ? 'var(--indigo)' : 'var(--gris)',
                                        fontWeight: jours === j ? 800 : 600,
                                        fontSize: 'var(--t-minuscule)',
                                        borderRadius: 'var(--r-pastille)',
                                        padding: '3px 9px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {j}j
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── CORPS SCROLLABLE DE LA MODALE ── */}
                <div style={{
                    padding: '24px 28px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 24,
                }}>
                    {loading ? (
                        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--gris)', fontWeight: 600 }}>
                            Chargement des données de l'élève…
                        </div>
                    ) : erreur ? (
                        <div style={{
                            padding: 20,
                            borderRadius: 'var(--r-case)',
                            background: 'var(--rouge-pale)',
                            color: 'var(--erreur-donnee)',
                            fontWeight: 700,
                            textAlign: 'center',
                        }}>
                            {erreur}
                        </div>
                    ) : (
                        <>
                            {/* ── ONGLET 1 : RAPIDITÉ & RYTHME ── */}
                            {tab === 'rapidite' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                    {/* 2 Grandes Cartes : Rapidité Mentale vs Cadence de Jeu */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                                        gap: 16,
                                    }}>
                                        {/* Carte 1 : Temps de réponse pur (Calcul mental) */}
                                        <div style={{
                                            background: 'var(--ivoire)',
                                            border: '1px solid var(--bordure)',
                                            borderRadius: 'var(--r-carte)',
                                            padding: 20,
                                            boxShadow: 'var(--ombre-douce)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 10,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 800, fontSize: 'var(--t-libelle)', color: 'var(--indigo)' }}>
                                                    ⚡ Rapidité de calcul mental
                                                </span>
                                                <span style={{
                                                    fontSize: 'var(--t-minuscule)',
                                                    fontWeight: 700,
                                                    background: 'var(--ciel-pale)',
                                                    color: 'var(--indigo)',
                                                    padding: '2px 8px',
                                                    borderRadius: 'var(--r-pastille)',
                                                }}>
                                                    Temps pur
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                                                <span style={{
                                                    fontFamily: 'var(--titre)',
                                                    fontWeight: 800,
                                                    fontSize: 38,
                                                    color: 'var(--indigo)',
                                                }}>
                                                    {formatTempsMs(rapidite?.temps_moyen_reponse_ms)}
                                                </span>
                                                <span style={{ fontSize: 'var(--t-corps)', fontWeight: 700, color: 'var(--gris)' }}>
                                                    {rapidite?.nb_reponses_mesurees > 0
                                                        ? `sur ${rapidite.nb_reponses_mesurees} réponses`
                                                        : '(aucune mesure)'}
                                                </span>
                                            </div>

                                            <div style={{
                                                fontSize: 'var(--t-petit)',
                                                fontWeight: 600,
                                                color: 'var(--indigo-doux)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                            }}>
                                                <span>🎯 Faits rapides (&lt; {formatTempsMs(seuilRapideMs)}) :</span>
                                                <strong style={{ color: 'var(--succes)' }}>
                                                    {rapidite?.faits_sous_le_seuil ?? 0}
                                                </strong>
                                                <span>/ {rapidite?.faits_mesures ?? 0} mesurés</span>
                                            </div>

                                            <div style={{
                                                fontSize: 'var(--t-minuscule)',
                                                color: 'var(--gris)',
                                                lineHeight: 1.4,
                                                borderTop: '1px dashed var(--bordure)',
                                                paddingTop: 8,
                                                marginTop: 4,
                                            }}>
                                                ℹ️ <em>Temps de calcul pur</em> : mesuré entre l'affichage de la question et la première frappe sur le fait.
                                            </div>
                                        </div>

                                        {/* Carte 2 : Cadence globale de partie (avec énoncé et saisie) */}
                                        <div style={{
                                            background: 'var(--ivoire)',
                                            border: '1px solid var(--bordure)',
                                            borderRadius: 'var(--r-carte)',
                                            padding: 20,
                                            boxShadow: 'var(--ombre-douce)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 10,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 800, fontSize: 'var(--t-libelle)', color: 'var(--indigo)' }}>
                                                    ⏱️ Cadence globale de partie
                                                </span>
                                                <span style={{
                                                    fontSize: 'var(--t-minuscule)',
                                                    fontWeight: 700,
                                                    background: 'var(--vert-pale)',
                                                    color: 'var(--vert)',
                                                    padding: '2px 8px',
                                                    borderRadius: 'var(--r-pastille)',
                                                }}>
                                                    Historique
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                                                <span style={{
                                                    fontFamily: 'var(--titre)',
                                                    fontWeight: 800,
                                                    fontSize: 38,
                                                    color: 'var(--indigo)',
                                                }}>
                                                    {volume?.temps_partie_s && volume?.nb_parties
                                                        ? (() => {
                                                            const totalQ = rythmeData.reduce((acc, r) => acc + (r.nb_questions || 0), 0);
                                                            if (totalQ > 0) {
                                                                return `${(volume.temps_partie_s / totalQ).toFixed(1).replace('.', ',')} s`;
                                                            }
                                                            return '—';
                                                        })()
                                                        : '—'}
                                                </span>
                                                <span style={{ fontSize: 'var(--t-corps)', fontWeight: 700, color: 'var(--gris)' }}>
                                                    par question
                                                </span>
                                            </div>

                                            <div style={{
                                                fontSize: 'var(--t-petit)',
                                                fontWeight: 600,
                                                color: 'var(--indigo-doux)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                            }}>
                                                <span>⏳ Durée moyenne d'une partie :</span>
                                                <strong>{formatDuree(volume?.duree_moyenne_partie_s)}</strong>
                                            </div>

                                            <div style={{
                                                fontSize: 'var(--t-minuscule)',
                                                color: 'var(--gris)',
                                                lineHeight: 1.4,
                                                borderTop: '1px dashed var(--bordure)',
                                                paddingTop: 8,
                                                marginTop: 4,
                                            }}>
                                                ℹ️ <em>Secondes par question</em> : durée totale divisée par le nombre de questions, incluant lecture et frappe.
                                            </div>
                                        </div>
                                    </div>

                                    {/* 4 KPIs de Volume de Jeu */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                                        gap: 12,
                                    }}>
                                        <div style={{
                                            background: 'var(--surface)',
                                            border: '1px solid var(--bordure)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 14,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 'var(--t-minuscule)', color: 'var(--gris)', fontWeight: 700 }}>
                                                Parties terminées
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 26,
                                                fontWeight: 800,
                                                color: 'var(--indigo)',
                                                marginTop: 4,
                                            }}>
                                                {volume?.nb_parties ?? 0}
                                            </div>
                                            {volume?.par_mode && (
                                                <div style={{ fontSize: 11, color: 'var(--gris)', marginTop: 2 }}>
                                                    {volume.par_mode.training || 0} ent. · {volume.par_mode.challenge || 0} défis
                                                </div>
                                            )}
                                        </div>

                                        <div style={{
                                            background: 'var(--surface)',
                                            border: '1px solid var(--bordure)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 14,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 'var(--t-minuscule)', color: 'var(--gris)', fontWeight: 700 }}>
                                                Temps passé en partie
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 26,
                                                fontWeight: 800,
                                                color: 'var(--indigo)',
                                                marginTop: 4,
                                            }}>
                                                {formatDuree(volume?.temps_partie_s)}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--gris)', marginTop: 2 }}>
                                                sur {jours} jours
                                            </div>
                                        </div>

                                        <div style={{
                                            background: 'var(--surface)',
                                            border: '1px solid var(--bordure)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 14,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 'var(--t-minuscule)', color: 'var(--gris)', fontWeight: 700 }}>
                                                Jours actifs
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 26,
                                                fontWeight: 800,
                                                color: 'var(--indigo)',
                                                marginTop: 4,
                                            }}>
                                                {volume?.jours_actifs ?? 0} j
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--gris)', marginTop: 2 }}>
                                                sur {jours} jours
                                            </div>
                                        </div>

                                        <div style={{
                                            background: 'var(--surface)',
                                            border: '1px solid var(--bordure)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 14,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 'var(--t-minuscule)', color: 'var(--gris)', fontWeight: 700 }}>
                                                Fréquence moyenne
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 26,
                                                fontWeight: 800,
                                                color: 'var(--indigo)',
                                                marginTop: 4,
                                            }}>
                                                {volume?.parties_par_jour_actif != null ? `${volume.parties_par_jour_actif}` : '—'}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--gris)', marginTop: 2 }}>
                                                parties / jour actif
                                            </div>
                                        </div>
                                    </div>

                                    {/* Courbe / Historique jour par jour (`fiche_eleve_rythme`) */}
                                    <div style={{
                                        background: 'var(--surface)',
                                        border: '1px solid var(--bordure)',
                                        borderRadius: 'var(--r-carte)',
                                        padding: 20,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 14,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <h3 style={{
                                                margin: 0,
                                                fontFamily: 'var(--titre)',
                                                fontWeight: 800,
                                                fontSize: 'var(--t-sous)',
                                                color: 'var(--indigo)',
                                            }}>
                                                📈 Rythme & Progression jour par jour
                                            </h3>
                                            <span style={{ fontSize: 'var(--t-minuscule)', color: 'var(--gris)', fontWeight: 600 }}>
                                                {rythmeData.length} jour{rythmeData.length > 1 ? 's' : ''} joué{rythmeData.length > 1 ? 's' : ''}
                                            </span>
                                        </div>

                                        {rythmeData.length === 0 ? (
                                            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--gris)', fontSize: 'var(--t-petit)' }}>
                                                Aucune session de jeu sur les {jours} derniers jours.
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '120px 80px 110px 1fr',
                                                    padding: '6px 12px',
                                                    background: 'var(--ivoire)',
                                                    borderRadius: 'var(--r-case)',
                                                    fontSize: 11,
                                                    fontWeight: 800,
                                                    color: 'var(--gris)',
                                                    textTransform: 'uppercase',
                                                }}>
                                                    <span>Jour</span>
                                                    <span>Parties</span>
                                                    <span>Questions</span>
                                                    <span>Cadence moyenne</span>
                                                </div>

                                                {rythmeData.map((pt) => {
                                                    const dateAffichee = new Date(pt.jour).toLocaleDateString('fr-FR', {
                                                        weekday: 'short',
                                                        day: 'numeric',
                                                        month: 'short',
                                                    });
                                                    return (
                                                        <div
                                                            key={pt.jour}
                                                            style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: '120px 80px 110px 1fr',
                                                                padding: '10px 12px',
                                                                borderBottom: '1px solid var(--bordure)',
                                                                alignItems: 'center',
                                                                fontSize: 'var(--t-petit)',
                                                            }}
                                                        >
                                                            <span style={{ fontWeight: 700, color: 'var(--indigo)' }}>
                                                                {dateAffichee}
                                                            </span>
                                                            <span style={{ fontWeight: 600 }}>
                                                                {pt.nb_parties} p.
                                                            </span>
                                                            <span style={{ color: 'var(--gris)', fontWeight: 600 }}>
                                                                {pt.nb_questions} q. ({formatDuree(pt.temps_partie_s)})
                                                            </span>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <span style={{
                                                                    fontWeight: 800,
                                                                    color: pt.secondes_par_question && pt.secondes_par_question < SEUIL_CADENCE_RAPIDE_S
                                                                        ? 'var(--succes)'
                                                                        : pt.secondes_par_question && pt.secondes_par_question < SEUIL_CADENCE_MOYENNE_S
                                                                            ? 'var(--attention)'
                                                                            : 'var(--indigo-encre)',
                                                                }}>
                                                                    {pt.secondes_par_question != null
                                                                        ? `${String(pt.secondes_par_question).replace('.', ',')} s / question`
                                                                        : '—'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── ONGLET 2 : MULTIPLICATIONS & MAÎTRISE ── */}
                            {tab === 'faits' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                                    {/* Synthèse des 4 couleurs de la grille */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                                        gap: 12,
                                    }}>
                                        <div style={{
                                            background: 'var(--vert-pale)',
                                            border: '1px solid var(--vert)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 12,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 'var(--t-minuscule)', color: 'var(--vert)', fontWeight: 800 }}>
                                                🟢 Maîtrisées (Niveau 3)
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 24,
                                                fontWeight: 800,
                                                color: 'var(--vert)',
                                                marginTop: 4,
                                            }}>
                                                {maitrise?.vertes ?? 0}
                                            </div>
                                        </div>

                                        <div style={{
                                            background: 'var(--orange-pale)',
                                            border: '1px solid var(--orange)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 12,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 'var(--t-minuscule)', color: 'var(--orange)', fontWeight: 800 }}>
                                                🟠 En cours (Niveau 2)
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 24,
                                                fontWeight: 800,
                                                color: 'var(--orange)',
                                                marginTop: 4,
                                            }}>
                                                {maitrise?.oranges ?? 0}
                                            </div>
                                        </div>

                                        <div style={{
                                            background: 'var(--rouge-pale)',
                                            border: '1px solid var(--rouge)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 12,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 'var(--t-minuscule)', color: 'var(--erreur-donnee)', fontWeight: 800 }}>
                                                🔴 À revoir (Niveau 1)
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 24,
                                                fontWeight: 800,
                                                color: 'var(--erreur-donnee)',
                                                marginTop: 4,
                                            }}>
                                                {maitrise?.rouges ?? 0}
                                            </div>
                                        </div>

                                        <div style={{
                                            background: 'var(--ivoire)',
                                            border: '1px solid var(--bordure)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 12,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 'var(--t-minuscule)', color: 'var(--gris)', fontWeight: 800 }}>
                                                ⚪ Jamais vues
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 24,
                                                fontWeight: 800,
                                                color: 'var(--gris)',
                                                marginTop: 4,
                                            }}>
                                                {maitrise?.jamais_vues ?? 0}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Barre de filtres & recherche de fait */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: 10,
                                    }}>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {[
                                                { id: 'tous', label: `Toutes (${faitsData.length})` },
                                                { id: 'fragiles', label: `🔴 À revoir (${maitrise?.rouges ?? 0})` },
                                                { id: 'lents', label: `⏱️ Plus lentes (> ${formatTempsMs(seuilRapideMs)})` },
                                                { id: 'maitrises', label: `🟢 Maîtrisées (${maitrise?.vertes ?? 0})` },
                                            ].map((f) => (
                                                <button
                                                    key={f.id}
                                                    type="button"
                                                    onClick={() => setFiltreFait(f.id)}
                                                    style={{
                                                        padding: '5px 12px',
                                                        borderRadius: 'var(--r-bouton)',
                                                        border: '1px solid',
                                                        borderColor: filtreFait === f.id ? 'var(--indigo)' : 'var(--bordure)',
                                                        background: filtreFait === f.id ? 'var(--indigo)' : 'var(--surface)',
                                                        color: filtreFait === f.id ? '#ffffff' : 'var(--gris)',
                                                        fontWeight: 700,
                                                        fontSize: 'var(--t-minuscule)',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {f.label}
                                                </button>
                                            ))}
                                        </div>

                                        <input
                                            type="text"
                                            value={rechercheFait}
                                            onChange={(e) => setRechercheFait(e.target.value)}
                                            placeholder="Chercher (ex: 7x8)…"
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: 'var(--r-bouton)',
                                                border: '1px solid var(--bordure)',
                                                fontSize: 'var(--t-petit)',
                                                fontFamily: 'var(--texte)',
                                                outline: 'none',
                                                width: 160,
                                            }}
                                        />
                                    </div>

                                    {/* Tableau des multiplications */}
                                    <div style={{
                                        border: '1px solid var(--bordure)',
                                        borderRadius: 'var(--r-carte)',
                                        overflow: 'hidden',
                                        background: 'var(--surface)',
                                    }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{
                                                    background: 'var(--ivoire)',
                                                    borderBottom: '1px solid var(--bordure)',
                                                    color: 'var(--gris)',
                                                    fontSize: 11,
                                                    fontWeight: 800,
                                                    textTransform: 'uppercase',
                                                }}>
                                                    <th style={{ padding: '10px 14px' }}>Multiplication</th>
                                                    <th style={{ padding: '10px 14px' }}>État</th>
                                                    <th style={{ padding: '10px 14px' }}>Réussite</th>
                                                    <th style={{ padding: '10px 14px' }}>Temps moyen</th>
                                                    <th style={{ padding: '10px 14px' }}>Dernière vue</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {faitsFiltres.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} style={{ padding: 30, textAlign: 'center', color: 'var(--gris)' }}>
                                                            Aucun fait ne correspond aux filtres sélectionnés.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    faitsFiltres.map((f) => {
                                                        const pct = f.taux_reussite != null ? Math.round(f.taux_reussite * 100) : null;
                                                        return (
                                                            <tr key={f.fait} style={{ borderBottom: '1px solid var(--bordure)' }}>
                                                                <td style={{
                                                                    padding: '10px 14px',
                                                                    fontFamily: 'var(--titre)',
                                                                    fontWeight: 800,
                                                                    fontSize: 18,
                                                                    color: 'var(--indigo)',
                                                                }}>
                                                                    {f.fait}
                                                                </td>
                                                                <td style={{ padding: '10px 14px' }}>
                                                                    <span style={{
                                                                        fontSize: 12,
                                                                        fontWeight: 700,
                                                                        padding: '2px 8px',
                                                                        borderRadius: 'var(--r-pastille)',
                                                                        background: f.niveau === 3 ? 'var(--vert-pale)' : f.niveau === 2 ? 'var(--orange-pale)' : 'var(--rouge-pale)',
                                                                        color: f.niveau === 3 ? 'var(--vert)' : f.niveau === 2 ? 'var(--orange)' : 'var(--erreur-donnee)',
                                                                    }}>
                                                                        {f.niveau === 3 ? '🟢 Maîtrisé' : f.niveau === 2 ? '🟠 En cours' : '🔴 Fragile'}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '10px 14px', fontSize: 'var(--t-petit)', fontWeight: 600 }}>
                                                                    {pct != null ? `${pct} %` : '—'}
                                                                    <span style={{ fontSize: 11, color: 'var(--gris)', marginLeft: 6 }}>
                                                                        ({f.nb_reussites}/{f.nb_vues})
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '10px 14px', fontSize: 'var(--t-petit)' }}>
                                                                    <strong style={{
                                                                        color: f.temps_moyen_ms && f.temps_moyen_ms < seuilRapideMs
                                                                            ? 'var(--succes)'
                                                                            : f.temps_moyen_ms && f.temps_moyen_ms < seuilRapideMs * 1.5
                                                                                ? 'var(--attention)'
                                                                                : 'var(--indigo-encre)',
                                                                    }}>
                                                                        {formatTempsMs(f.temps_moyen_ms)}
                                                                    </strong>
                                                                    <span style={{ fontSize: 11, color: 'var(--gris)', marginLeft: 6 }}>
                                                                        {f.nb_temps > 0 ? `sur ${f.nb_temps} rép.` : '(aucune mesure)'}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '10px 14px', fontSize: 'var(--t-minuscule)', color: 'var(--gris)' }}>
                                                                    {formatDateFr(f.derniere_vue)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* ── ONGLET 3 : DÉFIS & BADGES ── */}
                            {tab === 'defis' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                                    {/* 4 KPIs Défis */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                                        gap: 12,
                                    }}>
                                        <div style={{
                                            background: 'var(--surface)',
                                            border: '1px solid var(--bordure)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 14,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 'var(--t-minuscule)', color: 'var(--gris)', fontWeight: 700 }}>
                                                Défis créés
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 26,
                                                fontWeight: 800,
                                                color: 'var(--indigo)',
                                                marginTop: 4,
                                            }}>
                                                {defis?.crees ?? 0}
                                            </div>
                                        </div>

                                        <div style={{
                                            background: 'var(--surface)',
                                            border: '1px solid var(--bordure)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 14,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 'var(--t-minuscule)', color: 'var(--gris)', fontWeight: 700 }}>
                                                Défis rejoints
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 26,
                                                fontWeight: 800,
                                                color: 'var(--indigo)',
                                                marginTop: 4,
                                            }}>
                                                {defis?.rejoints ?? 0}
                                            </div>
                                        </div>

                                        <div style={{
                                            background: 'var(--surface)',
                                            border: '1px solid var(--bordure)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 14,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 'var(--t-minuscule)', color: 'var(--gris)', fontWeight: 700 }}>
                                                Défis terminés
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 26,
                                                fontWeight: 800,
                                                color: 'var(--indigo)',
                                                marginTop: 4,
                                            }}>
                                                {defis?.termines ?? 0}
                                            </div>
                                        </div>

                                        <div style={{
                                            background: 'var(--surface)',
                                            border: '1px solid var(--bordure)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 14,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 'var(--t-minuscule)', color: 'var(--gris)', fontWeight: 700 }}>
                                                Meilleur score
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 26,
                                                fontWeight: 800,
                                                color: 'var(--podium)',
                                                marginTop: 4,
                                            }}>
                                                {defis?.meilleur_score != null ? `${defis.meilleur_score} pts` : '—'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Badges débloqués */}
                                    <div style={{
                                        background: 'var(--ivoire)',
                                        border: '1px solid var(--bordure)',
                                        borderRadius: 'var(--r-carte)',
                                        padding: 20,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 14,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <h3 style={{
                                                margin: 0,
                                                fontFamily: 'var(--titre)',
                                                fontWeight: 800,
                                                fontSize: 'var(--t-sous)',
                                                color: 'var(--indigo)',
                                            }}>
                                                🏅 Badges obtenus ({badges.length})
                                            </h3>
                                        </div>

                                        {badges.length === 0 ? (
                                            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--gris)' }}>
                                                Aucun badge débloqué pour le moment.
                                            </div>
                                        ) : (
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                                gap: 12,
                                            }}>
                                                {badges.map((bId) => {
                                                    const info = BADGES_INFO[bId] || { emoji: '🎖️', titre: bId, desc: 'Badge mérité' };
                                                    return (
                                                        <div
                                                            key={bId}
                                                            style={{
                                                                background: 'var(--surface)',
                                                                border: '1px solid var(--bordure)',
                                                                borderRadius: 'var(--r-case)',
                                                                padding: 12,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 12,
                                                                boxShadow: 'var(--ombre-douce)',
                                                            }}
                                                        >
                                                            <span style={{ fontSize: 28 }}>{info.emoji}</span>
                                                            <div>
                                                                <div style={{ fontWeight: 800, fontSize: 'var(--t-petit)', color: 'var(--indigo)' }}>
                                                                    {info.titre}
                                                                </div>
                                                                <div style={{ fontSize: 11, color: 'var(--gris)', lineHeight: 1.2 }}>
                                                                    {info.desc}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── ONGLET 4 : NUIT & CONNEXIONS (STRICTEMENT RÉSERVÉ ADMIN) ── */}
                            {tab === 'horaires' && estAdmin && horaires && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                    <div style={{
                                        background: 'var(--ciel-pale)',
                                        border: '1px solid var(--action)',
                                        borderRadius: 'var(--r-case)',
                                        padding: '10px 14px',
                                        fontSize: 'var(--t-petit)',
                                        fontWeight: 700,
                                        color: 'var(--indigo)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                    }}>
                                        <span>🔒 Données d'horaires et de connexion strictement réservées à l'administration.</span>
                                    </div>

                                    {/* 2 indicateurs clés : Dernière connexion & Parties en couvre-feu */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                                        <div style={{
                                            background: 'var(--surface)',
                                            border: '1px solid var(--bordure)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 16,
                                            boxShadow: 'var(--ombre-douce)',
                                        }}>
                                            <div style={{ fontSize: 'var(--t-minuscule)', color: 'var(--gris)', fontWeight: 700 }}>
                                                Dernière connexion enregistrée
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 22,
                                                fontWeight: 800,
                                                color: 'var(--indigo)',
                                                marginTop: 6,
                                            }}>
                                                {formatDateFr(horaires.derniere_connexion)}
                                            </div>
                                        </div>

                                        <div style={{
                                            background: (horaires.parties_couvre_feu ?? 0) > 0 ? 'var(--rouge-pale)' : 'var(--vert-pale)',
                                            border: '1px solid',
                                            borderColor: (horaires.parties_couvre_feu ?? 0) > 0 ? 'var(--rouge)' : 'var(--vert)',
                                            borderRadius: 'var(--r-case)',
                                            padding: 16,
                                            boxShadow: 'var(--ombre-douce)',
                                        }}>
                                            <div style={{
                                                fontSize: 'var(--t-minuscule)',
                                                color: (horaires.parties_couvre_feu ?? 0) > 0 ? 'var(--erreur-donnee)' : 'var(--vert)',
                                                fontWeight: 700,
                                            }}>
                                                Parties pendant le couvre-feu
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--titre)',
                                                fontSize: 22,
                                                fontWeight: 800,
                                                color: (horaires.parties_couvre_feu ?? 0) > 0 ? 'var(--erreur-donnee)' : 'var(--vert)',
                                                marginTop: 6,
                                            }}>
                                                {(horaires.parties_couvre_feu ?? 0) > 0 ? `🌙 ${horaires.parties_couvre_feu} partie(s)` : '0 (Aucune infraction)'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Histogramme de distribution des heures de jeu */}
                                    <div style={{
                                        background: 'var(--surface)',
                                        border: '1px solid var(--bordure)',
                                        borderRadius: 'var(--r-carte)',
                                        padding: 20,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 14,
                                    }}>
                                        <h4 style={{ margin: 0, fontFamily: 'var(--titre)', fontWeight: 800, color: 'var(--indigo)' }}>
                                            📊 Distribution des parties sur 24 heures (Europe/Paris)
                                        </h4>
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(24, 1fr)',
                                            gap: 4,
                                            alignItems: 'flex-end',
                                            height: 120,
                                            padding: '10px 0',
                                            borderBottom: '1px solid var(--bordure)',
                                        }}>
                                            {Array.from({ length: 24 }).map((_, h) => {
                                                const match = (horaires.par_heure || []).find((ph) => ph.heure === h);
                                                const nb = match ? match.nb_parties : 0;
                                                const maxP = Math.max(1, ...(horaires.par_heure || []).map((x) => x.nb_parties || 0));
                                                const hPct = nb > 0 ? Math.max(12, Math.round((nb / maxP) * 100)) : 0;
                                                const isNight = h >= 22 || h < 7;
                                                return (
                                                    <div
                                                        key={h}
                                                        title={`${h}h: ${nb} partie(s)`}
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            height: '100%',
                                                            justifyContent: 'flex-end',
                                                        }}
                                                    >
                                                        {nb > 0 && (
                                                            <div style={{
                                                                width: '100%',
                                                                height: `${hPct}%`,
                                                                borderRadius: 3,
                                                                background: isNight ? 'var(--rouge)' : 'var(--action)',
                                                            }} />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(24, 1fr)',
                                            gap: 4,
                                            fontSize: 9,
                                            color: 'var(--gris)',
                                            textAlign: 'center',
                                        }}>
                                            {Array.from({ length: 24 }).map((_, h) => (
                                                <span key={h}>{h % 3 === 0 ? `${h}h` : ''}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </ModalFrame>
    );
}

export default ModalFicheEleve;
