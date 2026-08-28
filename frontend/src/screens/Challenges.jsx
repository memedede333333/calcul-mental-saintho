import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { newQuestion, PRAISE, makeHint, ALL_TABLES, estReponseExacte } from '../logic/questions';
import { buildWeights, construireErreurs, construireMaitrise } from '../logic/mastery';
import { enregistrerSession, enregistrerSessionProf } from '../api';
import Keypad from '../components/Keypad';
import TimerRing from '../components/TimerRing';

/**
 * Challenges — Mode Défis
 * 5 types : Sprint, Sans faute, Contre-la-montre, Montée, Classe
 * Écran de sélection → configuration → jeu → résultats
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
        desc: 'Palier par palier, de la table 2 à 20',
        color: '--purple',
    },
    {
        id: 'class', emoji: '👥', name: 'Défi de classe',
        desc: 'Mêmes questions — classement en direct',
        color: '--navy',
    },
];

export default function Challenges({ onBack, identite, estProf, onPlafondChange }) {
    const [phase, setPhase] = useState('select'); // select | config | play | results
    const [challengeType, setChallengeType] = useState(null);
    const [joinCode, setJoinCode] = useState('');
    const [selectedTables, setSelectedTables] = useState([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const [result, setResult] = useState(null);
    const [serverResult, setServerResult] = useState(null);

    const plafond = identite?.profil?.plafond_tables || 10;

    const handleDone = useCallback((r) => {
        setResult(r);
        setServerResult(null);
        setPhase('results');

        // Préparation de la session pour enregistrerSession
        const mode = challengeType?.id || 'sprint';
        const erreurs = construireErreurs(r.wrong || []);
        const maitrise = construireMaitrise(r.wrong || [], r.right || []);

        let tables = selectedTables;
        if (mode === 'climb') {
            const maxT = Math.max(2, r.highestTable || 2);
            tables = [];
            for (let i = 2; i <= maxT; i++) tables.push(i);
        }

        const nbQuestions = r.answered || (r.score + (r.errors || 0)) || 0;
        const score = Math.min(nbQuestions, Math.max(0, r.score ?? 0));

        const session = {
            mode,
            tables,
            nbQuestions,
            score,
            erreurs,
            dureeS: Math.round(r.time || 0),
            serieMax: r.maxStreak || r.streak || 0,
            sansFauteMax: mode === 'flawless' ? (r.streak || 0) : (r.maxStreak || 0),
            plusHauteTable: mode === 'climb' ? (r.highestTable || null) : null,
            maitrise,
        };

        const enregistrer = estProf ? enregistrerSessionProf : enregistrerSession;
        enregistrer(session).then(res => {
            if (res.ok) {
                setServerResult(res.data);
                // Remonter le plafond mis à jour si la Montée l'a changé
                const np = res.data?.plafond_tables;
                if (np && np !== plafond) {
                    onPlafondChange?.(np);
                }
            } else {
                setServerResult({ erreur: res.error, enAttente: res.enAttente });
            }
        }).catch(() => {});
    }, [challengeType, selectedTables, estProf, plafond, onPlafondChange]);

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
                tables={selectedTables}
                setTables={setSelectedTables}
                plafond={plafond}
                onBack={() => setPhase('select')}
                onStart={(tables) => {
                    if (tables) setSelectedTables(tables);
                    setPhase('play');
                }}
            />
        );
    }

    if (phase === 'play') {
        return (
            <ChallengePlay
                type={challengeType}
                tables={selectedTables}
                onQuit={() => setPhase('select')}
                onDone={handleDone}
            />
        );
    }

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

function ChallengeConfig({ type, tables, setTables, plafond, onBack, onStart }) {
    const isClimb = type.id === 'climb';

    // Tables autorisées pour ce compte
    const availableTables = ALL_TABLES.filter(t => t <= Math.max(10, plafond));

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

            {/* Règles */}
            <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                    📋 Règles
                </h3>
                {type.id === 'sprint' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>20 questions chrono</li>
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
                        <li>Débloque les tables supérieures pour l'entraînement !</li>
                    </ul>
                )}
                {type.id === 'class' && (
                    <ul style={{ paddingLeft: 20, fontSize: 14, fontWeight: 600, lineHeight: 1.8, color: 'var(--text-soft)' }}>
                        <li>Créé par l'enseignant</li>
                        <li>Mêmes questions pour toute la classe</li>
                        <li>Classement en direct</li>
                    </ul>
                )}
            </div>

            <button
                className="btn btn--gold"
                style={{ width: '100%', fontSize: 22, padding: 16 }}
                disabled={!isClimb && tables.length === 0}
                onClick={() => onStart(tables)}
            >
                Lancer le défi ! ⚔️
            </button>
        </div>
    );
}

/* ===================== PLAY ===================== */

function ChallengePlay({ type, tables, onQuit, onDone }) {
    const activeTables = tables && tables.length > 0 ? tables : [2, 3, 4, 5, 6, 7, 8, 9, 10];

    if (type.id === 'sprint') return <SprintPlay tables={activeTables} onQuit={onQuit} onDone={onDone} />;
    if (type.id === 'flawless') return <FlawlessPlay tables={activeTables} onQuit={onQuit} onDone={onDone} />;
    if (type.id === 'countdown') return <CountdownPlay tables={activeTables} onQuit={onQuit} onDone={onDone} />;
    if (type.id === 'climb') return <ClimbPlay onQuit={onQuit} onDone={onDone} />;
    return <SprintPlay tables={activeTables} onQuit={onQuit} onDone={onDone} />;
}

/* --- Sprint : 20 questions, classement par temps --- */
function SprintPlay({ tables, onQuit, onDone }) {
    const total = 20;
    const weights = useMemo(() => buildWeights(tables, {}), [tables]);
    const [q, setQ] = useState(() => newQuestion(tables, null, weights));
    const [input, setInput] = useState('');
    const [answered, setAnswered] = useState(0);
    const [errors, setErrors] = useState(0);
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const lockRef = useRef(false);
    const startRef = useRef(Date.now());
    const wrongRef = useRef([]);
    const rightRef = useRef([]);

    const submit = useCallback(() => {
        if (lockRef.current || !input) return;
        lockRef.current = true;
        const ok = parseInt(input, 10) === q.answer;
        const next = answered + 1;
        setAnswered(next);

        if (ok) {
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            rightRef.current.push({ a: q.a, b: q.b });
        } else {
            setErrors(e => e + 1);
            setFb('wrong');
            setWord(`${q.a} × ${q.b} = ${q.answer}`);
            wrongRef.current.push({ a: q.a, b: q.b, answer: q.answer, given: input });
        }

        setTimeout(() => {
            lockRef.current = false;
            setFb('idle'); setWord(''); setInput('');
            if (next >= total) {
                const elapsed = (Date.now() - startRef.current) / 1000;
                const errCount = errors + (ok ? 0 : 1);
                onDone({
                    answered: total,
                    errors: errCount,
                    time: elapsed,
                    score: total - errCount,
                    wrong: wrongRef.current,
                    right: rightRef.current,
                    maxStreak: total - errCount,
                });
            } else {
                setQ(prev => newQuestion(tables, prev, weights));
            }
        }, ok ? 250 : 500);
    }, [input, q, answered, errors, tables, weights, onDone]);

    // Auto-validation : correspondance exacte immédiate + 1200 ms d'inactivité
    useEffect(() => {
        if (fb !== 'idle' || lockRef.current || !input) return;
        if (estReponseExacte(input, q.answer)) { submit(); return; }
        const id = setTimeout(submit, 1200);
        return () => clearTimeout(id);
    }, [input, q.answer, fb, submit]);

    const press = useCallback((d) => { if (!lockRef.current && input.length < 3) setInput(v => v + d); }, [input]);
    const del = useCallback(() => { if (!lockRef.current) setInput(v => v.slice(0, -1)); }, []);

    const onKeyRef = useRef();
    onKeyRef.current = (e) => {
        if (e.key >= '0' && e.key <= '9') press(e.key);
        else if (e.key === 'Backspace') del();
        else if (e.key === 'Enter') submit();
    };

    useEffect(() => {
        const handler = (e) => onKeyRef.current?.(e);
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

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
function FlawlessPlay({ tables, onQuit, onDone }) {
    const weights = useMemo(() => buildWeights(tables, {}), [tables]);
    const [q, setQ] = useState(() => newQuestion(tables, null, weights));
    const [input, setInput] = useState('');
    const [streak, setStreak] = useState(0);
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const lockRef = useRef(false);
    const startRef = useRef(Date.now());
    const wrongRef = useRef([]);
    const rightRef = useRef([]);

    const submit = useCallback(() => {
        if (lockRef.current || !input) return;
        lockRef.current = true;
        const ok = parseInt(input, 10) === q.answer;

        if (ok) {
            setStreak(s => s + 1);
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            rightRef.current.push({ a: q.a, b: q.b });
            setTimeout(() => {
                lockRef.current = false;
                setFb('idle'); setWord(''); setInput('');
                setQ(prev => newQuestion(tables, prev, weights));
            }, 250);
        } else {
            setFb('wrong');
            setWord(`${q.a} × ${q.b} = ${q.answer}`);
            wrongRef.current.push({ a: q.a, b: q.b, answer: q.answer, given: input });
            setTimeout(() => {
                const elapsed = (Date.now() - startRef.current) / 1000;
                onDone({
                    streak,
                    score: streak,
                    answered: streak + 1,
                    time: elapsed,
                    lastQuestion: `${q.a}×${q.b}`,
                    wrong: wrongRef.current,
                    right: rightRef.current,
                    maxStreak: streak,
                });
            }, 1200);
        }
    }, [input, q, streak, tables, weights, onDone]);

    // Auto-validation : correspondance exacte immédiate + 1200 ms d'inactivité
    useEffect(() => {
        if (fb !== 'idle' || lockRef.current || !input) return;
        if (estReponseExacte(input, q.answer)) { submit(); return; }
        const id = setTimeout(submit, 1200);
        return () => clearTimeout(id);
    }, [input, q.answer, fb, submit]);

    const press = useCallback((d) => { if (!lockRef.current && input.length < 3) setInput(v => v + d); }, [input]);
    const del = useCallback(() => { if (!lockRef.current) setInput(v => v.slice(0, -1)); }, []);

    const onKeyRef = useRef();
    onKeyRef.current = (e) => {
        if (e.key >= '0' && e.key <= '9') press(e.key);
        else if (e.key === 'Backspace') del();
        else if (e.key === 'Enter') submit();
    };

    useEffect(() => {
        const handler = (e) => onKeyRef.current?.(e);
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

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
function CountdownPlay({ tables, onQuit, onDone }) {
    const duration = 120;
    const weights = useMemo(() => buildWeights(tables, {}), [tables]);
    const [q, setQ] = useState(() => newQuestion(tables, null, weights));
    const [input, setInput] = useState('');
    const [score, setScore] = useState(0);
    const [lastError, setLastError] = useState(''); // Correction persistante
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [remaining, setRemaining] = useState(duration);
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const lockRef = useRef(false);
    const scoreRef = useRef(0);
    const answeredRef = useRef(0);
    const maxStreakRef = useRef(0);
    const timedOut = useRef(false);
    const wrongRef = useRef([]);
    const rightRef = useRef([]);

    useEffect(() => { scoreRef.current = score; }, [score]);
    useEffect(() => { maxStreakRef.current = maxStreak; }, [maxStreak]);

    useEffect(() => {
        const id = setInterval(() => {
            setRemaining(r => {
                if (r <= 1) {
                    clearInterval(id);
                    if (!timedOut.current) {
                        timedOut.current = true;
                        setTimeout(() => {
                            onDone({
                                score: scoreRef.current,
                                answered: answeredRef.current,
                                time: duration,
                                maxStreak: maxStreakRef.current,
                                wrong: wrongRef.current,
                                right: rightRef.current,
                            });
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
            setStreak(s => {
                const next = s + 1;
                setMaxStreak(m => Math.max(m, next));
                return next;
            });
            setFb('correct');
            setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
            rightRef.current.push({ a: q.a, b: q.b });
        } else {
            setScore(s => Math.max(0, s - 1));
            setStreak(0);
            setFb('wrong');
            setWord(`${q.a} × ${q.b} = ${q.answer}`);
            wrongRef.current.push({ a: q.a, b: q.b, answer: q.answer, given: input });
            setLastError(`⚠️ ${q.a} × ${q.b} = ${q.answer}`);
        }

        setTimeout(() => {
            if (timedOut.current) return;
            lockRef.current = false;
            setFb('idle'); setWord(''); setInput('');
            setQ(prev => newQuestion(tables, prev, weights));
        }, ok ? 250 : 800);
    }, [input, q, tables, weights]);

    // Auto-validation : correspondance exacte immédiate + 1200 ms d'inactivité
    useEffect(() => {
        if (fb !== 'idle' || lockRef.current || !input || timedOut.current) return;
        if (estReponseExacte(input, q.answer)) { submit(); return; }
        const id = setTimeout(submit, 1200);
        return () => clearTimeout(id);
    }, [input, q.answer, fb, submit]);

    const press = useCallback((d) => { if (!lockRef.current && input.length < 3) setInput(v => v + d); }, [input]);
    const del = useCallback(() => { if (!lockRef.current) setInput(v => v.slice(0, -1)); }, []);

    const onKeyRef = useRef();
    onKeyRef.current = (e) => {
        if (e.key >= '0' && e.key <= '9') press(e.key);
        else if (e.key === 'Backspace') del();
        else if (e.key === 'Enter') submit();
    };

    useEffect(() => {
        const handler = (e) => onKeyRef.current?.(e);
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

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
            {/* Correction persistante — l'élève la lit à son rythme */}
            {lastError && (
                <div style={{
                    textAlign: 'center', fontSize: 14, fontWeight: 700,
                    color: 'var(--coral-dk)', padding: '6px 0', marginBottom: 4,
                }}>
                    {lastError}
                </div>
            )}
            <Keypad onPress={press} onDelete={del} onSubmit={submit} />
        </div>
    );
}

/* --- Montée des tables : palier par palier --- */
function ClimbPlay({ onQuit, onDone }) {
    const [currentTable, setCurrentTable] = useState(2);
    const [questionsInLevel, setQuestionsInLevel] = useState(0);
    const [correctInLevel, setCorrectInLevel] = useState(0);
    const [totalQuestions, setTotalQuestions] = useState(0);
    const [totalCorrect, setTotalCorrect] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [q, setQ] = useState(() => newQuestion([2], null, null));
    const [input, setInput] = useState('');
    const [fb, setFb] = useState('idle');
    const [word, setWord] = useState('');
    const [levelMsg, setLevelMsg] = useState('');
    const lockRef = useRef(false);
    const startRef = useRef(Date.now());
    const wrongRef = useRef([]);
    const rightRef = useRef([]);

    const submit = useCallback(() => {
        if (lockRef.current || !input) return;
        lockRef.current = true;
        const ok = parseInt(input, 10) === q.answer;
        const nextQ = questionsInLevel + 1;
        const nextCorrect = correctInLevel + (ok ? 1 : 0);
        const nextTotalQ = totalQuestions + 1;
        const nextTotalCorrect = totalCorrect + (ok ? 1 : 0);

        setQuestionsInLevel(nextQ);
        setCorrectInLevel(nextCorrect);
        setTotalQuestions(nextTotalQ);
        setTotalCorrect(nextTotalCorrect);

        if (ok) {
            setStreak(s => {
                const next = s + 1;
                setMaxStreak(m => Math.max(m, next));
                return next;
            });
            setFb('correct');
            setWord('✓');
            rightRef.current.push({ a: q.a, b: q.b });
        } else {
            setStreak(0);
            setFb('wrong');
            setWord(`${q.a} × ${q.b} = ${q.answer}`);
            wrongRef.current.push({ a: q.a, b: q.b, answer: q.answer, given: input });
        }

        setTimeout(() => {
            lockRef.current = false;
            setFb('idle'); setWord(''); setInput('');

            if (nextQ >= 5) {
                // Fin du palier (5 questions)
                if (nextCorrect >= 4) {
                    // Réussi (≥ 4 bonnes réponses) → palier suivant
                    const nextTable = currentTable + 1;
                    if (nextTable > 20) {
                        // Victoire totale !
                        onDone({
                            highestTable: 20,
                            score: nextTotalCorrect,
                            answered: nextTotalQ,
                            maxStreak,
                            time: (Date.now() - startRef.current) / 1000,
                            perfect: true,
                            wrong: wrongRef.current,
                            right: rightRef.current,
                        });
                    } else {
                        setCurrentTable(nextTable);
                        setQuestionsInLevel(0);
                        setCorrectInLevel(0);
                        setLevelMsg(`Table ${nextTable} ! 🧗`);
                        setTimeout(() => setLevelMsg(''), 1500);
                        setQ(newQuestion([nextTable], null, null));
                    }
                } else {
                    // Raté → fin du parcours
                    onDone({
                        highestTable: currentTable - 1,
                        score: nextTotalCorrect,
                        answered: nextTotalQ,
                        maxStreak,
                        time: (Date.now() - startRef.current) / 1000,
                        perfect: false,
                        wrong: wrongRef.current,
                        right: rightRef.current,
                    });
                }
            } else {
                setQ(prev => newQuestion([currentTable], prev, null));
            }
        }, ok ? 250 : 600);
    }, [input, q, questionsInLevel, correctInLevel, totalQuestions, totalCorrect, currentTable, maxStreak, onDone]);

    // Auto-validation : correspondance exacte immédiate + 1200 ms d'inactivité
    useEffect(() => {
        if (fb !== 'idle' || lockRef.current || !input) return;
        if (estReponseExacte(input, q.answer)) { submit(); return; }
        const id = setTimeout(submit, 1200);
        return () => clearTimeout(id);
    }, [input, q.answer, fb, submit]);

    const press = useCallback((d) => { if (!lockRef.current && input.length < 3) setInput(v => v + d); }, [input]);
    const del = useCallback(() => { if (!lockRef.current) setInput(v => v.slice(0, -1)); }, []);

    const onKeyRef = useRef();
    onKeyRef.current = (e) => {
        if (e.key >= '0' && e.key <= '9') press(e.key);
        else if (e.key === 'Backspace') del();
        else if (e.key === 'Enter') submit();
    };

    useEffect(() => {
        const handler = (e) => onKeyRef.current?.(e);
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

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

function ChallengeResults({ type, result, serverResult, ancienPlafond, onReplay, onHome, onBack }) {
    const badges = serverResult?.nouveaux_badges || [];
    const enAttente = serverResult?.enAttente;
    const nouveauPlafond = serverResult?.plafond_tables || null;

    // Déterminer si le résultat est une vraie réussite méritant confettis
    const isSuccess = useMemo(() => {
        if (!result) return false;
        if (type.id === 'sprint') {
            const errs = result.errors || 0;
            return errs <= 2;
        }
        if (type.id === 'flawless') {
            return (result.streak || 0) >= 10;
        }
        if (type.id === 'countdown') {
            return (result.score || 0) >= 15;
        }
        if (type.id === 'climb') {
            return (result.highestTable || 0) >= 10 || result.perfect;
        }
        return false;
    }, [type.id, result]);

    // Confetti uniquement sur vraie réussite
    useEffect(() => {
        if (isSuccess) {
            import('canvas-confetti').then(mod => {
                mod.default({
                    particleCount: 100, spread: 70, origin: { y: 0.6 },
                    colors: ['#C9A227', '#4DA8DA', '#00C9A7', '#FF5A5F']
                });
            }).catch(() => { });
        }
    }, [isSuccess]);

    if (!result) return null;

    return (
        <div className="screen-enter">
            <div className="card" style={{ textAlign: 'center' }}>
                {/* Podium emoji */}
                <div style={{ fontSize: 64, marginBottom: 8 }}>
                    {isSuccess ? '🏆' : '💪'}
                </div>

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

                {/* Badges débloqués */}
                {badges.length > 0 && (
                    <div style={{
                        textAlign: 'center', background: 'linear-gradient(135deg, #FFF8E1, #FFF0C0)',
                        borderRadius: 'var(--radius-md)', padding: 16, marginTop: 16, marginBottom: 16,
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

                {/* Table débloquée par la Montée */}
                {type.id === 'climb' && nouveauPlafond && ancienPlafond && nouveauPlafond > ancienPlafond && (
                    <div className="anim-pop" style={{
                        textAlign: 'center', background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)',
                        borderRadius: 'var(--radius-md)', padding: 16, marginTop: 16, marginBottom: 16,
                        border: '2px solid var(--mint)',
                    }}>
                        <p className="font-display" style={{ fontWeight: 800, fontSize: 20, color: 'var(--mint-dk)' }}>
                            🔓 Table {nouveauPlafond} débloquée !
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 600, marginTop: 4 }}>
                            Tu peux maintenant t'entraîner sur la table {nouveauPlafond} en mode libre.
                        </p>
                    </div>
                )}

                {/* Partie sauvegardée hors-ligne */}
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
