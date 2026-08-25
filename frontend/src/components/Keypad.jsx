import React from 'react';

/**
 * Keypad — Pavé numérique custom optimisé iPad
 * Boutons ≥ 64px, pas de clavier natif iOS
 * Props : onPress(digit), onDelete, onSubmit, onHint?, showHint?
 */
export default function Keypad({ onPress, onDelete, onSubmit, onHint, showHint = true, disabled = false }) {
    return (
        <div className="keypad game-zone">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button
                    key={n}
                    className="key"
                    onClick={() => !disabled && onPress(String(n))}
                    disabled={disabled}
                >
                    {n}
                </button>
            ))}
            <button
                className="key key--del"
                onClick={() => !disabled && onDelete()}
                disabled={disabled}
            >
                ⌫
            </button>
            <button
                className="key"
                onClick={() => !disabled && onPress('0')}
                disabled={disabled}
            >
                0
            </button>
            <button
                className="key key--go"
                onClick={() => !disabled && onSubmit()}
                disabled={disabled}
            >
                ✓
            </button>
        </div>
    );
}
