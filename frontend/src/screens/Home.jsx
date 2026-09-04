import React, { useState, useEffect, useCallback } from 'react';
import {
    rejoindreDefi, monProfil, mesTablesFaibles, changerAvatar,
    partiesEnAttente, surFileChangee,
} from '../api';
import { lireDefiEnCours, sauvegarderDefiEnCours, effacerDefiEnCours } from '../logic/defiStorage';
import { cleFait, masteryColor } from '../logic/mastery';
import MasteryGrid from '../components/MasteryGrid';
import {
    IconSprint, IconSansFaute, IconChrono, IconMontee,
    IconApprendre, IconClassements, IconMaGrille,
    IconDefisPasses, IconAdmin, IconProf, IconLibre
} from '../components/Icons';

const AVATAR_OPTIONS = ['🦊', '🦁', '🐼', '🐨', '🐢', '🐙', '🦉', '🐝'];

function getMockMaitrise(plafond) {
    const m = {};
    if (plafond <= 10) {
        // 19 clés vertes -> exactement 34 cases affichées (4 diagonales + 15 paires symétriques)
        const vertes = [
            [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 10],
            [2, 2], [2, 3], [2, 4], [2, 5], [2, 10],
            [3, 5], [3, 10],
            [4, 5], [4, 10],
            [5, 5], [5, 10],
            [10, 10],
        ];
        vertes.forEach(([r, c]) => {
            m[cleFait(r, c)] = 3;
        });
        // 12 clés rouges -> exactement 21 cases affichées (3 diagonales + 9 paires symétriques)
        // Toutes avec max(r, c) dans {7, 8, 9} (les tables de 7, 8 et 9)
        const rouges = [
            [3, 8], [4, 7], [4, 8],
            [6, 7], [6, 8], [6, 9],
            [7, 7], [7, 8], [7, 9],
            [8, 8], [8, 9],
            [9, 9],
        ];
        rouges.forEach(([r, c]) => {
            m[cleFait(r, c)] = 1;
        });
        // Remplir le reste avec 2 (orange)
        for (let r = 1; r <= 10; r++) {
            for (let c = 1; c <= 10; c++) {
                const k = cleFait(r, c);
                if (m[k] === undefined) m[k] = 2;
            }
        }
    } else {
        // Plafond 15 (225 cases)
        for (let r = 1; r <= plafond; r++) {
            for (let c = 1; c <= plafond; c++) {
                const k = cleFait(r, c);
                if (r <= 6 && c <= 6) m[k] = 3;
                else if (r >= 12 || c >= 12) m[k] = 1;
                else m[k] = 2;
            }
        }
    }
    return m;
}

export default function Home({ onGo, identite, estProf, estAdmin, onLogout, onReprendreDefi }) {
    const profil = identite?.profil;
    const idUtilisateur = profil?.id;

    // Aperçus de développement : STRICTEMENT réservés aux professeurs et administrateurs
    // Un élève ne doit JAMAIS voir de fausses données même s'il injecte ?preview= dans l'URL
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const canPreview = Boolean(estProf || estAdmin);
    const isStudentPreview = canPreview && urlParams?.get('preview') === 'eleve';
    const isPlafond15Preview = canPreview && urlParams?.get('preview') === 'plafond15';
    const isPremierJourPreview = canPreview && urlParams?.get('preview') === 'premier_jour';
    const isDevPreview = isStudentPreview || isPlafond15Preview || isPremierJourPreview;

    // Reprise défi
    const [defiEnCours, setDefiEnCours] = useState(() => {
        return (!estProf && idUtilisateur) ? lireDefiEnCours(idUtilisateur) : null;
    });
    const [loadingReprise, setLoadingReprise] = useState(false);
    const [erreurReprise, setErreurReprise] = useState(null);

    // Données élève : 3 états (chargement, erreur, chargé)
    const [userData, setUserData] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(!estProf && !isDevPreview);
    const [profileError, setProfileError] = useState(null);
    const [weakTable, setWeakTable] = useState(null);
    const [enAttente, setEnAttente] = useState(() => partiesEnAttente());
    const [showGrid, setShowGrid] = useState(false);
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [selectedAvatar, setSelectedAvatar] = useState(null);

    // Code direct de défi
    const [joinCode, setJoinCode] = useState('');
    const [joinLoading, setJoinLoading] = useState(false);
    const [joinError, setJoinError] = useState(null);

    useEffect(() => {
        if (!estProf && idUtilisateur) {
            setDefiEnCours(lireDefiEnCours(idUtilisateur));
        } else {
            setDefiEnCours(null);
        }
        setErreurReprise(null);
    }, [idUtilisateur, estProf]);

    const chargerDonneesEleve = useCallback(() => {
        if (estProf && !isDevPreview) return;
        if (!idUtilisateur && !isDevPreview) return;

        setLoadingProfile(true);
        setProfileError(null);

        monProfil().then(res => {
            if (res.ok && res.data) {
                setUserData(res.data);
                setLoadingProfile(false);
            } else {
                console.error('Erreur monProfil:', res.error || res.message);
                setProfileError('Connexion perdue. Appuie sur Réessayer.');
                setLoadingProfile(false);
            }
        }).catch((err) => {
            console.error('Exception monProfil:', err);
            setProfileError('Connexion perdue. Appuie sur Réessayer.');
            setLoadingProfile(false);
        });

        mesTablesFaibles(1).then(res => {
            if (res.ok && res.data && res.data.length > 0) {
                setWeakTable(res.data[0]);
            } else {
                setWeakTable(null);
            }
        }).catch(() => {
            setWeakTable(null);
        });
    }, [estProf, idUtilisateur, isDevPreview]);

    useEffect(() => {
        if (!estProf && idUtilisateur && !isDevPreview) {
            chargerDonneesEleve();
        }
    }, [estProf, idUtilisateur, isDevPreview, chargerDonneesEleve]);

    useEffect(() => {
        setEnAttente(partiesEnAttente());
        const unsub = surFileChangee((nb) => {
            setEnAttente(nb);
        });
        return unsub;
    }, []);

    const handleReprendre = async () => {
        if (!defiEnCours?.code) return;
        setLoadingReprise(true);
        setErreurReprise(null);
        const res = await rejoindreDefi(defiEnCours.code);
        setLoadingReprise(false);

        if (res.ok) {
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
            effacerDefiEnCours(idUtilisateur);
            setDefiEnCours(null);
            setErreurReprise(res.message || res.error || "Ce défi n'est plus disponible.");
        }
    };

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

    const handleChangerAvatar = async (emoji) => {
        setSelectedAvatar(emoji);
        setShowAvatarPicker(false);
        await changerAvatar(emoji);
    };

    // ==================== ACCUEIL PROFESSEUR ====================
    if (estProf && !isDevPreview) {
        return (
            <div className="screen-enter">
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
                            fontSize: 13, color: 'var(--gris)', fontWeight: 700,
                        }}>
                            {estAdmin ? 'Administrateur' : 'Enseignant'}
                        </p>
                    </div>
                </div>

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
                        <div className="mode-card__desc" style={{ color: 'var(--ciel-pale)' }}>Maîtrise agrégée — qui bloque, sur quoi</div>
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

    // ==================== ACCUEIL ÉLÈVE ====================

    // État 1 : En cours de chargement (pas d'écran 15 ni 16, squelette sobre avec données déjà connues)
    if (!isDevPreview && loadingProfile && !userData && !profileError) {
        return (
            <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 10 }}>
                    <div
                        style={{
                            width: 74, height: 74, borderRadius: 24,
                            background: 'var(--bordure)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 40, flexShrink: 0,
                        }}
                    >
                        {profil?.avatar_emoji || '🦊'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <div className="font-display" style={{ fontSize: 33, fontWeight: 700, color: 'var(--indigo)' }}>
                            {profil?.prenom || 'Bonjour'}
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 18, fontWeight: 600, color: 'var(--gris)' }}>
                            {profil?.classe ? `${profil.classe} · ` : ''}Chargement…
                        </div>
                    </div>
                </div>

                <div style={{
                    background: 'var(--surface)', borderRadius: 26, padding: '36px 24px',
                    boxShadow: 'var(--ombre-carte)', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center',
                }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: '50%',
                        border: '4px solid var(--bordure)',
                        borderTopColor: 'var(--action)',
                        animation: 'spin 1s linear infinite',
                    }} />
                    <div className="font-display" style={{ fontSize: 21, fontWeight: 700, color: 'var(--indigo)' }}>
                        Chargement de ta progression…
                    </div>
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                        Récupération de ta grille et de tes scores
                    </div>
                </div>

                <div style={{
                    background: 'var(--surface)', borderRadius: 24, padding: '16px 20px',
                    boxShadow: 'var(--ombre-carte)', display: 'flex', alignItems: 'center',
                    gap: 14, minHeight: 96, opacity: 0.6,
                }}>
                    <div style={{
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
                        color: 'var(--indigo-doux)', whiteSpace: 'nowrap',
                    }}>
                        Défi de classe
                    </div>
                    <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                        {[0, 1, 2, 3, 4].map(idx => (
                            <div
                                key={idx}
                                style={{
                                    flex: 1, height: 64, borderRadius: 14,
                                    border: '3px dashed var(--bordure)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 26,
                                    color: 'var(--gris-inerte)', background: 'var(--surface)',
                                }}
                            >
                                ·
                            </div>
                        ))}
                    </div>
                    <div style={{
                        height: 64, padding: '0 26px', borderRadius: 14,
                        background: 'var(--bordure)', color: 'var(--gris)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        Rejoindre
                    </div>
                </div>
            </div>
        );
    }

    // État 2 : Erreur de connexion (réseau coupé ou échec serveur)
    if (!isDevPreview && profileError && !userData) {
        return (
            <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div
                        style={{
                            width: 74, height: 74, borderRadius: 24,
                            background: 'var(--ciel-pale)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 40, flexShrink: 0,
                        }}
                    >
                        {profil?.avatar_emoji || '🦊'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <div className="font-display" style={{ fontSize: 33, fontWeight: 700, color: 'var(--indigo)' }}>
                            {profil?.prenom || 'Bonjour'}
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 18, fontWeight: 600, color: 'var(--gris)' }}>
                            {profil?.classe || ''}
                        </div>
                    </div>
                </div>

                <div style={{
                    background: 'var(--surface)', borderRadius: 26, padding: '36px 24px',
                    boxShadow: 'var(--ombre-carte)', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 16, textAlign: 'center',
                }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: 20, background: 'var(--orange-pale)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
                    }}>
                        ⚠️
                    </div>
                    <div className="font-display" style={{ fontSize: 24, fontWeight: 700, color: 'var(--indigo)' }}>
                        Connexion perdue
                    </div>
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.45, fontWeight: 600, color: 'var(--gris)', maxWidth: 360 }}>
                        {profileError}
                    </div>
                    <button
                        onClick={chargerDonneesEleve}
                        style={{
                            marginTop: 8, height: 56, padding: '0 32px', borderRadius: 18,
                            background: 'var(--action)', color: 'var(--action-texte)',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
                            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        }}
                    >
                        Réessayer
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                    <button
                        onClick={onLogout}
                        style={{
                            background: 'none', border: 'none', color: 'var(--gris)',
                            fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        Se déconnecter
                    </button>
                </div>
            </div>
        );
    }

    // État 3 : Données élève chargées (ou prévisualisation prof autorisée)
    const studentProfil = (canPreview && isDevPreview)
        ? (isPremierJourPreview
            ? { prenom: 'Malo', classe: '6ᵉB', avatar_emoji: '?', plafond_tables: 10 }
            : { prenom: 'Lou', classe: '6ᵉA', avatar_emoji: '🦊', plafond_tables: isPlafond15Preview ? 15 : 10 })
        : (userData?.profil || profil);

    const currentAvatar = selectedAvatar || studentProfil?.avatar_emoji || (isPremierJourPreview ? '?' : '🦊');
    const plafond = studentProfil?.plafond_tables || (isPlafond15Preview ? 15 : 10);
    const palierLabel = plafond <= 5 ? 'Découverte' : plafond <= 10 ? 'Confirmé' : 'Expert';
    const studentPoints = userData?.records?.points_total ?? (userData?.progression?.total ?? (canPreview && isDevPreview ? 1240 : 0));

    // Déclenchement de l'écran 16 (premier jour) sur une seule condition : monProfil().records.nb_sessions === 0
    const nbSessions = (canPreview && isPremierJourPreview) ? 0 : (userData ? (userData.records?.nb_sessions ?? 0) : (canPreview && isDevPreview ? 14 : 0));
    const estPremierJour = (canPreview && isPremierJourPreview) || (!estProf && (nbSessions === 0));

    const typeLabels = {
        sprint: 'Sprint',
        flawless: 'Sans faute',
        countdown: 'Contre-la-montre',
        climb: 'Montée',
        libre: 'Libre',
        apprentissage: 'Apprendre',
    };

    // ==================== ÉCRAN 16 : TOUT PREMIER JOUR ====================
    if (estPremierJour) {
        return (
            <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* 1. Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 10 }}>
                    <div
                        onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                        style={{
                            width: 74, height: 74, borderRadius: 24,
                            background: 'var(--bordure)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: currentAvatar === '?' ? 36 : 42,
                            color: 'var(--gris)', cursor: 'pointer', flexShrink: 0,
                        }}
                        title="Choisir ton avatar"
                    >
                        {currentAvatar}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <div className="font-display" style={{ fontSize: 33, fontWeight: 700, color: 'var(--indigo)' }}>
                            {studentProfil?.prenom || 'Malo'}
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 18, fontWeight: 600, color: 'var(--gris)' }}>
                            {studentProfil?.classe ? `${studentProfil.classe} · ` : ''}Découverte
                        </div>
                    </div>
                    <div style={{
                        marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8,
                        background: 'var(--surface)', borderRadius: 999, padding: '11px 20px',
                        boxShadow: 'var(--ombre-douce)',
                    }}>
                        <span className="font-display" style={{ fontSize: 25, fontWeight: 700, color: 'var(--gris)' }}>
                            0
                        </span>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--gris)' }}>
                            pts
                        </span>
                    </div>
                </div>

                {/* 2. Grille vide grise */}
                <div style={{
                    background: 'var(--surface)', borderRadius: 26, padding: '22px 24px',
                    boxShadow: 'var(--ombre-carte)', display: 'flex', alignItems: 'center', gap: 24,
                }}>
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(10, 16px)',
                        gridAutoRows: '16px', gap: 3, flexShrink: 0,
                    }}>
                        {Array.from({ length: 100 }).map((_, idx) => (
                            <div key={idx} style={{ borderRadius: 3, background: 'var(--bordure)' }} />
                        ))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                        <div className="font-display" style={{ fontSize: 23, fontWeight: 700, color: 'var(--indigo)' }}>
                            Ta grille est vide
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.45, fontWeight: 600, color: 'var(--gris)' }}>
                            Chaque case est une multiplication. Elles se colorent au fur et à mesure : rouge, orange, puis verte quand tu la sais.
                        </div>
                    </div>
                </div>

                {/* 3. Pour commencer : Une première partie libre */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{
                        fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 700,
                        color: 'var(--gris)', letterSpacing: '0.14em', textTransform: 'uppercase',
                    }}>
                        Pour commencer
                    </div>
                    <button
                        onClick={() => onGo('play', { mode: 'libre', tables: [2, 3, 4, 5] })}
                        style={{
                            background: 'var(--action)', borderRadius: 26, padding: '24px 26px',
                            display: 'flex', alignItems: 'center', gap: 20, border: 'none',
                            cursor: 'pointer', textAlign: 'left', width: '100%',
                        }}
                    >
                        <div style={{
                            width: 78, height: 78, borderRadius: 22,
                            background: 'rgba(255, 255, 255, 0.18)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                            <IconLibre size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                            <div className="font-display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--action-texte)' }}>
                                Une première partie libre
                            </div>
                            <div style={{ fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 600, color: 'var(--ciel-pale)' }}>
                                Tables 2 à 5 · sans chrono · pour voir où tu en es
                            </div>
                        </div>
                        <div style={{
                            width: 66, height: 66, borderRadius: 20,
                            background: 'var(--surface)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                <path d="M8.5 5 17 12l-8.5 7" stroke="var(--action)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                    </button>
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--gris)' }}>
                        Les autres modes s'ouvrent après cette partie — ils ont besoin de savoir ce que tu sais.
                    </div>
                </div>

                {/* 4. En attendant */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{
                        fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 700,
                        color: 'var(--gris)', letterSpacing: '0.14em', textTransform: 'uppercase',
                    }}>
                        En attendant
                    </div>
                    {/* Modes grisés */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, opacity: 0.42 }}>
                        <div style={modeCardDisabledStyle}>
                            <IconSprint size={34} color="var(--indigo)" actionColor="var(--action)" />
                            <span style={modeCardTitleStyle}>Sprint</span>
                        </div>
                        <div style={modeCardDisabledStyle}>
                            <IconSansFaute size={34} color="var(--indigo)" actionColor="var(--action)" />
                            <span style={modeCardTitleStyle}>Sans faute</span>
                        </div>
                        <div style={modeCardDisabledStyle}>
                            <IconChrono size={34} color="var(--indigo)" actionColor="var(--action)" />
                            <span style={modeCardTitleStyle}>Contre‑la‑montre</span>
                        </div>
                    </div>

                    {/* Choisir son avatar */}
                    <div
                        onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                        style={{
                            background: 'var(--surface)', borderRadius: 24, padding: '20px 24px',
                            boxShadow: 'var(--ombre-carte)', display: 'flex', alignItems: 'center',
                            gap: 16, cursor: 'pointer',
                        }}
                    >
                        <div style={{
                            width: 56, height: 56, borderRadius: 16,
                            background: 'var(--ciel-pale)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', fontSize: 32, flexShrink: 0,
                        }}>
                            {currentAvatar === '?' ? '🦊' : currentAvatar}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                            <div className="font-display" style={{ fontSize: 21, fontWeight: 700, color: 'var(--indigo)' }}>
                                Choisir ton avatar
                            </div>
                            <div style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--gris)' }}>
                                C'est la seule chose que tu peux changer toi‑même.
                            </div>
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 18, fontWeight: 700, color: 'var(--action)', whiteSpace: 'nowrap' }}>
                            Choisir ›
                        </div>
                    </div>

                    {/* Sélecteur d'avatar déplié */}
                    {showAvatarPicker && (
                        <div style={{
                            display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center',
                            padding: '16px 20px', background: 'var(--surface)', borderRadius: 20,
                            boxShadow: 'var(--ombre-douce)',
                        }}>
                            {AVATAR_OPTIONS.map(a => (
                                <button
                                    key={a}
                                    style={{
                                        fontSize: 34, background: currentAvatar === a ? 'var(--ciel-pale)' : 'transparent',
                                        border: currentAvatar === a ? '2px solid var(--action)' : '2px solid transparent',
                                        borderRadius: 16, padding: '8px 12px', cursor: 'pointer',
                                    }}
                                    onClick={() => handleChangerAvatar(a)}
                                >
                                    {a}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ flex: 1 }} />

                {/* 5. Bas de page */}
                <div style={{ display: 'flex', gap: 12, paddingBottom: 20 }}>
                    <div style={{ ...footerBtnStyle, opacity: 0.5, cursor: 'not-allowed' }}>
                        <IconClassements size={28} color="var(--indigo)" actionColor="var(--action)" />
                        <span style={footerBtnTextStyle}>Classements</span>
                    </div>
                    <button onClick={() => onGo('profile')} style={footerBtnStyle}>
                        <IconMaGrille size={28} color="var(--indigo)" actionColor="var(--action)" />
                        <span style={footerBtnTextStyle}>Profil</span>
                    </button>
                </div>
            </div>
        );
    }

    // ==================== ÉCRAN 15 : ACCUEIL ÉLÈVE CORRIGÉ ====================
    const maitrise = userData?.maitrise || (canPreview && (isStudentPreview || isPlafond15Preview) ? getMockMaitrise(plafond) : {});
    const totalCases = plafond * plafond;
    let nbVertes = 0;
    let nbRouges = 0;
    const redTablesSet = new Set();

    // Règle de symétrie : on compte chaque case affichée (r, c) de 1..plafond
    for (let r = 1; r <= plafond; r++) {
        for (let c = 1; c <= plafond; c++) {
            const key = cleFait(r, c);
            const val = maitrise?.[key];
            if (val >= 3) {
                nbVertes++;
            } else if (val === 1) {
                nbRouges++;
                const t = Math.max(r, c);
                if (t >= 2) redTablesSet.add(t);
            }
        }
    }
    const tablesRouges = [...redTablesSet].sort((a, b) => a - b);

    const formatListTables = (list) => {
        if (list.length === 0) return '';
        if (list.length === 1) return `la table de ${list[0]}`;
        if (list.length === 2) return `les tables de ${list[0]} et ${list[1]}`;
        return `les tables de ${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}`;
    };

    const redText = nbRouges === 0
        ? 'Aucune case rouge ! Bravo.'
        : `Il te reste ${nbRouges} case${nbRouges > 1 ? 's' : ''} rouge${nbRouges > 1 ? 's' : ''}, ${tablesRouges.length === 1 ? 'dans ' : 'toutes dans '}${formatListTables(tablesRouges)}.`;

    // Taille des cases de la mini-grille
    const cellSize = plafond <= 10 ? 16 : plafond <= 12 ? 13 : 10;
    const cellGap = plafond <= 10 ? 3 : 2;

    // Action du jour : UNIQUEMENT issue de mesTablesFaibles(1)
    // Aucun repli local si le serveur n'a pas répondu ou ne renvoie rien
    const tableActionJour = weakTable || (canPreview && isStudentPreview ? 9 : null);

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Modal de grille de maîtrise en grand */}
            {showGrid && (
                <MasteryGrid
                    mastery={maitrise}
                    tables={Array.from({ length: plafond }, (_, i) => i + 1)}
                    onClose={() => setShowGrid(false)}
                />
            )}

            {/* 1. Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 10 }}>
                <div
                    onClick={() => onGo('profile')}
                    style={{
                        width: 74, height: 74, borderRadius: 24,
                        background: 'var(--ciel-pale)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 40, cursor: 'pointer', flexShrink: 0,
                    }}
                >
                    {currentAvatar}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <div className="font-display" style={{ fontSize: 33, fontWeight: 700, color: 'var(--indigo)' }}>
                        {studentProfil?.prenom || 'Lou'}
                    </div>
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 18, fontWeight: 600, color: 'var(--gris)' }}>
                        {studentProfil?.classe ? `${studentProfil.classe} · ` : ''}{palierLabel}
                    </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: 'var(--surface)', borderRadius: 999, padding: '11px 20px',
                        boxShadow: 'var(--ombre-douce)',
                    }}>
                        <span className="font-display" style={{ fontSize: 25, fontWeight: 700, color: 'var(--indigo)' }}>
                            {studentPoints.toLocaleString('fr-FR')}
                        </span>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--gris)' }}>
                            pts
                        </span>
                    </div>
                    <button
                        onClick={() => onGo('profile')}
                        style={{
                            width: 56, height: 56, borderRadius: 18,
                            background: 'var(--surface)', boxShadow: 'var(--ombre-douce)',
                            border: 'none', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                    >
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="3.4" stroke="var(--indigo-doux)" strokeWidth="2.2" />
                            <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" stroke="var(--indigo-doux)" strokeWidth="2.2" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* 2. Mini Grille de Maîtrise en haut */}
            <div style={{
                background: 'var(--surface)', borderRadius: 26, padding: '22px 24px',
                boxShadow: 'var(--ombre-carte)', display: 'flex', alignItems: 'center', gap: 24,
            }}>
                <div style={{
                    display: 'grid', gridTemplateColumns: `repeat(${plafond}, ${cellSize}px)`,
                    gridAutoRows: `${cellSize}px`, gap: cellGap, flexShrink: 0,
                }}>
                    {Array.from({ length: plafond }).map((_, rIdx) => {
                        const r = rIdx + 1;
                        return Array.from({ length: plafond }).map((_, cIdx) => {
                            const c = cIdx + 1;
                            const key = cleFait(r, c);
                            const val = maitrise?.[key];
                            return (
                                <div
                                    key={`${r}_${c}`}
                                    style={{
                                        borderRadius: 3,
                                        background: masteryColor(val),
                                    }}
                                />
                            );
                        });
                    })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                    <div className="font-display" style={{ fontSize: 23, fontWeight: 700, color: 'var(--indigo)' }}>
                        {nbVertes} cases vertes sur {totalCases}
                    </div>
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.45, fontWeight: 600, color: 'var(--gris)' }}>
                        Tes tables vont jusqu'à {plafond}. {redText}
                    </div>
                    <button
                        onClick={() => setShowGrid(true)}
                        style={{
                            fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 700,
                            color: 'var(--action)', background: 'none', border: 'none',
                            padding: 0, textAlign: 'left', cursor: 'pointer',
                        }}
                    >
                        Voir ma grille en grand ›
                    </button>
                </div>
            </div>

            {/* 3. Emplacement fixe du Défi de classe */}
            <div>
                {erreurReprise && (
                    <div style={{
                        padding: '10px 16px', background: 'var(--orange-pale)',
                        borderRadius: 14, marginBottom: 8, fontSize: 14,
                        color: 'var(--indigo)', fontWeight: 600,
                    }}>
                        {erreurReprise}
                    </div>
                )}
                {defiEnCours ? (
                    <div style={{
                        background: 'var(--indigo)', borderRadius: 24, padding: '16px 20px',
                        boxShadow: 'var(--ombre-carte)', display: 'flex', alignItems: 'center',
                        gap: 14, minHeight: 96,
                    }}>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div className="font-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--action-texte)' }}>
                                Défi {defiEnCours.code} en cours
                            </div>
                            <div style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--ciel-pale)' }}>
                                {typeLabels[defiEnCours.type] || 'Défi'} · {defiEnCours.classe || studentProfil?.classe || 'Classe'} · reprend à la première question
                            </div>
                        </div>
                        <button
                            onClick={handleReprendre}
                            disabled={loadingReprise}
                            style={{
                                height: 64, padding: '0 26px', borderRadius: 14,
                                background: 'var(--action)', color: 'var(--action-texte)',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19,
                                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {loadingReprise ? '…' : 'Reprendre'}
                        </button>
                    </div>
                ) : (
                    <div style={{
                        background: 'var(--surface)', borderRadius: 24, padding: '16px 20px',
                        boxShadow: 'var(--ombre-carte)', display: 'flex', alignItems: 'center',
                        gap: 14, minHeight: 96,
                    }}>
                        <div style={{
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
                            color: 'var(--indigo-doux)', whiteSpace: 'nowrap',
                        }}>
                            Défi de classe
                        </div>
                        <div style={{ flex: 1, position: 'relative', height: 64 }}>
                            <input
                                type="text"
                                maxLength={5}
                                value={joinCode}
                                autoCapitalize="characters"
                                onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-HJ-KM-NP-Z2-9]/g, '').slice(0, 5))}
                                onKeyDown={e => { if (e.key === 'Enter') handleJoinDirect(); }}
                                style={{
                                    position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%',
                                    cursor: 'text', zIndex: 2,
                                }}
                            />
                            <div style={{ display: 'flex', gap: 8, height: '100%' }}>
                                {[0, 1, 2, 3, 4].map(idx => (
                                    <div
                                        key={idx}
                                        style={{
                                            flex: 1, height: 64, borderRadius: 14,
                                            border: '3px dashed var(--bordure)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 26,
                                            color: joinCode[idx] ? 'var(--indigo)' : 'var(--gris-inerte)',
                                            background: 'var(--surface)',
                                        }}
                                    >
                                        {joinCode[idx] || '·'}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={handleJoinDirect}
                            disabled={joinCode.length < 5 || joinLoading}
                            style={{
                                height: 64, padding: '0 26px', borderRadius: 14,
                                background: joinCode.length >= 5 ? 'var(--action)' : 'var(--bordure)',
                                color: joinCode.length >= 5 ? 'var(--action-texte)' : 'var(--gris)',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19,
                                border: 'none', cursor: joinCode.length >= 5 ? 'pointer' : 'default',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {joinLoading ? '…' : 'Rejoindre'}
                        </button>
                    </div>
                )}
                {joinError && (
                    <div style={{
                        marginTop: 6, fontSize: 13, fontWeight: 600, color: 'var(--rouge)', textAlign: 'center',
                    }}>
                        {joinError}
                    </div>
                )}
            </div>

            {/* 4. Aujourd'hui / Action du jour (uniquement si mesTablesFaibles a répondu) */}
            {tableActionJour && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{
                        fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 700,
                        color: 'var(--gris)', letterSpacing: '0.14em', textTransform: 'uppercase',
                    }}>
                        Aujourd'hui
                    </div>
                    <button
                        onClick={() => onGo('play', { mode: 'flawless', tables: [tableActionJour], length: 20, timer: 0 })}
                        style={{
                            background: 'var(--action)', borderRadius: 26, padding: '24px 26px',
                            display: 'flex', alignItems: 'center', gap: 20, border: 'none',
                            cursor: 'pointer', textAlign: 'left', width: '100%',
                        }}
                    >
                        <div style={{
                            width: 78, height: 78, borderRadius: 22,
                            background: 'rgba(255, 255, 255, 0.18)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 40,
                            color: 'var(--action-texte)', flexShrink: 0,
                        }}>
                            {tableActionJour}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                            <div className="font-display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--action-texte)' }}>
                                Reprendre la table de {tableActionJour}
                            </div>
                            <div style={{ fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 600, color: 'var(--ciel-pale)' }}>
                                Ta table la plus faible · Sans faute · 20 questions
                            </div>
                        </div>
                        <div style={{
                            width: 66, height: 66, borderRadius: 20,
                            background: 'var(--surface)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                <path d="M8.5 5 17 12l-8.5 7" stroke="var(--action)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                    </button>
                </div>
            )}

            {/* 5. Grille des 6 modes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                    fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 700,
                    color: 'var(--gris)', letterSpacing: '0.14em', textTransform: 'uppercase',
                }}>
                    {tableActionJour ? 'Ou choisis ton mode' : 'Choisis ton mode'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {/* Sprint */}
                    <button
                        onClick={() => onGo('play', { mode: 'sprint', length: 20, timer: 3 })}
                        style={modeBtnStyle}
                    >
                        <IconSprint size={34} color="var(--indigo)" actionColor="var(--action)" />
                        <span style={modeBtnTitleStyle}>Sprint</span>
                        <span style={modeBtnDescStyle}>3 s par question</span>
                    </button>

                    {/* Sans faute */}
                    <button
                        onClick={() => onGo('play', { mode: 'flawless', length: 20, timer: 0 })}
                        style={modeBtnStyle}
                    >
                        <IconSansFaute size={34} color="var(--indigo)" actionColor="var(--action)" />
                        <span style={modeBtnTitleStyle}>Sans faute</span>
                        <span style={modeBtnDescStyle}>zéro erreur</span>
                    </button>

                    {/* Contre-la-montre */}
                    <button
                        onClick={() => onGo('play', { mode: 'countdown', length: 0, timer: 120 })}
                        style={modeBtnStyle}
                    >
                        <IconChrono size={34} color="var(--indigo)" actionColor="var(--action)" />
                        <span style={modeBtnTitleStyle}>Contre‑la‑montre</span>
                        <span style={modeBtnDescStyle}>2 minutes</span>
                    </button>

                    {/* Montée */}
                    <button
                        onClick={() => onGo('challenges', { mode: 'climb' })}
                        style={modeBtnStyle}
                    >
                        <IconMontee size={34} color="var(--indigo)" actionColor="var(--action)" />
                        <span style={modeBtnTitleStyle}>Montée</span>
                        <span style={modeBtnDescStyle}>palier {plafond}</span>
                    </button>

                    {/* Libre */}
                    <button
                        onClick={() => onGo('play')}
                        style={modeBtnStyle}
                    >
                        <IconLibre size={34} color="var(--indigo)" actionColor="var(--action)" />
                        <span style={modeBtnTitleStyle}>Libre</span>
                        <span style={modeBtnDescStyle}>sans contrainte</span>
                    </button>

                    {/* Apprendre */}
                    <button
                        onClick={() => onGo('learn')}
                        style={modeBtnStyle}
                    >
                        <IconApprendre size={34} color="var(--indigo)" actionColor="var(--action)" />
                        <span style={modeBtnTitleStyle}>Apprendre</span>
                        <span style={modeBtnDescStyle}>sans score</span>
                    </button>
                </div>
            </div>

            {/* 6. File hors-ligne */}
            {enAttente > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M12 20.5v-9M12 11.5l-4 4M12 11.5l4 4" stroke="var(--gris)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5 8.5a7 7 0 0 1 14 0" stroke="var(--gris)" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                    <span style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--gris)' }}>
                        {enAttente === 1
                            ? "1 partie en attente d'envoi — elle partira au retour du wifi."
                            : `${enAttente} parties en attente d'envoi — elles partiront au retour du wifi.`}
                    </span>
                </div>
            )}

            <div style={{ flex: 1 }} />

            {/* 7. Bas de page : Classements et Profil */}
            <div style={{ display: 'flex', gap: 12, paddingBottom: 20 }}>
                <button onClick={() => onGo('leaderboards')} style={footerBtnStyle}>
                    <IconClassements size={28} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={footerBtnTextStyle}>Classements</span>
                </button>
                <button onClick={() => onGo('profile')} style={footerBtnStyle}>
                    <IconMaGrille size={28} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={footerBtnTextStyle}>Profil</span>
                </button>
            </div>
        </div>
    );
}

const modeBtnStyle = {
    background: 'var(--surface)', borderRadius: 22, padding: '16px 12px',
    boxShadow: 'var(--ombre-carte)', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 6, minHeight: 112, justifyContent: 'center',
    border: 'none', cursor: 'pointer', textAlign: 'center',
};

const modeBtnTitleStyle = {
    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
    color: 'var(--indigo)', textAlign: 'center',
};

const modeBtnDescStyle = {
    fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 13,
    color: 'var(--gris)', textAlign: 'center',
};

const modeCardDisabledStyle = {
    background: 'var(--surface)', borderRadius: 22, padding: '16px 12px',
    boxShadow: 'var(--ombre-carte)', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 6, minHeight: 112, justifyContent: 'center',
};

const modeCardTitleStyle = {
    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
    color: 'var(--indigo)', textAlign: 'center',
};

const footerBtnStyle = {
    flex: 1, height: 88, borderRadius: 22, background: 'var(--surface)',
    boxShadow: 'var(--ombre-carte)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: 10, border: 'none', cursor: 'pointer',
};

const footerBtnTextStyle = {
    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19,
    color: 'var(--indigo)',
};
