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