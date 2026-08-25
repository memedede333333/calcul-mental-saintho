/**
 * Diagnostic v2 — Tests GAS connectivity + secret match
 */
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const GAS_URL = process.env.GAS_URL;
    const PROXY_SECRET = process.env.PROXY_SECRET;

    const report = {
        gasUrlPreview: GAS_URL ? GAS_URL.substring(0, 60) + '...' : 'MISSING',
        proxySecretPreview: PROXY_SECRET ? PROXY_SECRET.substring(0, 4) + '*** (len=' + PROXY_SECRET.length + ')' : 'MISSING',
        timestamp: new Date().toISOString(),
        tests: {},
    };

    try {
        // Test 1: POST WITH secret
        const r1 = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'login_pin',
                payload: { email: 'diagnostic@saintho.fr', pin: '0000' },
                _secret: PROXY_SECRET
            }),
            redirect: 'manual',
        });
        if (r1.status === 302) {
            const loc = r1.headers.get('location');
            const r1b = await fetch(loc);
            report.tests.withSecret = await r1b.text();
        } else {
            report.tests.withSecret = 'status=' + r1.status;
        }

        // Test 2: POST WITHOUT secret
        const r2 = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'login_pin',
                payload: { email: 'diagnostic@saintho.fr', pin: '0000' },
            }),
            redirect: 'manual',
        });
        if (r2.status === 302) {
            const loc = r2.headers.get('location');
            const r2b = await fetch(loc);
            report.tests.withoutSecret = await r2b.text();
        } else {
            report.tests.withoutSecret = 'status=' + r2.status;
        }

    } catch (err) {
        report.error = err.message;
    }

    return res.status(200).json(report);
}
