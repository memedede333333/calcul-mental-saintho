/**
 * Client API — Communications avec le backend GAS via le proxy Vercel
 * 
 * En mode développement (pas de proxy configuré), les fonctions
 * fonctionnent en mode local/démo avec des données en mémoire.
 */

const API_BASE = '/api/gas';

// Stockage du token de session côté client
let sessionToken = localStorage.getItem('saintho_token') || null;

export function setSessionToken(token) {
    sessionToken = token;
    if (token) {
        localStorage.setItem('saintho_token', token);
    } else {
        localStorage.removeItem('saintho_token');
    }
}

export function getSessionToken() {
    return sessionToken;
}

export function isLoggedIn() {
    return !!sessionToken;
}

export function logout() {
    setSessionToken(null);
}

/**
 * Appel API générique vers le proxy GAS
 */
export async function apiCall(action, payload = {}) {
    try {
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action,
                token: sessionToken,
                payload,
            }),
        });

        if (!response.ok) {
            throw new Error(`Erreur réseau (${response.status})`);
        }

        return await response.json();
    } catch (err) {
        console.error('Erreur API:', err);
        return { ok: false, error: err.message || 'Erreur de connexion' };
    }
}

// Raccourcis pour les actions courantes
export const api = {
    loginPin: (email, pin) => apiCall('login_pin', { email, pin }),
    loginGoogle: (idToken) => apiCall('login_google', { idToken }),
    forgotPin: (email) => apiCall('forgot_pin', { email }),
    adminResetPin: (targetEmail) => apiCall('admin_reset_pin', { targetEmail }),
    getProfile: () => apiCall('get_profile'),
    saveSession: (data) => apiCall('save_session', data),
    getLeaderboards: (type, periode, classe) => apiCall('get_leaderboards', { type, periode, classe }),
    createChallenge: (type, params) => apiCall('create_challenge', { type, ...params }),
    joinChallenge: (code) => apiCall('join_challenge', { code_court: code }),
    submitChallenge: (defiId, resultats) => apiCall('submit_challenge', { defi_id: defiId, ...resultats }),
    getClassChallenges: () => apiCall('get_class_challenges'),
};

export default api;
