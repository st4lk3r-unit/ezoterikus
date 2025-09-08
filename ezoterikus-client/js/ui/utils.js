import * as ezo from '../ezo.js';
import * as relay from '../relay.js';
import { State, appendMessage, markRead, saveSettingsToArchive } from '../state.js';
import { esc, safeUrl} from './sanitize/sanitize.js';

const $=(id)=>document.getElementById(id);

/* ----------------------------- Avatar normalization ----------------------------- */
export async function normalizeAvatar(dataUrl, size=96){
  try {
    if (!dataUrl) return null;
    const img = new Image();
    const loaded = new Promise((res, rej)=>{ img.onload=()=>res(); img.onerror=rej; });
    img.src = safeUrl(dataUrl);
    await loaded;

    const s = size|0;
    const canvas = document.createElement('canvas');
    canvas.width = s; canvas.height = s;
    const ctx = canvas.getContext('2d');

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return null;
    const scale = Math.max(s/srcW, s/srcH);
    const drawW = Math.ceil(srcW * scale);
    const drawH = Math.ceil(srcH * scale);
    const dx = Math.floor((s - drawW)/2);
    const dy = Math.floor((s - drawH)/2);

    ctx.clearRect(0,0,s,s);
    ctx.drawImage(img, 0,0, srcW,srcH, dx,dy, drawW,drawH);

    let out = canvas.toDataURL('image/png');
    if (out.length > 140000) {
      out = canvas.toDataURL('image/jpeg', 0.85);
    }
    return out;
  } catch(e){
    console.warn('normalizeAvatar failed:', e);
    return null;
  }
}

/* ----------------------------- Binary <-> DataURL helpers ----------------------------- */
export function u8ToDataUrl(u8, mime='image/jpeg'){
  return new Promise((resolve)=>{
    try {
      const blob = new Blob([u8 instanceof Uint8Array ? u8 : new Uint8Array(u8)], { type: mime });
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = ()=>resolve(null);
      reader.readAsDataURL(blob);
    } catch { resolve(null); }
  });
}

/* ----------------------------- Chat timestamp helpers ----------------------------- */
export function getLastMessageTs(chat) {
  try {
    if (!chat || !Array.isArray(chat.msgs) || chat.msgs.length === 0) return 0;
    const last = chat.msgs[chat.msgs.length - 1];
    const ts = (last && typeof last.ts !== "undefined") ? last.ts : 0;
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

export function formatChatTimestamp(ts){
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
  const pad = (n)=>String(n).padStart(2,'0');
  if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  // else show YYYY-MM-DD
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
