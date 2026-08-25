/**
 * Vercel Serverless Function — Proxy vers Google Apps Script
 * 
 * iPad → Vercel /api/gas → GAS Web App
 * 
 * - Gère la redirection 302 de Google (comportement standard des Web Apps GAS)
 * - Timeout 25s (cold start GAS)
 * - Transmet le body JSON tel quel, renvoie la réponse
 */

export default async function handler(req, res) {
    // CORS pour le frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
    }

    const GAS_URL = process.env.GAS_URL;
    const PROXY_SECRET = process.env.PROXY_SECRET;

    if (!GAS_URL || !PROXY_SECRET) {
        console.error('Variables GAS_URL ou PROXY_SECRET manquantes');
        return res.status(500).json({ ok: false, error: 'Configuration serveur incomplète' });
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);

        // Étape 1 : POST vers GAS sans suivre la redirection
        // Google renvoie un 302 vers googleusercontent.com avec le résultat
        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            signal: controller.signal,
            redirect: 'manual',
        });

        clearTimeout(timeout);

        // Étape 2 : Si 302, suivre la redirection manuellement avec GET
        if (response.status === 302) {
            const location = response.headers.get('location');
            if (!location) {
                return res.status(502).json({ ok: false, error: 'Redirection sans URL.' });
            }

            const controller2 = new AbortController();
            const timeout2 = setTimeout(() => controller2.abort(), 15000);

            const redirectResponse = await fetch(location, { signal: controller2.signal });
            clearTimeout(timeout2);

            const text = await redirectResponse.text();
            try {
                const data = JSON.parse(text);
                return res.status(200).json(data);
            } catch (e) {
                console.error('Réponse non-JSON après redirect:', text.substring(0, 300));
                return res.status(502).json({ ok: false, error: 'Réponse inattendue du serveur.' });
            }
        }

        // Étape 2b : Pas de redirection (réponse directe)
        const rawText = await response.text();
        try {
            const data = JSON.parse(rawText);
            return res.status(200).json(data);
        } catch (e) {
            console.error('Réponse non-JSON directe:', rawText.substring(0, 300));
            return res.status(502).json({ ok: false, error: 'Réponse inattendue du serveur.' });
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ ok: false, error: 'Le serveur met trop de temps à répondre (timeout 25s). Réessaie dans quelques secondes.' });
        }
        console.error('Erreur proxy GAS:', err);
        return res.status(502).json({ ok: false, error: 'Impossible de contacter le serveur. Réessaie.' });
    }
}
