import React from 'react';
import { IconEffacer } from './Icons';

/**
 * Keypad — Pavé numérique tactile optimisé iPad (Section 4 du Lot 13)
 *
 * Règles :
 * - Ordre 1-2-3 en haut (automatisé chez un collégien)
 * - Le 0 occupe deux colonnes au centre-bas (le chiffre le plus tapé)
 * - Le ⌫ est isolé en bas à droite, séparé par une gouttière de 32 px
 *   incompressible, posé en creux et jamais en rouge.
 * - Touches ≥ 88 px de haut et 96 px de large.
 */
export default function Keypad({ onPress, onDelete, disabled = false }) {
    return (
        <div className="keypad game-zone">
            <div className="keypad__row">
                <button type="button" className="key" onClick={() => !disabled && onPress('1')} disabled={disabled}>1</button>
                <button type="button" className="key" onClick={() => !disabled && onPress('2')} disabled={disabled}>2</button>
                <button type="button" className="key" onClick={() => !disabled && onPress('3')} disabled={disabled}>3</button>
            </div>
            <div className="keypad__row">
                <button type="button" className="key" onClick={() => !disabled && onPress('4')} disabled={disabled}>4</button>
                <button type="button" className="key" onClick={() => !disabled && onPress('5')} disabled={disabled}>5</button>
                <button type="button" className="key" onClick={() => !disabled && onPress('6')} disabled={disabled}>6</button>
            </div>
            <div className="keypad__row">
                <button type="button" className="key" onClick={() => !disabled && onPress('7')} disabled={disabled}>7</button>
                <button type="button" className="key" onClick={() => !disabled && onPress('8')} disabled={disabled}>8</button>
                <button type="button" className="key" onClick={() => !disabled && onPress('9')} disabled={disabled}>9</button>
            </div>
            <div className="keypad__row keypad__row--bottom">
                <button type="button" className="key key--zero" onClick={() => !disabled && onPress('0')} disabled={disabled}>0</button>
                <button
                    type="button"
                    className="key key--del"
                    onClick={() => !disabled && onDelete()}
                    disabled={disabled}
                    aria-label="Effacer"
                >
                    <IconEffacer size={38} color="var(--indigo-doux)" />
                </button>
            </div>
        </div>
    );
}
