import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { newQuestion, PRAISE, makeHint, ALL_TABLES } from '../logic/questions';
import { buildWeights, construireErreurs, construireMaitrise, cleFait } from '../logic/mastery';
import {
    enregistrerSession, enregistrerSessionProf,
    creerDefi, rejoindreDefi, terminerDefi,
    classementDefi, avancementDefi, suivreDefi,
    listeClasses, apercuDefiClasse,
} from '../api';
import Keypad from '../components/Keypad';
import TimerRing from '../components/TimerRing';
import { ModeIcon, IconDefisPasses } from '../components/Icons';
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
    const [phase, setPhase] = useState('select');
    const [challengeType, setChallengeType] = useState(null);
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
                tables={selectedTables}
                setTables={setSelectedTables}
                plafond={plafond}
                estProf={estProf}
                onBack={() => { setPreSelectedClasse(null); setPhase('select'); }}
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
                result={result}
                type={challengeType}
                estProf={estProf}
                envoiDefi={envoiDefi}
                onRetry={() => envoiDefi?.payload && envoyerDefi(envoiDefi.payload)}
                onHome={() => { setDefiInfo(null); setEnvoiDefi(null); setPhase('select'); }}
                onBack={onBack}
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

function ChallengeConfig({ type, tables, setTables, plafond, estProf, onBack, onStart, onCreateDefi, initialClasse }) {
    const isClimb = type.id === 'climb';
    const isShareable = type.shareable === true;
    const availableTables = ALL_TABLES.filter(t => t >= 2 && t <= Math.max(10, plafond));
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState(null);
    const [classes, setClasses] = useState([]);
    const [selectedClasse, setSelectedClasse] = useState(initialClasse || null);
    // Confirmation avant création quand des élèves sont hors plafond
    const [confirmInfo, setConfirmInfo] = useState(null);

    // Load classes for prof defi creation
    useEffect(() => {
        if (estProf && isShareable) {
            listeClasses().then(res => {
                if (res.ok && res.data) {
                    setClasses(res.data);
                    // Pré-sélection : initialClasse si fournie, sinon la première
                    if (!selectedClasse && res.data.length > 0) {
                        setSelectedClasse(res.data[0].classe);
                    }
                }
            });
        }
    }, [estProf, isShareable]);

    // Toute modification de tables ou de classe annule le consentement
    // précédent : le prof repasse par la vérification.
    useEffect(() => {
        setConfirmInfo(null);
    }, [tables, selectedClasse]);

    const toggle = (t) => {
        if (t > plafond) return;
        setTables(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
    };

    // Étape 1 : vérifier si des élèves sont hors plafond (prof uniquement)
    const handleCreate = async () => {
        if (tables.length === 0) return;
        setCreating(true);
        setCreateError(null);
        setConfirmInfo(null);

        // Pour un prof avec une classe, vérifier le plafond
        if (estProf && selectedClasse) {
            const apercu = await apercuDefiClasse(selectedClasse, tables);
            if (apercu.ok && apercu.data?.eleves_hors_plafond > 0) {
                setConfirmInfo(apercu.data);
                setCreating(false);
                return;
            }
        }

        // Pas de problème de plafond → créer directement
        await doCreate();
    };

    // Étape 2 : créer le défi (appelé directement ou après confirmation)
    const doCreate = async () => {
        setCreating(true);
        setConfirmInfo(null);
        const res = await onCreateDefi(type, tables, estProf ? selectedClasse : null);
        if (!res.ok) {
            setCreateError(res.error || res.data?.message || 'Impossible de créer le défi.');
            setCreating(false);
        }
    };

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Retour</button>

            <div className="card" style={{ textAlign: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 48 }}>{type.emoji}</span>
                <h2 className="font-display" style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>
                    {type.name}
                </h2>
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
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
                <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                    📋 Règles
                </h3>
                {type.id === 'sprint' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>20 questions, 3s par question</li>
                        <li>1er essai = 1 pt, rattrapé = ½ pt</li>
                        <li>⚡ Le plus rapide gagne — chaque erreur ajoute 3 secondes</li>
                    </ul>
                )}
                {type.id === 'flawless' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>Questions en flux continu</li>
                        <li>La première erreur t'arrête !</li>
                        <li>Pas de chrono par question</li>
                    </ul>
                )}
                {type.id === 'countdown' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>2 minutes chrono, 3s par question</li>
                        <li>1er essai = 1 pt, rattrapé = ½ pt</li>
                        <li>Maximum de points !</li>
                    </ul>
                )}
                {type.id === 'climb' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>Commence à la table 2, 3s par question</li>
                        <li>5 questions par palier, ≥4 justes pour passer</li>
                        <li>Débloque les tables supérieures !</li>
                    </ul>
                )}
            </div>

            {/* Classe selector for prof defi creation */}
            {estProf && isShareable && classes.length > 0 && (
                <div className="card" style={{ marginBottom: 14 }}>
                    <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                        🏫 Classe du défi
                    </h3>
                    <div className="chips">
                        {classes.map(c => (
                            <button
                                key={c.classe}
                                className={`chip${selectedClasse === c.classe ? ' chip--navy' : ''}`}
                                onClick={() => setSelectedClasse(c.classe)}
                            >
                                {c.classe}{c.est_favorite ? ' ⭐' : ''}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <button
                className="btn btn--gold"
                style={{ width: '100%', fontSize: 22, padding: 16 }}
                disabled={!isClimb && tables.length === 0}
                onClick={() => onStart(tables)}
            >
                Jouer seul ⚔️
            </button>

            {isShareable && (
                <>
                    {/* Message de confirmation si des élèves sont hors plafond */}
                    {confirmInfo && (
                        <div className="card" style={{
                            marginTop: 10, padding: '16px 20px',
                            border: '2px solid var(--sun)',
                            background: 'rgba(201,162,39,0.08)',
                        }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>
                                ⚠️ La table {confirmInfo.table_max} dépasse le niveau atteint par {confirmInfo.eleves_hors_plafond} élève{confirmInfo.eleves_hors_plafond > 1 ? 's' : ''} sur {confirmInfo.eleves_classe}.
                            </p>
                            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)', marginBottom: 12, lineHeight: 1.5 }}>
                                {confirmInfo.plafond_commun ? `Le plus faible de la classe s'arrête à la table ${confirmInfo.plafond_commun}. ` : ''}Le défi reste jouable par tous et leur score sera enregistré — ils découvriront simplement une table qu'ils n'ont pas encore débloquée par la Montée des tables.
                            </p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    className="btn btn--gold"
                                    style={{ flex: 1, fontSize: 14, padding: 12 }}
                                    onClick={doCreate}
                                    disabled={creating}
                                >
                                    {creating ? '⏳ Création…' : 'Lancer quand même'}
                                </button>
                                <button
                                    className="btn btn--ghost"
                                    style={{ flex: 1, fontSize: 14, padding: 12 }}
                                    onClick={() => setConfirmInfo(null)}
                                >
                                    Annuler
                                </button>
                            </div>
                        </div>
                    )}

                    {!confirmInfo && (
                        <button
                            className="btn btn--navy"
                            style={{ width: '100%', fontSize: 18, padding: 14, marginTop: 10 }}
                            disabled={tables.length === 0 || creating}
                            onClick={handleCreate}
                        >
                            {creating ? '⏳ Création…' : '👥 Créer un défi'}
                        </button>
                    )}
                    {createError && (
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral)', marginTop: 8, textAlign: 'center' }}>
                            {createError}
                        </p>
                    )}
                </>
            )}
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
                    background: 'linear-gradient(135deg, var(--orange-pale), var(--orange))',
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
                    setLevelMsg(`Table ${nextTable} ! 🧗`);
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
                    🧗 Table {currentTable}
                </span>
                <span className="pill">{questionsInLevel}/5</span>
                <span className="pill" style={{ color: 'var(--mint-dk)' }}>✅ {correctInLevel}</span>
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
                            🔓 Table {nouveauPlafond} débloquée !
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
                        📡 Résultat en attente d'envoi — il partira dès que le réseau sera de retour.
                    </p>
                )}

                <button className="btn btn--gold" style={{ width: '100%', marginTop: 16, marginBottom: 10 }} onClick={onReplay}>
                    Relancer ⚔️
                </button>
                <button className="btn btn--ghost" style={{ width: '100%', marginBottom: 10 }} onClick={onHome}>
                    Autres défis
                </button>
                <button className="btn-back" onClick={onBack}>‹ Accueil</button>
            </div>
        </div>
    );
}

/* ===================== DEFI CODE SCREEN ===================== */

function DefiCodeScreen({ defiInfo, estProf, onStart, onBack }) {
    const [avancement, setAvancement] = useState(null);

    // Compteur de participants en temps réel
    useEffect(() => {
        if (!defiInfo?.defi_id) return;

        // Charger une première fois
        avancementDefi(defiInfo.defi_id).then(res => {
            if (res.ok) setAvancement(res.data);
        });

        // S'abonner aux changements
        const unsub = suivreDefi(defiInfo.defi_id, () => {
            avancementDefi(defiInfo.defi_id).then(res => {
                if (res.ok) setAvancement(res.data);
            });
        });

        return unsub;
    }, [defiInfo?.defi_id]);

    const nbParticipants = avancement?.termines || 0;

    return (
        <div className="screen-enter" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: '70vh', textAlign: 'center',
        }}>
            <button className="btn-back" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
                ‹ Retour
            </button>

            <div style={{
                background: 'linear-gradient(135deg, var(--navy), var(--navy-dk))',
                borderRadius: 24, padding: estProf ? '48px 32px' : '32px 24px',
                width: '100%', maxWidth: 500, marginTop: 24,
            }}>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: estProf ? 20 : 16, marginBottom: 12 }}>
                    {estProf ? 'Saisissez ce code dans Défis' : 'Donne ce code à tes copains'}
                </p>

                <div className="font-display" style={{
                    fontSize: estProf ? 80 : 56, fontWeight: 900, color: 'var(--gold)',
                    letterSpacing: 12, userSelect: 'all',
                }}>
                    {defiInfo?.code || '?????'}
                </div>

                <div style={{
                    marginTop: 20, padding: '12px 0',
                    borderTop: '1px solid rgba(255,255,255,0.15)',
                }}>
                    <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--action-texte)' }}>
                        👥 {nbParticipants}
                    </span>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: 14, marginTop: 4 }}>
                        participant{nbParticipants !== 1 ? 's' : ''} {nbParticipants > 0 ? '' : 'pour le moment'}
                    </p>
                </div>
            </div>

            <button
                className="btn btn--gold"
                style={{ width: '100%', maxWidth: 500, fontSize: 20, padding: 16, marginTop: 20 }}
                onClick={onStart}
            >
                📊 Voir le classement
            </button>

            <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginTop: 12 }}>
                {estProf ? 'Le défi expire dans 7 jours.' : 'Le défi expire dans 24 heures.'}
            </p>
        </div>
    );
}

/* ===================== DEFI INTRO ===================== */
/* Écran d'annonce : qui a créé ce défi ? Un élève n'aborde pas un
   travail prescrit comme un jeu entre copains — c'est le seul moment
   où on peut le lui dire. */

function DefiIntro({ defiInfo, challengeType, onStart, onBack }) {
    const origine = defiInfo?.origine || null;
    const auteurNom = defiInfo?.auteur_nom || null;
    const classeDefi = defiInfo?.classe || null;
    const typeLabel = challengeType?.name || defiInfo?.type || '';
    const typeEmoji = challengeType?.emoji || '⚔️';

    return (
        <div className="screen-enter" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: '70vh', textAlign: 'center',
            padding: '0 24px',
        }}>
            <div style={{
                background: origine === 'prof'
                    ? 'linear-gradient(135deg, var(--ciel), var(--action))'
                    : 'linear-gradient(135deg, var(--orange), var(--orange-pale))',
                borderRadius: 24, padding: '40px 32px',
                width: '100%', maxWidth: 420,
            }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>
                    {origine === 'prof' ? '📚' : '🎮'}
                </div>
                <div style={{
                    fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.8)',
                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
                }}>
                    {origine === 'prof' ? 'Travail de classe' : 'Défi amical'}
                </div>
                {auteurNom && (
                    <h2 className="font-display" style={{
                        fontSize: 22, fontWeight: 800, color: 'var(--action-texte)', marginBottom: 8,
                    }}>
                        Défi de {auteurNom}
                    </h2>
                )}
                {classeDefi && origine === 'prof' && (
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                        {classeDefi}
                    </p>
                )}
                <p style={{
                    fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)',
                    marginTop: 12,
                }}>
                    {typeEmoji} {typeLabel}
                </p>
            </div>

            <button
                className="btn btn--gold"
                style={{ width: '100%', maxWidth: 420, fontSize: 20, padding: 16, marginTop: 24 }}
                onClick={onStart}
            >
                C'est parti !
            </button>

            <button className="btn-back" style={{ marginTop: 12 }} onClick={onBack}>
                ‹ Retour
            </button>
        </div>
    );
}

/* ===================== DEFI LEADERBOARD ===================== */

export function DefiLeaderboard({ defiId, result, type, estProf, envoiDefi, onRetry, onHome, onBack }) {
    const [classement, setClassement] = useState([]);
    const [avancement, setAvancement] = useState(null);
    const [loading, setLoading] = useState(true);

    const charger = useCallback(async () => {
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

        // Temps réel : recharger le classement à chaque nouveau participant
        const unsub = suivreDefi(defiId, charger);
        return unsub; // Désabonnement propre — pas d'accumulation de canaux
    }, [defiId, charger]);

    const termines = avancement?.termines || classement.length;
    const terminesClasse = avancement?.termines_classe ?? null;
    const attendus = avancement?.attendus ?? null;
    const origine = avancement?.origine || null;
    const auteurNom = avancement?.auteur_nom || null;
    const classeDefi = avancement?.classe || null;

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onHome}>‹ Défis</button>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 48 }}>🏆</div>
                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800 }}>
                    Classement du défi
                </h2>

                {/* Origine + auteur */}
                {origine && (
                    <div style={{ marginBottom: 8 }}>
                        <span style={{
                            fontSize: 12, fontWeight: 800,
                            padding: '3px 10px', borderRadius: 6,
                            background: origine === 'prof'
                                ? 'var(--ciel-pale)' : 'var(--orange-pale)',
                            color: origine === 'prof'
                                ? 'var(--action)' : 'var(--orange)',
                        }}>
                            {origine === 'prof' ? '📚 Travail de classe' : '🎮 Défi amical'}
                        </span>
                        {auteurNom && (
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-soft)', marginTop: 4 }}>
                                Défi de {auteurNom}{classeDefi ? ` — ${classeDefi}` : ''}
                            </div>
                        )}
                    </div>
                )}

                {/* Avancement */}
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                    {attendus != null
                        ? `${terminesClasse ?? 0} / ${attendus} de la ${classeDefi} ont terminé`
                        : `${termines} participant${termines !== 1 ? 's' : ''}`
                    }
                </p>
                {attendus != null && termines > (terminesClasse ?? 0) && (
                    <p style={{ color: 'var(--text-soft)', fontWeight: 600, fontSize: 12 }}>
                        + {termines - (terminesClasse ?? 0)} d'autres classes
                    </p>
                )}
            </div>

            {/* Résultat personnel si vient de jouer */}
            {result && (
                <div className="card" style={{ marginBottom: 14, textAlign: 'center' }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--gold)' }}>
                        {result.score || 0} {type?.id === 'sprint' ? 'pts' : 'pts'}
                    </div>
                    {type?.id === 'sprint' && (
                        <div style={{ fontSize: 14, color: 'var(--text-soft)', fontWeight: 600 }}>
                            en {result.time?.toFixed(1)}s
                        </div>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 600, marginTop: 4 }}>
                        {result.scorePremierEssai ?? result.score} / {result.answered} du premier coup
                    </div>
                </div>
            )}

            {/* État d'envoi du résultat */}
            {envoiDefi?.etat === 'en_cours' && (
                <div className="card" style={{
                    marginBottom: 14, textAlign: 'center', padding: '14px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}>
                    <div className="spinner" style={{ width: 18, height: 18 }} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-soft)' }}>
                        Enregistrement de ta partie…
                    </span>
                </div>
            )}
            {envoiDefi?.etat === 'echec' && (
                <div style={{
                    background: 'rgba(255,90,95,0.08)', border: '2px solid var(--coral)',
                    borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 14,
                    textAlign: 'center',
                }}>
                    <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--coral-dk)', marginBottom: 8 }}>
                        Ta partie n'a pas été enregistrée — {envoiDefi.message || 'erreur inconnue'}
                    </p>
                    <button className="btn btn--coral" style={{ fontSize: 14, padding: '8px 20px' }} onClick={onRetry}>
                        Réessayer
                    </button>
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <div className="spinner" />
                </div>
            ) : classement.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                    <p style={{ fontSize: 48 }}>🏜</p>
                    <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                        Personne n'a encore terminé — le classement se remplira tout seul.
                    </p>
                </div>
            ) : (
                <div className="card">
                    {classement.map((entry, i) => {
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
                        return (
                            <div
                                key={entry.eleve_id || i}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 8px',
                                    borderBottom: i < classement.length - 1 ? '1px solid var(--border)' : 'none',
                                    background: entry.est_moi ? 'rgba(201,162,39,0.08)' : 'transparent',
                                    borderRadius: entry.est_moi ? 10 : 0,
                                }}
                            >
                                <span style={{
                                    fontSize: medal ? 22 : 16, fontWeight: 800, minWidth: 32, textAlign: 'center',
                                    color: entry.est_moi ? 'var(--gold)' : 'var(--text-soft)',
                                }}>
                                    {medal || entry.rang || i + 1}
                                </span>
                                <span style={{ fontSize: 20 }}>{entry.avatar || '🎯'}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{
                                        fontWeight: entry.est_moi ? 800 : 700, fontSize: 15,
                                        color: entry.est_moi ? 'var(--navy)' : 'var(--text)',
                                    }}>
                                        {entry.nom_affiche || 'Anonyme'}
                                        {entry.est_moi && ' (toi)'}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>
                                        {entry.classe || ''}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--gold)' }}>
                                        {entry.score} pts
                                    </div>
                                    {entry.temps_s != null && (
                                        <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>
                                            {Number(entry.temps_s).toFixed(1)}s
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn--ghost" style={{ width: '100%' }} onClick={onHome}>
                    Autres défis
                </button>
                <button className="btn-back" onClick={onBack}>‹ Accueil</button>
            </div>
        </div>
    );
}
