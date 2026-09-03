import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ALL_TABLES, PRAISE, newQuestion, makeHint } from '../logic/questions';
import { updateMastery, buildWeights, construireErreurs, construireMaitrise, cleFait } from '../logic/mastery';
import { enregistrerSession, enregistrerSessionProf } from '../api';
import Keypad from '../components/Keypad';
import TimerRing from '../components/TimerRing';
import MasteryGrid from '../components/MasteryGrid';
import { IconCadenas, IconSprint, IconSansFaute, IconChrono, IconMontee, IconMaGrille, IconAmpoule } from '../components/Icons';

/**
 * Practice — Modes de jeu élève (Maquettes 1, 3, 7)
 * Phases : setup (Maquette 7) → quiz (Maquette 1) → results (Maquette 3)
 */

const DEFAULT_TABLES = [2, 3, 4, 5];

const MODE_INFO = {
    sprint: { name: 'Sprint', icon: IconSprint, desc: '20 questions, 3 s chacune', defaultLen: 20, qTimer: 3 },
    flawless: { name: 'Sans faute', icon: IconSansFaute, desc: 'Zéro erreur, pas de chrono', defaultLen: 20, qTimer: 0 },
    countdown: { name: 'Contre-la-montre', icon: IconChrono, desc: '2 min, un max de bonnes', defaultLen: 0, qTimer: 0, globalTimer: 120 },
    libre: { name: 'S\'entraîner', icon: IconSansFaute, desc: 'Entraînement libre', defaultLen: 10, qTimer: 0 },
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
    const mode = config?.mode || 'sprint';
    const modeMeta = MODE_INFO[mode] || MODE_INFO.sprint;

    const initialLength = config?.length !== undefined ? config.length : (modeMeta.defaultLen || 20);
    const initialGlobalTimer = mode === 'countdown' ? (config?.timer || modeMeta.globalTimer || 120) : 0;
    const questionDuration = mode === 'sprint' ? (config?.timer || modeMeta.qTimer || 3) : 0;

    const [phase, setPhase] = useState(tablesInitiales?.length ? 'quiz' : 'setup');
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
        setPhase('results');

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
    }, [picked, estProf, identite, onPlafondChange, mode]);

    const startWithTables = (tables, len) => {
        setPicked(tables);
        setLength(len);
        setPhase('quiz');
    };

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

/* =========================================================================
   MAQUETTE 7 — Sélecteur de tables
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
        // Repli : les 3 dernières tables débloquées
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
                else if (mastery[k] === 0) red++;
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
   MAQUETTE 1 — Partie en cours (saisie, juste, faux)
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
    const [recentResults, setRecentResults] = useState([]); // Derniers résultats pour la mosaïque (max 5)
    const [fb, setFb] = useState('idle'); // 'idle' | 'correct' | 'wrong' | 'reveal'
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

    // Prochaine question
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

    // Enregistrement du résultat et progression
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

    // Soumission automatique à la dernière case
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
                    // 2 erreurs consécutives en mode non-sprint
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

    // Clavier physique
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

    // Palette mosaïque pour les 5 derniers résultats
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
                {/* Floating confetti when correct */}
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
                    {/* Floating +1 on correct */}
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

                    {/* Question text */}
                    <div className="question-text font-display" style={{
                        color: 'var(--indigo)', letterSpacing: '0.02em', margin: 0,
                    }}>
                        {q.a} <span style={{ color: 'var(--gris)' }}>×</span> {q.b}
                    </div>

                    {/* Barre de compte à rebours par question */}
                    {hasQuestionTimer && (
                        <div style={{ width: '100%', height: 8, borderRadius: 999, background: 'var(--bordure)', overflow: 'hidden' }}>
                            <div style={{
                                width: `${questionPct}%`, height: '100%',
                                background: fb === 'correct' ? 'var(--vert)' : 'var(--action)',
                                borderRadius: 999, transition: 'width 0.05s linear',
                            }} />
                        </div>
                    )}

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

                    {/* Feedback text */}
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

            {/* Pavé numérique */}
            <div style={{ paddingBottom: 16 }}>
                <Keypad onPress={press} onDelete={del} disabled={lockRef.current} />
            </div>
        </div>
    );
}

/* =========================================================================
   MAQUETTE 3 — Fin de partie
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

    // Tables avec erreurs
    const wrongTables = [...new Set(
        (resultats || []).filter(r => r.result !== 'premier').map(r => r.a)
    )].sort((a, b) => a - b);

    // Faits travaillés lors de cette session
    const faitsTravailles = useMemo(() => {
        const vus = new Map();
        (resultats || []).forEach(r => {
            const label = `${r.a}×${r.b}`;
            vus.set(label, r.result);
        });
        return Array.from(vus.entries());
    }, [resultats]);

    const nbVertes = faitsTravailles.filter(([_, res]) => res === 'premier').length;

    // Déclenchement confettis
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
            {/* Confettis décoratifs statiques */}
            <div style={{ position: 'absolute', top: 20, left: 30, width: 22, height: 22, borderRadius: 5, background: 'var(--rouge)', transform: 'rotate(16deg)' }} />
            <div style={{ position: 'absolute', top: 60, right: 40, width: 18, height: 18, borderRadius: 4, background: 'var(--action)', transform: 'rotate(-22deg)' }} />
            <div style={{ position: 'absolute', top: 120, left: 60, width: 16, height: 16, borderRadius: 4, background: 'var(--orange)', transform: 'rotate(34deg)' }} />
            <div style={{ position: 'absolute', top: 10, right: 120, width: 14, height: 14, borderRadius: 3, background: 'var(--vert)', transform: 'rotate(-10deg)' }} />

            {/* En-tête Score */}
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

            {/* 3 Cartes de statistiques */}
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

            {/* Nouveau badge débloqué */}
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

            {/* Carte : Ta grille a bougé */}
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

            {/* Boutons d'action inférieurs */}
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
