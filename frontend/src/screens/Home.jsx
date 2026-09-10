import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    rejoindreDefi, monProfil, mesTablesFaibles, changerAvatar,
    partiesEnAttente, surFileChangee,
    monProfilProf, mesDefis, maitriseClasse,
} from '../api';
import { lireDefiEnCours, sauvegarderDefiEnCours, effacerDefiEnCours } from '../logic/defiStorage';
import { cleFait, masteryColor } from '../logic/mastery';
import { tablePlusFragileClasse } from '../logic/classeStats';
import branding from '../branding';
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

function formaterDateRelative(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    const maintenant = new Date();
    const diffJours = Math.floor((maintenant - d) / (1000 * 60 * 60 * 24));
    if (diffJours === 0) return "aujourd'hui";
    if (diffJours === 1) return "hier";
    if (diffJours === 2) return "avant-hier";
    if (diffJours < 7) return `il y a ${diffJours} jours`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
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


    // Données professeur (Écran 27)
    const [profData, setProfData] = useState(null);
    const [fragileAlerte, setFragileAlerte] = useState(null);
    const [statsDefisProf, setStatsDefisProf] = useState(null);

    useEffect(() => {
        if (!estProf || isDevPreview) return;
        let actif = true;

        async function chargerDonneesProf() {
            try {
                const [resProf, resDefis] = await Promise.all([
                    monProfilProf(),
                    mesDefis({ limite: 50 }),
                ]);

                if (!actif) return;

                if (resProf.ok && resProf.data?.profil) {
                    const p = resProf.data.profil;
                    setProfData(p);
                    const premiereClasse = p.classes?.[0];
                    if (premiereClasse) {
                        const resMaitrise = await maitriseClasse(premiereClasse);
                        if (actif && resMaitrise.ok && resMaitrise.data) {
                            const fragile = tablePlusFragileClasse(resMaitrise.data);
                            if (fragile && fragile.nb_bloquent > 0) {
                                setFragileAlerte({
                                    classe: premiereClasse,
                                    table_n: fragile.table_n,
                                    nb_bloquent: fragile.nb_bloquent,
                                });
                            }
                        }
                    }
                }

                if (actif && resDefis.ok && Array.isArray(resDefis.data)) {
                    setStatsDefisProf({
                        count: resDefis.data.length,
                        dernier: resDefis.data[0]?.cree_le || null,
                    });
                }
            } catch (e) {
                console.error('Erreur chargement accueil prof:', e);
            }
        }

        chargerDonneesProf();
        return () => { actif = false; };
    }, [estProf, isDevPreview]);

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

    const handleChangerAvatar = async (emoji) => {
        setSelectedAvatar(emoji);
        setShowAvatarPicker(false);
        await changerAvatar(emoji);
    };

    // ==================== ACCUEIL PROFESSEUR (Écran 27) ====================
    if (estProf && !isDevPreview) {
        const nomEnseignant = profData?.nom || profil?.nom || 'Professeur';
        const roleTexte = (profData?.role === 'admin' || estAdmin) ? 'Administrateur' : 'Professeur';
        const classesAffichees = (() => {
            const raw = profData?.classes || profil?.classes || [];
            if (!raw.length) return '';
            const formattes = raw.map(c => String(c).replace(/([0-9]+)e?([A-Z])/i, '$1ᵉ$2'));
            return ` · ${formattes.join(', ')}`;
        })();

        return (
            <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* 1. En-tête Enseignant */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 6 }}>
                    <img
                        src={branding.logoPath}
                        alt={branding.appName}
                        style={{ width: 62, height: 62, objectFit: 'contain', flexShrink: 0 }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div className="font-display" style={{ fontSize: 31, fontWeight: 700, color: 'var(--indigo)', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                            {branding.appName}
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                            {branding.baseline}
                        </div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                        <div className="font-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--indigo)' }}>
                            {nomEnseignant}
                        </div>
                        <div style={{
                            background: 'var(--surface)', boxShadow: '0 3px 10px rgba(32, 34, 107, 0.07)',
                            borderRadius: 999, padding: '7px 16px', fontFamily: 'var(--texte)',
                            fontWeight: 700, fontSize: 14, color: 'var(--gris)',
                        }}>
                            {roleTexte}{classesAffichees}
                        </div>
                    </div>
                </div>

                {/* 2. Hero Card : Lancer un défi */}
                <div
                    onClick={() => onGo('challenges')}
                    style={{
                        background: 'var(--ciel)', borderRadius: 26, padding: '34px clamp(20px, 3.5vw, 34px)',
                        display: 'flex', alignItems: 'center', gap: 22, cursor: 'pointer',
                        boxShadow: 'var(--ombre-carte)', marginTop: 10,
                    }}
                >
                    <svg width="56" height="56" viewBox="0 0 44 44" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M24 4 10 25h9l-2 15 15-22h-9z" fill="var(--action-texte)" stroke="var(--action-texte)" strokeWidth="3" strokeLinejoin="round" />
                    </svg>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div className="font-display" style={{ fontSize: 34, fontWeight: 700, color: 'var(--action-texte)', lineHeight: 1.15 }}>
                            Lancer un défi
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 600, color: 'var(--ciel-pale)' }}>
                            Sprint ou Contre‑la‑montre · code projeté au tableau
                        </div>
                    </div>
                    <div style={{
                        marginLeft: 'auto', width: 60, height: 60, borderRadius: 19,
                        background: 'rgba(255, 255, 255, 0.22)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                            <path d="M8.5 5 17 12l-8.5 7" stroke="var(--action-texte)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                </div>

                {/* 3. Encadré d'alerte table fragile (calcul partagé avec Ma classe) */}
                {fragileAlerte && (
                    <div style={{
                        background: 'var(--surface)', borderRadius: 24, boxShadow: 'var(--ombre-carte)',
                        padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 18,
                    }}>
                        <div style={{ width: 10, alignSelf: 'stretch', borderRadius: 5, background: 'var(--rouge)', flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                            <div className="font-display" style={{ fontSize: 23, fontWeight: 700, color: 'var(--indigo)' }}>
                                {fragileAlerte.nb_bloquent} élève{fragileAlerte.nb_bloquent > 1 ? 's' : ''} de {String(fragileAlerte.classe).replace(/([0-9]+)e?([A-Z])/i, '$1ᵉ$2')} bloque{fragileAlerte.nb_bloquent > 1 ? 'nt' : ''} sur la table de {fragileAlerte.table_n}
                            </div>
                            <div style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--gris)' }}>
                                Un défi ciblé maintenant vaut mieux qu'une révision générale.
                            </div>
                        </div>
                        <button
                            onClick={() => onGo('challenges', {
                                tables: [fragileAlerte.table_n],
                                classe: fragileAlerte.classe,
                            })}
                            style={{
                                marginLeft: 'auto', height: 60, padding: '0 24px', borderRadius: 16,
                                background: 'var(--ciel)', color: 'var(--action-texte)',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19,
                                display: 'flex', alignItems: 'center', border: 'none', cursor: 'pointer',
                                whiteSpace: 'nowrap', flexShrink: 0,
                            }}
                        >
                            Lancer ›
                        </button>
                    </div>
                )}

                {/* 4. Grille 2×2 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingTop: 6 }}>
                    {/* Ma classe */}
                    <div
                        onClick={() => onGo('classe')}
                        style={{
                            background: 'var(--surface)', borderRadius: 24, boxShadow: 'var(--ombre-carte)',
                            padding: 24, display: 'flex', flexDirection: 'column', gap: 9, cursor: 'pointer',
                        }}
                    >
                        <svg width="36" height="36" viewBox="0 0 44 44" fill="none">
                            <rect x="5" y="5" width="11" height="11" rx="2.5" fill="var(--ciel)" />
                            <rect x="18" y="5" width="11" height="11" rx="2.5" stroke="var(--indigo)" strokeWidth="3" />
                            <rect x="31" y="5" width="8" height="11" rx="2.5" stroke="var(--indigo)" strokeWidth="3" />
                            <rect x="5" y="18" width="11" height="11" rx="2.5" stroke="var(--indigo)" strokeWidth="3" />
                            <rect x="18" y="18" width="11" height="11" rx="2.5" fill="var(--indigo)" />
                            <rect x="31" y="18" width="8" height="11" rx="2.5" stroke="var(--indigo)" strokeWidth="3" />
                            <rect x="5" y="31" width="11" height="8" rx="2.5" stroke="var(--indigo)" strokeWidth="3" />
                            <rect x="18" y="31" width="11" height="8" rx="2.5" stroke="var(--indigo)" strokeWidth="3" />
                        </svg>
                        <div className="font-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--indigo)' }}>
                            Ma classe
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.4, fontWeight: 600, color: 'var(--gris)' }}>
                            Maîtrise agrégée — qui bloque, sur quoi
                        </div>
                    </div>

                    {/* Classements */}
                    <div
                        onClick={() => onGo('leaderboards')}
                        style={{
                            background: 'var(--surface)', borderRadius: 24, boxShadow: 'var(--ombre-carte)',
                            padding: 24, display: 'flex', flexDirection: 'column', gap: 9, cursor: 'pointer',
                        }}
                    >
                        <svg width="36" height="36" viewBox="0 0 44 44" fill="none">
                            <rect x="4" y="24" width="11" height="15" rx="2.5" stroke="var(--indigo)" strokeWidth="3.2" />
                            <rect x="16.5" y="13" width="11" height="26" rx="2.5" stroke="var(--ciel)" strokeWidth="3.2" />
                            <rect x="29" y="29" width="11" height="10" rx="2.5" stroke="var(--indigo)" strokeWidth="3.2" />
                        </svg>
                        <div className="font-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--indigo)' }}>
                            Classements
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.4, fontWeight: 600, color: 'var(--gris)' }}>
                            Progression, records, Salle des profs
                        </div>
                    </div>

                    {/* S'entraîner */}
                    <div
                        onClick={() => onGo('play')}
                        style={{
                            background: 'var(--surface)', borderRadius: 24, boxShadow: 'var(--ombre-carte)',
                            padding: 24, display: 'flex', flexDirection: 'column', gap: 9, cursor: 'pointer',
                        }}
                    >
                        <svg width="36" height="36" viewBox="0 0 44 44" fill="none">
                            <circle cx="22" cy="22" r="17" stroke="var(--indigo)" strokeWidth="3.4" />
                            <circle cx="22" cy="22" r="9" stroke="var(--ciel)" strokeWidth="3.4" />
                            <circle cx="22" cy="22" r="2.6" fill="var(--indigo)" />
                        </svg>
                        <div className="font-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--indigo)' }}>
                            S'entraîner
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.4, fontWeight: 600, color: 'var(--gris)' }}>
                            Jouez vous aussi — Salle des profs
                        </div>
                    </div>

                    {/* Mes défis passés */}
                    <div
                        onClick={() => onGo('mes-defis')}
                        style={{
                            background: 'var(--surface)', borderRadius: 24, boxShadow: 'var(--ombre-carte)',
                            padding: 24, display: 'flex', flexDirection: 'column', gap: 9, cursor: 'pointer',
                        }}
                    >
                        <svg width="36" height="36" viewBox="0 0 44 44" fill="none">
                            <circle cx="22" cy="23" r="16" stroke="var(--indigo)" strokeWidth="3.2" />
                            <path d="M22 14v9l7 4" stroke="var(--ciel)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M6 12 11 7" stroke="var(--indigo)" strokeWidth="3.2" strokeLinecap="round" />
                        </svg>
                        <div className="font-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--indigo)' }}>
                            Mes défis passés
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.4, fontWeight: 600, color: 'var(--gris)' }}>
                            {statsDefisProf && statsDefisProf.count > 0
                                ? `${statsDefisProf.count} défi${statsDefisProf.count > 1 ? 's' : ''}${statsDefisProf.dernier ? ` · le dernier ${formaterDateRelative(statsDefisProf.dernier)}` : ''}`
                                : 'Aucun défi lancé pour l’instant'}
                        </div>
                    </div>
                </div>

                <div style={{ flex: 1 }} />

                {/* 5. Navigation basse */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 10, paddingBottom: 24 }}>
                    <button
                        onClick={() => onGo('profile')}
                        style={{
                            flex: 1, height: 74, borderRadius: 22, background: 'var(--surface)',
                            boxShadow: 'var(--ombre-carte)', border: 'none', cursor: 'pointer',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 20, color: 'var(--indigo)',
                        }}
                    >
                        Profil
                    </button>
                    {(estAdmin || estProf) && (
                        <button
                            onClick={() => onGo('admin')}
                            style={{
                                flex: 1, height: 74, borderRadius: 22, background: 'var(--surface)',
                                boxShadow: 'var(--ombre-carte)', border: 'none', cursor: 'pointer',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 20, color: 'var(--indigo)',
                            }}
                        >
                            Administration
                        </button>
                    )}
                    <button
                        onClick={onLogout}
                        style={{
                            height: 74, padding: '0 22px', border: 'none', background: 'transparent',
                            cursor: 'pointer', fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 18, color: 'var(--gris)',
                        }}
                    >
                        Se déconnecter
                    </button>
                </div>
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
                    <div
                        onClick={() => onGo('challenges', { mode: 'join' })}
                        style={{
                            background: 'var(--surface)', borderRadius: 24, padding: '16px 20px',
                            boxShadow: 'var(--ombre-carte)', display: 'flex', alignItems: 'center',
                            gap: 14, minHeight: 96, cursor: 'pointer',
                        }}
                    >
                        <div style={{
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
                            color: 'var(--indigo-doux)', whiteSpace: 'nowrap',
                        }}>
                            Défi de classe
                        </div>
                        <div style={{ display: 'flex', gap: 8, flex: 1, height: 64 }}>
                            {[0, 1, 2, 3, 4].map(idx => (
                                <div
                                    key={idx}
                                    style={{
                                        flex: 1, height: 64, borderRadius: 14,
                                        border: '3px dashed var(--bordure)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 26,
                                        color: 'var(--gris-inerte)',
                                        background: 'var(--surface)',
                                    }}
                                >
                                    ·
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onGo('challenges', { mode: 'join' });
                            }}
                            style={{
                                height: 64, padding: '0 26px', borderRadius: 14,
                                background: 'var(--action)',
                                color: 'var(--action-texte)',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19,
                                border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            Rejoindre
                        </button>
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
