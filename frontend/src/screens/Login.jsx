import React, { useState } from 'react';
import branding from '../branding';

/**
 * Login — Écran de connexion
 * Flux :
 * 1. Première connexion : email + 3333 → reçoit un nouveau code par mail
 * 2. Connexions suivantes : email + code personnel
 * 3. Oublié ? → renvoi par mail
 * 4. Mode démo sans compte
 */
export default function Login({ onLogin }) {
    const [email, setEmail] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [logoError, setLogoError] = useState(false);
    const [showForgot, setShowForgot] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotMsg, setForgotMsg] = useState('');

    // ---- Connexion ----
    const handleLogin = async (e) => {
        e.preventDefault();
        if (!email.trim() || !pin.trim()) {
            setError('Entre ton email et ton code.');
            return;
        }
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const { api, setSessionToken } = await import('../api.js');
            const result = await api.loginPin(email.trim(), pin.trim());
            if (result.ok) {
                setSessionToken(result.data.sessionToken);

                // Première connexion ? Afficher le message avant de continuer
                if (result.data.firstLogin) {
                    setSuccess(result.data.message);
                    setLoading(false);
                    // Connexion auto après 3 secondes
                    setTimeout(() => onLogin(result.data.profil), 3000);
                    return;
                }

                onLogin(result.data.profil);
            } else {
                setError(result.error || 'Code incorrect.');
            }
        } catch {
            // Mode démo — connexion locale directe (serveur non dispo)
            onLogin({
                id: 'demo',
                email: email.trim(),
                nom: email.split('@')[0].split('.').pop() || 'Demo',
                prénom: email.split('@')[0].split('.')[0] || 'Élève',
                classe: '6A',
                avatar_emoji: '🎯',
                tables_autorisees: '1-15',
            });
        }
        setLoading(false);
    };

    // ---- Mot de passe oublié ----
    const handleForgot = async () => {
        if (!forgotEmail.trim()) {
            setForgotMsg('Entre ton email scolaire.');
            return;
        }
        setForgotLoading(true);
        setForgotMsg('');
        try {
            const { api } = await import('../api.js');
            const result = await api.forgotPin(forgotEmail.trim());
            setForgotMsg(result.data?.message || 'Un nouveau code a été envoyé si l\'adresse existe.');
        } catch {
            setForgotMsg('Vérifie ta connexion internet.');
        }
        setForgotLoading(false);
    };

    return (
        <div className="screen-enter" style={{ paddingTop: 32 }}>
            {/* Logo + titre */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
                {!logoError ? (
                    <img
                        src={branding.logoPath}
                        alt={branding.appName}
                        style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'contain', marginBottom: 12 }}
                        onError={() => setLogoError(true)}
                    />
                ) : (
                    <div style={{
                        width: 80, height: 80, borderRadius: 16, margin: '0 auto 12px',
                        background: 'linear-gradient(135deg, var(--navy), var(--navy-mid))',
                        color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, letterSpacing: 2
                    }}>
                        {branding.monogram}
                    </div>
                )}
                <h1 className="font-display" style={{
                    fontSize: 'clamp(24px, 7vw, 34px)', fontWeight: 800,
                    color: 'var(--navy)', letterSpacing: -0.5, lineHeight: 1.1
                }}>
                    {branding.appName}
                </h1>
                <p style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 14, marginTop: 4 }}>
                    {branding.baseline}
                </p>
            </div>

            {/* Card de login */}
            <div className="card">
                <h2 className="font-display" style={{ fontSize: 22, fontWeight: 800, marginBottom: 16, textAlign: 'center' }}>
                    Connexion
                </h2>

                <form onSubmit={handleLogin}>
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-soft)', display: 'block', marginBottom: 6 }}>
                            📧 Email école
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="prenom.nom@saintho.org"
                            autoComplete="email"
                            style={{
                                width: '100%', padding: '14px 16px', borderRadius: 14,
                                border: '2px solid var(--border)', fontSize: 16,
                                fontFamily: 'var(--font-body)', outline: 'none',
                                transition: 'border-color 0.2s',
                            }}
                            onFocus={e => e.target.style.borderColor = 'var(--sky)'}
                            onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        />
                    </div>
                    <div style={{ marginBottom: 8 }}>
                        <label style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-soft)', display: 'block', marginBottom: 6 }}>
                            🔑 Code personnel
                        </label>
                        <input
                            type="password"
                            inputMode="numeric"
                            maxLength={4}
                            value={pin}
                            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="• • • •"
                            style={{
                                width: '100%', padding: '14px 16px', borderRadius: 14,
                                border: '2px solid var(--border)', fontSize: 24,
                                fontFamily: 'var(--font-display)', textAlign: 'center',
                                letterSpacing: 12, outline: 'none',
                                transition: 'border-color 0.2s',
                            }}
                            onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                            onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        />
                    </div>

                    {/* Info première connexion */}
                    <p style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, textAlign: 'center', marginBottom: 14 }}>
                        Première connexion ? Utilise le code <b style={{ color: 'var(--navy)' }}>3333</b>
                    </p>

                    {/* Messages */}
                    {error && (
                        <p style={{
                            color: 'var(--coral)', fontWeight: 700, fontSize: 14,
                            textAlign: 'center', marginBottom: 14,
                            background: '#FFF0F0', borderRadius: 12, padding: '10px 14px'
                        }}>
                            {error}
                        </p>
                    )}

                    {success && (
                        <div style={{
                            fontWeight: 700, fontSize: 14,
                            textAlign: 'center', marginBottom: 14,
                            background: '#E8FFF0', borderRadius: 12, padding: '14px',
                            color: 'var(--mint-dk)', border: '1px solid var(--mint)',
                        }}>
                            <span style={{ fontSize: 28, display: 'block', marginBottom: 6 }}>📧✅</span>
                            {success}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn--navy"
                        disabled={loading}
                        style={{ width: '100%', fontSize: 20, padding: 16 }}
                    >
                        {loading ? '⏳ Connexion...' : 'Se connecter'}
                    </button>
                </form>

                {/* Mot de passe oublié */}
                <div style={{ textAlign: 'center', marginTop: 14 }}>
                    <button
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--sky-dk)', fontWeight: 700, fontSize: 14,
                            textDecoration: 'underline',
                        }}
                        onClick={() => { setShowForgot(!showForgot); setForgotMsg(''); }}
                    >
                        J'ai oublié mon code
                    </button>
                </div>

                {showForgot && (
                    <div style={{
                        marginTop: 14, background: 'var(--surface-alt)', borderRadius: 16, padding: 16,
                    }}>
                        <p style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 600, marginBottom: 10 }}>
                            Entre ton email scolaire. Un nouveau code te sera envoyé par mail.
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                type="email"
                                value={forgotEmail}
                                onChange={e => setForgotEmail(e.target.value)}
                                placeholder="prenom.nom@saintho.org"
                                style={{
                                    flex: 1, padding: '10px 14px', borderRadius: 12,
                                    border: '2px solid var(--border)', fontSize: 14,
                                    fontFamily: 'var(--font-body)', outline: 'none',
                                }}
                            />
                            <button
                                className="btn btn--sky"
                                disabled={forgotLoading}
                                style={{ fontSize: 13, padding: '10px 16px', whiteSpace: 'nowrap' }}
                                onClick={handleForgot}
                            >
                                {forgotLoading ? '⏳' : '📧 Envoyer'}
                            </button>
                        </div>
                        {forgotMsg && (
                            <p style={{
                                fontSize: 13, fontWeight: 700, textAlign: 'center', marginTop: 10,
                                color: 'var(--mint-dk)',
                            }}>
                                {forgotMsg}
                            </p>
                        )}
                    </div>
                )}

                {/* Mode démo */}
                <div style={{ marginTop: 20, textAlign: 'center' }}>
                    <button
                        className="btn btn--ghost"
                        style={{ fontSize: 14, padding: '10px 20px' }}
                        onClick={() => onLogin({
                            id: 'demo',
                            email: 'demo@saintho.org',
                            nom: 'Démo',
                            prénom: 'Élève',
                            classe: '6A',
                            avatar_emoji: '🎯',
                            tables_autorisees: '1-15',
                        })}
                    >
                        🎮 Mode démo (sans compte)
                    </button>
                </div>
            </div>
        </div>
    );
}
