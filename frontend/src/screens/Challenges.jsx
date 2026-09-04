import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { newQuestion, PRAISE, makeHint, ALL_TABLES } from '../logic/questions';
import { buildWeights, construireErreurs, construireMaitrise, cleFait } from '../logic/mastery';
import {
    enregistrerSession, enregistrerSessionProf,
    creerDefi, rejoindreDefi, terminerDefi,
    classementDefi, avancementDefi, suivreDefi,
    listeClasses, apercuDefiClasse, definirPlafondClasse,
    presentsDefi, elevesHorsPlafond,
} from '../api';
import Keypad from '../components/Keypad';
import TimerRing from '../components/TimerRing';
import {
    ModeIcon, IconDefisPasses, IconCadenas, IconDocument, IconClassements,
    IconSprint, IconChrono, IconSansFaute, IconMontee, IconApprendre,
} from '../components/Icons';
import { sauvegarderDefiEnCours, effacerDefiEnCours } from '../logic/defiStorage';

/**
 * Challenges — Mode Défis
 * 4 types jouables : Sprint, Sans faute, Contre-la-montre, Montée
 * + Défi de classe (à implémenter)
 *
 * Modèle à cases (28/08) : autant de cases que de chiffres dans la
 * réponse. Chrono par question (3s) sauf Sans faute.
 * Scoring : premier essai / rattrapé / jamais.
 */

const QUESTION_TIMER = 3; // secondes par question

const CHALLENGE_TYPES = [
    {
        id: 'sprint', emoji: '⚡', name: 'Sprint',
        desc: '20 questions — le plus rapide gagne !',
        color: '--coral', questions: 20, shareable: true,
    },
    {
        id: 'flawless', emoji: '🎯', name: 'Sans faute',
        desc: 'Zéro erreur — la première te stoppe',
        color: '--gold',
    },
    {
        id: 'countdown', emoji: '⏱', name: 'Contre-la-montre',
        desc: '2 minutes — max de bonnes réponses',
        color: '--sky', timer: 120, shareable: true,
    },
    {
        id: 'climb', emoji: '🧗', name: 'Montée des tables',
        desc: 'Palier par palier, de la table 2 à 20',
        color: '--purple',
    },
];

export default function Challenges({ onBack, identite, estProf, onPlafondChange, maitrise: maitriseProp, onGo, defiPreConfig, clearPreConfig }) {
    const [phase, setPhase] = useState(() => (estProf ? 'config' : 'select'));
    const [challengeType, setChallengeType] = useState(() => CHALLENGE_TYPES.find(t => t.id === 'sprint') || CHALLENGE_TYPES[0]);
    const [joinCode, setJoinCode] = useState('');
    const [selectedTables, setSelectedTables] = useState([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const [result, setResult] = useState(null);
    const [serverResult, setServerResult] = useState(null);
    // Défi partagé : info renvoyée par rejoindreDefi() ou creerDefi()
    const [defiInfo, setDefiInfo] = useState(null);
    // État d'envoi du résultat de défi : { etat: 'en_cours' | 'ok' | 'echec', message?, payload? }
    const [envoiDefi, setEnvoiDefi] = useState(null);
    // Classe pré-sélectionnée depuis MaClasse
    const [preSelectedClasse, setPreSelectedClasse] = useState(null);

    const plafond = identite?.profil?.plafond_tables || (estProf ? 20 : 10);

    // Pré-remplissage depuis MaClasse (config) ou reprise de défi (intro)
    useEffect(() => {
        if (defiPreConfig?.rejointDefi) {
            const d = defiPreConfig.rejointDefi;
            const type = CHALLENGE_TYPES.find(t => t.id === d.type) || CHALLENGE_TYPES[0];
            setDefiInfo(d);
            setChallengeType(type);
            setSelectedTables(d.tables || [2, 3, 4, 5]);
            setPhase('defi-intro');
            clearPreConfig?.();
        } else if (defiPreConfig) {
            const sprintType = CHALLENGE_TYPES.find(t => t.id === 'sprint') || CHALLENGE_TYPES[0];
            setChallengeType(sprintType);
            setSelectedTables(defiPreConfig.tables || [2, 3, 4, 5]);
            setPreSelectedClasse(defiPreConfig.classe || null);
            setPhase('config');
            clearPreConfig?.();
        }
    }, [defiPreConfig, clearPreConfig]);

    // --- Fin de partie SOLO ---
    const handleDone = useCallback((r) => {
        setResult(r);
        setServerResult(null);
        setPhase('results');

        const mode = challengeType?.id || 'sprint';
        const maitrise = construireMaitrise(r.resultats || []);
        const erreurs = construireErreurs(r.resultats || []);

        let tables = selectedTables;
        if (mode === 'climb') {
            const maxT = Math.max(2, r.highestTable || 2);
            tables = [];
            for (let i = 2; i <= maxT; i++) tables.push(i);
        }

        const session = {
            mode,
            tables,
            nbQuestions: r.answered || 0,
            score: r.score || 0,
            scorePremierEssai: r.scorePremierEssai ?? null,
            erreurs,
            dureeS: Math.round(r.time || 0),
            serieMax: r.maxStreak || 0,
            sansFauteMax: mode === 'flawless' ? (r.maxStreak || 0) : (r.maxStreak || 0),
            plusHauteTable: mode === 'climb' ? (r.highestTable || null) : null,
            maitrise,
        };

        const enregistrer = estProf ? enregistrerSessionProf : enregistrerSession;
        enregistrer(session).then(res => {
            if (res.ok) {
                setServerResult(res.data);
                const np = res.data?.plafond_tables;
                if (np && np !== plafond) onPlafondChange?.(np);
            } else {
                setServerResult({ erreur: res.error, enAttente: res.enAttente });
            }
        }).catch(() => {});
    }, [challengeType, selectedTables, estProf, plafond, onPlafondChange]);

    // --- Fin de partie DÉFI : terminerDefi() seul (pas enregistrerSession) ---
    const envoyerDefi = useCallback(async (payload) => {
        setEnvoiDefi({ etat: 'en_cours' });
        const res = await terminerDefi(payload);
        if (res.ok) {
            effacerDefiEnCours(identite?.profil?.id);
        }
        setEnvoiDefi(res.ok
            ? { etat: 'ok' }
            : { etat: 'echec', message: res.error, payload }
        );
    }, [identite]);

    const handleDoneDefi = useCallback((r) => {
        setResult(r);
        setPhase('defi-results');

        const maitrise = construireMaitrise(r.resultats || []);
        const payload = {
            defiId: defiInfo.defi_id,
            score: r.score || 0,
            tempsS: Math.round(r.time || 0),
            erreurs: (r.answered || 0) - (r.score || 0),
            maitrise,
            scorePremierEssai: r.scorePremierEssai ?? null,
        };
        envoyerDefi(payload);
    }, [defiInfo, envoyerDefi]);

    // --- Rejoindre un défi ---
    const handleJoin = useCallback(async (code) => {
        const res = await rejoindreDefi(code);
        if (!res.ok) return res; // { ok: false, raison, message }
        // Succès : on a les questions figées
        const d = res.data;
        const type = CHALLENGE_TYPES.find(t => t.id === d.type) || CHALLENGE_TYPES[0];
        setDefiInfo(d);
        setChallengeType(type);
        setSelectedTables(d.tables || [2,3,4,5]);
        // Sauvegarder dans localStorage pour reprise en cas de rechargement/fermeture
        sauvegarderDefiEnCours(identite?.profil?.id, {
            code: code.trim().toUpperCase(),
            defi_id: d.defi_id,
            type: d.type,
            classe: d.classe,
            auteur_nom: d.auteur_nom,
            rejoint_le: Date.now(),
        });
        // On passe par un écran d'annonce — l'élève doit savoir
        // de qui est le défi avant de jouer.
        setPhase('defi-intro');
        return res;
    }, [identite]);

    // --- Créer un défi ---
    const handleCreateDefi = useCallback(async (type, tables, classe) => {
        const res = await creerDefi({ type: type.id, tables, classe });
        if (!res.ok) return res;
        setDefiInfo({ defi_id: res.data.defi_id, code: res.data.code, type: type.id, tables });
        setChallengeType(type);
        setPhase('defi-code');
        return res;
    }, []);

    // --- PHASES ---

    if (phase === 'select') {
        return (
            <ChallengeSelect
                onBack={onBack}
                onSelect={(type) => { setChallengeType(type); setPhase('config'); }}
                joinCode={joinCode}
                setJoinCode={setJoinCode}
                onJoin={handleJoin}
                onViewDefi={(defiId) => {
                    setDefiInfo({ defi_id: defiId });
                    setPhase('defi-leaderboard');
                }}
                estProf={estProf}
                onGo={onGo}
            />
        );
    }

    if (phase === 'config') {
        return (
            <ChallengeConfig
                type={challengeType}
                setType={setChallengeType}
                tables={selectedTables}
                setTables={setSelectedTables}
                plafond={plafond}
                estProf={estProf}
                onBack={() => { setPreSelectedClasse(null); if (estProf) onBack?.(); else setPhase('select'); }}
                onStart={(tables) => {
                    if (tables) setSelectedTables(tables);
                    setPhase('play');
                }}
                onCreateDefi={handleCreateDefi}
                initialClasse={preSelectedClasse}
            />
        );
    }

    if (phase === 'play') {
        return (
            <ChallengePlay
                type={challengeType}
                tables={selectedTables}
                maitrise={maitriseProp}
                onQuit={() => setPhase('select')}
                onDone={handleDone}
            />
        );
    }

    if (phase === 'defi-intro') {
        return (
            <DefiIntro
                defiInfo={defiInfo}
                challengeType={challengeType}
                onStart={() => setPhase('defi-play')}
                onBack={() => setPhase('select')}
            />
        );
    }

    if (phase === 'defi-play') {
        return (
            <ChallengePlay
                type={challengeType}
                tables={selectedTables}
                maitrise={null}
                defiQuestions={defiInfo?.questions}
                defiDureeS={defiInfo?.duree_s}
                onQuit={() => setPhase('select')}
                onDone={handleDoneDefi}
            />
        );
    }

    if (phase === 'defi-code') {
        return (
            <DefiCodeScreen
                defiInfo={defiInfo}
                estProf={estProf}
                onStart={() => setPhase('defi-leaderboard')}
                onBack={() => setPhase('select')}
            />
        );
    }

    if (phase === 'defi-results' || phase === 'defi-leaderboard') {
        return (
            <DefiLeaderboard
                defiId={defiInfo?.defi_id}
                defiInfo={defiInfo}
                result={result}
                type={challengeType}
                estProf={estProf}
                envoiDefi={envoiDefi}
                onRetry={() => envoiDefi?.payload && envoyerDefi(envoiDefi.payload)}
                onHome={() => { setDefiInfo(null); setEnvoiDefi(null); setPhase('select'); }}
                onBack={onBack}
                onOpenGrid={() => onGo?.('profile')}
            />
        );
    }

    // phase === 'results' (solo)
    return (
        <ChallengeResults
            type={challengeType}
            result={result}
            serverResult={serverResult}
            ancienPlafond={plafond}
            onReplay={() => { setServerResult(null); setPhase('play'); }}
            onHome={() => setPhase('select')}
            onBack={onBack}
        />
    );
}

/* ===================== SELECT ===================== */

function ChallengeSelect({ onBack, onSelect, joinCode, setJoinCode, onJoin, onViewDefi, estProf, onGo }) {
    const [joinError, setJoinError] = useState(null);
    const [joinLoading, setJoinLoading] = useState(false);
    const [joinDefiId, setJoinDefiId] = useState(null); // for deja_joue → show leaderboard

    const handleJoin = async () => {
        if (joinCode.length < 5) return;
        setJoinError(null);
        setJoinLoading(true);
        try {
            const res = await onJoin(joinCode);
            if (!res.ok) {
                const raison = res.data?.raison || res.raison || 'inconnu';
                if (raison === 'deja_joue') {
                    setJoinDefiId(res.data?.defi_id || null);
                    setJoinError('Tu as déjà participé à ce défi.');
                } else if (raison === 'ferme') {
                    setJoinError('Ce défi est terminé.');
                } else {
                    setJoinError("Ce code n'existe pas. Vérifie les lettres.");
                }
            }
        } catch {
            setJoinError('Erreur réseau.');
        }
        setJoinLoading(false);
    };

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <h1 className="font-display" style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)' }}>
                    ⚔️ Défis
                </h1>
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                    Choisis ton type de défi
                </p>
            </div>

            {/* Rejoindre un défi */}
            <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                        type="text"
                        maxLength={5}
                        value={joinCode}
                        autoCapitalize="characters"
                        onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-HJ-KM-NP-Z2-9]/g, '').slice(0, 5))}
                        placeholder="CODE à 5 lettres"
                        style={{
                            flex: 1, padding: '12px 16px', borderRadius: 14,
                            border: '2px solid var(--border)', fontSize: 20,
                            fontFamily: 'var(--font-display)', textAlign: 'center',
                            letterSpacing: 6, textTransform: 'uppercase', outline: 'none',
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
                    />
                    <button
                        className="btn btn--gold"
                        disabled={joinCode.length < 5 || joinLoading}
                        style={{ padding: '12px 20px', fontSize: 16, whiteSpace: 'nowrap' }}
                        onClick={handleJoin}
                    >
                        {joinLoading ? '⏳' : 'Rejoindre'}
                    </button>
                </div>
                {joinError && (
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral)', marginTop: 8, textAlign: 'center' }}>
                        {joinError}
                        {joinDefiId && (
                            <button
                                className="btn btn--ghost"
                                style={{ fontSize: 12, marginLeft: 8, padding: '4px 10px' }}
                                onClick={() => onViewDefi?.(joinDefiId)}
                            >
                                Voir le classement
                            </button>
                        )}
                    </p>
                )}
                <div style={{ textAlign: 'center', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <button
                        className="btn btn--ghost"
                        style={{ fontSize: 13, padding: '4px 12px', color: 'var(--gris)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() => onGo?.('mes-defis')}
                    >
                        <IconDefisPasses size={16} color="var(--indigo)" actionColor="var(--ciel)" /> Mes défis passés
                    </button>
                </div>
            </div>

            {CHALLENGE_TYPES.map(type => (
                <button
                    key={type.id}
                    className="mode-card"
                    style={{
                        background: 'var(--surface)',
                        color: 'var(--indigo-encre)',
                        border: '2px solid var(--bordure)',
                        boxShadow: '0 8px 20px rgba(32,34,107,.08)',
                        marginTop: 10,
                    }}
                    onClick={() => onSelect(type)}
                >
                    <span className="mode-card__emoji" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ModeIcon mode={type.id} size={40} color="var(--indigo)" actionColor="var(--ciel)" />
                    </span>
                    <span>
                        <div className="mode-card__title" style={{ fontSize: 20, color: 'var(--indigo)' }}>
                            {type.name}
                            {type.shareable && (
                                <span style={{
                                    fontSize: 11, fontWeight: 700, background: 'var(--ciel-pale)', color: 'var(--indigo)',
                                    borderRadius: 8, padding: '2px 8px', marginLeft: 8, verticalAlign: 'middle',
                                }}>
                                    En défi
                                </span>
                            )}
                        </div>
                        <div className="mode-card__desc" style={{ color: 'var(--gris)' }}>{type.desc}</div>
                    </span>
                </button>
            ))}
        </div>
    );
}

/* ===================== CONFIG ===================== */

function ChallengeConfig({ type, setType, tables, setTables, plafond, estProf, onBack, onStart, onCreateDefi, initialClasse }) {
    if (estProf) {
        return (
            <ChallengeConfigProf
                type={type}
                setType={setType}
                tables={tables}
                setTables={setTables}
                onBack={onBack}
                onCreateDefi={onCreateDefi}
                initialClasse={initialClasse}
            />
        );
    }

    const isClimb = type.id === 'climb';
    const availableTables = ALL_TABLES.filter(t => t >= 2 && t <= Math.max(10, plafond));

    const toggle = (t) => {
        if (t > plafond) return;
        setTables(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
    };

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Retour</button>

            <div className="card" style={{ textAlign: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 48 }}>{type.emoji}</span>
                <h2 className="font-display" style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>
                    {type.name}
                </h2>
                <p style={{ color: 'var(--gris)', fontWeight: 700, fontSize: 14 }}>
                    {type.desc}
                </p>
            </div>

            {!isClimb && (
                <div className="card" style={{ marginBottom: 14 }}>
                    <h3 className="font-display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>
                        Tables du défi
                    </h3>
                    <div className="chips">
                        {availableTables.map(t => {
                            const locked = t > plafond;
                            return (
                                <button
                                    key={t}
                                    className={`chip${tables.includes(t) ? ' chip--gold' : ''}`}
                                    style={{
                                        opacity: locked ? 0.4 : 1,
                                        cursor: locked ? 'not-allowed' : 'pointer'
                                    }}
                                    onClick={() => toggle(t)}
                                    title={locked ? 'Débloque en Montée des tables' : ''}
                                >
                                    {locked ? `🔒 ${t}` : t}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconDocument size={18} color="var(--indigo)" /> Règles
                </h3>
                {type.id === 'sprint' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--gris)' }}>
                        <li>20 questions, 3s par question</li>
                        <li>1er essai = 1 pt, rattrapé = ½ pt</li>
                        <li>Le plus rapide gagne — chaque erreur ajoute 3 secondes</li>
                    </ul>
                )}
                {type.id === 'flawless' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--gris)' }}>
                        <li>Questions en flux continu</li>
                        <li>La première erreur t'arrête !</li>
                        <li>Pas de chrono par question</li>
                    </ul>
                )}
                {type.id === 'countdown' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--gris)' }}>
                        <li>2 minutes chrono, 3s par question</li>
                        <li>1er essai = 1 pt, rattrapé = ½ pt</li>
                        <li>Maximum de points !</li>
                    </ul>
                )}
                {type.id === 'climb' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--gris)' }}>
                        <li>Commence à la table 2, 3s par question</li>
                        <li>5 questions par palier, ≥4 justes pour passer</li>
                        <li>Débloque les tables supérieures !</li>
                    </ul>
                )}
            </div>

            <button
                className="btn btn--gold"
                style={{ width: '100%', fontSize: 22, padding: 16 }}
                disabled={!isClimb && tables.length === 0}
                onClick={() => onStart(tables)}
            >
                Jouer seul ⚔️
            </button>
        </div>
    );
}

function ChallengeConfigProf({ type, setType, tables, setTables, onBack, onCreateDefi, initialClasse }) {
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState(null);
    const [classes, setClasses] = useState([]);
    const [selectedClasse, setSelectedClasse] = useState(initialClasse || null);
    const [apercu, setApercu] = useState(null);
    const [openingPlafond, setOpeningPlafond] = useState(false);
    const [showNoms, setShowNoms] = useState(false);
    const [nomsHorsPlafond, setNomsHorsPlafond] = useState([]);
    const [loadingNoms, setLoadingNoms] = useState(false);

    // Modes autorisés en défi : sprint et countdown
    const currentModeId = type?.id === 'countdown' ? 'countdown' : 'sprint';

    useEffect(() => {
        listeClasses().then(res => {
            if (res.ok && res.data) {
                setClasses(res.data);
                if (initialClasse) {
                    setSelectedClasse(initialClasse);
                } else if (res.data.length > 0 && selectedClasse === null) {
                    setSelectedClasse(res.data[0].classe);
                }
            }
        });
    }, [initialClasse]);

    // Recharger l'aperçu classe dès que classe ou tables changent
    useEffect(() => {
        let active = true;
        if (selectedClasse && tables.length > 0) {
            apercuDefiClasse(selectedClasse, tables).then(res => {
                if (active && res.ok) {
                    setApercu(res.data);
                }
            }).catch(() => {});
        } else {
            setApercu(null);
        }
        return () => { active = false; };
    }, [selectedClasse, tables]);

    // Recharger les noms hors plafond dès que classe ou tables changent si le panneau est ouvert
    useEffect(() => {
        let active = true;
        if (showNoms && selectedClasse && tables.length > 0) {
            setLoadingNoms(true);
            elevesHorsPlafond(selectedClasse, tables).then(res => {
                if (active && res.ok && res.data) {
                    setNomsHorsPlafond(res.data);
                }
                if (active) setLoadingNoms(false);
            }).catch(() => {
                if (active) setLoadingNoms(false);
            });
        }
        return () => { active = false; };
    }, [showNoms, selectedClasse, tables]);

    const toggle = (t) => {
        setTables(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
    };

    const highestTable = tables.length > 0 ? Math.max(...tables) : 2;

    const handleToggleVoirQui = async () => {
        if (!showNoms) {
            setShowNoms(true);
            setLoadingNoms(true);
            const res = await elevesHorsPlafond(selectedClasse, tables);
            if (res.ok && res.data) {
                setNomsHorsPlafond(res.data);
            }
            setLoadingNoms(false);
        } else {
            setShowNoms(false);
        }
    };

    const handleOuvrirTableAClass = async () => {
        if (!selectedClasse) return;
        setOpeningPlafond(true);
        const res = await definirPlafondClasse(selectedClasse, highestTable);
        setOpeningPlafond(false);
        if (res.ok) {
            const fresh = await apercuDefiClasse(selectedClasse, tables);
            if (fresh.ok) setApercu(fresh.data);
            if (showNoms) {
                const freshNoms = await elevesHorsPlafond(selectedClasse, tables);
                if (freshNoms.ok && freshNoms.data) setNomsHorsPlafond(freshNoms.data);
            }
        }
    };

    const handleCreate = async () => {
        if (tables.length === 0 || creating) return;
        setCreating(true);
        setCreateError(null);
        const currentType = CHALLENGE_TYPES.find(t => t.id === currentModeId) || CHALLENGE_TYPES[0];
        const res = await onCreateDefi(currentType, tables, selectedClasse);
        if (!res.ok) {
            setCreateError(res.error || res.data?.message || 'Impossible de créer le défi.');
            setCreating(false);
        }
    };

    // Tables disponibles (2 à 13)
    const availableTables = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

    const modeLabel = currentModeId === 'sprint' ? 'Sprint' : 'Contre‑la‑montre';
    const durationLabel = currentModeId === 'sprint' ? '20 questions' : '2 min';
    const sortedTables = [...tables].sort((a, b) => a - b);
    const summaryText = `${modeLabel} · table${sortedTables.length > 1 ? 's' : ''} ${sortedTables.join(', ')} · ${selectedClasse || 'Sans classe'} · ${durationLabel}`;

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
            {/* 1. Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10 }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'none', border: 'none', padding: 0,
                        fontFamily: 'var(--texte)', fontSize: 21, fontWeight: 700,
                        color: 'var(--indigo-doux)', cursor: 'pointer',
                    }}
                >
                    ‹ Accueil
                </button>
                <div style={{ fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 600, color: 'var(--gris)' }}>
                    Étape 3 sur 3
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2 className="font-display" style={{ margin: 0, fontSize: 40, fontWeight: 700, color: 'var(--indigo)' }}>
                    Lancer un défi
                </h2>
                <div style={{ fontFamily: 'var(--texte)', fontSize: 18, fontWeight: 600, color: 'var(--gris)' }}>
                    Le code s'affichera en grand pour la classe.
                </div>
            </div>

            {/* 2. Le mode */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                    fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 700,
                    color: 'var(--gris)', letterSpacing: '0.14em', textTransform: 'uppercase',
                }}>
                    Le mode
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    {/* Sprint */}
                    <div
                        onClick={() => setType?.(CHALLENGE_TYPES.find(t => t.id === 'sprint'))}
                        style={{
                            flex: 1, borderRadius: 22, padding: 20, display: 'flex',
                            alignItems: 'center', gap: 14, cursor: 'pointer',
                            background: currentModeId === 'sprint' ? 'var(--action)' : 'var(--surface)',
                            boxShadow: currentModeId === 'sprint' ? 'none' : 'var(--ombre-carte)',
                        }}
                    >
                        <IconSprint
                            size={34}
                            color={currentModeId === 'sprint' ? 'var(--action-texte)' : 'var(--indigo)'}
                            actionColor={currentModeId === 'sprint' ? 'var(--action-texte)' : 'var(--action)'}
                        />
                        <div>
                            <div className="font-display" style={{
                                fontSize: 24, fontWeight: 700,
                                color: currentModeId === 'sprint' ? 'var(--action-texte)' : 'var(--indigo)',
                            }}>
                                Sprint
                            </div>
                            <div style={{
                                fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600,
                                color: currentModeId === 'sprint' ? 'var(--ciel-pale)' : 'var(--gris)',
                            }}>
                                20 questions · 3 s
                            </div>
                        </div>
                    </div>

                    {/* Contre-la-montre */}
                    <div
                        onClick={() => setType?.(CHALLENGE_TYPES.find(t => t.id === 'countdown'))}
                        style={{
                            flex: 1, borderRadius: 22, padding: 20, display: 'flex',
                            alignItems: 'center', gap: 14, cursor: 'pointer',
                            background: currentModeId === 'countdown' ? 'var(--action)' : 'var(--surface)',
                            boxShadow: currentModeId === 'countdown' ? 'none' : 'var(--ombre-carte)',
                        }}
                    >
                        <IconChrono
                            size={34}
                            color={currentModeId === 'countdown' ? 'var(--action-texte)' : 'var(--indigo)'}
                            actionColor={currentModeId === 'countdown' ? 'var(--action-texte)' : 'var(--action)'}
                        />
                        <div>
                            <div className="font-display" style={{
                                fontSize: 24, fontWeight: 700,
                                color: currentModeId === 'countdown' ? 'var(--action-texte)' : 'var(--indigo)',
                            }}>
                                Contre‑la‑montre
                            </div>
                            <div style={{
                                fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600,
                                color: currentModeId === 'countdown' ? 'var(--ciel-pale)' : 'var(--gris)',
                            }}>
                                2 minutes
                            </div>
                        </div>
                    </div>
                </div>
                <div style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                    Sans faute et Montée ne sont pas proposés : les durées varient trop pour une classe entière.
                </div>
            </div>

            {/* 3. Les tables */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                    fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 700,
                    color: 'var(--gris)', letterSpacing: '0.14em', textTransform: 'uppercase',
                }}>
                    Les tables
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                    {availableTables.map(t => {
                        const isSelected = tables.includes(t);
                        return (
                            <button
                                key={t}
                                onClick={() => toggle(t)}
                                style={{
                                    height: 76, borderRadius: 18, border: 'none', cursor: 'pointer',
                                    background: isSelected ? 'var(--action)' : 'var(--surface)',
                                    color: isSelected ? 'var(--action-texte)' : 'var(--indigo)',
                                    boxShadow: isSelected ? 'none' : 'var(--ombre-carte)',
                                    fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 32,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                {t}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 4. La classe */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                    fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 700,
                    color: 'var(--gris)', letterSpacing: '0.14em', textTransform: 'uppercase',
                }}>
                    La classe
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {classes.map(c => {
                        const isSelected = selectedClasse === c.classe;
                        return (
                            <div
                                key={c.classe}
                                onClick={() => setSelectedClasse(c.classe)}
                                style={{
                                    flex: '1 1 calc(25% - 10px)', minWidth: 140, borderRadius: 20, padding: 18,
                                    cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
                                    background: isSelected ? 'var(--indigo)' : 'var(--surface)',
                                    boxShadow: isSelected ? 'none' : 'var(--ombre-carte)',
                                }}
                            >
                                <div className="font-display" style={{
                                    fontSize: 26, fontWeight: 700,
                                    color: isSelected ? 'var(--action-texte)' : 'var(--indigo)',
                                }}>
                                    {c.classe}
                                </div>
                                <div style={{
                                    fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600,
                                    color: isSelected ? 'var(--ciel-pale)' : 'var(--gris)',
                                }}>
                                    {c.eleves_count || c.effectif || 27} élèves
                                </div>
                            </div>
                        );
                    })}
                    {/* Option Sans classe */}
                    <div
                        onClick={() => setSelectedClasse(null)}
                        style={{
                            flex: '1 1 calc(25% - 10px)', minWidth: 140, borderRadius: 20, padding: 18,
                            cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
                            background: selectedClasse === null ? 'var(--indigo)' : 'var(--surface)',
                            boxShadow: selectedClasse === null ? 'none' : 'var(--ombre-carte)',
                        }}
                    >
                        <div className="font-display" style={{
                            fontSize: 22, fontWeight: 700,
                            color: selectedClasse === null ? 'var(--action-texte)' : 'var(--indigo-doux)',
                        }}>
                            Sans classe
                        </div>
                        <div style={{
                            fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600,
                            color: selectedClasse === null ? 'var(--ciel-pale)' : 'var(--gris)',
                        }}>
                            code seul
                        </div>
                    </div>
                </div>
            </div>

            {/* 5. Avertissement si eleves_hors_plafond > 0 */}
            {selectedClasse && apercu && apercu.eleves_hors_plafond > 0 && (
                <div style={{
                    background: 'var(--orange-pale)', borderRadius: 24, padding: '22px 24px',
                    display: 'flex', alignItems: 'flex-start', gap: 16, marginTop: 6,
                }}>
                    <div style={{ width: 10, alignSelf: 'stretch', borderRadius: 5, background: 'var(--orange)', flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                        <div className="font-display" style={{ fontSize: 23, fontWeight: 700, color: 'var(--indigo-encre)' }}>
                            {apercu.eleves_hors_plafond} élève{apercu.eleves_hors_plafond > 1 ? 's' : ''} de {selectedClasse} {apercu.eleves_hors_plafond > 1 ? "n'ont" : "n'a"} pas encore la table de {highestTable}
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.45, fontWeight: 600, color: 'var(--indigo-doux)' }}>
                            {apercu.eleves_hors_plafond > 1 ? 'Ils pourront' : 'Il pourra'} jouer le défi — les questions au‑delà de {apercu.eleves_hors_plafond > 1 ? 'leur' : 'son'} plafond ne compteront pas contre {apercu.eleves_hors_plafond > 1 ? 'eux' : 'lui'}. Tu peux aussi retirer la table de {highestTable}, ou {apercu.eleves_hors_plafond > 1 ? 'leur' : 'lui'} ouvrir la {highestTable} en une action.
                        </div>
                        <div style={{ display: 'flex', gap: 18, paddingTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                                onClick={handleOuvrirTableAClass}
                                disabled={openingPlafond}
                                style={{
                                    background: 'none', border: 'none', padding: 0,
                                    fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 700,
                                    color: 'var(--indigo-encre)', cursor: 'pointer', textDecoration: 'underline',
                                }}
                            >
                                {openingPlafond ? 'Ouverture en cours…' : `Ouvrir la table de ${highestTable} à toute la classe ›`}
                            </button>
                            <button
                                onClick={handleToggleVoirQui}
                                style={{
                                    background: 'none', border: 'none', padding: 0,
                                    fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 700,
                                    color: 'var(--indigo-encre)', cursor: 'pointer', textDecoration: 'underline',
                                }}
                            >
                                {showNoms ? 'Masquer ‹' : 'Voir qui ›'}
                            </button>
                        </div>
                        {showNoms && (
                            <div style={{
                                marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(32,34,107,0.12)',
                                fontFamily: 'var(--texte)', fontSize: 15, lineHeight: 1.5, color: 'var(--indigo-doux)',
                            }}>
                                {loadingNoms ? (
                                    <span>Chargement des noms…</span>
                                ) : nomsHorsPlafond.length === 0 ? (
                                    <span>Aucun élève hors plafond.</span>
                                ) : (
                                    nomsHorsPlafond.map((e, idx) => (
                                        <React.Fragment key={e.eleve_id || idx}>
                                            {idx > 0 && ' · '}
                                            <strong style={{ color: 'var(--indigo-encre)', fontWeight: 700 }}>
                                                {e.prenom} {e.nom}
                                            </strong>{' '}
                                            <span style={{ color: 'var(--gris)' }}>(jusqu'à {e.plafond_tables})</span>
                                        </React.Fragment>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div style={{ flex: 1 }} />

            {/* 6. Bas de page : Récapitulatif + Bouton de création */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{
                    fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 600,
                    color: 'var(--gris)', textAlign: 'center',
                }}>
                    {summaryText}
                </div>
                {createError && (
                    <div style={{
                        fontSize: 14, fontWeight: 700, color: 'var(--rouge)', textAlign: 'center',
                    }}>
                        {createError}
                    </div>
                )}
                <button
                    onClick={handleCreate}
                    disabled={tables.length === 0 || creating}
                    style={{
                        height: 104, borderRadius: 26, background: 'var(--action)',
                        color: 'var(--action-texte)', fontFamily: 'var(--texte)',
                        fontWeight: 700, fontSize: 26, border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: tables.length === 0 || creating ? 0.6 : 1,
                    }}
                >
                    {creating ? 'Création en cours…' : 'Créer le défi et projeter le code'}
                </button>
            </div>
        </div>
    );
}

/* ===================== PLAY ===================== */

function ChallengePlay({ type, tables, maitrise, defiQuestions, defiDureeS, onQuit, onDone }) {
    const activeTables = tables && tables.length > 0 ? tables : [2, 3, 4, 5, 6, 7, 8, 9, 10];

    if (type.id === 'sprint') return <SprintPlay tables={activeTables} maitrise={maitrise} defiQuestions={defiQuestions} onQuit={onQuit} onDone={onDone} />;
    if (type.id === 'flawless') return <FlawlessPlay tables={activeTables} maitrise={maitrise} onQuit={onQuit} onDone={onDone} />;
    if (type.id === 'countdown') return <CountdownPlay tables={activeTables} maitrise={maitrise} defiQuestions={defiQuestions} defiDureeS={defiDureeS} onQuit={onQuit} onDone={onDone} />;
    if (type.id === 'climb') return <ClimbPlay onQuit={onQuit} onDone={onDone} />;
    return <SprintPlay tables={activeTables} maitrise={maitrise} defiQuestions={defiQuestions} onQuit={onQuit} onDone={onDone} />;
}

/* ================================================================
 * Shared hook for digit-box quiz logic with per-question timer.
 *
 * Returns everything needed to render a quiz with digit boxes,
 * a question timer bar, and first-attempt scoring.
 * ================================================================ */

function useQuizEngine({ tables, maitrise, hasQuestionTimer, defiQuestions }) {
    // En mode défi, les questions sont figées — pas de buildWeights, pas de newQuestion
    const isDefi = Array.isArray(defiQuestions) && defiQuestions.length > 0;
    const weights = useMemo(() => isDefi ? null : buildWeights(tables, maitrise || {}), [tables, maitrise, isDefi]);
    const defiIndex = useRef(0);

    const makeDefiQ = (idx) => {
        const dq = defiQuestions[idx] || defiQuestions[0];
        return { a: dq.a, b: dq.b, answer: dq.a * dq.b };
    };

    const [q, setQ] = useState(() => isDefi ? makeDefiQ(0) : newQuestion(tables, null, weights));
    const [digits, setDigits] = useState(() => Array(String(q.answer).length).fill(''));
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const [premierEssai, setPremierEssai] = useState(true);
    const [qTimerActive, setQTimerActive] = useState(false);
    const [qTimerExpired, setQTimerExpired] = useState(false);
    const lockRef = useRef(false);
    const resultatsRef = useRef([]);
    const qTimerRef = useRef(null);

    // ── Compteurs : refs pour la logique, état pour l'affichage ──
    // Une closure capturée par un setTimeout lit l'état du rendu
    // précédent : à la dernière question, le score partirait
    // amputé d'une unité. Les refs sont la seule source de vérité
    // que onDone doit lire.
    const scoreRef = useRef(0);
    const premierRef = useRef(0);
    const answeredRef = useRef(0);
    const maxStreakRef = useRef(0);
    const streakRef = useRef(0);
    const [score, setScore] = useState(0);
    const [scorePremierEssai, setScorePremierEssai] = useState(0);
    const [answered, setAnswered] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);

    const numDigits = String(q.answer).length;

    // Question timer (3s from first keypress)
    useEffect(() => {
        if (!hasQuestionTimer || !qTimerActive || qTimerExpired) return;
        qTimerRef.current = setTimeout(() => {
            setQTimerExpired(true);
        }, QUESTION_TIMER * 1000);
        return () => clearTimeout(qTimerRef.current);
    }, [hasQuestionTimer, qTimerActive, qTimerExpired]);

    const resetQuestion = useCallback((newQ) => {
        lockRef.current = false;
        setFb('idle'); setWord('');
        setPremierEssai(true);
        setQTimerActive(false); setQTimerExpired(false);
        clearTimeout(qTimerRef.current);
        setQ(newQ);
        setDigits(Array(String(newQ.answer).length).fill(''));
    }, []);

    /** Enregistre le résultat d'une question. Met à jour refs ET état.
     *  Retourne les valeurs à jour (post-incrément) pour la logique appelante. */
    const recordResult = useCallback((result) => {
        resultatsRef.current.push({ a: q.a, b: q.b, result });
        answeredRef.current += 1;
        setAnswered(a => a + 1);

        if (result === 'premier') {
            scoreRef.current += 1;
            premierRef.current += 1;
            setScore(s => s + 1);
            setScorePremierEssai(s => s + 1);
            streakRef.current += 1;
            if (streakRef.current > maxStreakRef.current) maxStreakRef.current = streakRef.current;
            setStreak(streakRef.current);
            setMaxStreak(maxStreakRef.current);
        } else if (result === 'rattrape') {
            scoreRef.current += 1;
            setScore(s => s + 1);
            streakRef.current = 0;
            setStreak(0);
        } else {
            streakRef.current = 0;
            setStreak(0);
        }

        return {
            answered: answeredRef.current,
            score: scoreRef.current,
            premier: premierRef.current,
            maxStreak: maxStreakRef.current,
        };
    }, [q]);

    const press = useCallback((d) => {
        if (lockRef.current || fb !== 'idle') return;
        setDigits(prev => {
            const idx = prev.findIndex(x => x === '');
            if (idx === -1) return prev;
            if (idx === 0 && prev.every(x => x === '') && hasQuestionTimer) {
                setQTimerActive(true);
            }
            const next = [...prev];
            next[idx] = d;
            return next;
        });
    }, [fb, hasQuestionTimer]);

    const del = useCallback(() => {
        if (lockRef.current || fb !== 'idle') return;
        setDigits(prev => {
            let idx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i] !== '') { idx = i; break; }
            }
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = '';
            return next;
        });
    }, [fb]);

    // Keyboard handler
    const onKeyRef = useRef();
    onKeyRef.current = (e) => {
        if (e.key >= '0' && e.key <= '9') press(e.key);
        else if (e.key === 'Backspace') del();
    };
    useEffect(() => {
        const handler = (e) => onKeyRef.current?.(e);
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    /** Avance à la question suivante dans la liste figée du défi.
     *  Renvoie false si la liste est épuisée. */
    const nextDefiQuestion = useCallback(() => {
        if (!isDefi) return true;
        defiIndex.current += 1;
        if (defiIndex.current >= defiQuestions.length) return false; // exhausted
        resetQuestion(makeDefiQ(defiIndex.current));
        return true;
    }, [isDefi, defiQuestions, resetQuestion]);

    return {
        q, digits, setDigits, fb, setFb, word, setWord,
        premierEssai, setPremierEssai,
        score, scorePremierEssai, answered, streak, maxStreak,
        scoreRef, premierRef, answeredRef, maxStreakRef,
        qTimerActive, qTimerExpired, setQTimerExpired, setQTimerActive,
        lockRef, resultatsRef, numDigits, weights,
        resetQuestion, recordResult, press, del,
        qTimerRef,
        isDefi, nextDefiQuestion,
    };
}

// Render digit boxes inline (used by all play modes)
function renderDigitBoxes(digits, fb, numDigits) {
    const activeIndex = digits.findIndex(d => d === '');
    return (
        <div className="digit-boxes">
            {digits.map((d, i) => (
                <div
                    key={i}
                    className={[
                        'digit-box',
                        i === activeIndex && fb === 'idle' ? 'digit-box--active' : '',
                        fb === 'correct' ? 'digit-box--correct' : '',
                        fb === 'wrong' ? 'digit-box--wrong' : '',
                        fb === 'reveal' ? 'digit-box--reveal' : '',
                    ].filter(Boolean).join(' ')}
                >
                    {d || (i === activeIndex && fb === 'idle' ? <span className="caret" /> : '')}
                </div>
            ))}
        </div>
    );
}

// Render question timer bar
function renderQuestionTimer(active, expired) {
    if (!active && !expired) return null;
    return (
        <div className="question-timer" style={{ marginTop: 8 }}>
            <i
                className={`question-timer__fill${expired ? ' question-timer__fill--warn' : ''}`}
                style={{
                    width: expired ? '0%' : (active ? '0%' : '100%'),
                    transition: active && !expired ? `width ${QUESTION_TIMER}s linear` : 'none',
                }}
                ref={(el) => {
                    // Force reflow to trigger transition
                    if (el && active && !expired) {
                        el.style.width = '100%';
                        el.getBoundingClientRect();
                        el.style.width = '0%';
                    }
                }}
            />
        </div>
    );
}
/* --- Sprint : 20 questions, 3s/question --- */
function SprintPlay({ tables, maitrise, defiQuestions, onQuit, onDone }) {
    const total = defiQuestions?.length || 20;
    const engine = useQuizEngine({ tables, maitrise, hasQuestionTimer: true, defiQuestions });
    const { q, digits, setDigits, fb, setFb, word, setWord, premierEssai, setPremierEssai,
        qTimerActive, qTimerExpired, lockRef, resultatsRef, numDigits, weights,
        score, answered,
        scoreRef, premierRef, answeredRef, maxStreakRef,
        resetQuestion, recordResult, press, del,
        isDefi, nextDefiQuestion } = engine;

    const startRef = useRef(Date.now());

    const advanceOrDone = useCallback(() => {
        if (answeredRef.current >= total) {
            onDone({
                answered: total,
                score: scoreRef.current,
                scorePremierEssai: premierRef.current,
                maxStreak: maxStreakRef.current,
                resultats: resultatsRef.current,
                time: (Date.now() - startRef.current) / 1000,
            });
        } else if (isDefi) {
            nextDefiQuestion();
        } else {
            resetQuestion(newQuestion(tables, q, weights));
        }
    }, [tables, q, weights, onDone, resetQuestion, isDefi, nextDefiQuestion, total]);

    // Handle question timer expiry → show answer then advance
    useEffect(() => {
        if (!qTimerExpired || lockRef.current) return;
        lockRef.current = true;
        setFb('reveal');
        setDigits(String(q.answer).split(''));
        setWord(`${q.a} × ${q.b} = ${q.answer}`);
        recordResult('jamais');
        const id = setTimeout(advanceOrDone, 800);
        return () => clearTimeout(id);
    }, [qTimerExpired]);

    // Handle digit completion
    useEffect(() => {
        if (fb !== 'idle' || lockRef.current) return;
        const allFilled = digits.every(d => d !== '') && digits.length === numDigits;
        if (!allFilled) return;

        const value = parseInt(digits.join(''), 10);
        const ok = value === q.answer;

        if (ok) {
            lockRef.current = true;
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            recordResult(premierEssai ? 'premier' : 'rattrape');
            setTimeout(advanceOrDone, 180);
        } else {
            setPremierEssai(false);
            setFb('wrong');
            setTimeout(() => {
                setFb('idle'); setWord('');
                setDigits(Array(numDigits).fill(''));
            }, 200);
        }
    }, [digits]);

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ModeIcon mode="sprint" size={18} /> {isDefi ? 'Défi' : 'Sprint'}
                </span>
                <span className="pill">{answered}/{total}</span>
                <span className="pill">⭐ {score}</span>
            </div>
            <div className="progress-bar" style={{ marginBottom: 16 }}>
                <i className="progress-bar__fill" style={{ width: `${(answered / total) * 100}%` }} />
            </div>
            <div className={`card card--question${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>
                {renderDigitBoxes(digits, fb, numDigits)}
                {renderQuestionTimer(qTimerActive, qTimerExpired)}
                <div className="feedback-word" style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}>
                    {word}
                </div>
            </div>
            <Keypad onPress={press} onDelete={del} />
        </div>
    );
}

/* --- Sans faute : première erreur → fin, pas de chrono question --- */
function FlawlessPlay({ tables, maitrise, onQuit, onDone }) {
    const engine = useQuizEngine({ tables, maitrise, hasQuestionTimer: false });
    const { q, digits, setDigits, fb, setFb, word, setWord,
        lockRef, resultatsRef, numDigits, weights,
        streak, scoreRef, premierRef, answeredRef, maxStreakRef,
        resetQuestion, recordResult, press, del } = engine;

    const startRef = useRef(Date.now());

    // Handle digit completion — Sans faute : first complete answer decides
    useEffect(() => {
        if (fb !== 'idle' || lockRef.current) return;
        const allFilled = digits.every(d => d !== '') && digits.length === numDigits;
        if (!allFilled) return;

        const value = parseInt(digits.join(''), 10);
        const ok = value === q.answer;

        if (ok) {
            lockRef.current = true;
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            recordResult('premier');
            setTimeout(() => {
                resetQuestion(newQuestion(tables, q, weights));
            }, 180);
        } else {
            // Game over
            lockRef.current = true;
            setFb('wrong');
            setWord(`${q.a} × ${q.b} = ${q.answer}`);
            recordResult('jamais');
            setTimeout(() => {
                const s = scoreRef.current; // = nombre de bonnes avant l'erreur
                onDone({
                    streak: s, score: s, scorePremierEssai: s,
                    answered: answeredRef.current,
                    maxStreak: maxStreakRef.current,
                    time: (Date.now() - startRef.current) / 1000,
                    lastQuestion: `${q.a}×${q.b}`,
                    resultats: resultatsRef.current,
                });
            }, 1200);
        }
    }, [digits]);

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <span className="pill" style={{
                    background: 'var(--orange)',
                    color: 'var(--action-texte)', fontSize: 20, padding: '8px 28px',
                }}>
                    🔥 {streak}
                </span>
            </div>
            <div className={`card card--question${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>
                {renderDigitBoxes(digits, fb, numDigits)}
                <div className="feedback-word" style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}>
                    {word}
                </div>
            </div>
            <Keypad onPress={press} onDelete={del} />
        </div>
    );
}

/* --- Contre-la-montre : 2 min, 3s/question --- */
function CountdownPlay({ tables, maitrise, defiQuestions, defiDureeS, onQuit, onDone }) {
    const duration = defiDureeS || 120;
    const engine = useQuizEngine({ tables, maitrise, hasQuestionTimer: true, defiQuestions });
    const { q, digits, setDigits, fb, setFb, word, setWord, premierEssai, setPremierEssai,
        qTimerActive, qTimerExpired, lockRef, resultatsRef, numDigits, weights,
        score,
        scoreRef, premierRef, answeredRef, maxStreakRef,
        resetQuestion, recordResult, press, del,
        isDefi, nextDefiQuestion } = engine;

    const [remaining, setRemaining] = useState(duration);
    const timedOut = useRef(false);

    const finishGame = useCallback(() => {
        if (timedOut.current) return;
        timedOut.current = true;
        onDone({
            score: scoreRef.current,
            scorePremierEssai: premierRef.current,
            answered: answeredRef.current,
            maxStreak: maxStreakRef.current,
            time: duration, resultats: resultatsRef.current,
        });
    }, [onDone, duration]);

    // Global countdown
    useEffect(() => {
        const id = setInterval(() => {
            setRemaining(r => {
                if (r <= 1) {
                    clearInterval(id);
                    setTimeout(finishGame, 0);
                    return 0;
                }
                return r - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [finishGame]);

    const advanceQuestion = useCallback(() => {
        if (timedOut.current) return;
        if (isDefi) {
            const hasMore = nextDefiQuestion();
            if (!hasMore) finishGame(); // 120 questions épuisées
        } else {
            resetQuestion(newQuestion(tables, q, weights));
        }
    }, [tables, q, weights, resetQuestion, isDefi, nextDefiQuestion, finishGame]);

    // Question timer expiry
    useEffect(() => {
        if (!qTimerExpired || lockRef.current || timedOut.current) return;
        lockRef.current = true;
        setFb('reveal');
        setDigits(String(q.answer).split(''));
        setWord(`${q.a} × ${q.b} = ${q.answer}`);
        recordResult('jamais');
        const id = setTimeout(advanceQuestion, 800);
        return () => clearTimeout(id);
    }, [qTimerExpired]);

    // Digit completion
    useEffect(() => {
        if (fb !== 'idle' || lockRef.current || timedOut.current) return;
        const allFilled = digits.every(d => d !== '') && digits.length === numDigits;
        if (!allFilled) return;

        const value = parseInt(digits.join(''), 10);
        const ok = value === q.answer;

        if (ok) {
            lockRef.current = true;
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            recordResult(premierEssai ? 'premier' : 'rattrape');
            setTimeout(advanceQuestion, 180);
        } else {
            setPremierEssai(false);
            setFb('wrong');
            setTimeout(() => {
                setFb('idle'); setWord('');
                setDigits(Array(numDigits).fill(''));
            }, 200);
        }
    }, [digits]);

    const timerWarn = remaining <= 10;

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="pill">{isDefi ? '⚔️ Défi' : '⭐'} {score}</span>
                <TimerRing seconds={remaining} total={duration} warn={timerWarn} />
            </div>
            <div className="progress-bar" style={{ marginBottom: 16 }}>
                <i
                    className={`progress-bar__fill${timerWarn ? ' progress-bar__fill--warn' : ''}`}
                    style={{ width: `${(remaining / duration) * 100}%`, transition: 'width 1s linear' }}
                />
            </div>
            <div className={`card card--question${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>
                {renderDigitBoxes(digits, fb, numDigits)}
                {renderQuestionTimer(qTimerActive, qTimerExpired)}
                <div className="feedback-word" style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}>
                    {word}
                </div>
            </div>
            <Keypad onPress={press} onDelete={del} />
        </div>
    );
}

/* --- Montée des tables : palier par palier, 3s/question --- */
function ClimbPlay({ onQuit, onDone }) {
    const [currentTable, setCurrentTable] = useState(2);
    const [questionsInLevel, setQuestionsInLevel] = useState(0);
    const [correctInLevel, setCorrectInLevel] = useState(0);
    const [levelMsg, setLevelMsg] = useState('');

    const engine = useQuizEngine({ tables: [currentTable], maitrise: {}, hasQuestionTimer: true });
    const { q, digits, setDigits, fb, setFb, word, setWord, premierEssai, setPremierEssai,
        qTimerActive, qTimerExpired, lockRef, resultatsRef, numDigits,
        scoreRef, premierRef, answeredRef, maxStreakRef,
        resetQuestion, recordResult, press, del } = engine;

    const startRef = useRef(Date.now());

    const handleLevelEnd = useCallback((nextQ, nextCorrect) => {
        if (nextQ >= 5) {
            if (nextCorrect >= 4) {
                const nextTable = currentTable + 1;
                if (nextTable > 20) {
                    onDone({
                        highestTable: 20,
                        score: scoreRef.current,
                        scorePremierEssai: premierRef.current,
                        answered: answeredRef.current,
                        maxStreak: maxStreakRef.current,
                        time: (Date.now() - startRef.current) / 1000,
                        perfect: true, resultats: resultatsRef.current,
                    });
                } else {
                    setCurrentTable(nextTable);
                    setQuestionsInLevel(0); setCorrectInLevel(0);
                    setLevelMsg(`Table ${nextTable} !`);
                    setTimeout(() => setLevelMsg(''), 1500);
                    resetQuestion(newQuestion([nextTable], null, null));
                }
            } else {
                onDone({
                    highestTable: currentTable - 1,
                    score: scoreRef.current,
                    scorePremierEssai: premierRef.current,
                    answered: answeredRef.current,
                    maxStreak: maxStreakRef.current,
                    time: (Date.now() - startRef.current) / 1000,
                    perfect: false, resultats: resultatsRef.current,
                });
            }
            return true;
        }
        return false;
    }, [currentTable, onDone, resetQuestion]);

    const recordAndAdvance = useCallback((result) => {
        recordResult(result); // refs updated synchronously
        const nextQ = questionsInLevel + 1;
        const nextCorrect = correctInLevel + (result !== 'jamais' ? 1 : 0);
        setQuestionsInLevel(nextQ);
        setCorrectInLevel(nextCorrect);

        const delay = result === 'premier' ? 180 : 800;
        setTimeout(() => {
            if (!handleLevelEnd(nextQ, nextCorrect)) {
                resetQuestion(newQuestion([currentTable], q, null));
            }
        }, delay);
    }, [q, questionsInLevel, correctInLevel, currentTable, handleLevelEnd, resetQuestion, recordResult]);

    // Question timer expiry
    useEffect(() => {
        if (!qTimerExpired || lockRef.current) return;
        lockRef.current = true;
        setFb('reveal');
        setDigits(String(q.answer).split(''));
        setWord(`${q.a} × ${q.b} = ${q.answer}`);
        recordAndAdvance('jamais');
    }, [qTimerExpired]);

    // Digit completion
    useEffect(() => {
        if (fb !== 'idle' || lockRef.current) return;
        const allFilled = digits.every(d => d !== '') && digits.length === numDigits;
        if (!allFilled) return;

        const value = parseInt(digits.join(''), 10);
        const ok = value === q.answer;

        if (ok) {
            lockRef.current = true;
            setFb('correct');
            setWord('✓');
            recordAndAdvance(premierEssai ? 'premier' : 'rattrape');
        } else {
            setPremierEssai(false);
            setFb('wrong');
            setTimeout(() => {
                setFb('idle'); setWord('');
                setDigits(Array(numDigits).fill(''));
            }, 200);
        }
    }, [digits]);

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="pill" style={{ background: 'var(--indigo-doux)', color: 'var(--action-texte)' }}>
                    Table {currentTable}
                </span>
                <span className="pill">{questionsInLevel}/5</span>
                <span className="pill" style={{ color: 'var(--succes)' }}>{correctInLevel} justes</span>
            </div>

            <div style={{ display: 'flex', gap: 3, marginBottom: 16 }}>
                {ALL_TABLES.slice(1).map(t => (
                    <div key={t} style={{
                        flex: 1, height: 8, borderRadius: 4,
                        background: t < currentTable ? 'var(--mint)' : t === currentTable ? 'var(--gold)' : 'var(--border)',
                        transition: 'background 0.3s',
                    }} />
                ))}
            </div>

            {levelMsg && (
                <div className="font-display anim-pop" style={{
                    textAlign: 'center', fontSize: 24, fontWeight: 800, color: 'var(--gold)',
                    marginBottom: 12
                }}>
                    {levelMsg}
                </div>
            )}

            <div className={`card card--question${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>
                {renderDigitBoxes(digits, fb, numDigits)}
                {renderQuestionTimer(qTimerActive, qTimerExpired)}
                <div className="feedback-word" style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}>
                    {word}
                </div>
            </div>
            <Keypad onPress={press} onDelete={del} />
        </div>
    );
}

/* ===================== RESULTS ===================== */

function ChallengeResults({ type, result, serverResult, ancienPlafond, onReplay, onHome, onBack }) {
    const badges = serverResult?.nouveaux_badges || [];
    const enAttente = serverResult?.enAttente;
    const nouveauPlafond = serverResult?.plafond_tables || null;

    const isSuccess = useMemo(() => {
        if (!result) return false;
        if (type.id === 'sprint') return (result.scorePremierEssai || 0) >= 16;
        if (type.id === 'flawless') return (result.streak || 0) >= 10;
        if (type.id === 'countdown') return (result.score || 0) >= 15;
        if (type.id === 'climb') return (result.highestTable || 0) >= 10 || result.perfect;
        return false;
    }, [type.id, result]);

    useEffect(() => {
        if (isSuccess) {
            import('canvas-confetti').then(mod => {
                const style = getComputedStyle(document.documentElement);
                const colors = ['--mosaique-1', '--mosaique-2', '--mosaique-3', '--mosaique-4', '--mosaique-5']
                    .map(v => style.getPropertyValue(v).trim())
                    .filter(Boolean);
                mod.default({
                    particleCount: 100, spread: 70, origin: { y: 0.6 },
                    colors: colors.length ? colors : undefined,
                });
            }).catch(() => { });
        }
    }, [isSuccess]);

    const targetScore = result ? (result.scorePremierEssai ?? result.score ?? 0) : 0;
    const [countScore, setCountScore] = useState(0);
    useEffect(() => {
        if (targetScore <= 0) return;
        let cur = 0;
        const step = Math.max(16, Math.floor(600 / targetScore));
        const id = setInterval(() => {
            cur += 1;
            setCountScore(cur);
            if (cur >= targetScore) clearInterval(id);
        }, step);
        return () => clearInterval(id);
    }, [targetScore]);

    if (!result) return null;

    const rattrapees = (result.score || 0) - (result.scorePremierEssai || 0);

    return (
        <div className="screen-enter">
            <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 64, marginBottom: 8 }}>
                    {isSuccess ? '🏆' : '💪'}
                </div>

                <h2 className="font-display" style={{ fontSize: 26, fontWeight: 800 }}>
                    {type.id === 'sprint' && `Sprint terminé !`}
                    {type.id === 'flawless' && `Série de ${result.streak || result.maxStreak} !`}
                    {type.id === 'countdown' && `${result.score} points !`}
                    {type.id === 'climb' && (result.perfect ? 'Toutes les tables maîtrisées ! 🎉' : `Table ${result.highestTable} atteinte !`)}
                </h2>

                {/* Deux chiffres — premier coup + rattrapées */}
                <div style={{
                    background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)',
                    padding: '16px 12px', margin: '14px 0',
                }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--mint-dk)' }}>
                        {countScore} / {result.answered}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-soft)' }}>
                        du premier coup
                    </div>
                    {rattrapees > 0 && (
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sun)', marginTop: 4 }}>
                            +{rattrapees} rattrapée{rattrapees > 1 ? 's' : ''} au 2ᵉ essai
                        </div>
                    )}
                </div>

                <div className="stat-grid" style={{ marginTop: 16 }}>
                    {type.id === 'sprint' && (
                        <div className="stat">
                            <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>{result.time?.toFixed(1)}s</span>
                            <span className="stat__label">Temps total</span>
                        </div>
                    )}
                    {type.id === 'flawless' && (
                        <>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--gold)' }}>🔥 {result.streak || result.maxStreak}</span>
                                <span className="stat__label">Sans faute</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--coral)' }}>{result.lastQuestion}</span>
                                <span className="stat__label">Stoppé par</span>
                            </div>
                        </>
                    )}
                    {type.id === 'countdown' && (
                        <div className="stat">
                            <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>{result.answered}</span>
                            <span className="stat__label">Questions</span>
                        </div>
                    )}
                    {type.id === 'climb' && (
                        <div className="stat">
                            <span className="stat__value" style={{ color: 'var(--purple)' }}>🧗 {result.highestTable}</span>
                            <span className="stat__label">Plus haute table</span>
                        </div>
                    )}
                </div>

                {badges.length > 0 && (
                    <div style={{
                        textAlign: 'center', background: 'var(--orange-pale)',
                        borderRadius: 'var(--r-touche)', padding: 16, marginTop: 16, marginBottom: 16,
                        border: '2px solid var(--orange)',
                    }}>
                        <p className="font-display" style={{ fontWeight: 800, marginBottom: 8, color: 'var(--orange)' }}>
                            🏅 Nouveau{badges.length > 1 ? 'x' : ''} badge{badges.length > 1 ? 's' : ''} !
                        </p>
                        {badges.map((b, i) => (
                            <div key={i} className="anim-pop" style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                                {b.emoji || '🏅'} {b.nom || b}
                            </div>
                        ))}
                    </div>
                )}

                {type.id === 'climb' && nouveauPlafond && ancienPlafond && nouveauPlafond > ancienPlafond && (
                    <div className="anim-pop" style={{
                        textAlign: 'center', background: 'var(--vert-pale)',
                        borderRadius: 'var(--r-touche)', padding: 16, marginTop: 16, marginBottom: 16,
                        border: '2px solid var(--vert)',
                    }}>
                        <p className="font-display" style={{ fontWeight: 800, fontSize: 20, color: 'var(--succes)' }}>
                            Table {nouveauPlafond} débloquée !
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 600, marginTop: 4 }}>
                            Tu peux maintenant t'entraîner sur la table {nouveauPlafond} en mode libre.
                        </p>
                    </div>
                )}

                {enAttente && (
                    <p style={{
                        fontSize: 13, color: 'var(--text-soft)', fontWeight: 600,
                        textAlign: 'center', marginTop: 14, marginBottom: 14,
                    }}>
                        Résultat en attente d'envoi — il partira dès que le réseau sera de retour.
                    </p>
                )}

                <button className="btn btn--gold" style={{ width: '100%', marginTop: 16, marginBottom: 10 }} onClick={onReplay}>
                    Relancer
                </button>
                <button className="btn btn--ghost" style={{ width: '100%', marginBottom: 10 }} onClick={onHome}>
                    Autres défis
                </button>
                <button className="btn-back" onClick={onBack}>‹ Accueil</button>
            </div>
        </div>
    );
}

/* ===================== DEFI CODE SCREEN (Maquette 9) ===================== */
/* Le code projeté au tableau — lu du fond de la salle, 1280 × 720.
   Rafraîchissement live des présents toutes les 3,5s et écoute temps réel.
   Compteur rejoints, avatars grisés à la fin, prénom d'arrivée. */

function DefiCodeScreen({ defiInfo, estProf, onStart, onBack }) {
    const [avancement, setAvancement] = useState(null);
    const [presents, setPresents] = useState([]);

    const defiId = defiInfo?.defi_id;

    // Rafraîchissement régulier toutes les 3 à 5 secondes + temps réel
    useEffect(() => {
        if (!defiId) return;
        let actif = true;

        const rafraichir = async () => {
            try {
                const [resAvance, resPresents] = await Promise.all([
                    avancementDefi(defiId),
                    presentsDefi(defiId),
                ]);
                if (actif && resAvance.ok) setAvancement(resAvance.data);
                if (actif && resPresents.ok && resPresents.data) setPresents(resPresents.data);
            } catch (e) {
                console.error('Erreur rafraîchissement défi:', e);
            }
        };

        rafraichir();
        const interval = setInterval(rafraichir, 3500);
        const unsub = suivreDefi(defiId, () => {
            if (actif) rafraichir();
        });

        return () => {
            actif = false;
            clearInterval(interval);
            if (typeof unsub === 'function') unsub();
        };
    }, [defiId]);

    // Formatage du code en 5 caractères
    const codeLetters = (defiInfo?.code || '?????').toUpperCase().slice(0, 5).split('');

    // Données d'en-tête
    const auteur = avancement?.auteur_nom || defiInfo?.auteur_nom || (estProf ? 'mon professeur' : 'Défi');
    const classe = avancement?.classe || defiInfo?.classe || null;
    const modeKey = defiInfo?.type || 'sprint';
    const modeLabel = modeKey === 'countdown' ? 'Contre‑la‑montre' : 'Sprint';

    const formatTablesLabel = (tbls) => {
        if (!tbls || !tbls.length) return 'toutes les tables';
        const sorted = [...tbls].sort((a, b) => a - b);
        if (sorted.length > 2) {
            const isContiguous = sorted.every((t, i) => i === 0 || t === sorted[i - 1] + 1);
            if (isContiguous) {
                return `tables ${sorted[0]} à ${sorted[sorted.length - 1]}`;
            }
        }
        return `table${sorted.length > 1 ? 's' : ''} ${sorted.join(', ')}`;
    };
    const tablesLabel = formatTablesLabel(defiInfo?.tables);

    // Compteur de présents : vient de rejoints (jamais négatif)
    const rejoints = avancement?.rejoints ?? 0;

    // Débordement d'affichage des prénoms
    const maxVisible = 6;
    const visiblePresents = presents.slice(0, maxVisible);
    const nbAutres = Math.max(0, rejoints - visiblePresents.length);

    return (
        <div className="screen-enter" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', width: '100%', minHeight: '80vh',
            boxSizing: 'border-box',
        }}>
            <div style={{
                width: '100%', maxWidth: 1280, minHeight: 720,
                background: 'var(--indigo)', borderRadius: 20,
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                position: 'relative', boxShadow: '0 16px 40px rgba(32, 34, 107, 0.28)',
                boxSizing: 'border-box',
            }}>

                {/* En-tête : Logo matHo avec mosaïque + Métadonnées + Compteur connectés */}
                <div style={{
                    padding: '40px clamp(20px, 4vw, 60px) 0px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    zIndex: 2, flexWrap: 'wrap', gap: 20,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                        {/* Décoration mosaïque 3x3 */}
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(3, 26px)', gap: 8, opacity: 0.9,
                            flexShrink: 0,
                        }}>
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--rouge)' }} />
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--orange)' }} />
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--vert)' }} />
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--orange)' }} />
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--ciel)' }} />
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--rouge)' }} />
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--vert)' }} />
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--ciel)' }} />
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--action-texte)', opacity: 0.25 }} />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                                fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 34,
                                color: 'var(--action-texte)',
                            }}>
                                matHo
                            </div>
                            <div style={{
                                fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 20,
                                color: 'var(--indigo-clair)',
                            }}>
                                Défi de {auteur} · {classe ? `${classe} · ` : ''}{modeLabel}, {tablesLabel}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            background: 'rgba(255, 255, 255, 0.12)', padding: '14px 26px',
                            borderRadius: 999,
                        }}>
                            <div style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--vert)' }} />
                            <span style={{
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 24,
                                color: 'var(--action-texte)',
                            }}>
                                {rejoints} connecté{rejoints > 1 ? 's' : ''}
                            </span>
                        </div>
                        <button
                            onClick={onBack}
                            style={{
                                background: 'rgba(255, 255, 255, 0.08)', border: 'none',
                                borderRadius: 999, padding: '12px 18px', cursor: 'pointer',
                                fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 16,
                                color: 'var(--indigo-clair)',
                            }}
                            title="Quitter la projection"
                        >
                            ‹ Quitter
                        </button>
                    </div>
                </div>

                {/* Centre : « Rejoindre avec le code » + 5 cases géantes */}
                <div style={{
                    flex: '1 1 0%', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 20,
                    padding: '30px 20px', zIndex: 2,
                }}>
                    <div style={{
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 'clamp(20px, 2.4vw, 30px)',
                        color: 'var(--indigo-clair)', letterSpacing: '0.22em', textTransform: 'uppercase',
                    }}>
                        Rejoindre avec le code
                    </div>

                    <div style={{ display: 'flex', gap: 'clamp(10px, 1.8vw, 22px)', justifyContent: 'center' }}>
                        {codeLetters.map((char, i) => (
                            <div
                                key={i}
                                className="font-display"
                                style={{
                                    width: 'clamp(64px, 11vw, 150px)',
                                    height: 'clamp(84px, 14vw, 190px)',
                                    borderRadius: 'clamp(14px, 2vw, 26px)',
                                    background: 'var(--surface)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 'clamp(56px, 9vw, 130px)',
                                    fontWeight: 700, color: 'var(--indigo)',
                                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.18)',
                                    userSelect: 'all',
                                }}
                            >
                                {char}
                            </div>
                        ))}
                    </div>

                    <div style={{
                        fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 'clamp(16px, 2vw, 26px)',
                        color: 'var(--indigo-clair)',
                    }}>
                        Accueil › Défi de classe › saisir le code
                    </div>
                </div>

                {/* Bas : Avatars + Prénoms arrivés + Indication classement */}
                <div style={{
                    padding: '0px clamp(20px, 4vw, 60px) clamp(24px, 4vw, 46px)',
                    display: 'flex', alignItems: 'center', gap: 16,
                    zIndex: 2, flexWrap: 'wrap',
                }}>
                    {visiblePresents.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {visiblePresents.map((p) => (
                                <span
                                    key={p.eleve_id}
                                    style={{
                                        fontSize: 38,
                                        filter: p.a_termine ? 'grayscale(1) opacity(0.35)' : 'none',
                                        transition: 'filter 0.3s ease',
                                    }}
                                    title={`${p.prenom}${p.a_termine ? ' (a terminé)' : ''}`}
                                >
                                    {p.avatar_emoji || '👤'}
                                </span>
                            ))}
                        </div>
                    )}

                    <div style={{
                        fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 'clamp(16px, 1.8vw, 22px)',
                        color: 'var(--indigo-clair)',
                    }}>
                        {visiblePresents.length > 0 ? (
                            <>
                                {visiblePresents.map((p) => p.prenom).join(', ')}
                                {nbAutres > 0 && (
                                    <span style={{ color: 'var(--action-texte)' }}> + {nbAutres} autre{nbAutres > 1 ? 's' : ''}</span>
                                )}
                            </>
                        ) : (
                            <span style={{ fontStyle: 'italic' }}>En attente des premiers élèves…</span>
                        )}
                    </div>

                    <div style={{
                        marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16,
                    }}>
                        <span style={{
                            fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 'clamp(15px, 1.6vw, 22px)',
                            color: 'var(--indigo-clair)', fontStyle: 'italic',
                        }}>
                            Le classement s'affichera ici à la fin
                        </span>
                        <button
                            onClick={onStart}
                            style={{
                                background: 'rgba(255, 255, 255, 0.14)',
                                border: '1px solid rgba(255, 255, 255, 0.25)',
                                borderRadius: 999, padding: '10px 22px',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                                color: 'var(--action-texte)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}
                        >
                            <IconClassements size={18} color="var(--action-texte)" /> Classement
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ===================== DEFI INTRO ===================== */
/* Écran d'annonce : qui a créé ce défi ? Un élève n'aborde pas un
   travail prescrit comme un jeu entre copains — c'est le seul moment
   où on peut le lui dire. */

/* ===================== DEFI INTRO (Maquette 8) ===================== */
/* Écran d'annonce : juste avant la première question du défi */
function DefiIntro({ defiInfo, challengeType, onStart, onBack }) {
    const origine = defiInfo?.origine || 'prof';
    const auteurNom = defiInfo?.auteur_nom || null;
    const classeDefi = defiInfo?.classe || null;
    const tables = defiInfo?.tables || [2, 3, 4, 5, 6, 7, 8, 9, 10];
    const modeKey = challengeType?.id || defiInfo?.type || 'sprint';

    const modeLabels = {
        sprint: { name: 'Sprint', desc: '20 questions · 3 secondes chacune' },
        countdown: { name: 'Contre-la-montre', desc: '2 minutes · max de bonnes réponses' },
        flawless: { name: 'Sans faute', desc: 'Zéro erreur · la première te stoppe' },
        climb: { name: 'Montée', desc: 'Palier par palier' },
    };
    const modeInfo = modeLabels[modeKey] || { name: challengeType?.name || 'Défi', desc: challengeType?.desc || '' };

    const formatTables = (tbls) => {
        if (!tbls || !tbls.length) return 'Toutes les tables';
        const sorted = [...tbls].sort((a, b) => a - b);
        if (sorted.length > 2) {
            const isContiguous = sorted.every((t, i) => i === 0 || t === sorted[i - 1] + 1);
            if (isContiguous) {
                return `Tables ${sorted[0]} à ${sorted[sorted.length - 1]}`;
            }
        }
        return `Tables ${sorted.join(', ')}`;
    };

    return (
        <div className="screen-enter" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            minHeight: '80vh', boxSizing: 'border-box',
        }}>
            <div style={{
                background: 'var(--indigo)', borderRadius: 36,
                padding: 'clamp(28px, 5vh, 52px) clamp(20px, 4vw, 36px)',
                width: '100%', maxWidth: 540, position: 'relative', overflow: 'hidden',
                display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                boxShadow: '0 12px 32px rgba(32,34,107,.20)',
            }}>
                {/* Pastilles confettis tournantes en fond */}
                <div style={{ position: 'absolute', top: 22, left: 24, width: 22, height: 22, borderRadius: 5, background: 'var(--rouge)', transform: 'rotate(14deg)', opacity: 0.85, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: 72, left: 54, width: 15, height: 15, borderRadius: 4, background: 'var(--orange)', transform: 'rotate(-18deg)', opacity: 0.85, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: 28, right: 28, width: 20, height: 20, borderRadius: 5, background: 'var(--ciel)', transform: 'rotate(22deg)', opacity: 0.85, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: 82, right: 58, width: 14, height: 14, borderRadius: 4, background: 'var(--vert)', transform: 'rotate(-8deg)', opacity: 0.85, pointerEvents: 'none' }} />

                {/* Badge d'origine */}
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    background: 'rgba(255,255,255,.12)', padding: '10px 22px', borderRadius: 999,
                    marginBottom: 18,
                }}>
                    <IconApprendre size={22} color="#FFFFFF" actionColor="var(--ciel)" />
                    <span style={{
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                        color: '#FFFFFF', letterSpacing: '0.1em', textTransform: 'uppercase',
                    }}>
                        {origine === 'prof' ? 'Travail de classe' : 'Défi amical'}
                    </span>
                </div>

                {/* Titre & sous-titre */}
                <h1 className="font-display" style={{
                    fontSize: 'clamp(28px, 5vw, 42px)', lineHeight: 1.15, fontWeight: 700,
                    color: '#FFFFFF', margin: 0,
                }}>
                    {auteurNom ? `Défi de ${auteurNom}` : (origine === 'prof' ? 'Défi de classe' : 'Défi entre élèves')}
                </h1>
                <div style={{
                    fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 'clamp(17px, 2.8vw, 22px)',
                    color: '#A9AFDE', marginTop: 8,
                }}>
                    {classeDefi ? `${classeDefi} · ` : ''}aujourd'hui
                </div>

                {/* Fiche récapitulative des paramètres */}
                <div style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,.08)', borderRadius: 24,
                    padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16,
                    marginTop: 28, textAlign: 'left',
                }}>
                    {/* Ligne Mode */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <IconSprint size={34} color="var(--ciel)" actionColor="var(--ciel)" />
                        <div>
                            <div className="font-display" style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF' }}>
                                {modeInfo.name}
                            </div>
                            <div style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 15, color: '#A9AFDE' }}>
                                {modeInfo.desc}
                            </div>
                        </div>
                    </div>

                    <div style={{ height: 1, background: 'rgba(255,255,255,.14)' }} />

                    {/* Ligne Tables */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(2, 13px)', gap: 4, flexShrink: 0,
                        }}>
                            <div style={{ width: 13, height: 13, borderRadius: 3, background: 'var(--rouge)' }} />
                            <div style={{ width: 13, height: 13, borderRadius: 3, background: 'var(--orange)' }} />
                            <div style={{ width: 13, height: 13, borderRadius: 3, background: 'var(--vert)' }} />
                            <div style={{ width: 13, height: 13, borderRadius: 3, background: 'var(--ciel)' }} />
                        </div>
                        <div>
                            <div className="font-display" style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF' }}>
                                {formatTables(tables)}
                            </div>
                            <div style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 15, color: '#A9AFDE' }}>
                                {origine === 'prof' ? 'Choisies par ton professeur' : 'Choisies par ton camarade'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Consigne pédagogique */}
                <div style={{
                    fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 16, lineHeight: 1.5,
                    color: '#A9AFDE', marginTop: 24,
                }}>
                    Ton résultat apparaîtra dans le classement de la classe.<br />
                    Tu peux le rejouer, seul le premier essai compte.
                </div>

                {/* Boutons d'action */}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 32 }}>
                    <button
                        onClick={onStart}
                        style={{
                            width: '100%', height: 72, borderRadius: 22,
                            background: 'var(--action)', color: '#FFFFFF',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 22,
                            border: 'none', cursor: 'pointer',
                            boxShadow: '0 4px 14px rgba(35,164,217,0.35)',
                        }}
                    >
                        Commencer
                    </button>
                    <button
                        onClick={onBack}
                        style={{
                            width: '100%', height: 48, borderRadius: 16,
                            background: 'none', color: '#A9AFDE',
                            fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 17,
                            border: 'none', cursor: 'pointer',
                        }}
                    >
                        Plus tard
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ===================== DEFI LEADERBOARD (Maquette 4) ===================== */
/* Classement d'un défi : podium en direct, progression et liste */
export function DefiLeaderboard({ defiId, defiInfo, result, type, estProf, envoiDefi, onRetry, onHome, onBack, onOpenGrid }) {
    const [classement, setClassement] = useState([]);
    const [avancement, setAvancement] = useState(null);
    const [loading, setLoading] = useState(true);

    const charger = useCallback(async () => {
        if (!defiId) return;
        const [cls, adv] = await Promise.all([
            classementDefi(defiId),
            avancementDefi(defiId),
        ]);
        if (cls.ok) setClassement(cls.data || []);
        if (adv.ok) setAvancement(adv.data);
        setLoading(false);
    }, [defiId]);

    useEffect(() => {
        charger();
        const unsub = suivreDefi(defiId, charger);
        return unsub;
    }, [defiId, charger]);

    const code = defiInfo?.code || avancement?.code || 'DÉFI';
    const termines = avancement?.termines ?? classement.length;
    const terminesClasse = avancement?.termines_classe ?? termines;
    const attendus = avancement?.attendus ?? null;
    const classeDefi = avancement?.classe || defiInfo?.classe || null;
    const tables = defiInfo?.tables || avancement?.tables || [];
    const modeName = type?.name || defiInfo?.type || avancement?.type || 'Sprint';

    const formatTables = (tbls) => {
        if (!tbls || !tbls.length) return 'tables 2 à 10';
        const sorted = [...tbls].sort((a, b) => a - b);
        if (sorted.length > 2) {
            const isContiguous = sorted.every((t, i) => i === 0 || t === sorted[i - 1] + 1);
            if (isContiguous) {
                return `tables ${sorted[0]} à ${sorted[sorted.length - 1]}`;
            }
        }
        return `tables ${sorted.join(', ')}`;
    };

    const formatTemps = (s) => {
        if (s == null) return '';
        const total = Math.round(Number(s));
        const m = Math.floor(total / 60);
        const sec = total % 60;
        if (m > 0) return `${m}:${sec < 10 ? '0' : ''}${sec}`;
        return `${sec} s`;
    };

    const enCours = attendus != null ? Math.max(0, attendus - terminesClasse) : 0;
    const pct = attendus != null && attendus > 0 ? Math.min(100, Math.round((terminesClasse / attendus) * 100)) : 100;

    const top1 = classement[0] || null;
    const top2 = classement[1] || null;
    const top3 = classement[2] || null;
    const rest = classement.slice(3);

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* 1. Header sombre (Navy) */}
            <div style={{
                background: 'var(--indigo)', borderRadius: 32, padding: '24px 28px 28px',
                display: 'flex', flexDirection: 'column', gap: 16, color: '#FFFFFF',
                boxShadow: '0 8px 24px rgba(32,34,107,.15)',
            }}>
                {/* Ligne haute : Retour + En direct */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button
                        onClick={onHome || onBack}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
                            color: '#B9C6DD', padding: 0,
                        }}
                    >
                        ‹ Accueil
                    </button>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: 'rgba(255,255,255,.12)', padding: '6px 14px', borderRadius: 999,
                    }}>
                        <div style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--vert)' }} />
                        <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 14, color: '#FFFFFF' }}>
                            En direct
                        </span>
                    </div>
                </div>

                {/* Ligne centrale : Code & mode à gauche, compteurs à droite */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div className="font-display" style={{
                            fontSize: 40, fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.18em', lineHeight: 1.1,
                        }}>
                            {code}
                        </div>
                        <div style={{
                            fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 16, color: '#B9C6DD',
                            display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            <IconSprint size={18} color="#FFFFFF" actionColor="var(--ciel)" />
                            {modeName} · {formatTables(tables)}{classeDefi ? ` · ${classeDefi}` : ''}
                        </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div className="font-display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--ciel)', lineHeight: 1.1 }}>
                            {attendus != null ? `${terminesClasse} / ${attendus}` : `${termines}`}
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: '#B9C6DD' }}>
                            ont terminé
                        </div>
                    </div>
                </div>

                {/* Barre de progression */}
                {attendus != null && (
                    <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,.16)', overflow: 'hidden' }}>
                        <div style={{
                            width: `${pct}%`, height: '100%', background: 'var(--ciel)',
                            borderRadius: 999, transition: 'width 0.3s ease',
                        }} />
                    </div>
                )}
            </div>

            {/* Statut d'envoi du résultat si en cours / échec */}
            {envoiDefi?.etat === 'en_cours' && (
                <div className="card" style={{
                    textAlign: 'center', padding: '14px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}>
                    <div className="spinner" style={{ width: 18, height: 18 }} />
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 14, color: 'var(--gris)' }}>
                        Enregistrement de ta partie…
                    </span>
                </div>
            )}
            {envoiDefi?.etat === 'echec' && (
                <div style={{
                    background: 'var(--rouge-pale)', border: '2px solid var(--rouge-doux)',
                    borderRadius: 18, padding: '14px 16px', textAlign: 'center',
                }}>
                    <p style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 14, color: 'var(--rouge)', marginBottom: 8 }}>
                        Ta partie n'a pas été enregistrée — {envoiDefi.message || 'erreur de connexion'}
                    </p>
                    <button className="btn btn--coral" style={{ fontSize: 14, padding: '8px 20px' }} onClick={onRetry}>
                        Réessayer
                    </button>
                </div>
            )}

            {/* Résultat personnel si vient de jouer */}
            {result && (
                <div style={{
                    background: 'var(--surface)', borderRadius: 24, padding: '16px 20px',
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 12, background: 'var(--orange-pale)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                        }}>
                            ⚡
                        </div>
                        <div>
                            <div style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16, color: 'var(--indigo)' }}>
                                Ton score : {result.score} pts
                            </div>
                            <div style={{ fontFamily: 'var(--texte)', fontSize: 13, color: 'var(--gris)', fontWeight: 600 }}>
                                {result.scorePremierEssai ?? result.score} / {result.answered} du premier coup
                            </div>
                        </div>
                    </div>
                    {result.time != null && (
                        <div className="font-display" style={{ fontSize: 20, fontWeight: 700, color: 'var(--indigo)' }}>
                            {formatTemps(result.time)}
                        </div>
                    )}
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 48 }}>
                    <div className="spinner" />
                </div>
            ) : classement.length === 0 ? (
                <div style={{
                    background: 'var(--surface)', borderRadius: 28, padding: 36, textAlign: 'center',
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                }}>
                    <p style={{ fontSize: 44, margin: '0 0 12px' }}>🏜</p>
                    <p style={{ fontFamily: 'var(--texte)', color: 'var(--gris)', fontWeight: 700, fontSize: 16, margin: 0 }}>
                        Personne n'a encore terminé — le classement se remplira tout seul.
                    </p>
                </div>
            ) : (
                <>
                    {/* 2. Podium des 3 premiers (2 - 1 - 3) */}
                    <div style={{
                        display: 'flex', alignItems: 'flex-end', gap: 10,
                        padding: '12px 10px 0',
                    }}>
                        {/* Marche 2 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                            {top2 ? (
                                <>
                                    <div style={{
                                        width: 66, height: 66, borderRadius: 20, background: 'var(--ciel-pale)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34,
                                    }}>
                                        {top2.avatar || '🐼'}
                                    </div>
                                    <div style={{
                                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16, color: 'var(--indigo)',
                                        textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {top2.nom_affiche}{top2.est_moi ? ' (toi)' : ''}
                                    </div>
                                    <div style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                                        {formatTemps(top2.temps_s)}
                                    </div>
                                </>
                            ) : <div style={{ height: 110 }} />}
                            <div style={{
                                width: '100%', height: 104, borderRadius: '20px 20px 0 0', background: '#DCD4C6',
                                display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 12,
                                fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 32, color: '#FFFFFF',
                            }}>
                                2
                            </div>
                        </div>

                        {/* Marche 1 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                            <div style={{ fontSize: 26, lineHeight: 1, marginBottom: -2 }}>👑</div>
                            <div style={{
                                width: 80, height: 80, borderRadius: 24, background: 'var(--orange-pale)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40,
                            }}>
                                {top1.avatar || '🦊'}
                            </div>
                            <div style={{
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17, color: 'var(--indigo)',
                                textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {top1.nom_affiche} {top1.est_moi && <span style={{ color: 'var(--podium)' }}>(toi)</span>}
                            </div>
                            <div style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 15, color: 'var(--podium)' }}>
                                {formatTemps(top1.temps_s)}
                            </div>
                            <div style={{
                                width: '100%', height: 148, borderRadius: '22px 22px 0 0', background: 'var(--podium)',
                                display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 14,
                                fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 40, color: '#FFFFFF',
                            }}>
                                1
                            </div>
                        </div>

                        {/* Marche 3 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                            {top3 ? (
                                <>
                                    <div style={{
                                        width: 66, height: 66, borderRadius: 20, background: 'var(--vert-pale)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34,
                                    }}>
                                        {top3.avatar || '🐢'}
                                    </div>
                                    <div style={{
                                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16, color: 'var(--indigo)',
                                        textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {top3.nom_affiche}{top3.est_moi ? ' (toi)' : ''}
                                    </div>
                                    <div style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                                        {formatTemps(top3.temps_s)}
                                    </div>
                                </>
                            ) : <div style={{ height: 110 }} />}
                            <div style={{
                                width: '100%', height: 80, borderRadius: '20px 20px 0 0', background: '#E3D8C0',
                                display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 10,
                                fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 28, color: '#FFFFFF',
                            }}>
                                3
                            </div>
                        </div>
                    </div>

                    {/* 3. Liste des participants à partir du 4ᵉ */}
                    {rest.length > 0 && (
                        <div style={{
                            background: 'var(--surface)', borderRadius: 26, padding: '10px 22px',
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)', border: '1px solid var(--bordure)',
                        }}>
                            {rest.map((entry, idx) => (
                                <div
                                    key={entry.eleve_id || idx}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
                                        borderBottom: idx < rest.length - 1 ? '1px solid var(--bordure)' : 'none',
                                    }}
                                >
                                    <span className="font-display" style={{ width: 32, fontSize: 18, fontWeight: 700, color: 'var(--gris)' }}>
                                        {entry.rang || idx + 4}
                                    </span>
                                    <span style={{ fontSize: 26 }}>{entry.avatar || '🦊'}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{
                                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17, color: 'var(--indigo)',
                                        }}>
                                            {entry.nom_affiche} {entry.est_moi && <span style={{ color: 'var(--podium)' }}>(toi)</span>}
                                        </div>
                                    </div>
                                    <div style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 15, color: 'var(--gris)' }}>
                                        {entry.score} pts
                                    </div>
                                    <div className="font-display" style={{
                                        fontSize: 17, fontWeight: 700, color: 'var(--indigo)', minWidth: 50, textAlign: 'right',
                                    }}>
                                        {formatTemps(entry.temps_s)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 4. Bandeau d'état en direct */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        background: 'var(--ciel-pale)', borderRadius: 20, padding: '16px 20px',
                    }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--action)', flexShrink: 0 }} />
                        <div style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 15, color: 'var(--indigo)' }}>
                            {attendus != null && enCours > 0
                                ? `${enCours} camarade${enCours > 1 ? 's jouent' : ' joue'} encore — la liste se complète toute seule.`
                                : 'La liste se complète toute seule dès qu\'un camarade termine.'
                            }
                        </div>
                    </div>
                </>
            )}

            {/* 5. Boutons d'action inférieurs */}
            <div style={{ display: 'flex', gap: 12, marginTop: 12, marginBottom: 24 }}>
                <button
                    onClick={onOpenGrid}
                    style={{
                        flex: 1, height: 72, borderRadius: 22,
                        background: 'var(--surface)', color: 'var(--indigo)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 20,
                        border: '1px solid var(--bordure)', boxShadow: '0 4px 14px rgba(32,34,107,.08)',
                        cursor: 'pointer',
                    }}
                >
                    Ma grille
                </button>
                <button
                    onClick={onHome || onBack}
                    style={{
                        flex: 1, height: 72, borderRadius: 22,
                        background: 'var(--indigo)', color: '#FFFFFF',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 20,
                        border: 'none', cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(32,34,107,.15)',
                    }}
                >
                    Accueil
                </button>
            </div>
        </div>
    );
}
