import React, { useState, useEffect } from 'react';
import { rejoindreDefi } from '../api';
import { lireDefiEnCours, sauvegarderDefiEnCours, effacerDefiEnCours } from '../logic/defiStorage';
import { IconSprint, IconSansFaute, IconChrono, IconMontee, IconApprendre, IconClassements, IconMaGrille, IconDefisPasses, IconAdmin, IconProf, IconLibre } from '../components/Icons';

/**
 * Home — Écran d'accueil
 *
 * Reçoit `identite` (réponse brute de quiSuisJe), pas un objet aplati.
 * Deux rendus :
 *   - élève : les 5 destinations + accès rapides + bandeau reprise défi
 *   - prof  : placeholder « en construction » + boutons utiles
 *
 * Le bouton Administration n'apparaît QUE si estAdmin === true.
 */
export default function Home({ onGo, identite, estProf, estAdmin, onLogout, onReprendreDefi }) {
    const profil = identite?.profil;
    const idUtilisateur = profil?.id;

    const [defiEnCours, setDefiEnCours] = useState(() => {
        return (!estProf && idUtilisateur) ? lireDefiEnCours(idUtilisateur) : null;
    });
    const [loadingReprise, setLoadingReprise] = useState(false);
    const [erreurReprise, setErreurReprise] = useState(null);

    useEffect(() => {
        if (!estProf && idUtilisateur) {
            setDefiEnCours(lireDefiEnCours(idUtilisateur));
        } else {
            setDefiEnCours(null);
        }
        setErreurReprise(null);
    }, [idUtilisateur, estProf]);

    const handleReprendre = async () => {
        if (!defiEnCours?.code) return;
        setLoadingReprise(true);
        setErreurReprise(null);
        const res = await rejoindreDefi(defiEnCours.code);
        setLoadingReprise(false);

        if (res.ok) {
            // Mettre à jour avec les informations fraîches du serveur
            sauvegarderDefiEnCours(idUtilisateur, {
                code: defiEnCours.code,
                defi_id: res.data.defi_id,
                type: res.data.type,
                classe: res.data.classe,
                auteur_nom: res.data.auteur_nom,
                rejoint_le: Date.now(),
            });
            onReprendreDefi?.(res.data);
        } else {
            // Échec (expiré, fermé, déjà joué...) : effacer l'entrée et afficher le message tel quel
            effacerDefiEnCours(idUtilisateur);
            setDefiEnCours(null);
            setErreurReprise(res.message || res.error || 'Ce défi n\'est plus disponible.');
        }
    };

    const isStudentPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === 'eleve';

    // ==================== ACCUEIL PROFESSEUR ====================
    if (estProf && !isStudentPreview) {
        return (
            <div className="screen-enter">
                {/* Bienvenue prof */}
                <div className="card" style={{
                    marginBottom: 14, display: 'flex',
                    alignItems: 'center', gap: 14, padding: '16px 20px',
                }}>
                    <IconProf size={40} color="var(--indigo)" actionColor="var(--ciel)" />
                    <div>
                        <p className="font-display" style={{
                            fontWeight: 800, fontSize: 18, lineHeight: 1.2,
                        }}>
                            Bonjour {profil?.nom || 'Professeur'}
                        </p>
                        <p style={{
                            fontSize: 13, color: 'var(--text-soft)', fontWeight: 700,
                        }}>
                            {estAdmin ? 'Administrateur' : 'Enseignant'}
                        </p>
                    </div>
                </div>

                {/* Cartes de mode */}
                <button className="mode-card mode-card--challenge" onClick={() => onGo('challenges')}>
                    <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                        <IconSprint size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                    </span>
                    <span>
                        <div className="mode-card__title">Lancer un défi</div>
                        <div className="mode-card__desc">Sprint ou Contre-la-montre pour vos classes</div>
                    </span>
                </button>

                <button
                    className="btn btn--ghost"
                    style={{ fontSize: 13, padding: '8px 16px', marginTop: -4, marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => onGo('mes-defis')}
                >
                    <IconDefisPasses size={18} color="var(--indigo)" actionColor="var(--ciel)" /> Mes défis passés
                </button>

                <button className="mode-card mode-card--practice" onClick={() => onGo('play')}>
                    <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                        <IconLibre size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                    </span>
                    <span>
                        <div className="mode-card__title">S'entraîner</div>
                        <div className="mode-card__desc">Jouez vous aussi — Salle des profs</div>
                    </span>
                </button>

                <button className="mode-card" onClick={() => onGo('classe')} style={{
                    background: 'var(--indigo)',
                }}>
                    <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                        <IconMaGrille size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                    </span>
                    <span>
                        <div className="mode-card__title">Ma classe</div>
                        <div className="mode-card__desc" style={{ color: 'rgba(255,255,255,0.75)' }}>Maîtrise agrégée — qui bloque, sur quoi</div>
                    </span>
                </button>

                <button className="mode-card mode-card--learn" onClick={() => onGo('leaderboards')}>
                    <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                        <IconClassements size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                    </span>
                    <span>
                        <div className="mode-card__title">Classements</div>
                        <div className="mode-card__desc">Progression, records, classes et Salle des profs</div>
                    </span>
                </button>

                {/* Accès rapides */}
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                    <button
                        className="btn btn--ghost"
                        style={{ flex: 1, fontSize: 15, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                        onClick={() => onGo('profile')}
                    >
                        <IconMaGrille size={18} color="var(--indigo)" actionColor="var(--ciel)" /> Profil
                    </button>
                    {estAdmin && (
                        <button
                            className="btn btn--ghost"
                            style={{ flex: 1, fontSize: 15, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                            onClick={() => onGo('admin')}
                        >
                            <IconAdmin size={18} color="var(--indigo)" actionColor="var(--ciel)" /> Administration
                        </button>
                    )}
                </div>

                <button
                    className="btn btn--ghost"
                    style={{
                        width: '100%', fontSize: 13, padding: '10px 16px',
                        color: 'var(--gris)', marginTop: 8,
                    }}
                    onClick={onLogout}
                >
                    Se déconnecter
                </button>
            </div>
        );
    }

    // ==================== ACCUEIL ÉLÈVE (Maquette 2) ====================
    const [pointsTotal, setPointsTotal] = useState(0);
    const [joinCode, setJoinCode] = useState('');
    const [joinLoading, setJoinLoading] = useState(false);
    const [joinError, setJoinError] = useState(null);

    useEffect(() => {
        if (!estProf && idUtilisateur) {
            import('../api').then(({ monProfil }) => {
                monProfil().then(res => {
                    if (res.ok && res.data?.records) {
                        setPointsTotal(res.data.records.points_total || res.data.progression?.total || 0);
                    }
                }).catch(() => {});
            });
        }
    }, [estProf, idUtilisateur]);

    const handleJoinDirect = async () => {
        if (joinCode.length < 5) return;
        setJoinLoading(true);
        setJoinError(null);
        const res = await rejoindreDefi(joinCode);
        setJoinLoading(false);

        if (res.ok) {
            sauvegarderDefiEnCours(idUtilisateur, {
                code: joinCode,
                defi_id: res.data.defi_id,
                type: res.data.type,
                classe: res.data.classe,
                auteur_nom: res.data.auteur_nom,
                rejoint_le: Date.now(),
            });
            onReprendreDefi?.(res.data);
        } else {
            setJoinError(res.message || res.error || 'Code invalide ou défi expiré.');
        }
    };

    const studentProfil = profil?.prenom ? profil : (isStudentPreview ? { prenom: 'Lou', classe: '6ᵉA', avatar_emoji: '🦊', plafond_tables: 10 } : profil);
    const studentPoints = pointsTotal || (isStudentPreview ? 1240 : 0);
    const plafond = studentProfil?.plafond_tables || 10;
    const palierLabel = plafond <= 5 ? 'Découverte' : plafond <= 10 ? 'Confirmé' : 'Expert';

    const typeLabels = {
        sprint: 'Sprint',
        flawless: 'Sans faute',
        countdown: 'Contre-la-montre',
        climb: 'Montée des tables',
    };

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Header élève */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <div style={{
                        width: 78, height: 78, borderRadius: 24,
                        background: 'var(--ciel-pale)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 44,
                    }}>
                        {studentProfil?.avatar_emoji || '🦊'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div className="font-display" style={{ fontSize: 34, fontWeight: 700, color: 'var(--indigo)' }}>
                            {studentProfil?.prenom || studentProfil?.nom || 'Élève'}
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 19, fontWeight: 600, color: 'var(--gris)' }}>
                            {studentProfil?.classe ? `${studentProfil.classe} · ` : ''}{palierLabel}
                        </div>
                    </div>
                </div>

                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--surface)', borderRadius: 999,
                    padding: '12px 22px', boxShadow: '0 6px 16px rgba(32,34,107,.08)',
                }}>
                    <span className="font-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--indigo)' }}>
                        {studentPoints.toLocaleString('fr-FR')}
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 600, color: 'var(--gris)' }}>
                        pts
                    </span>
                </div>
            </div>

            {/* Erreur serveur si reprise impossible */}
            {erreurReprise && (
                <div style={{
                    padding: '12px 18px',
                    background: 'var(--ciel-pale)',
                    border: '1.5px solid var(--action)',
                    borderRadius: 18, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    gap: 12,
                }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--indigo)', margin: 0 }}>
                        {erreurReprise}
                    </p>
                    <button
                        className="btn btn--ghost"
                        style={{ fontSize: 13, padding: '4px 8px', color: 'var(--gris)', border: 'none' }}
                        onClick={() => setErreurReprise(null)}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* 2. Bandeau discret de reprise de défi */}
            {!erreurReprise && defiEnCours && (
                <div style={{
                    background: 'var(--indigo)', borderRadius: 26,
                    padding: '22px 26px', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    gap: 18,
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div className="font-display" style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>
                            Défi {defiEnCours.code} en cours
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 600, color: '#B9C6DD' }}>
                            {typeLabels[defiEnCours.type] || 'Défi'} · {defiEnCours.classe || profil?.classe || 'Classe'} · le défi reprend à la première question
                        </div>
                    </div>
                    <button
                        style={{
                            background: 'var(--action)', color: '#fff',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 21,
                            padding: '16px 26px', borderRadius: 999, border: 'none',
                            cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                        disabled={loadingReprise}
                        onClick={handleReprendre}
                    >
                        {loadingReprise ? '…' : 'Reprendre'}
                    </button>
                </div>
            )}

            {/* Entrée Mode Libre — S'entraîner */}
            <button
                onClick={() => onGo('play')}
                style={{
                    background: 'var(--surface)', borderRadius: 26, padding: '20px 24px',
                    boxShadow: '0 8px 20px rgba(32,34,107,.10)', border: 'none',
                    display: 'flex', alignItems: 'center', gap: 18, textAlign: 'left',
                    cursor: 'pointer', width: '100%',
                }}
            >
                <div style={{
                    width: 58, height: 58, borderRadius: 18,
                    background: 'var(--ciel-pale)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    <IconLibre size={34} color="var(--indigo)" actionColor="var(--action)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="font-display" style={{ fontSize: 24, fontWeight: 700, color: 'var(--indigo)' }}>
                        S'entraîner
                    </div>
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 16, color: 'var(--gris)', fontWeight: 600, marginTop: 2 }}>
                        Sans chrono, pas de score · pour s'exercer librement
                    </div>
                </div>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M9 6l6 6-6 6" stroke="var(--action)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {/* 3. Section Jouer (Grille 2x2 des 4 modes) */}
            <div style={{ padding: '4px 0 0' }}>
                <div style={{
                    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                    color: 'var(--gris)', letterSpacing: '0.14em',
                    textTransform: 'uppercase', marginBottom: 14,
                }}>
                    Jouer
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                    {/* Sprint */}
                    <button
                        onClick={() => onGo('play', { mode: 'sprint', length: 20, timer: 3 })}
                        style={{
                            background: 'var(--surface)', borderRadius: 26, padding: 26,
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)', border: 'none',
                            display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <IconSprint size={40} color="var(--indigo)" actionColor="var(--action)" />
                            <span className="font-display" style={{ fontSize: 27, fontWeight: 700, color: 'var(--indigo)' }}>
                                Sprint
                            </span>
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 17, lineHeight: 1.4, color: 'var(--gris)', fontWeight: 600 }}>
                            20 questions, 3 s chacune
                        </div>
                    </button>

                    {/* Sans faute */}
                    <button
                        onClick={() => onGo('play', { mode: 'flawless', length: 20, timer: 0 })}
                        style={{
                            background: 'var(--surface)', borderRadius: 26, padding: 26,
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)', border: 'none',
                            display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <IconSansFaute size={40} color="var(--indigo)" actionColor="var(--action)" />
                            <span className="font-display" style={{ fontSize: 27, fontWeight: 700, color: 'var(--indigo)' }}>
                                Sans faute
                            </span>
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 17, lineHeight: 1.4, color: 'var(--gris)', fontWeight: 600 }}>
                            Zéro erreur, pas de chrono
                        </div>
                    </button>

                    {/* Contre-la-montre */}
                    <button
                        onClick={() => onGo('play', { mode: 'countdown', length: 0, timer: 120 })}
                        style={{
                            background: 'var(--surface)', borderRadius: 26, padding: 26,
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)', border: 'none',
                            display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <IconChrono size={40} color="var(--indigo)" actionColor="var(--action)" />
                            <span className="font-display" style={{ fontSize: 27, fontWeight: 700, color: 'var(--indigo)' }}>
                                Contre-la-montre
                            </span>
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 17, lineHeight: 1.4, color: 'var(--gris)', fontWeight: 600 }}>
                            2 min, un max de bonnes
                        </div>
                    </button>

                    {/* Montée */}
                    <button
                        onClick={() => onGo('challenges', { mode: 'climb' })}
                        style={{
                            background: 'var(--surface)', borderRadius: 26, padding: 26,
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)', border: 'none',
                            display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <IconMontee size={40} color="var(--indigo)" actionColor="var(--action)" />
                            <span className="font-display" style={{ fontSize: 27, fontWeight: 700, color: 'var(--indigo)' }}>
                                Montée
                            </span>
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 17, lineHeight: 1.4, color: 'var(--gris)', fontWeight: 600 }}>
                            Palier {plafond} · débloque la {plafond + 1}
                        </div>
                    </button>
                </div>
            </div>

            {/* 4. Section Défi de classe */}
            <div>
                <div style={{
                    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                    color: 'var(--gris)', letterSpacing: '0.14em',
                    textTransform: 'uppercase', marginBottom: 14,
                }}>
                    Défi de classe
                </div>
                <div style={{
                    background: 'var(--surface)', borderRadius: 26,
                    padding: '22px 24px', boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                    display: 'flex', alignItems: 'center', gap: 16,
                }}>
                    <input
                        type="text"
                        value={joinCode}
                        onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-HJ-KM-NP-Z2-9]/g, '').slice(0, 5))}
                        placeholder="CODE"
                        style={{
                            flex: 1, height: 86, borderRadius: 20,
                            border: '3px dashed var(--bordure)',
                            fontFamily: 'var(--texte)', fontWeight: 700,
                            fontSize: 30, color: '#B9B0A0',
                            letterSpacing: '0.34em', textAlign: 'center',
                            outline: 'none', background: 'var(--surface)',
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') handleJoinDirect(); }}
                    />
                    <button
                        style={{
                            height: 86, padding: '0 34px', borderRadius: 20,
                            background: 'var(--action)', color: '#fff',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 25,
                            border: 'none', cursor: 'pointer',
                            opacity: joinCode.length < 5 || joinLoading ? 0.6 : 1,
                        }}
                        disabled={joinCode.length < 5 || joinLoading}
                        onClick={handleJoinDirect}
                    >
                        {joinLoading ? '…' : 'Rejoindre'}
                    </button>
                </div>
                {joinError && (
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--rouge)', marginTop: 8, textAlign: 'center' }}>
                        {joinError}
                    </p>
                )}
            </div>

            {/* 5. Accès rapides / boutons du bas */}
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                <button
                    style={{
                        flex: 1, height: 104, background: 'var(--surface)',
                        borderRadius: 24, boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                        border: 'none',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 4,
                        cursor: 'pointer',
                    }}
                    onClick={() => onGo('learn')}
                >
                    <IconApprendre size={32} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19, color: 'var(--indigo)' }}>
                        Apprendre
                    </span>
                </button>
                <button
                    style={{
                        flex: 1, height: 104, background: 'var(--surface)',
                        borderRadius: 24, boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                        border: 'none',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 4,
                        cursor: 'pointer',
                    }}
                    onClick={() => onGo('leaderboards')}
                >
                    <IconClassements size={32} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19, color: 'var(--indigo)' }}>
                        Classements
                    </span>
                </button>
                <button
                    style={{
                        flex: 1, height: 104, background: 'var(--surface)',
                        borderRadius: 24, boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                        border: 'none',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 4,
                        cursor: 'pointer',
                    }}
                    onClick={() => onGo('profile')}
                >
                    <IconMaGrille size={32} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19, color: 'var(--indigo)' }}>
                        Ma grille
                    </span>
                </button>
            </div>
        </div>
    );
}
