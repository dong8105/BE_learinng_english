/**
 * Lightweight Zero-Dependency Cookie Parser Middleware
 * Parses the `Cookie` request header and populates `req.cookies`
 */
function cookieParser(req, res, next) {
    req.cookies = {};
    const rawCookies = req.headers.cookie;

    if (rawCookies && typeof rawCookies === 'string') {
        const pairs = rawCookies.split(';');
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i].trim();
            if (!pair) continue;
            const eqIdx = pair.indexOf('=');
            if (eqIdx === -1) continue;

            const key = pair.slice(0, eqIdx).trim();
            const val = pair.slice(eqIdx + 1).trim();

            if (key) {
                try {
                    req.cookies[key] = decodeURIComponent(val);
                } catch {
                    req.cookies[key] = val;
                }
            }
        }
    }

    next();
}

module.exports = cookieParser;
