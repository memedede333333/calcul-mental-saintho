import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    listeClasses, ajouterEleve, modifierEleve, desactiverEleve, reactiverEleve,
    listeEleves, listeProfs, creerProf, modifierProf, desactiverProf,
    apercuImportEleves, importerEleves, reparerRattachements, journalAdmin,
} from '../api.js';
import {
    ModalDesactiverEleve,
    ModalApercuImport,
    ModalFrame,
} from '../components/Modals';

/**
 * Admin — Écran d'administration (Maquette 25)
 *
 * Format paysage pour Mac / ordinateur de bord.
 * Trois onglets principaux :
 *   - Élèves
 *   - Enseignants
 *   - Journal d'audit
 *
 * Règle projet :
 * - On ne supprime jamais un élève en cours d'année, on le désactive.
 * - Le mot « actif » est strictement réservé au statut du compte (Actif / Désactivé),
 *   jamais pour qualifier un élève qui a joué.
 * - La recherche est purement locale (client-side) et ne stocke ni n'envoie rien.
 */

export default function Admin({ onBack, identite, onIdentiteChange }) {
    const estAdmin = identite?.admin === true;
    const [tab, setTab] = useState('eleves'); // 'eleves' | 'profs' | 'journal'
    const [loading, setLoading] = useState(true);

    // Données principales
    const [classes, setClasses] = useState([]);
    const [eleves, setEleves] = useState([]);
    const [profs, setProfs] = useState([]);
    const [journal, setJournal] = useState([]);

    // Filtres onglet Élèves
    const [classeFiltre, setClasseFiltre] = useState('Toutes');
    const [filtreJamaisConnecte, setFiltreJamaisConnecte] = useState(false);
    const [triColonne, setTriColonne] = useState('prenom'); // 'prenom' | 'statut'
    const [triSens, setTriSens] = useState('asc'); // 'asc' | 'desc'
    const [recherche, setRecherche] = useState('');

    // Modals
    const [modalModifierEleve, setModalModifierEleve] = useState(null);
    const [modalDesactiverEleve, setModalDesactiverEleve] = useState(null);
    const [showAjoutEleveModal, setShowAjoutEleveModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showAjoutProfModal, setShowAjoutProfModal] = useState(false);
    const [modalModifierProf, setModalModifierProf] = useState(null);

    // État d'action en cours
    const [actionEnCours, setActionEnCours] = useState(false);
    const [messageFeedback, setMessageFeedback] = useState('');

    const monProfId = identite?.profil?.id || null;

    // Chargement initial des données
    const rechargerDonnees = useCallback(async () => {
        setLoading(true);
        const [resClasses, resEleves, resProfs, resJournal] = await Promise.all([
            listeClasses(),
            listeEleves(null),
            listeProfs(),
            journalAdmin(100),
        ]);

        if (resClasses.ok && resClasses.data) setClasses(resClasses.data);
        if (resEleves.ok && resEleves.data) setEleves(resEleves.data);
        if (resProfs.ok && resProfs.data) setProfs(resProfs.data);
        if (resJournal.ok && resJournal.data) setJournal(resJournal.data);

        setLoading(false);
    }, []);

    useEffect(() => {
        rechargerDonnees();
    }, [rechargerDonnees]);

    // Le total vient de la longueur de la liste et ne tient que tant que liste_eleves renvoie tout sans pagination.
    const totalInscrits = eleves.length;
    const totalDesactives = eleves.filter(e => !e.actif).length;
    const totalJamaisConnectes = eleves.filter(e => e.actif && !e.deja_connecte).length;

    // Filtrage et tri local des élèves (classe + recherche + jamais connecté + tri)
    const elevesFiltres = eleves.filter(e => {
        if (classeFiltre !== 'Toutes' && e.classe !== classeFiltre) return false;
        if (filtreJamaisConnecte && (!e.actif || e.deja_connecte)) return false;
        if (recherche.trim()) {
            const q = recherche.trim().toLowerCase();
            const nomComplet = `${e.prenom || ''} ${e.nom || ''}`.toLowerCase();
            const nomInverse = `${e.nom || ''} ${e.prenom || ''}`.toLowerCase();
            if (!nomComplet.includes(q) && !nomInverse.includes(q)) return false;
        }
        return true;
    }).sort((a, b) => {
        if (triColonne === 'statut') {
            // Ordre par défaut (asc) : Jamais connecté (0) -> Actif (1) -> Désactivé (2)
            const getPoids = (e) => (!e.actif ? 2 : !e.deja_connecte ? 0 : 1);
            const diff = getPoids(a) - getPoids(b);
            if (diff !== 0) return triSens === 'asc' ? diff : -diff;
        }
        const nomA = `${a.prenom || ''} ${a.nom || ''}`.toLowerCase();
        const nomB = `${b.prenom || ''} ${b.nom || ''}`.toLowerCase();
        return nomA.localeCompare(nomB, 'fr');
    });

    // Actions Élèves
    const handleReactivation = async (eleve) => {
        setActionEnCours(true);
        setMessageFeedback('');
        const res = await reactiverEleve(eleve.eleve_id);
        if (res.ok) {
            setMessageFeedback(`✅ ${eleve.prenom} ${eleve.nom} a été réactivé.`);
            await rechargerDonnees();
        } else {
            setMessageFeedback(`❌ ${res.error || 'Erreur lors de la réactivation.'}`);
        }
        setActionEnCours(false);
    };

    const handleConfirmationDesactivation = async (eleveId, motif) => {
        setActionEnCours(true);
        const res = await desactiverEleve(eleveId, motif);
        setModalDesactiverEleve(null);
        if (res.ok) {
            setMessageFeedback('✅ Compte élève désactivé. Ses données sont conservées.');
            await rechargerDonnees();
        } else {
            setMessageFeedback(`❌ ${res.error || 'Erreur lors de la désactivation.'}`);
        }
        setActionEnCours(false);
    };

    const handleConfirmationChangerClasse = async (eleveId, nouvelleClasse) => {
        setActionEnCours(true);
        const res = await modifierEleve(eleveId, { classe: nouvelleClasse });
        setModalClasseEleve(null);
        if (res.ok) {
            setMessageFeedback('✅ Classe mise à jour.');
            await rechargerDonnees();
        } else {
            setMessageFeedback(`❌ ${res.error || 'Erreur lors du changement de classe.'}`);
        }
        setActionEnCours(false);
    };

    // Actions Enseignants
    const handleChangementRoleProf = async (prof, nouveauRole) => {
        if (prof.prof_id === monProfId) return;
        const msg = nouveauRole === 'admin'
            ? `Donner les droits d'administrateur à ${prof.nom} ?`
            : `Retirer les droits d'administrateur à ${prof.nom} ?`;
        if (!window.confirm(msg)) return;

        setActionEnCours(true);
        const res = await modifierProf(prof.prof_id, { role: nouveauRole });
        if (res.ok) {
            setMessageFeedback(`✅ Rôle de ${prof.nom} mis à jour (${nouveauRole}).`);
            await rechargerDonnees();
            onIdentiteChange?.();
        } else {
            setMessageFeedback(`❌ ${res.error || 'Impossible de modifier le rôle.'}`);
        }
        setActionEnCours(false);
    };

    const handleDesactiverProf = async (prof) => {
        if (prof.prof_id === monProfId) return;
        if (!window.confirm(`Désactiver le compte enseignant de ${prof.nom} ?`)) return;

        setActionEnCours(true);
        const res = await desactiverProf(prof.prof_id);
        if (res.ok) {
            setMessageFeedback(`✅ Enseignant ${prof.nom} désactivé.`);
            await rechargerDonnees();
        } else {
            setMessageFeedback(`❌ ${res.error || 'Impossible de désactiver cet enseignant.'}`);
        }
        setActionEnCours(false);
    };

    return (
        <div className="screen-enter" style={{ padding: '8px 0 24px' }}>
            {/* Feedback message banner if any */}
            {messageFeedback && (
                <div style={{
                    maxWidth: 1194, margin: '0 auto 12px', padding: '10px 16px',
                    borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--bordure)',
                    fontFamily: 'var(--texte)', fontSize: 14, fontWeight: 700,
                    color: messageFeedback.startsWith('❌') ? 'var(--rouge)' : 'var(--succes)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <span>{messageFeedback}</span>
                    <button
                        onClick={() => setMessageFeedback('')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gris)', fontSize: 16 }}
                    >
                        ✕
                    </button>
                </div>
            )}

            <div className="admin-landscape">
                {/* 1. Colonne de gauche (Navigation Indigo) */}
                <div className="admin-sidebar">
                    <div className="admin-sidebar-header">
                        <button className="admin-sidebar-back" onClick={onBack}>
                            ‹ Accueil
                        </button>
                        <span className="admin-sidebar-title">Administration</span>
                        <span className="admin-sidebar-subtitle">Collège Saint‑Honoré</span>
                    </div>

                    <button
                        className={`admin-sidebar-tab${tab === 'eleves' ? ' admin-sidebar-tab--active' : ''}`}
                        onClick={() => setTab('eleves')}
                    >
                        <span>Élèves</span>
                        <span className="admin-sidebar-badge">{totalInscrits}</span>
                    </button>

                    <button
                        className={`admin-sidebar-tab${tab === 'profs' ? ' admin-sidebar-tab--active' : ''}`}
                        onClick={() => setTab('profs')}
                    >
                        <span>Enseignants</span>
                        <span className="admin-sidebar-badge">{profs.length}</span>
                    </button>

                    <button
                        className={`admin-sidebar-tab${tab === 'journal' ? ' admin-sidebar-tab--active' : ''}`}
                        onClick={() => setTab('journal')}
                    >
                        <span>Journal d'audit</span>
                    </button>

                    <div style={{ flex: 1 }} />

                    <div className="admin-sidebar-note">
                        On ne supprime jamais un élève en cours d'année. On le désactive : ses résultats restent, son accès s'arrête.
                    </div>
                </div>

                {/* 2. Zone centrale */}
                <div className="admin-main">
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '80px 0' }}>
                            <div className="spinner" style={{ margin: '0 auto 12px' }} />
                            <span style={{ fontFamily: 'var(--texte)', color: 'var(--gris)', fontWeight: 600 }}>
                                Chargement des données…
                            </span>
                        </div>
                    ) : tab === 'eleves' ? (
                        /* Onglet Élèves */
                        <>
                            <div className="admin-topbar">
                                <h2 className="admin-heading">Élèves</h2>

                                <div className="admin-class-pills">
                                    <button
                                        className={`admin-class-pill${classeFiltre === 'Toutes' ? ' admin-class-pill--active' : ''}`}
                                        onClick={() => setClasseFiltre('Toutes')}
                                    >
                                        Toutes
                                    </button>
                                    {classes.map(c => (
                                        <button
                                            key={c.classe}
                                            className={`admin-class-pill${classeFiltre === c.classe ? ' admin-class-pill--active' : ''}`}
                                            onClick={() => setClasseFiltre(c.classe)}
                                        >
                                            {c.classe}
                                        </button>
                                    ))}
                                    <button
                                        className={`admin-class-pill${filtreJamaisConnecte ? ' admin-class-pill--active' : ''}`}
                                        style={filtreJamaisConnecte ? {
                                            background: 'var(--orange)',
                                            borderColor: 'var(--orange)',
                                            color: '#FFFFFF',
                                            fontWeight: 700,
                                        } : {
                                            color: totalJamaisConnectes > 0 ? 'var(--orange)' : 'var(--gris)',
                                            borderColor: totalJamaisConnectes > 0 ? 'var(--orange)' : 'var(--bordure)',
                                            fontWeight: 600,
                                        }}
                                        onClick={() => setFiltreJamaisConnecte(v => !v)}
                                        title={filtreJamaisConnecte ? "Désactiver le filtre" : "Afficher uniquement les élèves jamais connectés"}
                                    >
                                        Jamais connectés ({totalJamaisConnectes})
                                    </button>
                                </div>

                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <div className="admin-search-box">
                                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                                            <circle cx="11" cy="11" r="6.6" stroke="var(--gris)" strokeWidth="2.4" />
                                            <path d="m16 16 4 4" stroke="var(--gris)" strokeWidth="2.4" strokeLinecap="round" />
                                        </svg>
                                        <input
                                            type="text"
                                            className="admin-search-input"
                                            placeholder="Rechercher un élève"
                                            value={recherche}
                                            onChange={e => setRecherche(e.target.value)}
                                        />
                                        {recherche && (
                                            <button
                                                onClick={() => setRecherche('')}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gris)', fontSize: 14 }}
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>

                                    <button
                                        className="admin-btn-action-main"
                                        onClick={() => setShowAjoutEleveModal(true)}
                                    >
                                        + Ajouter un élève
                                    </button>
                                    {estAdmin && (
                                        <button
                                            className="admin-btn-action-main"
                                            onClick={() => setShowImportModal(true)}
                                        >
                                            Importer une classe
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="admin-table-card">
                                <div className="admin-table-grid-header">
                                    <span />
                                    <span
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                        onClick={() => { setTriColonne('prenom'); setTriSens('asc'); }}
                                        title="Trier par prénom"
                                    >
                                        Nom {triColonne === 'prenom' ? '▲' : ''}
                                    </span>
                                    <span>Classe</span>
                                    <span>Plafond</span>
                                    <span
                                        style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                        onClick={() => {
                                            if (triColonne === 'statut') {
                                                if (triSens === 'asc') setTriSens('desc');
                                                else { setTriColonne('prenom'); setTriSens('asc'); }
                                            } else {
                                                setTriColonne('statut');
                                                setTriSens('asc');
                                            }
                                        }}
                                        title="Cliquer pour trier par statut (Jamais connecté en premier)"
                                    >
                                        Statut {triColonne === 'statut' ? (triSens === 'asc' ? '▲' : '▼') : '↕'}
                                    </span>
                                    <span style={{ textAlign: 'right' }}>Actions</span>
                                </div>

                                {elevesFiltres.length === 0 ? (
                                    <div style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--texte)', color: 'var(--gris)', fontWeight: 600 }}>
                                        Aucun élève trouvé pour cette sélection.
                                    </div>
                                ) : (
                                    elevesFiltres.map(e => {
                                        const estInactif = !e.actif;
                                        return (
                                            <div
                                                key={e.eleve_id}
                                                className={`admin-table-grid-row${estInactif ? ' admin-table-grid-row--inactive' : ''}`}
                                            >
                                                <span
                                                    className="admin-cell-avatar"
                                                    style={{ opacity: estInactif ? 0.45 : 1 }}
                                                >
                                                    {e.avatar_emoji || '👤'}
                                                </span>
                                                <span className={`admin-cell-name${estInactif ? ' admin-cell-name--inactive' : ''}`}>
                                                    {e.prenom} {e.nom}
                                                </span>
                                                <span className="admin-cell-muted">
                                                    {e.classe}
                                                </span>
                                                <span className="admin-cell-muted">
                                                    Table {e.plafond_tables}
                                                </span>
                                                {!e.actif ? (
                                                    <span className="admin-status-badge--inactive">Désactivé</span>
                                                ) : !e.deja_connecte ? (
                                                    <span className="admin-status-badge--never" title={e.derniere_connexion ? `Dernière activité le ${new Date(e.derniere_connexion).toLocaleDateString('fr-FR')}` : undefined}>
                                                        Jamais connecté
                                                    </span>
                                                ) : (
                                                    <span className="admin-status-badge--active" title={e.derniere_connexion ? `Dernière activité le ${new Date(e.derniere_connexion).toLocaleDateString('fr-FR')}` : undefined}>
                                                        Actif
                                                    </span>
                                                )}
                                                <span className="admin-cell-actions">
                                                    <button
                                                        className="admin-btn-table"
                                                        onClick={() => setModalModifierEleve(e)}
                                                        disabled={actionEnCours}
                                                    >
                                                        Modifier
                                                    </button>
                                                    {estInactif ? (
                                                        <button
                                                            className="admin-btn-table admin-btn-table--reactiver"
                                                            onClick={() => handleReactivation(e)}
                                                            disabled={actionEnCours}
                                                        >
                                                            Réactiver
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className="admin-btn-table admin-btn-table--desactiver"
                                                            onClick={() => setModalDesactiverEleve(e)}
                                                            disabled={actionEnCours}
                                                        >
                                                            Désactiver
                                                        </button>
                                                    )}
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="admin-footer-count">
                                {elevesFiltres.length} ligne{elevesFiltres.length > 1 ? 's' : ''} sur {totalInscrits} inscrits
                                {totalDesactives > 0 && ` · ${totalDesactives} désactivé${totalDesactives > 1 ? 's' : ''}`}
                                {totalJamaisConnectes > 0 && ` · ${totalJamaisConnectes} jamais connecté${totalJamaisConnectes > 1 ? 's' : ''}`}
                                {filtreJamaisConnecte && ' · filtre « Jamais connecté » actif'}
                                {triColonne === 'statut' ? ' · trié par statut' : ' · trié par prénom'}
                            </div>
                            <div style={{ flex: 1 }} />
                        </>
                    ) : tab === 'profs' ? (
                        /* Onglet Enseignants */
                        <>
                            <div className="admin-topbar">
                                <h2 className="admin-heading">Enseignants</h2>
                                {estAdmin && (
                                    <div style={{ marginLeft: 'auto' }}>
                                        <button
                                            className="admin-btn-action-main"
                                            onClick={() => setShowAjoutProfModal(true)}
                                        >
                                            + Ajouter un enseignant
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="admin-table-card">
                                <div style={{
                                    display: 'grid', gridTemplateColumns: '36px minmax(110px, 1fr) minmax(150px, 1.2fr) 80px minmax(80px, 1fr) 180px',
                                    minWidth: 500, boxSizing: 'border-box', padding: '11px 12px', background: 'var(--ivoire)',
                                    borderBottom: '1px solid var(--bordure)', fontFamily: 'var(--texte)',
                                    fontWeight: 700, fontSize: 12, color: 'var(--gris)', letterSpacing: '0.08em',
                                    textTransform: 'uppercase', alignItems: 'center'
                                }}>
                                    <span />
                                    <span>Nom</span>
                                    <span>Email</span>
                                    <span>Rôle</span>
                                    <span>Classes</span>
                                    <span style={{ textAlign: 'right' }}>Actions</span>
                                </div>

                                {profs.map(p => {
                                    const estMoi = p.prof_id === monProfId;
                                    return (
                                        <div
                                            key={p.prof_id}
                                            style={{
                                                display: 'grid', gridTemplateColumns: '36px minmax(110px, 1fr) minmax(150px, 1.2fr) 80px minmax(80px, 1fr) 180px',
                                                minWidth: 500, boxSizing: 'border-box', padding: '11px 12px', alignItems: 'center',
                                                borderBottom: '1px solid var(--bordure)', background: 'var(--surface)',
                                                fontFamily: 'var(--texte)'
                                            }}
                                        >
                                            <span style={{ fontSize: 20 }}>🎓</span>
                                            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--indigo)' }}>
                                                {p.nom} {estMoi && <span style={{ color: 'var(--gris)', fontWeight: 600, fontSize: 13 }}>(toi)</span>}
                                            </span>
                                            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                                                {p.email}
                                            </span>
                                            <span>
                                                {estMoi ? (
                                                    <span style={{
                                                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 13,
                                                        padding: '4px 10px', borderRadius: 8,
                                                        background: p.role === 'admin' ? 'var(--orange-pale)' : 'var(--ciel-pale)',
                                                        color: p.role === 'admin' ? 'var(--orange)' : 'var(--action)',
                                                    }}>
                                                        {p.role === 'admin' ? 'Admin' : 'Prof'}
                                                    </span>
                                                ) : (
                                                    <select
                                                        value={p.role}
                                                        onChange={e => handleChangementRoleProf(p, e.target.value)}
                                                        disabled={actionEnCours || !estAdmin}
                                                        style={{
                                                            padding: '4px 8px', borderRadius: 8, border: '1px solid var(--bordure)',
                                                            fontFamily: 'var(--texte)', fontSize: 13, fontWeight: 700,
                                                            color: 'var(--indigo)', background: 'var(--surface)', cursor: 'pointer'
                                                        }}
                                                    >
                                                        <option value="prof">Prof</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                )}
                                            </span>
                                            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                                                {p.classes?.length > 0 ? p.classes.join(', ') : '—'}
                                            </span>
                                            <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                                {estAdmin && (
                                                    <button
                                                        className="admin-btn-table"
                                                        onClick={() => setModalModifierProf(p)}
                                                        disabled={actionEnCours}
                                                    >
                                                        Modifier
                                                    </button>
                                                )}
                                                {!estMoi && estAdmin && p.actif && (
                                                    <button
                                                        className="admin-btn-table admin-btn-table--desactiver"
                                                        onClick={() => handleDesactiverProf(p)}
                                                        disabled={actionEnCours}
                                                    >
                                                        Désactiver
                                                    </button>
                                                )}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ flex: 1 }} />
                        </>
                    ) : (
                        /* Onglet Journal d'audit complet */
                        <>
                            <div className="admin-topbar">
                                <h2 className="admin-heading">Journal d'audit</h2>
                            </div>

                            <div className="admin-audit-info-box">
                                <div className="admin-audit-info-title">Le journal ne s'efface pas</div>
                                <div className="admin-audit-info-text">
                                    Chaque changement de classe, plafond, rôle ou statut y est écrit avec son auteur. C'est ce qui permet de répondre à « qui a fait ça ».
                                </div>
                            </div>

                            <div className="admin-table-card" style={{ padding: '12px 20px', maxHeight: 600, overflowY: 'auto' }}>
                                {journal.length === 0 ? (
                                    <div style={{ padding: 24, textAlign: 'center', fontFamily: 'var(--texte)', color: 'var(--gris)', fontWeight: 600 }}>
                                        Aucune entrée dans le journal d'audit.
                                    </div>
                                ) : (
                                    journal.map(entry => (
                                        <div
                                            key={entry.id}
                                            style={{
                                                padding: '12px 0', borderBottom: '1px solid var(--bordure)',
                                                display: 'flex', flexDirection: 'column', gap: 3
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 14, color: 'var(--indigo)' }}>
                                                    {formaterActionJournal(entry.action)}
                                                </span>
                                                <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 12, color: 'var(--gris-inerte)' }}>
                                                    {formaterDateJournal(entry.fait_le)} · {entry.acteur_email || entry.fait_par || 'système'}
                                                </span>
                                            </div>
                                            <div style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 13, color: 'var(--gris)' }}>
                                                {formaterDetailJournal(entry)}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div style={{ flex: 1 }} />
                        </>
                    )}
                </div>

                {/* 3. Colonne de droite (Aperçu Journal d'audit) — seulement sur onglet élèves sur grand écran */}
                {tab === 'eleves' && (
                    <div className="admin-preview-col">
                        <div className="admin-preview-header">
                            <h3 className="admin-preview-title">Journal d'audit</h3>
                            <button
                                className="admin-preview-link"
                                onClick={() => setTab('journal')}
                            >
                                Tout voir
                            </button>
                        </div>

                        {journal.slice(0, 5).map(entry => (
                            <div key={entry.id} className="admin-audit-entry">
                                <div className="admin-audit-action">{formaterActionJournal(entry.action)}</div>
                                <div className="admin-audit-detail">{formaterDetailJournal(entry)}</div>
                                <div className="admin-audit-meta">
                                    {formaterDateJournal(entry.fait_le)} · {entry.acteur_email || entry.fait_par || 'prof'}
                                </div>
                            </div>
                        ))}

                        <div style={{ flex: 1 }} />

                        <div className="admin-audit-info-box">
                            <div className="admin-audit-info-title">Le journal ne s'efface pas</div>
                            <div className="admin-audit-info-text">
                                Chaque changement de classe, plafond, rôle ou statut y est écrit avec son auteur. C'est ce qui permet de répondre à « qui a fait ça ».
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ===================== MODALS ===================== */}

            {/* Modal Modifier la fiche élève */}
            {modalModifierEleve && (
                <ModalModifierEleve
                    eleve={modalModifierEleve}
                    classes={classes}
                    estAdmin={estAdmin}
                    onClose={() => setModalModifierEleve(null)}
                    onSuccess={async () => {
                        await rechargerDonnees();
                        setMessageFeedback('✅ Fiche élève mise à jour.');
                    }}
                />
            )}

            {/* Modal Modifier la fiche enseignant */}
            {modalModifierProf && (
                <ModalModifierProf
                    prof={modalModifierProf}
                    classesDisponibles={classes}
                    estMoi={modalModifierProf.prof_id === monProfId}
                    onClose={() => setModalModifierProf(null)}
                    onSuccess={async () => {
                        await rechargerDonnees();
                        onIdentiteChange?.();
                        setMessageFeedback('✅ Fiche enseignant mise à jour.');
                    }}
                />
            )}

            {/* Modal Ajouter un élève */}
            {showAjoutEleveModal && (
                <ModalAjouterEleve
                    classes={classes}
                    classeInitiale={classeFiltre !== 'Toutes' ? classeFiltre : (classes[0]?.classe || '')}
                    onClose={() => setShowAjoutEleveModal(false)}
                    onSuccess={async (nomComplet) => {
                        await rechargerDonnees();
                        setMessageFeedback(`✅ Élève ${nomComplet} ajouté avec succès.`);
                    }}
                />
            )}

            {/* Modal Désactiver élève */}
            {modalDesactiverEleve && (
                <ModalDesactiverEleve
                    eleve={modalDesactiverEleve}
                    onClose={() => setModalDesactiverEleve(null)}
                    onConfirm={handleConfirmationDesactivation}
                    busy={actionEnCours}
                />
            )}

            {/* Modal Importer une classe */}
            {showImportModal && (
                <ModalImport
                    onClose={() => setShowImportModal(false)}
                    onSuccess={async () => {
                        await rechargerDonnees();
                    }}
                />
            )}

            {/* Modal Ajouter un enseignant */}
            {showAjoutProfModal && (
                <ModalAjouterProf
                    onClose={() => setShowAjoutProfModal(false)}
                    onSuccess={async () => {
                        await rechargerDonnees();
                    }}
                />
            )}
        </div>
    );
}

/* ===================================================================
 * MODALS ET COMPOSANTS UTILITAIRES
 * ================================================================= */

function ModalAjouterEleve({ classes, classeInitiale, onClose, onSuccess }) {
    const [prenom, setPrenom] = useState('');
    const [nom, setNom] = useState('');
    const [classe, setClasse] = useState(classeInitiale || (classes[0]?.classe || ''));
    const [email, setEmail] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    const handleAdd = async (e) => {
        e?.preventDefault();
        if (!prenom.trim() || !nom.trim() || !classe.trim() || !email.trim()) {
            setMsg('❌ Tous les champs sont requis.');
            return;
        }
        setBusy(true);
        setMsg('');

        const res = await ajouterEleve({
            prenom: prenom.trim(),
            nom: nom.trim(),
            classe: classe.trim(),
            email: email.trim(),
        });

        if (res.ok) {
            await onSuccess(`${prenom.trim()} ${nom.trim()}`);
            onClose();
        } else {
            setMsg(`❌ ${res.error || res.data?.message || "Erreur lors de l'ajout."}`);
            setBusy(false);
        }
    };

    return (
        <ModalFrame onClose={onClose} maxWidth={520}>
            <form onSubmit={handleAdd} style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, font: '700 24px var(--titre)', color: 'var(--indigo)' }}>
                        Ajouter un élève
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--gris)' }}
                    >
                        ✕
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 4 }}>
                            Prénom :
                        </label>
                        <input
                            type="text"
                            placeholder="ex. Léa"
                            value={prenom}
                            onChange={e => setPrenom(e.target.value)}
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: 10,
                                border: '1px solid var(--bordure)', font: '600 15px var(--texte)',
                                boxSizing: 'border-box', outline: 'none', color: 'var(--indigo)',
                                background: 'var(--surface)',
                            }}
                            required
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 4 }}>
                            Nom :
                        </label>
                        <input
                            type="text"
                            placeholder="ex. Martin"
                            value={nom}
                            onChange={e => setNom(e.target.value)}
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: 10,
                                border: '1px solid var(--bordure)', font: '600 15px var(--texte)',
                                boxSizing: 'border-box', outline: 'none', color: 'var(--indigo)',
                                background: 'var(--surface)',
                            }}
                            required
                        />
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 6 }}>
                        Classe :
                    </label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {classes.map(c => {
                            const val = typeof c === 'string' ? c : c.classe;
                            const isSel = classe === val;
                            return (
                                <button
                                    key={val}
                                    type="button"
                                    onClick={() => setClasse(val)}
                                    className={`admin-class-pill${isSel ? ' admin-class-pill--active' : ''}`}
                                    style={{ padding: '8px 14px', fontSize: 14 }}
                                >
                                    {val}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 4 }}>
                        Email scolaire Google :
                    </label>
                    <input
                        type="email"
                        placeholder="lea.martin@demo.saintho.fr"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        style={{
                            width: '100%', padding: '10px 12px', borderRadius: 10,
                            border: '1px solid var(--bordure)', font: '600 15px var(--texte)',
                            boxSizing: 'border-box', outline: 'none', color: 'var(--indigo)',
                            background: 'var(--surface)',
                        }}
                        required
                    />
                    <div style={{
                        marginTop: 6, font: '600 12px var(--texte)',
                        color: 'var(--gris)', lineHeight: 1.4,
                    }}>
                        L'élève pourra se connecter avec son compte Google dès que sa fiche est créée.
                    </div>
                </div>

                {msg && (
                    <div style={{
                        padding: 10, borderRadius: 10,
                        background: msg.startsWith('❌') ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                        border: `1px solid ${msg.startsWith('❌') ? 'var(--rouge)' : 'var(--vert)'}`,
                        font: '600 13px var(--texte)', color: msg.startsWith('❌') ? 'var(--rouge)' : 'var(--vert)',
                    }}>
                        {msg}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button
                        type="button"
                        className="admin-btn-table"
                        onClick={onClose}
                        disabled={busy}
                    >
                        Annuler
                    </button>
                    <button
                        type="submit"
                        className="admin-btn-action-main"
                        style={{ height: 42, padding: '0 20px', fontSize: 15 }}
                        disabled={busy}
                    >
                        {busy ? 'Ajout en cours…' : '+ Ajouter l\'élève'}
                    </button>
                </div>
            </form>
        </ModalFrame>
    );
}

function ModalModifierEleve({ eleve, classes, estAdmin, onClose, onSuccess }) {
    const [prenom, setPrenom] = useState(eleve?.prenom || '');
    const [nom, setNom] = useState(eleve?.nom || '');
    const [classe, setClasse] = useState(eleve?.classe || '');
    const [email, setEmail] = useState(eleve?.email || '');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    const handleSave = async (e) => {
        e?.preventDefault();
        if (!prenom.trim() || !nom.trim() || !classe.trim()) {
            setMsg('❌ Prénom, nom et classe requis.');
            return;
        }
        if (estAdmin && !email.trim()) {
            setMsg('❌ Adresse e-mail requise.');
            return;
        }
        setBusy(true);
        setMsg('');

        const params = {
            prenom: prenom.trim(),
            nom: nom.trim(),
            classe: classe.trim(),
        };
        // Seul l'administrateur transmet l'adresse e-mail
        if (estAdmin && email.trim()) {
            params.email = email.trim();
        }

        const res = await modifierEleve(eleve.eleve_id, params);
        if (res.ok) {
            await onSuccess();
            onClose();
        } else {
            // Afficher le message du serveur mot pour mot, sans le reformuler
            setMsg(`❌ ${res.error || res.data?.message || 'Erreur lors de la modification.'}`);
            setBusy(false);
        }
    };

    return (
        <ModalFrame onClose={onClose} maxWidth={520}>
            <form onSubmit={handleSave} style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, font: '700 24px var(--titre)', color: 'var(--indigo)' }}>
                        Modifier la fiche élève
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--gris)' }}
                    >
                        ✕
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 4 }}>
                            Prénom :
                        </label>
                        <input
                            type="text"
                            value={prenom}
                            onChange={e => setPrenom(e.target.value)}
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: 10,
                                border: '1px solid var(--bordure)', font: '600 15px var(--texte)',
                                boxSizing: 'border-box', outline: 'none', color: 'var(--indigo)',
                                background: 'var(--surface)',
                            }}
                            required
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 4 }}>
                            Nom :
                        </label>
                        <input
                            type="text"
                            value={nom}
                            onChange={e => setNom(e.target.value)}
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: 10,
                                border: '1px solid var(--bordure)', font: '600 15px var(--texte)',
                                boxSizing: 'border-box', outline: 'none', color: 'var(--indigo)',
                                background: 'var(--surface)',
                            }}
                            required
                        />
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 6 }}>
                        Classe :
                    </label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {classes.map(c => {
                            const val = typeof c === 'string' ? c : c.classe;
                            const isSel = classe === val;
                            return (
                                <button
                                    key={val}
                                    type="button"
                                    onClick={() => setClasse(val)}
                                    className={`admin-class-pill${isSel ? ' admin-class-pill--active' : ''}`}
                                    style={{ padding: '8px 14px', fontSize: 14 }}
                                >
                                    {val}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 4 }}>
                        Adresse e-mail scolaire :
                    </label>
                    <input
                        type="email"
                        value={email}
                        disabled={!estAdmin}
                        onChange={e => setEmail(e.target.value)}
                        style={{
                            width: '100%', padding: '10px 12px', borderRadius: 10,
                            border: '1px solid var(--bordure)', font: '600 15px var(--texte)',
                            boxSizing: 'border-box', outline: 'none',
                            color: estAdmin ? 'var(--indigo)' : 'var(--gris-inerte)',
                            background: estAdmin ? 'var(--surface)' : 'var(--surface-alt)',
                            cursor: estAdmin ? 'text' : 'not-allowed',
                        }}
                        required
                    />
                    <div style={{
                        marginTop: 6, font: '600 12px var(--texte)',
                        color: estAdmin ? 'var(--gris)' : 'var(--gris-inerte)',
                        lineHeight: 1.4,
                    }}>
                        {estAdmin
                            ? "L'élève garde ses points et son historique. Pense à changer aussi l'adresse dans la console Google."
                            : "Seul l'administrateur peut changer l'adresse, car elle doit être changée aussi dans la console Google."}
                    </div>
                </div>

                {msg && (
                    <div style={{
                        padding: 10, borderRadius: 10,
                        background: msg.startsWith('❌') ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                        border: `1px solid ${msg.startsWith('❌') ? 'var(--rouge)' : 'var(--vert)'}`,
                        font: '600 13px var(--texte)', color: msg.startsWith('❌') ? 'var(--rouge)' : 'var(--vert)',
                    }}>
                        {msg}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button
                        type="button"
                        className="admin-btn-table"
                        onClick={onClose}
                        disabled={busy}
                    >
                        Annuler
                    </button>
                    <button
                        type="submit"
                        className="admin-btn-action-main"
                        style={{ height: 42, padding: '0 20px', fontSize: 15 }}
                        disabled={busy}
                    >
                        {busy ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                </div>
            </form>
        </ModalFrame>
    );
}

function ModalModifierProf({ prof, classesDisponibles, estMoi, onClose, onSuccess }) {
    const [nom, setNom] = useState(prof?.nom || '');
    const [email, setEmail] = useState(prof?.email || '');
    const [role, setRole] = useState(prof?.role || 'prof');
    const [classes, setClasses] = useState(prof?.classes || []);
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    const toggleClasse = (c) => {
        setClasses(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c].sort());
    };

    const handleSave = async (e) => {
        e?.preventDefault();
        if (!nom.trim()) {
            setMsg('❌ Le nom est requis.');
            return;
        }
        if (!email.trim()) {
            setMsg('❌ L\'adresse e-mail est requise.');
            return;
        }
        setBusy(true);
        setMsg('');

        const params = {
            nom: nom.trim(),
            email: email.trim(),
            classes: classes,
        };
        // On ne peut pas changer son propre rôle
        if (!estMoi) {
            params.role = role;
        }

        const res = await modifierProf(prof.prof_id, params);
        if (res.ok) {
            await onSuccess();
            onClose();
        } else {
            setMsg(`❌ ${res.error || res.data?.message || 'Erreur lors de la modification.'}`);
            setBusy(false);
        }
    };

    return (
        <ModalFrame onClose={onClose} maxWidth={520}>
            <form onSubmit={handleSave} style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, font: '700 24px var(--titre)', color: 'var(--indigo)' }}>
                        Modifier l'enseignant
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--gris)' }}
                    >
                        ✕
                    </button>
                </div>

                <div>
                    <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 4 }}>
                        Nom complet :
                    </label>
                    <input
                        type="text"
                        value={nom}
                        onChange={e => setNom(e.target.value)}
                        style={{
                            width: '100%', padding: '10px 12px', borderRadius: 10,
                            border: '1px solid var(--bordure)', font: '600 15px var(--texte)',
                            boxSizing: 'border-box', outline: 'none', color: 'var(--indigo)',
                            background: 'var(--surface)',
                        }}
                        required
                    />
                </div>

                <div>
                    <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 4 }}>
                        Adresse e-mail Google (@saintho.fr) :
                    </label>
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        style={{
                            width: '100%', padding: '10px 12px', borderRadius: 10,
                            border: '1px solid var(--bordure)', font: '600 15px var(--texte)',
                            boxSizing: 'border-box', outline: 'none', color: 'var(--indigo)',
                            background: 'var(--surface)',
                        }}
                        required
                    />
                    <div style={{
                        marginTop: 6, font: '600 12px var(--texte)', color: 'var(--gris)', lineHeight: 1.4,
                    }}>
                        L'enseignant conserve ses accès et ses défis. Pense à changer aussi l'adresse dans la console Google Workspace si nécessaire.
                    </div>
                </div>

                {!estMoi && (
                    <div>
                        <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 4 }}>
                            Rôle :
                        </label>
                        <select
                            value={role}
                            onChange={e => setRole(e.target.value)}
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: 10,
                                border: '1px solid var(--bordure)', font: '700 14px var(--texte)',
                                boxSizing: 'border-box', outline: 'none', color: 'var(--indigo)',
                                background: 'var(--surface)', cursor: 'pointer',
                            }}
                        >
                            <option value="prof">Professeur</option>
                            <option value="admin">Administrateur</option>
                        </select>
                    </div>
                )}

                {classesDisponibles?.length > 0 && (
                    <div>
                        <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 6 }}>
                            Classes attribuées :
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {classesDisponibles.map(c => {
                                const nomCl = c.classe || c;
                                const isSelected = classes.includes(nomCl);
                                return (
                                    <button
                                        type="button"
                                        key={nomCl}
                                        onClick={() => toggleClasse(nomCl)}
                                        style={{
                                            padding: '6px 12px', borderRadius: 8,
                                            border: isSelected ? '2px solid var(--action)' : '1px solid var(--bordure)',
                                            background: isSelected ? 'var(--action)' : 'var(--surface)',
                                            color: isSelected ? 'var(--action-texte)' : 'var(--indigo)',
                                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 13,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {nomCl}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {msg && (
                    <div style={{
                        padding: 10, borderRadius: 10,
                        background: msg.startsWith('❌') ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                        border: `1px solid ${msg.startsWith('❌') ? 'var(--rouge)' : 'var(--vert)'}`,
                        font: '600 13px var(--texte)', color: msg.startsWith('❌') ? 'var(--rouge)' : 'var(--vert)',
                    }}>
                        {msg}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button
                        type="button"
                        className="admin-btn-table"
                        onClick={onClose}
                        disabled={busy}
                    >
                        Annuler
                    </button>
                    <button
                        type="submit"
                        className="admin-btn-action-main"
                        style={{ height: 42, padding: '0 20px', fontSize: 15 }}
                        disabled={busy}
                    >
                        {busy ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                </div>
            </form>
        </ModalFrame>
    );
}

function ModalImport({ onClose, onSuccess }) {
    const [csv, setCsv] = useState('');
    const [nomFichier, setNomFichier] = useState('eleves.csv');
    const [apercuData, setApercuData] = useState(null);
    const [parsedEleves, setParsedEleves] = useState([]);
    const [resultat, setResultat] = useState(null);
    const [busy, setBusy] = useState(false);
    const [busyImport, setBusyImport] = useState(false);
    const [busyRattachement, setBusyRattachement] = useState(false);
    const [msgRattachement, setMsgRattachement] = useState('');
    const fileRef = useRef(null);

    const handleFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setNomFichier(file.name);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target.result || '';
            setCsv(content);
        };
        reader.readAsText(file);
    };

    const handleGenererApercu = async () => {
        if (!csv.trim()) return;
        setBusy(true);
        setResultat(null);

        const lines = csv.trim().split('\n');
        const eleves = [];
        let lineIdx = 0;
        for (const rawLine of lines) {
            lineIdx++;
            const line = rawLine.trim();
            if (!line) continue;
            const parts = line.split(/[,;\t]/).map(s => s.trim());
            if (parts[0].toLowerCase() === 'email' && lineIdx === 1) continue;
            eleves.push({
                ligne: lineIdx,
                email: parts[0] || '',
                nom: parts[1] || '',
                prenom: parts[2] || '',
                classe: parts[3] || '',
            });
        }

        if (eleves.length === 0) {
            setResultat({ error: 'Aucun élève trouvé. Format requis : email, nom, prénom, classe' });
            setBusy(false);
            return;
        }

        const res = await apercuImportEleves(eleves);
        if (res.ok) {
            setApercuData(res.data);
            setParsedEleves(eleves);
        } else {
            setResultat({ error: res.error || "Impossible de générer l'aperçu." });
        }
        setBusy(false);
    };

    const handleConfirmImport = async () => {
        if (!parsedEleves.length) return;
        setBusyImport(true);
        const res = await importerEleves(parsedEleves);
        if (res.ok) {
            setApercuData(null);
            setResultat(res.data);
            await onSuccess();
        } else {
            alert(`Erreur d'import : ${res.error || 'Échec du traitement'}`);
        }
        setBusyImport(false);
    };

    const handleRepair = async () => {
        setBusyRattachement(true);
        setMsgRattachement('');
        const res = await reparerRattachements();
        if (res.ok) {
            const count = res.data?.rattaches ?? 0;
            setMsgRattachement(count > 0
                ? `✅ ${count} fiche${count > 1 ? 's' : ''} rattachée${count > 1 ? 's' : ''} à un compte Google.`
                : 'ℹ️ Aucune fiche à rattacher.');
            await onSuccess();
        } else {
            setMsgRattachement(`❌ ${res.error || 'Erreur lors du rattachement.'}`);
        }
        setBusyRattachement(false);
    };

    return (
        <>
            <ModalFrame onClose={onClose} maxWidth={560}>
                <div style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, font: '700 24px var(--titre)', color: 'var(--indigo)' }}>
                            Importer une classe
                        </h3>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--gris)' }}
                        >
                            ✕
                        </button>
                    </div>

                    <p style={{ margin: 0, font: '600 15px var(--texte)', color: 'var(--gris)' }}>
                        Fichier CSV : <b>email, nom, prénom, classe</b> — un élève par ligne.<br />
                        L'aperçu permet de vérifier les créations, mises à jour et rejets <b>avant</b> toute écriture.
                    </p>

                    <input
                        ref={fileRef}
                        type="file"
                        accept=".csv,.txt"
                        onChange={handleFile}
                        style={{ font: '600 14px var(--texte)' }}
                    />

                    <textarea
                        rows={4}
                        placeholder="Ou collez directement les lignes CSV ici..."
                        value={csv}
                        onChange={e => setCsv(e.target.value)}
                        style={{
                            width: '100%', padding: '12px', borderRadius: 12,
                            border: '1px solid var(--bordure)', font: '500 13px monospace',
                            boxSizing: 'border-box', outline: 'none'
                        }}
                    />

                    <button
                        type="button"
                        className="admin-btn-action-main"
                        style={{ height: 48, font: '700 16px var(--texte)' }}
                        onClick={handleGenererApercu}
                        disabled={busy || !csv.trim()}
                    >
                        {busy ? 'Génération de l\'aperçu…' : 'Voir l\'aperçu avant d\'importer ›'}
                    </button>

                    {resultat && (
                        <div style={{
                            padding: 14, borderRadius: 12, background: 'var(--ivoire)',
                            border: '1px solid var(--bordure)', font: '600 14px var(--texte)'
                        }}>
                            {resultat.error ? (
                                <span style={{ color: 'var(--rouge)', fontWeight: 700 }}>❌ {resultat.error}</span>
                            ) : (
                                <div>
                                    <div style={{ color: 'var(--vert)', fontWeight: 700, marginBottom: 4 }}>
                                        ✅ Import terminé
                                    </div>
                                    <div style={{ color: 'var(--indigo)' }}>
                                        {resultat.crees ?? 0} créé{(resultat.crees ?? 0) > 1 ? 's' : ''}, {resultat.mis_a_jour ?? 0} mis à jour.
                                        {(resultat.rattaches ?? 0) > 0 && ` (${resultat.rattaches} rattachés)`}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Section Rattachement Google */}
                    <div style={{ borderTop: '1px solid var(--bordure)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ font: '700 14px var(--texte)', color: 'var(--indigo)' }}>
                            Rattachement des comptes Google
                        </div>
                        <div style={{ font: '600 13px var(--texte)', color: 'var(--gris)' }}>
                            À lancer après un import ou si un élève s'est connecté avant la création de sa fiche.
                        </div>
                        <button
                            type="button"
                            className="admin-btn-table"
                            style={{ height: 38, font: '700 14px var(--texte)', alignSelf: 'flex-start' }}
                            onClick={handleRepair}
                            disabled={busyRattachement}
                        >
                            {busyRattachement ? 'Vérification…' : '🔄 Réparer les rattachements'}
                        </button>
                        {msgRattachement && (
                            <div style={{ font: '700 13px var(--texte)', color: msgRattachement.startsWith('❌') ? 'var(--rouge)' : 'var(--vert)' }}>
                                {msgRattachement}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                        <button type="button" className="admin-btn-table" onClick={onClose}>
                            Fermer
                        </button>
                    </div>
                </div>
            </ModalFrame>

            {/* Modale d'aperçu d'import (Écran 36d) */}
            {apercuData && (
                <ModalApercuImport
                    apercu={apercuData}
                    nomFichier={nomFichier}
                    parsedRows={parsedEleves}
                    onClose={() => setApercuData(null)}
                    onConfirm={handleConfirmImport}
                    busy={busyImport}
                />
            )}
        </>
    );
}

function ModalAjouterProf({ onClose, onSuccess }) {
    const [nom, setNom] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('prof');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    const handleAdd = async () => {
        if (!nom.trim() || !email.trim()) {
            setMsg('❌ Nom et email requis.');
            return;
        }
        setBusy(true);
        setMsg('');
        const res = await creerProf({ email: email.trim(), nom: nom.trim(), role });
        if (res.ok) {
            await onSuccess();
            onClose();
        } else {
            setMsg(`❌ ${res.error || 'Erreur lors de la création.'}`);
            setBusy(false);
        }
    };

    return (
        <ModalFrame onClose={onClose} maxWidth={440}>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, font: '700 22px var(--titre)', color: 'var(--indigo)' }}>
                        Ajouter un enseignant
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--gris)' }}
                    >
                        ✕
                    </button>
                </div>

                <div>
                    <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 4 }}>
                        Nom :
                    </label>
                    <input
                        type="text"
                        placeholder="M. Dupont"
                        value={nom}
                        onChange={e => setNom(e.target.value)}
                        style={{
                            width: '100%', padding: '10px 12px', borderRadius: 10,
                            border: '1px solid var(--bordure)', font: '600 14px var(--texte)',
                            boxSizing: 'border-box', outline: 'none'
                        }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 4 }}>
                        Email Google :
                    </label>
                    <input
                        type="email"
                        placeholder="dupont@saintho.fr"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        style={{
                            width: '100%', padding: '10px 12px', borderRadius: 10,
                            border: '1px solid var(--bordure)', font: '600 14px var(--texte)',
                            boxSizing: 'border-box', outline: 'none'
                        }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 6 }}>
                        Rôle :
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            type="button"
                            className={`admin-class-pill${role === 'prof' ? ' admin-class-pill--active' : ''}`}
                            style={{ flex: 1, textAlign: 'center' }}
                            onClick={() => setRole('prof')}
                        >
                            Prof
                        </button>
                        <button
                            type="button"
                            className={`admin-class-pill${role === 'admin' ? ' admin-class-pill--active' : ''}`}
                            style={{ flex: 1, textAlign: 'center' }}
                            onClick={() => setRole('admin')}
                        >
                            Admin
                        </button>
                    </div>
                </div>

                {msg && (
                    <div style={{ font: '700 13px var(--texte)', color: 'var(--rouge)' }}>
                        {msg}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 8, justifyContent: 'flex-end' }}>
                    <button type="button" className="admin-btn-table" onClick={onClose} disabled={busy}>
                        Annuler
                    </button>
                    <button
                        type="button"
                        className="admin-btn-action-main"
                        style={{ height: 38, padding: '0 16px', font: '700 14px var(--texte)' }}
                        onClick={handleAdd}
                        disabled={busy}
                    >
                        {busy ? 'Ajout…' : "Créer l'enseignant"}
                    </button>
                </div>
            </div>
        </ModalFrame>
    );
}

/* Formatage du journal d'audit */
function formaterDateJournal(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const jour = String(d.getDate()).padStart(2, '0');
    const mois = String(d.getMonth() + 1).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${jour}/${mois} ${h}:${m}`;
}

function formaterActionJournal(action) {
    switch (action) {
        case 'modification_eleve': return 'Fiche élève modifiée';
        case 'import_eleves': return 'Import de classe';
        case 'plafond_classe': return 'Plafond relevé';
        case 'desactivation': return 'Désactivation';
        case 'reactivation': return 'Réactivation';
        case 'creation_prof': return 'Enseignant ajouté';
        case 'modification_prof': return 'Enseignant modifié';
        case 'desactivation_prof': return 'Enseignant désactivé';
        case 'reactivation_prof': return 'Enseignant réactivé';
        case 'reparer_rattachements': return 'Rattachement des comptes';
        case 'ajout_eleve': return 'Élève ajouté';
        default: return action || "Action d'administration";
    }
}

function formaterDetailJournal(entry) {
    const { action, cible, detail } = entry;
    if (!detail && !cible) return '—';
    if (action === 'modification_eleve') {
        const avant = detail?.avant;
        const apres = detail?.apres;
        if (avant && apres) {
            const changs = [];
            if (avant.prenom !== apres.prenom || avant.nom !== apres.nom) {
                changs.push(`${avant.prenom} ${avant.nom} → ${apres.prenom} ${apres.nom}`);
            }
            if (avant.classe !== apres.classe) {
                changs.push(`classe ${avant.classe} → ${apres.classe}`);
            }
            if (avant.email !== apres.email) {
                changs.push(`e-mail ${avant.email} → ${apres.email}`);
            }
            return changs.length > 0 ? changs.join(' · ') : `${apres.prenom} ${apres.nom} (${apres.classe})`;
        }
        if (avant) {
            return `${avant.prenom || ''} ${avant.nom || ''} · ${avant.classe || ''} → ${cible || ''}`;
        }
        return cible || '—';
    }
    if (action === 'import_eleves') {
        const c = detail?.classe || cible || '';
        const crees = detail?.crees ?? 0;
        const ignores = detail?.lignes_ignorees?.length ?? 0;
        return `${c ? `${c} · ` : ''}${crees} créé${crees > 1 ? 's' : ''}${ignores > 0 ? `, ${ignores} ignoré${ignores > 1 ? 's' : ''}` : ''}`;
    }
    if (action === 'plafond_classe') {
        return `${cible || ''} · table ${detail?.plafond || ''}`;
    }
    if (action === 'desactivation') {
        return `${cible || ''}${detail?.motif ? ` · ${detail.motif}` : ''}`;
    }
    if (action === 'creation_prof' || action === 'modification_prof') {
        return `${cible || ''}${detail?.role ? ` · rôle ${detail.role}` : ''}`;
    }
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') {
        if (Object.keys(detail).length === 0) return cible || '—';
        return JSON.stringify(detail);
    }
    return cible || '—';
}
