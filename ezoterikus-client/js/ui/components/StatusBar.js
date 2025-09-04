import * as relay from '../../relay.js';
import { showTooltip, hideTooltip } from './Tooltip.js';
import { esc } from '../sanitize.js';

function fmtState(ws){
  if (!ws) return '—';
  switch(ws.readyState){
    case 0: return 'connecting';
    case 1: return 'open';
    case 2: return 'closing';
    case 3: return 'closed';
    default: return String(ws.readyState);
  }
}
function stateColor(ws){ return (ws?.readyState===1) ? '#16a34a' : '#b91c1c'; }

export function enhanceStatusBar(){
  const dot = document.getElementById('statusDot');
  const num = document.getElementById('statusRelays');
  const labelSpan = num?.parentElement; // "Relays: <b id=statusRelays>"
  const seg = document.getElementById('relaySeg');
  const targets = [seg || dot, seg ? null : num, seg ? null : labelSpan].filter(Boolean);
  if (targets.length === 0) return;

  const openAt = (ev)=>{
    const rows = [];
    for (const [url, ws] of relay.Relays.sockets.entries()){
      const st = fmtState(ws);
      const col = stateColor(ws);
      rows.push(`<div class="item" style="display:flex;align-items:center;gap:8px;margin:6px 0;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${col};"></span>
        <div style="flex:1;">
          <div style="font-weight:600;">${esc(url)}</div>
          <div class="muted">state: ${st}</div>
        </div>
      </div>`);
    }
    const html = `<div class="title">Relays</div>${rows.length?rows.join(''):'<div class="muted">No relays configured.</div>'}`;
    showTooltip({ x: ev.clientX, y: ev.clientY, html });
    // click outside to close
    const onDoc = (e)=>{ if (!document.querySelector('.popover')?.contains(e.target)) { hideTooltip(); document.removeEventListener('click', onDoc, true); } };
    setTimeout(()=>document.addEventListener('click', onDoc, true), 0);
  };

  targets.forEach(t => t.addEventListener('click', openAt));
}