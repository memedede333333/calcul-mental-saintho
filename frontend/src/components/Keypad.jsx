import React from 'react';

/**
 * Keypad — Pavé numérique custom optimisé iPad
 * Boutons ≥ 64px, pas de clavier natif iOS
 *
 * Dernière rangée : ⌫ · 0 (élargi sur 2 colonnes).
 * Pas de touche ✓ — la saisie à cases juge dès la dernière case remplie.
 */
export default function Keypad({ onPress, onDelete, disabled = false }) {
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
                className="key key--zero"
                onClick={() => !disabled && onPress('0')}
                disabled={disabled}
                style={{ gridColumn: 'span 2' }}
            >
                0
            </button>
        </div>
    );
}
