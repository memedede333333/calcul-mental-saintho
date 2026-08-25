import React from 'react';
import { masteryColor } from '../logic/mastery';

/**
 * MasteryGrid — Grille de maîtrise 15×15 (symétrique)
 * Rouge → Jaune → Vert, Gris = non testé
 */
export default function MasteryGrid({ mastery, tables, onClose }) {
    const range = tables || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="card" style={{ maxWidth: 460, width: '100%' }} onClick={e => e.stopPropagation()}>
                <h3 className="font-display" style={{ fontWeight: 800, fontSize: 20, marginBottom: 12 }}>
                    🗺 Grille de maîtrise
                </h3>
                <div
                    className="mastery-grid"
                    style={{ gridTemplateColumns: `30px repeat(${range.length}, 1fr)` }}
                >
                    <div className="mastery-grid-hdr">×</div>
                    {range.map(c => (
                        <div key={c} className="mastery-grid-hdr">{c}</div>
                    ))}
                    {range.map(r => (
                        <React.Fragment key={r}>
                            <div className="mastery-grid-hdr">{r}</div>
                            {range.map(c => {
                                const key = `${Math.min(r, c)}_${Math.max(r, c)}`;
                                return (
                                    <div
                                        key={c}
                                        className="mastery-grid-cell"
                                        style={{ background: masteryColor(mastery[key]) }}
                                        title={`${r}×${c} = ${r * c}`}
                                    >
                                        {range.length <= 10 ? r * c : ''}
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 14, fontSize: 12, fontWeight: 700 }}>
                    <span>🔴 À revoir</span>
                    <span>🟡 En cours</span>
                    <span>🟢 Maîtrisé</span>
                    <span>⬜ Pas testé</span>
                </div>
                <button className="btn btn--ghost" style={{ width: '100%', marginTop: 14 }} onClick={onClose}>
                    Fermer
                </button>
            </div>
        </div>
    );
}
