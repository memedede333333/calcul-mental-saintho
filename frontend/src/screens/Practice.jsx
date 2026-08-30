import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ALL_TABLES, PRAISE, newQuestion, makeHint } from '../logic/questions';
import { updateMastery, buildWeights, construireErreurs, construireMaitrise, cleFait } from '../logic/mastery';
import { enregistrerSession, enregistrerSessionProf } from '../api';
import Keypad from '../components/Keypad';
import TimerRing from '../components/TimerRing';
import MasteryGrid from '../components/MasteryGrid';

/**
 * Practice — Mode S'entraîner complet
 * Phases : setup → quiz → results
 *
 * Modèle à cases (28/08) : autant de cases que de chiffres dans la
 * réponse. Dès que la dernière est remplie, le système juge.
 * En entraînement libre : pas de chrono par question, 3 tentatives max.
 */

const DEFAULT_TABLES = [2, 3, 4, 5];

export default function Practice({ onBack, identite, estProf, onPlafondChange, tablesInitiales, maitrise: maitriseProp }) {
    const [phase, setPhase] = useState(tablesInitiales?.length ? 'quiz' : 'setup');
    const [picked, setPicked] = useState(tablesInitiales?.length ? tablesInitiales : DEFAULT_TABLES);
    const [length, setLength] = useState(10);
    const [timer, setTimer] = useState(0);
    const [result, setResult] = useState(null);
    const [serverResult, setServerResult] = useState(null);
    const [showGrid, setShowGrid] = useState(false);
    const [mastery, setMastery] = useState(maitriseProp || {});

    // Sync quand la prop maitrise arrive/change
    useEffect(() => { if (maitriseProp) setMastery(maitriseProp); }, [maitriseProp]);

    const handleDone = useCallback((r) => {
        // r contient : { score, scorePremierEssai, answered, maxStreak, resultats, seconds, timerMode }
        const maitriseSortie = construireMaitrise(r.resultats);
        // Merge session mastery into local
        setMastery(prev => ({ ...prev, ...maitriseSortie }));
        setResult(r);
        setServerResult(null);
        setPhase('results');

        const mode = r.timerMode ? 'countdown' : 'libre';
        const erreurs = construireErreurs(r.resultats);

        const session = {
            mode,
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
                if (np && np !== (identite?.profil?.plafond_tables || 10)) {
                    onPlafondChange?.(np);
                }
            } else {
                setServerResult({ erreur: res.error, enAttente: res.enAttente });
            }
        }).catch(() => {});
    }, [picked, estProf, identite, onPlafondChange]);

    const start = (tables, len) => {
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
                    picked={picked} setPicked={setPicked}
                    length={length} setLength={setLength}
                    timer={timer} setTimer={setTimer}
                    onStart={() => setPhase('quiz')}
                    onShowGrid={() => setShowGrid(true)}
                    plafond={identite?.profil?.plafond_tables || 10}
                />
            </>
        );
    }

    if (phase === 'quiz') {
        return (
            <Quiz
                tables={picked.length ? picked : ALL_TABLES.slice(0, 10)}
                length={timer > 0 ? 0 : length}
                timer={timer}
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
            onReplay={() => { setServerResult(null); setPhase('quiz'); }}
            onReviewErrors={(tables) => start(tables, 10)}
            onHome={onBack}
            onSetup={() => setPhase('setup')}
        />
    );
}

/* ===================== SETUP ===================== */

function Setup({ onBack, picked, setPicked, length, setLength, timer, setTimer, onStart, onShowGrid, plafond }) {
    const unlocked = ALL_TABLES.filter(t => t <= plafond);
    const toggle = (t) => {
        if (t > plafond) return;
        setPicked(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
    };
    const allUnlocked = unlocked.every(t => picked.includes(t));
    const timerOn = timer > 0;
    const hasLocked = ALL_TABLES.some(t => t > plafond);

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            {/* Sélection des tables */}
            <div className="card">
                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800 }}>Choisis tes tables</h2>
                <div className="chips" style={{ margin: '14px 0' }}>
                    {ALL_TABLES.map(t => {
                        const locked = t > plafond;
                        return (
                            <button
                                key={t}
                                className={`chip${picked.includes(t) ? ' chip--coral' : ''}`}
                                style={{
                                    opacity: locked ? 0.4 : 1,
                                    cursor: locked ? 'not-allowed' : 'pointer',
                                }}
                                onClick={() => toggle(t)}
                                title={locked ? 'Débloque en Montée des tables' : ''}
                            >
                                {locked ? `🔒 ${t}` : t}
                            </button>
                        );
                    })}
                </div>
                <button
                    className="btn btn--ghost"
                    style={{ fontSize: 15, padding: '10px 16px' }}
                    onClick={() => setPicked(allUnlocked ? [] : [...unlocked])}
                >
                    {allUnlocked ? 'Tout décocher' : 'Tout choisir'}
                </button>
                {hasLocked && (
                    <p style={{
                        textAlign: 'center', fontSize: 13, color: 'var(--text-soft)',
                        fontWeight: 600, marginTop: 8,
                    }}>
                        Débloque les tables suivantes avec la Montée des tables 🧗
                    </p>
                )}
            </div>

            {/* Nombre de questions */}
            <div className="card" style={{ marginTop: 14 }}>
                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
                    Combien de questions ?
                </h2>
                <div style={{ display: 'flex', gap: 10, opacity: timerOn ? 0.35 : 1, pointerEvents: timerOn ? 'none' : 'auto' }}>
                    {[{ v: 10, l: '10' }, { v: 20, l: '20' }, { v: 40, l: '40' }, { v: 0, l: '∞' }].map(o => (
                        <button
                            key={o.v}
                            onClick={() => setLength(o.v)}
                            className={`chip${length === o.v && !timerOn ? ' chip--coral' : ''}`}
                            style={{ flex: 1, width: 'auto' }}
                        >
                            {o.l}
                        </button>
                    ))}
                </div>
                {timerOn && (
                    <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-soft)', marginTop: 8 }}>
                        Le chrono remplace le nombre de questions
                    </p>
                )}
            </div>

            {/* Chrono */}
            <div className="card" style={{ marginTop: 14 }}>
                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
                    ⏱ Chrono
                </h2>
                <div style={{ display: 'flex', gap: 10 }}>
                    {[{ v: 0, l: 'Non' }, { v: 60, l: '1 min' }, { v: 120, l: '2 min' }, { v: 180, l: '3 min' }].map(o => (
                        <button
                            key={o.v}
                            onClick={() => setTimer(o.v)}
                            className={`chip${timer === o.v ? ' chip--coral' : ''}`}
                            style={{ flex: 1, width: 'auto', fontSize: 16 }}
                        >
                            {o.l}
                        </button>
                    ))}
                </div>
            </div>

            {/* Boutons Go + Grille */}
            <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
                <button
                    className="btn btn--coral"
                    style={{ flex: 1, fontSize: 22, padding: 16 }}
                    disabled={picked.length === 0}
                    onClick={onStart}
                >
                    C'est parti ! 🚀
                </button>
                <button
                    className="btn btn--purple"
                    style={{ padding: '16px 18px', fontSize: 20 }}
                    onClick={onShowGrid}
                    title="Grille de maîtrise"
                >
                    🗺
                </button>
            </div>
            {picked.length === 0 && (
                <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-soft)', marginTop: 8 }}>
                    Choisis au moins une table.
                </p>
            )}
        </div>
    );
}

/* ===================== QUIZ — Modèle à cases ===================== */

function Quiz({ tables, length, timer, mastery, onQuit, onDone }) {
    const weights = useMemo(() => buildWeights(tables, mastery), [tables, mastery]);

    const [sessionWeights, setSessionWeights] = useState(weights);
    const [q, setQ] = useState(() => newQuestion(tables, null, weights));
    const [digits, setDigits] = useState(() => Array(String(q.answer).length).fill(''));
    const [answered, setAnswered] = useState(0);
    const [score, setScore] = useState(0);
    const [scorePremierEssai, setScorePremierEssai] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const [remaining, setRemaining] = useState(timer);
    const [showHint, setShowHint] = useState(false);

    // Per-question state
    const [premierEssai, setPremierEssai] = useState(true);
    const [attempts, setAttempts] = useState(0);
    const [responseStart, setResponseStart] = useState(null); // temps après 1ère touche

    const lockRef = useRef(false);
    const resultatsRef = useRef([]); // { a, b, result: 'premier'|'rattrape'|'jamais' }
    const startRef = useRef(Date.now());
    // Les compteurs vivent dans des refs, pas seulement dans l'état.
    // Une closure capturée par un setTimeout lit l'état du rendu
    // précédent : à la dernière question, le score partirait
    // amputé d'une unité. C'est arrivé, ne le refais pas.
    const scoreRef = useRef(0);
    const scorePremierRef = useRef(0);
    const answeredRef = useRef(0);
    const maxStreakRef = useRef(0);
    const streakRef = useRef(0);
    const timedOut = useRef(false);
    const endless = length === 0;
    const hasTimer = timer > 0;
    const numDigits = String(q.answer).length;

    // Global timer countdown
    useEffect(() => {
        if (!hasTimer) return;
        const id = setInterval(() => {
            setRemaining(r => {
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
                                seconds: timer, timerMode: true
                            });
                        }, 0);
                    }
                    return 0;
                }
                return r - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [hasTimer, timer, onDone]);

    const finish = useCallback(() => {
        onDone({
            score: scoreRef.current, scorePremierEssai: scorePremierRef.current,
            answered: endless ? answeredRef.current : length,
            maxStreak: maxStreakRef.current,
            resultats: resultatsRef.current,
            seconds: Math.round((Date.now() - startRef.current) / 1000), timerMode: hasTimer
        });
    }, [length, endless, hasTimer, onDone]);

    // Advance to next question
    const nextQuestion = useCallback(() => {
        lockRef.current = false;
        setFb('idle'); setWord(''); setShowHint(false);
        setPremierEssai(true); setAttempts(0); setResponseStart(null);
        const newQ = newQuestion(tables, q, sessionWeights);
        setQ(newQ);
        setDigits(Array(String(newQ.answer).length).fill(''));
    }, [tables, q, sessionWeights]);

    // Record result and move on
    const recordAndAdvance = useCallback((result) => {
        // Refs d'abord — toujours à jour pour onDone dans le setTimeout
        resultatsRef.current.push({ a: q.a, b: q.b, result });
        answeredRef.current += 1;
        setAnswered(a => a + 1);

        if (result === 'premier') {
            scoreRef.current += 1;
            scorePremierRef.current += 1;
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

        // Update session weights
        const key = cleFait(q.a, q.b);
        setSessionWeights(w => ({
            ...w,
            [key]: Math.min((w[key] || 1) + (result === 'jamais' ? 4 : result === 'rattrape' ? 2 : 0), 8)
        }));

        const delay = result === 'premier' ? 400 : result === 'rattrape' ? 600 : 800;

        setTimeout(() => {
            if (timedOut.current) return;
            if (!endless && answeredRef.current >= length) {
                onDone({
                    score: scoreRef.current,
                    scorePremierEssai: scorePremierRef.current,
                    answered: length,
                    maxStreak: maxStreakRef.current,
                    resultats: resultatsRef.current,
                    seconds: Math.round((Date.now() - startRef.current) / 1000), timerMode: hasTimer
                });
            } else {
                nextQuestion();
            }
        }, delay);
    }, [q, endless, length, hasTimer, onDone, nextQuestion]);

    // When digit boxes are complete (last digit filled)
    const handleComplete = useCallback((value) => {
        if (lockRef.current || timedOut.current) return;
        const ok = value === q.answer;
        const att = attempts + 1;
        setAttempts(att);

        if (ok) {
            lockRef.current = true;
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            // Show response time in libre mode
            if (!hasTimer && responseStart) {
                const dt = ((Date.now() - responseStart) / 1000).toFixed(1);
                setWord(`✓ ${dt} s`);
            }
            const result = premierEssai ? 'premier' : 'rattrape';
            recordAndAdvance(result);
        } else {
            // Wrong
            setPremierEssai(false);
            setFb('wrong');

            // En entraînement libre : après 3 tentatives, montrer la réponse
            if (!hasTimer && att >= 3) {
                lockRef.current = true;
                setWord(`${q.a} × ${q.b} = ${q.answer}`);
                // Show answer in the boxes
                setTimeout(() => {
                    setFb('reveal');
                    setDigits(String(q.answer).split(''));
                }, 300);
                setTimeout(() => {
                    recordAndAdvance('jamais');
                }, 1800); // 300ms shake + 1500ms reveal
                return;
            }

            // Reset boxes after shake
            setTimeout(() => {
                setFb('idle');
                setWord('');
                setDigits(Array(numDigits).fill(''));
            }, 300);
        }
    }, [q, attempts, premierEssai, hasTimer, responseStart, numDigits, recordAndAdvance]);

    // Digit input handlers
    const press = useCallback((d) => {
        if (lockRef.current || (fb !== 'idle')) return;
        setDigits(prev => {
            const idx = prev.findIndex(x => x === '');
            if (idx === -1) return prev;
            // First key → record start time
            if (idx === 0 && prev.every(x => x === '')) {
                setResponseStart(Date.now());
            }
            const next = [...prev];
            next[idx] = d;
            // Last digit filled → trigger completion
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

    // Physical keyboard
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

    const pct = endless ? 0 : (answered / length) * 100;
    const timerPct = hasTimer ? remaining / timer : 1;
    const timerWarn = hasTimer && remaining <= 10;
    const streakMilestone = [10, 20, 30, 50, 100].includes(streak) && fb === 'correct';

    const activeIndex = digits.findIndex(d => d === '');

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>

            {/* Barre de stats */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="pill">⭐ {score}</span>
                <span className={`pill streak-badge${streakMilestone ? ' streak-badge--milestone' : ''}`}
                    style={streak >= 10 ? { background: 'linear-gradient(135deg, var(--gold-light), var(--gold))', color: '#fff' } : undefined}
                >
                    🔥 {streak}
                </span>
                {hasTimer ? (
                    <TimerRing seconds={remaining} total={timer} warn={timerWarn} />
                ) : (
                    <span className="pill">{endless ? `# ${answered}` : `${answered}/${length}`}</span>
                )}
            </div>

            {/* Barre de progression */}
            {!endless && !hasTimer && (
                <div className="progress-bar" style={{ marginBottom: 16 }}>
                    <i className="progress-bar__fill" style={{ width: `${pct}%` }} />
                </div>
            )}
            {hasTimer && (
                <div className="progress-bar" style={{ marginBottom: 16 }}>
                    <i
                        className={`progress-bar__fill${timerWarn ? ' progress-bar__fill--warn' : ''}`}
                        style={{ width: `${timerPct * 100}%`, transition: 'width 1s linear' }}
                    />
                </div>
            )}

            {/* Question + Cases */}
            <div className={`card${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>

                {/* Digit boxes */}
                <div className="digit-boxes" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
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

                <div
                    className="feedback-word"
                    style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}
                >
                    {word}
                </div>
                {showHint && fb === 'idle' && (
                    <div className="hint-box">💡 {makeHint(q.a, q.b)}</div>
                )}
            </div>

            {/* Pavé numérique */}
            <Keypad
                onPress={press}
                onDelete={del}
                disabled={lockRef.current}
            />

            {/* Boutons sous le pavé */}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                {!showHint && fb === 'idle' && (
                    <button
                        className="btn btn--ghost"
                        style={{ flex: 1, fontSize: 15 }}
                        onClick={() => setShowHint(true)}
                    >
                        💡 Indice
                    </button>
                )}
                {endless && !hasTimer && (
                    <button className="btn btn--ghost" style={{ flex: 1 }} onClick={finish}>
                        Terminer
                    </button>
                )}
            </div>
        </div>
    );
}

/* ===================== RESULTS ===================== */

function Results({ result, serverResult, onReplay, onReviewErrors, onHome, onSetup }) {
    if (!result) return null;
    const { score, scorePremierEssai, answered, maxStreak, resultats, seconds, timerMode } = result;
    const rattrapees = score - (scorePremierEssai || 0);
    const pct = answered ? Math.round(((scorePremierEssai || score) / answered) * 100) : 0;
    const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 50 ? 1 : 0;
    const msg = stars === 3 ? 'Champion des tables ! 🏆'
        : stars === 2 ? 'Très bien joué !'
            : stars === 1 ? 'Bon début, continue !'
                : 'On retente ? Tu vas y arriver !';

    // Tables à revoir (tout ce qui n'est pas premier coup)
    const wrongTables = [...new Set(
        (resultats || []).filter(r => r.result !== 'premier').map(r => r.a)
    )].sort((a, b) => a - b);

    // Erreurs détaillées pour affichage
    const erreurs = (resultats || []).filter(r => r.result === 'jamais');

    const badges = serverResult?.nouveaux_badges || [];
    const enAttente = serverResult?.enAttente;

    useEffect(() => {
        if (pct >= 70) {
            import('canvas-confetti').then(mod => {
                const fire = mod.default;
                fire({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#C9A227', '#4DA8DA', '#00C9A7', '#FF5A5F'] });
            }).catch(() => { });
        }
    }, [pct]);

    return (
        <div className="screen-enter">
            <div className="card" style={{ textAlign: 'center' }}>
                {/* Étoiles */}
                <div className="stars">
                    {'★'.repeat(stars).padEnd(3, '☆').split('').map((s, i) => (
                        <span key={i} className={s === '★' ? 'stars__filled' : 'stars__empty'}>{s}</span>
                    ))}
                </div>

                <h2 className="font-display" style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>{msg}</h2>

                {/* Deux chiffres — premier coup + rattrapées */}
                <div style={{
                    background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)',
                    padding: '16px 12px', margin: '14px 0',
                }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--mint-dk)' }}>
                        {scorePremierEssai ?? score} / {answered}
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

                {/* Stats */}
                <div className="stat-grid">
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--coral)' }}>{maxStreak}</span>
                        <span className="stat__label">Meilleure série</span>
                    </div>
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>
                            {timerMode
                                ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
                                : `${seconds}s`}
                        </span>
                        <span className="stat__label">{timerMode ? 'Chrono' : 'Temps total'}</span>
                    </div>
                </div>

                {/* Moyenne par question */}
                {answered > 0 && (
                    <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-soft)', marginBottom: 14 }}>
                        ⚡ {(seconds / answered).toFixed(1)}s par question en moyenne
                    </p>
                )}

                {/* Erreurs à revoir */}
                {erreurs.length > 0 && (
                    <div style={{
                        textAlign: 'left', background: 'var(--surface-alt)',
                        borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16
                    }}>
                        <p className="font-display" style={{ fontWeight: 800, marginBottom: 8 }}>Jamais trouvées :</p>
                        {erreurs.map((e, i) => (
                            <div key={i} style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                                {e.a} × {e.b} = <b style={{ color: 'var(--mint-dk)' }}>{e.a * e.b}</b>
                            </div>
                        ))}
                    </div>
                )}

                {/* Badges débloqués */}
                {badges.length > 0 && (
                    <div style={{
                        textAlign: 'center', background: 'linear-gradient(135deg, #FFF8E1, #FFF0C0)',
                        borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16,
                        border: '2px solid var(--gold)',
                    }}>
                        <p className="font-display" style={{ fontWeight: 800, marginBottom: 8, color: 'var(--gold)' }}>
                            🏅 Nouveau{badges.length > 1 ? 'x' : ''} badge{badges.length > 1 ? 's' : ''} !
                        </p>
                        {badges.map((b, i) => (
                            <div key={i} className="anim-pop" style={{
                                fontSize: 18, fontWeight: 700, marginBottom: 4,
                            }}>
                                {b.emoji || '🏅'} {b.nom || b}
                            </div>
                        ))}
                    </div>
                )}

                {/* Partie sauvegardée hors-ligne */}
                {enAttente && (
                    <p style={{
                        fontSize: 13, color: 'var(--text-soft)', fontWeight: 600,
                        textAlign: 'center', marginBottom: 14,
                    }}>
                        📡 Résultat en attente d'envoi — il partira dès que le réseau sera de retour.
                    </p>
                )}

                {/* Boutons d'action */}
                <button className="btn btn--mint" style={{ width: '100%', marginBottom: 10 }} onClick={onReplay}>
                    Rejouer 🔄
                </button>
                {wrongTables.length > 0 && (
                    <button
                        className="btn btn--coral"
                        style={{ width: '100%', marginBottom: 10 }}
                        onClick={() => onReviewErrors(wrongTables)}
                    >
                        Réviser mes erreurs ({wrongTables.join(', ')})
                    </button>
                )}
                <button className="btn btn--ghost" style={{ width: '100%', marginBottom: 10 }} onClick={onSetup}>
                    Changer de tables
                </button>
                <button className="btn-back" style={{ marginTop: 4 }} onClick={onHome}>‹ Accueil</button>
            </div>
        </div>
    );
}
