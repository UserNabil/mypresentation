// Public API address only. Never put a token or an API key in this file.
window.PORTFOLIO_INSIGHTS = {
  apiBase: ['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '8787'
    ? location.origin
    : 'https://nabil-portfolio-insights.n-ouldterki.workers.dev'
};
