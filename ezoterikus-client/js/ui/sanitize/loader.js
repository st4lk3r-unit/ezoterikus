let cachedPromise = null;

const CONFIG = {
  TRY_LOCAL: false,
  LOCAL: {
    esmRelativeFromThisFile: '../../../vendor/dompurify/purify.es.js',
    esmAbsolute: '/vendor/dompurify/purify.es.js',
    umdAbsolute: '/vendor/dompurify/purify.min.js',
  },
  CDN_URL: 'https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js',
  CDN_SRI: 'sha256-6ksJCCykugrnG+ZDGgl2eHUdBFO5xSpNLHw5ohZu2fw=',
  LOG: true,
};

export async function getDOMPurify() {
  if (cachedPromise) return cachedPromise;
  cachedPromise = loadDOMPurify();
  return cachedPromise;
}

async function loadDOMPurify() {
  if (CONFIG.LOG) console.groupCollapsed('%cDOMPurify%c loader', 'background:#111;color:#fff;padding:2px 6px;border-radius:4px;', 'color:#999');

  if (window.DOMPurify?.sanitize) {
    if (CONFIG.LOG) console.log('✔︎ Found global DOMPurify');
    if (CONFIG.LOG) console.groupEnd();
    return window.DOMPurify;
  }

  if (CONFIG.TRY_LOCAL) {
    try {
      const rel = new URL(CONFIG.LOCAL.esmRelativeFromThisFile, import.meta.url).href;
      if (CONFIG.LOG) console.log('Trying local ESM (relative):', rel);
      await assertJs(rel);
      const mod = await import(/* @vite-ignore */ rel);
      const inst = mod?.default || mod;
      if (inst?.sanitize) {
        if (CONFIG.LOG) console.log('✔︎ Loaded local ESM (relative)');
        if (CONFIG.LOG) console.groupEnd();
        return inst;
      }
      throw new Error('sanitize() export missing');
    } catch (e) {
      if (CONFIG.LOG) console.warn('⚠︎ Local ESM (relative) failed:', e.message);
    }

    try {
      if (CONFIG.LOG) console.log('Trying local ESM (absolute):', CONFIG.LOCAL.esmAbsolute);
      await assertJs(CONFIG.LOCAL.esmAbsolute);
      const mod = await import(/* @vite-ignore */ CONFIG.LOCAL.esmAbsolute);
      const inst = mod?.default || mod;
      if (inst?.sanitize) {
        if (CONFIG.LOG) console.log('✔︎ Loaded local ESM (absolute)');
        if (CONFIG.LOG) console.groupEnd();
        return inst;
      }
      throw new Error('sanitize() export missing');
    } catch (e) {
      if (CONFIG.LOG) console.warn('⚠︎ Local ESM (absolute) failed:', e.message);
    }

    try {
      if (CONFIG.LOG) console.log('Trying local UMD:', CONFIG.LOCAL.umdAbsolute);
      await injectScript(CONFIG.LOCAL.umdAbsolute);
      if (window.DOMPurify?.sanitize) {
        if (CONFIG.LOG) console.log('✔︎ Loaded local UMD');
        if (CONFIG.LOG) console.groupEnd();
        return window.DOMPurify;
      }
      throw new Error('window.DOMPurify missing after UMD load');
    } catch (e) {
      if (CONFIG.LOG) console.warn('⚠︎ Local UMD failed:', e.message);
    }
  }

  try {
    if (CONFIG.LOG) console.log('Trying CDN:', CONFIG.CDN_URL);
    await injectScript(CONFIG.CDN_URL, {
      integrity: CONFIG.CDN_SRI,
      crossOrigin: 'anonymous',
      referrerPolicy: 'no-referrer',
    });
    if (!window.DOMPurify?.sanitize) throw new Error('window.DOMPurify missing after CDN load');
    if (CONFIG.LOG) console.log('✔︎ Loaded from CDN with SRI');
    if (CONFIG.LOG) console.groupEnd();
    return window.DOMPurify;
  } catch (e) {
    if (CONFIG.LOG) console.error('✖ CDN failed:', e.message);
    if (CONFIG.LOG) console.groupEnd();
    throw new Error('DOMPurify failed to load from all sources');
  }
}

async function assertJs(url) {
  const r = await fetch(url, { method: 'GET' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if (!/javascript|ecmascript/.test(ct)) {
    if (/text\/html/.test(ct)) throw new Error('Content-Type text/html (SPA fallback?)');
    throw new Error(`Unexpected Content-Type "${ct}"`);
  }
}

function injectScript(src, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!src || typeof src !== 'string') return reject(new Error(`Bad src: ${src}`));
    const s = document.createElement('script');
    s.src = src;
    if (opts.integrity) s.integrity = opts.integrity;
    if (opts.crossOrigin) s.crossOrigin = opts.crossOrigin;
    if (opts.referrerPolicy) s.referrerPolicy = opts.referrerPolicy;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Script load failed: ${src}`));
    document.head.appendChild(s);
  });
}
