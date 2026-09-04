import React, { useState, useEffect, useCallback } from 'react';
import { mesDefis } from '../api';
import { DefiLeaderboard } from './Challenges';
import { IconDefisPasses, ModeIcon } from '../components/Icons';

/**
 * MesDefis — La porte de retour vers les défis passés.
 *
 * Un prof crée un défi, note le code, quitte l'écran — et n'a plus
 * AUCUN moyen d'y revenir. Cet écran liste les défis créés, et un
 * clic ouvre DefiLeaderboard pour voir le classement en temps réel.
 *
 * Accessible côté prof (accueil) ET côté élève (écran Défis).
 */

const TYPE_LABELS = {
    sprint: { label: 'Sprint' },
    countdown: { label: 'Contre-la-montre' },
    flawless: { label: 'Sans faute' },
    climb: { label: 'Montée' },
};

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const jour = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${jour} à ${heure}`;
}

export default function MesDefis({ onBack, estProf }) {
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState(null);
    const [defis, setDefis] = useState([]);
    // Quand on ouvre le classement d'un défi
    const [selectedDefi, setSelectedDefi] = useState(null);

    const charger = useCallback(async () => {
        setLoading(true);
        setErreur(null);
        const res = await mesDefis();
        if (res.ok) {
            setDefis(res.data || []);
        } else {
            setErreur(res.error || 'Impossible de charger les défis.');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        charger();
    }, [charger]);

    // Si on regarde le classement d'un défi
    if (selectedDefi) {
        return (
            <DefiLeaderboard
                defiId={selectedDefi.defi_id}
                defiInfo={selectedDefi}
                result={null}
                type={null}
                estProf={estProf}
                envoiDefi={null}
                onRetry={null}
                onHome={() => setSelectedDefi(null)}
                onBack={() => setSelectedDefi(null)}
            />
        );
    }

    if (loading) {
        return (
            <div className="screen-enter" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: '50vh', gap: 16,
            }}>
                <div className="spinner" />
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                    Chargement des défis…
                </p>
            </div>
        );
    }

    if (erreur) {
        return (
            <div className="screen-enter" style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--coral)', fontWeight: 700, fontSize: 16 }}>{erreur}</p>
                <button className="btn btn--ghost" style={{ marginTop: 16 }} onClick={charger}>
                    Réessayer
                </button>
                <button className="btn-back" style={{ marginTop: 12 }} onClick={onBack}>
                    ‹ Retour
                </button>
            </div>
        );
    }

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Retour</button>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                    <IconDefisPasses size={40} color="var(--indigo)" actionColor="var(--ciel)" />
                </div>
                <h2 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>
                    Mes défis
                </h2>
                <p style={{ color: 'var(--text-soft)', fontWeight: 600, fontSize: 13 }}>
                    {defis.length === 0
                        ? 'Tu n\'as pas encore créé de défi.'
                        : `${defis.length} défi${defis.length > 1 ? 's' : ''}`
                    }
                </p>
            </div>

            {defis.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                    <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14 }}>
                        Aucun défi créé pour le moment.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {defis.map(d => {
                        const typeInfo = TYPE_LABELS[d.type] || { label: d.type };
                        const ouvert = d.encore_ouvert;
                        return (
                            <button
                                key={d.defi_id}
                                className="card"
                                onClick={() => setSelectedDefi(d)}
                                style={{
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    border: ouvert ? '2px solid var(--mint)' : '2px solid var(--border)',
                                    opacity: ouvert ? 1 : 0.6,
                                    padding: '14px 16px',
                                    transition: 'transform 0.1s',
                                }}
                            >
                                {/* Code en gros, display, lettrage espacé */}
                                <div style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 26,
                                    fontWeight: 900,
                                    letterSpacing: '0.2em',
                                    color: ouvert ? 'var(--navy)' : 'var(--text-soft)',
                                    marginBottom: 6,
                                }}>
                                    {d.code}
                                </div>

                                {/* Type + classe + date */}
                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
                                    fontSize: 13, fontWeight: 600, color: 'var(--text-soft)',
                                    marginBottom: 6,
                                }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <ModeIcon mode={d.type} size={16} color="var(--indigo)" /> {typeInfo.label}
                                    </span>
                                    {d.classe && (
                                        <span className="chip" style={{
                                            fontSize: 11, padding: '2px 8px', height: 'auto',
                                        }}>
                                            {d.classe}
                                        </span>
                                    )}
                                    <span>· {formatDate(d.cree_le)}</span>
                                </div>

                                {/* Origine */}
                                <div style={{ marginBottom: 6 }}>
                                    <span style={{
                                        fontSize: 11, fontWeight: 800,
                                        padding: '2px 8px', borderRadius: 6,
                                        background: d.origine === 'prof'
                                            ? 'var(--ciel-pale)' : 'var(--orange-pale)',
                                        color: d.origine === 'prof'
                                            ? 'var(--action)' : 'var(--orange)',
                                    }}>
                                        {d.origine === 'prof' ? 'Travail de classe' : 'Défi amical'}
                                    </span>
                                    {d.auteur_nom && (
                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gris)', marginLeft: 6 }}>
                                            Défi de {d.auteur_nom}
                                        </span>
                                    )}
                                </div>

                                {/* Participants + état */}
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                }}>
                                    <div>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                                            {d.attendus != null
                                                ? `${d.participants_classe ?? 0} / ${d.attendus} de la ${d.classe} ont joué`
                                                : `${d.participants} ${d.participants === 1 ? 'a joué' : 'ont joué'}`
                                            }
                                        </span>
                                        {d.attendus != null && d.participants > (d.participants_classe ?? 0) && (
                                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-soft)' }}>
                                                + {d.participants - (d.participants_classe ?? 0)} d'autres classes
                                            </div>
                                        )}
                                    </div>
                                    {!ouvert && (
                                        <span style={{
                                            fontSize: 11, fontWeight: 800,
                                            color: 'var(--text-soft)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                        }}>
                                            terminé
                                        </span>
                                    )}
                                    {ouvert && (
                                        <span style={{
                                            fontSize: 11, fontWeight: 800,
                                            color: 'var(--mint-dk)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                        }}>
                                            en cours
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
