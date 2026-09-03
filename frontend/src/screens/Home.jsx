import React, { useState, useEffect } from 'react';
import { rejoindreDefi } from '../api';
import { lireDefiEnCours, sauvegarderDefiEnCours, effacerDefiEnCours } from '../logic/defiStorage';
import { IconSprint, IconSansFaute, IconChrono, IconMontee, IconApprendre, IconClassements, IconMaGrille, IconDefisPasses, IconAdmin, IconProf } from '../components/Icons';

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

    // ==================== ACCUEIL PROFESSEUR ====================
    if (estProf) {
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
                        <IconSansFaute size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                    </span>
                    <span>
                        <div className="mode-card__title">S'entraîner</div>
                        <div className="mode-card__desc">Jouez vous aussi — Salle des profs</div>
                    </span>
                </button>

                <button className="mode-card" onClick={() => onGo('classe')} style={{
                    background: 'linear-gradient(135deg, var(--action), var(--indigo))',
                }}>
                    <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                        <IconMaGrille size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                    </span>
                    <span>
                        <div className="mode-card__title">Ma classe</div>
                        <div className="mode-card__desc">Maîtrise agrégée — qui bloque, sur quoi</div>
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
                        color: 'var(--coral)', marginTop: 8,
                    }}
                    onClick={onLogout}
                >
                    Se déconnecter
                </button>
            </div>
        );
    }

    // ==================== ACCUEIL ÉLÈVE ====================
    return (
        <div className="screen-enter">
            {/* Bienvenue */}
            {profil && (
                <div className="card" style={{
                    marginBottom: 14, display: 'flex',
                    alignItems: 'center', gap: 14, padding: '16px 20px',
                }}>
                    <span style={{ fontSize: 36 }}>
                        {profil.avatar_emoji || '🦊'}
                    </span>
                    <div>
                        <p className="font-display" style={{
                            fontWeight: 800, fontSize: 18, lineHeight: 1.2,
                        }}>
                            Salut {profil.prenom || profil.nom || 'Champion'} !
                        </p>
                        <p style={{
                            fontSize: 13, color: 'var(--text-soft)', fontWeight: 700,
                        }}>
                            {profil.classe || ''} — Prêt pour les tables ?
                        </p>
                    </div>
                </div>
            )}

            {/* Erreur serveur si reprise impossible */}
            {erreurReprise && (
                <div className="card" style={{
                    marginBottom: 14, padding: '12px 16px',
                    background: 'rgba(255, 90, 95, 0.08)',
                    border: '1.5px solid var(--coral)',
                    borderRadius: 14, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    gap: 12,
                }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral-dk)', margin: 0 }}>
                        {erreurReprise}
                    </p>
                    <button
                        className="btn btn--ghost"
                        style={{ fontSize: 12, padding: '4px 8px', color: 'var(--text-soft)' }}
                        onClick={() => setErreurReprise(null)}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Bandeau discret de reprise de défi */}
            {!erreurReprise && defiEnCours && (
                <div className="card" style={{
                    marginBottom: 14, padding: '12px 16px',
                    background: 'rgba(201, 162, 39, 0.08)',
                    border: '1.5px solid var(--gold)',
                    borderRadius: 14, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    gap: 12,
                }}>
                    <div>
                        <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginBottom: 2 }}>
                            ⚔️ Tu as un défi en cours
                        </p>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', margin: 0 }}>
                            {defiEnCours.auteur_nom ? `Défi de ${defiEnCours.auteur_nom}` : 'Défi'} — code {defiEnCours.code}
                        </p>
                    </div>
                    <button
                        className="btn btn--gold"
                        style={{
                            fontSize: 13, padding: '8px 16px',
                            fontWeight: 800, flexShrink: 0,
                        }}
                        disabled={loadingReprise}
                        onClick={handleReprendre}
                    >
                        {loadingReprise ? '…' : 'Reprendre'}
                    </button>
                </div>
            )}

            {/* Cartes de mode */}
            <button className="mode-card mode-card--learn" onClick={() => onGo('learn')}>
                <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                    <IconApprendre size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                </span>
                <span>
                    <div className="mode-card__title">Apprendre</div>
                    <div className="mode-card__desc">Groupes, tableaux, barres et astuces</div>
                </span>
            </button>

            <button className="mode-card mode-card--practice" onClick={() => onGo('play')}>
                <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                    <IconSansFaute size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                </span>
                <span>
                    <div className="mode-card__title">S'entraîner</div>
                    <div className="mode-card__desc">Quiz adaptatif avec indices et maîtrise</div>
                </span>
            </button>

            <button className="mode-card mode-card--challenge" onClick={() => onGo('challenges')}>
                <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                    <IconSprint size={40} color="var(--action-texte)" actionColor="var(--action-texte)" />
                </span>
                <span>
                    <div className="mode-card__title">Défis</div>
                    <div className="mode-card__desc">Défie tes camarades de classe !</div>
                </span>
            </button>

            {/* Accès rapides / boutons du bas */}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button
                    className="btn btn--ghost"
                    style={{ flex: 1, fontSize: 15, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    onClick={() => onGo('leaderboards')}
                >
                    <IconClassements size={20} color="var(--indigo)" actionColor="var(--ciel)" /> Classements
                </button>
                <button
                    className="btn btn--ghost"
                    style={{ flex: 1, fontSize: 15, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    onClick={() => onGo('profile')}
                >
                    <IconMaGrille size={20} color="var(--indigo)" actionColor="var(--ciel)" /> Ma grille
                </button>
            </div>
        </div>
    );
}
