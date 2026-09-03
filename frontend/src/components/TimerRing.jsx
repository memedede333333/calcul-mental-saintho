import React from 'react';

/**
 * TimerRing — Anneau SVG animé pour le chronomètre
 * Devient rouge quand il reste < 10s
 */
export default function TimerRing({ seconds, total, warn }) {
    const r = 22;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - seconds / total);
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    return (
        <span className={`timer-ring${warn ? ' timer-ring--warn' : ''}`}>
            <svg width="56" height="56" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r={r} fill="none" stroke="var(--bordure)" strokeWidth="5" />
                <circle
                    className="timer-ring__fg"
                    cx="28" cy="28" r={r}
                    fill="none"
                    stroke="var(--action)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
            </svg>
            <span className="timer-ring__text">{fmt(seconds)}</span>
        </span>
    );
}
