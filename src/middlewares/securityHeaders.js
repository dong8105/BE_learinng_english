/**
 * HTTP Security & Content Security Policy (CSP) Headers Middleware
 * Standard OWASP-compliant protection against XSS, clickjacking, and script injection
 */
function securityHeaders(req, res, next) {
    // 1. Content-Security-Policy (CSP)
    // Allows safe first-party scripts, Google AI APIs, fonts, styles, Vite dev server, while blocking untrusted 3rd-party script injections
    const cspDirectives = [
        "default-src 'self' http://localhost:* ws://localhost:* https://fe-learning-english.vercel.app https://*.vercel.app",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://apis.google.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "media-src 'self' data: blob: https:",
        "connect-src 'self' http://localhost:* ws://localhost:* https://fe-learning-english.vercel.app https://*.vercel.app https://generativelanguage.googleapis.com",
        "frame-ancestors 'self' https://fe-learning-english.vercel.app https://*.vercel.app",
        "base-uri 'self'",
        "object-src 'none'"
    ];

    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

    // 2. Prevent MIME type sniffing (stops browsers from executing non-scripts as scripts)
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 3. Prevent clickjacking (disallows embedding the site inside iframes)
    res.setHeader('X-Frame-Options', 'DENY');

    // 4. Browser Cross-Site Scripting (XSS) Filter
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // 5. Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 6. Permissions Policy
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');

    next();
}

module.exports = securityHeaders;
