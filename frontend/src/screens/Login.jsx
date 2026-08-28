import React, { useState, useEffect, useRef } from 'react';
import branding from '../branding';
import { connexionGoogle, demanderCode, verifierCode, quiSuisJe } from '../api';

/**
 * Passer à true quand le SMTP Workspace sera configuré.
 * Tant que false, le lien de secours par e-mail n'apparaît pas.
 */
const SECOURS_EMAIL_ACTIF = false;

/**
 * Login — Écran de connexion
 *
 * Trois états :
 *   'principal'  →  bouton Google + lien de secours (si SMTP configuré)
 *   'email'      →  secours OTP : saisie de l'adresse e-mail
 *   'code'       →  secours OTP : saisie du code à 6 chiffres
 *
 * Après connexion réussie (Google ou OTP), on appelle quiSuisJe()
 * et on remonte le résultat à App.jsx via onIdentite(data).
 * Le cas 'inconnu' est traité par App.jsx, pas ici.
 */
export default function Login({ onIdentite }) {
    const [etape, setEtape] = useState('principal');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [logoError, setLogoError] = useState(false);

    // Compte à rebours pour "Redemander un code"
    const [cooldown, setCooldown] = useState(0);
    const cooldownRef = useRef(null);

    useEffect(() => {
        return () => {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
        };
    }, []);

    function demarrerCooldown() {
        setCooldown(60);
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        cooldownRef.current = setInterval(() => {
            setCooldown(prev => {
                if (prev <= 1) {
                    clearInterval(cooldownRef.current);
                    cooldownRef.current = null;
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }

    // ---- Connexion Google ----
    const handleGoogle = async () => {
        setError('');
        setLoading(true);
        const res = await connexionGoogle();
        // Si erreur (rare : navigateur bloque le popup, etc.)
        if (!res.ok) {
            setError(res.error);
            setLoading(false);
        }
        // Si ok : la page redirige, on ne revient pas ici
    };

    // ---- Secours OTP : demander un code ----
    const handleDemanderCode = async (e) => {
        e.preventDefault();
        const emailTrimme = email.trim();
        if (!emailTrimme) {
            setError('Entre ton adresse e-mail scolaire.');
            return;
        }
        setLoading(true);
        setError('');

        const res = await demanderCode(emailTrimme);
        setLoading(false);

        if (res.ok) {
            setEtape('code');
            setCode('');
            demarrerCooldown();
        } else {
            setError(res.error);
        }
    };

    // ---- Secours OTP : vérifier le code ----
    const handleVerifierCode = async (e) => {
        e.preventDefault();
        const codeTrimme = code.trim();
        if (codeTrimme.length < 6) {
            setError('Le code contient 6 chiffres.');
            return;
        }
        setLoading(true);
        setError('');

        const res = await verifierCode(email.trim(), codeTrimme);
        if (!res.ok) {
            setError(res.error);
            setLoading(false);
            return;
        }

        // Connexion réussie → quiSuisJe
        const qui = await quiSuisJe();
        setLoading(false);

        if (!qui.ok) {
            setError(qui.error || 'Impossible de charger ton profil.');
            return;
        }

        // Remonter à App.jsx — y compris le cas 'inconnu'
        onIdentite(qui.data);
    };

    // ---- Redemander un code ----
    const handleRedemander = async () => {
        if (cooldown > 0) return;
        setLoading(true);
        setError('');
        const res = await demanderCode(email.trim());
        setLoading(false);
        if (res.ok) {
            demarrerCooldown();
        } else {
            setError(res.error);
        }
    };

    // ====================== RENDU ======================

    return (
        <div className="screen-enter" style={{ paddingTop: 32 }}>
            {/* Logo + titre */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
                {!logoError ? (
                    <img
                        src={branding.logoPath}
                        alt={branding.appName}
                        style={{
                            width: 80, height: 80, borderRadius: 16,
                            objectFit: 'contain', marginBottom: 12,
                        }}
                        onError={() => setLogoError(true)}
                    />
                ) : (
                    <div style={{
                        width: 80, height: 80, borderRadius: 16,
                        margin: '0 auto 12px',
                        background: 'linear-gradient(135deg, var(--navy), var(--navy-mid))',
                        color: 'var(--gold)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-display)', fontWeight: 800,
                        fontSize: 24, letterSpacing: 2,
                    }}>
                        {branding.monogram}
                    </div>
                )}
                <h1 className="font-display" style={{
                    fontSize: 'clamp(24px, 7vw, 34px)', fontWeight: 800,
                    color: 'var(--navy)', letterSpacing: -0.5, lineHeight: 1.1,
                }}>
                    {branding.appName}
                </h1>
                <p style={{
                    color: 'var(--text-soft)', fontWeight: 700,
                    fontSize: 14, marginTop: 4,
                }}>
                    {branding.baseline}
                </p>
            </div>

            {/* Card de connexion */}
            <div className="card">

                {/* ========== ÉTAT PRINCIPAL ========== */}
                {etape === 'principal' && (
                    <>
                        <h2 className="font-display" style={{
                            fontSize: 22, fontWeight: 800,
                            marginBottom: 20, textAlign: 'center',
                        }}>
                            Connexion
                        </h2>

                        {/* Message d'erreur */}
                        {error && <ErreurMsg>{error}</ErreurMsg>}

                        {/* Bouton Google — le chemin principal */}
                        <button
                            className="btn btn--navy"
                            disabled={loading}
                            onClick={handleGoogle}
                            style={{
                                width: '100%', fontSize: 18, padding: 16,
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: 10,
                            }}
                        >
                            {loading ? (
                                '⏳ Redirection…'
                            ) : (
                                <>
                                    <GoogleIcon />
                                    Se connecter avec Google
                                </>
                            )}
                        </button>

                        <p style={{
                            fontSize: 12, color: 'var(--text-soft)',
                            fontWeight: 600, textAlign: 'center', marginTop: 12,
                        }}>
                            Utilise ton compte <b style={{ color: 'var(--navy)' }}>@saintho.fr</b>
                        </p>

                        {/* Lien de secours — uniquement si SMTP configuré */}
                        {SECOURS_EMAIL_ACTIF && (
                            <div style={{ textAlign: 'center', marginTop: 20 }}>
                                <button
                                    style={{
                                        background: 'none', border: 'none',
                                        cursor: 'pointer', color: 'var(--text-soft)',
                                        fontWeight: 600, fontSize: 13,
                                        textDecoration: 'underline',
                                    }}
                                    onClick={() => {
                                        setEtape('email');
                                        setError('');
                                    }}
                                >
                                    Je n'arrive pas à me connecter avec Google
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* ========== SECOURS : SAISIE EMAIL ========== */}
                {etape === 'email' && (
                    <>
                        <h2 className="font-display" style={{
                            fontSize: 20, fontWeight: 800,
                            marginBottom: 16, textAlign: 'center',
                        }}>
                            Connexion par e-mail
                        </h2>

                        {error && <ErreurMsg>{error}</ErreurMsg>}

                        <form onSubmit={handleDemanderCode}>
                            <div style={{ marginBottom: 14 }}>
                                <label style={{
                                    fontWeight: 700, fontSize: 14,
                                    color: 'var(--text-soft)',
                                    display: 'block', marginBottom: 6,
                                }}>
                                    📧 Adresse e-mail scolaire
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="prenom.nom@saintho.fr"
                                    autoComplete="email"
                                    autoFocus
                                    style={champStyle}
                                    onFocus={e => e.target.style.borderColor = 'var(--sky)'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn btn--navy"
                                disabled={loading}
                                style={{ width: '100%', fontSize: 17, padding: 14 }}
                            >
                                {loading ? '⏳ Envoi…' : '📧 Recevoir mon code'}
                            </button>
                        </form>

                        <div style={{ textAlign: 'center', marginTop: 14 }}>
                            <button
                                style={lienStyle}
                                onClick={() => {
                                    setEtape('principal');
                                    setError('');
                                }}
                            >
                                ← Retour à la connexion Google
                            </button>
                        </div>
                    </>
                )}

                {/* ========== SECOURS : SAISIE CODE 6 CHIFFRES ========== */}
                {etape === 'code' && (
                    <>
                        <h2 className="font-display" style={{
                            fontSize: 20, fontWeight: 800,
                            marginBottom: 8, textAlign: 'center',
                        }}>
                            Vérifie tes mails
                        </h2>

                        <p style={{
                            fontSize: 14, color: 'var(--text-soft)',
                            fontWeight: 600, textAlign: 'center',
                            marginBottom: 16, lineHeight: 1.4,
                        }}>
                            Un code à 6 chiffres a été envoyé à{' '}
                            <b style={{ color: 'var(--navy)' }}>{email.trim()}</b>
                        </p>

                        {error && <ErreurMsg>{error}</ErreurMsg>}

                        <form onSubmit={handleVerifierCode}>
                            <div style={{ marginBottom: 14 }}>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    autoComplete="one-time-code"
                                    value={code}
                                    onChange={e => setCode(
                                        e.target.value.replace(/\D/g, '').slice(0, 6)
                                    )}
                                    placeholder="• • • • • •"
                                    autoFocus
                                    style={{
                                        ...champStyle,
                                        fontSize: 28, textAlign: 'center',
                                        letterSpacing: 10,
                                        fontFamily: 'var(--font-display)',
                                    }}
                                    onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn btn--navy"
                                disabled={loading}
                                style={{ width: '100%', fontSize: 17, padding: 14 }}
                            >
                                {loading ? '⏳ Vérification…' : 'Valider'}
                            </button>
                        </form>

                        {/* Redemander un code — avec cooldown */}
                        <div style={{
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', gap: 8, marginTop: 14,
                        }}>
                            <button
                                style={{
                                    ...lienStyle,
                                    opacity: cooldown > 0 ? 0.5 : 1,
                                    cursor: cooldown > 0 ? 'default' : 'pointer',
                                }}
                                disabled={cooldown > 0}
                                onClick={handleRedemander}
                            >
                                {cooldown > 0
                                    ? `Redemander un code (${cooldown}s)`
                                    : 'Je n\'ai rien reçu — redemander'}
                            </button>

                            <button
                                style={lienStyle}
                                onClick={() => {
                                    setEtape('email');
                                    setCode('');
                                    setError('');
                                }}
                            >
                                Changer d'adresse
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ====================== Composants utilitaires ======================

function ErreurMsg({ children }) {
    return (
        <p style={{
            color: 'var(--coral)', fontWeight: 700, fontSize: 14,
            textAlign: 'center', marginBottom: 14,
            background: 'var(--coral-bg, #FFF0F0)', borderRadius: 12,
            padding: '10px 14px',
        }}>
            {children}
        </p>
    );
}

/** Icône Google simplifiée en SVG inline — aucune dépendance externe */
function GoogleIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
    );
}

// ====================== Styles partagés ======================

const champStyle = {
    width: '100%', padding: '14px 16px', borderRadius: 14,
    border: '2px solid var(--border)', fontSize: 16,
    fontFamily: 'var(--font-body)', outline: 'none',
    transition: 'border-color 0.2s',
};

const lienStyle = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-soft)', fontWeight: 600, fontSize: 13,
    textDecoration: 'underline',
};
