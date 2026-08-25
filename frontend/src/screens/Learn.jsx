import React, { useState, useEffect } from 'react';
import { ALL_TABLES, TIPS, BAR_COLORS } from '../logic/questions';

/**
 * Learn — Mode Apprendre (méthode Singapour / CPA)
 * Tables 1-15, CPA visualisations, skip counting, commutativité, astuces
 * Conservé et étendu depuis le prototype
 */
const LEARN_TABLES = ALL_TABLES; // 1 à 15

export default function Learn({ onBack }) {
    const [table, setTable] = useState(2);
    const [focus, setFocus] = useState(3);
    const [hide, setHide] = useState(false);
    const [revealed, setRevealed] = useState({});
    const [viz, setViz] = useState('groups');
    const [flipped, setFlipped] = useState(false);
    const multipliers = table <= 10 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

    useEffect(() => setRevealed({}), [table, hide]);

    const reveal = (m) => {
        setFocus(m);
        if (hide) setRevealed(r => ({ ...r, [m]: true }));
    };

    const a = flipped ? focus : table;
    const b = flipped ? table : focus;

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            {/* Sélecteur de table */}
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h2 className="font-display" style={{ fontSize: 26, fontWeight: 800 }}>
                        Table de {table}
                    </h2>
                    <button
                        className="btn btn--ghost"
                        style={{ fontSize: 14, padding: '8px 14px' }}
                        onClick={() => setHide(h => !h)}
                    >
                        {hide ? '👁 Montrer' : '🙈 Cacher'}
                    </button>
                </div>
                <div className="chips" style={{ margin: '14px 0 4px' }}>
                    {LEARN_TABLES.map(t => (
                        <button
                            key={t}
                            className={`chip${t === table ? ' chip--sky' : ''}`}
                            onClick={() => { setTable(t); setFocus(3); setFlipped(false); }}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {/* Liste de la table */}
            <div className="card" style={{ marginTop: 14 }}>
                {multipliers.map(m => {
                    const show = !hide || revealed[m];
                    return (
                        <div
                            key={m}
                            className={`table-row${m === focus ? ' table-row--focus' : ''}`}
                            onClick={() => reveal(m)}
                        >
                            <span className="table-row__expr">{table} × {m}</span>
                            <span className={`table-row__result${show ? '' : ' table-row__hidden'}`}>
                                {show ? table * m : '?'}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Comptage par sauts */}
            <div className="card" style={{ marginTop: 14 }}>
                <p className="font-display" style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
                    🔢 Comptage par sauts de {table}
                </p>
                <div className="viz-skip">
                    {multipliers.map(m => (
                        <span
                            key={m}
                            className={`viz-skip-num${m <= focus ? ' viz-skip-num--hl' : ''}`}
                            onClick={() => reveal(m)}
                        >
                            {table * m}
                        </span>
                    ))}
                </div>
                <p className="font-display" style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-soft)', marginTop: 4 }}>
                    Touche un nombre pour explorer
                </p>
            </div>

            {/* Visualisation CPA */}
            <div className="card" style={{ marginTop: 14 }}>
                <p className="font-display" style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>
                    👁 Visualiser {a} × {b} = {a * b}
                </p>

                {/* Toggle commutativité */}
                <label className="commutative-toggle" onClick={() => setFlipped(f => !f)}>
                    <input type="checkbox" checked={flipped} readOnly />
                    Commutativité : {table}×{focus} = {focus}×{table}
                </label>

                {/* Onglets de visualisation */}
                <div className="viz-tabs">
                    <button className={`viz-tab${viz === 'groups' ? ' viz-tab--active' : ''}`} onClick={() => setViz('groups')}>
                        Groupes
                    </button>
                    <button className={`viz-tab${viz === 'array' ? ' viz-tab--active' : ''}`} onClick={() => setViz('array')}>
                        Tableau
                    </button>
                    <button className={`viz-tab${viz === 'bar' ? ' viz-tab--active' : ''}`} onClick={() => setViz('bar')}>
                        Barre
                    </button>
                </div>

                {viz === 'groups' && <GroupsViz a={a} b={b} />}
                {viz === 'array' && <ArrayViz cols={a} rows={b} />}
                {viz === 'bar' && <BarViz a={a} b={b} />}
            </div>

            {/* Astuce */}
            {TIPS[table] && (
                <div className="tip-box">
                    <b>💡 Astuce × {table} :</b> {TIPS[table]}
                </div>
            )}
        </div>
    );
}

/* --- Visualisations CPA --- */

function GroupsViz({ a, b }) {
    // Adapter la taille pour les tables > 10
    const itemSize = a > 8 || b > 8 ? 16 : 22;
    const groups = [];
    for (let g = 0; g < a; g++) {
        const items = [];
        for (let i = 0; i < b; i++) {
            items.push(
                <span
                    key={i}
                    className="viz-group-item"
                    style={itemSize !== 22 ? { width: itemSize, height: itemSize } : undefined}
                />
            );
        }
        groups.push(
            <div key={g} className="viz-group" style={{ maxWidth: Math.min(b, 5) * (itemSize + 8) + 20 }}>
                {items}
            </div>
        );
    }
    return (
        <div>
            <div className="viz-groups">{groups}</div>
            <p className="font-display" style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-soft)', marginTop: 4 }}>
                {a} groupe{a > 1 ? 's' : ''} de {b} = {a * b}
            </p>
        </div>
    );
}

function ArrayViz({ cols, rows }) {
    const dots = [];
    for (let i = 0; i < cols * rows; i++) dots.push(i);
    // Adapter la taille pour les tables > 10
    const size = cols > 10 ? 10 : cols > 8 ? 12 : 16;
    return (
        <div>
            <div className="viz-array" style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)` }}>
                {dots.map(i => (
                    <span key={i} className="viz-dot" style={{ width: size, height: size }} />
                ))}
            </div>
            <p className="font-display" style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-soft)', marginTop: 4 }}>
                {rows} ligne{rows > 1 ? 's' : ''} × {cols} colonne{cols > 1 ? 's' : ''} = {cols * rows}
            </p>
        </div>
    );
}

function BarViz({ a, b }) {
    const rows = [];
    for (let r = 0; r < a; r++) {
        const cells = [];
        for (let c = 0; c < b; c++) {
            cells.push(
                <div
                    key={c}
                    className="viz-bar-cell"
                    style={{ background: BAR_COLORS[r % BAR_COLORS.length], fontSize: b > 10 ? 10 : 14 }}
                >
                    {b <= 12 ? c + 1 + r * b : ''}
                </div>
            );
        }
        rows.push(<div key={r} className="viz-bar-row">{cells}</div>);
    }
    return (
        <div className="viz-bar-wrap">
            {rows}
            <div className="viz-bar-total">{a} × {b} = {a * b}</div>
        </div>
    );
}
