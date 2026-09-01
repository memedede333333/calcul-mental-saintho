import React, { useState, useEffect, useCallback, useRef } from 'react';
import { masteryColor } from '../logic/mastery';
import {
    listeClasses, ajouterEleve, modifierEleve, desactiverEleve, reactiverEleve,
    definirPlafondClasse, listeEleves,
    listeProfs, creerProf, modifierProf, desactiverProf,
    importerEleves, reparerRattachements, journalAdmin,
} from '../api.js';

/**
 * Admin — Dashboard enseignant / administrateur
 *
 * Onglets visibles :
 *   - Élèves          (tout enseignant)
 *   - Enseignants      (admin seulement)
 *   - Import           (admin seulement)
 *   - Journal          (admin seulement)
 *
 * Les classes viennent de listeClasses(), jamais d'une constante.
 */

export default function Admin({ onBack, identite, onIdentiteChange }) {
    const estAdmin = identite?.admin === true;
    const [tab, setTab] = useState('eleves');
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState('');
    const [loading, setLoading] = useState(true);

    // Charger les classes au montage
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            const res = await listeClasses();
            if (cancelled) return;
            if (res.ok && res.data) {
                setClasses(res.data);
                if (res.data.length > 0 && !selectedClass) {
                    setSelectedClass(res.data[0].classe);
                }
            }
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    const refreshClasses = useCallback(async () => {
        const res = await listeClasses();
        if (res.ok && res.data) setClasses(res.data);
    }, []);

    const tabs = [
        { id: 'eleves', label: '📋 Élèves' },
        ...(estAdmin ? [
            { id: 'profs', label: '👩‍🏫 Enseignants' },
            { id: 'import', label: '📥 Import' },
            { id: 'journal', label: '📜 Journal' },
        ] : []),
    ];

    const currentClassInfo = classes.find(c => c.classe === selectedClass);

    return (
        <div className="screen-enter">
            <button className="btn-back" onClick={onBack}>‹ Accueil</button>

            <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800, color: 'var(--navy)' }}>
                    ⚙️ Administration
                </h1>
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 13 }}>
                    {identite?.nom || 'Enseignant'}{estAdmin ? ' — admin' : ''}
                </p>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <div className="spinner" />
                </div>
            ) : (
                <>
                    {/* Sélecteur de classe */}
                    {classes.length > 0 && (tab === 'eleves') && (
                        <div className="chips" style={{ justifyContent: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                            {classes.map(c => (
                                <button
                                    key={c.classe}
                                    className={`chip${c.classe === selectedClass ? ' chip--navy' : ''}`}
                                    style={{ minWidth: 50, height: 42, fontSize: 16 }}
                                    onClick={() => setSelectedClass(c.classe)}
                                >
                                    {c.classe}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Onglets */}
                    <div className="viz-tabs" style={{ marginBottom: 14 }}>
                        {tabs.map(t => (
                            <button
                                key={t.id}
                                className={`viz-tab${tab === t.id ? ' viz-tab--active' : ''}`}
                                onClick={() => setTab(t.id)}
                                style={{ fontSize: 13 }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {tab === 'eleves' && (
                        <ElevesTab
                            selectedClass={selectedClass}
                            classInfo={currentClassInfo}
                            onRefresh={refreshClasses}
                            estAdmin={estAdmin}
                        />
                    )}
                    {tab === 'profs' && estAdmin && <ProfsTab identite={identite} onIdentiteChange={onIdentiteChange} />}
                    {tab === 'import' && estAdmin && <ImportTab onRefresh={refreshClasses} />}
                    {tab === 'journal' && estAdmin && <JournalTab />}
                </>
            )}
        </div>
    );
}

/* ===================== ÉLÈVES ===================== */

function ElevesTab({ selectedClass, classInfo, onRefresh, estAdmin }) {
    const [eleves, setEleves] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [showInactifs, setShowInactifs] = useState(false);
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(null); // eleveId en cours d'action

    // Plafond
    const [plafondEnCours, setPlafondEnCours] = useState(false);

    const charger = useCallback(async () => {
        if (!selectedClass) return;
        setLoading(true);
        // On charge la liste des élèves sans connexion pour cette classe
        const res = await listeEleves(selectedClass);
        if (res.ok && res.data) {
            setEleves(res.data);
        }
        setLoading(false);
    }, [selectedClass]);

    useEffect(() => { charger(); }, [charger]);

    const handleToggleActif = async (eleve) => {
        // Confirmation avant désactivation
        if (eleve.actif !== false) {
            const ok = window.confirm(`Désactiver ${eleve.prenom || ''} ${eleve.nom || ''} ? L'élève ne pourra plus se connecter.`);
            if (!ok) return;
        }
        setBusy(eleve.eleve_id);
        setMsg('');
        const res = eleve.actif
            ? await desactiverEleve(eleve.eleve_id)
            : await reactiverEleve(eleve.eleve_id);
        if (!res.ok) setMsg(`❌ ${res.error}`);
        else {
            setMsg(eleve.actif ? '✅ Élève désactivé' : '✅ Élève réactivé');
            await charger();
            await onRefresh();
        }
        setBusy(null);
    };

    const handlePlafond = async (plafond) => {
        setPlafondEnCours(true);
        setMsg('');
        const res = await definirPlafondClasse(selectedClass, plafond);
        if (res.ok) {
            setMsg(`✅ Plafond de ${selectedClass} → tables 1-${plafond}`);
            await onRefresh();
        } else {
            setMsg(`❌ ${res.error}`);
        }
        setPlafondEnCours(false);
    };

    const actifs = eleves.filter(e => e.actif !== false);
    const inactifs = eleves.filter(e => e.actif === false);

    if (!selectedClass) {
        return (
            <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                <p style={{ color: 'var(--text-soft)', fontWeight: 700 }}>
                    Aucune classe disponible. Importez des élèves pour commencer.
                </p>
            </div>
        );
    }

    return (
        <div>
            {/* Info classe */}
            <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800 }}>
                        Classe {selectedClass} — {classInfo?.eleves_actifs ?? actifs.length} élève{(classInfo?.eleves_actifs ?? actifs.length) > 1 ? 's' : ''} actif{(classInfo?.eleves_actifs ?? actifs.length) > 1 ? 's' : ''}
                    </h3>
                    <button className="btn btn--mint" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => setShowAdd(!showAdd)}>
                        + Ajouter
                    </button>
                </div>

                {showAdd && <AddStudentForm selectedClass={selectedClass} onDone={async () => { setShowAdd(false); await charger(); await onRefresh(); }} />}

                {msg && (
                    <p style={{ fontSize: 12, fontWeight: 700, padding: '6px 0', color: msg.startsWith('❌') ? 'var(--coral)' : 'var(--mint-dk)' }}>
                        {msg}
                    </p>
                )}

                {loading ? (
                    <div style={{ textAlign: 'center', padding: 20 }}>
                        <div className="spinner" />
                    </div>
                ) : actifs.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-soft)', fontWeight: 600, padding: 20 }}>
                        Aucun élève actif dans cette classe. Utilisez « + Ajouter » ou l'onglet Import.
                    </p>
                ) : (
                    actifs.map(s => (
                        <StudentRow
                            key={s.eleve_id}
                            eleve={s}
                            busy={busy === s.eleve_id}
                            onToggle={() => handleToggleActif(s)}
                        />
                    ))
                )}

                {/* Inactifs repliés */}
                {inactifs.length > 0 && (
                    <>
                        <button
                            className="btn btn--ghost"
                            style={{ width: '100%', marginTop: 10, fontSize: 12 }}
                            onClick={() => setShowInactifs(!showInactifs)}
                        >
                            {showInactifs ? '▾' : '▸'} {inactifs.length} élève{inactifs.length > 1 ? 's' : ''} inactif{inactifs.length > 1 ? 's' : ''}
                        </button>
                        {showInactifs && inactifs.map(s => (
                            <StudentRow
                                key={s.eleve_id}
                                eleve={s}
                                busy={busy === s.eleve_id}
                                onToggle={() => handleToggleActif(s)}
                            />
                        ))}
                    </>
                )}
            </div>

            {/* Plafond de tables */}
            {estAdmin && (
                <div className="card" style={{ marginBottom: 14 }}>
                    <h3 className="font-display" style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
                        📐 Plafond de tables — {selectedClass}
                    </h3>
                    <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 10 }}>
                        Relève le plafond quand la classe est prête. Ne redescend jamais un élève qui a débloqué plus haut.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {[10, 12, 15, 20].map(n => (
                            <button
                                key={n}
                                className="chip"
                                style={{ flex: 1, width: 'auto', fontSize: 15, height: 46 }}
                                disabled={plafondEnCours}
                                onClick={() => handlePlafond(n)}
                            >
                                1-{n}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function StudentRow({ eleve, busy, onToggle }) {
    const nom = eleve.nom || '';
    const prenom = eleve.prenom || '';
    const email = eleve.email || '';
    const dejaConnecte = eleve.deja_connecte === true;
    const nbSessions = eleve.nb_sessions ?? 0;

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
            borderBottom: '1px solid var(--border)',
            opacity: eleve.actif === false ? 0.5 : 1,
        }}>
            <span style={{ fontSize: 22 }}>{eleve.avatar_emoji || '👤'}</span>
            <div style={{ flex: 1 }}>
                <p className="font-display" style={{ fontWeight: 700, fontSize: 14 }}>
                    {prenom} {nom}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                    {email}
                    {!dejaConnecte && (
                        <span style={{ marginLeft: 6, color: 'var(--coral)', fontWeight: 700 }}>
                            ⏳ compte Google pas encore rattaché
                        </span>
                    )}
                    {dejaConnecte && nbSessions === 0 && (
                        <span style={{ marginLeft: 6, color: 'var(--text-soft)', fontWeight: 600 }}>
                            ◻︎ compte rattaché — n'a pas encore joué
                        </span>
                    )}
                    {dejaConnecte && nbSessions > 0 && (
                        <span style={{ marginLeft: 6, color: 'var(--text-soft)', fontWeight: 600 }}>
                            · {nbSessions} partie{nbSessions > 1 ? 's' : ''}
                        </span>
                    )}
                </p>
            </div>
            <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: busy ? 0.4 : 1 }}
                onClick={onToggle}
                disabled={busy}
                title={eleve.actif === false ? 'Réactiver' : 'Désactiver'}
            >
                {eleve.actif === false ? '♻️' : '⛔'}
            </button>
        </div>
    );
}

function AddStudentForm({ selectedClass, onDone }) {
    const [nom, setNom] = useState('');
    const [prenom, setPrenom] = useState('');
    const [email, setEmail] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    const handleAdd = async () => {
        if (!nom.trim() || !prenom.trim() || !email.trim()) {
            setMsg('❌ Tous les champs sont obligatoires.');
            return;
        }
        setBusy(true);
        setMsg('');
        const res = await ajouterEleve({
            email: email.trim(),
            nom: nom.trim(),
            prenom: prenom.trim(),
            classe: selectedClass,
        });
        if (res.ok) {
            await onDone();
        } else {
            setMsg(`❌ ${res.error}`);
            setBusy(false);
        }
    };

    return (
        <div style={{ background: 'var(--surface-alt)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input placeholder="Prénom" value={prenom} onChange={e => setPrenom(e.target.value)}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)' }} />
                <input placeholder="Nom" value={nom} onChange={e => setNom(e.target.value)}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)' }} />
            </div>
            <input placeholder="Email Google" value={email} onChange={e => setEmail(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '2px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', marginBottom: 8 }} />
            {msg && <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral)', marginBottom: 6 }}>{msg}</p>}
            <button className="btn btn--mint" style={{ width: '100%', fontSize: 14, padding: 10 }} onClick={handleAdd} disabled={busy}>
                {busy ? '⏳...' : "Ajouter l'élève"}
            </button>
        </div>
    );
}

/* ===================== ENSEIGNANTS (admin) ===================== */

function ProfsTab({ identite, onIdentiteChange }) {
    const [profs, setProfs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(null);

    const monId = identite?.profil?.id || null;

    const charger = useCallback(async () => {
        setLoading(true);
        const res = await listeProfs();
        if (res.ok && res.data) setProfs(res.data);
        setLoading(false);
    }, []);

    useEffect(() => { charger(); }, [charger]);

    const handleToggle = async (prof) => {
        if (prof.prof_id === monId) return; // impossible de se désactiver soi-même
        const ok = window.confirm(`Désactiver ${prof.nom} ? Ce compte enseignant ne pourra plus se connecter.`);
        if (!ok) return;
        setBusy(prof.prof_id);
        setMsg('');
        if (prof.actif) {
            const res = await desactiverProf(prof.prof_id);
            if (res.ok) {
                setMsg('✅ Enseignant désactivé');
                await charger();
                onIdentiteChange?.();
            } else {
                setMsg(`❌ ${res.error}`);
            }
        }
        setBusy(null);
    };

    const handleRoleChange = async (prof, newRole) => {
        if (prof.prof_id === monId) return; // interdit de se changer soi-même
        const action = newRole === 'admin'
            ? `Donner les droits d'administrateur à ${prof.nom} ?`
            : `Retirer les droits d'administrateur à ${prof.nom} ?`;
        const ok = window.confirm(action);
        if (!ok) return;
        setBusy(prof.prof_id);
        setMsg('');
        const res = await modifierProf(prof.prof_id, { role: newRole });
        if (res.ok) {
            setMsg(`✅ ${prof.nom} → ${newRole}`);
            await charger();
            onIdentiteChange?.();
        } else {
            // Messages de la base : "Impossible : c'est le dernier administrateur actif."
            // "Réservé à l'administrateur" etc. — on les affiche tels quels
            setMsg(`❌ ${res.error}`);
        }
        setBusy(null);
    };

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800 }}>
                    👩‍🏫 Enseignants — {profs.filter(p => p.actif).length} actif{profs.filter(p => p.actif).length > 1 ? 's' : ''}
                </h3>
                <button className="btn btn--mint" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => setShowAdd(!showAdd)}>
                    + Ajouter
                </button>
            </div>

            {showAdd && <AddProfForm onDone={async () => { setShowAdd(false); await charger(); }} />}

            {msg && (
                <p style={{ fontSize: 12, fontWeight: 700, padding: '6px 0', color: msg.startsWith('❌') ? 'var(--coral)' : 'var(--mint-dk)' }}>
                    {msg}
                </p>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" /></div>
            ) : profs.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-soft)', fontWeight: 600, padding: 20 }}>
                    Aucun enseignant trouvé.
                </p>
            ) : (
                profs.filter(p => p.actif).map(p => {
                    const estMoi = p.prof_id === monId;
                    return (
                        <div key={p.prof_id} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
                            borderBottom: '1px solid var(--border)',
                        }}>
                            <span style={{ fontSize: 22 }}>👤</span>
                            <div style={{ flex: 1 }}>
                                <p className="font-display" style={{ fontWeight: 700, fontSize: 14 }}>
                                    {p.nom}{estMoi && <span style={{ color: 'var(--text-soft)', fontWeight: 600 }}> (toi)</span>}
                                </p>
                                <p style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                                    {p.email}
                                    {p.classes?.length > 0 && ` — ${p.classes.join(', ')}`}
                                </p>
                            </div>
                            {estMoi ? (
                                /* Étiquette non cliquable pour soi-même */
                                <span
                                    className={`chip${p.role === 'admin' ? ' chip--gold' : ''}`}
                                    style={{ fontSize: 11, height: 28, minWidth: 60, cursor: 'default', pointerEvents: 'none' }}
                                >
                                    {p.role === 'admin' ? '👑 admin' : '📚 prof'}
                                </span>
                            ) : (
                                /* Menu déroulant pour les autres */
                                <select
                                    value={p.role}
                                    disabled={busy === p.prof_id}
                                    onChange={(e) => handleRoleChange(p, e.target.value)}
                                    style={{
                                        fontSize: 13, fontWeight: 700, padding: '6px 10px',
                                        borderRadius: 10, border: '2px solid var(--border)',
                                        background: p.role === 'admin' ? 'var(--gold-light)' : 'var(--surface)',
                                        color: 'var(--navy)', cursor: 'pointer',
                                        fontFamily: 'var(--font-body)',
                                    }}
                                >
                                    <option value="prof">📚 Prof</option>
                                    <option value="admin">👑 Admin</option>
                                </select>
                            )}
                            {!estMoi && (
                                <button
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: busy === p.prof_id ? 0.4 : 1 }}
                                    onClick={() => handleToggle(p)}
                                    disabled={busy === p.prof_id}
                                    title="Désactiver"
                                >
                                    ⛔
                                </button>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}

function AddProfForm({ onDone }) {
    const [nom, setNom] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('prof');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    const handleAdd = async () => {
        if (!nom.trim() || !email.trim()) { setMsg('❌ Nom et email requis.'); return; }
        setBusy(true); setMsg('');
        const res = await creerProf({ email: email.trim(), nom: nom.trim(), role });
        if (res.ok) { await onDone(); }
        else { setMsg(`❌ ${res.error}`); setBusy(false); }
    };

    return (
        <div style={{ background: 'var(--surface-alt)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input placeholder="Nom" value={nom} onChange={e => setNom(e.target.value)}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)' }} />
                <input placeholder="Email Google" value={email} onChange={e => setEmail(e.target.value)}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button className={`chip${role === 'prof' ? ' chip--navy' : ''}`}
                    style={{ flex: 1, height: 38, fontSize: 14 }} onClick={() => setRole('prof')}>📚 Prof</button>
                <button className={`chip${role === 'admin' ? ' chip--navy' : ''}`}
                    style={{ flex: 1, height: 38, fontSize: 14 }} onClick={() => setRole('admin')}>👑 Admin</button>
            </div>
            {msg && <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral)', marginBottom: 6 }}>{msg}</p>}
            <button className="btn btn--mint" style={{ width: '100%', fontSize: 14, padding: 10 }} onClick={handleAdd} disabled={busy}>
                {busy ? '⏳...' : "Ajouter l'enseignant"}
            </button>
        </div>
    );
}

/* ===================== IMPORT (admin) ===================== */

function ImportTab({ onRefresh }) {
    const [csv, setCsv] = useState('');
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef(null);

    const handleFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setCsv(ev.target.result);
        reader.readAsText(file);
    };

    const handleImport = async () => {
        if (!csv.trim()) return;
        setBusy(true); setResult(null);

        // Parse CSV : email, nom, prenom, classe
        const lines = csv.trim().split('\n').filter(l => l.trim());
        const eleves = [];
        for (const line of lines) {
            const parts = line.split(/[,;\t]/).map(s => s.trim());
            if (parts.length < 4) continue;
            // Skip header
            if (parts[0].toLowerCase() === 'email') continue;
            eleves.push({ email: parts[0], nom: parts[1], prenom: parts[2], classe: parts[3] });
        }

        if (eleves.length === 0) {
            setResult({ ok: false, error: 'Aucun élève trouvé. Format : email, nom, prénom, classe' });
            setBusy(false);
            return;
        }

        const res = await importerEleves(eleves);
        setResult(res.ok ? res.data : { error: res.error });
        if (res.ok) await onRefresh();
        setBusy(false);
    };

    return (
        <div className="card">
            <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                📥 Import de rentrée
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 12 }}>
                Fichier CSV : <b>email, nom, prénom, classe</b> — un élève par ligne.
                L'import ne désactive jamais personne.
            </p>

            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile}
                style={{ marginBottom: 10, fontSize: 13 }} />

            {csv && (
                <div style={{ background: 'var(--surface-alt)', borderRadius: 10, padding: 10, marginBottom: 10, maxHeight: 150, overflow: 'auto' }}>
                    <pre style={{ fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                        {csv.slice(0, 1000)}{csv.length > 1000 ? '\n…' : ''}
                    </pre>
                </div>
            )}

            <button className="btn btn--gold" style={{ width: '100%', fontSize: 14, padding: 12 }}
                onClick={handleImport} disabled={busy || !csv.trim()}>
                {busy ? '⏳ Import en cours…' : "Lancer l'import"}
            </button>

            {result && (
                <div style={{ marginTop: 14 }}>
                    {result.error ? (
                        <p style={{ color: 'var(--coral)', fontWeight: 700, fontSize: 13 }}>❌ {result.error}</p>
                    ) : (
                        <>
                            <div style={{ background: 'var(--surface-alt)', borderRadius: 10, padding: 12, border: '1px solid var(--border)' }}>
                                <p style={{ color: 'var(--navy)', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                                    ✅ Import terminé
                                </p>
                                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                                    {result.crees ?? 0} élève{(result.crees ?? 0) > 1 ? 's' : ''} créé{(result.crees ?? 0) > 1 ? 's' : ''}, {result.mis_a_jour ?? 0} mis à jour.
                                    {' '}
                                    {(result.rattaches ?? 0) > 0
                                        ? `${result.rattaches} ${(result.rattaches ?? 0) > 1 ? 'avaient' : 'avait'} déjà un compte Google : ${(result.rattaches ?? 0) > 1 ? 'ils ont été rattachés' : 'il a été rattaché'}.`
                                        : 'Aucun compte Google préexistant à rattacher.'}
                                </p>
                            </div>
                            {result.lignes_ignorees?.length > 0 && (
                                <div style={{ background: '#FFF8F0', borderRadius: 10, padding: 10, marginTop: 8, border: '1px solid #FFE0C0' }}>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral-dk)', marginBottom: 4 }}>
                                        ⚠️ {result.lignes_ignorees.length} ligne{result.lignes_ignorees.length > 1 ? 's' : ''} ignorée{result.lignes_ignorees.length > 1 ? 's' : ''}
                                    </p>
                                    {result.lignes_ignorees.slice(0, 10).map((l, i) => (
                                        <p key={i} style={{ fontSize: 11, color: 'var(--text-soft)' }}>{l.raison}: {l.email || '(vide)'}</p>
                                    ))}
                                </div>
                            )}
                            {result.actifs_absents_du_fichier?.length > 0 && (
                                <div style={{ background: '#FFF3E0', borderRadius: 10, padding: 10, marginTop: 8, border: '1px solid #FFE0C0' }}>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: '#E67E00', marginBottom: 4 }}>
                                        ℹ️ {result.actifs_absents_du_fichier.length} élève{result.actifs_absents_du_fichier.length > 1 ? 's' : ''} actif{result.actifs_absents_du_fichier.length > 1 ? 's' : ''} absent{result.actifs_absents_du_fichier.length > 1 ? 's' : ''} du fichier
                                    </p>
                                    <p style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                                        Vérifiez au cas par cas — l'import ne les a pas désactivés.
                                    </p>
                                    {result.actifs_absents_du_fichier.slice(0, 10).map((e, i) => (
                                        <p key={i} style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 2 }}>
                                            {e.prenom} {e.nom} ({e.classe})
                                        </p>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Section Réparation des rattachements */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <h4 className="font-display" style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
                    🔧 Rattachement des comptes Google
                </h4>
                <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 10 }}>
                    À lancer après chaque import ou si un élève s'est connecté avant la création de sa fiche.
                </p>
                <RepairButton onRefresh={onRefresh} />
            </div>
        </div>
    );
}

/* ===================== JOURNAL (admin) ===================== */

function JournalTab() {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            const res = await journalAdmin(200);
            if (cancelled) return;
            if (res.ok && res.data) setEntries(res.data);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    return (
        <div className="card">
            <h3 className="font-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
                📜 Journal d'administration
            </h3>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" /></div>
            ) : entries.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-soft)', fontWeight: 600, padding: 20 }}>
                    Aucune entrée dans le journal.
                </p>
            ) : (
                <div style={{ maxHeight: 500, overflow: 'auto' }}>
                    {entries.map((e, i) => (
                        <div key={e.id || i} style={{
                            padding: '8px 4px', borderBottom: '1px solid var(--border)',
                            fontSize: 12,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ fontWeight: 700, color: 'var(--navy)' }}>
                                    {e.action} → {e.cible}
                                </span>
                                <span style={{ color: 'var(--text-soft)', fontSize: 11 }}>
                                    {new Date(e.fait_le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            {e.detail && (
                                <p style={{ color: 'var(--text-soft)', fontSize: 11 }}>
                                    {typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)}
                                </p>
                            )}
                            <p style={{ color: 'var(--text-soft)', fontSize: 10, fontStyle: 'italic' }}>
                                par {e.fait_par_nom || e.fait_par || '—'}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function RepairButton({ onRefresh }) {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    const handleRepair = async () => {
        setBusy(true);
        setMsg('');
        const res = await reparerRattachements();
        if (res.ok) {
            const count = res.data?.rattaches ?? 0;
            if (count > 0) {
                setMsg(`✅ ${count} fiche${count > 1 ? 's' : ''} rattachée${count > 1 ? 's' : ''} à leur compte Google`);
            } else {
                setMsg('ℹ️ Aucune fiche à rattacher');
            }
            if (onRefresh) await onRefresh();
        } else {
            setMsg(`❌ ${res.error || 'Erreur lors du rattachement.'}`);
        }
        setBusy(false);
    };

    return (
        <div>
            <button
                className="btn btn--navy"
                style={{ width: '100%', fontSize: 13, padding: 10 }}
                onClick={handleRepair}
                disabled={busy}
            >
                {busy ? '⏳ Recherche des comptes…' : '🔄 Réparer les rattachements'}
            </button>
            {msg && (
                <p style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginTop: 8,
                    textAlign: 'center',
                    color: msg.startsWith('❌') ? 'var(--coral)' : msg.startsWith('✅') ? 'var(--mint-dk)' : 'var(--text-soft)',
                }}>
                    {msg}
                </p>
            )}
        </div>
    );
}
