import React from 'react';
import { masteryColor } from '../logic/mastery';
import { IconMaGrille } from './Icons';

/**
 * MasteryGrid — Grille de maîtrise 15×15 (symétrique)
 * Rouge → Jaune → Vert, Gris = non testé
 */
export default function MasteryGrid({ mastery, tables, onClose }) {
    const range = tables || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="card" style={{ maxWidth: range.length > 10 ? 560 : 460, width: '100%' }} onClick={e => e.stopPropagation()}>
                <h3 className="font-display" style={{ fontWeight: 800, fontSize: 20, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconMaGrille size={22} color="var(--indigo)" actionColor="var(--ciel)" /> Grille de maîtrise
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
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 14, fontSize: 12, fontWeight: 700, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--rouge)', display: 'inline-block' }} />
                        À revoir
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--orange)', display: 'inline-block' }} />
                        En cours
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--vert)', display: 'inline-block' }} />
                        Maîtrisé
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--gris-inerte)', display: 'inline-block' }} />
                        Pas testé
                    </span>
                </div>
                <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: 'var(--indigo-doux)', lineHeight: 1.45 }}>
                    Une case devient verte quand tu réponds juste <strong>deux fois de suite, sans hésiter</strong>.
                </div>
                <button className="btn btn--ghost" style={{ width: '100%', marginTop: 14 }} onClick={onClose}>
                    Fermer
                </button>
            </div>
        </div>
    );
}
