import { getDOMPurify } from './loader.js';

let PURIFY;

export async function initSanitizer() {
  if (!PURIFY) PURIFY = await getDOMPurify();
  return PURIFY;
}

const CONFIG = {
  ALLOWED_TAGS: ['b', 'code'],
  ALLOWED_ATTR: [],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  KEEP_CONTENT: true,
};

export function esc(s) {
  if (!PURIFY) throw new Error('Sanitizer not initialized. Call initSanitizer() first.');
  return PURIFY.sanitize(String(s), CONFIG);
}

export function safeUrl(u, allowed = ['https:', 'http:']) {
  const url = new URL(u, document.baseURI);
  if (!allowed.includes(url.protocol)) {
    throw new Error(`Unsafe script URL protocol: ${url.protocol}`);
  }
  return url.href;
}

export function safeScriptUrl(raw, base = location.href) {
  let u;
  try { u = new URL(String(raw), base); } catch {
    throw new Error(`Invalid script URL: ${raw}`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error(`Blocked script protocol: ${u.protocol}`);
  }
  return u.toString();
}
