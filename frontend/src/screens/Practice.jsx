import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ALL_TABLES, PRAISE, newQuestion, makeHint } from '../logic/questions';
import { updateMastery, buildWeights, construireErreurs, construireMaitrise, cleFait, masteryColor } from '../logic/mastery';
import { enregistrerSession, enregistrerSessionProf } from '../api';
import Keypad from '../components/Keypad';
import TimerRing from '../components/TimerRing';
import MasteryGrid from '../components/MasteryGrid';
import { IconCadenas, IconSprint, IconSansFaute, IconChrono, IconMontee, IconMaGrille, IconAmpoule, IconLibre } from '../components/Icons';

/**
 * Practice — Modes de jeu élève (Maquettes 1, 3, 7 + Écrans 18, 19, 20, 21)
 * Modes : sprint, flawless, countdown, libre
 */

const DEFAULT_TABLES = [2, 3, 4, 5];

const MODE_INFO = {
    sprint: { name: 'Sprint', icon: IconSprint, desc: '20 questions, 3 s chacune', defaultLen: 20, qTimer: 3 },
    flawless: { name: 'Sans faute', icon: IconSansFaute, desc: 'Zéro erreur, pas de chrono', defaultLen: 20, qTimer: 0 },
    countdown: { name: 'Contre-la-montre', icon: IconChrono, desc: '2 min, un max de bonnes', defaultLen: 0, qTimer: 0, globalTimer: 120 },
    libre: { name: 'S\'entraîner', icon: IconLibre, desc: 'Entraînement libre', defaultLen: 20, qTimer: 0 },
};

export default function Practice({
    onBack,
    identite,
    estProf,
    onPlafondChange,
    tablesInitiales,
    maitrise: maitriseProp,
    config,
}) {
    const plafond = estProf ? 20 : (identite?.profil?.plafond_tables || 10);
    const mode = config?.mode || 'libre';
    const isLibre = mode === 'libre';
    const modeMeta = MODE_INFO[mode] || MODE_INFO.libre;

    const initialLength = config?.length !== undefined ? config.length : (modeMeta.defaultLen || 20);
    const initialGlobalTimer = mode === 'countdown' ? (config?.timer || modeMeta.globalTimer || 120) : 0;
    const questionDuration = mode === 'sprint' ? (config?.timer || modeMeta.qTimer || 3) : 0;

    const initialPhase = tablesInitiales?.length
        ? (isLibre ? 'libre-quiz' : 'quiz')
        : (isLibre ? 'libre-intro' : 'setup');

    const [phase, setPhase] = useState(initialPhase);
    const [picked, setPicked] = useState(tablesInitiales?.length ? tablesInitiales : DEFAULT_TABLES.filter(t => t <= plafond));
    const [length, setLength] = useState(initialLength);
    const [globalTimer, setGlobalTimer] = useState(initialGlobalTimer);
    const [result, setResult] = useState(null);
    const [serverResult, setServerResult] = useState(null);
    const [showGrid, setShowGrid] = useState(false);
    const [mastery, setMastery] = useState(maitriseProp || {});

    useEffect(() => {
        if (maitriseProp) setMastery(maitriseProp);
    }, [maitriseProp]);

    const handleDone = useCallback((r) => {
        const maitriseSortie = construireMaitrise(r.resultats);
        setMastery(prev => ({ ...prev, ...maitriseSortie }));
        setResult(r);
        setServerResult(null);
        setPhase(isLibre ? 'libre-results' : 'results');

        const sessionMode = mode === 'countdown' ? 'countdown' : (mode === 'sprint' ? 'sprint' : 'libre');
        const erreurs = construireErreurs(r.resultats);

        const session = {
            mode: sessionMode,
            tables: picked,
            nbQuestions: r.answered,
            score: r.score,
            scorePremierEssai: r.scorePremierEssai,
            erreurs,
            dureeS: r.seconds,
            serieMax: r.maxStreak,
            sansFauteMax: r.maxStreak,
            plusHauteTable: null,
            maitrise: maitriseSortie,
        };

        const enregistrer = estProf ? enregistrerSessionProf : enregistrerSession;
        enregistrer(session).then(res => {
            if (res.ok) {
                setServerResult(res.data);
                const np = res.data?.plafond_tables;
                const currentPlafond = estProf ? 20 : (identite?.profil?.plafond_tables || 10);
                if (np && np !== currentPlafond) {
                    onPlafondChange?.(np);
                }
            } else {
                setServerResult({ erreur: res.error, enAttente: res.enAttente });
            }
        }).catch(() => {});
    }, [picked, estProf, identite, onPlafondChange, mode, isLibre]);

    const startWithTables = (tables, len) => {
        setPicked(tables);
        setLength(len);
        setPhase(isLibre ? 'libre-quiz' : 'quiz');
    };

    // =========================================================================
    // MODES SPRINT, SANS FAUTE, CONTRE-LA-MONTRE (Maquettes 7, 1, 3)
    // =========================================================================
    if (!isLibre) {
        if (phase === 'setup') {
            return (
                <>
                    {showGrid && <MasteryGrid mastery={mastery} onClose={() => setShowGrid(false)} />}
                    <Setup
                        onBack={onBack}
                        picked={picked}
                        setPicked={setPicked}
                        mode={mode}
                        onStart={() => setPhase('quiz')}
                        onShowGrid={() => setShowGrid(true)}
                        plafond={plafond}
                        mastery={mastery}
                    />
                </>
            );
        }

        if (phase === 'quiz') {
            return (
                <Quiz
                    tables={picked.length ? picked : ALL_TABLES.slice(0, 10)}
                    length={globalTimer > 0 ? 0 : length}
                    globalTimer={globalTimer}
                    questionDuration={questionDuration}
                    mode={mode}
                    mastery={mastery}
                    onQuit={() => setPhase('setup')}
                    onDone={handleDone}
                />
            );
        }

        return (
            <Results
                result={result}
                serverResult={serverResult}
                mode={mode}
                onReplay={() => { setServerResult(null); setPhase('quiz'); }}
                onReviewErrors={(tables) => startWithTables(tables, 10)}
                onHome={onBack}
                onSetup={() => setPhase('setup')}
            />
        );
    }

    // =========================================================================
    // MODE ENTRAÎNEMENT LIBRE (Écrans 18, 19, 20, 21)
    // =========================================================================

    // Écran 18 : L'entrée du mode
    if (phase === 'libre-intro') {
        return (
            <LibreIntro
                onBack={onBack}
                tables={picked}
                setTables={setPicked}
                length={length}
                setLength={setLength}
                plafond={plafond}
                mastery={mastery}
                onOpenTablePicker={() => setPhase('libre-tables')}
                onStart={() => setPhase('libre-quiz')}
            />
        );
    }

    // Écran 21 : Le choix des tables
    if (phase === 'libre-tables') {
        return (
            <LibreTablePicker
                onBack={() => setPhase('libre-intro')}
                tables={picked}
                setTables={setPicked}
                length={length}
                plafond={plafond}
                mastery={mastery}
                onValidate={() => setPhase('libre-intro')}
            />
        );
    }

    // Écran 19 : Pendant la partie
    if (phase === 'libre-quiz') {
        return (
            <LibreQuiz
                tables={picked.length ? picked : ALL_TABLES.slice(0, 10)}
                length={length}
                mastery={mastery}
                onStop={handleDone}
                onDone={handleDone}
            />
        );
    }

    // Écran 20 : Fin de partie
    return (
        <LibreResults
            result={result}
            serverResult={serverResult}
            tables={picked}
            mastery={mastery}
            onReplay={() => { setServerResult(null); setPhase('libre-quiz'); }}
            onHome={onBack}
            onOpenGrid={() => setShowGrid(true)}
            onContinueWeakest={(weakestT) => {
                setPicked([weakestT]);
                setLength(10);
                setPhase('libre-quiz');
            }}
        />
    );
}

/* =========================================================================
   ÉCRAN 18 — Entraînement libre : l'entrée du mode (« Sur quoi »)
   ========================================================================= */

function LibreIntro({ onBack, tables, setTables, length, setLength, plafond, mastery, onOpenTablePicker, onStart }) {
    const unlocked = ALL_TABLES.filter(t => t <= plafond);

    // Calcul des cases rouges de l'élève (niveau 1)
    const casesRouges = useMemo(() => {
        const list = [];
        for (let a = 2; a <= plafond; a++) {
            for (let b = 1; b <= plafond; b++) {
                const k = cleFait(a, b);
                if (mastery[k] === 1) {
                    list.push({ a, b, k });
                }
            }
        }
        return list;
    }, [mastery, plafond]);

    const tablesAvecRouges = useMemo(() => {
        return [...new Set(casesRouges.flatMap(c => [c.a, c.b].filter(t => t <= plafond)))].sort((a, b) => a - b);
    }, [casesRouges, plafond]);

    const [targetMode, setTargetMode] = useState(() => (casesRouges.length > 0 ? 'cases-rouges' : 'tout-melange'));

    const handleSelectTarget = (t) => {
        setTargetMode(t);
        if (t === 'cases-rouges') {
            setTables(tablesAvecRouges.length ? tablesAvecRouges : unlocked.slice(-3));
        } else if (t === 'tout-melange') {
            setTables([...unlocked]);
        } else if (t === 'derniere') {
            setTables([plafond]);
        }
    };

    const countRouges = casesRouges.length;

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Header retour + label */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px 0' }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 21,
                        color: 'var(--indigo-doux)', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                >
                    ‹ Retour
                </button>
                <div style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 17, color: 'var(--gris)' }}>
                    Pas de chrono, pas de score
                </div>
            </div>

            {/* 2. Titre & sous-titre */}
            <div style={{ padding: '8px 4px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2 className="font-display" style={{ margin: 0, fontSize: 40, fontWeight: 700, color: 'var(--indigo)' }}>
                    S'entraîner
                </h2>
                <div style={{ fontFamily: 'var(--texte)', fontSize: 18, fontWeight: 600, color: 'var(--gris)' }}>
                    Le seul mode où tu peux te tromper sans que ça compte.
                </div>
            </div>

            {/* 3. Section « Sur quoi » */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
                <div style={{
                    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                    color: 'var(--gris)', letterSpacing: '0.14em', textTransform: 'uppercase',
                }}>
                    Sur quoi
                </div>

                {/* Option 1 : Mes N cases rouges */}
                <div
                    onClick={() => handleSelectTarget('cases-rouges')}
                    style={{
                        background: targetMode === 'cases-rouges' ? 'var(--action)' : 'var(--surface)',
                        color: targetMode === 'cases-rouges' ? '#fff' : 'var(--indigo)',
                        borderRadius: 24, padding: '22px 24px',
                        display: 'flex', alignItems: 'center', gap: 18, cursor: 'pointer',
                        boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                        border: targetMode === 'cases-rouges' ? 'none' : '1px solid var(--bordure)',
                        transition: 'all 0.12s ease',
                    }}
                >
                    {/* Mini-grille 3x3 décorative */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 16px)', gap: 4, flexShrink: 0 }}>
                        {[1, 0, 0, 0, 1, 0, 0, 0, 1].map((filled, idx) => (
                            <div
                                key={idx}
                                style={{
                                    width: 16, height: 16, borderRadius: 4,
                                    background: filled
                                        ? (targetMode === 'cases-rouges' ? '#fff' : 'var(--rouge)')
                                        : (targetMode === 'cases-rouges' ? 'rgba(255,255,255,.4)' : 'var(--rouge-pale)'),
                                }}
                            />
                        ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                        <div className="font-display" style={{
                            fontSize: 27, fontWeight: 700,
                            color: targetMode === 'cases-rouges' ? '#fff' : 'var(--indigo)',
                        }}>
                            Mes {countRouges} cases rouges
                        </div>
                        <div style={{
                            fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600,
                            color: targetMode === 'cases-rouges' ? '#DFF2FB' : 'var(--gris)',
                        }}>
                            {countRouges > 0
                                ? `Tables de ${tablesAvecRouges.slice(0, 4).join(', ')} · c'est là que ça bloque`
                                : 'Aucune case rouge · bravo !'}
                        </div>
                    </div>

                    {targetMode === 'cases-rouges' && (
                        <div style={{
                            width: 34, height: 34, borderRadius: 11, background: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                <path d="M5 12.5 10 17.5 19 7" stroke="var(--action)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* 3 options complémentaires */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {/* Mes tables (ouvre l'écran 21) */}
                    <div
                        onClick={() => {
                            setTargetMode('mes-tables');
                            onOpenTablePicker();
                        }}
                        style={{
                            background: targetMode === 'mes-tables' ? 'var(--ciel-pale)' : 'var(--surface)',
                            borderRadius: 22, padding: '20px 16px', cursor: 'pointer',
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                            border: targetMode === 'mes-tables' ? '2px solid var(--action)' : '1px solid var(--bordure)',
                            display: 'flex', flexDirection: 'column', gap: 2,
                        }}
                    >
                        <div className="font-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--indigo)' }}>
                            Mes tables
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 14, fontWeight: 600, color: 'var(--gris)' }}>
                            j'en choisis autant que je veux
                        </div>
                    </div>

                    {/* Tout mélangé */}
                    <div
                        onClick={() => handleSelectTarget('tout-melange')}
                        style={{
                            background: targetMode === 'tout-melange' ? 'var(--ciel-pale)' : 'var(--surface)',
                            borderRadius: 22, padding: '20px 16px', cursor: 'pointer',
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                            border: targetMode === 'tout-melange' ? '2px solid var(--action)' : '1px solid var(--bordure)',
                            display: 'flex', flexDirection: 'column', gap: 2,
                        }}
                    >
                        <div className="font-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--indigo)' }}>
                            Tout mélangé
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 14, fontWeight: 600, color: 'var(--gris)' }}>
                            tables 2 à {plafond}
                        </div>
                    </div>

                    {/* Ma dernière (SANS « ouverte hier ») */}
                    <div
                        onClick={() => handleSelectTarget('derniere')}
                        style={{
                            background: targetMode === 'derniere' ? 'var(--ciel-pale)' : 'var(--surface)',
                            borderRadius: 22, padding: '20px 16px', cursor: 'pointer',
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                            border: targetMode === 'derniere' ? '2px solid var(--action)' : '1px solid var(--bordure)',
                            display: 'flex', flexDirection: 'column', gap: 2,
                        }}
                    >
                        <div className="font-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--indigo)' }}>
                            Ma dernière
                        </div>
                        <div style={{ fontFamily: 'var(--texte)', fontSize: 14, fontWeight: 600, color: 'var(--gris)' }}>
                            table de {plafond}
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. Section « Combien de temps » */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                <div style={{
                    fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                    color: 'var(--gris)', letterSpacing: '0.14em', textTransform: 'uppercase',
                }}>
                    Combien de temps
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    {/* 10 questions */}
                    <div
                        onClick={() => setLength(10)}
                        style={{
                            flex: 1, height: 92, borderRadius: 22, cursor: 'pointer',
                            background: length === 10 ? 'var(--indigo)' : 'var(--surface)',
                            color: length === 10 ? '#fff' : 'var(--indigo)',
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                            border: length === 10 ? 'none' : '1px solid var(--bordure)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                        }}
                    >
                        <span className="font-display" style={{ fontSize: 30, fontWeight: 700 }}>10</span>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: length === 10 ? '#A9AFDE' : 'var(--gris)' }}>
                            questions
                        </span>
                    </div>

                    {/* 20 questions */}
                    <div
                        onClick={() => setLength(20)}
                        style={{
                            flex: 1, height: 92, borderRadius: 22, cursor: 'pointer',
                            background: length === 20 ? 'var(--indigo)' : 'var(--surface)',
                            color: length === 20 ? '#fff' : 'var(--indigo)',
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                            border: length === 20 ? 'none' : '1px solid var(--bordure)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                        }}
                    >
                        <span className="font-display" style={{ fontSize: 30, fontWeight: 700 }}>20</span>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: length === 20 ? '#A9AFDE' : 'var(--gris)' }}>
                            questions
                        </span>
                    </div>

                    {/* Sans fin */}
                    <div
                        onClick={() => setLength(0)}
                        style={{
                            flex: 1, height: 92, borderRadius: 22, cursor: 'pointer',
                            background: length === 0 ? 'var(--indigo)' : 'var(--surface)',
                            color: length === 0 ? '#fff' : 'var(--indigo)',
                            boxShadow: '0 8px 20px rgba(32,34,107,.10)',
                            border: length === 0 ? 'none' : '1px solid var(--bordure)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                        }}
                    >
                        <span className="font-display" style={{ fontSize: 26, fontWeight: 700 }}>Sans fin</span>
                        <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: length === 0 ? '#A9AFDE' : 'var(--gris)' }}>
                            j'arrête quand je veux
                        </span>
                    </div>
                </div>
            </div>

            {/* 5. Carte « Ce que ce mode fait de tes erreurs » */}
            <div style={{
                background: 'var(--surface)', borderRadius: 24, padding: 24,
                boxShadow: '0 8px 20px rgba(32,34,107,.10)', border: '1px solid var(--bordure)',
                display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8,
            }}>
                <div className="font-display" style={{ fontSize: 21, fontWeight: 700, color: 'var(--indigo)' }}>
                    Ce que ce mode fait de tes erreurs
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 12, background: 'var(--rouge-pale)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 18, color: '#B34141', flexShrink: 0,
                    }}>
                        1
                    </div>
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.4, color: 'var(--indigo-doux)', fontWeight: 600 }}>
                        Tu te trompes : la bonne réponse s'affiche, tu la retapes.
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 12, background: 'var(--orange-pale)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 18, color: '#8A5A10', flexShrink: 0,
                    }}>
                        2
                    </div>
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.4, color: 'var(--indigo-doux)', fontWeight: 600 }}>
                        La même multiplication revient <b style={{ color: 'var(--indigo)' }}>trois questions plus tard</b>.
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 12, background: 'var(--vert-pale)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 18, color: '#0C6B3D', flexShrink: 0,
                    }}>
                        3
                    </div>
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.4, color: 'var(--indigo-doux)', fontWeight: 600 }}>
                        Si tu l'as, elle revient <b style={{ color: 'var(--indigo)' }}>une dernière fois</b> vers la fin. Une case passe au vert quand tu trouves du premier coup.
                    </div>
                </div>
            </div>

            {/* 6. Bouton Commencer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10, marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--gris)', textAlign: 'center' }}>
                    {countRouges} cases rouges · {length === 0 ? 'sans fin' : `${length} questions`} · sans chrono · tables modifiables
                </div>
                <button
                    disabled={tables.length === 0}
                    onClick={onStart}
                    style={{
                        height: 96, borderRadius: 26, background: 'var(--action)',
                        color: '#fff', fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 28,
                        border: 'none', cursor: tables.length === 0 ? 'not-allowed' : 'pointer',
                        boxShadow: '0 8px 20px rgba(32,34,107,.10)', opacity: tables.length === 0 ? 0.5 : 1,
                    }}
                >
                    Commencer
                </button>
            </div>
        </div>
    );
}

/* =========================================================================
   ÉCRAN 21 — Entraînement libre : le choix des tables (« Tes tables »)
   ========================================================================= */

function LibreTablePicker({ onBack, tables, setTables, length, plafond, mastery, onValidate }) {
    const unlocked = ALL_TABLES.filter(t => t <= plafond);
    const maxTableShown = Math.max(12, Math.min(20, plafond + 1));
    const tablesToDisplay = ALL_TABLES.filter(t => t <= maxTableShown);

    const toggle = (t) => {
        if (t > plafond) return;
        setTables(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t].sort((a, b) => a - b));
    };

    const handleTablesFaibles = async () => {
        try {
            const { mesTablesFaibles } = await import('../api');
            const res = await mesTablesFaibles(3);
            if (res.ok && res.data?.length) {
                setTables(res.data.filter(t => t <= plafond));
                return;
            }
        } catch {}
        setTables(unlocked.slice(-3));
    };

    const handleCasesRouges = () => {
        const withRed = [];
        for (let t of unlocked) {
            let hasRed = false;
            for (let m = 1; m <= plafond; m++) {
                if (mastery[cleFait(t, m)] === 1) {
                    hasRed = true;
                    break;
                }
            }
            if (hasRed) withRed.push(t);
        }
        setTables(withRed.length ? withRed : unlocked.slice(-3));
    };

    const handleSelectAll = () => setTables([...unlocked]);
    const handleClear = () => setTables([]);

    // Calcul de la jauge pour chaque table (calculée sur plafond de l'élève)
    const getTableStats = (t) => {
        let vert = 0, orange = 0, rouge = 0, total = 0;
        for (let m = 1; m <= plafond; m++) {
            const k = cleFait(t, m);
            const val = mastery[k];
            total++;
            if (val === 3) vert++;
            else if (val === 2) orange++;
            else if (val === 1) rouge++;
        }
        return { vert, orange, rouge, total };
    };

    // Nombre de cases rouges sur les tables cochées
    const nbCasesRougesSurTables = useMemo(() => {
        let count = 0;
        for (const t of tables) {
            for (let m = 1; m <= plafond; m++) {
                if (mastery[cleFait(t, m)] === 1) count++;
            }
        }
        return count;
    }, [tables, mastery, plafond]);

    // Dénominateur dynamique : tables cochées * plafond
    const denominateurTotal = tables.length * plafond;

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px 0' }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 21,
                        color: 'var(--indigo-doux)', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                >
                    ‹ Retour
                </button>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--ciel-pale)', padding: '9px 18px', borderRadius: 999,
                }}>
                    <IconLibre size={22} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18, color: 'var(--indigo)' }}>
                        Entraînement libre
                    </span>
                </div>
            </div>

            {/* Titre & sous-titre */}
            <div style={{ padding: '8px 4px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2 className="font-display" style={{ margin: 0, fontSize: 38, fontWeight: 700, color: 'var(--indigo)' }}>
                    Tes tables
                </h2>
                <div style={{ fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 600, color: 'var(--gris)' }}>
                    Coche celles que tu veux travailler. Sous chaque chiffre : vert maîtrisé, orange juste mais lent, rouge à revoir.
                </div>
            </div>

            {/* 4 Boutons pilules */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                <button
                    onClick={handleTablesFaibles}
                    style={{
                        background: 'var(--indigo)', color: '#fff',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                        padding: '12px 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    }}
                >
                    Mes 3 tables faibles
                </button>
                <button
                    onClick={handleCasesRouges}
                    style={{
                        background: 'var(--surface)', color: 'var(--indigo-doux)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                        padding: '12px 20px', borderRadius: 999, border: '1px solid var(--bordure)',
                        boxShadow: 'var(--ombre-douce)', cursor: 'pointer',
                    }}
                >
                    Mes cases rouges
                </button>
                <button
                    onClick={handleSelectAll}
                    style={{
                        background: 'var(--surface)', color: 'var(--indigo-doux)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                        padding: '12px 20px', borderRadius: 999, border: '1px solid var(--bordure)',
                        boxShadow: 'var(--ombre-douce)', cursor: 'pointer',
                    }}
                >
                    Tout
                </button>
                <button
                    onClick={handleClear}
                    style={{
                        background: 'var(--surface)', color: 'var(--indigo-doux)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                        padding: '12px 20px', borderRadius: 999, border: '1px solid var(--bordure)',
                        boxShadow: 'var(--ombre-douce)', cursor: 'pointer',
                    }}
                >
                    Effacer
                </button>
            </div>

            {/* Grille 4 colonnes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 4 }}>
                {tablesToDisplay.map(t => {
                    const locked = t > plafond;
                    const selected = tables.includes(t);
                    const stats = getTableStats(t);

                    if (locked) {
                        return (
                            <div
                                key={t}
                                style={{
                                    height: 126, borderRadius: 24, background: '#F2EDE3',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    justifyContent: 'center', gap: 8, cursor: 'not-allowed',
                                }}
                            >
                                <IconCadenas size={24} color="#9A93A8" />
                                <span className="font-display" style={{ fontSize: 34, fontWeight: 700, color: '#B3ACBE' }}>
                                    {t}
                                </span>
                            </div>
                        );
                    }

                    const pctVert = stats.total > 0 ? (stats.vert / stats.total) * 100 : 0;
                    const pctOrange = stats.total > 0 ? (stats.orange / stats.total) * 100 : 0;
                    const pctRouge = stats.total > 0 ? (stats.rouge / stats.total) * 100 : 0;

                    let statusLabel = 'rien à revoir';
                    if (stats.rouge > 0) statusLabel = `${stats.rouge} à revoir`;
                    else if (stats.vert === 0 && stats.orange === 0) statusLabel = 'pas travaillée';

                    return (
                        <div
                            key={t}
                            onClick={() => toggle(t)}
                            style={{
                                height: 126, borderRadius: 24, cursor: 'pointer',
                                background: selected ? 'var(--ciel-pale)' : 'var(--surface)',
                                boxShadow: selected ? '0 8px 20px rgba(35,164,217,.28)' : 'var(--ombre-douce)',
                                border: selected ? '2.5px solid var(--action)' : '1px solid var(--bordure)',
                                padding: 14, display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center', gap: 8, position: 'relative',
                                transition: 'all 0.1s ease',
                            }}
                        >
                            {selected && (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', top: 8, right: 8 }}>
                                    <path d="M5 12.5 10 17.5 19 7" stroke="var(--action)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                            <span className="font-display" style={{ fontSize: 38, fontWeight: 700, color: 'var(--indigo)' }}>
                                {t}
                            </span>
                            {/* Jauge segmentée */}
                            <div style={{ width: 76, height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', background: '#EDE7DC' }}>
                                <div style={{ width: `${pctVert}%`, background: 'var(--vert)' }} />
                                <div style={{ width: `${pctOrange}%`, background: 'var(--orange)' }} />
                                <div style={{ width: `${pctRouge}%`, background: 'var(--rouge)' }} />
                            </div>
                            <span style={{ fontFamily: 'var(--texte)', fontSize: 13, fontWeight: 600, color: stats.rouge > 0 ? 'var(--rouge)' : 'var(--gris)' }}>
                                {statusLabel}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Bandeau d'analyse : ZÉRO 30 en dur */}
            <div style={{
                background: 'var(--surface)', borderRadius: 24, padding: '20px 24px',
                boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                display: 'flex', alignItems: 'center', gap: 16, marginTop: 4,
            }}>
                <div style={{ width: 8, height: 44, borderRadius: 4, background: 'var(--action)', flexShrink: 0 }} />
                <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.45, color: 'var(--indigo-doux)', fontWeight: 600 }}>
                    Sur {tables.length} table{tables.length > 1 ? 's' : ''} cochée{tables.length > 1 ? 's' : ''}, <b style={{ color: 'var(--indigo)' }}>{nbCasesRougesSurTables} cases sur {denominateurTotal}</b> te posent encore problème. Ce sont elles qui tomberont le plus souvent.
                </div>
            </div>

            {/* Bouton de validation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6, marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600, color: 'var(--gris)', textAlign: 'center' }}>
                    Tables {tables.join(', ')} · {length === 0 ? 'sans fin' : `${length} questions`} · sans chrono
                </div>
                <button
                    disabled={tables.length === 0}
                    onClick={onValidate}
                    style={{
                        height: 96, borderRadius: 26, background: 'var(--action)',
                        color: '#fff', fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 28,
                        border: 'none', cursor: tables.length === 0 ? 'not-allowed' : 'pointer',
                        boxShadow: '0 8px 20px rgba(32,34,107,.10)', opacity: tables.length === 0 ? 0.5 : 1,
                    }}
                >
                    S'entraîner sur ces tables
                </button>
            </div>
        </div>
    );
}

/* =========================================================================
   ÉCRAN 19 — Entraînement libre : pendant la partie
   ========================================================================= */

function LibreQuiz({ tables, length, mastery, onStop, onDone }) {
    const weights = useMemo(() => buildWeights(tables, mastery), [tables, mastery]);

    const [q, setQ] = useState(() => newQuestion(tables, null, weights));
    const [digits, setDigits] = useState(() => Array(String(q.answer).length).fill(''));
    const [answered, setAnswered] = useState(0);
    const [score, setScore] = useState(0);
    const [scorePremierEssai, setScorePremierEssai] = useState(0);
    const [fb, setFb] = useState('idle'); // 'idle' | 'correct' | 'wrong'
    const [lastTimeTaken, setLastTimeTaken] = useState(null);
    const [questionStartTime, setQuestionStartTime] = useState(() => performance.now());
    const [responseTimes, setResponseTimes] = useState([]);
    const [hintMessage, setHintMessage] = useState('');

    // File de reprise programmée : { q, targetIndex, step: 1 | 2 }
    const scheduledQueue = useRef([]);
    // Faits en cours de reprise pour affichage : Map<cle, { a, b, status: 'rouge' | 'orange' | 'vert' }>
    const [reprisesEnCours, setReprisesEnCours] = useState(new Map());
    // Historique détaillé de chaque fait pour l'écran de fin
    const factHistory = useRef(new Map()); // cle -> { a, b, attempts: ['rouge', ...], times: [] }

    const answeredRef = useRef(0);
    const scoreRef = useRef(0);
    const scorePremierRef = useRef(0);
    const resultatsRef = useRef([]);
    const premierEssaiRef = useRef(true);
    const lockRef = useRef(false);
    const startOverallRef = useRef(Date.now());

    const numDigits = String(q.answer).length;
    const activeIndex = digits.findIndex(d => d === '');

    // Moyenne courante en secondes
    const moyenneSec = responseTimes.length > 0
        ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1).replace('.', ',')
        : '0,0';

    // Prépare la prochaine question en respectant la file de reprise
    const loadNextQuestion = useCallback(() => {
        lockRef.current = false;
        premierEssaiRef.current = true;
        setFb('idle');
        setHintMessage('');

        const nextIndex = answeredRef.current;
        const scheduledItemIndex = scheduledQueue.current.findIndex(item => item.targetIndex <= nextIndex);

        let nextQ;
        let isReplayQuestion = false;

        if (scheduledItemIndex !== -1) {
            const item = scheduledQueue.current.splice(scheduledItemIndex, 1)[0];
            nextQ = item.q;
            isReplayQuestion = true;
            if (item.step === 1) {
                setHintMessage('Tu l\'avais ratée. Elle revient pour vérifier.');
            } else {
                setHintMessage('Tu l\'avais ratée une fois. Elle revient une dernière fois avant la fin.');
            }
        } else {
            nextQ = newQuestion(tables, q, weights);
        }

        setQ(nextQ);
        setDigits(Array(String(nextQ.answer).length).fill(''));
        setQuestionStartTime(performance.now());
    }, [tables, q, weights]);

    // Fin de partie
    const finish = useCallback(() => {
        const totalSec = Math.round((Date.now() - startOverallRef.current) / 1000);
        const finalResults = [...resultatsRef.current];
        // Si l'élève interrompt en plein milieu d'une question ratée sans jamais l'avoir trouvée
        if (!premierEssaiRef.current) {
            finalResults.push({ a: q.a, b: q.b, result: 'jamais' });
        }
        onDone({
            score: scoreRef.current,
            scorePremierEssai: scorePremierRef.current,
            answered: answeredRef.current,
            maxStreak: scorePremierRef.current,
            resultats: finalResults,
            seconds: totalSec,
            timerMode: false,
            historyByFact: Array.from(factHistory.current.entries()),
            reprisesCount: Array.from(factHistory.current.values()).filter(v => v.attempts.length > 1).length,
        });
    }, [onDone, q]);

    // Validation à la saisie du dernier chiffre
    const handleComplete = useCallback((val) => {
        if (lockRef.current) return;
        const now = performance.now();
        const durationSec = Math.max(0.1, (now - questionStartTime) / 1000);
        const ok = val === q.answer;
        const factKey = cleFait(q.a, q.b);

        if (!factHistory.current.has(factKey)) {
            factHistory.current.set(factKey, { a: q.a, b: q.b, attempts: [], times: [] });
        }
        const hist = factHistory.current.get(factKey);
        hist.times.push(durationSec);

        if (ok) {
            lockRef.current = true;
            setFb('correct');
            setLastTimeTaken(durationSec.toFixed(1).replace('.', ','));
            setResponseTimes(prev => [...prev, durationSec]);

            hist.attempts.push('vert');

            answeredRef.current += 1;
            setAnswered(a => a + 1);
            scoreRef.current += 1;
            setScore(s => s + 1);

            const isFirstTry = premierEssaiRef.current && hist.attempts.length === 1;
            if (isFirstTry) {
                scorePremierRef.current += 1;
                setScorePremierEssai(s => s + 1);
                resultatsRef.current.push({ a: q.a, b: q.b, result: 'premier' });
            } else {
                resultatsRef.current.push({ a: q.a, b: q.b, result: 'rattrape' });
                // Si réussi lors d'une reprise step 1 -> reprogrammer vers la fin (step 2)
                const pending = scheduledQueue.current.find(item => cleFait(item.q.a, item.q.b) === factKey);
                if (!pending) {
                    const finalIndex = Math.max(answeredRef.current + 3, (length || 20) - 2);
                    scheduledQueue.current.push({ q, targetIndex: finalIndex, step: 2 });
                    setReprisesEnCours(prev => {
                        const m = new Map(prev);
                        m.set(factKey, { a: q.a, b: q.b, status: 'orange' });
                        return m;
                    });
                } else {
                    setReprisesEnCours(prev => {
                        const m = new Map(prev);
                        m.set(factKey, { a: q.a, b: q.b, status: 'vert' });
                        return m;
                    });
                }
            }
            // Réinitialiser immédiatement pour fermer la fenêtre de 600ms si l'élève clique sur Arrêter
            premierEssaiRef.current = true;

            setTimeout(() => {
                if (length > 0 && answeredRef.current >= length) {
                    finish();
                } else {
                    loadNextQuestion();
                }
            }, 600);
        } else {
            // Mauvaise réponse : la bonne réponse s'affiche, l'élève la retape
            setFb('wrong');
            premierEssaiRef.current = false;
            hist.attempts.push('rouge');
            // IMPORTANT : ne pas empiler 'jamais' ici ! L'élève est en train de retaper la question.

            // Programmer le fait pour revenir 3 questions plus tard (si pas déjà en file)
            const alreadyScheduled = scheduledQueue.current.some(item => cleFait(item.q.a, item.q.b) === factKey);
            if (!alreadyScheduled) {
                const target = answeredRef.current + 3;
                scheduledQueue.current.push({ q, targetIndex: target, step: 1 });
            }
            setReprisesEnCours(prev => {
                const m = new Map(prev);
                m.set(factKey, { a: q.a, b: q.b, status: 'rouge' });
                return m;
            });

            // Afficher la bonne réponse temporairement puis vider pour retaper
            setHintMessage(`Presque ! C'est ${q.a} × ${q.b} = ${q.answer}`);
            setTimeout(() => {
                setFb('idle');
                setDigits(Array(numDigits).fill(''));
            }, 500);
        }
    }, [q, questionStartTime, length, numDigits, finish, loadNextQuestion]);

    const press = useCallback((d) => {
        if (lockRef.current || fb !== 'idle') return;
        setDigits(prev => {
            const idx = prev.findIndex(x => x === '');
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = d;
            if (idx === numDigits - 1) {
                setTimeout(() => handleComplete(parseInt(next.join(''), 10)), 0);
            }
            return next;
        });
    }, [fb, numDigits, handleComplete]);

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

    // Clavier physique
    useEffect(() => {
        const h = (e) => {
            if (e.key >= '0' && e.key <= '9') { e.preventDefault(); press(parseInt(e.key, 10)); }
            else if (e.key === 'Backspace') { e.preventDefault(); del(); }
            else if (e.key === 'Escape') { finish(); }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [press, del, finish]);

    const progressPct = length > 0 ? (answered / length) * 100 : 0;
    const reprisesList = Array.from(reprisesEnCours.values());

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', boxSizing: 'border-box' }}>
            {/* Header : ‹ Arrêter + pilule Entraînement libre */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px 0' }}>
                <button
                    onClick={finish}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 21,
                        color: 'var(--indigo-doux)',
                    }}
                >
                    ‹ Arrêter
                </button>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--ciel-pale)', padding: '8px 18px', borderRadius: 999,
                }}>
                    <IconLibre size={22} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18, color: 'var(--indigo)' }}>
                        Entraînement libre
                    </span>
                </div>
            </div>

            {/* Barre de progression & moyenne de vitesse */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 4px 0' }}>
                <div className="font-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--indigo)', whiteSpace: 'nowrap' }}>
                    {answered + 1}<span style={{ color: 'var(--gris)', fontSize: 18, fontWeight: 600 }}> / {length || '∞'}</span>
                </div>
                <div style={{ flex: 1, height: 10, borderRadius: 999, background: '#E4DED2', overflow: 'hidden' }}>
                    <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--indigo)', borderRadius: 999, transition: 'width 0.2s ease' }} />
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--surface)', borderRadius: 999, padding: '8px 16px',
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                }}>
                    <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                        moyenne
                    </span>
                    <span className="font-display" style={{ fontSize: 20, fontWeight: 700, color: 'var(--indigo)' }}>
                        {moyenneSec} s
                    </span>
                </div>
            </div>

            {/* Carte question */}
            <div style={{ position: 'relative', marginTop: 16 }}>
                <div
                    style={{
                        background: 'var(--surface)', borderRadius: 30, padding: '30px 30px 34px',
                        boxShadow: fb === 'correct'
                            ? '0 0 0 4px var(--vert-pale), 0 8px 22px rgba(32,34,107,.10)'
                            : fb === 'wrong'
                                ? '0 0 0 4px var(--rouge-pale), 0 8px 22px rgba(32,34,107,.10)'
                                : '0 8px 20px rgba(32,34,107,.10)',
                        border: '1px solid var(--bordure)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
                        position: 'relative',
                    }}
                >
                    {/* Badge temps si réponse juste */}
                    {fb === 'correct' && lastTimeTaken && (
                        <div style={{
                            position: 'absolute', top: 22, right: 26,
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: 'var(--vert-pale)', padding: '8px 18px', borderRadius: 999,
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                <path d="M5 12.5 10 17.5 19 7" stroke="var(--vert)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className="font-display" style={{ fontSize: 24, fontWeight: 700, color: 'var(--vert)' }}>
                                {lastTimeTaken} s
                            </span>
                        </div>
                    )}

                    {/* Question text */}
                    <div className="font-display" style={{
                        fontSize: 104, lineHeight: 1, fontWeight: 700,
                        color: 'var(--indigo)', letterSpacing: '0.02em', margin: 0,
                    }}>
                        {q.a} <span style={{ color: 'var(--gris)' }}>×</span> {q.b}
                    </div>

                    {/* Cases de saisie */}
                    <div style={{ display: 'flex', gap: 14 }}>
                        {digits.map((d, i) => {
                            const isCurrent = i === activeIndex && fb === 'idle';
                            const isCorrect = fb === 'correct';
                            const isWrong = fb === 'wrong';

                            return (
                                <div
                                    key={i}
                                    style={{
                                        width: 104, height: 122, borderRadius: 22,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 76,
                                        background: isCorrect ? 'var(--vert)' : isWrong ? 'var(--rouge-pale)' : (d ? 'var(--surface)' : '#F6F2EA'),
                                        border: isCorrect ? 'none' : isWrong ? '4px solid var(--rouge-doux)' : (isCurrent ? '4px solid var(--action)' : '4px solid var(--bordure)'),
                                        color: isCorrect ? '#fff' : isWrong ? 'var(--rouge-doux)' : 'var(--indigo)',
                                        transition: 'all 0.1s ease',
                                    }}
                                >
                                    {d || (isCurrent ? <div style={{ width: 4, height: 50, background: 'var(--indigo-doux)', borderRadius: 2 }} className="caret" /> : '')}
                                </div>
                            );
                        })}
                    </div>

                    {/* Message d'aide pédagogique */}
                    {hintMessage && (
                        <div style={{
                            fontFamily: 'var(--texte)', fontSize: 17, fontWeight: 600,
                            color: fb === 'wrong' ? 'var(--rouge-doux)' : 'var(--indigo-doux)',
                            textAlign: 'center',
                        }}>
                            {hintMessage}
                        </div>
                    )}
                </div>
            </div>

            {/* Bandeau « À retravailler » */}
            {reprisesList.length > 0 && (
                <div style={{ padding: '16px 4px 0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 14, color: 'var(--gris)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                        À retravailler
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {reprisesList.map((r, i) => {
                            const bg = r.status === 'vert' ? 'var(--vert-pale)' : r.status === 'orange' ? 'var(--orange-pale)' : 'var(--rouge-pale)';
                            const color = r.status === 'vert' ? '#0C6B3D' : r.status === 'orange' ? '#8A5A10' : '#B34141';
                            return (
                                <div key={i} style={{ padding: '6px 14px', borderRadius: 12, background: bg, fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 17, color }}>
                                    {r.a}×{r.b}
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ marginLeft: 'auto', fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                        {reprisesList.length} en cours de reprise
                    </div>
                </div>
            )}

            <div style={{ flex: 1 }} />

            {/* Pavé tactile */}
            <div style={{ paddingBottom: 16 }}>
                <Keypad onPress={press} onDelete={del} disabled={lockRef.current} />
            </div>
        </div>
    );
}

/* =========================================================================
   ÉCRAN 20 — Entraînement libre : fin de partie
   ========================================================================= */

function LibreResults({ result, serverResult, tables, mastery, onReplay, onHome, onOpenGrid, onContinueWeakest }) {
    if (!result) return null;
    const { answered, seconds, resultats, historyByFact = [] } = result;

    const totalSec = seconds || 1;
    const vitesseMoyenne = answered > 0 ? (totalSec / answered).toFixed(1).replace('.', ',') : '0,0';

    // Faits travaillés avec leurs temps et essais
    const faitsTravailles = useMemo(() => {
        if (historyByFact.length > 0) {
            return historyByFact.map(([key, data]) => data);
        }
        // Fallback depuis resultats
        const map = new Map();
        (resultats || []).forEach(r => {
            const k = cleFait(r.a, r.b);
            if (!map.has(k)) map.set(k, { a: r.a, b: r.b, attempts: [], times: [] });
            map.get(k).attempts.push(r.result === 'premier' ? 'vert' : r.result === 'rattrape' ? 'orange' : 'rouge');
        });
        return Array.from(map.values());
    }, [historyByFact, resultats]);

    const totalReprises = faitsTravailles.filter(f => f.attempts.length > 1).length;
    const casesGagnees = faitsTravailles.filter(f => f.attempts.includes('vert')).length;

    // Déterminer la table la plus faible de la session pour « Continuer sur ... »
    const weakestTable = useMemo(() => {
        const errorCounts = {};
        faitsTravailles.forEach(f => {
            if (f.attempts.includes('rouge')) {
                errorCounts[f.a] = (errorCounts[f.a] || 0) + 1;
                errorCounts[f.b] = (errorCounts[f.b] || 0) + 1;
            }
        });
        const sorted = Object.entries(errorCounts).sort((a, b) => b[1] - a[1]);
        return sorted.length ? parseInt(sorted[0][0], 10) : tables[0] || 7;
    }, [faitsTravailles, tables]);

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* En-tête Score géant */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 16 }}>
                <div style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 22, color: 'var(--action)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Entraînement terminé
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span className="font-display" style={{ fontSize: 132, lineHeight: 1, fontWeight: 700, color: 'var(--indigo)' }}>
                        {vitesseMoyenne}
                    </span>
                    <span className="font-display" style={{ fontSize: 46, fontWeight: 700, color: 'var(--gris)' }}>
                        s
                    </span>
                </div>
                <div style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 23, color: 'var(--indigo-doux)' }}>
                    par question, en moyenne
                </div>
                {/* RAPPEL PROMPT 15 : AUCUNE mention de « 0,7 s de moins que la semaine dernière » ! Ligne retirée ! */}
            </div>

            {/* 3 Cartes de stats */}
            <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                <div style={{
                    flex: 1, background: 'var(--surface)', borderRadius: 22, padding: 20,
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                    <span className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--indigo)' }}>
                        {answered}
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                        questions
                    </span>
                </div>
                <div style={{
                    flex: 1, background: 'var(--surface)', borderRadius: 22, padding: 20,
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                    <span className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--indigo)' }}>
                        {totalReprises}
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                        reprises
                    </span>
                </div>
                <div style={{
                    flex: 1, background: 'var(--surface)', borderRadius: 22, padding: 20,
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                    <span className="font-display" style={{ fontSize: 40, fontWeight: 700, color: 'var(--vert)' }}>
                        {casesGagnees}
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                        cases gagnées
                    </span>
                </div>
            </div>

            {/* Carte « Ce que tu as travaillé » */}
            {faitsTravailles.length > 0 && (
                <div style={{
                    background: 'var(--surface)', borderRadius: 26, padding: 26,
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                    display: 'flex', flexDirection: 'column', gap: 18, marginTop: 4,
                }}>
                    <div className="font-display" style={{ fontSize: 23, fontWeight: 700, color: 'var(--indigo)' }}>
                        Ce que tu as travaillé
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {faitsTravailles.slice(0, 6).map((f, i) => {
                            const timesLabel = f.times?.length > 1
                                ? `${f.times[0].toFixed(1).replace('.', ',')} s puis ${f.times[f.times.length - 1].toFixed(1).replace('.', ',')} s`
                                : f.times?.length === 1
                                    ? `${f.times[0].toFixed(1).replace('.', ',')} s`
                                    : 'réussi';
                            const hasWon = f.attempts[f.attempts.length - 1] === 'vert';

                            return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <div className="font-display" style={{ width: 90, fontSize: 26, fontWeight: 700, color: 'var(--indigo)' }}>
                                        {f.a} × {f.b}
                                    </div>
                                    {/* 3 Pastilles de statut */}
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {f.attempts.map((att, attIdx) => {
                                            const bg = att === 'vert' ? 'var(--vert)' : att === 'orange' ? 'var(--orange)' : 'var(--rouge)';
                                            return (
                                                <div key={attIdx} style={{ width: 26, height: 26, borderRadius: 7, background: bg }} />
                                            );
                                        })}
                                    </div>
                                    <div style={{
                                        marginLeft: 'auto', fontFamily: 'var(--texte)', fontSize: 16, fontWeight: 600,
                                        color: hasWon ? '#0C6B3D' : '#8A5A10',
                                    }}>
                                        {timesLabel}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* RAPPEL PROMPT 15 : RÈGLE ACTUELLE, PAS DE SEUIL DE 3 SECONDES */}
                    <div style={{ fontFamily: 'var(--texte)', fontSize: 16, lineHeight: 1.45, color: 'var(--gris)', fontWeight: 600 }}>
                        Une case passe au vert quand tu trouves du premier coup.
                    </div>
                </div>
            )}

            {/* Boutons d'action */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4, marginBottom: 16 }}>
                <button
                    onClick={() => onContinueWeakest(weakestTable)}
                    style={{
                        height: 90, borderRadius: 26, background: 'var(--action)',
                        color: '#fff', fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 25,
                        border: 'none', cursor: 'pointer', boxShadow: 'var(--ombre-douce)',
                    }}
                >
                    Continuer sur la table de {weakestTable}
                </button>
                <div style={{ display: 'flex', gap: 12 }}>
                    <button
                        onClick={onOpenGrid}
                        style={{
                            flex: 1, height: 76, borderRadius: 22,
                            background: 'var(--surface)', color: 'var(--indigo)',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19,
                            border: '1px solid var(--bordure)', boxShadow: 'var(--ombre-douce)', cursor: 'pointer',
                        }}
                    >
                        Ma grille
                    </button>
                    <button
                        onClick={onHome}
                        style={{
                            flex: 1, height: 76, borderRadius: 22,
                            background: '#F1ECE2', color: 'var(--indigo-doux)',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 19,
                            border: 'none', cursor: 'pointer',
                        }}
                    >
                        Accueil
                    </button>
                </div>
            </div>
        </div>
    );
}

/* =========================================================================
   MAQUETTE 7 — Sélecteur de tables (Sprint, Sans faute, Contre-la-montre)
   ========================================================================= */

function Setup({ onBack, picked, setPicked, mode, onStart, onShowGrid, plafond, mastery }) {
    const ModeIcon = MODE_INFO[mode]?.icon || IconSprint;
    const modeName = MODE_INFO[mode]?.name || 'Sprint';
    const unlocked = ALL_TABLES.filter(t => t <= plafond);
    const maxTableShown = Math.max(12, Math.min(20, plafond + 1));
    const tablesToDisplay = ALL_TABLES.filter(t => t <= maxTableShown);

    const toggle = (t) => {
        if (t > plafond) return;
        setPicked(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
    };

    const handleTablesFaibles = async () => {
        try {
            const { mesTablesFaibles } = await import('../api');
            const res = await mesTablesFaibles(3);
            if (res.ok && res.data?.length) {
                setPicked(res.data.filter(t => t <= plafond));
                return;
            }
        } catch {}
        setPicked(unlocked.slice(-3));
    };

    const handleSelectAll = () => setPicked([...unlocked]);
    const handleClear = () => setPicked([]);

    const getTableMasteryColor = (t) => {
        let green = 0, red = 0, total = 0;
        for (let m = 1; m <= 10; m++) {
            const k = cleFait(t, m);
            if (mastery[k] !== undefined) {
                total++;
                if (mastery[k] >= 2) green++;
                else if (mastery[k] === 0 || mastery[k] === 1) red++;
            }
        }
        if (total === 0) return 'var(--bordure)';
        if (red > 0 || (green / total < 0.4)) return 'var(--rouge)';
        if (green / total >= 0.8) return 'var(--vert)';
        return 'var(--orange)';
    };

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Navigation haute */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px 0' }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 20,
                        color: 'var(--indigo-doux)', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                >
                    ‹ Retour
                </button>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--ciel-pale)', padding: '8px 18px', borderRadius: 999,
                }}>
                    <ModeIcon size={22} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18, color: 'var(--indigo)' }}>
                        {modeName}
                    </span>
                </div>
            </div>

            {/* 2. Titre & sous-titre */}
            <div style={{ padding: '6px 4px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2 className="font-display" style={{ margin: 0, fontSize: 36, fontWeight: 800, color: 'var(--indigo)' }}>
                    Sur quelles tables ?
                </h2>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--gris)' }}>
                    Tes tables sont ouvertes jusqu'à la {plafond}. La {plafond + 1} se débloque par la Montée.
                </div>
            </div>

            {/* 3. Boutons d'action rapides */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                <button
                    onClick={handleTablesFaibles}
                    style={{
                        background: 'var(--indigo)', color: 'var(--action-texte)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                        padding: '12px 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    }}
                >
                    Mes 3 tables faibles
                </button>
                <button
                    onClick={handleSelectAll}
                    style={{
                        background: 'var(--surface)', color: 'var(--indigo)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                        padding: '12px 20px', borderRadius: 999,
                        boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)', cursor: 'pointer',
                    }}
                >
                    Tout sélectionner
                </button>
                <button
                    onClick={handleClear}
                    style={{
                        background: 'var(--surface)', color: 'var(--indigo)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                        padding: '12px 20px', borderRadius: 999,
                        boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)', cursor: 'pointer',
                    }}
                >
                    Effacer
                </button>
            </div>

            {/* 4. Légende */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '4px 4px 0', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--indigo-doux)' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--rouge)' }} /> À revoir
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--indigo-doux)' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--orange)' }} /> En cours
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--indigo-doux)' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--vert)' }} /> Maîtrisé
                </div>
            </div>

            {/* 5. Grille des tables (3 colonnes) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 4 }}>
                {tablesToDisplay.map(t => {
                    const locked = t > plafond;
                    const selected = picked.includes(t);
                    const barColor = getTableMasteryColor(t);

                    if (locked) {
                        return (
                            <div
                                key={t}
                                style={{
                                    height: 124, borderRadius: 24, background: '#F2EDE3',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    justifyContent: 'center', gap: 6, cursor: 'not-allowed',
                                }}
                            >
                                <IconCadenas size={24} color="#9A93A8" />
                                <span className="font-display" style={{ fontSize: 34, fontWeight: 700, color: '#B3ACBE' }}>
                                    {t}
                                </span>
                            </div>
                        );
                    }

                    return (
                        <div
                            key={t}
                            onClick={() => toggle(t)}
                            style={{
                                height: 124, borderRadius: 24, cursor: 'pointer',
                                background: selected ? 'var(--action)' : 'var(--surface)',
                                boxShadow: selected ? '0 8px 20px rgba(35,164,217,.28)' : 'var(--ombre-douce)',
                                border: selected ? 'none' : '1px solid var(--bordure)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', gap: 8, position: 'relative',
                                transition: 'all 0.12s ease',
                            }}
                        >
                            <span className="font-display" style={{
                                fontSize: 44, fontWeight: 700,
                                color: selected ? 'var(--action-texte)' : 'var(--indigo)',
                            }}>
                                {t}
                            </span>
                            <span style={{
                                width: 52, height: 8, borderRadius: 4,
                                background: selected ? 'rgba(255,255,255,0.7)' : barColor,
                            }} />
                            {selected && (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', top: 10, right: 10 }}>
                                    <path d="M5 12.5 10 17.5 19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 6. Bouton C'est parti ! */}
            <div style={{ marginTop: 10, marginBottom: 10 }}>
                <button
                    disabled={picked.length === 0}
                    onClick={onStart}
                    style={{
                        width: '100%', height: 76, borderRadius: 24,
                        background: 'var(--action)', color: 'var(--action-texte)',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 24,
                        border: 'none', cursor: picked.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: picked.length === 0 ? 0.45 : 1,
                        boxShadow: 'var(--ombre-douce)',
                    }}
                >
                    C'est parti !
                </button>
            </div>
        </div>
    );
}

/* =========================================================================
   MAQUETTE 1 — Partie en cours (saisie, juste, faux - Sprint / Sans faute / Chrono)
   ========================================================================= */

function Quiz({ tables, length, globalTimer, questionDuration, mode, mastery, onQuit, onDone }) {
    const weights = useMemo(() => buildWeights(tables, mastery), [tables, mastery]);
    const ModeIcon = MODE_INFO[mode]?.icon || IconSprint;
    const modeName = MODE_INFO[mode]?.name || 'Sprint';

    const [sessionWeights, setSessionWeights] = useState(weights);
    const [q, setQ] = useState(() => newQuestion(tables, null, weights));
    const [digits, setDigits] = useState(() => Array(String(q.answer).length).fill(''));
    const [answered, setAnswered] = useState(0);
    const [score, setScore] = useState(0);
    const [scorePremierEssai, setScorePremierEssai] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [recentResults, setRecentResults] = useState([]);
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const [remainingGlobal, setRemainingGlobal] = useState(globalTimer);
    const [questionTimeLeft, setQuestionTimeLeft] = useState(questionDuration);
    const [showHint, setShowHint] = useState(false);

    const [premierEssai, setPremierEssai] = useState(true);
    const [attempts, setAttempts] = useState(0);

    const lockRef = useRef(false);
    const resultatsRef = useRef([]);
    const startRef = useRef(Date.now());
    const scoreRef = useRef(0);
    const scorePremierRef = useRef(0);
    const answeredRef = useRef(0);
    const maxStreakRef = useRef(0);
    const streakRef = useRef(0);
    const timedOut = useRef(false);
    const questionTimerRef = useRef(null);

    const endless = length === 0;
    const hasGlobalTimer = globalTimer > 0;
    const hasQuestionTimer = questionDuration > 0;
    const numDigits = String(q.answer).length;

    // Timer global (Contre-la-montre)
    useEffect(() => {
        if (!hasGlobalTimer) return;
        const id = setInterval(() => {
            setRemainingGlobal(r => {
                if (r <= 1) {
                    clearInterval(id);
                    if (!timedOut.current) {
                        timedOut.current = true;
                        setTimeout(() => {
                            onDone({
                                score: scoreRef.current,
                                scorePremierEssai: scorePremierRef.current,
                                answered: answeredRef.current,
                                maxStreak: maxStreakRef.current,
                                resultats: resultatsRef.current,
                                seconds: globalTimer, timerMode: true,
                            });
                        }, 0);
                    }
                    return 0;
                }
                return r - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [hasGlobalTimer, globalTimer, onDone]);

    // Timer par question (Sprint : 3 s)
    useEffect(() => {
        if (!hasQuestionTimer || fb !== 'idle') return;
        setQuestionTimeLeft(questionDuration);
        const startTime = Date.now();
        const interval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const left = Math.max(0, questionDuration - elapsed);
            setQuestionTimeLeft(left);
            if (left <= 0) {
                clearInterval(interval);
                handleQuestionTimeout();
            }
        }, 50);
        questionTimerRef.current = interval;
        return () => clearInterval(interval);
    }, [q, hasQuestionTimer, questionDuration, fb]);

    const handleQuestionTimeout = useCallback(() => {
        if (lockRef.current || timedOut.current) return;
        lockRef.current = true;
        setFb('wrong');
        setWord('Temps écoulé !');
        setTimeout(() => {
            recordAndAdvance('jamais');
        }, 400);
    }, []);

    const nextQuestion = useCallback(() => {
        lockRef.current = false;
        setFb('idle');
        setWord('');
        setShowHint(false);
        setPremierEssai(true);
        setAttempts(0);
        const newQ = newQuestion(tables, q, sessionWeights);
        setQ(newQ);
        setDigits(Array(String(newQ.answer).length).fill(''));
    }, [tables, q, sessionWeights]);

    const recordAndAdvance = useCallback((res) => {
        resultatsRef.current.push({ a: q.a, b: q.b, result: res });
        answeredRef.current += 1;
        setAnswered(a => a + 1);

        setRecentResults(prev => [...prev.slice(-4), res]);

        if (res === 'premier') {
            scoreRef.current += 1;
            scorePremierRef.current += 1;
            setScore(s => s + 1);
            setScorePremierEssai(s => s + 1);
            streakRef.current += 1;
            if (streakRef.current > maxStreakRef.current) maxStreakRef.current = streakRef.current;
            setStreak(streakRef.current);
            setMaxStreak(maxStreakRef.current);
        } else if (res === 'rattrape') {
            scoreRef.current += 1;
            setScore(s => s + 1);
            streakRef.current = 0;
            setStreak(0);
        } else {
            streakRef.current = 0;
            setStreak(0);
        }

        const key = cleFait(q.a, q.b);
        setSessionWeights(w => ({
            ...w,
            [key]: Math.min((w[key] || 1) + (res === 'jamais' ? 4 : res === 'rattrape' ? 2 : 0), 8)
        }));

        const delay = (res === 'premier' || res === 'rattrape') ? 180 : 200;

        setTimeout(() => {
            if (timedOut.current) return;
            if (!endless && answeredRef.current >= length) {
                onDone({
                    score: scoreRef.current,
                    scorePremierEssai: scorePremierRef.current,
                    answered: length,
                    maxStreak: maxStreakRef.current,
                    resultats: resultatsRef.current,
                    seconds: Math.round((Date.now() - startRef.current) / 1000),
                    timerMode: hasGlobalTimer,
                });
            } else {
                nextQuestion();
            }
        }, delay);
    }, [q, endless, length, hasGlobalTimer, onDone, nextQuestion]);

    const handleComplete = useCallback((value) => {
        if (lockRef.current || timedOut.current) return;
        const ok = value === q.answer;
        const att = attempts + 1;
        setAttempts(att);

        if (ok) {
            lockRef.current = true;
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            const res = premierEssai ? 'premier' : 'rattrape';
            recordAndAdvance(res);
        } else {
            setPremierEssai(false);
            setFb('wrong');
            const remainingSec = hasQuestionTimer ? questionTimeLeft.toFixed(1) : null;
            setWord(remainingSec && parseFloat(remainingSec) > 0 ? `Presque — il te reste ${remainingSec} s` : 'Presque !');

            setTimeout(() => {
                if (att >= 2 && mode !== 'sprint') {
                    recordAndAdvance('jamais');
                } else {
                    setFb('idle');
                    setDigits(Array(numDigits).fill(''));
                }
            }, 200);
        }
    }, [q, attempts, premierEssai, hasQuestionTimer, questionTimeLeft, numDigits, recordAndAdvance, mode]);

    const press = useCallback((d) => {
        if (lockRef.current || fb !== 'idle') return;
        setDigits(prev => {
            const idx = prev.findIndex(x => x === '');
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = d;
            if (idx === numDigits - 1) {
                setTimeout(() => handleComplete(parseInt(next.join(''), 10)), 0);
            }
            return next;
        });
    }, [fb, numDigits, handleComplete]);

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

    useEffect(() => {
        const h = (e) => {
            if (e.key >= '0' && e.key <= '9') { e.preventDefault(); press(parseInt(e.key, 10)); }
            else if (e.key === 'Backspace') { e.preventDefault(); del(); }
            else if (e.key === 'Escape') { onQuit(); }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [press, del, onQuit]);

    const activeIndex = digits.findIndex(d => d === '');
    const currentQuestionNum = Math.min(answered + 1, length || answered + 1);
    const progressPct = length > 0 ? (answered / length) * 100 : 0;
    const questionPct = hasQuestionTimer ? (questionTimeLeft / questionDuration) * 100 : 100;

    const mosaicColors = {
        premier: 'var(--vert)',
        rattrape: 'var(--orange)',
        jamais: 'var(--rouge)',
    };

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', boxSizing: 'border-box' }}>
            {/* Top Bar : Quitter + Badge mode */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px 0' }}>
                <button
                    onClick={onQuit}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 20,
                        color: 'var(--indigo-doux)',
                    }}
                >
                    ‹ Quitter
                </button>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--ciel-pale)', padding: '8px 18px', borderRadius: 999,
                }}>
                    <ModeIcon size={20} color="var(--indigo)" actionColor="var(--action)" />
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17, color: 'var(--indigo)' }}>
                        {modeName}
                    </span>
                </div>
            </div>

            {/* Barre de progression & Compteur Série Mosaïque */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 4px 0' }}>
                <div className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--indigo)', whiteSpace: 'nowrap' }}>
                    {currentQuestionNum}<span style={{ color: 'var(--gris)', fontSize: 18, fontWeight: 600 }}> / {length || '∞'}</span>
                </div>
                <div style={{ flex: 1, height: 10, borderRadius: 999, background: 'var(--bordure)', overflow: 'hidden' }}>
                    <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--indigo)', borderRadius: 999, transition: 'width 0.2s ease' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 12px)', gap: 4 }}>
                        {[0, 1, 2, 3, 4].map(i => {
                            const res = recentResults[i];
                            const bg = res ? mosaicColors[res] : 'var(--bordure)';
                            return (
                                <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: bg }} />
                            );
                        })}
                    </div>
                    <span className="font-display" style={{
                        fontSize: 22, fontWeight: 800,
                        color: fb === 'correct' ? 'var(--vert)' : streak > 0 ? 'var(--indigo)' : 'var(--gris)',
                    }}>
                        {streak}
                    </span>
                </div>
            </div>

            {/* Carte Question + Cases de saisie */}
            <div style={{ position: 'relative', marginTop: 14 }}>
                {fb === 'correct' && (
                    <>
                        <div style={{ position: 'absolute', top: -10, left: 24, width: 18, height: 18, borderRadius: 4, background: 'var(--rouge)', transform: 'rotate(18deg)', zIndex: 3 }} />
                        <div style={{ position: 'absolute', top: 26, left: -8, width: 16, height: 16, borderRadius: 4, background: 'var(--orange)', transform: 'rotate(-12deg)', zIndex: 3 }} />
                        <div style={{ position: 'absolute', top: -14, right: 70, width: 18, height: 18, borderRadius: 4, background: 'var(--action)', transform: 'rotate(24deg)', zIndex: 3 }} />
                        <div style={{ position: 'absolute', top: 38, right: -10, width: 20, height: 20, borderRadius: 5, background: 'var(--vert)', transform: 'rotate(-20deg)', zIndex: 3 }} />
                    </>
                )}

                <div
                    className={fb === 'wrong' ? 'anim-shake' : ''}
                    style={{
                        background: 'var(--surface)', borderRadius: 32, padding: '26px 24px 30px',
                        boxShadow: fb === 'correct'
                            ? '0 0 0 4px var(--vert-pale), 0 8px 22px rgba(32,34,107,.10)'
                            : fb === 'wrong'
                                ? '0 0 0 4px var(--rouge-pale), 0 8px 22px rgba(32,34,107,.10)'
                                : '0 6px 16px rgba(32,34,107,.08)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
                        position: 'relative', border: '1px solid var(--bordure)',
                        transition: 'box-shadow 0.15s ease',
                    }}
                >
                    {fb === 'correct' && (
                        <div style={{
                            position: 'absolute', top: 20, right: 24,
                            background: 'var(--vert)', color: '#fff',
                            fontFamily: 'var(--titre)', fontWeight: 800, fontSize: 24,
                            padding: '4px 16px', borderRadius: 999,
                        }}>
                            +1
                        </div>
                    )}

                    <div className="question-text font-display" style={{
                        color: 'var(--indigo)', letterSpacing: '0.02em', margin: 0,
                    }}>
                        {q.a} <span style={{ color: 'var(--gris)' }}>×</span> {q.b}
                    </div>

                    {hasQuestionTimer && (
                        <div style={{ width: '100%', height: 8, borderRadius: 999, background: 'var(--bordure)', overflow: 'hidden' }}>
                            <div style={{
                                width: `${questionPct}%`, height: '100%',
                                background: fb === 'correct' ? 'var(--vert)' : 'var(--action)',
                                borderRadius: 999, transition: 'width 0.05s linear',
                            }} />
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 14 }}>
                        {digits.map((d, i) => {
                            const isCurrent = i === activeIndex && fb === 'idle';
                            const isCorrect = fb === 'correct';
                            const isWrong = fb === 'wrong';

                            return (
                                <div
                                    key={i}
                                    style={{
                                        width: 96, height: 116, borderRadius: 22,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 72,
                                        background: isCorrect ? 'var(--vert)' : isWrong ? 'var(--rouge-pale)' : (d ? 'var(--surface)' : '#F6F2EA'),
                                        border: isCorrect ? 'none' : isWrong ? '4px solid var(--rouge-doux)' : (isCurrent ? '4px solid var(--action)' : '4px solid var(--bordure)'),
                                        color: isCorrect ? '#fff' : isWrong ? 'var(--rouge-doux)' : 'var(--indigo)',
                                        transition: 'all 0.1s ease',
                                    }}
                                >
                                    {d || (isCurrent ? <div style={{ width: 4, height: 50, background: 'var(--indigo-doux)', borderRadius: 2 }} className="caret" /> : '')}
                                </div>
                            );
                        })}
                    </div>

                    {word && (
                        <div style={{
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
                            color: fb === 'wrong' ? 'var(--rouge-doux)' : 'var(--vert)',
                        }}>
                            {word}
                        </div>
                    )}

                    {showHint && fb === 'idle' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--indigo-doux)', fontWeight: 600 }}>
                            <IconAmpoule size={18} color="var(--indigo-doux)" /> {makeHint(q.a, q.b)}
                        </div>
                    )}
                </div>
            </div>

            <div style={{ flex: 1 }} />

            <div style={{ paddingBottom: 16 }}>
                <Keypad onPress={press} onDelete={del} disabled={lockRef.current} />
            </div>
        </div>
    );
}

/* =========================================================================
   MAQUETTE 3 — Fin de partie (Sprint, Sans faute, Contre-la-montre)
   ========================================================================= */

function Results({ result, serverResult, mode, onReplay, onReviewErrors, onHome, onSetup }) {
    if (!result) return null;
    const { score, scorePremierEssai, answered, maxStreak, resultats, seconds } = result;
    const modeName = MODE_INFO[mode]?.name || 'Sprint';

    const premierCount = serverResult?.premier_essai ?? (scorePremierEssai ?? score);
    const rattrapees = serverResult?.rattrapees ?? (score - premierCount);
    const pointsGagnes = serverResult?.points ?? score;
    const badges = serverResult?.nouveaux_badges || [];

    const vitesseMoyenne = answered > 0 ? (seconds / answered).toFixed(1).replace('.', ',') : '0';

    const wrongTables = [...new Set(
        (resultats || []).filter(r => r.result !== 'premier').map(r => r.a)
    )].sort((a, b) => a - b);

    const faitsTravailles = useMemo(() => {
        const vus = new Map();
        (resultats || []).forEach(r => {
            const label = `${r.a}×${r.b}`;
            vus.set(label, r.result);
        });
        return Array.from(vus.entries());
    }, [resultats]);

    const nbVertes = faitsTravailles.filter(([_, res]) => res === 'premier').length;

    useEffect(() => {
        import('canvas-confetti').then(mod => {
            const fire = mod.default;
            const style = getComputedStyle(document.documentElement);
            const colors = ['--mosaique-1', '--mosaique-2', '--mosaique-3', '--mosaique-4', '--mosaique-5']
                .map(v => style.getPropertyValue(v).trim())
                .filter(Boolean);
            fire({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: colors.length ? colors : undefined });
        }).catch(() => {});
    }, []);

    return (
        <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 20, left: 30, width: 22, height: 22, borderRadius: 5, background: 'var(--rouge)', transform: 'rotate(16deg)' }} />
            <div style={{ position: 'absolute', top: 60, right: 40, width: 18, height: 18, borderRadius: 4, background: 'var(--action)', transform: 'rotate(-22deg)' }} />
            <div style={{ position: 'absolute', top: 120, left: 60, width: 16, height: 16, borderRadius: 4, background: 'var(--orange)', transform: 'rotate(34deg)' }} />
            <div style={{ position: 'absolute', top: 10, right: 120, width: 14, height: 14, borderRadius: 3, background: 'var(--vert)', transform: 'rotate(-10deg)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 10 }}>
                <div style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 22, color: 'var(--vert)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {modeName.toUpperCase()} TERMINÉ
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span className="font-display" style={{ fontSize: 120, fontWeight: 800, color: 'var(--indigo)', lineHeight: 1 }}>
                        {premierCount}
                    </span>
                    <span className="font-display" style={{ fontSize: 44, fontWeight: 800, color: 'var(--gris)' }}>
                        / {answered}
                    </span>
                </div>
                <div style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 20, color: 'var(--indigo-doux)' }}>
                    du premier coup
                </div>
                {rattrapees > 0 && (
                    <div style={{
                        marginTop: 4, background: 'var(--orange-pale)', color: '#8A5A10',
                        fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 16,
                        padding: '8px 20px', borderRadius: 999,
                    }}>
                        {rattrapees} rattrapée{rattrapees > 1 ? 's' : ''} au 2ᵉ essai · ½ pt chacune
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <div style={{
                    flex: 1, background: 'var(--surface)', borderRadius: 22, padding: '16px 12px',
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                    <span className="font-display" style={{ fontSize: 34, fontWeight: 800, color: 'var(--vert)' }}>
                        +{pointsGagnes}
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                        points
                    </span>
                </div>
                <div style={{
                    flex: 1, background: 'var(--surface)', borderRadius: 22, padding: '16px 12px',
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                    <span className="font-display" style={{ fontSize: 34, fontWeight: 800, color: 'var(--indigo)' }}>
                        {maxStreak}
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                        meilleure série
                    </span>
                </div>
                <div style={{
                    flex: 1, background: 'var(--surface)', borderRadius: 22, padding: '16px 12px',
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                    <span className="font-display" style={{ fontSize: 34, fontWeight: 800, color: 'var(--indigo)' }}>
                        {vitesseMoyenne} s
                    </span>
                    <span style={{ fontFamily: 'var(--texte)', fontWeight: 600, fontSize: 14, color: 'var(--gris)' }}>
                        par question
                    </span>
                </div>
            </div>

            {badges.length > 0 && (
                <div style={{
                    background: 'var(--indigo)', borderRadius: 26, padding: '20px 22px',
                    display: 'flex', alignItems: 'center', gap: 18,
                }}>
                    <div style={{
                        width: 72, height: 72, borderRadius: 20, background: 'var(--orange)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, flexShrink: 0,
                    }}>
                        🏅
                    </div>
                    <div>
                        <div style={{ fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 14, color: 'var(--orange)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                            Nouveau badge
                        </div>
                        <div className="font-display" style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 2 }}>
                            {badges[0]?.nom || badges[0]}
                        </div>
                    </div>
                </div>
            )}

            {faitsTravailles.length > 0 && (
                <div style={{
                    background: 'var(--surface)', borderRadius: 26, padding: '20px 22px',
                    boxShadow: 'var(--ombre-douce)', border: '1px solid var(--bordure)',
                    display: 'flex', flexDirection: 'column', gap: 14,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--indigo)' }}>
                            Ta grille a bougé
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gris)' }}>
                            {nbVertes} case{nbVertes > 1 ? 's passent' : ' passe'} au vert
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {faitsTravailles.slice(0, 8).map(([fait, res], i) => {
                            const bg = res === 'premier' ? 'var(--vert)' : res === 'rattrape' ? 'var(--orange)' : 'var(--rouge)';
                            const txt = res === 'rattrape' ? '#4A3706' : '#fff';
                            return (
                                <div
                                    key={i}
                                    style={{
                                        width: 58, height: 58, borderRadius: 14, background: bg,
                                        color: txt, fontFamily: 'var(--titre)', fontWeight: 700, fontSize: 18,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    {fait}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4, marginBottom: 12 }}>
                <button
                    onClick={onReplay}
                    style={{
                        height: 74, borderRadius: 24, background: 'var(--action)',
                        color: 'var(--action-texte)', fontFamily: 'var(--texte)', fontWeight: 700,
                        fontSize: 22, border: 'none', cursor: 'pointer', boxShadow: 'var(--ombre-douce)',
                    }}
                >
                    Rejouer un {modeName}
                </button>
                <div style={{ display: 'flex', gap: 12 }}>
                    {wrongTables.length > 0 && (
                        <button
                            onClick={() => onReviewErrors(wrongTables)}
                            style={{
                                flex: 2, height: 68, borderRadius: 22,
                                background: 'var(--rouge-pale)', color: '#8E2C30',
                                fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 17,
                                border: 'none', cursor: 'pointer',
                            }}
                        >
                            Réviser mes {wrongTables.length} cases rouges
                        </button>
                    )}
                    <button
                        onClick={onHome}
                        style={{
                            flex: 1, height: 68, borderRadius: 22,
                            background: '#F1ECE2', color: 'var(--indigo-doux)',
                            fontFamily: 'var(--texte)', fontWeight: 700, fontSize: 18,
                            border: 'none', cursor: 'pointer',
                        }}
                    >
                        Accueil
                    </button>
                </div>
            </div>
        </div>
    );
}
