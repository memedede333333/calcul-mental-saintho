import React, { useState, useEffect, useCallback, useRef } from 'react';

/**
 * DigitBoxes — Saisie à cases
 *
 * Autant de cases que de chiffres dans la réponse.
 * Dès que la dernière case est remplie, onComplete(valeur) est appelé.
 * Le composant ne connaît PAS la bonne réponse — il sait juste combien
 * de chiffres afficher. C'est le parent qui juge.
 *
 * Props :
 *   numDigits       nombre de cases
 *   onComplete      (value: number) => void — quand toutes les cases sont remplies
 *   onFirstKey      () => void — à la toute première touche (démarre le chrono)
 *   disabled        boolean
 *   fb              'idle' | 'correct' | 'wrong' | 'reveal'
 *   revealDigits    string[] | null — chiffres à afficher (pour montrer la bonne réponse)
 */
export default function DigitBoxes({ numDigits, onComplete, onFirstKey, disabled, fb, revealDigits }) {
    const [digits, setDigits] = useState(() => Array(numDigits).fill(''));
    const hasTyped = useRef(false);
    const completeCalled = useRef(false);

    // Reset quand la question change (numDigits change)
    useEffect(() => {
        setDigits(Array(numDigits).fill(''));
        hasTyped.current = false;
        completeCalled.current = false;
    }, [numDigits]);

    // Quand fb passe à 'wrong', vider après le shake (200ms)
    useEffect(() => {
        if (fb === 'wrong') {
            const id = setTimeout(() => {
                setDigits(Array(numDigits).fill(''));
                completeCalled.current = false;
            }, 200);
            return () => clearTimeout(id);
        }
    }, [fb, numDigits]);

    const activeIndex = digits.findIndex(d => d === '');

    const addDigit = useCallback((d) => {
        if (disabled || fb !== 'idle') return;
        setDigits(prev => {
            const idx = prev.findIndex(x => x === '');
            if (idx === -1) return prev; // toutes remplies
            if (!hasTyped.current) {
                hasTyped.current = true;
                onFirstKey?.();
            }
            const next = [...prev];
            next[idx] = d;

            // Dernière case remplie → onComplete
            if (idx === numDigits - 1 && !completeCalled.current) {
                completeCalled.current = true;
                // Appel différé pour que le state se mette à jour avant
                setTimeout(() => {
                    onComplete(parseInt(next.join(''), 10));
                }, 0);
            }
            return next;
        });
    }, [disabled, fb, numDigits, onComplete, onFirstKey]);

    const removeDigit = useCallback(() => {
        if (disabled || fb !== 'idle') return;
        setDigits(prev => {
            // Trouve le dernier chiffre rempli
            let idx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i] !== '') { idx = i; break; }
            }
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = '';
            completeCalled.current = false;
            return next;
        });
    }, [disabled, fb]);

    // Expose addDigit/removeDigit pour Keypad (via ref pas nécessaire, on utilise les props)
    // Le Keypad appelle directement onPress/onDelete qui sont câblés dans le parent

    const displayDigits = revealDigits || digits;

    return (
        <div
            className={`digit-boxes${fb === 'wrong' ? ' anim-shake' : fb === 'correct' ? ' anim-pop' : ''}`}
            style={{ display: 'flex', gap: 8, justifyContent: 'center' }}
        >
            {displayDigits.map((d, i) => (
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

/**
 * Hook utilitaire pour gérer DigitBoxes depuis un composant quiz.
 * Retourne { digits, addDigit, removeDigit, resetDigits } et gère le lifecycle.
 */
export function useDigitBoxes(numDigits, onComplete, onFirstKey, fb, disabled) {
    const [digits, setDigits] = useState(() => Array(numDigits).fill(''));
    const hasTyped = useRef(false);
    const completeCalled = useRef(false);

    // Reset quand la question change
    useEffect(() => {
        setDigits(Array(numDigits).fill(''));
        hasTyped.current = false;
        completeCalled.current = false;
    }, [numDigits]);

    // Après erreur, vider
    useEffect(() => {
        if (fb === 'wrong') {
            const id = setTimeout(() => {
                setDigits(Array(numDigits).fill(''));
                completeCalled.current = false;
            }, 200);
            return () => clearTimeout(id);
        }
    }, [fb, numDigits]);

    const addDigit = useCallback((d) => {
        if (disabled || (fb !== 'idle' && fb !== 'reveal')) return;
        setDigits(prev => {
            const idx = prev.findIndex(x => x === '');
            if (idx === -1) return prev;
            if (!hasTyped.current) {
                hasTyped.current = true;
                onFirstKey?.();
            }
            const next = [...prev];
            next[idx] = d;
            if (idx === numDigits - 1 && !completeCalled.current) {
                completeCalled.current = true;
                setTimeout(() => onComplete(parseInt(next.join(''), 10)), 0);
            }
            return next;
        });
    }, [disabled, fb, numDigits, onComplete, onFirstKey]);

    const removeDigit = useCallback(() => {
        if (disabled || fb !== 'idle') return;
        setDigits(prev => {
            let idx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i] !== '') { idx = i; break; }
            }
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = '';
            completeCalled.current = false;
            return next;
        });
    }, [disabled, fb]);

    const resetDigits = useCallback(() => {
        setDigits(Array(numDigits).fill(''));
        hasTyped.current = false;
        completeCalled.current = false;
    }, [numDigits]);

    const showAnswer = useCallback((answer) => {
        const ansStr = String(answer);
        setDigits(ansStr.split(''));
    }, []);

    return { digits, addDigit, removeDigit, resetDigits, showAnswer, activeIndex: digits.findIndex(d => d === '') };
}
