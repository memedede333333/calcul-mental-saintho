import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ALL_TABLES, PRAISE, newQuestion, makeHint, estReponseExacte } from '../logic/questions';
import { updateMastery, buildWeights, construireErreurs, construireMaitrise } from '../logic/mastery';
import { enregistrerSession, enregistrerSessionProf } from '../api';
import Keypad from '../components/Keypad';
import TimerRing from '../components/TimerRing';
import MasteryGrid from '../components/MasteryGrid';

/**
 * Practice — Mode S'entraîner complet
 * Phases : setup → quiz → results
 * Conservé et amélioré depuis le prototype :
 * - Tables 1-15, validation auto intelligente
 * - Compteur x/40, série sans faute 🔥, chrono
 * - Persistance maîtrise locale (puis serveur)
 */

const DEFAULT_TABLES = [2, 3, 4, 5];

export default function Practice({ onBack, identite, estProf, onPlafondChange, tablesInitiales }) {
    const [phase, setPhase] = useState(tablesInitiales?.length ? 'quiz' : 'setup');
    const [picked, setPicked] = useState(tablesInitiales?.length ? tablesInitiales : DEFAULT_TABLES);
    const [length, setLength] = useState(10);
    const [timer, setTimer] = useState(0);
    const [result, setResult] = useState(null);
    const [serverResult, setServerResult] = useState(null);
    const [showGrid, setShowGrid] = useState(false);
    const [mastery, setMastery] = useState({});
    const [autoValidate, setAutoValidate] = useState(true);

    const handleDone = useCallback((r) => {
        setMastery(prev => updateMastery(prev, r.wrong, r.right));
        setResult(r);
        setServerResult(null);
        setPhase('results');

        // --- Enregistrement serveur ---
        const mode = r.timerMode ? 'countdown' : 'libre';
        const erreurs = construireErreurs(r.wrong);
        const maitrise = construireMaitrise(r.wrong, r.right);

        // Practice n'est jamais en mode climb — plusHauteTable = null.
        // Envoyer Math.max(...picked) distribuerait les badges climb_*
        // à quiconque coche la table 10 en entraînement libre.

        const session = {
            mode,
            tables: picked,
            nbQuestions: r.answered,
            score: r.score,
            erreurs,
            dureeS: r.seconds,
            serieMax: r.maxStreak,
            sansFauteMax: r.maxStreak,
            plusHauteTable: null,
            maitrise,
        };

        const enregistrer = estProf ? enregistrerSessionProf : enregistrerSession;
        enregistrer(session).then(res => {
            if (res.ok) {
                setServerResult(res.data);
                // Remonter le plafond mis à jour si la RPC l'a changé
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
                    autoValidate={autoValidate} setAutoValidate={setAutoValidate}
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
                autoValidate={autoValidate}
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

function Setup({ onBack, picked, setPicked, length, setLength, timer, setTimer, autoValidate, setAutoValidate, onStart, onShowGrid, plafond }) {
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

            {/* Options */}
            <div className="card" style={{ marginTop: 14 }}>
                <label className="commutative-toggle" onClick={() => setAutoValidate(v => !v)}>
                    <input type="checkbox" checked={autoValidate} readOnly />
                    Validation automatique
                </label>
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

/* ===================== QUIZ ===================== */

function Quiz({ tables, length, timer, mastery, autoValidate, onQuit, onDone }) {
    const weights = useMemo(() => buildWeights(tables, mastery), [tables, mastery]);

    const [sessionWeights, setSessionWeights] = useState(weights);
    const [q, setQ] = useState(() => newQuestion(tables, null, weights));
    const [input, setInput] = useState('');
    const [answered, setAnswered] = useState(0);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const [remaining, setRemaining] = useState(timer);
    const [showHint, setShowHint] = useState(false);
    const [lastError, setLastError] = useState(''); // Correction persistante (chrono)
    const lockRef = useRef(false);
    const wrongRef = useRef([]);
    const rightRef = useRef([]);
    const startRef = useRef(Date.now());
    const scoreRef = useRef(0);
    const answeredRef = useRef(0);
    const maxStreakRef = useRef(0);
    const timedOut = useRef(false);
    const endless = length === 0;
    const hasTimer = timer > 0;

    // Sync refs
    useEffect(() => { scoreRef.current = score; }, [score]);
    useEffect(() => { answeredRef.current = answered; }, [answered]);
    useEffect(() => { maxStreakRef.current = maxStreak; }, [maxStreak]);

    // Timer countdown
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
                                score: scoreRef.current, answered: answeredRef.current,
                                maxStreak: maxStreakRef.current, wrong: wrongRef.current, right: rightRef.current,
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
            score, answered: endless ? answered : length, maxStreak,
            wrong: wrongRef.current, right: rightRef.current,
            seconds: Math.round((Date.now() - startRef.current) / 1000), timerMode: hasTimer
        });
    }, [score, answered, length, maxStreak, endless, hasTimer, onDone]);

    const submit = useCallback(() => {
        if (lockRef.current || input === '' || timedOut.current) return;
        lockRef.current = true;
        const ok = parseInt(input, 10) === q.answer;
        const nextAnswered = answered + 1;
        setAnswered(nextAnswered);

        if (ok) {
            setScore(s => s + 1);
            setStreak(s => { const n = s + 1; setMaxStreak(m => Math.max(m, n)); return n; });
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            rightRef.current.push({ a: q.a, b: q.b });
        } else {
            setStreak(0);
            wrongRef.current.push({ a: q.a, b: q.b, answer: q.answer, given: input });
            setFb('wrong');
            setWord(`${q.a} × ${q.b} = ${q.answer}`);
            const key = `${Math.min(q.a, q.b)}_${Math.max(q.a, q.b)}`;
            setSessionWeights(w => ({ ...w, [key]: Math.min((w[key] || 1) + 3, 8) }));
        }

        // Transitions : 700ms normal, 250ms bon / 800ms erreur en chrono
        const delay = hasTimer ? (ok ? 250 : 800) : (ok ? 700 : 1500);

        // En chrono, la correction persiste sous la question suivante
        if (hasTimer && !ok) {
            setLastError(`⚠️ ${q.a} × ${q.b} = ${q.answer}`);
        } else if (hasTimer && ok) {
            // Bonne réponse : on ne touche pas à lastError,
            // il reste affiché jusqu'à la prochaine erreur
        }
        setTimeout(() => {
            if (timedOut.current) return;
            lockRef.current = false;
            setFb('idle'); setWord(''); setInput(''); setShowHint(false);
            if (!endless && nextAnswered >= length) {
                onDone({
                    score: ok ? score + 1 : score, answered: length,
                    maxStreak: Math.max(maxStreak, ok ? streak + 1 : 0),
                    wrong: wrongRef.current, right: rightRef.current,
                    seconds: Math.round((Date.now() - startRef.current) / 1000)
                });
            } else {
                setQ(prev => newQuestion(tables, prev, sessionWeights));
            }
        }, delay);
    }, [input, q, answered, endless, length, score, maxStreak, streak, tables, sessionWeights, onDone, hasTimer]);

    // Auto-validation : correspondance exacte immédiate + 1200 ms d'inactivité
    useEffect(() => {
        if (!autoValidate || fb !== 'idle' || lockRef.current || !input) return;
        if (estReponseExacte(input, q.answer)) { submit(); return; }
        const id = setTimeout(submit, 1200);
        return () => clearTimeout(id);
    }, [input, autoValidate, q.answer, fb, submit]);

    const press = (d) => { if (!lockRef.current && input.length < 3) setInput(v => v + d); };
    const del = () => { if (!lockRef.current) setInput(v => v.slice(0, -1)); };

    // Clavier physique (desktop)
    useEffect(() => {
        const onKey = (e) => {
            if (e.key >= '0' && e.key <= '9') press(e.key);
            else if (e.key === 'Backspace') del();
            else if (e.key === 'Enter') submit();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    // Swipe gauche sur la zone de réponse = effacer tout
    const answerRef = useRef(null);
    const touchStartX = useRef(0);
    useEffect(() => {
        const el = answerRef.current;
        if (!el) return;
        const onStart = (e) => { touchStartX.current = e.touches[0].clientX; };
        const onEnd = (e) => {
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (dx < -60 && !lockRef.current) setInput('');
        };
        el.addEventListener('touchstart', onStart, { passive: true });
        el.addEventListener('touchend', onEnd, { passive: true });
        return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchend', onEnd); };
    }, []);

    const pct = endless ? 0 : (answered / length) * 100;
    const timerPct = hasTimer ? remaining / timer : 1;
    const timerWarn = hasTimer && remaining <= 10;

    // Streak milestone animation
    const streakMilestone = [10, 20, 30, 50, 100].includes(streak) && fb === 'correct';

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

            {/* Question */}
            <div className={`card${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>
                <div
                    ref={answerRef}
                    className={`answer-box${fb === 'correct' ? ' answer-box--correct' : fb === 'wrong' ? ' answer-box--wrong' : ''}`}
                >
                    {input === '' && fb === 'idle' ? <span className="caret" /> : input || '—'}
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

            {/* Correction persistante en chrono — l'élève la lit à son rythme */}
            {hasTimer && lastError && (
                <div style={{
                    textAlign: 'center', fontSize: 14, fontWeight: 700,
                    color: 'var(--coral-dk)', padding: '6px 0', marginBottom: 4,
                }}>
                    {lastError}
                </div>
            )}

            {/* Pavé numérique */}
            <Keypad
                onPress={press}
                onDelete={del}
                onSubmit={submit}
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
    const { score, answered, maxStreak, wrong, seconds, timerMode } = result;
    const pct = answered ? Math.round((score / answered) * 100) : 0;
    const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 50 ? 1 : 0;
    const msg = stars === 3 ? 'Champion des tables ! 🏆'
        : stars === 2 ? 'Très bien joué !'
            : stars === 1 ? 'Bon début, continue !'
                : 'On retente ? Tu vas y arriver !';
    const wrongTables = [...new Set(wrong.map(w => w.a))].sort((a, b) => a - b);

    // Badges renvoyés par le serveur
    const badges = serverResult?.nouveaux_badges || [];
    const enAttente = serverResult?.enAttente;

    // Confettis uniquement si réussite (≥ 70%)
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

                {/* Stats */}
                <div className="stat-grid">
                    <div className="stat">
                        <span className="stat__value" style={{ color: 'var(--mint-dk)' }}>{score}/{answered}</span>
                        <span className="stat__label">Bonnes réponses</span>
                    </div>
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

                {/* Moyenne par question en mode chrono */}
                {timerMode && answered > 0 && (
                    <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-soft)', marginBottom: 14 }}>
                        ⚡ {(seconds / answered).toFixed(1)}s par question en moyenne
                    </p>
                )}

                {/* Erreurs à revoir */}
                {wrong.length > 0 && (
                    <div style={{
                        textAlign: 'left', background: 'var(--surface-alt)',
                        borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16
                    }}>
                        <p className="font-display" style={{ fontWeight: 800, marginBottom: 8 }}>À revoir :</p>
                        {wrong.map((w, i) => (
                            <div key={i} style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                                {w.a} × {w.b} = <b style={{ color: 'var(--mint-dk)' }}>{w.answer}</b>
                                <span style={{ color: 'var(--coral)', marginLeft: 8, fontSize: 14 }}>
                                    (tu as mis {w.given})
                                </span>
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
