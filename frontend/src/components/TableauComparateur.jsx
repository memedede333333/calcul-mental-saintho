import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { comparerEleves, comparerElevesEntete } from '../api';

/**
 * Formate un nombre de secondes en texte lisible (ex: "18 min", "1 h 12")
 */
function formaterTemps(secondes) {
    if (!secondes || secondes <= 0) return '—';
    const s = Math.round(secondes);
    if (s < 60) return `${s} s`;
    const min = Math.floor(s / 60);
    const resteSec = s % 60;
    if (min < 60) {
        return resteSec > 0 ? `${min} min ${resteSec} s` : `${min} min`;
    }
    const h = Math.floor(min / 60);
    const resteMin = min % 60;
    return resteMin > 0 ? `${h} h ${resteMin} min` : `${h} h`;
}

/**
 * TableauComparateur — Comparateur d'élèves (Lot B - Migration 47)
 *
 * RÈGLES PROJET :
 * 1. `null` s'affiche « — » et se trie en DERNIER dans les deux sens (asc et desc). Jamais 0.
 * 2. Toute moyenne porte son dénominateur dans la cellule : « 1,9 s · 3 rép. ».
 * 3. Les en-têtes affichent la portée d'après `portee_periode` :
 *    « Vitesse (depuis le début) » vs « Parties (30 j) ».
 * 4. Écrire « 34 vertes sur 55 » plutôt qu'un pourcentage seul (faits_plage).
 * 5. `seuil_rapide_ms` vient de l'en-tête retourné par le serveur.
 */
export default function TableauComparateur({ classe = null, classes = [], onOuvrirFiche }) {
    // Portée des tables
    const [modePlage, setModePlage] = useState('1_10'); // '1_10' | '1_12' | 'table'
    const [tableChoisie, setTableChoisie] = useState(7);
    // Période d'observation
    const [periodeJours, setPeriodeJours] = useState(30); // 7 | 14 | 30 | 90
    // Classe active si choix multiple
    const [classeSelectionnee, setClasseSelectionnee] = useState(classe || 'Toutes');

    // Données serveur
    const [lignes, setLignes] = useState([]);
    const [entete, setEntete] = useState(null);
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);

    // Tri local
    const [colonneTri, setColonneTri] = useState('vitesse');
    const [sensTri, setSensTri] = useState('asc'); // 'asc' | 'desc'

    // Mise à jour de la classe si la prop change
    useEffect(() => {
        if (classe) {
            setClasseSelectionnee(classe);
        }
    }, [classe]);

    // Charger les données quand les paramètres changent
    const chargerDonnees = useCallback(async () => {
        setLoading(true);
        setErreur(null);

        let tableMin = 1;
        let tableMax = 10;
        let table = null;

        if (modePlage === '1_12') {
            tableMax = 12;
        } else if (modePlage === 'table') {
            tableMin = 1;
            tableMax = 10;
            table = Number(tableChoisie);
        }

        const classeParam = (classeSelectionnee === 'Toutes' || !classeSelectionnee) ? null : classeSelectionnee;

        try {
            const [resEntete, resLignes] = await Promise.all([
                comparerElevesEntete({
                    classe: classeParam,
                    tableMin,
                    tableMax,
                    table,
                    jours: periodeJours,
                }),
                comparerEleves({
                    classe: classeParam,
                    tableMin,
                    tableMax,
                    table,
                    jours: periodeJours,
                }),
            ]);

            if (resEntete.ok) {
                setEntete(resEntete.data);
            }
            if (resLignes.ok) {
                setLignes(resLignes.data || []);
            } else {
                setErreur(resLignes.error || 'Erreur lors du chargement des données.');
            }
        } catch (err) {
            setErreur(err?.message || 'Erreur réseau.');
        } finally {
            setLoading(false);
        }
    }, [modePlage, tableChoisie, periodeJours, classeSelectionnee]);

    useEffect(() => {
        chargerDonnees();
    }, [chargerDonnees]);

    // Gestion du clic sur un en-tête pour trier
    const handleSort = (colonne) => {
        if (colonneTri === colonne) {
            setSensTri(s => s === 'asc' ? 'desc' : 'asc');
        } else {
            setColonneTri(colonne);
            // Par défaut, nom asc, vitesse asc (plus rapide d'abord), maîtrise desc (meilleur d'abord), progrès asc (accélération d'abord)
            if (['maitrise', 'parties', 'jours', 'temps_partie'].includes(colonne)) {
                setSensTri('desc');
            } else {
                setSensTri('asc');
            }
        }
    };

    // Tri des lignes respectant la RÈGLE 1 : null se range TOUJOURS en dernier dans les deux sens
    const lignesTriees = useMemo(() => {
        return [...lignes].sort((a, b) => {
            let valA = null;
            let valB = null;

            switch (colonneTri) {
                case 'eleve':
                    valA = `${a.nom || ''} ${a.prenom || ''}`.trim().toLowerCase();
                    valB = `${b.nom || ''} ${b.prenom || ''}`.trim().toLowerCase();
                    break;
                case 'classe':
                    valA = a.classe;
                    valB = b.classe;
                    break;
                case 'vitesse':
                    valA = a.temps_moyen_ms;
                    valB = b.temps_moyen_ms;
                    break;
                case 'maitrise':
                    valA = a.taux_vert != null ? Number(a.taux_vert) : null;
                    valB = b.taux_vert != null ? Number(b.taux_vert) : null;
                    break;
                case 'a_revoir':
                    valA = a.faits_a_revoir;
                    valB = b.faits_a_revoir;
                    break;
                case 'table_fragile':
                    valA = a.table_plus_fragile;
                    valB = b.table_plus_fragile;
                    break;
                case 'parties':
                    valA = a.nb_parties;
                    valB = b.nb_parties;
                    break;
                case 'jours':
                    valA = a.jours_actifs;
                    valB = b.jours_actifs;
                    break;
                case 'temps_partie':
                    valA = a.temps_partie_s;
                    valB = b.temps_partie_s;
                    break;
                case 'progres':
                    valA = a.progres_s_question != null ? Number(a.progres_s_question) : null;
                    valB = b.progres_s_question != null ? Number(b.progres_s_question) : null;
                    break;
                default:
                    valA = a.nom;
                    valB = b.nom;
            }

            const isNullA = valA === null || valA === undefined;
            const isNullB = valB === null || valB === undefined;

            // Règle 1 : null toujours à la fin, peu importe sensTri
            if (isNullA && isNullB) return 0;
            if (isNullA) return 1;
            if (isNullB) return -1;

            let cmp = 0;
            if (typeof valA === 'string') {
                cmp = valA.localeCompare(valB);
            } else {
                cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
            }

            return sensTri === 'asc' ? cmp : -cmp;
        });
    }, [lignes, colonneTri, sensTri]);

    // Données d'en-tête
    const faitsPlage = entete?.faits_plage || 55;
    const seuilRapideMs = entete?.seuil_rapide_ms || 3000;
    const seuilRapideS = (seuilRapideMs / 1000).toFixed(1).replace('.', ',');

    const labelPlage = useMemo(() => {
        if (modePlage === '1_10') return 'Tables 1 à 10 (55 multiplications distinctes)';
        if (modePlage === '1_12') return 'Tables 1 à 12 (78 multiplications distinctes)';
        if (modePlage === 'table') return `Table de ${tableChoisie} (10 multiplications croisées avec 1 à 10)`;
        return '';
    }, [modePlage, tableChoisie]);

    const iconeTri = (col) => {
        if (colonneTri !== col) return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>;
        return <span style={{ color: 'var(--action)', marginLeft: 4, fontWeight: 900 }}>{sensTri === 'asc' ? '▲' : '▼'}</span>;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Barre de contrôles et filtres */}
            <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--bordure)',
                borderRadius: 20,
                padding: '16px 20px',
                boxShadow: '0 2px 8px rgba(48,59,122,.04)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
            }}>
                {/* 1. Sélecteur de portée de tables */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 14, color: 'var(--indigo)' }}>
                        Portée :
                    </span>
                    <div style={{ display: 'flex', gap: 6, background: 'var(--ivoire)', padding: 4, borderRadius: 12, border: '1px solid var(--bordure)' }}>
                        <button
                            type="button"
                            onClick={() => setModePlage('1_10')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: 8,
                                border: 'none',
                                background: modePlage === '1_10' ? 'var(--indigo)' : 'transparent',
                                color: modePlage === '1_10' ? '#ffffff' : 'var(--gris)',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: 'pointer',
                                fontFamily: 'var(--texte)',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            Tables 1 à 10
                        </button>
                        <button
                            type="button"
                            onClick={() => setModePlage('1_12')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: 8,
                                border: 'none',
                                background: modePlage === '1_12' ? 'var(--indigo)' : 'transparent',
                                color: modePlage === '1_12' ? '#ffffff' : 'var(--gris)',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: 'pointer',
                                fontFamily: 'var(--texte)',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            Tables 1 à 12
                        </button>
                        <button
                            type="button"
                            onClick={() => setModePlage('table')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: 8,
                                border: 'none',
                                background: modePlage === 'table' ? 'var(--indigo)' : 'transparent',
                                color: modePlage === 'table' ? '#ffffff' : 'var(--gris)',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: 'pointer',
                                fontFamily: 'var(--texte)',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            Une table précise
                        </button>
                    </div>

                    {modePlage === 'table' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, color: 'var(--gris)', fontWeight: 600 }}>Table de :</span>
                            <select
                                value={tableChoisie}
                                onChange={e => setTableChoisie(Number(e.target.value))}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: 8,
                                    border: '1px solid var(--bordure)',
                                    background: 'var(--surface)',
                                    fontFamily: 'var(--texte)',
                                    fontWeight: 700,
                                    fontSize: 14,
                                    color: 'var(--indigo)',
                                    cursor: 'pointer',
                                }}
                            >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(n => (
                                    <option key={n} value={n}>Table {n}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* 2. Filtre classe (si non restreint à une classe fixe) et Période */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    {classes?.length > 0 && !classe && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, color: 'var(--gris)', fontWeight: 600 }}>Classe :</span>
                            <select
                                value={classeSelectionnee}
                                onChange={e => setClasseSelectionnee(e.target.value)}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: 8,
                                    border: '1px solid var(--bordure)',
                                    background: 'var(--surface)',
                                    fontFamily: 'var(--texte)',
                                    fontWeight: 700,
                                    fontSize: 14,
                                    color: 'var(--indigo)',
                                    cursor: 'pointer',
                                }}
                            >
                                <option value="Toutes">Toutes les classes</option>
                                {classes.map(c => (
                                    <option key={c.classe} value={c.classe}>{c.classe}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Sélecteur de période */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, color: 'var(--gris)', fontWeight: 600 }}>Période :</span>
                        <div style={{ display: 'flex', gap: 4, background: 'var(--ivoire)', padding: 3, borderRadius: 10, border: '1px solid var(--bordure)' }}>
                            {[7, 14, 30, 90].map(j => (
                                <button
                                    key={j}
                                    type="button"
                                    onClick={() => setPeriodeJours(j)}
                                    style={{
                                        padding: '5px 10px',
                                        borderRadius: 7,
                                        border: 'none',
                                        background: periodeJours === j ? 'var(--action)' : 'transparent',
                                        color: periodeJours === j ? '#ffffff' : 'var(--gris)',
                                        fontWeight: 700,
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        fontFamily: 'var(--texte)',
                                    }}
                                >
                                    {j} j
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bandeau d'information et contexte */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--ciel-pale)',
                border: '1px solid var(--bordure)',
                borderRadius: 14,
                padding: '10px 18px',
                fontSize: 13,
                color: 'var(--indigo-doux)',
                fontWeight: 600,
                flexWrap: 'wrap',
                gap: 10,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15 }}>🎯</span>
                    <span><strong>Dénominateur commun :</strong> {labelPlage}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {entete && (
                        <span>
                            <strong>{entete.ont_joue}</strong> ont joué sur <strong>{entete.inscrits}</strong> élèves ({periodeJours} derniers jours)
                        </span>
                    )}
                    <span>
                        ⚡ Seuil calcul rapide : <strong>≤ {seuilRapideS} s</strong>
                    </span>
                </div>
            </div>

            {/* Message d'erreur éventuel */}
            {erreur && (
                <div style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'var(--rouge-pale)',
                    color: 'var(--erreur-donnee)',
                    fontWeight: 700,
                    fontSize: 14,
                }}>
                    ❌ {erreur}
                </div>
            )}

            {/* Tableau principal */}
            <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--bordure)',
                borderRadius: 20,
                overflow: 'hidden',
                boxShadow: '0 2px 10px rgba(48,59,122,.05)',
            }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        textAlign: 'left',
                        fontFamily: 'var(--texte)',
                    }}>
                        <thead>
                            <tr style={{
                                background: 'var(--ivoire)',
                                borderBottom: '2px solid var(--bordure)',
                                fontSize: 12,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                color: 'var(--indigo)',
                                userSelect: 'none',
                                whiteSpace: 'nowrap',
                            }}>
                                <th
                                    onClick={() => handleSort('eleve')}
                                    style={{ padding: '14px 16px', cursor: 'pointer', fontWeight: 800 }}
                                >
                                    Élève {iconeTri('eleve')}
                                </th>

                                {(!classe || classeSelectionnee === 'Toutes') && (
                                    <th
                                        onClick={() => handleSort('classe')}
                                        style={{ padding: '14px 12px', cursor: 'pointer', fontWeight: 800 }}
                                    >
                                        Classe {iconeTri('classe')}
                                    </th>
                                )}

                                {/* Colonnes CUMUL (depuis le début) */}
                                <th
                                    onClick={() => handleSort('vitesse')}
                                    title="Temps moyen de calcul mental sur la plage sélectionnée (cumul depuis le début)"
                                    style={{ padding: '14px 14px', cursor: 'pointer', fontWeight: 800 }}
                                >
                                    Vitesse (depuis le début) {iconeTri('vitesse')}
                                </th>

                                <th
                                    onClick={() => handleSort('maitrise')}
                                    title="Multiplications vertes sur le dénominateur commun choisi"
                                    style={{ padding: '14px 14px', cursor: 'pointer', fontWeight: 800 }}
                                >
                                    Maîtrise (sur {faitsPlage}) {iconeTri('maitrise')}
                                </th>

                                <th
                                    onClick={() => handleSort('a_revoir')}
                                    title="Multiplications oranges ou rouges de la plage choisie"
                                    style={{ padding: '14px 12px', cursor: 'pointer', fontWeight: 800, textAlign: 'center' }}
                                >
                                    À revoir {iconeTri('a_revoir')}
                                </th>

                                {modePlage !== 'table' && (
                                    <th
                                        onClick={() => handleSort('table_fragile')}
                                        title="Table de multiplication où l'élève cumule le plus d'erreurs"
                                        style={{ padding: '14px 12px', cursor: 'pointer', fontWeight: 800, textAlign: 'center' }}
                                    >
                                        Table fragile {iconeTri('table_fragile')}
                                    </th>
                                )}

                                {/* Colonnes PÉRIODE (30 j) */}
                                <th
                                    onClick={() => handleSort('parties')}
                                    title={`Nombre de parties jouées sur les ${periodeJours} derniers jours`}
                                    style={{ padding: '14px 12px', cursor: 'pointer', fontWeight: 800, textAlign: 'center' }}
                                >
                                    Parties ({periodeJours} j) {iconeTri('parties')}
                                </th>

                                <th
                                    onClick={() => handleSort('jours')}
                                    title={`Nombre de jours avec au moins une partie sur les ${periodeJours} derniers jours`}
                                    style={{ padding: '14px 12px', cursor: 'pointer', fontWeight: 800, textAlign: 'center' }}
                                >
                                    Jours actifs ({periodeJours} j) {iconeTri('jours')}
                                </th>

                                <th
                                    onClick={() => handleSort('temps_partie')}
                                    title={`Temps cumulé passé en jeu sur les ${periodeJours} derniers jours`}
                                    style={{ padding: '14px 14px', cursor: 'pointer', fontWeight: 800 }}
                                >
                                    Temps passé ({periodeJours} j) {iconeTri('temps_partie')}
                                </th>

                                <th
                                    onClick={() => handleSort('progres')}
                                    title={`Variation de la cadence par question par rapport aux ${periodeJours} jours précédents (négatif = accélération)`}
                                    style={{ padding: '14px 14px', cursor: 'pointer', fontWeight: 800, textAlign: 'center' }}
                                >
                                    Progrès cadence ({periodeJours} j) {iconeTri('progres')}
                                </th>

                                <th style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 800 }}>
                                    Action
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={10} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--gris)', fontSize: 15 }}>
                                        Chargement des données de comparaison...
                                    </td>
                                </tr>
                            ) : lignesTriees.length === 0 ? (
                                <tr>
                                    <td colSpan={10} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--gris)', fontSize: 15 }}>
                                        Aucun élève trouvé pour cette sélection.
                                    </td>
                                </tr>
                            ) : (
                                lignesTriees.map((e, index) => {
                                    const aTemps = e.temps_moyen_ms != null && (e.nb_temps || 0) > 0;
                                    const tempsMoyenS = aTemps ? (e.temps_moyen_ms / 1000).toFixed(1).replace('.', ',') : null;
                                    const estRapide = aTemps && e.temps_moyen_ms <= seuilRapideMs;

                                    const pctVert = Math.round((Number(e.taux_vert) || 0) * 100);
                                    const aJoueSurPeriode = (e.nb_parties || 0) > 0;

                                    // Progrès cadence : e.progres_s_question est s.cadence - a.cadence
                                    // Moins de secondes par question = progrès (accélération)
                                    const progres = e.progres_s_question != null ? Number(e.progres_s_question) : null;
                                    const aProgres = progres !== null;

                                    return (
                                        <tr
                                            key={e.eleve_id}
                                            style={{
                                                borderBottom: '1px solid var(--bordure)',
                                                background: index % 2 === 0 ? 'var(--surface)' : 'rgba(250,246,238,0.4)',
                                                transition: 'background 0.15s ease',
                                                fontSize: 14,
                                            }}
                                        >
                                            {/* Nom / Prénom */}
                                            <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--indigo)' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => onOuvrirFiche?.(e.eleve_id)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        padding: 0,
                                                        color: 'var(--indigo)',
                                                        fontWeight: 700,
                                                        fontSize: 14,
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        textDecoration: 'underline',
                                                        textDecorationColor: 'transparent',
                                                        transition: 'text-decoration-color 0.15s ease',
                                                    }}
                                                    onMouseEnter={ev => ev.currentTarget.style.textDecorationColor = 'var(--indigo)'}
                                                    onMouseLeave={ev => ev.currentTarget.style.textDecorationColor = 'transparent'}
                                                >
                                                    {e.prenom} {e.nom}
                                                </button>
                                            </td>

                                            {/* Classe si affichée */}
                                            {(!classe || classeSelectionnee === 'Toutes') && (
                                                <td style={{ padding: '12px 12px', fontWeight: 600, color: 'var(--gris)' }}>
                                                    {e.classe}
                                                </td>
                                            )}

                                            {/* Vitesse de calcul mental : moyenne + dénominateur obligatoire */}
                                            <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                                                {aTemps ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{
                                                            fontWeight: 700,
                                                            color: estRapide ? 'var(--vert)' : 'var(--indigo-encre)',
                                                        }}>
                                                            {tempsMoyenS} s
                                                        </span>
                                                        <span style={{ fontSize: 12, color: 'var(--gris)', fontWeight: 500 }}>
                                                            · {e.nb_temps} rép.
                                                        </span>
                                                        {estRapide && (
                                                            <span title={`Sous le seuil rapide de ${seuilRapideS} s`} style={{ fontSize: 12 }}>
                                                                ⚡
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--gris)', fontWeight: 600 }}>—</span>
                                                )}
                                            </td>

                                            {/* Maîtrise : « X vertes sur Y » + pourcentage + mini barre */}
                                            <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                                                        <span style={{ fontWeight: 700, color: e.faits_verts > 0 ? 'var(--vert)' : 'var(--gris)' }}>
                                                            {e.faits_verts || 0} vertes sur {e.faits_plage || faitsPlage}
                                                        </span>
                                                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gris)' }}>
                                                            {pctVert} %
                                                        </span>
                                                    </div>
                                                    {/* Mini jauge visuelle */}
                                                    <div style={{
                                                        width: '100%',
                                                        height: 5,
                                                        background: 'var(--bordure)',
                                                        borderRadius: 3,
                                                        overflow: 'hidden',
                                                    }}>
                                                        <div style={{
                                                            width: `${Math.min(pctVert, 100)}%`,
                                                            height: '100%',
                                                            background: 'var(--vert)',
                                                            borderRadius: 3,
                                                        }} />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* À revoir */}
                                            <td style={{ padding: '12px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                {(e.faits_a_revoir || 0) > 0 ? (
                                                    <span style={{
                                                        padding: '3px 8px',
                                                        borderRadius: 999,
                                                        background: 'var(--rouge-pale)',
                                                        color: 'var(--erreur-donnee)',
                                                        fontWeight: 700,
                                                        fontSize: 12,
                                                    }}>
                                                        {e.faits_a_revoir}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--gris)', fontSize: 13, fontWeight: 500 }}>
                                                        0
                                                    </span>
                                                )}
                                            </td>

                                            {/* Table la plus fragile */}
                                            {modePlage !== 'table' && (
                                                <td style={{ padding: '12px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    {e.table_plus_fragile ? (
                                                        <span style={{
                                                            padding: '3px 8px',
                                                            borderRadius: 8,
                                                            background: 'var(--orange-pale)',
                                                            color: 'var(--attention)',
                                                            fontWeight: 700,
                                                            fontSize: 12,
                                                        }}>
                                                            Table {e.table_plus_fragile}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--gris)' }}>—</span>
                                                    )}
                                                </td>
                                            )}

                                            {/* Parties sur période */}
                                            <td style={{
                                                padding: '12px 12px',
                                                textAlign: 'center',
                                                fontWeight: aJoueSurPeriode ? 700 : 500,
                                                color: aJoueSurPeriode ? 'var(--action)' : 'var(--gris)',
                                            }}>
                                                {e.nb_parties || 0}
                                            </td>

                                            {/* Jours actifs sur période */}
                                            <td style={{
                                                padding: '12px 12px',
                                                textAlign: 'center',
                                                color: (e.jours_actifs || 0) > 0 ? 'var(--indigo-encre)' : 'var(--gris)',
                                                fontWeight: (e.jours_actifs || 0) > 0 ? 600 : 500,
                                            }}>
                                                {(e.jours_actifs || 0) > 0 ? `${e.jours_actifs} j` : '—'}
                                            </td>

                                            {/* Temps passé sur période */}
                                            <td style={{
                                                padding: '12px 14px',
                                                color: (e.temps_partie_s || 0) > 0 ? 'var(--indigo-encre)' : 'var(--gris)',
                                                fontWeight: (e.temps_partie_s || 0) > 0 ? 600 : 500,
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {formaterTemps(e.temps_partie_s)}
                                            </td>

                                            {/* Progrès cadence : négatif = accélération (vert), positif = ralentissement */}
                                            <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                {aProgres ? (
                                                    progres < 0 ? (
                                                        <span style={{
                                                            padding: '3px 8px',
                                                            borderRadius: 999,
                                                            background: 'var(--vert-pale)',
                                                            color: 'var(--vert)',
                                                            fontWeight: 700,
                                                            fontSize: 12,
                                                        }}>
                                                            ↗ {progres.toFixed(1).replace('.', ',')} s/q
                                                        </span>
                                                    ) : progres > 0 ? (
                                                        <span style={{
                                                            padding: '3px 8px',
                                                            borderRadius: 999,
                                                            background: 'var(--orange-pale)',
                                                            color: 'var(--attention)',
                                                            fontWeight: 700,
                                                            fontSize: 12,
                                                        }}>
                                                            ↘ +{progres.toFixed(1).replace('.', ',')} s/q
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--gris)', fontSize: 12, fontWeight: 600 }}>
                                                            = 0,0 s/q
                                                        </span>
                                                    )
                                                ) : (
                                                    <span style={{ color: 'var(--gris)' }}>—</span>
                                                )}
                                            </td>

                                            {/* Action Fiche */}
                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => onOuvrirFiche?.(e.eleve_id)}
                                                    style={{
                                                        border: '1px solid var(--bordure)',
                                                        background: 'var(--ciel-pale)',
                                                        color: 'var(--indigo)',
                                                        padding: '5px 12px',
                                                        borderRadius: 'var(--r-bouton)',
                                                        fontWeight: 700,
                                                        fontSize: 13,
                                                        cursor: 'pointer',
                                                        fontFamily: 'var(--texte)',
                                                        transition: 'all 0.15s ease',
                                                    }}
                                                    onMouseEnter={ev => ev.currentTarget.style.background = '#cbe6f7'}
                                                    onMouseLeave={ev => ev.currentTarget.style.background = 'var(--ciel-pale)'}
                                                >
                                                    📊 Fiche
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
