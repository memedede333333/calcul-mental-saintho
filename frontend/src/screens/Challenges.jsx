import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { newQuestion, PRAISE, makeHint, ALL_TABLES } from '../logic/questions';
import { buildWeights } from '../logic/mastery';
import Keypad from '../components/Keypad';
import TimerRing from '../components/TimerRing';

/**
 * Challenges — Mode Défis (Phase 5)
 * 5 types : Sprint, Sans faute, Contre-la-montre, Montée, Classe
 * Écran de sélection → configuration → jeu → résultats/podium
 */

const CHALLENGE_TYPES = [
    {
        id: 'sprint', emoji: '⚡', name: 'Sprint',
        desc: '20 questions — le plus rapide gagne !',
        color: '--coral', questions: 20,
    },
    {
        id: 'flawless', emoji: '🎯', name: 'Sans faute',
        desc: 'Zéro erreur — la première te stoppe',
        color: '--gold',
    },
    {
        id: 'countdown', emoji: '⏱', name: 'Contre-la-montre',
        desc: '2 minutes — max de bonnes réponses',
        color: '--sky', timer: 120,
    },
    {
        id: 'climb', emoji: '🧗', name: 'Montée des tables',
        desc: 'Palier par palier, de la table 2 à 15',
        color: '--purple',
    },
    {
        id: 'class', emoji: '👥', name: 'Défi de classe',
        desc: 'Même questions — classement en direct',
        color: '--navy',
    },
];

export default function Challenges({ onBack, user }) {
    const [phase, setPhase] = useState('select'); // select | config | play | results
    const [challengeType, setChallengeType] = useState(null);
    const [joinCode, setJoinCode] = useState('');
    const [result, setResult] = useState(null);

    if (phase === 'select') {
        return (
            <ChallengeSelect
                onBack={onBack}
                onSelect={(type) => { setChallengeType(type); setPhase('config'); }}
                joinCode={joinCode}
                setJoinCode={setJoinCode}
            />
        );
    }

    if (phase === 'config') {
        return (
            <ChallengeConfig
                type={challengeType}
                onBack={() => setPhase('select')}
                onStart={() => setPhase('play')}
                user={user}
            />
        );
    }

    if (phase === 'play') {
        return (
            <ChallengePlay
                type={challengeType}
                onQuit={() => setPhase('select')}
                onDone={(r) => { setResult(r); setPhase('results'); }}
            />
        );
    }

    return (
        <ChallengeResults
            type={challengeType}
            result={result}
            user={user}
            onReplay={() => setPhase('play')}
            onHome={() => setPhase('select')}
            onBack={onBack}
        />
    );
}

/* ===================== SELECT ===================== */

function ChallengeSelect({ onBack, onSelect, joinCode, setJoinCode }) {
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
                        onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                        placeholder="CODE à 5 lettres"
                        style={{
                            flex: 1, padding: '12px 16px', borderRadius: 14,
                            border: '2px solid var(--border)', fontSize: 20,
                            fontFamily: 'var(--font-display)', textAlign: 'center',
                            letterSpacing: 6, textTransform: 'uppercase', outline: 'none',
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                    <button
                        className="btn btn--gold"
                        disabled={joinCode.length < 5}
                        style={{ padding: '12px 20px', fontSize: 16, whiteSpace: 'nowrap' }}
                    >
                        Rejoindre
                    </button>
                </div>
            </div>

            {/* Types de défis */}
            {CHALLENGE_TYPES.map(type => (
                <button
                    key={type.id}
                    className="mode-card"
                    style={{
                        background: `linear-gradient(135deg, var(${type.color}), var(${type.color}-dk))`,
                        marginTop: 10,
                    }}
                    onClick={() => onSelect(type)}
                >
                    <span className="mode-card__emoji">{type.emoji}</span>
                    <span>
                        <div className="mode-card__title" style={{ fontSize: 20 }}>{type.name}</div>
                        <div className="mode-card__desc">{type.desc}</div>
                    </span>
                </button>
            ))}
        </div>
    );
}

/* ===================== CONFIG ===================== */

function ChallengeConfig({ type, onBack, onStart, user }) {
    const [tables, setTables] = useState([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const toggle = (t) => setTables(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

    // Montée des tables : pas besoin de choisir
    const isClimb = type.id === 'climb';

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
                        {ALL_TABLES.slice(0, 10).map(t => (
                            <button
                                key={t}
                                className={`chip${tables.includes(t) ? ' chip--gold' : ''}`}
                                onClick={() => toggle(t)}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Règles */}
            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                    📋 Règles
                </h3>
                {type.id === 'sprint' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>20 questions identiques pour tous</li>
                        <li>Classement par temps total</li>
                        <li>+3 secondes de pénalité par erreur</li>
                    </ul>
                )}
                {type.id === 'flawless' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>Questions en flux continu</li>
                        <li>La première erreur t'arrête !</li>
                        <li>Gagne la plus longue série</li>
                    </ul>
                )}
                {type.id === 'countdown' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>2 minutes chrono</li>
                        <li>Maximum de bonnes réponses</li>
                        <li>Les erreurs retirent 1 point (plancher 0)</li>
                    </ul>
                )}
                {type.id === 'climb' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>Commence à la table 2</li>
                        <li>5 questions par palier, ≥4 justes pour passer</li>
                        <li>Monte le plus haut possible !</li>
                    </ul>
                )}
                {type.id === 'class' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>Créé par l'enseignant</li>
                        <li>Même questions pour toute la classe</li>
                        <li>Classement en direct</li>
                    </ul>
                )}
            </div>

            <button
                className="btn btn--gold"
                style={{ width: '100%', fontSize: 22, padding: 16 }}
                disabled={!isClimb && tables.length === 0}
                onClick={onStart}
            >
                Lancer le défi ! ⚔️
            </button>
        </div>
    );
}

/* ===================== PLAY ===================== */

function ChallengePlay({ type, onQuit, onDone }) {
    // Selon le type, adapter la logique
    if (type.id === 'sprint') return <SprintPlay onQuit={onQuit} onDone={onDone} />;
    if (type.id === 'flawless') return <FlawlessPlay onQuit={onQuit} onDone={onDone} />;
    if (type.id === 'countdown') return <CountdownPlay onQuit={onQuit} onDone={onDone} />;
    if (type.id === 'climb') return <ClimbPlay onQuit={onQuit} onDone={onDone} />;
    return <SprintPlay onQuit={onQuit} onDone={onDone} />; // fallback
}

/* --- Sprint : 20 questions, classement par temps --- */
function SprintPlay({ onQuit, onDone }) {
    const tables = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    const total = 20;
    const [q, setQ] = useState(() => newQuestion(tables, null, null));
    const [input, setInput] = useState('');
    const [answered, setAnswered] = useState(0);
    const [errors, setErrors] = useState(0);
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const lockRef = useRef(false);
    const startRef = useRef(Date.now());

    const submit = useCallback(() => {
        if (lockRef.current || !input) return;
        lockRef.current = true;
        const ok = parseInt(input, 10) === q.answer;
        const next = answered + 1;
        setAnswered(next);

        if (ok) {
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
        } else {
            setErrors(e => e + 1);
            setFb('wrong');
            setWord(`${q.a} × ${q.b} = ${q.answer}`);
        }

        setTimeout(() => {
            lockRef.current = false;
            setFb('idle'); setWord(''); setInput('');
            if (next >= total) {
                const elapsed = (Date.now() - startRef.current) / 1000;
                onDone({ answered: total, errors: errors + (ok ? 0 : 1), time: elapsed, score: total - (errors + (ok ? 0 : 1)) });
            } else {
                setQ(prev => newQuestion(tables, prev, null));
            }
        }, ok ? 250 : 500);
    }, [input, q, answered, errors, onDone]);

    const press = d => { if (!lockRef.current && input.length < 3) setInput(v => v + d); };
    const del = () => { if (!lockRef.current) setInput(v => v.slice(0, -1)); };

    useEffect(() => {
        const onKey = e => {
            if (e.key >= '0' && e.key <= '9') press(e.key);
            else if (e.key === 'Backspace') del();
            else if (e.key === 'Enter') submit();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="pill">⚡ Sprint</span>
                <span className="pill">{answered}/{total}</span>
                <span className="pill" style={{ color: errors > 0 ? 'var(--coral)' : undefined }}>❌ {errors}</span>
            </div>
            <div className="progress-bar" style={{ marginBottom: 16 }}>
                <i className="progress-bar__fill" style={{ width: `${(answered / total) * 100}%` }} />
            </div>
            <div className={`card${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>
                <div className={`answer-box${fb === 'correct' ? ' answer-box--correct' : fb === 'wrong' ? ' answer-box--wrong' : ''}`}>
                    {input === '' && fb === 'idle' ? <span className="caret" /> : input || '—'}
                </div>
                <div className="feedback-word" style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}>
                    {word}
                </div>
            </div>
            <Keypad onPress={press} onDelete={del} onSubmit={submit} />
        </div>
    );
}

/* --- Sans faute : la première erreur arrête --- */
function FlawlessPlay({ onQuit, onDone }) {
    const tables = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    const [q, setQ] = useState(() => newQuestion(tables, null, null));
    const [input, setInput] = useState('');
    const [streak, setStreak] = useState(0);
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const lockRef = useRef(false);
    const startRef = useRef(Date.now());

    const submit = useCallback(() => {
        if (lockRef.current || !input) return;
        lockRef.current = true;
        const ok = parseInt(input, 10) === q.answer;

        if (ok) {
            setStreak(s => s + 1);
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            setTimeout(() => {
                lockRef.current = false;
                setFb('idle'); setWord(''); setInput('');
                setQ(prev => newQuestion(tables, prev, null));
            }, 250);
        } else {
            setFb('wrong');
            setWord(`${q.a} × ${q.b} = ${q.answer}`);
            setTimeout(() => {
                const elapsed = (Date.now() - startRef.current) / 1000;
                onDone({ streak, time: elapsed, lastQuestion: `${q.a}×${q.b}` });
            }, 1200);
        }
    }, [input, q, streak, onDone]);

    const press = d => { if (!lockRef.current && input.length < 3) setInput(v => v + d); };
    const del = () => { if (!lockRef.current) setInput(v => v.slice(0, -1)); };

    useEffect(() => {
        const onKey = e => {
            if (e.key >= '0' && e.key <= '9') press(e.key);
            else if (e.key === 'Backspace') del();
            else if (e.key === 'Enter') submit();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <span className="pill" style={{
                    fontSize: 24,
                    background: streak >= 10 ? 'linear-gradient(135deg, var(--gold-light), var(--gold))' : undefined,
                    color: streak >= 10 ? '#fff' : undefined,
                }}>
                    🔥 {streak}
                </span>
            </div>
            <div className={`card${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>
                <div className={`answer-box${fb === 'correct' ? ' answer-box--correct' : fb === 'wrong' ? ' answer-box--wrong' : ''}`}>
                    {input === '' && fb === 'idle' ? <span className="caret" /> : input || '—'}
                </div>
                <div className="feedback-word" style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}>
                    {word}
                </div>
            </div>
            <Keypad onPress={press} onDelete={del} onSubmit={submit} />
        </div>
    );
}

/* --- Contre-la-montre : 2 min, max de bonnes réponses --- */
function CountdownPlay({ onQuit, onDone }) {
    const tables = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    const duration = 120;
    const [q, setQ] = useState(() => newQuestion(tables, null, null));
    const [input, setInput] = useState('');
    const [score, setScore] = useState(0);
    const [remaining, setRemaining] = useState(duration);
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const lockRef = useRef(false);
    const scoreRef = useRef(0);
    const answeredRef = useRef(0);
    const timedOut = useRef(false);

    useEffect(() => { scoreRef.current = score; }, [score]);

    useEffect(() => {
        const id = setInterval(() => {
            setRemaining(r => {
                if (r <= 1) {
                    clearInterval(id);
                    if (!timedOut.current) {
                        timedOut.current = true;
                        setTimeout(() => {
                            onDone({ score: scoreRef.current, answered: answeredRef.current, time: duration });
                        }, 0);
                    }
                    return 0;
                }
                return r - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [onDone]);

    const submit = useCallback(() => {
        if (lockRef.current || !input || timedOut.current) return;
        lockRef.current = true;
        const ok = parseInt(input, 10) === q.answer;
        answeredRef.current += 1;

        if (ok) {
            setScore(s => s + 1);
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
        } else {
            setScore(s => Math.max(0, s - 1));
            setFb('wrong');
            setWord(`${q.a} × ${q.b} = ${q.answer}`);
        }

        setTimeout(() => {
            if (timedOut.current) return;
            lockRef.current = false;
            setFb('idle'); setWord(''); setInput('');
            setQ(prev => newQuestion(tables, prev, null));
        }, 250);
    }, [input, q, onDone]);

    const press = d => { if (!lockRef.current && input.length < 3) setInput(v => v + d); };
    const del = () => { if (!lockRef.current) setInput(v => v.slice(0, -1)); };

    useEffect(() => {
        const onKey = e => {
            if (e.key >= '0' && e.key <= '9') press(e.key);
            else if (e.key === 'Backspace') del();
            else if (e.key === 'Enter') submit();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const timerWarn = remaining <= 10;

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="pill">⭐ {score}</span>
                <TimerRing seconds={remaining} total={duration} warn={timerWarn} />
            </div>
            <div className="progress-bar" style={{ marginBottom: 16 }}>
                <i
                    className={`progress-bar__fill${timerWarn ? ' progress-bar__fill--warn' : ''}`}
                    style={{ width: `${(remaining / duration) * 100}%`, transition: 'width 1s linear' }}
                />
            </div>
            <div className={`card${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>
                <div className={`answer-box${fb === 'correct' ? ' answer-box--correct' : fb === 'wrong' ? ' answer-box--wrong' : ''}`}>
                    {input === '' && fb === 'idle' ? <span className="caret" /> : input || '—'}
                </div>
                <div className="feedback-word" style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}>
                    {word}
                </div>
            </div>
            <Keypad onPress={press} onDelete={del} onSubmit={submit} />
        </div>
    );
}

/* --- Montée des tables : palier par palier --- */
function ClimbPlay({ onQuit, onDone }) {
    const [currentTable, setCurrentTable] = useState(2);
    const [questionsInLevel, setQuestionsInLevel] = useState(0);
    const [correctInLevel, setCorrectInLevel] = useState(0);
    const [q, setQ] = useState(() => newQuestion([2], null, null));
    const [input, setInput] = useState('');
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const [levelMsg, setLevelMsg] = useState('');
    const lockRef = useRef(false);
    const startRef = useRef(Date.now());

    const submit = useCallback(() => {
        if (lockRef.current || !input) return;
        lockRef.current = true;
        const ok = parseInt(input, 10) === q.answer;
        const nextQ = questionsInLevel + 1;
        const nextCorrect = correctInLevel + (ok ? 1 : 0);

        setQuestionsInLevel(nextQ);
        setCorrectInLevel(nextCorrect);

        if (ok) {
            setFb('correct');
            setWord('✓');
        } else {
            setFb('wrong');
            setWord(`${q.a} × ${q.b} = ${q.answer}`);
        }

        setTimeout(() => {
            lockRef.current = false;
            setFb('idle'); setWord(''); setInput('');

            if (nextQ >= 5) {
                // Fin du palier
                if (nextCorrect >= 4) {
                    // Réussi → palier suivant
                    const nextTable = currentTable + 1;
                    if (nextTable > 15) {
                        // Victoire totale !
                        onDone({ highestTable: 15, time: (Date.now() - startRef.current) / 1000, perfect: true });
                    } else {
                        setCurrentTable(nextTable);
                        setQuestionsInLevel(0);
                        setCorrectInLevel(0);
                        setLevelMsg(`Table ${nextTable} ! 🧗`);
                        setTimeout(() => setLevelMsg(''), 1500);
                        setQ(newQuestion([nextTable], null, null));
                    }
                } else {
                    // Raté → fin
                    onDone({ highestTable: currentTable - 1, time: (Date.now() - startRef.current) / 1000, perfect: false });
                }
            } else {
                setQ(prev => newQuestion([currentTable], prev, null));
            }
        }, ok ? 250 : 600);
    }, [input, q, questionsInLevel, correctInLevel, currentTable, onDone]);

    const press = d => { if (!lockRef.current && input.length < 3) setInput(v => v + d); };
    const del = () => { if (!lockRef.current) setInput(v => v.slice(0, -1)); };

    useEffect(() => {
        const onKey = e => {
            if (e.key >= '0' && e.key <= '9') press(e.key);
            else if (e.key === 'Backspace') del();
            else if (e.key === 'Enter') submit();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    return (
        <div className="screen-enter game-zone">
            <button className="btn-back" onClick={onQuit}>‹ Quitter</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="pill">🧗 Table {currentTable}</span>
                <span className="pill">{questionsInLevel}/5</span>
                <span className="pill" style={{ color: 'var(--mint-dk)' }}>✅ {correctInLevel}</span>
            </div>

            {/* Barre de palier */}
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

            <div className={`card${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}>
                <div className="question-text">{q.a} × {q.b}</div>
                <div className={`answer-box${fb === 'correct' ? ' answer-box--correct' : fb === 'wrong' ? ' answer-box--wrong' : ''}`}>
                    {input === '' && fb === 'idle' ? <span className="caret" /> : input || '—'}
                </div>
                <div className="feedback-word" style={{ marginTop: 10, color: fb === 'wrong' ? 'var(--coral-dk)' : 'var(--mint-dk)' }}>
                    {word}
                </div>
            </div>
            <Keypad onPress={press} onDelete={del} onSubmit={submit} />
        </div>
    );
}

/* ===================== RESULTS ===================== */

function ChallengeResults({ type, result, user, onReplay, onHome, onBack }) {
    if (!result) return null;

    // Confetti sur victoire
    useEffect(() => {
        import('canvas-confetti').then(mod => {
            mod.default({
                particleCount: 100, spread: 70, origin: { y: 0.6 },
                colors: ['#C9A227', '#4DA8DA', '#00C9A7', '#FF5A5F']
            });
        }).catch(() => { });
    }, []);

    return (
        <div className="screen-enter">
            <div className="card" style={{ textAlign: 'center' }}>
                {/* Podium emoji */}
                <div style={{ fontSize: 64, marginBottom: 8 }}>🏆</div>

                <h2 className="font-display" style={{ fontSize: 26, fontWeight: 800 }}>
                    {type.id === 'sprint' && `Sprint terminé !`}
                    {type.id === 'flawless' && `Série de ${result.streak} !`}
                    {type.id === 'countdown' && `${result.score} points !`}
                    {type.id === 'climb' && (result.perfect ? 'Toutes les tables maîtrisées ! 🎉' : `Table ${result.highestTable} atteinte !`)}
                </h2>

                <div className="stat-grid" style={{ marginTop: 16 }}>
                    {type.id === 'sprint' && (
                        <>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--mint-dk)' }}>{result.answered - result.errors}/{result.answered}</span>
                                <span className="stat__label">Bonnes réponses</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--coral)' }}>{result.errors}</span>
                                <span className="stat__label">Erreurs (+{result.errors * 3}s)</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>{(result.time + result.errors * 3).toFixed(1)}s</span>
                                <span className="stat__label">Temps total</span>
                            </div>
                        </>
                    )}
                    {type.id === 'flawless' && (
                        <>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--gold)' }}>🔥 {result.streak}</span>
                                <span className="stat__label">Sans faute</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>{result.time.toFixed(1)}s</span>
                                <span className="stat__label">Temps</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--coral)' }}>{result.lastQuestion}</span>
                                <span className="stat__label">Stoppé par</span>
                            </div>
                        </>
                    )}
                    {type.id === 'countdown' && (
                        <>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--mint-dk)' }}>⭐ {result.score}</span>
                                <span className="stat__label">Score</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>{result.answered}</span>
                                <span className="stat__label">Questions</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--navy)' }}>2:00</span>
                                <span className="stat__label">Chrono</span>
                            </div>
                        </>
                    )}
                    {type.id === 'climb' && (
                        <>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--purple)' }}>🧗 {result.highestTable}</span>
                                <span className="stat__label">Plus haute table</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: 'var(--sky-dk)' }}>{result.time.toFixed(1)}s</span>
                                <span className="stat__label">Temps</span>
                            </div>
                            <div className="stat">
                                <span className="stat__value" style={{ color: result.perfect ? 'var(--gold)' : 'var(--coral)' }}>
                                    {result.perfect ? '🌟' : '💪'}
                                </span>
                                <span className="stat__label">{result.perfect ? 'Parfait !' : 'Continue !'}</span>
                            </div>
                        </>
                    )}
                </div>

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
