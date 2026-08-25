/**
 * Diagnostic endpoint — Tests GAS connectivity
 * GET /api/test → shows env vars status + attempts a real GAS call
 */

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const GAS_URL = process.env.GAS_URL;
    const PROXY_SECRET = process.env.PROXY_SECRET;

    const report = {
        step: 'init',
        gasUrlSet: !!GAS_URL,
        gasUrlPreview: GAS_URL ? GAS_URL.substring(0, 60) + '...' : 'MISSING',
        proxySecretSet: !!PROXY_SECRET,
        timestamp: new Date().toISOString(),
    };

    if (!GAS_URL) {
        report.error = 'GAS_URL is not set in Vercel environment variables';
        return res.status(200).json(report);
    }

    try {
        report.step = 'fetching_gas';

        // Step 1: POST to GAS (no redirect follow)
        const response1 = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'login_pin',
                payload: { email: 'test-diagnostic@saintho.fr', pin: '0000' },
                _secret: PROXY_SECRET || ''
            }),
            redirect: 'manual',  // Don't follow redirects
        });

        report.step = 'got_response_1';
        report.status1 = response1.status;
        report.headers1 = Object.fromEntries(response1.headers.entries());

        if (response1.status === 302) {
            const location = response1.headers.get('location');
            report.redirectUrl = location ? location.substring(0, 80) + '...' : 'MISSING';

            // Step 2: Follow the redirect manually with GET
            report.step = 'following_redirect';
            const response2 = await fetch(location);
            report.status2 = response2.status;

            const text2 = await response2.text();
            report.step = 'got_response_2';
            report.bodyPreview = text2.substring(0, 300);

            try {
                report.parsedJson = JSON.parse(text2);
                report.success = true;
            } catch (e) {
                report.jsonParseError = e.message;
                report.success = false;
            }
        } else {
            // Not a redirect — read directly
            const text1 = await response1.text();
            report.bodyPreview = text1.substring(0, 300);
            try {
                report.parsedJson = JSON.parse(text1);
                report.success = true;
            } catch (e) {
                report.jsonParseError = e.message;
                report.success = false;
            }
        }
    } catch (err) {
        report.step = 'error';
        report.error = err.message;
        report.stack = err.stack;
    }

    return res.status(200).json(report);
}
