import { safeScriptUrl } from "./sanitize.js";

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
      await injectScript(CONFIG.LOCAL.umdAbsolute, { waitFor: () => !!window.DOMPurify });
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
      waitFor: () => !!window.DOMPurify,
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
  const u = safeScriptUrl(url);
  const r = await fetch(u, { method: 'GET' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if (!/(javascript|ecmascript|text\/javascript|application\/x-javascript)/.test(ct)) {
    if (/text\/html/.test(ct)) throw new Error('Content-Type text/html (SPA fallback?)');
    throw new Error(`Unexpected Content-Type "${ct}"`);
  }
}

const _inflight = new Map();

function currentNonce() {
  const s = document.querySelector('script[nonce]');
  return s ? s.nonce || s.getAttribute('nonce') : null;
}

export function injectScript(src, opts = {}) {
  let normalized;
  try { normalized = safeScriptUrl(src); }
  catch (e) { return Promise.reject(e); }

  if (_inflight.has(normalized)) return _inflight.get(normalized);

  const p = new Promise((resolve, reject) => {
    try {
      const existing = Array.from(document.scripts).find(s => s.src === normalized);
      if (existing && (existing.dataset.loaded === '1')) return resolve(existing);

      const s = document.createElement('script');
      s.dataset.loading = '1';

      s.src = normalized;

      if (opts.type) s.type = opts.type;
      if (opts.integrity) {
        s.integrity = opts.integrity;
        s.crossOrigin = opts.crossOrigin || 'anonymous';
      } else if (opts.crossOrigin) {
        s.crossOrigin = opts.crossOrigin;
      }
      if (opts.referrerPolicy) s.referrerPolicy = opts.referrerPolicy;
      s.nonce = opts.nonce || currentNonce() || '';

      s.async = opts.async !== false;

      const cleanup = () => {
        s.removeEventListener('load', onLoad);
        s.removeEventListener('error', onError);
        if (timeoutId) clearTimeout(timeoutId);
      };

      const onLoad = async () => {
        cleanup();
        s.dataset.loaded = '1';
        delete s.dataset.loading;
        try {
          if (typeof opts.waitFor === 'function') {
            const start = Date.now();
            while (!opts.waitFor()) {
              if (Date.now() - start > 3000) throw new Error('waitFor timed out');
              await new Promise(r => setTimeout(r, 30));
            }
          }
          resolve(s);
        } catch (err) {
          s.remove();
          reject(err);
        }
      };

      const onError = () => {
        cleanup();
        reject(new Error(`Script load failed: ${normalized}`));
      };

      s.addEventListener('load', onLoad, { once: true });
      s.addEventListener('error', onError, { once: true });

      const timeoutMs = opts.timeoutMs ?? 15000;
      const timeoutId = timeoutMs > 0 ? setTimeout(() => {
        s.remove();
        reject(new Error(`Script load timeout after ${timeoutMs}ms: ${normalized}`));
      }, timeoutMs) : null;

      document.head.appendChild(s);
    } catch (e) {
      reject(e);
    }
  });

  _inflight.set(normalized, p);
  p.finally(() => { if (_inflight.get(normalized) === p) _inflight.delete(normalized); });
  return p;
}
