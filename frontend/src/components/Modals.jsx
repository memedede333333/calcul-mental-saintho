import React, { useEffect } from 'react';

/**
 * ModalFrame — Composant commun pour les modales (Écran 36)
 * - Voile indigo à 55 %
 * - Fermeture au clic sur le voile
 * - Fermeture par la touche Échap
 * - Cadre blanc arrondi 28px avec ombre douce
 */
export function ModalFrame({ children, onClose, maxWidth = 700 }) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose?.();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(32, 34, 107, 0.55)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                boxSizing: 'border-box',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: `${maxWidth}px`,
                    background: 'var(--surface)',
                    borderRadius: '28px',
                    boxShadow: '0 24px 60px rgba(32, 34, 107, 0.22)',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    maxHeight: '92vh',
                    display: 'flex',
                    flexDirection: 'column',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}

/**
 * Modale a : Choisir mon avatar (Écran 36a)
 * Élève (8 emojis fermés) et Enseignant (8 emojis ou initiales)
 */
export const AVATAR_OPTIONS = ['🦊', '🦁', '🐼', '🐨', '🐢', '🐙', '🦉', '🐝'];

export function ModalAvatar({
    initialAvatar,
    onClose,
    onSave,
    estProf = false,
    initiales = '',
}) {
    const [selected, setSelected] = React.useState(initialAvatar || (estProf ? null : AVATAR_OPTIONS[0]));

    return (
        <ModalFrame onClose={onClose} maxWidth={700}>
            <div style={{ padding: '30px 30px 26px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <h3 style={{ margin: 0, font: '700 30px var(--titre)', color: 'var(--indigo)' }}>
                        Choisir mon avatar
                    </h3>
                    <p style={{ margin: 0, font: '600 16px var(--texte)', color: 'var(--gris)' }}>
                        {estProf
                            ? 'Choisissez un avatar emoji ou vos initiales pour la salle des profs.'
                            : "C'est le seul réglage qui t'appartient."}
                    </p>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: estProf ? 'repeat(auto-fit, minmax(68px, 1fr))' : 'repeat(4, 1fr)',
                        gap: '14px',
                    }}
                >
                    {estProf && (
                        <button
                            type="button"
                            onClick={() => setSelected(null)}
                            style={{
                                aspectRatio: '1',
                                borderRadius: '22px',
                                background: selected === null ? 'var(--ciel-pale)' : '#F3F4F8',
                                boxShadow: selected === null ? '0 0 0 4px var(--ciel)' : 'none',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                padding: '4px',
                            }}
                            title="Conserver mes initiales"
                        >
                            <span
                                style={{
                                    font: '700 24px var(--titre)',
                                    color: 'var(--indigo)',
                                    letterSpacing: '1px',
                                }}
                            >
                                {initiales || 'Init.'}
                            </span>
                            <span style={{ font: '600 11px var(--texte)', color: 'var(--gris)', marginTop: 2 }}>
                                Initiales
                            </span>
                        </button>
                    )}

                    {AVATAR_OPTIONS.map((emoji) => {
                        const isSelected = selected === emoji;
                        return (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => setSelected(emoji)}
                                style={{
                                    aspectRatio: '1',
                                    borderRadius: '22px',
                                    background: isSelected ? 'var(--ciel-pale)' : '#F3F4F8',
                                    boxShadow: isSelected ? '0 0 0 4px var(--ciel)' : 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '52px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                {emoji}
                            </button>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            flex: 1,
                            height: '76px',
                            borderRadius: '20px',
                            background: '#F3F4F8',
                            border: 'none',
                            font: '700 19px var(--texte)',
                            color: 'var(--gris)',
                            cursor: 'pointer',
                        }}
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onSave(selected);
                            onClose();
                        }}
                        style={{
                            flex: 2,
                            height: '76px',
                            borderRadius: '20px',
                            background: 'var(--ciel)',
                            border: 'none',
                            font: '700 21px var(--texte)',
                            color: '#FFFFFF',
                            cursor: 'pointer',
                            boxShadow: '0 8px 20px rgba(35, 164, 217, 0.28)',
                        }}
                    >
                        Enregistrer mon avatar
                    </button>
                </div>
            </div>
        </ModalFrame>
    );
}

/**
 * Modale b : Changer la classe d'un élève (Écran 36b)
 */
export function ModalChangerClasse({
    eleve,
    classes = [],
    onClose,
    onConfirm,
    busy = false,
}) {
    const [nouvelleClasse, setNouvelleClasse] = React.useState(eleve?.classe || '');

    if (!eleve) return null;

    return (
        <ModalFrame onClose={onClose} maxWidth={700}>
            <div style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <h3 style={{ margin: 0, font: '700 27px var(--titre)', color: 'var(--indigo)' }}>
                        Changer la classe d'{eleve.prenom} {eleve.nom ? eleve.nom.charAt(0) + '.' : ''}
                    </h3>
                    <div style={{ font: '600 16px var(--texte)', color: 'var(--gris)' }}>
                        Classe actuelle : <b>{eleve.classe}</b>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    <div style={{ font: '700 13px var(--texte)', color: 'var(--gris)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                        Nouvelle classe
                    </div>
                    <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
                        {classes.map((c) => {
                            const val = typeof c === 'string' ? c : (c.classe || c.nom);
                            const isSelected = nouvelleClasse === val;
                            return (
                                <button
                                    key={val}
                                    type="button"
                                    onClick={() => setNouvelleClasse(val)}
                                    style={{
                                        padding: '13px 20px',
                                        borderRadius: '14px',
                                        background: isSelected ? 'var(--indigo)' : '#F3F4F8',
                                        color: isSelected ? '#FFFFFF' : 'var(--gris)',
                                        font: '700 18px var(--texte)',
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    {val}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div
                    style={{
                        background: '#F3F4F8',
                        borderRadius: '14px',
                        padding: '16px 18px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                    }}
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ flex: 'none', marginTop: '1px' }}>
                        <circle cx="12" cy="12" r="9" stroke="var(--gris)" strokeWidth="2.2" />
                        <path d="M12 7.6v.2M12 11v5.4" stroke="var(--gris)" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                    <div style={{ font: '600 15px/1.45 var(--texte)', color: 'var(--gris)' }}>
                        Cette modification sera enregistrée au journal d'audit avec votre nom et l'heure.
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        style={{
                            flex: 1,
                            height: '64px',
                            borderRadius: '16px',
                            background: '#F3F4F8',
                            border: 'none',
                            font: '700 17px var(--texte)',
                            color: 'var(--gris)',
                            cursor: 'pointer',
                        }}
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm(eleve.eleve_id, nouvelleClasse)}
                        disabled={busy || !nouvelleClasse || nouvelleClasse === eleve.classe}
                        style={{
                            flex: 2,
                            height: '64px',
                            borderRadius: '16px',
                            background: 'var(--ciel)',
                            border: 'none',
                            font: '700 18px var(--texte)',
                            color: '#FFFFFF',
                            cursor: busy || nouvelleClasse === eleve.classe ? 'not-allowed' : 'pointer',
                            opacity: nouvelleClasse === eleve.classe ? 0.6 : 1,
                        }}
                    >
                        {busy ? 'Validation…' : 'Valider le changement'}
                    </button>
                </div>
            </div>
        </ModalFrame>
    );
}

/**
 * Modale c : Désactiver l'accès d'un élève (Écran 36c)
 */
export function ModalDesactiverEleve({
    eleve,
    onClose,
    onConfirm,
    busy = false,
}) {
    const [motif, setMotif] = React.useState('');

    if (!eleve) return null;

    return (
        <ModalFrame onClose={onClose} maxWidth={700}>
            <div style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    <div
                        style={{
                            width: '52px',
                            height: '52px',
                            borderRadius: '16px',
                            background: 'var(--rouge-pale)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: 'none',
                        }}
                    >
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                            <path d="M12 4 2.5 20.5h19z" stroke="var(--rouge)" strokeWidth="2.4" strokeLinejoin="round" />
                            <path d="M12 10v4.4M12 17.4v.2" stroke="var(--rouge)" strokeWidth="2.6" strokeLinecap="round" />
                        </svg>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <h3 style={{ margin: 0, font: '700 27px var(--titre)', color: 'var(--indigo)' }}>
                            Désactiver l'accès d'{eleve.prenom} {eleve.nom ? eleve.nom.charAt(0) + '.' : ''} ?
                        </h3>
                        <div style={{ font: '600 16px var(--texte)', color: 'var(--gris)' }}>
                            {eleve.classe} · dernière connexion {eleve.derniere_connexion || 'jamais'}
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        background: 'var(--rouge-pale)',
                        borderRadius: '16px',
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '9px',
                    }}
                >
                    <div style={{ font: '700 17px var(--texte)', color: '#8E1616' }}>
                        Ses résultats sont conservés
                    </div>
                    <div style={{ font: '600 15px/1.5 var(--texte)', color: '#7A4A4A' }}>
                        Sa grille, ses points et ses records restent en base et réapparaîtront si vous la réactivez.
                        Seule la connexion est bloquée. Rien n'est supprimé.
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', font: '700 13px var(--texte)', color: 'var(--gris)', marginBottom: 6 }}>
                        Motif (optionnel) :
                    </label>
                    <input
                        type="text"
                        placeholder="ex. Changement d'établissement"
                        value={motif}
                        onChange={(e) => setMotif(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '12px',
                            border: '1px solid var(--bordure)',
                            font: '600 15px var(--texte)',
                            color: 'var(--indigo)',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        style={{
                            flex: 1,
                            height: '64px',
                            borderRadius: '16px',
                            background: '#F3F4F8',
                            border: 'none',
                            font: '700 17px var(--texte)',
                            color: 'var(--gris)',
                            cursor: 'pointer',
                        }}
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm(eleve.eleve_id, motif.trim() || null)}
                        disabled={busy}
                        style={{
                            flex: 2,
                            height: '64px',
                            borderRadius: '16px',
                            background: 'var(--rouge)',
                            border: 'none',
                            font: '700 18px var(--texte)',
                            color: '#FFFFFF',
                            cursor: busy ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {busy ? 'Désactivation…' : "Désactiver l'accès"}
                    </button>
                </div>
            </div>
        </ModalFrame>
    );
}

/**
 * Modale d : Aperçu de l'import CSV (Écran 36d)
 */
export function ModalApercuImport({
    apercu,
    nomFichier = 'import.csv',
    parsedRows = [],
    onClose,
    onConfirm,
    busy = false,
}) {
    if (!apercu) return null;

    const creations = Number(apercu.creations || 0);
    const misesAJour = Number(apercu.mises_a_jour || 0);
    const ignorees = Number(apercu.ignorees || 0);
    const dontReactivations = Number(apercu.dont_reactivations || 0);
    const absents = apercu.actifs_absents_du_fichier?.length || 0;
    const totalAImporter = creations + misesAJour;

    // Indexer les lignes rejetées pour un affichage précis
    const ignoreesMap = new Map();
    if (Array.isArray(apercu.lignes_ignorees)) {
        for (const item of apercu.lignes_ignorees) {
            const cle = item.ligne || item.index;
            ignoreesMap.set(cle, item);
        }
    }

    // Télécharger le rapport des lignes ignorées
    const telechargerIgnorees = () => {
        if (!apercu.lignes_ignorees?.length) return;
        const csvContent = [
            'Ligne,Email,Nom,Prenom,Classe,Raison',
            ...apercu.lignes_ignorees.map(
                (i) => `${i.ligne || ''},"${i.email || ''}","${i.nom || ''}","${i.prenom || ''}","${i.classe || ''}","${i.raison || ''}"`
            ),
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `lignes_ignorees_${nomFichier}`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <ModalFrame onClose={onClose} maxWidth={880}>
            <div style={{ padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <h3 style={{ margin: 0, font: '700 26px var(--titre)', color: 'var(--indigo)' }}>
                            Aperçu de l'import — {nomFichier}
                        </h3>
                        <div style={{ font: '600 15px var(--texte)', color: 'var(--gris)' }}>
                            {nomFichier} · {apercu.lignes_lues} lignes lues · <b>rien n'est encore écrit</b>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            marginLeft: 'auto',
                            background: 'none',
                            border: 'none',
                            font: '600 15px var(--texte)',
                            color: 'var(--gris)',
                            cursor: 'pointer',
                        }}
                    >
                        Fermer
                    </button>
                </div>

                {/* 4 cartes métriques */}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <div
                        style={{
                            flex: 1,
                            border: '1px solid var(--bordure)',
                            borderRadius: '14px',
                            padding: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1px',
                        }}
                    >
                        <span style={{ font: '700 27px var(--titre)', color: 'var(--vert)' }}>{creations}</span>
                        <span style={{ font: '600 13px var(--texte)', color: 'var(--gris)' }}>créations</span>
                    </div>

                    <div
                        style={{
                            flex: 1,
                            border: '1px solid var(--bordure)',
                            borderRadius: '14px',
                            padding: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1px',
                        }}
                    >
                        <span style={{ font: '700 27px var(--titre)', color: 'var(--indigo)' }}>{misesAJour}</span>
                        <span style={{ font: '600 13px var(--texte)', color: 'var(--gris)' }}>
                            mises à jour {dontReactivations > 0 ? `(dont ${dontReactivations} réactivations)` : ''}
                        </span>
                    </div>

                    <div
                        style={{
                            flex: 1,
                            border: '1px solid var(--bordure)',
                            borderRadius: '14px',
                            padding: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1px',
                        }}
                    >
                        <span style={{ font: '700 27px var(--titre)', color: 'var(--rouge)' }}>{ignorees}</span>
                        <span style={{ font: '600 13px var(--texte)', color: 'var(--gris)' }}>ignorées</span>
                    </div>

                    <div
                        style={{
                            flex: 1,
                            border: '1px solid var(--bordure)',
                            borderRadius: '14px',
                            padding: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1px',
                        }}
                    >
                        <span style={{ font: '700 27px var(--titre)', color: 'var(--orange)' }}>{absents}</span>
                        <span style={{ font: '600 13px var(--texte)', color: 'var(--gris)' }}>absents du fichier</span>
                    </div>
                </div>

                {/* Tableau de prévisualisation */}
                <div
                    style={{
                        border: '1px solid var(--bordure)',
                        borderRadius: '14px',
                        overflow: 'hidden',
                        maxHeight: '340px',
                        overflowY: 'auto',
                    }}
                >
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '52px 1fr 210px 76px 160px',
                            boxSizing: 'border-box',
                            padding: '10px 16px',
                            background: '#F3F4F8',
                            borderBottom: '1px solid var(--bordure)',
                            font: '700 11.5px var(--texte)',
                            color: 'var(--gris)',
                            letterSpacing: '.08em',
                            textTransform: 'uppercase',
                            position: 'sticky',
                            top: 0,
                            zIndex: 2,
                        }}
                    >
                        <span>Ligne</span>
                        <span>Nom</span>
                        <span>E‑mail</span>
                        <span>Classe</span>
                        <span>Statut</span>
                    </div>

                    {parsedRows.slice(0, 100).map((row, idx) => {
                        const ligneNum = row.ligne || idx + 1;
                        const rejet = ignoreesMap.get(ligneNum);
                        const isRejet = Boolean(rejet);
                        const statutText = isRejet
                            ? rejet.raison
                            : (row.isReactivation ? 'Réactivation' : (row.isUpdate ? 'Mise à jour' : 'Prêt'));

                        return (
                            <div
                                key={ligneNum}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '52px 1fr 210px 76px 160px',
                                    boxSizing: 'border-box',
                                    padding: '11px 16px',
                                    alignItems: 'center',
                                    borderBottom: '1px solid #F3F4F8',
                                    background: isRejet ? '#FDF6F6' : '#FFFFFF',
                                }}
                            >
                                <span style={{ font: '600 14px var(--texte)', color: 'var(--gris)' }}>{ligneNum}</span>
                                <span style={{ font: '700 14px var(--texte)', color: 'var(--indigo)' }}>
                                    {row.nom ? `${row.nom} ${row.prenom || ''}` : '—'}
                                </span>
                                <span
                                    style={{
                                        font: '600 14px var(--texte)',
                                        color: isRejet && rejet.raison?.includes('mail') ? 'var(--rouge)' : 'var(--gris)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {row.email || '—'}
                                </span>
                                <span
                                    style={{
                                        font: '600 14px var(--texte)',
                                        color: isRejet && rejet.raison?.includes('classe') ? 'var(--rouge)' : 'var(--gris)',
                                    }}
                                >
                                    {row.classe || '—'}
                                </span>
                                <span
                                    style={{
                                        font: '700 13px var(--texte)',
                                        color: isRejet
                                            ? 'var(--rouge)'
                                            : statutText === 'Prêt'
                                              ? 'var(--vert)'
                                              : 'var(--indigo)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {statutText}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Barre de bas d'écran */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ font: '600 13.5px var(--texte)', color: 'var(--gris)' }}>
                        {parsedRows.length} lignes sur {apercu.lignes_lues}
                        {ignorees > 0 && (
                            <>
                                {' · '}
                                <button
                                    type="button"
                                    onClick={telechargerIgnorees}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        font: '600 13.5px var(--texte)',
                                        color: 'var(--ciel)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    télécharger les {ignorees} lignes ignorées ›
                                </button>
                            </>
                        )}
                    </div>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            style={{
                                height: '52px',
                                padding: '0 24px',
                                borderRadius: '14px',
                                background: '#F3F4F8',
                                border: 'none',
                                font: '700 16px var(--texte)',
                                color: 'var(--gris)',
                                cursor: 'pointer',
                            }}
                        >
                            Annuler
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            disabled={busy || totalAImporter === 0}
                            style={{
                                height: '52px',
                                padding: '0 26px',
                                borderRadius: '14px',
                                background: 'var(--ciel)',
                                border: 'none',
                                font: '700 16px var(--texte)',
                                color: '#FFFFFF',
                                cursor: busy || totalAImporter === 0 ? 'not-allowed' : 'pointer',
                                boxShadow: '0 4px 12px rgba(35, 164, 217, 0.25)',
                            }}
                        >
                            {busy ? 'Importation…' : `Confirmer l'importation de ${totalAImporter} lignes`}
                        </button>
                    </div>
                </div>

                <div style={{ font: '600 13px/1.5 var(--texte)', color: 'var(--gris)' }}>
                    L'import s'exécute d'un bloc : s'il échoue, aucune ligne n'est créée.
                    Les {absents} élèves absents du fichier ne seront pas désactivés.
                </div>
            </div>
        </ModalFrame>
    );
}
