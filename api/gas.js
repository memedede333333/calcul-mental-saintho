/**
 * Vercel Serverless Function — Proxy vers Google Apps Script
 * 
 * iPad → Vercel /api/gas → GAS Web App
 * 
 * - Ajoute le header X-Proxy-Secret (variable d'env Vercel)
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
        const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout

        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Proxy-Secret': PROXY_SECRET,
            },
            body: JSON.stringify(req.body),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        const data = await response.json();
        return res.status(200).json(data);
    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ ok: false, error: 'Le serveur met trop de temps à répondre (timeout 25s). Réessaie dans quelques secondes.' });
        }
        console.error('Erreur proxy GAS:', err);
        return res.status(502).json({ ok: false, error: 'Impossible de contacter le serveur. Réessaie.' });
    }
}
