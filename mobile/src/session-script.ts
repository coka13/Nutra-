export const sessionScript = `
(function () {
  const root = document.documentElement;
  const send = (value) => window.ReactNativeWebView.postMessage(JSON.stringify(value));
  const work = location.pathname === '/app' || location.pathname.startsWith('/app/');
  if (work) {
    root.dataset.nativeShell = 'true';
    const publish = () => send({ type: 'page', page: root.dataset.portalPage || location.pathname.split('/')[2] || 'dashboard', lang: root.lang, theme: root.dataset.theme || 'light', adsEligible: root.dataset.nativeAdsEligible === 'true' });
    new MutationObserver(publish).observe(root, { attributes: true, attributeFilter: ['lang', 'data-theme', 'data-portal-page', 'data-native-ads-eligible'] });
    publish();
    return;
  }
  if (location.pathname !== '/phone-session') {
    location.replace('/phone-session');
    return;
  }
  async function call(path, body) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch('/api/auth/' + path, body === undefined
        ? { cache: 'no-store', signal: abort.signal }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abort.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'serverError');
      return result;
    } finally { clearTimeout(timer); }
  }
  window.nutriAuth = async function(requestId, path, body) {
    if (!/^(?:(?:user|coach)\\/(?:login|register)|recover)$/.test(path)) return;
    try {
      const result = await call(path, body);
      send({ type: 'auth-result', requestId });
      if (result.user) {
        send({ type: 'session', user: result.user });
        location.replace('/app');
      }
    } catch (error) {
      send({ type: 'auth-result', requestId, error: error.name === 'AbortError' || error instanceof TypeError ? 'offline' : error.message });
    }
  };
  call('me').then((result) => {
    send({ type: 'session', user: result.user });
    if (result.user) location.replace('/app');
  }).catch(() => send({ type: 'connection-error' }));
})();true;`;
